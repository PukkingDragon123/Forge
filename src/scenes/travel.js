// Cinematic side-scrolling travel through a tunnel: auto-walk, inspectables, tunnel QTEs, reactions.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { buildStage as buildSet } from '../models/stage2d.js';
import { buildCharacter } from '../models/characters.js';
import * as Props from '../models/props.js';
import { buildMonster } from '../models/monsters.js';
import { makeWorld, hud, speech, bark, ribbonTitle, ambientDust } from './common.js';
import { arrive, openBag, gameOver } from './flow.js';
import { TUNNELS, REGIONS, NODE_TYPES } from '../data/regions.js';
import { MONSTERS, regionPool } from '../data/monsters.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { makeItem } from '../systems/items.js';
import { rollMaterial, rollQuality } from '../systems/run.js';
import { TimingQTE, MashQTE } from './travel_qte.js';
import { materialSprite, nodeBadge } from '../art/sprites.js';
import { COLORS } from '../ui/font.js';
import { clamp, ease } from '../core/math.js';

const LORE = [
  ['"Shift 41: rails bent again. Nobody touched them. — F."', '"Do NOT open the door at the bottom. — Management"', 'A child\'s drawing of four friends around a fire.'],
  ['"The crystals hum a song when nobody\'s listening."', '"Mapped 3 caves today. Then they moved."', '"If the light blinks back, RUN."'],
  ['"The mushrooms are friendly. The big one isn\'t."', '"Spores in the soup again. Tasted great."', '"Day 9: I think the forest is breathing."'],
  ['"Here worked the First Miners, who dug too deep."', '"The Warden judges all who carry gold."', '"Silver burns the cursed. Remember this."'],
  ['"Hot. Hot. Hot. Very hot. — Expedition log, entire."', '"Pyrrhax sleeps under the red lake."', '"Ice is the only thing the wyrm fears."'],
  ['"He was a king once. He wanted to be a king forever."', '"Every broken blade feeds his crown."', '"Four names scratched into the wall. One of them is yours."'],
];

const BRIDGES = ['bridge', 'crystalbridge', 'rootbridge', 'lavabridge', 'chainbridge'];

function qteTypeFor(tunnel) {
  if (BRIDGES.includes(tunnel)) return 'collapse';
  return { minecart: 'chase', crawl: 'ambush', flooded: 'grab', elevator: 'rope' }[tunnel] || 'rockfall';
}

function safeProp(name, opts) {
  if (Props.PROP_NAMES && !Props.PROP_NAMES.includes(name)) return null;
  try { return Props.buildProp(name, opts); } catch (e) { return null; }
}

export class TravelScene extends Scene {
  enter(params = {}) {
    const game = this.game;
    const run = game.run;
    this.edge = params.edge || { tunnel: 'tunnel', sight: null };
    this.node = params.node || null;
    this.tunnel = params.tunnel || this.edge.tunnel || 'tunnel';
    this.region = run ? run.region : 0;
    this.rng = run ? run.rng.fork('travel' + (this.node ? this.node.id : 0)) : null;
    const R = REGIONS[this.region];
    this.L = 34;
    this.set = buildSet('corridor', this.region, { tunnel: this.tunnel, length: this.L });
    this.world = makeWorld(this.set, { fogDensity: 0.032 });
    this.rig = this.world.rig;
    this.extra = new THREE.Group();
    this.world.scene.add(this.extra);
    const A = this.set.anchors || {};
    this.x0 = A.start ? A.start.x : 0.6;
    this.x1 = A.end ? A.end.x : this.L - 0.6;
    this.x = this.x0;
    this.speed = 2.25;
    this.pathY = typeof this.set.pathY === 'function' ? this.set.pathY : () => 0;

    this.char = buildCharacter(run ? run.char : 'clover');
    this.char.group.rotation.y = Math.PI / 2 - 0.55; // walk right, three-quarter turned to camera so the face reads
    this.world.scene.add(this.char.group);
    this.char.play('walk', { loop: true });
    this.placeChar();

    this.mode = 'walk';
    this.fast = false;
    this.bubble = null;
    this.flyers = [];
    this.monsters = [];
    this.stepT = 0;
    this.camMode = 'side';
    this.titleT = 0;
    this.pauseT = 0;
    this.qte = null;
    this.ended = false;
    this.camOverride = null;
    this.cart = null;

    this.planEncounters();
    const cam = this.camTarget();
    this.rig.cut(cam.pos, cam.look, cam.fov);

    const a = game.audio;
    if (a) {
      a.music(R.music);
      this.loop = a.loop(this.tunnel === 'flooded' ? 'water' : this.region === 4 || this.tunnel === 'lavabridge' ? 'lava' : this.tunnel === 'elevator' ? 'wind' : 'cave', { vol: 0.5 });
    }
    this.co.start(this.introRoutine.bind(this));
  }

