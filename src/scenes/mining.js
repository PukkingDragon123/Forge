// Mining spot: a hand-painted mine chamber. Your explorer (3D) stands at a rock face of chiselled
// stones; strike the stones from the top down, read the clues in the rock, and watch the ore tumble
// into the minecart. Swings are chalked on a slate, tools wait in a crate, the anvil forges a pick.
// There are no panels: everything you touch is part of the room.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { ParticleSystem } from '../gfx/particles.js';
import { pixelTexture } from '../gfx/materials.js';
import { generateMine, MiningRun, MINE_W, MINE_H } from '../systems/mining.js';
import { REGIONS } from '../data/regions.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { matOf } from '../systems/items.js';
import { materialSprite } from '../art/sprites.js';
import { buildCharacter } from '../models/characters.js';
import { buildWeaponMesh, crackWeapon, shatterPieces, updateShards } from '../models/weapons3d.js';
import {
  SCREEN_W, SCREEN_H, FLOOR_Y, BOARD, LANTERNS, PROPS, rockFace, cellAt, stoneCanvas, cavityCanvas, faceRim, chunkCanvas,
  chamberCanvas, lanternCanvas, glowCanvas, cartCanvas, crateCanvas, anvilCanvas, slateCanvas, noteCanvas, tagCanvas,
} from './mining_art.js';
import { openForge } from './forgeui.js';
import { speech, prompt, ring, dim, bark } from './common.js';
import { finish, openBag, gameOver } from './flow.js';
import { COLORS } from '../ui/font.js';
import { save } from '../core/save.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

const PX = 0.01;
const TOOL_IDS = ['blast', 'drill', 'scanner', 'radar', 'flare'];
const TOOL_USE = { blast: 'blast', drill: 'drill', scanner: 'scan', radar: 'radar', flare: 'flare' };
const ORE_SFX = ['ore_common', 'ore_common', 'ore_rare', 'ore_epic', 'ore_legendary'];
const RARITY_WORD = ['', 'Uncommon', 'Rare!', 'EPIC!', 'LEGENDARY!'];
const HERO = { x: 168, y: FLOOR_Y + 4 };
const PICK_TEXT = {
  strikes: (v) => `+${v} swing${v > 1 ? 's' : ''}`, magnetic: () => 'Magnetic: pulls adjacent metals', gemDupe: () => 'Crystal: first gem doubled',
  cursed: () => 'Cursed: 3×3 swings, -1 quality', lucky: () => 'Lucky: better ores', smelt: () => 'Smelt: metals +1 quality',
  hard: () => 'Breaks hard rock in 1 hit', freeze: () => 'Freezes hazards', chain: () => 'Chain: linked ores break',
  reveal: () => 'Glint: reveals rarity', column: () => 'Starfall: first swing breaks a column', area: () => 'Also breaks the stone below',
  preserve: () => 'Preserve: no quality loss', unlock: () => 'Opens treasure pockets', archaeo: () => 'Fossils +1 quality', seehaz: () => 'Reveals hazards',
  quality: () => 'Gems +1 quality', melt: () => 'Melts ice ores!',
};
const toWorld = (x, y) => ({ x: (x - SCREEN_W / 2) * PX, y: (SCREEN_H / 2 - y) * PX });

export class MiningScene extends Scene {
  enter(params = {}) {
    const game = this.game, run = game.run;
    this.node = params.node;
    this.region = run.region;
    this.pal = REGIONS[this.region].pal;
    this.luck = run.char === 'clover' ? 1 : 0;
    this.genSeed = 'mine' + run.map.current + ':' + run.stats.floors;
    this.wall = generateMine(run.rng.fork(this.genSeed), this.region, { luck: this.luck });
    this.geom = rockFace(7 + run.stats.floors * 3 + this.region * 11);
    this.pick = {}; this.pickName = null; this.pickIds = ['iron', 'oak'];
    this.mr = null;
    this.phase = 'intro';
    this.busy = false;
    this.tool = null;
    this.tray = [];
    this.flyers = [];
    this.parts = [];
    this.rubble = [];
    this.impacts = [];
    this.shakes = {};
    this.reveal = null;
    this.qte = null;
    this.say = null;
    this.forge = null;
    this.flareT = 0;
    this.shakeT = 0;
    this.cartBump = 0;
    this.noteOpen = !save.data.seen.tips.mining;
    this.shown = new Set();
    this.buildWorld();
    const au = game.audio;
    au.music(REGIONS[this.region].music);
    this.amb = au.loop(this.region === 4 ? 'lava' : 'cave');
    this.co.start(function* () { yield 0.7; this.speak(bark(run.char, 'mine'), 2.6); this.phase = 'prep'; }.bind(this));
  }
  exit() { this.amb && this.amb.stop(1); }

