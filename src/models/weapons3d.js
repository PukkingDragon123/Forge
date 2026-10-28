// Forged weapons as low-poly meshes whose look comes from their ingredients:
// blade metal/gem/bone colour, guard trim, gem inlay, handle wrap, element glow runes,
// fang spikes, golem cores, masterwork gold. Plus curse cracks and shatter shards.
import * as THREE from 'three';
import { TOON4 } from '../gfx/materials.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { MATERIALS } from '../data/materials.js';

const ELEMENT_GLOW = { fire: '#ff7a2a', ice: '#7fe3ff', shock: '#ffe74a', poison: '#8fe04a', curse: '#c86bff', holy: '#fff3b0', bleed: '#ff4f6a' };
const METAL_TINT = {
  iron: '#b8bec8', copper: '#d8844a', tin: '#c8ccd4', silver: '#e8eef8', gold: '#ffd04a', mithril: '#bff4ff', stariron: '#4a4a7a',
  magmasteel: '#ff7a3a', bronze_ancient: '#c8963a', lodestone: '#5a5a6e', cursedore: '#8a4ac0', obsidian: '#2e2240', junk: '#8a7a6a',
};
const WRAP = { spider_silk: '#f0f0ff', bat_wing: '#5a3a5a', rat_tail: '#c88a8a', toad_tongue: '#c86a7a', mimic_tongue: '#ff6a9a', feather: '#c8b8a0', moth_dust: '#e0d0ff' };

const m3 = (id) => MATERIALS[id] || null;
const tagged = (id, t) => !!(m3(id) && m3(id).tags.includes(t));

function toonM(color, o = {}) {
  return new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: TOON4, emissive: new THREE.Color(o.emissive || 0), emissiveIntensity: o.ei ?? 1 });
}
function glowM(color, i = 2.2) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(i), fog: false }); }
function mk(geo, mat, parent, p = [0, 0, 0], r = [0, 0, 0], s = null) {
  if (mat.isMeshToonMaterial && geo.index) { geo = geo.toNonIndexed(); geo.computeVertexNormals(); }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p); m.rotation.set(...r);
  if (s) m.scale.set(...s);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function extrude(pts, depth, bevel = 0.006) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 1.2, bevelSegments: 1, curveSegments: 3 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Derive colours & decorations from a weapon description. */
export function weaponLook(w) {
  const ids = w.ids || [];
  const solids = ids.filter((id) => tagged(id, 'solid'));
  const metals = ids.filter((id) => tagged(id, 'metal')).sort((a, b) => m3(b).value - m3(a).value);
  const gems = ids.filter((id) => tagged(id, 'gem'));
  const bones = ids.filter((id) => tagged(id, 'bone'));
  let blade = '#9aa0aa', bladeKind = 'metal';
  if (metals.length) {
    blade = METAL_TINT[metals[0]] || m3(metals[0]).color;
    if (metals[0] === 'iron' && ids.includes('coal')) blade = '#cfd6e2'; // steel
    if (ids.includes('gold') && ids.includes('silver')) blade = '#f4e6a8'; // electrum
  } else if (gems.length) { blade = m3(gems[0]).color; bladeKind = 'crystal'; }
  else if (bones.length) { blade = '#efe6d0'; bladeKind = 'bone'; }
  else if (solids.length) blade = m3(solids[0]).color;
  const second = metals.find((id) => id !== metals[0]) || solids.find((id) => id !== metals[0]);
  let trim = second ? (METAL_TINT[second] || m3(second).color) : '#8a6a3a';
  if (w.grade >= 4) trim = '#ffcf4a';
  const gem = gems.length ? m3(gems[0]).color : ids.includes('golem_core') ? '#ffb84a' : null;
  const wrapId = ids.find((id) => WRAP[id]);
  const wrap = wrapId ? WRAP[wrapId] : bones.length && bladeKind !== 'bone' ? '#efe6d0' : '#5a3a24';
  const el = w.el || {};
  const els = Object.keys(ELEMENT_GLOW).filter((e) => (el[e] || 0) > 0).sort((a, b) => el[b] - el[a]);
  return {
    blade, bladeDark: new THREE.Color(blade).multiplyScalar(0.6).getStyle(), bladeKind, trim, gem, wrap,
    glow: els.length ? ELEMENT_GLOW[els[0]] : null, glow2: els.length > 1 ? ELEMENT_GLOW[els[1]] : null,
    fangs: ids.filter((id) => tagged(id, 'fang')).length, core: ids.includes('golem_core') || ids.includes('lava_core'),
    masterwork: w.grade >= 4, star: ids.includes('stariron'), magma: ids.includes('magmasteel'),
  };
}

