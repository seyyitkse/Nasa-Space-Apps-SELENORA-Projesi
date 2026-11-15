"""Polar stereographic render (±HALF km) of the GLB's own texture around the south pole, via the verified mapping, with research sites."""
import io, json, struct, sys
import numpy as np
from PIL import Image, ImageDraw
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
D = P / np.linalg.norm(P, axis=1, keepdims=True)
keep = (D[I].mean(1)[:, 1] < -0.9)  # triangles near the south pole
I = I[keep]; A, B, C = P[I[:, 0]], P[I[:, 1]], P[I[:, 2]]
R = 1737.4; HALF = float(sys.argv[2]); N = int(sys.argv[3])
xs = np.linspace(-HALF, HALF, N)
img = np.zeros((N, N, 3), np.uint8)
def model(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([-np.cos(la) * np.sin(lo), np.sin(la), -np.cos(la) * np.cos(lo)], -1)
e1, e2 = B - A, C - A
for r, yv in enumerate(xs[::-1]):  # top row = +y (toward 0°E)
    x = xs; y = np.full_like(x, yv)
    rho = np.hypot(x, y); c = 2 * np.arctan(rho / (2 * R))
    lat = -90 + np.degrees(c); lon = np.degrees(np.arctan2(x, y))  # stere lat0=-90 lon0=0: x = rho sin(lon), y = rho cos(lon)
    d = model(lat, lon)
    for j in range(N):
        pv = np.cross(d[j], e2); det = (e1 * pv).sum(1); inv = 1 / np.where(np.abs(det) > 1e-12, det, np.inf)
        u = (-A * pv).sum(1) * inv; qv = np.cross(-A, e1); v = (d[j] * qv).sum(1) * inv; t = (e2 * qv).sum(1) * inv
        hit = (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > 0)
        if not hit.any(): continue
        k = np.where(hit)[0][0]; w = np.array([1 - u[k] - v[k], u[k], v[k]]); uv = w @ UV[I[k]]
        img[r, j] = T[min(H - 1, int(uv[1] * H)), min(W - 1, int(uv[0] * W))]
im = Image.fromarray(img).resize((N * 3, N * 3), Image.NEAREST); dr = ImageDraw.Draw(im)
sites = json.load(open(sys.argv[4], encoding='utf-8'))
for s in sites:
    c = np.radians(s['lat'] + 90); rho = 2 * R * np.tan(c / 2); lo = np.radians(s['lon'])
    px = (rho * np.sin(lo) + HALF) / (2 * HALF) * N * 3; py = (HALF - rho * np.cos(lo)) / (2 * HALF) * N * 3
    dr.ellipse([px - 4, py - 4, px + 4, py + 4], outline=(255, 60, 60), width=2); dr.text((px + 6, py - 6), s['name'], fill=(255, 220, 80))
im.save(sys.argv[5]); print('saved', sys.argv[5])
