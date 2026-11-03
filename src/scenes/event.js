// First-person event (docs/REDESIGN.md §7): walk into a chamber where something waits — a clutch of
// snake eggs, a petrified adventurer, a ring of winking mushrooms — built from voxel props around the
// chamber's event spot. A small inked title, two short lines at most, and two or three wooden tags
// to choose from. The outcome plays out with motion (loot flying into the bag, a jolt, a fight) and
// a single line of text, then you move on.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { makeFPWorld, yawPitchTo } from '../gfx/fpcam.js';
import * as Props from '../models/props.js';
import * as MonM from '../models/monsters.js';
import { voxelModel } from '../gfx/voxel.js';
import { buildFPSafe, makePet, anchor, floor, walkIn, seedOf, glowSprite, grantItems, drawFlyers, revealChain, woodTag, cornerHud, EYE } from './fp_kit.js';
import { finishNode, openBag, gameOver, actOf, actDef, monsterFor, pickEvent } from './flow.js';
import { delveMusic } from './delve.js';
import * as EV from '../data/events.js';
import { STEWS } from '../data/stews.js';
import * as MON from '../data/monsters.js';
import { MATERIALS } from '../data/materials.js';
import { makeItem, matOf } from '../systems/items.js';
import { materialSprite } from '../art/sprites.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

