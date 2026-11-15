/*
 * SELENORA — NASA Space Apps Challenge 2026 — 7-slide global jury deck generator.
 *
 * Every screenshot in ./assets is a genuine capture of the running SELENORA
 * application (EN UI, Scientist mode) or an existing verified repository screenshot.
 * Every number on the slides comes from a real SELENORA API result (see
 * ./assets/evidence/*.json) or from docs/SELENORA_SUBMISSION_INTEGRATION_REPORT.md.
 *
 * Usage:  NODE_PATH=<dir with pptxgenjs> node build_deck.js
 */
const path = require('path');
const pptxgen = require('pptxgenjs');

const A = (f) => path.join(__dirname, 'assets', f);
const OUT = path.join(__dirname, 'SELENORA_Global_Jury_Demo_7_Slides.pptx');
const TOTAL = 7;

// ---- design tokens --------------------------------------------------------
const C = {
  bg: '050A15', panel: '0C1526', panel2: '101B30', line: '22324D', lineSoft: '1A2740',
  text: 'F3F7FE', body: 'C9D5E3', muted: 'A3B5C8', dim: '7D8FA8',
  cyan: '56D9E9', violet: '9D8CF7', amber: 'F5C674', red: 'F28B82', green: '6EE7B7',
};
const F = { head: 'Segoe UI Semibold', body: 'Segoe UI', mono: 'Consolas' };

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pres.author = 'Team SELENORA';
pres.company = 'Team SELENORA';
pres.title = 'SELENORA — Science-Driven Lunar Landing Decisions';
pres.subject = 'NASA Space Apps Challenge 2026 — Lunar Landing Site Navigator';
pres.theme = { headFontFace: F.head, bodyFontFace: F.body };

const W = 13.333, M = 0.55, R = W - M; // right edge 12.783

pres.defineSlideMaster({
  title: 'SELENORA_COVER',
  background: { path: A('bg-cover.jpg') },
  objects: [],
});
pres.defineSlideMaster({
  title: 'SELENORA_CONTENT',
  background: { path: A('bg-content.jpg') },
  objects: [
    { image: { x: M, y: 0.36, w: 0.34, h: 0.34, path: A('selenora-logo-mark.png') } },
    { text: { text: 'SELENORA · NASA Space Apps Challenge 2026', options: { x: R - 4.2, y: 7.08, w: 4.2, h: 0.24, fontFace: F.mono, fontSize: 9, color: C.dim, align: 'right', margin: 0 } } },
  ],
});

// ---- helpers (fresh option objects every call) ----------------------------
const shadow = () => ({ type: 'outer', color: '000000', blur: 18, offset: 6, angle: 90, opacity: 0.55 });

