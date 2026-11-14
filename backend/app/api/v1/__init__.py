from fastapi import APIRouter

from app.api.v1 import analyses, data_sources, demo, sites

router = APIRouter(prefix="/api/v1")
router.include_router(sites.router)
router.include_router(data_sources.router)
router.include_router(analyses.router)
router.include_router(demo.router)
