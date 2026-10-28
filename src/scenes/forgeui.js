// The portable forge: an illustrated blacksmith's recipe book where you pick a blueprint and ore cards,
// watch the Chips × Mult calculation resolve (Balatro style), then hammer the hot metal in rhythm.
//   const ctrl = openForge(scene, { mode: 'weapon'|'pickaxe', monster, emergency, anvil, rig, world, onDone })
//   each frame: ctrl.update(dt); ctrl.draw(ui)   (while ctrl.active)
import { Tweens, Coroutines } from '../core/tween.js';
import { BLUEPRINTS, RECIPES } from '../data/blueprints.js';
import { MATERIALS, TOOL_RECIPES, RARITY } from '../data/materials.js';
import { MONSTERS } from '../data/monsters.js';
import { evaluate, finalizeWeapon, gradeFrom, GRADES, SYNERGIES } from '../systems/forge.js';
import { matOf, itemTooltip, makeItem } from '../systems/items.js';
import { materialCard, weaponCard, drawCard } from '../ui/cards.js';
import { weaponSprite, materialSprite } from '../art/sprites.js';
import { COLORS, bigText } from '../ui/font.js';
import { ring, dim, ribbonTitle, prompt } from './common.js';
import { save } from '../core/save.js';
import { ease, clamp } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';
import * as THREE from 'three';

