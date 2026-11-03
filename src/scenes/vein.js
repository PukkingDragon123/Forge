// Ore vein (docs/REDESIGN.md §7): walk into the chamber, raise the pickaxe and swing three times.
// The one big QTE of the game: a bright glint sweeps along the vein; a gold spark marks the sweet
// spot; tap when they meet. Perfect / good / miss → veinLoot. Chips fly, ore chunks pop out of the
// rock and arc into the bag; rare finds get a card reveal. Pip sometimes digs out one more.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { makeFPWorld, stageToWorld } from '../gfx/fpcam.js';
import { Debris } from '../gfx/particles.js';
import { buildFPSafe, makePet, anchor, floor, walkIn, seedOf, glowSprite, grantItems, drawFlyers, revealChain, cornerHud, EYE } from './fp_kit.js';
import { finishNode, openBag, actOf, actDef } from './flow.js';
import { delveMusic } from './delve.js';
import * as PZ from '../systems/petrify.js';
import * as RunMod from '../systems/run.js';
import { MATERIALS } from '../data/materials.js';
import { makeItem } from '../systems/items.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

const SPEEDS = [2.3, 2.9, 3.5, 4.0];
const PERFECT = 0.075, GOOD = 0.19; // fractions of the vein's half-width

/** Ore for a vein when the systems module has nothing to say (placeholder safety). */
function fallbackLoot(run, act, hits) {
  const rng = run.rng, out = [];
  for (const h of hits) {
    if (h.q === 'miss') continue;
    const id = RunMod.rollMaterial ? RunMod.rollMaterial(rng, act, ['ore', 'mineral', 'gem'], 0, h.q === 'perfect' ? 3 : 2) : 'iron';
    out.push(makeItem(MATERIALS[id] ? id : 'iron', h.q === 'perfect' ? 3 : 2));
  }
  return out;
}

export class VeinScene extends Scene {
  enter(params = {}) {
    const game = this.game, run = game.run;
    this.run = run;
    if (!run) { game.go('title', {}, { transition: 'none' }); return; }
    this.node = params.node || run.map.nodes[run.map.current];
    const act = actOf(run);
    this.act = act;
    this.rng = run.rng.fork ? run.rng.fork('vein' + (this.node ? this.node.id : 0)) : run.rng;
    this.stage = buildFPSafe('chamber', act, { seed: seedOf(run.seed, act, this.node && this.node.id, 'vein'), kind: 'vein' });
    this.world = makeFPWorld([this.stage], { charId: run.char });
    const fp = (this.fp = this.world.fp);
    this.debris = new Debris(240, 0.035);
    this.world.scene.add(this.debris.object);
    // the vein: a strip across the rock face
    const V = this.stage.anchors.vein || {};
    this.vc = anchor(this.stage, 'vein', new THREE.Vector3(0, 1, -5), false);
    if (this.vc.y < 0.2) this.vc.y = 1.0;
    this.vn = (V.normal ? V.normal.clone() : new THREE.Vector3(0, 0, 1)).transformDirection(this.stage.group.matrixWorld).normalize();
    this.vt = new THREE.Vector3(0, 1, 0).cross(this.vn);
    if (this.vt.lengthSq() < 1e-4) this.vt.set(1, 0, 0);
    this.vt.normalize();
    this.halfW = V.size ? Math.min(0.9, V.size[0] * 0.38) : V.width ? V.width / 2 : 0.62;
    this.veinStand = V.stand ? stageToWorld(this.stage, V.stand) : null;
    const pal = actDef(run).pal || {};
    this.oreCols = V.colors || [pal.glow || '#ffd25e', '#c8a070', '#e8e0d0'];
    this.glint = glowSprite('#ffffff', 0.26, 3);
    this.trail = [glowSprite('#fff6d8', 0.18, 1.6), glowSprite('#fff0c0', 0.12, 1.0)];
    this.sweet = glowSprite('#ffd25e', 0.34, 2.6);
    for (const s of [this.glint, ...this.trail, this.sweet]) { s.visible = false; this.world.scene.add(s); }
    this.pet = makePet(this.world.scene);
    const stand = this.veinStand ? this.veinStand.clone() : anchor(this.stage, 'stand', new THREE.Vector3(0, EYE, -3));
    if (this.pet) {
      const side = new THREE.Vector3().subVectors(this.vc, stand).setY(0).normalize();
      const right = new THREE.Vector3(-side.z, 0, side.x);
      this.pet.group.position.copy(floor(stand).addScaledVector(side, 0.7).addScaledVector(right, -0.45));
      this.pet.group.rotation.y = Math.atan2(side.x, side.z);
      this.pet.play('idle');
    }
    // state
    this.state = 'walkin';
    this.swings = run.pick && run.pick.swings ? run.pick.swings : 3;
    this.hits = [];
    this.phase = this.rng.next() * 6;
    this.x = 0;
    this.pops = [];
    this.flyers = [];
    this.fade = 1;
    this.tip = !(run.flags && run.flags.veinTip);
    if (run.flags) run.flags.veinTip = true;
    const arms = fp.arms;
    if (arms) { arms.hold && arms.hold('pickaxe'); arms.play && arms.play('walk'); }
    walkIn(fp, this.stage, this.vc, { to: this.veinStand }).then(() => {
      if (arms && arms.play) arms.play('mine');
      this.newSwing();
      this.state = 'aim';
      game.audio && game.audio.play('vein_glint', { vol: 0.7 });
    });
    delveMusic(game, run);
  }
  exit() { if (this.stage && this.stage.dispose) { try { this.stage.dispose(); } catch (e) { /* placeholder */ } } }

