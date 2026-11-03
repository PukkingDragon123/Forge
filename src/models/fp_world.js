// First-person voxel world kit for the delve: tunnels, junctions, encounter chambers and the intro
// chase, in the four acts' looks (Mossy Undercroft, Crystal Cistern, Ember Foundry, Medusa's Garden).
// Minecraft-chunky 0.04 m voxels, but every surface is painted: masonry giving way to rock, damp and
// moss, roots and ferns, torches, crystals, water, lava, marble and statues. Light is baked into the
// voxels; actors get a hemisphere fill, a light carried at the camera and a small pool of real lights
// that follows the camera to the nearest torches.
//
//   const st = buildFP('tunnel', act, { seed, length, bend }); st.attach(scene); st.setCamera(cam)
//   each frame: st.update(dt, t)            (streams tiles in around the camera)
//   when done:  st.dispose()
//
// Piece frame: you enter at the origin walking toward -z (yaw 0 looks down -z; +π/2 looks to -x).
// Floors are at y = 0 unless a piece says otherwise; eye height is 0.95 m. Pieces join end to end:
// put the next piece's group at the previous piece's anchors.end.pos with rotation.y = end.yaw.
import * as THREE from 'three';
import { Stage } from './stage_vox.js';
import { S, C, glowC, tone, h3, ell, cyl } from './stage_vox_kit.js';
import * as PR from './stage_vox_props.js';
import { Layout, Piece, ACT_STYLES, MAT, vx, roots, fern, tufts, crystalCluster, statue, banner, cobweb, rubble, ashTree, lilyPads, oreVein, fpAmbient } from './stage_vox_layout.js';
import { noise2, clamp } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const EYE = 0.95;
const rngOf = (seed) => { let s = (Math.abs(seed | 0) % 233280) * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const AMBIENT = [['dust', 'motes', 'fireflies', 'drips'], ['dust', 'glints', 'drips'], ['embers', 'dust'], ['petals', 'fireflies', 'motes']];

// ---------------------------------------------------------------------------- shared shapes
/** Barrel-vault ceiling across half-width hw around a line: d = lateral distance (m), u = position along it (m). */
const vaultH = (d, hw, u, spring = 2.45, rise = 0.8) => {
  let c = spring + rise * Math.sqrt(Math.max(0, 1 - (d / (hw + 0.15)) ** 2));
  if ((((u % 2.8) + 2.8) % 2.8) < 0.24) c -= 0.18; // stone ribs
  return c;
};
/** Inside cells that touch a wall within a box: { x, z (m), nx, nz (unit, into the space), fl, ce (m), i } */
function wallCells(L, x0, x1, z0, z1, every = 1) {
  const out = [];
  const xa = Math.max(L.X0, Math.floor(x0 / S)), xb = Math.min(L.X1, Math.ceil(x1 / S)), za = Math.max(L.Z0, Math.floor(z0 / S)), zb = Math.min(L.Z1, Math.ceil(z1 / S));
  for (let Z = za; Z < zb; Z += every) for (let X = xa; X < xb; X += every) {
    const i = (Z - L.Z0) * L.W + (X - L.X0);
    if (!L.inside[i] || L.dist[i] !== 1 || L.near[i] < 0) continue;
    const j = L.near[i], jx = (j % L.W) + L.X0, jz = Math.floor(j / L.W) + L.Z0;
    let nx = X - jx, nz = Z - jz; const n = Math.hypot(nx, nz) || 1; nx /= n; nz /= n;
    out.push({ X, Z, x: (X + 0.5) * S, z: (Z + 0.5) * S, nx, nz, fl: (L.floor[i] + 1) * S, ce: L.ceil[i] * S, i });
  }
  return out;
}
/** Inside cells at least `minD` voxels from any wall. */
function openCells(L, x0, x1, z0, z1, minD = 4, every = 3) {
  const out = [];
  const xa = Math.max(L.X0, Math.floor(x0 / S)), xb = Math.min(L.X1, Math.ceil(x1 / S)), za = Math.max(L.Z0, Math.floor(z0 / S)), zb = Math.min(L.Z1, Math.ceil(z1 / S));
  for (let Z = za; Z < zb; Z += every) for (let X = xa; X < xb; X += every) {
    const i = (Z - L.Z0) * L.W + (X - L.X0);
    if (L.inside[i] && L.dist[i] >= minD) out.push({ X, Z, x: (X + 0.5) * S, z: (Z + 0.5) * S, fl: (L.floor[i] + 1) * S, ce: L.ceil[i] * S, i, d: L.dist[i], mat: L.mat[i] });
  }
  return out;
}
const axisN = (nx, nz) => (Math.abs(nx) >= Math.abs(nz) ? [Math.sign(nx), 0] : [0, Math.sign(nz)]);
function pickSpaced(cands, n, spacing, r, avoid = []) {
  const out = [];
  for (let tries = 0; tries < n * 30 && out.length < n && cands.length; tries++) {
    const c = cands[Math.floor(r() * cands.length)];
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < spacing) || avoid.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < (o.r ?? spacing))) continue;
    out.push(c);
  }
  return out;
}

/**
 * Dress a region of a piece in its act's style. o: { torches (spacing m, 0 = none), clear: [{x,z,r}] (keep free),
 * plants, roots, crystals, rubble, webs, banners, shafts, falls, statues }
 */