function bladeMaterial(L) {
  if (L.bladeKind === 'crystal') {
    const m = toonM(L.blade, { emissive: L.blade, ei: 0.35 });
    m.transparent = true; m.opacity = 0.92;
    return m;
  }
  const m = toonM(L.blade, { emissive: L.magma ? '#ff4a1a' : 0, ei: L.magma ? 0.6 : 1 });
  return m;
}

function addGrip(g, L, len, r = 0.022) {
  const wrapM = toonM(L.wrap), trimM = toonM(L.trim);
  mk(new THREE.CylinderGeometry(r, r * 1.05, len, 6), wrapM, g, [0, 0, 0]);
  for (let i = 0; i < 3; i++) mk(new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.012, 6), toonM(new THREE.Color(L.wrap).multiplyScalar(0.7).getStyle()), g, [0, -len / 2 + (len / 4) * (i + 1), 0]);
  mk(new THREE.SphereGeometry(r * 1.5, 6, 4), trimM, g, [0, -len / 2 - r, 0]);
  if (L.gem) mk(new THREE.OctahedronGeometry(r * 0.8), glowM(L.gem, 1.4), g, [0, -len / 2 - r * 2.2, 0]);
}

function addFangs(g, L, y0, y1, x, n) {
  const fm = toonM('#f4ecd8');
  for (let i = 0; i < Math.min(n * 2, 5); i++) {
    const y = y0 + ((i + 0.5) / Math.min(n * 2, 5)) * (y1 - y0);
    mk(new THREE.ConeGeometry(0.014, 0.05, 4), fm, g, [x, y, 0], [0, 0, x > 0 ? -1.9 : 1.9]);
  }
}

function addRunes(g, L, y0, y1, w = 0.012) {
  if (!L.glow) return;
  const gm = glowM(L.glow, 2.4);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const y = y0 + ((i + 0.5) / n) * (y1 - y0);
    for (const z of [-1, 1]) {
      const r = mk(new THREE.BoxGeometry(w, (y1 - y0) / n * 0.6, 0.004), i % 2 && L.glow2 ? glowM(L.glow2, 2.4) : gm, g, [0, y, z * 0.016]);
      r.castShadow = false;
    }
  }
}

