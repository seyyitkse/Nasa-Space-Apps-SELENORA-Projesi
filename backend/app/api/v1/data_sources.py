from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import settings_dep
from app.core.config import Settings
from app.schemas.data_source import DataSourceList
from app.services.data_source_service import list_data_sources

router = APIRouter(prefix="/data-sources", tags=["data-sources"])


@router.get("", response_model=DataSourceList, summary="Scientific data sources and integration status")
def get_data_sources(settings: Annotated[Settings, Depends(settings_dep)]) -> DataSourceList:
    return list_data_sources(settings)
