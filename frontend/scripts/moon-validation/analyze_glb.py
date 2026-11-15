"""Per-asset verification for NASA SVS 14959 GLBs (Phase 6A.1).

usage: python -I analyze_glb.py <model.glb> <lroc_color_poles_1k.jpg> [ldem_4.tif]

1. structure: vertices, triangles, texture size/format, radius range
2. orientation: luminance of the GLB's own texture at each vertex UV vs. the NASA SVS 4720
   equirectangular LRO map at the lat/lon implied by each of 48 signed axis permutations
   x 180 longitude offsets (then 0.1 deg refinement). Output: rotation canonical<-model,
   where canonical = Phase 6A frame (north +Y, 0E -Z, 90E -X).
3. ground resolution: km per texel from triangle edges (global / south of 80S).
4. relief (if ldem given): regress vertex radius on LOLA elevation (SVS 4720 ldem_4, km)
   -> mean radius and vertical exaggeration factor.
"""
import io, json, struct, sys, itertools
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

glb, ref = sys.argv[1], sys.argv[2]
ldem = sys.argv[3] if len(sys.argv) > 3 else None
b = open(glb, 'rb').read(); jl = struct.unpack_from('<I', b, 12)[0]
J = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
DT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}
def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    n = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
    return np.frombuffer(b, dtype=DT[a['componentType']], count=a['count'] * n, offset=bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(-1, n)
prim = J['meshes'][0]['primitives'][0]
P = acc(prim['attributes']['POSITION']).astype(float)
UV = acc(prim['attributes']['TEXCOORD_0']).astype(float)
I = acc(prim['indices']).astype(np.int64).reshape(-1, 3)
img = J['images'][0]; bv = J['bufferViews'][img['bufferView']]
raw = b[bin0 + bv['byteOffset']: bin0 + bv['byteOffset'] + bv['byteLength']]
tex = Image.open(io.BytesIO(raw)); W, H = tex.size
node = next(n for n in J['nodes'] if 'mesh' in n)
out = {'file': glb.replace(chr(92), '/').split('/')[-1], 'bytes': len(b), 'vertices': len(P), 'triangles': len(I),
       'texture': {'w': W, 'h': H, 'mime': img['mimeType'], 'bytes': len(raw)}, 'node_transform': {k: node[k] for k in ('matrix', 'rotation', 'scale', 'translation') if k in node},
       'uv_range': [float(UV[:, 0].min()), float(UV[:, 0].max()), float(UV[:, 1].min()), float(UV[:, 1].max())]}
r = np.linalg.norm(P, axis=1); out['radius'] = [float(r.min()), float(np.median(r)), float(r.max())]
print(json.dumps(out, indent=1))

T = np.asarray(tex.convert('L').reduce(4) if W > 4096 else tex.convert('L'), dtype=np.float64); TH, TW = T.shape
R = np.asarray(Image.open(ref).convert('L'), dtype=np.float64); RH, RW = R.shape
rng = np.random.default_rng(0); sel = rng.choice(len(P), size=min(len(P), 60000), replace=False)
a = T[np.clip((UV[sel, 1] * TH).astype(int), 0, TH - 1), np.clip((UV[sel, 0] * TW).astype(int), 0, TW - 1)]
d = P[sel] / r[sel, None]
def ref_at(lat, lon):
    return R[np.clip(((90 - lat) / 180 * RH).astype(int), 0, RH - 1), np.clip((((lon + 180) % 360) / 360 * RW).astype(int), 0, RW - 1)]
res = []
for perm in itertools.permutations(range(3)):
    for signs in itertools.product([1, -1], repeat=3):
        M = np.zeros((3, 3))
        for k in range(3): M[k, perm[k]] = signs[k]
        L = d @ M.T; lat = np.degrees(np.arcsin(np.clip(L[:, 2], -1, 1))); lon = np.degrees(np.arctan2(L[:, 1], L[:, 0]))
        best = max((np.corrcoef(a, ref_at(lat, lon + o))[0, 1], o) for o in range(-180, 180, 2))
        res.append((float(best[0]), best[1], M, round(float(np.linalg.det(M)))))
res.sort(key=lambda x: -x[0])
c, off, M, det = res[0]
L = d @ M.T; lat = np.degrees(np.arcsin(np.clip(L[:, 2], -1, 1))); lon = np.degrees(np.arctan2(L[:, 1], L[:, 0]))
fine = max((np.corrcoef(a, ref_at(lat, lon + o / 10))[0, 1], o / 10) for o in range(int(off * 10) - 30, int(off * 10) + 31))
mirrored = max(x[0] for x in res if x[3] == -1)
# fold the longitude offset into the rotation: lunar = Rz(off) @ M @ model
t = np.radians(fine[1]); Rz = np.array([[np.cos(t), -np.sin(t), 0], [np.sin(t), np.cos(t), 0], [0, 0, 1]])
lunar_from_model = Rz @ M
canon_from_lunar = np.array([[0, -1, 0], [0, 0, 1], [-1, 0, 0]], float)  # Phase 6A: model=(-Y,+Z,-X)
canon_from_model = canon_from_lunar @ lunar_from_model
print('orientation: corr %.4f, lon offset %.1f, det %d, best mirrored %.4f' % (fine[0], fine[1], det, mirrored))
print('canonical_from_model =', np.round(canon_from_model, 6).tolist())

# ground resolution
km, tx, la = [], [], []
for e in [(0, 1), (1, 2), (2, 0)]:
    p, q = I[:, e[0]], I[:, e[1]]
    dp = P[p] / r[p, None]; dq = P[q] / r[q, None]
    ang = np.arccos(np.clip((dp * dq).sum(1), -1, 1)) * 1737.4
    t2 = np.hypot((UV[p, 0] - UV[q, 0]) * W, (UV[p, 1] - UV[q, 1]) * H)
    ok = t2 > 0.5; km.append(ang[ok]); tx.append(t2[ok])
    Lp = dp @ lunar_from_model.T; la.append(np.degrees(np.arcsin(np.clip(Lp[ok, 2], -1, 1))))
km = np.concatenate(km); tx = np.concatenate(tx); la = np.concatenate(la); kpt = km / tx
res_g = float(np.median(kpt)); res_s = float(np.median(kpt[la < -80])); res_eq = float(np.median(kpt[np.abs(la) < 30]))
print('km/texel median global %.2f, |lat|<30 %.2f, south of 80S %.2f; mean edge %.2f km' % (res_g, res_eq, res_s, float(np.median(km))))
summary = dict(out, corr=fine[0], lon_offset=fine[1], det=det, mirrored_corr=mirrored, canonical_from_model=np.round(canon_from_model, 6).tolist(),
               km_per_texel={'global': res_g, 'lat_lt_30': res_eq, 'south_of_80S': res_s}, edge_km_median=float(np.median(km)))
if ldem:
    E = np.asarray(Image.open(ldem), dtype=np.float64); EH, EW = E.shape
    Lall = (P / r[:, None]) @ lunar_from_model.T
    lat_a = np.degrees(np.arcsin(np.clip(Lall[:, 2], -1, 1))); lon_a = np.degrees(np.arctan2(Lall[:, 1], Lall[:, 0]))
    h = E[np.clip(((90 - lat_a) / 180 * EH).astype(int), 0, EH - 1), np.clip((((lon_a + 180) % 360) / 360 * EW).astype(int), 0, EW - 1)]
    A = np.vstack([np.ones_like(h), h]).T; coef, *_ = np.linalg.lstsq(A, r, rcond=None)
    r0, k = coef; pred = A @ coef; rc = np.corrcoef(r, h)[0, 1]
    exag = k / (r0 / 1737.4)
    print('relief: r = %.6f + %.6f * h_km  (corr %.4f) -> exaggeration x%.2f; residual rms %.2f km' % (r0, k, rc, exag, float(np.sqrt(np.mean((r - pred) ** 2))) / k))
    summary['relief'] = {'r0': float(r0), 'per_km': float(k), 'corr_with_lola': float(rc), 'exaggeration': float(exag)}
json.dump(summary, open(glb + '.analysis.json', 'w'), indent=1)
