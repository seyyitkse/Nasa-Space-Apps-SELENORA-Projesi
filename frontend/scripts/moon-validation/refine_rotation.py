"""Fine residual-rotation search (tilt x/y + spin z, degrees) around an analyze_glb.py result.
usage: python -I refine_rotation.py <model.glb> <lroc_color_poles_1k.jpg> <step_deg> <range_deg>"""
import io, json, struct, sys
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
glb, ref, step, rng_ = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
A = json.load(open(glb + '.analysis.json'))
C = np.array(A['canonical_from_model'])
b = open(glb, 'rb').read(); jl = struct.unpack_from('<I', b, 12)[0]; J = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
DT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}
def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; n = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
    return np.frombuffer(b, dtype=DT[a['componentType']], count=a['count'] * n, offset=bin0 + bv.get('byteOffset', 0)).reshape(-1, n)
pr = J['meshes'][0]['primitives'][0]
P = acc(pr['attributes']['POSITION']).astype(float); UV = acc(pr['attributes']['TEXCOORD_0']).astype(float)
bv = J['bufferViews'][J['images'][0]['bufferView']]
tex = Image.open(io.BytesIO(b[bin0 + bv['byteOffset']: bin0 + bv['byteOffset'] + bv['byteLength']])).convert('L')
if tex.size[0] > 4096: tex = tex.reduce(2)
T = np.asarray(tex, float); TH, TW = T.shape
R = np.asarray(Image.open(ref).convert('L'), float); RH, RW = R.shape
sel = np.random.default_rng(1).choice(len(P), size=min(len(P), 120000), replace=False)
a = T[np.clip((UV[sel, 1] * TH).astype(int), 0, TH - 1), np.clip((UV[sel, 0] * TW).astype(int), 0, TW - 1)]
d = P[sel] / np.linalg.norm(P[sel], axis=1, keepdims=True)
LfC = np.array([[0, 0, -1], [-1, 0, 0], [0, 1, 0]], float)  # lunar <- canonical (Phase 6A)
def rot(ax, deg):
    t = np.radians(deg); c, s = np.cos(t), np.sin(t)
    return {'x': np.array([[1, 0, 0], [0, c, -s], [0, s, c]]), 'y': np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]), 'z': np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[ax]
def corr(Rl):
    L = d @ (Rl @ LfC @ C).T
    lat = np.degrees(np.arcsin(np.clip(L[:, 2], -1, 1))); lon = np.degrees(np.arctan2(L[:, 1], L[:, 0]))
    ref_ = R[np.clip(((90 - lat) / 180 * RH).astype(int), 0, RH - 1), np.clip((((lon + 180) % 360) / 360 * RW).astype(int), 0, RW - 1)]
    return np.corrcoef(a, ref_)[0, 1]
base = corr(np.eye(3)); best = (base, 0, 0, 0)
g = np.arange(-rng_, rng_ + 1e-9, step)
for tx in g:
    for ty in g:
        for tz in g:
            c = corr(rot('z', tz) @ rot('y', ty) @ rot('x', tx))
            if c > best[0] + 1e-6: best = (c, tx, ty, tz)
print('as analysed: corr %.5f; best %.5f at tilt-x %.2f, tilt-y %.2f, spin-z %.2f deg (lunar axes)' % (base, *best))