// ------------------------------------------------------------------ vignettes
// ctx.add(prop, opts, [right, up, toward], rotY, scale) places a prop relative to the event spot
// (`toward` = toward the viewer). Keys are matched loosely against the event's `vignette` (or id).
const VIGNETTES = [
  [/statue_garden/, (c) => { c.add('statue', {}, [-0.8, 0, -0.3], 0.4, 1); c.add('statue', {}, [0, 0, -0.6], 0, 1.15); c.add('statue', {}, [0.85, 0, -0.25], -0.4, 0.95); c.add('vines', {}, [0.3, 0, -0.8], 0.2); c.glow('#c8ffd8', [0, 0.3, -0.3], 0.6); }],
  [/lava/, (c) => { c.add('lavapool', { size: 1.1 }, [0, 0, 0.15]); c.add('shrine', {}, [0, 0, -0.7], 0, 0.9); c.add('vent', {}, [0.9, 0, -0.1]); }],
  [/mirror/, (c) => { c.add('waterpool', { size: 1.4 }, [0, 0, 0]); c.add('crystal', {}, [-0.8, 0, -0.3], 0.4); c.add('crystal', {}, [0.8, 0, -0.35], -0.5); c.glow('#d8f0ff', [0, 0.05, 0], 1); }],
  [/camp/, (c) => { c.add('campfire', { lit: false }, [0, 0, 0], 0, 0.9); c.add('sleepingbag', {}, [-0.75, 0, -0.1], 0.6); c.add('backpack', {}, [0.7, 0, -0.2], -0.5); c.add('lantern', {}, [0.45, 0, 0.35]); }],
  [/hive|honey|bee/, (c) => { c.obj(hive(), [0, 1.25, -0.2], 0, 1); c.add('roots', {}, [0, 1.8, -0.5], 0, 0.8); c.glow('#ffd25e', [0, 1.1, -0.1], 0.6); c.bees = true; }],
  [/shed|skin|slough/, (c) => { c.obj(shedSkin(), [0, 0, 0], 0.3, 1); c.add('bones', {}, [0.8, 0, 0.2], 1); c.add('rock', { size: 0.4 }, [-0.8, 0, -0.2]); }],
  [/harp/, (c) => { for (let i = 0; i < 5; i++) c.add('crystal', {}, [(i - 2) * 0.32, 0, -0.2 - Math.abs(i - 2) * 0.12], 0, 0.7 + (2 - Math.abs(i - 2)) * 0.25); c.glow('#c8e8ff', [0, 0.4, -0.3], 0.8); }],
  [/egg|clutch|nest/, (c) => { c.add('roots', {}, [0, 0, -0.5], 0, 0.8); for (let i = 0; i < 5; i++) c.obj(egg(c.seed + i), [Math.cos(i * 1.3) * 0.28, 0, Math.sin(i * 1.3) * 0.22], i, 1 + (i % 2) * 0.15); c.add('bones', {}, [0.7, 0, 0.1], 1.2); c.glow('#9affc8', [0, 0.25, 0], 0.5); }],
  [/statue|adventur|petrif/, (c) => { c.add('statue', {}, [0, 0, -0.1], 0, 1.1); c.add('rock', { size: 0.5 }, [-0.7, 0, 0.2]); c.add('rock', { size: 0.35 }, [0.65, 0, 0.3]); c.add('pickaxe', {}, [0.5, 0, 0.35], 0.7); }],
  [/mushroom|fairy|ring|spore/, (c) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.add('mushroom', { glow: '#5af0c8' }, [Math.cos(a) * 0.62, 0, Math.sin(a) * 0.42], a, 0.75 + (i % 3) * 0.12); } c.add('mushroom', { color: '#c84ab0', glow: '#ff8af0' }, [0, 0, 0], 0, 1.35); c.glow('#5af0c8', [0, 0.2, 0], 0.9); }],
  [/root|bound|tangle/, (c) => { c.add('chest', { kind: 'wood' }, [0, 0, 0], 0, 1); c.add('roots', {}, [0, 0, -0.25], 0, 1.1); c.add('vines', {}, [0.4, 0, -0.4], 0.4); c.add('vines', {}, [-0.45, 0, -0.35], -0.4); }],
  [/forge|anvil|smith|dwarf/, (c) => { c.add('forge', {}, [-0.55, 0, -0.35], 0.3); c.add('anvil', {}, [0.45, 0, 0.05], -0.4); c.add('crate', {}, [1.0, 0, -0.4], 0.2); c.add('torch', {}, [-1.1, 0, -0.5]); }],
  [/well|whisper|wish/, (c) => { c.obj(wellRing(), [0, 0, 0], 0, 1); c.add('chains', {}, [0, 0, -0.1], 0, 0.6); c.glow('#8ac8ff', [0, 0.05, 0], 0.6); }],
  [/spring|bath|hot|pool|pond/, (c) => { c.add('waterpool', { size: 1.5 }, [0, 0, 0]); for (let i = 0; i < 6; i++) c.add('rock', { size: 0.25 + (i % 3) * 0.08 }, [Math.cos(i) * 0.95, 0, Math.sin(i) * 0.6], i); c.steam = true; }],
  [/bridge|chasm|gap|ledge/, (c) => { c.add('ropebridge', {}, [0, 0, -0.6], 0, 1); c.add('torch', {}, [-0.9, 0, 0.1]); c.add('torch', {}, [0.9, 0, 0.1]); }],
  [/glow|worm|grotto|firefl/, (c) => { for (let i = 0; i < 4; i++) c.add('stalactite', {}, [(i - 1.5) * 0.5, 1.9, -0.2 - (i % 2) * 0.3], i); c.worms = true; c.add('waterpool', { size: 1 }, [0, 0, 0]); }],
  [/troll|sleep|giant|beast/, (c) => { c.monster(['stone_troll', 'drilltroll', 'mole_brute'], [0, 0, -0.2], 1); c.add('bones', {}, [0.8, 0, 0.3], 0.5); c.add('goldpile', {}, [-0.7, 0, 0.1]); }],
  [/herb|garden|forage|plant|flower/, (c) => { c.add('vines', {}, [0, 0, -0.5], 0, 1.2); for (let i = 0; i < 6; i++) c.add('mushroom', { color: ['#e0a040', '#d04a3a', '#8ac850'][i % 3] }, [(i - 2.5) * 0.28, 0, (i % 2) * 0.25], i, 0.55); c.add('roots', {}, [0.6, 0, -0.3], 0.5, 0.7); c.glow('#c8ff8a', [0, 0.2, 0], 0.5); }],
  [/shrine|altar|scale|serpent|snake/, (c) => { c.add('shrine', {}, [0, 0, -0.2], 0, 1); c.add('brazier', {}, [-0.85, 0, 0.1]); c.add('brazier', {}, [0.85, 0, 0.1]); }],
  [/bone|skelet|grave|fallen/, (c) => { c.add('bones', {}, [0, 0, 0], 0, 1.2); c.add('urn', {}, [0.6, 0, -0.2]); c.add('web', {}, [-0.6, 0.4, -0.5]); }],
  [/web|spider|silk/, (c) => { c.add('web', {}, [0, 0.3, -0.4], 0, 1.3); c.add('bones', {}, [0.4, 0, 0.1]); c.add('sack', {}, [-0.5, 0, 0]); }],
  [/crystal|geode|prism/, (c) => { c.add('crystalcluster', {}, [0, 0, -0.1], 0, 1.2); c.add('crystal', {}, [-0.6, 0, 0.1], 0.5); c.add('crystal', {}, [0.65, 0, 0.05], -0.4); }],
  [/lava|ember|fire|vent/, (c) => { c.add('lavapool', { size: 1.2 }, [0, 0, 0]); c.add('vent', {}, [0.8, 0, -0.2]); }],
  [/door|gate|seal/, (c) => { c.add('door', {}, [0, 0, -0.5], 0, 1); c.add('torch', {}, [-0.8, 0, -0.3]); c.add('torch', {}, [0.8, 0, -0.3]); }],
  [/book|librar|niche|scroll|journal/, (c) => { c.add('books', {}, [0, 0, 0], 0, 1.1); c.add('statue', {}, [0.7, 0, -0.4], -0.3, 0.8); c.add('lantern', {}, [-0.5, 0, 0.1]); }],
  [/tomb|sarcoph|coffin/, (c) => { c.add('sarcophagus', {}, [0, 0, -0.2], 0, 1); c.add('urn', {}, [0.8, 0, 0]); c.add('urn', {}, [-0.8, 0, 0]); }],
  [/cart|rail|spill/, (c) => { c.add('minecart', {}, [0, 0, -0.1], 0.4); c.add('rock', { size: 0.4 }, [0.6, 0, 0.3]); c.add('sack', {}, [-0.6, 0, 0.2]); }],
];
const DEFAULT_VIGNETTE = (c) => { c.add('statue', {}, [0, 0, -0.2], 0, 1); c.add('crystal', {}, [0.6, 0, 0.1]); c.add('bones', {}, [-0.5, 0, 0.2]); };

