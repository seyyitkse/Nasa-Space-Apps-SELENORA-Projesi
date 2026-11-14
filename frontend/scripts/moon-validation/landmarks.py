"""Sample the GLB's own texture at Gazetteer landmarks through the verified mapping.
Usage: landmarks.py moon_small.glb landmarks.json  (json: [{id,name,lat,lon,expect}])"""
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
T = np.asarray(Image.open(io.BytesIO(b[bin0 + bv['byteOffset']: bin0 + bv['byteOffset'] + bv['byteLength']])).convert('L'), dtype=float)
H, W = T.shape
def model(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.array([-np.cos(la) * np.sin(lo), np.sin(la), -np.cos(la) * np.cos(lo)])
A, B, C = P[I[:, 0]], P[I[:, 1]], P[I[:, 2]]
def uv_at(d):
    # ray from origin along d against all triangles (Möller–Trumbore, vectorised)
    e1, e2 = B - A, C - A
    pv = np.cross(d, e2); det = (e1 * pv).sum(1)
    ok = np.abs(det) > 1e-12; inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
    tv = -A; u = (tv * pv).sum(1) * inv
    qv = np.cross(tv, e1); v = (d * qv).sum(1) * inv; t = (e2 * qv).sum(1) * inv
    hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > 0)
    k = np.where(hit)[0][np.argmin(t[hit])]
    w = np.array([1 - u[k] - v[k], u[k], v[k]])
    return w @ UV[I[k]]
def lum(lat, lon, r=6):
    uv = uv_at(model(lat, lon)); x, y = int(uv[0] * W), int(uv[1] * H)
    return float(T[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1].mean()), [float(uv[0]), float(uv[1])]
med = float(np.median(T[T > 0]))
L = json.load(open(sys.argv[2], encoding='utf-8'))
out = []
for l in L:
    v, uv = lum(l['lat'], l['lon'])
    mlon, _ = lum(l['lat'], -l['lon'])
    mlat, _ = lum(-l['lat'], l['lon'])
    m = mlon if l['mirror'] == 'lon' else mlat
    # dark: below the texture median AND >= 25 % darker than the mirrored point; bright: the reverse.
    passed = (v < med and v < 0.75 * m) if l['expect'] == 'dark' else (v > med and v > m / 0.75)
    out.append({**l, 'uv': [round(uv[0], 5), round(uv[1], 5)], 'lum': round(v, 1), 'lum_mirror_lon': round(mlon, 1), 'lum_mirror_lat': round(mlat, 1), 'pass': bool(passed)})
    print(f"{l['name']:<22} {l['lat']:7.2f} {l['lon']:8.2f} expect {l['expect']:<6} lum {v:6.1f}  mirrorLon {mlon:6.1f}  mirrorLat {mlat:6.1f}  {'PASS' if passed else 'FAIL'}")
print('texture median luminance', med)
json.dump({'median': med, 'landmarks': out}, open('landmark_result.json', 'w'), indent=1)
