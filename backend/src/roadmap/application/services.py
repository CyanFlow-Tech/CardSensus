from __future__ import annotations

from collections import defaultdict, deque
from typing import Dict, List

from fastapi import HTTPException, status

from roadmap.application.dto import (
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
from roadmap.domain.models import ProjectNode, RelationEdge, RelationType, TechnologyNode
from roadmap.domain.repositories import RoadmapRepository
from roadmap.domain.services import TechnologyStatusPolicy


class RoadmapQueryService:
    def __init__(self, repository: RoadmapRepository, status_policy: TechnologyStatusPolicy | None = None) -> None:
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
                    title=resource.title,
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