function decorate(P, act, r, x0, x1, z0, z1, o = {}) {
  const L = P.L, A = P.A, clear = o.clear || [];
  const walls = wallCells(L, x0, x1, z0, z1, 2);
  const isClear = (x, z, pad = 0) => clear.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + pad);
  const area = Math.max(1, (x1 - x0) * (z1 - z0));
  // ---- torches on straight-ish wall at head height
  const torchSp = o.torches ?? 3.8;
  if (torchSp > 0) {
    const tall = walls.filter((w) => w.ce - w.fl > 2.1 && !isClear(w.x, w.z, 0.3));
    const tz = pickSpaced(tall, Math.ceil((Math.max(x1 - x0, z1 - z0) * 2) / torchSp) + 1, torchSp, r, o.torchAvoid || []);
    for (const w of tz) { const [nx, nz] = axisN(w.nx, w.nz); P.torch(w.x + nx * 0.06, w.fl + 1.5, w.z + nz * 0.06, nx, nz, A.lamp, A.flame); }
  }
  // ---- plants at the wall foot
  const plants = Math.round((o.plants ?? 1) * area * 0.22);
  const foot = pickSpaced(walls.filter((w) => !isClear(w.x, w.z, 0.4)), plants, 0.55, r);
  for (const w of foot) {
    const X = vx(w.x + w.nx * 0.18), Y = vx(w.fl), Z = vx(w.z + w.nz * 0.18), k = r();
    if (act === 1) {
      if (k < 0.45) P.op(w.x - 0.6, w.x + 0.6, w.z - 0.6, w.z + 0.6, (wd) => crystalCluster(wd, X, Y, Z, 10 + Math.round(r() * 16), r() > 0.5 ? A.crystal : A.crystal2, X ^ Z, 3 + Math.floor(r() * 3)));
      else if (k < 0.7) P.op(w.x - 0.5, w.x + 0.5, w.z - 0.5, w.z + 0.5, (wd) => tufts(wd, A, X, Y, Z, 8, X + Z, 14));
      else P.op(w.x - 0.6, w.x + 0.6, w.z - 0.6, w.z + 0.6, (wd) => PR.mushroom(wd, X, Y, Z, 6 + Math.round(r() * 8), PR.CLOTH.lavender, '#9af0ff', X));
      if (k < 0.45 && r() < 0.5) P.lamp(w.x + w.nx * 0.3, w.fl + 0.4, w.z + w.nz * 0.3, r() > 0.5 ? A.crystal : A.crystal2, 1.8, 0.9);
    } else if (act === 2) {
      if (k < 0.35) P.op(w.x - 0.5, w.x + 0.5, w.z - 0.5, w.z + 0.5, (wd) => fern(wd, A, X, Y, Z, 6 + Math.round(r() * 4), X + Z, 0));
      else if (k < 0.6) P.op(w.x - 0.5, w.x + 0.5, w.z - 0.5, w.z + 0.5, (wd) => rubble(wd, A, X, Y, Z, 6, X ^ Z, 4));
      else if (k < 0.8) P.op(w.x - 0.5, w.x + 0.5, w.z - 0.5, w.z + 0.5, (wd) => { for (let q = 0; q < 14; q++) wd.set(X + Math.round(Math.sin(q * 0.8) * 2) + Math.round(w.nz * (q - 7)), Y, Z + Math.round(w.nx * (q - 7)), glowC(q % 3 ? '#ff6a1a' : '#ffc85a')); });
      else P.op(w.x - 0.5, w.x + 0.5, w.z - 0.5, w.z + 0.5, (wd) => PR.bones(wd, X, Y, Z, X, r() > 0.5));
    } else {
      const flowers = act === 3 ? 3 : r() < 0.4 ? 2 : 0;
      if (k < 0.5) P.op(w.x - 0.6, w.x + 0.6, w.z - 0.6, w.z + 0.6, (wd) => fern(wd, A, X, Y, Z, 7 + Math.round(r() * 6), X + Z, flowers));
      else if (k < 0.72) P.op(w.x - 0.5, w.x + 0.5, w.z - 0.5, w.z + 0.5, (wd) => tufts(wd, A, X, Y, Z, 9, X + Z, 20));
      else if (k < 0.86) P.op(w.x - 0.6, w.x + 0.6, w.z - 0.6, w.z + 0.6, (wd) => { PR.mushroom(wd, X, Y, Z, 7 + Math.round(r() * 9), r() > 0.5 ? PR.CLOTH.salmon : PR.CLOTH.mustard, A.glow, X); PR.mushroom(wd, X + 4, Y, Z + 3, 5, PR.CLOTH.salmon, A.glow, X + 1); });
      else P.op(w.x - 0.5, w.x + 0.5, w.z - 0.5, w.z + 0.5, (wd) => rubble(wd, A, X, Y, Z, 6, X ^ Z, 4));
    }
  }
  // ---- things hanging from the ceiling
  const ceil = openCells(L, x0, x1, z0, z1, 3, 4).filter((c) => !isClear(c.x, c.z, -0.2));
  const nRoots = Math.round((o.roots ?? 1) * area * (act === 2 ? 0.04 : act === 1 ? 0.06 : 0.14));
  for (const c of pickSpaced(ceil, nRoots, 0.7, r)) {
    const X = vx(c.x), Z = vx(c.z), Y = vx(c.ce) - 1, len = Math.round((c.ce - c.fl - 1.7) / S * (0.35 + r() * 0.65));
    if (len < 4) continue;
    if (act === 2) P.op(c.x - 1, c.x + 1, c.z - 1, c.z + 1, (wd) => PR.chain(wd, X - 10, Y, Z, X + 10, Y, Z, Math.min(len, 18)));
    else if (act === 1 && r() < 0.5) P.op(c.x - 0.4, c.x + 0.4, c.z - 0.4, c.z + 0.4, (wd) => PR.stalactite(wd, X, Y + 1, Z, Math.min(len, 22), A.rock, X, A.crystal));
    else if (act === 3 && r() < 0.6) P.op(c.x - 0.5, c.x + 0.5, c.z - 0.5, c.z + 0.5, (wd) => PR.vine(wd, X, Y, Z, len, A.leaf.slice(1, 4), X, A.flowers[(X + Z) & 3]));
    else P.op(c.x - 0.5, c.x + 0.5, c.z - 0.5, c.z + 0.5, (wd) => roots(wd, A, X, Y, Z, len, X ^ Z, r() < 0.2 ? A.glow : null));
  }
  // ---- floor clutter near walls, cobwebs in upper corners, banners
  const nRub = Math.round((o.rubble ?? 1) * area * 0.03);
  for (const w of pickSpaced(walls.filter((q) => !isClear(q.x, q.z, 0.5)), nRub, 1.2, r)) {
    const X = vx(w.x + w.nx * 0.3), Y = vx(w.fl), Z = vx(w.z + w.nz * 0.3);
    P.op(w.x - 0.6, w.x + 0.6, w.z - 0.6, w.z + 0.6, (wd) => (r() < 0.6 ? rubble(wd, A, X, Y, Z, 7, X + Z, 5) : PR.bones(wd, X, Y, Z, X ^ Z, r() > 0.5)));
  }
  for (const w of pickSpaced(walls, Math.round((o.webs ?? 1) * area * 0.015), 2, r)) {
    const [nx, nz] = axisN(w.nx, w.nz), X = vx(w.x), Y = vx(w.ce) - 1, Z = vx(w.z);
    P.op(w.x - 0.5, w.x + 0.5, w.z - 0.5, w.z + 0.5, (wd) => cobweb(wd, X, Y, Z, 10, nx === 0 ? 1 : nx, nz === 0 ? 1 : nz, X));
  }
  if (o.banners) for (const w of pickSpaced(walls.filter((q) => q.ce - q.fl > 2.6 && !isClear(q.x, q.z, 0.5)), o.banners, 2.5, r)) {
    const [nx, nz] = axisN(w.nx, w.nz), X = vx(w.x), Y = vx(w.fl + 2.5), Z = vx(w.z);
    const cloth = [PR.CLOTH.plum, PR.CLOTH.teal, PR.CLOTH.salmon, PR.CLOTH.mustard][act];
    P.op(w.x - 0.6, w.x + 0.6, w.z - 0.6, w.z + 0.6, (wd) => banner(wd, X, Y, Z, 6, 26 + Math.round(r() * 12), nx, nz, cloth, act === 3 ? '#7affc8' : '#e8c86a', X ^ Z));
  }
}

// ---------------------------------------------------------------------------- finishing a piece
function finishPiece(P, kind, act, anchors, o = {}) {
  const st = P.build(Stage, 'fp_' + kind, act, o);
  const L = P.L;
  st.anchors = anchors;
  st.act = act;
  st.camera = { pos: anchors.enter ? anchors.enter.toArray() : [0, EYE, 0], look: anchors.look ? anchors.look.toArray() : [0, EYE, -5], fov: 62 };
  st.floorAt = (x, z = 0) => L.floorAt(x, z) ?? 0;
  st.ceilAt = (x, z) => L.ceilAt(x, z);
  st.isInside = (x, z) => L.isInside(x, z);
  fpAmbient(st, AMBIENT[act], P.A);
  st.dispose = () => {
    st.group.parent && st.group.parent.remove(st.group);
    st.group.traverse((m) => {
      if (m.geometry && !(m.geometry.userData && m.geometry.userData.keep)) m.geometry.dispose();
      const mt = m.material;
      if (mt && !(mt.userData && mt.userData.keep)) { if (mt.map) mt.map.dispose(); mt.dispose(); }
    });
  };
  return st;
}
function pathCurve(pts) { return new THREE.CatmullRomCurve3(pts.map((p) => V(p[0], p[1], p[2])), false, 'centripetal'); }

