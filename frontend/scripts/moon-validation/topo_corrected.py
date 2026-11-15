"""Re-register the SVS 14959 topo GLB: move each vertex to its UV-implied lat/lon (keep radius),
then re-measure relief vs LOLA and orientation vs the SVS 4720 map, and render a south-polar
comparison (±HALF km, 0E up) of moon_small (cube-atlas, ray cast) vs topo (equirect texture).
usage: python -I topo_corrected.py <topo.glb> <ldem_4.tif> <lroc_color_poles_1k.jpg> <moon_small.glb> <sites.json> <out_prefix>"""
import io, json, struct, sys
import numpy as np
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None
topo, ldem, ref, small, sites_f, out = sys.argv[1:7]
def load(f):
    b = open(f, 'rb').read(); jl = struct.unpack_from('<I', b, 12)[0]; J = json.loads(b[20:20 + jl]); bin0 = 20 + jl + 8
    DT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}
    def acc(i):
        a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; n = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
        return np.frombuffer(b, dtype=DT[a['componentType']], count=a['count'] * n, offset=bin0 + bv.get('byteOffset', 0)).reshape(-1, n)
    pr = J['meshes'][0]['primitives'][0]
    bv = J['bufferViews'][J['images'][0]['bufferView']]
    tex = Image.open(io.BytesIO(b[bin0 + bv['byteOffset']: bin0 + bv['byteOffset'] + bv['byteLength']])).convert('RGB')
    return acc(pr['attributes']['POSITION']).astype(float), acc(pr['attributes']['TEXCOORD_0']).astype(float), acc(pr['indices']).astype(np.int64).reshape(-1, 3), tex
P, UV, I, tex = load(topo)
r = np.linalg.norm(P, axis=1)
ulat = 90 - UV[:, 1] * 180; ulon = UV[:, 0] * 360 - 180
E = np.asarray(Image.open(ldem), float); EH, EW = E.shape
def h(lat, lon): return E[np.clip(((90 - lat) / 180 * EH).astype(int), 0, EH - 1), np.clip((((lon + 180) % 360) / 360 * EW).astype(int), 0, EW - 1)]
hv = h(ulat, ulon)
A = np.vstack([np.ones_like(hv), hv]).T; (r0, k), *_ = np.linalg.lstsq(A, r, rcond=None)
print('relief after re-registration: r = %.6f + %.6f*h  corr %.4f  exaggeration x%.3f  residual rms %.2f km' % (r0, k, np.corrcoef(r, hv)[0, 1], k / (r0 / 1737.4), np.sqrt(np.mean((r - A @ [r0, k]) ** 2)) / k))
for lim in (-80, -85):
    m = ulat < lim; print('  south of %d: relief~LOLA corr %.3f (n=%d)' % (lim, np.corrcoef(r[m], hv[m])[0, 1], m.sum()))
# orientation of the corrected mesh vs SVS 4720 (canonical = Phase 6A frame, rotation Ry(90))
T = np.asarray(tex.convert('L').reduce(2), float); TH, TW = T.shape
Rf = np.asarray(Image.open(ref).convert('L'), float); RH, RW = Rf.shape
sel = np.random.default_rng(2).choice(len(P), 120000, replace=False)
a = T[np.clip((UV[sel, 1] * TH).astype(int), 0, TH - 1), np.clip((UV[sel, 0] * TW).astype(int), 0, TW - 1)]
for off in (-0.2, -0.1, 0.0, 0.1, 0.2):
    rr = Rf[np.clip(((90 - ulat[sel]) / 180 * RH).astype(int), 0, RH - 1), np.clip((((ulon[sel] + off + 180) % 360) / 360 * RW).astype(int), 0, RW - 1)]
    print('  corr vs SVS 4720 with lon offset %+.1f: %.4f' % (off, np.corrcoef(a, rr)[0, 1]))
