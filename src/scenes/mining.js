// Mining spot: a voxel mine workshop seen through an oblique "3/4" camera. Your explorer stands at a
// rock face of sculpted voxel stones whose strata colour with depth; strike the stones from the top
// down, read the clues carved into the rock, and watch the stones lose cubes, burst into tumbling
// debris that piles on the floor, and give up their ore, which flies into the minecart. Swings are
// chalked on a slate, tools wait in a crate, the anvil forges a pick. No panels: everything you touch
// is part of the room. On top, 2D light and particles: lamp glows, a daylight shaft, motes, drips,
// steam, glitter on veins, sparks, dust and flares.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { generateMine, MiningRun, MINE_W, MINE_H } from '../systems/mining.js';
import { REGIONS } from '../data/regions.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { matOf } from '../systems/items.js';
import { buildCharacter } from '../models/characters.js';
import { buildWeaponMesh, crackWeapon, shatterPieces, updateShards } from '../models/weapons3d.js';
import { BOARD, LANTERNS, rockFace, cellAt, tagCanvas, noteCanvas } from './mining_art.js';
import {
  mineCamera, mineLamps, toWorld, toScreen, screenRect, buildChamber, RockFace, Debris, anvilProp, crateProp, cartProp, cartSlot,
  slateProp, noteProp, oreModel, oreSprite, disposeVox, FLOOR_W, DRIP_POINTS, PROP_AT, VOXEL,
} from '../models/mine_vox.js';
import { voxRelief } from '../ui/vox_ui.js';
import { STRATA, glow, shaftCanvas } from '../art/mine_kit.js';
import { MineFX } from '../art/mine_fx.js';
import { openForge } from './forgeui.js';
import { hud, speech, prompt, ring, dim, bark } from './common.js';
import { finish, openBag, gameOver } from './flow.js';
import { COLORS } from '../ui/font.js';
import { save } from '../core/save.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

const TOOL_IDS = ['blast', 'drill', 'scanner', 'radar', 'flare'];
const TOOL_USE = { blast: 'blast', drill: 'drill', scanner: 'scan', radar: 'radar', flare: 'flare' };
const ORE_SFX = ['ore_common', 'ore_common', 'ore_rare', 'ore_epic', 'ore_legendary'];
const RARITY_WORD = ['', 'Uncommon', 'Rare!', 'EPIC!', 'LEGENDARY!'];
const HERO_W = { x: (168 - 480) / 100, z: 0.6 };
const HERO = toScreen(HERO_W.x, FLOOR_W, HERO_W.z);
const FX_FLOOR = toScreen(0, FLOOR_W, 0.5).y;
const PICK_TEXT = {
  strikes: (v) => `+${v} swing${v > 1 ? 's' : ''}`, magnetic: () => 'Magnetic: pulls adjacent metals', gemDupe: () => 'Crystal: first gem doubled',
  cursed: () => 'Cursed: 3×3 swings, -1 quality', lucky: () => 'Lucky: better ores', smelt: () => 'Smelt: metals +1 quality',
  hard: () => 'Breaks hard rock in 1 hit', freeze: () => 'Freezes hazards', chain: () => 'Chain: linked ores break',
  reveal: () => 'Glint: reveals rarity', column: () => 'Starfall: first swing breaks a column', area: () => 'Also breaks the stone below',
  preserve: () => 'Preserve: no quality loss', unlock: () => 'Opens treasure pockets', archaeo: () => 'Fossils +1 quality', seehaz: () => 'Reveals hazards',
  quality: () => 'Gems +1 quality', melt: () => 'Melts ice ores!',
};
const plankTag = (w) => voxRelief('mine-tag|' + w, () => tagCanvas(w));
const notePanel = (w, h) => voxRelief('mine-note|' + w + '|' + h, () => noteCanvas(w, h, 11), { relief: 'flat' });