// ---------------------------------------------------------------------------- tunnel
function tunnel(act, seed, o) {
  const A = ACT_STYLES[act], r = rngOf(seed * 7 + act * 131 + 3);
  const Lm = clamp(o.length ?? 12, 6, 24), bend = clamp(o.bend ?? 0, -1, 1);
  const amp = 1.3 * bend;
  const cx = (z) => amp * Math.sin(Math.PI * clamp(-z / Lm, 0, 1));
  const hwAt = (z) => 1.3 + (noise2(z * 0.35, seed * 0.13) - 0.5) * 0.4;
  const L = new Layout(-1.9 - Math.abs(amp), 1.9 + Math.abs(amp), -Lm - 0.6, 0.6);
  const style = act === 3 ? 2 : 0;
  L.carve(L.X0 * S, L.X1 * S, -Lm - 0.6, 0.6, (x, z) => Math.abs(x - cx(z)) < hwAt(z), 0, (x, z) => vaultH(Math.abs(x - cx(z)), hwAt(z), -z), MAT.STONE, style);
  // a water channel (cistern) or lava runnel (foundry) down one side
  const side = r() < 0.5 ? -1 : 1;
  if (act === 1) L.edit(L.X0 * S, L.X1 * S, -Lm - 0.6, 0.6, (x, z) => (x - cx(z)) * side > hwAt(z) - 0.75, { floor: -0.32, mat: MAT.WATER });
  if (act === 2) L.edit(L.X0 * S, L.X1 * S, -Lm - 0.6, 0.6, (x, z) => (x - cx(z)) * side > hwAt(z) - 0.42, { floor: -0.12, mat: MAT.LAVA });
  // a few patches of open earth in the undercroft and garden
  if (act === 0 || act === 3) L.edit(L.X0 * S, L.X1 * S, -Lm - 0.6, 0.6, (x, z) => noise2(x * 0.5 + seed, z * 0.5) > 0.66, { mat: MAT.EARTH });
  L.finish();
  const P = new Piece(L, A, seed);
  if (act === 1) { P.water(L.X0 * S, L.X1 * S, -Lm - 0.6, 0.6, -0.07); }
  if (act === 2) { P.lava(L.X0 * S, L.X1 * S, -Lm - 0.6, 0.6, -0.1); for (let z = -1; z > -Lm; z -= 3) P.lamp(cx(z) + side * 1.1, 0.15, z, '#ff6a1a', 2.6, 1.1); }
  decorate(P, act, r, L.X0 * S, L.X1 * S, -Lm - 0.6, 0.6, { torches: 4.2, clear: [], banners: act === 0 || act === 3 ? 1 : 0 });
  // a crack of sky: shaft + trickle (undercroft, garden); crystal glow pockets (cistern)
  if ((act === 0 || act === 3) && r() < 0.7) {
    const z = -Lm * (0.3 + r() * 0.4), x = cx(z);
    L.edit(x - 0.5, x + 0.5, z - 0.5, z + 0.5, (px, pz) => Math.hypot(px - x, pz - z) < 0.45, { ceil: 6 });
    P.shaft(x, 5.8, z, 1.0, 5.8, act === 3 ? '#fff0c0' : '#bcd8ff', 0.3);
    if (act === 0 && r() < 0.6) { P.waterfall(x, 5.8, 0.02, z, 0.35, 0, 1); P.op(x - 1, x + 1, z - 1, z + 1, (wd) => PR.puddle(wd, vx(x), -1, vx(z), 14, 10, A.water)); }
    P.op(x - 0.6, x + 0.6, z - 0.6, z + 0.6, (wd) => roots(wd, A, vx(x) + 8, vx(5.9), vx(z), 60, seed, A.glow));
  }
  P.lamp(cx(-Lm / 2), 2.8, -Lm / 2, A.lamp, Lm, 0.25); // a faint fill so nothing is pitch black
  const pts = [];
  for (let z = 0.4; z >= -Lm - 0.4; z -= 1) pts.push([cx(z), EYE, z]);
  const anchors = {
    path: pathCurve(pts), start: V(0, 0, 0), enter: V(0, EYE, 0.3), look: V(cx(-4), EYE, -4),
    end: { pos: V(cx(-Lm), 0, -Lm), yaw: 0 }, exit: V(cx(-Lm), EYE, -Lm), length: Lm,
  };
  return finishPiece(P, 'tunnel', act, anchors, { stream: true, radius: 16, sync: [-4, 4, -5, 1] });
}

