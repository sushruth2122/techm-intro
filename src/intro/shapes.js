import * as THREE from 'three';

// Procedural structures for the intro. Each shape is described as wireframe edges
// (plus a few surfaces and point clusters) and baked into a fixed number of particles,
// so the same particle pool can morph from one structure into the next.

export const POOL = 16000; // particles that morph through every dashboard scene
export const GLOBE_N = 9000;

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Colors in linear RGB (what the shaders and bloom work in), scaled by an intensity.
const lin = (hex, k = 1) => {
  const c = new THREE.Color(hex);
  return [c.r * k, c.g * k, c.b * k];
};

export const PAL = {
  steel: lin('#9AA6BC', 0.85),
  steelHi: lin('#C9D3E6', 1.0),
  steelDim: lin('#6B7890', 0.55),
  navy: lin('#2A5AA8', 0.55),
  cyan: lin('#00D8FF', 1.0),
  cyanDim: lin('#00D8FF', 0.4),
  blue: lin('#2F6BFF', 1.0),
  red: lin('#E31837', 1.1),
  green: lin('#1FE3A0', 1.0),
  greenDim: lin('#1FE3A0', 0.3),
  white: lin('#E8F4FF', 1.1),
  water: lin('#1A4FB0', 0.45),
};

const ball = (r, rad) => {
  for (;;) {
    const x = r() * 2 - 1, y = r() * 2 - 1, z = r() * 2 - 1;
    if (x * x + y * y + z * z <= 1) return [x * rad, y * rad, z * rad];
  }
};

// Spread `n` samples evenly over items by weight, so particles sit at a uniform
// spacing along every edge rather than clumping.
function stratified(items, weight, n, r, emit) {
  if (n <= 0 || !items.length) return;
  const cum = [];
  let total = 0;
  for (const it of items) cum.push((total += weight(it)));
  for (let k = 0; k < n; k++) {
    const u = ((k + r()) / n) * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    const start = lo ? cum[lo - 1] : 0;
    emit(items[lo], (u - start) / (cum[lo] - start || 1));
  }
}

class Builder {
  constructor(seed) {
    this.r = rng(seed);
    this.segs = [];
    this.quads = [];
    this.spots = [];
  }

  line(a, b, c, w = 1, wire = true) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (len > 1e-4) this.segs.push({ a, b, c, w, wire, len });
    return this;
  }

  path(pts, c, w = 1, wire = true, closed = false) {
    for (let i = 0; i < pts.length - 1; i++) this.line(pts[i], pts[i + 1], c, w, wire);
    if (closed) this.line(pts[pts.length - 1], pts[0], c, w, wire);
    return this;
  }

  // Axis-aligned box: (x, z) is the footprint centre, y the base.
  box(x, y, z, sx, sy, sz, c, w = 1, wire = true) {
    const hx = sx / 2, hz = sz / 2;
    const lo = [[x - hx, y, z - hz], [x + hx, y, z - hz], [x + hx, y, z + hz], [x - hx, y, z + hz]];
    const hi = lo.map((p) => [p[0], y + sy, p[2]]);
    for (let i = 0; i < 4; i++) {
      this.line(lo[i], lo[(i + 1) % 4], c, w, wire);
      this.line(hi[i], hi[(i + 1) % 4], c, w, wire);
      this.line(lo[i], hi[i], c, w, wire);
    }
    return this;
  }

  rect(x, y, z, sx, sz, c, w = 1, wire = true) {
    const hx = sx / 2, hz = sz / 2;
    return this.path([[x - hx, y, z - hz], [x + hx, y, z - hz], [x + hx, y, z + hz], [x - hx, y, z + hz]], c, w, wire, true);
  }

  ring(cx, y, cz, rad, n, c, w = 1, wire = true, phase = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + phase;
      pts.push([cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad]);
    }
    return this.path(pts, c, w, wire, true);
  }

  // Surface patch: origin + u + v, sampled as a light haze of particles.
  quad(o, u, v, c, w = 1) {
    const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    this.quads.push({ o, u, v, c, w, area });
    return this;
  }

  // A tight cluster of exactly n particles (LEDs, sensor nodes).
  spot(p, c, n, rad = 0.03) {
    this.spots.push({ p, c, n, rad });
    return this;
  }

  bake(count, edgeShare = 0.82, sparkle = 0.02) {
    const r = this.r;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let i = 0;
    const put = (x, y, z, c) => {
      const j = i * 3, k = 0.82 + r() * 0.36;
      const cc = r() < sparkle ? PAL.cyan : c;
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
      col[j] = cc[0] * k; col[j + 1] = cc[1] * k; col[j + 2] = cc[2] * k;
      i++;
    };
    for (const s of this.spots) {
      for (let n = 0; n < s.n && i < count; n++) {
        const [dx, dy, dz] = ball(r, s.rad);
        put(s.p[0] + dx, s.p[1] + dy, s.p[2] + dz, s.c);
      }
    }
    const rest = count - i;
    const nq = this.quads.length ? Math.round(rest * (1 - edgeShare)) : 0;
    const jit = 0.012;
    stratified(this.segs, (s) => s.len * s.w, rest - nq, r, (s, f) => {
      put(
        s.a[0] + (s.b[0] - s.a[0]) * f + (r() - 0.5) * jit,
        s.a[1] + (s.b[1] - s.a[1]) * f + (r() - 0.5) * jit,
        s.a[2] + (s.b[2] - s.a[2]) * f + (r() - 0.5) * jit,
        s.c,
      );
    });
    stratified(this.quads, (q) => q.area * q.w, nq, r, (q, f) => {
      const g = r();
      put(q.o[0] + q.u[0] * f + q.v[0] * g, q.o[1] + q.u[1] * f + q.v[1] * g, q.o[2] + q.u[2] * f + q.v[2] * g, q.c);
    });
    while (i < count) put(pos[(i - 1) * 3] || 0, pos[(i - 1) * 3 + 1] || 0, pos[(i - 1) * 3 + 2] || 0, PAL.steelDim);
    return { pos, col, lines: this.lineBuffers() };
  }

  lineBuffers() {
    const wires = this.segs.filter((s) => s.wire);
    const pos = new Float32Array(wires.length * 6);
    const col = new Float32Array(wires.length * 6);
    wires.forEach((s, i) => {
      pos.set(s.a, i * 6);
      pos.set(s.b, i * 6 + 3);
      col.set(s.c, i * 6);
      col.set(s.c, i * 6 + 3);
    });
    return { pos, col };
  }
}

// ---------------------------------------------------------------- spark & grid

export function sparkShape() {
  const r = rng(3);
  const pos = new Float32Array(POOL * 3), col = new Float32Array(POOL * 3);
  for (let i = 0; i < POOL; i++) {
    const [x, y, z] = ball(r, 0.25);
    pos.set([x, 1.2 + y, z], i * 3);
    col.set(r() < 0.5 ? PAL.red : PAL.cyan, i * 3);
  }
  return { pos, col };
}

