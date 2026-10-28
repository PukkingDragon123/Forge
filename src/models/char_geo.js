// Sculpting toolkit for the low-poly anime characters and forged weapons:
// lofted cross-sections (torsos, limbs, robes, boots, heads), swept tubes along curves (horns, braids,
// hair locks, tails), faceted normals, UVs for wrap-around pixel textures, and procedural
// "hand-painted" pixel textures (fabric, leather, fur, chainmail, metal, wood) at high resolution.
import * as THREE from 'three';
import { hexToRgb, hash2, clamp, fbm2 } from '../core/math.js';

const TAU = Math.PI * 2;

// ================================================================ toon ramp for the characters
function ramp(steps) {
  const d = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v * 255); d[i * 4 + 3] = 255; });
  const t = new THREE.DataTexture(d, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false; t.needsUpdate = true; t.userData.keep = true;
  return t;
}
/** Anime cel ramp: deep shadow band, soft mid, full light (hard edges). */
export const CEL = ramp([0.42, 0.68, 0.86, 1.0]);

// ================================================================ geometry
/**
 * Loft cross-section rings into a faceted mesh along local +Y.
 * rings: [{ y, x=0, z=0, rx, rz=rx, s?(a)=>mult, tilt=0 }]. Angle a: 0=+X, π/2=+Z (front).
 * opts: { n=8, phase=0, capTop=false, capBottom=false, uvU=1, open=false }
 */
export function loft(rings, opts = {}) {
  const n = opts.n || 8;
  const phase = opts.phase ?? 0;
  const P = [], UV = [];
  const pts = rings.map((r) => {
    const ring = [];
    for (let k = 0; k <= n; k++) {
      const a = phase + (k / n) * TAU;
      const m = r.s ? r.s(a, r) : 1;
      let x = (r.x || 0) + Math.cos(a) * r.rx * m;
      let z = (r.z || 0) + Math.sin(a) * (r.rz ?? r.rx) * m;
      let y = r.y;
      if (r.tilt) { // tilt ring around X (forward lean of the cross-section)
        const dz = z - (r.z || 0);
        y += -Math.sin(r.tilt) * dz; z = (r.z || 0) + Math.cos(r.tilt) * dz;
      }
      ring.push([x, y, z]);
    }
    return ring;
  });
  // cumulative arc length for V
  const vlen = [0];
  for (let i = 1; i < rings.length; i++) vlen.push(vlen[i - 1] + Math.max(1e-4, Math.hypot(rings[i].y - rings[i - 1].y, (rings[i].rx - rings[i - 1].rx) * 0.5)));
  const vt = vlen[vlen.length - 1] || 1;
  const uS = opts.uvU ?? 1;
  const tri = (a, b, c, ua, ub, uc) => { P.push(...a, ...b, ...c); UV.push(...ua, ...ub, ...uc); };
  for (let i = 0; i < rings.length - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    const v0 = vlen[i] / vt, v1 = vlen[i + 1] / vt;
    for (let k = 0; k < n; k++) {
      const u0 = (k / n) * uS, u1 = ((k + 1) / n) * uS;
      tri(A[k], A[k + 1], B[k + 1], [u0, v0], [u1, v0], [u1, v1]);
      tri(A[k], B[k + 1], B[k], [u0, v0], [u1, v1], [u0, v1]);
    }
  }
  const cap = (ring, y, flip, v) => {
    const c = ring.slice(0, n).reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
    for (let k = 0; k < n; k++) {
      if (flip) tri(c, ring[k + 1], ring[k], [0.5, v], [(k + 1) / n, v], [k / n, v]);
      else tri(c, ring[k], ring[k + 1], [0.5, v], [k / n, v], [(k + 1) / n, v]);
    }
  };
  if (opts.capBottom) cap(pts[0], rings[0].y, false, 0);
  if (opts.capTop) cap(pts[pts.length - 1], rings[rings.length - 1].y, true, 1);
  return finish(P, UV);
}

/**
 * Sweep a cross-section along a 3D path (parallel-transport frames).
 * path: [[x,y,z]...]; radius: number | (t)=>r | [r...]; opts: { n=5, aspect=1 (width/depth), capEnd=true, twist=0 }
 */