function egg(seed) {
  return voxelModel(7, 9, 7, (g) => {
    for (let y = 0; y < 9; y++) for (let z = 0; z < 7; z++) for (let x = 0; x < 7; x++) {
      const dx = (x - 3) / 3.4, dy = (y - 4) / 4.4, dz = (z - 3) / 3.4;
      if (dx * dx + dy * dy * (y > 4 ? 1.25 : 1) + dz * dz > 1) continue;
      const h = Math.sin(x * 12.9 + y * 78.2 + z * 37.7 + seed) * 43758.5453 % 1;
      g.set(x, y, z, Math.abs(h) > 0.82 ? '#3a6a4a' : y > 5 ? '#e8e4c8' : '#c8d0a8');
    }
  }, { size: 0.03, seed });
}
function hive() {
  return voxelModel(12, 15, 12, (g) => {
    for (let y = 0; y < 15; y++) for (let z = 0; z < 12; z++) for (let x = 0; x < 12; x++) {
      const r = 5.6 * Math.sin(Math.PI * (y + 0.5) / 15) + 0.6;
      if (Math.hypot(x - 5.5, z - 5.5) > r) continue;
      g.set(x, y, z, y % 3 === 0 ? '#7a4a1a' : y === 3 && x === 5 ? '#2a1a0a' : '#d8a040');
    }
  }, { size: 0.035 });
}
function shedSkin() {
  return voxelModel(40, 3, 14, (g) => {
    for (let i = 0; i < 40; i++) {
      const z = Math.round(6 + Math.sin(i * 0.35) * 4), w = i < 6 ? 2 : i > 34 ? 1 : 2;
      for (let dz = -w; dz <= w; dz++) g.set(i, 0, z + dz, (i + dz) % 3 === 0 ? '#c8c0a0' : '#e8e0c8');
      if (i % 4 === 0) g.set(i, 1, z, '#b8b090');
    }
  }, { size: 0.04 });
}
function wellRing() {
  return voxelModel(18, 6, 18, (g) => {
    for (let y = 0; y < 6; y++) for (let z = 0; z < 18; z++) for (let x = 0; x < 18; x++) {
      const d = Math.hypot(x - 8.5, z - 8.5);
      if (d > 8.6 || d < 6.4) continue;
      const brick = ((x + (y % 2) * 2) >> 2) % 2;
      g.set(x, y, z, y === 5 ? '#8a8a7a' : brick ? '#6a6458' : '#5a544a');
    }
    for (let z = 0; z < 18; z++) for (let x = 0; x < 18; x++) if (Math.hypot(x - 8.5, z - 8.5) < 6.4) g.set(x, 1, z, '#1a3a5a');
  }, { size: 0.05 });
}

