// Enemy-side effects: ground telegraphs (fill-up decals), lingering hazard clouds (spores, fire), expanding
// shockwave rings, spore-ball projectile models, entrance puffs and the shape tests attacks use.
// Telegraphs use world.telegraph when the engine provides one, else a built-in decal; hazards and rings are
// ticked by the enemy manager (see index.js tickEnemyFx) so they keep working after their maker dies.
import * as THREE from 'three';

// ------------------------------------------------------------------ shape tests (x/z plane)
export function inCircle(p, x, z, r) { return Math.hypot(p.x - x, p.z - z) <= r + (p.radius || 0) * 0.6; }
export function inRing(p, x, z, r, w) { const d = Math.hypot(p.x - x, p.z - z); return Math.abs(d - r) <= w / 2 + (p.radius || 0) * 0.5; }
export function inCone(p, x, z, dir, angle, range) {
  const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
  if (d > range + (p.radius || 0) * 0.6) return false;
  if (d < 0.3) return true;
  const c = (dx * dir.x + dz * dir.z) / d;
  return c >= Math.cos(angle / 2);
}
export function inLine(p, x, z, dir, len, width) {
  const dx = p.x - x, dz = p.z - z;
  const along = dx * dir.x + dz * dir.z, side = Math.abs(dx * -dir.z + dz * dir.x);
  return along >= -0.3 && along <= len + (p.radius || 0) * 0.5 && side <= width / 2 + (p.radius || 0) * 0.6;
}

// ------------------------------------------------------------------ decal material
const DECAL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
// shape: 0 circle, 1 ring, 2 cone, 3 line. uv in [-1,1]² (line: x across, y along 0..1)
const DECAL_FS = `uniform vec3 uCol; uniform float uFill; uniform float uAlpha; uniform float uShape; uniform float uAngle; uniform float uInner; uniform float uTime;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0; float d = length(p); float a = 0.0; float edge = 0.0; float fillMask = 0.0;
  if (uShape < 0.5) { if (d > 1.0) discard; edge = smoothstep(0.86, 0.94, d) * (1.0 - smoothstep(0.98, 1.0, d)); fillMask = step(d, uFill); }
  else if (uShape < 1.5) { if (d > 1.0 || d < uInner) discard; edge = 1.0 - smoothstep(0.0, 0.08, min(abs(d-1.0), abs(d-uInner))); fillMask = step(d, uInner + (1.0-uInner)*uFill); }
  else if (uShape < 2.5) { float ang = atan(p.x, p.y); if (d > 1.0 || abs(ang) > uAngle*0.5) discard; edge = max(smoothstep(0.9,0.98,d), 1.0 - smoothstep(0.0, 0.05, uAngle*0.5 - abs(ang))); fillMask = step(d, uFill); }
  else { float y = vUv.y; float x = abs(vUv.x*2.0-1.0); edge = max(smoothstep(0.86,0.96,x), 1.0 - smoothstep(0.0,0.04,y)); fillMask = step(y, uFill); }
  float stripes = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 40.0 - uTime * 6.0);
  a = edge * 0.95 + fillMask * (0.32 + stripes * 0.08) + 0.08;
  gl_FragColor = vec4(uCol * (1.0 + fillMask * 0.6), a * uAlpha);
}`;
const planeGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const lineGeo = (() => { const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); g.translate(0, 0, -0.5); return g; })();
function decalMat(col, shape, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(col) }, uFill: { value: 0 }, uAlpha: { value: 1 }, uShape: { value: shape }, uAngle: { value: o.angle || 1 }, uInner: { value: o.inner || 0 }, uTime: { value: 0 } },
    vertexShader: DECAL_VS, fragmentShader: DECAL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
}

/** Built-in telegraph decal (used when the engine has none). Returns { mesh, update(dt) → alive, cancel() }. */
function makeDecal(world, o) {
  const shape = { circle: 0, ring: 1, cone: 2, line: 3 }[o.shape] ?? 0;
  const mat = decalMat(o.color || '#ff3a2a', shape, { angle: o.angle, inner: o.inner });
  let mesh;
  if (shape === 3) { mesh = new THREE.Mesh(lineGeo, mat); mesh.scale.set(o.width || 1, 1, o.len || 3); }
  else { mesh = new THREE.Mesh(planeGeo, mat); const r = o.r || 1; mesh.scale.set(r, 1, r); }
  mesh.position.set(o.x, 0.03, o.z);
  if (o.dir) mesh.rotation.y = Math.atan2(-o.dir.x, -o.dir.z) + (shape === 2 ? 0 : 0);
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  (world.scene || world.group).add(mesh);
  const T = { t: 0, dur: o.dur || 0.8, mesh, dead: false, flash: 0 };
  T.update = (dt) => {
    if (T.dead) return false;
    T.t += dt; mat.uniforms.uTime.value += dt;
    const k = Math.min(1, T.t / T.dur);
    mat.uniforms.uFill.value = k;
    if (o.follow) { const f = o.follow(); if (f) { mesh.position.x = f.x; mesh.position.z = f.z; if (f.dir) mesh.rotation.y = Math.atan2(-f.dir.x, -f.dir.z); } }
    if (k >= 1) {
      T.flash += dt;
      mat.uniforms.uAlpha.value = Math.max(0, 1 - T.flash / 0.18);
      if (T.flash >= 0.18) { T.cancel(); return false; }
    } else mat.uniforms.uAlpha.value = 0.55 + 0.45 * k;
    return true;
  };
  T.cancel = () => { if (T.dead) return; T.dead = true; mesh.removeFromParent(); mat.dispose(); };
  return T;
}