export function sweep(path, radius, opts = {}) {
  const n = opts.n || 5;
  const aspect = opts.aspect ?? 1;
  const P = [], UV = [];
  const V = path.map((p) => new THREE.Vector3(...p));
  const T = V.map((p, i) => {
    const a = V[Math.max(0, i - 1)], b = V[Math.min(V.length - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  let N = new THREE.Vector3(0, 0, 1);
  if (Math.abs(T[0].dot(N)) > 0.9) N.set(1, 0, 0);
  N = N.sub(T[0].clone().multiplyScalar(N.dot(T[0]))).normalize();
  const frames = [];
  for (let i = 0; i < V.length; i++) {
    if (i > 0) {
      const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
      const ang = Math.asin(clamp(axis.length(), -1, 1));
      if (axis.lengthSq() > 1e-10) N.applyAxisAngle(axis.normalize(), ang);
    }
    const B = new THREE.Vector3().crossVectors(T[i], N).normalize();
    frames.push([N.clone(), B]);
  }
  const rings = V.map((p, i) => {
    const t = i / (V.length - 1);
    const r = typeof radius === 'function' ? radius(t) : Array.isArray(radius) ? radius[i] : radius;
    const [Nn, Bb] = frames[i];
    const ring = [];
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * TAU + (opts.twist || 0) * t + (opts.phase || 0);
      const off = Nn.clone().multiplyScalar(Math.cos(a) * r * aspect).add(Bb.clone().multiplyScalar(Math.sin(a) * r));
      ring.push(p.clone().add(off).toArray());
    }
    return ring;
  });
  const tri = (a, b, c, ua, ub, uc) => { P.push(...a, ...b, ...c); UV.push(...ua, ...ub, ...uc); };
  for (let i = 0; i < rings.length - 1; i++) {
    const v0 = i / (rings.length - 1), v1 = (i + 1) / (rings.length - 1);
    for (let k = 0; k < n; k++) {
      const u0 = k / n, u1 = (k + 1) / n;
      tri(rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], [u0, v0], [u1, v0], [u1, v1]);
      tri(rings[i][k], rings[i + 1][k + 1], rings[i + 1][k], [u0, v0], [u1, v1], [u0, v1]);
    }
  }
  if (opts.capStart) {
    const c = V[0].toArray();
    for (let k = 0; k < n; k++) tri(c, rings[0][k + 1], rings[0][k], [0.5, 0], [0, 0], [0, 0]);
  }
  if (opts.capEnd !== false) {
    const last = rings[rings.length - 1], c = V[V.length - 1].toArray();
    for (let k = 0; k < n; k++) tri(c, last[k], last[k + 1], [0.5, 1], [0, 1], [1, 1]);
  }
  return finish(P, UV);
}

/** Quadratic/cubic bezier sampled into a polyline. */
export function curve(p0, p1, p2, p3, steps = 8) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    if (p3) out.push([0, 1, 2].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]));
    else out.push([0, 1, 2].map((k) => u * u * p0[k] + 2 * u * t * p1[k] + t * t * p2[k]));
  }
  return out;
}

/** Tapered anime hair lock / spike from root along a curve. */
export function lock(root, ctrl, tip, width, opts = {}) {
  const path = curve(root, ctrl, tip, null, opts.steps || 5);
  return sweep(path, (t) => width * Math.pow(1 - t, opts.pow ?? 0.85) + 0.0005, { n: opts.n || 4, aspect: opts.aspect ?? 0.45, phase: opts.phase ?? Math.PI / 4 });
}

/** Extruded flat shape with a small bevel (blades, buckles, ears, plates). pts in XY. */
export function slab(pts, depth, bevel = 0) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 3 });
  g.translate(0, 0, -depth / 2);
  return flat(g);
}

/** Faceted low-poly ellipsoid (an icosphere/UV sphere squashed). */
export function blob(rx, ry, rz, w = 8, h = 6) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return flat(g);
}

function finish(P, UV) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.computeVertexNormals();
  g.userData.flat = true;
  return g;
}
export function flat(geo) {
  if (geo.userData.flat) return geo;
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  g.userData.flat = true;
  return g;
}

/** Planar UVs projected along an axis ('z' front) mapping [min,max] of the bbox to 0..1. */
export function planarUV(geo, axis = 'z', box = null) {
  geo.computeBoundingBox();
  const b = box || geo.boundingBox;
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const [ua, va] = axis === 'z' ? ['x', 'y'] : axis === 'x' ? ['z', 'y'] : ['x', 'z'];
  for (let i = 0; i < pos.count; i++) {
    const p = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) };
    uv.setXY(i, (p[ua] - b.min[ua]) / (b.max[ua] - b.min[ua] || 1), (p[va] - b.min[va]) / (b.max[va] - b.min[va] || 1));
  }
  uv.needsUpdate = true;
  return geo;
}

