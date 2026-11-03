// Treasure (docs/REDESIGN.md §7): an old chest waits in the chamber. Walk up, tap it: the lid
// creaks open on warm light and the loot arcs into the bag. One chest in five is not a chest —
// it rattles, and something lunges out (a fight, as an ambush).
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { makeFPWorld } from '../gfx/fpcam.js';
import * as Props from '../models/props.js';
import { buildFPSafe, makePet, anchor, floor, walkIn, seedOf, glowSprite, grantItems, drawFlyers, revealChain, woodTag, cornerHud, EYE } from './fp_kit.js';
import { finishNode, openBag, actOf, monsterFor } from './flow.js';
import { delveMusic } from './delve.js';
import * as RunMod from '../systems/run.js';
import * as MON from '../data/monsters.js';
import { MATERIALS } from '../data/materials.js';
import { makeItem } from '../systems/items.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

const KIND_BY_ACT = [['wood', 'wood', 'iron'], ['crystal', 'iron', 'wood'], ['iron', 'gold', 'wood'], ['bone', 'gold', 'iron']];

export class TreasureScene extends Scene {
  enter(params = {}) {
    const game = this.game, run = game.run;
    this.run = run;
    if (!run) { game.go('title', {}, { transition: 'none' }); return; }
    const act = actOf(run);
    this.act = act;
    this.node = params.node || run.map.nodes[run.map.current];
    this.rng = run.rng.fork ? run.rng.fork('chest' + (this.node ? this.node.id : 0)) : run.rng;
    this.kind = this.rng.chance(0.1) ? 'gold' : this.rng.pick(KIND_BY_ACT[Math.min(3, act)]);
    this.ambush = !params.noAmbush && this.rng.chance(0.2);
    this.stage = buildFPSafe('chamber', act, { seed: seedOf(run.seed, act, this.node && this.node.id, 'chest'), kind: 'treasure' });
    this.world = makeFPWorld([this.stage], { charId: run.char });
    const fp = (this.fp = this.world.fp);
    if (fp.arms) fp.arms.hold && fp.arms.hold('torch');
    const stand = anchor(this.stage, 'stand', new THREE.Vector3(0, EYE, -3));
    this.at = floor(anchor(this.stage, 'chest', new THREE.Vector3(0, 0, -5), false));
    const toward = new THREE.Vector3().subVectors(stand, this.at).setY(0).normalize();
    // the chest stands a little closer than the room's mark, so it fills the view when you reach it
    this.chest = null;
    try { this.chest = Props.buildProp('chest', { kind: this.kind }); } catch (e) { this.chest = new THREE.Group(); }
    this.chest.position.copy(this.at);
    this.chest.rotation.y = Math.atan2(toward.x, toward.z);
    this.world.scene.add(this.chest);
    this.focusAt = this.at.clone().add(new THREE.Vector3(0, 0.3, 0));
    this.halo = glowSprite('#ffd890', 0.9, 0.6);
    this.halo.position.copy(this.focusAt);
    this.world.scene.add(this.halo);
    this.pet = makePet(this.world.scene);
    if (this.pet) {
      const right = new THREE.Vector3(toward.z, 0, -toward.x);
      this.pet.group.position.copy(this.at).setY(0).addScaledVector(toward, 1.1).addScaledVector(right, -0.45);
      this.pet.group.rotation.y = Math.atan2(-toward.x, -toward.z);
      this.pet.play(this.ambush ? 'sniff' : 'idle');
    }
    this.state = 'walkin';
    this.open = 0; this.shakeT = 0; this.t = 0;
    this.flyers = []; this.rare = [];
    this.fade = 1;
    const near = this.at.clone().addScaledVector(toward, 1.75).setY(EYE + Math.max(0, this.at.y - 0.05));
    walkIn(fp, this.stage, this.focusAt, { to: near }).then(() => { this.state = 'closed'; fp.setFov(56, 1.5); });
    delveMusic(game, run);
  }
  exit() { if (this.stage && this.stage.dispose) { try { this.stage.dispose(); } catch (e) { /* placeholder */ } } }
  after(t, fn) { (this.timers || (this.timers = [])).push({ t, fn }); }

