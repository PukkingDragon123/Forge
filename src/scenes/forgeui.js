// The forge workbench. Your material cards lie on a scorched, lamp-lit bench; pick them and they go
// into the cast-iron mould. The open recipe book on the left (ribbon bookmarks = blueprints, paper
// index tabs = Forge / Codex / Tools) shows the weapon taking shape; the chalk slate on the right
// tallies Chips × Mult (Balatro style). Pull the brass FORGE plaque, then hammer the hot billet
// in rhythm on the anvil.
//   const ctrl = openForge(scene, { mode: 'weapon'|'pickaxe', monster, emergency, anvil, rig, world, onDone })
//   each frame: ctrl.update(dt); ctrl.draw(ui)   (while ctrl.active)
import { Tweens, Coroutines } from '../core/tween.js';
import { BLUEPRINTS, RECIPES } from '../data/blueprints.js';
import { MATERIALS, TOOL_RECIPES, RARITY } from '../data/materials.js';
import { MONSTERS } from '../data/monsters.js';
import { evaluate, finalizeWeapon, gradeFrom, GRADES, SYNERGIES } from '../systems/forge.js';
import { matOf, itemTooltip, makeItem } from '../systems/items.js';
import { materialCard, weaponCard, drawCard, CARD_W, CARD_H } from '../ui/cards.js';
import { weaponSprite, materialSprite } from '../art/sprites.js';
import { COLORS, bigText } from '../ui/font.js';
import { slate, tag, scrap, CHALK } from '../ui/frames.js';
import { glowCanvas } from '../art/handpaint.js';
import { benchCanvas, BENCH_H, moldCanvas, bookCanvas, BOOK, leafCanvas, ribbonCanvas, plaqueCanvas, anvilFaceCanvas, indexTabCanvas } from '../art/forge_art.js';
import { dim, ribbonTitle } from './common.js';
import { save } from '../core/save.js';
import { ease, clamp } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';
import * as THREE from 'three';

const ELEMENT_ICON = { fire: 'fire', ice: 'ice', shock: 'shock', poison: 'poison', bleed: 'bleed', curse: 'curse', holy: 'holy' };
const INK = '#3a2214', FAINT = '#7a5634', RED_INK = '#8a2a14';
const CHALK_BLUE = ['#e8f4ff', '#8cc0ff'], CHALK_RED = ['#ffe6e0', '#ff8a7a'], CHALK_WHITE = ['#ffffff', '#cfc6b4'];
const RIBBON_COLORS = ['#a8282e', '#2a5a8a', '#3a7a3a', '#8a5a1a', '#6a3a8a', '#2a7a7a', '#8a2a5a'];
const BENCH_Y = 540 - BENCH_H;

export function openForge(scene, opts) { return new ForgeController(scene, opts); }

class ForgeController {
  constructor(scene, opts) {
    this.scene = scene;
    this.game = scene.game;
    this.run = this.game.run;
    this.opts = opts;
    this.mode = opts.mode || 'weapon';
    this.active = true;
    this.tw = new Tweens();
    this.co = new Coroutines();
    this.state = 'select';
    this.tab = 'forge';
    const bps = this.run.blueprints.filter((b) => (this.mode === 'pickaxe' ? b === 'pickaxe' : b !== 'pickaxe'));
    this.bps = bps;
    this.bp = this.mode === 'pickaxe' ? 'pickaxe' : this.run.lastBp && bps.includes(this.run.lastBp) ? this.run.lastBp : bps[0];
    this.sel = [];
    this.anim = { open: 0, chips: 0, mult: 0, dmg: 0, step: -1, flash: 0, hide: 0, reveal: 0 };
    this.tw.to(this.anim, { open: 1 }, 0.55, { ease: 'outBack' });
    this.floats = [];
    this.banners = [];
    this.t = 0;
    this.shake = 0;
    this.flip = null;
    this.chalkDust = 0;
    this.game.audio && this.game.audio.play('page_turn');
    this.refresh();
  }

  // -------------------------------------------------------------- data
  hand() {
    const all = this.run.bag.items.filter((it) => {
      const m = matOf(it);
      if (this.mode === 'pickaxe') return m.pick && m.kind !== 'tool' && m.kind !== 'recipe';
      return !!m.weapon;
    });
    const order = { ore: 0, mineral: 1, crystal: 2, gem: 3, part: 4, key: 5, scroll: 6 };
    return all.sort((a, b) => (order[matOf(a).kind] ?? 9) - (order[matOf(b).kind] ?? 9) || RARITY[matOf(b).rarity].order - RARITY[matOf(a).rarity].order || a.id.localeCompare(b.id));
  }
  refresh() {
    const bonus = this.run.bag.bonuses();
    const items = this.sel.map((it) => ({ ...it, bagBonus: bonus[it.uid] }));
    this.res = evaluate(this.bp, items, { char: this.run.char, shattered: this.run.stats.shattered, rngSeed: this.run.seed });
    if (this.state === 'select') { this.anim.chips = this.res.chips; this.anim.mult = this.res.mult; this.anim.dmg = this.res.dmg; }
    // recipe hint: a known recipe on this blueprint that contains the current selection
    this.hint = null;
    if (this.mode === 'weapon' && this.sel.length) {
      const ids = this.sel.map((s) => s.id);
      for (const rid of this.run.recipes) {
        const r = RECIPES[rid];
        if (!r || r.bp !== this.bp) continue;
        const pool = [...r.ings];
        if (ids.every((id) => { const i = pool.indexOf(id); if (i < 0) return false; pool.splice(i, 1); return true; }) && pool.length) { this.hint = { rid, missing: pool }; break; }
      }
    }
  }
  slots() { return BLUEPRINTS[this.bp].slots; }
  toggle(it) {
    const i = this.sel.indexOf(it);
    if (i >= 0) { this.sel.splice(i, 1); this.game.audio.play('card_place', { pitch: 0.9 }); }
    else if (this.sel.length < this.slots()) { this.sel.push(it); this.game.audio.play('card_pick', { pitch: 1 + this.sel.length * 0.06 }); }
    else { this.game.audio.play('deny'); this.shake = 0.3; }
    this.chalkDust = 0.3;
    this.refresh();
  }
  turnPage(dir = 1) { this.flip = { t: 0, dir }; this.game.audio.play('page_turn'); }

  // -------------------------------------------------------------- flow
  forge() {
    if (!this.res.valid) { this.game.audio.play('deny'); this.shake = 0.3; return; }
    this.state = 'calc';
    this.run.lastBp = this.bp;
    for (const it of this.sel) this.run.bag.remove(it);
    this.game.audio.play('forge_whoosh');
    this.co.start(this.calcRoutine.bind(this));
  }

