// The dungeon: a floor of Isaac-style rooms seen through the Hades camera. Walk into a room, the
// doors slam, foes pour in, fight; the last one falls, the doors grind open and the room pays out.
// Monsters your stone axe kills are left as statues glinting with ore: walk up and mine them (the
// camera zooms into the rock). Special rooms: ore veins, treasure (a pedestal or an old chest), a
// workbench (crafting), a shrine (a choice, told in floating dialogue), secret rooms, and the boss
// room; beating the boss opens a hole down to the next floor. A minimap sits top-right (M = big
// map), the HUD bottom-left/right, Tab opens the bag.
//
// Params: { stage, char, seed, newFloor, goto: room type to start in (dev), fresh }.
// Dev: ?scene=dungeon&char=durgan&stage=0[&goto=boss|craft|vein|treasure|shrine]
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import * as Action from '../action/index.js';
import * as Enemies from '../action/enemies/index.js';
import * as Rooms from '../models/room_vox.js';
import * as Monsters from '../models/monsters.js';
import * as Pet from '../models/pet.js';
import * as Floors from '../systems/floorgen.js';
import * as Loot from '../systems/loot.js';
import * as Loadout from '../systems/loadout.js';
import * as RunMod from '../systems/run.js';
import * as Regions from '../data/regions.js';
import * as Events from '../data/events.js';
import * as Cut from './cutscene.js';
import { MONSTERS } from '../data/monsters.js';
import { MATERIALS } from '../data/materials.js';
import { makeItem } from '../systems/items.js';
import { RNG, fx as rnd } from '../core/rng.js';
import { clamp, ease } from '../core/math.js';
import { drawActionHud, makeHudState, hudToast } from '../ui/hud_action.js';
import { drawMinimap, drawBigMap } from './dungeon/minimap.js';
import { Pickups, rarityOf, rarityColor } from './dungeon/pickups.js';
import * as Flow from './flow.js';

const DIRS = { n: { x: 0, z: -1, opp: 's' }, s: { x: 0, z: 1, opp: 'n' }, e: { x: 1, z: 0, opp: 'w' }, w: { x: -1, z: 0, opp: 'e' } };
const FIGHT_TYPES = new Set(['fight', 'boss', 'elite', 'monster']);
const STAGE_MUSIC = ['delve0', 'delve1', 'delve2', 'delve3'];
const v3 = new THREE.Vector3();

const has = (o, k) => o && typeof o[k] === 'function';
const roomsOf = (floor) => (floor.rooms instanceof Map ? [...floor.rooms.values()] : Object.values(floor.rooms || {}));
const roomOf = (floor, id) => (floor.rooms instanceof Map ? floor.rooms.get(id) : floor.rooms[id]);
export function stageDef(i) {
  const L = Regions.STAGES || Regions.ACTS || Regions.REGIONS || [];
  return L[Math.max(0, Math.min(L.length - 1, i | 0))] || { name: 'The Dungeon' };
}

/** The live monster model behind an enemy (N's Enemy may keep it under a few names). */
function monsterOf(e) {
  for (const k of ['monster', 'mon', 'vis', 'model']) if (e && e[k] && (has(e[k], 'setStone') || e[k].group)) return e[k];
  return null;
}
function groupOf(m) { return m ? (m.isObject3D ? m : m.group) : null; }

export class DungeonScene extends Scene {
  enter(params = {}) {
    const game = this.game;
    this.params = params;
    if (!game.run || params.fresh) {
      const R = RunMod.Run;
      game.run = R ? new R(params.char || 'durgan', params.seed || String(Date.now())) : null;
    }
    const run = this.run = game.run;
    this.stage = +(params.stage ?? run.stage ?? 0) || 0;
    if (run.stage !== undefined) run.stage = this.stage;
    // ---- the floor (kept on the run so overlays/flow can read it)
    const dg = run.dungeon;
    if (!dg || dg.stage !== this.stage || params.newFloor) {
      const rng = run.rng && run.rng.fork ? run.rng.fork('floor' + this.stage + '|' + (run.floorN || 0)) : new RNG('floor' + this.stage);
      run.dungeon = { stage: this.stage, floor: Floors.generateFloor(rng, this.stage), rooms: {}, cur: null };
    }
    this.dg = run.dungeon;
    this.floor = this.dg.floor;
    this.sdef = stageDef(this.stage);
    // ---- 3D world shared by every room
    this.scene3 = new THREE.Scene();
    this.cam = new Action.HadesCam({ fov: 30 });
    this.world = { scene: this.scene3, camera: this.cam.camera, post: { bloom: 0.7, threshold: 0.8, vignette: 0.42, outline: 0.55, edge: 0.3, saturation: 1.12, contrast: 1.05 } };
    this.pickups = new Pickups(this.scene3);
    this.hud = makeHudState();
    this.cache = new Map();   // room id → built Room (LRU)
    this.aw = null;
    this.player = null;
    this.trans = null;
    this.fade = 1;
    this.mapOpen = 0;
    this.mapHeld = false;
    this.inter = [];
    this.statues = [];
    this.shards = [];
    this.waves = null;
    this.boss = null;
    this.deadT = 0;
    this.banner = null;
    this.prebuildQ = [];
    this.loadout = this.computeLoadout();
    // ---- start room (dev: ?goto=<type>)
    let start = this.dg.cur ?? this.floor.startId;
    if (params.goto) { const r = roomsOf(this.floor).find((x) => x.type === params.goto); if (r) start = r.id; }
    this.enterRoom(start, null);
    if (game.audio) { game.audio.music(this.sdef.music || STAGE_MUSIC[this.stage] || 'delve0'); this.amb = game.audio.loop && game.audio.loop('cave', 0.35); }
    this.banner = { text: this.sdef.name || 'The Dungeon', sub: `Floor ${this.stage + 1}`, t: 0 };
  }
  exit() {
    this.amb && this.amb.stop && this.amb.stop(1);
    this.pickups.dispose();
    for (const r of this.cache.values()) { try { r.dispose && r.dispose(); } catch (e) { /* placeholder */ } }
    this.cache.clear();
  }