  exit() {
    this.game.timeScale = 1;
    if (this.loop) this.loop.stop(0.6);
  }

  // ------------------------------------------------------------------ planning
  planEncounters() {
    const rng = this.rng;
    const r = () => (rng ? rng.next() : Math.random());
    const A = this.set.anchors || {};
    const span = this.x1 - this.x0;
    const sight = this.edge.sight;
    const risk = (TUNNELS[this.tunnel] || TUNNELS.tunnel).risk;
    this.moments = [];
    let type = sight === 'shadow' ? 'ambush' : null;
    const qChance = [0.35, 0.6, 0.8][risk] ?? 0.35;
    if (!type && r() < qChance) type = qteTypeFor(this.tunnel);
    let qx = null;
    if (type) {
      qx = this.x0 + span * (0.5 + r() * 0.15);
      if (type === 'collapse' && A.bridgeMid) qx = A.bridgeMid.x - 0.6;
      if (type === 'rope' && A.elevatorTop) qx = A.elevatorTop.x + 0.4;
      if (type === 'chase') qx = this.x0 + span * 0.38;
      this.moments.push({ x: qx, type });
    }
    const kinds = [];
    if (sight === 'glint') kinds.push('ore');
    if (sight === 'cart') kinds.push('cart');
    if (sight === 'note') kinds.push('note');
    const n = 1 + Math.floor(r() * 2.6);
    const pool = ['ore', 'ore', 'skeleton', 'note', 'mushroom', 'crate'];
    while (kinds.length < Math.min(3, Math.max(n, kinds.length))) kinds.push(pool[Math.floor(r() * pool.length)]);
    // candidate spots: the set's safe anchors first, then random positions
    const cands = (A.spots || []).map((v) => v.x);
    for (let i = 0; i < 12; i++) cands.push(this.x0 + 4 + r() * (span - 9));
    const bad = (x) => (qx !== null && Math.abs(qx - x) < 3.5) || (A.bridgeStart && A.bridgeEnd && x > A.bridgeStart.x - 0.5 && x < A.bridgeEnd.x + 0.5);
    this.items = [];
    const xs = [];
    for (const kind of kinds) {
      const x = cands.find((c) => !bad(c) && !xs.some((o) => Math.abs(o - c) < 4));
      if (x === undefined) continue;
      xs.push(x);
      this.items.push(this.spawnInspectable(kind, x));
    }
  }

  spawnInspectable(kind, x) {
    const y = this.pathY(x);
    const z = -0.85;
    let obj = null, label = '', tip = '';
    const reg = REGIONS[this.region];
    if (kind === 'ore') {
      const col = this.region === 1 ? '#9ae8ff' : this.region === 4 ? '#ff8a3a' : this.region === 5 ? '#c86bff' : '#ffd25e';
      obj = safeProp('crystalcluster', { color: col }) || safeProp('crystal', { color: col }) || safeProp('rock', {});
      label = 'Glinting vein'; tip = 'Something shiny is wedged in the rock.';
    } else if (kind === 'skeleton') { obj = safeProp('bones', {}); label = 'Old bones'; tip = 'A miner who never made it home. Their pockets jingle.'; }
    else if (kind === 'note') { obj = safeProp('books', {}) || safeProp('signpost', {}); label = 'Scrap of paper'; tip = 'Someone left a note.'; }
    else if (kind === 'mushroom') { obj = safeProp('mushroom', { small: true, color: reg.pal.accent[0] }); label = 'Odd mushroom'; tip = 'It smells… edible? Probably?'; }
    else if (kind === 'crate') { obj = safeProp('crate', {}); label = 'Supply crate'; tip = 'Stamped HOLLOWDEEP MINING CO.'; }
    else if (kind === 'cart') { obj = safeProp('minecart', {}); label = 'Abandoned cart'; tip = 'Still half full of ore!'; }
    if (!obj) obj = new THREE.Group();
    obj.position.set(x, y, z);
    if (kind === 'ore') obj.scale.setScalar(0.65);
    if (kind === 'mushroom') obj.scale.setScalar(0.7);
    obj.rotation.y = (this.rng ? this.rng.next() : Math.random()) * 0.8 - 0.4;
    this.extra.add(obj);
    return { kind, x, obj, label, tip, used: false, anchor: new THREE.Vector3(x, y + (kind === 'cart' ? 0.9 : 0.55), z) };
  }

  placeChar() {
    const y = this.pathY(this.x);
    if (this.cart) {
      this.cart.position.set(this.x, y, 0);
      this.char.group.position.set(this.x, y + 0.32, 0);
    } else this.char.group.position.set(this.x, y, 0);
  }

