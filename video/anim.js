// Fomies — "what is @FomiesNFT?" motion graphic
// Deterministic canvas animation: renderFrame(t) draws the frame at time t (seconds).
// Open index.html to preview in real time, or run render.mjs to export an MP4.

const W = 1920, H = 1080, DURATION = 60;
const cv = document.getElementById('c');
const X = cv.getContext('2d');

const COL = {
  lav: '#b2a4f0', lavDot: '#a596e4', lavD: '#7f6fd8', lavL: '#d9d1fb',
  ink: '#15131d', white: '#ffffff', cream: '#f6efdf', paper: '#fbf8f0',
  navy: '#2c3749', navyD: '#18202c', red: '#cf2a33', redD: '#8f1b22',
  yellow: '#f7c531', wood: '#8a5a2c', woodD: '#5c3a1a', blue: '#4f7cf7',
  peach: '#ffc3a0', mint: '#a5d8d1', gold: '#e5b12c', grey: '#8e93a1', green: '#33b25c',
};

// ---------- math ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const P = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  io: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  elastic: t => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
  expo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};
const bump = (t, c, w) => clamp(1 - Math.abs(t - c) / w);
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); }

// ---------- cue registries (sound + camera shake) ----------
const CUES = new Map();
function cue(t, type, vol = 1) { CUES.set(type + '@' + t.toFixed(3), { t, type, vol }); }
const SHAKES = new Map();
function shake(t, amp = 18, dur = 0.45) { SHAKES.set(t.toFixed(3), { t, amp, dur }); }
function shakeOffset(t) {
  let dx = 0, dy = 0, rot = 0;
  for (const s of SHAKES.values()) {
    const k = (t - s.t) / s.dur;
    if (k < 0 || k > 1) continue;
    const a = s.amp * Math.pow(1 - k, 2);
    dx += (noise1(t * 40 + s.t) - 0.5) * 2 * a;
    dy += (noise1(t * 40 + s.t + 50) - 0.5) * 2 * a;
    rot += (noise1(t * 30 + s.t + 99) - 0.5) * 0.012 * a / 18;
  }
  return [dx, dy, rot];
}

// ---------- assets ----------
const IMG = {};
const SRC = {
  clerk: 'assets/clerk.jpg', corridor: 'assets/corridor.jpg', elevator: 'assets/elevator.jpg',
  closed: 'assets/closed.jpg', yellow: 'assets/ch_yellow.png', peach: 'assets/ch_peach.png',
  blue: 'assets/ch_blue.png', mint: 'assets/ch_mint.png', lavc: 'assets/ch_lav.png',
};
function loadImages() {
  return Promise.all(Object.entries(SRC).map(([k, s]) => new Promise((res, rej) => {
    const i = new Image(); i.onload = () => { IMG[k] = i; res(); }; i.onerror = rej; i.src = s;
  })));
}
function offscreen(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------- drawing helpers ----------
function font(size, fam = 'Fredoka', w = 700) { return `${w} ${size}px "${fam}"`; }
function measure(s, size, fam = 'Fredoka', w = 700, ls = 0) {
  X.save(); X.font = font(size, fam, w); X.letterSpacing = ls + 'px';
  const m = X.measureText(s).width; X.restore(); return m;
}
function T(s, x, y, o = {}) {
  const size = o.size || 80, fam = o.fam || 'Fredoka', w = o.w || 700;
  X.save();
  if (o.alpha != null) X.globalAlpha *= o.alpha;
  X.font = font(size, fam, w);
  X.textAlign = o.align || 'center';
  X.textBaseline = o.base || 'middle';
  X.letterSpacing = (o.ls || 0) + 'px';
  X.lineJoin = 'round';
  const sw = o.sw != null ? o.sw : size * 0.16;
  if (o.shadow) {
    const sc = o.shadowC || COL.ink;
    X.fillStyle = sc; X.strokeStyle = sc;
    if (o.stroke) { X.lineWidth = sw; X.strokeText(s, x + o.shadow, y + o.shadow); }
    X.fillText(s, x + o.shadow, y + o.shadow);
  }
  if (o.stroke) { X.lineWidth = sw; X.strokeStyle = o.stroke; X.strokeText(s, x, y); }
  X.fillStyle = o.fill || COL.white; X.fillText(s, x, y);
  X.restore();
}
// words pop in one by one; o.colors[i] overrides word color
function popWords(s, x, y, t, t0, o = {}) {
  const words = s.split(' ');
  const size = o.size || 80, fam = o.fam || 'Fredoka', w = o.w || 700;
  const space = measure(' ', size, fam, w) + (o.wordGap ?? ((o.stroke ? (o.sw ?? size * 0.16) * 0.55 : 0) + size * 0.04));
  const ws = words.map(wd => measure(wd, size, fam, w, o.ls || 0));
  const total = ws.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let cx = o.align === 'left' ? x : o.align === 'right' ? x - total : x - total / 2;
  const st = o.stagger ?? 0.06, d = o.dur ?? 0.38;
  words.forEach((wd, i) => {
    const p = P(t, t0 + i * st, t0 + i * st + d);
    const wx = cx + ws[i] / 2; cx += ws[i] + space;
    if (p <= 0) return;
    const sc = E.back(p, 2.6);
    X.save();
    X.translate(wx, y + (1 - E.out(p)) * size * 0.45);
    X.scale(sc, sc);
    X.rotate((1 - E.out(p)) * (o.rot ?? 0.2) * (i % 2 ? 1 : -1));
    T(wd, 0, 0, { ...o, fill: (o.colors && o.colors[i]) || o.fill, align: 'center', alpha: (o.alpha ?? 1) * clamp(p * 3) });
    X.restore();
  });
  return total;
}
// typewriter text, returns progress info
function typeText(s, x, y, t, t0, cps, o = {}) {
  const n = Math.floor(clamp((t - t0) * cps, 0, s.length));
  if (t < t0) return { done: false, n: 0 };
  const shown = s.slice(0, n);
  T(shown, x, y, { ...o, align: 'left' });
  const done = n >= s.length;
  if (o.caret !== false && (!done || Math.floor(t * 2.4) % 2 === 0) && (o.caretUntil == null || t < o.caretUntil)) {
    const mw = measure(shown, o.size || 60, o.fam || 'Elite', o.w || 400);
    X.fillStyle = o.fill || COL.ink;
    X.fillRect(x + mw + 4, y - (o.size || 60) * 0.42, (o.size || 60) * 0.08, (o.size || 60) * 0.8);
  }
  return { done, n };
}
function rr(x, y, w, h, r) { X.beginPath(); X.roundRect(x, y, w, h, r); }
function box(x, y, w, h, r, fill, o = {}) {
  if (o.shadow) { X.fillStyle = o.shadowC || COL.ink; rr(x + o.shadow, y + o.shadow * 1.15, w, h, r); X.fill(); }
  rr(x, y, w, h, r);
  if (fill) { X.fillStyle = fill; X.fill(); }
  if (o.stroke !== false) { X.lineWidth = o.sw || 7; X.strokeStyle = o.stroke || COL.ink; X.stroke(); }
}
// dark pill label, styled like the "disclaimer" button on fomies.family
function pill(text, x, y, sc = 1, o = {}) {
  if (sc <= 0.001) return;
  const size = o.size || 52, fam = o.fam || 'Fredoka', w = o.w || 600;
  const tw = measure(text, size, fam, w, o.ls || 0);
  const pw = tw + size * 1.3, ph = size * 1.65;
  X.save(); X.translate(x, y); X.scale(sc, sc); if (o.rot) X.rotate(o.rot);
  if (o.alpha != null) X.globalAlpha *= o.alpha;
  X.fillStyle = 'rgba(0,0,0,0.35)'; rr(-pw / 2 + 6, -ph / 2 + 10, pw, ph, ph / 2); X.fill();
  rr(-pw / 2, -ph / 2, pw, ph, ph / 2);
  X.fillStyle = o.bg || '#17151e'; X.fill();
  X.lineWidth = o.sw || 5; X.strokeStyle = o.border || '#4a4560'; X.stroke();
  T(text, 0, 2, { size, fam, w, fill: o.fill || '#fff', ls: o.ls || 0 });
  X.restore();
  return pw;
}
function drawCover(img, cx, cy, s, alpha = 1) {
  X.save(); X.globalAlpha *= alpha;
  X.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s);
  X.restore();
}
function strokePath(pts, prog, width, color) {
  if (prog <= 0) return;
  let total = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let rem = total * prog;
  X.save(); X.lineCap = 'round'; X.lineJoin = 'round'; X.lineWidth = width; X.strokeStyle = color;
  X.beginPath(); X.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && rem > 0; i++) {
    const k = Math.min(1, rem / seg[i - 1]);
    X.lineTo(lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k));
    rem -= seg[i - 1];
  }
  X.stroke(); X.restore();
}

// ---------- the fomies eye ----------
function eye(x, y, r, o = {}) {
  const bl = clamp(o.blink || 0), lx = (o.look && o.look[0]) || 0, ly = (o.look && o.look[1]) || 0;
  X.save(); X.translate(x, y); X.scale(1, Math.max(0.07, 1 - bl));
  X.beginPath(); X.arc(0, 0, r, 0, Math.PI * 2); X.fillStyle = '#d9d5e8'; X.fill();
  X.save(); X.clip();
  X.beginPath(); X.arc(-r * 0.1, -r * 0.12, r * 0.95, 0, Math.PI * 2); X.fillStyle = '#ffffff'; X.fill();
  const pw = r * (o.pupil || 1.0);
  const px = lx * r * 0.32, py = ly * r * 0.28;
  rr(px - pw / 2, py - pw / 2, pw, pw, pw * 0.16); X.fillStyle = '#0c0b10'; X.fill();
  X.fillStyle = '#fff';
  const q = pw * 0.15;
  X.fillRect(px - pw * 0.3, py - pw * 0.3, q, q);
  X.fillRect(px - pw * 0.3 + q * 1.1, py - pw * 0.3 - q * 0.65, q * 0.6, q * 0.6);
  X.fillRect(px + pw * 0.08, py - pw * 0.05, q * 0.55, q * 0.55);
  X.restore();
  X.beginPath(); X.arc(0, 0, r, 0, Math.PI * 2); X.lineWidth = r * 0.085; X.strokeStyle = COL.ink; X.stroke();
  X.restore();
}
function eyes(x, y, r, o = {}) { eye(x - r * 0.9, y, r, o); eye(x + r * 0.9, y, r, o); }

// ---------- logo ----------
const GLYPHS = {};
function glyph(ch, size) {
  const key = ch + size;
  if (GLYPHS[key]) return GLYPHS[key];
  const pad = size * 0.3, w = Math.ceil(measure(ch, size) + pad * 2), h = Math.ceil(size * 1.5);
  const c = offscreen(w, h), g = c.getContext('2d');
  const bx = pad, by = size * 1.1;
  g.font = font(size); g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  g.fillStyle = '#d4cdee'; g.fillText(ch, bx, by);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#ffffff'; g.fillText(ch, bx - size * 0.018, by - size * 0.028);
  g.globalCompositeOperation = 'destination-over';
  g.lineWidth = size * 0.15; g.strokeStyle = COL.ink; g.strokeText(ch, bx, by);
  g.lineWidth = size * 0.15; g.strokeText(ch, bx + size * 0.035, by + size * 0.05); g.fillStyle = COL.ink; g.fillText(ch, bx + size * 0.035, by + size * 0.05);
  GLYPHS[key] = { c, ox: pad, oy: by, w: measure(ch, size) };
  return GLYPHS[key];
}
const LOGO = ['f', 'o', 'm', 'ı', 'e', 's'];
// draws the "fomies" wordmark; cy is the baseline. Returns eye position.
function logo(cx, cy, size, lt, t0, o = {}) {
  const gs = LOGO.map(ch => glyph(ch, size));
  const kern = -size * 0.02;
  const total = gs.reduce((a, g) => a + g.w, 0) + kern * (gs.length - 1);
  let x = cx - total / 2; const pos = [];
  gs.forEach(g => { pos.push(x); x += g.w + kern; });
  gs.forEach((g, i) => {
    const ts = t0 + i * 0.075, p = P(lt, ts, ts + 0.55);
    if (p <= 0) return;
    const yo = lerp(-900, 0, E.back(P(p, 0, 0.75), 1.4));
    const k = P(p, 0.42, 1), sq = Math.sin(k * Math.PI) * 0.2 * (1 - k * 0.6);
    const wob = Math.sin(lt * 2.2 + i * 0.9) * size * 0.012 * (o.float ?? 1);
    X.save(); X.translate(pos[i] + g.w / 2, cy + yo + wob);
    X.scale(1 + sq, 1 - sq);
    X.drawImage(g.c, -g.w / 2 - g.ox, -g.oy);
    X.restore();
  });
  const iG = gs[3];
  const eyeX = pos[3] + iG.w / 2 + size * 0.015, eyeY = cy - size * 0.69;
  const pe = P(lt, t0 + 0.55, t0 + 0.95);
  if (pe > 0 && !o.noEye) {
    const s = E.back(pe, 3);
    const bl = bump(lt, t0 + 2.2, 0.08) + bump(lt, t0 + 4.4, 0.08);
    const lk = [Math.sin(lt * 1.3) * 0.8, Math.cos(lt * 1.1) * 0.4];
    X.save(); X.translate(eyeX, eyeY); X.rotate(0.12); X.scale(s, s);
    eye(0, 0, size * 0.135, { blink: bl, look: lk, pupil: 1.05 });
    X.restore();
  }
  return { eyeX, eyeY, total };
}