# south polar comparison renders
HALF, N = 160.0, 480; Rm = 1737.4
xs = np.linspace(-HALF, HALF, N); X, Y = np.meshgrid(xs, xs[::-1])
rho = np.hypot(X, Y); c = 2 * np.arctan(rho / (2 * Rm)); plat = -90 + np.degrees(c); plon = np.degrees(np.arctan2(X, Y))
TT = np.asarray(tex, np.uint8); H2, W2 = TT.shape[:2]
fx = ((plon + 180) % 360) / 360 * W2 - 0.5; fy = (90 - plat) / 180 * H2 - 0.5
x0 = np.floor(fx).astype(int); y0 = np.floor(fy).astype(int); wx = (fx - x0)[..., None]; wy = (fy - y0)[..., None]
g = lambda yy, xx: TT[np.clip(yy, 0, H2 - 1), xx % W2].astype(float)
topo_img = (g(y0, x0) * (1 - wx) * (1 - wy) + g(y0, x0 + 1) * wx * (1 - wy) + g(y0 + 1, x0) * (1 - wx) * wy + g(y0 + 1, x0 + 1) * wx * wy).astype(np.uint8)
# small model via its cube-atlas mesh (ray cast, nearest texel)
Ps, UVs, Is, texs = load(small); Ts = np.asarray(texs); Hs, Ws = Ts.shape[:2]
D = Ps / np.linalg.norm(Ps, axis=1, keepdims=True)
keep = D[Is].mean(1)[:, 1] < -0.9; Is2 = Is[keep]; A0, B0, C0 = Ps[Is2[:, 0]], Ps[Is2[:, 1]], Ps[Is2[:, 2]]; e1, e2 = B0 - A0, C0 - A0
la_, lo_ = np.radians(plat), np.radians(plon)
dirs = np.stack([-np.cos(la_) * np.sin(lo_), np.sin(la_), -np.cos(la_) * np.cos(lo_)], -1).reshape(-1, 3)
small_img = np.zeros((N * N, 3), np.uint8)
for j, dd in enumerate(dirs):
    pv = np.cross(dd, e2); det = (e1 * pv).sum(1); inv = 1 / np.where(np.abs(det) > 1e-12, det, np.inf)
    u = (-A0 * pv).sum(1) * inv; qv = np.cross(-A0, e1); v = (dd * qv).sum(1) * inv
    hit = np.where((u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9))[0]
    if len(hit) == 0: continue
    kk = hit[0]; w = np.array([1 - u[kk] - v[kk], u[kk], v[kk]]); uv = w @ UVs[Is2[kk]]
    small_img[j] = Ts[min(Hs - 1, int(uv[1] * Hs)), min(Ws - 1, int(uv[0] * Ws))]
small_img = small_img.reshape(N, N, 3)
sites = json.load(open(sites_f, encoding='utf-8'))
def annotate(arr, title):
    im = Image.fromarray(arr).resize((N * 2, N * 2), Image.NEAREST); dr = ImageDraw.Draw(im)
    for s in sites:
        cc = np.radians(s['lat'] + 90); rh = 2 * Rm * np.tan(cc / 2); lo = np.radians(s['lon'])
        px = (rh * np.sin(lo) + HALF) / (2 * HALF) * N * 2; py = (HALF - rh * np.cos(lo)) / (2 * HALF) * N * 2
        dr.ellipse([px - 5, py - 5, px + 5, py + 5], outline=(255, 70, 70), width=2)
    dr.rectangle([0, 0, N * 2, 22], fill=(5, 7, 15)); dr.text((6, 5), title, fill=(230, 230, 230))
    dr.line([(N * 2 - 20 - 100 * N * 2 / (2 * HALF), N * 2 - 14), (N * 2 - 20, N * 2 - 14)], fill=(255, 255, 255), width=3); dr.text((N * 2 - 90, N * 2 - 32), '100 km', fill=(255, 255, 255))
    return im
annotate(small_img, 'moon_small.glb - 4096 px cube atlas (about 3.3 km/px here) - south pole +/-160 km, 0E up').save(out + '_small.png')
annotate(topo_img, 'Topo_Small.glb - 8192x4096 equirect, re-registered (about 1.3 km/px N-S) - same view').save(out + '_topo.png')
def lapvar(a):
    g_ = a.astype(float).mean(2); l = -4 * g_[1:-1, 1:-1] + g_[:-2, 1:-1] + g_[2:, 1:-1] + g_[1:-1, :-2] + g_[1:-1, 2:]
    return float(l.var())
print('sharpness (Laplacian variance, same view, same output grid): small %.1f  topo %.1f' % (lapvar(small_img), lapvar(topo_img)))