  camTarget() {
    const x = this.x, y = this.pathY(x);
    if (this.camOverride) return this.camOverride();
    switch (this.camMode) {
      case 'wide': return { pos: [x + 1.5, y + 3.4, 10.5], look: [x + 2, y + 0.6, 0], fov: 40 };
      case 'low': return { pos: [x - 1.6, y + 0.55, 4.2], look: [x + 1.4, y + 1.0, -0.3], fov: 42 };
      case 'front': return { pos: [x + 4.2, y + 1.5, 3.6], look: [x + 0.2, y + 0.85, 0], fov: 38 };
      default: return { pos: [x + 0.6, y + 1.7, 7.0], look: [x + 1.3, y + 0.9, 0], fov: 38 };
    }
  }

  say(text, life = 2.4) { this.bubble = { text, t: 0, life }; }

  *introRoutine() {
    yield 1.2;
    if (this.game.run) this.say(bark(this.game.run.char, 'start', this.rng || undefined));
  }

  // ------------------------------------------------------------------ loop
  update(dt, rdt) {
    const game = this.game;
    const inp = game.input;
    this.titleT += rdt;
    if (this.set.follow) this.set.follow(this.x);
    if (this.set.update) this.set.update(dt, this.time);
    if (Props.tickProps) Props.tickProps(this.extra, dt, this.time, { add: this.world.sparks, alpha: this.world.dust });
    this.char.update(dt);
    for (const m of this.monsters) m.update(dt);
    this.world.sparks.update(dt);
    this.world.dust.update(dt);

    if (inp.actionPressed('fast') && !this.qte) this.fast = !this.fast;

    if (this.mode === 'walk' || this.mode === 'exit') {
      const v = this.speed * (this.cart ? 2.2 : 1);
      this.x += v * dt;
      this.stepT -= dt;
      if (this.stepT <= 0 && !this.cart) {
        this.stepT = 0.36;
        const metal = this.tunnel === 'chainbridge' || this.tunnel === 'elevator';
        game.audio && game.audio.play(metal ? 'step_metal' : 'footstep', { vol: 0.25, pitch: 0.9 + Math.random() * 0.2 });
      }
      for (const m of this.moments) if (!m.fired && this.x >= m.x && this.mode === 'walk') { m.fired = true; this.fire(m); break; }
      if (this.mode === 'walk' && this.x >= this.x1 - 2.5) this.beginExit();
    } else if (this.mode === 'pause') {
      this.pauseT -= dt;
      if (this.pauseT <= 0) this.resumeWalk();
    }
    this.placeChar();

    // camera beats
    const prog = (this.x - this.x0) / (this.x1 - this.x0);
    if (!this.qte && !this.camOverride) {
      this.camMode = prog > 0.82 ? 'front' : prog > 0.66 ? 'side' : prog > 0.5 ? 'low' : prog > 0.22 && prog < 0.36 ? 'wide' : 'side';
    }
    const ct = this.camTarget();
    this.rig.aim(ct.pos, ct.look, ct.fov, this.qte ? 5 : 1.8);
    this.rig.update(this.qte ? rdt : dt); // the camera cuts in at full speed while the world crawls
    ambientDust(this.world, [this.x + 2, this.pathY(this.x) + 1.5, -0.5], [5, 1.4, 1.5], REGIONS[this.region].pal.glow2, 0.35);

    // QTE (real time)
    if (this.qte) {
      const st = this.qte.q.update(rdt);
      if (st !== 'pending' && !this.qte.resolved) {
        this.qte.resolved = true;
        this.qte.lingerT = 0.45;
        this.qte.done(st === 'win', this.qte.q);
      }
      if (this.qte.resolved) {
        this.qte.lingerT -= rdt;
        if (this.qte.lingerT <= 0) this.qte = null;
      }
    }
    game.timeScale = this.qte && !this.qte.resolved ? 0.28 : this.fast && this.mode === 'walk' ? 3 : 1;

    if (this.bubble) { this.bubble.t += rdt; if (this.bubble.t > this.bubble.life) this.bubble = null; }
    for (let i = this.flyers.length - 1; i >= 0; i--) { const f = this.flyers[i]; f.t += rdt; if (f.t > f.dur) this.flyers.splice(i, 1); }
    // glint particles on ore inspectables
    for (const it of this.items) if (!it.used && (it.kind === 'ore' || it.kind === 'cart') && Math.random() < 0.08) {
      this.world.sparks.emit({ pos: [it.anchor.x, it.anchor.y - 0.1, it.anchor.z + 0.2], posSpread: 0.18, vel: [0, 0.3, 0], spread: 0.1, life: [0.4, 0.9], size: 1, color: ['#fff6c0', '#ffe08a'], glow: 3 });
    }
  }