  at(x, out = new THREE.Vector3()) { return out.copy(this.vc).addScaledVector(this.vt, x * this.halfW).addScaledVector(this.vn, 0.05); }
  newSwing() {
    const n = this.hits.length;
    this.speed = SPEEDS[Math.min(SPEEDS.length - 1, n)];
    this.sweetX = (this.rng.next() * 2 - 1) * 0.72;
    this.sweetR = 1 - n * 0.08;
    this.sweet.visible = true; this.glint.visible = true; for (const t of this.trail) t.visible = true;
  }

  swing() {
    const game = this.game, fp = this.fp;
    if (this.state !== 'aim' || (fp.arms && fp.arms.busy)) return;
    const d = Math.abs(this.x - this.sweetX);
    const q = d < PERFECT * this.sweetR * 2.2 ? 'perfect' : d < GOOD * this.sweetR * 2.2 ? 'good' : 'miss';
    const hitAt = this.at(this.x);
    this.hits.push({ q, x: this.x });
    this.state = 'swing';
    const arms = fp.arms;
    if (arms && arms.play) arms.play('mineHit');
    const impact = arms && arms.impactTime ? arms.impactTime('mineHit') : 0.2;
    this.after(impact, () => this.impact(q, hitAt));
  }
  impact(q, p) {
    const game = this.game, fp = this.fp, W = this.world, au = game.audio;
    const ore = this.oreCols;
    if (q === 'miss') {
      au && au.play('pick_miss');
      W.dust.emit({ pos: [p.x, p.y, p.z], vel: [this.vn.x * 0.6, 0.2, this.vn.z * 0.6], spread: 0.5, count: 14, life: [0.5, 1], size: [1, 2], color: ['#8a7a6a', '#a89a88'], alpha: 0.7, gravity: -2 });
      W.sparks.emit({ pos: [p.x, p.y, p.z], radial: [0.8, 1.6], count: 6, life: [0.15, 0.3], size: 1, color: '#ffe8b0', glow: 2 });
      fp.shake(0.12);
      this.pop('Miss', '#c8b8a8');
    } else {
      const big = q === 'perfect';
      au && au.play(big ? 'pick_perfect' : 'pick_hit');
      if (big) { game.hitStop && game.hitStop(0.08); game.renderer && game.renderer.doFlash && game.renderer.doFlash(0.18, [1, 0.95, 0.75]); }
      fp.shake(big ? 0.38 : 0.2); fp.punch([0, 0, 1], big ? 0.05 : 0.025);
      W.sparks.emit({ pos: [p.x, p.y, p.z], radial: [1.2, big ? 3.2 : 2.2], count: big ? 34 : 18, life: [0.2, 0.55], size: [1, 2], color: ['#ffffff', '#fff0a8', ...ore], glow: 3, gravity: -6 });
      W.dust.emit({ pos: [p.x, p.y, p.z], vel: [this.vn.x * 0.8, 0.3, this.vn.z * 0.8], spread: 0.6, count: 10, life: [0.6, 1.2], size: [1, 3], color: ['#9a8a78', '#c0b0a0'], alpha: 0.6, gravity: -1.5 });
      this.debris.spawn({ pos: [p.x, p.y, p.z], count: big ? 18 : 10, colors: [...ore, '#6a5a4e', '#8a7a68'], speed: 1.6, up: 2.2, dir: [this.vn.x * 1.4, 0, this.vn.z * 1.4], floor: 0.02, life: 2.4 });
      this.pop(big ? 'PERFECT!' : 'Good', big ? '#ffe06a' : '#e8f0ff');
    }
    this.after(0.45, () => {
      if (this.hits.length >= this.swings) this.finishSwings();
      else { this.newSwing(); this.state = 'aim'; }
    });
  }
  pop(text, color) {
    const s = this.fp.project(this.at(this.x), 960, 540);
    this.pops.push({ text, color, x: s.x, y: s.y - 30, t: 0 });
  }