export class MiningScene extends Scene {
  enter(params = {}) {
    const game = this.game, run = game.run;
    this.node = params.node;
    this.region = run.region;
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
    this.fx = new MineFX(FX_FLOOR);
    this.dripT = DRIP_POINTS.map(() => rnd.float(0.5, 4));
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
    scene.background = new THREE.Color('#140e1c');
    const cam = mineCamera();
    // voxel room with baked light; the explorer and the ore get matching real-time lamps
    this.world = { scene, camera: cam, post: { tone: 0, saturation: 1.06, contrast: 1.02, lift: [0, 0, 0], gain: [1, 1, 1], vignette: 0.28, dither: 0, bloom: 0.55, threshold: 0.8, outline: 0.6, edge: 0.3 } };
    scene.add(buildChamber(this.region, BOARD));
    scene.add(new THREE.HemisphereLight(0xd8c8f8, 0x5a3a4a, 1.05));
    const lamps = mineLamps(this.region);
    this.lamps = lamps.slice(0, 2).map((l) => { const p = new THREE.PointLight(0xffc27a, 3.4, 7, 1.2); p.position.set(l.x, l.y, l.z + 0.6); scene.add(p); return p; });
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.0); // daylight from the crack above
    sun.position.set(-2, 4, 3);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8a9ad8, 0.45);
    fill.position.set(3, -0.5, 3);
    scene.add(fill);
    this.face = new RockFace(this.geom, this.region, BOARD, scene);
    this.debris = new Debris(1700);
    scene.add(this.debris.mesh);
    // the things you touch
    this.props = { anvil: anvilProp(this.region), crate: crateProp(this.region), cart: cartProp(this.region), note: noteProp(this.region) };
    for (const p of Object.values(this.props)) scene.add(p);
    this.rects = {};
    for (const [k, p] of Object.entries(this.props)) this.rects[k] = screenRect(p, 2);
    this.slate = null; this.slateKey = '';
    this.toolModels = new Map();
    this.cartOre = [];
    // the explorer
    const hero = buildCharacter(run.char);
    const box = new THREE.Box3().setFromObject(hero.group);
    // the explorer keeps scale 1: it shares the room's 0.04 voxel grid (1 unit = 100 px here)
    hero.group.position.set(HERO_W.x, FLOOR_W - box.min.y, HERO_W.z);
    hero.group.rotation.y = 1.0;
    hero.play('idle', { loop: true });
    scene.add(hero.group);
    this.hero = hero;
    this.heroH = Math.max(0.3, box.max.y - box.min.y);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x1a1028, transparent: true, opacity: 0.4, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 0.55, 1);
    shadow.position.set(HERO_W.x, FLOOR_W + 0.006, HERO_W.z);
    scene.add(shadow);
    this.equipPick();
    this.shards = null;
    this.face.sync(this.wall.tiles, (t) => this.stoneFlags(t));
  }
  equipPick() {
    const mesh = buildWeaponMesh({ bp: 'pickaxe', ids: this.pickIds, el: {}, grade: this.pickName ? 2 : 0 });
    this.pickMesh = mesh;
    this.hero.hold && this.hero.hold(mesh);
  }
  headScreen() { return toScreen(HERO_W.x + 0.06, FLOOR_W + this.heroH + 0.06, HERO_W.z); }
  /** Body language instead of words: play an animation if the explorer has it. */
  act(name, fallback) { this.hero.play(name); if (this.hero.anim !== name && fallback) this.hero.play(fallback); }

  exposed(x, y) { return this.mr ? this.mr.exposed(x, y) : y === 0 && !this.wall.tiles[0][x].broken; }
  stoneFlags(t) { return { exposed: this.exposed(t.x, t.y), flare: this.flareT > 0 }; }
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
      this.impact(x, y);
      const res = this.mr.strike(x, y);
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
      } else if (use === 'drill') { au.play('hard_clang', { pitch: 1.4 }); for (let i = 0; i < 6; i++) { const yy = Math.min(MINE_H - 1, y + (i >> 1)); const cc = this.stoneCenter(x, yy); this.fx.sparks(cc.x, cc.y, 8, ['#ffe08a', '#ffffff'], 160); this.fx.dust(cc.x, cc.y, 2); this.chipFx(x, yy, cc.x, cc.y, 3); this.shake(0.6); yield 0.07; } }
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
      }
      lines.push({ pts, delay: 0 });
    }
    this.cracks.push({ x, y, lines, t: 0, life: 0.45 });
  }
  /** Spray debris cubes from voxels (u, v, z ints in room voxel space) away from a screen point. */
  spray(vox, cx, cy, power = 1) {
    const o = toWorld(cx, cy, 0);
    for (const q of vox) {
      const x = (q.u + 0.5) * VOXEL, y = (q.v + 0.5) * VOXEL, z = (q.z + 0.5) * VOXEL;
      const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy) || 0.01;
      const sp = rnd.float(0.6, 1.8) * power;
      this.debris.spawn(x, y, z + 0.02, q.c, (dx / d) * sp + rnd.float(-0.4, 0.4), (dy / d) * sp * 0.8 + rnd.float(0.4, 1.8) * power, rnd.float(0.5, 2.0) * power, 0.95);
    }
  }
  chipFx(x, y, sx, sy, n) { this.spray(this.face.chip(x, y, sx, sy, n), sx, sy, 0.8); }
  impact(x, y) {
    const c = this.stoneCenter(x, y);
    const ix = c.x + rnd.float(-8, 8), iy = c.y + rnd.float(-8, 8);
    this.shake(1);
    this.game.hitStop(0.05);
    this.game.audio.play('pick_strike', { pitch: 0.9 + rnd.next() * 0.2 });
    this.flashes[x + ',' + y] = 0.18;
    this.growCrack(x, y, ix, iy);
    this.chipFx(x, y, ix, iy, rnd.int(4, 8));
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
    const c = this.stoneCenter(x, y);
    const cols = this.stoneCols(x, y);
    // the stone bursts into its own voxels, which tumble down and pile at the foot of the face
    this.spray(this.face.voxels(x, y), c.x, c.y, 1);
    this.face.remove(x, y);
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
        case 'crack': this.shakes[ev.x + ',' + ev.y] = 0.3; au.play('hard_clang'); this.fx.sparks(sp.x, sp.y, 14, ['#ffffff', '#c8d8ff'], 200); this.chipFx(ev.x, ev.y, sp.x, sp.y, 5); ui.float('Crack!', sp.x, sp.y - 8, { color: '#f4eaff', vy: -18, life: 0.8 }); yield 0.1; break;
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
    // chunks of the ceiling come down as real voxel debris
    for (let i = 0; i < 70; i++) {
      const c = parseInt(this.strata[rnd.int(0, 3)].slice(1), 16);
      this.debris.spawn(rnd.float(-4.4, 2.2), rnd.float(2.5, 3.2), rnd.float(0.05, 1.1), c, rnd.float(-0.3, 0.3), rnd.float(-1.5, 0), rnd.float(-0.1, 0.4), 0.9);
    }
    for (let i = 0; i < 10; i++) this.fx.dust(rnd.float(80, 680), rnd.float(0, 40), 2, '#c8b0b8', 20);
    this.qte = { t: 0, win: 0.9, done: false, ok: false };
    au.play('qte_prompt');
    yield () => this.qte.done;
    const ok = this.qte.ok;
    this.qte = null;
    if (ok) { au.play('qte_success'); this.hero.play('dodge'); ui.float('Dodged!', HERO.x + 40, HERO.y - 150, { big: true, scale: 3, top: '#e8ffe0', bottom: '#5fd17a' }); this.fx.dust(HERO.x, HERO.y, 8, '#c8b0b8', 30); }
    else {
      au.play('cave_in'); au.play('hurt');
      this.shake(3);
      this.game.renderer.doFlash(0.35, [1, 0.3, 0.2]);
      this.hero.play('hurt');
      this.fx.dust(HERO.x, HERO.y - 60, 16, '#c8b0b8', 40);
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
      if (this.tray.length) { au.play('coins'); this.hero.play('cheer'); this.cartBump = 1; const r = this.rects.cart; for (let i = 0; i < 14; i++) this.fx.glitter(r.x + rnd.float(10, r.w - 10), r.y + rnd.float(0, 30), '#ffe6a0', 2); yield 0.6; }
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
    if (rnd.chance(dt * 9)) { const t = rnd.next(); fx.mote(70 + t * 170 + rnd.float(-30, 30), 20 + t * 440); }
    if (rnd.chance(dt * 4)) { const l = rnd.pick(LANTERNS); fx.mote(l.x + rnd.float(-50, 50), l.y + rnd.float(-10, 120)); }
    // drips from the stalactites and the wet beam
    this.dripT = this.dripT.map((t, i) => { t -= dt; if (t <= 0) { fx.drip(DRIP_POINTS[i][0], DRIP_POINTS[i][1]); return rnd.float(2.5, 6); } return t; });
    // steam from the pipe vent, fireflies over the moss
    if (rnd.chance(dt * 3)) { const v = toScreen(4.64, FLOOR_W + 0.1, -0.16); fx.steam(v.x + rnd.float(-3, 3), v.y); }
    if (rnd.chance(dt * 1.5)) fx.spore(rnd.pick([20, 250, 700, 940]) + rnd.float(-12, 12), FX_FLOOR - rnd.float(10, 40), this.region === 2 ? '#9affd0' : '#fff0a0');
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

  /** Tools waiting in the crate are their own voxel models, sunk in the straw. */
  syncTools(tools) {
    const keep = new Set(tools.map((it) => it.uid));
    for (const [uid, m] of this.toolModels) if (!keep.has(uid)) { this.props.crate.remove(m); this.toolModels.delete(uid); }
    tools.forEach((it, i) => {
      let m = this.toolModels.get(it.uid);
      if (!m) {
        m = oreModel(it.id, 0.3, 16);
        m.rotation.set(0.2, -0.5 + i * 0.3, (i - 1.5) * 0.18);
        this.props.crate.add(m);
        this.toolModels.set(it.uid, m);
      }
      const p = toWorld(PROP_AT.crate.sx - 30 + i * 20, 0, 0);
      m.userData.home = { x: p.x, y: FLOOR_W + 0.46, z: (PROP_AT.crate.z + 1) * VOXEL };
    });
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
    const tgt = this.cartTarget();
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      if (rnd.chance(0.5)) { const k = ease.inOutCubic(Math.min(1, f.t / f.dur)); this.fx.glitter(f.x0 + (tgt.x - f.x0) * k, f.y0 + (tgt.y - f.y0) * k - Math.sin(k * Math.PI) * 90, '#fff6c8', 1); }
      if (f.t >= f.dur) {
        this.flyers.splice(i, 1); this.tray.push(f.item); this.cartBump = 0.6; this.game.audio.play('card_place', { vol: 0.5, pitch: 0.7 });
        this.addCartOre(f.item);
        this.fx.dust(tgt.x, tgt.y + 6, 3, '#d8c0a8', 10); this.fx.glitter(tgt.x, tgt.y - 4, matOf(f.item).color, 2);
      }
    }
    if (this.qte) {
      this.qte.t += dt;
      if (!this.qte.done && (inp.actionPressed('strike') || inp.pressed)) { this.qte.done = true; this.qte.ok = this.qte.t <= this.qte.win; inp.consume(); }
      if (!this.qte.done && this.qte.t > this.qte.win + 0.15) { this.qte.done = true; this.qte.ok = false; }
    }
    if (this.forge) this.forge.update(dt);
    const fl = Math.sin(this.time * 7.3) * 0.25 + Math.sin(this.time * 17.1) * 0.15;
    for (const l of this.lamps) l.intensity = 3.4 + fl;
    this.flicker = fl;
    // voxel world upkeep: stones follow their clue state, the slate its chalk, the cart its bump
    this.face.sync(this.wall.tiles, (t) => this.stoneFlags(t));
    const total = this.mr ? this.mr.strikes + this.mr.used : 3 + (this.pick.strikes || 0), left = this.mr ? this.mr.strikes : total;
    if (this.slateKey !== total + '|' + left) {
      if (this.slate) { this.world.scene.remove(this.slate); disposeVox(this.slate); }
      this.slate = slateProp(this.region, total, left);
      this.world.scene.add(this.slate);
      this.slateKey = total + '|' + left;
      this.rects.slate = screenRect(this.slate, 2);
    }
    this.slate.position.x = Math.sin(this.time * 1.3) * 0.006;
    this.props.cart.position.y = Math.abs(Math.sin(this.cartBump * 30)) * this.cartBump * 0.04;
    this.syncTools(this.game.run.bag.all().filter((it) => TOOL_IDS.includes(it.id)).slice(0, 4));
    for (const [uid, m] of this.toolModels) {
      const h = m.userData.home, sel = this.tool && this.tool.uid === uid, hov = this.hoverTool === uid;
      const lift = sel ? 0.42 + Math.sin(this.time * 4) * 0.03 : hov ? 0.08 : 0;
      m.position.set(h.x, h.y + lift, h.z + (sel ? 0.2 : 0));
      if (sel) m.rotation.y += dt * 1.5;
    }
    this.hero.update(dt);
    if (this.shards) updateShards(this.shards, dt, FLOOR_W);
    this.debris.update(dt);
    this.ambience(dt);
    this.fx.update(dt);
  }
  cartTarget() { const r = this.rects.cart; return { x: r.x + r.w / 2, y: r.y + 14 }; }
  addCartOre(item) {
    const i = this.cartOre.length;
    if (i >= 20) return;
    const m = oreModel(item.id, 0.2, 14);
    const s = cartSlot(i);
    m.position.set(s.x, s.y, s.z);
    m.rotation.set(rnd.float(-0.4, 0.4), rnd.float(0, 6), rnd.float(-0.4, 0.4));
    this.props.cart.add(m);
    this.cartOre.push(m);
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
    const c = plankTag(w);
    const bx = Math.round(clamp(x - c.width / 2, 4, ui.w - c.width - 4)), by = Math.round(y);
    ui.img(c, bx, by);
    ui.text(text, bx + 10, by + 11, { color });
  }
  additive(ctx, fn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); }

  draw(ui) {
    const ctx = ui.ctx, inp = this.game.input;
    const sx = this.shakeT > 0 ? Math.round((Math.random() - 0.5) * this.shakeT * 16) : 0;
    const sy = this.shakeT > 0 ? Math.round((Math.random() - 0.5) * this.shakeT * 10) : 0;
    const cam = this.world.camera;
    cam.position.x = -sx / 100; cam.position.y = sy / 100;
    const busyUI = this.forge || this.qte || this.reveal || this.phase === 'shatter' || this.phase === 'leaving';
    ctx.save();
    ctx.translate(sx, sy);

    // daylight spilling through the ceiling crack, slanting across the left of the room
    this.additive(ctx, () => {
      const sh = shaftCanvas(70, 230, 470, '#fff0c8');
      ctx.globalAlpha = 0.85 + Math.sin(this.time * 0.6) * 0.08;
      ctx.translate(96, 0); ctx.rotate(-0.3);
      ctx.drawImage(sh, -sh.width / 2, 0);
    });

    // ---- rock face: the voxel stones take their tint (dim when out of reach, lit on hover, flash on hit)
    const canDig = (this.phase === 'dig' || this.phase === 'prep') && !this.busy && !busyUI && !this.dead;
    const hb = ui.hit('rockface', BOARD.x, BOARD.y, BOARD.w, BOARD.h, { sound: false, cursor: false });
    const hover = hb.hover ? cellAt(this.geom, inp.x - BOARD.x, inp.y - BOARD.y) : null;
    for (let y = 0; y < MINE_H; y++) for (let x = 0; x < MINE_W; x++) {
      const t = this.wall.tiles[y][x];
      if (t.broken) continue;
      const exp = this.exposed(x, y) || this.phase === 'intro';
      const isHover = hover && hover.x === x && hover.y === y && canDig && (exp || (this.tool && TOOL_USE[this.tool.id] === 'scan'));
      const k = (exp ? 1 : 0.8) + (isHover ? 0.16 : 0) + Math.max(0, (this.flashes[x + ',' + y] || 0) / 0.18) * 1.6;
      this.face.look(x, y, exp ? [k, k, k] : [k * 0.92, k * 0.9, k * 1.02], this.shakes[x + ',' + y] ? Math.round(Math.sin(this.time * 90) * 2) : 0);
    }
    // cracks racing across struck stones: white-hot at the tip
    for (const cr of this.cracks) {
      for (const ln of cr.lines) {
        const k = clamp(cr.t / 0.12, 0, 1), n = Math.floor(k * (ln.pts.length - 1));
        const fade = cr.t > cr.life - 0.2 ? (cr.life - cr.t) / 0.2 : 1;
        for (let i = 0; i < n; i++) {
          const [x0, y0] = ln.pts[i], [x1, y1] = ln.pts[i + 1];
          const hot = i >= n - 2 && k < 1;
          ctx.globalAlpha = fade * (hot ? 1 : 0.7);
          ctx.fillStyle = hot ? '#fff4d8' : '#ffd8a0';
          for (let q = 0; q <= 3; q++) ctx.fillRect(Math.round(x0 + (x1 - x0) * q / 3), Math.round(y0 + (y1 - y0) * q / 3), 1, 1);
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
      ctx.globalAlpha = 0.5 + (this.flicker || 0) * 0.12;
      ctx.drawImage(cone, Math.round(l.x - cone.width / 2 + (i ? -16 : 16)), l.y + 6);
    }));

    // ---- props: voxel models in the room; here only their hit areas, hover tags and glows
    this.drawAnvil(ui);
    this.drawCrate(ui);
    this.drawCart(ui);
    this.drawSlate(ui);
    LANTERNS.forEach((l) => this.additive(ctx, () => { ctx.globalAlpha = 0.55 + (this.flicker || 0) * 0.3; const g = glow(72, '#ffb35a'); ctx.drawImage(g, l.x - 72, l.y - 62); }));
    for (const l of mineLamps(this.region).slice(2, 4)) { const p = toScreen(l.x, l.y, l.z); this.additive(ctx, () => { ctx.globalAlpha = 0.4 + (this.flicker || 0) * 0.2; const g = glow(40, '#ffc27a'); ctx.drawImage(g, p.x - 40, p.y - 36); }); }
    this.fx.draw(ctx);
    ctx.restore();

    // ore flying into the cart: voxel renders of the ore
    const tgt = this.cartTarget();
    for (const f of this.flyers) {
      const k = ease.inOutCubic(Math.min(1, f.t / f.dur));
      const x = f.x0 + (tgt.x - f.x0) * k, y = f.y0 + (tgt.y - f.y0) * k - Math.sin(k * Math.PI) * 90;
      const art = oreSprite(f.item.id, 34);
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
      const r = this.rects.crate;
      if (ui.touch) this.tag(ui, r.x + r.w / 2, r.y - 100, `${MATERIALS[this.tool.id].name}: tap a stone`, '#14503a');
      else this.tag(ui, inp.x + 4, inp.y + 14, `${MATERIALS[this.tool.id].name}: click a stone`, '#14503a');
      ui.touchButton('back', ui.w - 52, ui.h - 150, 26, { icon: 'cross', label: 'CANCEL', style: 'iron' });
      if ((inp.rpressed && !inp.longPress) || inp.actionPressed('back')) this.tool = null;
    }
    if (this.reveal) this.drawReveal(ui);
    if (this.qte) this.drawQte(ui);
    if (this.forge) this.forge.draw(ui);
  }

  /** Tint a prop's voxel mesh (hover glow). */
  tint(group, k) { group.traverse((o) => { if (o.isMesh && o.name === 'vox') o.material.color.setScalar(k); }); }

  drawAnvil(ui) {
    const r = this.rects.anvil;
    const can = this.phase === 'prep' && !this.pickName && !this.forge;
    const canForge = can && this.game.run.bag.items.some((it) => matOf(it).pick && Object.keys(matOf(it).pick).length && matOf(it).kind !== 'tool');
    const h = ui.hit('anvil', r.x, r.y, r.w, r.h, { sound: false, cursor: canForge ? 'hand' : 'arrow' });
    this.tint(this.props.anvil, h.hover && canForge ? 1.18 : 1);
    if (canForge && rnd.chance(0.12)) this.fx.sparks(r.x + r.w / 2 + rnd.float(-12, 12), r.y + 8, 1, ['#ffd27a', '#fff0b0'], 60);
    if (h.hover && !this.forge) {
      this.tag(ui, r.x + r.w / 2, r.y - 26, this.pickName ? this.pickName : canForge ? 'Forge a pickaxe' : can ? 'No pick materials' : 'Busy digging');
      if (this.pickName) { const effs = Object.entries(this.pick).filter(([k, v]) => v && PICK_TEXT[k]).map(([k, v]) => PICK_TEXT[k](v)); if (effs.length) ui.tooltip({ title: this.pickName, body: effs.join('\n'), w: 170 }); }
      else if (canForge) ui.tooltip({ body: 'Spend materials on a pickaxe: more swings and wild effects. The curse shatters it when you leave.', w: 180 });
    }
    if (h.clicked && canForge) this.openPickForge();
  }

  drawCrate(ui) {
    const r = this.rects.crate;
    this.hoverTool = null;
    const tools = this.game.run.bag.all().filter((it) => TOOL_IDS.includes(it.id)).slice(0, 4);
    tools.forEach((it) => {
      if (this.tool === it) return;
      const m = this.toolModels.get(it.uid);
      if (!m) return;
      const p = toScreen(m.userData.home.x, m.userData.home.y, m.userData.home.z);
      const h = ui.hit('tool' + it.uid, p.x - 12, p.y - 22, 24, 30, { sound: false });
      if (h.hover) { this.hoverTool = it.uid; this.tag(ui, p.x, p.y - 52, MATERIALS[it.id].name); }
      if (h.clicked) {
        if ((this.phase === 'dig' || this.phase === 'prep') && !this.busy) { this.tool = it; this.game.audio.play('card_pick'); this.hero.play('point'); }
        else this.game.audio.play('deny');
      }
    });
    if (!tools.length && ui.hit('crate', r.x, r.y, r.w, r.h, { sound: false, cursor: false }).hover) this.tag(ui, r.x + r.w / 2, r.y - 26, 'No tools packed');
    if (this.tool) {
      const m = this.toolModels.get(this.tool.uid);
      if (m) { const p = toScreen(m.position.x, m.position.y, m.position.z); this.additive(ui.ctx, () => { ui.ctx.globalAlpha = 0.6; ui.ctx.drawImage(glow(22, '#9affc8'), p.x - 22, p.y - 22); }); }
    }
  }

  drawCart(ui) {
    const r = this.rects.cart;
    const canLeave = (this.phase === 'dig' || this.phase === 'done') && !this.busy;
    const h = ui.hit('cart', r.x, r.y, r.w, r.h, { sound: false, cursor: canLeave ? 'hand' : 'arrow' });
    this.tint(this.props.cart, h.hover && canLeave ? 1.16 : 1);
    if (this.phase === 'done' && Math.sin(this.time * 5) > 0) this.additive(ui.ctx, () => { ui.ctx.globalAlpha = 0.35; ui.ctx.drawImage(glow(30, '#ffd27a'), r.x + r.w / 2 - 30, r.y - 10); });
    if (h.hover) {
      const worth = this.tray.reduce((a, it) => a + Math.round(matOf(it).value * [0.6, 0.8, 1, 1.25, 1.5][it.q]), 0);
      this.tag(ui, r.x + r.w / 2, r.y - 30, canLeave ? (this.phase === 'done' ? 'Push off with the haul' : 'Pack up early?') : this.tray.length ? 'The haul' : 'Empty cart');
      if (this.tray.length) ui.tooltip({ title: `Haul · ${worth} coins`, body: this.tray.map((it) => `{${matOf(it).rarity}}${matOf(it).name}{/}`).join('\n'), w: 160 });
      if (h.clicked && canLeave) this.packUp();
    }
  }

  drawSlate(ui) {
    const r = this.rects.slate;
    const left = this.mr ? this.mr.strikes : 3 + (this.pick.strikes || 0);
    if (ui.hit('slate', r.x, r.y, r.w, r.h, { sound: false, cursor: false }).hover) this.tag(ui, r.x + r.w / 2, r.y + r.h + 4, `${left} swing${left === 1 ? '' : 's'} left`);
  }

  drawNote(ui) {
    const r = this.rects.note;
    const h = ui.hit('note', r.x, r.y, r.w, r.h, { sound: false });
    this.props.note.position.y = h.hover ? 0.02 : 0;
    this.tint(this.props.note, h.hover ? 1.15 : 1);
    if (h.clicked) { if (this.noteOpen) this.closeNote(); else this.noteOpen = true; this.game.audio.play('page'); }
    if (!(h.hover || this.noteOpen) || this.forge) return;
    const W = 250, H = 168, nx = ui.w - W - 6, ny = r.y + 34;
    ui.img(notePanel(W, H), nx, ny);
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
    const s = ease.outBack(k);
    const art = oreSprite(r.item.id, 104);
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