/**
 * Show an attack tell on the ground. o: { shape: circle|ring|cone|line, x, z, r, inner, len, width, angle, dir, dur, color, follow }
 * Returns a handle with cancel(). Timing and hit-testing stay with the caller.
 */
export function telegraph(world, o) {
  const M = manager(world);
  if (typeof world.telegraph === 'function' && !world._noEngineTelegraph) {
    try {
      const h = world.telegraph({ ...o, color: o.color || '#ff3a2a' });
      if (h) return { cancel: () => { try { h.cancel ? h.cancel() : h.remove && h.remove(); } catch (e) { /* engine handle */ } } };
    } catch (e) { /* fall through to the built-in decal */ }
  }
  const T = makeDecal(world, o);
  M.decals.push(T);
  return T;
}

// ------------------------------------------------------------------ spore / ember projectiles
const BALL = new THREE.BoxGeometry(1, 1, 1);
const ballMats = new Map();
function ballMat(col) { let m = ballMats.get(col); if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.8), fog: false }); m.userData.keep = true; ballMats.set(col, m); } return m; }
/** A chunky glowing voxel ball (spore, thorn, ember…) to hand to world.spawnProjectile as its model. */
export function projectileModel(kind = 'spore', col = '#9affc0', size = 0.22) {
  const g = new THREE.Group();
  const m = ballMat(col), core = ballMat('#ffffff');
  const v = size / 3;
  if (kind === 'thorn') {
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(BALL, m); b.scale.set(v, v, v * 1.2); b.position.z = (i - 1.5) * v; g.add(b); }
    const tip = new THREE.Mesh(BALL, core); tip.scale.setScalar(v * 0.8); tip.position.z = 2 * v; g.add(tip);
  } else {
    for (const [x, y, z] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const b = new THREE.Mesh(BALL, x || y || z ? m : core); b.scale.setScalar(v * (x || y || z ? 1 : 1.2)); b.position.set(x * v, y * v, z * v); g.add(b); }
  }
  g.userData.spin = kind === 'thorn' ? 0 : 4;
  return g;
}

/** Fire one projectile through the engine (falls back to a built-in mover). */
export function shoot(world, e, o) {
  const p = {
    team: 'enemy', x: o.x ?? e.x, z: o.z ?? e.z, y: o.y ?? 0.6, dir: o.dir, speed: o.speed || 7, radius: o.radius || 0.22,
    dmg: o.dmg ?? e.dmg, life: o.life || 3, pierce: false, color: o.color || '#9affc0',
    model: o.model || projectileModel(o.kind || 'spore', o.color || '#9affc0', o.size || 0.24),
    status: o.status, element: o.element, source: e, kb: o.kb ?? 0.6, gravity: o.gravity, arc: o.arc,
    onHit: o.onHit,
  };
  if (typeof world.spawnProjectile === 'function') {
    const r = world.spawnProjectile(p);
    if (r !== null && r !== undefined) return r;
  }
  // fallback mover (engine placeholder): straight line, hits the player once
  const M = manager(world);
  const mdl = p.model; mdl.position.set(p.x, p.y, p.z);
  (world.scene || world.group).add(mdl);
  M.shots.push({ ...p, t: 0, mdl });
  return null;
}

// ------------------------------------------------------------------ hazards and rings
const CLOUD = new THREE.SphereGeometry(1, 10, 6);
/** A lingering cloud (spores / fire) that hurts the player inside it every `tick` seconds. */
export function hazard(world, o) {
  const M = manager(world);
  const col = new THREE.Color(o.color || '#7affb0');
  const g = new THREE.Group();
  const puffs = [];
  const n = Math.round(5 + o.r * 3);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(CLOUD, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * o.r * 0.75;
    m.position.set(Math.cos(a) * rr, 0.25 + Math.random() * 0.4, Math.sin(a) * rr);
    const s = o.r * (0.32 + Math.random() * 0.25); m.scale.set(s, s * 0.55, s);
    m.userData.ph = Math.random() * 6;
    g.add(m); puffs.push(m);
  }
  g.position.set(o.x, 0, o.z);
  (world.scene || world.group).add(g);
  const H = { ...o, t: 0, tick: o.tick || 0.5, acc: 0.2, g, puffs, dead: false };
  M.hazards.push(H);
  return H;
}
/** An expanding shockwave ring from (x, z): hits the player once when the band passes over them. */
export function shockwave(world, o) {
  const M = manager(world);
  const mat = decalMat(o.color || '#ffd27a', 1, { inner: 0.82 });
  const mesh = new THREE.Mesh(planeGeo, mat);
  mesh.position.set(o.x, 0.05, o.z);
  mesh.renderOrder = 5;
  (world.scene || world.group).add(mesh);
  M.rings.push({ ...o, t: 0, mesh, mat, hit: false });
}

