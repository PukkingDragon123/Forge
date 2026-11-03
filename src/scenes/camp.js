// A camp site in the caves (docs/REDESIGN.md §5.5): you, Pip and the friends you've rescued, resting
// round a small fire in a dungeon nook. You have time for ONE thing — Rest, Cook or Forge — and
// each rescued friend adds one free thing of their own (Bran forges, Durgan cooks, Elio enchants,
// Clover scouts). Everything is chosen by touching it in the world: the bedroll, the pot, the anvil.
//   game.go('camp', { node, onDone })   onDone defaults to flow.finishNode
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import * as Stages from '../models/stage_vox.js';
import { buildProp } from '../models/props.js';
import * as Chars from '../models/characters.js';
import * as Pets from '../models/pet.js';
import { makeWorld, hud, speech, bark } from './common.js';
import * as Flow from './flow.js';
import { openForge } from './forgeui.js';
import { previewStew, cook, isCookable, POT_MAX, POT_MIN, stewBook } from '../systems/cooking.js';
import { STEW_FX, STEW_FX_ORDER } from '../data/stews.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { CHARACTERS } from '../data/characters.js';
import { ACTS } from '../data/regions.js';
import { ELEMENTS } from '../systems/forge.js';
import { itemTooltip } from '../systems/items.js';
import { materialSprite } from '../art/sprites.js';
import { tagCanvas, glowCanvas } from '../art/handpaint.js';
import { arrowSign } from '../art/room_art.js';
import { scrap } from '../ui/frames.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const INK = '#3a2214', FAINT = '#7a5634';
const KNACK = { bran: 'forge', durgan: 'cook', elio: 'enchant', clover: 'scout' };
const KNACK_LABEL = { forge: 'Forge', cook: 'Cook', enchant: 'Enchant', scout: 'Scout' };
const ELEMENT_OF = { ember: 'fire', rime: 'ice', storm: 'shock', venomite: 'poison' };
const HEAL_K = 0.3;

/** Play the first animation of `names` the model knows (falls back to idle). */
function playAny(c, names, opts = { loop: true }) {
  const known = Chars.ANIM_NAMES;
  for (const n of names) if (!known || known.includes(n)) { c.play(n, opts); if (!known || c.anim === n) return n; }
  c.play('idle', { loop: true });
  return 'idle';
}

/** Text with a fade (ui.text has no alpha of its own). */
function textA(ui, str, x, y, opts, a) { const c = ui.ctx, a0 = c.globalAlpha; c.globalAlpha = a0 * Math.max(0, Math.min(1, a)); ui.text(str, x, y, opts); c.globalAlpha = a0; }