  buildWorld() {
    const run = this.game.run;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07090c');
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W * PX, SCREEN_H * PX), new THREE.MeshBasicMaterial({ map: pixelTexture(chamberCanvas(this.region, this.pal)) }));
    scene.add(bg);
    const cam = new THREE.OrthographicCamera(-4.8, 4.8, 2.7, -2.7, 0.1, 50);
    cam.userData.viewHeight = SCREEN_H * PX;
    cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
    // painted backdrop stays exactly as painted; the 3D explorer gets inked outlines and warm lamp light
    this.world = { scene, camera: cam, post: { tone: 0, saturation: 1, contrast: 1, lift: [0, 0, 0], gain: [1, 1, 1], vignette: 0.22, dither: 0, bloom: 0.45, threshold: 0.8, outline: 0.75, edge: 0.35 } };
    scene.add(new THREE.HemisphereLight(0x6a8a9a, 0x3a2216, 0.75));
    const lamp = new THREE.PointLight(0xffb35a, 4.2, 9, 1.2);
    const lw = toWorld(LANTERNS[0].x, LANTERNS[0].y + 10);
    lamp.position.set(lw.x, lw.y, 1.8);
    scene.add(lamp);
    this.lamp = lamp;
    const rim = new THREE.DirectionalLight(0xff9a50, 1.1);
    rim.position.set(3, 1.2, -2);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x5a8aa8, 0.45);
    fill.position.set(-3, 0.5, 4);
    scene.add(fill);
    this.dust = new ParticleSystem(300);
    this.sparks = new ParticleSystem(200, { additive: true });
    scene.add(this.dust.object, this.sparks.object);
    // the explorer, pick in hand, turned toward the rock face
    const hero = buildCharacter(run.char);
    const box = new THREE.Box3().setFromObject(hero.group);
    const h = Math.max(0.3, box.max.y - box.min.y);
    const scale = (run.char === 'durgan' ? 150 : run.char === 'clover' ? 165 : 196) * PX / h;
    hero.group.scale.setScalar(scale);
    const hw = toWorld(HERO.x, HERO.y);
    hero.group.position.set(hw.x, hw.y - box.min.y * scale, 1);
    hero.group.rotation.y = 1.0;
    hero.play('idle', { loop: true });
    scene.add(hero.group);
    this.hero = hero;
    this.heroH = h * scale;
    this.equipPick();
    this.shards = null;
  }
  equipPick() {
    const mesh = buildWeaponMesh({ bp: 'pickaxe', ids: this.pickIds, el: {}, grade: this.pickName ? 2 : 0 });
    this.pickMesh = mesh;
    this.hero.hold(mesh);
  }
  headScreen() { return { x: HERO.x + 6, y: HERO.y - this.heroH / PX - 6 }; }

  exposed(x, y) { return this.mr ? this.mr.exposed(x, y) : y === 0 && !this.wall.tiles[0][x].broken; }
  speak(text, dur = 2) { if (text) this.say = { text, t: dur }; }
  shake(p = 1) { this.shakeT = Math.max(this.shakeT, 0.25 * p); }
  stoneCenter(x, y) { const c = this.geom.cells[y][x]; return { x: BOARD.x + c.cx, y: BOARD.y + c.cy }; }

  // ------------------------------------------------------------------ actions
  openPickForge() {
    if (this.forge || this.pickName || this.phase !== 'prep') return;
    this.phase = 'forging';
    this.hero.play('hammer', { loop: true });
    this.forge = openForge(this, {
      mode: 'pickaxe',
      onDone: (res) => {
        this.forge = null;
        this.phase = 'prep';
        this.hero.play('idle', { loop: true });
        if (!res) return;
        this.pick = res.pick || {};
        this.pickName = res.name || 'Pickaxe';
        this.pickIds = res.ids && res.ids.length ? res.ids : ['iron'];
        this.equipPick();
        this.hero.play('cheer');
        if (this.pick.lucky) {
          this.wall = generateMine(this.game.run.rng.fork(this.genSeed + 'L'), this.region, { luck: this.luck + this.pick.lucky });
          this.game.ui.toast('Lucky Pick: the rock face shimmers!', { icon: 'star', color: COLORS.gold });
        }
        this.speak(`${this.pickName}! ${bark(this.game.run.char, 'forge')}`, 2.4);
      },
    });
  }
  startDig() {
    if (this.phase !== 'prep') return;
    this.phase = 'dig';
    this.mr = new MiningRun(this.wall, this.game.run.rng.fork(this.genSeed + 'dig'), this.pick, { char: this.game.run.char });
    if (this.noteOpen) this.closeNote();
  }
  closeNote() { this.noteOpen = false; save.data.seen.tips.mining = true; save.write(); }
  strikeTile(x, y) {
    if (this.phase === 'prep') this.startDig();
    if (this.busy || !this.mr || this.mr.strikes <= 0 || !this.mr.exposed(x, y)) return;
    this.busy = true;
    const hero = this.hero;
    hero.play('mine', { restart: true });
    this.game.audio.play('sword_swing', { pitch: 0.75 });
    this.co.start(function* () {
      yield Math.max(0.12, hero.impactTime('mine'));
      const res = this.mr.strike(x, y);
      this.impact(x, y);
      this.combo = 0;
      yield* this.playEvents(res.events);
      this.afterAction();
    }.bind(this));
  }
  useTool(item, x, y) {
    if (this.busy || !this.mr) return;
    const use = TOOL_USE[item.id];
    if (use !== 'scan' && use !== 'radar' && use !== 'flare' && !this.mr.exposed(x, y)) { this.speak('I need an open stone for that.', 1.4); this.game.audio.play('deny'); return; }
    this.busy = true;
    this.game.run.removeItem(item);
    this.tool = null;
    const au = this.game.audio;
    this.hero.play(use === 'blast' ? 'point' : 'cast');
    this.co.start(function* () {
      if (use === 'blast') { au.play('fire_whoosh'); this.speak('Fire in the hole!', 1.2); yield 0.45; this.game.renderer.doFlash(0.5, [1, 0.8, 0.5]); this.shake(2.5); this.game.hitStop(0.08); au.play('cave_in', { vol: 0.6 }); this.fxBurst(x, y, ['#ffd27a', '#ff8a3a', '#fff0b0'], 40, 'spark'); }
      else if (use === 'drill') { au.play('hard_clang', { pitch: 1.4 }); for (let i = 0; i < 5; i++) { this.fxBurst(x, Math.min(MINE_H - 1, y + (i >> 1)), ['#ffe08a'], 8, 'spark'); this.shake(0.6); yield 0.07; } }
      else if (use === 'scan') au.play('zap', { pitch: 1.6 });
      else if (use === 'radar') { au.play('blip'); yield 0.15; au.play('blip', { pitch: 1.3 }); }
      else if (use === 'flare') { au.play('fire_whoosh', { pitch: 1.3 }); this.flareT = 8; }
      const res = this.mr.useTool(use, x, y);
      this.combo = 0;
      yield* this.playEvents(res.events);
      this.afterAction();
    }.bind(this));
  }
  afterAction() {
    this.busy = false;
    this.hero.play('idle', { loop: true });
    if (this.mr.strikes <= 0 && this.phase === 'dig') {
      this.phase = 'done';
      this.hero.play('shrug');
      this.speak(this.hasTools() ? 'Out of swings… still got tools in the crate.' : 'That\'s all I can swing. To the cart!', 2.4);
    }
  }
  hasTools() { return this.game.run.bag.all().some((it) => TOOL_IDS.includes(it.id)); }

  // ------------------------------------------------------------------ juice
  impact(x, y) {
    const c = this.stoneCenter(x, y);
    this.shake(1);
    this.game.hitStop(0.05);
    this.game.audio.play('pick_strike', { pitch: 0.9 + rnd.next() * 0.2 });
    this.impacts.push({ x: c.x + rnd.float(-6, 6), y: c.y + rnd.float(-6, 6), t: 0 });
    this.game.ui.burst(c.x, c.y, 14, { colors: ['#fff6c8', '#ffd27a', '#ffffff'], speed: 130, gravity: 300, kind: 'spark', life: 0.5, up: 30 });
  }
  fxBurst(x, y, colors, n, kind) { const c = this.stoneCenter(x, y); this.game.ui.burst(c.x, c.y, n, { colors, speed: 140, gravity: 200, kind, life: 0.7 }); }
  breakFx(x, y) {
    const t = this.wall.tiles[y][x];
    const c = this.stoneCenter(x, y);
    const r = this.pal.rock;
    const cols = t.t === 'hard' ? [r[1], r[2], r[3]] : [r[2], r[3], r[4]];
    if (t.t === 'ore' && MATERIALS[t.mat]) cols.push(MATERIALS[t.mat].color, MATERIALS[t.mat].color);
    for (let i = 0; i < 13; i++) {
      const a = rnd.float(-Math.PI, 0), sp = rnd.float(60, 200);
      this.parts.push({ x: c.x + rnd.float(-16, 16), y: c.y + rnd.float(-14, 14), vx: Math.cos(a) * sp - 40, vy: Math.sin(a) * sp * 0.7, rot: 0, vr: rnd.float(-12, 12), img: chunkCanvas(rnd.pick(cols), rnd.int(1, 9), rnd.int(4, 10)), t: 0, floor: FLOOR_Y + rnd.float(2, 40) });
    }
    this.game.ui.burst(c.x, c.y, 18, { colors: ['#8a7a6a', '#a89888', '#6a5a4a'], speed: 50, gravity: -10, life: 1.2, drag: 2, size: 2 });
    this.game.audio.play('rock_break', { pitch: 0.9 + rnd.next() * 0.25 });
  }

  *playEvents(events) {
    const ui = this.game.ui, au = this.game.audio;
    for (const ev of events) {
      const sp = ev.x !== undefined ? this.stoneCenter(ev.x, ev.y) : { x: BOARD.x + BOARD.w / 2, y: BOARD.y + BOARD.h / 2 };
      switch (ev.type) {
        case 'crack': this.shakes[ev.x + ',' + ev.y] = 0.3; au.play('hard_clang'); ui.float('Crack!', sp.x, sp.y - 8, { color: '#e8dcc8', vy: -18, life: 0.8 }); yield 0.1; break;
        case 'break': this.breakFx(ev.x, ev.y); yield ev.how.chain || ev.how.magnet ? 0.09 : 0.05; if (ev.how.chain) this.fxBurst(ev.x, ev.y, ['#ffe74a', '#ffffff', '#9a7aff'], 14, 'spark'); if (ev.how.magnet) this.fxBurst(ev.x, ev.y, ['#ff5a5a', '#9ab0ff'], 10, 'spark'); break;
        case 'ore': case 'pocket': case 'dupe': {
          const it = ev.item;
          this.shown.add(it.uid);
          const r = RARITY[matOf(it).rarity].order;
          this.combo = (this.combo || 0) + 1;
          au.play(ORE_SFX[r], { pitch: 1 + Math.min(10, this.combo - 1) * 0.07 });
          if (ev.type === 'dupe') ui.float('×2!', sp.x, sp.y - 16, { big: true, scale: 2, top: '#e6fbff', bottom: '#7fe3ff' });
          if (ev.type === 'pocket') { au.play('chest_open'); ui.float('Treasure pocket!', sp.x, sp.y - 18, { color: COLORS.gold }); }
          ui.burst(sp.x, sp.y, 10 + r * 10, { colors: [matOf(it).color, matOf(it).color2 || '#ffffff', '#ffffff'], speed: 90 + r * 30, gravity: 60, kind: 'star', life: 0.9 });
          if (r >= 2) { this.reveal = { item: it, t: 0, r }; this.game.hitStop(0.12); this.hero.play('cheer'); yield 1.0; }
          this.flyers.push({ item: it, x0: sp.x, y0: sp.y, t: 0, dur: 0.7, spin: rnd.float(-8, 8) });
          yield 0.14;
          break;
        }
        case 'lucky': ui.float('LUCKY!', sp.x, sp.y - 22, { big: true, scale: 2, top: '#fff6c8', bottom: '#ff8ab0' }); au.play('sparkle'); yield 0.1; break;
        case 'melt': au.play('sizzle'); ui.float(`${MATERIALS[ev.mat].name} melted!`, sp.x, sp.y - 10, { color: COLORS.bad }); ui.burst(sp.x, sp.y, 20, { colors: ['#e8f0f8', '#c8d8e8'], speed: 40, gravity: -60, life: 1.2 }); this.speak('Ah! Too hot for that one!', 1.6); yield 0.2; break;
        case 'frozen': au.play('ice_crack'); ui.float('Hazard frozen!', sp.x, sp.y - 10, { color: COLORS.ice }); ui.burst(sp.x, sp.y, 20, { colors: ['#e6fbff', '#7fe3ff'], speed: 70, gravity: 40, kind: 'star' }); yield 0.15; break;
        case 'gas': au.play('gas'); ui.float('-1 swing', sp.x, sp.y - 12, { color: COLORS.bad }); ui.burst(sp.x, sp.y, 34, { colors: ['#8fe04a', '#5a9a3a', '#b0ff7a'], speed: 50, gravity: -30, life: 1.6, size: 2, drag: 1 }); this.hero.play('hurt'); this.speak('*cough* *cough*', 1.4); yield 0.35; break;
        case 'critter': au.play('monster_growl', { pitch: 1.8 }); ui.float('A rat! -3', sp.x, sp.y - 12, { color: COLORS.bad }); this.hurt(ev.dmg); this.hero.play('hurt'); for (const it of this.mr.haul) if (!this.shown.has(it.uid)) { this.shown.add(it.uid); this.flyers.push({ item: it, x0: sp.x, y0: sp.y, t: 0, dur: 0.7, spin: 4 }); } yield 0.3; break;
        case 'cavein': yield* this.caveIn(ev); break;
        case 'scan': au.play('sparkle'); yield 0.2; break;
        case 'radar': ui.float('Rare ore located!', sp.x, sp.y - 14, { color: '#9affb0' }); au.play('qte_success'); yield 0.2; break;
        case 'flare': this.speak('The flare shows every clue!', 1.6); yield 0.1; break;
        default: break;
      }
    }
    for (const it of this.mr.haul) if (!this.shown.has(it.uid)) { this.shown.add(it.uid); this.flyers.push({ item: it, x0: BOARD.x + BOARD.w / 2, y0: BOARD.y + BOARD.h / 2, t: 0, dur: 0.7, spin: 3 }); }
  }

  *caveIn(ev) {
    const au = this.game.audio, ui = this.game.ui;
    au.play('rumble');
    this.shake(2);
    this.speak('The ceiling!!', 1.2);
    for (let i = 0; i < 26; i++) this.parts.push({ x: rnd.float(60, 700), y: rnd.float(-60, -10), vx: rnd.float(-20, 20), vy: rnd.float(40, 140), rot: 0, vr: rnd.float(-6, 6), img: chunkCanvas(rnd.pick(this.pal.rock.slice(1, 4)), rnd.int(1, 9), rnd.int(6, 13)), t: 0, floor: FLOOR_Y + rnd.float(0, 40) });
    this.qte = { t: 0, win: 0.9, done: false, ok: false };
    au.play('qte_prompt');
    yield () => this.qte.done;
    const ok = this.qte.ok;
    this.qte = null;
    if (ok) { au.play('qte_success'); this.hero.play('dodge'); ui.float('Dodged!', HERO.x + 40, HERO.y - 150, { big: true, scale: 3, top: '#e8ffe0', bottom: '#5fd17a' }); }
    else {
      au.play('cave_in'); au.play('hurt');
      this.shake(3);
      this.game.renderer.doFlash(0.35, [1, 0.3, 0.2]);
      this.hero.play('hurt');
      ui.float(`-${ev.dmg}`, HERO.x + 30, HERO.y - 150, { big: true, scale: 3, top: '#ffd0c0', bottom: '#ff4d4d' });
      this.hurt(ev.dmg);
    }
    yield 0.3;
  }
  hurt(n) { if (this.game.run.hurt(n)) { this.dead = true; this.co.start(function* () { yield 0.8; gameOver(this.game, 'Buried in a cave-in'); }.bind(this)); } }

  packUp() {
    if (this.busy || this.phase === 'shatter' || this.phase === 'leaving') return;
    this.phase = 'shatter';
    const au = this.game.audio, run = this.game.run;
    this.co.start(function* () {
      if (this.pickName) {
        this.speak('Huh? The pick is… glowing?', 1.4);
        for (let i = 0; i < 6; i++) { crackWeapon(this.pickMesh, (i + 1) / 6); au.play('crack', { pitch: 1 + i * 0.08 }); yield 0.18; }
        au.play('shatter');
        this.game.renderer.doFlash(0.4, [0.8, 0.4, 1]);
        this.shake(2);
        this.pickMesh.updateWorldMatrix(true, true);
        this.shards = shatterPieces(this.pickMesh, this.world.scene, { power: 1.4 });
        this.hero.hold(null);
        this.hero.play('defeat');
        this.speak(bark(run.char, 'shatter'), 2);
        run.stats.shattered = (run.stats.shattered || 0) + 1;
        save.data.stats.weaponsShattered++; save.write();
        yield 1.5;
      }
      if (this.tray.length) { au.play('coins'); this.hero.play('cheer'); this.cartBump = 1; yield 0.6; }
      this.phase = 'leaving';
      this.collect();
    }.bind(this));
  }
  collect() {
    const game = this.game, run = game.run;
    const items = this.mr ? this.mr.haul : [];
    for (const it of items) run.bag.toOverflow(it);
    run.stats.mined += items.length;
    save.data.stats.oresMined += items.length; save.write();
    if (run.bag.overflow.length) openBag(game, { title: 'Your Haul', onClose: () => finish(game) });
    else finish(game);
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const inp = this.game.input;
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.cartBump = Math.max(0, this.cartBump - dt * 2);
    if (this.say) { this.say.t -= dt; if (this.say.t <= 0) this.say = null; }
    if (this.flareT > 0) this.flareT -= dt;
    for (const k in this.shakes) { this.shakes[k] -= dt; if (this.shakes[k] <= 0) delete this.shakes[k]; }
    if (this.reveal) { this.reveal.t += dt; if (this.reveal.t > 1.1) this.reveal = null; }
    for (let i = this.impacts.length - 1; i >= 0; i--) { this.impacts[i].t += dt; if (this.impacts[i].t > 0.25) this.impacts.splice(i, 1); }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt; p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > p.floor && p.vy > 0) {
        if (p.vy > 90) { p.y = p.floor; p.vy *= -0.32; p.vx *= 0.55; p.vr *= 0.5; }
        else { this.parts.splice(i, 1); this.rubble.push({ x: Math.round(p.x), y: Math.round(p.floor), img: p.img }); if (this.rubble.length > 140) this.rubble.shift(); continue; }
      }
      if (p.t > 4) this.parts.splice(i, 1);
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      if (f.t >= f.dur) { this.flyers.splice(i, 1); this.tray.push(f.item); this.cartBump = 0.6; this.game.audio.play('card_place', { vol: 0.5, pitch: 0.7 }); }
    }
    if (this.qte) {
      this.qte.t += dt;
      if (!this.qte.done && (inp.actionPressed('strike') || inp.pressed)) { this.qte.done = true; this.qte.ok = this.qte.t <= this.qte.win; inp.consume(); }
      if (!this.qte.done && this.qte.t > this.qte.win + 0.15) { this.qte.done = true; this.qte.ok = false; }
    }
    if (this.forge) this.forge.update(dt);
    // lamp flicker, 3D dust, the explorer
    const fl = Math.sin(this.time * 7.3) * 0.25 + Math.sin(this.time * 17.1) * 0.15;
    this.lamp.intensity = 4.2 + fl;
    this.flicker = fl;
    this.hero.update(dt);
    if (this.shards) updateShards(this.shards, dt, toWorld(0, FLOOR_Y + 6).y);
    this.dust.update(dt); this.sparks.update(dt);
    if (Math.random() < 0.5) this.dust.emit({ pos: [rnd.float(-4.6, 4.6), rnd.float(-2.4, 2.6), 0.5], vel: [0.03, 0.015, 0], spread: 0.02, life: [3, 6], size: 1, color: '#e8d0a8', alpha: 0.5, fadeIn: 1 });
  }

  // ------------------------------------------------------------------ draw
  clueText(t) {
    const lines = [];
    if (t.t === 'hard') lines.push(t.hits ? '{warn}Cracked hard rock: one more swing!{/}' : 'Hard rock: takes {warn}two swings{/}.');
    for (const dir of Object.keys(t.veins || {})) lines.push(`A vein runs {gold}${dir}{/} toward ore.`);
    if (t.crack) lines.push('{bad}Red hairline cracks{/}: a hazard is next door.');
    if (t.glint) lines.push(this.pick.reveal || this.flareT > 0 ? `{${['common', 'uncommon', 'rare', 'epic', 'legendary'][Math.min(4, t.glint)]}}Glinting{/}: something precious inside!` : '{white}It glints{/}: something rare inside!');
    if (t.t === 'ore' && (t.revealed || this.exposed(t.x, t.y))) lines.push(`{${MATERIALS[t.mat].rarity}}${MATERIALS[t.mat].name}{/}`);
    if ((t.revealed || this.flareT > 0) && t.t === 'hazard') lines.push('{bad}Hazard!{/}');
    return lines.join('\n');
  }
  tag(ui, x, y, text, color = '#3a2214') {
    const w = ui.measure(text) + 16;
    const c = tagCanvas(w);
    const bx = Math.round(clamp(x - c.width / 2, 4, ui.w - c.width - 4)), by = Math.round(y);
    ui.img(c, bx, by);
    ui.text(text, bx + 10, by + 11, { color });
  }

  draw(ui) {
    const ctx = ui.ctx, inp = this.game.input;
    const sx = this.shakeT > 0 ? Math.round((Math.random() - 0.5) * this.shakeT * 16) : 0;
    const sy = this.shakeT > 0 ? Math.round((Math.random() - 0.5) * this.shakeT * 10) : 0;
    const busyUI = this.forge || this.qte || this.reveal || this.phase === 'shatter' || this.phase === 'leaving';
    ctx.save();
    ctx.translate(sx, sy);

    // ---- rock face
    ui.img(faceRim(this.geom), BOARD.x - 8, BOARD.y - 8);
    const canDig = (this.phase === 'dig' || this.phase === 'prep') && !this.busy && !busyUI && !this.dead;
    const hb = ui.hit('rockface', BOARD.x, BOARD.y, BOARD.w, BOARD.h, { sound: false, cursor: false });
    const hover = hb.hover ? cellAt(this.geom, inp.x - BOARD.x, inp.y - BOARD.y) : null;
    for (let y = 0; y < MINE_H; y++) for (let x = 0; x < MINE_W; x++) {
      const t = this.wall.tiles[y][x];
      const c = this.geom.cells[y][x];
      if (t.broken) { ui.img(cavityCanvas(this.geom, x, y, this.pal), BOARD.x + c.bx, BOARD.y + c.by); continue; }
      const exp = this.exposed(x, y);
      const isHover = hover && hover.x === x && hover.y === y && canDig && (exp || (this.tool && TOOL_USE[this.tool.id] === 'scan'));
      const sk = this.shakes[x + ',' + y] ? Math.round(Math.sin(this.time * 90) * 2) : 0;
      ui.img(stoneCanvas(this.geom, t, this.pal, { exposed: exp, dim: !exp, flare: this.flareT > 0, hover: isHover }), BOARD.x + c.bx + sk, BOARD.y + c.by - (isHover ? 1 : 0));
    }
    if (hover && canDig) {
      const t = this.wall.tiles[hover.y][hover.x];
      const exp = this.exposed(hover.x, hover.y);
      ui.cursor = exp || this.tool ? 'hand' : 'arrow';
      if (!t.broken) {
        const clue = this.clueText(t);
        if (clue) ui.tooltip({ body: clue, w: 190 });
      }
      if (hb.clicked) {
        if (this.tool) { if (this.phase === 'prep') this.startDig(); this.useTool(this.tool, hover.x, hover.y); }
        else if (exp) this.strikeTile(hover.x, hover.y);
        else if (!t.broken) { this.game.audio.play('deny'); this.speak('Can\'t reach that one yet. Dig down to it.', 1.6); }
      }
    }
    // impact stars
    for (const im of this.impacts) {
      const k = im.t / 0.25, r = Math.round(4 + k * 14);
      ctx.globalAlpha = 1 - k;
      ui.rect(im.x - r, im.y, r * 2 + 1, 1, '#fff6d0');
      ui.rect(im.x, im.y - r, 1, r * 2 + 1, '#fff6d0');
      ui.rect(im.x - 1, im.y - 1, 3, 3, '#ffffff');
      ctx.globalAlpha = 1;
    }

    // ---- props
    this.drawAnvil(ui);
    this.drawCrate(ui);
    this.drawCart(ui);
    this.drawSlate(ui);
    // rubble at the foot of the wall, then debris in flight
    for (const r of this.rubble) ui.img(r.img, r.x - (r.img.width >> 1), r.y - r.img.height + 2);
    for (const p of this.parts) {
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y));
      ctx.rotate(Math.round(p.rot * 4) / 4);
      ctx.drawImage(p.img, -p.img.width / 2, -p.img.height / 2);
      ctx.restore();
    }
    // lanterns and their warm pools
    LANTERNS.forEach((l, i) => {
      const f = Math.floor(this.time * 9 + i * 2) % 4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + (this.flicker || 0) * 0.3;
      ctx.drawImage(glowCanvas(70), l.x - 69, l.y - 60);
      ctx.restore();
      ui.img(lanternCanvas(f), l.x - 9, l.y - 14);
    });
    ctx.restore();

    // ore flying into the cart
    for (const f of this.flyers) {
      const k = ease.inOutCubic(Math.min(1, f.t / f.dur));
      const tx = PROPS.cart.x + 66, ty = PROPS.cart.y + 14;
      const x = f.x0 + (tx - f.x0) * k, y = f.y0 + (ty - f.y0) * k - Math.sin(k * Math.PI) * 90;
      ui.img(materialSprite(f.item.id, 32), x - 16, y - 16, { rot: Math.round(f.t * f.spin * 4) / 4 });
    }
    // speech from the explorer
    if (this.say) { const h = this.headScreen(); speech(ui, h.x, h.y, this.say.text, { maxW: 180, alpha: clamp(this.say.t * 3, 0, 1) }); }
    this.drawVitals(ui);
    if (this.phase === 'prep' && !this.forge && !this.noteOpen) {
      const bob = Math.round(Math.sin(this.time * 3) * 2);
      this.tag(ui, BOARD.x + BOARD.w / 2, 2 + bob, 'Swing at the top stones');
    }
    this.drawNote(ui);
    if (this.tool && !busyUI) {
      this.tag(ui, inp.x + 4, inp.y + 14, `${MATERIALS[this.tool.id].name}: click a stone`, '#14503a');
      if (inp.rpressed) this.tool = null;
    }
    if (this.reveal) this.drawReveal(ui);
    if (this.qte) this.drawQte(ui);
    if (this.forge) this.forge.draw(ui);
  }

  drawVitals(ui) {
    // just a heart and a purse: no panels
    const run = this.game.run;
    ui.icon('heart', 10, 10);
    ui.text(`${run.hp}/${run.maxHp}`, 26, 11, { color: run.hp < run.maxHp * 0.3 ? '#ff7a6a' : '#ffd8c8', outline: '#140c10' });
    ui.icon('coin', 82, 10);
    ui.text(String(run.coins), 98, 11, { color: COLORS.gold, outline: '#140c10' });
  }

  drawAnvil(ui) {
    const { x, y } = PROPS.anvil;
    const can = this.phase === 'prep' && !this.pickName && !this.forge;
    const canForge = can && this.game.run.bag.items.some((it) => matOf(it).pick && Object.keys(matOf(it).pick).length && matOf(it).kind !== 'tool');
    const h = ui.hit('anvil', x, y, 72, 58, { sound: false, cursor: canForge ? 'hand' : 'arrow' });
    ui.img(anvilCanvas(h.hover && canForge), x, y - (h.hover && canForge ? 1 : 0));
    if (canForge && Math.sin(this.time * 4) > 0.6) ui.burst(x + 34 + rnd.float(-12, 12), y + 10, 1, { colors: ['#ffd27a', '#fff0b0'], speed: 30, gravity: 60, kind: 'spark', life: 0.4 });
    if (h.hover && !this.forge) {
      this.tag(ui, x + 36, y - 26, this.pickName ? this.pickName : canForge ? 'Forge a pickaxe' : can ? 'No pick materials' : 'Busy digging');
      if (this.pickName) { const effs = Object.entries(this.pick).filter(([k, v]) => v && PICK_TEXT[k]).map(([k, v]) => PICK_TEXT[k](v)); if (effs.length) ui.tooltip({ title: this.pickName, body: effs.join('\n'), w: 170 }); }
      else if (canForge) ui.tooltip({ body: 'Spend materials on a pickaxe: more swings and wild effects. The curse shatters it when you leave.', w: 180 });
    }
    if (h.clicked && canForge) this.openPickForge();
  }

  drawCrate(ui) {
    const { x, y } = PROPS.crate;
    const tools = this.game.run.bag.all().filter((it) => TOOL_IDS.includes(it.id)).slice(0, 4);
    ui.img(crateCanvas('back'), x, y);
    tools.forEach((it, i) => {
      if (this.tool === it) return;
      const tx = x + 8 + i * 20, ty = y - 6 + (i % 2) * 3;
      const h = ui.hit('tool' + it.uid, tx, ty, 24, 28, { sound: false });
      const lift = h.hover ? 5 : 0;
      ui.img(materialSprite(it.id, 32), tx - 4, ty - lift, { rot: (i - 1.5) * 0.12 });
      if (h.hover) this.tag(ui, tx + 12, ty - 30, MATERIALS[it.id].name);
      if (h.clicked) {
        if ((this.phase === 'dig' || this.phase === 'prep') && !this.busy) { this.tool = it; this.game.audio.play('card_pick'); this.hero.play('point'); }
        else this.game.audio.play('deny');
      }
    });
    ui.img(crateCanvas('front'), x, y);
    if (!tools.length && ui.hit('crate', x, y + 18, 96, 44, { sound: false, cursor: false }).hover) this.tag(ui, x + 48, y - 8, 'No tools packed');
    if (this.tool) {
      const bob = Math.sin(this.time * 4) * 3;
      ui.img(glowCanvas(18, '#9affc8'), x + 30, y - 46 + bob, { alpha: 0.6 });
      ui.img(materialSprite(this.tool.id, 32), x + 32, y - 42 + bob);
    }
  }

  drawCart(ui) {
    const { x, y } = PROPS.cart;
    const bump = Math.round(Math.sin(this.cartBump * 30) * this.cartBump * 3);
    const canLeave = (this.phase === 'dig' || this.phase === 'done') && !this.busy;
    const h = ui.hit('cart', x, y, 132, 86, { sound: false, cursor: canLeave ? 'hand' : 'arrow' });
    ui.img(cartCanvas('back'), x, y + bump);
    this.tray.forEach((it, i) => {
      const row = Math.floor(i / 4), col = i % 4;
      const px = x + 16 + col * 24 + (row % 2) * 12 - row, py = y + bump + 2 - row * 8 + ((i * 7) % 5);
      ui.img(materialSprite(it.id, 32), px, py, { rot: ((i * 37) % 7 - 3) * 0.08 });
    });
    ui.img(cartCanvas('front'), x, y + bump);
    if (this.phase === 'done' && Math.sin(this.time * 5) > 0) ui.img(glowCanvas(30, '#ffd27a'), x + 36, y + 2, { alpha: 0.35 });
    if (h.hover) {
      const worth = this.tray.reduce((a, it) => a + Math.round(matOf(it).value * [0.6, 0.8, 1, 1.25, 1.5][it.q]), 0);
      this.tag(ui, x + 66, y - 30, canLeave ? (this.phase === 'done' ? 'Push off with the haul' : 'Pack up early?') : this.tray.length ? 'The haul' : 'Empty cart');
      if (this.tray.length) ui.tooltip({ title: `Haul · ${worth} coins`, body: this.tray.map((it) => `{${matOf(it).rarity}}${matOf(it).name}{/}`).join('\n'), w: 160 });
      if (h.clicked && canLeave) this.packUp();
    }
  }

  drawSlate(ui) {
    const { x, y } = PROPS.slate;
    const total = this.mr ? this.mr.strikes + this.mr.used : 3 + (this.pick.strikes || 0);
    const left = this.mr ? this.mr.strikes : total;
    const sway = Math.round(Math.sin(this.time * 1.3) * 1);
    ui.img(slateCanvas(total, left), x + sway, y);
    if (ui.hit('slate', x, y + 10, 104, 62, { sound: false, cursor: false }).hover) this.tag(ui, x + 52, y + 74, `${left} swing${left === 1 ? '' : 's'} left`);
  }

  drawNote(ui) {
    const { x, y } = PROPS.note;
    const h = ui.hit('note', x, y, 48, 40, { sound: false });
    ui.img(noteCanvas(48, 40, 7), x, y, { rot: -0.08 });
    for (let i = 0; i < 4; i++) ui.rect(x + 9, y + 14 + i * 6, 22 + ((i * 7) % 9), 1, '#7a5634', 0.8);
    if (h.clicked) { if (this.noteOpen) this.closeNote(); else this.noteOpen = true; this.game.audio.play('page'); }
    if (!(h.hover || this.noteOpen) || this.forge) return;
    const W = 250, H = 168, nx = ui.w - W - 6, ny = y + 34;
    ui.img(noteCanvas(W, H, 11), nx, ny);
    ui.text('Notes on the rock', nx + W / 2, ny + 14, { align: 'center', color: '#6a2a10' });
    ui.text('Swing at the {#7a3a10}top row{/} first, then\nany stone that borders a hole.\n\n{#2a6a5a}Coloured veins{/} lead toward hidden ore.\nA {#8a6a10}glint{/} means something rare.\n{#a02020}Red hairline cracks{/}: hazard next door.\n{#5a5a6a}Hard rock{/} needs two swings.\nThe {#7a3a10}deeper{/} the stone, the better the ore.', nx + 14, ny + 30, { color: '#4a2c16', maxW: W - 28 });
    if (this.noteOpen && !h.hover) ui.text('(click the note to put it away)', nx + W / 2, ny + H - 14, { align: 'center', font: 'small', color: '#7a5634' });
  }

  drawReveal(ui) {
    const r = this.reveal, k = Math.min(1, r.t / 0.25), out = Math.max(0, (r.t - 0.8) / 0.3);
    dim(ui, 0.4 * (1 - out));
    const m = matOf(r.item), col = RARITY[m.rarity].color;
    const cx = BOARD.x + BOARD.w / 2, cy = BOARD.y + BOARD.h / 2 - 10;
    const s = Math.max(1, Math.round(ease.outBack(k) * 3));
    ui.ctx.save();
    ui.ctx.globalCompositeOperation = 'lighter';
    ui.ctx.globalAlpha = 0.9 * (1 - out);
    ui.ctx.drawImage(glowCanvas(56, col), cx - 56, cy - 56);
    ui.ctx.restore();
    ui.img(materialSprite(r.item.id, 32), cx - 16 * s, cy - 16 * s, { scale: s, alpha: 1 - out });
    ui.big(RARITY_WORD[r.r], cx, cy - 70, { scale: 3, top: '#ffffff', bottom: col, alpha: 1 - out });
    ui.text(m.name, cx, cy + 56, { align: 'center', color: col, outline: '#140c10' });
  }

  drawQte(ui) {
    const q = this.qte;
    dim(ui, 0.2);
    const cx = HERO.x + 40, cy = HERO.y - 110;
    const k = clamp(q.t / q.win, 0, 1);
    ui.big('DODGE!', cx, cy - 40, { scale: 3, top: '#fff0d0', bottom: '#ff8a3a' });
    ring(ui.ctx, cx, cy + 12, 40 * (1 - k) + 8, k > 0.85 ? '#ff5d5d' : '#ffe08a', 2, 1);
    ring(ui.ctx, cx, cy + 12, 8, '#ffffff', 1, 0.8);
    prompt(ui, cx - 40, cy + 50, 'SPACE', 'or click!', this.time, { mouse: 'mouseL' });
  }
}