  // ================================================================== loadout & player
  computeLoadout() {
    try { return Loadout.computeLoadout(this.run); } catch (e) { return { weapon: this.run.weapon, skills: this.run.skills || [null, null], stats: {} }; }
  }
  /** After the bag or crafting changed: recompute and hand the new build to the player. */
  refreshLoadout() {
    this.loadout = this.computeLoadout();
    const p = this.player;
    if (p) {
      if (has(p, 'setLoadout')) p.setLoadout(this.loadout); else p.loadout = this.loadout;
      const mh = (this.run.maxHp || p.maxHp) + ((this.loadout.stats && this.loadout.stats.maxHp) || 0);
      if (mh && !has(p, 'setLoadout')) p.maxHp = mh;
    }
    this.pickups.unrefuse();
  }
  makePlayer(aw, x, z, facing) {
    const run = this.run;
    let p = null;
    try { p = new Action.Player(aw, run.char, this.loadout); } catch (e) { console.error(e); p = null; }
    if (!p) return null;
    p.x = x; p.z = z;
    if (facing !== undefined) p.facing = facing;
    if (run.hp !== undefined) p.hp = Math.min(run.hp, p.maxHp || run.hp);
    if (!aw.player) aw.player = p;
    if (p.model && !p.model.parent) this.scene3.add(p.model);
    if (has(p, 'sync')) p.sync();
    return p;
  }
  /** Keep run.hp in step with the player. */
  syncHp() { if (this.player && this.run) { this.run.hp = Math.max(0, Math.round(this.player.hp)); if (this.player.maxHp) this.run.maxHpNow = this.player.maxHp; } }

  // ================================================================== rooms
  roomState(id) { return this.dg.rooms[id] || (this.dg.rooms[id] = { pickups: [], statues: [], veins: [], chest: false, pedestal: false, shrine: false, bench: false, hole: false }); }
  doorsOf(r) {
    const out = {};
    for (const d of ['n', 'e', 's', 'w']) {
      const nid = r.doors ? r.doors[d] : null;
      if (nid === null || nid === undefined) { out[d] = false; continue; }
      const nb = roomOf(this.floor, nid);
      out[d] = !nb ? false : nb.type === 'boss' || r.type === 'boss' ? 'boss' : nb.type === 'secret' || r.type === 'secret' ? 'secret' : 'open';
    }
    return out;
  }
  getRoom(r) {
    let b = this.cache.get(r.id);
    if (b) { this.cache.delete(r.id); this.cache.set(r.id, b); return b; }
    const size = r.size || (r.type === 'boss' ? 'boss' : 'normal');
    try { b = Rooms.buildRoom(this.stage, r, { seed: r.seed, type: r.type, doors: this.doorsOf(r), size }); } catch (e) { console.error('buildRoom failed', e); b = null; }
    if (!b) b = Rooms.buildRoom.length ? null : null;
    this.cache.set(r.id, b);
    while (this.cache.size > 5) {
      const [k, old] = this.cache.entries().next().value;
      if (k === this.curId) break;
      this.cache.delete(k);
      try { old && old.group && old.group.parent && old.group.parent.remove(old.group); old && old.dispose && old.dispose(); } catch (e) { /* ignore */ }
    }
    return b;
  }
  /** Build neighbours in quiet moments so the next door opens instantly. */
  queuePrebuild(r) {
    for (const d of ['n', 'e', 's', 'w']) {
      const nid = r.doors && r.doors[d];
      if (nid === null || nid === undefined || this.cache.has(nid)) continue;
      const nb = roomOf(this.floor, nid);
      if (nb && !this.prebuildQ.includes(nb)) this.prebuildQ.push(nb);
    }
  }
  pumpPrebuild(dt) {
    if (!this.prebuildQ.length || this.trans || this.inFight()) return;
    this.prebuildT = (this.prebuildT || 0) + dt;
    if (this.prebuildT < 0.6) return;
    this.prebuildT = 0;
    const nb = this.prebuildQ.shift();
    if (this.cache.has(nb.id)) return;
    const b = this.getRoom(nb);
    if (b && b.group && b.group.parent) b.group.parent.remove(b.group);
  }

