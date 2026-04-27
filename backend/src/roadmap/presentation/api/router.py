from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response, status

from roadmap.application.services import RoadmapQueryService
from roadmap.presentation.api.schemas import (
    DashboardGraphResponse,
    HealthResponse,
    ProjectCreateRequest,
    ProjectProfileResponse,
    RelationCreateRequest,
    TechnologyExportResponse,
    TechnologyLayoutBatchRequest,
    TechnologyProfileResponse,
    TechnologyResourceNoteAppendRequest,
    TechnologySyncRequest,
    TechnologySyncResponse,
    TechnologyUpdateRequest,
)


def create_router(service: RoadmapQueryService) -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["roadmap"])

    @router.get("/health", response_model=HealthResponse)
    def healthcheck() -> HealthResponse:
        return HealthResponse(status="ok")

    @router.get("/graph", response_model=DashboardGraphResponse)
    def get_graph() -> DashboardGraphResponse:
        return DashboardGraphResponse.model_validate(service.get_dashboard_graph())

    @router.post("/relations", status_code=status.HTTP_204_NO_CONTENT)
    def add_relation(body: RelationCreateRequest) -> Response:
        if body.relation_type != "dependency":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="only dependency relations are supported")
        service.add_dependency_relation(body.source_id, body.target_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.delete("/relations", status_code=status.HTTP_204_NO_CONTENT)
    def delete_relation(
        source_id: str = Query(..., min_length=1),
        target_id: str = Query(..., min_length=1),
    ) -> Response:
        service.delete_dependency_relation(source_id, target_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.patch("/technologies/layout", status_code=status.HTTP_204_NO_CONTENT)
    def patch_technology_layouts(body: TechnologyLayoutBatchRequest) -> Response:
        service.update_technology_layouts({item.id: (item.x, item.y) for item in body.items})
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get(
        "/technologies/export",
        response_model=TechnologyExportResponse,
    )
    def export_technologies() -> TechnologyExportResponse:
        return TechnologyExportResponse.model_validate({"items": service.export_technologies()})

    @router.patch(
        "/technologies/{technology_id}",
        response_model=TechnologyProfileResponse,
    )
    def update_technology(technology_id: str, body: TechnologyUpdateRequest) -> TechnologyProfileResponse:
        return TechnologyProfileResponse.model_validate(
            service.update_technology(technology_id, body.model_dump(exclude_unset=True))
        )

    @router.post(
        "/technologies/{technology_id}/resources",
        response_model=TechnologyProfileResponse,
    )
    def append_technology_resource(
        technology_id: str, body: TechnologyResourceNoteAppendRequest
    ) -> TechnologyProfileResponse:
        return TechnologyProfileResponse.model_validate(
            service.append_technology_resource_note(technology_id, body.text)
        )

    @router.delete(
        "/technologies/{technology_id}",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    def delete_technology(technology_id: str) -> Response:
        service.delete_technology(technology_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.post(
        "/technologies/{parent_id}/derived",
        response_model=TechnologyProfileResponse,
    )
    def create_derived_technology(parent_id: str) -> TechnologyProfileResponse:
        return TechnologyProfileResponse.model_validate(service.create_derived_technology(parent_id))

    @router.post(
        "/technologies/sync",
        response_model=TechnologySyncResponse,
    )
    def sync_technologies(body: TechnologySyncRequest) -> TechnologySyncResponse:
        return TechnologySyncResponse.model_validate(
            service.sync_technologies([item.model_dump(exclude_none=True) for item in body.items])
        )

    @router.get("/technologies/{technology_id}", response_model=TechnologyProfileResponse)
    def get_technology(technology_id: str) -> TechnologyProfileResponse:
        return TechnologyProfileResponse.model_validate(service.get_technology_profile(technology_id))

    @router.get("/projects/{project_id}", response_model=ProjectProfileResponse)
    def get_project(project_id: str) -> ProjectProfileResponse:
        return ProjectProfileResponse.model_validate(service.get_project_profile(project_id))

    @router.post("/projects", response_model=ProjectProfileResponse)
    def create_project(body: ProjectCreateRequest) -> ProjectProfileResponse:
        return ProjectProfileResponse.model_validate(service.create_project(body.technology_ids))

    @router.delete(
        "/projects/{project_id}",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    def delete_project(project_id: str) -> Response:
        service.delete_project(project_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