export function gridShape() {
  const b = new Builder(11);
  const R = 14;
  for (let k = -R; k <= R; k++) {
    const h = Math.sqrt(R * R - k * k);
    if (h < 0.5) continue;
    const major = k % 4 === 0;
    const c = major ? PAL.cyanDim : PAL.navy;
    b.line([-h, 0.02, k], [h, 0.02, k], c, major ? 1.4 : 1, false);
    b.line([k, 0.02, -h], [k, 0.02, h], c, major ? 1.4 : 1, false);
  }
  return b.bake(POOL, 1, 0.03);
}

// ---------------------------------------------------------------- DCMesh data center

export const DC = { W: 1.05, H: 3.0, D: 1.2, gap: 0.12, n: 8, rows: [1.0, -2.0], units: 14 };
export const rackX = (i) => -((DC.n * DC.W + (DC.n - 1) * DC.gap) / 2) + DC.W / 2 + i * (DC.W + DC.gap);
export const unitY = (u) => 0.18 + ((u + 0.5) * (DC.H - 0.36)) / DC.units;
export const rackFront = (row) => DC.rows[row] + DC.D / 2;

// Server units that run hot until the predictive scan passes over them.
export const DC_HOT = [
  { row: 0, rack: 2, units: [8, 9, 10] },
  { row: 0, rack: 5, units: [3, 4] },
  { row: 1, rack: 6, units: [10, 11, 12] },
];

export function dataCenterShape() {
  const b = new Builder(21);
  const { W, H, D, n, rows, units } = DC;
  for (let x = -7.2; x <= 7.21; x += 0.6) b.line([x, 0.01, -3.4], [x, 0.01, 2.6], PAL.navy, 0.25, false);
  for (let z = -3.4; z <= 2.61; z += 0.6) b.line([-7.2, 0.01, z], [7.2, 0.01, z], PAL.navy, 0.25, false);

  rows.forEach((zc, ri) => {
    const fz = zc + D / 2;
    for (let i = 0; i < n; i++) {
      const x = rackX(i);
      b.box(x, 0, zc, W, H, D, PAL.steel, 1.2);
      b.path(
        [[x - W / 2 + 0.07, 0.1, fz + 0.01], [x + W / 2 - 0.07, 0.1, fz + 0.01], [x + W / 2 - 0.07, H - 0.1, fz + 0.01], [x - W / 2 + 0.07, H - 0.1, fz + 0.01]],
        PAL.steelDim, 0.6, true, true,
      );
      for (let u = 0; u < units; u++) {
        const y = unitY(u);
        b.line([x - W / 2 + 0.12, y - 0.07, fz + 0.02], [x + W / 2 - 0.12, y - 0.07, fz + 0.02], PAL.steelDim, 0.5, u % 2 === 0);
        b.spot([x + W / 2 - 0.2, y, fz + 0.03], (i + u + ri) % 5 === 0 ? PAL.blue : PAL.cyan, 3, 0.012);
      }
      b.quad([x - W / 2 + 0.1, 0.15, fz + 0.02], [W - 0.2, 0, 0], [0, H - 0.3, 0], PAL.steelDim, 1);
    }
    const L = rackX(n - 1) - rackX(0) + W + 0.4;
    b.box(0, H + 0.45, zc, L, 0.1, 0.5, PAL.steelDim, 0.6);
    for (let i = 0; i < n; i++) b.line([rackX(i), H, zc], [rackX(i), H + 0.45, zc], PAL.steelDim, 0.4);
    for (const s of [-1, 1]) {
      const x = s * (L / 2 + 0.9);
      b.box(x, 0, zc, 1.3, 2.3, D, PAL.steel, 1);
      for (let g = 0; g < 6; g++) b.line([x - 0.5 + g * 0.2, 0.3, fz + 0.01], [x - 0.5 + g * 0.2, 2.0, fz + 0.01], PAL.steelDim, 0.4);
    }
  });
  return b.bake(POOL, 0.8);
}

// ---------------------------------------------------------------- port & manufacturing

export const CRANES = [-8, -3.5, 1];

function crane(b, cx) {
  const S = PAL.steel, SD = PAL.steelDim;
  const hx = 1.3, zs = -0.5, zl = 2.5, yT = 6.2;
  for (const sx of [-hx, hx]) {
    b.line([cx + sx, 0, zs], [cx + sx, yT, zs], S, 1.8);
    b.line([cx + sx, 0, zl], [cx + sx, yT, zl], S, 1.8);
    b.line([cx + sx, yT, zs], [cx + sx, yT, zl], S, 1.2);
    b.line([cx + sx, 2.4, zs], [cx + sx, 2.4, zl], SD, 0.8);
    b.line([cx + sx, 2.4, zs], [cx + sx, yT, zl], SD, 0.5);
  }
  b.line([cx - hx, yT, zs], [cx + hx, yT, zs], S, 1.2);
  b.line([cx - hx, yT, zl], [cx + hx, yT, zl], S, 1.2);

  const z0 = 4.6, z1 = -9.6, yb = 6.9, yt = 7.5, bx = 0.55;
  for (const sx of [-bx, bx]) {
    b.line([cx + sx, yb, z0], [cx + sx, yb, z1], S, 1.4);
    b.line([cx + sx, yt, z0], [cx + sx, yt, z1], S, 1.0);
    for (let z = z0; z > z1 + 0.5; z -= 1.0) b.line([cx + sx, yb, z], [cx + sx, yt, z - 1.0], SD, 0.4);
  }
  b.line([cx - bx, yb, z1], [cx + bx, yb, z1], S);
  b.line([cx - bx, yt, z1], [cx + bx, yt, z1], S);

  const ya = 10.6, za = 1.0;
  for (const s of [-1, 1]) {
    const ap = [cx + s * bx, ya, za];
    b.line([cx + s * hx, yT, zs], ap, S, 1.2);
    b.line([cx + s * hx, yT, zl], ap, S, 1.2);
    b.line(ap, [cx + s * bx, yt, -5.5], SD, 0.5);
    b.line(ap, [cx + s * bx, yt, z1], SD, 0.5);
    b.line(ap, [cx + s * bx, yt, z0], SD, 0.5);
  }
  b.line([cx - bx, ya, za], [cx + bx, ya, za], S);

  const lead = cx === CRANES[1];
  const tz = lead ? -4.0 : -6.0;
  b.box(cx, yt, 3.5, 1.6, 1.0, 1.6, S, 1);
  b.box(cx, yb - 0.45, tz, 1.3, 0.45, 1.0, PAL.steelHi, 1);
  b.line([cx - 0.3, yb - 0.45, tz], [cx - 0.3, 4.0, tz], SD, 0.5);
  b.line([cx + 0.3, yb - 0.45, tz], [cx + 0.3, 4.0, tz], SD, 0.5);
  b.box(cx, 3.0, tz, 2.4, 1.0, 0.9, lead ? PAL.red : PAL.blue, 1.2);
  b.spot([cx, yb - 0.2, tz], PAL.cyan, 16, 0.08);
}

