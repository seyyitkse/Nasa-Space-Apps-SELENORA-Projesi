# SELENORA Phase 6C.1 — Mission Control Polar Map Report

Date: 2026-11-15

## Delivery identity

- Base branch: `feature/phase6c-unified-integration`
- Verified base and merge base: `5ed7454a549c0a2cc11d968f9f58c85c300e001c`
- Delivery branch: `feature/phase6c1-mission-control-map`
- Isolated worktree: `E:\Projeler\Nasa-Space-Apps-SELENORA-Projesi\.worktrees\phase6c1`
- Browser QA: Vite at `http://localhost:5208`, isolated FastAPI harness at `http://127.0.0.1:8048`
- Runtime provenance endpoint reported the same worktree, commit and branch. It still reports package `0.1.0` and phase `5F.2` because Phase 6C.1 does not change the backend or its Phase 5F.2 imagery runtime metadata.

The Phase 6A/6B worktrees and active Phase 6C 3D files were not modified. `MoonPage`, Mission Planner, Lunar Explorer imagery code, backend APIs, scoring/visibility engines and shared coordinate conventions are unchanged.

## Problem and selected architecture

The old homepage mounted the detailed OpenLayers `LunarMap` without a basemap source. It therefore painted a rectangular polar coordinate grid and markers, while the homepage text explicitly said that no imagery basemap was present. It also initialized a second map engine and queried the terrain catalog for a lightweight preview.

The new homepage preview is a small, declarative SVG atlas:

1. Four existing Phase 5F.2 WAC overview PNGs are placed at their exact south-polar stereographic metre bounds.
2. A true 80°S geographic circle clips the imagery. The source rasters keep their original square bounds and aspect ratio; no source bounds are stretched or falsified.
3. The existing Explorer projection function places all markers. SVG links and a keyboard-friendly HTML site list open the same `/explorer?site=...` routes.
4. If an individual WAC PNG fails, only that quadrant changes to the matching bundled LOLA hillshade at identical bounds. If LOLA also fails, the quadrant is reported unavailable and no synthetic pixels are invented.
5. The homepage no longer initializes OpenLayers or requests an upstream WMS/terrain catalog. It uses browser-cached, prepared assets and creates no object URLs.

This keeps the full Lunar Explorer as the detailed map while giving Mission Control an immediate scientific overview.

## Exact NASA imagery

The photographic layer is the existing `lroc-wac-south-summer` prepared pyramid, sourced from the LROC WAC South Pole Summer Mosaic (`WAC_ROI_SOUTH_SUMMER`) through ASU Lunaserv. Attribution remains **NASA / GSFC / Arizona State University**. The four homepage files are the manifest's level-1 quadrants:

| File | SPS bounds (m) | SHA-256 |
| --- | --- | --- |
| `lroc-wac-south-summer-1-1-1.png` | `[-384000, 0, 0, 384000]` | `87152b2723ce9f32f5c3803dbe5941be3159a2d0d20aeafacea406511c729938` |
| `lroc-wac-south-summer-1-2-1.png` | `[0, 0, 384000, 384000]` | `523f6a31c461188d4c117626f84b3a6075a7932b946bde75a2b8df38bc578c02` |
| `lroc-wac-south-summer-1-1-2.png` | `[-384000, -384000, 0, 0]` | `a0b3596f20013ad494865cba807127cd939d2f629fe0c97744c5c1b27459732d` |
| `lroc-wac-south-summer-1-2-2.png` | `[0, -384000, 384000, 0]` | `2dcc8496946043fd52fd8270b35f03093795e0a9be41a1a5dcfc242133819b51` |

Each PNG is 240 × 240 pixels at 1,600 m/pixel. Together they transfer 369,470 bytes and require about 0.88 MiB of decoded RGBA memory. The fallback uses the corresponding `ldem-80s-80mpp-hill-1-x-y.png` assets from NASA/GSFC PGDA Product 90. A homepage visit makes no NASA network request.

## Projection, mask and marker alignment

- CRS: lunar south-polar stereographic, equivalent to `IAU2000:30120` for this product.
- PROJ definition from the prepared manifest: `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +a=1737400 +b=1737400 +units=m`.
- Longitude convention: east-positive, with 0°E at the top, 90°E right, 180° bottom and 90°W left.
- The true projected radius of the 80°S parallel is **304,005.608 m**. That radius maps to a 300 SVG-unit clipping circle.
- The four ±384 km tiles exceed that radius, so the complete 80–90°S cap is covered without extending or distorting any raster.
- 85°S and 88°S reference rings use the nonlinear projection rather than equal visual spacing.

Focused tests cover the pole, all cardinal directions, the 80°S boundary, nonlinear latitude rings, quadrant joins, image aspect ratios and out-of-cap rejection. Browser DOM inspection confirmed representative marker positions, including Shackleton Rim Point A at `(357.68, 369.29)`, Malapert at `(366.06, 240.41)` and Nobile at `(475.53, 274.51)` in the 720-unit view box. A real marker click selected Shackleton Rim Point A in Lunar Explorer. Marker coordinates are never moved to reduce overlap; the expandable 44 px site links provide a precise accessible alternative for the tightly clustered pole sites.

