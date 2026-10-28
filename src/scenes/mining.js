// Mining spot: forge a pickaxe, then spend strikes digging down through a 7×7 voxel wall.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { buildSet } from '../models/environments.js';
import { buildCharacter } from '../models/characters.js';
import { buildWeaponMesh, crackWeapon, shatterPieces, updateShards } from '../models/weapons3d.js';
import { materialSprite, itemSprite } from '../art/sprites.js';
import { materialCard, drawCard } from '../ui/cards.js';
import { openForge } from './forgeui.js';
import { makeWorld, hud, speech, prompt, ring, bark, dim } from './common.js';
import { finish, openBag, gameOver } from './flow.js';
import { generateMine, MiningRun, MINE_W, MINE_H } from '../systems/mining.js';
import { matOf, itemTooltip } from '../systems/items.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { REGIONS } from '../data/regions.js';
import { Debris } from '../gfx/particles.js';
import { COLORS } from '../ui/font.js';
import { save } from '../core/save.js';
import { fx as rnd } from '../core/rng.js';
import { ease, clamp } from '../core/math.js';
import { buildTile, buildOreHint, buildBacking, TILE } from './mining_wall.js';

const TOOL_IDS = ['blast', 'drill', 'scanner', 'radar', 'flare'];
const TOOL_USE = { blast: 'blast', drill: 'drill', scanner: 'scan', radar: 'radar', flare: 'flare' };
const TARGETED = { blast: true, drill: true, scan: true };
const ORE_SFX = ['ore_common', 'ore_common', 'ore_rare', 'ore_epic', 'ore_legendary'];
const PICK_TEXT = {
  strikes: (v) => `{good}+${v} Strike${v > 1 ? 's' : ''}{/}`, magnetic: () => 'Magnetic: pulls adjacent metals', gemDupe: () => 'Crystal: first gem doubled',
  cursed: () => '{curse}Cursed: 3×3 strikes, -1 quality{/}', lucky: () => '{gold}Lucky: rarer ores{/}', smelt: () => '{fire}Smelt: metals +1 quality{/}',
  hard: () => 'Breaks hard rock in 1 hit', freeze: () => '{ice}Freezes hazards{/}', chain: () => '{shock}Chain: connected ores break{/}',
  reveal: () => 'Glint: shows rarity', column: () => '{gold}Starfall: first strike breaks a column{/}', area: () => 'Also breaks the tile below',
  preserve: () => 'Preserve: no quality loss', unlock: () => 'Opens treasure pockets', archaeo: () => 'Fossils +1 quality', seehaz: () => '{warn}Reveals hazards{/}',
  quality: () => 'Gems +1 quality', melt: () => '{bad}Melts ice ores!{/}',
};

export class MiningScene extends Scene {
  enter(params = {}) {
    const game = this.game, run = game.run;
    this.node = params.node;
    this.region = run.region;
    this.pal = REGIONS[this.region].pal;
    this.set = buildSet('wall', this.region, {});
    this.W = makeWorld(this.set, { fogDensity: 0.035 });
    if (this.set.attach) this.set.attach(this.W.scene); // real sets own their fog/background
    this.world = { scene: this.W.scene, camera: this.W.rig.camera, post: { bloom: 0.8, vignette: 0.4 } };
    const a = this.set.anchors || {};
    this.origin = (a.gridOrigin || new THREE.Vector3(-1.12, 2.66, -1.0)).clone();
    this.gz = this.origin.z;
    this.floorY = this.set.floorY ?? 0;
    this.center = new THREE.Vector3(this.origin.x + (MINE_W * TILE) / 2, this.origin.y - (MINE_H * TILE) / 2, this.gz);

    // wall + session
    this.luck = run.char === 'clover' ? 1 : 0;
    this.genSeed = 'mine' + run.map.current + ':' + run.stats.floors;
    this.wall = generateMine(run.rng.fork(this.genSeed), this.region, { luck: this.luck });
    this.pick = {};
    this.pickName = null;
    this.pickIds = null;
    this.tileRoot = new THREE.Group();
    this.W.scene.add(this.tileRoot);
    const back = buildBacking(this.pal, MINE_W, MINE_H);
    back.position.set(this.center.x, this.center.y, this.gz - 0.24);
    this.W.scene.add(back);
    this.buildTiles();

    // lights: warm lantern by the explorer + cool rim on the wall
    this.lantern = new THREE.PointLight(0xffb060, 5, 7, 1.6);
    this.lantern.position.set(this.origin.x - 0.3, this.origin.y - 0.8, this.gz + 1.4);
    this.W.scene.add(this.lantern);
    this.workLight = new THREE.PointLight(0xffd8a0, 3.2, 5, 1.4);
    this.workLight.position.set(this.center.x + 0.4, this.center.y + 0.9, this.gz + 1.3);
    this.W.scene.add(this.workLight);
    this.flareLight = new THREE.PointLight(0xfff0c0, 0, 9, 1.4);
    this.flareLight.position.set(this.center.x, this.center.y + 0.4, this.gz + 1.2);
    this.W.scene.add(this.flareLight);

    // explorer
    this.char = buildCharacter(run.char);
    const px = this.origin.x - 0.62, pz = this.gz + 1.55;
    const cpos = new THREE.Vector3(px, this.set.floorAt ? this.set.floorAt(px, pz) : this.floorY, pz);
    this.char.group.position.copy(cpos);
    if (this.char.showBackItem) this.char.showBackItem(false);
    this.faceToward(this.center);
    this.W.scene.add(this.char.group);
    this.equipPick(['junk']);

    this.debris = new Debris(600, 0.045);
    this.W.scene.add(this.debris.object);

    // camera: wide establishing shot → sweep to the wall
    const rig = this.W.rig;
    const sc = this.set.camera;
    this.camHome = sc && a.gridOrigin ? { pos: [sc.pos[0] + 0.25, sc.pos[1] + 0.1, sc.pos[2] + 0.2], look: [sc.look[0] + 0.12, sc.look[1], sc.look[2]], fov: sc.fov } : { pos: [this.center.x + 0.3, this.center.y + 0.1, this.gz + 5.4], look: [this.center.x + 0.1, this.center.y, this.gz], fov: 42 };
    rig.cut([this.center.x - 2.6, this.center.y + 1.6, this.gz + 7.5], [this.center.x, this.center.y - 0.4, this.gz], 46);
    rig.moveTo(this.camHome.pos, this.camHome.look, this.camHome.fov, 2.0, 'inOutCubic');

    this.phase = 'intro';
    this.mr = null;
    this.busy = false;
    this.tool = null;
    this.tray = [];
    this.flyers = [];
    this.reveals = [];
    this.shown = new Set();
    this.say = null;
    this.qte = null;
    this.combo = 0;
    this.forge = null;
    this.flareT = 0;
    this.tip = !save.data.seen.tips.mining;
    this.summary = false;
    this.hover = null;

    const au = game.audio;
    if (au) { au.music(REGIONS[this.region].music); this.amb = au.loop('cave'); }
    this.co.start(function* () {
      yield 1.6;
      this.speak(bark(run.char, 'mine'), 2.4);
      yield 0.4;
      this.phase = 'prep';
    }.bind(this));
  }