export class CampScene extends Scene {
  enter(params = {}) {
    const game = this.game, run = game.run;
    this.p = params;
    this.run = run;
    const kinds = Stages.STAGE_KINDS || [];
    this.set = kinds.includes('campsite') ? Stages.buildStage('campsite', run.act, {}) : Stages.buildStage('campfire', 0, {});
    this.w = makeWorld(this.set, { fogDensity: 0.03 });
    this.world = this.w;
    this.world.post = { bloom: 0.8, vignette: 0.42, saturation: 1.1 };
    this.set.setCamera && this.set.setCamera(this.w.rig.camera);
    const A = this.set.anchors || {};
    this.fire = (A.fire || V(0, 0, 0)).clone();
    this.anvil = (A.anvil || this.fire.clone().add(V(1.9, 0, 0.9))).clone();
    this.pot = (A.pot || this.fire).clone();
    if (!A.pot) { const pot = buildProp('cookpot', {}); pot.position.copy(this.pot); this.w.scene.add(pot); this.potProp = pot; }
    if (!A.anvil) { const anv = buildProp('anvil', {}); anv.position.copy(this.anvil); anv.rotation.y = -0.6; this.w.scene.add(anv); }
    // seats: the hero front-left, friends around the fire
    const seats = (A.seats || []).slice();
    while (seats.length < 4) { const a = seats.length * 1.6 + 0.8; seats.push({ pos: V(Math.cos(a) * 1.6, 0.3, Math.sin(a) * 1.4), rotY: 0, height: 0.3 }); }
    const order = [2, 0, 1, 3];
    this.chars = {};
    const sit = (id, seat, anims) => {
      const c = Chars.buildCharacter(id);
      c.group.position.set(seat.pos.x, 0, seat.pos.z);
      c.group.rotation.y = Math.atan2(this.fire.x - seat.pos.x, this.fire.z - seat.pos.z);
      c.setSeated && c.setSeated(true, seat.height ?? 0.3);
      playAny(c, anims);
      this.w.scene.add(c.group);
      this.chars[id] = c;
      return c;
    };
    this.hero = sit(run.char, seats[order[0]], ['sit']);
    this.heroSeat = seats[order[0]];
    const IDLE = { bran: ['polish', 'sit'], durgan: ['stir', 'sit'], elio: ['read', 'sit'], clover: ['count', 'sit'] };
    run.companions.forEach((id, i) => sit(id, seats[order[i + 1]], IDLE[id] || ['sit']));
    // a bedroll by the hero
    const bed = buildProp('sleepingbag', {});
    this.bed = this.heroSeat.pos.clone().add(V(-0.6, 0, 0.55));
    bed.position.set(this.bed.x, 0, this.bed.z); bed.rotation.y = 0.5;
    this.w.scene.add(bed);
    // Pip curls up by the fire
    this.pet = Pets.buildPet ? Pets.buildPet() : null;
    if (this.pet) { this.pet.group.position.copy(this.fire).add(V(-0.75, 0, 0.75)); this.pet.group.rotation.y = 0.9; playAny(this.pet, ['sleep', 'idle']); this.w.scene.add(this.pet.group); }
    // camera: a cosy three-quarter view of the fire
    const f = this.fire;
    this.home = { pos: [f.x + 0.4, f.y + 2.2, f.z + 5.6], look: [f.x - 0.2, f.y + 0.5, f.z - 0.1], fov: 38 };
    this.w.rig.cut(this.home.pos, this.home.look, this.home.fov);
    this.state = 'menu';
    this.mainUsed = false;
    this.bonusUsed = {};
    this.pot_ = [];          // items in the pot
    this.cookAnim = null;
    this.forge = null;
    this.banner = null;
    this.bubble = null;
    this.pick = null;        // enchant: choose a crystal
    this.showBook = false;
    this.t = 0;
    this.crackle = game.audio.loop && game.audio.loop('campfire');
    game.audio.music && game.audio.music('camp');
    this.say(bark(run.char, 'cook'), run.char, 2.4);
  }
  exit() { this.crackle && this.crackle.stop && this.crackle.stop(1); }

  // ---------------------------------------------------------------- helpers
  proj(v, ui) { return this.w.rig.project(v, ui.w, ui.h); }
  say(text, who, dur = 2.4) { if (text) this.bubble = { text, who, t: dur }; }
  tag(ui, id, x, y, text, opts = {}) {
    const w = ui.measure(text) + 16 + (opts.icon ? 12 : 0);
    const c = tagCanvas(w);
    const bx = Math.round(clamp(x - c.width / 2, 4, ui.w - c.width - 4)), by = Math.round(y);
    const h = id ? ui.hit(id, bx + 2, by + 4, c.width - 4, c.height - 4, { sound: false }) : { hover: false, clicked: false };
    const lift = h.hover && !opts.dim ? 2 : 0;
    ui.img(c, bx, by - lift, { alpha: opts.dim ? 0.55 : 1 });
    if (opts.icon) ui.icon(opts.icon, bx + 9, by + 10 - lift);
    ui.text(text, bx + 10 + (opts.icon ? 12 : 0), by + 11 - lift, { color: opts.color || INK });
    return opts.dim ? { hover: h.hover, clicked: false } : h;
  }
  actionsLeft() {
    const out = [];
    if (!this.mainUsed) out.push('rest', 'cook', 'forge');
    for (const id of this.run.companions) if (!this.bonusUsed[id]) out.push(id);
    return out;
  }
  spend(kind, by) {
    if (by) this.bonusUsed[by] = true; else this.mainUsed = true;
    this.game.audio.play('click');
  }
  toHome(dur = 0.9) { this.w.rig.moveTo(this.home.pos, this.home.look, this.home.fov, dur, 'inOutCubic'); }