const BUILD = {
  sword(g, L, s = 1) {
    const bm = bladeMaterial(L); g.userData.bladeMats.push(bm);
    addGrip(g, L, 0.18 * s);
    const guard = mk(new THREE.BoxGeometry(0.24 * s, 0.035, 0.06), toonM(L.trim), g, [0, 0.105 * s, 0]);
    for (const sx of [-1, 1]) mk(new THREE.SphereGeometry(0.024, 6, 4), toonM(L.trim), guard, [sx * 0.12 * s, 0.012, 0]);
    if (L.gem) mk(new THREE.OctahedronGeometry(0.026), glowM(L.gem, 1.6), g, [0, 0.105 * s, 0.035]);
    const len = 0.68 * s, w = 0.048 * s;
    const blade = mk(extrude([[-w, 0], [w, 0], [w * 0.85, len * 0.86], [0, len], [-w * 0.85, len * 0.86]], 0.022), bm, g, [0, 0.12 * s, 0]);
    blade.userData.breakable = true; blade.userData.len = len;
    mk(new THREE.BoxGeometry(w * 0.35, len * 0.7, 0.026), toonM(L.bladeDark), g, [0, 0.12 * s + len * 0.38, 0]); // fuller
    addRunes(g, L, 0.12 * s + len * 0.1, 0.12 * s + len * 0.75);
    if (L.fangs) addFangs(g, L, 0.12 * s + len * 0.2, 0.12 * s + len * 0.7, -w * 0.95, L.fangs);
    g.userData.tip = 0.12 * s + len;
  },
  dagger(g, L) {
    const bm = bladeMaterial(L); g.userData.bladeMats.push(bm);
    addGrip(g, L, 0.11, 0.018);
    mk(new THREE.BoxGeometry(0.12, 0.025, 0.045), toonM(L.trim), g, [0, 0.065, 0]);
    if (L.gem) mk(new THREE.OctahedronGeometry(0.02), glowM(L.gem, 1.6), g, [0, 0.065, 0.026]);
    const len = 0.3, w = 0.036;
    const blade = mk(extrude([[-w, 0], [w * 0.8, 0], [w * 0.4, len * 0.7], [-w * 0.1, len], [-w, len * 0.55]], 0.016, 0.005), bm, g, [0, 0.075, 0]);
    blade.userData.breakable = true;
    addRunes(g, L, 0.1, 0.075 + len * 0.6, 0.01);
    if (L.fangs) addFangs(g, L, 0.12, 0.3, w * 0.8, 1);
    g.userData.tip = 0.075 + len;
  },
  axe(g, L) {
    const bm = bladeMaterial(L); g.userData.bladeMats.push(bm);
    const haftM = toonM(L.bladeKind === 'bone' ? '#efe6d0' : '#7a4a2a');
    mk(new THREE.CylinderGeometry(0.022, 0.026, 0.92, 6), haftM, g, [0, 0.2, 0]);
    mk(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 6), toonM(L.wrap), g, [0, 0.0, 0]);
    mk(new THREE.SphereGeometry(0.03, 6, 4), toonM(L.trim), g, [0, -0.27, 0]);
    const head = mk(extrude([[0, -0.07], [0.09, -0.08], [0.22, -0.17], [0.26, 0], [0.22, 0.17], [0.09, 0.08], [0, 0.07]], 0.03, 0.008), bm, g, [0.01, 0.56, 0]);
    head.userData.breakable = true;
    mk(new THREE.BoxGeometry(0.07, 0.17, 0.05), toonM(L.trim), g, [0, 0.56, 0]);
    mk(new THREE.ConeGeometry(0.035, 0.12, 5), toonM(L.bladeDark), g, [-0.08, 0.56, 0], [0, 0, Math.PI / 2]);
    if (L.gem) mk(new THREE.OctahedronGeometry(0.025), glowM(L.gem, 1.6), g, [0, 0.56, 0.03]);
    if (L.glow) { const e = mk(extrude([[0.23, -0.13], [0.262, 0], [0.23, 0.13], [0.215, 0.12], [0.24, 0], [0.215, -0.12]], 0.034, 0), glowM(L.glow, 2.4), g, [0.01, 0.56, 0]); e.castShadow = false; }
    if (L.fangs) addFangs(g, L, 0.5, 0.62, -0.1, 1);
    g.userData.tip = 0.66;
  },
  hammer(g, L) {
    const bm = bladeMaterial(L); g.userData.bladeMats.push(bm);
    mk(new THREE.CylinderGeometry(0.024, 0.028, 0.86, 6), toonM('#6a4226'), g, [0, 0.16, 0]);
    mk(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6), toonM(L.wrap), g, [0, -0.02, 0]);
    const head = mk(new THREE.BoxGeometry(0.32, 0.16, 0.16), bm, g, [0, 0.6, 0]);
    head.userData.breakable = true;
    for (const sx of [-1, 1]) mk(new THREE.BoxGeometry(0.04, 0.18, 0.18), toonM(L.trim), g, [sx * 0.15, 0.6, 0]);
    if (L.core) mk(new THREE.IcosahedronGeometry(0.05, 0), glowM('#ffb84a', 2.2), g, [0, 0.6, 0.08]);
    else if (L.gem) mk(new THREE.OctahedronGeometry(0.035), glowM(L.gem, 1.6), g, [0, 0.6, 0.085]);
    if (L.glow) for (const sx of [-1, 1]) { const e = mk(new THREE.BoxGeometry(0.012, 0.19, 0.19), glowM(L.glow, 2.4), g, [sx * 0.175, 0.6, 0]); e.castShadow = false; }
    if (L.fangs) for (let i = 0; i < 3; i++) mk(new THREE.ConeGeometry(0.02, 0.06, 4), toonM('#f4ecd8'), g, [-0.09 + i * 0.09, 0.69, 0]);
    g.userData.tip = 0.68;
  },
  spear(g, L) {
    const bm = bladeMaterial(L); g.userData.bladeMats.push(bm);
    mk(new THREE.CylinderGeometry(0.018, 0.02, 1.25, 6), toonM('#8a5a33'), g, [0, 0.22, 0]);
    mk(new THREE.CylinderGeometry(0.023, 0.023, 0.16, 6), toonM(L.wrap), g, [0, 0, 0]);
    mk(new THREE.CylinderGeometry(0.03, 0.026, 0.06, 6), toonM(L.trim), g, [0, 0.86, 0]);
    const tip = mk(extrude([[-0.045, 0], [0, -0.02], [0.045, 0], [0.03, 0.15], [0, 0.26], [-0.03, 0.15]], 0.02), bm, g, [0, 0.89, 0]);
    tip.userData.breakable = true;
    addRunes(g, L, 0.92, 1.08, 0.01);
    if (L.gem) mk(new THREE.OctahedronGeometry(0.022), glowM(L.gem, 1.6), g, [0, 0.86, 0.03]);
    const tas = toonM(L.glow || '#c8402a');
    for (const sx of [-1, 1]) mk(new THREE.BoxGeometry(0.015, 0.1, 0.015), tas, g, [sx * 0.03, 0.8, 0], [0, 0, sx * 0.2]);
    g.userData.tip = 1.15;
  },
  staff(g, L) {
    const wood = toonM(L.bladeKind === 'bone' ? '#efe6d0' : '#6a4226');
    let y = -0.42;
    const segs = [[0.024, 0.28, 0.06], [0.022, 0.3, -0.08], [0.024, 0.28, 0.05], [0.026, 0.22, 0]];
    const shaft = new THREE.Group(); g.add(shaft);
    let x = 0;
    for (const [r, h, lean] of segs) {
      mk(new THREE.CylinderGeometry(r * 0.9, r, h, 5), wood, shaft, [x + lean * h * 0.5, y + h / 2, 0], [0, 0, -lean]);
      x += lean * h; y += h;
    }
    mk(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), toonM(L.wrap), g, [0, 0, 0]);
    const orbC = L.glow || L.gem || L.blade;
    const orb = mk(new THREE.IcosahedronGeometry(0.065, 0), glowM(orbC, 2.0), g, [x, y + 0.08, 0]);
    orb.userData.breakable = true; orb.castShadow = false;
    const bm = bladeMaterial(L); g.userData.bladeMats.push(bm);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      mk(new THREE.ConeGeometry(0.014, 0.16, 4), bm, g, [x + Math.cos(a) * 0.06, y + 0.06, Math.sin(a) * 0.06], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]);
    }
    mk(new THREE.CylinderGeometry(0.035, 0.028, 0.04, 6), toonM(L.trim), g, [x, y, 0]);
    g.userData.tip = y + 0.15;
    g.userData.orb = orb;
  },
  pickaxe(g, L) {
    const bm = bladeMaterial(L); g.userData.bladeMats.push(bm);
    mk(new THREE.CylinderGeometry(0.022, 0.026, 0.7, 6), toonM('#7a4a2a'), g, [0, 0.12, 0]);
    mk(new THREE.CylinderGeometry(0.027, 0.027, 0.14, 6), toonM(L.wrap), g, [0, -0.04, 0]);
    for (const sx of [-1, 1]) {
      const p = mk(new THREE.CylinderGeometry(0.012, 0.035, 0.26, 5), bm, g, [sx * 0.13, 0.43, 0], [0, 0, sx * 1.85]);
      p.userData.breakable = true;
    }
    mk(new THREE.BoxGeometry(0.07, 0.07, 0.06), toonM(L.trim), g, [0, 0.47, 0]);
    if (L.gem) mk(new THREE.OctahedronGeometry(0.022), glowM(L.gem, 1.6), g, [0, 0.47, 0.035]);
    if (L.glow) for (const sx of [-1, 1]) { const e = mk(new THREE.ConeGeometry(0.014, 0.05, 4), glowM(L.glow, 2.4), g, [sx * 0.245, 0.39, 0], [0, 0, sx * 2.3]); e.castShadow = false; }
    g.userData.tip = 0.5;
  },
};