  exit() { if (this.amb) this.amb.stop(1); }

  // ------------------------------------------------------------------ build helpers
  buildTiles() {
    for (const c of [...this.tileRoot.children]) { this.tileRoot.remove(c); disposeObj(c); }
    this.objs = [];
    for (let y = 0; y < MINE_H; y++) {
      this.objs.push([]);
      for (let x = 0; x < MINE_W; x++) {
        const t = this.wall.tiles[y][x];
        const o = { group: null, hint: null, shake: 0 };
        this.objs[y].push(o);
        if (!t.broken) this.makeTile(x, y);
      }
    }
    this.refreshHints();
  }
  tilePos(x, y) { return new THREE.Vector3(this.origin.x + (x + 0.5) * TILE, this.origin.y - (y + 0.5) * TILE, this.gz); }
  makeTile(x, y) {
    const t = this.wall.tiles[y][x];
    const o = this.objs[y][x];
    if (o.group) { this.tileRoot.remove(o.group); disposeObj(o.group); }
    const g = buildTile(t, this.pal, 7);
    const p = this.tilePos(x, y);
    g.position.set(p.x, p.y, this.gz - 0.16 + (hashJit(x, y) - 0.5) * 0.02);
    this.tileRoot.add(g);
    o.group = g; o.hint = null;
    o.base = g.position.clone();
  }
  refreshHints() {
    for (let y = 0; y < MINE_H; y++) for (let x = 0; x < MINE_W; x++) {
      const t = this.wall.tiles[y][x], o = this.objs[y][x];
      if (t.broken || !o.group || o.hint || t.t !== 'ore') continue;
      if (!this.exposed(x, y)) continue;
      const h = buildOreHint(t, 3);
      h.position.set(0, 0, o.group.userData.depth * 0.04 + 0.04);
      o.group.add(h);
      o.hint = h;
    }
  }
  exposed(x, y) {
    if (this.mr) return this.mr.exposed(x, y);
    const t = this.wall.tiles[y] && this.wall.tiles[y][x];
    return !!t && !t.broken && y === 0;
  }
  faceToward(v) {
    const p = this.char.group.position;
    this.char.group.rotation.y = Math.atan2(v.x - p.x, v.z - p.z);
  }
  equipPick(ids) {
    if (this.pickMesh) { this.char.hold(null); disposeObj(this.pickMesh); }
    this.pickMesh = buildWeaponMesh({ bp: 'pickaxe', ids, el: {}, grade: ids[0] === 'junk' ? 0 : 2 });
    this.char.hold(this.pickMesh);
  }
  speak(text, dur = 2) { if (text) this.say = { text, t: dur }; }
  handPos() { return this.char.group.position.clone().add(new THREE.Vector3(0.15, 0.95, 0.1)); }

  // ------------------------------------------------------------------ actions
  openPickForge() {
    if (this.forge) return;
    this.phase = 'forging';
    const anvil = this.char.group.position.clone().add(new THREE.Vector3(0.4, 0.5, 0.5));
    this.forge = openForge(this, {
      mode: 'pickaxe', anvil, rig: this.W.rig, world: this.W,
      onDone: (res) => {
        this.forge = null;
        this.phase = 'prep';
        this.W.rig.moveTo(this.camHome.pos, this.camHome.look, this.camHome.fov, 0.8);
        if (!res) return;
        this.pick = res.pick || {};
        this.pickName = res.name || 'Pickaxe';
        this.pickIds = res.ids || ['iron'];
        this.equipPick(this.pickIds);
        this.game.run.stats.forged++;
        if (this.pick.lucky) {
          // lucky pick: the wall shimmers into something richer
          this.wall = generateMine(this.game.run.rng.fork(this.genSeed + 'L'), this.region, { luck: this.luck + this.pick.lucky });
          this.buildTiles();
          this.W.sparks.emit({ pos: [this.center.x, this.center.y, this.gz + 0.2], posSpread: [1.1, 1.1, 0.05], count: 60, life: [0.6, 1.4], size: 1, color: ['#ffe08a', '#fff6c8', '#7fe3ff'], glow: 3, spread: 0.3 });
          this.game.ui.toast('Lucky Pick: the wall shimmers!', { icon: 'star', color: COLORS.gold });
        }
        this.speak(`${this.pickName}! ${bark(this.game.run.char, 'forge')}`, 2.2);
      },
    });
  }

  startDig() {
    this.phase = 'dig';
    this.mr = new MiningRun(this.wall, this.game.run.rng.fork(this.genSeed + 'dig'), this.pick, { char: this.game.run.char });
    if (this.tip) { save.data.seen.tips.mining = true; save.write(); this.tip = false; }
    this.refreshHints();
    this.game.audio && this.game.audio.play('ui_pop');
  }

  strikeTile(x, y) {
    if (this.busy || this.dead || !this.mr || this.mr.strikes <= 0 || !this.mr.exposed(x, y)) return;
    this.busy = true;
    const run = this.game.run;
    const target = this.tilePos(x, y);
    this.faceToward(target);
    this.char.play('mine', { loop: false });
    const imp = this.char.impactTime ? Math.min(0.5, Math.max(0.12, this.char.impactTime('mine'))) : 0.22;
    this.co.start(function* () {
      yield imp;
      const res = this.mr.strike(x, y);
      this.impact(target, 1);
      this.combo = 0;
      yield* this.playEvents(res.events);
      this.afterAction();
    }.bind(this));
  }