  *calcRoutine() {
    const a = this.anim;
    const res = this.res;
    const au = this.game.audio;
    a.chips = 0; a.mult = 0; a.dmg = 0;
    let pitch = 1;
    for (let i = 0; i < res.steps.length; i++) {
      const s = res.steps[i];
      a.step = i;
      if (s.kind === 'base') {
        a.chips = s.chips || 0; a.mult = s.mult || 0;
        this.chalkDust = 0.4;
        au.play('chips_tick'); yield 0.32; continue;
      }
      if (this.mode === 'pickaxe') { au.play('card_flip', { pitch }); pitch += 0.08; this.floatAtSlot(s.idx ?? i - 1, s.notes.join(', ') || 'no effect', COLORS.gold); yield 0.38; continue; }
      if (s.kind === 'item') {
        const slotIdx = s.idx;
        if (s.chips) { this.floatAtSlot(slotIdx, `+${s.chips}`, COLORS.chips); au.play('chips_tick', { pitch }); pitch += 0.06; yield 0.2; }
        if (s.mult) { this.floatAtSlot(slotIdx, `+${s.mult} Mult`, COLORS.mult); au.play('mult_tick', { pitch }); pitch += 0.06; yield 0.2; }
        if (s.xmult && s.xmult !== 1) { this.floatAtSlot(slotIdx, `×${s.xmult}`, COLORS.xmult, true); au.play('xmult', { pitch }); this.shake = 0.25; pitch += 0.08; yield 0.28; }
        for (const n of s.notes) if (/ECHO|Amber|Trophy|Grade/.test(n)) this.floatAtSlot(slotIdx, n, COLORS.gold);
        for (const e of Object.keys(ELEMENT_ICON)) if (s[e]) { this.floatAtSlot(slotIdx, `{@${ELEMENT_ICON[e]}}+${s[e]}`, COLORS[e]); }
        a.chips = s.totalChips; a.mult = s.totalMult;
        this.pulse = { slot: slotIdx, t: 0.25 };
        this.chalkDust = 0.3;
        if (!s.chips && !s.mult && s.xmult === 1) { au.play('card_flip', { pitch }); yield 0.22; }
        continue;
      }
      // synergy / recipe / fx
      a.mult = s.totalMult; a.chips = s.totalChips;
      const isRecipe = s.kind === 'recipe';
      this.banners.push({ text: s.text, desc: s.desc, t: 0, recipe: isRecipe });
      au.play(isRecipe ? 'recipe_discover' : 'synergy', { pitch: isRecipe ? 1 : pitch });
      this.shake = 0.5;
      this.chalkDust = 0.5;
      this.game.renderer.doFlash(0.18, isRecipe ? [1, 0.85, 0.4] : [1, 0.6, 0.3]);
      if (s.kind === 'synergy' && save.learn('discovered.synergies', s.id)) this.game.ui.toast(`New synergy: ${s.text}`, { icon: 'sparkle', color: COLORS.gold });
      if (isRecipe && this.run.learnRecipe(s.id)) this.game.ui.toast(`Secret weapon discovered: ${RECIPES[s.id].name}!`, { icon: 'recipe', color: COLORS.legendary, life: 3.5 });
      yield isRecipe ? 1.1 : 0.7;
    }
    if (this.mode === 'weapon') {
      // final multiply slam
      const target = res.dmg;
      au.play('dmg_total');
      this.tw.value(0, target, 0.6, (v) => (a.dmg = Math.round(v)), { ease: 'outCubic' });
      this.shake = 0.6;
      this.chalkDust = 0.8;
      yield 0.9;
    }
    yield 0.25;
    this.startHammer();
  }

  floatAtSlot(i, text, color, big = false) {
    const p = this.slotPos(Math.max(0, i));
    this.floats.push({ x: p.x + p.w / 2, y: p.y - 4, text, color, big, t: 0 });
  }

  // -------------------------------------------------------------- hammer minigame
  startHammer() {
    this.state = 'hammer';
    const bp = BLUEPRINTS[this.bp];
    const au = this.game.audio;
    const bpm = bp.bpm;
    const beat = 60 / bpm;
    const now = this.now();
    const start = now + 0.35;
    // rhythm runs on the wall clock (the AudioContext may be suspended); audio is scheduled with an offset
    au.metronome(bpm, 4, au.time() + 0.35);
    const t0 = start + beat * 4;
    const pattern = bp.rhythm.slice();
    // variation: occasionally swap a beat for an off-beat so it never feels identical
    if (pattern.length > 3 && rnd.chance(0.5)) { const k = rnd.int(1, pattern.length - 2); if (!pattern.includes(pattern[k] + 1) && pattern[k] + 1 < 8) pattern[k] += 1; }
    this.notes = pattern.map((p, i) => ({ time: t0 + p * beat / 2, i, res: null, dx: [-34, 26, -10, 38, -22, 14, 0][i % 7], dy: [-3, 2, -5, 0, 3, -2, 1][i % 7] }));
    this.hammer = { start, t0, beat, end: this.notes[this.notes.length - 1].time + 0.5, combo: 0, heat: 1, countIn: [0, 1, 2, 3].map((k) => start + k * beat) };
    this.hits = [];
    this.tw.to(this.anim, { hide: 1 }, 0.45, { ease: 'inBack' });
    if (this.opts.rig && this.opts.anvil) {
      const a = this.opts.anvil;
      this.savedCam = { pos: this.opts.rig.tPos.toArray(), look: this.opts.rig.tLook.toArray(), fov: this.opts.rig.tFov };
      this.opts.rig.moveTo([a.x + 0.25, a.y + 1.05, a.z + 1.55], [a.x, a.y + 0.55, a.z], 34, 0.7, 'inOutCubic');
    }
    this.opts.onHammerStart && this.opts.onHammerStart();
    au.play('forge_ignite');
  }

  anvilScreen() {
    const ui = this.game.ui;
    if (this.opts.rig && this.opts.anvil) {
      const p = this.opts.rig.project(new THREE.Vector3(this.opts.anvil.x, this.opts.anvil.y + 0.55, this.opts.anvil.z), ui.w, ui.h);
      return { x: p.x, y: p.y };
    }
    // the painted anvil: the billet lies across its face
    return { x: ui.w / 2 + 2, y: 268 };
  }

  judge(note, dt) {
    const bran = this.run.char === 'bran';
    const pw = 0.05 * (bran ? 1.45 : 1), gw = 0.115 * (bran ? 1.2 : 1);
    const ad = Math.abs(dt);
    return ad <= pw ? 'perfect' : ad <= gw ? 'good' : 'miss';
  }

  now() { return performance.now() / 1000; }

  hammerInput() {
    const now = this.now();
    const n = this.notes.find((x) => !x.res && Math.abs(now - x.time) < 0.22);
    if (!n) return;
    const r = this.judge(n, now - n.time);
    this.resolveNote(n, r);
  }

