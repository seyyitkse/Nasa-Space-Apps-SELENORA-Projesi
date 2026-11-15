## Coordinate frames (M5)

This document distinguishes the **scientific** lunar body frame used for analysis from the **rendering** frames used by the NASA GLB models and Three.js.

### Glossary

- **MOON_ME body frame (scientific)**: right-handed Moon body-fixed frame consistent with SELENORA’s science conventions and JPL/Horizons site coordinates.
  - **Longitude**: east-positive, degrees, stored/transported in \((-180, 180]\).
  - **Latitude**: planetocentric, degrees, \([-90, 90]\).
  - **Unit vector** for \((\phi=\text{lat}, \lambda=\text{lon})\):
    \[
    \hat{r}_{moon} =
    \begin{bmatrix}
      \cos\phi\cos\lambda\\
      \cos\phi\sin\lambda\\
      \sin\phi
    \end{bmatrix}
    \]

- **NASA GLB model frame (asset-native)**: the axis system inside each GLB file. It is **not assumed** to match MOON_ME. SELENORA stores a measured per-asset rotation in `frontend/src/features/moon-globe/asset.ts` as `canonicalFromModel`.

- **SELENORA canonical globe frame (rendering)**: the frame used by the app for all globe math, pins, picks, and camera presets:
  - **+Y** = lunar north
  - **−Z** faces **0°E**
  - **−X** faces **90°E**
  - This is the output frame of `latLonToModel()` in `frontend/src/features/moon-globe/orientation.ts`.

- **Three.js world frame (rendering)**: in `MoonScene`, the Moon mesh is placed at the origin with a fixed matrix that maps each asset’s model frame into the **canonical** frame, so **world coordinates are canonical coordinates** for all interactions.

### Transform chain used in the app

- **Render**: `(model frame) --canonicalFromModel--> (canonical/world frame)`
  - Implemented in `frontend/src/features/moon-globe/loadMoon.ts` via `mesh.matrix = canonicalFromModel * scale`.

- **Raycast pick**: `(world intersection point) -> (lat/lon)`
  - `MoonScene` receives `e.point` in **world** coordinates from the raycaster.
  - `worldPointToLatLon()` converts the **direction** of that point (radius-independent) into lat/lon using `modelToLatLon()` from `orientation.ts`.
  - Because **world == canonical**, no extra transform is required for picking.

### Numerical test vectors (round-trips)

These are covered by Vitest in:

- `frontend/src/features/moon-globe/orientation.test.ts` (lat/lon ↔ canonical round-trips; equator + cardinal longitudes; southern hemisphere; near-pole)
- `frontend/src/features/moon-globe/pickHelpers.test.ts` (raycast pick is radius-independent ⇒ Standard/High mesh swaps do not change saved coordinates)

Suggested vectors (lat, lon):

- Equator/cardinals: `(0, 0)`, `(0, 90)`, `(0, 180)`, `(0, -90)`
- Southern hemisphere: `(-43.3, -11.4)`, `(-85.2, 53.5)`
- Near south pole: `(-89.68, -166.0)`, `(-89.9, 0)`