  tryOpen() {
    if (this.state !== 'closed') return;
    const game = this.game, au = game.audio, fp = this.fp;
    if (this.ambush) {
      // it rattles… it is not a chest
      this.state = 'ambush';
      au && au.play('chest_creak', { pitch: 0.7 });
      this.shakeT = 0.9;
      if (this.pet) this.pet.play('bark');
      this.after(0.7, () => {
        au && au.play('hiss', { vol: 1 }); au && au.play('snake_rattle');
        fp.shake(0.8); fp.punch([0, 0, 1], 0.1);
        game.renderer && game.renderer.doFlash && game.renderer.doFlash(0.3, [1, 0.3, 0.25]);
        const id = MON.MONSTERS && MON.MONSTERS.mimic && this.rng.chance(0.5) ? 'mimic' : monsterFor(this.run, 'monster');
        this.after(0.5, () => game.go('combat', { node: this.node, monster: id, ambush: true }, { transition: 'none' }));
      });
      return;
    }
    this.state = 'opening';
    au && au.play('chest_creak');
    this.after(0.45, () => this.loot());
  }
  loot() {
    const run = this.run, game = this.game, fp = this.fp;
    let items = [];
    try { if (RunMod.chestLoot) { const r = RunMod.chestLoot(run, this.kind); items = (r && (r.items || r)) || []; } } catch (e) { console.warn('chestLoot', e); }
    if (!items.length) items = [makeItem(RunMod.rollMaterial ? RunMod.rollMaterial(run.rng, this.act, ['gem', 'ore'], 1, 3) : 'ruby', 3)].filter((it) => MATERIALS[it.id]);
    const W = this.world, p = this.focusAt;
    W.sparks.emit({ pos: [p.x, p.y + 0.1, p.z], vel: [0, 1.4, 0], spread: 0.6, count: 40, life: [0.6, 1.4], size: [1, 2], color: ['#ffd25e', '#fff6c8', '#ffffff'], glow: 3, gravity: 1.5 });
    game.audio && game.audio.play('loot');
    if (this.pet) this.pet.play('happy');
    this.after(0.35, () => {
      const g = grantItems(run, items, fp.project(this.focusAt, 960, 540), this.flyers);
      this.rare.push(...g.rare); this.overflow = g.overflow;
      this.state = 'looted';
    });
  }
  leave() {
    if (this.state === 'done') return;
    this.state = 'done';
    const game = this.game;
    revealChain(game, this.rare, () => {
      if (this.overflow) { const o = openBag(game, { title: 'Chest', onClose: () => finishNode(game) }); if (!o) finishNode(game); }
      else finishNode(game);
    });
  }

  update(dt) {
    if (!this.run) return;
    if (this.timers) {
      for (const tm of this.timers) tm.t -= dt;
      const due = this.timers.filter((tm) => tm.t <= 0);
      this.timers = this.timers.filter((tm) => tm.t > 0);
      for (const tm of due) tm.fn();
    }
    this.t += dt;
    this.fade = Math.max(0, this.fade - dt * 1.8);
    const inp = this.game.input;
    const free = !this.game.overlays.length && !this.game.ui.overUI();
    if (this.state === 'closed' && free && ((inp.pressed && !inp.consumed) || inp.actionPressed('confirm') || inp.actionPressed('strike'))) this.tryOpen();
    if (this.state === 'looted' && free && !this.flyers.length && ((inp.pressed && !inp.consumed) || inp.actionPressed('confirm'))) this.leave();
    // lid
    const want = this.state === 'opening' || this.state === 'looted' || this.state === 'done' ? 1 : 0;
    this.open += (want - this.open) * Math.min(1, dt * 5);
    const ud = this.chest.userData;
    if (ud && ud.open) ud.open(clamp(this.open, 0, 1));
    // a rattle before the ambush
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.chest.rotation.z = Math.sin(this.t * 60) * 0.06 * Math.min(1, this.shakeT * 2);
      this.chest.position.y = this.at.y + Math.abs(Math.sin(this.t * 30)) * 0.02;
    }
    this.halo.material.opacity = this.state === 'closed' ? 0.4 + Math.sin(this.t * 2.5) * 0.15 : Math.max(0, this.halo.material.opacity - dt);
    if (this.state === 'closed' && rnd.chance(dt * 5)) {
      const p = this.focusAt;
      this.world.sparks.emit({ pos: [p.x + rnd.float(-0.25, 0.25), p.y + rnd.float(-0.1, 0.2), p.z + rnd.float(-0.2, 0.2)], vel: [0, 0.15, 0], life: [0.6, 1.2], size: 1, color: ['#ffd25e', '#fff6c8'], glow: 2.5, flicker: 0.5 });
    }
    this.fp.dragLook(inp);
    if (this.pet && this.pet.update) this.pet.update(dt);
    this.world.update(dt);
  }

  draw(ui) {
    if (!this.run) return;
    const game = this.game, dt = ui.dt || 1 / 60;
    const big = ui.touch ? 1.5 : 1;
    if (this.state === 'closed') {
      const p = this.fp.project(this.focusAt, ui.w, ui.h);
      const h = ui.hit('chest', p.x - 70, p.y - 60, 140, 110, { sound: false });
      ui.ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 3);
      ui.icon('arrowD', p.x, p.y - 64 + Math.round(Math.sin(this.t * 3) * 3), { center: true, scale: 2 });
      ui.ctx.globalAlpha = 1;
      if (h.clicked) this.tryOpen();
    }
    if (this.state === 'looted' && !this.flyers.length) {
      const h = woodTag(ui, 'tr-go', ui.w - 20, ui.h - 46 * big, 'Move on', { icon: 'arrowR', scale: big, align: 'right' });
      if (h.clicked) this.leave();
    }
    const hh = cornerHud(ui, game);
    if (hh.bag) openBag(game);
    drawFlyers(ui, this.flyers, dt);
    if (this.fade > 0) ui.rect(0, 0, ui.w, ui.h, '#07060b', this.fade);
  }
}