/**
 * Build a weapon. w = { bp, ids, el?, grade?, recipe? }. Grip at origin, blade along +Y.
 * Returns THREE.Group (userData: look, tip, bladeMats).
 */
export function buildWeaponMesh(w = {}) {
  const g = new THREE.Group();
  g.name = 'weapon_' + (w.bp || 'sword');
  const L = weaponLook(w);
  g.userData.look = L;
  g.userData.bladeMats = [];
  (BUILD[w.bp] || BUILD.sword)(g, L);
  if (L.masterwork) {
    const halo = mk(new THREE.OctahedronGeometry(0.02), glowM('#ffe08a', 2.5), g, [0, (g.userData.tip || 0.6) * 0.98, 0.02]);
    halo.castShadow = false;
    g.userData.sparkle = halo;
  }
  if (L.star) {
    const sm = glowM('#ffe08a', 2.4);
    for (let i = 0; i < 5; i++) { const s = mk(new THREE.BoxGeometry(0.008, 0.008, 0.03), sm, g, [((i * 37) % 7 - 3) * 0.008, 0.2 + i * 0.09, 0]); s.castShadow = false; }
  }
  return g;
}

// ------------------------------------------------------------------ the curse: cracks & shatter
function rngFrom(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0) / 4294967296; }

/** Spread glowing purple cracks over the weapon (amount 0..1). Idempotent; call every frame if you like. */
export function crackWeapon(group, amount = 0.5) {
  const ud = group.userData;
  if (!ud.cracks) {
    const r = rngFrom(group.id * 7919 + 13);
    const tip = ud.tip || 0.6;
    const breakables = [];
    group.traverse((o) => { if (o.isMesh && o.userData.breakable) breakables.push(o); });
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color('#d070ff').multiplyScalar(2.6), transparent: true, depthWrite: false, fog: false });
    ud.cracks = [];
    for (let i = 0; i < 12; i++) {
      const host = breakables[i % Math.max(1, breakables.length)];
      const box = new THREE.Box3();
      if (host) { host.geometry.computeBoundingBox(); box.copy(host.geometry.boundingBox); }
      else box.set(new THREE.Vector3(-0.03, 0.1, -0.01), new THREE.Vector3(0.03, tip, 0.01));
      const pts = [];
      let x = box.min.x + r() * (box.max.x - box.min.x), y = box.min.y + r() * (box.max.y - box.min.y);
      const z = (r() < 0.5 ? box.max.z : box.min.z) + (r() < 0.5 ? 0.004 : -0.004);
      const steps = 3 + Math.floor(r() * 4);
      for (let k = 0; k < steps; k++) {
        const nx = x + (r() - 0.5) * 0.06, ny = y + (r() - 0.35) * 0.08;
        pts.push(new THREE.Vector3(x, y, z), new THREE.Vector3(nx, ny, z));
        x = Math.max(box.min.x, Math.min(box.max.x, nx)); y = Math.max(box.min.y, Math.min(box.max.y, ny));
      }
      const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
      line.layers.set(LAYER_FX);
      if (host) { host.add(line); } else group.add(line);
      line.visible = false;
      ud.cracks.push(line);
    }
  }
  const n = Math.round(Math.max(0, Math.min(1, amount)) * ud.cracks.length);
  ud.cracks.forEach((l, i) => { l.visible = i < n; });
  for (const m of ud.bladeMats || []) {
    if (!m.userData.baseColor) m.userData.baseColor = m.color.clone();
    m.color.copy(m.userData.baseColor).lerp(new THREE.Color('#6a3a8a'), amount * 0.35);
    m.emissive.setRGB(0.5 * amount * amount, 0.15 * amount * amount, 0.7 * amount * amount);
  }
}

