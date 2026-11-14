"""Inspect local LOLA GeoTIFF metadata and coverage vs candidate lon/lat."""

from __future__ import annotations

import sys
from pathlib import Path

import rasterio
from pyproj import CRS, Transformer

ROOT = Path(__file__).resolve().parents[2]
LOLA = ROOT / "data" / "raw" / "lola"

# MOON_ME sphere polar stereographic (south), a=b=1737.4 km — matches PGDA README / HF atlas.
MOON_SPHERE_M = 1_737_400.0
MOON_GEOG = CRS.from_proj4(
    f"+proj=lonlat +a={MOON_SPHERE_M} +b={MOON_SPHERE_M} +no_defs"
)
MOON_STEREO_S = CRS.from_proj4(
    f"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 "
    f"+a={MOON_SPHERE_M} +b={MOON_SPHERE_M} +units=m +no_defs"
)


def main() -> int:
    paths = sorted(LOLA.glob("*_surf.tif"))
    if not paths:
        print("NO_DEM")
        return 1
    fwd = Transformer.from_crs(MOON_GEOG, MOON_STEREO_S, always_xy=True)
    candidates = [
        ("seed_shackleton_a", -89.68, -166.0),
        ("seed_connecting_b", -89.44, -141.8),
        ("lit_site01", -89.45, -137.31),
        ("lit_site04", -89.78, -155.73),
    ]
    for p in paths:
        print("FILE", p.name, "bytes", p.stat().st_size)
        with rasterio.open(p) as ds:
            print("  crs", ds.crs)
            print("  size", ds.width, ds.height)
            print("  res", ds.res)
            print("  bounds", tuple(ds.bounds))
            print("  nodata", ds.nodata)
            print("  dtype", ds.dtypes[0])
            for name, lat, lon in candidates:
                x, y = fwd.transform(lon, lat)
                inside = (
                    ds.bounds.left <= x <= ds.bounds.right
                    and ds.bounds.bottom <= y <= ds.bounds.top
                )
                z = None
                if inside:
                    val = list(ds.sample([(x, y)]))[0][0]
                    z = float(val)
                print(f"  {name} lon={lon} lat={lat} xy=({x:.1f},{y:.1f}) inside={inside} z={z}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
