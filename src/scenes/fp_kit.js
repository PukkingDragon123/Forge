// Shared bits for the first-person encounter scenes (delve, vein, event, treasure): safe stage
// building, Pip, walking into a chamber, glow sprites, loot that flies into the bag, and the
// wooden choice tags.
import * as THREE from 'three';
import * as FPW from '../models/fp_world.js';
import * as PetM from '../models/pet.js';
import { stageToWorld, yawPitchTo } from '../gfx/fpcam.js';
import { materialSprite } from '../art/sprites.js';
import { tagCanvas } from '../art/handpaint.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { makeItem } from '../systems/items.js';
import { clamp, ease } from '../core/math.js';

export const EYE = 0.95;

/** Build a first-person stage (null if the builder throws). */
export function buildFPSafe(kind, act, opts) {
  try { return FPW.buildFP(kind, act, opts); } catch (e) { console.warn('buildFP', kind, e); return null; }
}
/** Pip, added to the scene (null if the model is missing). */
export function makePet(scene) {
  try { const p = PetM.buildPet(); scene.add(p.group); return p; } catch (e) { return null; }
}
/** An anchor at eye height (anchors may be authored at floor level). */
export const eye = (v) => (v ? (v.y < 0.45 ? v.clone().setY(v.y + EYE) : v.clone()) : null);
/** A floor point under an anchor. */
export const floor = (v, y0 = 0) => (v ? v.clone().setY(v.y >= 0.45 ? v.y - EYE : v.y) : new THREE.Vector3(0, y0, 0));
/** Seeded integer for stage builders. */
export const seedOf = (...parts) => {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
};
/** Anchor of a chamber in world space (eye height if `atEye`). */
export function anchor(stage, name, fallback, atEye = true) {
  const v = stage && stage.anchors && stage.anchors[name];
  const p = v && v.isVector3 ? stageToWorld(stage, v) : v && v.pos ? stageToWorld(stage, v.pos) : fallback ? fallback.clone() : null;
  return atEye ? eye(p) : p;
}

/** A stage's local curve (or point list) in world space. */
export function worldCurve(stage, curve) {
  stage.group.updateMatrixWorld(true);
  const pts = curve.getSpacedPoints ? curve.getSpacedPoints(Math.max(4, Math.round(curve.getLength() / 0.5))) : curve;
  return new THREE.CatmullRomCurve3(pts.map((p) => stage.group.localToWorld(p.clone())));
}

/**
 * Walk into a chamber along its own path (entrance → where you stand), eyes drifting to `look`.
 * opts.to: a further point to walk on to (e.g. the spot in front of an ore vein). Resolves on arrival.
 */
export function walkIn(fp, stage, look, opts = {}) {
  const A = stage.anchors || {};
  let curve;
  if (A.path && A.path.getPointAt) curve = worldCurve(stage, A.path);
  else {
    const enter = anchor(stage, 'enter', new THREE.Vector3(0, EYE, 0)), stand = anchor(stage, 'stand', new THREE.Vector3(0, EYE, -3));
    curve = new THREE.CatmullRomCurve3([enter, enter.clone().lerp(stand, 0.5), stand]);
  }
  if (opts.to) {
    const pts = curve.getSpacedPoints(Math.max(4, Math.round(curve.getLength() / 0.5)));
    const last = pts[pts.length - 1], to = eye(opts.to);
    pts.push(last.clone().lerp(to, 0.5), to);
    curve = new THREE.CatmullRomCurve3(pts);
  }
  const p0 = curve.getPointAt(0), p1 = curve.getPointAt(0.05);
  fp.place(p0, yawPitchTo(p0, p1).yaw, 0);
  const dur = opts.dur ?? Math.max(1.4, curve.getLength() / 1.5);
  return fp.moveAlong(curve, dur, { ease: 'walk', look: look || 'tangent', lookWeight: 0.3 }).then(() => { if (look) fp.lookTo(look, 0.7); return true; });
}

// ------------------------------------------------------------------ glow sprites
const glowTex = new Map();
/** Additive soft dot (size in metres). */
export function glowSprite(color = '#ffffff', size = 0.2, k = 2) {
  let tex = glowTex.get('g');
  if (!tex) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d');
    for (let y = 0; y < 32; y++) for (let i = 0; i < 32; i++) {
      const d = Math.hypot(i + 0.5 - 16, y + 0.5 - 16) / 16;
      const a = Math.max(0, 1 - d) ** 2.2;
      x.fillStyle = `rgba(255,255,255,${a})`; x.fillRect(i, y, 1, 1);
    }
    tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    glowTex.set('g', tex);
  }
  const col = new THREE.Color(color).multiplyScalar(k);
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.scale.setScalar(size);
  m.layers.set(1); // FX layer: no edge outline
  return m;
}

// ------------------------------------------------------------------ loot
/**
 * Put items in the bag and show them flying from a screen point to the bag icon.
 * Returns { flyers, overflow (bool), rare: [items that deserve a reveal] }.
 */