/**
 * Break the weapon into shards in world space. Hides the original group.
 * If `parent` is given the shards are added to it (assumed to be in world space, e.g. the scene).
 * Returns [{ mesh, velocity: Vector3, spin: Vector3, life }].
 */
export function shatterPieces(group, parent = null, opts = {}) {
  group.updateMatrixWorld(true);
  const r = rngFrom(group.id * 31 + 7);
  const pieces = [];
  const center = new THREE.Vector3();
  new THREE.Box3().setFromObject(group).getCenter(center);
  const curseM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c86bff').multiplyScalar(2.4), fog: false });
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const size = new THREE.Vector3(); bb.getSize(size);
    const vol = Math.max(size.x * size.y, size.y * size.z, size.x * size.z);
    const n = o.userData.breakable ? 7 + Math.floor(r() * 4) : Math.max(1, Math.min(3, Math.round(vol * 120)));
    for (let i = 0; i < n; i++) {
      const s = (o.userData.breakable ? 0.025 : 0.018) + r() * 0.03;
      const geo = r() < 0.5 ? new THREE.TetrahedronGeometry(s, 0) : new THREE.BoxGeometry(s * 1.3, s * 0.5, s * 0.25);
      const mat = r() < 0.18 ? curseM : o.material;
      const mesh = new THREE.Mesh(geo, mat);
      const lp = new THREE.Vector3(bb.min.x + r() * size.x, bb.min.y + r() * size.y, bb.min.z + r() * size.z);
      mesh.position.copy(lp.applyMatrix4(o.matrixWorld));
      mesh.quaternion.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
      mesh.castShadow = true;
      const dir = mesh.position.clone().sub(center);
      if (dir.lengthSq() < 1e-6) dir.set(r() - 0.5, r(), r() - 0.5);
      dir.normalize();
      const sp = (opts.force ?? 2.2) * (0.5 + r());
      const vel = dir.multiplyScalar(sp).add(new THREE.Vector3((r() - 0.5) * 1.2, 1.2 + r() * 1.8, (r() - 0.5) * 1.2));
      pieces.push({ mesh, velocity: vel, spin: new THREE.Vector3((r() - 0.5) * 18, (r() - 0.5) * 18, (r() - 0.5) * 18), life: 1.4 + r() * 0.8 });
      if (parent) parent.add(mesh);
    }
  });
  group.visible = false;
  return pieces;
}

/** Simple physics step for shards; returns remaining pieces (removes dead ones from their parent). */
export function updateShards(pieces, dt, floorY = 0, gravity = 9.8) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i];
    p.life -= dt;
    p.velocity.y -= gravity * dt;
    p.mesh.position.addScaledVector(p.velocity, dt);
    if (p.mesh.position.y < floorY) { p.mesh.position.y = floorY; p.velocity.y *= -0.3; p.velocity.x *= 0.6; p.velocity.z *= 0.6; p.spin.multiplyScalar(0.6); }
    p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
    if (p.life < 0.3) p.mesh.scale.setScalar(Math.max(0.01, p.life / 0.3));
    if (p.life <= 0) { if (p.mesh.parent) p.mesh.parent.remove(p.mesh); p.mesh.geometry.dispose(); pieces.splice(i, 1); }
  }
  return pieces;
}
