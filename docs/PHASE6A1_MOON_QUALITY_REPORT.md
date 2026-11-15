# SELENORA — Phase 6A.1: NASA 3D Moon Quality Upgrade

| | |
|---|---|
| Branch | `feature/phase6a1-moon-quality` (worktree `.worktrees/phase6a1`) |
| Base | `409a062` (Phase 6A) |
| Scope | Frontend only: `frontend/src/features/moon-globe/*`, `pages/MoonPage.tsx`, the i18n files for the 3D Moon, `scripts/`, `docs/`, and `.gitignore`. Codex's LROC/2D map work, Cursor's Phase 6B branch and the backend are untouched. The globe only *imports* the existing `xyToLonLat` helper. |
| Status | Committed on the branch. Not merged and not pushed. |

## 1. Summary

| | Result |
|---|---|
| **Which NASA asset is sharper?** | Only `Moon_NASA_LRO_8k_Topo_Small.glb` (8192×4096 texture). `moon.glb` (53.9 MB) carries **the byte‑identical 4096 px texture** of `moon_small.glb` (same SHA‑256). It adds a smoother silhouette, not detail. |
| **Published topo model is misregistered at the poles** | Its polar vertices sit up to **46 km** from their own texture and relief coordinates. South of 85°S, relief vs LOLA correlates **0.28** at the published vertex positions and **0.95** at the UV‑implied positions. SELENORA re‑registers the vertices and samples the texture per pixel. After the fix the correlation is **0.973** and the mesh is crack‑free. |
| **New quality tiers** | **Reduced** (`moon_small`, 2048 px) · **Standard** (`moon_small`, 4096 px), the default on desktop · **High** (topo model, 8192 px, LOLA relief at true scale or NASA's ×2.89), progressive and desktop‑only. |
| **Measured gain** | At the Point A close‑up (≈ 410 km altitude), rendered sharpness (Laplacian variance) is **12 → 899** (≈ 75×; ≈ 38× after normalising for contrast). In an identical texture‑only polar view it is **488 → 2296** (4.7×). Whole‑disc views are limited by screen resolution and show no meaningful gain (§5). |
| **Cost** | Download 13.8 → **81.5 MB** (on demand only). GPU about 91 → **256 MB**. 1.02 M triangles. **198–216 FPS** desktop (RTX 5060 Laptop, 716×638, DPR 1), versus about 240 FPS for Standard. |
| **Orientation and markers** | The Phase 6A canonical frame is unchanged. Each asset has its own measured `canonicalFromModel`, and pins and overlays are placed through `latLonToModel` as before. |
| **South‑pole hand‑off** | Globe → real LOLA 5 m terrain now includes a resolution ladder (3.3 km / 1.3 km / 5 m) and **real LOLA tile footprints** drawn on the globe. |

## 2. NASA assets evaluated (SVS 14959, <https://svs.gsfc.nasa.gov/14959/>)

All numbers come from `frontend/scripts/moon-validation/analyze_glb.py`; results are in `scripts/moon-validation/results/*.json`.

| | `moon_small.glb` | `moon.glb` | `Moon_NASA_LRO_8k_Topo_Small.glb` |
|---|---|---|---|
| Size / SHA‑256 | 13,799,876 B · `12d3b0bb…` | 53,884,300 B · `f026a938…` | 81,505,784 B · `c4b65fb4…` |
| Mesh | cube‑sphere, 46,464 v / 23,232 tri | cube‑sphere, 745,889 v / 1,486,848 tri | **UV sphere**, 2,021,340 v / 1,015,808 tri |
| Texture | 4096² PNG cube atlas, 12.17 MB | **identical bytes** (SHA‑256 `c42f8bdb…`) | **8192×4096 equirectangular JPEG**, 4.63 MB |
| Ground resolution (km/texel, median) | 2.43 global · 3.33 south of 80°S | 2.43 · 3.32 (same) | 1.24 global · 1.33 N–S everywhere (finer E–W toward poles) |
| Relief | none (vertex radii vary 0.8 % from cube chords) | none (corr. with LOLA 0.015) | **LOLA‑derived**: r = 0.98359 + 0.001637·h_km. Corr. with LOLA `ldem_4` 0.836; **NASA exaggeration ×2.89** |
| Axes → canonical (north +Y, 0°E −Z, 90°E −X) | identity (r = 0.919, mirrored 0.454) | identity (r = 0.926, mirrored 0.456) | **+90° about +Y**, exact from the UVs (u·360° = atan2(z, −x), residual **0.002°**). Correlation r = 0.900, best offset **0.0°**, mirrored 0.543. No residual tilt within ±0.3° at 0.1° steps. |
| Node transform | none | none | none |
| Decision | Standard / Reduced | **not offered**: 4× download for no sharper imagery | **High** (re‑registered) |

The relief exaggeration came from regressing vertex radius on NASA SVS 4720 `ldem_4.tif` (LOLA, km). The reference map for orientation is SVS 4720 `lroc_color_poles_1k.jpg`, the same one used in Phase 6A.

## 3. The topo model's polar registration problem and fix

**Finding (`polar_registration.py`).** The texture and the displacement of the published topo model are both registered through the UVs, but near the poles the vertex **positions** do not match their UVs:

| Region | UV vs geometric latitude offset | Relief~LOLA corr. at geometric position | at UV‑implied position |
|---|---|---|---|
| \|lat\| < 60° | median 4.9 km | 0.926 | 0.936 |
| south of 80°S | median 15.5 km, max 46.5 km | 0.761 | 0.984 |
| south of 85°S | median 31.3 km, max 46.5 km | **0.276** | **0.952** |

As published, the polar cap renders as a radial smear (screenshot `03a`). Every SELENORA site is south of 85°S, so the topo model cannot be used unmodified.

**Fix**, in the browser at load time (`loadMoon.ts: reregisterPositions`, `applyEquirectLookup`):

1. **Vertices are moved to their UV‑implied lat/lon, keeping each vertex's radius** (its LOLA height).
2. **Coincident copies stay welded.** The file stores about 4 copies per position; 1,984 polar groups carry different UVs. Rebuilt independently, they tore the mesh by up to 17 km: black radial cracks, screenshot `03b`. Copies are therefore grouped by original position and moved together to the normalised mean of their UV directions (max adjustment 8.5 km, for 0.1 % of vertices).
3. **The texture is sampled per pixel from the surface direction** in the shader: u = atan2(z, −x)/2π, v = ½ − lat/π. Two wrapped longitude candidates prevent a seam line. Linear UV interpolation across long polar fan triangles bent longitudes, which caused ring artefacts.
4. **Optional true‑scale relief**: r′ = r₀ + (r − r₀)/2.89, which is the default. "NASA ×2.89 (exaggerated)" is one click away and labelled.

**Verification after the fix** (`topo_corrected.py`):

- Relief vs LOLA at the final geometric positions is **0.986 south of 80°S** and **0.973 south of 85°S**.
- 100 % of triangles face outward; none are degenerate.
- The best longitude offset is 0.0°.
- In the polar render (`01b`), the Point A/B and Shackleton pins sit on Shackleton's rim and centre, and de Gerlache's pin sits inside de Gerlache crater.

**Caveat (NASA texture content).** Permanently shadowed crater floors near the pole contain **radial fill streaks in NASA's colour map itself** (visible in `01b` and in the browser). They are not SELENORA artefacts, and the UI never uses texture brightness for science.

## 4. Implementation

| Area | Change |
|---|---|
| Asset registry (`asset.ts`) | `MOON_MODELS` holds the measured facts for each asset (size, SHA, texture, km/texel, `canonicalFromModel`, scale, registration mode, relief r₀ / per‑km / exaggeration / LOLA corr.). `HIGH_MODEL_ID = 'topo'`. |
| Progressive loading (`MoonExplorer.tsx`) | The lightweight globe always renders first. **High** downloads the topo model in the background with a byte progress chip while the globe stays interactive, then swaps it in. The old model is disposed after commit. If the file is missing, it falls back to Standard and shows `npm run fetch:moon -- --high`. Raw buffers are cached per model. |
| Tiers | Reduced (2048 px, DPR 1) · Standard (4096 px, DPR ≤ 1.5) · High (8192 px, DPR ≤ 2). High is **disabled on phones** (< 768 px or `deviceMemory` ≤ 4) and on GPUs with `MAX_TEXTURE_SIZE` < 8192. Phones still start on Reduced. |
| Filtering | Anisotropy is set to the GPU maximum (16 here, previously fixed at 4), with trilinear mipmaps and MSAA. |
| Material and lighting | Photographic tiers stay **unlit**. Only the topographic model uses Lambert shading with a **display light attached to the camera** (no shadows). It is labelled "not the Sun", so nothing on the globe implies illumination science. |
| Markers and overlays | Pins sit on the rendered surface (`surfaceRadiusAt`, cached per model and site). The grid, landmarks and LOLA footprints sit above the model's maximum radius. The canonical transform, presets and site poses are unchanged from 6A. |
| Hand‑off | **Cyan LOLA 5 m tile footprints** are drawn on the globe from `/terrain/catalog` (inverse polar stereographic). The local terrain section now opens with a **resolution ladder**: Standard 3.3 km · High 1.3 km · LOLA 5 m (≈ 260× finer than High; A–B is only ≈ 9 km, about 7 High pixels). |
| Performance bug fixed | Pin radii were recomputed (a full scan of 2 M vertices × 9 sites) on every camera‑driven re‑render, which dropped High to 4–10 FPS. They are now memoised: **198–216 FPS**. |
| Installer | `npm run fetch:moon [-- --high]`: parallel HTTP range requests (NASA serves about 0.1–0.7 MB/s per connection), resumable, SHA‑256 verified. The GLBs and partial files are gitignored. |
| Measurement hooks | `?bench` exposes `window.__selenoraMoonBench(ms)` (FPS, triangles, texture and geometry MB, GPU caps). `?bench&highModel=hd` loads `moon.glb` for comparison; `?bench&unlit` / `&noRebuild` were used for diagnosis. They are inert without `?bench`. |

## 5. Identical‑view comparison (browser, measured)

Setup:

- Chromium in the app's browser pane on an NVIDIA RTX 5060 Laptop GPU (ANGLE D3D11), `MAX_TEXTURE_SIZE` 16384, max anisotropy 16.
- Viewport 1400×1000, globe canvas 716×638, DPR 1.
- Views come from the app's own deterministic presets: Near side (3.2 R), South pole (3.0 R), **Point A close‑up** (site pose, 411 km), **Point A zoom** (253 km). Landmarks and grid were off.
- Sharpness is the Laplacian variance of the canvas pixels in the central 319×319 px. "/c" is that value divided by the luminance variance, which normalises lighting contrast.

| Tier / asset | Near | South pole | **Point A (411 km)** | **Point A (253 km)** | FPS (orbiting) | Triangles | Texture GPU | Geometry |
|---|---|---|---|---|---|---|---|---|
| Reduced · moon_small @2048 | 229 (0.13) | 241 (0.41) | 5 (0.012) | 6 (0.017) | 241 | 23 k | 22.4 MB | 1.6 MB |
| Standard · moon_small @4096 | 508 (0.29) | 989 (1.56) | 12 (0.020) | 8 (0.013) | 240 | 23 k | 89.5 MB | 1.6 MB |
| moon.glb (measurement only) | 507 (0.29) | 986 (1.56) | 11 (0.019) | 8 (0.014) | 209 | 1.49 M | 89.5 MB | 41.7 MB |
| **High · topo, true relief** | 244 (0.28) | 708 (0.82) | **899 (0.76)** | **633 (0.50)** | **198–216** | 1.02 M | 179 MB | 76.9 MB |
| High · topo, NASA ×2.89 | 267 (0.31) | 1064 (1.16) | 1235 (0.98) | 862 (0.65) | 203 | 1.02 M | 179 MB | 76.9 MB |

Interpretation:

- **At regional zoom the High globe is dramatically sharper** (≈ 38× after normalising for contrast). That is where users inspect the south pole.
- **Whole‑disc views gain nothing.** Both textures are finer than the screen (one screen pixel ≈ 6 km at the near‑side preset). Standard's higher South‑pole score comes from its unlit contrast and minification aliasing, not detail.
- **`moon.glb` measures the same as Standard** in every view, which confirms that the larger file does not mean a sharper texture.
- FPS of about 240 is the display cap. All tiers render well above 60 FPS on this GPU.

**Texture‑only check (offline, `topo_corrected.py`, ±160 km south‑polar stereographic, same 480² grid):** Laplacian variance **488 (moon_small) vs 2296 (topo, re‑registered)**, i.e. 4.7×. See `01a` and `01b`.

**Load time (localhost dev server; network transfer excluded):**

| | Fetch | Parse (+ re‑registration) | First frame |
|---|---|---|---|
| Standard | 0.08 s | 0.31 s | about 0.9 s after parse (lazy chunk and texture upload) |
| High (topo) | 0.19–0.36 s | 0.59–0.75 s | swap is immediate; Standard stays visible throughout |

- `moon.glb`: fetch 0.36 s, parse 0.31 s.
- On a real network the download dominates: 81.5 MB is about 33 s at 20 Mbit/s and about 6.5 s at 100 Mbit/s. This is why High is opt‑in and progressive.
- JS heap after High loaded: about 417 MB (Chromium `performance.memory`). This includes the cached raw GLB buffers (13.8 + 81.5 MB), which are kept so the relief toggle does not re‑download.

**Mobile viewport (375×812, Chromium emulation):**

- Starts on **Reduced** (2048 px, DPR 1, 22 MB texture).
- **High is disabled** with "desktop GPU needed".
- 240 FPS on this laptop GPU, with no horizontal overflow (screenshot `06`).
- **This is emulation on desktop hardware, not a real phone.** Real mobile FPS and memory were not measured.

## 6. Screenshots (`docs/screenshots/phase6a1/`)

| File | Shows |
|---|---|
| `01a-offline-polar-standard.png` | moon_small texture, south pole ±160 km, research sites (red) |
| `01b-offline-polar-topo-reregistered.png` | Topo texture, same view: Shackleton and de Gerlache resolved, pins on the right craters |
| `03a-topo-as-published-pole-smear.jpg` | Browser: topo model **as published**, polar smear (`?bench&unlit&noRebuild`) |
| `03b-topo-uv-rebuild-cracks-before-fix.jpg` | Browser: first re‑registration attempt, cracks from un‑welded copies (fixed) |
| `04a-standard-point-a-zoom.jpg` | Standard at Point A (253 km): 3.3 km texels |
| `04b-high-true-relief-point-a.jpg` | High, true‑scale relief, Point A |
| `04c-high-nasa-x2.9-point-a-zoom.jpg` | High, NASA ×2.89 relief, Point A zoom |
| `05-handoff-resolution-ladder-lola.jpg` | Resolution ladder and the real LOLA 5 m terrain viewer |
| `06-mobile-375-reduced-high-disabled.jpg` | 375 px: Reduced by default, High disabled with reason |

The browser pane was narrow (562 px) during capture, so the screenshots are downscaled. The quantitative comparison uses native canvas pixels (§5). The cyan squares in `04a` are the LOLA tile footprints.

## 7. Tests

`npx tsc -b` is clean. `npx vitest run`: **16 files, 110/110**. `npm run build` OK. `oxlint`: 0 errors.

The remaining warnings are heuristics already accepted in 6A:

- the journey‑array refs;
- the `set-state-in-effect` phase reset;
- `camera.fov` mutation.

**New:**

- `moonQuality.test.ts` (7):
  - High = topo, and `moon.glb` has the same texture as moon_small;
  - every model maps to canonical with det = +1 and an equal mean radius;
  - relief is LOLA‑derived with exaggeration recorded;
  - re‑registration places pinched vertices at their UV lat/lon, matching `latLonToModel`, including Point A at −89.68°;
  - coincident polar copies stay welded and seams stay closed;
  - true‑scale relief formula;
  - small model untouched.
- `moonProgressive.test.tsx` (3), with the parser and renderer mocked:
  - Standard shows first, then High swaps in the topo model, with the relief radio and the "not the Sun" disclosure;
  - a missing High asset keeps Standard and shows `npm run fetch:moon -- --high`;
  - High is disabled at 4096 px GPUs and at phone width, and phones start on Reduced.

The 6A orientation, landmark and UI tests are unchanged and pass.

## 8. Limitations

- **Real phones were not tested.** The mobile result above is Chromium emulation on a desktop GPU. FPS, memory and thermal behaviour on actual devices are unmeasured.
- **The topo model still has NASA's polar fill streaks** in permanently shadowed floors, and its UV sphere has dense, long fan triangles very close to the pole. Detail there is limited to roughly 1–2 km.
- **The re‑registration modifies NASA's vertex placement, not its data.** The radii (LOLA heights) and the texture are NASA's; only positions are moved to the coordinates that NASA's own UVs assign. Up to 8.5 km of residual adjustment remains for 0.1 % of polar vertices.
- **Global ≠ local.** Even High is about 1.3 km per pixel. Metre‑scale inspection always hands off to LOLA 5 m, and the UI states this.
- **High is heavy.** It needs an 81.5 MB download, about 256 MB of GPU memory and about 95 MB of retained JS buffers. That is fine on the tested desktop, but it is why High is opt‑in and disabled on phones.
- The FPS figures are on one laptop GPU. FPS of about 240 is the display cap, not the limit.

## 9. Integration

1. Install the models:
   ```bash
   cd frontend && npm ci && npm run fetch:moon -- --high
   ```
   Omit `--high` to keep only the 13.8 MB default; High then shows the install hint.
2. No backend changes. The globe additionally reads `/api/v1/terrain/catalog`, which is capability‑gated, for the footprints.
3. Verified with an isolated API on **:8050** (a copy of the 6A DB) and Vite on **:5186**.
4. To reproduce:
   ```bash
   python -I scripts/moon-validation/analyze_glb.py <glb> <lroc_color_poles_1k.jpg> <ldem_4.tif>
   ```
   Also `refine_rotation.py`, `polar_registration.py` and `topo_corrected.py`. The NASA SVS 4720 `ldem_4.tif` is downloaded separately (4 MB).