// ---------- backgrounds & overlays ----------
const PATS = {};
function dotsPattern(bg, dot, sp = 30, rad = 3.4) {
  const key = bg + dot + sp + rad;
  if (!PATS[key]) {
    const c = offscreen(sp, sp), g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, sp, sp);
    g.fillStyle = dot; g.beginPath(); g.arc(sp / 2, sp / 2, rad, 0, Math.PI * 2); g.fill();
    PATS[key] = { pat: X.createPattern(c, 'repeat'), sp };
  }
  return PATS[key];
}
function bgDots(bg, dot, t, o = {}) {
  const { pat, sp } = dotsPattern(bg, dot, o.sp || 30, o.rad || 3.4);
  const off = (t * (o.speed ?? 14)) % sp;
  X.save(); X.translate(-off, -off * 0.6); X.fillStyle = pat; X.fillRect(0, 0, W + sp * 2, H + sp * 2); X.restore();
  if (o.glow !== false) {
    const g = X.createRadialGradient(W / 2, H * 0.45, 50, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, o.glowC || 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    X.fillStyle = g; X.fillRect(0, 0, W, H);
  }
}
const bgLav = t => bgDots(COL.lav, COL.lavDot, t);
let VIG = null, GRAIN = [];
function initOverlays() {
  VIG = offscreen(W, H); const g = VIG.getContext('2d');
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(8,4,20,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 6; k++) {
    const c = offscreen(480, 270), gg = c.getContext('2d'), id = gg.createImageData(480, 270);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.random() * 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 20;
    }
    gg.putImageData(id, 0, 0); GRAIN.push(c);
  }
}
function vignette(a = 1) { X.save(); X.globalAlpha = a; X.drawImage(VIG, 0, 0); X.restore(); }
function grain(t) {
  X.save(); X.globalCompositeOperation = 'overlay'; X.globalAlpha = 0.55; X.imageSmoothingEnabled = false;
  X.drawImage(GRAIN[Math.floor(t * 24) % GRAIN.length], 0, 0, W, H); X.restore();
}
function darkRadial(cx, cy, r0, r1, a) {
  const g = X.createRadialGradient(cx, cy, r0, cx, cy, r1);
  g.addColorStop(0, 'rgba(5,6,12,0)'); g.addColorStop(1, `rgba(5,6,12,${a})`);
  X.fillStyle = g; X.fillRect(0, 0, W, H);
}

// ---------- floating character cards ----------
const FLOAT = [
  { k: 'yellow', x: 300, y: 270, s: 1.35, r: -0.05, d: 0.0, z: 1 },
  { k: 'peach', x: 1630, y: 270, s: 1.35, r: 0.06, d: 0.1, z: 1 },
  { k: 'blue', x: 1530, y: 950, s: 1.25, r: 0.0, d: 0.2, z: 1 },
  { k: 'mint', x: 170, y: 800, s: 1.25, r: 0.05, d: 0.15, z: 0.6 },
  { k: 'lavc', x: 470, y: 900, s: 1.0, r: -0.04, d: 0.25, z: 0.6 },
  { k: 'mint', x: 1170, y: 140, s: 0.9, r: -0.08, d: 0.3, z: 0.5 },
];
function floaters(t, lt, t0, o = {}) {
  FLOAT.forEach((f, i) => {
    const img = IMG[f.k]; const p = E.back(P(lt, t0 + f.d, t0 + f.d + 0.7), 1.6);
    if (p <= 0) return;
    const dirx = f.x < W / 2 ? -1 : 1, diry = f.y < H / 2 ? -1 : 1;
    const x = f.x + dirx * (1 - p) * 500 + Math.sin(t * 0.7 + i * 2) * 14 * f.z + (o.par || 0) * f.z;
    const y = f.y + diry * (1 - p) * 300 + Math.cos(t * 0.9 + i) * 16 * f.z;
    X.save(); X.translate(x, y); X.rotate(f.r + Math.sin(t * 0.6 + i) * 0.04);
    X.globalAlpha *= (o.alpha ?? 1) * (f.z < 1 ? 0.85 : 1);
    X.drawImage(img, -img.width * f.s / 2, -img.height * f.s / 2, img.width * f.s, img.height * f.s);
    X.restore();
  });
}

// ---------- stamps ----------
const STAMPS = {};
function makeStamp(lines, color, w, h, key) {
  if (STAMPS[key]) return STAMPS[key];
  const c = offscreen(w + 40, h + 40), g = c.getContext('2d');
  g.translate(20, 20);
  g.strokeStyle = color; g.fillStyle = color;
  g.lineWidth = 14; g.beginPath(); g.roundRect(7, 7, w - 14, h - 14, 18); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.roundRect(26, 26, w - 52, h - 52, 10); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((ln, i) => {
    const sz = ln.size; g.font = `800 ${sz}px Inter`; g.letterSpacing = (ln.ls || 4) + 'px';
    g.fillText(ln.t, w / 2, h / 2 + (i - (n - 1) / 2) * (ln.gap || sz * 1.1) + (ln.dy || 0));
  });
  // ink texture: erode random specks
  g.globalCompositeOperation = 'destination-out';
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 1400; i++) {
    g.globalAlpha = 0.3 + rnd() * 0.7;
    g.beginPath(); g.arc(rnd() * w, rnd() * h, rnd() * 3.2 + 0.4, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 7; i++) {
    g.globalAlpha = 0.25; g.lineWidth = 2 + rnd() * 6;
    g.beginPath(); const y = rnd() * h; g.moveTo(0, y); g.lineTo(w, y + (rnd() - 0.5) * 40); g.stroke();
  }
  STAMPS[key] = c; return c;
}
// slam a stamp: lands at time t0+0.16
function slamStamp(c, x, y, rot, lt, t0, o = {}) {
  const p = P(lt, t0, t0 + 0.16);
  if (p <= 0) return;
  const sc = lerp(2.8, 1, E.in(p)) * (o.scale || 1);
  const settle = 1 + bump(lt, t0 + 0.2, 0.08) * 0.04;
  X.save(); X.translate(x, y); X.rotate(rot); X.scale(sc * settle, sc * settle);
  X.globalAlpha *= clamp(p * 1.5) * (o.alpha ?? 0.92);
  if (o.mult !== false) X.globalCompositeOperation = 'multiply';
  X.drawImage(c, -c.width / 2, -c.height / 2);
  X.restore();
}

// ---------- captions ----------
function caption(s, t, t0, o = {}) {
  popWords(s, o.x ?? W / 2, o.y ?? 975, t, t0, { size: o.size || 66, stroke: COL.ink, sw: o.sw || 16, shadow: 7, stagger: o.stagger ?? 0.05, colors: o.colors, alpha: o.alpha, fill: o.fill });
}

// =========================================================
//                         SCENES
// =========================================================

// ---- S1: hook — "what is @FomiesNFT?" (0–5) ----
function S1(lt, t) {
  cue(0.22, 'pop', 0.9); cue(0.05, 'riser_short', 0.5);
  cue(0.9, 'pop', 0.7); cue(1.02, 'pop', 0.7);
  cue(0.7, 'blip', 0.5); cue(1.05, 'blip', 0.5); cue(1.45, 'blink', 0.6);
  cue(1.85, 'whoosh_in', 0.8);
  for (let i = 0; i < 6; i++) cue(2.0 + i * 0.075 + 0.35, 'boing', 0.55);
  cue(2.65, 'pop_big', 0.9); cue(3.15, 'pop', 0.9); cue(3.5, 'pop_big', 0.8);
  cue(4.75, 'whoosh', 0.8);

  X.fillStyle = '#0d0b14'; X.fillRect(0, 0, W, H);
  const rv = E.io(P(lt, 0.3, 1.2));
  if (rv > 0) {
    X.save(); X.beginPath(); X.arc(W / 2, H / 2, rv * 1150, 0, Math.PI * 2); X.clip();
    bgLav(t); floaters(t, lt, 2.3);
    X.restore();
  }
  // logo (baseline y=640)
  const L = logo(W / 2, 640, 300, lt, 2.0);
  // eyes intro
  if (lt < 2.35) {
    const open = E.back(P(lt, 0.15, 0.5), 2);
    let blink = Math.max(1 - open, bump(lt, 1.45, 0.1));
    let lx = 0;
    lx = lerp(0, -1, E.io(P(lt, 0.65, 0.85)));
    lx = lerp(lx, 1, E.io(P(lt, 1.0, 1.2)));
    lx = lerp(lx, 0, E.io(P(lt, 1.6, 1.8)));
    const k = E.in(P(lt, 1.85, 2.3));
    const r = lerp(165, 300 * 0.135 * 0.5, k);
    const x = lerp(W / 2, L.eyeX, k), y = lerp(H / 2 - 20, L.eyeY, k);
    X.save(); X.globalAlpha = 1 - P(lt, 2.2, 2.32);
    X.translate(x, y); X.rotate(k * 0.6);
    const s = 1 + bump(lt, 1.85, 0.12) * 0.12;
    X.scale(s, s);
    eyes(0, 0, r, { blink, look: [lx, 0] });
    X.restore();
  }
  // "what is"
  popWords('what is', W / 2, 205, lt, 0.85, { size: 120, stroke: COL.ink, sw: 22, shadow: 9, stagger: 0.12 });
  // @FomiesNFT pill + ?
  const pp = E.back(P(lt, 3.0, 3.35), 2.2);
  const pw = pill('@FomiesNFT', W / 2 - 40, 850, pp, { size: 74 });
  const qp = E.back(P(lt, 3.35, 3.7), 3);
  if (qp > 0 && pw) {
    X.save(); X.translate(W / 2 - 40 + pw / 2 + 85, 835); X.rotate(0.25 + Math.sin(lt * 5) * 0.12); X.scale(qp, qp);
    T('?', 0, 0, { size: 190, fill: COL.yellow, stroke: COL.ink, sw: 26, shadow: 9 });
    X.restore();
  }
}