function header(s, label, title) {
  const n = label.slice(0, 2);
  s.addText([{ text: n, options: { color: C.cyan } }, { text: ` / 0${TOTAL}`, options: { color: C.dim } }], { x: R - 1.2, y: 0.4, w: 1.2, h: 0.26, fontFace: F.mono, fontSize: 11, align: 'right', margin: 0, isTextBox: true });
  s.addText(label, { x: M + 0.48, y: 0.4, w: 9, h: 0.26, fontFace: F.mono, fontSize: 11, color: C.cyan, charSpacing: 1.5, margin: 0, isTextBox: true });
  s.addText(title, { x: M, y: 0.78, w: R - M, h: 0.62, fontFace: F.head, fontSize: 30, color: C.text, margin: 0, isTextBox: true, valign: 'middle' });
}
function footer(s, text) {
  s.addText(text, { x: M, y: 7.08, w: 8.2, h: 0.24, fontFace: F.body, fontSize: 9, color: C.dim, margin: 0, isTextBox: true, valign: 'middle' });
}
function shot(s, file, x, y, w, h, name) {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: C.bg }, line: { color: C.bg, width: 0 }, shadow: shadow() });
  s.addImage({ path: A(file), x, y, w, h, altText: name, objectName: name });
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: C.bg, transparency: 100 }, line: { color: C.line, width: 0.75 } });
}
function panel(s, x, y, w, h, opts = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: opts.fill || C.panel, transparency: opts.transparency ?? 8 }, line: { color: opts.line || C.line, width: 0.75 } });
}
function chip(s, text, x, y, w, color, h = 0.27) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: C.bg, transparency: 20 }, line: { color, width: 0.9 } });
  s.addText(text, { x, y, w, h, fontFace: F.mono, fontSize: 10, bold: true, color, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
}
function tag(s, text, x, y, w, color = C.cyan) {
  s.addText(text, { x, y, w, h: 0.24, fontFace: F.mono, fontSize: 10, color, charSpacing: 1, margin: 0, isTextBox: true });
}

// =========================================================================
// SLIDE 1 — COVER
// =========================================================================
{
  const s = pres.addSlide({ masterName: 'SELENORA_COVER' });
  // Dominant visual: live 3D Moon capture (aspect 2044x1283)
  const iw = 7.5, ih = iw * 1283 / 2044, ix = R - iw, iy = 0.5;
  shot(s, 's1-cover-3d-moon-missions.jpg', ix, iy, iw, ih, 'Live SELENORA 3D Moon with Apollo/CLPS layer');
  s.addText('Live capture · SELENORA 3D Moon · NASA GSFC SVS 14959 LRO topographic model · Phase 7E Apollo/CLPS history layer ON', {
    x: ix, y: iy + ih + 0.08, w: iw, h: 0.24, fontFace: F.body, fontSize: 9, color: C.dim, margin: 0, isTextBox: true, align: 'right' });

  s.addImage({ path: A('selenora-logo-mark.png'), x: M - 0.06, y: 0.55, w: 0.95, h: 0.95, altText: 'SELENORA logo', objectName: 'SELENORA logo' });
  tag(s, 'NASA SPACE APPS CHALLENGE 2026', M + 1.0, 0.92, 4.0, C.cyan);
  s.addText('SELENORA', { x: M, y: 1.62, w: 4.8, h: 0.95, fontFace: F.head, fontSize: 54, color: C.text, charSpacing: 6, margin: 0, isTextBox: true, valign: 'middle' });
  s.addText('Science-Driven Lunar Landing Decisions', { x: M, y: 2.6, w: 4.72, h: 0.4, fontFace: F.head, fontSize: 16.5, color: C.cyan, margin: 0, isTextBox: true });
  s.addText([
    { text: 'Where you land matters.', options: { color: C.text, breakLine: true } },
    { text: 'When you land matters just as much.', options: { color: C.amber } },
  ], { x: M, y: 3.22, w: 4.75, h: 0.82, fontFace: F.body, fontSize: 18, italic: true, margin: 0, isTextBox: true, paraSpaceAfter: 2 });
  s.addText('A working platform that turns NASA/JPL ephemerides and NASA LOLA terrain into transparent, time-dependent landing-site evidence — with provenance and uncertainty on every number.', {
    x: M, y: 4.2, w: 4.6, h: 1.05, fontFace: F.body, fontSize: 13, color: C.muted, margin: 0, isTextBox: true, valign: 'top' });

  // Identity band
  panel(s, M, 5.82, R - M, 1.18, { fill: '08111F', transparency: 0 });
  const cols = [
    { x: M + 0.3, w: 3.55, k: 'EVENT', v: 'NASA Space Apps Challenge 2026' },
    { x: M + 4.05, w: 3.35, k: 'CHALLENGE', v: 'Lunar Landing Site Navigator' },
  ];
  for (const c of cols) {
    tag(s, c.k, c.x, 6.02, c.w, C.cyan);
    s.addText(c.v, { x: c.x, y: 6.3, w: c.w, h: 0.5, fontFace: F.head, fontSize: 16, color: C.text, margin: 0, isTextBox: true, valign: 'top' });
  }
  tag(s, 'TEAM SELENORA', M + 7.6, 6.02, 4.3, C.cyan);
  s.addText([
    { text: 'Ahmet Seyyit KÖSE', options: { bold: true, color: C.text } },
    { text: '   Team Leader', options: { color: C.muted, breakLine: true } },
    { text: 'Nursena ÇAMKÖMÜRÜ', options: { bold: true, color: C.text } },
    { text: '   Team Member', options: { color: C.muted } },
  ], { x: M + 7.6, y: 6.28, w: 4.4, h: 0.6, fontFace: F.body, fontSize: 14, margin: 0, isTextBox: true, valign: 'top' });
  s.addNotes('SELENORA turns NASA mission data into transparent, time-dependent lunar landing-site decision support. The image is a live capture of our own 3D Moon (NASA SVS 14959 LRO model) with the Apollo/CLPS history layer enabled.');
}

// =========================================================================
// SLIDE 2 — THE PROBLEM
// =========================================================================
{
  const s = pres.addSlide({ masterName: 'SELENORA_CONTENT' });
  header(s, '02 · THE PROBLEM', 'A Landing Site Is More Than a Coordinate');
  const iw = 8.15, ih = iw * 1267 / 2752; // 3.75
  shot(s, 's2-horizon-simulator-terrain.jpg', M, 1.55, iw, ih, 'Horizon Simulator in TERRAIN mode');

  // Real annotations from the captured epoch
  const ay = 1.55 + ih + 0.17, aw = (iw - 0.28) / 3;
  const ann = [
    { k: 'SUN ELEVATION', v: '+1.128°', d: 'smooth 0° horizon → geometric VISIBLE', c: C.amber },
    { k: 'LOLA TERRAIN HORIZON', v: '8.69°', d: 'local ridge → TERRAIN-BLOCKED', c: C.red },
    { k: 'EARTH ELEVATION', v: '−6.566°', d: 'below the horizon → no line of sight', c: C.cyan },
  ];
  ann.forEach((a, i) => {
    const x = M + i * (aw + 0.14);
    panel(s, x, ay, aw, 0.82);
    tag(s, a.k, x + 0.14, ay + 0.08, aw - 0.28, a.c);
    s.addText(a.v, { x: x + 0.14, y: ay + 0.34, w: 1.0, h: 0.4, fontFace: F.head, fontSize: 17, color: C.text, margin: 0, isTextBox: true, valign: 'middle' });
    s.addText(a.d, { x: x + 1.16, y: ay + 0.32, w: aw - 1.26, h: 0.44, fontFace: F.body, fontSize: 9.5, color: C.muted, margin: 0, isTextBox: true, valign: 'middle' });
  });

  // Three simultaneous constraints
  const rx = M + iw + 0.3, rw = R - rx;
  tag(s, 'THREE CONSTRAINTS AT ONCE', rx, 1.55, rw, C.cyan);
  const cons = [
    { n: '1', t: 'Low-angle sunlight', d: 'Near the pole the Sun skims the horizon. A ridge a few degrees high decides between light and darkness.', c: C.amber },
    { n: '2', t: 'Earth line of sight', d: 'Direct-to-Earth visibility comes and goes; gaps can last days. Visibility is geometry, not a guaranteed link.', c: C.cyan },
    { n: '3', t: 'Date & duration', d: 'Sun and Earth geometry drift through the month and season, so the same site changes with the window.', c: C.violet },
  ];
  const ch = 1.42;
  cons.forEach((c, i) => {
    const y = 1.9 + i * (ch + 0.12);
    panel(s, rx, y, rw, ch);
    s.addShape(pres.shapes.OVAL, { x: rx + 0.18, y: y + 0.2, w: 0.42, h: 0.42, fill: { color: C.bg }, line: { color: c.c, width: 1.25 } });
    s.addText(c.n, { x: rx + 0.18, y: y + 0.2, w: 0.42, h: 0.42, fontFace: F.mono, fontSize: 14, bold: true, color: c.c, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    s.addText(c.t, { x: rx + 0.75, y: y + 0.2, w: rw - 0.9, h: 0.42, fontFace: F.head, fontSize: 15, color: C.text, margin: 0, isTextBox: true, valign: 'middle' });
    s.addText(c.d, { x: rx + 0.18, y: y + 0.72, w: rw - 0.34, h: 0.62, fontFace: F.body, fontSize: 11, color: C.muted, margin: 0, isTextBox: true, valign: 'top' });
  });

  // Central insight
  const by = 6.4;
  panel(s, M, by, R - M, 0.58, { fill: '0E2230', line: '2B5566', transparency: 0 });
  s.addText([
    { text: 'A promising site in one time window may be operationally unsuitable in another.', options: { bold: true, color: C.text } },
    { text: '  We evaluate site × time.', options: { color: C.cyan } },
  ], { x: M + 0.25, y: by, w: R - M - 0.5, h: 0.58, fontFace: F.body, fontSize: 14, margin: 0, isTextBox: true, valign: 'middle' });
  footer(s, 'Live run · Shackleton Rim — Point A (89.68°S, 166.0°W) · 01 Jan 2027 00:00 UTC · TERRAIN · LOLA Site04 5 m + JPL Horizons');
  s.addNotes('Same epoch, same site: the Sun is 1.128 degrees above the smooth horizon, yet the local LOLA terrain horizon in that azimuth is 8.69 degrees, so the Sun is terrain-blocked. Earth is below the horizon. A static map cannot show this.');
}

// =========================================================================
// SLIDE 3 — DATA → EVIDENCE
// =========================================================================
{
  const s = pres.addSlide({ masterName: 'SELENORA_CONTENT' });
  header(s, '03 · REAL NASA DATA, TRACEABLE SCIENCE', 'From NASA Data to Defensible Evidence');

  // Right column screenshots
  const iw = 3.8, rx = R - iw;
  tag(s, 'LUNAR EXPLORER · LOLA 5 m ON LROC WAC', rx, 1.55, iw, C.muted);
  const h1 = iw * 1294 / 2071;
  shot(s, 's3-lunar-explorer-lola-5m.jpg', rx, 1.82, iw, h1, 'Lunar Explorer with LOLA 5 m science DEM tiles');
  const y2 = 1.82 + h1 + 0.16;
  tag(s, 'PHASE 7D · PRODUCT 90 PROVENANCE', rx, y2, iw, C.muted);
  const h2 = iw * 900 / 1466;
  shot(s, 's3-phase7d-provenance-pgda90.jpg', rx, y2 + 0.27, iw, h2, 'Phase 7D remote DEM provenance panel');

  // Pipeline diagram
  const lx = M, top = 1.55;
  tag(s, 'NASA / JPL SOURCES', lx, top, 3.0, C.cyan);
  const src = [
    { t: 'NASA/JPL Horizons', d: 'Sun & Earth az/el per site & epoch', c: C.amber },
    { t: 'LOLA · PGDA Product 78', d: 'Local 5 m DEM → TERRAIN horizons', c: C.cyan },
    { t: 'LOLA · PGDA Product 90', d: 'Remote 40 m COG → 3D view only', c: C.violet },
    { t: 'LROC WAC · NASA SVS', d: 'Static context, not illumination', c: C.muted },
  ];
  const sw = 3.05, sh = 0.62, sg = 0.1;
  src.forEach((r, i) => {
    const y = top + 0.32 + i * (sh + sg);
    panel(s, lx, y, sw, sh);
    s.addShape(pres.shapes.OVAL, { x: lx + 0.14, y: y + 0.24, w: 0.13, h: 0.13, fill: { color: r.c }, line: { color: r.c, width: 0 } });
    s.addText(r.t, { x: lx + 0.38, y: y + 0.06, w: sw - 0.48, h: 0.26, fontFace: F.head, fontSize: 12, color: C.text, margin: 0, isTextBox: true });
    s.addText(r.d, { x: lx + 0.38, y: y + 0.32, w: sw - 0.44, h: 0.24, fontFace: F.body, fontSize: 9.5, color: C.muted, margin: 0, isTextBox: true });
  });
  const colH = 4 * sh + 3 * sg; // 2.78
  const ey = top + 0.32, ex = lx + sw + 0.38, ew = 2.0;
  s.addShape(pres.shapes.RIGHT_ARROW, { x: lx + sw + 0.07, y: ey + colH / 2 - 0.13, w: 0.26, h: 0.26, fill: { color: C.cyan }, line: { color: C.cyan, width: 0 } });
  panel(s, ex, ey, ew, colH, { fill: '0E2230', line: '2B5566', transparency: 0 });
  tag(s, 'DETERMINISTIC', ex + 0.15, ey + 0.15, ew - 0.3, C.cyan);
  s.addText('FastAPI science core', { x: ex + 0.15, y: ey + 0.42, w: ew - 0.3, h: 0.32, fontFace: F.head, fontSize: 13, color: C.text, margin: 0, isTextBox: true });
  s.addText([
    { text: 'Ephemeris visibility', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'LOLA horizon rays', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Darkness & Earth gaps', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Events · solar · dates', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Conditional ranking', options: { bullet: { indent: 13 } } },
  ], { x: ex + 0.12, y: ey + 0.82, w: ew - 0.2, h: 1.85, fontFace: F.body, fontSize: 10.5, color: C.body, margin: 0, isTextBox: true, valign: 'top', paraSpaceAfter: 3 });
  s.addText('Same inputs → same result. No synthetic fallback.', { x: ex + 0.15, y: ey + colH - 0.62, w: ew - 0.3, h: 0.5, fontFace: F.body, fontSize: 9.5, italic: true, color: C.cyan, margin: 0, isTextBox: true, valign: 'bottom' });
  const ox = ex + ew + 0.38, ow = rx - 0.3 - ox;
  s.addShape(pres.shapes.RIGHT_ARROW, { x: ex + ew + 0.07, y: ey + colH / 2 - 0.13, w: 0.26, h: 0.26, fill: { color: C.cyan }, line: { color: C.cyan, width: 0 } });
  const outs = [
    { t: 'Measured metrics', d: 'per site, per window', c: C.green },
    { t: 'Provenance', d: 'source, version, retrieval time', c: C.green },
    { t: 'Quality state', d: 'GEOMETRIC · TERRAIN · partial', c: C.green },
    { t: 'Optional AI', d: 'explains stored evidence only', c: C.violet },
  ];
  outs.forEach((o, i) => {
    const y = ey + i * (sh + sg);
    panel(s, ox, y, ow, sh, { line: i === 3 ? '3A3570' : C.line });
    s.addText(o.t, { x: ox + 0.14, y: y + 0.06, w: ow - 0.24, h: 0.26, fontFace: F.head, fontSize: 12, color: o.c, margin: 0, isTextBox: true });
    s.addText(o.d, { x: ox + 0.14, y: y + 0.32, w: ow - 0.24, h: 0.24, fontFace: F.body, fontSize: 10, color: C.muted, margin: 0, isTextBox: true });
  });

  // Evidence states
  const sy = ey + colH + 0.3, swAll = rx - 0.3 - lx;
  tag(s, 'HORIZON MODELS & VISIBILITY STATES — STATED, NEVER HIDDEN', lx, sy, swAll, C.cyan);
  const cw = (swAll - 0.24) / 3, cy = sy + 0.3, chh = 1.36;
  const st = [
    { k: 'GEOMETRIC', c: C.cyan, d: 'Smooth-sphere 0° horizon from JPL Horizons. Works anywhere; terrain shadowing is not modelled.' },
    { k: 'TERRAIN', c: C.green, d: 'Local LOLA 5 m horizon (Product 78). Only inside local coverage — remote DEM is never used for scoring.' },
    { k: 'UNKNOWN', c: C.amber, d: 'Data cannot decide → reported as UNKNOWN, never assumed clear sky. Incomplete evidence refuses ranking.' },
  ];
  st.forEach((v, i) => {
    const x = lx + i * (cw + 0.12);
    panel(s, x, cy, cw, chh);
    chip(s, v.k, x + 0.14, cy + 0.14, 1.25, v.c);
    s.addText(v.d, { x: x + 0.14, y: cy + 0.5, w: cw - 0.26, h: chh - 0.58, fontFace: F.body, fontSize: 10.5, color: C.body, margin: 0, isTextBox: true, valign: 'top' });
  });
  const vy = cy + chh + 0.16;
  s.addText('Per-sample states:', { x: lx, y: vy, w: 1.5, h: 0.27, fontFace: F.body, fontSize: 11, color: C.muted, margin: 0, isTextBox: true, valign: 'middle' });
  chip(s, 'VISIBLE', lx + 1.5, vy, 1.0, C.green);
  chip(s, 'BLOCKED', lx + 2.62, vy, 1.0, C.red);
  chip(s, 'UNKNOWN', lx + 3.74, vy, 1.0, C.amber);
  footer(s, 'Sources: NASA/JPL Horizons · NASA PGDA LOLA Products 78 & 90 (Barker et al. 2021) · LROC WAC (NASA/GSFC/ASU) · SVS 14959');
  s.addNotes('Every number traces back to a NASA data product. Product 78 (5 m) drives validated TERRAIN horizons; Product 90 (40 m) is visualization-only. AI only explains stored evidence.');
}

// =========================================================================
// SLIDE 4 — SITE COMPARISON
// =========================================================================
{
  const s = pres.addSlide({ masterName: 'SELENORA_CONTENT' });
  header(s, '04 · SITE COMPARISON', 'Make Trade-Offs Visible');
  const iw = 7.9, ih = iw * 880 / 2752;
  shot(s, 's4-site-comparison-ranking.jpg', M, 1.55, iw, ih, 'Site Comparison with real ranking and metrics');
  const sw2 = 6.1, sh2 = sw2 * 1148 / 2666, sy2 = 1.55 + ih + 0.2;
  shot(s, 's4-relative-solar-potential.jpg', M, sy2, sw2, sh2, 'Relative Solar Potential panel geometries');

  // What is measured
  const rx = M + iw + 0.3, rw = R - rx;
  tag(s, 'SAME EVIDENCE FOR EVERY SITE', rx, 1.55, rw, C.cyan);
  s.addText([
    { text: 'Sunlight visibility', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Direct-Earth visibility', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Joint Sun + Earth visibility', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Longest darkness', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Longest communication gap', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Conditional, weight-transparent ranking', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Relative solar potential (Phase 7B)', options: { bullet: { indent: 13 } } },
  ], { x: rx, y: 1.86, w: rw, h: ih - 0.3, fontFace: F.body, fontSize: 12.5, color: C.body, margin: 0, isTextBox: true, valign: 'top', paraSpaceAfter: 3 });

  // Real result card
  const cx = M + sw2 + 0.25, cw = R - cx, cy = sy2, chh = sh2;
  panel(s, cx, cy, cw, chh);
  s.addText('LIVE RESULT · GEOMETRIC · 01–15 JAN 2027 UTC · 60 MIN · WEIGHTS 40/40/20', { x: cx + 0.2, y: cy + 0.14, w: cw - 0.4, h: 0.24, fontFace: F.mono, fontSize: 9, color: C.cyan, margin: 0, isTextBox: true });
  const half = (cw - 0.55) / 2;
  s.addText([
    { text: '56.6', options: { color: C.cyan } }, { text: ' vs ', options: { color: C.dim, fontSize: 14 } }, { text: '55.2', options: { color: C.violet } },
  ], { x: cx + 0.2, y: cy + 0.44, w: half, h: 0.5, fontFace: F.head, fontSize: 26, margin: 0, isTextBox: true, valign: 'middle' });
  s.addText('Shackleton Rim — Point A edges Bussey 2010 Point D. Both 100% sunlit; Earth visibility 27.7% vs 25.3% decides it.', { x: cx + 0.2, y: cy + 0.98, w: half, h: 0.78, fontFace: F.body, fontSize: 10.5, color: C.body, margin: 0, isTextBox: true, valign: 'top' });
  const x2 = cx + 0.35 + half;
  s.addText([
    { text: '50.6%', options: { color: C.cyan } }, { text: '  /  ', options: { color: C.dim, fontSize: 14 } }, { text: '9.5%', options: { color: C.amber } },
  ], { x: x2, y: cy + 0.44, w: half, h: 0.5, fontFace: F.head, fontSize: 26, margin: 0, isTextBox: true, valign: 'middle' });
  s.addText('Malapert Massif (approx.): best Earth visibility, but sunlit only 9.5% of the window → #3 (25.4).', { x: x2, y: cy + 0.98, w: half, h: 0.78, fontFace: F.body, fontSize: 10.5, color: C.body, margin: 0, isTextBox: true, valign: 'top' });
  s.addShape(pres.shapes.LINE, { x: cx + 0.2, y: cy + 1.8, w: cw - 0.4, h: 0, line: { color: C.lineSoft, width: 0.75 } });
  s.addText([
    { text: 'Relative solar potential, dual-axis: ', options: { bold: true, color: C.text } },
    { text: 'A 100.0% · D 98.8% · Malapert 9.51%. Fixed panel: A 66.9% vs D 66.7% → overlap, so no ranking. ', options: { color: C.body } },
    { text: 'A dimensionless sunlight index — not watts or kWh.', options: { color: C.amber } },
  ], { x: cx + 0.2, y: cy + 1.88, w: cw - 0.4, h: chh - 1.98, fontFace: F.body, fontSize: 10.5, margin: 0, isTextBox: true, valign: 'top' });
  footer(s, 'Live analysis · NASA/JPL Horizons · GEOMETRIC horizon (no terrain shadowing in this run) · seed sites are approximate');
  s.addNotes('All values are from one live analysis: 01–15 Jan 2027 UTC, 60-minute samples, GEOMETRIC horizon, weights 40/40/20. The solar index is relative sunlight opportunity, not energy.');
}

// =========================================================================
// SLIDE 5 — TIME
// =========================================================================
{
  const s = pres.addSlide({ masterName: 'SELENORA_CONTENT' });
  header(s, '05 · OUR MOST DISTINCTIVE INSIGHT: TIME', 'The Same Landing Site. A Different Mission Date.');
  const iw = 7.55, ih = iw * 800 / 1824;
  shot(s, 's5-date-scenarios-dec-jan.jpg', M, 1.55, iw, ih, 'Date Scenarios December 2026 vs January 2027');
  const hw = 4.95, hh = hw * 1020 / 2752, hy = 1.55 + ih + 0.2;
  shot(s, 's5-mission-windows-heatmap.jpg', M, hy, hw, hh, 'Mission Windows hourly joint visibility');
  const tx = M + hw + 0.22, tw = M + iw - tx;
  tag(s, 'PHASE 7A · WINDOWS', tx, hy, tw, C.violet);
  s.addText([
    { text: 'Earth line of sight gained ', options: { color: C.text, bold: true } },
    { text: 'between 11 Jan 02:00 and 03:00 UTC — a 60-min bracket, never an interpolated instant.', options: { color: C.body } },
  ], { x: tx, y: hy + 0.3, w: tw, h: 1.1, fontFace: F.body, fontSize: 11, margin: 0, isTextBox: true, valign: 'top' });
  s.addText('Jan 2027 window · Shackleton Rim — Point A · joint Sun + Earth', { x: tx, y: hy + 1.42, w: tw, h: 0.4, fontFace: F.body, fontSize: 9.5, color: C.dim, margin: 0, isTextBox: true, valign: 'top' });

  // Right: the numbers
  const rx = M + iw + 0.3, rw = R - rx;
  panel(s, rx, 1.55, rw, 5.35);
  tag(s, 'SAME COORDINATES · 89.68°S, 166.0°W', rx + 0.22, 1.72, rw - 0.4, C.cyan);
  s.addText('Shackleton Rim — Point A', { x: rx + 0.22, y: 1.98, w: rw - 0.4, h: 0.3, fontFace: F.head, fontSize: 14, color: C.text, margin: 0, isTextBox: true });
  const colX = [rx + 0.22, rx + 0.22 + (rw - 0.44) / 2];
  s.addText('DEC 1–15 2026', { x: colX[0], y: 2.42, w: 1.9, h: 0.22, fontFace: F.mono, fontSize: 9.5, color: C.dim, margin: 0, isTextBox: true });
  s.addText('JAN 1–15 2027', { x: colX[1], y: 2.42, w: 1.9, h: 0.22, fontFace: F.mono, fontSize: 9.5, color: C.cyan, margin: 0, isTextBox: true });
  const rows = [
    { k: 'Direct-Earth visibility', a: '0.0%', b: '27.7%' },
    { k: 'Longest Earth gap', a: '14.0 d', b: '10.1 d' },
    { k: 'Comparison score', a: '40.00', b: '56.61' },
  ];
  rows.forEach((r, i) => {
    const y = 2.72 + i * 0.86;
    s.addText(r.k, { x: rx + 0.22, y, w: rw - 0.4, h: 0.22, fontFace: F.body, fontSize: 10.5, color: C.muted, margin: 0, isTextBox: true });
    s.addText(r.a, { x: colX[0], y: y + 0.22, w: 1.9, h: 0.52, fontFace: F.head, fontSize: 26, color: C.dim, margin: 0, isTextBox: true, valign: 'middle' });
    s.addText(r.b, { x: colX[1], y: y + 0.22, w: 1.9, h: 0.52, fontFace: F.head, fontSize: 26, color: C.cyan, margin: 0, isTextBox: true, valign: 'middle' });
  });
  s.addShape(pres.shapes.LINE, { x: rx + 0.22, y: 5.38, w: rw - 0.44, h: 0, line: { color: C.lineSoft, width: 0.75 } });
  s.addText([
    { text: 'Sunlight is 100% in both windows — Earth geometry makes the difference.', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Each window: its own JPL Horizons ephemeris & provenance (337 samples, 60 min).', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Timing uncertainty stated: ± one sample step.', options: { bullet: { indent: 13 } } },
  ], { x: rx + 0.18, y: 5.48, w: rw - 0.36, h: 1.36, fontFace: F.body, fontSize: 10.5, color: C.body, margin: 0, isTextBox: true, valign: 'top', paraSpaceAfter: 3 });
  footer(s, 'Live Phase 7C run (matches verified README result) · JPL Horizons · GEOMETRIC · Earth visibility ≠ link budget');
  s.addNotes('Same coordinates, two independent 14-day windows. December 2026: Earth never above the horizon, a 14-day communication gap. January 2027: 27.7% Earth visibility, starting 11 Jan between 02:00 and 03:00 UTC.');
}

// =========================================================================
// SLIDE 6 — EXPLORATION & HISTORY
// =========================================================================
{
  const s = pres.addSlide({ masterName: 'SELENORA_CONTENT' });
  header(s, '06 · EXPLORE THE MOON AND ITS MISSION HISTORY', 'A Living Lunar Exploration Workspace');
  const iw = 8.3, ih = iw * 1275 / 2757;
  shot(s, 's6-3d-moon-south-pole-missions.jpg', M, 1.55, iw, ih, '3D Moon south-pole view with Lunar Missions layer');
  const rx = M + iw + 0.25, rw = R - rx;
  const ah = rw * 556 / 678;
  shot(s, 's6-apollo11-detail.jpg', rx, 1.55, rw, ah, 'Apollo 11 source-backed mission detail');
  const gh = rw * 356 / 1466, gy = 1.55 + ah + 0.16;
  shot(s, 's6-global-vs-local-resolution.jpg', rx, gy, rw, gh, 'Global globe vs local LOLA resolution');

  const fy = 1.55 + ih + 0.2, fw = (iw - 0.36) / 4, fh = 6.9 - fy;
  const feats = [
    { t: 'Global 3D Moon', d: 'NASA SVS 14959 LRO globe — near side, far side, south pole, custom research points.', c: C.cyan },
    { t: '17 mission records', d: 'Apollo & CLPS: Successful · Partial · Unsuccessful · Aborted · Planned.', c: C.green },
    { t: 'Honest coordinates', d: 'Confidence per pin; planned targets shown as regions; Apollo 13 list-only.', c: C.amber },
    { t: 'Local ↔ remote DEM', d: '5 m LOLA science tiles (P78); 40 m P90 mesh for 3D view elsewhere.', c: C.violet },
  ];
  feats.forEach((f, i) => {
    const x = M + i * (fw + 0.12);
    panel(s, x, fy, fw, fh);
    s.addText(f.t, { x: x + 0.14, y: fy + 0.12, w: fw - 0.26, h: 0.3, fontFace: F.head, fontSize: 12.5, color: f.c, margin: 0, isTextBox: true });
    s.addText(f.d, { x: x + 0.14, y: fy + 0.44, w: fw - 0.26, h: fh - 0.52, fontFace: F.body, fontSize: 10.5, color: C.body, margin: 0, isTextBox: true, valign: 'top' });
  });
  const dy = gy + gh + 0.16;
  panel(s, rx, dy, rw, 6.9 - dy, { fill: '1E1A10', line: '5C4B22', transparency: 0 });
  s.addText([
    { text: 'Context, not recommendation. ', options: { bold: true, color: C.amber } },
    { text: 'Historical markers are kept separate from candidate-site scoring. Zooming past the global model hands off to local LOLA terrain.', options: { color: C.body } },
  ], { x: rx + 0.16, y: dy + 0.08, w: rw - 0.32, h: 6.9 - dy - 0.16, fontFace: F.body, fontSize: 10.5, margin: 0, isTextBox: true, valign: 'middle' });
  footer(s, 'Mission sources: NASA NSSDC, LROC (Wagner et al. 2016), NASA CLPS, IAU Gazetteer centroids for planned regions · Globe: NASA GSFC SVS 14959');
  s.addNotes('Phase 7E adds 17 source-backed Apollo and CLPS records with coordinate confidence. Planned targets are regions, not confirmed coordinates. The history layer never feeds candidate scoring.');
}

// =========================================================================
// SLIDE 7 — VALIDATION, IMPACT, NEXT STEP
// =========================================================================
{
  const s = pres.addSlide({ masterName: 'SELENORA_CONTENT' });
  header(s, '07 · VALIDATION, IMPACT & NEXT STEP', 'Built. Tested. Transparent. Open.');
  const lw = 8.3, tw = (lw - 0.36) / 4, ty = 1.55, th = 1.38;
  const tiles = [
    { v: '292', k: 'backend tests passed', s: 'pytest · 1 skipped', c: C.cyan },
    { v: '219', k: 'frontend tests passed', s: 'Vitest · 32 files', c: C.cyan },
    { v: 'PASS', k: 'TypeScript · lint · build', s: 'tsc -b · oxlint · vite build', c: C.green },
    { v: 'QA', k: 'real-browser journeys', s: 'EN/TR · desktop & mobile', c: C.violet },
  ];
  tiles.forEach((t, i) => {
    const x = M + i * (tw + 0.12);
    panel(s, x, ty, tw, th);
    s.addText(t.v, { x: x + 0.18, y: ty + 0.14, w: tw - 0.3, h: 0.62, fontFace: F.head, fontSize: 34, color: t.c, margin: 0, isTextBox: true, valign: 'middle' });
    s.addText(t.k, { x: x + 0.18, y: ty + 0.8, w: tw - 0.3, h: 0.26, fontFace: F.head, fontSize: 11.5, color: C.text, margin: 0, isTextBox: true });
    s.addText(t.s, { x: x + 0.18, y: ty + 1.06, w: tw - 0.3, h: 0.3, fontFace: F.body, fontSize: 9, color: C.dim, margin: 0, isTextBox: true, valign: 'top' });
  });
  s.addText('Recorded in docs/SELENORA_SUBMISSION_INTEGRATION_REPORT.md — temporary SQLite database; production data untouched.', { x: M, y: ty + th + 0.06, w: lw, h: 0.24, fontFace: F.body, fontSize: 9.5, color: C.dim, margin: 0, isTextBox: true });

  const cy = 3.32, cw2 = (lw - 0.2) / 2, chh = 2.2;
  panel(s, M, cy, cw2, chh);
  tag(s, 'TRANSPARENT BY DESIGN', M + 0.2, cy + 0.16, cw2 - 0.4, C.cyan);
  s.addText([
    { text: 'Real NASA/JPL data with provenance on every result', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Limitations documented; no landing-safety claims', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'Open source under Apache-2.0', options: { bullet: { indent: 13 }, breakLine: true } },
    { text: 'AI-assisted development disclosed; science is deterministic code', options: { bullet: { indent: 13 } } },
  ], { x: M + 0.18, y: cy + 0.48, w: cw2 - 0.34, h: chh - 0.56, fontFace: F.body, fontSize: 11.5, color: C.body, margin: 0, isTextBox: true, valign: 'top', paraSpaceAfter: 3 });
  const x2 = M + cw2 + 0.2;
  panel(s, x2, cy, cw2, chh);
  tag(s, 'WHO IT SERVES', x2 + 0.2, cy + 0.16, cw2 - 0.4, C.cyan);
  s.addText([
    { text: 'Researchers', options: { bold: true, color: C.text } }, { text: ' — early site × date trade-offs', options: { breakLine: true } },
    { text: 'Educators & students', options: { bold: true, color: C.text } }, { text: ' — why polar landings are hard', options: { breakLine: true } },
    { text: 'Mission-concept teams', options: { bold: true, color: C.text } }, { text: ' — screen options before deeper analysis', options: { breakLine: true } },
    { text: 'Next: wider validated LOLA terrain coverage', options: { color: C.amber } },
  ], { x: x2 + 0.2, y: cy + 0.48, w: cw2 - 0.36, h: chh - 0.56, fontFace: F.body, fontSize: 11.5, color: C.body, margin: 0, isTextBox: true, valign: 'top', paraSpaceAfter: 4 });

  // Closing statement
  s.addImage({ path: A('selenora-logo-mark.png'), x: M - 0.05, y: 5.72, w: 0.95, h: 0.95, altText: 'SELENORA logo', objectName: 'SELENORA logo closing' });
  s.addText([
    { text: 'Evidence, not guesses,', options: { color: C.text, breakLine: true } },
    { text: 'to navigate the next lunar landing.', options: { color: C.cyan } },
  ], { x: M + 1.05, y: 5.65, w: lw - 1.05, h: 1.1, fontFace: F.head, fontSize: 24, margin: 0, isTextBox: true, valign: 'middle' });

  // QR + team card
  const qx = M + lw + 0.3, qw = R - qx;
  panel(s, qx, 1.55, qw, 5.35, { fill: '0B1424', transparency: 0 });
  const qs = 2.35;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: qx + (qw - qs - 0.2) / 2, y: 1.8, w: qs + 0.2, h: qs + 0.2, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF', width: 0 } });
  s.addImage({ path: A('qr-github-repo.png'), x: qx + (qw - qs) / 2, y: 1.9, w: qs, h: qs, altText: 'QR code to the public GitHub repository', objectName: 'Repository QR', hyperlink: { url: 'https://github.com/seyyitkse/Nasa-Space-Apps-SELENORA-Projesi' } });
  s.addText('Scan · open-source repository', { x: qx + 0.2, y: 4.42, w: qw - 0.4, h: 0.26, fontFace: F.body, fontSize: 11, color: C.muted, align: 'center', margin: 0, isTextBox: true });
  s.addText([{ text: 'github.com/seyyitkse/Nasa-Space-Apps-SELENORA-Projesi', options: { hyperlink: { url: 'https://github.com/seyyitkse/Nasa-Space-Apps-SELENORA-Projesi' }, color: C.cyan } }],
    { x: qx + 0.15, y: 4.7, w: qw - 0.3, h: 0.46, fontFace: F.mono, fontSize: 10, align: 'center', margin: 0, isTextBox: true, valign: 'top' });
  s.addShape(pres.shapes.LINE, { x: qx + 0.3, y: 5.32, w: qw - 0.6, h: 0, line: { color: C.lineSoft, width: 0.75 } });
  tag(s, 'TEAM SELENORA', qx + 0.3, 5.48, qw - 0.6, C.cyan);
  s.addText([
    { text: 'Ahmet Seyyit KÖSE', options: { bold: true, color: C.text, breakLine: true } },
    { text: 'Team Leader', options: { color: C.muted, fontSize: 10.5, breakLine: true } },
    { text: 'Nursena ÇAMKÖMÜRÜ', options: { bold: true, color: C.text, breakLine: true } },
    { text: 'Team Member', options: { color: C.muted, fontSize: 10.5 } },
  ], { x: qx + 0.3, y: 5.76, w: qw - 0.6, h: 1.05, fontFace: F.body, fontSize: 13, margin: 0, isTextBox: true, valign: 'top' });
  footer(s, 'Independent Space Apps project — not affiliated with or endorsed by NASA. NASA data and imagery credited to sources.');
  s.addNotes('Verified gates: 292 backend tests passed (1 skipped), 219 frontend tests passed, TypeScript, lint and production build pass, plus real-browser QA. Open source, Apache-2.0.');
}

pres.writeFile({ fileName: OUT }).then((f) => console.log('wrote', f));
