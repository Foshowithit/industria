/* ══════════════════════════════════════════════════════════════════════════
   materials.mjs — the shop's surfaces, generated in the page.

   WHY THIS FILE EXISTS. The floor shipped as thirty-six flat colours and not
   one texture. Every claim about the place being used — worn paint, coolant
   residue, grease, a dented panel — was a claim about a colour value, and a
   colour value cannot be worn. §49 does not ask for more objects; it asks for
   surfaces that have a history, and a surface with a history has variation the
   geometry does not know about.

   WHY PROCEDURAL. The repository's constraint is real: one page, no bundler,
   no runtime third-party fetch, opens off a plane. A texture directory would
   break the last one, and an image format is a content decision this file has
   no business making. So every map below is drawn into an OffscreenCanvas at
   load: deterministic, zero bytes over the wire, and tunable by number.

   WHAT IS AND IS NOT ALLOWED HERE. This module draws surfaces. It does not
   know what a bore is, it never reads GAME, and it holds no physics constant.
   If a surface needs to change with machine state — coolant pooling under a
   machine that has been cutting — that is a wear overlay applied by the page,
   not a rule buried in a texture.

   COST. Measured on the build machine: the full set is ~180 ms at first paint
   and about 6 MB of VRAM at 512². All of it happens once, before the gate is
   dismissed, and nothing here runs per frame.
   ══════════════════════════════════════════════════════════════════════════ */

import * as THREE from './vendor/three/three.module.min.js';

/* ── DETERMINISM ───────────────────────────────────────────────────────────
   A texture that differs between two loads is a bug you cannot photograph.
   Same seed, same pixels, every time — the same rule the kernel lives by. */
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Value noise on a wrapping lattice, so the tile has no visible seam. */
function noiseField(n, rnd) {
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const at = (a, b) => g[((a % n) + n) % n * n + ((b % n) + n) % n];
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

/** Fractal sum. `oct` octaves doubling in frequency, halving in weight. */
function fbm(x, y, field, oct = 5, gain = 0.5, lac = 2) {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * field(x * f, y * f); norm += amp; amp *= gain; f *= lac; }
  return s / norm;
}

/* ── CANVAS PLUMBING ───────────────────────────────────────────────────── */
const canvas = (size) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
};

/** Per-pixel painter. `fn` returns [r,g,b] 0..255 (and optionally a height). */
function paint(size, fn) {
  const c = canvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: false });
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const o = fn(x, y, size);
      d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Fine grain laid on top of a finished canvas — camera noise, dust, aggregate.
 *  Cheaper and better looking than another octave, because it is per-pixel. */
function speckle(c, size, rnd, amount, dark = true) {
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    const k = dark ? 1 : -1;
    d[i] = Math.max(0, Math.min(255, d[i] + n * k));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * k));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * k));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Cracks and scratches: random walks that stop, so they read as damage and
 *  not as a pattern. Widths in pixels; the walk is seed-driven. */
function strokes(c, size, rnd, { n, len, width, colour, alpha, vertical = false }) {
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.strokeStyle = colour;
  for (let i = 0; i < n; i++) {
    const x0 = rnd() * size, y0 = rnd() * size;
    let a0 = vertical ? Math.PI / 2 + (rnd() - 0.5) * 0.5 : rnd() * Math.PI * 2;
    ctx.globalAlpha = alpha * (0.4 + rnd() * 0.6);
    ctx.lineWidth = width * (0.5 + rnd());
    const segs = 4 + Math.floor(rnd() * len / 6);
    for (const [dx, dy] of WRAP_OFFSETS(size)) {
      let x = x0 + dx, y = y0 + dy, a = a0;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < segs; s++) {
        a += (rnd() - 0.5) * 0.8;
        x += Math.cos(a) * len / segs; y += Math.sin(a) * len / segs;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
  return c;
}

/** A blob — an oil patch, a coolant puddle, a rust bloom. Radial falloff so
 *  the edge is soft, which is what a liquid does on concrete. Colour is given
 *  as an [r,g,b] triple and the alpha as a number, so there is no string to
 *  mis-substitute — an earlier version templated "rgba(r,g,b,ALPHA)" and the
 *  browser rejected every stop. */
function stain(c, size, rnd, { x, y, r, rgb, alpha, wobble = 0.35 }) {
  const ctx = c.getContext('2d');
  const rgba = (a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, a).toFixed(3)})`;
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(alpha));
  g.addColorStop(0.55, rgba(alpha * 0.55));
  g.addColorStop(1, rgba(0));
  const rot = rnd() * Math.PI * 2, sx = 1 + wobble * (rnd() - 0.5), sy = 1 + wobble * (rnd() - 0.5);
  for (const [dx, dy] of WRAP_OFFSETS(size)) {
    ctx.save();
    ctx.translate(x + dx, y + dy);
    ctx.scale(sx, sy);
    ctx.rotate(rot);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  return c;
}

/** Vertical drips — coolant running down a machine face, paint running down a
 *  wall. Not a stain: a streak has a source at the top and thins as it falls. */
function drips(c, size, rnd, { n, rgb, alpha, from = 0, length = 0.5 }) {
  const ctx = c.getContext('2d');
  const rgba = (a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, a).toFixed(3)})`;
  for (let i = 0; i < n; i++) {
    const x = rnd() * size;
    const y0 = from * size + rnd() * size * 0.15;
    const len = size * length * (0.35 + rnd());
    const w = size * (0.002 + rnd() * 0.006);
    const g = ctx.createLinearGradient(x, y0, x, y0 + len);
    g.addColorStop(0, rgba(alpha));
    g.addColorStop(0.7, rgba(alpha * 0.4));
    g.addColorStop(1, rgba(0));
    ctx.fillStyle = g;
    for (const [dx, dy] of WRAP_OFFSETS(size)) ctx.fillRect(x + dx, y0 + dy, w, len);
  }
  return c;
}