// ---- S2: case file — "an NFT collection built around a fictional government office" (5–10) ----
function S2(lt, t) {
  const t0 = 5;
  cue(t0 + 0.05, 'paper', 0.9);
  [['SUBJECT: @FomiesNFT', 0.55, 30], ['an NFT collection built around', 1.3, 34], ['a fictional government office:', 2.3, 34]].forEach(([s, st, cps]) => {
    for (let i = 0; i < s.length; i++) if (s[i] !== ' ') cue(t0 + st + (i + 1) / cps, i % 7 === 3 ? 'type2' : 'type', 0.5);
  });
  cue(t0 + 3.6, 'whoosh_in', 0.6);
  cue(t0 + 3.76, 'stamp', 1.0); shake(t0 + 3.76, 26, 0.5);
  cue(t0 + 4.35, 'pop', 0.8);
  cue(t0 + 4.75, 'whoosh', 0.8);

  bgDots('#1e1932', '#2a2346', t, { glowC: 'rgba(178,164,240,0.18)' });
  const zoom = 1 + lt * 0.012;
  const slideIn = E.back(P(lt, 0, 0.55), 1.2);
  const slideOut = E.in(P(lt, 4.7, 5.0));
  X.save();
  X.translate(W / 2, H / 2 + (1 - slideIn) * 1100 - slideOut * 1200);
  X.scale(zoom, zoom); X.rotate(-0.025 + (1 - slideIn) * 0.15);
  // folder
  X.fillStyle = 'rgba(0,0,0,0.35)'; rr(-760 + 18, -400 + 26, 1520, 860, 26); X.fill();
  box(-760, -475, 620, 130, 22, '#d9b46a', { sw: 7 });
  T('CASE FILE · DEPT. OF FOMO', -450, -436, { size: 30, fam: 'Inter', w: 800, fill: '#6d4d16', ls: 2 });
  box(-760, -400, 1520, 860, 26, '#e7c47c', { sw: 7 });
  // paper
  X.save(); X.rotate(0.012);
  box(-700, -350, 1400, 760, 10, COL.paper, { sw: 5, stroke: '#3a3226' });
  X.strokeStyle = 'rgba(80,120,200,0.18)'; X.lineWidth = 2;
  for (let y = -250; y < 400; y += 62) { X.beginPath(); X.moveTo(-660, y); X.lineTo(660, y); X.stroke(); }
  X.strokeStyle = 'rgba(207,42,51,0.35)'; X.beginPath(); X.moveTo(-560, -350); X.lineTo(-560, 410); X.stroke();
  T('OFFICIAL RECORD  —  FORM 001', -530, -300, { size: 30, fam: 'Elite', w: 400, fill: '#7b6f5c', align: 'left' });
  // paperclip
  X.save(); X.translate(560, -360); X.rotate(0.2); X.lineWidth = 9; X.strokeStyle = '#8b93a3'; X.lineCap = 'round';
  X.beginPath(); X.moveTo(0, 90); X.lineTo(0, -10); X.arc(22, -10, 22, Math.PI, 0); X.lineTo(44, 110); X.arc(22, 110, 22, 0, Math.PI); X.lineTo(0, 30); X.stroke(); X.restore();
  // typed lines
  const a = typeText('SUBJECT: @FomiesNFT', -530, -205, lt, 0.55, 30, { size: 46, fam: 'Elite', w: 400, fill: '#2a2620', caretUntil: 1.3 });
  const b = typeText('an NFT collection built around', -530, -60, lt, 1.3, 34, { size: 72, fam: 'Elite', w: 400, fill: COL.ink, caretUntil: 2.3 });
  typeText('a fictional government office:', -530, 45, lt, 2.3, 34, { size: 72, fam: 'Elite', w: 400, fill: COL.ink, caretUntil: 3.5 });
  // highlight
  const hp = E.out(P(lt, 3.25, 3.55));
  if (hp > 0) { X.save(); X.globalCompositeOperation = 'multiply'; X.fillStyle = 'rgba(247,197,49,0.75)'; X.fillRect(-25, 5, 535 * hp, 72); X.restore(); }
  // stamp
  const st = makeStamp([{ t: 'THE DEPARTMENT', size: 76, ls: 6 }, { t: 'OF FOMO', size: 112, ls: 10 }, { t: '— EST. 2026 —', size: 40, ls: 8, dy: 8 }], COL.red, 860, 330, 'dept');
  slamStamp(st, 170, 255, -0.09, lt, 3.6);
  // splatter
  const sp = P(lt, 3.76, 4.0);
  if (sp > 0) {
    X.save(); X.globalCompositeOperation = 'multiply'; X.fillStyle = COL.red;
    for (let i = 0; i < 14; i++) {
      const ang = hash(i) * Math.PI * 2, d = 330 + hash(i + 9) * 160;
      X.globalAlpha = 0.7 * (1 - sp * 0.2);
      X.beginPath(); X.arc(170 + Math.cos(ang) * d * E.out(sp), 255 + Math.sin(ang) * d * 0.45 * E.out(sp), 3 + hash(i + 3) * 7, 0, 7); X.fill();
    }
    X.restore();
  }
  X.restore();
  // folder tab icon chip
  const fp = E.back(P(lt, 4.25, 4.55), 2.5);
  if (fp > 0) {
    X.save(); X.translate(W - 300, 160); X.rotate(0.12); X.scale(fp, fp);
    folderIcon(0, 0, 1);
    X.restore();
  }
  X.restore();
}
function folderIcon(x, y, s) {
  X.save(); X.translate(x, y); X.scale(s, s);
  box(-110, -95, 90, 40, 10, '#f0b43c', { sw: 6 });
  box(-110, -75, 220, 160, 16, '#f0b43c', { sw: 6 });
  box(-95, -60, 190, 60, 6, '#fff', { sw: 5 });
  box(-110, -35, 220, 120, 16, '#f7c94f', { sw: 6 });
  X.restore();
}

// ---- S3a: "the website isn't a normal landing page." (10–12.4) ----
function S3a(lt, t) {
  const t0 = 10;
  for (let i = 0; i < 4; i++) cue(t0 + 0.15 + i * 0.07, 'pop', 0.5);
  cue(t0 + 0.55, 'pop', 0.5); cue(t0 + 0.63, 'pop', 0.5); cue(t0 + 0.71, 'pop', 0.5);
  cue(t0 + 0.95, 'marker', 0.9);
  cue(t0 + 1.35, 'whoosh_in', 0.6);
  for (let i = 0; i < 6; i++) cue(t0 + 1.45 + i * 0.07, 'pop', 0.6);
  cue(t0 + 1.85, 'pop_big', 0.8);
  bgDots('#100e18', '#1a1726', t, { glowC: 'rgba(178,164,240,0.12)' });
  const up = E.io(P(lt, 1.3, 1.6)) * 90;
  popWords("the website isn't a", W / 2, 330 - up, lt, 0.15, { size: 92, stroke: COL.ink, sw: 0, stagger: 0.07 });
  const fade = 1 - P(lt, 1.2, 1.5) * 0.55;
  popWords('normal landing page.', W / 2, 470 - up, lt, 0.55, { size: 110, fill: '#c9c3df', stagger: 0.08, alpha: fade });
  // strike-through
  const sp = E.out(P(lt, 0.95, 1.25));
  const wl = measure('normal landing page.', 110);
  strokePath([[W / 2 - wl / 2 - 30, 482 - up], [W / 2, 470 - up], [W / 2 + wl / 2 + 30, 462 - up]], sp, 20, COL.red);
  popWords("it's a building you walk through.", W / 2, 690 - up * 0.3, lt, 1.45, {
    size: 112, stroke: COL.ink, sw: 20, shadow: 8, stagger: 0.07,
    colors: [null, null, COL.yellow, null, null, null],
  });
  // little building icon
  const bp = E.back(P(lt, 1.85, 2.2), 2.5);
  if (bp > 0) { X.save(); X.translate(W / 2, 860); X.scale(bp, bp); buildingIcon(); X.restore(); }
}
function buildingIcon() {
  box(-110, -80, 220, 170, 10, '#3d4a63', { sw: 6, stroke: '#f0ecff' });
  X.fillStyle = COL.ink; X.beginPath(); X.moveTo(-130, -80); X.lineTo(0, -150); X.lineTo(130, -80); X.closePath();
  X.fillStyle = COL.lav; X.fill(); X.lineWidth = 6; X.strokeStyle = '#f0ecff'; X.stroke();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) box(-80 + i * 60, -50 + j * 55, 40, 36, 4, j === 1 && i === 1 ? COL.yellow : '#7f8fb3', { sw: 3, stroke: '#f0ecff' });
  box(-22, 40, 44, 50, 4, COL.wood, { sw: 3, stroke: '#f0ecff' });
}

// ---- S3b: walking the corridor, boarded-up door (12.4–14.8) ----
function S3b(lt, t) {
  const t0 = 12.4;
  for (let i = 0; i < 5; i++) cue(t0 + 0.1 + i * 0.5, 'step', 0.55);
  cue(t0 + 0.3, 'pop', 0.7);
  cue(t0 + 0.95, 'hammer', 1); shake(t0 + 0.95, 16, 0.3);
  cue(t0 + 1.15, 'hammer', 1); shake(t0 + 1.15, 16, 0.3);
  cue(t0 + 1.4, 'pop', 0.7);
  cue(t0 + 2.2, 'whoosh', 0.7);
  X.fillStyle = '#000'; X.fillRect(0, 0, W, H);
  const img = IMG.corridor; // 1080 x 1847
  const zoom = 1 + 0.07 * (lt / 2.4);
  const s = (W / img.width) * zoom;
  const topY = lerp(110, 400, E.io(clamp(lt / 2.4)));
  const bob = Math.abs(Math.sin(lt * Math.PI * 2)) * 7;
  const ox = W / 2 - img.width * s / 2 + Math.sin(lt * Math.PI) * 6, oy = -topY * s + bob;
  const toS = (ix, iy) => [ox + ix * s, oy + iy * s];
  X.drawImage(img, ox, oy, img.width * s, img.height * s);
  // "you are here" pill over the site's UI pill
  const [px, py] = toS(661, 400);
  pill('you are here', px, py, E.back(P(lt, 0.3, 0.6), 2.4), { size: 44 * s });
  // planks on the WC door
  const planks = [[105, 650, 0.42, 0.95], [110, 840, -0.38, 1.15]];
  planks.forEach(([ix, iy, rot, ts]) => {
    const p = P(lt, ts - 0.12, ts);
    if (p <= 0) return;
    const [x, y] = toS(ix, iy);
    const sc = lerp(1.7, 1, E.in(p)) * s;
    X.save(); X.translate(x, y); X.rotate(rot); X.scale(sc, sc); X.globalAlpha = clamp(p * 2);
    box(-190, -30, 380, 60, 6, '#b07a42', { sw: 6, shadow: 6, shadowC: 'rgba(0,0,0,0.5)' });
    X.strokeStyle = 'rgba(80,45,15,0.6)'; X.lineWidth = 3;
    for (let k = 0; k < 3; k++) { X.beginPath(); X.moveTo(-170, -12 + k * 12); X.lineTo(170, -14 + k * 13); X.stroke(); }
    X.fillStyle = '#ccc'; [[-160, 0], [160, 0]].forEach(([nx, ny]) => { X.beginPath(); X.arc(nx, ny, 8, 0, 7); X.fill(); X.lineWidth = 3; X.strokeStyle = COL.ink; X.stroke(); });
    X.restore();
  });
  darkRadial(W / 2, H / 2, 300, 1200, 0.65);
  const cp = E.back(P(lt, 1.4, 1.7), 2.2);
  if (cp > 0) {
    X.save(); X.translate(360, 860); X.rotate(-0.08); X.scale(cp, cp);
    hazardLabel('BOARDED UP', 0, 0, 52);
    X.restore();
  }
  pill('G · MAIN CORRIDOR', 260, 90, E.back(P(lt, 0.05, 0.35), 2), { size: 34, fam: 'Inter', w: 800, ls: 3 });
  caption('one door is boarded up.', t, t0 + 1.25, { y: 990 });
}
function hazardLabel(text, x, y, size) {
  const tw = measure(text, size, 'Inter', 800, 3);
  const w = tw + 110, h = size * 1.7;
  X.save(); X.translate(x, y);
  X.fillStyle = 'rgba(0,0,0,0.4)'; X.fillRect(-w / 2 + 8, -h / 2 + 10, w, h);
  X.fillStyle = COL.yellow; X.fillRect(-w / 2, -h / 2, w, h);
  X.save(); X.beginPath(); X.rect(-w / 2, -h / 2, w, h); X.clip();
  X.fillStyle = COL.ink;
  for (let i = -w; i < w; i += 40) {
    X.beginPath(); X.moveTo(i, -h / 2); X.lineTo(i + 20, -h / 2); X.lineTo(i + 20 - 14, -h / 2 + 12); X.lineTo(i - 14, -h / 2 + 12); X.fill();
    X.beginPath(); X.moveTo(i, h / 2 - 12); X.lineTo(i + 20, h / 2 - 12); X.lineTo(i + 20 - 14, h / 2); X.lineTo(i - 14, h / 2); X.fill();
  }
  X.restore();
  X.lineWidth = 6; X.strokeStyle = COL.ink; X.strokeRect(-w / 2, -h / 2, w, h);
  T(text, 0, 3, { size, fam: 'Inter', w: 800, fill: COL.ink, ls: 3 });
  X.restore();
}