// ---------------------------------------------------------------------------- junction
const JR = 2.8, JCZ = -3.4, STUB = 7.2;
// stand near the way in, so the side mouths sit ~42° off forward (inside the view) and forward is straight on
const JSTAND = JCZ + (JR - 0.2) / Math.tan((42 * Math.PI) / 180);
function junction(act, seed, o) {
  const A = ACT_STYLES[act], r = rngOf(seed * 11 + act * 71 + 5);
  const exits = (o.exits && o.exits.length ? o.exits : [-1, 0, 1]).filter((d, i, a) => a.indexOf(d) === i);
  const style = act === 3 ? 2 : 0;
  const L = new Layout(-STUB - 0.3, STUB + 0.3, JCZ - STUB - 0.6, 0.6);
  const dome = (x, z) => { const d = Math.hypot(x, z - JCZ); return 2.85 + 1.45 * Math.sqrt(Math.max(0, 1 - (d / (JR + 0.25)) ** 2)) - (Math.abs(d - JR * 0.62) < 0.12 ? 0.16 : 0); };
  L.disc(0, JCZ, JR, 0, dome, MAT.STONE, style);
  L.carve(-1.3, 1.3, JCZ + JR - 0.6, 0.6, (x) => Math.abs(x) < 1.3, 0, (x, z) => vaultH(Math.abs(x), 1.3, -z), MAT.STONE, style); // where you came in
  const stubs = [];
  for (const d of exits) {
    if (d === 0) { L.carve(-1.3, 1.3, JCZ - STUB + 0.6, JCZ - JR + 0.6, null, 0, (x, z) => vaultH(Math.abs(x), 1.3, -z), MAT.STONE, style); stubs.push({ dir: 0, yaw: 0, mouth: V(0, EYE + 0.05, JCZ - JR + 0.2), deep: V(0, EYE, JCZ - STUB + 1.4), end: V(0, 0, JCZ - STUB + 0.6) }); }
    else { const s = d; const xa = s < 0 ? -STUB : JR - 0.6, xb = s < 0 ? -JR + 0.6 : STUB; L.carve(xa, xb, JCZ - 1.3, JCZ + 1.3, null, 0, (x, z) => vaultH(Math.abs(z - JCZ), 1.3, x), MAT.STONE, style); stubs.push({ dir: s, yaw: -s * Math.PI / 2, mouth: V(s * (JR - 0.2), EYE + 0.05, JCZ), deep: V(s * (STUB - 1.4), EYE, JCZ), end: V(s * STUB, 0, JCZ) }); }
  }
  // the heart of the junction, one per act
  if (act === 1) L.edit(-1.3, 1.3, JCZ - 1.3, JCZ + 1.3, (x, z) => Math.hypot(x, z - JCZ) < 1.15, { floor: -0.45, mat: MAT.WATER });
  if (act === 2) L.edit(-1.1, 1.1, JCZ - 1.1, JCZ + 1.1, (x, z) => Math.hypot(x, z - JCZ) < 0.9, { floor: -0.2, mat: MAT.LAVA });
  L.finish();
  const P = new Piece(L, A, seed);
  // the heart of the junction sits in a back corner, between the mouths, never across a line of sight
  const center = { x: 0, z: JCZ, r: 1.0 };
  const side = r() < 0.5 ? -1 : 1, hx = side * 1.75, hz = JCZ - 1.6;
  const heart = { x: hx, z: hz, r: 0.6 };
  if (act === 0) {
    // a pillar of old roots grown through the dome down into the floor, glowing at the knuckles
    P.op(hx - 0.7, hx + 0.7, hz - 0.7, hz + 0.7, (w) => {
      for (let k = 0; k < 5; k++) { let px = vx(hx) + Math.cos(k * 1.3) * 4, pz = vx(hz) + Math.sin(k * 1.3) * 4; for (let y = -1; y < vx(4.2); y++) { px += Math.sin(y * 0.08 + k) * 0.18; pz += Math.cos(y * 0.07 + k * 2) * 0.18; const rr = 1.8 + Math.sin(y * 0.05 + k) * 0.6; for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dz * dz <= rr * rr) w.set(Math.round(px + dx), y, Math.round(pz + dz), h3(dx, y, k, 2) > 0.985 ? glowC(A.glow) : tone(A.root, 0.25 + h3(dx, y, dz, k) * 0.4)); } }
      fern(w, A, vx(hx - side * 0.5), 0, vx(hz + 0.4), 8, 3, 3);
    });
    P.lamp(hx, 1.4, hz + 0.3, A.glow, 2.6, 0.8);
  } else if (act === 1) {
    P.water(-1.3, 1.3, JCZ - 1.3, JCZ + 1.3, -0.08);
    P.op(-1, 1, JCZ - 1, JCZ + 1, (w) => lilyPads(w, A, vx(0), -2, vx(JCZ), 20, seed, 5));
    P.op(hx - 0.6, hx + 0.6, hz - 0.6, hz + 0.6, (w) => crystalCluster(w, vx(hx), 0, vx(hz), 28, A.crystal, 7, 5));
    P.lamp(0, 0.3, JCZ, A.water, 2.4, 0.9);
    P.lamp(hx, 1.0, hz + 0.3, A.crystal, 3, 1.3);
  } else if (act === 2) {
    P.lava(-1.1, 1.1, JCZ - 1.1, JCZ + 1.1, -0.12);
    P.op(hx - 0.8, hx + 0.8, hz - 0.8, hz + 0.8, (w) => { for (let k = 0; k < 3; k++) PR.chain(w, vx(hx + Math.cos(k * 2.1) * 0.5), vx(4.0), vx(hz + Math.sin(k * 2.1) * 0.5), vx(hx), vx(1.6), vx(hz), 2); PR.brazier(w, vx(hx), vx(0.9), vx(hz), '#ff8a3a'); });
    P.flame(hx, 1.55, hz, 0.9, 'fire'); P.lamp(0, 0.4, JCZ, '#ff6a1a', 3.2, 1.4); P.lamp(hx, 1.6, hz, '#ffa040', 3, 1.2);
    P.lights.push({ x: hx, y: 1.6, z: hz, c: '#ffa040', i: 2, r: 4 });
  } else {
    // a coiled stone serpent on a plinth, flowers at its foot
    P.op(hx - 0.7, hx + 0.7, hz - 0.7, hz + 0.7, (w) => {
      cyl(w, vx(hx) + 0.5, vx(hz) + 0.5, 0, 7, 11, 10, (px, py, pz) => tone(A.brick, 0.4 + (py === 6 ? 0.2 : 0) + h3(px, py, pz, 1) * 0.1));
      for (let k = 0; k < 180; k++) { const t = k / 180, a = t * Math.PI * 5, rr = 8 - t * 5; ell(w, vx(hx) + Math.cos(a) * rr, 7 + t * 26, vx(hz) + Math.sin(a) * rr, 2.3 - t, 2.1 - t, 2.3 - t, (px, py, pz) => (h3(px, py, pz, 4) > 0.9 ? glowC(A.glow) : tone(A.brick, 0.35 + h3(px, py, pz, 2) * 0.3))); }
      fern(w, A, vx(hx - side * 0.55), 0, vx(hz + 0.45), 7, 1, 4);
    });
    P.lamp(hx, 1.6, hz + 0.6, A.glow, 3, 0.9);
    P.shaft(hx, 5.0, hz, 1.0, 5.0, '#fff0c8', 0.35);
  }
  // arches over each mouth (ribs proud of the wall) and a lamp deep in each stub (hints are optional)
  for (const s of stubs) {
    const hint = (o.hints || []).find((h) => h.dir === s.dir);
    P.lamp(s.deep.x, 1.1, s.deep.z, hint ? hint.color : A.lamp2, 2.4, hint ? 1.4 : 0.35);
    // light just inside each mouth so the opening reads from the stand, plus a stone arch proud of the wall
    const inX = s.dir === 0 ? 0 : s.dir * (JR + 0.6), inZ = s.dir === 0 ? JCZ - JR - 0.6 : JCZ;
    P.lamp(inX, 1.5, inZ, A.lamp, 2.6, 0.9);
    P.op(s.mouth.x - 1.6, s.mouth.x + 1.6, s.mouth.z - 1.6, s.mouth.z + 1.6, (w) => {
      const along = s.dir === 0, X = vx(s.mouth.x), Z = vx(s.mouth.z), top = vx(2.62);
      for (let k = 0; k <= 30; k++) {
        const a = Math.PI - (k / 30) * Math.PI, u = Math.round(Math.cos(a) * 35), v = Math.round(Math.sin(a) * (top - 44) + 44 * (Math.sin(a) > 0 ? 1 : 0));
        for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) {
          const px = along ? X + u + du : X, pz = along ? Z : Z + u + du;
          const c = (k + Math.floor(dv / 2)) % 4 === 0 ? A.mortar : tone(A.brick, 0.5 + h3(k, du, dv, 3) * 0.2);
          w.set(px - (along ? 0 : s.dir), v + dv, pz + (along ? 1 : 0), c);
        }
      }
      for (const sgn of [-1, 1]) for (let y = 0; y < 44; y++) for (let d = -2; d <= 2; d++) { const px = along ? X + sgn * 35 + d : X - s.dir, pz = along ? Z + 1 : Z + sgn * 35 + d; w.set(px, y, pz, (y % 7) === 0 ? A.mortar : tone(A.brick, 0.45 + h3(y, d, sgn, 4) * 0.2)); }
    });
    if (hint) P.lights.push({ x: s.deep.x, y: 1.1, z: s.deep.z, c: hint.color, i: 1.6, r: 4 });
  }
  // keep every line of sight from the stand to a mouth free of hanging roots, plants and rubble
  const sight = [];
  for (const st2 of stubs) for (let k = 0; k <= 8; k++) { const t = k / 8; sight.push({ x: st2.mouth.x * t, z: JSTAND + (st2.mouth.z - JSTAND) * t, r: 0.8 }); }
  decorate(P, act, r, -STUB, STUB, JCZ - STUB, 0.6, { torches: 3.2, clear: [center, heart, ...sight, ...stubs.map((s) => ({ x: s.mouth.x, z: s.mouth.z, r: 0.9 }))], torchAvoid: stubs.map((s) => ({ x: s.mouth.x, z: s.mouth.z, r: 1.6 })), banners: act === 2 ? 0 : 2 });
  P.lamp(0, 3, JCZ, A.lamp, 6, 0.35);
  const exitsA = stubs.map((s) => ({ dir: s.dir, yaw: s.yaw, pos: V(s.mouth.x, EYE, s.mouth.z), mouth: s.mouth.clone(), look: s.deep.clone(), end: { pos: s.end.clone(), yaw: s.yaw } }));
  const anchors = { stand: V(0, EYE, JSTAND), center: V(0, 0, JCZ), enter: V(0, EYE, 0.3), look: V(0, EYE, JCZ - 3), exits: exitsA, start: V(0, 0, 0) };
  anchors.path = pathCurve([[0, EYE, 0.3], [0, EYE, (0.3 + JSTAND) / 2], [0, EYE, JSTAND]]);
  return finishPiece(P, 'junction', act, anchors, { stream: true, sync: [-JR - 0.5, JR + 0.5, JCZ - JR - 0.5, 0.6] });
}

