# SELENORA — Phase 6A: Interactive 3D Moon Explorer

| | |
|---|---|
| Branch | `feature/phase6a-interactive-moon` (worktree `.worktrees/phase6a`) |
| Base | `a9f7ec2` — latest Phase 5F integration commit (`origin/feature/phase5f-immersive-integration`) |
| Scope | Frontend only (`frontend/`, `docs/`, `.gitignore`). No backend, map/LROC (Codex), or database changes. |
| Status | Committed on the Phase 6A branch. Not merged, not pushed, and not submitted. |

## 1. NASA asset used

| Item | Value |
|---|---|
| Source | NASA Scientific Visualization Studio, *Moon 3D Models for Web, AR, and Animation*, **SVS 14959**, <https://svs.gsfc.nasa.gov/14959/>. Released 2026‑01‑29, updated 2026‑04‑01. |
| File | `moon_small.glb`, **13,799,876 B**. SHA‑256 `12d3b0bb7fe214903f51447d1bc61710f442e92a11c703fcaca6d4e7ff8e67d4` |
| Credit | NASA's Goddard Space Flight Center SVS. Built from Lunar Reconnaissance Orbiter (LRO) imagery. |
| Content (inspected) | glTF 2.0, Blender I/O 5.0.21. One mesh: a sphere‑ised **cube**, 46,464 vertices, 23,232 triangles. One 4096×4096 PNG base‑colour **cube‑face atlas**: UVs span u ∈ [0.125, 0.875], so it is **not** an equirectangular sphere. PBR material with clear‑coat and specular extensions. The node has no transform. |
| Ground resolution (measured from UVs) | ≈ **2.4 km per texel** globally (p10–p90: 1.8–3.1). ≈ **3.3 km per texel** south of 80°S. Mesh vertex spacing ≈ 62 km. |
| Not used | The 77.7 MB `Moon_NASA_LRO_8k_Topo_Small.glb` is never downloaded. |
| Hosting | NASA's server sends `access-control-allow-origin` for a single third‑party origin only, so the browser cannot hot‑link the file. It is self‑hosted at `frontend/public/nasa/svs-14959/moon_small.glb`. The file is **gitignored** (13.8 MB) and installed by `npm run fetch:moon` (resumable download, size and SHA‑256 checked). |
| Static fallback image (committed, 136 KB) | NASA SVS **4720** *CGI Moon Kit* `lroc_color_poles_1k.jpg`: the official equirectangular LRO colour map, centred on 0° longitude. Credit: NASA's Scientific Visualization Studio. |
| Hero poster (committed, 112 KB) | `selenora-still-nearside.webp`: an **unlit orthographic still rendered by SELENORA from the NASA GLB's own texture** (`scripts/moon-validation/poster.py`). It is labelled as such. NASA's own previews are Blender viewport screenshots with grid and 3D‑cursor overlays, so they were unsuitable. |

**Lighting.** The GLB's PBR material is replaced with an **unlit** material, so the LRO photograph is shown exactly as delivered. No sun, terminator, shadow or specular highlight is simulated. Nothing on the globe can be read as an illumination result.

## 2. Verified orientation (critical)

The model is a cube‑sphere with a cube‑atlas texture, so no Earth‑globe formula could be assumed. Orientation was **measured**. All scripts are in `frontend/scripts/moon-validation/` (Python 3 + NumPy + Pillow, run with `-I`).

1. **Axis inspection (`glbinfo.mjs`).** Positions are centred on the origin, with radius 1.27186–1.28223 (cube‑sphere chord variation of +0.8%). There is no node transform.
2. **Texture correlation (`orient.py`).** For every vertex, the luminance of the GLB's own texture at that vertex's UV was compared with the NASA SVS 4720 equirectangular map, sampled at the lat/lon implied by each candidate mapping. The search covered **48 signed axis permutations × 180 longitude offsets**.
   - **Winner: Pearson r = 0.9192**, a proper rotation (det = +1), longitude offset **0.0°** at 0.1° resolution.
   - The best **mirrored** candidate reaches only r = 0.454.
   - The four r = 0.919 entries are the same mapping expressed four ways.
