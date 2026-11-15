"""Data-driven orientation check of NASA SVS 14959 moon_small.glb.
For each mesh vertex: luminance of the GLB's own texture at its UV, versus luminance of the
NASA CGI Moon Kit equirectangular map (SVS 4720, centred on 0 deg lon) at the lat/lon implied by
a candidate axis mapping. The correct mapping maximises the correlation."""
import io, json, struct, sys, itertools
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
glb, ref = sys.argv[1], sys.argv[2]
b = open(glb, 'rb').read()
jl = struct.unpack_from('<I', b, 12)[0]
J = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
def acc(i, n):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    o = bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(b, dtype=np.float32, count=a['count'] * n, offset=o).reshape(-1, n)
P = acc(0, 3).astype(np.float64); UV = acc(2, 2).astype(np.float64)
bv = J['bufferViews'][J['images'][0]['bufferView']]
tex = Image.open(io.BytesIO(b[bin0 + bv['byteOffset']: bin0 + bv['byteOffset'] + bv['byteLength']]))
print('texture', tex.size, tex.mode)
T = np.asarray(tex.convert('L'), dtype=np.float64); H, W = T.shape
R = np.asarray(Image.open(ref).convert('L'), dtype=np.float64); RH, RW = R.shape
print('reference', RW, RH)
tu = np.clip((UV[:, 0] * W).astype(int), 0, W - 1); tv = np.clip((UV[:, 1] * H).astype(int), 0, H - 1)
a = T[tv, tu]
d = P / np.linalg.norm(P, axis=1, keepdims=True)
def ref_at(lat, lon):
    col = ((lon + 180) % 360) / 360 * RW; row = (90 - lat) / 180 * RH
    return R[np.clip(row.astype(int), 0, RH - 1), np.clip(col.astype(int), 0, RW - 1)]
res = []
for perm in itertools.permutations(range(3)):
    for signs in itertools.product([1, -1], repeat=3):
        M = np.zeros((3, 3))
        for k in range(3): M[k, perm[k]] = signs[k]   # lunar = M @ model
        L = d @ M.T
        lat = np.degrees(np.arcsin(np.clip(L[:, 2], -1, 1))); lon = np.degrees(np.arctan2(L[:, 1], L[:, 0]))
        best = max(((np.corrcoef(a, ref_at(lat, lon + off))[0, 1], off) for off in range(-180, 180, 2)))
        res.append((best[0], best[1], perm, signs, round(np.linalg.det(M))))
res.sort(reverse=True)
for r in res[:6]: print('corr %.4f lonOffset %4d perm %s signs %s det %d' % r)
c, off, perm, signs, det = res[0]
M = np.zeros((3, 3))
for k in range(3): M[k, perm[k]] = signs[k]
L = d @ M.T; lat = np.degrees(np.arcsin(np.clip(L[:, 2], -1, 1))); lon = np.degrees(np.arctan2(L[:, 1], L[:, 0]))
fine = max(((np.corrcoef(a, ref_at(lat, lon + o / 10))[0, 1], o / 10) for o in range(int(off * 10) - 30, int(off * 10) + 31)))
print('fine offset', fine)
json.dump({'M_lunar_from_model': M.tolist(), 'lon_offset_deg': fine[1], 'corr': fine[0], 'top': [[float(r[0]), r[1], list(r[2]), list(r[3]), r[4]] for r in res[:6]]}, open('orient_result.json', 'w'), indent=1)
