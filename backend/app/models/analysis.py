"""Persistence model for mission analyses (populated from Phase 2 onward)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.site import utcnow


class MissionAnalysis(Base):
    __tablename__ = "mission_analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    mission_name: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(24))  # PENDING | RUNNING | COMPLETED | FAILED
    start_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    time_step_minutes: Mapped[int] = mapped_column(Integer)
    horizon_model: Mapped[str] = mapped_column(String(24))
    weights: Mapped[dict] = mapped_column(JSON)
    data_quality: Mapped[str] = mapped_column(String(32))
    algorithm_version: Mapped[str] = mapped_column(String(32))
    cache_key: Mapped[str] = mapped_column(String(64), index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sites: Mapped[list[AnalysisSite]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan"
    )
    provenance: Mapped[list[DataProvenance]] = relationship(cascade="all, delete-orphan")
    ai_reports: Mapped[list[AIReport]] = relationship(cascade="all, delete-orphan")


class AnalysisSite(Base):
    __tablename__ = "analysis_sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_id: Mapped[str] = mapped_column(ForeignKey("mission_analyses.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(160))
    latitude_deg: Mapped[float] = mapped_column(Float)
    longitude_deg: Mapped[float] = mapped_column(Float)
    landing_site_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)

    analysis: Mapped[MissionAnalysis] = relationship(back_populates="sites")
    timelines: Mapped[list[VisibilityTimeline]] = relationship(cascade="all, delete-orphan")


class VisibilityTimeline(Base):
    """Sampled elevation series for one body as seen from one analysis site.

    Stored as JSON arrays for portability; large series may move to a columnar
    store / Parquet in later phases.
    """

    __tablename__ = "visibility_timelines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_site_id: Mapped[int] = mapped_column(
        ForeignKey("analysis_sites.id", ondelete="CASCADE")
    )
    body: Mapped[str] = mapped_column(String(16))  # SUN | EARTH
    times_utc: Mapped[list] = mapped_column(JSON)
    azimuth_deg: Mapped[list] = mapped_column(JSON)
    elevation_deg: Mapped[list] = mapped_column(JSON)


class AIReport(Base):
    __tablename__ = "ai_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_id: Mapped[str] = mapped_column(ForeignKey("mission_analyses.id", ondelete="CASCADE"))
    language: Mapped[str] = mapped_column(String(8))
    model: Mapped[str] = mapped_column(String(64))
    report: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DataProvenance(Base):
    __tablename__ = "data_provenance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_id: Mapped[str] = mapped_column(ForeignKey("mission_analyses.id", ondelete="CASCADE"))
    source_id: Mapped[str] = mapped_column(String(64))
    source_version: Mapped[str | None] = mapped_column(String(128), nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    request_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class CachedResult(Base):
    """Persistent cache for deterministic computations / external fetches."""

    __tablename__ = "cached_results"

    cache_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