  useTool(item, x, y) {
    if (this.busy || !this.mr) return;
    const use = TOOL_USE[item.id];
    if (TARGETED[use] && use !== 'scan' && !this.mr.exposed(x, y)) { this.game.ui.toast('Place it on an exposed tile.', { icon: 'cross' }); return; }
    this.busy = true;
    this.game.run.removeItem(item);
    this.tool = null;
    const au = this.game.audio;
    this.co.start(function* () {
      if (use === 'blast') {
        au && au.play('fire_whoosh');
        this.speak('Fire in the hole!', 1.2);
        yield 0.45;
        const p = this.tilePos(x, y);
        this.game.renderer.doFlash(0.55, [1, 0.8, 0.5]);
        this.W.rig.shake(0.7);
        this.game.hitStop(0.08);
        au && au.play('rock_break', { vol: 1 });
        au && au.play('cave_in', { vol: 0.6 });
        this.W.sparks.emit({ pos: [p.x, p.y, p.z + 0.2], count: 70, radial: [1.5, 3.5], life: [0.3, 0.8], size: [1, 2], color: ['#ffd27a', '#ff8a3a', '#fff0b0'], colorEnd: '#ff3a1a', glow: 3, drag: 2, gravity: 2 });
      } else if (use === 'drill') {
        au && au.play('hard_clang', { pitch: 1.4 });
        for (let i = 0; i < 6; i++) { const p = this.tilePos(x, Math.min(MINE_H - 1, y + (i >> 1))); this.W.sparks.emit({ pos: [p.x, p.y, p.z + 0.2], count: 8, radial: 1.5, life: 0.4, size: 1, color: '#ffe08a', glow: 3 }); this.W.rig.shake(0.15); yield 0.07; }
      } else if (use === 'scan') {
        au && au.play('zap', { pitch: 1.6 });
      } else if (use === 'radar') {
        au && au.play('blip'); yield 0.15; au && au.play('blip', { pitch: 1.3 });
      } else if (use === 'flare') {
        au && au.play('fire_whoosh', { pitch: 1.3 });
        this.flareT = 6;
      }
      const res = this.mr.useTool(use, x, y);
      this.combo = 0;
      yield* this.playEvents(res.events);
      this.afterAction();
    }.bind(this));
  }

  afterAction() {
    this.refreshHints();
    this.busy = false;
    if (this.mr.strikes <= 0 && this.phase === 'dig') {
      this.phase = 'done';
      this.speak(this.hasTools() ? 'Out of swings… still got tools, though.' : 'That\'s all I can swing.', 2.2);
    }
  }
  hasTools() { return this.game.run.bag.all().some((it) => TOOL_IDS.includes(it.id)); }

  impact(p, power = 1) {
    const rig = this.W.rig;
    rig.shake(0.22 * power);
    rig.fovPunch(-1.5 * power);
    this.game.hitStop(0.05 * power);
    const au = this.game.audio;
    au && au.play('pick_strike', { pitch: 0.9 + rnd.next() * 0.2 });
    this.W.sparks.emit({ pos: [p.x - 0.1, p.y + 0.05, p.z + 0.12], count: 14, vel: [-0.5, 0.8, 1.2], spread: 1.4, life: [0.2, 0.5], size: 1, color: ['#fff0b0', '#ffd27a'], glow: 3, gravity: 6, drag: 1 });
  }

  breakFx(x, y, how = {}) {
    const p = this.tilePos(x, y);
    const t = this.wall.tiles[y][x];
    const o = this.objs[y][x];
    if (o.group) { this.tileRoot.remove(o.group); disposeObj(o.group); o.group = null; o.hint = null; }
    const cols = t.t === 'hard' ? [this.pal.rock[0], this.pal.rock[1], this.pal.rock[2]] : [this.pal.rock[1], this.pal.rock[2], this.pal.rock[3]];
    if (t.t === 'ore' && MATERIALS[t.mat]) cols.push(MATERIALS[t.mat].color, MATERIALS[t.mat].color);
    this.debris.spawn({ pos: [p.x, p.y, p.z + 0.1], count: 16, colors: cols, speed: 1.6, up: 2.2, life: 1.6, floor: this.floorY + 0.02, dir: [0, 0, 1.2], spread: 0.12, scale: [0.6, 1.5] });
    this.W.dust.emit({ pos: [p.x, p.y, p.z + 0.15], posSpread: 0.12, count: 14, vel: [0, 0.2, 0.4], spread: 0.35, life: [0.8, 1.8], size: [1, 2], color: shadeColor(this.pal.rock[3]), alpha: 0.7, drag: 1.5 });
    const au = this.game.audio;
    au && au.play('rock_break', { pitch: 0.9 + rnd.next() * 0.25, vol: how.chain || how.magnet ? 0.6 : 1 });
    if (how.chain) this.W.sparks.emit({ pos: [p.x, p.y, p.z + 0.2], count: 18, radial: 1.2, life: 0.35, size: 1, color: ['#ffe74a', '#ffffff', '#9a7aff'], glow: 4 });
    if (how.magnet) this.W.sparks.emit({ pos: [p.x, p.y, p.z + 0.2], count: 10, vel: [-1.5, 0, 0.5], spread: 0.4, life: 0.4, size: 1, color: ['#ff5a5a', '#9ab0ff'], glow: 3 });
  }