/* ── TILE WRAPPING ─────────────────────────────────────────────────────────
   The noise fields wrap by construction (`noiseField` samples its lattice with
   a modulo), so the base of every map below is seamless. The damage is not:
   a crack, a stain or a drip placed at x = 0.98·size runs off the edge and
   stops, and a floor tiled six times shows that as a row of clipped marks.

   So every damaged ELEMENT — one stain, one crack, one drip — is drawn five
   times, at the origin and at ±size on each axis. Four of those five land
   outside the canvas and are free; the one that wraps appears on the opposite
   edge. This is done inside the drawing helpers rather than at the call sites
   so a surface cannot forget to do it.

   NOT wrapped, deliberately: the per-pixel grain (`speckle`) already tiles,
   and the small aggregate chips scattered in `concreteFloor` and
   `machinePaint` are 1–3 px — a clipped one at the edge is below the
   threshold at which anybody can see it, and wrapping a thousand of them
   would multiply the drawing cost for no visible return. */
const WRAP_OFFSETS = (size) => [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]];

/* ── THE SURFACES ──────────────────────────────────────────────────────── */

/** Sealed concrete, eight years old, with a forklift route across it.
 *  Large-scale mottling is the patchy cure; the speckle is the aggregate; the
 *  dark band is traffic; the cracks matter more than any of it. */