// ================================================================ textures
/** Small RGBA paint buffer → nearest-filtered sRGB texture. */
export class Tex {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.c = document.createElement('canvas');
    this.c.width = w; this.c.height = h;
    this.g = this.c.getContext('2d');
    this.img = this.g.createImageData(w, h);
    this.d = this.img.data;
  }
  set(x, y, col, a = 1) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !col) return;
    const [r, g, b] = typeof col === 'string' ? hexToRgb(col) : col;
    const i = (y * this.w + x) * 4;
    if (a >= 1) { this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = 255; return; }
    this.d[i] = this.d[i] * (1 - a) + r * a; this.d[i + 1] = this.d[i + 1] * (1 - a) + g * a; this.d[i + 2] = this.d[i + 2] * (1 - a) + b * a; this.d[i + 3] = 255;
  }
  wset(x, y, col, a) { this.set(((x % this.w) + this.w) % this.w, y, col, a); }
  rect(x, y, w, h, col, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col, a); }
  fill(col) { this.rect(0, 0, this.w, this.h, col); }
  hline(x0, x1, y, col, a) { for (let x = x0; x <= x1; x++) this.wset(x, y, col, a); }
  texture(repeat = false) {
    this.g.putImageData(this.img, 0, 0);
    const t = new THREE.CanvasTexture(this.c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }
}

const mixc = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; };
export const shade = (c, f) => (f < 0 ? mixc(c, '#1a1028', -f) : mixc(c, '#fff4dc', f));
const toHex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
export const shadeHex = (c, f) => toHex(shade(c, f));

/**
 * Fabric: base colour with woven dither, soft folds, optional bands [{y0, y1, color, pattern}], seams, stitches.
 * o: { w, h, folds=true, bands=[], seamsX=[], stitchY=[], noise=0.06, pattern }
 */
export function fabricTex(base, o = {}) {
  const w = o.w || 64, h = o.h || 64, seed = o.seed || 3;
  const T = new Tex(w, h);
  const hi = shade(base, 0.12), lo = shade(base, -0.14), lo2 = shade(base, -0.26);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = hexToRgb(base);
    const n = hash2(x, y, seed);
    if ((x + y * 3) % 4 === 0 && n > 0.45) c = hi;            // weave sparkle
    if (n < (o.noise ?? 0.06)) c = lo;
    if (o.folds !== false) {
      const f = Math.sin(x * 0.35 + fbm2(x * 0.05, y * 0.02, 2, seed) * 5);
      if (f > 0.86) c = hi; else if (f < -0.9) c = lo;
    }
    T.set(x, y, c);
  }
  for (const b of o.bands || []) {
    for (let y = b.y0; y <= b.y1; y++) for (let x = 0; x < w; x++) {
      let c = b.color;
      if (b.pattern === 'zig' && ((x + (y - b.y0) * 2) % 6 < 2)) c = b.color2 || shadeHex(b.color, 0.3);
      if (b.pattern === 'dots' && (x % 6 === 2 && (y - b.y0) === Math.floor((b.y1 - b.y0) / 2))) c = b.color2 || '#ffffff';
      if (b.pattern === 'rune' && x % 10 < 5 && hash2(Math.floor(x / 5), y, seed + 9) > 0.45 && y > b.y0 && y < b.y1) c = b.color2 || '#ffe08a';
      if (y === b.y0) c = toHex(shade(b.color, 0.25));
      if (y === b.y1) c = toHex(shade(b.color, -0.3));
      T.set(x, y, c);
    }
  }
  for (const sx of o.seamsX || []) for (let y = 0; y < h; y++) { T.wset(sx, y, lo2); if (y % 3 === 0) T.wset(sx + 1, y, hi); }
  for (const sy of o.stitchY || []) for (let x = 0; x < w; x++) if (x % 4 < 2) T.set(x, sy, o.stitch || shade(base, 0.35));
  return T;
}

