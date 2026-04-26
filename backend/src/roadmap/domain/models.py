from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Tuple


class ProficiencyStatus(str, Enum):
    EXPLORING = "exploring"
    PROFICIENT = "proficient"
    EXPERT = "expert"


class RelationType(str, Enum):
    DEPENDENCY = "dependency"
    RELATED = "related"


class ResourceType(str, Enum):
    PROJECT = "project"
    ARTICLE = "article"
    PAPER = "paper"
    NOTE = "note"


class ProjectStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    INCUBATING = "incubating"


@dataclass(frozen=True)
class LayoutPosition:
    x: float
    y: float


@dataclass(frozen=True)
class ActivitySnapshot:
    reading_hours: float
    coding_hours: float
    writing_count: int
    open_source_contributions: int


@dataclass(frozen=True)
class ThresholdPolicy:
    exploration_hours: float
    proficient_coding_hours: float
    expert_coding_hours: float
    expert_writings: int
    expert_contributions: int


@dataclass(frozen=True)
class ResourceLink:
    id: str
    title: str
    url: str
    resource_type: ResourceType
    description: str


@dataclass(frozen=True)
class TechnologyNode:
    id: str
    name: str
    summary: str
    time_spent_hours: float
    rarity_index: float
    active_user_count: int
    activity: ActivitySnapshot
    thresholds: ThresholdPolicy
    resources: Tuple[ResourceLink, ...] = field(default_factory=tuple)
    layout: LayoutPosition = field(default_factory=lambda: LayoutPosition(x=0, y=0))


@dataclass(frozen=True)
class RelationEdge:
    source_id: str
    target_id: str
    relation_type: RelationType


@dataclass(frozen=True)
class ProjectNode:
    id: str
    name: str
    summary: str
    repository_url: str
    status: ProjectStatus
    associated_tech: Tuple[str, ...]
    highlights: Tuple[str, ...] = field(default_factory=tuple)