const ELEMENT_ICON = { fire: 'fire', ice: 'ice', shock: 'shock', poison: 'poison', bleed: 'bleed', curse: 'curse', holy: 'holy' };

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
    this.anim = { open: 0, chips: 0, mult: 0, dmg: 0, step: -1, flash: 0, bookY: 30 };
    this.tw.to(this.anim, { open: 1 }, 0.45, { ease: 'outBack' });
    this.floats = [];
    this.banners = [];
    this.t = 0;
    this.hover = null;
    this.shake = 0;
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
    this.refresh();
  }

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
        au.play('chips_tick'); yield 0.32; continue;
      }
      if (this.mode === 'pickaxe') { au.play('card_flip', { pitch }); pitch += 0.08; this.floatAtSlot(s.idx ?? i - 1, s.notes.join(', ') || 'no effect', COLORS.gold); yield 0.38; continue; }
      if (s.kind === 'item') {
        const slotIdx = s.idx;
        if (s.chips) { a.chips = (s.totalChips ?? a.chips) - (s.mult || s.xmult !== 1 ? 0 : 0); this.floatAtSlot(slotIdx, `+${s.chips}`, COLORS.chips); au.play('chips_tick', { pitch }); pitch += 0.06; yield 0.2; }
        if (s.mult) { this.floatAtSlot(slotIdx, `+${s.mult} Mult`, COLORS.mult); au.play('mult_tick', { pitch }); pitch += 0.06; yield 0.2; }
        if (s.xmult && s.xmult !== 1) { this.floatAtSlot(slotIdx, `×${s.xmult}`, COLORS.xmult, true); au.play('xmult', { pitch }); this.shake = 0.25; pitch += 0.08; yield 0.28; }
        for (const n of s.notes) if (/ECHO|Amber|Trophy|Grade/.test(n)) this.floatAtSlot(slotIdx, n, COLORS.gold);
        for (const e of Object.keys(ELEMENT_ICON)) if (s[e]) { this.floatAtSlot(slotIdx, `{@${ELEMENT_ICON[e]}}+${s[e]}`, COLORS[e]); }
        a.chips = s.totalChips; a.mult = s.totalMult;
        this.pulse = { slot: slotIdx, t: 0.25 };
        if (!s.chips && !s.mult && s.xmult === 1) { au.play('card_flip', { pitch }); yield 0.22; }
        continue;
      }
      // synergy / recipe / fx
      a.mult = s.totalMult; a.chips = s.totalChips;
      const isRecipe = s.kind === 'recipe';
      this.banners.push({ text: s.text, desc: s.desc, t: 0, recipe: isRecipe });
      au.play(isRecipe ? 'recipe_discover' : 'synergy', { pitch: isRecipe ? 1 : pitch });
      this.shake = 0.5;
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
      yield 0.9;
    }
    yield 0.25;
    this.startHammer();
  }

  floatAtSlot(i, text, color, big = false) {
    const p = this.slotPos(Math.max(0, i));
    this.floats.push({ x: p.x + 11, y: p.y - 2, text, color, big, t: 0 });
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
    let pattern = bp.rhythm.slice();
    // variation: occasionally swap a beat for an off-beat so it never feels identical
    if (pattern.length > 3 && rnd.chance(0.5)) { const k = rnd.int(1, pattern.length - 2); if (!pattern.includes(pattern[k] + 1) && pattern[k] + 1 < 8) pattern[k] += 1; }
    this.notes = pattern.map((p, i) => ({ time: t0 + p * beat / 2, i, res: null, dx: [-26, 22, -8, 30, -18, 12, 0][i % 7], dy: [-6, 4, -10, 0, 6, -4, 2][i % 7] }));
    this.hammer = { start, t0, beat, end: this.notes[this.notes.length - 1].time + 0.5, combo: 0, heat: 1, countIn: [0, 1, 2, 3].map((k) => start + k * beat) };
    this.hits = [];
    this.anim.bookHide = 0;
    this.tw.to(this.anim, { bookHide: 1 }, 0.4, { ease: 'inBack' });
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
    return { x: ui.w / 2, y: ui.h / 2 + 10 };
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
    if (r === 'miss') {
      h.combo = 0;
      au.play('hammer_miss');
      ui.float('MISS', x, y - 10, { color: '#8a8078', vy: -14 });
      return;
    }
    h.combo++;
    const perfect = r === 'perfect';
    au.play(perfect ? 'hammer_perfect' : 'hammer_good', { pitch: 1 + Math.min(h.combo, 8) * 0.03 });
    if (perfect) au.play('anvil_ring', { vol: 0.5, pitch: 1 + h.combo * 0.04 });
    ui.float(perfect ? 'PERFECT!' : 'GOOD', x, y - 12, { big: perfect, scale: 1, top: perfect ? '#fff6c8' : '#e0ffe0', bottom: perfect ? '#ffb63d' : '#5fd17a', color: '#7dff8a', vy: -20 });
    ui.burst(x, y, perfect ? 26 : 12, { colors: ['#fff6c8', '#ffd25e', '#ff8a3a', '#ffffff'], speed: perfect ? 140 : 90, gravity: 220, kind: 'spark', life: 0.7, up: 40 });
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

  // -------------------------------------------------------------- update/draw
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    this.tw.update(dt); this.co.update(dt);
    this.shake = Math.max(0, this.shake - dt * 2);
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

  // layout helpers
  layout() {
    const ui = this.game.ui;
    const W = 340, H = 168;
    const x = Math.round(ui.w / 2 - W / 2 + 14), y = Math.round(this.anim.bookY + (1 - this.anim.open) * -220 - (this.anim.bookHide || 0) * 260);
    return { x, y, W, H, lx: x + 8, rx: x + W / 2 + 4, pw: W / 2 - 12 };
  }
  slotPos(i) {
    const L = this.layout();
    const n = this.slots();
    const sw = 24, gap = 4;
    const total = n * sw + (n - 1) * gap;
    return { x: Math.round(L.rx + (L.pw - total) / 2 + i * (sw + gap)), y: L.y + 30 };
  }

  draw(ui) {
    if (!this.active) return;
    const inp = this.game.input;
    if (this.state === 'select' || this.state === 'calc') this.drawBook(ui);
    if (this.state === 'select') this.drawHand(ui);
    if (this.state === 'hammer') this.drawHammer(ui);
    if (this.state === 'result') this.drawResult(ui);
    // floats
    for (const f of this.floats) {
      const k = f.t / 1.1;
      const y = f.y - ease.outCubic(Math.min(1, k * 1.6)) * 16;
      ui.ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      if (f.big) { const img = bigText(f.text, { scale: 2, top: '#fff0c0', bottom: '#ff7a3d' }); ui.img(img, Math.round(f.x - img.width / 2), Math.round(y - 10)); }
      else ui.text(f.text, f.x, y, { align: 'center', color: f.color, outline: '#140c10', thick: true });
      ui.ctx.globalAlpha = 1;
    }
    if (inp.actionPressed('back') && this.state === 'select' && this.tab !== 'forge') this.tab = 'forge';
  }

  drawBook(ui) {
    const L = this.layout();
    const sx = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake * 6) : 0;
    const x = L.x + sx, y = L.y;
    // cover + pages
    ui.panel('leather', x - 8, y - 6, L.W + 16, L.H + 14, { tone: 'red' });
    ui.panel('parchment', x, y, L.W / 2, L.H, { seed: 3, burnt: 0 });
    ui.panel('parchment', x + L.W / 2, y, L.W / 2, L.H, { seed: 4, burnt: 0 });
    // spine shadow
    for (let i = 0; i < 6; i++) ui.rect(x + L.W / 2 - 3 + i, y + 2, 1, L.H - 4, '#3a2414', 0.35 - Math.abs(i - 2.5) * 0.1);
    // ribbon bookmark
    ui.rect(x + L.W - 30, y + L.H - 2, 5, 16, '#a8282e'); ui.rect(x + L.W - 30, y + L.H + 12, 2, 3, '#a8282e'); ui.rect(x + L.W - 27, y + L.H + 12, 2, 3, '#a8282e');
    // tabs on the left (blueprints) + top tabs (Forge / Codex / Tools)
    if (this.mode === 'weapon') {
      this.bps.forEach((b, i) => {
        const tx = x - 22, ty = y + 8 + i * 22;
        const on = b === this.bp;
        ui.panel('leather', tx + (on ? 0 : 4), ty, 22, 20, { tone: on ? 'red' : 'dark', stitch: false, rivets: false });
        ui.icon(BLUEPRINTS[b].icon, tx + (on ? 4 : 8), ty + 5);
        const h = ui.hit('bp-' + b, tx, ty, 22, 20);
        if (h.hover) ui.tooltip({ title: BLUEPRINTS[b].name, body: BLUEPRINTS[b].desc + `\n{chips}${BLUEPRINTS[b].chips} Chips{/} · {mult}${BLUEPRINTS[b].mult} Mult{/} · ${BLUEPRINTS[b].slots} slots · ${BLUEPRINTS[b].speed}s swing` });
        if (h.clicked && this.state === 'select' && b !== this.bp) {
          this.bp = b; this.game.audio.play('page_turn');
          while (this.sel.length > this.slots()) this.sel.pop();
          this.refresh();
        }
      });
    }
    const tabs = this.mode === 'weapon' ? ['forge', 'codex'] : ['forge', 'tools', 'codex'];
    tabs.forEach((t, i) => {
      const tx = x + 10 + i * 46, ty = y - 18;
      const on = this.tab === t;
      ui.panel('leather', tx, ty + (on ? 0 : 3), 44, 16, { tone: on ? 'brown' : 'dark', stitch: false, rivets: false });
      ui.text(t[0].toUpperCase() + t.slice(1), tx + 22, ty + 4 + (on ? 0 : 3), { align: 'center', font: 'body', color: on ? COLORS.gold : COLORS.dim });
      if (ui.hit('tab-' + t, tx, ty, 44, 16).clicked && this.state === 'select') { this.tab = t; this.game.audio.play('page_turn'); }
    });
    if (this.tab === 'codex') return this.drawCodex(ui, L, x, y);
    if (this.tab === 'tools') return this.drawTools(ui, L, x, y);

    const ink = '#3a2618', faint = '#7a5a3a';
    const bp = BLUEPRINTS[this.bp];
    // ---------------- left page: illustration + info
    const lx = x + 10;
    ui.text(this.opts.emergency ? '{bad}QUICK! RE-FORGE!{/}' : this.mode === 'pickaxe' ? 'Forge a Pickaxe' : 'Forge a Weapon', lx, y + 8, { color: ink });
    const preview = { bp: this.bp, ids: this.sel.map((s) => s.id), el: this.res.el, grade: 2, recipe: this.res.recipe };
    const spr = weaponSprite(preview, 48);
    const wob = this.state === 'calc' ? Math.sin(this.t * 20) * this.shake * 2 : 0;
    ui.img(spr, lx + 8 + wob, y + 22);
    // name
    const nm = this.sel.length ? this.res.name : bp.name;
    ui.text(nm, lx + 62, y + 24, { color: this.res.recipe ? '#a05a00' : ink, maxW: L.pw - 60 });
    if (this.mode === 'weapon') {
      ui.text(`{dim}${bp.speed}s swing · crit ×${bp.crit}{/}`, lx + 62, y + 48, { font: 'small', color: faint });
      // elements
      let ex = lx + 62;
      for (const e of Object.keys(ELEMENT_ICON)) if (this.res.el[e] > 0) { ui.icon(ELEMENT_ICON[e], ex, y + 57); ui.text(String(this.res.el[e]), ex + 10, y + 58, { font: 'small', color: ink }); ex += 22; }
    } else {
      ui.text('{dim}Base: 3 strikes{/}', lx + 62, y + 48, { font: 'small', color: faint });
    }
    // monster intel
    if (this.opts.monster) {
      const md = MONSTERS[this.opts.monster];
      ui.text(`vs ${md.name}`, lx, y + 82, { color: '#7a2a1a' });
      let ix = lx;
      if (md.weak.length) { ui.text('Weak:', ix, y + 95, { font: 'small', color: faint }); ix += 24; for (const e of md.weak) { ui.icon(ELEMENT_ICON[e] || 'question', ix, y + 93); ix += 11; } ix += 4; }
      if (md.resist.length) { ui.text('Resists:', ix, y + 95, { font: 'small', color: faint }); ix += 32; for (const e of md.resist) { ui.icon(ELEMENT_ICON[e] || 'question', ix, y + 93); ix += 11; } }
      if (md.armor) ui.text(`Armor ${md.armor}`, lx, y + 106, { font: 'small', color: faint });
    }
    // synergies list
    let sy = y + 118;
    for (const sid of this.res.synergies.slice(0, 3)) {
      const s = SYNERGIES.find((q) => q.id === sid);
      ui.text(`{@sparkle} {#a05a00}${s.name}{/}`, lx, sy, { font: 'body', color: ink });
      sy += 11;
    }
    if (this.hint) ui.text(`{#6a4a9a}→ ${RECIPES[this.hint.rid].name}? needs ${this.hint.missing.map((m) => MATERIALS[m].name).join(', ')}{/}`, lx, sy + 2, { font: 'small', maxW: L.pw - 4, color: ink });

    // ---------------- right page: slots + math
    const rx = L.rx + 2;
    ui.text('Ingredients', rx + L.pw / 2, y + 10, { align: 'center', color: ink });
    for (let i = 0; i < this.slots(); i++) {
      const p = this.slotPos(i);
      const it = this.sel[i];
      const pulse = this.pulse && this.pulse.slot === i ? 1 + this.pulse.t * 2 : 1;
      ui.panel('slot', p.x, p.y, 24, 24, { tone: 'leather' });
      if (it) {
        ui.img(materialSprite(it.id, 24), p.x + (pulse > 1 ? -1 : 0), p.y - (pulse > 1 ? 2 : 0));
        ui.rect(p.x, p.y + 22, 24, 2, RARITY[matOf(it).rarity].color);
        const h = ui.hit('slot' + i, p.x, p.y, 24, 24);
        if (h.hover) ui.tooltip(itemTooltip(it));
        if (h.clicked && this.state === 'select') this.toggle(it);
      } else ui.text(String(i + 1), p.x + 12, p.y + 9, { align: 'center', font: 'small', color: '#5a3a2a' });
    }
    if (this.mode === 'weapon') {
      // chips × mult = damage
      const by = y + 66;
      const cw = 48;
      const cx0 = Math.round(rx + L.pw / 2 - (cw * 2 + 14) / 2);
      ui.rect(cx0, by, cw, 18, '#1a3a6a'); ui.rect(cx0 + 1, by + 1, cw - 2, 16, '#2f6fc0'); ui.rect(cx0 + 1, by + 1, cw - 2, 2, '#5fa8ff');
      ui.text(String(Math.round(this.anim.chips)), cx0 + cw / 2, by + 6, { align: 'center', color: '#ffffff', outline: '#0a1a3a', outlineShadow: false });
      ui.text('×', cx0 + cw + 7, by + 6, { align: 'center', color: ink });
      const mx0 = cx0 + cw + 14;
      ui.rect(mx0, by, cw, 18, '#6a1a1a'); ui.rect(mx0 + 1, by + 1, cw - 2, 16, '#c83a3a'); ui.rect(mx0 + 1, by + 1, cw - 2, 2, '#ff7a6a');
      ui.text(String(Math.round(this.anim.mult * 10) / 10), mx0 + cw / 2, by + 6, { align: 'center', color: '#ffffff', outline: '#3a0a0a', outlineShadow: false });
      ui.text('Chips', cx0 + cw / 2, by - 8, { align: 'center', font: 'small', color: '#2f5fa0' });
      ui.text('Mult', mx0 + cw / 2, by - 8, { align: 'center', font: 'small', color: '#a03030' });
      const dmgVal = this.state === 'calc' ? this.anim.dmg : this.res.dmg;
      const showDmg = this.state === 'select' || this.anim.dmg > 0;
      if (showDmg) {
        const img = bigText(String(dmgVal), { scale: 2, top: '#fff6c8', bottom: dmgVal > 500 ? '#ff5a2a' : '#ffb63d' });
        ui.img(img, Math.round(rx + L.pw / 2 - img.width / 2), by + 24);
        ui.text('damage per hit', rx + L.pw / 2, by + 50, { align: 'center', font: 'small', color: faint });
      }
    } else {
      // pickaxe effects list
      let py = y + 62;
      const pk = this.res.pick || {};
      const total = 3 + (pk.strikes || 0);
      ui.text(`{@pickaxe} Strikes: {#7a2a1a}${total}{/}`, rx + 6, py, { color: ink }); py += 13;
      for (const k of Object.keys(pk)) if (k !== 'strikes') { ui.text(`• ${PICK_TEXT[k] || k}`, rx + 6, py, { font: 'body', color: ink, maxW: L.pw - 10 }); py += 11; if (py > y + L.H - 30) break; }
    }
    if (this.res.error && this.sel.length) ui.text(`{bad}${this.res.error}{/}`, rx + 4, y + L.H - 34, { font: 'small', maxW: L.pw - 6, color: ink });

    // banners during calc
    for (const b of this.banners) {
      if (b.t > 1.6) continue;
      const k = b.t / 1.6;
      const a = k < 0.1 ? k / 0.1 : k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
      const yy = y + L.H / 2 - 10 - this.banners.indexOf(b) * 0 - (1 - ease.outBack(Math.min(1, k * 4))) * 30;
      ribbonTitle(ui, b.text, x + L.W / 2, yy, b.recipe ? 'gold' : 'purple', a);
      if (b.desc) { ui.ctx.globalAlpha = a; ui.text(b.desc, x + L.W / 2, yy + 18, { align: 'center', font: 'body', color: '#fff6e0', outline: '#140c10', thick: true }); ui.ctx.globalAlpha = 1; }
    }

    // buttons
    if (this.state === 'select') {
      const bx = x + L.W - 92, byy = y + L.H + 10;
      if (ui.button('forge-go', bx, byy, 90, 22, 'FORGE!', { style: 'gold', icon: 'hammer', disabled: !this.res.valid, tip: this.res.valid ? null : this.res.error, key: 'SPACE' }) || (this.game.input.actionPressed('confirm') && this.res.valid)) this.forge();
      const label = this.mode === 'pickaxe' ? 'Old pick only' : this.opts.emergency ? 'Fists!' : 'No weapon';
      if (ui.button('forge-skip', x, byy, 84, 22, label, { style: 'stone', tip: this.mode === 'pickaxe' ? 'Dig with your trusty old pick: 3 strikes.' : 'Fight bare-handed or try to flee.' })) this.done(null);
    }
  }

  drawHand(ui) {
    const hand = this.hand();
    const n = hand.length;
    const cw = 48;
    const avail = Math.min(ui.w - 40, 560);
    const step = n > 1 ? Math.min(cw + 4, (avail - cw) / (n - 1)) : 0;
    const total = n > 1 ? step * (n - 1) + cw : cw;
    const x0 = Math.round(ui.w / 2 - total / 2);
    const y0 = ui.h - 72;
    if (!n) {
      ui.panel('dark', ui.w / 2 - 120, y0 + 10, 240, 34);
      ui.text(this.mode === 'pickaxe' ? 'No materials to make a pickaxe.' : '{bad}No forgeable materials!{/} Mine more ore.', ui.w / 2, y0 + 22, { align: 'center' });
      return;
    }
    // hover detection: top-most card under mouse (later cards drawn on top)
    let hovered = -1;
    for (let i = n - 1; i >= 0; i--) {
      const cx = x0 + i * step;
      if (ui.mx >= cx && ui.mx < cx + (i === n - 1 ? cw : Math.max(step, 6)) && ui.my >= y0 - 16 && ui.my < y0 + 64) { hovered = i; break; }
    }
    hand.forEach((it, i) => {
      const selected = this.sel.includes(it);
      const cx = Math.round(x0 + i * step);
      const lift = (selected ? 14 : 0) + (i === hovered ? 6 : 0);
      const wob = Math.sin(this.t * 2 + i * 0.7) * 1;
      const card = materialCard({ ...it, bagBonus: undefined }, { selected });
      drawCard(ui, card, cx, Math.round(y0 + wob), { lift, hover: i === hovered });
      if (selected) ui.rect(cx + 20, y0 - lift - 5, 8, 2, '#ffd25e');
      const hitW = i === n - 1 ? cw : Math.max(6, step);
      const h = ui.hit('card' + it.uid, cx, y0 - lift, hitW, 64, { sound: false });
      if (i === hovered) {
        const tt = itemTooltip(it);
        ui.tooltip(tt);
      }
      if (h.clicked) this.toggle(it);
    });
    ui.text(`{dim}Click cards to add them · ${this.sel.length}/${this.slots()} slots{/}`, ui.w / 2, ui.h - 8, { align: 'center', font: 'small' });
  }

  drawHammer(ui) {
    const now = this.now();
    const h = this.hammer;
    const p = this.anvilScreen();
    // heat glow behind the anvil
    const ctx = ui.ctx;
    // count-in
    const ci = h.countIn.filter((t) => now >= t).length;
    if (now < h.t0) {
      const label = ['3', '2', '1', 'STRIKE!'][Math.max(0, ci - 1)] || 'Ready…';
      if (ci > 0) ui.big(label, ui.w / 2, 70, { scale: ci === 4 ? 2 : 3, top: '#fff6c8', bottom: '#ff8a3a' });
      else ui.big('Ready…', ui.w / 2, 70, { scale: 2 });
    }
    // notes: approach rings converging on spots on the hot metal
    for (const n of this.notes) {
      const x = p.x + n.dx, y = p.y + n.dy;
      const dt = n.time - now;
      if (n.res) continue;
      if (dt > h.beat * 2) continue;
      const k = clamp(dt / (h.beat * 2), 0, 1);
      const r = 5 + k * 26;
      const a = 1 - k * 0.5;
      // target spot (glowing metal)
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#ffe08a'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
      ctx.fillStyle = '#fff6c8'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      ctx.globalAlpha = 1;
      ring(ctx, x, y, 6, '#ffb63d', 1, 0.9);
      ring(ctx, x, y, r, dt < 0.06 && dt > -0.06 ? '#ffffff' : '#ffd25e', 2, a);
    }
    // judgement line / hint
    const total = this.notes.length, done = this.notes.filter((n) => n.res).length;
    ui.panel('dark', ui.w / 2 - 90, ui.h - 40, 180, 30);
    prompt(ui, ui.w / 2 - 80, ui.h - 30, 'SPACE', 'or click on the beat!', this.t);
    // progress pips
    for (let i = 0; i < total; i++) {
      const r = this.notes[i].res;
      ui.rect(ui.w / 2 - total * 5 + i * 10, ui.h - 50, 8, 4, r === 'perfect' ? '#ffb63d' : r === 'good' ? '#5fd17a' : r === 'miss' ? '#5a4a4a' : '#2a2030');
    }
    if (h.combo >= 2) ui.text(`Combo ×${h.combo}`, ui.w / 2, ui.h - 62, { align: 'center', color: COLORS.gold, outline: '#140c10', thick: true });
    void done;
  }

  drawResult(ui) {
    const g = GRADES[this.grade];
    const k = this.anim.reveal || 0;
    const cx = ui.w / 2;
    ui.ctx.globalAlpha = Math.min(1, k * 1.5);
    ribbonTitle(ui, g.name.toUpperCase(), cx, 24, this.grade === 4 ? 'gold' : this.grade >= 3 ? 'blue' : this.grade >= 2 ? 'green' : 'brown', Math.min(1, k * 1.5));
    if (this.mode === 'weapon') {
      const card = weaponCard(this.weapon);
      const s = 0.6 + 0.4 * k;
      const ctx = ui.ctx;
      ctx.save();
      ctx.translate(Math.round(cx), Math.round(ui.h / 2 - 10));
      ctx.scale(Math.round(s * 4) / 4, Math.round(s * 4) / 4);
      ctx.drawImage(card, -Math.round(card.width / 2), -Math.round(card.height / 2));
      ctx.restore();
      if (this.grade === 4) ui.burst(cx + (Math.random() - 0.5) * 80, ui.h / 2 + (Math.random() - 0.5) * 100, 1, { colors: ['#ffe08a', '#fff'], kind: 'star', speed: 10, gravity: -10, life: 0.8 });
    } else {
      const lines = [this.weapon.name, `{@pickaxe} ${3 + (this.weapon.pick.strikes || 0)} strikes`, ...Object.keys(this.weapon.pick).filter((q) => q !== 'strikes').map((q) => '• ' + (PICK_TEXT[q] || q))];
      ui.panel('parchment', cx - 90, ui.h / 2 - 50, 180, 24 + lines.length * 11);
      lines.forEach((l, i) => ui.text(l, cx, ui.h / 2 - 40 + i * 11, { align: 'center', color: '#3a2618' }));
    }
    ui.ctx.globalAlpha = 1;
    if (k >= 1 && (ui.button('forge-take', cx - 50, ui.h - 50, 100, 22, this.mode === 'weapon' ? 'Fight!' : 'Dig!', { style: 'gold', key: 'SPACE' }) || this.game.input.actionPressed('confirm'))) this.done(this.weapon);
  }

  drawCodex(ui, L, x, y) {
    const ink = '#3a2618';
    ui.text('Secret Weapons', x + L.W / 4, y + 8, { align: 'center', color: ink });
    const ids = Object.keys(RECIPES);
    const per = 6;
    const page = this.codexPage || 0;
    const shown = ids.slice(page * per * 2, page * per * 2 + per * 2);
    shown.forEach((rid, i) => {
      const r = RECIPES[rid];
      const col = i < per ? 0 : 1;
      const row = i % per;
      const px = x + 8 + col * (L.W / 2), py = y + 22 + row * 23;
      const known = this.run.recipes.includes(rid);
      ui.icon(BLUEPRINTS[r.bp].icon, px, py + 2, { alpha: known ? 1 : 0.4 });
      ui.text(known ? r.name : '? ? ?', px + 12, py, { color: known ? '#7a3a00' : '#8a7a6a' });
      if (known) r.ings.forEach((ing, k) => ui.img(materialSprite(ing, 12), px + 12 + k * 13, py + 9));
      else ui.text(r.hint, px + 12, py + 10, { font: 'small', color: '#8a7a6a', maxW: L.W / 2 - 24 });
      if (ui.hit('codex' + rid, px, py, L.W / 2 - 12, 22).hover && known) ui.tooltip({ title: r.name, body: `${BLUEPRINTS[r.bp].name}: ${r.ings.map((q) => MATERIALS[q].name).join(' + ')}\n${r.text}` });
    });
    if (ids.length > per * 2) {
      if (ui.button('codex-next', x + L.W - 40, y + L.H - 20, 32, 14, '>', { style: 'wood', font: 'small' })) this.codexPage = (page + 1) % Math.ceil(ids.length / (per * 2));
    }
    ui.text(`{dim}${this.run.recipes.length}/${ids.length} discovered{/}`, x + 8, y + L.H - 14, { font: 'small' });
  }

  drawTools(ui, L, x, y) {
    const ink = '#3a2618';
    ui.text('Mining Tools', x + L.W / 4, y + 8, { align: 'center', color: ink });
    const bag = this.run.bag;
    TOOL_RECIPES.forEach((tr, i) => {
      const px = x + 8 + (i % 2) * (L.W / 2), py = y + 24 + Math.floor(i / 2) * 44;
      const m = MATERIALS[tr.out];
      ui.img(materialSprite(tr.out, 24), px, py);
      ui.text(m.name, px + 28, py, { color: ink });
      const opts = [tr.needs, tr.alt].filter(Boolean);
      const usable = opts.find((need) => need.every(([id, n]) => bag.items.filter((it) => it.id === id).length >= n));
      tr.needs.forEach(([id, n], k) => { ui.img(materialSprite(id, 12), px + 28 + k * 22, py + 12); ui.text('×' + n, px + 41 + k * 22, py + 14, { font: 'small', color: ink }); });
      if (ui.button('craft' + tr.out, px + 28, py + 26, 60, 14, 'Craft', { style: usable ? 'wood' : 'stone', disabled: !usable, font: 'small', tip: m.desc })) {
        for (const [id, n] of usable) for (let k = 0; k < n; k++) bag.remove(bag.items.find((it) => it.id === id));
        bag.add(makeItem(tr.out, 2));
        this.game.audio.play('anvil_ring');
        this.game.ui.toast(`Crafted ${m.name}`, { icon: 'tool' });
        this.refresh();
      }
    });
  }
}

const PICK_TEXT = {
  magnetic: 'Magnetic: pulls adjacent metals', gemDupe: 'Crystal: first gem doubled', cursed: 'Cursed: 3×3 strikes, -1 quality',
  lucky: 'Lucky: better ores, junk turns rare', smelt: 'Smelt: metals +1 quality', hard: 'Breaks hard rock in 1 hit', freeze: 'Hazards frozen',
  chain: 'Chain: connected ores break together', reveal: 'Glint: shows hidden rarity', column: 'Starfall: first strike breaks a column',
  area: 'Each strike also breaks the tile below', preserve: 'Preserve: no quality loss', unlock: 'Opens treasure pockets', archaeo: 'Fossils +1 quality',
  seehaz: 'Reveals hazards', quality: 'Gems +1 quality', melt: 'Melts ice ores!',
};