function buildVignette(scene, spot, faceYaw, key, seed) {
  const group = new THREE.Group();
  group.position.copy(spot);
  group.rotation.y = faceYaw; // local +Z points at the viewer
  scene.add(group);
  const ctx = {
    seed, group, monsters: [], glows: [], steam: false, worms: false,
    add(name, opts, at, rotY = 0, scale = 1) {
      if (Props.PROP_NAMES && !Props.PROP_NAMES.includes(name)) return null;
      let o = null;
      try { o = Props.buildProp(name, opts || {}); } catch (e) { return null; }
      return this.obj(o, at, rotY, scale);
    },
    obj(o, at, rotY = 0, scale = 1) {
      if (!o) return null;
      o.position.set(at[0], at[1], at[2]); o.rotation.y = rotY; o.scale.multiplyScalar(scale);
      group.add(o);
      return o;
    },
    glow(col, at, size) { const g = glowSprite(col, size, 1.3); g.position.set(at[0], at[1], at[2]); group.add(g); this.glows.push(g); },
    monster(ids, at, scale = 1) {
      const id = ids.find((i) => MON.MONSTERS && MON.MONSTERS[i]);
      if (!id) return;
      try { const m = MonM.buildMonster(id); m.group.position.set(at[0], at[1], at[2]); m.group.scale.multiplyScalar(scale); m.play('idle'); group.add(m.group); this.monsters.push(m); } catch (e) { /* model not ready */ }
    },
  };
  const k = String(key || '').toLowerCase();
  const v = VIGNETTES.find(([re]) => re.test(k));
  (v ? v[1] : DEFAULT_VIGNETTE)(ctx);
  return ctx;
}

// ------------------------------------------------------------------ the scene
export class EventScene extends Scene {
  enter(params = {}) {
    const game = this.game, run = game.run;
    this.run = run;
    if (!run) { game.go('title', {}, { transition: 'none' }); return; }
    const act = actOf(run);
    this.act = act;
    this.node = params.node || run.map.nodes[run.map.current];
    const all = EV.EVENTS || [];
    this.ev = all.find((e) => e.id === params.event) || pickEvent(run);
    this.rng = run.rng.fork ? run.rng.fork('event' + this.ev.id + (this.node ? this.node.id : '')) : run.rng;
    const key = this.ev.vignette || this.ev.id || '';
    this.stage = buildFPSafe('chamber', act, { seed: seedOf(run.seed, act, this.ev.id, 'event'), kind: 'event', vignette: key });
    this.world = makeFPWorld([this.stage], { charId: run.char });
    const fp = (this.fp = this.world.fp);
    if (fp.arms) { fp.arms.hold && fp.arms.hold('torch'); }
    const stand = anchor(this.stage, 'stand', new THREE.Vector3(0, EYE, -3));
    this.spot = floor(anchor(this.stage, 'event', new THREE.Vector3(0, 0, -5.5), false));
    const toward = new THREE.Vector3().subVectors(stand, this.spot).setY(0).normalize();
    this.vig = buildVignette(this.world.scene, this.spot, Math.atan2(toward.x, toward.z), key, seedOf(this.ev.id));
    this.focusAt = this.spot.clone().add(new THREE.Vector3(0, 0.45, 0));
    this.pet = makePet(this.world.scene);
    if (this.pet) {
      const right = new THREE.Vector3(toward.z, 0, -toward.x);
      this.pet.group.position.copy(this.spot).addScaledVector(toward, 1.5).addScaledVector(right, 0.45);
      this.pet.group.rotation.y = Math.atan2(-toward.x, -toward.z);
      this.pet.play('sniff');
    }
    this.state = 'walkin';
    this.t = 0; this.textK = 0;
    this.result = null; this.flyers = []; this.pending = []; this.rare = [];
    this.picker = null;
    this.fade = 1;
    // walk right up to it: the vignette should fill the view
    const near = this.spot.clone().addScaledVector(toward, 2.25).setY(this.spot.y + EYE);
    walkIn(fp, this.stage, this.focusAt, { to: near }).then(() => {
      this.state = 'choose';
      fp.setFov(56, 1.5);
      if (this.pet) this.pet.play('idle');
      game.audio && game.audio.play('page_turn', { vol: 0.5 });
    });
    delveMusic(game, run);
  }
  exit() { if (this.stage && this.stage.dispose) { try { this.stage.dispose(); } catch (e) { /* placeholder */ } } for (const m of (this.vig ? this.vig.monsters : [])) m.dispose && m.dispose(); }