function ship(b) {
  const y0 = -0.2, y1 = 1.3, zA = -6.8, zB = -3.4, xs = -12.5, xe = 1.2, xb = 3.4, zm = (zA + zB) / 2;
  const deck = [[xs, y1, zA], [xe, y1, zA], [xb, y1, zm], [xe, y1, zB], [xs, y1, zB]];
  const keel = deck.map(([x, , z]) => [x > xe ? x - 0.6 : x, y0, z < zm ? z + 0.25 : z > zm ? z - 0.25 : z]);
  b.path(deck, PAL.steelHi, 1.2, true, true);
  b.path(keel, PAL.steel, 0.8, true, true);
  deck.forEach((p, i) => b.line(p, keel[i], PAL.steel, 0.8));
  b.quad([xs, y0 + 0.05, zB], [xe - xs, 0, 0], [0, y1 - y0 - 0.1, 0], PAL.steelDim, 0.6);
  b.box(xs + 1.3, y1, zm, 1.6, 3.2, 2.6, PAL.steel, 1);
  b.box(xs + 1.3, y1 + 3.2, zm, 2.2, 0.5, 3.2, PAL.steelHi, 0.8);
  const r = b.r;
  for (let x = xs + 3.2; x < xe - 1; x += 2.55) {
    for (let z = zA + 0.5; z < zB - 0.4; z += 0.95) {
      const tiers = 1 + Math.floor(r() * 3);
      for (let k = 0; k < tiers; k++) {
        const c = r() < 0.12 ? PAL.red : r() < 0.25 ? PAL.blue : PAL.steel;
        b.box(x, y1 + k * 0.9, z, 2.4, 0.9, 0.9, c, 0.55);
      }
    }
  }
}

function yard(b) {
  const r = b.r;
  for (let x = -11.5; x < 3.5; x += 2.6) {
    for (let z = 4.2; z <= 7.6; z += 1.0) {
      const tiers = 1 + Math.floor(r() * 3);
      for (let k = 0; k < tiers; k++) {
        const c = r() < 0.1 ? PAL.red : r() < 0.2 ? PAL.blue : PAL.steelDim;
        b.box(x, k * 0.9, z, 2.4, 0.9, 0.9, c, 0.45);
      }
    }
  }
  const gx = -4.2, za = 3.5, zb = 8.2, h = 3.6;
  for (const dx of [-0.9, 0.9]) {
    b.line([gx + dx, 0, za], [gx + dx, h, za], PAL.steel, 1.2);
    b.line([gx + dx, 0, zb], [gx + dx, h, zb], PAL.steel, 1.2);
    b.line([gx + dx, h, za], [gx + dx, h, zb], PAL.steel, 1);
  }
  b.line([gx - 0.9, h, za], [gx + 0.9, h, za], PAL.steel);
  b.line([gx - 0.9, h, zb], [gx + 0.9, h, zb], PAL.steel);
}

// A frame building going up beside the quay, with a tower crane lifting a load.
function construction(b) {
  const xs = [5, 7, 9], zs = [3, 4.6, 6.2], fh = 1.5, floors = 5;
  for (const x of xs) for (const z of zs) b.line([x, 0, z], [x, (x === 9 && z === 6.2 ? floors - 1 : floors) * fh, z], PAL.steel, 0.9);
  for (let f = 1; f <= floors; f++) {
    const y = f * fh;
    if (f < floors) b.rect(7, y, 4.6, 4, 3.2, f < 4 ? PAL.steel : PAL.steelDim, 0.7);
    else b.path([[5, y, 3], [9, y, 3], [9, y, 4.6]], PAL.steelDim, 0.6);
    if (f < 4) b.quad([5, y, 3], [4, 0, 0], [0, 0, 3.2], PAL.steelDim, 0.3);
  }
  for (let f = 0; f < 4; f++) b.line([5, f * fh, 6.2], [7, (f + 1) * fh, 6.2], PAL.steelDim, 0.4);

  const mx = 11.2, mz = 4.6, H = 11, s = 0.3;
  for (const [dx, dz] of [[-s, -s], [s, -s], [s, s], [-s, s]]) b.line([mx + dx, 0, mz + dz], [mx + dx, H, mz + dz], PAL.steelHi, 0.9);
  for (let y = 0; y < H - 0.4; y += 0.8) b.line([mx - s, y, mz + s], [mx + s, y + 0.8, mz + s], PAL.steelDim, 0.3);
  b.box(mx, H, mz, 0.9, 0.7, 0.9, PAL.steelHi, 0.8);
  const jy = H + 0.7;
  b.line([mx, jy, mz], [3.0, jy, mz], PAL.steelHi, 1.1);
  for (let x = mx; x > 3.4; x -= 0.8) b.line([x, jy, mz], [x - 0.4, jy + 0.45, mz], PAL.steelDim, 0.3);
  b.line([mx, jy, mz], [mx + 3, jy, mz], PAL.steelHi, 0.9);
  b.box(mx + 2.6, H, mz, 0.8, 0.7, 0.6, PAL.red, 0.8);
  b.line([mx, jy, mz], [mx, H + 2.4, mz], PAL.steel, 0.8);
  b.line([mx, H + 2.4, mz], [4.2, jy, mz], PAL.steelDim, 0.5);
  b.line([mx, H + 2.4, mz], [mx + 3, jy, mz], PAL.steelDim, 0.5);
  b.box(6.0, jy - 0.25, mz, 0.5, 0.25, 0.5, PAL.steelHi, 0.6);
  b.line([6.0, jy - 0.25, mz], [6.0, 8.2, mz], PAL.steelDim, 0.5);
  b.box(6.0, 7.6, mz, 1.6, 0.6, 0.8, PAL.blue, 0.7);
}

export function portShape() {
  const b = new Builder(31);
  b.line([-14, 0.02, -1], [14, 0.02, -1], PAL.steelHi, 1.5);
  b.line([-14, 0.02, -0.5], [4.5, 0.02, -0.5], PAL.steelDim, 0.6);
  b.line([-14, 0.02, 2.5], [4.5, 0.02, 2.5], PAL.steelDim, 0.6);
  b.quad([-14, -0.25, -11], [28, 0, 0], [0, 0, 10], PAL.water, 1);
  for (let z = -10; z < -1.5; z += 1.2) b.line([-14, -0.2, z], [14, -0.2, z], PAL.water, 0.3, false);
  for (const cx of CRANES) crane(b, cx);
  ship(b);
  yard(b);
  construction(b);
  return b.bake(POOL, 0.88);
}

