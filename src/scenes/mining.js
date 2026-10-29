// Mining spot: a hand-painted mine workshop. Your explorer (3D) stands at a rock face of chiselled
// stones whose strata colour with depth; strike the stones from the top down, read the clues in the
// rock, and watch the ore burst out and tumble into the minecart. Swings are chalked on a slate,
// tools wait in a crate, the anvil forges a pick. No panels: everything you touch is part of the room.
// The room is alive with 2D light and particles: lamp cones, a daylight shaft, motes, drips, steam,
// glitter on veins, sparks, dust and flares.
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
  SCREEN_W, SCREEN_H, FLOOR_Y, BOARD, LANTERNS, PROPS, DRIPS, rockFace, cellAt, stoneCanvas, cavityCanvas, faceRim, chunkCanvas,
  chamberCanvas, lanternCanvas, cartCanvas, crateCanvas, anvilCanvas, slateCanvas, noteCanvas, tagCanvas, oreArt,
} from './mining_art.js';
import { STRATA, glow, shaftCanvas } from '../art/mine_kit.js';
import { MineFX } from '../art/mine_fx.js';
import { openForge } from './forgeui.js';
import { hud, speech, prompt, ring, dim, bark } from './common.js';
import { finish, openBag, gameOver } from './flow.js';
import { COLORS } from '../ui/font.js';
import { save } from '../core/save.js';
import { clamp, ease, hash2 } from '../core/math.js';
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
    this.strata = STRATA[this.region] || STRATA[0];
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
    this.cracks = [];
    this.flashes = {};
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
    this.fx = new MineFX(FLOOR_Y + 2);
    this.dripT = DRIPS.map(() => rnd.float(0.5, 4));
    this.buildWorld();
    const au = game.audio;
    au.music(REGIONS[this.region].music);
    this.amb = au.loop(this.region === 4 ? 'lava' : 'cave');
    this.co.start(function* () { yield 0.7; this.act('wave'); this.phase = 'prep'; }.bind(this));
  }
  exit() { this.amb && this.amb.stop(1); }

  buildWorld() {
    const run = this.game.run;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1426');
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W * PX, SCREEN_H * PX), new THREE.MeshBasicMaterial({ map: pixelTexture(chamberCanvas(this.region)) }));
    scene.add(bg);
    const cam = new THREE.OrthographicCamera(-4.8, 4.8, 2.7, -2.7, 0.1, 50);
    cam.userData.viewHeight = SCREEN_H * PX;
    cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
    // the painted backdrop stays exactly as painted; the 3D explorer gets inked outlines and warm lamp light
    this.world = { scene, camera: cam, post: { tone: 0, saturation: 1, contrast: 1, lift: [0, 0, 0], gain: [1, 1, 1], vignette: 0.2, dither: 0, bloom: 0.5, threshold: 0.82, outline: 0.75, edge: 0.35 } };
    scene.add(new THREE.HemisphereLight(0xb8a8e0, 0x5a3a4a, 0.85));
    const lamp = new THREE.PointLight(0xffc27a, 4.2, 9, 1.2);
    const lw = toWorld(LANTERNS[0].x, LANTERNS[0].y + 10);
    lamp.position.set(lw.x, lw.y, 1.8);
    scene.add(lamp);
    this.lamp = lamp;
    const sun = new THREE.DirectionalLight(0xfff0d0, 0.9); // daylight from the crack above
    sun.position.set(-2, 4, 2);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8a9ad8, 0.5);
    fill.position.set(3, -0.5, 3);
    scene.add(fill);
    this.dust = new ParticleSystem(200);
    scene.add(this.dust.object);
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
    this.hero.hold && this.hero.hold(mesh);
  }
  headScreen() { return { x: HERO.x + 6, y: HERO.y - this.heroH / PX - 6 }; }
  /** Body language instead of words: play an animation if the explorer has it. */
  act(name, fallback) { this.hero.play(name); if (this.hero.anim !== name && fallback) this.hero.play(fallback); }

  exposed(x, y) { return this.mr ? this.mr.exposed(x, y) : y === 0 && !this.wall.tiles[0][x].broken; }
  speak(text, dur = 2) { if (text) this.say = { text, t: dur }; }
  shake(p = 1) { this.shakeT = Math.max(this.shakeT, 0.25 * p); }
  stoneCenter(x, y) { const c = this.geom.cells[y][x]; return { x: BOARD.x + c.cx, y: BOARD.y + c.cy }; }
  stoneCols(x, y) { const i = Math.min(this.strata.length - 1, Math.floor((y / MINE_H) * this.strata.length)); return [this.strata[i], this.strata[Math.max(0, i - 1)], this.strata[Math.min(this.strata.length - 1, i + 1)]]; }

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
          for (let i = 0; i < 30; i++) this.fx.glitter(BOARD.x + rnd.float(10, BOARD.w - 10), BOARD.y + rnd.float(10, BOARD.h - 10), '#ffe6a0', 2);
        }
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
      yield Math.max(0.12, hero.impactTime ? hero.impactTime('mine') : 0.4);
      const res = this.mr.strike(x, y);
      this.impact(x, y);
      this.combo = 0;
      yield 0.06; // let the crack run across the stone before it gives
      yield* this.playEvents(res.events);
      this.afterAction();
    }.bind(this));
  }
  useTool(item, x, y) {
    if (this.busy || !this.mr) return;
    const use = TOOL_USE[item.id];
    if (use !== 'scan' && use !== 'radar' && use !== 'flare' && !this.mr.exposed(x, y)) { this.act('shrug'); this.game.audio.play('deny'); return; }
    this.busy = true;
    this.game.run.removeItem(item);
    this.tool = null;
    const au = this.game.audio;
    this.hero.play(use === 'blast' ? 'point' : 'cast');
    const c = this.stoneCenter(x, y);
    this.co.start(function* () {
      if (use === 'blast') {
        au.play('fire_whoosh');
        for (let i = 0; i < 8; i++) { this.fx.sparks(c.x, c.y, 2, ['#ffd27a', '#ff8a3a'], 60); yield 0.05; }
        this.game.renderer.doFlash(0.5, [1, 0.8, 0.5]); this.shake(2.5); this.game.hitStop(0.08); au.play('cave_in', { vol: 0.6 });
        this.fx.flare(c.x, c.y, '#ffb35a', 34, 0.7); this.fx.ring(c.x, c.y, '#ffe0a0', 60); this.fx.sparks(c.x, c.y, 50, ['#ffd27a', '#ff8a3a', '#fff0b0'], 260); this.fx.dust(c.x, c.y, 18, '#c8a0a0', 30);
      } else if (use === 'drill') { au.play('hard_clang', { pitch: 1.4 }); for (let i = 0; i < 6; i++) { const yy = Math.min(MINE_H - 1, y + (i >> 1)); const cc = this.stoneCenter(x, yy); this.fx.sparks(cc.x, cc.y, 8, ['#ffe08a', '#ffffff'], 160); this.fx.dust(cc.x, cc.y, 2); this.shake(0.6); yield 0.07; } }
      else if (use === 'scan') { au.play('zap', { pitch: 1.6 }); for (let i = 0; i < 24; i++) this.fx.glitter(c.x + rnd.float(-60, 60), c.y + rnd.float(-60, 60), '#9affd0', 2); }
      else if (use === 'radar') { au.play('blip'); this.fx.ring(c.x, c.y, '#9affb0', 120); yield 0.15; au.play('blip', { pitch: 1.3 }); this.fx.ring(c.x, c.y, '#9affb0', 160); }
      else if (use === 'flare') { au.play('fire_whoosh', { pitch: 1.3 }); this.flareT = 8; this.fx.flare(BOARD.x + BOARD.w / 2, BOARD.y + 20, '#ff8ab0', 40, 1.4); }
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
      this.act('shrug');
    } else if (rnd.chance(0.18)) this.act('wipe'); // catches their breath (if they know how)
  }
  hasTools() { return this.game.run.bag.all().some((it) => TOOL_IDS.includes(it.id)); }

  // ------------------------------------------------------------------ juice
  /** A crack that races across the stone from where the pick bit. */
  growCrack(x, y, ix, iy) {
    const c = this.geom.cells[y][x];
    const inside = (px, py) => { const lx = Math.round(px - BOARD.x - c.bx), ly = Math.round(py - BOARD.y - c.by); return lx >= 0 && ly >= 0 && lx < c.bw && ly < c.bh && c.dist[ly * c.bw + lx] > 1.2; };
    const lines = [];
    const n = 3 + Math.floor(rnd.next() * 2);
    for (let b = 0; b < n; b++) {
      let a = (b / n) * Math.PI * 2 + rnd.float(-0.5, 0.5), px = ix, py = iy;
      const pts = [[px, py]];
      for (let s = 0; s < 14; s++) {
        a += rnd.float(-0.6, 0.6);
        const nx = px + Math.cos(a) * 3, ny = py + Math.sin(a) * 3;
        if (!inside(nx, ny)) break;
        px = nx; py = ny; pts.push([px, py]);
        if (s === 5 && rnd.chance(0.5)) lines.push({ pts: [[px, py], [px + Math.cos(a + 1.2) * 6, py + Math.sin(a + 1.2) * 6]], delay: 0.06 });
      }
      lines.push({ pts, delay: 0 });
    }
    this.cracks.push({ x, y, lines, t: 0, life: 0.7 });
  }
  impact(x, y) {
    const c = this.stoneCenter(x, y);
    const ix = c.x + rnd.float(-8, 8), iy = c.y + rnd.float(-8, 8);
    this.shake(1);
    this.game.hitStop(0.05);
    this.game.audio.play('pick_strike', { pitch: 0.9 + rnd.next() * 0.2 });
    this.flashes[x + ',' + y] = 0.18;
    this.growCrack(x, y, ix, iy);
    this.fx.ring(ix, iy, '#fff2d6', 18);
    this.fx.sparks(ix, iy, 18);
    this.fx.dust(ix, iy, 4, this.stoneCols(x, y)[0], 6);
  }
  burstAt(x, y, colors, n, kind) {
    const c = this.stoneCenter(x, y);
    if (kind === 'spark') this.fx.sparks(c.x, c.y, n, colors, 160);
    else for (let i = 0; i < n; i++) this.fx.glitter(c.x + rnd.float(-14, 14), c.y + rnd.float(-14, 14), rnd.pick(colors), 2);
  }
  breakFx(x, y) {
    const t = this.wall.tiles[y][x];
    const c = this.stoneCenter(x, y);
    const cols = this.stoneCols(x, y);
    if (t.t === 'hard') cols.push('#8a96c0', '#6a76a0');
    if (t.t === 'ore' && MATERIALS[t.mat]) cols.push(MATERIALS[t.mat].color, MATERIALS[t.mat].color);
    for (let i = 0; i < 16; i++) {
      const a = rnd.float(-Math.PI, 0), sp = rnd.float(60, 220);
      this.parts.push({ x: c.x + rnd.float(-16, 16), y: c.y + rnd.float(-14, 14), vx: Math.cos(a) * sp - 30, vy: Math.sin(a) * sp * 0.7, rot: 0, vr: rnd.float(-12, 12), img: chunkCanvas(rnd.pick(cols), rnd.int(1, 9), rnd.int(4, 11)), t: 0, floor: FLOOR_Y + rnd.float(2, 40) });
    }
    this.fx.dust(c.x, c.y, 10, cols[0], 16);
    this.fx.dust(c.x, c.y + 10, 6, '#b8a4b8', 20);
    this.fx.sparks(c.x, c.y, 10, ['#fff6c8', '#ffd27a'], 140);
    this.flashes[x + ',' + y] = 0;
    this.game.audio.play('rock_break', { pitch: 0.9 + rnd.next() * 0.25 });
  }

  *playEvents(events) {
    const ui = this.game.ui, au = this.game.audio;
    for (const ev of events) {
      const sp = ev.x !== undefined ? this.stoneCenter(ev.x, ev.y) : { x: BOARD.x + BOARD.w / 2, y: BOARD.y + BOARD.h / 2 };
      switch (ev.type) {
        case 'crack': this.shakes[ev.x + ',' + ev.y] = 0.3; au.play('hard_clang'); this.fx.sparks(sp.x, sp.y, 14, ['#ffffff', '#c8d8ff'], 200); ui.float('Crack!', sp.x, sp.y - 8, { color: '#f4eaff', vy: -18, life: 0.8 }); yield 0.1; break;
        case 'break': this.breakFx(ev.x, ev.y); yield ev.how.chain || ev.how.magnet ? 0.09 : 0.05; if (ev.how.chain) this.burstAt(ev.x, ev.y, ['#ffe74a', '#ffffff', '#9a7aff'], 14, 'spark'); if (ev.how.magnet) this.burstAt(ev.x, ev.y, ['#ff5a5a', '#9ab0ff'], 10, 'spark'); break;
        case 'ore': case 'pocket': case 'dupe': {
          const it = ev.item;
          this.shown.add(it.uid);
          const m = matOf(it), r = RARITY[m.rarity].order;
          this.combo = (this.combo || 0) + 1;
          au.play(ORE_SFX[r], { pitch: 1 + Math.min(10, this.combo - 1) * 0.07 });
          if (ev.type === 'dupe') ui.float('×2!', sp.x, sp.y - 16, { big: true, scale: 2, top: '#e6fbff', bottom: '#7fe3ff' });
          if (ev.type === 'pocket') { au.play('chest_open'); ui.float('Treasure pocket!', sp.x, sp.y - 18, { color: COLORS.gold }); }
          for (let i = 0; i < 8 + r * 8; i++) this.fx.glitter(sp.x + rnd.float(-20, 20), sp.y + rnd.float(-20, 20), rnd.pick([m.color, m.color2 || '#ffffff', '#ffffff']), 1 + (i % 3 === 0 ? 1 : 0));
          this.fx.sparks(sp.x, sp.y, 6 + r * 6, [m.color, '#ffffff', m.color2 || '#fff6c8'], 150 + r * 30);
          if (r >= 1) this.fx.flare(sp.x, sp.y, RARITY[m.rarity].color, 14 + r * 6, 0.6 + r * 0.15);
          if (r >= 2) yield* this.rareFind(it, r, sp);
          this.flyers.push({ item: it, x0: sp.x, y0: sp.y, t: 0, dur: 0.7, spin: rnd.float(-8, 8) });
          yield 0.14;
          break;
        }
        case 'lucky': ui.float('LUCKY!', sp.x, sp.y - 22, { big: true, scale: 2, top: '#fff6c8', bottom: '#ff8ab0' }); au.play('sparkle'); this.burstAt(ev.x, ev.y, ['#ff8ab0', '#fff6c8'], 16); yield 0.1; break;
        case 'melt': au.play('sizzle'); ui.float(`${MATERIALS[ev.mat].name} melted!`, sp.x, sp.y - 10, { color: COLORS.bad }); for (let i = 0; i < 8; i++) this.fx.steam(sp.x + rnd.float(-10, 10), sp.y); this.act('shrug'); yield 0.2; break;
        case 'frozen': au.play('ice_crack'); ui.float('Hazard frozen!', sp.x, sp.y - 10, { color: COLORS.ice }); this.burstAt(ev.x, ev.y, ['#e6fbff', '#7fe3ff'], 20); yield 0.15; break;
        case 'gas': au.play('gas'); ui.float('-1 swing', sp.x, sp.y - 12, { color: COLORS.bad }); this.fx.dust(sp.x, sp.y, 22, '#9ad860', 24); this.hero.play('hurt'); this.speak('*cough* *cough*', 1.4); yield 0.35; break;
        case 'critter': au.play('monster_growl', { pitch: 1.8 }); ui.float('A rat! -3', sp.x, sp.y - 12, { color: COLORS.bad }); this.fx.dust(sp.x, sp.y, 6); this.hurt(ev.dmg); this.hero.play('hurt'); for (const it of this.mr.haul) if (!this.shown.has(it.uid)) { this.shown.add(it.uid); this.flyers.push({ item: it, x0: sp.x, y0: sp.y, t: 0, dur: 0.7, spin: 4 }); } yield 0.3; break;
        case 'cavein': yield* this.caveIn(ev); break;
        case 'scan': au.play('sparkle'); yield 0.2; break;
        case 'radar': ui.float('Rare ore located!', sp.x, sp.y - 14, { color: '#9affb0' }); au.play('qte_success'); this.fx.flare(sp.x, sp.y, '#9affb0', 20, 0.8); yield 0.2; break;
        case 'flare': yield 0.1; break;
        default: break;
      }
    }
    for (const it of this.mr.haul) if (!this.shown.has(it.uid)) { this.shown.add(it.uid); this.flyers.push({ item: it, x0: BOARD.x + BOARD.w / 2, y0: BOARD.y + BOARD.h / 2, t: 0, dur: 0.7, spin: 3 }); }
  }

  /** Rare+ finds: the card-and-model reveal overlay when it exists, else a flare-lit reveal here. */
  *rareFind(it, r, sp) {
    this.game.hitStop(0.12);
    this.hero.play('cheer');
    this.fx.flare(sp.x, sp.y, RARITY[matOf(it).rarity].color, 40, 1.2);
    if (r >= 3) this.game.renderer.doFlash(0.25, [1, 0.95, 0.8]);
    if (this.game.scenes.reveal) {
      let done = false;
      this.game.pushOverlay('reveal', { item: it, onDone: () => { done = true; } });
      yield () => done;
      return;
    }
    this.reveal = { item: it, t: 0, r };
    yield 1.25;
  }

  *caveIn(ev) {
    const au = this.game.audio, ui = this.game.ui;
    au.play('rumble');
    this.shake(2);
    this.speak('The ceiling!!', 1.2);
    for (let i = 0; i < 28; i++) this.parts.push({ x: rnd.float(60, 700), y: rnd.float(-60, -10), vx: rnd.float(-20, 20), vy: rnd.float(40, 140), rot: 0, vr: rnd.float(-6, 6), img: chunkCanvas(rnd.pick(this.strata.slice(0, 4)), rnd.int(1, 9), rnd.int(6, 13)), t: 0, floor: FLOOR_Y + rnd.float(0, 40) });
    for (let i = 0; i < 10; i++) this.fx.dust(rnd.float(80, 680), rnd.float(0, 40), 2, '#c8b0b8', 20);
    this.qte = { t: 0, win: 0.9, done: false, ok: false };
    au.play('qte_prompt');
    yield () => this.qte.done;
    const ok = this.qte.ok;
    this.qte = null;
    if (ok) { au.play('qte_success'); this.hero.play('dodge'); ui.float('Dodged!', HERO.x + 40, HERO.y - 150, { big: true, scale: 3, top: '#e8ffe0', bottom: '#5fd17a' }); this.fx.dust(HERO.x, FLOOR_Y, 8, '#c8b0b8', 30); }
    else {
      au.play('cave_in'); au.play('hurt');
      this.shake(3);
      this.game.renderer.doFlash(0.35, [1, 0.3, 0.2]);
      this.hero.play('hurt');
      this.fx.dust(HERO.x, FLOOR_Y - 60, 16, '#c8b0b8', 40);
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
        const hs = this.headScreen();
        for (let i = 0; i < 6; i++) { crackWeapon(this.pickMesh, (i + 1) / 6); au.play('crack', { pitch: 1 + i * 0.08 }); this.fx.glitter(hs.x + rnd.float(-20, 30), hs.y + rnd.float(10, 60), '#c86bff', 2); yield 0.18; }
        au.play('shatter');
        this.game.renderer.doFlash(0.4, [0.8, 0.4, 1]);
        this.shake(2);
        this.fx.flare(hs.x + 10, hs.y + 40, '#c86bff', 30, 0.8);
        this.pickMesh.updateWorldMatrix(true, true);
        this.shards = shatterPieces(this.pickMesh, this.world.scene, { power: 1.4 });
        this.hero.hold && this.hero.hold(null);
        this.hero.play('defeat');
        this.speak(bark(run.char, 'shatter'), 2);
        run.stats.shattered = (run.stats.shattered || 0) + 1;
        save.data.stats.weaponsShattered++; save.write();
        yield 1.5;
      }
      if (this.tray.length) { au.play('coins'); this.hero.play('cheer'); this.cartBump = 1; const c = PROPS.cart; for (let i = 0; i < 14; i++) this.fx.glitter(c.x + rnd.float(10, 120), c.y + rnd.float(0, 30), '#ffe6a0', 2); yield 0.6; }
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
  ambience(dt) {
    const fx = this.fx;
    // motes in the daylight shaft and around the lamps
    if (rnd.chance(dt * 9)) { const t = rnd.next(); fx.mote(60 + t * 150 + rnd.float(-30, 30), 20 + t * 440); }
    if (rnd.chance(dt * 4)) { const l = rnd.pick(LANTERNS); fx.mote(l.x + rnd.float(-50, 50), l.y + rnd.float(-10, 120)); }
    // drips from the stalactites
    this.dripT = this.dripT.map((t, i) => { t -= dt; if (t <= 0) { fx.drip(DRIPS[i][0], DRIPS[i][1]); return rnd.float(2.5, 6); } return t; });
    // steam from the pipe vent, fireflies over the ferns
    if (rnd.chance(dt * 3)) fx.steam(944 + rnd.float(-3, 3), 420);
    if (rnd.chance(dt * 1.5)) fx.spore(rnd.pick([20, 250, 700, 940]) + rnd.float(-12, 12), FLOOR_Y - rnd.float(4, 30), this.region === 2 ? '#9affd0' : '#fff0a0');
    // the rock face glitters: glints, veins and exposed ore
    for (let y = 0; y < MINE_H; y++) for (let x = 0; x < MINE_W; x++) {
      const t = this.wall.tiles[y][x];
      if (t.broken) continue;
      const c = this.stoneCenter(x, y);
      if (t.glint && rnd.chance(dt * (0.4 + t.glint * 0.5))) fx.glitter(c.x + rnd.float(-14, 14), c.y + rnd.float(-14, 14), t.glint >= 3 ? '#ffd27a' : '#ffffff', t.glint >= 3 ? 2 : 1);
      if (t.veins && rnd.chance(dt * 0.9)) for (const [dir, col] of Object.entries(t.veins)) {
        const k = rnd.next(), ex = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, ey = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
        fx.glitter(c.x + ex * k * 24 + rnd.float(-3, 3), c.y + ey * k * 24 + rnd.float(-3, 3), col, 1);
      }
      if (t.t === 'ore' && (this.exposed(x, y) || t.revealed) && rnd.chance(dt * 1.2)) fx.shine(c.x + rnd.float(-8, 4), c.y + rnd.float(-10, 2), MATERIALS[t.mat] ? MATERIALS[t.mat].color2 || '#ffffff' : '#ffffff');
    }
  }

  update(dt) {
    const inp = this.game.input;
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.cartBump = Math.max(0, this.cartBump - dt * 2);
    if (this.say) { this.say.t -= dt; if (this.say.t <= 0) this.say = null; }
    if (this.flareT > 0) this.flareT -= dt;
    for (const k in this.shakes) { this.shakes[k] -= dt; if (this.shakes[k] <= 0) delete this.shakes[k]; }
    for (const k in this.flashes) { this.flashes[k] -= dt; if (this.flashes[k] <= 0) delete this.flashes[k]; }
    for (let i = this.cracks.length - 1; i >= 0; i--) { this.cracks[i].t += dt; if (this.cracks[i].t > this.cracks[i].life || this.wall.tiles[this.cracks[i].y][this.cracks[i].x].broken) this.cracks.splice(i, 1); }
    if (this.reveal) { this.reveal.t += dt; if (this.reveal.t > 1.35) this.reveal = null; }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt; p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > p.floor && p.vy > 0) {
        if (p.vy > 90) { p.y = p.floor; p.vy *= -0.32; p.vx *= 0.55; p.vr *= 0.5; if (rnd.chance(0.3)) this.fx.dust(p.x, p.floor, 1, '#b8a4b8', 2); }
        else { this.parts.splice(i, 1); this.rubble.push({ x: Math.round(p.x), y: Math.round(p.floor), img: p.img }); if (this.rubble.length > 140) this.rubble.shift(); continue; }
      }
      if (p.t > 4) this.parts.splice(i, 1);
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      if (rnd.chance(0.5)) { const k = ease.inOutCubic(Math.min(1, f.t / f.dur)); const tx = PROPS.cart.x + 66, ty = PROPS.cart.y + 14; this.fx.glitter(f.x0 + (tx - f.x0) * k, f.y0 + (ty - f.y0) * k - Math.sin(k * Math.PI) * 90, '#fff6c8', 1); }
      if (f.t >= f.dur) {
        this.flyers.splice(i, 1); this.tray.push(f.item); this.cartBump = 0.6; this.game.audio.play('card_place', { vol: 0.5, pitch: 0.7 });
        const c = PROPS.cart; this.fx.dust(c.x + 66, c.y + 18, 3, '#d8c0a8', 10); this.fx.glitter(c.x + 66, c.y + 8, matOf(f.item).color, 2);
      }
    }
    if (this.qte) {
      this.qte.t += dt;
      if (!this.qte.done && (inp.actionPressed('strike') || inp.pressed)) { this.qte.done = true; this.qte.ok = this.qte.t <= this.qte.win; inp.consume(); }
      if (!this.qte.done && this.qte.t > this.qte.win + 0.15) { this.qte.done = true; this.qte.ok = false; }
    }
    if (this.forge) this.forge.update(dt);
    const fl = Math.sin(this.time * 7.3) * 0.25 + Math.sin(this.time * 17.1) * 0.15;
    this.lamp.intensity = 4.2 + fl;
    this.flicker = fl;
    this.hero.update(dt);
    if (this.shards) updateShards(this.shards, dt, toWorld(0, FLOOR_Y + 6).y);
    this.dust.update(dt);
    this.ambience(dt);
    this.fx.update(dt);
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
  additive(ctx, fn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); }

  draw(ui) {
    const ctx = ui.ctx, inp = this.game.input;
    const sx = this.shakeT > 0 ? Math.round((Math.random() - 0.5) * this.shakeT * 16) : 0;
    const sy = this.shakeT > 0 ? Math.round((Math.random() - 0.5) * this.shakeT * 10) : 0;
    const busyUI = this.forge || this.qte || this.reveal || this.phase === 'shatter' || this.phase === 'leaving';
    ctx.save();
    ctx.translate(sx, sy);

    // daylight spilling through the ceiling crack, slanting across the left of the room
    this.additive(ctx, () => {
      const sh = shaftCanvas(70, 230, 470, '#fff0c8');
      ctx.globalAlpha = 0.95 + Math.sin(this.time * 0.6) * 0.05;
      ctx.translate(92, 0); ctx.rotate(-0.34);
      ctx.drawImage(sh, -sh.width / 2, 0);
    });

    // ---- rock face
    ui.img(faceRim(this.geom), BOARD.x - 8, BOARD.y - 8);
    const canDig = (this.phase === 'dig' || this.phase === 'prep') && !this.busy && !busyUI && !this.dead;
    const hb = ui.hit('rockface', BOARD.x, BOARD.y, BOARD.w, BOARD.h, { sound: false, cursor: false });
    const hover = hb.hover ? cellAt(this.geom, inp.x - BOARD.x, inp.y - BOARD.y) : null;
    for (let y = 0; y < MINE_H; y++) for (let x = 0; x < MINE_W; x++) {
      const t = this.wall.tiles[y][x];
      const c = this.geom.cells[y][x];
      if (t.broken) { ui.img(cavityCanvas(this.geom, x, y, this.pal, this.region), BOARD.x + c.bx, BOARD.y + c.by); continue; }
      const exp = this.exposed(x, y);
      const isHover = hover && hover.x === x && hover.y === y && canDig && (exp || (this.tool && TOOL_USE[this.tool.id] === 'scan'));
      const sk = this.shakes[x + ',' + y] ? Math.round(Math.sin(this.time * 90) * 2) : 0;
      const img = stoneCanvas(this.geom, t, this.pal, { exposed: exp, dim: !exp, flare: this.flareT > 0, hover: isHover }, this.region);
      const dx = BOARD.x + c.bx + sk, dy = BOARD.y + c.by - (isHover ? 1 : 0);
      ui.img(img, dx, dy);
      const fl = this.flashes[x + ',' + y];
      if (fl > 0) this.additive(ctx, () => { ctx.globalAlpha = Math.min(1, fl / 0.18) * 0.85; ctx.drawImage(img, dx, dy); ctx.drawImage(img, dx, dy); });
    }
    // cracks racing across struck stones: white-hot at the tip, cooling to dark plum
    for (const cr of this.cracks) {
      for (const ln of cr.lines) {
        const k = clamp((cr.t - ln.delay) / 0.14, 0, 1), n = Math.floor(k * (ln.pts.length - 1));
        const fade = cr.t > cr.life - 0.25 ? (cr.life - cr.t) / 0.25 : 1;
        for (let i = 0; i < n; i++) {
          const [x0, y0] = ln.pts[i], [x1, y1] = ln.pts[i + 1];
          const hot = i >= n - 2 && k < 1;
          ctx.globalAlpha = fade;
          ctx.fillStyle = hot ? '#fff4d8' : '#2a1838';
          for (let q = 0; q <= 3; q++) ctx.fillRect(Math.round(x0 + (x1 - x0) * q / 3), Math.round(y0 + (y1 - y0) * q / 3), 1, 1);
          if (!hot) { ctx.fillStyle = '#ffd8b0'; ctx.globalAlpha = fade * 0.5; ctx.fillRect(Math.round(x0) - 1, Math.round(y0), 1, 1); }
        }
      }
      ctx.globalAlpha = 1;
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
        else if (!t.broken) { this.game.audio.play('deny'); this.act('shrug'); this.shakes[hover.x + ',' + hover.y] = 0.15; }
      }
    }
    // warm lamp cones washing down over the face
    LANTERNS.forEach((l, i) => this.additive(ctx, () => {
      const cone = shaftCanvas(14, 150, 200, '#ffcf96');
      ctx.globalAlpha = 0.55 + (this.flicker || 0) * 0.12;
      ctx.drawImage(cone, Math.round(l.x - cone.width / 2 + (i ? -16 : 16)), l.y + 6);
    }));

    // ---- props
    this.drawAnvil(ui);
    this.drawCrate(ui);
    this.drawCart(ui);
    this.drawSlate(ui);
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
      this.additive(ctx, () => { ctx.globalAlpha = 0.6 + (this.flicker || 0) * 0.3; const g = glow(72, '#ffb35a'); ctx.drawImage(g, l.x - 72, l.y - 62); });
      ui.img(lanternCanvas(f), l.x - 9, l.y - 14);
    });
    this.fx.draw(ctx);
    ctx.restore();

    // ore flying into the cart
    for (const f of this.flyers) {
      const k = ease.inOutCubic(Math.min(1, f.t / f.dur));
      const tx = PROPS.cart.x + 66, ty = PROPS.cart.y + 14;
      const x = f.x0 + (tx - f.x0) * k, y = f.y0 + (ty - f.y0) * k - Math.sin(k * Math.PI) * 90;
      const art = oreArt(f.item.id, 30);
      ui.img(art, x - art.width / 2, y - art.height / 2, { rot: Math.round(f.t * f.spin * 4) / 4 });
    }
    if (this.say) { const h = this.headScreen(); speech(ui, h.x, h.y, this.say.text, { maxW: 180, alpha: clamp(this.say.t * 3, 0, 1) }); }
    hud(ui, this.game, { bag: false });
    if (this.phase === 'prep' && !this.forge && !this.noteOpen) {
      const bob = Math.round(Math.sin(this.time * 3) * 2);
      this.tag(ui, BOARD.x + BOARD.w / 2, 2 + bob, 'Swing at the top stones');
    }
    this.drawNote(ui);
    if (this.tool && !busyUI) {
      if (ui.touch) this.tag(ui, PROPS.crate.x + 48, PROPS.crate.y - 92, `${MATERIALS[this.tool.id].name}: tap a stone`, '#14503a');
      else this.tag(ui, inp.x + 4, inp.y + 14, `${MATERIALS[this.tool.id].name}: click a stone`, '#14503a');
      ui.touchButton('back', ui.w - 52, ui.h - 150, 26, { icon: 'cross', label: 'CANCEL', style: 'iron' });
      if ((inp.rpressed && !inp.longPress) || inp.actionPressed('back')) this.tool = null;
    }
    if (this.reveal) this.drawReveal(ui);
    if (this.qte) this.drawQte(ui);
    if (this.forge) this.forge.draw(ui);
  }

  drawAnvil(ui) {
    const { x, y } = PROPS.anvil;
    const can = this.phase === 'prep' && !this.pickName && !this.forge;
    const canForge = can && this.game.run.bag.items.some((it) => matOf(it).pick && Object.keys(matOf(it).pick).length && matOf(it).kind !== 'tool');
    const h = ui.hit('anvil', x, y, 72, 58, { sound: false, cursor: canForge ? 'hand' : 'arrow' });
    ui.img(anvilCanvas(h.hover && canForge), x, y - (h.hover && canForge ? 1 : 0));
    if (canForge && rnd.chance(0.12)) this.fx.sparks(x + 34 + rnd.float(-12, 12), y + 10, 1, ['#ffd27a', '#fff0b0'], 60);
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
      this.additive(ui.ctx, () => { ui.ctx.globalAlpha = 0.6; ui.ctx.drawImage(glow(20, '#9affc8'), x + 28, y - 48 + bob); });
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
      const px = x + 14 + col * 24 + (row % 2) * 12 - row, py = y + bump + 2 - row * 8 + ((i * 7) % 5);
      ui.img(oreArt(it.id, 30), px, py, { rot: ((i * 37) % 7 - 3) * 0.08 });
    });
    ui.img(cartCanvas('front'), x, y + bump);
    if (this.phase === 'done' && Math.sin(this.time * 5) > 0) this.additive(ui.ctx, () => { ui.ctx.globalAlpha = 0.35; ui.ctx.drawImage(glow(30, '#ffd27a'), x + 36, y + 2); });
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
    if (this.noteOpen && !h.hover) ui.text(ui.touch ? '(tap the note to put it away)' : '(click the note to put it away)', nx + W / 2, ny + H - 14, { align: 'center', font: 'small', color: '#7a5634' });
  }

  drawReveal(ui) {
    const r = this.reveal, k = Math.min(1, r.t / 0.3), out = Math.max(0, (r.t - 0.95) / 0.35);
    const ctx = ui.ctx;
    dim(ui, 0.5 * (1 - out));
    const m = matOf(r.item), col = RARITY[m.rarity].color;
    const cx = BOARD.x + BOARD.w / 2, cy = BOARD.y + BOARD.h / 2 - 10;
    // turning god-rays behind the find
    this.additive(ctx, () => {
      ctx.globalAlpha = 0.35 * (1 - out) * k;
      ctx.fillStyle = col;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + r.t * 0.6, a2 = a + 0.12;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 220, cy + Math.sin(a) * 220); ctx.lineTo(cx + Math.cos(a2) * 220, cy + Math.sin(a2) * 220); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = (1 - out);
      const g = glow(70, col); ctx.drawImage(g, cx - 70, cy - 70);
    });
    const s = Math.max(1, Math.round(ease.outBack(k) * 3));
    const art = oreArt(r.item.id, 34);
    ui.img(art, cx - (art.width * s) / 2, cy - (art.height * s) / 2 + Math.sin(r.t * 3) * 3, { scale: s, alpha: 1 - out });
    if (rnd.chance(0.5)) this.fx.glitter(cx + rnd.float(-60, 60), cy + rnd.float(-60, 60), rnd.pick([col, '#ffffff', m.color]), 2);
    ui.big(RARITY_WORD[r.r], cx, cy - 84, { scale: 3, top: '#ffffff', bottom: col, alpha: 1 - out });
    ui.text(m.name, cx, cy + 62, { align: 'center', color: col, outline: '#140c10' });
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
void hash2;
