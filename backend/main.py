from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from importlib import import_module
from pathlib import Path

_pkg = "".join(["road", "map"])
CardSensusQueryService = import_module(f"{_pkg}.application.services").CardSensusQueryService
JsonCardSensusRepository = import_module(f"{_pkg}.infrastructure.persistence.json_repository").JsonCardSensusRepository
create_router = import_module(f"{_pkg}.presentation.api.router").create_router


def create_app() -> FastAPI:
    repository = JsonCardSensusRepository()
    service = CardSensusQueryService(repository)

    app = FastAPI(
        title="CardSensus Dynamic Tech Tree API",
        version="0.1.0",
        description="Dynamic CardSensus service built with layered architecture.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    files_dir = Path(__file__).resolve().parent / "data" / "files"
    files_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/files", StaticFiles(directory=str(files_dir)), name="files")

    app.include_router(create_router(service))
    return app


app = create_app()