  finishSwings() {
    const game = this.game, run = this.run, fp = this.fp;
    this.state = 'loot';
    this.sweet.visible = false; this.glint.visible = false; for (const t of this.trail) t.visible = false;
    if (fp.arms && fp.arms.play) fp.arms.play('idle');
    let items = [];
    try { items = (PZ.veinLoot ? PZ.veinLoot(run, this.act, this.hits) : []) || []; } catch (e) { console.warn('veinLoot', e); }
    if (!items.length) items = fallbackLoot(run, this.act, this.hits);
    const give = (list) => {
      const from = fp.project(this.vc, 960, 540);
      const g = grantItems(run, list, from, this.flyers);
      this.overflow = this.overflow || g.overflow;
      (this.rare || (this.rare = [])).push(...g.rare);
      game.audio && game.audio.play('loot', { vol: 0.7 });
    };
    // ore chunks pop out of the rock first, then fly into the bag
    this.debris.spawn({ pos: [this.vc.x, this.vc.y, this.vc.z], count: 14, colors: this.oreCols, speed: 1.4, up: 2.6, dir: [this.vn.x, 0, this.vn.z], floor: 0.02, life: 2 });
    const earned = this.hits.filter((h) => h.q !== 'miss').length;
    const bonus = items.length > earned ? items.slice(earned) : [];
    const main = bonus.length ? items.slice(0, earned) : items;
    this.after(0.5, () => give(main));
    // anything beyond one chunk per good swing is Pip's doing: a dig at the foot of the vein
    if (bonus.length) {
      this.after(1.0, () => {
        if (this.pet) { this.pet.play('dig'); game.audio && game.audio.play('pip_dig', { vol: 0.7 }); }
        this.after(0.9, () => {
          if (this.pet) this.pet.play('happy');
          game.audio && game.audio.play('pip_yip');
          if (this.pet) this.pops.push({ text: 'Pip!', color: '#ffd8a8', x: 480, y: 330, t: 0 });
          give(bonus);
        });
      });
    }
    this.after(2.9, () => this.leave());
  }
  leave() {
    if (this.state === 'done') return;
    this.state = 'done';
    const game = this.game;
    revealChain(game, this.rare || [], () => {
      if (this.overflow) { const o = openBag(game, { title: 'Ore', onClose: () => finishNode(game) }); if (!o) finishNode(game); }
      else finishNode(game);
    });
  }

  after(t, fn) { (this.timers || (this.timers = [])).push({ t, fn }); }

  update(dt) {
    if (!this.run) return;
    const inp = this.game.input;
    if (this.timers) {
      for (const tm of this.timers) tm.t -= dt;
      const due = this.timers.filter((tm) => tm.t <= 0);
      this.timers = this.timers.filter((tm) => tm.t > 0);
      for (const tm of due) tm.fn();
    }
    this.fade = Math.max(0, this.fade - dt * 1.8);
    if (this.state === 'aim' || this.state === 'swing') {
      if (this.state === 'aim') { this.phase += dt * this.speed; this.x = Math.sin(this.phase); }
      const p = this.at(this.x);
      this.glint.position.copy(p);
      const sc = 0.22 + Math.abs(Math.cos(this.phase)) * 0.08;
      this.glint.scale.setScalar(sc);
      for (let i = 0; i < this.trail.length; i++) this.at(Math.sin(this.phase - this.speed * 0.035 * (i + 1)), this.trail[i].position);
      this.at(this.sweetX, this.sweet.position);
      this.sweet.scale.setScalar(0.3 + Math.sin(this.time * 9) * 0.05);
      if (rnd.chance(dt * 10)) {
        const s = this.sweet.position;
        this.world.sparks.emit({ pos: [s.x, s.y, s.z], radial: [0.1, 0.35], count: 1, life: [0.3, 0.6], size: 1, color: ['#ffe06a', '#fff6c8'], glow: 3 });
      }
      const free = !this.game.overlays.length && !this.game.ui.overUI();
      const tap = free && ((inp.pressed && !inp.consumed) || inp.actionPressed('strike'));
      if (tap && this.state === 'aim') this.swing();
    }
    if (this.state === 'loot' && !this.game.overlays.length && ((inp.pressed && !inp.consumed) || inp.actionPressed('confirm')) && !this.flyers.length) this.leave();
    if (this.pet && this.pet.update) this.pet.update(dt);
    this.debris.update(dt);
    this.world.update(dt);
  }