  after(t, fn) { (this.timers || (this.timers = [])).push({ t, fn }); }

  // ------------------------------------------------------------------ outcomes
  available(c) {
    if (!c.req) return true;
    try { return c.req(this.run); } catch (e) { return true; }
  }
  choose(c) {
    if (this.state !== 'choose') return;
    const ok = this.available(c);
    if (ok !== true) { this.game.audio && this.game.audio.play('deny'); return; }
    this.game.audio && this.game.audio.play('click');
    const run = this.run, rng = this.rng;
    let out;
    try {
      if (EV.resolveChoice) out = EV.resolveChoice(run, this.ev, c, rng);
      else { const f = c.out || c.effect; out = typeof f === 'function' ? f(run, rng) : f || {}; }
    } catch (e) { console.warn('event choice', e); out = {}; }
    this.apply(out || {});
  }
  apply(out) {
    const game = this.game, run = this.run, rng = this.rng, fp = this.fp, au = game.audio;
    if (out.qte) { // events have no QTEs any more: fortune decides
      const q = out.qte;
      return this.apply((rng.chance(q.chance ?? 0.6) ? q.win : q.lose) || {});
    }
    if (out.pick) { this.picker = { ...out.pick, items: run.bag.all().filter((it) => { try { return !out.pick.filter || out.pick.filter({ ...matOf(it), ...it }); } catch (e) { return false; } }) }; this.state = 'pick'; this.pickerText = out.text || null; return; }
    if (out.next) return this.apply(out.next);
    const res = { text: out.text || out.result || '', mood: 'neutral', gains: [] };
    // health
    if (out.maxHp) { run.maxHp += out.maxHp; run.hp = Math.min(run.maxHp, run.hp + Math.max(0, out.maxHp)); res.mood = 'good'; }
    if (out.heal) { run.heal(out.heal); res.mood = 'good'; }
    if (out.hp) {
      if (out.hp > 0) { run.heal(out.hp); res.mood = 'good'; au && au.play('heal'); }
      else {
        const dead = run.hurt(-out.hp);
        res.mood = 'bad'; fp.shake(0.4); fp.punch([0, 0, 1], 0.06);
        game.renderer && game.renderer.doFlash && game.renderer.doFlash(0.25, [1, 0.2, 0.15]);
        au && au.play('hurt');
        res.hurt = -out.hp;
        if (dead) { this.state = 'dead'; this.after(1.2, () => gameOver(game, this.ev.title)); this.result = res; return; }
      }
    }
    // the weapon's creeping stone
    if (out.stone && run.weapon) run.weapon.stone = clamp((run.weapon.stone || 0) + out.stone, 0, 1);
    if (out.buff) { if (run.addBuff) run.addBuff(out.buff); else if (run.buffs) run.buffs.push(out.buff); res.mood = 'good'; }
    if (out.weapon) { const w = run.equip ? run.equip(out.weapon) : (run.weapon = out.weapon); this.rare.push(w); res.mood = 'good'; }
    if (out.learn === 'stew') {
      const known = run.stews || [];
      const ids = Object.keys(STEWS || {}).filter((id) => !known.includes(id));
      if (ids.length && run.learnStew) run.learnStew(this.rng.pick(ids));
    } else if (out.learn && run.unknownRecipe && run.learnRecipe) { const r = run.unknownRecipe(); if (r) run.learnRecipe(r); }
    if (out.coins && typeof run.coins === 'number') run.coins += out.coins;
    // items
    const list = [];
    for (const g of out.gain || []) { const [id, q] = Array.isArray(g) ? g : [g, 2]; if (MATERIALS[id]) list.push(makeItem(id, q ?? 2)); }
    for (const it of out.items || []) { if (typeof it === 'string') { if (MATERIALS[it]) list.push(makeItem(it, 2)); } else if (it && it.id) list.push(it); }
    if (list.length) {
      const from = fp.project(this.focusAt, 960, 540);
      const g = grantItems(run, list, from, this.flyers);
      this.rare.push(...g.rare); this.overflow = this.overflow || g.overflow;
      res.mood = res.mood === 'bad' ? 'bad' : 'good';
      au && au.play('loot', { vol: 0.7 });
    }
    if (this.pet) this.pet.play(out.pip || (res.mood === 'good' ? 'happy' : res.mood === 'bad' ? 'yelp' : 'idle'));
    if (out.pip === 'dig') au && au.play('pip_dig');
    // a fight breaks out
    if (out.fight) {
      const id = typeof out.fight === 'string' && MON.MONSTERS && MON.MONSTERS[out.fight] ? out.fight : monsterFor(run, out.fight === 'elite' ? 'elite' : 'monster');
      this.state = 'fight';
      this.result = res;
      au && au.play('hiss'); fp.shake(0.5);
      if (this.pet) this.pet.play('bark');
      const elite = out.elite || out.fight === 'elite';
      this.after(1.0, () => game.go('combat', { node: this.node, monster: id, elite, ambush: true }, { transition: 'none' }));
      return;
    }
    this.result = res;
    this.state = 'result';
    this.textK = 0;
  }
  leave() {
    if (this.state === 'done') return;
    this.state = 'done';
    const game = this.game;
    revealChain(game, this.rare, () => {
      if (this.overflow) { const o = openBag(game, { title: 'Found', onClose: () => finishNode(game) }); if (!o) finishNode(game); }
      else finishNode(game);
    });
  }