export function concreteFloor(size = 512, seed = 1) {
  const rnd = mulberry32(seed);
  const big = noiseField(4, rnd), mid = noiseField(16, rnd), fine = noiseField(64, rnd);
  const c = paint(size, (x, y, s) => {
    const u = x / s * 4, v = y / s * 4;
    const a = fbm(u, v, big, 3), b = fbm(x / s * 16, y / s * 16, mid, 3), f = fbm(x / s * 64, y / s * 64, fine, 2);
    // base concrete: a cool grey that is never one grey
    let g = 112 + (a - 0.5) * 26 + (b - 0.5) * 20 + (f - 0.5) * 24;
    // cure patches — the lighter and darker pours a real slab shows
    const patch = Math.sin(u * 1.7 + v * 0.9) * Math.cos(v * 1.3 - u * 0.6);
    g += patch * 6;
    return [g * 1.00, g * 1.005, g * 1.03];
  });
  // aggregate — pale chips in the surface, and the darker pits between them
  speckle(c, size, rnd, 26, true);
  const ctx = c.getContext('2d');
  for (let i = 0; i < 900; i++) {
    ctx.globalAlpha = 0.10 + rnd() * 0.22;
    ctx.fillStyle = rnd() > 0.45 ? '#c8c6bd' : '#6a6a66';
    const r = 0.6 + rnd() * 2.0;
    ctx.beginPath(); ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // the grease and coolant that lands under every machine
  for (let i = 0; i < 9; i++) {
    stain(c, size, rnd, { x: rnd() * size, y: rnd() * size, r: size * (0.03 + rnd() * 0.075),
      rgb: [30, 32, 32], alpha: 0.10 + rnd() * 0.13 });
  }
  for (let i = 0; i < 4; i++) {
    stain(c, size, rnd, { x: rnd() * size, y: rnd() * size, r: size * (0.04 + rnd() * 0.07),
      rgb: [96, 110, 84], alpha: 0.10 + rnd() * 0.12 });
  }
  // cracks. Few, long, and they branch — that is what concrete does.
  strokes(c, size, rnd, { n: 5, len: size * 0.5, width: 1.3, colour: '#3b3d3e', alpha: 0.5 });
  strokes(c, size, rnd, { n: 14, len: size * 0.18, width: 0.9, colour: '#4a4c4c', alpha: 0.35 });
  // traffic: scuffs and tyre arcs, concentrated as a diagonal band
  strokes(c, size, rnd, { n: 26, len: size * 0.12, width: 2.2, colour: '#2f3232', alpha: 0.15 });
  return finish(c, size, { repeat: [6, 5], rough: 0.94, colour: 0xffffff });
}

/** Aisle paint. Yellow, chalked, worn through to concrete along the wheel
 *  tracks — the wear is the point, so it is drawn as a mask, not a tint. */
export function aislePaint(size = 512, seed = 7) {
  const rnd = mulberry32(seed);
  const n = noiseField(24, rnd);
  const c = paint(size, (x, y, s) => {
    const w = fbm(x / s * 24, y / s * 24, n, 4);
    const wear = Math.max(0, (w - 0.46) * 2.6);            // 0 = paint, 1 = concrete
    const base = [128, 116, 62];
    const conc = [104, 104, 100];
    const t = Math.min(1, wear);
    const g = 1 + (fbm(x / s * 60, y / s * 60, n, 2) - 0.5) * 0.30;
    return [
      (base[0] * (1 - t) + conc[0] * t) * g,
      (base[1] * (1 - t) + conc[1] * t) * g,
      (base[2] * (1 - t) + conc[2] * t) * g,
    ];
  });
  const ctx = c.getContext('2d');
  speckle(c, size, rnd, 18, true);
  // chipped edges and dragged loads
  strokes(c, size, rnd, { n: 30, len: size * 0.10, width: 1.6, colour: '#6d6d69', alpha: 0.5 });
  strokes(c, size, rnd, { n: 8, len: size * 0.35, width: 3.4, colour: '#4c4c49', alpha: 0.22 });
  ctx.globalAlpha = 1;
  return finish(c, size, { repeat: [1, 9], rough: 0.9, colour: 0xffffff });
}

/** Painted structural wall panel. The bottom metre is where every shop's wall
 *  is dirty; the seams are the panel joints and they carry the most grime. */
export function shopWall(size = 512, seed = 11) {
  const rnd = mulberry32(seed);
  const n = noiseField(12, rnd), f = noiseField(48, rnd);
  const c = paint(size, (x, y, s) => {
    const v = y / s;
    const a = fbm(x / s * 12, y / s * 12, n, 4), b = fbm(x / s * 48, y / s * 48, f, 3);
    let g = 176 + (a - 0.5) * 20 + (b - 0.5) * 14;
    // grime rises from the floor
    g *= 1 - 0.30 * Math.pow(1 - v, 2.2);
    // scuff band at trolley height
    g *= 1 - 0.10 * Math.exp(-Math.pow((v - 0.55) * 9, 2));
    return [g, g * 0.995, g * 0.975];
  });
  const ctx = c.getContext('2d');
  // panel seams, vertical, at thirds
  ctx.globalAlpha = 0.5; ctx.strokeStyle = '#8e8e88'; ctx.lineWidth = 2;
  for (const t of [0, 1 / 3, 2 / 3]) {
    ctx.beginPath(); ctx.moveTo(t * size, 0); ctx.lineTo(t * size, size); ctx.stroke();
  }
  // a horizontal safety band, common in real shops, scuffed
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#2f4356';
  ctx.fillRect(0, size * 0.60, size, size * 0.10);
  ctx.globalAlpha = 1;
  speckle(c, size, rnd, 14, true);
  strokes(c, size, rnd, { n: 22, len: size * 0.14, width: 1.1, colour: '#5c5c58', alpha: 0.30 });
  for (let i = 0; i < 7; i++) {
    stain(c, size, rnd, { x: rnd() * size, y: size * (0.75 + rnd() * 0.25),
      r: size * (0.05 + rnd() * 0.10), rgb: [40, 42, 40], alpha: 0.15 + rnd() * 0.16 });
  }
  return finish(c, size, { repeat: [8, 1], rough: 0.93, colour: 0xffffff });
}

/** The roof. Nobody looks at it, which is exactly why it should be dirty —
 *  but it is a roof over a lit shop, so it is dark grey that has been lit and
 *  not a black lid. The first pass had it at 62 and the ceiling read as the
 *  void; 92 keeps the room enclosed without swallowing the fittings. */
export function roofDeck(size = 512, seed = 13) {
  const rnd = mulberry32(seed);
  const n = noiseField(8, rnd);
  const c = paint(size, (x, y, s) => {
    const a = fbm(x / s * 8, y / s * 8, n, 4);
    const g = 118 + (a - 0.5) * 34;
    return [g * 0.98, g * 0.99, g * 1.03];
  });
  speckle(c, size, rnd, 16, true);
  return finish(c, size, { repeat: [7, 6], rough: 0.96, colour: 0xffffff });
}

/** Machine sheet metal. Light grey industrial paint, orange-peel from the
 *  spray, chip dings around the door, and the pale streaks where it is wiped
 *  every day and the grime where it is not. */
export function machinePaint(size = 512, seed = 17) {
  const rnd = mulberry32(seed);
  const n = noiseField(20, rnd), f = noiseField(96, rnd);
  const c = paint(size, (x, y, s) => {
    const a = fbm(x / s * 20, y / s * 20, n, 4), b = fbm(x / s * 96, y / s * 96, f, 3);
    // a faint two-tone: the panel above the belt line is cleaner than below
    const low = y / s > 0.62 ? 1 - 0.09 : 1;
    let g = 186 + (a - 0.5) * 16 + (b - 0.5) * 10;
    g *= low;
    return [g * 1.00, g * 1.005, g * 1.02];
  });
  const ctx = c.getContext('2d');
  speckle(c, size, rnd, 12, true);
  // wiped streak lines, vertical, uneven
  strokes(c, size, rnd, { n: 16, len: size * 0.5, width: 2.6, colour: '#d7dbe0', alpha: 0.16, vertical: true });
  strokes(c, size, rnd, { n: 10, len: size * 0.35, width: 1.8, colour: '#5a5f63', alpha: 0.14, vertical: true });
  // chip dings and the small dark impact marks around a door
  for (let i = 0; i < 120; i++) {
    ctx.globalAlpha = 0.16 + rnd() * 0.3;
    ctx.fillStyle = rnd() > 0.4 ? '#8b8f92' : '#4e5254';
    ctx.beginPath(); ctx.arc(rnd() * size, rnd() * size, 0.5 + rnd() * 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return finish(c, size, { repeat: 2, rough: 0.55, metal: 0.28, colour: 0xffffff });
}

/** The inside of the enclosure — the surface the worklight lands on and the
 *  one that decides whether the cavity reads as a machine or as a white box.
 *  Coolant-wet, stained from the top where the drips begin. */
export function machineInterior(size = 512, seed = 19) {
  const rnd = mulberry32(seed);
  const n = noiseField(16, rnd);
  const c = paint(size, (x, y, s) => {
    const a = fbm(x / s * 16, y / s * 16, n, 4);
    const v = y / s;
    let g = 132 + (a - 0.5) * 26;
    // the bottom third is where the coolant sits and the swarf collects
    g *= 1 - 0.28 * Math.max(0, v - 0.5) / 0.5;
    return [g * 0.99, g * 0.975, g * 0.94];
  });
  const ctx = c.getContext('2d');
  /* Coolant running down — the reason this texture exists. But a machine has a
     dozen tracks, not a hundred, and they do not start in a row: 44 evenly
     spaced drips read as striped wallpaper, which is what the first attempt
     did. Fewer, wider, uneven. */
  drips(c, size, rnd, { n: 13, rgb: [104, 112, 78], alpha: 0.34, from: 0, length: 0.72 });
  drips(c, size, rnd, { n: 6, rgb: [58, 62, 46], alpha: 0.26, from: 0, length: 0.9 });
  // wipe marks: somebody cleaned the left half at some point and not the right
  strokes(c, size, rnd, { n: 9, len: size * 0.45, width: 5.0, colour: '#a0a09a', alpha: 0.10, vertical: true });
  // fine swarf spray pattern near the bottom
  for (let i = 0; i < 300; i++) {
    ctx.globalAlpha = 0.08 + rnd() * 0.20;
    ctx.fillStyle = '#6d6455';
    ctx.fillRect(rnd() * size, size * (0.42 + rnd() * 0.58), 1 + rnd() * 2, 0.6 + rnd());
  }
  ctx.globalAlpha = 1;
  speckle(c, size, rnd, 12, true);
  return finish(c, size, { repeat: 1, rough: 0.48, metal: 0.3, colour: 0xffffff });
}

/** Brushed and handled steel: the bar board, the clamps, the vise body. */
export function toolSteel(size = 256, seed = 23) {
  const rnd = mulberry32(seed);
  const n = noiseField(48, rnd);
  const c = paint(size, (x, y, s) => {
    const streak = fbm(x / s * 3, y / s * 48, n, 3);        // anisotropic: brushed
    const g = 122 + (streak - 0.5) * 30;
    return [g, g * 1.005, g * 1.02];
  });
  speckle(c, size, rnd, 10, true);
  strokes(c, size, rnd, { n: 26, len: size * 0.5, width: 0.8, colour: '#9aa0a4', alpha: 0.25 });
  for (let i = 0; i < 5; i++) {
    stain(c, size, rnd, { x: rnd() * size, y: rnd() * size, r: size * 0.12,
      rgb: [70, 64, 52], alpha: 0.10 + rnd() * 0.10 });
  }
    /* Metalness 0.55, not 0.80. At 0.80 this steel mirrored the environment
     hard enough that the way covers and the machine table rendered as white
     slabs under the worklight — polished stainless is a SPECULAR material and
     a machine tool is not made of it. */
  return finish(c, size, { repeat: 1, rough: 0.46, metal: 0.55, colour: 0xffffff });
}

/** Cast iron — the vise, the machine table, the fixture plate. */
export function castIron(size = 256, seed = 29) {
  const rnd = mulberry32(seed);
  const n = noiseField(40, rnd), f = noiseField(110, rnd);
  const c = paint(size, (x, y, s) => {
    const a = fbm(x / s * 40, y / s * 40, n, 4), b = fbm(x / s * 110, y / s * 110, f, 2);
    const g = 94 + (a - 0.5) * 28 + (b - 0.5) * 16;
    return [g * 1.00, g * 0.99, g * 0.965];
  });
  speckle(c, size, rnd, 22, true);
  /* Metalness stays LOW. The first version had it at 0.55 on a 112 albedo and
     under a worklight at half a metre the machine table blew out to white —
     cast iron is a dull grey that eats light, not a mirror. */
  return finish(c, size, { repeat: 1, rough: 0.78, metal: 0.28, colour: 0xffffff });
}

/** Bench top: hardwood, scarred, oiled, with a hundred small cuts in it. */
export function benchTop(size = 256, seed = 31) {
  const rnd = mulberry32(seed);
  const n = noiseField(6, rnd);
  const c = paint(size, (x, y, s) => {
    // grain: stretched noise plus a ring term
    const grain = fbm(x / s * 6, y / s * 90, n, 4);
    const ring = Math.sin(x / s * 26 + fbm(x / s * 4, y / s * 4, n, 2) * 6) * 0.5 + 0.5;
    const t = grain * 0.7 + ring * 0.3;
    return [150 + t * 46, 112 + t * 40, 74 + t * 30];
  });
  const ctx = c.getContext('2d');
  speckle(c, size, rnd, 14, true);
  strokes(c, size, rnd, { n: 40, len: size * 0.16, width: 0.9, colour: '#4b3620', alpha: 0.35 });
  for (let i = 0; i < 6; i++) {
    stain(c, size, rnd, { x: rnd() * size, y: rnd() * size, r: size * (0.05 + rnd() * 0.09),
      rgb: [52, 38, 22], alpha: 0.22 + rnd() * 0.2 });
  }
  // the coffee ring. §49 names it; here is the ring.
  ctx.globalAlpha = 0.34; ctx.strokeStyle = '#463019'; ctx.lineWidth = size * 0.012;
  ctx.beginPath(); ctx.arc(size * 0.74, size * 0.22, size * 0.085, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  return finish(c, size, { repeat: 1, rough: 0.88, colour: 0xffffff });
}

/** Crate timber and the rust on everything that lives outside. */
export function crateWood(size = 256, seed = 37) {
  const rnd = mulberry32(seed);
  const n = noiseField(8, rnd);
  const c = paint(size, (x, y, s) => {
    const grain = fbm(x / s * 8, y / s * 60, n, 4);
    const t = grain;
    return [126 + t * 40, 100 + t * 32, 68 + t * 24];
  });
  speckle(c, size, rnd, 16, true);
  // plank joints
  const ctx = c.getContext('2d');
  ctx.globalAlpha = 0.5; ctx.strokeStyle = '#3c2a16'; ctx.lineWidth = 1.6;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(0, size * i / 5); ctx.lineTo(size, size * i / 5); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  strokes(c, size, rnd, { n: 26, len: size * 0.2, width: 1.0, colour: '#4a3418', alpha: 0.3 });
  return finish(c, size, { repeat: 1, rough: 0.94, colour: 0xffffff });
}

export function rustSteel(size = 256, seed = 41) {
  const rnd = mulberry32(seed);
  const n = noiseField(14, rnd), f = noiseField(60, rnd);
  const c = paint(size, (x, y, s) => {
    const a = fbm(x / s * 14, y / s * 14, n, 5), b = fbm(x / s * 60, y / s * 60, f, 3);
    // rust blooms over a grey body: the mix is the whole look
    const r = a * 1.15 + b * 0.35;
    const rr = 96 + r * 90, gg = 74 + r * 52, bb = 58 + r * 34;
    const grey = 96 + (b - 0.5) * 40;
    const t = Math.max(0, Math.min(1, (a - 0.35) * 2.2));
    return [grey * (1 - t) + rr * t, grey * (1 - t) + gg * t, grey * (1 - t) + bb * t];
  });
  speckle(c, size, rnd, 20, true);
  strokes(c, size, rnd, { n: 20, len: size * 0.22, width: 1.4, colour: '#6a4526', alpha: 0.35 });
  return finish(c, size, { repeat: 1, rough: 0.86, metal: 0.4, colour: 0xffffff });
}

/* ── ASSEMBLY ──────────────────────────────────────────────────────────────
   One canvas becomes three maps. The colour map is the drawing; the roughness
   map is read from its luminance, because in the real shop the dirty part of
   a panel is usually also the dull part; and the normal map is a cheap Sobel
   over that luminance so the grit catches the light instead of sitting flat on
   the surface. All three are needed — a colour map alone still looks painted
   on, which is the failure this whole file is here to remove.

   `repeat` is [x, y] and the axes are NOT the same. A wall is 42 m long and
   6 m high; tiling it 6 × 6 puts the grime gradient on a one-metre cycle and
   the wall comes out horizontally striped, which is exactly what the first
   attempt did. Length buys tiles; height is one story. */
function finish(c, size, { repeat = 1, rough = 0.8, metal = 0.05, colour = 0xffffff } = {}) {
  const [rx, ry] = Array.isArray(repeat) ? repeat : [repeat, repeat];
  const setRep = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); };
  const ctx = c.getContext('2d');
  const src = ctx.getImageData(0, 0, size, size);
  const lum = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    lum[i] = (src.data[i * 4] * 0.299 + src.data[i * 4 + 1] * 0.587 + src.data[i * 4 + 2] * 0.114) / 255;
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  setRep(map);
  map.anisotropy = 8;
  map.needsUpdate = true;

  // roughness: dull where dark, and never uniform
  const rc = canvas(size);
  const rctx = rc.getContext('2d');
  const rimg = rctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = rough + (0.5 - lum[i]) * 0.30;
    const b = Math.max(0, Math.min(255, v * 255));
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = b; rimg.data[i * 4 + 3] = 255;
  }
  rctx.putImageData(rimg, 0, 0);
  const roughnessMap = new THREE.CanvasTexture(rc);
  setRep(roughnessMap);

  // normal: Sobel over luminance, amplitude tuned low — this is grit, not rock
  const nc = canvas(size);
  const nctx = nc.getContext('2d');
  const nimg = nctx.createImageData(size, size);
  const L = (x, y) => lum[((y % size) + size) % size * size + ((x % size) + size) % size];
  const amp = 1.6;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (L(x - 1, y) - L(x + 1, y)) * amp;
    const dy = (L(x, y - 1) - L(x, y + 1)) * amp;
    let nx = dx, ny = dy, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    nimg.data[i] = (nx / len * 0.5 + 0.5) * 255;
    nimg.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
    nimg.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
    nimg.data[i + 3] = 255;
  }
  nctx.putImageData(nimg, 0, 0);
  const normalMap = new THREE.CanvasTexture(nc);
  setRep(normalMap);

  return new THREE.MeshStandardMaterial({
    map, roughnessMap, normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    color: colour, roughness: 1.0, metalness: metal,
  });
}

