from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class LayoutDTO:
    x: float
    y: float


@dataclass(frozen=True)
class ResourceDTO:
    id: str
    url: str
    resource_type: str
    description: str


@dataclass(frozen=True)
class TechnologyDTO:
    id: str
    name: str
    summary: str
    time_spent_hours: float
    status: str
    rarity_index: float
    active_user_count: int
    image_url: str
    layout: LayoutDTO
    resource_count: int


@dataclass(frozen=True)
class TechnologyDetailDTO(TechnologyDTO):
    resources: List[ResourceDTO] = field(default_factory=list)
    project_ids: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class RelationDTO:
    source_id: str
    target_id: str
    relation_type: str


@dataclass(frozen=True)
class ProjectDTO:
    id: str
    name: str
    summary: str
    repository_url: str
    status: str
    associated_tech: List[str]
    highlights: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class SummaryDTO:
    total_technologies: int
    total_projects: int
    expert_nodes: int


@dataclass(frozen=True)
class DashboardGraphDTO:
    technologies: List[TechnologyDTO]
    relations: List[RelationDTO]
    projects: List[ProjectDTO]
    summary: SummaryDTO


@dataclass(frozen=True)
class TechnologyProfileDTO:
    technology: TechnologyDetailDTO
    related_projects: List[ProjectDTO]
    prerequisites: List[TechnologyDTO]
    unlocks: List[TechnologyDTO]


@dataclass(frozen=True)
class ProjectProfileDTO:
    project: ProjectDTO
    related_technologies: List[TechnologyDTO]

