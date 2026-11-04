// Loot on the floor: every drop is its own little voxel model (ores, gems and parts from the ore
// kit, weapons from the weapon kit) that pops out in an arc, lands with a bounce, bobs and turns in
// a soft glow (a light beam for rare finds), and is pulled into Durgan when he walks near. A full bag
// leaves it on the floor with a "Bag full" toast. Drops remember their room so they are still there
// when you come back.
import * as THREE from 'three';
import { buildOreModel } from '../../models/ore_voxel.js';
import { buildWeaponMesh } from '../../models/weapons3d.js';
import { MATERIALS, RARITY } from '../../data/materials.js';
import { makeItem } from '../../systems/items.js';
import { clamp } from '../../core/math.js';

const RAR_COL = { common: '#e8dcc0', uncommon: '#7dd89a', rare: '#7ab8ff', epic: '#d08aff', legendary: '#ffd25e' };
const tmpl = new Map();

export function rarityOf(item) {
  if (!item) return 'common';
  if (item.bp) return item.grade >= 4 ? 'legendary' : item.grade >= 3 ? 'epic' : item.grade >= 2 ? 'rare' : 'uncommon';
  const m = MATERIALS[item.id];
  return m && RARITY[m.rarity] ? m.rarity : 'common';
}
export const rarityColor = (item) => RAR_COL[rarityOf(item)] || RAR_COL.common;

function keep(o) { o.traverse((c) => { c.userData.keep = true; if (c.geometry) c.geometry.userData.shared = true; }); return o; }

/** A small 3D model of an item, about `size` metres across (cached per id, cloned per drop). */
export function itemModel(item, size = 0.36) {
  const key = item.bp ? 'w|' + JSON.stringify([item.bp, item.ids, item.grade]) : 'm|' + item.id + '|' + (item.q ?? 2);
  let t = tmpl.get(key);
  if (!t) {
    let m = null;
    try {
      const mm = MATERIALS[item.id];
      const look = mm && mm.kind === 'weapon' ? (mm.look || (mm.wpn ? { bp: mm.wpn.type, ids: ['iron'] } : null)) : null;
      if (item.bp) { m = buildWeaponMesh(item); m.rotation.z = -0.9; }
      else if (look) { m = buildWeaponMesh({ bp: look.bp, ids: look.ids || ['iron'], grade: Math.max(0, (item.q ?? 2) - 1) }); m.rotation.z = -0.9; }
      else if (mm) m = buildOreModel(item.id, { res: 16, glow: 1.6 });
    } catch (e) { m = null; }
    if (!m) {
      m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ color: rarityColor(item), emissive: new THREE.Color(rarityColor(item)).multiplyScalar(0.35) }));
    }
    const g = new THREE.Group();
    g.add(m);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const s = box.getSize(new THREE.Vector3());
    const k = size / Math.max(0.05, s.x, s.y, s.z);
    m.scale.multiplyScalar(k);
    const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
    m.position.sub(c);
    t = keep(g);
    tmpl.set(key, t);
    if (tmpl.size > 120) tmpl.delete(tmpl.keys().next().value);
  }
  return keep(t.clone());
}