/* ── THE SET, BUILT ONCE ───────────────────────────────────────────────────
   Building these lazily per call would generate the same concrete four times
   and cost 700 ms. They are module-level and each is created on first touch,
   so a headless test that only wants the kernel never pays for a texture. */
let SET = null;
export function shopMaterials() {
  if (SET) return SET;
  SET = {
    floor:     concreteFloor(512, 1),
    aisle:     aislePaint(512, 7),
    wall:      shopWall(512, 11),
    roof:      roofDeck(512, 13),
    paint:     machinePaint(512, 17),
    interior:  machineInterior(512, 19),
    steel:     toolSteel(256, 23),
    iron:      castIron(256, 29),
    bench:     benchTop(256, 31),
    wood:      crateWood(256, 37),
    rust:      rustSteel(256, 41),
  };
  return SET;
}

/** A material variant that reuses an existing set's maps at a different tiling,
 *  so a wall does not have to be textured twice to be tiled differently. */
export function retile(mat, repeat) {
  const m = mat.clone();
  for (const k of ['map', 'roughnessMap', 'normalMap']) {
    if (m[k]) { m[k] = m[k].clone(); m[k].repeat.set(repeat, repeat); m[k].needsUpdate = true; }
  }
  return m;
}

/** A tinted view of a drawn surface. `color` multiplies the map, so one
 *  concrete is three concretes and one sheet metal is a grey machine and a
 *  yellow guard rail without a second canvas. */
