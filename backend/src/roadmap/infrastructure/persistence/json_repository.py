from __future__ import annotations

import json
import re
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping

from roadmap.domain.models import (
    ActivitySnapshot,
    LayoutPosition,
    ProjectNode,
    ProjectStatus,
    RelationEdge,
    RelationType,
    ResourceLink,
    ResourceType,
    TechnologyNode,
    ThresholdPolicy,
)
from roadmap.domain.repositories import RoadmapRepository


class JsonRoadmapRepository(RoadmapRepository):
    def __init__(self, data_file: Path | None = None) -> None:
        default_path = Path(__file__).resolve().parents[4] / "data" / "seed.json"
        self._data_file = data_file or default_path

    def _write_data(self, data: Dict[str, Any]) -> None:
        for row in data.get("technologies", []):
            if isinstance(row, dict):
                row.pop("category", None)
                for resource in row.get("resources", []):
                    if isinstance(resource, dict):
                        resource.pop("title", None)
        self._data_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        self._payload.cache_clear()

    def list_technologies(self) -> Iterable[TechnologyNode]:
        return self._payload()["technologies"]

    def get_technology(self, technology_id: str) -> TechnologyNode | None:
        return next((item for item in self.list_technologies() if item.id == technology_id), None)

    def list_relations(self) -> Iterable[RelationEdge]:
        return self._payload()["relations"]

    def list_projects(self) -> Iterable[ProjectNode]:
        return self._payload()["projects"]

    def get_project(self, project_id: str) -> ProjectNode | None:
        return next((item for item in self.list_projects() if item.id == project_id), None)

    def create_project(self, technology_ids: Iterable[str]) -> ProjectNode:
        data = json.loads(self._data_file.read_text(encoding="utf-8"))
        technologies = data.get("technologies", [])
        tech_ids = {str(item.get("id", "")).strip() for item in technologies}
        normalized_ids = []
        seen_ids: set[str] = set()
        for technology_id in technology_ids:
            value = str(technology_id).strip()
            if not value or value in seen_ids:
                continue
            if value not in tech_ids:
                msg = f"technology not found: {value}"
                raise ValueError(msg)
            seen_ids.add(value)
            normalized_ids.append(value)
        if not normalized_ids:
            msg = "at least one technology is required"
            raise ValueError(msg)

        existing_projects = data.get("projects", [])
        deck_index = 1
        existing_names = {str(project.get("name", "")).strip() for project in existing_projects}
        while f"新牌组{deck_index}" in existing_names:
            deck_index += 1

        project_id = f"deck-{uuid.uuid4().hex[:10]}"
        while any(str(project.get("id", "")).strip() == project_id for project in existing_projects):
            project_id = f"deck-{uuid.uuid4().hex[:10]}"

        new_project = {
            "id": project_id,
            "name": f"新牌组{deck_index}",
            "summary": "",
            "repository_url": "",
            "status": "active",
            "associated_tech": normalized_ids,
            "highlights": [],
        }
        data["projects"] = [new_project, *existing_projects]
        self._write_data(data)
        parsed = self.get_project(project_id)
        assert parsed is not None
        return parsed

    def add_derived_technology(self, parent_id: str) -> TechnologyNode:
        data = json.loads(self._data_file.read_text(encoding="utf-8"))
        if not any(t["id"] == parent_id for t in data["technologies"]):
            msg = f"parent technology not found: {parent_id}"
            raise ValueError(msg)
        for _ in range(8):
            new_id = f"tech-{uuid.uuid4().hex[:10]}"
            if not any(t["id"] == new_id for t in data["technologies"]):
                break
        else:  # pragma: no cover
            new_id = f"tech-{uuid.uuid4().hex}"
        new_row = self._build_default_technology_row(new_id, name="新节点")
        data["technologies"].append(new_row)
        data["relations"].append(
            {"source_id": parent_id, "target_id": new_id, "relation_type": "dependency"}
        )
        self._write_data(data)
        parsed = self.get_technology(new_id)
        assert parsed is not None
        return parsed

    def add_dependency_relation(self, source_id: str, target_id: str) -> None:
        if source_id == target_id:
            msg = "cannot create self-dependency"
            raise ValueError(msg)
        data = json.loads(self._data_file.read_text(encoding="utf-8"))
        tech_ids = {str(t["id"]) for t in data["technologies"]}
        if source_id not in tech_ids:
            msg = f"source technology not found: {source_id}"
            raise ValueError(msg)
        if target_id not in tech_ids:
            msg = f"target technology not found: {target_id}"
            raise ValueError(msg)
        for r in data.get("relations", []):
            if (
                r.get("relation_type") == "dependency"
                and str(r.get("source_id", "")) == source_id
                and str(r.get("target_id", "")) == target_id
            ):
                return
        data["relations"].append(
            {"source_id": source_id, "target_id": target_id, "relation_type": "dependency"}
        )
        self._write_data(data)

    def delete_dependency_relation(self, source_id: str, target_id: str) -> None:
        data = json.loads(self._data_file.read_text(encoding="utf-8"))
        before = len(data.get("relations", []))
        data["relations"] = [
            r
            for r in data.get("relations", [])
            if not (
                r.get("relation_type") == "dependency"
                and str(r.get("source_id", "")) == source_id
                and str(r.get("target_id", "")) == target_id
            )
        ]
        if len(data["relations"]) == before:
            msg = f"dependency relation not found: {source_id} -> {target_id}"
            raise ValueError(msg)
        self._write_data(data)

    def update_technology_layouts(self, layouts: Mapping[str, tuple[float, float]]) -> None:
        if not layouts:
            return
        data = json.loads(self._data_file.read_text(encoding="utf-8"))
        by_id = {str(t["id"]): t for t in data["technologies"]}
        for tech_id, (x, y) in layouts.items():
            row = by_id.get(str(tech_id))
            if row is None:
                msg = f"technology not found: {tech_id}"
                raise ValueError(msg)
            row["layout"] = {"x": float(x), "y": float(y)}
        self._write_data(data)

    def update_technology(self, technology_id: str, updates: Mapping[str, Any]) -> TechnologyNode:
        data = json.loads(self._data_file.read_text(encoding="utf-8"))
        row: Dict[str, Any] | None = next(
            (t for t in data["technologies"] if t["id"] == technology_id),
            None,
        )
        if row is None:
            msg = f"technology not found: {technology_id}"
            raise ValueError(msg)
        allowed = {
            "name",
            "summary",
            "time_spent_hours",
            "rarity_index",
            "active_user_count",
        }
        for key, value in updates.items():
            if key in allowed and value is not None:
                row[key] = value
        self._write_data(data)
        result = self.get_technology(technology_id)
        assert result is not None
        return result

    def append_technology_resource_note(self, technology_id: str, text: str) -> None:
        data = json.loads(self._data_file.read_text(encoding="utf-8"))
        row: Dict[str, Any] | None = next(
            (t for t in data["technologies"] if t["id"] == technology_id),
            None,
        )
        if row is None:
            msg = f"technology not found: {technology_id}"
            raise ValueError(msg)
        resources = list(row.get("resources", []))
        url_match = re.search(r"(https?://\S+|file://\S+)", text, re.IGNORECASE)
        primary_url = "#"
        if url_match:
            primary_url = url_match.group(0).rstrip(").,;!?\"'」』）】]")
        new_id = f"res-{uuid.uuid4().hex[:12]}"
        resources.append(
            {
                "id": new_id,
                "url": primary_url,
                "resource_type": "note",
                "description": text,
            }
        )
        row["resources"] = resources
        self._write_data(data)

    def delete_technology(self, technology_id: str) -> None:
        data = json.loads(self._data_file.read_text(encoding="utf-8"))
        if not any(t["id"] == technology_id for t in data["technologies"]):
            msg = f"technology not found: {technology_id}"
            raise ValueError(msg)

        parent_ids = [
            str(relation.get("source_id", ""))
            for relation in data.get("relations", [])
            if relation.get("relation_type") == "dependency" and relation.get("target_id") == technology_id
        ]
        child_ids = [
            str(relation.get("target_id", ""))
            for relation in data.get("relations", [])
            if relation.get("relation_type") == "dependency" and relation.get("source_id") == technology_id
        ]

        data["technologies"] = [t for t in data["technologies"] if t["id"] != technology_id]
        data["relations"] = [
            r
            for r in data["relations"]
            if r["source_id"] != technology_id and r["target_id"] != technology_id
        ]

        existing_dependency_edges = {
            (str(relation.get("source_id", "")), str(relation.get("target_id", "")))
            for relation in data.get("relations", [])
            if relation.get("relation_type") == "dependency"
        }
        for parent_id in parent_ids:
            for child_id in child_ids:
                if not parent_id or not child_id or parent_id == child_id:
                    continue
                edge_key = (parent_id, child_id)
                if edge_key in existing_dependency_edges:
                    continue
                data["relations"].append(
                    {
                        "source_id": parent_id,
                        "target_id": child_id,
                        "relation_type": "dependency",
                    }
                )
                existing_dependency_edges.add(edge_key)

        for project in data.get("projects", []):
            associated = project.get("associated_tech", [])
            if technology_id in associated:
                project["associated_tech"] = [x for x in associated if x != technology_id]
        self._write_data(data)

    def sync_technologies(self, items: Iterable[Mapping[str, Any]]) -> Dict[str, List[str]]:
        data = json.loads(self._data_file.read_text(encoding="utf-8"))
        technologies = data.get("technologies", [])
        existing_ids = {str(node.get("id", "")).strip() for node in technologies}
        existing_by_id = {
            str(node.get("id", "")).strip(): node
            for node in technologies
            if str(node.get("id", "")).strip()
        }
        existing_by_name = {
            str(node.get("name", "")).strip(): node
            for node in technologies
            if str(node.get("name", "")).strip()
        }

        added_ids: List[str] = []
        updated_ids: List[str] = []
        skipped_names: List[str] = []

        for item in items:
            name = str(item.get("name", "")).strip()
            if not name:
                skipped_names.append("<empty>")
                continue

            incoming_id = str(item.get("id", "")).strip()
            existing_row = None
            if incoming_id and incoming_id in existing_by_id:
                existing_row = existing_by_id[incoming_id]
            elif name in existing_by_name:
                existing_row = existing_by_name[name]

            if existing_row is not None:
                old_name = str(existing_row.get("name", "")).strip()
                existing_row["name"] = name
                existing_row["summary"] = str(item.get("summary", existing_row.get("summary", "")))
                existing_row["time_spent_hours"] = float(item.get("time_spent_hours", existing_row.get("time_spent_hours", 0.0)))
                existing_row["rarity_index"] = min(
                    1.0,
                    max(0.0, float(item.get("rarity_index", existing_row.get("rarity_index", 0.5)))),
                )
                existing_row["active_user_count"] = max(
                    0,
                    int(item.get("active_user_count", existing_row.get("active_user_count", 0))),
                )
                node_id = str(existing_row.get("id", "")).strip()
                if node_id and node_id not in updated_ids:
                    updated_ids.append(node_id)
                if old_name and old_name != name:
                    existing_by_name.pop(old_name, None)
                existing_by_name[name] = existing_row
                continue

            node_id = incoming_id if incoming_id and incoming_id not in existing_ids else f"tech-{uuid.uuid4().hex[:10]}"
            while node_id in existing_ids:
                node_id = f"tech-{uuid.uuid4().hex[:10]}"

            row = self._build_default_technology_row(node_id, name=name)
            row["summary"] = str(item.get("summary", row["summary"]))
            row["time_spent_hours"] = float(item.get("time_spent_hours", row["time_spent_hours"]))
            row["rarity_index"] = min(1.0, max(0.0, float(item.get("rarity_index", row["rarity_index"]))))
            row["active_user_count"] = max(0, int(item.get("active_user_count", row["active_user_count"])))

            technologies.append(row)
            existing_ids.add(node_id)
            existing_by_id[node_id] = row
            existing_by_name[name] = row
            added_ids.append(node_id)

        self._write_data(data)
        return {"added_ids": added_ids, "updated_ids": updated_ids, "skipped_names": skipped_names}

    def export_technologies(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": tech.id,
                "name": tech.name,
                "summary": tech.summary,
                "time_spent_hours": tech.time_spent_hours,
                "rarity_index": tech.rarity_index,
                "active_user_count": tech.active_user_count,
            }
            for tech in self.list_technologies()
        ]

    def _build_default_technology_row(self, technology_id: str, name: str) -> Dict[str, Any]:
        return {
            "id": technology_id,
            "name": name,
            "summary": "",
            "time_spent_hours": 0.0,
            "rarity_index": 0.5,
            "active_user_count": 0,
            "activity": {
                "reading_hours": 0.0,
                "coding_hours": 0.0,
                "writing_count": 0,
                "open_source_contributions": 0,
            },
            "thresholds": {
                "exploration_hours": 5.0,
                "proficient_coding_hours": 20.0,
                "expert_coding_hours": 60.0,
                "expert_writings": 1,
                "expert_contributions": 1,
            },
            "resources": [],
            "layout": {"x": 0.0, "y": 0.0},
        }

    @lru_cache(maxsize=1)
    def _payload(self) -> Dict[str, List[Any]]:
        raw = json.loads(self._data_file.read_text(encoding="utf-8"))
        return {
            "technologies": [self._parse_technology(item) for item in raw["technologies"]],
            "relations": [self._parse_relation(item) for item in raw["relations"]],
            "projects": [self._parse_project(item) for item in raw["projects"]],
        }

    def _parse_technology(self, payload: Dict[str, Any]) -> TechnologyNode:
        return TechnologyNode(
            id=payload["id"],
            name=payload["name"],
            summary=payload["summary"],
            time_spent_hours=payload["time_spent_hours"],
            rarity_index=payload["rarity_index"],
            active_user_count=payload["active_user_count"],
            activity=ActivitySnapshot(
                reading_hours=payload["activity"]["reading_hours"],
                coding_hours=payload["activity"]["coding_hours"],
                writing_count=payload["activity"]["writing_count"],
                open_source_contributions=payload["activity"]["open_source_contributions"],
            ),
            thresholds=ThresholdPolicy(
                exploration_hours=payload["thresholds"]["exploration_hours"],
                proficient_coding_hours=payload["thresholds"]["proficient_coding_hours"],
                expert_coding_hours=payload["thresholds"]["expert_coding_hours"],
                expert_writings=payload["thresholds"]["expert_writings"],
                expert_contributions=payload["thresholds"]["expert_contributions"],
            ),
            resources=tuple(
                ResourceLink(
                    id=resource["id"],
                    url=resource.get("url", "#"),
                    resource_type=ResourceType(resource["resource_type"]),
                    description=resource.get("description", ""),
                )
                for resource in payload["resources"]
            ),
            layout=LayoutPosition(x=payload["layout"]["x"], y=payload["layout"]["y"]),
        )

    def _parse_relation(self, payload: Dict[str, Any]) -> RelationEdge:
        return RelationEdge(
            source_id=payload["source_id"],
            target_id=payload["target_id"],
            relation_type=RelationType(payload["relation_type"]),
        )

    def _parse_project(self, payload: Dict[str, Any]) -> ProjectNode:
        return ProjectNode(
            id=payload["id"],
            name=payload["name"],
            summary=payload["summary"],
            repository_url=payload["repository_url"],
            status=ProjectStatus(payload["status"]),
            associated_tech=tuple(payload["associated_tech"]),
            highlights=tuple(payload["highlights"]),
        )