function glowDisc(color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const col = new THREE.Color(color);
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  gr.addColorStop(0, `rgba(${rgb},0.85)`); gr.addColorStop(0.45, `rgba(${rgb},0.3)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const discTex = new Map();
function disc(color) { let t = discTex.get(color); if (!t) { t = glowDisc(color); discTex.set(color, t); } return t; }

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.fullT = 0;
  }
  /** Drop an item (or an id) at x,z; it pops out from `from` (default the same spot). */
  spawn(item, x, z, opts = {}) {
    if (typeof item === 'string') item = makeItem(item, 2);
    if (!item) return null;
    const root = new THREE.Group();
    const isW = item.bp || (MATERIALS[item.id] && MATERIALS[item.id].kind === 'weapon');
    const model = itemModel(item, isW ? 0.62 : 0.34);
    root.add(model);
    const col = rarityColor(item);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: disc(col), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.y = 0.02; ring.renderOrder = 2;
    root.add(ring);
    const r = rarityOf(item);
    let beam = null;
    if (r === 'rare' || r === 'epic' || r === 'legendary' || item.bp) {
      beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 2.4, 10, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      beam.position.y = 1.2; root.add(beam);
    }
    const from = opts.from || { x, z };
    root.position.set(from.x, 0.3, from.z);
    this.scene.add(root);
    const p = {
      item, root, model, ring, beam, x: from.x, z: from.z, y: 0.3,
      tx: x, tz: z, vy: opts.pop === false ? 0 : 3.2 + Math.random() * 1.2, t: 0, landed: opts.pop === false, magnet: false, spin: Math.random() * 6, delay: opts.delay || 0,
    };
    if (opts.pop === false) { p.x = x; p.z = z; p.y = 0.22; }
    this.list.push(p);
    return p;
  }
  /** Remove all models (e.g. leaving the room); returns plain records to respawn later. */
  stash() {
    const out = this.list.map((p) => ({ item: p.item, x: p.landed ? p.x : p.tx, z: p.landed ? p.z : p.tz }));
    for (const p of this.list) this.scene.remove(p.root);
    this.list = [];
    return out;
  }
  restore(records) { for (const r of records || []) this.spawn(r.item, r.x, r.z, { pop: false }); }
  /**
   * Advance; pull drops into the player and try to bag them.
   * ctx: { player {x,z}, radius, tryTake(item) → bool, onTake(item, p), onFull(item), grid (to keep drops on the floor) }
   */
  update(dt, ctx) {
    this.fullT = Math.max(0, this.fullT - dt);
    const pl = ctx.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.delay > 0) { p.delay -= dt; p.root.visible = false; continue; }
      p.root.visible = true;
      if (!p.landed) {
        const k = clamp(p.t / 0.55);
        p.x += (p.tx - p.x) * Math.min(1, dt * 6);
        p.z += (p.tz - p.z) * Math.min(1, dt * 6);
        p.vy -= 14 * dt; p.y += p.vy * dt;
        if (p.y <= 0.22 && p.vy < 0) { if (Math.abs(p.vy) > 2.2) p.vy = -p.vy * 0.35; else { p.y = 0.22; p.vy = 0; p.landed = true; } p.y = Math.max(0.22, p.y); ctx.onBounce && ctx.onBounce(p); }
        void k;
      } else if (pl && !pl.dead) {
        const dx = pl.x - p.x, dz = pl.z - p.z, d = Math.hypot(dx, dz);
        const R = ctx.radius || 2.0;
        if (!p.magnet && d < R && p.t > 0.35 && !p.refused) p.magnet = true;
        if (p.refused && d > R + 0.6) p.refused = false;
        if (p.magnet) {
          const sp = 3 + (R - Math.min(R, d)) * 8 + p.t * 2;
          p.x += (dx / (d || 1)) * Math.min(d, sp * dt);
          p.z += (dz / (d || 1)) * Math.min(d, sp * dt);
          p.y = 0.22 + Math.sin(clamp(1 - d / R) * Math.PI) * 0.5;
          if (d < 0.38) {
            const ok = ctx.tryTake ? ctx.tryTake(p.item) : true;
            if (ok) {
              ctx.onTake && ctx.onTake(p.item, p);
              this.scene.remove(p.root);
              this.list.splice(i, 1);
              continue;
            }
            // bag full: hop back out and wait until there is room
            p.magnet = false; p.refused = true;
            p.x -= (dx / (d || 1)) * 0.7; p.z -= (dz / (d || 1)) * 0.7;
            p.landed = false; p.vy = 2.6; p.tx = p.x; p.tz = p.z;
            if (this.fullT <= 0) { this.fullT = 2; ctx.onFull && ctx.onFull(p.item); }
          }
        } else p.y = 0.22 + Math.sin(p.t * 2.6 + p.spin) * 0.05;
      }
      p.root.position.set(p.x, p.y, p.z);
      p.model.rotation.y += dt * 1.6;
      p.ring.position.y = 0.02 - p.y + 0.02;
      p.ring.material.opacity = 0.55 + Math.sin(p.t * 4 + p.spin) * 0.2;
      if (p.beam) p.beam.material.opacity = 0.18 + Math.sin(p.t * 3) * 0.08;
    }
  }
  /** Retry drops that bounced off a full bag (call after the bag changes). */
  unrefuse() { for (const p of this.list) p.refused = false; }
  dispose() { for (const p of this.list) this.scene.remove(p.root); this.list = []; }
}