  resumeWalk() {
    if (this.ended) return;
    this.mode = 'walk';
    this.char.lookAt && this.char.lookAt(null);
    this.char.play('walk', { loop: true });
  }

  beginExit() {
    if (this.ended) return;
    this.mode = 'exit';
    this.co.start(this.exitRoutine.bind(this));
  }

  *exitRoutine() {
    const node = this.node;
    if (node && this.game.run) this.say(node.type === 'boss' ? 'Here we go…' : node.type === 'merchant' ? 'Is that… a shop?' : node.type === 'treasure' ? 'I smell treasure!' : node.type === 'camp' ? 'A safe spot. Finally.' : 'Almost there.', 1.6);
    yield 1.6;
    this.finishTravel();
  }

  finishTravel() {
    if (this.ended) return;
    this.ended = true;
    this.mode = 'done';
    const game = this.game;
    game.timeScale = 1;
    const go = () => { if (this.node) arrive(game, this.node); else game.go('map', {}); };
    if (game.run && game.run.bag.overflow.length) openBag(game, { title: 'Found on the way', onClose: go });
    else go();
  }

  // ------------------------------------------------------------------ inspectables
  interact(it) {
    const game = this.game, run = game.run, rng = this.rng;
    if (it.used || !run) return;
    it.used = true;
    this.mode = 'pause';
    this.pauseT = 1.6;
    const ch = this.char;
    ch.lookAt && ch.lookAt(it.anchor);
    const a = game.audio;
    const pick = (arr) => (rng ? rng.pick(arr) : arr[Math.floor(Math.random() * arr.length)]);
    const screen = this.toScreen(it.anchor);
    switch (it.kind) {
      case 'ore': {
        ch.play('mine');
        a && a.play('pick_strike');
        const id = rollMaterial(rng, run.region, ['ore', 'mineral', 'crystal'], 0, this.edge.sight === 'glint' ? 2 : 1, run.char === 'clover' ? 0.5 : 0);
        const item = makeItem(id, rollQuality(rng));
        this.gainItem(item, screen);
        const rare = RARITY[MATERIALS[id].rarity].order;
        a && a.play(rare >= 2 ? 'ore_rare' : 'ore_common');
        ch.setExpression('happy');
        this.say(bark(run.char, 'mine', rng || undefined));
        this.burstAt(it.anchor, ['#ffe08a', '#fff6c0', MATERIALS[id].color], 18);
        it.obj.visible = false;
        break;
      }
      case 'skeleton': {
        ch.play('point');
        const c = run.gain(4 + Math.floor((rng ? rng.next() : Math.random()) * 7) + run.region * 2);
        a && a.play('coins');
        game.ui.float(`+${c}`, screen.x, screen.y - 8, { color: COLORS.gold });
        ch.setExpression('surprised');
        this.say(pick(['Rest easy, friend.', 'Sorry. I\'ll put it to good use.', 'Spooky. Profitable, but spooky.']));
        break;
      }
      case 'note': {
        ch.play('read');
        a && a.play('page_turn');
        ch.setExpression('neutral');
        this.pauseT = 3.2;
        this.say(pick(LORE[run.region] || LORE[0]), 3.4);
        break;
      }
      case 'mushroom': {
        ch.play('shrug');
        const good = rng ? rng.chance(0.6) : Math.random() < 0.6;
        if (good) {
          const h = run.heal(5 + run.region);
          a && a.play('heal');
          game.ui.float(`+${h} HP`, screen.x, screen.y - 8, { color: COLORS.heal });
          ch.setExpression('happy');
          this.say(pick(['Mmm! Tastes like moss and victory.', 'Surprisingly good!']));
        } else {
          a && a.play('poison_bubble');
          ch.setExpression('hurt');
          this.say(pick(['Blegh! That was NOT edible.', 'My tongue is fizzing…']));
          this.damage(3, 'a suspicious mushroom');
        }
        it.obj.visible = false;
        break;
      }
      case 'crate': {
        ch.play('point');
        a && a.play('chest_open');
        const id = pick(['blast', 'flare', 'scanner', 'junk', 'coal', 'iron']);
        this.gainItem(makeItem(id, 2), screen);
        ch.setExpression('happy');
        this.say(pick(['Ooh, supplies!', 'Mining Co. won\'t miss this.']));
        break;
      }
      case 'cart': {
        ch.play('cheer');
        a && a.play('ore_rare');
        for (let i = 0; i < 2; i++) this.gainItem(makeItem(rollMaterial(rng, run.region, ['ore', 'mineral', 'crystal'], 0, 2), rollQuality(rng)), screen, i * 0.2);
        ch.setExpression('happy');
        this.say('Jackpot!');
        break;
      }
    }
  }

