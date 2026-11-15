"""Texel ground resolution of moon_small.glb near the south pole and globally."""
import json, struct, sys
import numpy as np
b = open(sys.argv[1], 'rb').read(); jl = struct.unpack_from('<I', b, 12)[0]
J = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
def acc(i, n, dt=np.float32):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(b, dtype=dt, count=a['count'] * n, offset=bin0 + bv.get('byteOffset', 0)).reshape(-1, n)
P = acc(0, 3).astype(float); UV = acc(2, 2).astype(float); I = acc(3, 1, np.uint16).astype(int).reshape(-1, 3)
d = P / np.linalg.norm(P, axis=1, keepdims=True)
lat = np.degrees(np.arcsin(d[:, 1]))
R = 1737.4; TEX = 4096
km, texel = [], []
for e in [(0, 1), (1, 2), (2, 0)]:
    a, c = I[:, e[0]], I[:, e[1]]
    ang = np.arccos(np.clip((d[a] * d[c]).sum(1), -1, 1)) * R
    t = np.linalg.norm((UV[a] - UV[c]) * TEX, axis=1)
    ok = t > 0.5
    km.append(ang[ok]); texel.append(t[ok]); 
km = np.concatenate(km); texel = np.concatenate(texel)
la = np.concatenate([lat[I[:, e[0]]][(np.linalg.norm((UV[I[:, e[0]]] - UV[I[:, e[1]]]) * TEX, axis=1) > 0.5)] for e in [(0, 1), (1, 2), (2, 0)]])
r = km / texel
print('global km/texel median %.2f p10 %.2f p90 %.2f' % tuple(np.percentile(r, [50, 10, 90])))
m = la < -80
print('south of 80S km/texel median %.2f (n=%d)' % (np.median(r[m]), m.sum()))
m = la < -85
print('south of 85S km/texel median %.2f (n=%d)' % (np.median(r[m]), m.sum()))
print('mesh vertex spacing km median %.1f, south of 85S %.1f' % (np.median(km), np.median(km[m])))
