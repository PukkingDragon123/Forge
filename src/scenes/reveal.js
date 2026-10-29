// Item reveal overlay: the screen sinks into darkness, the find spins as a glowing voxel model in a
// shaft of light with slow god-rays behind it, and its tarot card flips in beside it with a rarity
// fanfare. Params: { item: {id, q, uid} | weapon {bp, ids, ...}, onDone }. Tap / click to continue.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { buildOreModel } from '../models/ore_voxel.js';
import { materialCard, weaponCard, cardBack } from '../ui/cards.js';
import { weaponSprite } from '../art/sprites.js';
import { pixelTexture } from '../gfx/materials.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

const WORD = { common: 'Found!', uncommon: 'Uncommon!', rare: 'RARE!', epic: 'EPIC!', legendary: 'LEGENDARY!' };
const GEM = { common: '#e0d0b0', uncommon: '#7dd89a', rare: '#7ab8ff', epic: '#d08aff', legendary: '#ffd25e' };
const SFX = { common: 'ore_common', uncommon: 'ore_common', rare: 'ore_rare', epic: 'ore_epic', legendary: 'ore_legendary' };

function raysCanvas(col) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const [r, gg, b] = [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - S / 2, dy = y - S / 2, d = Math.hypot(dx, dy) / (S / 2);
    if (d > 1) continue;
    const a = Math.atan2(dy, dx), wedge = (Math.sin(a * 9) + 1) / 2, fine = (Math.sin(a * 23 + 1) + 1) / 2;
    const k = Math.pow(1 - d, 1.6) * (0.25 + wedge * 0.55 + fine * 0.2);
    const i = (x + y * S) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = Math.round(clamp(k) * 120);
  }
  g.putImageData(img, 0, 0);
  return c;
}
function beamCanvas() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,240,200,0.0)'); grad.addColorStop(0.35, 'rgba(255,236,190,0.55)'); grad.addColorStop(1, 'rgba(255,230,180,0.0)');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
  return c;
}