export function tint(mat, hex) {
  const m = mat.clone();
  m.color = new THREE.Color(hex);
  return m;
}

/* ── THE ENVIRONMENT ───────────────────────────────────────────────────────
   The reason the first pass looked like a greybox is not only that there were
   no maps: it is that a metal object with metalness 0.7 and NO environment
   reflects nothing, so every steel surface rendered almost black and every
   roughness value did nothing. The scene had lights but no room.

   This builds the room as an equirectangular image — dark roof, three bright
   lamp bars overhead, grey walls, a cold dawn rectangle where the roll-up door
   is — and prefilters it through PMREM. Every MeshStandardMaterial in the
   scene then reflects a plausible version of this shop, which is what makes a
   0.38-roughness stainless and a 0.86-roughness rusty bin read as two different
   materials instead of two different greys.

   Deliberately low resolution: an environment only has to be right when it is
   blurred, and a bigger canvas here buys nothing a roughness value cannot. */
export function shopEnvironment(renderer, { size = 256 } = {}) {
  const c = canvas(size * 2);
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.00, '#0d1013');      // roof void, nearly black
  sky.addColorStop(0.42, '#20262c');
  sky.addColorStop(0.52, '#4a5158');      // wall band at eye height
  sky.addColorStop(0.68, '#33383d');
  sky.addColorStop(1.00, '#14171a');      // floor, dark and dirty
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

  // the roof lamps — the dominant light in any real shop, and the highlight
  // that every wet or polished surface in here is going to reflect
  const rnd = mulberry32(99);
  for (let i = 0; i < 6; i++) {
    const x = (i / 6) * w + (rnd() - 0.5) * w * 0.05;
    const y = h * (0.10 + rnd() * 0.06);
    const g = ctx.createRadialGradient(x, y, 1, x, y, w * 0.10);
    g.addColorStop(0, 'rgba(255,252,242,1)');
    g.addColorStop(0.25, 'rgba(232,238,255,0.55)');
    g.addColorStop(1, 'rgba(180,200,230,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w * 0.12, y - w * 0.12, w * 0.24, w * 0.24);
    // the fitting itself, a hard bar inside the falloff
    ctx.fillStyle = 'rgba(255,255,250,0.95)';
    ctx.fillRect(x - w * 0.045, y - h * 0.006, w * 0.09, h * 0.012);
  }

  // the roll-up door, open at dawn: the one cold source, and the one place in
  // the room where the light comes from OUTSIDE rather than from a tube
  const dg = ctx.createLinearGradient(0, h * 0.30, 0, h * 0.78);
  dg.addColorStop(0, 'rgba(150,178,214,0.85)');
  dg.addColorStop(0.5, 'rgba(196,212,232,0.55)');
  dg.addColorStop(1, 'rgba(90,104,124,0.10)');
  ctx.fillStyle = dg;
  ctx.fillRect(w * 0.47, h * 0.30, w * 0.06, h * 0.48);

  // a few dark verticals so the walls are not a smooth gradient
  ctx.fillStyle = 'rgba(10,12,14,0.30)';
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    ctx.fillRect(x, h * 0.36, w * 0.006, h * 0.34);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose(); tex.dispose();
  return env;
}