  enterRoom(id, fromDir) {
    const game = this.game, run = this.run;
    const r = roomOf(this.floor, id);
    if (!r) return;
    // ---- leave the old room
    if (this.curRoom) {
      this.roomState(this.curId).pickups = this.pickups.stash();
      this.syncHp();
      this.clearRoomObjects();
      if (this.built && this.built.group) this.scene3.remove(this.built.group);
    }
    this.curId = id; this.curRoom = r; this.dg.cur = id;
    const firstVisit = !r.visited;
    r.visited = true; r.known = true;
    for (const d of ['n', 'e', 's', 'w']) { const nb = r.doors && r.doors[d] != null ? roomOf(this.floor, r.doors[d]) : null; if (nb && nb.type !== 'secret') nb.known = true; }
    const b = this.built = this.getRoom(r);
    if (b && b.group) this.scene3.add(b.group);
    this.scene3.fog = (b && b.fog) || new THREE.FogExp2(0x0b0d0a, 0.02);
    this.scene3.background = (b && (b.bg || (b.background && b.background.isColor ? b.background : null))) || new THREE.Color(0x07080a);
    if (b && has(b, 'setCamera')) b.setCamera(this.cam.camera);
    // ---- the action world for this room
    try { this.aw = new Action.ActionWorld(game, { room: b, scene: this.scene3, cam: this.cam }); } catch (e) { console.error(e); this.aw = null; }
    const aw = this.aw;
    // entry point: just inside the door we came through (or the room centre)
    let px = 0, pz = 0, facing;
    if (fromDir && b && b.doors && b.doors[DIRS[fromDir].opp]) {
      const d = b.doors[DIRS[fromDir].opp];
      px = d.x - DIRS[DIRS[fromDir].opp].x * 1.3; pz = d.z - DIRS[DIRS[fromDir].opp].z * 1.3;
      facing = Math.atan2(DIRS[fromDir].x, DIRS[fromDir].z);
    } else if (b && b.anchors && b.anchors.start) { px = b.anchors.start.x; pz = b.anchors.start.z; }
    else if (b && b.bounds) { pz = Math.min(2, b.bounds.z1 - 1.5); }
    this.player = aw ? this.makePlayer(aw, px, pz, facing) : null;
    if (this.player) this.player.dashCharges = this.player.dashCharges ?? 2;
    if (aw) this.bindWorld(aw);
    if (has(this.cam, 'setBounds') && b && b.bounds) this.cam.setBounds(b.bounds);
    if (has(this.cam, 'follow') && this.player) this.cam.follow(this.player);
    this.settleCamera();
    // ---- the room's contents
    const st = this.roomState(id);
    this.pickups.restore(st.pickups); st.pickups = [];
    this.restoreStatues(st);
    this.setupInteractables(r, st);
    this.spawnPet();
    // ---- fight?
    this.waves = null; this.boss = null;
    const fight = FIGHT_TYPES.has(r.type) && !r.cleared;
    if (fight) this.startFight(r, firstVisit);
    else { this.setDoors(1, 0); if (!r.cleared) this.onClear(r, true); }
    this.queuePrebuild(r);
    this.roomEnterT = 0;
  }
  clearRoomObjects() {
    for (const s of this.statues) { const g = groupOf(s.model); if (g && g.parent) g.parent.remove(g); }
    for (const sh of this.shards) { try { sh.dispose && sh.dispose(); } catch (e) { /* ignore */ } }
    this.statues = []; this.shards = []; this.inter = [];
    if (this.pet && this.pet.group && this.pet.group.parent) this.pet.group.parent.remove(this.pet.group);
    if (this.aw) {
      for (const e of this.aw.enemies || []) { const g = groupOf(e.model) || groupOf(monsterOf(e)); if (g && g.parent) g.parent.remove(g); }
      if (this.player && this.player.model && this.player.model.parent) this.player.model.parent.remove(this.player.model);
      for (const o of this.aw.extra || []) if (o.parent) o.parent.remove(o);
      try { has(this.aw, 'dispose') && this.aw.dispose(); } catch (e) { /* ignore */ }
    }
    for (const o of this.props || []) if (o.parent) o.parent.remove(o);
    this.props = [];
  }
  /** Doors: k = 1 open, 0 shut (animated over dur seconds). */
  setDoors(k, dur = 0.5) {
    const b = this.built;
    if (!b || !b.doors) return;
    this.doorAnim = { from: this.doorK ?? (k ? 0 : 1), to: k, t: 0, dur: Math.max(0.001, dur) };
    if (dur <= 0) { this.doorK = k; for (const d of Object.values(b.doors)) if (d && has(d, 'setOpen')) d.setOpen(k); this.doorAnim = null; }
    if (k === 0 && dur > 0) this.game.audio && this.game.audio.play('door_slam', { vol: 0.8 });
    if (k === 1 && dur > 0) this.game.audio && this.game.audio.play('door_open', { vol: 0.7 });
  }
  settleCamera() {
    if (!has(this.cam, 'update')) return;
    if (has(this.cam, 'snap')) { this.cam.snap(); return; }
    for (let i = 0; i < 30; i++) this.cam.update(0.1);
  }