  /** Coroutine: resolve rule events with juice. */
  *playEvents(events) {
    const ui = this.game.ui, au = this.game.audio, run = this.game.run;
    for (const ev of events) {
      const sp = ev.x !== undefined ? this.screenOf(this.tilePos(ev.x, ev.y)) : { x: ui.w / 2, y: ui.h / 2 };
      switch (ev.type) {
        case 'crack': {
          const t = this.wall.tiles[ev.y][ev.x];
          this.makeTile(ev.x, ev.y);
          this.objs[ev.y][ev.x].shake = 0.25;
          au && au.play('hard_clang');
          ui.float('Crack!', sp.x, sp.y - 6, { color: '#c9c1b3', vy: -16, life: 0.8 });
          void t;
          yield 0.08;
          break;
        }
        case 'break': this.breakFx(ev.x, ev.y, ev.how); yield ev.how.chain || ev.how.magnet ? 0.09 : 0.05; break;
        case 'ore': case 'pocket': case 'dupe': {
          const it = ev.item;
          this.shown.add(it.uid);
          const m = matOf(it);
          const r = RARITY[m.rarity].order;
          this.combo++;
          au && au.play(ORE_SFX[r], { pitch: 1 + Math.min(10, this.combo - 1) * 0.07 });
          if (ev.type === 'dupe') ui.float('×2!', sp.x, sp.y - 14, { big: true, scale: 2, top: '#e6fbff', bottom: '#7fe3ff' });
          if (ev.type === 'pocket') { au && au.play('chest_open'); ui.float('Treasure pocket!', sp.x, sp.y - 16, { color: COLORS.gold }); }
          const p = this.tilePos(ev.x, ev.y);
          this.W.sparks.emit({ pos: [p.x, p.y, p.z + 0.2], count: 10 + r * 10, radial: [0.6, 1.4 + r * 0.4], life: [0.4, 1.0], size: 1, color: [m.color, m.color2 || '#ffffff', '#ffffff'], glow: 3 + r, gravity: 1.5, drag: 1.5 });
          this.addFlyer(it, sp.x, sp.y);
          if (r >= 2) { this.reveals.push({ item: it, t: 0 }); this.game.hitStop(0.12); this.W.rig.fovPunch(-3); }
          yield 0.14;
          break;
        }
        case 'lucky': ui.float('LUCKY!', sp.x, sp.y - 20, { big: true, scale: 2, top: '#fff6c8', bottom: '#ff8ab0' }); au && au.play('sparkle'); yield 0.1; break;
        case 'melt': {
          const p = this.tilePos(ev.x, ev.y);
          this.W.dust.emit({ pos: [p.x, p.y, p.z + 0.2], count: 24, vel: [0, 0.8, 0.2], spread: 0.3, life: [0.8, 1.6], size: [1, 2], color: '#e8f0f8', alpha: 0.6 });
          au && au.play('sizzle');
          ui.float(`${MATERIALS[ev.mat].name} melted!`, sp.x, sp.y - 10, { color: COLORS.bad });
          this.speak('Ah! Too hot for that one!', 1.6);
          yield 0.2; break;
        }
        case 'frozen': {
          const p = this.tilePos(ev.x, ev.y);
          this.W.sparks.emit({ pos: [p.x, p.y, p.z + 0.2], count: 20, radial: 0.8, life: 0.7, size: 1, color: ['#e6fbff', '#7fe3ff'], glow: 2 });
          au && au.play('ice_crack');
          ui.float('Hazard frozen!', sp.x, sp.y - 10, { color: COLORS.ice });
          yield 0.15; break;
        }
        case 'gas': {
          const p = this.tilePos(ev.x, ev.y);
          this.W.dust.emit({ pos: [p.x, p.y, p.z + 0.2], count: 40, vel: [0, 0.3, 0.6], spread: 0.5, life: [1.2, 2.4], size: [1, 3], color: ['#8fe04a', '#5a9a3a'], alpha: 0.65, drag: 0.8 });
          au && au.play('gas');
          ui.float('-1 Strike', sp.x, sp.y - 10, { color: COLORS.bad });
          this.char.setExpression('hurt');
          this.speak('*cough* *cough*', 1.4);
          yield 0.35; break;
        }
        case 'critter': {
          au && au.play('monster_growl', { pitch: 1.8 });
          ui.float('A rat! -3', sp.x, sp.y - 10, { color: COLORS.bad });
          this.hurt(ev.dmg);
          this.char.play('hurt', { loop: false });
          for (const it of this.mr.haul) if (!this.shown.has(it.uid)) { this.shown.add(it.uid); this.addFlyer(it, sp.x, sp.y); }
          yield 0.3; break;
        }
        case 'cavein': yield* this.caveIn(ev); break;
        case 'blast': case 'drill': break;
        case 'scan': {
          au && au.play('sparkle');
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const o = this.objs[ev.y + dy] && this.objs[ev.y + dy][ev.x + dx]; if (o) o.scan = 0.6; }
          yield 0.2; break;
        }
        case 'radar': ui.float('Rare ore located!', sp.x, sp.y - 12, { color: '#7aff8a' }); au && au.play('qte_success'); yield 0.2; break;
        case 'flare': ui.toast('The flare lights every clue!', { icon: 'flare' }); yield 0.1; break;
        default: break;
      }
    }
    // anything collected without its own event (safety)
    for (const it of this.mr.haul) if (!this.shown.has(it.uid)) { this.shown.add(it.uid); this.addFlyer(it, ui.w / 2, ui.h / 2); }
  }

  *caveIn(ev) {
    const au = this.game.audio, ui = this.game.ui;
    au && au.play('rumble');
    this.W.rig.shake(0.5);
    this.speak('The ceiling!!', 1.2);
    // rocks start to fall
    const p = this.tilePos(ev.x, ev.y);
    this.debris.spawn({ pos: [p.x, this.origin.y + 0.6, this.gz + 0.5], count: 26, colors: this.pal.rock.slice(1, 4), speed: 0.6, up: -1, life: 1.8, floor: this.floorY + 0.02, spread: 0.8, scale: [1, 2.2] });
    this.qte = { t: 0, win: 0.85, done: false, ok: false };
    au && au.play('qte_prompt');
    yield () => this.qte.done;
    const ok = this.qte.ok;
    this.qte = null;
    if (ok) {
      au && au.play('qte_success');
      this.char.play('dodge', { loop: false });
      ui.float('Dodged!', ui.w / 2, ui.h / 2 - 30, { big: true, scale: 2, top: '#e8ffe0', bottom: '#5fd17a' });
    } else {
      au && au.play('cave_in');
      au && au.play('hurt');
      this.W.rig.shake(0.9);
      this.game.renderer.doFlash(0.35, [1, 0.3, 0.2]);
      this.char.play('hurt', { loop: false });
      this.char.setExpression('hurt');
      ui.float(`-${ev.dmg}`, ui.w / 2, ui.h / 2 - 30, { big: true, scale: 3, top: '#ffd0c0', bottom: '#ff4d4d' });
      this.hurt(ev.dmg);
    }
    yield 0.3;
  }

  hurt(n) {
    const run = this.game.run;
    if (run.hurt(n)) { this.dead = true; this.co.start(function* () { yield 0.8; gameOver(this.game, 'Buried in a cave-in'); }.bind(this)); }
  }

  addFlyer(item, x, y) {
    const slot = this.tray.length + this.flyers.length;
    this.flyers.push({ item, x0: x, y0: y, t: 0, dur: 0.75, slot });
  }

  // ------------------------------------------------------------------ end of dig
  packUp() {
    if (this.busy || this.phase === 'shatter' || this.summary) return;
    this.phase = 'shatter';
    const au = this.game.audio, run = this.game.run;
    this.co.start(function* () {
      if (this.pickName) {
        // the curse claims the pickaxe too
        this.speak('Huh? The pick is… glowing?', 1.4);
        const hp = this.handPos();
        this.char.play('idleCombat', { loop: true });
        for (let i = 0; i < 6; i++) {
          if (this.pickMesh) crackWeapon(this.pickMesh, (i + 1) / 6);
          this.W.sparks.emit({ pos: [hp.x, hp.y, hp.z], posSpread: 0.15, count: 6, radial: 0.4, life: 0.4, size: 1, color: ['#c86bff', '#ff5af0'], glow: 4 });
          au && au.play('crack', { pitch: 1 + i * 0.08 });
          yield 0.18;
        }
        if (this.pickMesh) this.shards = shatterPieces(this.pickMesh, this.W.scene, { force: 2 });
        au && au.play('shatter');
        this.game.renderer.doFlash(0.4, [0.8, 0.4, 1]);
        this.W.rig.shake(0.5);
        this.game.hitStop(0.1);
        this.W.sparks.emit({ pos: [hp.x, hp.y, hp.z], count: 50, radial: [1, 2.6], life: [0.4, 1.0], size: [1, 2], color: ['#c86bff', '#ffffff', '#9aa3b2'], glow: 4, gravity: 4, drag: 1 });
        this.debris.spawn({ pos: [hp.x, hp.y, hp.z], count: 14, colors: ['#9aa3b2', '#5b6170', '#c86bff'], speed: 1.4, up: 2, life: 1.4, floor: this.floorY + 0.02, scale: [0.4, 0.9] });
        this.char.hold(null);
        this.char.setExpression('sad');
        this.speak(bark(run.char, 'shatter'), 2);
        run.stats.shattered = (run.stats.shattered || 0) + 1;
        save.data.stats.weaponsShattered++; save.write();
        yield 1.2;
        this.equipPick(['junk']);
        this.char.play('idle', { loop: true });
        this.char.setExpression('neutral');
      }
      this.summary = true;
      if (this.tray.length) { this.char.play('cheer', { loop: false }); au && au.play('coins'); }
    }.bind(this));
  }

  collect() {
    const game = this.game, run = game.run;
    const items = this.mr ? this.mr.haul : [];
    for (const it of items) run.bag.toOverflow(it);
    run.stats.mined += items.length;
    save.data.stats.oresMined += items.length; save.write();
    this.summary = false;
    if (items.length) openBag(game, { title: 'Your Haul', onClose: () => finish(game) });
    else finish(game);
  }

  // ------------------------------------------------------------------ frame
  screenOf(v) { return this.W.rig.project(v, this.game.ui.w, this.game.ui.h); }

  update(dt) {
    const t = this.time;
    this.W.rig.update(dt);
    this.set.update && this.set.update(dt, t);
    this.char.update(dt);
    this.W.sparks.update(dt);
    this.W.dust.update(dt);
    this.debris.update(dt);
    if (this.shards) updateShards(this.shards, dt, this.floorY + 0.02);
    this.forge && this.forge.update(dt);
    if (this.say && !this.forge) { this.say.t -= dt; if (this.say.t <= 0) this.say = null; }
    // tile wobble
    for (let y = 0; y < MINE_H; y++) for (let x = 0; x < MINE_W; x++) {
      const o = this.objs[y][x];
      if (o.group && o.shake > 0) { o.shake -= dt; o.group.position.x = o.base.x + Math.sin(t * 90) * 0.012 * (o.shake / 0.25); }
      else if (o.group && o.base) o.group.position.x = o.base.x;
      if (o.scan > 0) o.scan -= dt;
    }
    // glints for rare ores / pockets
    const reveal = (this.pick.reveal || this.flareT > 0);
    if (Math.random() < 0.35) {
      const x = rnd.int(0, MINE_W - 1), y = rnd.int(0, MINE_H - 1);
      const tl = this.wall.tiles[y][x];
      if (!tl.broken && tl.glint > 0 && Math.random() < 0.3 + tl.glint * 0.2) {
        const p = this.tilePos(x, y);
        const col = reveal ? RARITY[['common', 'uncommon', 'rare', 'epic', 'legendary'][tl.t === 'pocket' ? 2 : tl.glint]].color : '#fff6e0';
        this.W.sparks.emit({ pos: [p.x + rnd.float(-0.12, 0.12), p.y + rnd.float(-0.12, 0.12), this.gz + 0.06], count: 1, life: 0.5, size: 2, sizeEnd: 1, color: col, glow: 5 });
      }
    }
    // flare light
    if (this.flareT > 0) {
      this.flareT -= dt;
      this.flareLight.intensity = 9 * clamp(this.flareT / 1.5, 0, 1) * (0.85 + Math.random() * 0.15);
    } else this.flareLight.intensity = 0;
    this.lantern.intensity = 5 * (0.92 + Math.sin(t * 7) * 0.04 + Math.random() * 0.04);
    // flyers → tray
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      if (f.t >= f.dur) { this.flyers.splice(i, 1); this.tray.push(f.item); this.game.audio && this.game.audio.play('card_place', { vol: 0.5 }); }
    }
    for (const r of this.reveals) r.t += dt;
    this.reveals = this.reveals.filter((r) => r.t < 1.3);
    // QTE
    if (this.qte && !this.qte.done) {
      this.qte.t += dt;
      const inp = this.game.input;
      if (inp.actionPressed('strike') || inp.pressed) { this.qte.done = true; this.qte.ok = this.qte.t <= this.qte.win; inp.consume(); }
      else if (this.qte.t > this.qte.win) { this.qte.done = true; this.qte.ok = false; }
    }
    // camera breathing toward hovered column
    if (this.phase === 'dig' || this.phase === 'done') {
      const hx = this.hover ? (this.hover.x - 3) * 0.04 : 0;
      this.W.rig.aim([this.camHome.pos[0] + hx, this.camHome.pos[1], this.camHome.pos[2]], [this.camHome.look[0] + hx, this.camHome.look[1], this.camHome.look[2]], this.camHome.fov, 2.5);
    }
  }

  tileRect(x, y) {
    const a = this.screenOf(new THREE.Vector3(this.origin.x + x * TILE, this.origin.y - y * TILE, this.gz + 0.03));
    const b = this.screenOf(new THREE.Vector3(this.origin.x + (x + 1) * TILE, this.origin.y - (y + 1) * TILE, this.gz + 0.03));
    return { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(b.x - a.x), h: Math.round(b.y - a.y) };
  }

  draw(ui) {
    const game = this.game, run = game.run, inp = game.input;
    const h = hud(ui, game);
    if (h.bagClicked && !this.busy && this.phase !== 'forging' && !this.summary) openBag(game, { title: 'Backpack' });

    // ---- tile overlays (clue helpers, exposed brackets, reveals)
    const digging = this.phase === 'dig' || this.phase === 'done';
    this.hover = null;
    const blockedByUI = ui.overUI() || game.overlays.length || this.forge || this.qte || this.summary || this.tip;
    const seeHaz = this.pick.seehaz || this.flareT > 0;
    const ctx = ui.ctx;
    for (let y = 0; y < MINE_H; y++) for (let x = 0; x < MINE_W; x++) {
      const t = this.wall.tiles[y][x];
      if (t.broken) continue;
      const r = this.tileRect(x, y);
      const exp = this.exposed(x, y);
      const inside = inp.x >= r.x && inp.y >= r.y && inp.x < r.x + r.w && inp.y < r.y + r.h;
      if (inside && !blockedByUI) this.hover = { x, y, r };
      if (t.revealed && t.t === 'ore') ui.img(materialSprite(t.mat, 16), r.x + r.w / 2 - 8, r.y + r.h / 2 - 8, { alpha: 0.75 });
      if ((t.revealed || seeHaz) && t.t === 'hazard') ui.icon('cross', r.x + r.w / 2 - 3, r.y + r.h / 2 - 3, { alpha: 0.85 });
      if (t.marked) ring(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.42 + Math.sin(this.time * 6) * 1.5, '#7aff8a', 1, 0.9);
      const o = this.objs[y][x];
      if (o.scan > 0) ui.rect(r.x + 1, r.y + Math.round((1 - o.scan / 0.6) * r.h), r.w - 2, 1, '#7affc8', 0.8);
      if (digging && exp && this.mr && this.mr.strikes > 0) {
        const a = 0.35 + Math.sin(this.time * 4 + x + y) * 0.15;
        corners(ctx, r, '#ffe08a', a, 2);
      }
    }
    const hv = this.hover;
    if (hv) {
      const t = this.wall.tiles[hv.y][hv.x];
      const exp = this.exposed(hv.x, hv.y);
      const toolTarget = this.tool && TARGETED[TOOL_USE[this.tool.id]];
      if (digging && (exp || (toolTarget && TOOL_USE[this.tool.id] === 'scan'))) {
        corners(ctx, hv.r, this.tool ? '#7affc8' : '#ffffff', 1, 3);
        ui.cursor = 'hand';
        if (this.tool && TOOL_USE[this.tool.id] === 'blast') { const big = { x: hv.r.x - hv.r.w, y: hv.r.y - hv.r.h, w: hv.r.w * 3, h: hv.r.h * 3 }; corners(ctx, big, '#ff8a3a', 0.8, 3); }
        if (this.tool && TOOL_USE[this.tool.id] === 'drill') { const col = { x: hv.r.x, y: hv.r.y, w: hv.r.w, h: hv.r.h * Math.min(4, MINE_H - hv.y) }; corners(ctx, col, '#ffe08a', 0.8, 3); }
      }
      ui.tooltip(this.clueText(t, exp));
      if (inp.pressed && !inp.consumed && digging && !this.busy) {
        if (this.tool) { if (exp || TOOL_USE[this.tool.id] === 'scan') { inp.consume(); this.useTool(this.tool, hv.x, hv.y); } }
        else if (exp && this.mr.strikes > 0) { inp.consume(); this.strikeTile(hv.x, hv.y); }
        else if (!exp) { game.audio && game.audio.play('deny'); ui.float('Dig down to it first!', inp.x, inp.y - 8, { color: COLORS.dim, life: 0.8 }); }
      }
    }
    if (inp.rpressed || inp.actionPressed('back')) this.tool = null;

    // ---- speech bubble
    if (this.say && !this.forge) {
      const hp = this.screenOf(this.char.headPos ? this.char.headPos() : this.char.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)));
      speech(ui, hp.x, hp.y - 4, this.say.text, { maxW: 110, alpha: Math.min(1, this.say.t * 3) });
    }

    if (!this.forge) { this.drawStrikes(ui); this.drawTools(ui); }
    this.drawTray(ui);
    this.drawFlyers(ui);
    this.drawReveals(ui);

    // ---- phase panels
    if (this.phase === 'prep') this.drawPrep(ui);
    if (this.phase === 'dig' && this.mr) {
      if (ui.button('mine-leave', ui.w - 84, ui.h - 24, 80, 20, 'Pack Up', { style: 'stone', icon: 'bag', tip: 'Stop digging and keep what you found. Remaining strikes are lost.' })) this.packUp();
    }
    if (this.phase === 'done' && !this.busy) {
      const pulse = Math.sin(this.time * 5) > 0;
      if (ui.button('mine-pack', ui.w - 94, ui.h - 26, 90, 22, 'Pack Up', { style: pulse ? 'gold' : 'wood', icon: 'bag' })) this.packUp();
      ui.text('{gold}Out of strikes!{/}', ui.w / 2, ui.h - 74, { align: 'center', outline: '#140c10' });
    }
    if (this.tool) ui.text(`{#7affc8}Click a tile to use ${MATERIALS[this.tool.id].name}{/} {dim}(right-click to cancel){/}`, ui.w / 2, 40, { align: 'center', outline: '#140c10' });
    if (this.forge) this.forge.draw(ui);
    if (this.qte) this.drawQte(ui);
    if (this.tip && (this.phase === 'prep' || this.phase === 'dig')) this.drawTip(ui);
    if (this.summary) this.drawSummary(ui);
  }

  clueText(t, exp) {
    const lines = [];
    const veinDirs = Object.entries(t.veins || {});
    if (t.t === 'hard') lines.push(t.hits ? '{warn}Cracked hard rock: one more hit!{/}' : 'Hard rock: takes {warn}2 strikes{/}.');
    for (const [dir, col] of veinDirs) lines.push(`{${col}}•••{/} vein: ore lies {gold}${dir === 'up' ? 'above' : dir === 'down' ? 'below' : 'to the ' + dir}{/}.`);
    if (t.crack) lines.push('{bad}Hairline cracks{/}: a hazard is next to this.');
    if (t.glint) lines.push(this.pick.reveal || this.flareT > 0 ? `{${RARITY[['common', 'uncommon', 'rare', 'epic', 'legendary'][Math.min(4, t.glint)]].color}}Glinting{/}: something precious inside!` : '{white}It glints{/}: something rare inside!');
    if (t.t === 'ore' && exp && MATERIALS[t.mat] && (t.revealed || this.flareT > 0)) lines.push(`Ore: {${MATERIALS[t.mat].rarity}}${MATERIALS[t.mat].name}{/}`);
    else if (t.t === 'ore' && exp) lines.push('{gold}Ore pokes out of the rock!{/}');
    if (t.revealed && t.t === 'hazard') lines.push('{bad}Hazard!{/}');
    if (!lines.length) lines.push('Plain rock.');
    lines.push(exp ? (this.phase === 'dig' ? '{good}Click to strike.{/}' : '{dim}Exposed — strikable.{/}') : '{dim}Not reachable yet: dig next to it.{/}');
    return { title: t.t === 'hard' ? 'Hard Rock' : 'Rock', body: lines.join('\n'), w: 170 };
  }

  drawStrikes(ui) {
    if (this.phase === 'intro') return;
    const total = 3 + (this.pick.strikes || 0);
    const left = this.mr ? this.mr.strikes : total;
    const w = total * 11 + 54;
    const x = Math.round(ui.w / 2 - w / 2), y = ui.h - 52;
    ui.panel('leather', x, y, w, 20, { stitch: false, rivets: false, tone: 'dark' });
    ui.text('Strikes', x + 6, y + 6, { color: COLORS.white, outline: '#140c10', outlineShadow: false });
    for (let i = 0; i < total; i++) ui.icon('pickaxe', x + 46 + i * 11, y + 5, { alpha: i < left ? 1 : 0.25 });
    if (this.pickName) ui.text(`{gold}${this.pickName}{/}`, ui.w / 2, y - 11, { align: 'center', outline: '#140c10', outlineShadow: false });
  }

  drawTools(ui) {
    if (this.phase === 'intro' || this.summary) return;
    const tools = this.game.run.bag.all().filter((it) => TOOL_IDS.includes(it.id));
    if (!tools.length) return;
    const cell = 22;
    const x0 = Math.round(ui.w / 2 - (tools.length * (cell + 4)) / 2), y = ui.h - 28;
    tools.forEach((it, i) => {
      const x = x0 + i * (cell + 4);
      const sel = this.tool === it;
      ui.panel('slot', x, y, cell, cell, { tone: 'dark', glow: sel ? '#7affc8' : '' });
      const spr = itemSprite(it.id, 11, 0);
      ui.img(spr, x + Math.round((cell - spr.width) / 2), y + Math.round((cell - spr.height) / 2) - (sel ? 1 : 0));
      const hh = ui.hit('mtool' + it.uid, x, y, cell, cell);
      if (hh.hover) ui.tooltip(itemTooltip(it));
      if (hh.clicked && (this.phase === 'dig' || this.phase === 'done') && !this.busy) {
        const use = TOOL_USE[it.id];
        if (!TARGETED[use]) this.useTool(it, 0, 0);
        else this.tool = sel ? null : it;
        this.game.audio && this.game.audio.play('click');
      } else if (hh.clicked && (this.phase === 'prep' || this.phase === 'intro')) ui.toast('Start digging first.', { icon: 'pickaxe' });
    });
    ui.text('Tools {dim}(free){/}', x0 - 4, y + 7, { align: 'right', outline: '#140c10', outlineShadow: false });
  }

  drawTray(ui) {
    if (this.phase === 'intro') return;
    const cols = 4, cell = 22;
    const n = Math.max(1, this.tray.length + this.flyers.length);
    const rows = Math.max(2, Math.ceil(n / cols));
    const w = cols * cell + 12, hgt = rows * cell + 22;
    const x = ui.w - w - 4, y = 26;
    this.trayBox = { x, y, w, h: hgt, cell, cols };
    ui.panel('wood', x, y, w, hgt, { tone: 'dark', nails: false });
    ui.text(`Haul {gold}${this.tray.length}{/}`, x + 6, y + 6, { outline: '#140c10', outlineShadow: false });
    this.tray.forEach((it, i) => {
      const cx = x + 6 + (i % cols) * cell, cy = y + 18 + Math.floor(i / cols) * cell;
      ui.img(materialSprite(it.id, 20), cx + 1, cy + 1);
      const hh = ui.hit('mtray' + it.uid, cx, cy, cell, cell, { cursor: 'arrow', sound: false });
      if (hh.hover) ui.tooltip(itemTooltip(it));
    });
  }

  drawFlyers(ui) {
    if (!this.trayBox) return;
    const B = this.trayBox;
    for (const f of this.flyers) {
      const k = f.t / f.dur;
      const tx = B.x + 6 + (f.slot % B.cols) * B.cell + 1, ty = B.y + 18 + Math.floor(f.slot / B.cols) * B.cell + 1;
      // pop up first, then arc into the tray
      const pop = Math.min(1, k / 0.3);
      const fly = ease.inOutCubic(clamp((k - 0.3) / 0.7, 0, 1));
      const x = f.x0 + (tx - f.x0) * fly;
      const y = f.y0 - 18 * ease.outBack(pop) * (1 - fly) + (ty - f.y0) * fly - Math.sin(fly * Math.PI) * 30;
      const s = fly < 1 ? 1 : 1;
      const spr = materialSprite(f.item.id, 24);
      if (k < 0.3) { const r = RARITY[matOf(f.item).rarity]; ring(ui.ctx, x + 12, y + 12, 6 + pop * 8, r.color, 1, 1 - pop); }
      ui.img(spr, Math.round(x - 2), Math.round(y - 2), { scale: s });
      if (rnd.chance(0.5)) ui.burst(x + 12, y + 12, 1, { colors: [matOf(f.item).color, '#ffffff'], speed: 15, gravity: 20, life: 0.4, kind: 'star' });
    }
  }

  drawReveals(ui) {
    const r = this.reveals[0];
    if (!r) return;
    const k = r.t / 1.3;
    const m = matOf(r.item);
    const R = RARITY[m.rarity];
    const cx = ui.w / 2, cy = ui.h / 2 - 20;
    const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
    const ctx = ui.ctx;
    // pixel sun rays
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = R.color;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + r.t * 0.8;
      for (let d = 30; d < 70; d += 3) ctx.fillRect(Math.round(cx + Math.cos(ang) * d), Math.round(cy + Math.sin(ang) * d), 2, 2);
    }
    ctx.globalAlpha = 1;
    const card = materialCard(r.item);
    const s = 2;
    ui.img(card, cx - (card.width * s) / 2, cy - (card.height * s) / 2 + (1 - ease.outBack(Math.min(1, k * 5))) * 20, { scale: s, alpha: a });
    ui.ctx.globalAlpha = a;
    ui.text(`${R.name.toUpperCase()}!`, cx, cy + 72, { align: 'center', color: R.color, outline: '#140c10', thick: true });
    ui.ctx.globalAlpha = 1;
  }

  drawPrep(ui) {
    const w = 226, h = 96;
    const tb = this.trayBox;
    const x = ui.w - w - 4, y = tb ? tb.y + tb.h + 6 : 100;
    ui.panel('parchment', x, y, w, h, { seed: 4 });
    ui.text('Mining Spot', x + w / 2, y + 8, { align: 'center', color: '#3a2618' });
    const effs = Object.entries(this.pick).filter(([k, v]) => v && PICK_TEXT[k]).map(([k, v]) => inkify(PICK_TEXT[k](v)));
    if (this.pickName) {
      ui.text(`{#7a3a10}${this.pickName}{/}`, x + 12, y + 22, { color: '#3a2618' });
      ui.text(effs.join(' · ') || 'Sturdy.', x + 12, y + 33, { color: '#4a3220', maxW: w - 24, font: 'body' });
    } else {
      ui.text('Your trusty old pick: {#7a3a10}3 strikes{/}.\nForge a pickaxe from ore for more strikes\nand wild effects. It will shatter after.', x + 12, y + 22, { color: '#4a3220', maxW: w - 24 });
    }
    const canForge = !this.pickName && this.game.run.bag.all().some((it) => matOf(it).pick && Object.keys(matOf(it).pick).length);
    if (ui.button('mine-forge', x + 12, y + h - 28, 100, 20, 'Forge Pickaxe', { style: 'iron', icon: 'hammer', disabled: !canForge, tip: this.pickName ? 'Already forged.' : canForge ? 'Spend materials on a pickaxe.' : 'No materials with pickaxe effects.' })) this.openPickForge();
    if (ui.button('mine-start', x + w - 112, y + h - 28, 100, 20, 'Start Digging', { style: 'gold', icon: 'pickaxe' }) || this.game.input.actionPressed('confirm')) this.startDig();
  }

  drawQte(ui) {
    const q = this.qte;
    dim(ui, 0.25);
    const cx = ui.w / 2, cy = ui.h / 2 - 10;
    const k = clamp(q.t / q.win, 0, 1);
    ui.big('DODGE!', cx, cy - 26, { scale: 3, top: '#fff0d0', bottom: '#ff8a3a' });
    prompt(ui, cx - 30, cy, 'SPACE', 'or click!', this.time, { mouse: 'mouseL' });
    ui.panel('slot', cx - 50, cy + 18, 100, 7, { tone: 'dark' });
    ui.rect(cx - 49, cy + 19, Math.round(98 * (1 - k)), 5, k > 0.7 ? '#ff5d5d' : '#ffe08a');
  }

  drawTip(ui) {
    const w = 250, h = 104, x = Math.round(ui.w / 2 - w / 2), y = 40;
    ui.panel('parchment', x, y, w, h, { seed: 9 });
    ui.text('How to dig', x + w / 2, y + 8, { align: 'center', color: '#3a2618' });
    ui.text('• Strike the {#7a3a10}top row{/}, then tiles next to holes.\n• {#7a3a10}Colored veins{/} point toward hidden ore.\n• {#7a3a10}Glints{/} mean something rare. Deeper = better.\n• {#a02020}Cracks{/} warn of hazards. Dark blocky rock\n  takes 2 strikes.', x + 10, y + 21, { color: '#4a3220', maxW: w - 20 });
    if (ui.button('mine-tip', x + w - 64, y + h - 22, 56, 16, 'Got it', { style: 'wood', font: 'small' })) { this.tip = false; save.data.seen.tips.mining = true; save.write(); }
  }

  drawSummary(ui) {
    dim(ui, 0.55);
    const items = this.mr ? this.mr.haul : [];
    const per = Math.min(items.length, 8);
    const w = Math.max(200, per * 52 + 24), h = items.length > 8 ? 190 : 124;
    const x = Math.round(ui.w / 2 - w / 2), y = Math.round(ui.h / 2 - h / 2);
    ui.panel('leather', x, y, w, h);
    ui.text(items.length ? 'Your Haul' : 'Nothing but dust…', x + w / 2, y + 10, { align: 'center', color: COLORS.gold, outline: '#140c10', outlineShadow: false });
    items.forEach((it, i) => {
      const cx = x + 12 + (i % 8) * 52, cy = y + 26 + Math.floor(i / 8) * 68;
      if (Math.floor(i / 8) > 1) return;
      const hh = ui.hit('msum' + it.uid, cx, cy, 48, 64, { sound: false });
      drawCard(ui, materialCard(it), cx, cy, { hover: hh.hover });
      if (hh.hover) ui.tooltip(itemTooltip(it));
    });
    if (ui.button('mine-collect', x + w / 2 - 50, y + h - 28, 100, 20, items.length ? 'Pack it up' : 'Move on', { style: 'gold', icon: 'bag' }) || this.game.input.actionPressed('confirm')) this.collect();
  }
}

// bright UI colors are unreadable on parchment: swap them for ink tones
const INK = { good: '#2a6a1a', shock: '#7a5a00', gold: '#8a4a00', fire: '#a83a0a', ice: '#1a5a8a', curse: '#6a2a90', warn: '#8a4a00', bad: '#a01818' };
function inkify(str) { return str.replace(/\{(good|shock|gold|fire|ice|curse|warn|bad)\}/g, (m, k) => `{${INK[k]}}`); }

function corners(ctx, r, color, alpha = 1, len = 3) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const { x, y, w, h } = r;
  ctx.fillRect(x, y, len, 1); ctx.fillRect(x, y, 1, len);
  ctx.fillRect(x + w - len, y, len, 1); ctx.fillRect(x + w - 1, y, 1, len);
  ctx.fillRect(x, y + h - 1, len, 1); ctx.fillRect(x, y + h - len, 1, len);
  ctx.fillRect(x + w - len, y + h - 1, len, 1); ctx.fillRect(x + w - 1, y + h - len, 1, len);
  ctx.globalAlpha = 1;
}
function hashJit(x, y) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }
function shadeColor(hex) { return hex; }
function disposeObj(o) {
  o.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
  });
}
