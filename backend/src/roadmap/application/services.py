from __future__ import annotations

from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import shutil
import urllib.parse
import urllib.request
from typing import Dict, List

from fastapi import HTTPException, status

from .dto import (
    DashboardGraphDTO,
    LayoutDTO,
    ProjectDTO,
    ProjectProfileDTO,
    RelationDTO,
    ResourceDTO,
    SummaryDTO,
    TechnologyDTO,
    TechnologyDetailDTO,
    TechnologyProfileDTO,
)
from ..domain.models import ProjectNode, RelationEdge, RelationType, TechnologyNode
from ..domain.repositories import CardSensusRepository
from ..domain.services import TechnologyStatusPolicy

IMAGE_REGEN_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="card-image-regen")
DEFAULT_IMAGE_SERVICE_URL = "http://127.0.0.1:9001/generate"
DEFAULT_LLM_URL = "http://192.168.1.172:11434/v1"
DEFAULT_LLM_MODEL = "gemma4:31b"
DEFAULT_TIMEOUT_S = 120.0


def _fetch_json(url: str, payload: dict, timeout_s: float) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        body = resp.read().decode("utf-8")
    data = json.loads(body)
    if not isinstance(data, dict):
        raise ValueError("image service response is not a JSON object")
    return data


def _sanitize_visual_prompt(text: str) -> str:
    lines: List[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(r"^[\-\*\d\.\)\s]+", "", line).strip()
        if line:
            lines.append(line)
    return " ".join(lines).strip()


def _clamp_to_max_sentences(text: str, max_sentences: int = 4) -> str:
    cleaned = " ".join(text.strip().split())
    if not cleaned:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    kept = [item.strip() for item in sentences if item.strip()][:max_sentences]
    return " ".join(kept).strip()


def _extract_message_text(message: dict) -> str:
    content = message.get("content", "")
    if isinstance(content, str) and content.strip():
        return content.strip()
    if isinstance(content, list):
        chunks: List[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    chunks.append(text.strip())
        if chunks:
            return "\n".join(chunks).strip()
    return ""


class CardSensusQueryService:
    def __init__(self, repository: CardSensusRepository, status_policy: TechnologyStatusPolicy | None = None) -> None:
        self._repository = repository
        self._status_policy = status_policy or TechnologyStatusPolicy()

    def get_dashboard_graph(self) -> DashboardGraphDTO:
        technologies = list(self._repository.list_technologies())
        relations = list(self._repository.list_relations())
        projects = list(self._repository.list_projects())

        technology_dtos = [self._to_technology_dto(technology, projects) for technology in technologies]
        summary = SummaryDTO(
            total_technologies=len(technology_dtos),
            total_projects=len(projects),
            expert_nodes=sum(1 for item in technology_dtos if item.status == "expert"),
        )

        return DashboardGraphDTO(
            technologies=technology_dtos,
            relations=[self._to_relation_dto(relation) for relation in relations],
            projects=[self._to_project_dto(project) for project in projects],
            summary=summary,
        )

    def create_derived_technology(self, parent_id: str) -> TechnologyProfileDTO:
        try:
            new_node = self._repository.add_derived_technology(parent_id)
        except ValueError as err:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
        return self.get_technology_profile(new_node.id)

    def create_project(self, technology_ids: List[str]) -> ProjectProfileDTO:
        try:
            project = self._repository.create_project(technology_ids)
        except ValueError as err:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
        return self.get_project_profile(project.id)

    def delete_project(self, project_id: str) -> None:
        try:
            self._repository.delete_project(project_id)
        except ValueError as err:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err

    def update_project(self, project_id: str, *, name: str, summary: str, technology_ids: List[str]) -> ProjectProfileDTO:
        try:
            self._repository.update_project(project_id, name=name, summary=summary, technology_ids=technology_ids)
        except ValueError as err:
            detail = str(err)
            if detail.startswith("project not found") or detail.startswith("technology not found"):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from err
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from err
        return self.get_project_profile(project_id)

    def update_technology_layouts(self, layouts: Dict[str, tuple[float, float]]) -> None:
        try:
            self._repository.update_technology_layouts(layouts)
        except ValueError as err:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err

    def add_dependency_relation(self, source_id: str, target_id: str) -> None:
        relations = [r for r in self._repository.list_relations() if r.relation_type == RelationType.DEPENDENCY]
        if any(r.source_id == source_id and r.target_id == target_id for r in relations):
            return
        if self._would_create_dependency_cycle(relations, source_id, target_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="this dependency would create a cycle",
            )
        try:
            self._repository.add_dependency_relation(source_id, target_id)
        except ValueError as err:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err

    def delete_dependency_relation(self, source_id: str, target_id: str) -> None:
        try:
            self._repository.delete_dependency_relation(source_id, target_id)
        except ValueError as err:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err

    @staticmethod
    def _would_create_dependency_cycle(
        existing: List[RelationEdge],
        source_id: str,
        target_id: str,
    ) -> bool:
        """New edge source_id -> target_id; cycle iff target can already reach source along dependency edges."""
        adj: Dict[str, List[str]] = defaultdict(list)
        for r in existing:
            adj[r.source_id].append(r.target_id)
        queue: deque[str] = deque([target_id])
        visited: set[str] = set()
        while queue:
            node = queue.popleft()
            if node == source_id:
                return True
            if node in visited:
                continue
            visited.add(node)
            queue.extend(adj[node])
        return False

    def sync_technologies(self, items: List[dict]) -> Dict[str, List[str]]:
        return self._repository.sync_technologies(items)

    def export_technologies(self) -> List[dict]:
        return self._repository.export_technologies()

    def update_technology(self, technology_id: str, updates: dict) -> TechnologyProfileDTO:
        if not updates:
            return self.get_technology_profile(technology_id)
        try:
            self._repository.update_technology(technology_id, updates)
        except ValueError as err:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
        return self.get_technology_profile(technology_id)

    def delete_technology(self, technology_id: str) -> None:
        try:
            self._repository.delete_technology(technology_id)
        except ValueError as err:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err

    def append_technology_resource_note(self, technology_id: str, text: str) -> TechnologyProfileDTO:
        try:
            self._repository.append_technology_resource_note(technology_id, text.strip())
        except ValueError as err:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
        return self.get_technology_profile(technology_id)

    def queue_regenerate_technology_image(self, technology_id: str) -> dict:
        technology = self._repository.get_technology(technology_id)
        if technology is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technology not found")
        IMAGE_REGEN_EXECUTOR.submit(self._regenerate_technology_image_job, technology_id)
        return {"status": "queued", "detail": "image regeneration started in background"}

    def _regenerate_technology_image_job(self, technology_id: str) -> None:
        technology = self._repository.get_technology(technology_id)
        if technology is None:
            return

        repo_root = Path(__file__).resolve().parents[4]
        files_dir = repo_root / "data" / "files" / "cards"
        files_dir.mkdir(parents=True, exist_ok=True)
        target = files_dir / f"{technology_id}.png"
        image_url = f"/files/cards/{target.name}"
        title = technology.name.strip()

        file_url = ""
        file_path = ""
        visual_prompt = ""

        if title.startswith("新卡牌"):
            file_path = str((files_dir / "new_card.png").resolve())
        else:
            llm_payload = {
                "model": DEFAULT_LLM_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a visual prompt writer for card art generation. Always reply in English only."},
                    {
                        "role": "user",
                        "content": (
                            "Write a short visual prompt for image generation around this card title: "
                            f"{title!r}. Do not repeat the title in the prompt. Description Only."
                            "Requirements: max 4 sentences; describe visible objects/composition and style; "
                            "no markdown; no bullet points; no quotation marks."
                        ),
                    },
                ],
                "temperature": 0.7,
                "max_tokens": 512,
                "stream": False,
            }
            try:
                llm_data = _fetch_json(
                    DEFAULT_LLM_URL.rstrip("/") + "/chat/completions",
                    llm_payload,
                    timeout_s=DEFAULT_TIMEOUT_S,
                )
                choices = llm_data.get("choices")
                if isinstance(choices, list) and choices and isinstance(choices[0], dict):
                    message = choices[0].get("message")
                    if isinstance(message, dict):
                        visual_prompt = _clamp_to_max_sentences(
                            _sanitize_visual_prompt(_extract_message_text(message)),
                            max_sentences=4,
                        )
            except Exception:
                visual_prompt = ""

            if not visual_prompt:
                visual_prompt = (
                    f"A bold flat vector scene centered on {title}, with iconic objects and dynamic composition. "
                    "Use clean thick outlines and exaggerated perspective to create strong visual tension. "
                    "Keep a minimal all-over graphic style with only 3-4 colors and no gradients. "
                    "Fill the full frame with clear shapes and no text."
                )

            image_data = _fetch_json(
                DEFAULT_IMAGE_SERVICE_URL,
                {
                    "title": visual_prompt,
                    "theme_colors": ["cyan", "dark gray", "gold"],
                    "extra_prompt": "no text",
                },
                timeout_s=DEFAULT_TIMEOUT_S,
            )
            file_url = str(image_data.get("file_url", "")).strip()
            file_path = str(image_data.get("file_path", "")).strip()

        if file_url:
            if file_url.startswith("/"):
                parsed = urllib.parse.urlparse(DEFAULT_IMAGE_SERVICE_URL)
                file_url = f"{parsed.scheme}://{parsed.netloc}{file_url}"
            req = urllib.request.Request(file_url, method="GET")
            with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT_S) as resp:
                target.write_bytes(resp.read())
        elif file_path:
            source = Path(file_path)
            if not source.exists():
                return
            shutil.copyfile(source, target)
        else:
            return

        self._repository.update_technology(technology_id, {"image_url": image_url})

    def get_technology_profile(self, technology_id: str) -> TechnologyProfileDTO:
        technology = self._repository.get_technology(technology_id)
        if technology is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technology not found")

        projects = list(self._repository.list_projects())
        relations = list(self._repository.list_relations())
        technologies_by_id = {item.id: item for item in self._repository.list_technologies()}

        related_projects = [
            self._to_project_dto(project)
            for project in projects
            if technology.id in project.associated_tech
        ]

        prerequisites = [
            self._to_technology_dto(technologies_by_id[relation.source_id], projects)
            for relation in relations
            if relation.target_id == technology.id and relation.source_id in technologies_by_id
        ]
        unlocks = [
            self._to_technology_dto(technologies_by_id[relation.target_id], projects)
            for relation in relations
            if relation.source_id == technology.id and relation.target_id in technologies_by_id
        ]

        return TechnologyProfileDTO(
            technology=self._to_technology_detail_dto(technology, projects),
            related_projects=related_projects,
            prerequisites=prerequisites,
            unlocks=unlocks,
        )

    def get_project_profile(self, project_id: str) -> ProjectProfileDTO:
        project = self._repository.get_project(project_id)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        technologies = list(self._repository.list_technologies())
        technologies_by_id: Dict[str, TechnologyNode] = {item.id: item for item in technologies}
        projects = list(self._repository.list_projects())

        return ProjectProfileDTO(
            project=self._to_project_dto(project),
            related_technologies=[
                self._to_technology_dto(technologies_by_id[technology_id], projects)
                for technology_id in project.associated_tech
                if technology_id in technologies_by_id
            ],
        )

    def _to_technology_dto(self, technology: TechnologyNode, projects: List[ProjectNode]) -> TechnologyDTO:
        status_value = self._status_policy.resolve(technology.activity, technology.thresholds).value
        project_ids = [project.id for project in projects if technology.id in project.associated_tech]
        return TechnologyDTO(
            id=technology.id,
            name=technology.name,
            summary=technology.summary,
            time_spent_hours=technology.time_spent_hours,
            status=status_value,
            rarity_index=technology.rarity_index,
            active_user_count=technology.active_user_count,
            image_url=technology.image_url,
            layout=LayoutDTO(x=technology.layout.x, y=technology.layout.y),
            resource_count=len(project_ids) + len(technology.resources),
        )

    def _to_technology_detail_dto(self, technology: TechnologyNode, projects: List[ProjectNode]) -> TechnologyDetailDTO:
        base = self._to_technology_dto(technology, projects)
        project_ids = [project.id for project in projects if technology.id in project.associated_tech]
        return TechnologyDetailDTO(
            **base.__dict__,
            resources=[
                ResourceDTO(
                    id=resource.id,
                    url=resource.url,
                    resource_type=resource.resource_type.value,
                    description=resource.description,
                )
                for resource in technology.resources
            ],
            project_ids=project_ids,
        )

    def _to_relation_dto(self, relation: RelationEdge) -> RelationDTO:
        return RelationDTO(
            source_id=relation.source_id,
            target_id=relation.target_id,
            relation_type=relation.relation_type.value,
        )

    def _to_project_dto(self, project: ProjectNode) -> ProjectDTO:
        return ProjectDTO(
            id=project.id,
            name=project.name,
            summary=project.summary,
            repository_url=project.repository_url,
            status=project.status.value,
            associated_tech=list(project.associated_tech),
            highlights=list(project.highlights),
        )