  gainItem(item, from, delay = 0) {
    const game = this.game;
    const placed = game.run.addItem(item);
    const m = MATERIALS[item.id];
    this.flyers.push({ sprite: materialSprite(item.id, 16), from: { x: from.x, y: from.y }, to: { x: 30, y: game.ui.h - 14 }, t: -delay, dur: 0.9 });
    game.ui.toast(`${m.name}${placed ? '' : ' (bag full — sort it on arrival)'}`, { icon: 'bag', color: RARITY[m.rarity].color });
  }

  burstAt(v3, colors, n = 14) {
    this.world.sparks.emit({ pos: [v3.x, v3.y, v3.z + 0.2], count: n, radial: [0.6, 1.8], gravity: 3, life: [0.3, 0.8], size: 1, color: colors, glow: 2.5, drag: 1.5 });
  }

  damage(n, cause) {
    const game = this.game, run = game.run;
    if (!run) return;
    const dead = run.hurt(n);
    game.audio && game.audio.play('hurt');
    this.rig.shake(0.5);
    game.renderer.doFlash(0.25, [1, 0.25, 0.2]);
    const s = this.toScreen(this.char.headPos ? this.char.headPos() : this.char.group.position);
    game.ui.float(`-${n}`, s.x, s.y - 6, { big: true, scale: 2, top: '#ffd0c0', bottom: '#ff3a2a' });
    if (dead) {
      this.ended = true;
      this.mode = 'done';
      this.char.play('defeat');
      this.co.start(function* () { yield 1.2; gameOver(game, cause); });
    }
  }

  toScreen(v3) {
    const v = v3.isVector3 ? v3 : new THREE.Vector3(v3.x, v3.y, v3.z);
    return this.rig.project(v, this.game.ui.w, this.game.ui.h);
  }

  headScreen() {
    const p = this.char.headPos ? this.char.headPos() : this.char.group.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    return this.toScreen(p);
  }

  // ------------------------------------------------------------------ QTE moments
  startQTE(q, done) { this.qte = { q, done, resolved: false }; }