export class RevealOverlay extends Scene {
  get freezesBelow() { return true; }
  enter(p = {}) {
    this.item = p.item || { id: 'ruby', q: 2, uid: 0 };
    this.onDone = p.onDone;
    this.isWeapon = !!this.item.bp;
    const m = MATERIALS[this.item.id];
    this.rar = this.isWeapon ? (this.item.grade >= 4 ? 'legendary' : this.item.grade >= 3 ? 'epic' : this.item.grade >= 2 ? 'rare' : 'uncommon') : (m && RARITY[m.rarity] ? m.rarity : 'common');
    this.col = GEM[this.rar];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050308');
    const cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
    cam.position.set(0.55, 0.15, 5.2);
    cam.lookAt(0.55, 0.05, 0);
    this.world = { scene, camera: cam, post: { bloom: 0.6, threshold: 0.78, vignette: 0.55, outline: 0.7, edge: 0.45 } };
    // god-rays turning slowly behind the find
    const rays = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(raysCanvas(this.col)), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    rays.position.set(-0.6, 0.1, -2.2); rays.scale.setScalar(6.5);
    scene.add(rays);
    this.rays = rays;
    // a shaft of light from above
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.05, 4.6, 32, 1, true), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(beamCanvas()), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.4 }));
    beam.position.set(-0.6, 1.6, -0.3);
    scene.add(beam);
    this.beam = beam;
    scene.add(new THREE.HemisphereLight(0x8aa0c0, 0x201018, 0.6));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.05); key.position.set(-1, 3, 3); scene.add(key);
    this.halo = new THREE.PointLight(new THREE.Color(this.col), 3, 6, 1.4); this.halo.position.set(-0.6, 0.2, 1.2); scene.add(this.halo);
    // the find itself
    let model;
    if (this.isWeapon) {
      const tex = pixelTexture(weaponSprite(this.item, 128));
      model = new THREE.Group();
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
      plane.rotation.z = Math.PI / 4;
      model.add(plane);
      model.userData.spin = (dt) => { model.rotation.y += dt * 1.1; };
    } else model = buildOreModel(this.item.id, { size: 1.25, res: 30, glow: 1.15 });
    model.position.set(-0.6, 0.1, 0);
    model.scale.setScalar(0.001);
    scene.add(model);
    this.model = model;
    this.t = 0;
    this.played = false;
    this.flipPlayed = false;
    this.closing = 0;
    this.game.audio && this.game.audio.play('transition', { vol: 0.5 });
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const s = ease.outBack(clamp(t / 0.6));
    this.model.scale.setScalar(Math.max(0.001, s * (1 - this.closing)));
    this.model.userData.spin && this.model.userData.spin(dt);
    this.model.position.y = 0.1 + Math.sin(t * 2.2) * 0.06;
    this.rays.rotation.z += dt * 0.12;
    this.rays.material.opacity = clamp(t / 0.8) * (1 - this.closing);
    this.beam.material.opacity = 0.4 * clamp(t / 0.5) * (1 - this.closing) * (0.85 + Math.sin(t * 3) * 0.15);
    this.halo.intensity = 3 + Math.sin(t * 4) * 0.8;
    const au = this.game.audio;
    if (!this.played && t > 0.25) { this.played = true; au && au.play(SFX[this.rar] || 'ore_rare'); }
    if (!this.flipPlayed && t > 0.75) { this.flipPlayed = true; au && au.play('card_flip'); if (this.rar === 'legendary' || this.rar === 'epic') au && au.play('unlock', { vol: 0.6 }); }
    const inp = this.game.input;
    if (this.closing > 0) {
      this.closing = Math.min(1, this.closing + dt * 3.5);
      if (this.closing >= 1) { this.game.popOverlay(this); this.onDone && this.onDone(); }
    } else if (t > 1.0 && (inp.pressed || inp.actionPressed('confirm') || inp.actionPressed('back'))) { inp.consume(); this.closing = 0.01; }
  }

  draw(ui) {
    const t = this.t, k = 1 - this.closing;
    // the reveal takes the whole screen: wipe whatever the scene drew underneath this frame
    ui.ctx.clearRect(0, 0, ui.w, ui.h);
    ui.tip = null;
    ui.block(4);
    ui.hit('reveal-block', 0, 0, ui.w, ui.h, { cursor: false, sound: false });
    const cx = Math.round(ui.w * 0.36), cy = Math.round(ui.h * 0.48);
    // sparkles drifting up out of the light, a burst when it lands
    if (Math.random() < 0.6 * k) ui.burst(cx + rnd.float(-90, 90), cy + rnd.float(-40, 90), 1, { colors: [this.col, '#ffffff', '#fff2c0'], speed: 14, gravity: -26, life: 1.8, kind: rnd.chance(0.3) ? 'star' : 'px', drag: 0.4 });
    if (t > 0.25 && t - ui.dt <= 0.25) ui.burst(cx, cy, 46, { colors: [this.col, '#ffffff', '#fff2c0'], speed: 190, gravity: 60, kind: 'star', life: 1.2 });
    // the card flips in on the right
    const card = this.isWeapon ? weaponCard(this.item) : materialCard(this.item);
    const back = cardBack(this.isWeapon ? 'forge' : MATERIALS[this.item.id] && MATERIALS[this.item.id].kind === 'part' ? 'part' : 'ore');
    const ft = clamp((t - 0.45) / 0.5);
    if (ft > 0) {
      const scale = 2;
      const fx = Math.round(ui.w * 0.7), fy = Math.round(cy - (card.height * scale) / 2 + (1 - ease.outCubic(clamp(ft * 2))) * 60);
      const flip = Math.cos(ft * Math.PI); // 1 → -1
      const face = flip < 0 ? card : back;
      const sw = Math.max(1, Math.round(Math.abs(flip) * face.width * scale));
      const fh = face.height * scale;
      ui.ctx.globalAlpha = clamp(ft * 3) * k;
      if (flip < 0) { ui.ctx.save(); ui.ctx.globalCompositeOperation = 'lighter'; ui.ctx.globalAlpha = 0.25 * k; ui.ctx.fillStyle = this.col; ui.ctx.fillRect(fx - sw / 2 - 6, fy - 6, sw + 12, fh + 12); ui.ctx.restore(); ui.ctx.globalAlpha = clamp(ft * 3) * k; }
      ui.ctx.drawImage(face, Math.round(fx - sw / 2), fy, sw, fh);
      ui.ctx.globalAlpha = 1;
    }
    // fanfare
    if (t > 0.7) {
      const pop = ease.outBack(clamp((t - 0.7) / 0.3));
      ui.ctx.globalAlpha = k;
      const name = this.isWeapon ? this.item.name || 'A new weapon' : (MATERIALS[this.item.id] || {}).name || this.item.id;
      ui.big(this.isWeapon ? 'FORGED!' : WORD[this.rar], cx, 70, { scale: 3, top: '#ffffff', bottom: this.col, pop: Math.round(pop * 4) / 4 });
      ui.big(name, cx, ui.h - 104, { scale: 2, top: '#ffffff', bottom: this.col });
      if (t > 1.2) ui.text('{dim}tap to continue{/}', cx, ui.h - 80, { align: 'center', font: 'small' });
      ui.ctx.globalAlpha = 1;
    }
    ui.unblock();
  }
}