## Loading, fallback and accessibility

- The status separates prepared WAC loading, WAC ready, LOLA fallback loading, LOLA ready and unavailable quadrants.
- The first successful raster paint is recorded for QA. Stale WAC events cannot replace a successfully mounted LOLA fallback.
- The API catalog remains authoritative, including an intentionally empty response. If the API cannot be reached, a clearly labelled dashboard-only snapshot of the eight unchanged `5ed7454` seed coordinates keeps markers usable. This snapshot is not used by scientific calculations.
- The SVG has a title and projection description. Each marker is a link with its exact coordinate in the accessible title. The expandable HTML list supplies large keyboard targets.
- Both calls to action are explicit: **Lunar Explorer / Ay Kaşifi** and **Explore the 3D Moon / 3B Ay’ı Keşfet**.
- Static-photo and approximate-coordinate disclaimers stay visible. Reduced-motion users receive no startup animation; hover transitions honor `motion-reduce`.

## Performance measurements

Measurements were made against the isolated Vite server and bundled production inputs:

| Measurement | Result |
| --- | ---: |
| First visible raster event in browser, warm prepared cache | 32 ms |
| No-cache local HTTP requests, four WAC PNGs | 53 / 4 / 12 / 3 ms |
| Total WAC transfer payload | 369,470 bytes |
| Approximate decoded WAC memory | 921,600 bytes |
| `SouthPolePreview` production chunk | 9.60 kB (3.65 kB gzip) |
| Mobile requested viewport | 375 × 812 px |
| Mobile content width / scroll width | 365 / 365 px (no horizontal overflow) |

The first local request includes connection and Vite handling overhead. These figures are not remote Lunaserv timings: the design intentionally removes remote NASA service latency from homepage painting.

## Browser acceptance results

- Homepage first load: four genuine WAC quadrants loaded (`naturalWidth=240`) and changed the status to photographic mosaic.
- Circular geographic crop: visually centered on the pole; 80°S cap, cardinal meridians and latitude rings aligned.
- Marker selection: Shackleton Rim Point A opened `/explorer?site=shackleton-rim-a` and selected that exact live site.
- Lunar Explorer action: route and existing detailed map opened.
- 3D action: `/moon` opened successfully; no 3D source file was edited.
- TR/EN: map name, states, disclaimers and actions verified in both languages.
- Desktop: verified at the normal 1270 × 714 browser surface.
- Mobile: verified at 375 × 812; no horizontal overflow and controls remain readable.
- Backend unavailable: all four WAC rasters and eight reference markers remained visible; UI explicitly showed `API offline · prepared reference-site snapshot.`
- WAC/LOLA errors: per-quadrant replacement, double failure and race protection are covered by focused component tests using the real prepared URL scheme and unchanged bounds.

## Screenshots

- Before: [`screenshots/phase6c1/before-desktop.jpg`](screenshots/phase6c1/before-desktop.jpg)
- After, desktop: [`screenshots/phase6c1/after-desktop.jpg`](screenshots/phase6c1/after-desktop.jpg)
- After, mobile 375 px: [`screenshots/phase6c1/after-mobile-375.jpg`](screenshots/phase6c1/after-mobile-375.jpg)
- Backend unavailable, mobile: [`screenshots/phase6c1/backend-offline-mobile.jpg`](screenshots/phase6c1/backend-offline-mobile.jpg)

## Changed files

- `frontend/src/features/dashboard/SouthPolePreview.tsx`
- `frontend/src/features/dashboard/homepageReferenceSites.ts`
- `frontend/src/features/dashboard/polarPreviewGeometry.ts`
- `frontend/src/features/dashboard/SouthPolePreview.test.tsx`
- `frontend/src/features/dashboard/polarPreviewGeometry.test.ts`
- `frontend/src/i18n/locales/phase6c1.en.ts`
- `frontend/src/i18n/locales/phase6c1.tr.ts`
- locale aggregators, this report and its screenshots

## Verification

- Focused preview/projection tests: 37 passed.
- Full frontend Vitest suite: 23 files, 168 tests passed.
- TypeScript and production build: passed; Vite transformed 4,059 modules.
- Lint: passed with pre-existing warnings in unrelated files; the Phase 6C.1 render-purity warning was removed.
- `git diff --check`: passed.

## Limits and follow-up

The homepage is an overview at 1.6 km/pixel. It deliberately does not claim NAC-level detail, mission-date lighting or certified landing coordinates. Closely spaced near-pole markers remain geographically coincident at this scale, so the exact site list is the recommended selector. The runtime provenance endpoint's `phase: 5F.2` field describes the unchanged imagery backend; a future release-wide metadata update can rename that field without coupling this homepage-only delivery to backend work.