  fire(m) {
    const game = this.game, run = game.run, rng = this.rng;
    const a = game.audio;
    const chance = (p) => (rng ? rng.chance(p) : Math.random() < p);
    const dmgBase = 6 + this.region * 2;
    const ch = this.char;
    const qpos = () => { const s = this.headScreen(); return { x: s.x + 44, y: s.y + 6 }; };
    this.mode = 'pause';
    this.pauseT = 99;
    const finish = (delay = 0.9) => { this.pauseT = delay; this.camOverride = null; };
    switch (m.type) {
      case 'collapse': {
        a && a.play('bridge_creak');
        ch.setExpression('surprised');
        this.say('Uh oh…', 1.2);
        this.rig.shake(0.3);
        this.camOverride = () => { const x = this.x, y = this.pathY(x); return { pos: [x + 0.3, y + 0.9, 4.2], look: [x + 0.8, y + 0.6, 0], fov: 34 }; };
        this.startQTE(new TimingQTE(game, { action: 'strike', label: 'JUMP!', dur: 1.05, window: 0.17, pos: qpos }), (win) => {
          a && a.play('bridge_snap');
          this.planks(m.x + 0.5);
          if (win) {
            ch.play('jump', { onDone: () => ch.play('cheer') });
            ch.setExpression('happy');
            this.say(chance(0.5) ? 'Nailed it!' : 'Too close!');
            this.x += 1.2;
          } else {
            ch.play('fall', { onDone: () => ch.play('idle') });
            ch.setExpression('hurt');
            this.say('I\'m okay! …Mostly.', 2);
            this.damage(dmgBase, 'a collapsing bridge');
          }
          finish(1.4);
        });
        break;
      }
      case 'chase': {
        const cart = safeProp('minecart', {});
        if (cart) { this.cart = cart; this.extra.add(cart); cart.rotation.y = Math.PI / 2; }
        a && a.play('minecart_roll');
        ch.play('cheer');
        ch.setExpression('determined');
        this.say('Hop in!', 1.2);
        ribbonTitleFlash(this, 'RUNAWAY CART!');
        this.mode = 'walk';
        this.pauseT = 0;
        const seq = [];
        for (let i = 0; i < 3; i++) seq.push(chance(0.5) ? 'jump' : 'duck');
        this.co.start(this.chaseRoutine.bind(this, seq, dmgBase));
        break;
      }
      case 'ambush': {
        const pool = regionPool(this.region, 'normal');
        const def = pool.length ? (rng ? rng.pick(pool) : pool[0]) : MONSTERS.rustrat;
        let mon = null;
        try { mon = buildMonster(def.id); } catch (e) { mon = null; }
        const x = this.x, y = this.pathY(x);
        if (mon) {
          mon.group.position.set(x + 3.2, y + 2.4, -1.4);
          this.world.scene.add(mon.group);
          this.monsters.push(mon);
          mon.play('attack');
          this.tw.to(mon.group.position, { x: x + 1.5, y, z: 0 }, 0.35, { ease: 'outQuad' });
        }
        a && a.play('monster_growl');
        ch.play('block');
        ch.setExpression('surprised');
        this.rig.shake(0.35);
        this.say('!!', 0.8);
        this.camOverride = () => { const xx = this.x, yy = this.pathY(xx); return { pos: [xx + 0.75, yy + 1.1, 4.6], look: [xx + 0.75, yy + 0.8, 0], fov: 36 }; };
        this.startQTE(new TimingQTE(game, { action: 'block', label: 'PARRY!', dur: 0.95, window: 0.16, pos: qpos }), (win) => {
          if (win) {
            a && a.play('parry');
            ch.play('parry', { onDone: () => ch.play('cheer') });
            ch.setExpression('determined');
            if (mon) { mon.play('hurt'); mon.flash('#ffffff', 0.12); }
            this.burstAt(new THREE.Vector3(x + 0.8, y + 0.8, 0), ['#ffffff', '#ffe08a'], 22);
            const drop = def.drops && def.drops[0];
            if (drop) this.gainItem(makeItem(drop.id, 2), this.toScreen(new THREE.Vector3(x + 1.5, y + 0.6, 0)));
            this.say(`Shoo, ${def.name}!`);
          } else {
            a && a.play('heavy_hit');
            ch.play('hurt');
            ch.setExpression('hurt');
            this.say(bark(run ? run.char : 'clover', 'hurt', rng || undefined));
            this.damage(Math.round(def.dmg * (1 + this.region * 0.35)), `an ambushing ${def.name}`);
          }
          if (mon) this.co.start(function* () {
            yield 0.5;
            mon.play('idle');
            this.tw.to(mon.group.position, { x: mon.group.position.x + 6, y: mon.group.position.y + 1.5, z: -2.5 }, 0.8, { ease: 'inQuad' });
            yield 0.9;
            mon.group.visible = false;
          }.bind(this));
          finish(1.3);
        });
        break;
      }
      case 'grab': {
        a && a.play('splash');
        ch.play('hurt');
        ch.setExpression('surprised');
        this.say('Something grabbed my leg!', 1.4);
        this.camOverride = () => { const x = this.x, y = this.pathY(x); return { pos: [x + 0.4, y + 0.7, 4.0], look: [x + 0.4, y + 0.4, 0], fov: 36 }; };
        this.splashT = 0;
        this.startQTE(new MashQTE(game, { label: 'KICK FREE!', need: 11, dur: 3.2, pos: () => { const s = this.headScreen(); return { x: s.x, y: s.y - 34 }; } }), (win) => {
          a && a.play('splash');
          this.splash(18);
          if (win) {
            ch.play('jump', { onDone: () => ch.play('idle') });
            ch.setExpression('smug');
            this.say('Not today, lake thing!');
            if (chance(0.5) && run) this.gainItem(makeItem('slime_gel', 2), this.headScreen());
          } else {
            ch.play('hurt');
            ch.setExpression('hurt');
            this.say('It bit me! It BIT me!');
            this.damage(dmgBase - 1, 'something in the water');
          }
          finish(1.2);
        });
        break;
      }
      case 'rope': {
        a && a.play('elevator');
        a && a.play('bridge_snap');
        this.rig.shake(0.6);
        ch.play('fall');
        ch.setExpression('surprised');
        this.say('The rope!', 1);
        this.camOverride = () => { const x = this.x, y = this.pathY(x); return { pos: [x - 0.6, y + 0.3, 3.8], look: [x + 0.2, y + 1.0, 0], fov: 40 }; };
        this.startQTE(new TimingQTE(game, { action: 'strike', label: 'BRAKE!', dur: 0.9, window: 0.15, pos: qpos }), (win) => {
          if (win) {
            a && a.play('hard_clang');
            this.burstAt(this.char.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), ['#ffe08a', '#ff9a3a'], 20);
            ch.play('cheer');
            ch.setExpression('happy');
            this.say('Phew. Taking the stairs next time.');
          } else {
            a && a.play('rumble');
            ch.play('hurt');
            ch.setExpression('hurt');
            this.say('Ow ow ow…');
            this.damage(dmgBase + 2, 'a falling elevator');
          }
          finish(1.2);
        });
        break;
      }
      default: { // rockfall
        a && a.play('rumble');
        this.rig.shake(0.45);
        ch.setExpression('surprised');
        this.say('Rocks!', 1);
        const x = this.x + 0.6, y = this.pathY(this.x);
        this.rocksAt(x, y);
        this.startQTE(new TimingQTE(game, { action: 'strike', label: 'ROLL!', dur: 0.85, window: 0.15, pos: qpos }), (win) => {
          a && a.play('rock_break');
          if (win) {
            ch.play('dodge', { onDone: () => ch.play('idle') });
            ch.setExpression('smug');
            this.say('Missed me!');
            this.x += 1.0;
          } else {
            ch.play('hurt');
            ch.setExpression('hurt');
            this.say('My head!');
            this.damage(dmgBase, 'falling rocks');
          }
          finish(1.0);
        });
      }
    }
  }

  *chaseRoutine(seq, dmgBase) {
    const game = this.game, a = game.audio, ch = this.char;
    this.camOverride = () => { const x = this.x, y = this.pathY(x); return { pos: [x + 2.2, y + 1.2, 5.2], look: [x + 1.6, y + 0.7, 0], fov: 40 }; };
    for (let i = 0; i < seq.length; i++) {
      yield 0.9;
      const kind = seq[i];
      const ox = this.x + 3.2, oy = this.pathY(ox);
      const obs = kind === 'jump' ? safeProp('rock', {}) : safeProp('support', {});
      if (obs) {
        obs.position.set(ox, oy + (kind === 'duck' ? 0.55 : 0), 0);
        if (kind === 'duck') obs.scale.set(1, 0.6, 1);
        this.extra.add(obs);
      }
      let result = null;
      this.startQTE(new TimingQTE(game, { action: kind === 'jump' ? 'strike' : 'block', label: kind === 'jump' ? 'JUMP!' : 'DUCK!', dur: 0.75, window: 0.16, pos: () => { const s = this.headScreen(); return { x: s.x + 18, y: s.y - 30 }; } }), (win) => {
        result = win;
        if (win) { ch.play(kind === 'jump' ? 'jump' : 'dodge'); a && a.play('wind_whoosh'); }
        else { ch.play('hurt'); a && a.play('heavy_hit'); ch.setExpression('hurt'); this.damage(Math.round(dmgBase * 0.6), 'a runaway minecart'); }
      });
      yield () => result !== null || this.ended;
      if (this.ended) return;
      yield 0.6;
      if (obs) obs.visible = false;
    }
    // hop off
    a && a.play('hard_clang');
    if (this.cart) { this.cart.visible = false; this.cart = null; }
    this.camOverride = null;
    ch.play('jump', { onDone: () => { if (this.mode === 'walk') ch.play('walk', { loop: true }); } });
    ch.setExpression('happy');
    this.say(this.game.run && this.game.run.hp > this.game.run.maxHp * 0.5 ? 'WHEEE! Again!' : 'Never again.');
  }

  planks(x) {
    const y = this.pathY(x);
    for (let i = 0; i < 3; i++) this.world.dust.emit({ pos: [x + i * 0.3, y - 0.05, 0], count: 8, vel: [0, -0.5, 0], spread: 0.6, gravity: 6, life: [0.8, 1.4], size: 2, color: ['#8a5a33', '#5a3820', '#c48a52'] });
  }
  splash(n) {
    const p = this.char.group.position;
    this.world.sparks.emit({ pos: [p.x, p.y + 0.1, p.z], count: n, radial: [0.8, 2], radialUp: 1.4, gravity: 7, life: [0.4, 0.9], size: 1, color: ['#9ae8ff', '#e6fbff', '#3a8ac0'], glow: 1.4 });
  }
  rocksAt(x, y) {
    const pal = REGIONS[this.region].pal.rock;
    for (let i = 0; i < 4; i++) this.world.dust.emit({ pos: [x + (Math.random() - 0.5) * 1.2, y + 3.2, (Math.random() - 0.5) * 0.6], count: 6, vel: [0, -2.5, 0], spread: 0.4, gravity: 9, floor: y, bounce: 0.25, life: [1, 1.6], size: 2, color: [pal[2], pal[3], pal[4]] });
  }

  // ------------------------------------------------------------------ UI
  draw(ui) {
    const game = this.game, run = game.run;
    const R = REGIONS[this.region];
    const T = TUNNELS[this.tunnel] || TUNNELS.tunnel;

    // inspectable markers
    const canClick = (this.mode === 'walk' || this.mode === 'pause') && !this.qte && !this.ended;
    for (const it of this.items) {
      if (it.used) continue;
      const s = this.toScreen(it.anchor);
      if (s.behind || s.x < -20 || s.x > ui.w + 20) continue;
      const bob = Math.round(Math.sin(this.time * 4 + it.x) * 2);
      const h = canClick ? ui.hit('insp' + it.x.toFixed(2), s.x - 14, s.y - 18, 28, 30) : { hover: false };
      const near = Math.abs(it.x - this.x) < 7;
      if (near || h.hover) {
        ui.icon(it.kind === 'note' ? 'scroll' : it.kind === 'skeleton' ? 'skull' : it.kind === 'mushroom' ? 'question' : it.kind === 'crate' ? 'chest' : 'sparkle', s.x - 4, s.y - 22 + bob, { alpha: h.hover ? 1 : 0.8 });
      }
      if (h.hover) {
        const c = ui.ctx;
        c.fillStyle = '#ffd25e';
        for (const [cx, cy, dx, dy] of [[-14, -16, 1, 1], [13, -16, -1, 1], [-14, 13, 1, -1], [13, 13, -1, -1]]) {
          c.fillRect(Math.round(s.x + cx), Math.round(s.y + cy), 4 * dx || 1, 1);
          c.fillRect(Math.round(s.x + cx), Math.round(s.y + cy), 1, 4 * dy || 1);
        }
        ui.tooltip({ title: it.label, body: it.tip + '\n{gold}Click to inspect.{/}' });
      }
      if (h.clicked) this.interact(it);
    }

    // speech bubble
    if (this.bubble) {
      const s = this.headScreen();
      const k = this.bubble.t / this.bubble.life;
      speech(ui, s.x, s.y - 4, this.bubble.text, { alpha: k > 0.85 ? (1 - k) / 0.15 : 1, maxW: 140 });
    }

    // QTE
    if (this.qte) {
      if (!this.qte.resolved) ui.rect(0, 0, ui.w, ui.h, '#07060b', 0.18);
      this.qte.q.draw(ui);
    }

    // flying loot
    for (const f of this.flyers) {
      if (f.t < 0) continue;
      const k = ease.inOutCubic(clamp(f.t / f.dur));
      const x = f.from.x + (f.to.x - f.from.x) * k, y = f.from.y + (f.to.y - f.from.y) * k - Math.sin(k * Math.PI) * 40;
      ui.img(f.sprite, Math.round(x - 8), Math.round(y - 8));
    }

    // HUD
    const h = hud(ui, game);
    if (h.bagClicked && !this.qte && !this.ended) openBag(game, {});

    // title card
    const ta = this.titleT < 0.3 ? this.titleT / 0.3 : this.titleT > 2.8 ? Math.max(0, 1 - (this.titleT - 2.8) / 0.5) : 1;
    if (ta > 0) {
      ribbonTitle(ui, T.name, ui.w / 2, 40, R.ribbon || 'brown', ta);
      if (this.node) {
        const nt = NODE_TYPES[this.node.type] || NODE_TYPES.monster;
        ui.ctx.globalAlpha = ta;
        const label = `toward the {${nt.color}}${nt.name}{/}`;
        const lw = ui.measure(label) + 20;
        ui.img(nodeBadge(this.node.type, 15), Math.round(ui.w / 2 - lw / 2), 58);
        ui.text(label, Math.round(ui.w / 2 - lw / 2) + 19, 62, { color: COLORS.dim, outline: '#140c10', outlineShadow: false });
        ui.ctx.globalAlpha = 1;
      }
    }

    // progress track
    const tw = 170, tx = Math.round(ui.w / 2 - tw / 2), ty = ui.h - 16;
    ui.rect(tx, ty, tw, 3, '#140c10');
    ui.rect(tx + 1, ty + 1, tw - 2, 1, '#5a4a3a');
    const prog = clamp((this.x - this.x0) / (this.x1 - this.x0));
    ui.rect(tx + 1, ty + 1, Math.round((tw - 2) * prog), 1, '#ffd25e');
    for (const m of this.moments) {
      const mx = tx + Math.round(((m.x - this.x0) / (this.x1 - this.x0)) * tw);
      ui.text('!', mx - 1, ty - 9, { color: m.fired ? COLORS.dim : COLORS.bad, outline: '#140c10', outlineShadow: false });
    }
    for (const it of this.items) if (!it.used) ui.rect(tx + Math.round(((it.x - this.x0) / (this.x1 - this.x0)) * tw), ty - 2, 1, 1, '#fff6c0');
    ui.rect(tx + Math.round(prog * tw) - 1, ty - 2, 3, 7, '#fff6e0');
    if (this.node) ui.img(nodeBadge(this.node.type, 15), tx + tw + 3, ty - 7);

    // fast-forward
    if (!this.ended && ui.button('travel-fast', ui.w - 64, ui.h - 24, 60, 20, this.fast ? 'Fast ×3' : 'Fast', { style: this.fast ? 'gold' : 'iron', key: 'F', icon: 'arrowR' })) this.fast = !this.fast;
  }
}

function ribbonTitleFlash(scene, text) {
  scene.game.ui.toast(text, { icon: 'minecart', color: COLORS.warn, life: 1.8 });
}
