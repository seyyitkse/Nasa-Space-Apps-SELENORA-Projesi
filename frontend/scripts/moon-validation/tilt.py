"""Fine search of a small residual rotation (tilt about two horizontal axes + spin) around the verified mapping."""
import io, json, struct, sys
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
b = open(sys.argv[1], 'rb').read(); jl = struct.unpack_from('<I', b, 12)[0]
J = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
def acc(i, n):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(b, dtype=np.float32, count=a['count'] * n, offset=bin0 + bv.get('byteOffset', 0)).reshape(-1, n)
P = acc(0, 3).astype(float); UV = acc(2, 2).astype(float)
bv = J['bufferViews'][J['images'][0]['bufferView']]
T = np.asarray(Image.open(io.BytesIO(b[bin0 + bv['byteOffset']: bin0 + bv['byteOffset'] + bv['byteLength']])).convert('L'), float)
H, W = T.shape
Rf = np.asarray(Image.open(sys.argv[2]).convert('L'), float); RH, RW = Rf.shape
a = T[np.clip((UV[:, 1] * H).astype(int), 0, H - 1), np.clip((UV[:, 0] * W).astype(int), 0, W - 1)]
d = P / np.linalg.norm(P, axis=1, keepdims=True)
M = np.array([[0, 0, -1], [-1, 0, 0], [0, 1, 0]], float)
L0 = d @ M.T
def rot(ax, deg):
    t = np.radians(deg); c, s = np.cos(t), np.sin(t)
    if ax == 'x': return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if ax == 'y': return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
def corr(Rm):
    L = L0 @ Rm.T
    lat = np.degrees(np.arcsin(np.clip(L[:, 2], -1, 1))); lon = np.degrees(np.arctan2(L[:, 1], L[:, 0]))
    ref = Rf[np.clip(((90 - lat) / 180 * RH).astype(int), 0, RH - 1), np.clip((((lon + 180) % 360) / 360 * RW).astype(int), 0, RW - 1)]
    return np.corrcoef(a, ref)[0, 1]
best = (corr(np.eye(3)), 0, 0, 0); print('identity', best[0])
steps = np.arange(-1.0, 1.01, 0.25)
for tx in steps:
    for ty in steps:
        for tz in steps:
            c = corr(rot('z', tz) @ rot('y', ty) @ rot('x', tx))
            if c > best[0]: best = (c, tx, ty, tz)
print('best corr %.5f at tilt x %.2f, y %.2f, spin z %.2f deg' % best)