// ---- S3c: elevator under repair (14.8–17) ----
function S3c(lt, t) {
  const t0 = 14.8;
  cue(t0 + 0.05, 'elevator_broken', 0.9);
  cue(t0 + 0.45, 'buzz', 0.6); cue(t0 + 1.35, 'buzz', 0.5);
  cue(t0 + 0.65, 'stamp', 0.8); shake(t0 + 0.65, 20, 0.35);
  cue(t0 + 2.0, 'whoosh', 0.7);
  X.fillStyle = '#000'; X.fillRect(0, 0, W, H);
  const img = IMG.elevator;
  const s = (W / img.width) * lerp(1.3, 1.04, E.out(clamp(lt / 2.2)));
  X.drawImage(img, W / 2 - 540 * s, H / 2 - 545 * s, img.width * s, img.height * s);
  // flicker
  const fl = noise1(t * 18) > 0.72 ? 0.45 : 0;
  const fl2 = (bump(lt, 0.45, 0.06) + bump(lt, 1.35, 0.05)) * 0.6;
  X.fillStyle = `rgba(0,0,0,${Math.max(fl, fl2)})`; X.fillRect(0, 0, W, H);
  // sparks
  [0.45, 1.35].forEach((st, si) => {
    const p = P(lt, st, st + 0.5);
    if (p <= 0 || p >= 1) return;
    for (let i = 0; i < 22; i++) {
      const a = -Math.PI / 2 + (hash(i + si * 40) - 0.5) * 2.4, v = 300 + hash(i * 3 + si) * 500;
      const x = 1010 + Math.cos(a) * v * p, y = 175 + Math.sin(a) * v * p + 900 * p * p;
      X.fillStyle = `rgba(255,${200 + hash(i) * 55},90,${1 - p})`;
      X.beginPath(); X.arc(x, y, 4 * (1 - p) + 1, 0, 7); X.fill();
    }
  });
  darkRadial(W / 2, H / 2, 350, 1150, 0.55);
  // banner
  const bp = P(lt, 0.5, 0.66);
  if (bp > 0) {
    X.save(); X.translate(W / 2, 880); X.rotate(-0.05); const sc = lerp(2.2, 1, E.in(bp)); X.scale(sc, sc);
    X.globalAlpha = clamp(bp * 2);
    hazardLabel('ELEVATOR: UNDER REPAIR', 0, 0, 74);
    X.restore();
  }
  pill('G · ELEVATOR', 210, 90, E.back(P(lt, 0.05, 0.35), 2), { size: 34, fam: 'Inter', w: 800, ls: 3 });
}

// ---- S4a: building directory → basement (17–19) ----
function S4a(lt, t) {
  const t0 = 17;
  cue(t0 + 0.05, 'riser_down', 0.7);
  for (let i = 0; i < 6; i++) cue(t0 + 0.3 + i * 0.13, 'click', 0.7);
  cue(t0 + 1.2, 'marker', 0.7); cue(t0 + 1.55, 'pop', 0.8);
  bgDots('#1b1a24', '#24222f', t, { glowC: 'rgba(255,230,180,0.12)' });
  const sc = E.back(P(lt, 0, 0.4), 1.3) * (1 + lt * 0.015);
  X.save(); X.translate(W / 2, 600); X.scale(sc, sc);
  box(-640, -390, 1280, 780, 18, COL.woodD, { sw: 8, shadow: 14, shadowC: 'rgba(0,0,0,0.5)' });
  box(-600, -350, 1200, 700, 8, '#141317', { sw: 4, stroke: '#000' });
  // felt grooves
  X.strokeStyle = 'rgba(255,255,255,0.035)'; X.lineWidth = 2;
  for (let y = -340; y < 350; y += 12) { X.beginPath(); X.moveTo(-595, y); X.lineTo(595, y); X.stroke(); }
  const rows = [
    ['BUILDING DIRECTORY', '', COL.gold],
    ['G', 'MAIN CORRIDOR', '#eee'],
    ['G', 'ELEVATOR ........ OUT OF ORDER', '#eee'],
    ['?', 'DOOR ........... BOARDED UP', '#eee'],
    ['B', 'CORRIDOR B', '#fff'],
    ['B', 'INTAKE OFFICE', '#fff'],
  ];
  rows.forEach((r, i) => {
    const p = P(lt, 0.25 + i * 0.13, 0.25 + i * 0.13 + 0.12);
    if (p <= 0) return;
    const y = -265 + i * 105 + (i ? 20 : 0);
    X.save(); X.globalAlpha = p; X.translate(0, (1 - p) * -14);
    if (i === 0) T(r[0], 0, y, { size: 58, fam: 'Inter', w: 800, fill: r[2], ls: 10 });
    else {
      if (i >= 4) {
        const hp = E.out(P(lt, 1.2 + (i - 4) * 0.12, 1.45 + (i - 4) * 0.12));
        X.fillStyle = 'rgba(247,197,49,0.92)'; X.fillRect(-520, y - 40, 1040 * hp, 80);
      }
      const c = i >= 4 && lt > 1.3 + (i - 4) * 0.12 ? COL.ink : r[2];
      T(r[0], -470, y, { size: 54, fam: 'Inter', w: 800, fill: c });
      T(r[1], -400, y, { size: 50, fam: 'Inter', w: 700, fill: c, align: 'left', ls: 4 });
    }
    X.restore();
  });
  // arrow
  const ap = E.back(P(lt, 1.55, 1.8), 2.5);
  if (ap > 0) {
    X.save(); X.translate(560 + Math.sin(lt * 12) * 8, 270); X.scale(ap, ap);
    X.fillStyle = COL.red; X.strokeStyle = COL.ink; X.lineWidth = 6;
    X.beginPath(); X.moveTo(-60, 0); X.lineTo(10, -50); X.lineTo(10, -22); X.lineTo(80, -22); X.lineTo(80, 22); X.lineTo(10, 22); X.lineTo(10, 50); X.closePath(); X.fill(); X.stroke();
    X.restore();
  }
  X.restore();
  caption('somewhere in the basement...', t, t0 + 0.1, { y: 105, size: 72 });
}

// ---- S4b: corridor b, intake office (19–21) ----
function S4b(lt, t) {
  const t0 = 19;
  cue(t0 + 0.02, 'drone', 0.8);
  cue(t0 + 0.35, 'pop', 0.7); cue(t0 + 0.9, 'pop', 0.6);
  cue(t0 + 1.8, 'whoosh', 0.7);
  const img = IMG.closed;
  const z = lerp(1.0, 1.14, E.io(clamp(lt / 2)));
  X.save(); X.translate(960, 430); X.scale(z, z); X.translate(-960, -430);
  X.drawImage(img, 0, 0, W, H);
  X.restore();
  // vent flicker
  const fl = noise1(t * 10 + 3) > 0.8 ? 0.25 : 0;
  X.fillStyle = `rgba(0,0,0,${fl})`; X.fillRect(0, 0, W, H);
  darkRadial(W / 2, 450, 300, 1150, 0.6);
  // hanging sign
  const sp = E.back(P(lt, 0.3, 0.7), 1.5);
  if (sp > 0) {
    const sw = Math.sin(lt * 5) * 0.06 * (1 - P(lt, 0.3, 2));
    X.save(); X.translate(380, -20 + (1 - sp) * -300); X.rotate(sw);
    X.strokeStyle = '#555'; X.lineWidth = 5;
    X.beginPath(); X.moveTo(-120, 0); X.lineTo(-120, 120); X.moveTo(120, 0); X.lineTo(120, 120); X.stroke();
    box(-230, 110, 460, 150, 14, '#1f6f4a', { sw: 7, shadow: 8, shadowC: 'rgba(0,0,0,0.5)' });
    X.lineWidth = 3; X.strokeStyle = '#e8f3ec'; rr(-214, 126, 428, 118, 8); X.stroke();
    T('CORRIDOR B', 0, 168, { size: 58, fam: 'Inter', w: 800, fill: '#fff', ls: 3 });
    T('INTAKE OFFICE  →', 0, 220, { size: 30, fam: 'Inter', w: 700, fill: '#d6efe1', ls: 4 });
    X.restore();
  }
  pill('B · CORRIDOR B', 1700, 90, E.back(P(lt, 0.05, 0.35), 2), { size: 34, fam: 'Inter', w: 800, ls: 3 });
  caption("corridor b. there's an intake office.", t, t0 + 0.85, { y: 985, colors: [COL.yellow, COL.yellow] });
}

// ---- S5: window three, the clerk, the motto (21–27) ----
function S5(lt, t) {
  const t0 = 21;
  cue(t0 + 0.35, 'rattle', 0.9);
  cue(t0 + 1.25, 'pop', 0.6);
  cue(t0 + 2.95, 'riser', 0.8);
  cue(t0 + 3.05, 'whoosh_in', 0.7);
  cue(t0 + 3.55, 'stamp', 1.0); shake(t0 + 3.55, 22, 0.4);
  cue(t0 + 4.25, 'stamp', 1.0); shake(t0 + 4.25, 28, 0.5);
  cue(t0 + 4.3, 'impact', 0.9);
  cue(t0 + 5.75, 'whoosh', 0.7);
  // camera
  const zin = E.io(P(lt, 2.9, 3.5));
  const zoom = lerp(1, 1.75, zin), fx = lerp(960, 1006, zin), fy = lerp(520, 404, zin);
  X.save();
  X.translate(960, lerp(540, 470, zin)); X.scale(zoom, zoom); X.translate(-fx, -fy);
  // wall
  bgDots(COL.navy, '#33405a', t * 0.3, { glow: false, sp: 34, rad: 2.6 });
  X.fillStyle = '#212a39'; X.fillRect(-200, 900, W + 400, 400);
  X.fillStyle = COL.ink; X.fillRect(-200, 895, W + 400, 10);
  // window frame
  box(450, 170, 1020, 720, 16, '#7a4a22', { sw: 8, shadow: 14, shadowC: 'rgba(0,0,0,0.45)' });
  X.save(); rr(500, 215, 920, 620, 6); X.clip();
  bgDots('#b1a3ee', '#a090e2', 0, { glow: false });
  X.drawImage(IMG.clerk, 650, 215, 620, 620);
  // glass reflections
  X.fillStyle = 'rgba(255,255,255,0.13)';
  const rx = 520 + Math.sin(t * 0.5) * 30;
  X.beginPath(); X.moveTo(rx, 835); X.lineTo(rx + 120, 835); X.lineTo(rx + 420, 215); X.lineTo(rx + 300, 215); X.fill();
  X.beginPath(); X.moveTo(rx + 180, 835); X.lineTo(rx + 220, 835); X.lineTo(rx + 520, 215); X.lineTo(rx + 480, 215); X.fill();
  // blinds
  const bottom = lerp(835, 225, E.io(P(lt, 0.35, 1.15)));
  const n = 20, gap = (bottom - 215) / n;
  if (bottom > 226) {
    for (let i = 0; i < n; i++) {
      const y = 215 + i * gap;
      X.fillStyle = i % 2 ? '#e3dccb' : '#d8d0bc'; X.fillRect(500, y, 920, gap + 1);
      X.fillStyle = 'rgba(0,0,0,0.25)'; X.fillRect(500, y + gap - 3, 920, 3);
    }
  }
  X.fillStyle = '#cfc6b0'; X.fillRect(500, bottom - 4, 920, 14);
  X.restore();
  X.lineWidth = 7; X.strokeStyle = COL.ink; rr(500, 215, 920, 620, 6); X.stroke();
  // plate
  box(780, 105, 360, 86, 14, COL.gold, { sw: 7, shadow: 6 });
  T('WINDOW 3', 960, 150, { size: 50, fam: 'Inter', w: 800, fill: COL.ink, ls: 4 });
  [[800, 125], [1120, 125], [800, 172], [1120, 172]].forEach(([x, y]) => { X.fillStyle = '#9b7a1e'; X.beginPath(); X.arc(x, y, 5, 0, 7); X.fill(); });
  // counter
  box(400, 835, 1120, 60, 10, '#9a6634', { sw: 7 });
  box(430, 790, 240, 52, 8, COL.ink, { sw: 0, stroke: false });
  T('THE CLERK', 550, 817, { size: 26, fam: 'Inter', w: 800, fill: '#f4e7c5', ls: 3 });
  box(1240, 772, 220, 70, 8, '#101015', { sw: 5 });
  T('NOW SERVING', 1350, 790, { size: 18, fam: 'Inter', w: 800, fill: '#ff6a5f', ls: 2 });
  T('042', 1350, 820, { size: 30, fam: 'Inter', w: 800, fill: '#ff3b30', ls: 6 });
  X.restore();
  darkRadial(W / 2, 520, 380 + zin * 200, 1150, 0.7);
  // surveillance overlay
  if (zin > 0.02) {
    X.save(); X.globalAlpha = zin;
    X.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = (t * 120) % 6; y < H; y += 6) X.fillRect(0, y, W, 2);
    const bl = Math.floor(t * 2.5) % 2 === 0;
    if (bl) { X.fillStyle = '#ff3b30'; X.beginPath(); X.arc(90, 90, 16, 0, 7); X.fill(); }
    T('REC  ·  WINDOW 3  ·  CORRIDOR B', 125, 92, { size: 32, fam: 'Inter', w: 800, align: 'left', fill: '#fff', ls: 3 });
    X.strokeStyle = 'rgba(255,255,255,0.85)'; X.lineWidth = 5;
    const c = 60, m = 50;
    [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
      X.beginPath(); X.moveTo(x, y + sy * c); X.lineTo(x, y); X.lineTo(x + sx * c, y); X.stroke();
    });
    X.restore();
  }
  // texts
  if (lt < 3.0) caption('behind window three sits the clerk.', t, t0 + 1.25, { y: 985, colors: [null, COL.yellow, COL.yellow], alpha: 1 - P(lt, 2.7, 2.95) });
  pill('the motto:', W / 2, 668, E.back(P(lt, 3.15, 3.4), 2.2), { size: 44 });
  const m1 = P(lt, 3.4, 3.55), m2 = P(lt, 4.1, 4.25);
  if (m1 > 0) { X.save(); X.translate(W / 2, 790); const s = lerp(2.4, 1, E.in(m1)); X.scale(s, s); X.globalAlpha = m1; T('ALWAYS EARLY.', 0, 0, { size: 150, stroke: COL.ink, sw: 26, shadow: 10 }); X.restore(); }
  if (m2 > 0) { X.save(); X.translate(W / 2, 948); const s = lerp(2.4, 1, E.in(m2)); X.scale(s, s); X.globalAlpha = m2; T('ALWAYS WATCHING.', 0, 0, { size: 150, fill: COL.yellow, stroke: COL.ink, sw: 26, shadow: 10 }); X.restore(); }
}