  // ---------------------------------------------------------------- actions
  begin(kind, by = null) {
    this.by = by;
    const run = this.run;
    if (kind === 'rest') {
      this.spend('rest');
      this.state = 'rest';
      this.restT = 0;
      const n = run.heal(Math.round(run.maxHp * HEAL_K));
      this.healed = n;
      this.hero.setSeated && this.hero.setSeated(false);
      playAny(this.hero, ['sleep', 'sit']);
      this.hero.group.position.set(this.bed.x, 0, this.bed.z);
      this.game.audio.play('heal');
      this.w.rig.moveTo([this.bed.x + 0.6, 1.4, this.bed.z + 2.4], [this.bed.x, 0.3, this.bed.z], 34, 1.1, 'inOutCubic');
    } else if (kind === 'cook') {
      this.state = 'cook';
      this.pot_ = [];
      const p = this.pot;
      this.w.rig.moveTo([p.x + 1.1, p.y + 2.5, p.z + 4.0], [p.x - 0.25, p.y + 0.55, p.z], 36, 0.8, 'inOutCubic');
      playAny(this.hero, ['stir', 'sit']);
      this.game.audio.play('ladle', { vol: 0.6 });
    } else if (kind === 'forge') {
      this.state = 'forge';
      this.forge = openForge(this, {
        mode: 'weapon', camp: true, anvil: this.anvil, rig: this.w.rig, world: this.w,
        onStrike: () => { this.game.hitStop(0.02); },
        onDone: (res) => this.forged(res),
      });
    } else if (kind === 'enchant') {
      const crystals = run.bag.all().filter((it) => ELEMENT_OF[it.id]);
      this.state = 'enchant';
      this.pick = crystals;
    } else if (kind === 'scout') {
      this.spend('scout', 'clover');
      run.flags.scout = run.act;
      this.banner = { text: 'Clover scouts ahead', sub: 'The map shows what waits behind each ?', t: 0, icon: 'event' };
      this.game.audio.play('map_unfold');
      const c = this.chars.clover; if (c) playAny(c, ['point', 'cheer'], {});
    }
  }

  forged(res) {
    const run = this.run;
    this.forge = null;
    this.state = 'menu';
    this.toHome(1);
    if (!res) return; // walked away from the anvil: nothing spent
    if (res.pick) {
      run.pick = { swings: 3 + (res.pick.strikes || 0), quality: res.grade >= 3 ? 1 : 0, perks: { ...res.pick }, name: res.name };
      this.banner = { text: res.name, sub: `${run.pick.swings} swings per vein`, t: 0, icon: 'pickaxe' };
    } else {
      const old = run.weapon;
      run.equip(res);
      this.banner = { text: res.name, sub: old ? `${old.name} is left behind` : 'Fresh steel. No stone.', t: 0, icon: res.bp };
    }
    this.spend('forge', this.by === 'bran' ? 'bran' : null);
    playAny(this.hero, ['cheer', 'sit'], {});
    this.later = 1.4;
  }

  doCook() {
    const run = this.run;
    const items = this.pot_.slice();
    const res = cook(run, items);
    if (!res.ok) { this.game.audio.play('deny'); return; }
    if (res.recipe && res.fresh) run.learnStew && run.learnStew(res.recipe);
    this.spend('cook', this.by === 'durgan' ? 'durgan' : null);
    this.cookAnim = { t: 0, res, items };
    this.pot_ = [];
    this.game.audio.play('cook_add');
  }

  enchant(it) {
    const run = this.run;
    const el = ELEMENT_OF[it.id];
    run.removeItem(it);
    const w = run.weapon;
    w.el = { ...(w.el || {}) };
    w.el[el] = (w.el[el] || 0) + 3;
    this.spend('enchant', 'elio');
    this.state = 'menu';
    this.pick = null;
    this.banner = { text: `${w.name}: +3 ${el}`, sub: 'Kindle breathes on the blade', t: 0, icon: el === 'fire' ? 'fire' : el };
    this.game.audio.play('synergy');
    const a = this.anvil;
    this.w.sparks.emit({ pos: [a.x, a.y + 0.7, a.z], radial: [0.6, 2], radialUp: 1.4, count: 30, life: [0.3, 0.8], size: 1, color: ['#fff0b0', '#ffb040', '#9ae8ff'], glow: 4, gravity: 4 });
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    const game = this.game;
    const done = () => {
      if (this.p.onDone) return this.p.onDone();
      if (Flow.finishNode) return Flow.finishNode(game);
      if (Flow.finish) return Flow.finish(game);
      return game.go('delve', {});
    };
    if (this.run.bag.overflow.length && Flow.openBag) Flow.openBag(game, { title: 'Camp', onClose: done });
    else done();
  }