// ---------------------------------------------------------------------------- chamber
function chamber(act, seed, o) {
  const A = ACT_STYLES[act], r = rngOf(seed * 13 + act * 97 + 9);
  const kind = o.kind || 'monster';
  const boss = kind === 'boss', elite = kind === 'elite';
  const style = act === 3 ? 2 : 0;
  const HW = boss ? 5.2 : elite ? 4.6 : kind === 'vein' ? 3.2 : 4.0;
  const Z0 = -1.2, Z1 = boss ? -12.6 : elite ? -11.2 : kind === 'vein' ? -8.8 : -10.2;
  const exitLen = 3.2;
  const L = new Layout(-HW - 0.4, HW + 0.4, Z1 - exitLen - 0.6, 0.6);
  const midZ = (Z0 + Z1) / 2, depth = Z0 - Z1;
  const spring = boss ? 3.4 : elite ? 3.1 : 2.9, rise = boss ? 1.7 : 1.3;
  const roomCeil = (x, z) => {
    const dx = Math.abs(x) / HW, dz = Math.abs(z - midZ) / (depth / 2);
    let c = spring + rise * Math.sqrt(Math.max(0, 1 - Math.max(dx, dz * 0.8) ** 2));
    if (Math.abs(((z % 2.6) + 2.6) % 2.6 - 1.3) < 0.12) c -= 0.2; // transverse ribs
    return c;
  };
  if (kind === 'event' || boss) L.carve(-HW, HW, Z1, Z0, (x, z) => (x / HW) ** 2 + ((z - midZ) / (depth / 2)) ** 2 < 1, 0, roomCeil, MAT.STONE, style);
  else L.rect(-HW, HW, Z1, Z0, 0, roomCeil, MAT.STONE, style);
  L.carve(-1.3, 1.3, Z0 - 0.4, 0.6, null, 0, (x, z) => vaultH(Math.abs(x), 1.3, -z), MAT.STONE, style);
  L.carve(-1.3, 1.3, Z1 - exitLen, Z1 + 0.5, null, 0, (x, z) => vaultH(Math.abs(x), 1.3, -z), MAT.STONE, style);
  // pillars (left out of the space, so the shell paints them as masonry columns)
  const pillars = [];
  if (kind === 'monster' || elite) for (const sx of [-1, 1]) for (const fz of [0.3, 0.72]) pillars.push({ x: sx * HW * 0.62, z: Z0 - depth * fz, r: 0.36 });
  if (boss) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; pillars.push({ x: Math.cos(a) * HW * 0.78, z: midZ + Math.sin(a) * (depth / 2) * 0.78, r: 0.42 }); }
  for (const p of pillars) {
    const xa = Math.floor((p.x - p.r) / S), xb = Math.ceil((p.x + p.r) / S), za = Math.floor((p.z - p.r) / S), zb = Math.ceil((p.z + p.r) / S);
    for (let Z = za; Z < zb; Z++) for (let X = xa; X < xb; X++) if (Math.hypot((X + 0.5) * S - p.x, (Z + 0.5) * S - p.z) < p.r) { const i = L.i(X, Z); if (i >= 0) L.inside[i] = 0; }
  }
  // spawns and their dressing: a burrow, a hole in the vault, a breach in the wall, water
  const spawnZ = boss ? midZ - 0.6 : Z0 - depth * 0.55;
  const spawns = [{ pos: V(0, 0, spawnZ), from: 'floor' }];
  const holeX = boss ? 0 : 0.2, holeZ = spawnZ + 0.3;
  if (kind !== 'vein') {
    L.edit(holeX - 0.8, holeX + 0.8, holeZ - 0.8, holeZ + 0.8, (x, z) => Math.hypot(x - holeX, z - holeZ) < 0.75, { ceil: boss ? 8.5 : 7 });
    spawns.push({ pos: V(holeX, boss ? 8 : 6.6, holeZ), from: 'ceiling' });
    const wx = -HW + 0.05;
    spawns.push({ pos: V(wx + 0.5, 0, spawnZ), from: 'wall', dir: V(1, 0, 0) });
  }
  if ((act === 1 || act === 3) && (kind === 'monster' || boss || elite)) {
    const pz = spawnZ, px = boss ? 0 : HW * 0.5, pr = boss ? 2.6 : 1.2;
    L.edit(px - pr, px + pr, pz - pr, pz + pr, (x, z) => Math.hypot((x - px) / 1.2, z - pz) < pr, { floor: -0.5, mat: MAT.WATER });
    spawns.push({ pos: V(px, -0.45, pz), from: 'water' });
  }
  if (act === 2 && (boss || elite)) L.edit(-HW, HW, Z1, Z0, (x, z) => { const d = Math.hypot(x / HW, (z - midZ) / (depth / 2)); return d > 0.5 && d < 0.6; }, { floor: -0.16, mat: MAT.LAVA });
  // the floor burrow
  if (kind !== 'vein') L.edit(-0.6, 0.6, spawnZ - 0.6, spawnZ + 0.6, (x, z) => Math.hypot(x, z - spawnZ) < 0.5, { mat: MAT.EARTH });
  // treasure dais, event clearing
  if (kind === 'treasure') L.edit(-1.3, 1.3, spawnZ - 1.3, spawnZ + 1.3, (x, z) => Math.hypot(x, z - spawnZ) < 1.2, { floor: 0.24 });
  if (kind === 'event') L.edit(-1.6, 1.6, spawnZ - 1.6, spawnZ + 1.6, (x, z) => Math.hypot(x, z - spawnZ) < 1.5, { mat: MAT.EARTH, ceil: 7.2 });
  L.finish();
  const P = new Piece(L, A, seed);
  const clear = [{ x: 0, z: spawnZ, r: boss ? 2.2 : 1.4 }, { x: 0, z: -1.8, r: 1.2 }, { x: 0, z: Z1 - 0.5, r: 1.2 }];
  const anchors = {
    enter: V(0, EYE, 0.3), stand: V(0, EYE, boss ? Z0 - 2.4 : Z0 - 1.6), look: V(0, 1.1, spawnZ - 1), spawns,
    exit: V(0, EYE, Z1 - exitLen + 0.4), end: { pos: V(0, 0, Z1 - exitLen), yaw: 0 }, start: V(0, 0, 0), kind,
  };
  // water / lava sheets for what was carved
  if ((act === 1 || act === 3) && (kind === 'monster' || boss || elite)) { const px = boss ? 0 : HW * 0.5, pr = boss ? 2.6 : 1.2; P.water(px - pr * 1.2, px + pr * 1.2, spawnZ - pr, spawnZ + pr, -0.08); P.op(px - pr, px + pr, spawnZ - pr, spawnZ + pr, (w) => lilyPads(w, A, vx(px), -2, vx(spawnZ), Math.round(pr / S * 0.8), seed, 6)); }
  if (act === 2 && (boss || elite)) { P.lava(-HW, HW, Z1, Z0, -0.14); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; P.lamp(Math.cos(a) * HW * 0.55, 0.2, midZ + Math.sin(a) * depth * 0.27, '#ff6a1a', 3, 1.2); } }
  // pillars get banners / vines / chains
  // kind dressing
  if (kind !== 'vein') {
    const X = vx(0), Z = vx(spawnZ);
    P.op(-1, 1, spawnZ - 1, spawnZ + 1, (w) => { for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2, rr = 11 + (k % 3); w.set(X + Math.round(Math.cos(a) * rr), 0, Z + Math.round(Math.sin(a) * rr), tone(A.dirt, 0.2 + (k % 3) * 0.2)); } for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; ell(w, X + Math.cos(a) * 13, 0.5, Z + Math.sin(a) * 13, 1.6, 1.4, 1.6, tone(A.dirt, 0.35)); } });
    P.op(holeX - 0.8, holeX + 0.8, holeZ - 0.8, holeZ + 0.8, (w) => { for (let k = 0; k < 4; k++) roots(w, A, vx(holeX) + (k - 1.5) * 6, vx(boss ? 8.3 : 6.8), vx(holeZ) + ((k * 5) % 7) - 3, boss ? 90 : 60, seed + k, k === 0 ? A.glow : null); });
    // the wall breach: rubble heaped at the foot and cracks
    P.op(-HW, -HW + 1.2, spawnZ - 1.2, spawnZ + 1.2, (w) => { rubble(w, A, vx(-HW + 0.3), 0, vx(spawnZ), 14, seed, 9); for (let k = 0; k < 30; k++) w.set(vx(-HW + 0.04), vx(0.4) + k * 2, vx(spawnZ) + Math.round(Math.sin(k * 0.7) * 6), C('#0c0a10')); });
  }
  if (kind === 'vein') {
    // the vein: a rough boss of rock breaking out of the masonry on the right wall, threaded with ore
    const vz = Z0 - depth * 0.52, vxw = HW - 0.06;
    P.op(vxw - 1.2, vxw + 0.2, vz - 1.2, vz + 1.2, (w) => oreVein(w, A, vx(vxw), vx(1.15), vx(vz), -1, 0, 26, 18, seed));
    P.lamp(vxw - 0.7, 1.4, vz, A.oreGlow, 2.6, 1.2);
    P.lights.push({ x: vxw - 0.8, y: 1.3, z: vz, c: A.oreGlow, i: 1.4, r: 3.4 });
    const pick = V(vxw, 1.15, vz);
    anchors.vein = { pos: pick, normal: V(-1, 0, 0), stand: V(vxw - 2.1, EYE, vz + 0.25), look: pick.clone().add(V(0, -0.05, 0)), size: [26 * 2 * S, 18 * 2 * S] };
    anchors.stand = V(0, EYE, Z0 - 1.4);
    clear.push({ x: vxw - 0.6, z: vz, r: 1.4 });
    P.op(-HW, HW, Z1, Z0, (w) => { for (let k = 0; k < 6; k++) { const x = (r() - 0.5) * HW, z = Z0 - r() * depth; PR.goldPile(w, vx(x), 0, vx(z), 2 + Math.round(r() * 2), k); } }); // chips of ore on the floor
  }
  if (kind === 'treasure') {
    anchors.chest = V(0, 0.24, spawnZ);
    P.shaft(0, 6, spawnZ, 1.6, 6, '#ffe8a0', 0.4);
    P.lamp(0, 1.4, spawnZ + 0.4, '#ffd27a', 3.4, 1.2);
    P.op(-1.4, 1.4, spawnZ - 1.4, spawnZ + 1.4, (w) => { for (let k = 0; k < 10; k++) { const a = r() * Math.PI * 2, rr = 13 + r() * 14; const gx = vx(0) + Math.round(Math.cos(a) * rr), gz = vx(spawnZ) + Math.round(Math.sin(a) * rr); w.set(gx, vx(0.24), gz, glowC(A.ore[k % 3])); w.set(gx + 1, vx(0.24), gz, C(A.ore[k % 3])); } for (const sx of [-1, 1]) { cyl(w, vx(sx * 1.05) + 0.5, vx(spawnZ) + 0.5, vx(0.24), vx(0.24) + 22, 2.2, 1.8, (px, py, pz) => tone(A.brick, 0.4 + h3(px, py, pz, 1) * 0.2)); w.set(vx(sx * 1.05), vx(0.24) + 22, vx(spawnZ), glowC('#ffd27a')); } });
    P.flame(-1.05, 0.24 + 0.9, spawnZ, 0.4, 'fire'); P.flame(1.05, 0.24 + 0.9, spawnZ, 0.4, 'fire');
  }
  if (kind === 'event') {
    anchors.event = V(0, 0, spawnZ);
    P.shaft(0, 7, spawnZ, 1.8, 7, act === 2 ? '#ffc890' : act === 1 ? '#c8e8ff' : '#fff0c8', 0.42);
    P.lamp(0, 2.2, spawnZ, A.lamp2, 3.6, 0.9);
    P.op(-1.7, 1.7, spawnZ - 1.7, spawnZ + 1.7, (w) => { for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ell(w, vx(Math.cos(a) * 1.5), 1.5, vx(spawnZ + Math.sin(a) * 1.5), 2.6, 2.6 + (k % 3), 2.6, (px, py, pz) => tone(A.brick, 0.35 + h3(px, py, pz, k) * 0.3)); } tufts(w, A, vx(0), 0, vx(spawnZ), 30, seed, 40); });
    clear.push({ x: 0, z: spawnZ, r: 1.8 });
  }
  if (boss) {
    const fx = HW * 0.42, fz = midZ - depth * 0.18;
    anchors.friend = V(fx, 0.3, fz);
    anchors.boss = V(0, 0, midZ - 1.2);
    P.op(fx - 1, fx + 1, fz - 1, fz + 1, (w) => { cyl(w, vx(fx) + 0.5, vx(fz) + 0.5, 0, vx(0.3), 15, 15, (px, py, pz) => tone(A.brick, 0.42 + (py === vx(0.3) - 1 ? 0.2 : 0) + h3(px, py, pz, 2) * 0.1)); for (let k = 0; k < 60; k++) { const a = (k / 60) * Math.PI * 2; w.set(vx(fx) + Math.round(Math.cos(a) * 15), 3 + Math.round(Math.sin(a * 3) * 2), vx(fz) + Math.round(Math.sin(a) * 15), glowC(A.glow)); } });
    P.lamp(fx, 1.6, fz, A.glow, 3, 1);
    P.shaft(fx, 9, fz, 1.2, 9, '#d8f0ff', 0.3);
    // each herald's lair
    if (act === 0) for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; const x = Math.cos(a) * HW * 0.93, z = midZ + Math.sin(a) * depth * 0.46; P.op(x - 1.5, x + 1.5, z - 1.5, z + 1.5, (w) => { for (let q = 0; q < 3; q++) { let px = vx(x), pz = vx(z); for (let y = 0; y < vx(5); y++) { px -= Math.cos(a) * 0.2 + Math.sin(y * 0.1 + q) * 0.4; pz -= Math.sin(a) * 0.2 + Math.cos(y * 0.1 + q) * 0.4; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dz * dz <= 4) w.set(Math.round(px + dx), y, Math.round(pz + dz), tone(A.root, 0.3 + h3(dx, y, q, 1) * 0.3)); if (y % 7 === 0) for (let t = 1; t < 5; t++) w.set(Math.round(px + t), y + t, Math.round(pz), y % 14 ? C('#d8d0a0') : tone(A.root, 0.6)); } } }); }
    if (act === 1) for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + 0.3; const x = Math.cos(a) * HW * 0.5, z = midZ + Math.sin(a) * depth * 0.24; P.op(x - 1, x + 1, z - 1, z + 1, (w) => crystalCluster(w, vx(x), 0, vx(z), 50 + (k % 3) * 20, k & 1 ? A.crystal : A.crystal2, k, 6)); P.lamp(x, 1, z, k & 1 ? A.crystal : A.crystal2, 3, 1.2); }
    if (act === 2) for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.6; const x = Math.cos(a) * HW * 0.82, z = midZ + Math.sin(a) * depth * 0.4; P.op(x - 1.5, x + 1.5, z - 1.5, z + 1.5, (w) => ashTree(w, A, vx(x), 0, vx(z), 96, k + 3)); P.lamp(x, 3.5, z, '#ff8a2a', 3.5, 1); }
    if (act === 3) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.25; const x = Math.cos(a) * HW * 0.62, z = midZ + Math.sin(a) * depth * 0.31; if (Math.hypot(x - fx, z - fz) < 1.6 || Math.abs(x) < 1.2 && z > midZ) continue; P.op(x - 1, x + 1, z - 1, z + 1, (w) => statue(w, A, vx(x), 0, vx(z), k + 5, Math.atan2(-x, -(z - midZ)) + Math.PI, k % 3)); }
    clear.push({ x: fx, z: fz, r: 1.2 }, { x: 0, z: midZ, r: 2.6 });
  }
  if (act === 3 && !boss && kind !== 'vein') for (const sx of [-1, 1]) { const x = sx * (HW - 0.55), z = Z0 - depth * 0.85; P.op(x - 0.8, x + 0.8, z - 0.8, z + 0.8, (w) => statue(w, A, vx(x), 0, vx(z), seed + sx, sx > 0 ? -Math.PI / 2 : Math.PI / 2, (seed + sx + 2) % 3)); clear.push({ x, z, r: 0.8 }); }
  if (act === 2 && elite) for (const sx of [-1, 1]) P.op(sx * 2.8 - 1.5, sx * 2.8 + 1.5, Z1 + 0.4, Z1 + 2.6, (w) => ashTree(w, A, vx(sx * (HW - 1.4)), 0, vx(Z1 + 1.4), 92, sx + 4));
  if (act === 0 && kind !== 'vein' && r() < 0.8) { const x = HW - 0.04, z = Z0 - depth * 0.2; L.edit(x - 0.7, x + 0.1, z - 0.6, z + 0.6, null, { floor: -0.25, mat: MAT.WATER }); P.waterfall(x - 0.15, 2.6, -0.2, z, 0.45, -1, 0); P.water(x - 0.75, x + 0.05, z - 0.6, z + 0.6, -0.1); }
  decorate(P, act, r, -HW - 0.5, HW + 0.5, Z1 - exitLen, 0.6, { torches: boss ? 3.4 : 3.6, clear, banners: boss ? 4 : elite ? 3 : 2, roots: boss ? 0.6 : 1 });
  // pillar dressing: torches high on two of them, vines / chains / crystals
  pillars.forEach((p, k) => {
    const X = vx(p.x), Z = vx(p.z), Y = vx(boss ? 4 : 2.8);
    if (k % 2 === 0) { const nz = 1; P.torch(p.x, 1.55, p.z + p.r + 0.06, 0, nz, A.lamp, A.flame); }
    if (act === 0 || act === 3) P.op(p.x - 0.7, p.x + 0.7, p.z - 0.7, p.z + 0.7, (w) => PR.vine(w, X + Math.round(p.r / S), Y, Z, 40 + k * 6, A.leaf.slice(1, 4), k, act === 3 ? A.flowers[k & 3] : null));
    if (act === 1) P.op(p.x - 0.8, p.x + 0.8, p.z - 0.8, p.z + 0.8, (w) => crystalCluster(w, X + Math.round((p.r + 0.1) / S), 0, Z, 16, k & 1 ? A.crystal : A.crystal2, k, 4));
  });
  P.lamp(0, spring, midZ, A.lamp, Math.max(HW, depth / 2) * 1.6, 0.32);
  anchors.path = pathCurve([[0, EYE, 0.3], [0, EYE, -0.6], [anchors.stand.x, EYE, anchors.stand.z]]);
  anchors.exitPath = pathCurve([[anchors.stand.x, EYE, anchors.stand.z], [0, EYE, spawnZ + 0.8], [HW * 0.3, EYE, spawnZ - 1.4], [0, EYE, Z1 + 0.4], [0, EYE, Z1 - exitLen + 0.4]]);
  anchors.pillars = pillars.map((p) => ({ pos: V(p.x, 0, p.z), r: p.r }));
  anchors.size = { hw: HW, z0: Z0, z1: Z1, ceil: spring + rise };
  return finishPiece(P, 'chamber', act, anchors, { stream: true, sync: [-HW - 1, HW + 1, Z0 - depth * 0.5, 1] });
}