// ---------------------------------------------------------------- manufacturing

export const FACTORY = { lines: [-2.2, 0, 2.2], x: [-7.3, 7.3] };

export function factoryShape() {
  const b = new Builder(71);
  const X = [-9, -6, -3, 0, 3, 6, 9], z0 = -4.6, z1 = 4.6, h = 5, ridge = 6.4;
  b.rect(0, 0.02, 0, 18.6, 9.6, PAL.steelDim, 0.6, false);
  for (const z of [-3.2, 3.2]) for (let x = -8.5; x < 8.5; x += 1.2) b.line([x, 0.02, z], [x + 0.6, 0.02, z], PAL.cyanDim, 0.5, false);
  for (const x of X) {
    b.line([x, 0, z0], [x, h, z0], PAL.steel, 1);
    b.line([x, 0, z1], [x, h, z1], PAL.steel, 1);
    b.path([[x, h, z0], [x, ridge, 0], [x, h, z1]], PAL.steel, 0.8);
    b.line([x, h, z0], [x, h, z1], PAL.steelDim, 0.4);
    b.line([x, h, -2.3], [x, ridge - 0.7, -2.3], PAL.steelDim, 0.3);
    b.line([x, h, 2.3], [x, ridge - 0.7, 2.3], PAL.steelDim, 0.3);
  }
  for (const [y, z] of [[h, z0], [h, z1], [ridge, 0]]) b.line([X[0], y, z], [X[6], y, z], PAL.steel, 0.8);

  // three conveyor lines with products
  for (const cz of FACTORY.lines) {
    b.box(0, 0.75, cz, 15, 0.14, 0.7, PAL.steelHi, 0.9);
    for (let x = -7.2; x <= 7.2; x += 1.2) {
      b.line([x, 0, cz - 0.3], [x, 0.75, cz - 0.3], PAL.steelDim, 0.4);
      b.line([x, 0, cz + 0.3], [x, 0.75, cz + 0.3], PAL.steelDim, 0.4);
    }
    for (let x = -7.3; x <= 7.3; x += 0.4) b.line([x, 0.9, cz - 0.33], [x, 0.9, cz + 0.33], PAL.steelDim, 0.2, false);
    for (let x = -6.6; x <= 6.6; x += 1.65) b.box(x, 0.9, cz, 0.42, 0.36, 0.42, PAL.blue, 0.6);
  }

  // robotic cells between the lines
  for (const x of [-5, 0, 5]) {
    for (const [z, reach] of [[-1.1, -0.9], [1.1, 0.9]]) {
      b.box(x, 0, z, 0.55, 0.4, 0.55, PAL.steelHi, 0.8);
      const j1 = [x, 0.4, z], j2 = [x + 0.35, 2.1, z - reach * 0.3], j3 = [x + 0.15, 1.45, z + reach];
      for (const o of [-0.06, 0.06]) {
        b.line([j1[0] + o, j1[1], j1[2]], [j2[0] + o, j2[1], j2[2]], PAL.steelHi, 1.2);
        b.line([j2[0] + o, j2[1], j2[2]], [j3[0] + o, j3[1], j3[2]], PAL.steelHi, 1.2);
      }
      b.spot(j2, PAL.cyan, 14, 0.07);
      b.spot(j3, PAL.red, 10, 0.05);
    }
  }

  // computer-vision QC gantry over the middle line
  b.path([[6.5, 0, -0.75], [6.5, 2.4, -0.75], [6.5, 2.4, 0.75], [6.5, 0, 0.75]], PAL.steelHi, 0.9);
  b.box(6.5, 2.0, 0, 0.45, 0.4, 0.45, PAL.cyan, 0.8);
  b.spot([6.5, 1.95, 0], PAL.cyan, 18, 0.08);

  // CNC machines along the back wall, storage racks and an edge-AI cabinet at the front
  for (const x of [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]) {
    b.box(x, 0, -3.7, 2.0, 1.6, 1.0, PAL.steel, 0.8);
    b.quad([x - 0.5, 0.7, -3.19], [0.7, 0, 0], [0, 0.5, 0], PAL.cyanDim, 0.5);
    b.spot([x + 0.7, 1.3, -3.18], PAL.green, 5, 0.04);
  }
  for (let x = -8; x <= -2.01; x += 1.5) b.line([x, 0, 3.7], [x, 3, 3.7], PAL.steelDim, 0.5);
  for (const y of [1, 2, 3]) b.line([-8, y, 3.7], [-2, y, 3.7], PAL.steel, 0.6);
  b.box(8.3, 0, 3.7, 1.0, 2.0, 0.6, PAL.steelHi, 0.8);
  for (let k = 0; k < 4; k++) b.spot([8.0 + (k % 2) * 0.3, 1.2 + (k >> 1) * 0.35, 4.02], k === 3 ? PAL.red : PAL.cyan, 4, 0.04);
  return b.bake(POOL, 0.86);
}

// DCMesh cooling: air leaves each CRAC unit and runs along the row fronts toward the centre.
export function coolingFlows(n) {
  const r = rng(61);
  const start = new Float32Array(n * 3), end = new Float32Array(n * 3), seed = new Float32Array(n);
  const crac = (DC.n * DC.W + (DC.n - 1) * DC.gap) / 2 + 0.2 + 0.9;
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1;
    const z = DC.rows[(i >> 1) % 2] + DC.D / 2 + 0.25 + r() * 0.35;
    start.set([s * (crac - 0.4), 0.3 + r() * 1.8, z], i * 3);
    end.set([s * r() * 0.6, 0.3 + r() * 2.5, z - 0.15], i * 3);
    seed[i] = r();
  }
  return { start, end, seed };
}

// Port: autonomous-vehicle routes between yard, quay and factory, as (x, z) waypoints.
export const AGV_ROUTES = [
  [[-10, 3.6], [-8, 2.0], [-3.5, 1.0], [1, 1.5], [4.5, 3.0]],
  [[3.5, 7.8], [4.6, 5.5], [5.0, 3.0], [6.5, 1.2]],
  [[-11.5, -0.2], [-6, -0.25], [-1, -0.2], [3.5, -0.25]],
];