  // ================================================================== fights
  inFight() { return !!(this.waves && !this.waves.done); }
  startFight(r, first) {
    let enc = null;
    try { enc = Floors.encounterFor ? Floors.encounterFor(this.run, r) : null; } catch (e) { enc = null; }
    const waves = (enc && enc.waves) || [[{ id: 'shroomling', n: 3 }]];
    this.waves = { list: waves, i: -1, t: r.type === 'boss' ? 0.2 : 0.75, done: false, reward: enc && enc.reward };
    this.setDoors(0, 0.35);
    if (r.type === 'boss') this.bossIntro(r, waves);
  }
  bossIntro(r, waves) {
    const game = this.game;
    const bossId = (waves[0] && waves[0][0] && waves[0][0].id) || 'grand_puffcap';
    this.waves.t = 99; // spawn after the intro
    const go = () => { if (this.waves) this.waves.t = 0.15; };
    const id = 'boss_' + bossId;
    const can = has(Cut, 'hasCutscene') ? Cut.hasCutscene(id) : false;
    if (can && game.scenes.cutscene) {
      try { game.pushOverlay('cutscene', { id, char: this.run.char, onDone: go }); return; } catch (e) { /* fall through */ }
    }
    // our own short intro: a slow push-in on the arena centre, the name card, a rumble
    const def = MONSTERS[bossId];
    this.banner = { text: (def && def.name) || 'Boss', sub: (def && def.title) || '', t: 0, boss: true };
    if (has(this.cam, 'zoomTo') && this.built) {
      const c = (this.built.anchors && (this.built.anchors.boss || this.built.anchors.center)) || { x: 0, y: 0, z: 0 };
      this.cam.zoomTo({ x: c.x, y: 0.8, z: c.z }, { fov: 24, dur: 1.2 });
      this.later(2.2, () => { this.cam.release && this.cam.release(0.8); go(); });
    } else this.later(1.6, go);
    game.audio && game.audio.play('herald_roar', { vol: 0.8, pitch: 0.7 });
    this.shake(0.5);
  }
  spawnWave(list) {
    const aw = this.aw, b = this.built;
    if (!aw) return;
    const spots = (b && b.spawns && b.spawns.length ? b.spawns : [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 0, z: 1 }]).slice();
    const pl = this.player;
    // furthest-from-player first, a little shuffled
    spots.sort((a, c) => (pl ? Math.hypot(c.x - pl.x, c.z - pl.z) - Math.hypot(a.x - pl.x, a.z - pl.z) : 0) + (rnd.next() - 0.5) * 3);
    let k = 0;
    for (const g of list) {
      for (let n = 0; n < (g.n || 1); n++) {
        const s = spots[k % spots.length]; k++;
        const jx = (rnd.next() - 0.5) * 0.8, jz = (rnd.next() - 0.5) * 0.8;
        let e = null;
        try { e = Enemies.spawnEnemy(aw, g.id, s.x + jx, s.z + jz, { elite: !!g.elite, boss: this.curRoom.type === 'boss' && k === 1, delay: k * 0.18, from: s.from }); } catch (err) { console.error('spawnEnemy', g.id, err); }
        if (!e) continue;
        const def = MONSTERS[g.id];
        if (def && def.tier === 'boss' || this.curRoom.type === 'boss' && !this.boss) this.boss = e;
        const m = groupOf(e.model) || groupOf(monsterOf(e));
        if (m && !m.parent) this.scene3.add(m);
      }
    }
    if (this.pet && has(this.pet, 'play')) this.pet.play('bark');
    this.game.audio && this.game.audio.play('spawn_puff', { vol: 0.6 });
  }
  aliveEnemies() { return (this.aw && this.aw.enemies || []).filter((e) => !e.dead && e.team !== 'player' && !e.ally); }
  updateWaves(dt) {
    const W = this.waves;
    if (!W || W.done) return;
    W.t -= dt;
    if (W.i >= 0 && this.aliveEnemies().length > 0) return;
    if (W.i >= 0 && W.t > 0.8) W.t = 0.8; // short beat between waves
    if (W.t > 0) return;
    W.i++;
    if (W.i < W.list.length) { this.spawnWave(W.list[W.i]); W.t = 0.9; return; }
    W.done = true;
    this.onClear(this.curRoom, false);
  }
  onClear(r, quiet) {
    const was = r.cleared;
    r.cleared = true;
    this.setDoors(1, quiet ? 0 : 0.6);
    if (quiet || was) return;
    const game = this.game;
    game.audio && game.audio.play('room_clear', { vol: 0.8 });
    this.aw && has(this.aw, 'emit') && this.aw.emit('roomCleared', { room: r });
    if (r.type === 'boss') { this.onBossDown(r); return; }
    // reward: a little pile in the middle of the room
    let items = [];
    try { items = (Loot.roomReward && Loot.roomReward(this.run, r)) || []; } catch (e) { items = []; }
    const c = (this.built && this.built.anchors && this.built.anchors.center) || { x: 0, z: 0 };
    items.forEach((it, i) => { const a = (i / Math.max(1, items.length)) * Math.PI * 2; this.pickups.spawn(it, c.x + Math.cos(a) * 0.7, c.z + Math.sin(a) * 0.5, { from: { x: c.x, z: c.z }, delay: i * 0.12 }); });
    this.queuePrebuild(r);
    if (this.run.stats) this.run.stats.rooms = (this.run.stats.rooms || 0) + 1;
  }
  onBossDown(r) {
    const game = this.game, run = this.run, st = this.roomState(r.id);
    let items = [];
    try { items = (Loot.bossLoot && Loot.bossLoot(run, this.stage)) || []; } catch (e) { items = []; }
    const c = (this.built && this.built.anchors && (this.built.anchors.boss || this.built.anchors.center)) || { x: 0, z: -1 };
    items.forEach((it, i) => this.pickups.spawn(it, c.x + (i - (items.length - 1) / 2) * 0.9, c.z + 1.2, { from: { x: c.x, z: c.z }, delay: 0.6 + i * 0.15 }));
    st.hole = true;
    this.later(1.4, () => this.addHole());
    if (run.stats) run.stats.bosses = (run.stats.bosses || 0) + 1;
    // free a friend: the stage's boss held them
    const friend = this.sdef.frees || ['bran', 'elio', 'clover'][this.stage];
    if (friend && friend !== run.char) {
      try { has(RunMod, 'unlockHero') ? RunMod.unlockHero(friend) : null; } catch (e) { /* meta */ }
      try { has(run, 'rescue') && run.rescue(friend); } catch (e) { /* ignore */ }
      const id = 'rescue_' + friend;
      if (has(Cut, 'hasCutscene') && Cut.hasCutscene(id) && game.scenes.cutscene) this.later(2.4, () => game.pushOverlay('cutscene', { id, char: run.char, onDone: () => {} }));
      else this.later(2.0, () => { this.banner = { text: `${friend[0].toUpperCase() + friend.slice(1)} is free!`, sub: 'Unlocked', t: 0 }; });
    }
  }

  // ================================================================== kills, drops, statues
  bindWorld(aw) {
    if (!has(aw, 'on')) return;
    aw.on('enemyKilled', (ev) => this.onKill(ev));
    aw.on('playerDead', () => this.onDeath());
    aw.on('playerHurt', () => { if (this.pet && has(this.pet, 'play')) this.pet.play('yelp'); });
  }
  onKill(ev) {
    const e = ev.enemy || ev, run = this.run;
    const def = ev.def || MONSTERS[e.id] || MONSTERS[e.defId];
    const x = ev.x ?? e.x, z = ev.z ?? e.z;
    if (run.stats) run.stats.kills = (run.stats.kills || 0) + 1;
    let drops = [];
    try { drops = (Loot.rollDrops && Loot.rollDrops(run, def)) || []; } catch (err) { drops = []; }
    drops.forEach((it, i) => { const a = rnd.next() * Math.PI * 2, d = 0.5 + rnd.next() * 0.6; this.pickups.spawn(it, x + Math.cos(a) * d, z + Math.sin(a) * d, { from: { x, z }, delay: 0.15 + i * 0.1 }); });
    // ore-bearing foes (and every elite/boss) stay behind as minable statues
    const tier = def && def.tier;
    const ore = def && (def.ore && def.ore.length);
    const isBoss = tier === 'boss';
    if (!isBoss && (ore || tier === 'elite' || rnd.next() < 0.45)) this.makeStatue(e, def, x, z);
  }
  makeStatue(e, def, x, z) {
    const m = monsterOf(e);
    const g = groupOf(m) || groupOf(e.model);
    e.statue = true; e.keepModel = true;
    const s = { id: def ? def.id : e.id, def, x, z, model: m || e.model, k: 0, r: (e.radius || 0.5) + 0.9, mined: false };
    this.statues.push(s);
    this.roomState(this.curId).statues.push({ id: s.id, x, z, mined: false, yaw: g ? g.rotation.y : 0 });
    s.rec = this.roomState(this.curId).statues[this.roomState(this.curId).statues.length - 1];
    // make sure the body stays put even if the enemy code removes it
    this.later(0.05, () => { if (g && !g.parent) { g.position.set(x, 0, z); this.scene3.add(g); } });
    this.inter.push({ kind: 'statue', x, z, r: s.r, label: 'Mine', statue: s, y: 1.4 });
    this.game.audio && this.game.audio.play('petrify', { vol: 0.5 });
  }
  restoreStatues(st) {
    for (const rec of st.statues) {
      if (rec.mined) continue;
      let m = null;
      try { m = Monsters.buildMonster ? Monsters.buildMonster(rec.id) : null; } catch (e) { m = null; }
      const g = groupOf(m);
      if (g) { g.position.set(rec.x, 0, rec.z); g.rotation.y = rec.yaw || 0; this.scene3.add(g); if (has(m, 'setStone')) m.setStone(1); }
      const def = MONSTERS[rec.id];
      const s = { id: rec.id, def, x: rec.x, z: rec.z, model: m, k: 1, r: 1.3, mined: false, rec };
      this.statues.push(s);
      this.inter.push({ kind: 'statue', x: rec.x, z: rec.z, r: s.r, label: 'Mine', statue: s, y: 1.4 });
    }
  }
  updateStatues(dt) {
    for (const s of this.statues) {
      if (s.k < 1) {
        s.k = Math.min(1, s.k + dt * 1.4);
        const m = s.model;
        if (has(m, 'setStone')) m.setStone(ease.inOutSine(s.k));
      }
      if (s.model && has(s.model, 'update') && s.k < 1) s.model.update(dt);
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i];
      try { sh.update && sh.update(dt); } catch (e) { sh.done = true; }
      if (sh.done) { try { sh.dispose && sh.dispose(); } catch (e) { /* ignore */ } this.shards.splice(i, 1); }
    }
  }

  // ================================================================== interactables
  setupInteractables(r, st) {
    const b = this.built, A = (b && b.anchors) || {};
    this.inter = this.inter.filter((x) => x.kind === 'statue');
    (b && b.veins || []).forEach((v, i) => {
      if (st.veins.includes(i)) { has(v, 'setMined') && v.setMined(1); return; }
      this.inter.push({ kind: 'vein', x: v.x, z: v.z, r: 1.5, label: 'Mine', vein: v, idx: i, y: 1.0 });
    });
    if (r.type === 'treasure') {
      if (A.pedestal && !st.pedestal) this.addPedestal(A.pedestal, st);
      else if (A.chest && !st.chest) this.inter.push({ kind: 'chest', x: A.chest.x, z: A.chest.z, r: 1.4, label: 'Open', y: 0.9 });
      else if (!A.pedestal && !A.chest && !st.chest) { const c = A.center || { x: 0, z: 0 }; this.inter.push({ kind: 'chest', x: c.x, z: c.z, r: 1.4, label: 'Open', y: 0.9, prop: this.addChestProp(c) }); }
    }
    if (r.type === 'secret' && !st.chest) { const c = A.chest || A.center || { x: 0, z: 0 }; this.inter.push({ kind: 'chest', x: c.x, z: c.z, r: 1.4, label: 'Open', y: 0.9, secret: true, prop: A.chest ? null : this.addChestProp(c) }); }
    if (r.type === 'craft') { const c = A.bench || A.center || { x: 0, z: -1 }; this.inter.push({ kind: 'bench', x: c.x, z: c.z, r: 1.8, label: 'Craft', station: c.station || 'workbench', y: 1.1 }); }
    if (r.type === 'shrine' && !st.shrine) { const c = A.shrine || A.center || { x: 0, z: -1 }; this.inter.push({ kind: 'shrine', x: c.x, z: c.z, r: 1.8, label: 'Approach', y: 1.4 }); }
    if (r.type === 'boss' && st.hole) this.addHole();
  }
  addPedestal(a, st) {
    let it = null;
    try { const L = Loot.treasureLoot ? Loot.treasureLoot(this.run) : []; it = Array.isArray(L) ? L[0] : L; } catch (e) { it = null; }
    if (!it) it = makeItem(Object.keys(MATERIALS).find((k) => MATERIALS[k].kind === 'gem') || 'ruby', 3);
    if (typeof it === 'string') it = makeItem(it, 2);
    const p = this.pickups.spawn(it, a.x, a.z, { pop: false });
    if (p) { p.y = 0.95; p.pedestal = true; p.refused = true; p.root.position.y = 0.95; }
    this.inter.push({ kind: 'pedestal', x: a.x, z: a.z, r: 1.4, label: 'Take', y: 1.5, pick: p, item: it });
  }
  addChestProp(c) {
    // the room may not have a chest prop of its own: a small voxel chest stand-in
    const g = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a4a26 }), iron = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.5), wood); body.position.y = 0.23; g.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.18, 0.54), wood); lid.position.y = 0.52; g.add(lid);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.56), iron); band.position.y = 0.42; g.add(band);
    g.position.set(c.x, 0, c.z);
    g.userData.lid = lid;
    this.scene3.add(g);
    (this.props || (this.props = [])).push(g);
    return g;
  }
  addHole() {
    if (this.inter.some((x) => x.kind === 'hole')) return;
    const A = (this.built && this.built.anchors) || {};
    const h = A.hole || { x: 0, z: 0.5 };
    if (has(this.built, 'openHole')) this.built.openHole(1);
    else {
      const ring = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x05030a }));
      ring.position.set(h.x, 0.03, h.z);
      const glow = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9a6aff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(h.x, 0.04, h.z);
      this.scene3.add(ring, glow);
      (this.props || (this.props = [])).push(ring, glow);
    }
    this.inter.push({ kind: 'hole', x: h.x, z: h.z, r: 1.6, label: 'Descend', y: 0.8 });
  }
  nearestInteract() {
    const p = this.player;
    if (!p || this.inFight() && this.curRoom.type !== 'boss') return null;
    let best = null, bd = 1e9;
    for (const it of this.inter) {
      if (it.used) continue;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    return best;
  }
  interact(it) {
    if (!it || it.used) return;
    const game = this.game, run = this.run, st = this.roomState(this.curId);
    if (has(this.player, 'play')) this.player.play('interact');
    if (it.kind === 'statue' || it.kind === 'vein') {
      const target = it.kind === 'statue' ? it.statue : it.vein;
      Flow.openMine(game, {
        kind: it.kind, def: it.statue && it.statue.def, monster: it.statue && it.statue.id, vein: it.vein, stage: this.stage,
        at: { x: it.x, y: it.kind === 'statue' ? 0.9 : 0.8, z: it.z }, cam: this.cam, scene: this,
        onDone: (res) => this.afterMine(it, target, res),
      });
      return;
    }
    if (it.kind === 'pedestal') {
      const ok = run.addItem ? run.addItem(it.item) : true;
      if (!ok) { hudToast(this.hud, 'Bag full', { color: '#ff9a8a', icon: 'bag' }); game.audio && game.audio.play('deny'); return; }
      it.used = true; st.pedestal = true;
      if (it.pick) { this.pickups.list = this.pickups.list.filter((p) => p !== it.pick); this.scene3.remove(it.pick.root); }
      this.collected(it.item);
      if (game.scenes.reveal) game.pushOverlay('reveal', { item: it.item, onDone: () => this.refreshLoadout() });
      return;
    }
    if (it.kind === 'chest') {
      it.used = true; st.chest = true;
      game.audio && game.audio.play('chest_creak');
      if (it.prop && it.prop.userData.lid) { const lid = it.prop.userData.lid; this.tween(0.4, (k) => { lid.rotation.x = -k * 1.1; lid.position.z = -k * 0.15; lid.position.y = 0.52 + k * 0.12; }); }
      if (has(this.built, 'openChest')) this.built.openChest(1);
      let items = [];
      try { items = (Loot.treasureLoot && Loot.treasureLoot(run, { secret: it.secret })) || []; } catch (e) { items = []; }
      if (!Array.isArray(items)) items = [items];
      items.forEach((x, i) => { const a = -Math.PI / 2 + (i - (items.length - 1) / 2) * 0.7; this.pickups.spawn(x, it.x + Math.cos(a) * 1.1, it.z + 0.9 + Math.sin(a) * 0.3, { from: { x: it.x, z: it.z }, delay: 0.25 + i * 0.15 }); });
      return;
    }
    if (it.kind === 'bench') { Flow.openCraft(game, { station: it.station, onClose: () => this.refreshLoadout() }); return; }
    if (it.kind === 'shrine') { this.shrine(it, st); return; }
    if (it.kind === 'hole') {
      it.used = true;
      game.audio && game.audio.play('fall', { vol: 0.8 });
      this.syncHp();
      this.leaving = { t: 0 };
      if (has(this.player, 'play')) this.player.play('fall');
      this.later(0.9, () => Flow.nextFloor(game));
    }
  }
  afterMine(it, target, res) {
    const st = this.roomState(this.curId);
    if (res && res.items) for (const x of res.items) this.collected(x, true);
    if (it.kind === 'statue') {
      const s = it.statue;
      if (res && res.left === false) return; // walked away before breaking it: still there
      it.used = true; s.mined = true; if (s.rec) s.rec.mined = true;
      const m = s.model;
      let sh = null;
      try { sh = has(m, 'shatter') ? m.shatter() : null; } catch (e) { sh = null; }
      if (sh) this.shards.push(sh);
      else { const g = groupOf(m); if (g && g.parent) g.parent.remove(g); }
      this.game.audio && this.game.audio.play('stone_shatter');
      this.shake(0.35);
    } else {
      if (res && res.left === false) return;
      it.used = true; st.veins.push(it.idx);
      if (has(target, 'setMined')) target.setMined(1);
    }
    this.refreshLoadout();
  }
  /** A shrine: a short choice told as floating dialogue (D's events when present). */
  shrine(it, st) {
    const game = this.game, run = this.run;
    const list = (Events.SHRINES || Events.EVENTS || []).filter((e) => !e.acts || e.acts.includes(this.stage) || e.stages && e.stages.includes(this.stage));
    const ev = list.length ? list[Math.floor(rnd.next() * list.length)] : null;
    const done = () => { st.shrine = true; it.used = true; this.refreshLoadout(); };
    if (!ev) { done(); return; }
    const choices = (ev.choices || []).slice(0, 3);
    const at = new THREE.Vector3(it.x, it.y + 0.4, it.z);
    const lines = [
      { who: 'shrine', at, text: ev.title ? `${ev.title}. ${ev.text || ''}` : ev.text || '…' },
      { who: this.run.char, at: () => this.player ? new THREE.Vector3(this.player.x, 1.4, this.player.z) : at, text: '', replies: choices.map((c) => ({ text: c.label, fn: () => this.applyOutcome(c, it) })) },
    ];
    if (game.scenes.dialogue) game.pushOverlay('dialogue', { world: this.aw, cam: this.cam, lines, onDone: done });
    else { if (choices[0]) this.applyOutcome(choices[0], it); done(); }
  }
  applyOutcome(choice, it) {
    const run = this.run;
    if (has(Events, 'applyOutcome')) { try { const r = Events.applyOutcome(run, choice); this.outcomeFx(r, it); return; } catch (e) { /* fall back */ } }
    const o = choice.effect || choice.outcome || choice;
    const items = [].concat(o.gain || o.items || []).map((x) => (typeof x === 'string' ? makeItem(x, 2) : x && x.id ? makeItem(x.id, x.q ?? 2) : null)).filter(Boolean);
    items.forEach((x, i) => this.pickups.spawn(x, it.x + (i - (items.length - 1) / 2) * 0.8, it.z + 1.2, { from: { x: it.x, z: it.z }, delay: i * 0.15 }));
    if (o.hp && this.player) { this.player.hp = clamp(this.player.hp + o.hp, 1, this.player.maxHp || 999); hudToast(this.hud, `${o.hp > 0 ? '+' : ''}${o.hp} HP`, { icon: 'heart', color: o.hp > 0 ? '#9affb0' : '#ff8a7a' }); }
    if (o.learn || o.recipe) { const id = o.learn || o.recipe; if (has(run, 'learnRecipe')) run.learnRecipe(id); hudToast(this.hud, 'Recipe learned', { icon: 'recipe', color: '#ffe08a' }); }
    if (o.fight) { const ids = [].concat(o.fight); this.waves = { list: [ids.map((id) => ({ id, n: 1 }))], i: -1, t: 0.4, done: false }; this.setDoors(0, 0.3); }
  }
  outcomeFx(r, it) {
    if (!r) return;
    for (const x of r.items || []) this.pickups.spawn(x, it.x + (rnd.next() - 0.5) * 1.4, it.z + 1.1, { from: { x: it.x, z: it.z } });
    if (r.text) hudToast(this.hud, r.text, { color: '#ffe08a' });
    if (r.fight) { this.waves = { list: [[].concat(r.fight).map((id) => ({ id, n: 1 }))], i: -1, t: 0.4, done: false }; this.setDoors(0, 0.3); }
  }
  collected(item, quiet) {
    const m = MATERIALS[item.id];
    const name = item.bp ? item.name || 'Weapon' : (m && m.name) || item.id;
    hudToast(this.hud, name, { item, color: rarityColor(item) });
    if (!quiet) this.game.audio && this.game.audio.play(rarityOf(item) === 'common' ? 'pickup' : 'ore_rare', { vol: 0.6 });
    if (this.run.stats) this.run.stats.loot = (this.run.stats.loot || 0) + 1;
  }

  // ================================================================== Pip
  spawnPet() {
    if (!this.pet) { try { this.pet = Pet.buildPet ? Pet.buildPet() : null; } catch (e) { this.pet = null; } }
    const p = this.pet;
    if (!p || !p.group) return;
    const pl = this.player;
    p.group.position.set(pl ? pl.x - 0.8 : 0, 0, pl ? pl.z + 0.4 : 0);
    p.x = p.group.position.x; p.z = p.group.position.z;
    this.scene3.add(p.group);
    if (has(p, 'play')) p.play('idle');
  }
  updatePet(dt) {
    const p = this.pet, pl = this.player;
    if (!p || !p.group || !pl) return;
    p.update && p.update(dt);
    // sniff the nearest unmined statue or vein, otherwise heel a step behind and to the side
    let tx = pl.x - Math.sin(pl.facing || 0) * 0.9 - 0.5, tz = pl.z - Math.cos(pl.facing || 0) * 0.9;
    let sniff = null;
    if (!this.inFight()) for (const it of this.inter) if ((it.kind === 'statue' || it.kind === 'vein') && !it.used && Math.hypot(it.x - pl.x, it.z - pl.z) < 5) { sniff = it; break; }
    if (sniff) { tx = sniff.x + 0.6; tz = sniff.z + 0.7; }
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    const speed = d > 3 ? 7 : d > 0.4 ? 4.5 : 0;
    if (speed) { p.x += (dx / d) * Math.min(d, speed * dt); p.z += (dz / d) * Math.min(d, speed * dt); p.group.rotation.y = Math.atan2(dx, dz); }
    if (this.aw && has(this.aw, 'moveCircle')) { /* Pip squeezes through anything: no collision */ }
    p.group.position.set(p.x, 0, p.z);
    const want = speed > 5 ? 'run' : speed > 0 ? 'walk' : sniff ? 'sniff' : 'idle';
    if (has(p, 'play') && p.anim !== want && !['bark', 'yelp', 'happy'].includes(p.anim) || (p.animT = (p.animT || 0) + dt) > 1.4 && ['bark', 'yelp', 'happy'].includes(p.anim)) { p.animT = 0; p.play(want); }
  }

  // ================================================================== transitions
  checkDoors() {
    const p = this.player, b = this.built, r = this.curRoom;
    if (!p || !b || !b.doors || this.trans || this.inFight() || (this.doorK ?? 1) < 0.9) return;
    for (const d of ['n', 'e', 's', 'w']) {
      const door = b.doors[d], nid = r.doors && r.doors[d];
      if (!door || nid === null || nid === undefined) continue;
      const D = DIRS[d];
      const along = (p.x - door.x) * D.x + (p.z - door.z) * D.z;   // > 0: past the door line
      const side = Math.abs((p.x - door.x) * D.z) + Math.abs((p.z - door.z) * D.x);
      if (along > -0.55 && side < 1.1) { this.startTransition(d, nid); return; }
    }
  }
  startTransition(dir, nid) {
    const game = this.game;
    this.trans = { dir, nid, t: 0, phase: 'out', cam0: this.cam.camera.position.clone(), q0: this.cam.camera.quaternion.clone() };
    game.audio && game.audio.play('door_through', { vol: 0.6 });
  }
  updateTransition(dt) {
    const T = this.trans;
    if (!T) return;
    T.t += dt;
    const D = DIRS[T.dir];
    const cam = this.cam.camera;
    if (T.phase === 'out') {
      const k = ease.inQuad(clamp(T.t / 0.24));
      cam.position.copy(T.cam0).add(v3.set(D.x * 4 * k, 0, D.z * 4 * k));
      this.fade = k * 0.95;
      if (this.player && this.player.model) this.player.model.position.set(this.player.x + D.x * 1.2 * k, 0, this.player.z + D.z * 1.2 * k);
      if (T.t >= 0.24) {
        this.enterRoom(T.nid, T.dir);
        this.settleCamera();
        T.phase = 'in'; T.t = 0;
        T.cam1 = cam.position.clone();
      }
    } else {
      const k = ease.outCubic(clamp(T.t / 0.34));
      cam.position.copy(T.cam1).add(v3.set(-D.x * 4 * (1 - k), 0, -D.z * 4 * (1 - k)));
      this.fade = (1 - k) * 0.95;
      if (T.t >= 0.34) { this.trans = null; this.fade = 0; }
    }
  }

  // ================================================================== helpers
  later(t, fn) { (this.timers || (this.timers = [])).push({ t, fn }); }
  tween(dur, fn) { (this.tweens || (this.tweens = [])).push({ t: 0, dur, fn }); }
  shake(a) { if (has(this.cam, 'shake')) this.cam.shake(a); else if (this.aw && has(this.aw, 'shake')) this.aw.shake(a); }
  project(x, y, z) {
    v3.set(x, y, z).project(this.cam.camera);
    return { x: (v3.x + 1) / 2 * 960, y: (1 - v3.y) / 2 * 540, behind: v3.z > 1 };
  }
  onDeath() {
    if (this.deadT) return;
    this.deadT = 0.001;
    this.syncHp();
    if (this.aw && has(this.aw, 'slowmo')) this.aw.slowmo(0.25, 1.2);
    this.game.audio && this.game.audio.play('defeat_sting');
  }
  pressed(...codes) { const inp = this.game.input; return codes.some((c) => inp.keyPressed(c)); }
  action(name) { try { return this.game.input.actionPressed(name); } catch (e) { return false; } }

  // ================================================================== frame
  update(dt) {
    const game = this.game;
    this.roomEnterT = (this.roomEnterT || 0) + dt;
    // timers / tweens on scene time
    if (this.timers) for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    if (this.tweens) for (let i = this.tweens.length - 1; i >= 0; i--) { const t = this.tweens[i]; t.t += dt; t.fn(ease.outCubic(clamp(t.t / t.dur))); if (t.t >= t.dur) this.tweens.splice(i, 1); }
    if (this.doorAnim) {
      const A = this.doorAnim; A.t += dt;
      const k = A.from + (A.to - A.from) * ease.inOutCubic(clamp(A.t / A.dur));
      this.doorK = k;
      if (this.built && this.built.doors) for (const d of Object.values(this.built.doors)) if (d && has(d, 'setOpen')) d.setOpen(k);
      if (A.t >= A.dur) this.doorAnim = null;
    }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 3.2) this.banner = null; }
    if (this.trans) { this.updateTransition(dt); this.built && has(this.built, 'update') && this.built.update(dt, this.time); return; }
    if (this.leaving) { this.leaving.t += dt; this.fade = clamp(this.leaving.t / 0.8); }
    else this.fade = Math.max(0, this.fade - dt * 2.2);
    // ---- the world
    const aw = this.aw;
    if (aw && !this.deadT) aw.update(dt);
    else if (aw && this.deadT) { aw.update(dt * 0.3); this.deadT += dt; if (this.deadT > 1.6 && !this.goneOver) { this.goneOver = true; Flow.gameOver(game, 'stone'); } }
    if (this.player && !this.deadT && this.player.hp <= 0) this.onDeath();
    this.syncHp();
    if (this.built && has(this.built, 'update')) this.built.update(dt, this.time);
    if (has(this.cam, 'update')) this.cam.update(dt);
    this.updateWaves(dt);
    this.updateStatues(dt);
    this.updatePet(dt);
    this.pickups.update(dt, {
      player: this.player, radius: 1.9 + ((this.loadout.stats && this.loadout.stats.pickup) || 0),
      tryTake: (it) => (this.run.addItem ? this.run.addItem(it) : true),
      onTake: (it) => { this.collected(it); if (rarityOf(it) !== 'common' && rarityOf(it) !== 'uncommon' && game.scenes.reveal && !this.inFight()) game.pushOverlay('reveal', { item: it, auto: 2.2, onDone: () => this.refreshLoadout() }); else this.refreshLoadout(); },
      onFull: () => { hudToast(this.hud, 'Bag full — Tab to make room', { color: '#ff9a8a', icon: 'bag' }); game.audio && game.audio.play('deny', { vol: 0.5 }); },
      onBounce: () => game.audio && game.audio.play('item_place', { vol: 0.25 }),
    });
    this.pumpPrebuild(dt);
    if (!this.leaving) this.checkDoors();
    // ---- input
    this.near = this.nearestInteract();
    if (this.near && (this.pressed('KeyF', 'Touch_interact') || this.action('interact')) && !this.deadT) this.interact(this.near);
    if (this.action('bag') && !this.deadT) Flow.openBag(game, { onClose: () => this.refreshLoadout() });
    if (this.pressed('KeyM')) this.mapHeld = !this.mapHeld;
    this.mapOpen += ((this.mapHeld ? 1 : 0) - this.mapOpen) * Math.min(1, dt * 12);
    if (this.action('back') && !game.overlays.length) game.pushOverlay('pause');
  }

  draw(ui) {
    const game = this.game, ctx = ui.ctx;
    const touch = ui.touch;
    // an overlay (bag, crafting, mining, dialogue) takes the screen: only the dark fade stays
    if (game.overlays.length) { if (this.fade > 0.01) { ctx.globalAlpha = clamp(this.fade); ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, ui.w, ui.h); ctx.globalAlpha = 1; } return; }
    // ---- interact prompt position
    let prompt = null;
    if (this.near && !this.trans) {
      const p = this.project(this.near.x, this.near.y || 1.2, this.near.z);
      prompt = { x: p.x, y: p.y, label: this.near.label, key: 'F' };
    }
    const out = drawActionHud(ui, this.hud, {
      player: this.player, loadout: this.loadout, run: this.run, touch, hidden: !!this.trans || this.mapOpen > 0.5,
      boss: this.boss && !this.boss.dead ? { name: (MONSTERS[this.boss.id] && MONSTERS[this.boss.id].name) || 'Boss', hp: this.boss.hp, maxHp: this.boss.maxHp, phases: 3 } : null,
      interact: prompt,
    });
    if (out.bag) Flow.openBag(game, { onClose: () => this.refreshLoadout() });
    if (out.interact && this.near) this.interact(this.near);
    // touch: an interact medallion appears beside the action cluster when there is something to use
    if (touch && this.near) ui.touchButton('interact', ui.w - 150, ui.h - 120, 18, { label: this.near.label, style: 'jade', glow: true });
    // ---- minimap + big map
    drawMinimap(ui, this.floor, this.curId, { x: ui.w - 7 * 20 - 3 - (touch ? 40 : 10), alpha: this.trans ? 0.5 : 1 });
    if (this.mapOpen > 0.02) drawBigMap(ui, this.floor, this.curId, this.mapOpen, { title: this.sdef.name });
    // ---- banner (floor name / boss card)
    const B = this.banner;
    if (B) {
      const a = B.t < 0.4 ? B.t / 0.4 : B.t > 2.6 ? 1 - (B.t - 2.6) / 0.6 : 1;
      ctx.globalAlpha = clamp(a);
      const y = B.boss ? ui.h * 0.72 : 96;
      ui.big(B.text, ui.w / 2, y, { scale: B.boss ? 3 : 2, top: B.boss ? '#ffe0a0' : '#f4ead6', bottom: B.boss ? '#c84a2a' : '#c8a070' });
      if (B.sub) ui.text(B.sub, ui.w / 2, y + (B.boss ? 22 : 16), { align: 'center', color: '#cbb89a', outline: '#140c10' });
      ctx.globalAlpha = 1;
    }
    // ---- fades (transitions, falling, death)
    let f = this.fade;
    if (this.deadT) f = Math.max(f, clamp((this.deadT - 0.6) / 1.0) * 0.9);
    if (f > 0.01) { ctx.globalAlpha = clamp(f); ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, ui.w, ui.h); ctx.globalAlpha = 1; }
    if (this.roomEnterT < 0.3 && !this.trans && this.fadeIn !== false) { /* the transition already faded */ }
  }
}