// ------------------------------------------------------------------ the manager (per world)
export function manager(world) {
  if (!world._enemyFx) world._enemyFx = { decals: [], hazards: [], rings: [], shots: [], frame: -1 };
  return world._enemyFx;
}
function hurtPlayer(world, src, o) {
  const p = world.player;
  if (!p || p.dead) return;
  const dir = { x: p.x - (o.x ?? p.x), z: p.z - (o.z ?? p.z) };
  const l = Math.hypot(dir.x, dir.z) || 1;
  const hit = { dmg: o.dmg, kb: o.kb ?? 0.8, dir: { x: dir.x / l, z: dir.z / l }, status: o.status, element: o.element, source: src || null };
  if (typeof world.damage === 'function') world.damage(p, hit);
}
export function updateEnemyFx(world, dt) {
  const M = manager(world);
  M.decals = M.decals.filter((T) => T.update(dt));
  for (const H of M.hazards) {
    H.t += dt;
    const k = H.t / H.life;
    const fadeIn = Math.min(1, H.t / 0.35), fadeOut = Math.min(1, (H.life - H.t) / 0.6);
    for (const m of H.puffs) {
      m.userData.ph += dt;
      m.material.opacity = 0.22 * Math.max(0, Math.min(fadeIn, fadeOut)) * (0.8 + Math.sin(m.userData.ph * 1.7) * 0.2);
      m.position.y += Math.sin(m.userData.ph) * 0.002;
      m.rotation.y += dt * 0.3;
    }
    H.acc += dt;
    if (H.t > 0.3 && H.acc >= H.tick && world.player && inCircle(world.player, H.x, H.z, H.r * 0.85)) { H.acc = 0; hurtPlayer(world, H.source, { ...H, kb: 0 }); }
    if (k >= 1) { H.dead = true; H.g.removeFromParent(); H.puffs.forEach((m) => m.material.dispose()); }
  }
  M.hazards = M.hazards.filter((H) => !H.dead);
  for (const R of M.rings) {
    R.t += dt;
    const k = Math.min(1, R.t / R.dur), r = R.r0 + (R.r1 - R.r0) * k;
    R.mesh.scale.set(r, 1, r);
    R.mat.uniforms.uFill.value = 1; R.mat.uniforms.uTime.value += dt;
    R.mat.uniforms.uAlpha.value = 1 - k * 0.7;
    if (!R.hit && world.player && inRing(world.player, R.x, R.z, r, R.width || 0.6)) { R.hit = true; hurtPlayer(world, R.source, R); }
    if (k >= 1) { R.done = true; R.mesh.removeFromParent(); R.mat.dispose(); }
  }
  M.rings = M.rings.filter((R) => !R.done);
  for (const S of M.shots) {
    S.t += dt;
    S.x += S.dir.x * S.speed * dt; S.z += S.dir.z * S.speed * dt;
    S.mdl.position.set(S.x, S.y, S.z);
    S.mdl.rotation.y += dt * (S.mdl.userData.spin || 0);
    const p = world.player;
    if (p && !p.dead && Math.hypot(p.x - S.x, p.z - S.z) < S.radius + (p.radius || 0.35)) { S.done = true; hurtPlayer(world, S.source, { ...S, x: S.x - S.dir.x, z: S.z - S.dir.z }); }
    if (S.t > S.life || (world.grid && typeof world.grid.get === 'function' && world.grid.get(...world.grid.toTile(S.x, S.z)) === 1)) S.done = true;
    if (S.done) S.mdl.removeFromParent();
  }
  M.shots = M.shots.filter((S) => !S.done);
}

// ------------------------------------------------------------------ small fx helpers (engine fx when present)
export function puff(world, x, z, col = '#cfe8a0', n = 12) {
  const fx = world.fx;
  if (fx && typeof fx.dust === 'function') try { fx.dust(x, z, { color: col, n }); } catch (e) { /* engine fx */ }
  if (fx && typeof fx.spark === 'function') try { fx.spark(x, 0.4, z, col, Math.round(n / 2)); } catch (e) { /* engine fx */ }
}
export function ringFx(world, x, z, r, col) {
  const fx = world.fx;
  if (fx && typeof fx.ring === 'function') try { fx.ring(x, z, r, col); } catch (e) { /* engine fx */ }
}