function terminal(b) {
  const x0 = -11, x1 = 5, zf = -2, zb = -7;
  const roofY = (x, z) => 3.0 + 1.0 * Math.sin((Math.PI * (z - zf)) / (zb - zf)) + 0.22 * Math.sin(x * 0.45);
  const steps = 10;
  for (let x = x0; x <= x1 + 0.01; x += 0.8) {
    const rib = [];
    for (let k = 0; k <= steps; k++) {
      const z = zf + ((zb - zf) * k) / steps;
      rib.push([x, roofY(x, z), z]);
    }
    b.path(rib, x === x0 || x > x1 - 0.5 ? PAL.steelHi : PAL.steel, 0.7);
    b.line([x, 0, zf], [x, roofY(x, zf), zf], PAL.steelDim, 0.5);
  }
  for (let k = 0; k <= 4; k++) {
    const z = zf + ((zb - zf) * k) / 4;
    const pts = [];
    for (let x = x0; x <= x1 + 0.01; x += 0.8) pts.push([x, roofY(x, z), z]);
    b.path(pts, k === 2 ? PAL.cyanDim : PAL.steel, 0.8);
  }
  for (const y of [1.1, 2.2]) b.line([x0, y, zf], [x1, y, zf], PAL.steelDim, 0.6);
  b.rect((x0 + x1) / 2, 0, (zf + zb) / 2, x1 - x0, zf - zb, PAL.steel, 0.8);
  for (let x = x0; x <= x1 + 0.01; x += 1.6) b.line([x, 0, zb], [x, roofY(x, zb), zb], PAL.steelDim, 0.4);
  b.quad([x0, 0, zf], [x1 - x0, 0, 0], [0, 3.0, 0], PAL.cyanDim, 0.6);

  for (const px of [-8, -3, 2]) {
    b.box(px, 0, -9.0, 1.4, 1.7, 4.0, PAL.steel, 0.8);
    b.line([px + 0.7, 1.3, -10.2], [px + 2.3, 1.3, -11.6], PAL.steelHi, 0.6);
    aircraft(b, px + 2.6, -13.6);
  }
}

function aircraft(b, cx, cz, s = 0.85) {
  const P = (l, y, r) => [cx + r * s, y * s, cz + l * s];
  const R = 0.32, yc = 1.15, L0 = -2.6, L1 = 2.2;
  const rim = [[R, 0], [-R, 0], [0, R], [0, -R]];
  for (const [dy, dr] of rim) {
    b.line(P(L0 + 0.4, yc + dy * 0.8, dr * 0.8), P(L1, yc + dy, dr), PAL.steelHi, 0.8);
    b.line(P(L1, yc + dy, dr), P(L1 + 0.55, yc - 0.05, 0), PAL.steelHi, 0.6);
    b.line(P(L0 + 0.4, yc + dy * 0.8, dr * 0.8), P(L0, yc + 0.25, 0), PAL.steelHi, 0.6);
  }
  for (const l of [-1.6, -0.4, 0.8, 1.8]) {
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      pts.push(P(l, yc + Math.cos(a) * R, Math.sin(a) * R));
    }
    b.path(pts, PAL.steelDim, 0.4, true, true);
  }
  for (const sd of [-1, 1]) {
    b.path([P(0.7, yc - 0.15, sd * R), P(-0.5, yc - 0.05, sd * 2.7), P(-1.0, yc - 0.05, sd * 2.7), P(-0.6, yc - 0.15, sd * R)], PAL.steel, 0.8);
    b.line(P(0.5, yc - 0.5, sd * 1.15), P(-0.3, yc - 0.5, sd * 1.15), PAL.steelHi, 0.6);
    b.path([P(-1.9, yc + 0.1, sd * 0.2), P(-2.45, yc + 0.15, sd * 1.05), P(-2.65, yc + 0.15, sd * 1.05), P(-2.4, yc + 0.1, sd * 0.2)], PAL.steel, 0.6);
  }
  b.path([P(-1.7, yc + R, 0), P(-2.5, yc + 1.35, 0), P(-2.7, yc + 1.35, 0), P(-2.55, yc + 0.3, 0)], PAL.steel, 0.7);
}

function tower(b, cx, cz) {
  const oct = (r, y) => Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
  });
  const base = oct(0.5, 0), top = oct(0.5, 6.8);
  base.forEach((p, i) => b.line(p, top[i], PAL.steel, 0.9));
  for (let y = 0; y <= 6.8; y += 1.7) b.path(oct(0.5, y), PAL.steelDim, 0.5, true, true);
  const c0 = oct(0.95, 6.9), c1 = oct(1.25, 7.9), c2 = oct(1.05, 8.3);
  b.path(c0, PAL.steelHi, 0.8, true, true);
  b.path(c1, PAL.cyan, 0.8, true, true);
  b.path(c2, PAL.steelHi, 0.8, true, true);
  c0.forEach((p, i) => {
    b.line(p, c1[i], PAL.steelHi, 0.6);
    b.line(c1[i], c2[i], PAL.steel, 0.4);
  });
  b.line([cx, 8.3, cz], [cx, 9.6, cz], PAL.steelHi, 0.6);
  b.spot([cx, 9.6, cz], PAL.red, 12, 0.06);
}

function building(b, x, z, sx, sy, sz) {
  b.box(x, 0, z, sx, sy, sz, PAL.steel, 1.1);
  for (let y = 0.9; y < sy - 0.1; y += 0.9) b.rect(x, y, z, sx, sz, PAL.steelDim, 0.5);
  const cols = Math.round(sx / 0.5);
  for (let k = 1; k < cols; k++) {
    const xx = x - sx / 2 + (k * sx) / cols;
    b.line([xx, 0, z + sz / 2], [xx, sy, z + sz / 2], PAL.steelDim, 0.35, false);
  }
  b.quad([x - sx / 2, 0, z + sz / 2], [sx, 0, 0], [0, sy, 0], PAL.cyanDim, 0.5);
}

// ZMU smart campus: towers, solar roofs, plaza, trees, EV parking and smart street lights.
export const CAMPUS = {
  buildings: [[-7, -2.5, 3.6, 7.2, 3.0], [-2, -4, 4.2, 4.5, 3.0], [3.2, -3, 3.0, 5.4, 3.0], [8, -1.2, 3.4, 3.6, 3.4], [-10, 3.2, 2.6, 2.7, 2.4]],
  chargers: [5.5, 7.5, 9.5],
  poles: [-10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10],
};