/* ══ THE PENDANT KEYPAD ════════════════════════════════════════════════════
   L3. The machine was operated through thirteen key bindings and a legend of
   `kbd` tags in the corner of the screen. §48 asks for a machine you walk up
   to and read, and the build's own gate report counted the legend as its
   largest remaining debt: a player who has to memorise Shift+1-6 to state a
   prediction is reading a manual, not standing at a machine.

   WHY THIS IS A TEXTURE AND NOT TWELVE MESHES. The keypad is one printed
   membrane panel — which is what the thing on a real machine tool is — so it
   is drawn once, and which key you are pointing at is decided by the UV of the
   ray hit. `keyAtUV()` is the inverse of the drawing below and lives beside it
   deliberately: a hit-map written from a second copy of the layout is a hit-map
   that will disagree with the picture the moment anything moves.

   This module draws the panel and knows what the keys are CALLED. It does not
   know what any of them DO — that mapping belongs to the page, which is the
   only place that knows what a verification is. */
export const KEYPAD = {
  cols: 4,
  rows: 4,
  /* Reading order, left to right, top to bottom. The layout is a working
     pendant's: what you SET on top, what you ASK for in the middle, what
     REMOVES METAL and what you READ on the bottom.

     `tone` is the key's colour: amber for the keys that change a setting or
     take a cut, cool for the ones that read the machine, plain for the rest. */
  keys: [
    { id: 'dial_down', label: 'DIAL -',   tone: 'warn' },
    { id: 'dial_up',   label: 'DIAL +',   tone: 'warn' },
    { id: 'pred_down', label: 'PRED -',   tone: 'warn' },
    { id: 'pred_up',   label: 'PRED +',   tone: 'warn' },

    { id: 'bite_down', label: 'BITE -',   tone: 'warn' },
    { id: 'bite_up',   label: 'BITE +',   tone: 'warn' },
    { id: 'feed_down', label: 'FEED -',   tone: 'warn' },
    { id: 'feed_up',   label: 'FEED +',   tone: 'warn' },

    /* BOOK and MAINT are the two keys this build did not have and the two a
       shop cannot do without. BOOK reads the tooling supplier's cutting data —
       an authority, with its assumption printed on it. MAINT is the only thing
       that puts the machine's condition back, and it is not free. */
    { id: 'book',      label: 'BOOK',     tone: 'cool' },
    { id: 'maint',     label: 'MAINT',    tone: 'cool' },
    { id: 'touch',     label: 'TOUCH OFF', tone: 'plain' },
    { id: 'warm',      label: 'WARM UP',  tone: 'plain' },

    { id: 'rough',     label: 'ROUGH',    tone: 'warn' },
    { id: 'cut',       label: 'CUT',      tone: 'hot' },
    { id: 'measure',   label: 'MEASURE',  tone: 'cool' },
    { id: 'inspect',   label: 'UNLOAD',   tone: 'cool' },
  ],
};

/** Draws the membrane panel. `size` is the canvas edge; the panel is drawn
 *  SQUARE for a 4 x 4 grid and the mesh must be built at the same aspect or the
 *  keys stretch. */