  resolveNote(n, r) {
    n.res = r;
    this.hits.push(r);
    const au = this.game.audio;
    const h = this.hammer;
    const p = this.anvilScreen();
    const x = p.x + n.dx, y = p.y + n.dy;
    const ui = this.game.ui;
    this.opts.onStrike && this.opts.onStrike(r, n);
    this.strikeT = 0.12;
    if (r === 'miss') {
      h.combo = 0;
      h.heat = Math.max(0.3, h.heat - 0.12);
      au.play('hammer_miss');
      ui.float('miss', x, y - 10, { color: '#a89a8a', vy: -14 });
      return;
    }
    h.combo++;
    const perfect = r === 'perfect';
    au.play(perfect ? 'hammer_perfect' : 'hammer_good', { pitch: 1 + Math.min(h.combo, 8) * 0.03 });
    if (perfect) au.play('anvil_ring', { vol: 0.5, pitch: 1 + h.combo * 0.04 });
    ui.float(perfect ? 'PERFECT!' : 'good', x, y - 14, { big: perfect, scale: 1, top: perfect ? '#fff6c8' : '#e0ffe0', bottom: perfect ? '#ffb63d' : '#5fd17a', color: '#c8ffb0', vy: -20 });
    ui.burst(x, y, perfect ? 30 : 14, { colors: ['#fff6c8', '#ffd25e', '#ff8a3a', '#ffffff'], speed: perfect ? 150 : 95, gravity: 240, kind: 'spark', life: 0.7, up: 50 });
    this.shake = perfect ? 0.45 : 0.25;
    this.game.hitStop(perfect ? 0.06 : 0.03);
    if (this.opts.rig) this.opts.rig.shake(perfect ? 0.35 : 0.2);
    const w = this.opts.world;
    if (w && this.opts.anvil) {
      const a = this.opts.anvil;
      w.sparks.emit({ pos: [a.x, a.y + 0.55, a.z], radial: [1.5, perfect ? 4 : 2.6], radialUp: 1.4, count: perfect ? 40 : 18, life: [0.3, 0.9], size: 1, color: ['#fff6c8', '#ffd27a', '#ff8a3a'], colorEnd: '#ff3a1a', glow: 4, gravity: 9, drag: 1.2, floor: a.y + 0.45, bounce: 0.3 });
    }
  }

  finishHammer() {
    this.state = 'result';
    const bonus = (this.run.bonusGrade || 0) + (this.res.gradeBonus || 0);
    this.run.bonusGrade = 0;
    const grade = gradeFrom(this.hits, bonus);
    const perfects = this.hits.filter((h) => h === 'perfect').length;
    const au = this.game.audio;
    au.play('quench');
    au.play('sizzle');
    const ui = this.game.ui;
    const p = this.anvilScreen();
    ui.burst(p.x, p.y, 30, { colors: ['#ffffff', '#d8e8f0', '#a8b8c8'], speed: 60, gravity: -40, life: 1.4, drag: 1.5 });
    if (this.opts.world && this.opts.anvil) { const a = this.opts.anvil; this.opts.world.dust.emit({ pos: [a.x, a.y + 0.6, a.z], posSpread: 0.2, vel: [0, 0.8, 0], spread: 0.3, count: 40, life: [1, 2], size: [1, 2], color: '#e8f0f8', alpha: 0.7 }); }
    this.grade = grade;
    if (this.mode === 'weapon') {
      this.weapon = finalizeWeapon(this.res, grade, { char: this.run.char, perfects });
      this.run.stats.forged++;
      if (grade === 4) { this.run.stats.masterworks++; save.data.stats.masterworks++; save.write(); au.play('unlock'); this.game.renderer.doFlash(0.4, [1, 0.85, 0.4]); }
    } else {
      const pick = { ...this.res.pick };
      pick.strikes = (pick.strikes || 0) + (grade >= 4 ? 1 : grade <= 0 ? -1 : 0);
      this.weapon = { pick, name: (grade === 4 ? 'Masterwork ' : '') + this.res.name, grade, bp: 'pickaxe', ids: this.res.ids, el: {}, recipe: null };
    }
    this.anim.reveal = 0;
    this.tw.to(this.anim, { reveal: 1 }, 0.6, { ease: 'outBack', delay: 0.5 });
    if (this.savedCam && this.opts.rig) {
      const a = this.opts.anvil;
      this.opts.rig.moveTo([a.x + 0.9, a.y + 1.4, a.z + 2.6], [a.x, a.y + 0.7, a.z], 38, 1.2, 'inOutCubic');
    }
    this.opts.onHammerEnd && this.opts.onHammerEnd(grade);
  }

  done(result) {
    if (!this.active) return;
    this.active = false;
    if (this.savedCam && this.opts.rig) this.opts.rig.moveTo(this.savedCam.pos, this.savedCam.look, this.savedCam.fov, 0.8);
    this.opts.onDone && this.opts.onDone(result);
  }