export function campusShape() {
  const b = new Builder(43);
  for (const [x, z, sx, sy, sz] of CAMPUS.buildings) building(b, x, z, sx, sy, sz);
  for (const [x, y, z, w, d] of [[-2, 4.5, -4, 3.6, 2.4], [8, 3.6, -1.2, 2.8, 2.8]]) {
    for (let k = 0; k < 4; k++) {
      const zz = z - d / 2 + 0.2 + k * (d / 4);
      b.quad([x - w / 2, y + 0.08, zz], [w, 0, 0], [0, 0.22, 0.42], PAL.blue, 0.6);
      b.line([x - w / 2, y + 0.08, zz], [x + w / 2, y + 0.08, zz], PAL.blue, 0.4);
      b.line([x - w / 2, y + 0.3, zz + 0.42], [x + w / 2, y + 0.3, zz + 0.42], PAL.blue, 0.4);
    }
  }
  b.box(3.2, 5.4, -3, 1.2, 0.5, 0.9, PAL.steelHi, 0.8);
  b.ring(3.2, 5.92, -3, 0.25, 10, PAL.cyan, 0.5);

  b.ring(0.8, 0.03, 2.4, 2.4, 48, PAL.cyanDim, 0.8, false);
  b.ring(0.8, 0.03, 2.4, 1.4, 36, PAL.cyanDim, 0.5, false);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.line([0.8 + Math.cos(a) * 2.4, 0.03, 2.4 + Math.sin(a) * 2.4], [0.8 + Math.cos(a) * 4.2, 0.03, 2.4 + Math.sin(a) * 4.2], PAL.navy, 0.5, false);
  }
  for (const [x, z] of [[-4.5, 1.5], [-3, 4.5], [3.6, 1.2], [4.4, 5.6], [-6, 6], [-8, 0.8], [11, 2.5], [1, 6.6]]) {
    b.line([x, 0, z], [x, 0.9, z], PAL.steelDim, 0.4);
    b.ring(x, 1.1, z, 0.45, 10, PAL.greenDim, 0.5);
    b.ring(x, 1.45, z, 0.32, 10, PAL.greenDim, 0.4);
    b.spot([x, 1.5, z], PAL.greenDim, 8, 0.25);
  }
  for (let x = 5; x <= 11; x += 1) b.line([x, 0.02, 4], [x, 0.02, 6], PAL.steelDim, 0.4, false);
  b.line([5, 0.02, 6], [11, 0.02, 6], PAL.steelDim, 0.4, false);
  for (const x of CAMPUS.chargers) {
    b.box(x, 0, 3.6, 0.3, 1.0, 0.25, PAL.steelHi, 0.6);
    b.spot([x, 0.85, 3.75], PAL.green, 8, 0.05);
  }
  const walk = [];
  for (let x = -12; x <= 12; x += 1) walk.push([x, 0.02, 7.4 + 0.3 * Math.sin(x * 0.5)]);
  b.path(walk, PAL.cyanDim, 0.8, false);
  for (const x of CAMPUS.poles) {
    b.line([x, 0, 8.2], [x, 1.8, 8.2], PAL.steel, 0.6);
    b.line([x, 1.8, 8.2], [x + 0.35, 1.9, 8.2], PAL.steelHi, 0.4);
    b.spot([x + 0.35, 1.95, 8.2], PAL.white, 6, 0.04);
  }
  return b.bake(POOL, 0.86);
}

export function airportShape() {
  const b = new Builder(53);
  b.rect(0, 0.02, -18.2, 36, 1.6, PAL.steelDim, 0.6, false);
  for (let x = -17; x < 17; x += 1.6) b.line([x, 0.02, -18.2], [x + 0.8, 0.02, -18.2], PAL.cyanDim, 0.8, false);
  b.line([-15, 0.02, -16.3], [15, 0.02, -16.3], PAL.navy, 0.6, false);
  terminal(b);
  tower(b, 9, -9);
  const road = [];
  for (let x = -12; x <= 7; x += 1) road.push([x, 0.02, 0.9 + 0.25 * Math.sin(x * 0.3)]);
  b.path(road, PAL.cyanDim, 0.8, false);
  b.line([-11, 0.02, -0.6], [5, 0.02, -0.6], PAL.steelDim, 0.5, false);
  b.box(-6.5, 0, 3.6, 6, 1.8, 2.4, PAL.steelDim, 0.7);
  b.rect(-6.5, 0.9, 3.6, 6, 2.4, PAL.steelDim, 0.5);
  return b.bake(POOL, 0.86);
}

// ---------------------------------------------------------------- retail

export function retailShape() {
  const b = new Builder(61);
  const x0 = -10, x1 = 10, z0 = -6.5, z1 = 6.5, H = 3.4;
  b.rect(0, 0.02, 0, 20, 13, PAL.steelDim, 0.8);
  b.path([[x0, H, z1], [x0, H, z0], [x1, H, z0], [x1, H, z1]], PAL.steel, 0.9);
  for (const x of [x0, x1]) for (let z = z0; z <= z1 + 0.01; z += 2.6) b.line([x, 0, z], [x, H, z], PAL.steelDim, 0.6);
  for (let x = x0; x <= x1 + 0.01; x += 2.5) b.line([x, 0, z0], [x, H, z0], PAL.steelDim, 0.6);
  b.line([x0, H, z1], [x1, H, z1], PAL.steelHi, 1);
  b.line([x0, 2.6, z1], [x1, 2.6, z1], PAL.steelDim, 0.5);
  for (let x = x0; x <= x1 + 0.01; x += 1) if (Math.abs(x) > 1.6) b.line([x, 0, z1], [x, 2.6, z1], PAL.steelDim, 0.35);
  b.quad([x0, 0, z1], [8.4, 0, 0], [0, 2.6, 0], PAL.cyanDim, 0.5);
  b.quad([1.6, 0, z1], [8.4, 0, 0], [0, 2.6, 0], PAL.cyanDim, 0.5);
  b.path([[-3, 2.75, z1 + 0.02], [3, 2.75, z1 + 0.02], [3, 3.25, z1 + 0.02], [-3, 3.25, z1 + 0.02]], PAL.red, 0.8, true, true);

  for (const z of [-4.6, -2.6, -0.6, 1.4]) {
    for (const [a, c] of [[-8.6, -1.4], [1.4, 8.6]]) {
      const w = c - a;
      b.box((a + c) / 2, 0, z, w, 1.8, 0.7, PAL.steel, 0.8);
      for (const y of [0.6, 1.2]) {
        b.line([a, y, z + 0.35], [c, y, z + 0.35], PAL.steelDim, 0.5);
        b.line([a, y, z - 0.35], [c, y, z - 0.35], PAL.steelDim, 0.3, false);
      }
      b.quad([a, 0.1, z + 0.36], [w, 0, 0], [0, 1.6, 0], PAL.blue, 0.25);
    }
  }
  for (const x of [-7, -4.6, -2.2, 2.2, 4.6, 7]) {
    b.box(x, 0, 4.2, 1.5, 0.9, 0.7, PAL.steelHi, 0.8);
    b.line([x + 0.5, 0.9, 4.0], [x + 0.5, 1.4, 4.0], PAL.steelDim, 0.4);
    b.spot([x + 0.5, 1.45, 4.0], PAL.cyan, 6, 0.06);
  }
  for (const x of [-1.4, -0.45, 0.45, 1.4]) b.line([x, 0, 5.8], [x, 1.2, 5.8], PAL.steelHi, 0.6);
  for (let x = -7.5; x <= 7.5; x += 2.5) for (let z = -5; z <= 3; z += 2) b.line([x - 0.4, H - 0.1, z], [x + 0.4, H - 0.1, z], PAL.white, 0.25, false);
  b.box(6, H, -4, 2, 0.8, 1.4, PAL.steelHi, 0.8);
  b.ring(5.5, H + 0.82, -4, 0.3, 12, PAL.cyan, 0.5);
  b.ring(6.5, H + 0.82, -4, 0.3, 12, PAL.cyan, 0.5);
  b.quad([-2.5, 1.2, z0 + 0.02], [5, 0, 0], [0, 1.6, 0], PAL.cyan, 0.4);
  return b.bake(POOL, 0.84);
}