// ---- S6: whitelist process (27–35) ----
function bell(lt, ring) {
  const r = P(lt, ring, ring + 1.0);
  const press = bump(lt, ring + 0.03, 0.06);
  const wob = r > 0 && r < 1 ? Math.sin(r * 40) * 0.07 * (1 - r) : 0;
  X.save(); X.rotate(wob);
  X.fillStyle = '#2a2a33'; X.strokeStyle = COL.ink; X.lineWidth = 7;
  X.beginPath(); X.ellipse(0, 70, 150, 30, 0, 0, Math.PI * 2); X.fill(); X.stroke();
  X.fillStyle = '#3a3a46'; X.fillRect(-150, 55, 300, 15);
  // dome
  const g = X.createLinearGradient(-120, -60, 120, 60);
  g.addColorStop(0, '#ffe58a'); g.addColorStop(0.45, COL.gold); g.addColorStop(1, '#a8770f');
  X.fillStyle = g; X.beginPath(); X.moveTo(-125, 60); X.bezierCurveTo(-125, -95, 125, -95, 125, 60); X.closePath(); X.fill(); X.stroke();
  X.fillStyle = 'rgba(255,255,255,0.6)'; X.beginPath(); X.ellipse(-50, -10, 18, 40, 0.5, 0, 7); X.fill();
  // plunger
  const py = press * 18;
  X.fillStyle = '#c9ccd3'; X.fillRect(-10, -100 + py, 20, 40); X.strokeRect(-10, -100 + py, 20, 40);
  X.beginPath(); X.ellipse(0, -104 + py, 34, 13, 0, 0, 7); X.fill(); X.stroke();
  X.restore();
  // ring waves
  if (r > 0 && r < 1) {
    X.strokeStyle = COL.ink; X.lineWidth = 8; X.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const rr2 = 150 + k * 40 + r * 60, a = clamp(1 - r * 1.3);
      X.globalAlpha = a;
      X.beginPath(); X.arc(0, 0, rr2, -2.6, -2.1); X.stroke();
      X.beginPath(); X.arc(0, 0, rr2, -1.05, -0.55); X.stroke();
      X.globalAlpha = 1;
    }
  }
  const dp = E.back(P(lt, ring, ring + 0.25), 3);
  if (dp > 0 && lt < ring + 1.3) {
    X.save(); X.translate(110, -150); X.rotate(0.2); X.scale(dp, dp);
    T('DING!', 0, 0, { size: 70, fill: COL.red, stroke: COL.ink, sw: 0 });
    X.restore();
  }
}
function ticketMachine(lt, t0) {
  const p = E.out(P(lt, t0, t0 + 0.5));
  // ticket
  const th = 170 * p;
  if (th > 1) {
    X.save(); X.translate(0, 10); X.rotate(Math.sin(lt * 3) * 0.02);
    box(-70, 0, 140, th, 6, '#fff7e0', { sw: 5 });
    X.save(); rr(-70, 0, 140, th, 6); X.clip();
    T('No.', 0, th - 128, { size: 26, fam: 'Inter', w: 800, fill: COL.ink });
    T('042', 0, th - 80, { size: 60, fam: 'Inter', w: 800, fill: COL.red });
    X.setLineDash([8, 8]); X.strokeStyle = '#999'; X.lineWidth = 3; X.beginPath(); X.moveTo(-60, th - 30); X.lineTo(60, th - 30); X.stroke(); X.setLineDash([]);
    X.restore(); X.restore();
  }
  box(-130, -200, 260, 220, 26, COL.red, { sw: 7 });
  box(-100, -175, 200, 70, 12, '#fff', { sw: 5 });
  T('TAKE A', 0, -157, { size: 26, fam: 'Inter', w: 800, fill: COL.ink });
  T('NUMBER', 0, -127, { size: 26, fam: 'Inter', w: 800, fill: COL.ink });
  box(-85, -5, 170, 22, 8, COL.ink, { sw: 0, stroke: false });
  X.fillStyle = 'rgba(255,255,255,0.35)'; X.beginPath(); X.ellipse(-80, -70, 14, 34, 0, 0, 7); X.fill();
}
function questions(lt, t0) {
  for (let i = 0; i < 3; i++) {
    const y = -170 + i * 95;
    box(-170, y - 28, 56, 56, 10, '#fff', { sw: 6 });
    T('Q' + (i + 1), -80, y, { size: 40, fam: 'Inter', w: 800, fill: COL.ink, align: 'left' });
    X.fillStyle = '#c9c4d8'; rr(-10, y - 7, 180, 14, 7); X.fill();
    const cp = E.out(P(lt, t0 + i * 0.25, t0 + i * 0.25 + 0.18));
    strokePath([[-158, y], [-142, y + 16], [-108, y - 26]], cp, 13, COL.green);
  }
}
function S6(lt, t) {
  const t0 = 27;
  cue(t0 + 0.12, 'pop', 0.6); cue(t0 + 0.3, 'paper', 0.8);
  cue(t0 + 0.95, 'marker', 0.9); cue(t0 + 1.15, 'marker', 0.9);
  cue(t0 + 1.62, 'crumple', 0.9);
  for (let i = 0; i < 3; i++) cue(t0 + 2.0 + i * 1.1, 'whoosh_in', 0.6);
  cue(t0 + 2.45, 'ding', 1.0);
  cue(t0 + 3.45, 'print', 0.9);
  for (let i = 0; i < 3; i++) cue(t0 + 4.55 + i * 0.25, 'tick', 0.9);
  cue(t0 + 5.45, 'whoosh', 0.7);
  cue(t0 + 5.75, 'paper', 0.7);
  for (let i = 0; i < 9; i++) cue(t0 + 6.05 + i * 0.1 + i * i * 0.004, 'tick_soft', 0.55);
  cue(t0 + 7.06, 'stamp', 1.0); shake(t0 + 7.06, 26, 0.5);
  cue(t0 + 7.75, 'whoosh', 0.7);
  bgLav(t);
  // part A: the boring form
  if (lt < 2.0) {
    const out = E.in(P(lt, 1.6, 1.95));
    popWords('to apply for whitelist', W / 2, 120, lt, 0.1, { size: 84, stroke: COL.ink, sw: 18, shadow: 8, alpha: 1 - out });
    const dp = E.back(P(lt, 0.25, 0.65), 1.5);
    X.save(); X.translate(W / 2 + out * 700, 668 + (1 - dp) * 900 + out * 300); X.rotate(-0.03 + out * 3); X.scale(0.94 - out * 0.8, 0.94 - out * 0.8);
    box(-300, -330, 600, 660, 12, '#fff', { sw: 7, shadow: 12 });
    T('FORM WL-27B', -250, -270, { size: 38, fam: 'Inter', w: 800, fill: COL.ink, align: 'left' });
    T('(boring)', 250, -270, { size: 30, fam: 'Elite', w: 400, fill: COL.grey, align: 'right' });
    ['NAME', 'WALLET', 'REASON', 'MORE REASON', 'SIGNATURE'].forEach((f, i) => {
      const y = -170 + i * 100;
      T(f, -250, y, { size: 24, fam: 'Inter', w: 700, fill: COL.grey, align: 'left', ls: 2 });
      X.fillStyle = '#d7d4e0'; X.fillRect(-250, y + 30, 500, 5);
    });
    strokePath([[-230, -250], [230, 260]], E.out(P(lt, 0.95, 1.15)), 30, COL.red);
    strokePath([[230, -250], [-230, 260]], E.out(P(lt, 1.15, 1.35)), 30, COL.red);
    X.restore();
    caption("you don't fill in a boring form.", t, t0 + 0.9, { y: 222, size: 64, colors: [null, COL.red, COL.red], alpha: 1 - out });
  }
  // part B: three steps
  if (lt >= 1.9 && lt < 5.9) {
    const out = E.in(P(lt, 5.4, 5.75));
    popWords('ring. take a number. answer.', W / 2, 120, lt, 1.95, { size: 84, stroke: COL.ink, sw: 18, shadow: 8, stagger: 0.09, alpha: 1 - out });
    const titles = ['ring the bell', 'take a number', 'answer 3 questions'];
    for (let i = 0; i < 3; i++) {
      const ts = 2.0 + i * 1.1, p = E.back(P(lt, ts, ts + 0.45), 1.6);
      if (p <= 0) continue;
      const x = 420 + i * 540, y = 590 + (1 - p) * 900 + out * 900;
      X.save(); X.translate(x, y); X.rotate((1 - p) * 0.4 + (i - 1) * 0.025);
      box(-235, -300, 470, 600, 36, '#fff', { sw: 8, shadow: 14 });
      X.beginPath(); X.arc(-185, -250, 44, 0, 7); X.fillStyle = COL.lav; X.fill(); X.lineWidth = 7; X.strokeStyle = COL.ink; X.stroke();
      T(String(i + 1), -185, -247, { size: 56, fill: '#fff', stroke: COL.ink, sw: 10 });
      T(titles[i], 0, 215, { size: 48, w: 600, fill: COL.ink });
      X.save(); X.translate(0, -30);
      if (i === 0) bell(lt, 2.45);
      if (i === 1) { X.translate(0, 30); ticketMachine(lt, 3.45); }
      if (i === 2) { X.translate(-10, 70); questions(lt, 4.55); }
      X.restore();
      X.restore();
    }
  }
  // part C: the department decides
  if (lt >= 5.6) {
    const p = E.back(P(lt, 5.65, 6.05), 1.4);
    const out = E.in(P(lt, 7.7, 8.0));
    popWords('then the department decides', W / 2, 105, lt, 5.6, { size: 78, stroke: COL.ink, sw: 16, shadow: 8, stagger: 0.06, alpha: 1 - out });
    popWords('what to do with you.', W / 2, 205, lt, 5.85, { size: 78, stroke: COL.ink, sw: 16, shadow: 8, stagger: 0.06, colors: [null, null, null, null, COL.yellow], alpha: 1 - out });
    X.save(); X.translate(W / 2, 640 + (1 - p) * 800 - out * 900); X.rotate(0.015);
    box(-560, -310, 1120, 620, 14, COL.paper, { sw: 7, shadow: 14 });
    T('APPLICATION No. 042', -500, -240, { size: 46, fam: 'Inter', w: 800, fill: COL.ink, align: 'left', ls: 2 });
    X.fillStyle = COL.ink; X.fillRect(-500, -200, 1000, 5);
    T('APPLICANT:', -500, -130, { size: 34, fam: 'Elite', w: 400, fill: '#555', align: 'left' });
    T('you', -260, -130, { size: 46, fam: 'Marker', w: 400, fill: '#2457c5', align: 'left' });
    T('BELL RUNG:  yes      TICKET:  042      ANSWERS:  3/3', -500, -50, { size: 32, fam: 'Elite', w: 400, fill: '#555', align: 'left' });
    T('STATUS:', -500, 70, { size: 46, fam: 'Inter', w: 800, fill: COL.ink, align: 'left' });
    // slot reel
    box(-280, 20, 640, 100, 14, '#16141d', { sw: 6 });
    const words = ['APPROVED', 'DENIED', 'MAYBE', 'PENDING', 'LUNCH', 'APPROVED', 'DENIED', 'HMMM...', 'PENDING', '???'];
    let k = 0;
    for (let i = 0; i < 9; i++) if (lt >= 6.05 + i * 0.1 + i * i * 0.004) k = i + 1;
    X.save(); rr(-280, 20, 640, 100, 14); X.clip();
    const wv = lt < 6.05 ? '— — —' : words[Math.min(k, words.length - 1)];
    T(wv, 40, 72, { size: 56, fam: 'Inter', w: 800, fill: k >= 9 ? COL.yellow : '#fff', ls: 4 });
    X.restore();
    const st = makeStamp([{ t: 'UNDER REVIEW', size: 104, ls: 8 }, { t: 'DEPARTMENT OF FOMO', size: 34, ls: 10 }], COL.red, 860, 260, 'review');
    slamStamp(st, 160, 215, -0.12, lt, 6.9);
    X.restore();
  }
}

