from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class LandingSite(Base):
    """A candidate landing location on the Moon.

    Coordinates: planetocentric latitude (deg, -90..90) and east-positive
    longitude (deg, -180..180) in the lunar body-fixed frame.
    """

    __tablename__ = "landing_sites"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    latitude_deg: Mapped[float] = mapped_column(Float)
    longitude_deg: Mapped[float] = mapped_column(Float)
    region: Mapped[str] = mapped_column(String(80), default="South Polar Region")
    description: Mapped[str] = mapped_column(Text, default="")
    coordinate_source: Mapped[str] = mapped_column(Text)
    coordinate_status: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