// ---------------------------------------------------------------- SIA Facility (BMS)

export const FACILITY = { floors: 4, fh: 1.6, ducts: [-4, -1.5, 1, 3.5] };

export function facilityShape() {
  const b = new Builder(101);
  const { floors, fh } = FACILITY, H = floors * fh, z1 = 2.25;
  b.box(0, 0, -1, 12, H, 6.5, PAL.steel, 1.3);
  for (let f = 1; f < floors; f++) b.rect(0, f * fh, -1, 12, 6.5, PAL.steelDim, 0.6);
  for (let x = -5.25; x <= 5.26; x += 0.75) b.line([x, 0, z1], [x, H, z1], PAL.steelDim, 0.3, false);
  b.quad([-6, 0, z1], [12, 0, 0], [0, H, 0], PAL.cyanDim, 0.45);
  for (let f = 0; f < floors; f++) {
    const y = f * fh + 1.35;
    b.line([-5.5, y, -1], [5.5, y, -1], PAL.cyanDim, 0.8);
    for (const x of FACILITY.ducts) {
      b.line([x, y, -1], [x, y, -3.6], PAL.cyanDim, 0.4);
      b.line([x, y, -1], [x, y, 1.6], PAL.cyanDim, 0.4);
    }
    for (const x of [-4.5, -2.25, 0, 2.25, 4.5]) for (const z of [-3, -1, 1]) b.spot([x, f * fh + 1.5, z], PAL.white, 4, 0.05);
  }
  b.box(5.2, 0, -3.5, 0.5, H, 0.5, PAL.steelDim, 0.5);
  b.rect(0, H + 0.4, -1, 12, 6.5, PAL.steelDim, 0.5);

  // roof plant: chillers, cooling towers, AHU
  b.box(-3.2, H, -2.2, 2.4, 1.1, 1.6, PAL.steelHi, 0.9);
  b.ring(-3.8, H + 1.12, -2.2, 0.35, 12, PAL.cyan, 0.5);
  b.ring(-2.6, H + 1.12, -2.2, 0.35, 12, PAL.cyan, 0.5);
  for (const x of [1.6, 3.6]) {
    for (const y of [0, 0.8, 1.6]) b.ring(x, H + y, -2.2, 0.75 - y * 0.1, 14, y === 1.6 ? PAL.cyan : PAL.steel, 0.5);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.line([x + Math.cos(a) * 0.75, H, -2.2 + Math.sin(a) * 0.75], [x + Math.cos(a) * 0.59, H + 1.6, -2.2 + Math.sin(a) * 0.59], PAL.steelDim, 0.4);
    }
  }
  b.box(-0.6, H, 0.6, 1.6, 0.8, 1.0, PAL.steel, 0.8);

  // entrance with access-control gates, security cameras, site boundary
  b.box(0, 0, 3.0, 3.2, 2.2, 1.4, PAL.steel, 0.8);
  for (const x of [-0.9, 0, 0.9]) {
    b.line([x, 0, 3.9], [x, 1.0, 3.9], PAL.steelHi, 0.5);
    b.spot([x, 1.0, 3.9], PAL.green, 4, 0.04);
  }
  for (const p of [[-6, 6.0, 2.25], [6, 6.0, 2.25], [-6, 3, -4.25]]) b.spot(p, PAL.red, 10, 0.06);
  b.rect(0, 0.02, -1, 16, 10.5, PAL.navy, 0.6, false);
  return b.bake(POOL, 0.85);
}

// ---------------------------------------------------------------- SIA Xcel (GenAI dashboards)

// Rounded rectangle in the XY plane at depth z.
function rrect(b, x, y, w, h, r, z, c, wt = 1, wire = false) {
  const pts = [];
  const arc = (cx, cy, a0) => {
    for (let k = 0; k <= 4; k++) {
      const a = a0 + (k / 4) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]);
    }
  };
  arc(x + w - r, y + r, -Math.PI / 2);
  arc(x + w - r, y + h - r, 0);
  arc(x + r, y + h - r, Math.PI / 2);
  arc(x + r, y + r, Math.PI);
  b.path(pts, c, wt, wire, true);
}

export const XCEL = { z: -2, prompt: [-2.95, 1.65] };

