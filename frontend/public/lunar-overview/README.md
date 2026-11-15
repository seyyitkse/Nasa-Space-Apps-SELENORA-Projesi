# Genuine lunar basemap bundle — Phase 5F.2

44 small georeferenced PNGs (2,545,840 bytes total); no decorative or AI-generated imagery.
`manifest.json` records exact metre bounds, output dimensions, projection, source identity,
processing version, attribution and SHA-256 of every PNG.

WAC: NASA/GSFC/Arizona State University, ASU Lunaserv WMS `luna_wac_roi_south_summer`.
Direct WMS 1.1.1, `IAU2000:30120`, transparent PNGs returned unchanged.
[Official WAC product](https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_ROI_SOUTH_SUMMER).

LOLA: NASA GSFC PGDA Product 90, Barker et al. (2021),
[adjusted 80 m hillshade](https://pgda.gsfc.nasa.gov/products/90).
Bounded, masked raster reads, fixed DN 0–255 display transfer; absent coverage remains transparent.

Grid: Moon sphere radius 1,737,400 m; south polar stereographic, 90°S, 0°E, k=1.
World square ±768 km. Four WAC level-0 tiles (3,200 m/px), four WAC and four LOLA
central level-1 tiles (1,600 m/px). Startup WAC: twenty level-5 tiles (100 m/px,
96 × 120 km), six WAC and six LOLA level-4 tiles (200 m/px, 96 × 144 km).
No bounds are enlarged.

These static photographic/shaded-relief textures are not mission-time illumination and
do not feed terrain scoring. NAC 2 m is optional and acquired on demand; no NAC 1 m RDR
is bundled. Native shadows are valid data, never a missing-data mask.

Deployment: from `backend`, run `python -m app.services.prepare_polar_overviews` to
import the verified bundle into the persistent cache without contacting NASA.
Regeneration: `python -m app.services.prepare_polar_overviews --export-bundle` uses
verified cached images and fetches only missing small windows. Change the processing
version if the source/processing changes; regenerate and run the integrity tests.