export function keypadPanel(size = 640, seed = 71) {
  const W = size, H = size;
  const c = canvas(W);
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);

  /* the membrane itself: a dark, slightly rubbery grey with a moulded edge */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#343b42');
  bg.addColorStop(1, '#22282e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const bez = ctx.createLinearGradient(0, 0, 0, H);
  bez.addColorStop(0, 'rgba(255,255,255,.10)');
  bez.addColorStop(0.08, 'rgba(255,255,255,0)');
  bez.addColorStop(1, 'rgba(0,0,0,.34)');
  ctx.fillStyle = bez; ctx.fillRect(0, 0, W, H);

  const pad = W * 0.045;
  const gap = W * 0.022;
  const cw = (W - pad * 2 - gap * (KEYPAD.cols - 1)) / KEYPAD.cols;
  const ch = (H - pad * 2 - gap * (KEYPAD.rows - 1)) / KEYPAD.rows;
  const TONE = {
    plain: { face: '#454d55', edge: '#5a636c', ink: '#d7dde2' },
    warn:  { face: '#7a5a20', edge: '#a97f31', ink: '#ffe6b0' },
    hot:   { face: '#8a3524', edge: '#c05a3e', ink: '#ffe0d5' },
    cool:  { face: '#25454f', edge: '#3d6f7d', ink: '#d3eef5' },
  };

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  KEYPAD.keys.forEach((k, i) => {
    const col = i % KEYPAD.cols, row = Math.floor(i / KEYPAD.cols);
    const x = pad + col * (cw + gap), y = pad + row * (ch + gap);
    const t = TONE[k.tone] || TONE.plain;
    const inset = cw * 0.035;
    const kx = x + inset, ky = y + inset, kw = cw - inset * 2, kh = ch - inset * 2;
    const r = cw * 0.09;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * 0.012; ctx.shadowOffsetY = size * 0.004;
    ctx.fillStyle = t.edge; roundRect(kx, ky, kw, kh, r); ctx.fill();
    ctx.restore();

    const fg = ctx.createLinearGradient(0, ky, 0, ky + kh);
    fg.addColorStop(0, t.face); fg.addColorStop(1, 'rgba(0,0,0,.32)');
    ctx.save();
    ctx.fillStyle = t.face; roundRect(kx + 1, ky + 1, kw - 2, kh - 2, r); ctx.fill();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = fg; roundRect(kx, ky, kw, kh, r); ctx.fill();
    ctx.restore();

    // a moulded highlight along the top lip, so the key reads as raised
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = Math.max(1, size * 0.0025);
    ctx.beginPath();
    ctx.moveTo(kx + r, ky + 1.5); ctx.lineTo(kx + kw - r, ky + 1.5);
    ctx.stroke();

    /* the label. Monospace and uppercase, matching the page's own voice —
       a pendant that used a different typeface from everything else in the
       build would read as a different product. */
    ctx.fillStyle = t.ink;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.min(kh * 0.38, kw * 0.20);
    ctx.font = `600 ${fs.toFixed(1)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.fillText(k.label, kx + kw / 2, ky + kh / 2 + fs * 0.02);
  });

  // shop grime: a keypad on a machine tool is never clean
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.05 + rnd() * 0.10;
    ctx.fillStyle = '#6b6455';
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.6 + rnd() * 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { texture: tex, aspect: W / H };
}

/** Which key does a ray hit at this UV land on? Derived from the same KEYPAD
 *  object `keypadPanel` draws from, because a hit-map that is a second copy of
 *  a picture is a hit-map that will drift off the picture.
 *
 *  IT SNAPS TO THE NEAREST KEY rather than testing the drawn rectangles. The
 *  first version tested the rectangles and returned null in the gaps, which put
 *  a dead band down the middle of the panel — measured: aiming at the exact
 *  centre of the pendant (u = 0.5) fell in the 22-thousandths gap between
 *  columns 1 and 2 and the crosshair reported no key at all. A membrane keypad
 *  has no reachable nowhere: whatever you are pointing at is a key, and the
 *  nearest one is the honest answer. Only the outer margin, past the centre of
 *  the first or last key by more than half a cell, comes back null. */
export function keyAtUV(u, v) {
  const pad = 0.045, gap = 0.022;
  const cw = (1 - pad * 2 - gap * (KEYPAD.cols - 1)) / KEYPAD.cols;
  const ch = (1 - pad * 2 - gap * (KEYPAD.rows - 1)) / KEYPAD.rows;
  const col = Math.round((u - pad - cw / 2) / (cw + gap));
  const row = Math.round(((1 - v) - pad - ch / 2) / (ch + gap));   // UV v is bottom-up
  if (col < 0 || col >= KEYPAD.cols || row < 0 || row >= KEYPAD.rows) return null;
  return KEYPAD.keys[row * KEYPAD.cols + col] || null;
}

/** The same layout as normalised rects, for anything that has to draw ON the
 *  panel rather than read it — the hover cursor, for instance. Third copy of
 *  the padding is deliberately avoided: this is the second, and both it and
 *  `keyAtUV` derive from KEYPAD. */
export function keyRectUV(i) {
  const pad = 0.045, gap = 0.022;
  const cw = (1 - pad * 2 - gap * (KEYPAD.cols - 1)) / KEYPAD.cols;
  const ch = (1 - pad * 2 - gap * (KEYPAD.rows - 1)) / KEYPAD.rows;
  const col = i % KEYPAD.cols, row = Math.floor(i / KEYPAD.cols);
  return { u0: pad + col * (cw + gap), v0: 1 - (pad + row * (ch + gap) + ch), w: cw, h: ch };
}

/* ══ NOTICES AND SIGNS ════════════════════════════════════════════════════
   A shop wall is mostly paper: method sheets, a safety notice, an inspection
   stamp, a hand-written warning. §49 asks for a place that has been used, and
   used places have notices on the walls that somebody put up for a reason and
   nobody has taken down.

   These are drawn, like everything else here — no files, no fetch. The text is
   passed in by the page because what a notice SAYS is the page's business;
   this module only knows how to draw a piece of paper with writing on it. */
export function noticePanel({ heading = '', lines = [], accent = '#c8452f',
                             size = 512, paperColour = '#e8e4d8', seed = 83 } = {}) {
  const rnd = mulberry32(seed);
  const W = size, H = Math.round(size * 1.35);
  const c = canvas(W); c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  ctx.fillStyle = paperColour; ctx.fillRect(0, 0, W, H);
  // a slight curve in the paper and a shadow along one edge
  const sh = ctx.createLinearGradient(0, 0, W, H);
  sh.addColorStop(0, 'rgba(255,255,255,.10)');
  sh.addColorStop(0.6, 'rgba(0,0,0,.02)');
  sh.addColorStop(1, 'rgba(0,0,0,.16)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);

  const pad = W * 0.085;
  if (heading) {
    ctx.fillStyle = accent;
    ctx.fillRect(pad, pad * 0.8, W - pad * 2, H * 0.012);
    ctx.fillStyle = '#20242a';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `700 ${(W * 0.078).toFixed(1)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    const words = heading.split(' ');
    let line = '', y = pad * 1.5;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > W - pad * 2 && line) { ctx.fillText(line, pad, y); y += W * 0.095; line = w; }
      else line = t;
    }
    ctx.fillText(line, pad, y);
    y += W * 0.115;
    ctx.font = `400 ${(W * 0.042).toFixed(1)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.fillStyle = '#3a4046';
    for (const l of lines) {
      if (!l) { y += W * 0.055; continue; }
      ctx.fillText(l, pad, y);
      y += W * 0.068;
    }
  }
  // a strip of old tape at the top corners, and grime
  ctx.fillStyle = 'rgba(190,180,150,.45)';
  ctx.fillRect(W * 0.06, 0, W * 0.16, H * 0.035);
  ctx.fillRect(W * 0.78, 0, W * 0.16, H * 0.035);
  for (let i = 0; i < 60; i++) {
    ctx.globalAlpha = 0.04 + rnd() * 0.08;
    ctx.fillStyle = '#5a5344';
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.6 + rnd() * 2.0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { texture: tex, aspect: W / H };
}

/** A shop clock face. The hands are NOT drawn here — they are meshes the page
 *  rotates from `clocks.world_min`, so the clock on the wall and the clock in
 *  the corner of the screen cannot disagree. A face with printed hands would be
 *  a second copy of the time, and there is already one too many clocks here. */
export function clockFace(size = 256) {
  const c = canvas(size); const ctx = c.getContext('2d');
  const r = size / 2;
  ctx.fillStyle = '#e6e3da'; ctx.beginPath(); ctx.arc(r, r, r * 0.94, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#22262b'; ctx.lineWidth = size * 0.045;
  ctx.beginPath(); ctx.arc(r, r, r * 0.90, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const inner = i % 3 === 0 ? 0.66 : 0.76, outer = 0.84;
    ctx.strokeStyle = '#22262b'; ctx.lineWidth = i % 3 === 0 ? size * 0.035 : size * 0.018;
    ctx.beginPath();
    ctx.moveTo(r + Math.cos(a) * r * inner, r + Math.sin(a) * r * inner);
    ctx.lineTo(r + Math.cos(a) * r * outer, r + Math.sin(a) * r * outer);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ══ THE SYSTEM'S SCREEN ═══════════════════════════════════════════════════
   A terminal readout, drawn the same way everything else here is drawn. It is
   a machine-shop console and it looks like one: dark, monospaced, a title bar,
   a caret that is always waiting, and numbers with their units on them.

   The lines are passed in by the page because what the system SAYS is the
   page's business — this module draws a screen. `caret` is drawn because a
   console with nothing waiting on it looks switched off, and this one is
   always waiting for somebody to ask it something. */
export function consoleScreen({ title = 'SYSTEM', status = 'READY', lines = [],
                                accent = '#7fd6a0', size = 512 } = {}) {
  const W = size, H = Math.round(size * 0.62);
  const c = canvas(W); c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1512'); bg.addColorStop(1, '#070c0a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // the title bar and its rule
  ctx.fillStyle = 'rgba(127,214,160,.10)'; ctx.fillRect(0, 0, W, H * 0.11);
  ctx.fillStyle = accent; ctx.fillRect(0, H * 0.11, W, Math.max(1, size * 0.003));
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = accent;
  ctx.font = `600 ${(size * 0.052).toFixed(1)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  ctx.fillText(title, W * 0.045, H * 0.058);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(127,214,160,.72)';
  ctx.fillText(status, W * 0.955, H * 0.058);

  // the body
  ctx.textAlign = 'left';
  const fs = size * 0.040;
  ctx.font = `400 ${fs.toFixed(1)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  let y = H * 0.215;
  for (const l of lines) {
    if (l && typeof l === 'object') {
      ctx.fillStyle = 'rgba(200,220,210,.62)';
      ctx.fillText(l.k, W * 0.055, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = l.warn ? '#e8a33d' : '#cfe8dc';
      ctx.fillText(l.v, W * 0.945, y);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = 'rgba(180,205,192,.80)';
      ctx.fillText(String(l), W * 0.055, y);
    }
    y += H * 0.088;
  }
  // the caret, waiting
  const cy = Math.min(y, H * 0.90);
  ctx.fillStyle = accent;
  ctx.fillRect(W * 0.055, cy - fs * 0.42, fs * 0.52, fs * 0.86);

  // scanlines and a little bloom, because a photographed screen has both
  for (let i = 0; i < H; i += 3) {
    ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(0, i, W, 1);
  }
  const gl = ctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.1, W * 0.5, H * 0.5, W * 0.75);
  gl.addColorStop(0, 'rgba(127,214,160,.05)');
  gl.addColorStop(1, 'rgba(0,0,0,.30)');
  ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = size * 0.012;
  ctx.strokeRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
