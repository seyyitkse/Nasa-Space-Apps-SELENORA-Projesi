"""Polar registration check of the SVS 14959 topo GLB (equirectangular UV sphere).
Compares, south of a latitude limit, (a) vertex relief vs LOLA ldem at the vertex's GEOMETRIC
position and at its UV-implied position, and (b) the texture under the original UVs vs UVs
recomputed from geometry, against the validated moon_small polar texture.
usage: python -I polar_registration.py <topo.glb> <ldem_4.tif> [lat_limit=-80]"""
import io, json, struct, sys
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
f, ldem = sys.argv[1], sys.argv[2]; lim = float(sys.argv[3]) if len(sys.argv) > 3 else -80
b = open(f, 'rb').read(); jl = struct.unpack_from('<I', b, 12)[0]; J = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
def acc(i, n, dt):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(b, dtype=dt, count=a['count'] * n, offset=bin0 + bv.get('byteOffset', 0)).reshape(-1, n)
P = acc(0, 3, np.float32).astype(float); UV = acc(2, 2, np.float32).astype(float)
r = np.linalg.norm(P, axis=1); d = P / r[:, None]
glat = np.degrees(np.arcsin(d[:, 1]))
# exact UV longitude convention of this mesh: u*360 = atan2(z, -x); lunar lon = u*360 - 180 (texture centred on 0E)
glon = ((np.degrees(np.arctan2(d[:, 2], -d[:, 0])) % 360) - 180)
ulat = 90 - UV[:, 1] * 180; ulon = UV[:, 0] * 360 - 180
E = np.asarray(Image.open(ldem), float); EH, EW = E.shape
def h(lat, lon): return E[np.clip(((90 - lat) / 180 * EH).astype(int), 0, EH - 1), np.clip((((lon + 180) % 360) / 360 * EW).astype(int), 0, EW - 1)]
for name, m in [('mid |lat|<60', np.abs(glat) < 60), (f'south of {lim}', glat < lim), ('south of -85', glat < -85)]:
    cg = np.corrcoef(r[m], h(glat[m], glon[m]))[0, 1]; cu = np.corrcoef(r[m], h(ulat[m], ulon[m]))[0, 1]
    off = np.abs(ulat[m] - glat[m]) * 1737.4 * np.pi / 180
    print(f'{name:>14}: n={m.sum():7d}  relief~LOLA corr @geometric {cg:.3f} | @UV-implied {cu:.3f} ; UV-vs-geometry latitude offset median {np.median(off):.1f} km, max {off.max():.1f} km')