  // ---------------------------------------------------------------- loop
  update(dt) {
    this.t += dt;
    this.w.rig.update(dt); this.w.sparks.update(dt); this.w.dust.update(dt);
    this.set.update && this.set.update(dt, this.time);
    for (const id in this.chars) this.chars[id].update(dt);
    if (this.pet) this.pet.update(dt);
    if (this.bubble) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.8) this.banner = null; }
    if (this.later !== undefined) { this.later -= dt; if (this.later <= 0) { this.later = undefined; playAny(this.hero, ['sit']); } }
    if (this.forge) this.forge.update(dt);
    if (this.state === 'rest') {
      this.restT += dt;
      if (Math.random() < dt * 2) this.w.dust.emit({ pos: [this.bed.x, 0.6, this.bed.z], vel: [0.05, 0.25, 0], spread: 0.05, life: [1.2, 2], size: 1, color: '#e8e0ff', alpha: 0.6 });
      if (this.restT > 2.6) {
        this.state = 'menu';
        this.hero.group.position.set(this.heroSeat.pos.x, 0, this.heroSeat.pos.z);
        this.hero.setSeated && this.hero.setSeated(true, this.heroSeat.height ?? 0.3);
        playAny(this.hero, ['sit']);
        this.toHome();
      }
    }
    if (this.cookAnim) {
      const c = this.cookAnim;
      c.t += dt;
      const p = this.pot;
      if (Math.random() < dt * 18) this.w.dust.emit({ pos: [p.x + rnd.float(-0.15, 0.15), p.y + 0.55, p.z + rnd.float(-0.1, 0.1)], vel: [0, 0.6, 0], spread: 0.1, life: [1, 2], size: [1, 2], sizeEnd: 3, color: '#f0e8e0', alpha: 0.5, fadeIn: 0.2 });
      if (c.t > 0.9 && !c.boiled) { c.boiled = true; this.game.audio.play('stew_bubble'); this.w.sparks.emit({ pos: [p.x, p.y + 0.5, p.z], radial: [0.4, 1.4], radialUp: 1.8, count: 26, life: [0.4, 0.9], size: 1, color: [c.res.color || '#ffd27a', '#fff0c0'], glow: 3, gravity: 3 }); }
      if (c.t > 1.5 && !c.served) {
        c.served = true;
        this.game.audio.play('cook_done');
        this.banner = { text: c.res.name, sub: c.res.fresh ? 'New recipe!' : '', t: 0, icon: c.res.icon, lines: c.res.lines };
        if (c.res.healed) this.game.ui.float(`+${c.res.healed}`, this.game.ui.w / 2, this.game.ui.h / 2 - 40, { big: true, top: '#d8ffe0', bottom: '#6dff9a' });
        playAny(this.hero, ['sitEat', 'drink', 'cheer'], {});
        this.later = 1.8;
      }
      if (c.t > 2.4) { this.cookAnim = null; this.state = 'menu'; this.toHome(); }
    }
    const inp = this.game.input;
    if (inp.actionPressed('back')) {
      if (this.state === 'cook' && !this.cookAnim) { this.state = 'menu'; this.pot_ = []; this.toHome(); playAny(this.hero, ['sit']); }
      else if (this.state === 'enchant') { this.state = 'menu'; this.pick = null; }
      else if (this.showBook) this.showBook = false;
    }
    if (inp.actionPressed('bag') && Flow.openBag && this.state === 'menu') Flow.openBag(this.game, {});
  }

  // ---------------------------------------------------------------- draw
  draw(ui) {
    if (this.forge && this.forge.active) { this.forge.draw(ui); return; }
    const run = this.run;
    if (this.state === 'menu') this.drawMenu(ui);
    else if (this.state === 'cook') this.drawCook(ui);
    else if (this.state === 'enchant') this.drawEnchant(ui);
    else if (this.state === 'rest') {
      const k = Math.sin(clamp(this.restT / 2.6, 0, 1) * Math.PI);
      ui.rect(0, 0, ui.w, ui.h, '#05040a', 0.55 * k);
      const p = this.proj(this.bed.clone().add(V(0, 0.6, 0)), ui);
      for (let i = 0; i < 3; i++) {
        const z = ((this.restT * 0.8 + i * 0.33) % 1);
        textA(ui, 'z', p.x + 6 + z * 18 + i * 4, p.y - z * 40, { font: i === 2 ? 'large' : 'body', color: '#e8e0ff' }, Math.sin(z * Math.PI));
      }
      if (this.restT > 0.6) textA(ui, `{heal}+${this.healed} HP{/}`, ui.w / 2, ui.h / 2 + 40, { align: 'center', outline: '#140c10' }, k);
    }
    this.drawBanner(ui);
    if (this.bubble) {
      const c = this.chars[this.bubble.who];
      if (c) { const p = this.proj(c.headPos ? c.headPos() : c.group.position.clone().add(V(0, 1.1, 0)), ui); speech(ui, p.x, p.y, this.bubble.text, { alpha: clamp(this.bubble.t * 3, 0, 1) }); }
    }
    const h = hud(ui, this.game);
    if (h && h.bagClicked && Flow.openBag) Flow.openBag(this.game, {});
    void run;
  }

  drawMenu(ui) {
    const run = this.run;
    const bob = (k) => Math.round(Math.sin(this.t * 2 + k) * 2);
    const heal = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * HEAL_K));
    const spots = [
      { id: 'rest', at: this.bed.clone().add(V(0, 0.7, 0)), label: heal > 0 ? `Rest +${heal}` : 'Rest', icon: 'heart', tip: `Heal ${Math.round(HEAL_K * 100)}% HP.` },
      { id: 'cook', at: this.pot.clone().add(V(0, 1.0, 0)), label: 'Cook', icon: 'campfire', tip: 'Stew from forage and parts.' },
      { id: 'forge', at: this.anvil.clone().add(V(0, 0.95, 0)), label: run.weapon ? 'Forge' : 'Forge a blade', icon: 'hammer', tip: run.weapon ? `${run.weapon.name}: ${Math.round((run.weapon.stone || 0) * 100)}% stone.` : 'No blade — the pickaxe will do… barely.' },
    ];
    if (!this.mainUsed) {
      for (const s of spots) {
        const p = this.proj(s.at, ui);
        const h = this.tag(ui, 'camp-' + s.id, p.x, p.y - 22 + bob(p.x), s.label, { icon: s.icon });
        if (h.hover) ui.tooltip({ body: s.tip, w: 150 });
        if (h.clicked) this.begin(s.id);
      }
      if (this.t < 6) textA(ui, 'One thing before you move on', ui.w / 2, ui.h - 22, { align: 'center', font: 'small', color: '#e8d8b8', outline: '#140c10' }, clamp(6 - this.t, 0, 1));
    }
    // friends' knacks: a tag above each rescued friend
    for (const id of run.companions) {
      const c = this.chars[id];
      if (!c || this.bonusUsed[id]) continue;
      const kind = KNACK[id];
      const dim = kind === 'enchant' && (!run.weapon || !run.bag.all().some((it) => ELEMENT_OF[it.id]));
      const p = this.proj(c.headPos ? c.headPos().add(V(0, 0.35, 0)) : c.group.position.clone().add(V(0, 1.5, 0)), ui);
      const h = this.tag(ui, 'camp-knack-' + id, p.x, p.y - 22 + bob(p.y), KNACK_LABEL[kind], { icon: CHARACTERS[id].companion.icon, dim });
      if (h.hover) ui.tooltip({ title: CHARACTERS[id].name, body: dim ? 'Needs a blade and a crystal.' : CHARACTERS[id].companion.short, w: 150 });
      if (h.clicked) this.begin(kind, id);
    }
    // the way on
    const s = arrowSign(), x = ui.w - s.width - 14, y = ui.h - s.height - 12;
    const h = ui.hit('camp-moveon', x, y, s.width, s.height, { sound: false });
    ui.img(s, x, y - (h.hover ? 2 : 0));
    ui.text(this.actionsLeft().length ? 'Move on' : 'Onward', x + 38, y + 14 - (h.hover ? 2 : 0), { align: 'center', color: '#f6e6c4', outline: '#2a1608' });
    if (h.clicked) this.leave();
    // the stew still in your belly
    let by = 52;
    for (const b of run.buffs) {
      ui.icon(b.icon || 'campfire', 12, by);
      ui.text(`${b.name} · ${b.fights}`, 26, by + 1, { font: 'small', color: '#efe2c8', outline: '#140c10' });
      by += 13;
    }
  }

  // ---- cooking: the pantry cloth, the pot, the note with what it'll make
  drawCook(ui) {
    const run = this.run;
    const pot = this.proj(this.pot.clone().add(V(0, 0.55, 0)), ui);
    const anim = this.cookAnim;
    // items floating over the pot (tap to take one back out)
    const inPot = anim ? anim.items : this.pot_;
    inPot.forEach((it, i) => {
      const n = inPot.length;
      const a = (i - (n - 1) / 2) * 0.55;
      let x = pot.x + Math.sin(a) * 58, y = pot.y - 56 - Math.cos(a) * 12 + Math.round(Math.sin(this.t * 3 + i) * 2);
      let s = 1;
      if (anim) { const k = ease.inCubic(clamp(anim.t / 0.7 - i * 0.12, 0, 1)); x += (pot.x - x) * k; y += (pot.y - y) * k; s = 1 - k * 0.8; if (k >= 1) return; }
      const spr = materialSprite(it.id, 40);
      if (!anim) { const c = ui.ctx; c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.3; c.drawImage(glowCanvas(24, '#ffd27a'), x - 24, y - 24); c.restore(); }
      ui.img(spr, Math.round(x - 20 * s), Math.round(y - 20 * s), { scale: s });
      if (!anim) {
        const h = ui.hit('pot' + it.uid, x - 20, y - 20, 40, 40, { sound: false });
        if (h.hover) ui.tooltip(itemTooltip(it));
        if (h.clicked) { this.pot_.splice(this.pot_.indexOf(it), 1); this.game.audio.play('card_place', { pitch: 0.8 }); }
      }
    });
    if (anim) return;
    // the pantry: everything cookable you carry, on a cloth
    const pantry = run.bag.all().filter((it) => isCookable(it) && !this.pot_.includes(it));
    const cw = Math.max(280, Math.min(640, 70 + pantry.length * 44)), ch = 74;
    const cx = Math.round(ui.w / 2 - cw / 2), cy = ui.h - ch - 14;
    const cloth = scrap(cw, ch, { seed: 21 });
    ui.img(cloth, cx, cy);
    if (!pantry.length) ui.text('Nothing to cook. Find forage!', ui.w / 2, cy + 30, { align: 'center', color: INK });
    pantry.slice(0, 13).forEach((it, i) => {
      const x = cx + 30 + i * 44, y = cy + 14;
      const h = ui.hit('pantry' + it.uid, x - 4, y - 4, 40, 54, { sound: false });
      ui.img(materialSprite(it.id, 32), x, y - (h.hover ? 3 : 0));
      const c = MATERIALS[it.id].cook || {};
      const main = STEW_FX_ORDER.find((k) => c[k]);
      if (main) ui.icon(STEW_FX[main].icon, x + 10, y + 36);
      else if (c.salt) ui.icon('sparkle', x + 10, y + 36);
      if (h.hover) ui.tooltip(itemTooltip(it));
      if (h.clicked) {
        if (this.pot_.length >= POT_MAX) { this.game.audio.play('deny'); }
        else { this.pot_.push(it); this.game.audio.play('cook_add', { pitch: 1 + this.pot_.length * 0.05 }); }
      }
    });
    // the note: what this pot will become
    const res = previewStew(run, this.pot_);
    const nw = 214, nh = 132, nx = ui.w - nw - 16, ny = 70;
    const note = scrap(nw, nh, { seed: 23, nails: 1 });
    ui.img(note, nx, ny);
    const L = note.inner;
    if (!this.pot_.length) ui.text(`Add ${POT_MIN}–${POT_MAX} things`, nx + nw / 2, ny + L.y + 30, { align: 'center', color: FAINT });
    else {
      const name = res.recipe && !res.known ? '???' : res.name;
      ui.icon(res.icon || 'campfire', nx + L.x + 2, ny + L.y + 1);
      ui.text(name, nx + L.x + 16, ny + L.y + 2, { color: res.recipe ? '#8a3a00' : INK, maxW: L.w - 18 });
      let ly = ny + L.y + 20;
      for (const line of res.lines.slice(0, 5)) { ui.icon(line.icon, nx + L.x + 2, ly - 1); ui.text(line.text.replace(/\{[^}]*\}/g, ''), nx + L.x + 16, ly, { color: INK, maxW: L.w - 18 }); ly += 14; }
      if (this.pot_.length < POT_MIN) ui.text('Add one more', nx + L.x + 2, ly + 2, { font: 'small', color: FAINT });
      if (run.hasKnack('durgan')) ui.text('{gold}Durgan: ×1.5{/}', nx + L.x + 2, ny + nh - 22, { font: 'small', color: FAINT });
    }
    // cook / recipes / back
    const by = ny + nh + 8;
    const ok = res.valid;
    const h1 = this.tag(ui, 'cook-go', nx + 44, by, 'Cook!', { icon: 'campfire', dim: !ok });
    if (h1.clicked) this.doCook();
    const h2 = this.tag(ui, 'cook-book', nx + 132, by, 'Recipes', { icon: 'recipe' });
    if (h2.clicked) this.showBook = !this.showBook;
    const h3 = this.tag(ui, 'cook-back', 64, 64, 'Back', { icon: 'arrowL' });
    if (h3.clicked) { this.state = 'menu'; this.pot_ = []; this.toHome(); playAny(this.hero, ['sit']); }
    if (this.showBook) this.drawBook(ui);
  }

  drawBook(ui) {
    const book = stewBook(this.run);
    const bw = 300, bh = 34 + book.length * 22, bx = Math.round(ui.w / 2 - bw / 2 - 60), by = 60;
    const s = scrap(bw, bh, { seed: 27 });
    ui.block(4);
    ui.img(s, bx, by);
    ui.text('Stew Recipes', bx + bw / 2, by + s.inner.y, { align: 'center', color: INK });
    book.forEach((r, i) => {
      const y = by + s.inner.y + 16 + i * 22;
      ui.icon(r.icon, bx + s.inner.x, y);
      ui.text(r.known ? r.name : '? ? ?', bx + s.inner.x + 14, y + 1, { color: r.known ? '#7a3a00' : FAINT, maxW: 120 });
      if (r.known) r.ings.forEach((id, k) => ui.img(materialSprite(id, 16), bx + s.inner.x + 150 + k * 18, y - 3));
      else ui.text(r.hint, bx + s.inner.x + 150, y + 1, { font: 'small', color: FAINT, maxW: bw - 170 });
    });
    const h = ui.hit('cook-book-close', -1e4, -1e4, 3e4, 3e4, { sound: false, cursor: false });
    if (h.clicked) this.showBook = false;
    ui.unblock();
  }

  // ---- Elio's enchant: pick an elemental crystal
  drawEnchant(ui) {
    const run = this.run;
    const crystals = this.pick || [];
    const cw = 80 + crystals.length * 48, cx = Math.round(ui.w / 2 - cw / 2), cy = ui.h - 100;
    ui.img(scrap(cw, 80, { seed: 31 }), cx, cy);
    ui.text('Elio enchants your blade with:', ui.w / 2, cy - 14, { align: 'center', color: '#e8d8b8', outline: '#140c10' });
    crystals.forEach((it, i) => {
      const x = cx + 40 + i * 48, y = cy + 18;
      const h = ui.hit('ench' + it.uid, x - 4, y - 4, 40, 44, { sound: false });
      ui.img(materialSprite(it.id, 32), x, y - (h.hover ? 3 : 0));
      if (h.hover) ui.tooltip(itemTooltip(it));
      if (h.clicked && run.weapon) this.enchant(it);
    });
    const h = this.tag(ui, 'ench-back', 64, 64, 'Back', { icon: 'arrowL' });
    if (h.clicked) { this.state = 'menu'; this.pick = null; }
  }

  drawBanner(ui) {
    const b = this.banner;
    if (!b) return;
    const k = clamp(b.t * 4, 0, 1) * clamp((2.8 - b.t) * 3, 0, 1);
    const y = 92;
    ui.big(b.text, ui.w / 2, y, { scale: 2, top: '#fff6d8', bottom: '#ffb63d', alpha: k });
    if (b.sub) textA(ui, b.sub, ui.w / 2, y + 20, { align: 'center', color: '#efe2c8', outline: '#140c10' }, k);
    if (b.lines) b.lines.forEach((l, i) => { const lx = ui.w / 2 - 70; ui.icon(l.icon, lx, y + 36 + i * 14, { alpha: k }); textA(ui, l.text, lx + 14, y + 37 + i * 14, { outline: '#140c10' }, k); });
    void RARITY; void ACTS; void ELEMENTS;
  }
}