3. **Residual rotation (`tilt.py`).** Tilts about both horizontal axes plus spin were searched over ±1° in 0.25° steps. The best result is the identity itself (r = 0.91916). **No correction rotation is needed.**
4. **Landmarks (`landmarks.py`).** Seven IAU/USGS Gazetteer features (`MOON_nomenclature_center_pts`, GCS_Moon_2000, 0–360°E converted to ±180°E) were checked.
   - Method: each is sampled on the **GLB texture** via ray–triangle hit → UV → 13×13 px mean, and compared with the point mirrored in longitude or latitude.
   - Rule: a mare must be below the texture median (110) **and** at least 25% darker than its mirror. A bright crater must be the reverse.

   | Landmark (Gazetteer) | lat, lon | expect | lum | mirror (axis) | result |
   |---|---|---|---|---|---|
   | Mare Crisium | 16.18, 59.10 | dark | 37.0 | 88.5 (lat) | ✅ |
   | Mare Imbrium | 34.72, −14.91 | dark | 39.6 | 141.1 (lat) | ✅ |
   | Mare Moscoviense (far side) | 27.28, 148.12 | dark | 43.0 | 190.1 (lon) | ✅ |
   | Mare Ingenii (far side) | −33.25, 164.83 | dark | 45.9 | 73.3 (lon) | ✅ |
   | Mare Orientale | −19.87, −94.67 | dark | 75.0 | 123.4 (lon) | ✅ |
   | Tycho | −43.30, −11.22 | bright | 207.2 | 125.8 (lon) | ✅ |
   | Copernicus | 9.62, −20.08 | bright | 138.2 | 11.8 (lon) | ✅ |

   An east/west‑mirrored globe would fail all five longitude checks (asserted in tests).

   *Not usable as albedo tests:* Tsiolkovskiy's centre is its bright central peak, and the longitude mirror of Crisium is Oceanus Procellarum, which is also dark. Both were therefore rejected as tests or given the latitude mirror. This is documented rather than hidden.
5. **South pole (`polar.py`).** A ±160 km polar‑stereographic render of the GLB texture with the sites overlaid shows **Shoemaker's** 52 km double ring where the Gazetteer puts it (88.14°S, 45.91°E), on the expected upper‑right side. Shackleton itself (21 km, about 6 texels) is not distinguishable at this texture resolution. This is stated in the UI and is the reason for the hand‑off to LOLA.
6. **Browser.**
   - Near side shows Mare Imbrium (upper left), Copernicus (left) and Mare Crisium (east limb, right) with north up.
   - Far side shows Moscoviense (upper left) and Ingenii (bottom).
   - South‑pole view: the gold 0° meridian runs from the pole to the top of the screen, Mare Orientale (90°W) sits on the left and Ingenii (≈180°) at the bottom.
   - Screenshots 03–05.

**Resulting transform** (`frontend/src/features/moon-globe/orientation.ts`). Lunar body‑fixed: X → 0°E, Y → 90°E, Z → north.

```
model = ( −Y_lunar , +Z_lunar , −X_lunar )
x = −cos φ · sin λ,   y = sin φ,   z = −cos φ · cos λ      (φ lat, λ east-positive lon)
```