  // -------------------------------------------------------------- update
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    this.tw.update(dt); this.co.update(dt);
    this.shake = Math.max(0, this.shake - dt * 2);
    this.chalkDust = Math.max(0, this.chalkDust - dt);
    if (this.strikeT) this.strikeT = Math.max(0, this.strikeT - dt);
    if (this.flip) { this.flip.t += dt; if (this.flip.t > 0.36) this.flip = null; }
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.1);
    for (const b of this.banners) b.t += dt;
    if (this.pulse) { this.pulse.t -= dt; if (this.pulse.t <= 0) this.pulse = null; }
    const inp = this.game.input;
    if (this.state === 'hammer') {
      const now = this.now();
      if (inp.actionPressed('strike') || (inp.pressed && !inp.consumed)) { inp.consume(); this.hammerInput(); }
      for (const n of this.notes) if (!n.res && now > n.time + 0.16) this.resolveNote(n, 'miss');
      if (now > this.hammer.end && this.notes.every((n) => n.res)) this.finishHammer();
    }
  }

  // -------------------------------------------------------------- layout (960 × 540 stage)
  open() { return ease.outCubic(clamp(this.anim.open, 0, 1)); }
  benchY() { return Math.round(BENCH_Y + (1 - this.anim.open) * 190 + this.anim.hide * 200); }
  bookXY() { return { x: Math.round(14 - (1 - this.anim.open) * 380 - this.anim.hide * 420), y: 58 }; }
  slateXY() { return { x: Math.round(722 + (1 - this.anim.open) * 260), y: 52 }; }
  moldXY() { const m = moldCanvas(this.slots()); return { x: Math.round(480 - m.width / 2), y: this.benchY() - 34, m }; }
  slotPos(i) {
    const { x, y, m } = this.moldXY();
    const s = m.slots[clamp(i, 0, m.slots.length - 1)];
    return { x: x + s.x, y: y + s.y, w: s.w, h: s.h };
  }

  // -------------------------------------------------------------- draw
  draw(ui) {
    if (!this.active) return;
    const inp = this.game.input;
    const sx = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake * 6) : 0;
    const ctx = ui.ctx;
    if (this.state !== 'hammer' && this.state !== 'result') dim(ui, 0.32 * this.open());
    ctx.save();
    ctx.translate(sx, 0);
    if (this.state === 'hammer' || this.state === 'result') this.drawAnvilStage(ui);
    if (this.anim.hide < 1) {
      this.drawBench(ui);
      this.drawBook(ui);
    }
    this.drawSlate(ui);
    if (this.state === 'select') this.drawPlaque(ui);
    ctx.restore();
    if (this.state === 'hammer') this.drawHammer(ui);
    if (this.state === 'result') this.drawResult(ui);
    this.drawBanners(ui);
    // floats over the mould
    for (const f of this.floats) {
      const k = f.t / 1.1;
      const y = f.y - ease.outCubic(Math.min(1, k * 1.6)) * 18;
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      if (f.big) { const img = bigText(f.text, { scale: 2, top: '#fff0c0', bottom: '#ff7a3d' }); ui.img(img, Math.round(f.x - img.width / 2), Math.round(y - 10)); }
      else ui.text(f.text, f.x, y, { align: 'center', color: f.color, outline: '#140c10', thick: true });
      ctx.globalAlpha = 1;
    }
    if (inp.actionPressed('back') && this.state === 'select' && this.tab !== 'forge') { this.tab = 'forge'; this.turnPage(-1); }
  }

  // ---- the bench, the mould and the hand of cards
  drawBench(ui) {
    const by = this.benchY();
    ui.img(benchCanvas(), 0, by);
    // the mould, glowing where molten metal sits
    const { x: mx, y: my, m } = this.moldXY();
    ui.img(m, mx, my);
    const hot = this.state === 'calc';
    for (let i = 0; i < this.slots(); i++) {
      const p = this.slotPos(i);
      const it = this.sel[i];
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      if (it || hot) {
        ui.ctx.save();
        ui.ctx.globalCompositeOperation = 'lighter';
        ui.ctx.globalAlpha = hot ? 0.55 + Math.sin(this.t * 9 + i) * 0.1 : 0.22;
        ui.ctx.drawImage(glowCanvas(26, hot ? '#ff8a3a' : '#ffd27a'), cx - 26, cy - 26);
        ui.ctx.restore();
      }
      if (it) {
        const pulse = this.pulse && this.pulse.slot === i;
        ui.img(materialSprite(it.id, 32), cx - 16, cy - 17 - (pulse ? 3 : 0));
        if (this.state === 'select') {
          const h = ui.hit('slot' + i, p.x, p.y, p.w, p.h);
          if (h.hover) ui.tooltip(itemTooltip(it));
          if (h.clicked) this.toggle(it);
        }
      } else if (this.state === 'select') {
        ui.text(String(i + 1), cx, cy - 3, { align: 'center', font: 'small', color: '#5a5664' });
      }
    }
    this.drawHand(ui, by);
  }

  drawHand(ui, by) {
    const hand = this.state === 'select' ? this.hand() : this.state === 'calc' ? this.hand() : [];
    const n = hand.length;
    const cw = CARD_W;
    const x0min = 22, avail = 960 - 44;
    const step = n > 1 ? Math.min(cw + 6, (avail - cw) / (n - 1)) : 0;
    const total = n > 1 ? step * (n - 1) + cw : cw;
    const x0 = Math.round(Math.max(x0min, 480 - total / 2));
    const y0 = by + 40;
    if (!n && this.state === 'select') {
      const s = scrap(280, 44, { seed: 3 });
      ui.img(s, 480 - 140, y0 + 18);
      ui.text(this.mode === 'pickaxe' ? 'No materials to make a pickaxe.' : 'No forgeable materials! Mine more ore.', 480, y0 + 18 + s.inner.y + 6, { align: 'center', color: RED_INK });
      return;
    }
    const sel = this.state === 'select';
    // hover: the top-most card under the mouse (later cards are drawn on top)
    let hovered = -1;
    if (sel) for (let i = n - 1; i >= 0; i--) {
      const cx = x0 + i * step;
      const lift = this.sel.includes(hand[i]) ? 22 : 0;
      if (ui.mx >= cx && ui.mx < cx + (i === n - 1 ? cw : Math.max(step, 6)) && ui.my >= y0 - lift - 8 && ui.my < y0 + CARD_H) { hovered = i; break; }
    }
    hand.forEach((it, i) => {
      const selected = this.sel.includes(it);
      const cx = Math.round(x0 + i * step);
      const lift = (selected ? 22 : 0) + (i === hovered ? 8 : 0);
      const wob = Math.round(Math.sin(this.t * 1.6 + i * 0.7) * 1);
      const tilt = ((i - (n - 1) / 2) / Math.max(1, n)) * 1.2;
      const card = materialCard({ ...it, bagBonus: undefined }, { selected, dim: !sel });
      if (selected) {
        ui.ctx.save(); ui.ctx.globalCompositeOperation = 'lighter'; ui.ctx.globalAlpha = 0.35;
        ui.ctx.drawImage(glowCanvas(46, '#ffd27a'), cx + cw / 2 - 46, y0 - lift + 50 - 46);
        ui.ctx.restore();
      }
      drawCard(ui, card, cx, y0 + wob, { lift, hover: i === hovered, tilt: i === hovered ? 0 : tilt });
      if (!sel) return;
      const hitW = i === n - 1 ? cw : Math.max(6, step);
      const h = ui.hit('card' + it.uid, cx, y0 - lift, hitW, CARD_H, { sound: false });
      if (i === hovered) ui.tooltip(itemTooltip(it));
      if (h.clicked) this.toggle(it);
    });
    if (!sel) return;
    // a chalk count on the bench edge
    ui.text(`${this.sel.length}/${this.slots()}`, this.moldXY().x - 30, this.moldXY().y + 22, { align: 'center', color: CHALK, outline: '#140c10' });
    if (!save.data.seen.tips.forge && this.mode === 'weapon') {
      const s = scrap(268, 52, { seed: 5, nails: 1 });
      const tx = 480 - 134, ty = y0 - 112;
      ui.img(s, tx, ty);
      ui.text('Lay ore & part cards in the mould. Each adds\n{chips}Chips{/} or {mult}Mult{/}. Mix them for synergies,\nthen pull the FORGE plaque!', tx + s.inner.x + 2, ty + s.inner.y, { color: INK, maxW: s.inner.w });
      if (this.sel.length) { save.data.seen.tips.forge = true; save.write(); }
    }
  }

  // ---- the recipe book
  drawBook(ui) {
    const { x, y } = this.bookXY();
    if (x < -BOOK.w) return;
    const ctx = ui.ctx;
    // blueprint ribbons hang out of the bottom of the book
    if (this.mode === 'weapon') {
      this.bps.forEach((b, i) => {
        const on = b === this.bp;
        const rx = x + 34 + i * 26, len = on ? 46 : 34;
        const h = ui.hit('bp-' + b, rx, y + BOOK.h - 12, 16, len + 4);
        const sway = Math.round(Math.sin(this.t * 1.3 + i) * (h.hover ? 0 : 1));
        ui.img(ribbonCanvas(RIBBON_COLORS[i % RIBBON_COLORS.length], len + (h.hover ? 4 : 0)), rx + sway, y + BOOK.h - 14);
        ui.icon(BLUEPRINTS[b].icon, rx + sway + 7, y + BOOK.h - 14 + len - 12 + (h.hover ? 4 : 0), { center: true });
        if (h.hover) ui.tooltip({ title: BLUEPRINTS[b].name, body: BLUEPRINTS[b].desc + `\n{chips}${BLUEPRINTS[b].chips} Chips{/} · {mult}${BLUEPRINTS[b].mult} Mult{/} · ${BLUEPRINTS[b].slots} slots · ${BLUEPRINTS[b].speed}s swing` });
        if (h.clicked && this.state === 'select' && b !== this.bp) {
          const dir = i > this.bps.indexOf(this.bp) ? 1 : -1;
          this.bp = b; this.turnPage(dir);
          while (this.sel.length > this.slots()) this.sel.pop();
          this.refresh();
        }
      });
    }
    // paper index tabs along the top edge
    const tabs = this.mode === 'weapon' ? ['forge', 'codex'] : ['forge', 'tools', 'codex'];
    tabs.forEach((t, i) => {
      const on = this.tab === t;
      const tx = x + BOOK.w - 70 - (tabs.length - 1 - i) * 58, ty = y - 16 + (on ? 0 : 4);
      ui.img(indexTabCanvas(54, 24, on), tx, ty);
      ui.text(t[0].toUpperCase() + t.slice(1), tx + 27, ty + 7, { align: 'center', color: on ? RED_INK : FAINT });
      if (ui.hit('tab-' + t, tx, ty, 54, 18).clicked && this.state === 'select' && t !== this.tab) { const dir = i > tabs.indexOf(this.tab) ? 1 : -1; this.tab = t; this.turnPage(dir); }
    });
    ui.img(bookCanvas(), x, y);
    const L = { x, y, lx: x + 22, rx: x + BOOK.w / 2 + 12, pw: BOOK.w / 2 - 34, top: y + 22, bottom: y + BOOK.h - 18 };
    if (this.flip && this.flip.t < 0.18) { /* the leaf hides the text mid-turn */ } else if (this.tab === 'codex') this.drawCodex(ui, L);
    else if (this.tab === 'tools') this.drawTools(ui, L);
    else this.drawForgePages(ui, L);
    if (this.flip) {
      const k = this.flip.t / 0.36;
      const pw = BOOK.w / 2 - 14;
      const w = Math.abs(Math.cos(k * Math.PI)) * pw;
      const leftSide = (k > 0.5) === (this.flip.dir > 0);
      const leaf = leafCanvas(w, BOOK.h - 30);
      ui.img(leaf, leftSide ? x + BOOK.w / 2 - leaf.width : x + BOOK.w / 2, y + 12);
    }
    // the "skip" choice: a tag tied to the book's corner
    if (this.state === 'select') {
      const label = this.mode === 'pickaxe' ? 'Old pick only' : this.opts.emergency ? 'Fists!' : 'No weapon';
      const c = tag(100, 30, { seed: 9 });
      const kx = x + BOOK.w - 108, ky = y + BOOK.h + 2;
      const h = ui.hit('forge-skip', kx, ky, 100, c.height);
      ui.img(c, kx, ky - (h.hover ? 2 : 0));
      ui.text(label, kx + 50, ky + c.inner.y + Math.round((c.inner.h - 7) / 2) - (h.hover ? 2 : 0), { align: 'center', color: INK });
      if (h.hover) ui.tooltip(this.mode === 'pickaxe' ? 'Dig with your trusty old pick: 3 strikes.' : 'Fight bare-handed or try to flee.');
      if (h.clicked) this.done(null);
    }
    void ctx;
  }

  drawForgePages(ui, L) {
    const bp = BLUEPRINTS[this.bp];
    // ---- left page: the weapon sketched as it takes shape
    ui.text(this.opts.emergency ? 'QUICK! RE-FORGE!' : this.mode === 'pickaxe' ? 'A new pickaxe' : bp.name, L.lx + L.pw / 2, L.top, { align: 'center', color: this.opts.emergency ? RED_INK : INK });
    const preview = { bp: this.bp, ids: this.sel.map((s) => s.id), el: this.res.el, grade: 2, recipe: this.res.recipe };
    const spr = weaponSprite(preview, 96);
    const wob = this.state === 'calc' ? Math.sin(this.t * 20) * this.shake * 2 : 0;
    ui.ctx.globalAlpha = this.sel.length ? 1 : 0.35;
    ui.img(spr, Math.round(L.lx + L.pw / 2 - 48 + wob), L.top + 12);
    ui.ctx.globalAlpha = 1;
    const nm = this.sel.length ? this.res.name : 'sketch';
    ui.text(nm, L.lx + L.pw / 2, L.top + 112, { align: 'center', color: this.res.recipe ? '#a05a00' : INK, maxW: L.pw });
    if (this.mode === 'weapon') {
      ui.text(`${bp.speed}s swing · crit ×${bp.crit}`, L.lx + L.pw / 2, L.top + 136, { align: 'center', font: 'small', color: FAINT });
      let ex = L.lx + 4;
      for (const e of Object.keys(ELEMENT_ICON)) if (this.res.el[e] > 0) { ui.icon(ELEMENT_ICON[e], ex, L.top + 148); ui.text(String(this.res.el[e]), ex + 10, L.top + 149, { font: 'small', color: INK }); ex += 24; }
    } else ui.text('Base: 3 swings', L.lx + L.pw / 2, L.top + 136, { align: 'center', font: 'small', color: FAINT });

    // ---- right page: notes on the foe, synergies, the recipe hint
    let ry = L.top;
    if (this.opts.monster && MONSTERS[this.opts.monster]) {
      const md = MONSTERS[this.opts.monster];
      ui.text(`vs ${md.name}`, L.rx, ry, { color: RED_INK, maxW: L.pw });
      ry += 14;
      if (md.weak.length) { ui.text('Weak to', L.rx, ry, { font: 'small', color: FAINT }); let ix = L.rx + 36; for (const e of md.weak) { ui.icon(ELEMENT_ICON[e] || 'question', ix, ry - 2); ix += 12; } ry += 12; }
      if (md.resist.length) { ui.text('Resists', L.rx, ry, { font: 'small', color: FAINT }); let ix = L.rx + 36; for (const e of md.resist) { ui.icon(ELEMENT_ICON[e] || 'question', ix, ry - 2); ix += 12; } ry += 12; }
      if (md.armor) { ui.text(`Armour ${md.armor}`, L.rx, ry, { font: 'small', color: FAINT }); ry += 12; }
      ry += 4;
      for (let x = L.rx; x < L.rx + L.pw; x += 3) ui.rect(x, ry, 2, 1, FAINT, 0.6);
      ry += 7;
    }
    if (this.mode === 'pickaxe') {
      const pk = this.res.pick || {};
      for (const k of Object.keys(pk)) if (k !== 'strikes') { ui.text(`• ${PICK_TEXT[k] || k}`, L.rx, ry, { color: INK, maxW: L.pw }); ry += 11; if (ry > L.bottom - 20) break; }
      if (!Object.keys(pk).filter((k) => k !== 'strikes').length) ui.text('Add ore cards to\nfind pickaxe traits.', L.rx, ry, { color: FAINT });
    } else {
      if (this.res.synergies.length) ui.text('Synergies', L.rx, ry, { font: 'small', color: FAINT }), ry += 10;
      for (const sid of this.res.synergies.slice(0, 4)) {
        const s = SYNERGIES.find((q) => q.id === sid);
        ui.text(`{@sparkle} {#a05a00}${s.name}{/}`, L.rx, ry, { color: INK, maxW: L.pw });
        ry += 11;
      }
      if (this.hint) { ry += 2; ui.text(`{#6a3a8a}${RECIPES[this.hint.rid].name}?{/} needs ${this.hint.missing.map((m) => MATERIALS[m].name).join(', ')}`, L.rx, ry, { font: 'small', maxW: L.pw, color: INK }); ry += 22; }
      if (!this.sel.length) ui.text('Pick cards from the\nbench below.', L.rx, Math.max(ry, L.top + 60), { color: FAINT });
    }
    if (this.res.error && this.sel.length) ui.text(this.res.error, L.rx, L.bottom - 16, { font: 'small', maxW: L.pw, color: RED_INK });
  }

  drawCodex(ui, L) {
    ui.text('Secret Weapons', L.lx + L.pw / 2, L.top - 2, { align: 'center', color: INK });
    const ids = Object.keys(RECIPES);
    const per = 6;
    const page = this.codexPage || 0;
    const shown = ids.slice(page * per * 2, page * per * 2 + per * 2);
    shown.forEach((rid, i) => {
      const r = RECIPES[rid];
      const col = i < per ? 0 : 1;
      const row = i % per;
      const px = col ? L.rx : L.lx, py = L.top + 12 + row * 25;
      const known = this.run.recipes.includes(rid);
      ui.icon(BLUEPRINTS[r.bp].icon, px, py + 2, { alpha: known ? 1 : 0.4 });
      ui.text(known ? r.name : '? ? ?', px + 13, py, { color: known ? '#7a3a00' : '#8a7a6a', maxW: L.pw - 14 });
      if (known) r.ings.forEach((ing, k) => ui.img(materialSprite(ing, 12), px + 13 + k * 13, py + 10));
      else ui.text(r.hint, px + 13, py + 10, { font: 'small', color: '#8a7a6a', maxW: L.pw - 14 });
      if (ui.hit('codex' + rid, px, py, L.pw, 24).hover && known) ui.tooltip({ title: r.name, body: `${BLUEPRINTS[r.bp].name}: ${r.ings.map((q) => MATERIALS[q].name).join(' + ')}\n${r.text}` });
    });
    ui.text(`${this.run.recipes.length}/${ids.length} discovered`, L.lx, L.bottom - 4, { font: 'small', color: FAINT });
    if (ids.length > per * 2) {
      const h = ui.hit('codex-next', L.rx + L.pw - 34, L.bottom - 10, 36, 14);
      ui.text(h.hover ? 'turn ›' : 'turn', L.rx + L.pw - 16, L.bottom - 6, { align: 'center', color: h.hover ? RED_INK : FAINT });
      if (h.clicked) { this.codexPage = (page + 1) % Math.ceil(ids.length / (per * 2)); this.turnPage(1); }
    }
  }

  drawTools(ui, L) {
    ui.text('Mining Tools', L.lx + L.pw / 2, L.top - 2, { align: 'center', color: INK });
    const bag = this.run.bag;
    TOOL_RECIPES.forEach((tr, i) => {
      const px = i % 2 ? L.rx : L.lx, py = L.top + 12 + Math.floor(i / 2) * 52;
      const m = MATERIALS[tr.out];
      ui.img(materialSprite(tr.out, 24), px, py);
      ui.text(m.name, px + 28, py, { color: INK, maxW: L.pw - 28 });
      const opts = [tr.needs, tr.alt].filter(Boolean);
      const usable = opts.find((need) => need.every(([id, n]) => bag.items.filter((it) => it.id === id).length >= n));
      tr.needs.forEach(([id, n], k) => { ui.img(materialSprite(id, 12), px + 28 + k * 24, py + 12); ui.text('×' + n, px + 41 + k * 24, py + 14, { font: 'small', color: INK }); });
      if (ui.button('craft' + tr.out, px + 28, py + 28, 56, 16, 'Craft', { style: usable ? 'red' : 'stone', disabled: !usable, font: 'small', tip: m.desc })) {
        for (const [id, n] of usable) for (let k = 0; k < n; k++) bag.remove(bag.items.find((it) => it.id === id));
        bag.add(makeItem(tr.out, 2));
        this.game.audio.play('anvil_ring');
        this.game.ui.toast(`Crafted ${m.name}`, { icon: 'tool' });
        this.refresh();
      }
    });
  }

  // ---- the chalk slate: Chips × Mult = damage, then a tally of hammer blows
  drawSlate(ui) {
    const { x, y } = this.slateXY();
    const W = 226, H = 168;
    const s = slate(W, H, { seed: 2 });
    const hammer = this.state === 'hammer' || this.state === 'result';
    const yy = hammer ? y - this.anim.hide * 0 : y;
    ui.img(s, x, yy);
    const I = s.inner, cx = x + I.x + I.w / 2;
    const chalkTitle = (str, ty) => ui.text(str, cx, ty, { align: 'center', color: CHALK });
    if (this.mode === 'weapon' && !hammer) {
      chalkTitle(this.state === 'calc' ? 'tallying…' : 'chips  ×  mult', yy + I.y + 2);
      const chips = bigText(String(Math.round(this.anim.chips)), { scale: 2, top: CHALK_BLUE[0], bottom: CHALK_BLUE[1] });
      const mult = bigText(String(Math.round(this.anim.mult * 10) / 10), { scale: 2, top: CHALK_RED[0], bottom: CHALK_RED[1] });
      const ry = yy + I.y + 18;
      ui.img(chips, Math.round(cx - 18 - chips.width), ry);
      ui.text('×', cx, ry + 8, { align: 'center', color: CHALK });
      ui.img(mult, Math.round(cx + 18), ry);
      // chalk rule
      for (let k = 0; k < I.w - 24; k += 2) ui.rect(x + I.x + 12 + k, ry + 34 + Math.round(Math.sin(k * 0.3) * 0.6), 2, 1, CHALK, 0.75);
      const dmgVal = this.state === 'calc' ? this.anim.dmg : this.res.dmg;
      if (this.state === 'select' || this.anim.dmg > 0) {
        const d = bigText(String(dmgVal), { scale: 3, top: CHALK_WHITE[0], bottom: dmgVal > 500 ? '#ffb07a' : CHALK_WHITE[1] });
        ui.img(d, Math.round(cx - d.width / 2), ry + 42);
        ui.text('damage per hit', cx, ry + 42 + d.height + 2, { align: 'center', font: 'small', color: CHALK });
      }
    } else if (!hammer) {
      chalkTitle(this.state === 'calc' ? 'tempering…' : 'the new pick', yy + I.y + 2);
      const pk = this.res.pick || {};
      const sw = bigText(String(3 + (pk.strikes || 0)), { scale: 3, top: CHALK_WHITE[0], bottom: CHALK_WHITE[1] });
      ui.img(sw, Math.round(cx - sw.width / 2), yy + I.y + 22);
      ui.text('swings', cx, yy + I.y + 26 + sw.height, { align: 'center', color: CHALK });
      const traits = Object.keys(pk).filter((k) => k !== 'strikes').length;
      ui.text(traits ? `${traits} trait${traits > 1 ? 's' : ''}` : 'no traits yet', cx, yy + I.y + 44 + sw.height, { align: 'center', font: 'small', color: CHALK });
    } else {
      // hammer tally: one chalk mark per blow
      chalkTitle(this.state === 'result' ? GRADES[this.grade].name : 'blows', yy + I.y + 2);
      const n = this.notes.length, gap = Math.min(26, (I.w - 20) / Math.max(1, n));
      for (let i = 0; i < n; i++) {
        const r = this.notes[i].res;
        const mx = Math.round(cx - ((n - 1) * gap) / 2 + i * gap), my = yy + I.y + 34;
        if (!r) { ui.rect(mx - 3, my + 3, 7, 1, CHALK, 0.35); continue; }
        if (r === 'perfect') { ui.rect(mx - 4, my, 9, 1, '#ffe6a0'); ui.rect(mx, my - 4, 1, 9, '#ffe6a0'); ui.rect(mx - 2, my - 2, 5, 5, '#ffe6a0', 0.5); }
        else if (r === 'good') { ui.rect(mx - 3, my, 2, 1, CHALK); ui.rect(mx - 1, my + 1, 2, 1, CHALK); ui.rect(mx + 1, my - 1, 1, 2, CHALK); ui.rect(mx + 2, my - 3, 1, 2, CHALK); }
        else { for (let k = -3; k <= 3; k++) { ui.rect(mx + k, my + k, 1, 1, '#c8a8a0'); ui.rect(mx + k, my - k, 1, 1, '#c8a8a0'); } }
      }
      if (this.hammer && this.hammer.combo >= 2) ui.text(`combo ×${this.hammer.combo}`, cx, yy + I.y + 56, { align: 'center', color: '#ffe6a0' });
      if (this.mode === 'weapon') {
        const d = bigText(String(this.res.dmg), { scale: 2, top: CHALK_WHITE[0], bottom: CHALK_WHITE[1] });
        ui.img(d, Math.round(cx - d.width / 2), yy + I.y + 76);
        ui.text('damage per hit', cx, yy + I.y + 80 + d.height, { align: 'center', font: 'small', color: CHALK });
      }
    }
    // chalk dust puffs when numbers change
    if (this.chalkDust > 0 && Math.random() < 0.6) ui.burst(cx + rnd.float(-50, 50), yy + I.y + 40 + rnd.float(-10, 30), 1, { colors: ['#e8e4da', '#cfc8b8'], speed: 10, gravity: -6, life: 0.8, size: 1 });
  }

  // ---- the big FORGE plaque
  drawPlaque(ui) {
    const W = 168, H = 60;
    const x = Math.round(752 + (1 - this.anim.open) * 260), y = 236;
    const ok = this.res.valid;
    const h = ui.hit('forge-go', x, y, W + 20, H + 20, { cursor: ok ? 'hand' : 'arrow' });
    const state = !ok ? 'off' : h.down ? 'down' : h.hover ? 'hover' : 'idle';
    const c = plaqueCanvas(W, H, state);
    const dy = state === 'down' ? 2 : state === 'hover' ? -1 : 0;
    if (ok) {
      ui.ctx.save(); ui.ctx.globalCompositeOperation = 'lighter'; ui.ctx.globalAlpha = 0.18 + Math.sin(this.t * 3) * 0.06;
      ui.ctx.drawImage(glowCanvas(70, '#ffc060'), x + W / 2 - 60, y + H / 2 - 60);
      ui.ctx.restore();
    }
    ui.img(c, x, y + dy);
    const I = c.inner;
    engrave(ui, this.mode === 'pickaxe' ? 'TEMPER' : 'FORGE!', x + I.x + I.w / 2, y + dy + I.y + I.h / 2, ok);
    ui.text('space', x + W / 2 + 10, y + H + 18, { align: 'center', font: 'small', color: ok ? '#e8d8b8' : '#8a8074', outline: '#140c10' });
    if (h.hover && !ok && this.res.error) ui.tooltip(this.res.error);
    if ((h.clicked && ok) || (this.game.input.actionPressed('confirm') && ok)) { this.game.audio.play('click'); this.forge(); }
    else if (h.clicked) { this.game.audio.play('deny'); this.shake = 0.3; }
  }

  // ---- hammering
  drawAnvilStage(ui) {
    if (this.opts.rig && this.opts.anvil) return; // the 3D anvil is on screen
    const heat = this.state === 'hammer' ? (this.hammer ? this.hammer.heat : 1) : 0.4;
    dim(ui, 0.62);
    const c = anvilFaceCanvas(heat);
    const ax = Math.round(ui.w / 2 - c.width / 2), ay = 238;
    ui.ctx.save(); ui.ctx.globalCompositeOperation = 'lighter'; ui.ctx.globalAlpha = 0.35 * heat + Math.sin(this.t * 8) * 0.04;
    ui.ctx.drawImage(glowCanvas(110, '#ff7a2a'), ui.w / 2 - 110, ay + 30 - 110);
    ui.ctx.restore();
    const kick = this.strikeT ? 2 : 0;
    ui.img(c, ax, ay + kick);
  }

  drawHammer(ui) {
    const now = this.now();
    const h = this.hammer;
    const p = this.anvilScreen();
    const ctx = ui.ctx;
    // count-in, chalky and big
    const ci = h.countIn.filter((t) => now >= t).length;
    if (now < h.t0) {
      const label = ['3', '2', '1', 'STRIKE!'][Math.max(0, ci - 1)] || 'Ready…';
      if (ci > 0) ui.big(label, ui.w / 2, 120, { scale: ci === 4 ? 2 : 3, top: '#fff6c8', bottom: '#ff8a3a' });
      else ui.big('Ready…', ui.w / 2, 120, { scale: 2, top: '#fff6c8', bottom: '#d8b890' });
    }
    // notes: heat spots on the billet with ember rings closing in
    for (const n of this.notes) {
      if (n.res) continue;
      const x = p.x + n.dx, y = p.y + n.dy;
      const dt = n.time - now;
      if (dt > h.beat * 2) continue;
      const k = clamp(dt / (h.beat * 2), 0, 1);
      const r = 6 + k * 30;
      const onBeat = Math.abs(dt) < 0.06;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + (1 - k) * 0.4;
      ctx.drawImage(glowCanvas(10, onBeat ? '#ffffff' : '#ffb040'), Math.round(x - 10), Math.round(y - 10));
      ctx.restore();
      ui.rect(x - 1, y - 1, 3, 3, '#fff6c8');
      // ember ring: broken dashes of hot colour, flickering
      const steps = Math.max(16, Math.floor(r * 3));
      for (let s = 0; s < steps; s++) {
        if ((s + Math.floor(this.t * 20)) % 3 === 0) continue;
        const a = (s / steps) * Math.PI * 2;
        ui.rect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.7), 2, 1, onBeat ? '#ffffff' : s % 2 ? '#ffd27a' : '#ff8a3a', 1 - k * 0.5);
      }
    }
    // a small paper tag with the hint
    const t = tag(170, 30, { seed: 4 });
    ui.img(t, ui.w / 2 - 85, ui.h - 58);
    ui.text('SPACE or click on the beat', ui.w / 2, ui.h - 58 + t.inner.y + Math.round((t.inner.h - 7) / 2), { align: 'center', color: INK });
  }

  drawResult(ui) {
    const g = GRADES[this.grade];
    const k = this.anim.reveal || 0;
    const cx = ui.w / 2;
    ui.ctx.globalAlpha = Math.min(1, k * 1.5);
    ribbonTitle(ui, g.name.toUpperCase(), cx, 40, this.grade === 4 ? 'gold' : this.grade >= 3 ? 'blue' : this.grade >= 2 ? 'green' : 'brown', Math.min(1, k * 1.5));
    if (this.mode === 'weapon') {
      const card = weaponCard(this.weapon);
      const s = Math.max(1, Math.round((1 + k) * 2) / 2) * (k < 1 ? 0.5 + k * 0.5 : 1);
      const ctx = ui.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4 * k;
      ctx.drawImage(glowCanvas(120, this.grade === 4 ? '#ffd27a' : '#ff9a50'), cx - 120, ui.h / 2 - 130);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.translate(Math.round(cx), Math.round(ui.h / 2 - 8));
      ctx.scale(Math.round(s * 4) / 4, Math.round(s * 4) / 4);
      ctx.drawImage(card, -Math.round(card.width / 2), -Math.round(card.height / 2));
      ctx.restore();
      if (this.grade === 4) ui.burst(cx + (Math.random() - 0.5) * 160, ui.h / 2 + (Math.random() - 0.5) * 220, 1, { colors: ['#ffe08a', '#fff'], kind: 'star', speed: 10, gravity: -10, life: 0.8 });
    } else {
      const lines = [this.weapon.name, `${3 + (this.weapon.pick.strikes || 0)} swings`, ...Object.keys(this.weapon.pick).filter((q) => q !== 'strikes').map((q) => '• ' + (PICK_TEXT[q] || q))];
      const sc = scrap(240, 40 + lines.length * 12, { seed: 8 });
      const sy = Math.round(ui.h / 2 - sc.height / 2 + 30);
      ui.img(weaponSprite({ bp: 'pickaxe', ids: this.weapon.ids, el: {}, grade: this.grade }, 96), cx - 48, sy - 100);
      ui.img(sc, cx - 120, sy);
      lines.forEach((l, i) => ui.text(l, cx, sy + sc.inner.y + 2 + i * 12, { align: 'center', color: i ? INK : RED_INK }));
    }
    ui.ctx.globalAlpha = 1;
    if (k >= 1) {
      const W = 120, H = 40, x = Math.round(cx - W / 2 - 10), y = ui.h - 76;
      const hh = ui.hit('forge-take', x, y, W + 20, H + 20);
      const c = plaqueCanvas(W, H, hh.down ? 'down' : hh.hover ? 'hover' : 'idle');
      ui.img(c, x, y);
      engrave(ui, this.mode === 'weapon' ? 'Fight!' : 'Dig!', x + c.inner.x + c.inner.w / 2, y + c.inner.y + c.inner.h / 2, true);
      if (hh.clicked || this.game.input.actionPressed('confirm')) this.done(this.weapon);
    }
  }

  drawBanners(ui) {
    for (const b of this.banners) {
      if (b.t > 1.6) continue;
      const k = b.t / 1.6;
      const a = k < 0.1 ? k / 0.1 : k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
      const yy = 196 - (1 - ease.outBack(Math.min(1, k * 4))) * 30;
      ribbonTitle(ui, b.text, ui.w / 2, yy, b.recipe ? 'gold' : 'purple', a);
      if (b.desc) {
        ui.ctx.globalAlpha = a;
        const sc = scrap(Math.min(320, ui.measure(b.desc) + 30), 30, { seed: 6, nails: 0 });
        ui.img(sc, Math.round(ui.w / 2 - sc.width / 2), yy + 14);
        ui.text(b.desc, ui.w / 2, yy + 14 + sc.inner.y + 2, { align: 'center', color: INK });
        ui.ctx.globalAlpha = 1;
      }
    }
  }
}