export function xcelShape() {
  const b = new Builder(91);
  const Z = XCEL.z, W = 17, H = 8.8, y0 = 0.8;
  const P = (x, y) => [x, y, Z];
  rrect(b, -W / 2, y0, W, H, 0.4, Z, PAL.white, 1.2);
  b.line(P(-8.1, y0 + H - 0.7), P(8.1, y0 + H - 0.7), PAL.cyanDim, 0.5, false);
  for (let k = 0; k < 3; k++) b.spot(P(-7.9 + k * 0.35, y0 + H - 0.35), k ? PAL.steelHi : PAL.red, 6, 0.05);
  b.line(P(-2.3, y0 + 0.3), P(-2.3, y0 + H - 1.0), PAL.steelDim, 0.5, false);

  // conversation: question → answer → follow-up → answer, then the prompt bar
  const text = (x, y, len, c) => b.line(P(x, y), P(x + len, y), c, 0.7, false);
  rrect(b, -6.2, 7.75, 3.5, 0.9, 0.3, Z, PAL.cyan, 0.9);
  text(-5.9, 8.2, 2.6, PAL.cyan);
  rrect(b, -8.0, 5.9, 4.8, 1.55, 0.3, Z, PAL.steelHi, 0.9);
  text(-7.7, 6.95, 3.9, PAL.steelHi);
  text(-7.7, 6.55, 3.2, PAL.steelHi);
  for (let k = 0; k < 5; k++) b.quad([-7.6 + k * 0.32, 6.05, Z], [0.2, 0, 0], [0, 0.15 + k * 0.05, 0], PAL.blue, 0.6);
  rrect(b, -5.6, 4.75, 2.9, 0.8, 0.3, Z, PAL.cyan, 0.9);
  text(-5.3, 5.15, 2.0, PAL.cyan);
  rrect(b, -8.0, 2.9, 4.8, 1.5, 0.3, Z, PAL.steelHi, 0.9);
  for (const [y, l] of [[3.95, 4.0], [3.55, 3.4], [3.15, 2.2]]) text(-7.7, y, l, PAL.steelHi);
  rrect(b, -8.0, 1.25, 5.3, 0.8, 0.4, Z, PAL.cyan, 1.2);
  text(-7.6, 1.65, 1.8, PAL.steelDim);
  b.path([P(-3.3, 1.45), P(-2.95, 1.65), P(-3.3, 1.85)], PAL.cyan, 0.8, false);

  // generated dashboard: KPI tiles, trend, bars, donut and a table
  [0.7, 0.45, 0.85, 0.3].forEach((v, i) => {
    const x = -1.9 + i * 2.55;
    rrect(b, x, 7.55, 2.3, 1.15, 0.2, Z, PAL.cyanDim, 0.7);
    b.line(P(x + 0.2, 7.85), P(x + 0.2 + 1.9 * v, 7.85), i === 3 ? PAL.red : PAL.cyan, 2.2, false);
    text(x + 0.2, 8.3, 0.9, PAL.white);
  });
  b.line(P(-1.9, 3.6), P(3.8, 3.6), PAL.steelHi, 0.5, false);
  b.line(P(-1.9, 3.6), P(-1.9, 7.1), PAL.steelHi, 0.5, false);
  const curve = [];
  for (let k = 0; k <= 40; k++) {
    const s = k / 40;
    curve.push(P(-1.9 + s * 5.7, 3.9 + 2.8 * (0.45 + 0.28 * Math.sin(s * 7) + 0.18 * Math.sin(s * 17 + 1.3))));
  }
  b.path(curve, PAL.cyan, 2.0, false);
  [0.5, 0.8, 0.35, 0.95, 0.6, 0.75].forEach((v, k) => b.quad([4.4 + k * 0.6, 3.6, Z], [0.38, 0, 0], [0, v * 3.3, 0], k === 3 ? PAL.red : PAL.blue, 1));
  b.line(P(4.2, 3.6), P(8.0, 3.6), PAL.steelHi, 0.5, false);
  const donut = (r0, r1, a0, a1, c) => {
    for (let r = r0; r <= r1 + 1e-3; r += 0.07) {
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const a = a0 + ((a1 - a0) * k) / 24;
        pts.push(P(0.4 + Math.cos(a) * r, 2.2 + Math.sin(a) * r));
      }
      b.path(pts, c, 0.5, false);
    }
  };
  donut(0.7, 0.95, 0, 3.6, PAL.cyan);
  donut(0.7, 0.95, 3.75, 5.2, PAL.red);
  donut(0.7, 0.95, 5.35, 6.15, PAL.blue);
  for (let k = 0; k < 4; k++) {
    const y = 1.45 + k * 0.42;
    b.line(P(2.0, y), P(8.0, y), PAL.steelDim, 0.5, false);
    b.spot(P(2.25, y + 0.2), k === 1 ? PAL.red : PAL.cyan, 3, 0.03);
    text(2.6, y + 0.2, 1.6 + (k % 2) * 0.8, PAL.steelDim);
  }

  b.ring(0, 0.03, 0, 7, 72, PAL.cyanDim, 0.8, false);
  b.ring(0, 0.03, 0, 5.2, 64, PAL.navy, 0.5, false);
  for (const x of [-3, 3]) b.line([x, 0, Z], [x, y0, Z], PAL.steelDim, 0.5);
  return b.bake(POOL, 0.8);
}

// ---------------------------------------------------------------- globe

const unit = (r) => {
  const [x, y, z] = ball(r, 1);
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

export function globeShape(R) {
  const r = rng(91);
  const pos = new Float32Array(GLOBE_N * 3), col = new Float32Array(GLOBE_N * 3);
  const blobs = Array.from({ length: 24 }, () => ({ v: unit(r), a: 0.16 + r() * 0.34 }));
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < GLOBE_N; i++) {
    const y = 1 - ((i + 0.5) / GLOBE_N) * 2, rad = Math.sqrt(1 - y * y), th = i * ga;
    const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
    let land = 0;
    for (const bl of blobs) {
      const d = Math.acos(Math.min(1, x * bl.v[0] + y * bl.v[1] + z * bl.v[2]));
      land = Math.max(land, 1 - d / bl.a);
    }
    const c = land > 0 ? (r() < 0.15 ? PAL.cyan : PAL.steelHi) : PAL.navy;
    const k = land > 0 ? 0.5 + 0.5 * Math.min(1, land * 3) : 0.55;
    pos.set([x * R, y * R, z * R], i * 3);
    col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
  }
  return { pos, col };
}

export function globeGrid(R) {
  const out = [];
  const seg = 96;
  const push = (f) => {
    for (let k = 0; k < seg; k++) out.push(...f(k / seg), ...f((k + 1) / seg));
  };
  for (let lat = -60; lat <= 60; lat += 30) {
    const phi = THREE.MathUtils.degToRad(lat), y = R * Math.sin(phi), rr = R * Math.cos(phi);
    push((s) => [Math.cos(s * Math.PI * 2) * rr, y, Math.sin(s * Math.PI * 2) * rr]);
  }
  for (let lon = 0; lon < 180; lon += 30) {
    const l = THREE.MathUtils.degToRad(lon);
    push((s) => {
      const a = s * Math.PI * 2;
      return [Math.cos(l) * R * Math.cos(a), R * Math.sin(a), Math.sin(l) * R * Math.cos(a)];
    });
  }
  return new Float32Array(out);
}

// Great-circle arcs from `from` (unit vector) to scattered hubs, as line segments
// carrying their position along the arc (aS) so they can be drawn on progressively.
export function globeArcs(R, from, count = 9) {
  const r = rng(77);
  const a = new THREE.Vector3(...from).normalize();
  const pos = [], s = [], phase = [], col = [];
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), qa = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    let b;
    do b = new THREE.Vector3(...unit(r));
    while (a.angleTo(b) < 0.6 || a.angleTo(b) > 1.9);
    const ang = a.angleTo(b), h = 0.06 + 0.16 * (ang / Math.PI);
    q.setFromUnitVectors(a, b);
    const c = i % 2 ? PAL.red : PAL.cyan, ph = r();
    const steps = 48;
    let prev = null;
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      qa.identity().slerp(q, f);
      tmp.copy(a).applyQuaternion(qa).multiplyScalar(R * (1 + h * Math.sin(Math.PI * f)));
      const cur = [tmp.x, tmp.y, tmp.z, f];
      if (prev) {
        pos.push(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2]);
        s.push(prev[3], cur[3]);
        phase.push(ph, ph);
        col.push(...c, ...c);
      }
      prev = cur;
    }
  }
  return { pos: new Float32Array(pos), s: new Float32Array(s), phase: new Float32Array(phase), col: new Float32Array(col) };
}