// ---- S7: inside the office (35–43) ----
function clipboard(lt, t0) {
  box(-150, -200, 300, 400, 22, '#a8743f', { sw: 7, shadow: 10 });
  box(-125, -160, 250, 340, 6, '#fff', { sw: 5 });
  box(-60, -222, 120, 48, 14, '#c9ccd3', { sw: 6 });
  T('TASKS', 0, -115, { size: 38, fam: 'Inter', w: 800, fill: COL.ink, ls: 3 });
  for (let i = 0; i < 4; i++) {
    const y = -50 + i * 58;
    box(-100, y - 17, 34, 34, 7, '#fff', { sw: 5 });
    X.fillStyle = '#cfcbdc'; rr(-50, y - 6, 150 - (i % 2) * 40, 12, 6); X.fill();
    strokePath([[-93, y], [-84, y + 10], [-64, y - 16]], E.out(P(lt, t0 + 0.45 + i * 0.15, t0 + 0.6 + i * 0.15)), 9, COL.green);
  }
}
let CORK = null;
function noticeboard(lt, t0) {
  if (!CORK) {
    const c = offscreen(64, 64), g = c.getContext('2d');
    g.fillStyle = '#c99659'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 90; i++) { g.fillStyle = hash(i) > 0.5 ? 'rgba(120,70,20,0.35)' : 'rgba(255,230,180,0.3)'; g.fillRect(hash(i * 3) * 64, hash(i * 7) * 64, 2, 2); }
    CORK = X.createPattern(c, 'repeat');
  }
  box(-200, -165, 400, 330, 14, COL.woodD, { sw: 7, shadow: 10 });
  X.fillStyle = CORK; X.fillRect(-178, -143, 356, 286);
  X.lineWidth = 4; X.strokeStyle = COL.ink; X.strokeRect(-178, -143, 356, 286);
  const papers = [[-110, -70, 120, 140, '#fff', -0.08], [20, -85, 130, 100, COL.red, 0.06], [100, 30, 110, 120, '#fff6a8', -0.1], [-95, 70, 140, 90, COL.lavL, 0.05], [10, 50, 90, 110, '#ffd2c2', 0.12]];
  papers.forEach(([x, y, w, h, c, r], i) => {
    const p = E.back(P(lt, t0 + 0.3 + i * 0.08, t0 + 0.55 + i * 0.08), 2);
    if (p <= 0) return;
    X.save(); X.translate(x, y); X.rotate(r + Math.sin(lt * 3 + i) * 0.03); X.scale(p, p);
    X.fillStyle = 'rgba(0,0,0,0.3)'; X.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
    X.fillStyle = c; X.fillRect(-w / 2, -h / 2, w, h); X.lineWidth = 3; X.strokeStyle = COL.ink; X.strokeRect(-w / 2, -h / 2, w, h);
    if (c === COL.red) { T('PUBLIC', 0, -18, { size: 20, fam: 'Inter', w: 800, fill: '#fff' }); T('NOTICE', 0, 6, { size: 20, fam: 'Inter', w: 800, fill: '#fff' }); }
    else { X.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 4; k++) X.fillRect(-w / 2 + 12, -h / 2 + 22 + k * 16, w - 24 - (k % 2) * 20, 5); }
    X.fillStyle = COL.red; X.beginPath(); X.arc(0, -h / 2 + 8, 9, 0, 7); X.fill(); X.stroke();
    X.restore();
  });
}
function frameImg(img, x, y, w, h, crop) {
  box(x - w / 2 - 16, y - h / 2 - 16, w + 32, h + 32, 6, COL.gold, { sw: 6, shadow: 8 });
  X.save(); X.beginPath(); X.rect(x - w / 2, y - h / 2, w, h); X.clip();
  X.fillStyle = COL.lav; X.fillRect(x - w / 2, y - h / 2, w, h);
  const [cx, cy, cw, ch] = crop || [0, 0, img.width, img.height];
  X.drawImage(img, cx, cy, cw, ch, x - w / 2, y - h / 2, w, h);
  X.restore(); X.lineWidth = 4; X.strokeStyle = COL.ink; X.strokeRect(x - w / 2, y - h / 2, w, h);
}
function gallery(lt, t0) {
  const sw = i => Math.sin(lt * 2 + i) * 0.02;
  X.save(); X.rotate(sw(0)); frameImg(IMG.clerk, 0, -60, 190, 230, [60, 0, 280, 340]); X.restore();
  X.save(); X.translate(-150, 90); X.rotate(-0.06 + sw(1)); frameImg(IMG.yellow, 0, 0, 110, 120, [40, 30, 140, 150]); X.restore();
  X.save(); X.translate(150, 90); X.rotate(0.06 + sw(2)); frameImg(IMG.peach, 0, 0, 110, 120, [35, 30, 130, 145]); X.restore();
  box(-80, 120, 160, 50, 6, COL.gold, { sw: 5 });
  T('STAFF', 0, 146, { size: 26, fam: 'Inter', w: 800, fill: COL.ink, ls: 4 });
}
function barcode(x, y, w, h) {
  let cx = x; let i = 0;
  X.fillStyle = COL.ink;
  while (cx < x + w) { const bw = 2 + Math.floor(hash(i) * 4); if (i % 2 === 0) X.fillRect(cx, y, bw, h); cx += bw + 1; i++; }
}
function idFront() {
  box(-150, -210, 300, 420, 24, '#fff', { sw: 7 });
  X.save(); rr(-150, -210, 300, 420, 24); X.clip();
  X.fillStyle = COL.blue; X.fillRect(-150, -210, 300, 92);
  X.restore();
  rr(-150, -210, 300, 420, 24); X.lineWidth = 7; X.strokeStyle = COL.ink; X.stroke();
  X.fillStyle = COL.ink; X.fillRect(-150, -120, 300, 5);
  T('DEPT. OF FOMO', 0, -178, { size: 26, fam: 'Inter', w: 800, fill: '#fff', ls: 2 });
  T('STAFF ID', 0, -144, { size: 18, fam: 'Inter', w: 800, fill: '#dbe5ff', ls: 6 });
  frameImg(IMG.clerk, 0, -10, 150, 150, [40, 0, 320, 320]);
  T('THE CLERK', 0, 108, { size: 30, fam: 'Inter', w: 800, fill: COL.ink, ls: 2 });
  T('WINDOW 3 · CORRIDOR B', 0, 138, { size: 15, fam: 'Inter', w: 700, fill: COL.grey, ls: 2 });
  barcode(-100, 158, 200, 32);
  // clip hole
  X.fillStyle = COL.ink; rr(-28, -204, 56, 12, 6); X.fill();
}
function idBack() {
  box(-150, -210, 300, 420, 24, COL.lav, { sw: 7 });
  X.save(); rr(-150, -210, 300, 420, 24); X.clip();
  bgDots(COL.lav, COL.lavDot, 0, { glow: false, sp: 22, rad: 2.6 });
  X.restore();
  rr(-150, -210, 300, 420, 24); X.lineWidth = 7; X.strokeStyle = COL.ink; X.stroke();
  T('fomies', 0, -110, { size: 76, stroke: COL.ink, sw: 14, shadow: 5 });
  // qr-ish
  box(-70, -50, 140, 140, 8, '#fff', { sw: 5 });
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) if (hash(i * 13 + j * 7) > 0.5) { X.fillStyle = COL.ink; X.fillRect(-58 + i * 13, -38 + j * 13, 12, 12); }
  [[-58, -38], [32, -38], [-58, 52]].forEach(([x, y]) => { X.fillStyle = '#fff'; X.fillRect(x - 2, y - 2, 30, 30); X.lineWidth = 5; X.strokeRect(x + 2, y + 2, 22, 22); X.fillStyle = COL.ink; X.fillRect(x + 8, y + 8, 10, 10); });
  T('always early,', 0, 130, { size: 26, fam: 'Elite', w: 400, fill: COL.ink });
  T('always watching.', 0, 162, { size: 26, fam: 'Elite', w: 400, fill: COL.ink });
  X.fillStyle = COL.ink; rr(-28, -204, 56, 12, 6); X.fill();
}
function cursor(x, y, press) {
  X.save(); X.translate(x, y); const s = 1 - press * 0.15; X.scale(s, s);
  X.fillStyle = '#fff'; X.strokeStyle = COL.ink; X.lineWidth = 5; X.lineJoin = 'round';
  X.beginPath(); X.moveTo(0, 0); X.lineTo(0, 62); X.lineTo(16, 48); X.lineTo(28, 74); X.lineTo(40, 68); X.lineTo(28, 43); X.lineTo(48, 42); X.closePath(); X.fill(); X.stroke();
  X.restore();
}
function S7(lt, t) {
  const t0 = 35;
  cue(t0 + 0.05, 'door', 0.8);
  cue(t0 + 0.15, 'pop', 0.6);
  for (let i = 0; i < 4; i++) { cue(t0 + 0.6 + i * 0.8, 'whoosh_in', 0.55); cue(t0 + 0.85 + i * 0.8, 'thud', 0.7); }
  for (let i = 0; i < 4; i++) cue(t0 + 0.6 + 0.45 + i * 0.15, 'tick_soft', 0.5);
  cue(t0 + 4.2, 'whoosh', 0.6);
  cue(t0 + 4.8, 'flip', 0.9); cue(t0 + 5.9, 'flip', 0.9);
  cue(t0 + 6.35, 'click', 0.9); cue(t0 + 6.95, 'click', 0.9);
  cue(t0 + 6.4, 'pop', 0.7); cue(t0 + 7.0, 'pop', 0.7);
  cue(t0 + 7.75, 'whoosh', 0.7);
  bgDots(COL.navy, '#36435c', t, { glowC: 'rgba(255,225,170,0.16)' });
  X.fillStyle = '#222b3a'; X.fillRect(0, 960, W, 120); X.fillStyle = COL.ink; X.fillRect(0, 955, W, 8);
  const xs = [255, 725, 1195, 1665];
  const labels = [['tasks on a', 'clipboard'], ['a noticeboard', 'full of papers'], ['the staff', 'gallery'], ['an id card you can', 'flip, export & share']];
  const focus = E.io(P(lt, 4.2, 4.7)) * (1 - E.io(P(lt, 7.6, 7.95)));
  popWords("inside the office you'll find:", W / 2, 105, lt, 0.15, { size: 80, stroke: COL.ink, sw: 16, shadow: 8, stagger: 0.06, alpha: 1 - focus });
  for (let i = 0; i < 4; i++) {
    const ts = 0.6 + i * 0.8, p = E.back(P(lt, ts, ts + 0.45), 1.7);
    if (p <= 0) continue;
    const lift = Math.sin(lt * 1.6 + i) * 6;
    let x = xs[i], y = 500 + (1 - p) * -900 + lift, sc = 1, a = 1;
    if (i === 3) { x = lerp(xs[3], W / 2, focus); y = lerp(y, 520, focus); sc = lerp(1, 1.55, focus); }
    else a = 1 - focus * 0.75;
    X.save(); X.globalAlpha = a; X.translate(x, y); X.rotate((1 - p) * 0.5 * (i % 2 ? 1 : -1)); X.scale(sc, sc);
    if (i === 0) clipboard(lt, ts);
    if (i === 1) noticeboard(lt, ts);
    if (i === 2) gallery(lt, ts);
    if (i === 3) {
      // lanyard
      X.strokeStyle = COL.lav; X.lineWidth = 16; X.beginPath(); X.moveTo(-10, -205); X.lineTo(-60, -290); X.moveTo(10, -205); X.lineTo(60, -290); X.stroke();
      const fa = E.io(P(lt, 4.8, 5.3)) * Math.PI - E.io(P(lt, 5.9, 6.3)) * Math.PI;
      const sx = Math.cos(fa);
      X.save(); X.scale(Math.max(0.02, Math.abs(sx)), 1);
      if (sx >= 0) idFront(); else idBack();
      X.restore();
    }
    X.restore();
    const lp = E.back(P(lt, ts + 0.25, ts + 0.6), 2);
    if (lp > 0) {
      X.save(); X.globalAlpha = (1 - focus) * clamp(lp * 2); X.translate(xs[i], 830); X.scale(lp, lp);
      T(labels[i][0], 0, 0, { size: 40, stroke: COL.ink, sw: 10 });
      T(labels[i][1], 0, 50, { size: 40, stroke: COL.ink, sw: 10, fill: COL.yellow });
      X.restore();
    }
  }
  if (focus > 0.01) {
    popWords('flip it.', 520, 420, lt, 4.8, { size: 76, stroke: COL.ink, sw: 16, shadow: 7, alpha: focus });
    const b1 = E.back(P(lt, 6.3, 6.55), 2.5) * focus, b2 = E.back(P(lt, 6.9, 7.15), 2.5) * focus;
    pill('export  ⤓', 1430, 470, b1 * (1 - bump(lt, 6.4, 0.06) * 0.1), { size: 56, bg: COL.yellow, fill: COL.ink, border: COL.ink });
    pill('share  ↗', 1430, 630, b2 * (1 - bump(lt, 7.0, 0.06) * 0.1), { size: 56, bg: COL.lav, fill: COL.ink, border: COL.ink });
    // cursor path
    const c1 = E.io(P(lt, 5.9, 6.3)), c2 = E.io(P(lt, 6.55, 6.9));
    const cx = lerp(lerp(1800, 1470, c1), 1460, c2), cy = lerp(lerp(900, 480, c1), 640, c2);
    if (lt > 5.85) cursor(cx, cy, bump(lt, 6.35, 0.06) + bump(lt, 6.95, 0.06));
  }
}