// ---------------------------------------------------------------------------- chase (intro escape)
/** Long twisting run with set pieces; the path dips and jumps with the floor. */
function chase(act, seed, o) {
  const A = ACT_STYLES[act], r = rngOf(seed * 17 + 1);
  // path polyline in XZ (metres) with segments: straight, turn, gap, roots, ledge hall, slide
  const pts = [[0, 0.6], [0, -8]];
  let ang = 0, x = 0, z = -8;
  const add = (len, turn = 0) => { const steps = Math.max(1, Math.round(len / 1.2)); for (let k = 0; k < steps; k++) { ang += turn / steps; x += -Math.sin(ang) * (len / steps); z += -Math.cos(ang) * (len / steps); pts.push([x, z]); } };
  add(5, 0.9); add(6, 0);      // turn left, straight → the gap
  const gapAt = pts.length - 3;
  add(5, -1.4); add(5, 0);     // turn right → the root curtain
  const rootAt = pts.length - 2;
  add(4, 0.6);                 // into the ledge hall
  const ledgeA = pts.length; add(9, 0); const ledgeB = pts.length - 1;
  add(4, -0.7); add(3, 0);
  const slideA = pts.length; add(8, 0); const slideB = pts.length - 1;
  // arc-length along the polyline
  const acc = [0];
  for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const total = acc[acc.length - 1];
  const at = (k) => acc[k] / total;
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const L = new Layout(Math.min(...xs) - 4.5, Math.max(...xs) + 4.5, Math.min(...zs) - 4.5, Math.max(...zs) + 1);
  // distance field to the polyline, rasterised once over the layout grid (segment by segment, locally)
  const n = L.W * L.D, dF = new Float32Array(n).fill(1e9), sF = new Float32Array(n), kF = new Int16Array(n);
  const REACH = 3.6;
  for (let k = 1; k < pts.length; k++) {
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, sl = Math.sqrt(l2);
    const X0 = Math.max(L.X0, Math.floor((Math.min(ax, bx) - REACH) / S)), X1 = Math.min(L.X1, Math.ceil((Math.max(ax, bx) + REACH) / S));
    const Z0 = Math.max(L.Z0, Math.floor((Math.min(az, bz) - REACH) / S)), Z1 = Math.min(L.Z1, Math.ceil((Math.max(az, bz) + REACH) / S));
    for (let Z = Z0; Z < Z1; Z++) for (let X = X0; X < X1; X++) {
      const px = (X + 0.5) * S, pz = (Z + 0.5) * S;
      const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2);
      const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
      const i = (Z - L.Z0) * L.W + (X - L.X0);
      if (d < dF[i]) { dF[i] = d; sF[i] = (acc[k - 1] + sl * t) / total; kF[i] = k; }
    }
  }
  const near = (px, pz) => { const i = L.i(Math.floor(px / S), Math.floor(pz / S)); return i < 0 ? { d: 1e9, s: 0, k: 1 } : { d: dF[i], s: sF[i], k: kF[i] || 1 }; };
  const sSlideA = at(slideA), sSlideB = at(slideB), sLedgeA = at(ledgeA), sLedgeB = at(ledgeB), sGap = at(gapAt), sRoot = at(rootAt);
  const floorOf = (s) => (s > sSlideA ? -4.2 * clamp((s - sSlideA) / (sSlideB - sSlideA)) ** 1.3 : 0);
  const hwOf = (s) => (s > sLedgeA - 0.01 && s < sLedgeB + 0.01 ? 2.9 : 1.3 + (noise2(s * 30, 2) - 0.5) * 0.3);
  L.carve(L.X0 * S, L.X1 * S, L.Z0 * S, L.Z1 * S, (px, pz) => { const n = near(px, pz); return n.d < hwOf(n.s); }, (px, pz) => floorOf(near(px, pz).s), (px, pz) => { const n = near(px, pz); const ledge = n.s > sLedgeA && n.s < sLedgeB; return floorOf(n.s) + (ledge ? 4.4 : vaultH(n.d, hwOf(n.s), n.s * total, 2.35, 0.7)); }, MAT.STONE, act === 3 ? 2 : 0);
  // the gap: a chasm across the path
  const gp = pts[gapAt], gp2 = pts[gapAt + 1];
  const gdir = [gp2[0] - gp[0], gp2[1] - gp[1]], gl = Math.hypot(...gdir);
  L.edit(gp[0] - 2.5, gp[0] + 2.5, gp[1] - 2.5, gp[1] + 2.5, (px, pz) => Math.abs(((px - gp[0]) * gdir[0] + (pz - gp[1]) * gdir[1]) / gl) < 0.8, { floor: -5, mat: MAT.VOID });
  // the ledge hall: a void with a narrow ledge along the left wall (landings at both ends)
  const mL = 1.8 / total;
  const leftOf = (k, px, pz) => { const [ax, az] = pts[k - 1], [bx, bz] = pts[k]; return (bx - ax) * (pz - az) - (bz - az) * (px - ax) < 0; };
  L.edit(L.X0 * S, L.X1 * S, L.Z0 * S, L.Z1 * S, (px, pz) => { const n = near(px, pz); if (n.s < sLedgeA + mL || n.s > sLedgeB - mL) return false; return !(leftOf(n.k, px, pz) && n.d > 2.9 - 1.0); }, { floor: -3.4, mat: MAT.VOID });
  L.finish();
  const P = new Piece(L, A, seed);
  // path for the camera: along the polyline, out onto the ledge, a hop over the gap, the slide
  const camPts = [];
  for (let k = 0; k < pts.length; k++) {
    const s2 = at(k);
    let [px, pz] = pts[k];
    if (s2 > sLedgeA + mL * 0.6 && s2 < sLedgeB - mL * 0.6) {
      const [ax, az] = pts[Math.max(0, k - 1)], [bx, bz] = pts[Math.min(pts.length - 1, k + 1)], dl = Math.hypot(bx - ax, bz - az) || 1;
      px += ((bz - az) / dl) * 2.4; pz += (-(bx - ax) / dl) * 2.4; // left of the direction of travel
    }
    let y = floorOf(s2) + EYE;
    if (k === gapAt || k === gapAt + 1) y += 0.35;
    camPts.push([px, y, pz]);
  }
  const path = pathCurve(camPts);
  const beats = [{ t: sGap, kind: 'gap' }, { t: sRoot, kind: 'roots' }, { t: sLedgeA, kind: 'ledge' }, { t: sLedgeB, kind: 'ledgeEnd' }, { t: sSlideA, kind: 'slide' }, { t: 1, kind: 'end' }];
  // set-piece dressing: glowing depths in the gap, a curtain of roots, the ledge hall's far wall of falls
  P.op(gp[0] - 2.5, gp[0] + 2.5, gp[1] - 2.5, gp[1] + 2.5, (w) => { for (let k = 0; k < 40; k++) w.set(vx(gp[0] + (r() - 0.5) * 3), vx(-5) + 1, vx(gp[1] + (r() - 0.5) * 3), glowC(A.glow)); });
  P.lamp(gp[0], -3.5, gp[1], A.glow, 4, 1.4);
  P.lights.push({ x: gp[0], y: -1, z: gp[1], c: A.glow, i: 1.6, r: 4 });
  const rp = pts[rootAt];
  P.op(rp[0] - 2, rp[0] + 2, rp[1] - 2, rp[1] + 2, (w) => { for (let k = 0; k < 26; k++) { const a = k / 25; roots(w, A, vx(rp[0] + (a - 0.5) * 2.6), vx(3.1), vx(rp[1] + (r() - 0.5) * 0.5), 52 + Math.round(r() * 14), k, k % 5 === 0 ? A.glow : null); } });
  const lk = Math.round((ledgeA + ledgeB) / 2), lm = pts[lk], la = pts[lk - 1], ldl = Math.hypot(lm[0] - la[0], lm[1] - la[1]) || 1;
  const rx = -(lm[1] - la[1]) / ldl, rz = (lm[0] - la[0]) / ldl; // right of travel
  P.lamp(lm[0], -2.6, lm[1], act === 2 ? '#ff6a1a' : A.glow, 6, 1.3);
  P.waterfall(lm[0] + rx * 2.75, 4.3, -3.3, lm[1] + rz * 2.75, 0.8, -rx, -rz);
  P.shaft(lm[0] + rx * 0.8, 4.4, lm[1] + rz * 0.8, 1.6, 7.6, '#bcd8ff', 0.3);
  decorate(P, act, r, L.X0 * S, L.X1 * S, L.Z0 * S, L.Z1 * S, { torches: 5.2, clear: [{ x: gp[0], z: gp[1], r: 1.4 }, { x: rp[0], z: rp[1], r: 1.2 }], banners: 2, roots: 0.6 });
  const end = pts[pts.length - 1];
  const anchors = { path, beats, start: V(0, 0, 0), enter: V(0, EYE, 0.3), look: V(0, EYE, -5), end: { pos: V(end[0], floorOf(1), end[1]), yaw: ang }, length: total };
  return finishPiece(P, 'chase', act, anchors, { stream: true, radius: 14, sync: [-4, 4, -10, 1] });
}

// ---------------------------------------------------------------------------- public
/**
 * kind: 'tunnel' { seed, length 6–24, bend -1|0|1 } | 'junction' { seed, exits: [-1,0,1] subset, hints: [{dir, color}] }
 *     | 'chamber' { seed, kind: 'monster'|'elite'|'vein'|'event'|'treasure'|'boss' } | 'chase' { seed }
 * act: 0 undercroft · 1 cistern · 2 foundry · 3 garden
 */
export function buildFP(kind, act = 0, opts = {}) {
  act = clamp(act | 0, 0, 3);
  const seed = (opts.seed ?? 1) | 0;
  const t0 = performance.now();
  let st;
  if (kind === 'tunnel') st = tunnel(act, seed, opts);
  else if (kind === 'junction') st = junction(act, seed, opts);
  else if (kind === 'chamber') st = chamber(act, seed, opts);
  else if (kind === 'chase') st = chase(act, seed, opts);
  else throw new Error('unknown FP piece ' + kind);
  st.buildMs = performance.now() - t0;
  return st;
}
export const FP_KINDS = ['tunnel', 'junction', 'chamber', 'chase'];
export { ACT_STYLES };
void rnd;
