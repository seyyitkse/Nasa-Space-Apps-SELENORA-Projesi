# SVS #14959 `moon_small.glb` inspection notes

**Inspected:** 2026-11-14  
**URL:** https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/moon_small.glb  
**Bytes:** 13 799 876  
**Generator:** Khronos glTF Blender I/O v5.0.21  

Local download lives under `data/raw/svs14959/` (gitignored). Re-download from the SVS URL above to reproduce.

## Structure

- glTF 2.0; JSON + BIN chunks
- Scene nodes: mesh `"Cube"` (identity TRS) + empty `"Looks"`
- 46 464 POSITION vertices; AABB ≈ ±1.27186 on each axis

## Axis inference (from POSITION extrema)

| Extreme | Approx lon/lat | MOON_ME meaning |
|---------|----------------|-----------------|
| +Z | lat +90° | North pole |
| −Z | lat −90° | South pole |
| +X | lon 0°, lat 0° | Mean Earth / prime meridian |
| +Y | lon +90° E, lat 0° | Completes right-handed frame |

**Verdict:** geometry axes match scientific MOON_ME. Node transform is identity.

## UV caveats

Equator samples at lon 0° / ±90° show `u ≈ (lon+180)/360` but `v ≈ 0.375` (not 0.5). Poles are pinched (documented by SVS). Do not place markers from UV; use ME Cartesian on the mesh root.

## Claude action

Scale/normalize marker vectors to the loaded mesh radius; couple any engine Y-up import rotation to both mesh and markers. Prefer visual check with Point A/B near −Z.