// ---- S8: opening hours (43–47) ----
function S8(lt, t) {
  const t0 = 43;
  cue(t0 + 0.05, 'whoosh_in', 0.7); cue(t0 + 0.38, 'chain', 0.9); cue(t0 + 0.4, 'thud', 0.8);
  cue(t0 + 0.95, 'pop', 0.7); cue(t0 + 1.25, 'pop', 0.7);
  cue(t0 + 1.7, 'pop', 0.7); cue(t0 + 2.05, 'marker', 0.9);
  cue(t0 + 3.75, 'whoosh', 0.7);
  bgDots('#262234', '#302b42', t, { glowC: 'rgba(255,220,160,0.2)' });
  const drop = E.back(P(lt, 0, 0.4), 1.2);
  const sw = Math.sin((lt - 0.4) * 4.6) * 0.09 * Math.exp(-1.4 * Math.max(0, lt - 0.4)) * (lt > 0.4 ? 1 : 0);
  X.save(); X.translate(W / 2, -40 + (1 - drop) * -900); X.rotate(sw);
  // chains
  X.strokeStyle = '#8d8f99'; X.lineWidth = 6;
  for (const sx of [-1, 1]) for (let k = 0; k < 9; k++) { X.beginPath(); X.ellipse(sx * 440, 30 + k * 26, 7, 14, 0, 0, 7); X.stroke(); }
  X.translate(0, 560);
  box(-560, -300, 1120, 640, 30, '#f7f1e2', { sw: 9, shadow: 16, shadowC: 'rgba(0,0,0,0.5)' });
  X.save(); rr(-560, -300, 1120, 640, 30); X.clip(); X.fillStyle = COL.red; X.fillRect(-560, -300, 1120, 150); X.restore();
  rr(-560, -300, 1120, 640, 30); X.lineWidth = 9; X.strokeStyle = COL.ink; X.stroke();
  X.fillStyle = COL.ink; X.fillRect(-560, -152, 1120, 7);
  T('OPENING HOURS', 0, -222, { size: 92, fill: '#fff', stroke: COL.ink, sw: 14, shadow: 6 });
  const r1 = P(lt, 0.9, 1.15), r2 = P(lt, 1.6, 1.85);
  if (r1 > 0) {
    X.save(); X.globalAlpha = r1; X.translate((1 - E.out(r1)) * -60, 0);
    T('MON – FRI', -480, -40, { size: 66, fam: 'Inter', w: 800, fill: COL.ink, align: 'left' });
    X.restore();
    X.save(); X.globalAlpha = P(lt, 1.2, 1.4);
    X.setLineDash([4, 14]); X.lineCap = 'round'; X.lineWidth = 6; X.strokeStyle = '#b9b2a0'; X.beginPath(); X.moveTo(-90, -30); X.lineTo(150, -30); X.stroke(); X.setLineDash([]);
    T('when open', 480, -40, { size: 70, fam: 'Elite', w: 400, fill: COL.ink, align: 'right' });
    X.restore();
  }
  if (r2 > 0) {
    X.save(); X.globalAlpha = r2; X.translate((1 - E.out(r2)) * -60, 0);
    T('SAT – SUN', -480, 140, { size: 66, fam: 'Inter', w: 800, fill: COL.ink, align: 'left' });
    X.restore();
    X.save(); X.globalAlpha = P(lt, 1.9, 2.0);
    X.setLineDash([4, 14]); X.lineCap = 'round'; X.lineWidth = 6; X.strokeStyle = '#b9b2a0'; X.beginPath(); X.moveTo(-90, 150); X.lineTo(100, 150); X.stroke(); X.setLineDash([]);
    X.restore();
    const wp = E.out(P(lt, 2.05, 2.6));
    X.save(); X.beginPath(); X.rect(120, 30, 440 * wp, 240); X.clip();
    X.translate(140, 140); X.rotate(-0.05);
    T('allegedly.', 0, 0, { size: 84, fam: 'Marker', w: 400, fill: COL.red, align: 'left' });
    X.restore();
    strokePath([[150, 205], [320, 196], [520, 200]], E.out(P(lt, 2.6, 2.85)), 7, COL.red);
  }
  X.restore();
}

// ---- S9: honesty (47–54) ----
function S9(lt, t) {
  const t0 = 47;
  for (let i = 0; i < 6; i++) cue(t0 + 0.1 + i * 0.06, 'pop', 0.45);
  cue(t0 + 0.6, 'shimmer', 0.9); cue(t0 + 0.65, 'pop_big', 0.8);
  cue(t0 + 1.75, 'whoosh', 0.6);
  cue(t0 + 2.2, 'pop_big', 0.8); cue(t0 + 2.45, 'pop_big', 0.8); cue(t0 + 2.7, 'pop_big', 0.8);
  cue(t0 + 3.55, 'whoosh', 0.6); cue(t0 + 3.7, 'riser_short', 0.6);
  cue(t0 + 4.1, 'stamp', 1.0); shake(t0 + 4.1, 24, 0.45);
  cue(t0 + 4.8, 'whoosh', 0.6); cue(t0 + 4.95, 'pop', 0.8);
  cue(t0 + 5.85, 'marker', 0.8);
  cue(t0 + 5.25, 'whoosh_in', 0.6); cue(t0 + 6.25, 'pop', 0.7);
  cue(t0 + 6.75, 'whoosh', 0.7);
  bgLav(t);
  // A: honesty
  if (lt < 1.95) {
    const out = E.in(P(lt, 1.65, 1.9));
    popWords('what i like most is the', W / 2, 250, lt, 0.1, { size: 84, stroke: COL.ink, sw: 16, shadow: 7, alpha: 1 - out });
    const hp = E.back(P(lt, 0.6, 1.0), 2);
    if (hp > 0) {
      X.save(); X.translate(W / 2, 610 - out * 100); X.scale(hp * (1 - out * 0.3), hp * (1 - out * 0.3)); X.globalAlpha = 1 - out;
      // halo
      X.save(); X.translate(0, -150 + Math.sin(lt * 4) * 10); X.rotate(-0.06); X.lineWidth = 22; X.strokeStyle = COL.ink;
      X.beginPath(); X.ellipse(0, 0, 200, 42, 0, 0, 7); X.stroke(); X.lineWidth = 12; X.strokeStyle = COL.gold; X.stroke(); X.restore();
      T('honesty.', 0, 20, { size: 250, stroke: COL.ink, sw: 36, shadow: 14 });
      X.restore();
      // sparkles
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + lt * 0.6, d = 520 + Math.sin(lt * 3 + i) * 30;
        const s = (0.6 + 0.4 * Math.sin(lt * 6 + i * 2)) * hp * (1 - out);
        sparkle(W / 2 + Math.cos(a) * d, 600 + Math.sin(a) * d * 0.45, 26 * s);
      }
    }
  }
  // B: art, entertainment, community
  if (lt >= 1.8 && lt < 3.75) {
    const out = E.in(P(lt, 3.45, 3.72));
    popWords('fomies are digital collectibles made for', W / 2, 300, lt, 1.85, { size: 70, stroke: COL.ink, sw: 14, shadow: 7, stagger: 0.04, alpha: 1 - out });
    const chips = [['ART', COL.yellow, 360, -0.07], ['ENTERTAINMENT', COL.peach, 850, 0.04], ['COMMUNITY', COL.blue, 1450, -0.04]];
    chips.forEach(([txt, c, x, r], i) => {
      const p = E.back(P(lt, 2.2 + i * 0.25, 2.55 + i * 0.25), 2.6);
      if (p <= 0) return;
      const tw = measure(txt, 66, 'Fredoka', 700);
      X.save(); X.translate(x, 560 + Math.sin(lt * 3 + i) * 8 + out * 700); X.rotate(r); X.scale(p, p);
      box(-tw / 2 - 50, -75, tw + 100, 150, 30, c, { sw: 8, shadow: 12 });
      T(txt, 0, 4, { size: 66, fill: i === 2 ? '#fff' : COL.ink, stroke: i === 2 ? COL.ink : null, sw: 12 });
      X.restore();
    });
    // little characters peeking
    const cp = E.back(P(lt, 2.9, 3.3), 1.8) * (1 - out);
    if (cp > 0) {
      [['yellow', 360, 780, -0.1], ['peach', 850, 790, 0.08], ['blue', 1450, 800, -0.05]].forEach(([k, x, y, r], i) => {
        const img = IMG[k], s = k === 'blue' ? 0.8 : 1.05;
        X.save(); X.translate(x, y + (1 - cp) * 300); X.rotate(r + Math.sin(lt * 4 + i) * 0.05);
        X.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s); X.restore();
      });
    }
  }
  // C: no promises of profit
  if (lt >= 3.55 && lt < 4.95) {
    const out = E.in(P(lt, 4.7, 4.92));
    X.save(); X.globalAlpha = 1 - out;
    // chart
    const cp = E.io(P(lt, 3.6, 4.0));
    X.save(); X.translate(W / 2, 430);
    box(-260, -220, 520, 400, 30, '#fff', { sw: 8, shadow: 12 });
    X.strokeStyle = '#ddd'; X.lineWidth = 3; for (let k = 0; k < 4; k++) { X.beginPath(); X.moveTo(-220, -150 + k * 80); X.lineTo(220, -150 + k * 80); X.stroke(); }
    const pts = [[-210, 120], [-120, 60], [-40, 90], [50, -20], [120, 10], [210, -160]];
    strokePath(pts, cp, 16, COL.green);
    if (cp >= 1) { X.fillStyle = COL.green; X.beginPath(); X.moveTo(225, -185); X.lineTo(170, -170); X.lineTo(215, -125); X.fill(); }
    // prohibition
    const np = P(lt, 3.94, 4.1);
    if (np > 0) {
      const s = lerp(2.5, 1, E.in(np));
      X.save(); X.scale(s, s); X.globalAlpha = np;
      X.lineWidth = 46; X.strokeStyle = COL.ink; X.beginPath(); X.arc(0, -20, 230, 0, 7); X.stroke();
      X.beginPath(); X.moveTo(-162, -182); X.lineTo(162, 142); X.stroke();
      X.lineWidth = 30; X.strokeStyle = COL.red; X.beginPath(); X.arc(0, -20, 230, 0, 7); X.stroke();
      X.beginPath(); X.moveTo(-162, -182); X.lineTo(162, 142); X.stroke();
      X.restore();
    }
    X.restore();
    popWords('no promises of profit.', W / 2, 840, lt, 3.7, { size: 110, stroke: COL.ink, sw: 20, shadow: 9, stagger: 0.07, colors: [COL.red] });
    X.restore();
  }
  // D: disclaimer
  if (lt >= 4.8) {
    const p = E.back(P(lt, 4.85, 5.25), 1.5);
    X.save(); X.translate(790, 580 + (1 - p) * 900); X.rotate(-0.012);
    box(-650, -260, 1300, 520, 30, '#fff', { sw: 9, shadow: 16 });
    // highlight
    const hp = E.out(P(lt, 5.85, 6.2));
    const l2 = 'because a weird little character';
    const w2 = measure(l2, 74, 'Fredoka', 600), wa = measure('because a ', 74, 'Fredoka', 600), wh = measure('weird little character', 74, 'Fredoka', 600);
    if (hp > 0) { X.fillStyle = COL.yellow; rr(-w2 / 2 + wa - 12, -42, (wh + 24) * hp, 84, 12); X.fill(); }
    popWords("don't make financial decisions", 0, -110, lt, 5.0, { size: 74, w: 600, fill: COL.ink, stagger: 0.035 });
    popWords(l2, 0, 0, lt, 5.2, { size: 74, w: 600, fill: COL.ink, stagger: 0.035 });
    popWords('behind a desk told you to.', 0, 110, lt, 5.4, { size: 74, w: 600, fill: COL.ink, stagger: 0.035 });
    pill('disclaimer', 0, -265, E.back(P(lt, 4.95, 5.25), 2.4), { size: 54 });
    X.restore();
    // clerk peeking
    const cp = E.back(P(lt, 5.25, 5.7), 1.6);
    if (cp > 0) {
      X.save(); X.translate(1680, 1100 - cp * 340); X.rotate(-0.12 + Math.sin(lt * 5) * 0.04);
      X.beginPath(); X.arc(0, 0, 175, 0, 7); X.fillStyle = COL.lav; X.fill();
      X.save(); X.clip(); X.drawImage(IMG.clerk, -230, -170, 460, 460); X.restore();
      X.lineWidth = 9; X.strokeStyle = COL.ink; X.beginPath(); X.arc(0, 0, 175, 0, 7); X.stroke();
      X.restore();
      const bp = E.back(P(lt, 6.25, 6.5), 2.4);
      if (bp > 0) {
        X.save(); X.translate(1665, 470); X.rotate(-0.05); X.scale(bp, bp);
        box(-200, -44, 400, 88, 44, '#fff', { sw: 7, shadow: 7 });
        X.fillStyle = '#fff'; X.beginPath(); X.moveTo(20, 40); X.lineTo(40, 100); X.lineTo(80, 40); X.fill();
        X.lineWidth = 7; X.strokeStyle = COL.ink; X.beginPath(); X.moveTo(20, 44); X.lineTo(40, 100); X.lineTo(80, 44); X.stroke();
        T('*not financial advice', 0, 2, { size: 31, w: 600, fill: COL.ink });
        X.restore();
      }
    }
  }
}
function sparkle(x, y, r) {
  if (r <= 0.5) return;
  X.save(); X.translate(x, y); X.fillStyle = '#fff'; X.strokeStyle = COL.ink; X.lineWidth = r * 0.18;
  X.beginPath();
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, d = i % 2 ? r * 0.3 : r; X.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
  X.closePath(); X.fill(); X.stroke(); X.restore();
}