  draw(ui) {
    if (!this.run) return;
    const game = this.game, dt = ui.dt || 1 / 60;
    if (this.state === 'aim' || this.state === 'swing') {
      // the swing track drawn over the vein: an inked line, the gold sweet zone, the bright glint
      const ctx = ui.ctx;
      const A = this.fp.project(this.at(-1), ui.w, ui.h), B = this.fp.project(this.at(1), ui.w, ui.h);
      const P = (x) => ({ x: A.x + (B.x - A.x) * (x + 1) / 2, y: A.y + (B.y - A.y) * (x + 1) / 2 });
      const zone = (half, col, w) => {
        const a = P(Math.max(-1, this.sweetX - half)), b = P(Math.min(1, this.sweetX + half));
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(Math.round(a.x), Math.round(a.y)); ctx.lineTo(Math.round(b.x), Math.round(b.y)); ctx.stroke();
      };
      const d = Math.abs(this.x - this.sweetX);
      const good = GOOD * this.sweetR * 2.2, perfect = PERFECT * this.sweetR * 2.2;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#140c10'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(Math.round(A.x), Math.round(A.y)); ctx.lineTo(Math.round(B.x), Math.round(B.y)); ctx.stroke();
      ctx.strokeStyle = '#5a4a40'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(Math.round(A.x), Math.round(A.y)); ctx.lineTo(Math.round(B.x), Math.round(B.y)); ctx.stroke();
      ctx.globalAlpha = 1;
      zone(good, d < good ? '#ffe06a' : '#c8902a', 5);
      zone(perfect, '#ffffff', 5);
      const g = P(this.x);
      const pulse = d < good ? 2 : 0;
      ctx.fillStyle = '#140c10';
      ctx.beginPath(); ctx.moveTo(g.x, g.y - 10 - pulse); ctx.lineTo(g.x + 7 + pulse, g.y); ctx.lineTo(g.x, g.y + 10 + pulse); ctx.lineTo(g.x - 7 - pulse, g.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = d < perfect ? '#ffffff' : '#fff2c0';
      ctx.beginPath(); ctx.moveTo(g.x, g.y - 7 - pulse); ctx.lineTo(g.x + 4 + pulse, g.y); ctx.lineTo(g.x, g.y + 7 + pulse); ctx.lineTo(g.x - 4 - pulse, g.y); ctx.closePath(); ctx.fill();
      ctx.restore();
      // swings left: little pick icons
      const left = this.swings - this.hits.length;
      for (let i = 0; i < this.swings; i++) ui.icon('pickaxe', ui.w / 2 - this.swings * 10 + i * 20, ui.h - 30, { alpha: i < left ? 1 : 0.25 });
      if (this.tip && this.hits.length === 0) ui.text(ui.touch ? 'Tap when the glint meets the gold' : 'Click / Space when the glint meets the gold', ui.w / 2, ui.h - 50, { align: 'center', color: '#f4e6c8', outline: '#140c10' });
    }
    for (const p of this.pops) {
      p.t += dt;
      const a = clamp(1.4 - p.t, 0, 1), y = p.y - ease.outCubic(Math.min(1, p.t * 2)) * 26;
      if (a <= 0) continue;
      ui.big(p.text, p.x, y, { scale: p.text === 'PERFECT!' ? 2 : 1, top: '#ffffff', bottom: p.color, alpha: a });
    }
    this.pops = this.pops.filter((p) => p.t < 1.5);
    const h = cornerHud(ui, game);
    if (h.bag) openBag(game);
    drawFlyers(ui, this.flyers, dt);
    if (this.fade > 0) ui.rect(0, 0, ui.w, ui.h, '#07060b', this.fade);
  }
}
