# SELENORA — Coordinate Systems & Reference Frames

**Phase:** 4 (LOLA terrain)  
**Status:** Documented engineering decision for jury / scientific review  
**Does not claim:** DE421↔DE441 surface co-registration at centimetre level

---

## 1. Summary decision

| Layer | Frame / product | How SELENORA uses it |
|-------|-----------------|----------------------|
| Site lon/lat input | Spherical Moon, east-positive lon, planetocentric lat | API + DB seed sites |
| JPL Horizons observer | Lunar GEODETIC `SITE_COORD` on `coord@301` (Mean-Earth / polar axis convention per Horizons) | Sun & Earth Az/El (`QUANTITIES=4`) |
| Horizons ephemeris kernel | Live response often cites **DE441** | Attitude / body directions only — **not** a surface DEM |
| LOLA 5 m DEM (PGDA Site01/04) | South polar stereographic, sphere **a=b=1737.4 km**, **MOON_ME / DE421** product note | Terrain heights Z (m) and local horizon rays |
| Projection library | PyProj explicit `+proj=stere +lat_0=-90 +lon_0=0` on 1737400 m sphere | lon/lat ↔ stereo metres for windowed raster reads |

**Phase 4 does not apply a silent DE421↔DE441 horizontal shift.** Residual frame mismatch is treated as a **documented limitation** (expected metre-scale for ~10–20 km local horizons), not corrected by an unverified Helmert transform.

---

## 2. JPL Horizons lunar observer coordinates

- Observer: topocentric on the Moon via `COORD_TYPE=GEODETIC` and `SITE_COORD='lon,lat,elev'` with center `@301`.
- Output used: apparent **azimuth** and **elevation** of Sun (`COMMAND=10`) and Earth (`COMMAND=399`).
- Elevation is relative to the **local geometric horizon** of a smooth reference surface at the observer (Horizons airless; no refraction).
- Horizons manuals describe lunar Mean-Earth / polar axis conventions for body-fixed lon/lat. SELENORA treats user lon/lat as the same GEODETIC inputs we send to Horizons.

**Important:** A DE441 tag in a Horizons header identifies the **ephemeris** used for target directions. It is **not** proof that the observer’s surface lon/lat was redefined onto a DE441-tied topography grid.

---

## 3. LOLA PGDA south-polar GeoTIFFs

Product page: [PGDA High-Resolution LOLA Topography for Lunar South Pole Sites](https://pgda.gsfc.nasa.gov/products/78) (Barker et al., 2021).

Per accompanying README (copied under `data/raw/lola/README.txt`):

- **CRS:** south polar stereographic X/Y in metres, **MOON_ME** reference frame of ephemeris **DE421**.
- **Spheroid:** spherical Moon, radius **1737.4 km**.
- **Pixel registration:** GMT-style pixel-registered (pixel centres).
- **Z:** surface height in **metres** (`*_surf.tif`), with interpolation filling empty pixels in the delivered product.
- **Tiles used:**
  - **Site01** — Connecting Ridge — `Site01_final_adj_5mpp_surf.tif` (~5 m/pix, 3200×3200)
  - **Site04** — Shackleton Rim — `Site04_final_adj_5mpp_surf.tif` (~5 m/pix, 3200×3200)

Stereo bounds (metres, as read by rasterio):

| Tile | left | bottom | right | top |
|------|------|--------|-------|-----|
| Site01 | −19000 | −20000 | −3000 | −4000 |
| Site04 | −9000 | −15000 | 7000 | 1000 |

---

## 4. Coverage of SELENORA seed sites

Verified by `terrain_data_service.check_coverage` against local GeoTIFFs:

| Seed site | Lon / Lat | Covered? | Tile |
|-----------|-----------|----------|------|
| Shackleton Rim — Point A | −166.0° E, −89.68° | **Yes** | Site04 |
| Connecting Ridge — Point B | −141.8° E, −89.44° | **Yes** | Site01 |
| Shackleton floor (approx.) | 129.78° E, −89.67° | **No** | — |

No automatic remapping of uncovered seeds onto other lon/lat. TERRAIN mode raises `TERRAIN_UNAVAILABLE` (HTTP 422) if a requested site lacks DEM coverage or horizon coverage &lt; 80%.

---

## 5. Projection transform (implementation)

Module: `backend/app/science/lunar_projection.py`

```text
+proj=lonlat +a=1737400 +b=1737400
↔
+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m
```

Azimuth convention (Phase 4.1): Horizons / geographic azimuth is **clockwise from local
true north**. Grid north (+Y) equals true north only on the `lon_0=0` meridian.

Verified (finite-difference lon/lat→stereo):

| Site | Lon | Grid azimuth of true north γ |
|------|-----|------------------------------|
| Point A | −166° | **194.0°** |
| Point B | −141.8° | **218.2°** |

Closed form for this CRS: `γ = longitude_east_positive % 360`.  
`pyproj.Proj.get_factors().meridian_convergence` is **not** used (returns nonsensical
values on this custom sphere).

Ray offsets: `bearing = (true_az + γ) % 360`, then  
`Δx = d·sin(bearing)`, `Δy = d·cos(bearing)`.

---

## 6. Lunar curvature in the horizon engine

Along each ground range `d`, terrain height is reduced by sphere drop

\[
\Delta z = R \bigl(1 - \cos(d/R)\bigr) \approx d^2 / (2R)
\]

with `R = 1 737 400 m`. Elevation angle uses `atan2((z_terrain − z_eye) − Δz, d)`.  
This is **not** a flat-Moon assumption.

---

## 7. What we deliberately do not claim

- Perfect identity between Horizons DE441-labelled ephemerides and DE421 LOLA surface control.
- Centimetre-accurate Artemis III polygon registration.
- Link budget / DSN geometry from “Earth above terrain horizon”.
- Solar disc angular radius (~0.27°) — centre-only visibility (documented assumption).

---

## 8. References

1. JPL Horizons documentation — lunar observer / GEODETIC sites: https://ssd-api.jpl.nasa.gov/doc/horizons.html  
2. Barker et al., 2021, *Planet. Space Sci.* 203, 105119 — https://doi.org/10.1016/j.pss.2020.105119  
3. PGDA product 78 — https://pgda.gsfc.nasa.gov/products/78  
4. Mazarico et al., 2011, *Icarus* 211 — site numbering context for Site01/Site04  