/** Letters cut into a brass plate: a pale lower lip under dark recessed glyphs. */
export function engrave(ui, word, cx, cy, ok = true) {
  const hi = bigText(word, { scale: 2, top: ok ? '#fff2c0' : '#a09a8c', bottom: ok ? '#f0cc6a' : '#8a8478', outline: ok ? '#c8983a' : '#5a5448' });
  const lo = bigText(word, { scale: 2, top: ok ? '#3a2006' : '#2a2620', bottom: ok ? '#20120a' : '#1a1814', outline: ok ? '#9a6e22' : '#4a4238' });
  const x = Math.round(cx - lo.width / 2), y = Math.round(cy - lo.height / 2);
  ui.img(hi, x, y + 1);
  ui.img(lo, x, y);
}

const PICK_TEXT = {
  magnetic: 'Magnetic: pulls adjacent metals', gemDupe: 'Crystal: first gem doubled', cursed: 'Cursed: 3×3 strikes, -1 quality',
  lucky: 'Lucky: better ores, junk turns rare', smelt: 'Smelt: metals +1 quality', hard: 'Breaks hard rock in 1 hit', freeze: 'Hazards frozen',
  chain: 'Chain: connected ores break together', reveal: 'Glint: shows hidden rarity', column: 'Starfall: first strike breaks a column',
  area: 'Each strike also breaks the tile below', preserve: 'Preserve: no quality loss', unlock: 'Opens treasure pockets', archaeo: 'Fossils +1 quality',
  seehaz: 'Reveals hazards', quality: 'Gems +1 quality', melt: 'Melts ice ores!',
};