// ---- S10: outro (54–60) ----
function S10(lt, t) {
  const t0 = 54;
  for (let i = 0; i < 6; i++) cue(t0 + 0.2 + i * 0.075 + 0.35, 'boing', 0.55);
  cue(t0 + 0.85, 'pop_big', 0.9);
  cue(t0 + 1.0, 'pop', 0.7); cue(t0 + 1.45, 'pop_big', 0.8);
  cue(t0 + 2.45, 'click', 1.0); cue(t0 + 2.5, 'shimmer', 0.8);
  cue(t0 + 1.9, 'pop', 0.7); cue(t0 + 3.1, 'pop', 0.6);
  cue(t0 + 5.3, 'blink', 0.8); cue(t0 + 5.55, 'end_hit', 1.0);
  bgLav(t);
  floaters(t, lt, 0.0, { par: Math.sin(lt * 0.5) * 20 });
  logo(W / 2, 470, 280, lt, 0.2);
  pill('the department of fomo · est. 2026', W / 2, 585, E.back(P(lt, 1.0, 1.3), 2.2), { size: 40, fam: 'Elite', w: 400 });
  // website button
  const bp = E.back(P(lt, 1.45, 1.8), 2.2);
  if (bp > 0) {
    const press = bump(lt, 2.48, 0.08);
    X.save(); X.translate(W / 2, 745); X.scale(bp * (1 - press * 0.06), bp * (1 - press * 0.06));
    const tw = measure('fomies.family  →', 82, 'Fredoka', 700);
    box(-tw / 2 - 60, -70, tw + 120, 140, 70, '#fff', { sw: 9, shadow: press ? 4 : 12 });
    T('fomies.family  →', 0, 4, { size: 82, fill: COL.ink });
    X.restore();
    const rp = P(lt, 2.48, 3.1);
    if (rp > 0 && rp < 1) { X.save(); X.globalAlpha = 1 - rp; X.lineWidth = 8; X.strokeStyle = '#fff'; rr(W / 2 - tw / 2 - 60 - rp * 60, 675 - rp * 60, tw + 120 + rp * 120, 140 + rp * 120, 70 + rp * 60); X.stroke(); X.restore(); }
    const c = E.io(P(lt, 1.9, 2.4));
    if (lt > 1.85 && lt < 3.6) cursor(lerp(1500, W / 2 + 180, c), lerp(1000, 770, c), press);
  }
  popWords('@FomiesNFT', W / 2, 890, lt, 1.9, { size: 64, w: 700, stroke: COL.ink, sw: 14, shadow: 6 });
  popWords('always early. always watching.', W / 2, 990, lt, 3.1, { size: 44, fam: 'Elite', w: 400, fill: COL.ink, stagger: 0.05 });
}

// =========================================================
//                     TRANSITIONS
// =========================================================
function blinkT(t, at, d = 0.22) {
  let c = 0;
  if (t >= at - d && t < at) c = E.in(P(t, at - d, at));
  else if (t >= at && t < at + d) c = 1 - E.out(P(t, at, at + d));
  if (c <= 0) return;
  const h = c * (H / 2 + 80);
  X.fillStyle = '#0b0a10';
  X.beginPath(); X.moveTo(0, 0); X.lineTo(W, 0); X.lineTo(W, h - 80); X.quadraticCurveTo(W / 2, h + 80, 0, h - 80); X.closePath(); X.fill();
  X.beginPath(); X.moveTo(0, H); X.lineTo(W, H); X.lineTo(W, H - h + 80); X.quadraticCurveTo(W / 2, H - h - 80, 0, H - h + 80); X.closePath(); X.fill();
}
function wipeT(t, at, d = 0.32, cols = [COL.yellow, COL.lav, COL.ink]) {
  if (t < at - d || t > at + d) return;
  cols.forEach((c, i) => {
    const k = (t - (at - d)) / (2 * d) - i * 0.06 + 0.06;
    const pos = lerp(-W * 1.6, W * 1.6, E.io(clamp(k)));
    X.save(); X.translate(W / 2 + pos, H / 2); X.rotate(-0.35);
    X.fillStyle = c; X.fillRect(-W * 0.62, -H * 1.5, W * 1.24, H * 3);
    X.restore();
  });
}
function flashT(t, at, d = 0.18) {
  const a = bump(t, at, d);
  if (a <= 0) return;
  X.fillStyle = `rgba(255,255,255,${a * 0.85})`; X.fillRect(0, 0, W, H);
}
function endBlink(t) {
  const c = E.in(P(t, 59.15, 59.5));
  if (c <= 0) return;
  const h = c * (H / 2 + 80);
  X.fillStyle = '#0b0a10';
  X.beginPath(); X.moveTo(0, 0); X.lineTo(W, 0); X.lineTo(W, h - 80); X.quadraticCurveTo(W / 2, h + 80, 0, h - 80); X.closePath(); X.fill();
  X.beginPath(); X.moveTo(0, H); X.lineTo(W, H); X.lineTo(W, H - h + 80); X.quadraticCurveTo(W / 2, H - h - 80, 0, H - h + 80); X.closePath(); X.fill();
  if (c >= 1) { X.fillStyle = '#0b0a10'; X.fillRect(0, 0, W, H); }
}

// =========================================================
//                     TIMELINE
// =========================================================
const SCENES = [
  [0, 5, S1], [5, 10, S2], [10, 12.4, S3a], [12.4, 14.8, S3b], [14.8, 17, S3c],
  [17, 19, S4a], [19, 21, S4b], [21, 27, S5], [27, 35, S6], [35, 43, S7],
  [43, 47, S8], [47, 54, S9], [54, 60, S10],
];
const TRANS = [
  [5, 'blink'], [10, 'wipe'], [12.4, 'flash'], [14.8, 'wipe2'], [17, 'blink'], [19, 'flash'],
  [21, 'blink'], [27, 'wipe'], [35, 'blink'], [43, 'wipe2'], [47, 'blink'], [54, 'wipe'],
];
function renderFrame(t) {
  X.save();
  X.setTransform(1, 0, 0, 1, 0, 0);
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over'; X.filter = 'none';
  X.fillStyle = '#000'; X.fillRect(0, 0, W, H);
  const [dx, dy, rot] = shakeOffset(t);
  X.translate(W / 2 + dx, H / 2 + dy); X.rotate(rot);
  const zs = 1 + Math.abs(dx) * 0.0015 + 0.004;
  X.scale(zs, zs); X.translate(-W / 2, -H / 2);
  for (const [s, e, fn] of SCENES) {
    if (t >= s && t < e) { X.save(); fn(t - s, t); X.restore(); break; }
  }
  if (t >= DURATION) { X.save(); S10(DURATION - 54 - 1e-3, DURATION - 1e-3); X.restore(); }
  X.restore();
  vignette(0.8);
  for (const [at, k] of TRANS) {
    if (k === 'blink') blinkT(t, at);
    else if (k === 'wipe') wipeT(t, at);
    else if (k === 'wipe2') wipeT(t, at, 0.3, [COL.lav, COL.yellow, COL.ink]);
    else if (k === 'flash') flashT(t, at);
  }
  endBlink(t);
  grain(t);
}

// collect cues/shakes with a dry pass over every scene
function dryRun() {
  for (const [s, e, fn] of SCENES) { X.save(); fn(0.001, s + 0.001); X.restore(); }
  // a few global musical cues
  cue(54 - 0.6, 'riser', 0.7);
}

window.CUES = CUES;
window.DURATION = DURATION;
window.renderFrame = renderFrame;
window.ready = (async () => {
  await Promise.all([
    document.fonts.load('700 50px "Fredoka"'), document.fonts.load('600 50px "Fredoka"'), document.fonts.load('400 50px "Fredoka"'),
    document.fonts.load('400 50px "Elite"'), document.fonts.load('800 50px "Inter"'), document.fonts.load('700 50px "Inter"'),
    document.fonts.load('400 50px "Marker"'),
  ]);
  await loadImages();
  initOverlays();
  dryRun();
  window.cueList = () => [...CUES.values()].sort((a, b) => a.t - b.t);
  const params = new URLSearchParams(location.search);
  if (params.has('render')) return true;
  if (params.has('t')) { renderFrame(parseFloat(params.get('t'))); return true; }
  // realtime preview with audio if available
  const audio = new Audio('fomies_audio.wav');
  let start = null;
  const loop = now => {
    if (start === null) start = now;
    const t = ((now - start) / 1000) % DURATION;
    renderFrame(t);
    requestAnimationFrame(loop);
  };
  cv.addEventListener('click', () => { audio.currentTime = 0; audio.play().catch(() => {}); start = null; });
  requestAnimationFrame(loop);
  return true;
})();
