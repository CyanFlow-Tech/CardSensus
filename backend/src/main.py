from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from roadmap.infrastructure.persistence.json_repository import JsonRoadmapRepository
from roadmap.application.services import RoadmapQueryService
from roadmap.presentation.api.router import create_router


def create_app() -> FastAPI:
    repository = JsonRoadmapRepository()
    service = RoadmapQueryService(repository)

    app = FastAPI(
        title="Roadmap Dynamic Tech Tree API",
        version="0.1.0",
        description="Dynamic roadmap service built with layered architecture.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(create_router(service))
    return app


app = create_app()