/** Leather: mottled, scratched, with stitched edges. */
export function leatherTex(base, o = {}) {
  const w = o.w || 64, h = o.h || 64, seed = o.seed || 7;
  const T = new Tex(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm2(x * 0.12, y * 0.12, 3, seed);
    let c = shade(base, (n - 0.5) * 0.35);
    if (hash2(x, y, seed + 1) > 0.97) c = shade(base, 0.25);
    T.set(x, y, c);
  }
  // scratches
  for (let s = 0; s < (o.scratches ?? 6); s++) {
    let x = hash2(s, 1, seed) * w, y = hash2(s, 2, seed) * h;
    for (let i = 0; i < 6; i++) { T.set(x, y, shade(base, 0.3)); x += 1; y += hash2(s, i, seed) > 0.5 ? 1 : 0; }
  }
  if (o.stitchEdge) for (let x = 0; x < w; x++) if (x % 4 < 2) { T.set(x, 2, '#e8c890'); T.set(x, h - 3, '#e8c890'); }
  for (const sy of o.stitchY || []) for (let x = 0; x < w; x++) if (x % 4 < 2) T.set(x, sy, '#e8c890');
  for (const sx of o.stitchX || []) for (let y = 0; y < h; y++) if (y % 4 < 2) T.set(sx, y, '#e8c890');
  return T;
}

/** Fur: tufty strands. */
export function furTex(base, o = {}) {
  const w = o.w || 64, h = o.h || 32, seed = o.seed || 11;
  const T = new Tex(w, h);
  T.fill(toHex(shade(base, -0.1)));
  for (let k = 0; k < w * h / 6; k++) {
    const x = hash2(k, 1, seed) * w, y = hash2(k, 2, seed) * h, len = 2 + hash2(k, 3, seed) * 4;
    const c = shade(base, hash2(k, 4, seed) * 0.4 - 0.15);
    for (let i = 0; i < len; i++) T.wset(Math.floor(x + i * 0.4), Math.floor(y + i), c);
  }
  return T;
}

/** Chainmail rings. */
export function mailTex(base, o = {}) {
  const w = o.w || 64, h = o.h || 64;
  const T = new Tex(w, h);
  T.fill(toHex(shade(base, -0.45)));
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 4) {
    const ox = (y / 3) % 2 ? 2 : 0;
    T.wset(x + ox, y, shade(base, 0.25)); T.wset(x + ox + 1, y, shade(base, 0.05));
    T.wset(x + ox - 1, y + 1, shade(base, -0.1)); T.wset(x + ox + 2, y + 1, shade(base, -0.15));
    T.wset(x + ox, y + 2, shade(base, -0.25)); T.wset(x + ox + 1, y + 2, shade(base, -0.2));
  }
  return T;
}

/** Brushed metal plate with optional rivets/trim lines and engraving. */
export function metalTex(base, o = {}) {
  const w = o.w || 32, h = o.h || 64, seed = o.seed || 5;
  const T = new Tex(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = hash2(x >> 2, y, seed) * 0.12 + Math.sin(y * 0.4 + x * 0.05) * 0.03;
    T.set(x, y, shade(base, n - 0.04 + (o.vgrad ? (y / h - 0.5) * o.vgrad : 0)));
  }
  for (const ry of o.rivetsY || []) for (let x = 2; x < w; x += o.rivetStep || 8) { T.set(x, ry, '#fff6e0'); T.set(x + 1, ry, shade(base, 0.3)); T.set(x, ry + 1, shade(base, -0.35)); T.set(x + 1, ry + 1, shade(base, -0.45)); }
  for (const ly of o.linesY || []) for (let x = 0; x < w; x++) { T.set(x, ly, shade(base, -0.4)); T.set(x, ly + 1, shade(base, 0.3)); }
  if (o.engrave) for (let y = Math.floor(h * 0.2); y < h * 0.85; y++) {
    const x = Math.floor(w / 2 + Math.sin(y * 0.45) * w * 0.18);
    if (y % 7 < 5) { T.set(x, y, o.engrave); T.set(x + 1, y, shade(base, -0.3)); }
  }
  return T;
}

/** Wood grain. */
export function woodTex(base, o = {}) {
  const w = o.w || 16, h = o.h || 64, seed = o.seed || 2;
  const T = new Tex(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g = Math.sin(x * 1.3 + fbm2(x * 0.1, y * 0.04, 2, seed) * 7);
    T.set(x, y, shade(base, g * 0.14 + (hash2(x, y, seed) - 0.5) * 0.06));
  }
  for (const wy of o.wrapY || []) for (let y = wy; y < wy + (o.wrapH || 3); y++) for (let x = 0; x < w; x++) T.set(x, y, (x + y) % 3 ? o.wrap || '#5a3420' : shade(o.wrap || '#5a3420', 0.25));
  return T;
}