export function grantItems(run, items, from, flyers = []) {
  const rare = [];
  let overflow = false;
  items.forEach((it, i) => {
    if (!it) return;
    if (typeof it === 'string') it = makeItem(it, 2);
    const placed = run.addItem ? run.addItem(it) : run.bag.add(it);
    if (!placed) overflow = true;
    const m = MATERIALS[it.id];
    if (m && RARITY[m.rarity] && RARITY[m.rarity].order >= 2) rare.push(it);
    flyers.push({ item: it, x0: from.x + (i - (items.length - 1) / 2) * 18, y0: from.y, t: -i * 0.12, dur: 0.9 });
  });
  if (run.bag && run.bag.overflow && run.bag.overflow.length) overflow = true;
  return { flyers, overflow, rare };
}
/** Draw (and advance) loot flyers arcing into the bag icon at the bottom left. */
export function drawFlyers(ui, flyers, dt) {
  for (const f of flyers) {
    f.t += dt;
    if (f.t < 0) continue;
    const k = ease.inOutCubic(Math.min(1, f.t / f.dur));
    const x = f.x0 + (22 - f.x0) * k, y = f.y0 + (ui.h - 20 - f.y0) * k - Math.sin(k * Math.PI) * 90;
    const s = k < 0.15 ? 1 + (0.15 - k) * 3 : 1 - k * 0.35;
    const spr = materialSprite(f.item.id, 32);
    if (spr) ui.ctx.drawImage(spr, Math.round(x - 16 * s), Math.round(y - 16 * s), Math.round(32 * s), Math.round(32 * s));
  }
  for (let i = flyers.length - 1; i >= 0; i--) if (flyers[i].t > flyers[i].dur) flyers.splice(i, 1);
}
/** Show reveals for rare finds one after another, then call done. */
export function revealChain(game, items, done) {
  const list = items.slice();
  const next = () => {
    const it = list.shift();
    if (!it || !game.scenes.reveal) { done && done(); return; }
    game.pushOverlay('reveal', { item: it, onDone: next });
  };
  next();
}

// ------------------------------------------------------------------ wooden tags (choices, signs)
/** Paper/wood tag on twine; clickable when `id` is given. opts: { icon, dim, color, scale, align, alpha, sub, subColor }.
 *  Returns { hover, clicked, w, h, x, y } (screen size, after scaling). */
export function woodTag(ui, id, x, y, text, opts = {}) {
  const sc = opts.scale || 1;
  const subW = (opts.sub ? ui.measure(opts.sub) + 8 : 0) + (opts.badge ? 16 : 0);
  const w = ui.measure(text) + 18 + (opts.icon ? 14 : 0) + subW;
  const c = tagCanvas(w);
  const W = c.width * sc, H = c.height * sc;
  const bx = Math.round(clamp(opts.align === 'left' ? x : x - W / 2, 4, ui.w - W - 4)), by = Math.round(y);
  const h = id ? ui.hit(id, bx, by, W, H, { sound: false }) : { hover: false, clicked: false };
  const lift = h.hover && !opts.dim ? 2 : 0;
  const ctx = ui.ctx;
  ctx.save();
  ctx.translate(bx, by - lift);
  if (sc !== 1) ctx.scale(sc, sc);
  ctx.globalAlpha *= opts.dim ? 0.55 : opts.alpha ?? 1;
  ctx.drawImage(c, 0, 0);
  if (opts.icon) ui.icon(opts.icon, 9, 10, { alpha: opts.dim ? 0.6 : 1 });
  const tx = 11 + (opts.icon ? 13 : 0);
  ui.text(text, tx, 11, { color: opts.dim ? '#6a5a4a' : opts.color || '#3a2214' });
  if (opts.sub) ui.text(opts.sub, tx + ui.measure(text) + 8, 11, { color: opts.subColor || '#8a3a22' });
  if (opts.badge) ui.icon(opts.badge, tx + ui.measure(text) + (opts.sub ? ui.measure(opts.sub) + 14 : 6), 10, { alpha: 0.9 });
  ctx.restore();
  return { ...h, w: W, h: H, x: bx, y: by };
}

/** The minimal corner HUD for first-person rooms: a heart and the bag. Returns { bag } if the bag was opened. */
export function cornerHud(ui, game) {
  const run = game.run;
  if (!run) return {};
  const low = run.hp < run.maxHp * 0.3;
  ui.icon('heart', 10, 10, low && Math.sin(performance.now() / 140) > 0.4 ? { alpha: 0.6 } : {});
  ui.text(`${run.hp}/${run.maxHp}`, 26, 11, { color: low ? '#ff7a6a' : '#ffd8c8', outline: '#140c10' });
  const b = ui.hit('fp-bag', 6, ui.h - 34, 30, 30, { sound: false });
  ui.icon('bag', 8, ui.h - 32 - (b.hover ? 2 : 0), { scale: 2 });
  return { bag: b.clicked || game.input.actionPressed('bag') };
}
