from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class LayoutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    x: float
    y: float


class ResourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    url: str
    resource_type: str
    description: str


class TechnologyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    category: str
    summary: str
    time_spent_hours: float
    status: str
    rarity_index: float
    active_user_count: int
    layout: LayoutResponse
    resource_count: int


class TechnologyDetailResponse(TechnologyResponse):
    resources: List[ResourceResponse]
    project_ids: List[str]


class RelationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    source_id: str
    target_id: str
    relation_type: str


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    summary: str
    repository_url: str
    status: str
    associated_tech: List[str]
    highlights: List[str]


class SummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_technologies: int
    total_projects: int
    active_categories: int
    expert_nodes: int


class DashboardGraphResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    technologies: List[TechnologyResponse]
    relations: List[RelationResponse]
    projects: List[ProjectResponse]
    summary: SummaryResponse


class TechnologyProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    technology: TechnologyDetailResponse
    related_projects: List[ProjectResponse]
    prerequisites: List[TechnologyResponse]
    unlocks: List[TechnologyResponse]


class ProjectProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project: ProjectResponse
    related_technologies: List[TechnologyResponse]


class HealthResponse(BaseModel):
    status: str


class TechnologyUpdateRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    summary: Optional[str] = None
    time_spent_hours: Optional[float] = Field(default=None, ge=0)
    rarity_index: Optional[float] = Field(default=None, ge=0, le=1)
    active_user_count: Optional[int] = Field(default=None, ge=0)


class TechnologySyncItemRequest(BaseModel):
    id: Optional[str] = None
    name: str
    category: Optional[str] = None
    summary: Optional[str] = None
    time_spent_hours: Optional[float] = Field(default=None, ge=0)
    rarity_index: Optional[float] = Field(default=None, ge=0, le=1)
    active_user_count: Optional[int] = Field(default=None, ge=0)


class TechnologySyncRequest(BaseModel):
    items: List[TechnologySyncItemRequest]


class TechnologySyncResponse(BaseModel):
    added_ids: List[str]
    updated_ids: List[str]
    skipped_names: List[str]


class TechnologyExportItemResponse(BaseModel):
    id: str
    name: str
    category: str
    summary: str
    time_spent_hours: float
    rarity_index: float
    active_user_count: int


class TechnologyExportResponse(BaseModel):
    items: List[TechnologyExportItemResponse]

