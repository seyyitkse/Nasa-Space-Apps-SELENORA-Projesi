from fastapi import APIRouter

from app.api.v1 import (
    analyses,
    artemis,
    data_sources,
    demo,
    ephemeris,
    events,
    globe,
    maps,
    sites,
    solar,
    terrain,
)

router = APIRouter(prefix="/api/v1")
router.include_router(sites.router)
router.include_router(data_sources.router)
router.include_router(analyses.router)
router.include_router(demo.router)
router.include_router(terrain.router)
router.include_router(maps.router)
router.include_router(artemis.router)
router.include_router(ephemeris.router)
router.include_router(globe.router)
router.include_router(events.router)
router.include_router(solar.router)