So north is +Y, 0°E faces −Z, 90°E faces −X, 180° faces +Z and 90°W faces +X. Markers are placed only through `latLonToModel`. Overlays sit at r × 1.00815 (the mesh's maximum radius) so they are never buried in chord faces.

**Camera conventions.**

- Near and far side: north up; on the near side, east is on the right.
- South pole: viewed from below, offset 2° toward 0°E, which puts **0°E at the top of the screen and 90°E on the right**. This is identical to SELENORA's south‑polar stereographic maps (`+proj=stere +lat_0=-90 +lon_0=0`). It is asserted by projecting points through a real `THREE.PerspectiveCamera` in tests.

## 3. UI features

**`/moon` (new route, "3D Moon" in the sidebar for both modes):**

- **Journey stepper:** Mission Control → Full Moon → South Pole → Site → Local terrain → Mission analysis. It reflects state; Mission analysis goes to `/planner` when A and B are set, otherwise to `/mission`.
- **Globe:**
  - Mouse: drag rotates, wheel zooms.
  - Touch: one‑finger rotate, two‑finger pinch/rotate (`touch-action: none`).
  - Keyboard: the globe host is a focusable `role="application"` with a described key map (arrows rotate, +/− zoom, N/F/S presets).
  - On‑screen controls: Near/Far/South preset buttons, zoom buttons, a lat/lon grid toggle (0° meridian gold, equator cyan) and a toggle for IAU landmark labels. Labels are hidden behind the horizon using a true horizon test.
  - Readout: camera sub‑point and altitude.
  - Texture quality: Standard (4096) or Reduced (2048, resampled in the browser from the same NASA texture).
  - NASA credit link and an "About this globe" tip (≈2.4 km/px, unlit, not a terrain model).
- **Site pins** come from the existing `/api/v1/sites`.
  - Pins keep a constant screen size and are coloured cyan for A, violet for B and gold otherwise.
  - Click or tap a pin, or a list row, to select. The camera **flies** with slerp and arc lift (instant under reduced motion). It then pivots on the site at about 410 km altitude, keeping 0°E up.
  - Deep links: `/moon?site=<id>`.
- **Site card:**
  - Name, lat/lon in DMS‑style and decimal form.
  - **Reference status**: "Approximate research coordinate · Not an official NASA landing region", with the backend's `coordinate_source`.
  - **Data availability**:
    - LOLA 5 m: covered / not covered / checking, from `/terrain/coverage`.
    - JPL Horizons: available for any coordinate.
    - This globe: navigation only, ≈3.3 km/px.
  - Actions: **Set as Site A / Site B** (mission store, same as the Planner), Fly to, **Open local LOLA 3D terrain** (disabled with a reason when not covered), **Open in Lunar Explorer** (`/explorer?site=`) and **Open Mission Planner**.
- **NASA Artemis III regions:** the October 2024 shortlist names from `/artemis/regions`, *listed only*. The note explains that NASA published no digitised boundaries, so nothing is drawn. No polygons are invented.
- **Honest hand‑off:** below about 1.75 lunar radii the globe shows "Limit of the global model: ≈ 3.3 km per pixel…" with a button that opens the existing **real LOLA 5 m `Terrain3DPanel`** inline for the site (screenshot 07). That panel shows no Sun line unless the backend provides one.

**Mission Control (`/`):**

- The stylised SVG Moon is replaced by an attributed poster (NASA‑derived still) with "**Explore the 3D Moon** · Loads a 13.8 MB NASA model on demand".
- Clicking it loads the globe in place, with presets and pins; a pin opens `/moon?site=…`, and "Open the full 3D Moon explorer" opens `/moon`.
- The existing CTA, EN/TR, Explorer/Scientist modes, the 10‑second orientation and navigation are unchanged.

**No WebGL, or GLB not installed:** an accessible static fallback.

- It shows the NASA SVS 4720 flat map with clickable site markers (equirectangular placement, tested) and cardinal longitude ticks.
- The reason is stated ("WebGL unavailable" or "model not installed — `npm run fetch:moon`"), with credit links.
- The model is never requested without WebGL (tested).

**Science guardrails** are shown on the page: the globe is a navigation aid; Sun/Earth visibility comes only from Horizons and terrain blocking only from validated LOLA. Because the globe is unlit, no shadow can be misread.

## 4. Screenshots (`docs/screenshots/phase6a/`)

| # | File | Shows |
|---|---|---|
| 01 | `01-mission-control-poster.jpg` | Mission Control hero: poster, on‑demand button, attribution |
| 02 | `02-mission-control-globe-open.jpg` | Hero after "Explore the 3D Moon" (live NASA globe) |
| 03 | `03-moon-near-side-landmarks.jpg` | `/moon` near side with IAU landmark labels and site list |
| 04 | `04-moon-far-side.jpg` | Far side (Moscoviense, Ingenii) |
| 05 | `05-south-pole-graticule.jpg` | South pole, grid on (0° meridian up), pins |
| 06 | `06-site-close-up-point-a.jpg` | Site close‑up: Shackleton Rim Point A, site card |
| 07 | `07-handoff-local-lola-terrain.jpg` | Hand‑off to the real LOLA 5 m terrain viewer |
| 08 | `08-no-webgl-static-nasa-map.jpg` | No‑WebGL fallback (WebGL disabled in the page) |
| 09 | `09-mobile-375-near-side.jpg` | 375 px, Reduced texture, whole disc visible (aspect‑aware FOV) |
| 10 | `10-mobile-375-tr-site-card.jpg` | 375 px Turkish, Malapert selected as B, site card |

## 5. Performance

- **Lazy everywhere.**
  - three.js core (102 KB gzip, shared with the Phase 5D terrain viewer), the GLTF parser chunk `loadMoon` (14 KB gzip) and `MoonScene` (3.3 KB gzip) load only when a globe is opened.
  - The **GLB is requested only after the user opens a globe**: the button on Mission Control, or navigating to `/moon` (tested: no fetch before the click).
  - Main entry chunk: 130.4 KB gzip. It contains no three.js and no globe scene code; only the lightweight `MoonExplorer` shell (5.7 KB gzip) is shared by `/` and `/moon`.
- **Measured** with User Timing marks `selenora-moon:*`, desktop Chromium, localhost dev server, 1440×900, DPR 1:

  | Step | Time |
  |---|---|
  | GLB fetch (13.8 MB, localhost) | ≈ 0.3 s |
  | GLB parse | ≈ 0.45–0.55 s |
  | First frame (lazy chunk, texture upload) | ≈ 1.4 s |

  - On a real network the download dominates: about 5.5 s at 20 Mbit/s, shown with a real byte progress bar.
  - The raw bytes are cached for the session, so re‑opening or switching quality does not re‑download.
- **Rendering.**
  - `frameloop="demand"`: no frames are drawn while idle. There is no auto‑rotate and no animation loop.
  - DPR is capped at 1.5 for Standard and 1.0 for Reduced. Phones (< 768 px wide or `deviceMemory` ≤ 4) start on Reduced, as do GPUs with `MAX_TEXTURE_SIZE` < 4096.
  - Estimated texture memory: 4096² RGBA with mipmaps ≈ 89 MB; 2048² ≈ 22 MB.
- **GPU cleanup.**
  - On unmount and on quality change, geometry, material and texture are disposed, and ImageBitmaps closed (`LoadedMoon.dispose`).
  - The original GLB material is disposed immediately. R3F disposes the renderer.
- **Reduced motion.** Camera flights become instant jumps and OrbitControls damping is off.
- **Not measured:** no real phone, no Lighthouse run, no device GPU profiling. The 375 px checks used Chromium device emulation (Android UA, 5 touch points). The **"real mobile performance"** requirement is therefore *not* verified on hardware.

## 6. Tests

Final run: `npx tsc -b` clean; `npx vitest run` **14 files, 100/100**; `npm run build` OK; `oxlint` **0 errors**. The warnings are the same style the repo already had, plus three heuristics noted in §7.

**New:**

- `features/moon-globe/orientation.test.ts` (15 tests):
  - cardinal longitudes 0/90E/180/90W; latitude sign and poles;
  - the transform equals the correlation‑derived rotation (det = +1); lat/lon round trip;
  - great‑circle distance (Point A ↔ Point B ≈ 10 km);
  - camera presets projected through a real `PerspectiveCamera`: near side north‑up and east‑right; far side; south pole with 0°E up and 90°E right;
  - site close‑ups centred, at the right altitude, with polar orientation, and showing Point B from Point A;
  - slerp; graticule;
  - landmark fixture rules, including "a mirrored globe fails".
- `features/moon-globe/moonGlobe.test.tsx` (9 tests):
  - no‑WebGL fallback: NASA image src and credit link, equirectangular pin placement, GLB never fetched;
  - site selection → URL, card, approximate‑status and not‑NASA badges, Set as Site B → store, Explorer link, **Planner navigation**;
  - LOLA coverage badge from the backend;
  - **Turkish** rendering;
  - hero: poster and attribution, **no download until clicked**, then fetch of the exact asset URL;
  - **loading progress** (byte‑accurate `aria-valuenow`);
  - **missing asset** (SPA HTML / 404) → static fallback with `npm run fetch:moon`;
  - **network error** → Retry re‑fetches;
  - **keyboard** map and accessible controls; NASA credit link.

Existing tests: all 76 Phase 5F tests are unchanged and pass.

**Browser (manual, in‑app Chromium):**

- Screenshots 01–10.
- A pin click via the WebGL raycast selected *Nobile* (URL → `?site=nobile`).
- Deep link `/moon?site=…` flies to the site.
- No horizontal overflow at 375 px (`scrollWidth = 375`).
- The console is clear of the drei `Html` "synchronous unmount" errors after the fix in §7.
- **Gestures:** real touch drag and pinch were not exercised. Emulated clicks arrive as mouse events; OrbitControls is configured with `ONE: ROTATE, TWO: DOLLY_ROTATE`.

## 7. Issues found and fixed during verification

- The south‑pole camera initially sat about 60 km off the site. The camera now **pivots on the site** (OrbitControls target), and close‑up distance limits are set imperatively so prop diffs never override a flight.
- Pins were sized in kilometres and became huge in close‑ups. They are now constant screen size, with one extra frame after a flight so the scale sees the final camera.
- The grid did not redraw under `frameloop="demand"` → added `InvalidateOn`. The grid was also buried below chord faces → overlays moved to the mesh's maximum radius.
- drei `Html` labels were mounted and unmounted mid‑render (console errors) → they are now always mounted and hidden with CSS. Visibility uses a horizon test (p̂·c > 1) instead of a fixed dot threshold.
- Portrait phones clipped the disc → added an aspect‑aware vertical FOV (at least 40° across the narrow side).
- The hero caption overlapped the poster → moved below it.
- Remaining lint heuristics, judged non‑blocking:
  - `react(refs)` on the journey array: closures that read refs only when clicked.
  - `set-state-in-effect`: the phase reset when the quality changes.
  - `react(immutability)`: setting `camera.fov`, which is how three.js cameras work.

## 8. Remaining limitations

- **Resolution:** the global model is about 2.4 km/px (3.3 km/px near the pole). Shackleton (21 km) and all research sites (several are within about 10 km of each other) cannot be resolved. The UI says so and hands off to LOLA 5 m.
- **No illumination on the globe** (deliberate). Sun and Earth geometry live only in the Horizons‑driven Simulator and analyses.
- **Polar texture quality:** NASA notes pinched poles for its grid/topo variants. `moon_small` looks smooth but soft at the pole. Orientation there was validated only to texture resolution (Shoemaker ring).
- **Artemis III regions** have no official digitised geometry, so they are listed and never plotted.
- **Self‑hosting:** the GLB must be installed (`npm run fetch:moon`). Without it the app shows the attributed static map. Production builds copy `public/nasa/**` into `dist/`.
- **Not verified:** real mobile hardware, real touch gestures, the OS reduced‑motion preference in the browser (code path and tests only), Lighthouse, and human usability testing (none performed).
- **Browser‑pane note:** during verification the pane was often backgrounded (`document.hidden`), which throttles `requestAnimationFrame`. Some timings and mid‑flight screenshots reflect that, not normal foreground behaviour.

## 9. Integration instructions

1. Check out the branch: `git switch feature/phase6a-interactive-moon` (or merge it into an integration branch; **not** into `main` from this phase).
2. Install the NASA model once per checkout:
   ```bash
   cd frontend && npm ci && npm run fetch:moon
   ```
   This writes `public/nasa/svs-14959/moon_small.glb` (13.8 MB) and verifies the SHA‑256. It is resumable and gitignored.
3. Run as usual (`SELENORA_BACKEND_URL`, `SELENORA_WEB_PORT`). Phase 6A was verified with an isolated API on **:8040** (a copy of the 5F DB) and Vite on **:5184**.
4. **Backend:** no changes and no new endpoints. It uses `/api/v1/sites`, `/api/v1/terrain/coverage`, `/api/v1/artemis/regions` (capability‑gated) and, through the existing panel, `/api/v1/maps/mesh`.
5. **Conflict surface:**
   - Small edits: `OverviewPage.tsx` (hero swap), `navItems.ts` (+ `/moon`), `router.tsx`, `en.ts`/`tr.ts` (spread of `phase6a.*` and `nav.moon`), `package.json` (`fetch:moon` script), `.gitignore`.
   - Everything else is new under `features/moon-globe/`, `pages/MoonPage.tsx`, `public/nasa/`, `scripts/` and `docs/`.
   - **No Lunar Explorer map, LROC imagery or backend files were edited** (Codex's area).
6. `features/dashboard/MoonIllustration.tsx` is now unused. It was kept to minimise the diff and can be removed in integration.
7. To reproduce the orientation evidence:
   ```bash
   python -I scripts/moon-validation/orient.py public/nasa/svs-14959/moon_small.glb <lroc_color_poles_1k.jpg>
   ```
   The map is under `public/nasa/svs-4720/`. Also available: `tilt.py`, `landmarks.py` (with `landmarks.json`), `polar.py`, `texel.py` and `poster.py`.