  // ------------------------------------------------------------------ update / draw
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
    if (this.state === 'choose' || this.state === 'result') this.textK = Math.min(1, this.textK + dt * 2.5);
    this.fp.dragLook(this.game.input);
    for (const m of this.vig.monsters) m.update(dt * 0.5);
    for (const g of this.vig.glows) g.material.opacity = 0.75 + Math.sin(this.t * 2.3 + g.id) * 0.25;
    const W = this.world, s = this.spot;
    if (this.vig.steam && rnd.chance(dt * 9)) W.dust.emit({ pos: [s.x + rnd.float(-0.6, 0.6), s.y + 0.05, s.z + rnd.float(-0.4, 0.4)], vel: [0, 0.35, 0], spread: 0.05, life: [1.5, 2.5], size: [2, 4], sizeEnd: 6, color: '#e8f0f0', alpha: 0.35, fadeIn: 0.4 });
    if (this.vig.bees && rnd.chance(dt * 8)) W.sparks.emit({ pos: [s.x + rnd.float(-0.4, 0.4), s.y + rnd.float(0.9, 1.5), s.z + rnd.float(-0.4, 0.3)], vel: [rnd.float(-0.3, 0.3), rnd.float(-0.1, 0.1), rnd.float(-0.3, 0.3)], life: [0.6, 1.4], size: 1, color: ['#ffd25e', '#fff0a0'], glow: 2, swirl: 1.2 });
    if (this.vig.worms && rnd.chance(dt * 6)) W.sparks.emit({ pos: [s.x + rnd.float(-1, 1), s.y + rnd.float(1.4, 2), s.z + rnd.float(-0.6, 0.4)], vel: [0, -0.02, 0], life: [2, 4], size: 1, color: ['#8affe0', '#c8fff0'], glow: 3, fadeIn: 0.8, flicker: 0.4 });
    if (this.state === 'result' && !this.game.overlays.length && !this.flyers.length && this.game.input.actionPressed('confirm')) this.leave();
    if (this.state === 'choose' && !this.game.overlays.length) {
      const ch = this.ev.choices || [];
      for (let i = 0; i < Math.min(ch.length, 3); i++) if (this.game.input.keyPressed('Digit' + (i + 1))) this.choose(ch[i]);
    }
    if (this.pet && this.pet.update) this.pet.update(dt);
    this.world.update(dt);
  }

  draw(ui) {
    if (!this.run) return;
    const game = this.game, dt = ui.dt || 1 / 60;
    const big = ui.touch ? 1.5 : 1;
    const ev = this.ev, k = ease.outCubic(this.textK);
    if (this.state !== 'walkin' && this.state !== 'done') {
      // title tag + at most two short lines
      ui.ctx.globalAlpha = k;
      woodTag(ui, null, ui.w / 2, 16 - Math.round((1 - k) * 12), ev.title || '', { icon: 'event', scale: big });
      const text = this.state === 'result' || this.state === 'fight' || this.state === 'dead' ? (this.result && this.result.text) || '' : this.state === 'pick' ? this.pickerText || '' : ev.text || '';
      if (text) ui.text(text, ui.w / 2, 16 + 26 * big + 8, { align: 'center', color: '#f4e6c8', outline: '#140c10', maxW: 420 });
      ui.ctx.globalAlpha = 1;
    }
    if (this.state === 'choose') this.drawChoices(ui, big);
    if (this.state === 'pick') this.drawPicker(ui, big);
    if (this.state === 'result') {
      const r = this.result;
      if (r && r.hurt) ui.big('-' + r.hurt, ui.w / 2, ui.h / 2 - 30, { scale: 2, top: '#ffd0c8', bottom: '#ff4a3a', alpha: clamp(2 - this.textK * 2 + 0.6, 0, 1) });
      const h = woodTag(ui, 'ev-go', ui.w - 20, ui.h - 46 * big, 'Move on', { icon: 'arrowR', scale: big, align: 'right' });
      if (h.clicked) this.leave();
    }
    const hh = cornerHud(ui, game);
    if (hh.bag) openBag(game);
    drawFlyers(ui, this.flyers, dt);
    if (this.fade > 0) ui.rect(0, 0, ui.w, ui.h, '#07060b', this.fade);
  }
  drawChoices(ui, big) {
    const ch = (this.ev.choices || []).slice(0, 3);
    const gap = 8 * big, rowH = 26 * big;
    const y0 = ui.h - 22 - ch.length * (rowH + gap);
    ch.forEach((c, i) => {
      const ok = this.available(c);
      const RISK = { fight: 'monster', stone: 'curse', hp: 'heart', item: 'bag' };
      const badge = RISK[c.risk] || null;
      const sub = c.hint && !badge ? c.hint : null;
      const h = woodTag(ui, 'ev-c' + i, ui.w / 2, y0 + i * (rowH + gap) + Math.round((1 - ease.outCubic(clamp(this.textK * 1.6 - i * 0.2, 0, 1))) * 30), c.label, { icon: c.icon || null, dim: ok !== true, scale: big, sub, subColor: '#8a2a1a', badge });
      if (h.hover && ok !== true) ui.tooltip({ title: c.label, body: String(ok) });
      if (h.clicked) this.choose(c);
    });
  }
  drawPicker(ui, big) {
    const p = this.picker;
    const items = p.items.slice(0, 10);
    const s = 32 * big, gap = 6;
    const W = items.length * (s + gap) - gap;
    const x0 = ui.w / 2 - W / 2, y = ui.h - 70 - s;
    if (!items.length) {
      const h = woodTag(ui, 'ev-none', ui.w / 2, y, 'Nothing fits — move on', { scale: big });
      if (h.clicked) { this.result = { text: '' }; this.state = 'result'; }
      return;
    }
    woodTag(ui, null, ui.w / 2, y - 30 * big, p.verb || 'Pick one', { scale: big });
    items.forEach((it, i) => {
      const x = x0 + i * (s + gap);
      const h = ui.hit('ev-p' + i, x, y, s, s, { sound: false });
      ui.rect(x, y, s, s, '#140c10', h.hover ? 0.75 : 0.5);
      const spr = materialSprite(it.id, 32);
      if (spr) ui.ctx.drawImage(spr, x, y - (h.hover ? 2 : 0), s, s);
      if (h.hover) ui.tooltip({ title: MATERIALS[it.id] ? MATERIALS[it.id].name : it.id, body: '' });
      if (h.clicked) {
        let out = {};
        try { out = p.then(it, this.run, this.rng) || {}; } catch (e) { console.warn('pick', e); }
        this.picker = null; this.state = 'choose';
        this.apply(out);
      }
    });
    const back = woodTag(ui, 'ev-back', ui.w / 2, y + s + 10, 'Never mind', { scale: big });
    if (back.clicked) { this.picker = null; this.state = 'choose'; }
  }
}
