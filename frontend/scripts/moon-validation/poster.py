"""Unlit orthographic near-side still of NASA SVS 14959 moon_small.glb (its own texture, verified mapping).
1) reproject the GLB cube-atlas texture to an equirectangular grid by per-triangle ray casting;
2) orthographic view from 0°N 0°E (north up, east right), 2× supersampled."""
import io, json, struct, sys
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
b = open(sys.argv[1], 'rb').read(); jl = struct.unpack_from('<I', b, 12)[0]
J = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
def acc(i, n, dt=np.float32):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(b, dtype=dt, count=a['count'] * n, offset=bin0 + bv.get('byteOffset', 0)).reshape(-1, n)
P = acc(0, 3).astype(float); UV = acc(2, 2).astype(float); I = acc(3, 1, np.uint16).astype(int).reshape(-1, 3)
bv = J['bufferViews'][J['images'][0]['bufferView']]
T = np.asarray(Image.open(io.BytesIO(b[bin0 + bv['byteOffset']: bin0 + bv['byteOffset'] + bv['byteLength']])).convert('RGB'))
H, W = T.shape[:2]
M = np.array([[0, 0, -1], [-1, 0, 0], [0, 1, 0]], float)  # lunar = M @ model (verified)
EW, EH = 4096, 2048
eq = np.zeros((EH, EW, 3), np.uint8); filled = np.zeros((EH, EW), bool)
D = P / np.linalg.norm(P, axis=1, keepdims=True); L = D @ M.T
lat = np.degrees(np.arcsin(np.clip(L[:, 2], -1, 1))); lon = np.degrees(np.arctan2(L[:, 1], L[:, 0]))
def to_model(la, lo):
    la, lo = np.radians(la), np.radians(lo)
    return np.stack([-np.cos(la) * np.sin(lo), np.sin(la), -np.cos(la) * np.cos(lo)], -1)
for tri in I:
    la, lo = lat[tri], lon[tri]
    polar = np.abs(la).max() > 80
    if lo.max() - lo.min() > 180: lo = np.where(lo < 0, lo + 360, lo)
    c0 = int(np.floor((lo.min() + 180) / 360 * EW)); c1 = int(np.ceil((lo.max() + 180) / 360 * EW))
    r0 = int(np.floor((90 - la.max()) / 180 * EH)); r1 = int(np.ceil((90 - la.min()) / 180 * EH))
    if polar:  # triangles touching a pole: scan all longitudes up to the pole
        c0, c1 = 0, EW - 1
        if la.max() > 80: r0 = 0
        if la.min() < -80: r1 = EH - 1
    cc, rr = np.meshgrid(np.arange(c0, c1 + 1), np.arange(r0, r1 + 1))
    plo = (cc + 0.5) / EW * 360 - 180; pla = 90 - (rr + 0.5) / EH * 180
    d = to_model(pla.ravel(), plo.ravel())
    A, B, C = P[tri[0]], P[tri[1]], P[tri[2]]; e1, e2 = B - A, C - A
    pv = np.cross(d, e2); det = pv @ e1; inv = 1 / np.where(np.abs(det) > 1e-12, det, np.inf)
    u = (pv @ -A) * inv; qv = np.cross(-A, e1); v = (d @ qv) * inv
    hit = (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1 + 1e-6)
    if not hit.any(): continue
    uv = (1 - u[hit] - v[hit])[:, None] * UV[tri[0]] + u[hit][:, None] * UV[tri[1]] + v[hit][:, None] * UV[tri[2]]
    tx = np.clip((uv[:, 0] * W).astype(int), 0, W - 1); ty = np.clip((uv[:, 1] * H).astype(int), 0, H - 1)
    rows = rr.ravel()[hit] % EH; cols = cc.ravel()[hit] % EW
    eq[rows, cols] = T[ty, tx]; filled[rows, cols] = True
print('equirect filled:', filled.mean())
N = int(sys.argv[3]) * 2
y, x = np.mgrid[1:-1:N * 1j, -1:1:N * 1j]
r2 = x * x + y * y; inside = r2 < 1
z = np.sqrt(np.clip(1 - r2, 0, 1))
la = np.degrees(np.arcsin(np.clip(y, -1, 1))); lo = np.degrees(np.arctan2(x, z))
col = ((lo + 180) / 360 * EW).astype(int) % EW; row = np.clip(((90 - la) / 180 * EH).astype(int), 0, EH - 1)
out = np.zeros((N, N, 3), np.uint8) + np.array([5, 7, 15], np.uint8)
out[inside] = eq[row[inside], col[inside]]
img = Image.fromarray(out).resize((N // 2, N // 2), Image.LANCZOS)
img.save(sys.argv[2], 'WEBP', quality=80, method=6); print('saved', sys.argv[2])
