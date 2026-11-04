// The dungeon: a floor of Isaac-style rooms seen through the Hades camera. Walk into a room, the
// doors slam, foes pour in, fight; the last one falls, the doors grind open and the room pays out.
// Foes your stone axe kills turn to stone; the ore-rich ones stay as statues: walk up and mine them
// (the camera zooms into the rock). Special rooms: ore veins, treasure (an item on a pedestal), a
// workshop (crafting), a shrine (a choice, told as floating dialogue), secret rooms behind cracked
// walls, and the boss room; beating the boss opens a hole down to the next stage. Minimap top-right
// (M = big map), HUD bottom, Tab opens the bag.
//
// Params: { stage, char, seed, newFloor, fresh, goto: room type to start in (dev) }.
// Dev: ?scene=dungeon&char=durgan&stage=0[&goto=boss|craft|vein|treasure|shrine|fight]
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
import { fx as rnd } from '../core/rng.js';
import { clamp, ease } from '../core/math.js';
import { drawActionHud, makeHudState, hudToast } from '../ui/hud_action.js';
import { drawMinimap, drawBigMap } from './dungeon/minimap.js';
import { Pickups, rarityOf, rarityColor } from './dungeon/pickups.js';
import * as Flow from './flow.js';

const DIRS = { n: { x: 0, z: -1, opp: 's' }, s: { x: 0, z: 1, opp: 'n' }, e: { x: 1, z: 0, opp: 'w' }, w: { x: -1, z: 0, opp: 'e' } };
const STAGE_MUSIC = ['delve0', 'delve1', 'delve2', 'delve3'];
const v3 = new THREE.Vector3();

const has = (o, k) => !!o && typeof o[k] === 'function';
const fn = (mod, k) => (mod && typeof mod[k] === 'function' ? mod[k] : null); // optional export, looked up at run time
const roomsOf = (floor) => (floor.rooms instanceof Map ? [...floor.rooms.values()] : Object.values(floor.rooms || {}));
const roomOf = (floor, id) => (floor.rooms instanceof Map ? floor.rooms.get(id) : floor.rooms[id]);
export function stageDef(i) {
  const L = Regions['STAGES'] || Regions.ACTS || [];
  return L[Math.max(0, Math.min(L.length - 1, i | 0))] || { name: 'The Dungeon' };
}
/** The live Monster behind an enemy (N's Enemy keeps it as .mon / .model). */
function monsterOf(e) {
  if (!e) return null;
  for (const k of ['statue', 'monster', 'mon', 'model']) if (e[k] && (has(e[k], 'setStone') || e[k].group)) return e[k];
  return null;
}
const groupOf = (m) => (m ? (m.isObject3D ? m : m.group) : null);

export class DungeonScene extends Scene {
  enter(params = {}) {
    const game = this.game;
    this.params = params;
    if (!game.run || params.fresh) game.run = new RunMod.Run(params.char || 'durgan', params.seed || String(Date.now()));
    const run = this.run = game.run;
    const stage = params.stage !== undefined ? +params.stage || 0 : run.stage || 0;
    if (!run.floor || run.stage !== stage || (params.newFloor && run.floor._used)) run.enterStage(stage);
    this.stage = run.stage;
    this.floor = run.floor;
    this.floor._used = true;
    this.state = this.floor._state || (this.floor._state = {});
    this.sdef = stageDef(this.stage);
    // ---- one world for the whole floor: rooms swap in and out of it
    this.scene3 = new THREE.Scene();
    this.cam = new Action.HadesCam({ fov: 32 });
    this.world = { scene: this.scene3, camera: this.cam.camera, post: { bloom: 0.7, threshold: 0.8, vignette: 0.42, outline: 0.55, edge: 0.3, saturation: 1.12, contrast: 1.05 } };
    this.aw = new Action.ActionWorld(game, { scene: this.scene3, cam: this.cam });
    this.bindWorld(this.aw);
    this.pickups = new Pickups(this.scene3);
    this.hud = makeHudState();
    this.cache = new Map();
    this.player = null;
    this.trans = null;
    this.fade = 1;
    this.mapOpen = 0; this.mapHeld = false;
    this.inter = [];
    this.statues = [];
    this.shards = [];
    this.props = [];
    this.waves = null;
    this.boss = null;
    this.deadT = 0;
    this.banner = null;
    this.prebuildQ = [];
    this.killed = new WeakSet();
    this.loadout = this.computeLoadout();
    // ---- warm the floor's monsters (their voxel models) so rooms open without a hitch
    try {
      const ids = new Set();
      for (const r of roomsOf(this.floor)) { const enc = Floors.encounterFor ? Floors.encounterFor(run, r) : null; for (const w of (enc && enc.waves) || []) for (const g of w) ids.add(g.id); }
      const pre = fn(Enemies, 'preloadEnemies'); if (pre) pre([...ids]);
    } catch (e) { /* optional */ }
    // ---- start room (dev: ?goto=<type>)
    let start = run.roomId ?? this.floor.startId;
    if (params.goto) { const r = roomsOf(this.floor).find((x) => x.type === params.goto); if (r) start = r.id; }
    this.enterRoom(start, null);
    if (game.audio) { game.audio.music(this.sdef.music || STAGE_MUSIC[this.stage] || 'delve0'); this.amb = game.audio.loop && game.audio.loop('cave', 0.35); }
    this.banner = { text: this.sdef.name || 'The Dungeon', sub: this.sdef.sub || `Stage ${this.stage + 1}`, t: 0 };
  }
  exit() {
    this.amb && this.amb.stop && this.amb.stop(1);
    this.pickups.dispose();
    this.clearRoomObjects();
    try { this.aw && this.aw.dispose(); } catch (e) { /* ignore */ }
    for (const r of this.cache.values()) { try { r && r.dispose && r.dispose(); } catch (e) { /* ignore */ } }
    this.cache.clear();
  }

  // ================================================================== loadout & player
  computeLoadout() {
    try { return Loadout.computeLoadout(this.run); } catch (e) { console.error(e); return { weapon: null, skills: [null, null], stats: {} }; }
  }
  /** After the bag, crafting or mining changed things: recompute and hand the build to the player. */
  refreshLoadout() {
    this.loadout = this.computeLoadout();
    const p = this.player;
    if (p) {
      const before = p.hp;
      if (has(p, 'applyLoadout')) p.applyLoadout(this.loadout);
      if (this.loadout.maxHp) p.maxHp = this.loadout.maxHp;
      // the run may have healed (a potion in the bag) or been hurt (a shrine) while a menu was open
      p.hp = Math.min(p.maxHp, this.runHpDirty ? this.run.hp : before);
      this.runHpDirty = false;
    }
    this.pickups.unrefuse();
  }
  syncHp() { if (this.player && this.run) this.run.hp = Math.max(0, Math.round(this.player.hp)); }

  // ================================================================== rooms
  roomState(id) { return this.state[id] || (this.state[id] = { pickups: [], statues: [], veins: [], chest: false, pedestal: false, pedestalItem: null, shrine: false, hole: false, rewarded: false }); }
  doorsOf(r) {
    const out = {};
    for (const d of ['n', 'e', 's', 'w']) {
      const ds = fn(Floors, 'doorState') ? Floors.doorState(this.floor, r, d) : r.doors && r.doors[d] != null ? 'open' : null;
      out[d] = !ds ? false : ds === 'found' || ds === 'locked' ? 'open' : ds;
    }
    return out;
  }
  getRoom(r) {
    let b = this.cache.get(r.id);
    if (b) { this.cache.delete(r.id); this.cache.set(r.id, b); return b; }
    const size = r.size || (r.type === 'boss' ? 'boss' : 'normal');
    try { b = Rooms.buildRoom(this.stage, r, { seed: r.seed, type: r.type, doors: this.doorsOf(r), size }); } catch (e) { console.error('buildRoom failed', e); b = null; }
    if (!b) return null;
    this.cache.set(r.id, b);
    while (this.cache.size > 5) {
      const [k, old] = this.cache.entries().next().value;
      if (k === this.curId) break;
      this.cache.delete(k);
      try { if (old && old.group && old.group.parent) old.group.parent.remove(old.group); old && old.dispose && old.dispose(); } catch (e) { /* ignore */ }
    }
    return b;
  }
  queuePrebuild(r) {
    for (const d of ['n', 'e', 's', 'w']) {
      const nid = r.doors && r.doors[d];
      if (nid === null || nid === undefined || this.cache.has(nid)) continue;
      const nb = roomOf(this.floor, nid);
      if (nb && !this.prebuildQ.includes(nb) && !(r.hidden && r.hidden[d] && !nb.found)) this.prebuildQ.push(nb);
    }
  }
  pumpPrebuild(dt) {
    if (!this.prebuildQ.length || this.trans || this.inFight()) return;
    this.prebuildT = (this.prebuildT || 0) + dt;
    if (this.prebuildT < 0.7) return;
    this.prebuildT = 0;
    const nb = this.prebuildQ.shift();
    if (this.cache.has(nb.id)) return;
    if (fn(Rooms, 'prebuildRoom')) { try { Rooms.prebuildRoom(this.stage, nb, { seed: nb.seed, type: nb.type, doors: this.doorsOf(nb), size: nb.size }); } catch (e) { /* optional */ } }
    else this.getRoom(nb);
  }

  enterRoom(id, fromDir) {
    const run = this.run;
    const r = roomOf(this.floor, id);
    if (!r) return;
    if (this.curRoom) {
      this.roomState(this.curId).pickups = this.pickups.stash();
      this.syncHp();
      this.clearRoomObjects();
    }
    const firstVisit = !r.visited;
    if (has(run, 'moveTo')) run.moveTo(id); else { r.visited = true; r.known = true; }
    const b = this.getRoom(r);
    if (!b) return;
    this.curId = id; this.curRoom = r; this.built = b;
    const aw = this.aw;
    aw.setRoom(b);
    // entry point: just inside the door we came through (or the room's start mark / its south side)
    let px = 0, pz = 0, facing = Math.PI;
    const entry = fromDir ? DIRS[fromDir].opp : null;
    if (entry && b.doors && b.doors[entry]) {
      const d = b.doors[entry], D = DIRS[entry];
      px = d.x - D.x * 1.4; pz = d.z - D.z * 1.4;
      facing = Math.atan2(-D.x, -D.z);
    } else if (b.anchors && b.anchors.start) { px = b.anchors.start.x; pz = b.anchors.start.z; }
    else if (b.bounds) pz = Math.min(2, b.bounds.z1 - 1.6);
    if (!this.player) {
      try { this.player = new Action.Player(aw, run.char, this.loadout, { facing }); } catch (e) { console.error('Player', e); this.player = null; }
    }
    const p = this.player;
    if (p) {
      p.x = px; p.z = pz; p.vx = p.vz = 0; p.kbx = p.kbz = 0; p.facing = facing;
      if (aw.player !== p) aw.setPlayer(p);
      this.cam.follow(p, true);
    }
    // the room's contents
    const st = this.roomState(id);
    this.pickups.restore(st.pickups); st.pickups = [];
    this.restoreStatues(st);
    this.setupInteractables(r, st);
    this.spawnPet();
    // a fight?
    this.waves = null; this.boss = null;
    let enc = null;
    if (!r.cleared) { try { enc = Floors.encounterFor ? Floors.encounterFor(run, r) : null; } catch (e) { enc = null; } }
    if (!r.cleared && enc && enc.waves && enc.waves.length) this.startFight(r, enc, firstVisit);
    else { this.setDoors(1, 0); if (!r.cleared) this.onClear(r, true); }
    this.queuePrebuild(r);
  }
  clearRoomObjects() {
    for (const s of this.statues) { const g = groupOf(s.model); if (g && g.parent) g.parent.remove(g); s.gone = true; }
    for (const sh of this.shards) { try { sh.dispose && sh.dispose(); } catch (e) { /* ignore */ } }
    this.statues = []; this.shards = []; this.inter = [];
    for (const o of this.props) if (o.parent) o.parent.remove(o);
    this.props = [];
  }
  /** Doors: k = 1 open, 0 shut (animated over dur seconds). */
  setDoors(k, dur = 0.5) {
    const b = this.built;
    if (!b || !b.doors) { this.doorK = k; return; }
    if (dur <= 0) { this.doorK = k; this.doorAnim = null; for (const d of Object.values(b.doors)) if (d && has(d, 'setOpen')) d.setOpen(k); return; }
    this.doorAnim = { from: this.doorK ?? (k ? 0 : 1), to: k, t: 0, dur };
    this.game.audio && this.game.audio.play(k ? 'door_open' : 'door_slam', { vol: 0.7 });
  }

  // ================================================================== fights
  inFight() { return !!(this.waves && !this.waves.done); }
  startFight(r, enc) {
    this.waves = { list: enc.waves, i: -1, t: r.type === 'boss' ? 0.2 : 0.7, done: false, reward: enc.reward };
    this.setDoors(0, 0.35);
    if (r.type === 'boss') this.bossIntro(r, enc);
  }
  bossIntro(r, enc) {
    const game = this.game;
    const bossId = enc.boss || (enc.waves[0] && enc.waves[0][0] && enc.waves[0][0].id) || 'grand_puffcap';
    this.waves.t = 99; // the boss arrives after the intro
    const go = () => { if (this.waves) this.waves.t = 0.1; };
    const id = 'boss_' + bossId;
    if (fn(Cut, 'hasCutscene') && Cut.hasCutscene(id) && game.scenes.cutscene) {
      try { const o = game.pushOverlay('cutscene', { id, char: this.run.char, onDone: go }); this.waves.cut = o || true; return; } catch (e) { /* fall through */ }
    }
    const def = MONSTERS[bossId];
    this.banner = { text: (def && def.name) || 'Boss', sub: (def && def.title) || '', t: 0, boss: true };
    const c = (this.built.anchors && (this.built.anchors.boss || this.built.anchors.center)) || { x: 0, z: -2 };
    this.cam.zoomTo({ x: c.x, y: 0.8, z: c.z }, { fov: 24, dur: 1.0 });
    this.later(2.4, () => { this.cam.release(0.8); go(); });
    game.audio && game.audio.play('herald_roar', { vol: 0.8, pitch: 0.7 });
    this.aw.shake(0.5);
  }
  spawnWave(list) {
    const aw = this.aw, b = this.built;
    const spots = (b && b.spawns && b.spawns.length ? b.spawns : [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 0, z: -3 }]).slice();
    const pl = this.player;
    spots.sort((a, c) => (pl ? Math.hypot(c.x - pl.x, c.z - pl.z) - Math.hypot(a.x - pl.x, a.z - pl.z) : 0) + (rnd.next() - 0.5) * 3);
    let k = 0;
    for (const g of list) {
      for (let n = 0; n < (g.n || 1); n++) {
        const A = b && b.anchors;
        const s = g.boss && A && (A.boss || A.center) ? A.boss || A.center : spots[k % spots.length];
        k++;
        const jx = g.boss ? 0 : (rnd.next() - 0.5) * 0.8, jz = g.boss ? 0 : (rnd.next() - 0.5) * 0.8;
        let e = null;
        const spawn = s.from === 'ceiling' ? 'drop' : s.from === 'floor' ? 'burrow' : s.from === 'spores' ? 'spores' : undefined;
        try { e = Enemies.spawnEnemy(aw, g.id, s.x + jx, s.z + jz, { elite: !!g.elite, boss: !!g.boss, stage: this.stage, delay: k * 0.16, spawn }); } catch (err) { console.error('spawnEnemy', g.id, err); }
        if (!e) continue;
        if (g.boss || (MONSTERS[g.id] && MONSTERS[g.id].tier === 'boss')) this.boss = e;
      }
    }
    this.game.audio && this.game.audio.play('spawn_puff', { vol: 0.6 });
  }
  alive() { return this.aw.enemies.filter((e) => !e.dead); }
  updateWaves(dt) {
    const W = this.waves;
    if (!W || W.done) return;
    // the boss cutscene closed without calling back (skipped or popped): bring the boss anyway
    if (W.cut && W.t > 50 && !this.game.overlays.some((o) => o.name === 'cutscene')) { W.cut = null; W.t = 0.1; }
    W.t -= dt;
    if (W.i >= 0 && this.alive().length > 0) return;
    if (W.i >= 0 && W.t > 0.8) W.t = 0.8;
    if (W.t > 0) return;
    W.i++;
    if (W.i < W.list.length) { this.spawnWave(W.list[W.i]); W.t = 1.0; return; }
    W.done = true;
    this.onClear(this.curRoom, false);
  }
  onClear(r, quiet) {
    const was = r.cleared;
    r.cleared = true;
    const st = this.roomState(r.id);
    this.setDoors(1, quiet ? 0 : 0.6);
    if (was || st.rewarded) return;
    st.rewarded = true;
    const run = this.run;
    if (has(run, 'roomCleared')) {
      const res = run.roomCleared();
      if (res && res.healed) { if (this.player) this.player.hp = Math.min(this.player.maxHp, this.player.hp + res.healed); hudToast(this.hud, `+${res.healed} HP`, { icon: 'heart', color: '#9affb0' }); }
      if (res && res.expired) for (const n of res.expired) hudToast(this.hud, `${n} wore off`, { color: '#cbb89a' });
      this.refreshLoadout();
    }
    if (quiet) return;
    this.game.audio && this.game.audio.play('room_clear', { vol: 0.8 });
    if (r.type === 'boss') { this.onBossDown(r); return; }
    let items = [];
    try { items = (Loot.roomReward && Loot.roomReward(run, r)) || []; } catch (e) { items = []; }
    const c = (this.built && this.built.anchors && this.built.anchors.center) || { x: 0, z: 0 };
    items.forEach((it, i) => { const a = (i / Math.max(1, items.length)) * Math.PI * 2; this.pickups.spawn(it, c.x + Math.cos(a) * 0.7, c.z + Math.sin(a) * 0.5, { from: { x: c.x, z: c.z }, delay: i * 0.12 }); });
  }
  onBossDown(r) {
    const game = this.game, run = this.run, st = this.roomState(r.id);
    let items = [];
    try { items = (Loot.bossLoot && Loot.bossLoot(run, this.stage)) || []; } catch (e) { items = []; }
    const c = (this.built && this.built.anchors && (this.built.anchors.boss || this.built.anchors.center)) || { x: 0, z: -1 };
    items.forEach((it, i) => this.pickups.spawn(it, c.x + (i - (items.length - 1) / 2) * 0.9, c.z + 1.4, { from: { x: c.x, z: c.z }, delay: 0.8 + i * 0.15 }));
    st.hole = true;
    this.later(1.6, () => this.addHole());
    // the boss held a friend in stone: free them (unlocks them as a hero)
    const friend = has(run, 'friendForStage') ? run.friendForStage(this.stage) : null;
    if (friend) {
      try { has(run, 'rescue') && run.rescue(friend); } catch (e) { /* ignore */ }
      const id = 'rescue_' + friend;
      if (fn(Cut, 'hasCutscene') && Cut.hasCutscene(id) && game.scenes.cutscene) this.later(2.6, () => game.pushOverlay('cutscene', { id, char: run.char, onDone: () => this.refreshLoadout() }));
      else this.later(2.2, () => { this.banner = { text: `${friend[0].toUpperCase() + friend.slice(1)} is free!`, sub: 'New hero unlocked', t: 0 }; });
    }
  }

  // ================================================================== kills, drops, statues
  bindWorld(aw) {
    aw.on('enemyKilled', (ev) => this.onKill(ev));
    aw.on('playerDead', () => this.onDeath());
    aw.on('bossPhase', (ev) => { if (ev && ev.text) this.banner = { text: ev.text, t: 0.4, small: true }; this.game.audio && this.game.audio.play('herald_roar', { vol: 0.6, pitch: 0.8 }); });
    aw.on('playerHurt', () => { const m = this.petF && this.petF.model; if (has(m, 'play')) m.play('yelp'); });
  }
  onKill(ev) {
    const e = ev.enemy || ev;
    if (this.killed.has(e)) return;
    this.killed.add(e);
    const run = this.run;
    const def = ev.def || e.def || MONSTERS[ev.id || e.id] || {};
    const x = ev.x ?? e.x, z = ev.z ?? e.z;
    if (run.stats) run.stats.kills = (run.stats.kills || 0) + 1;
    let drops = [];
    try { drops = (Loot.rollDrops && Loot.rollDrops(run, def, { elite: !!(ev.elite || e.elite) })) || []; } catch (err) { drops = []; }
    drops.forEach((it, i) => { const a = rnd.next() * Math.PI * 2, d = 0.5 + rnd.next() * 0.6; this.pickups.spawn(it, x + Math.cos(a) * d, z + Math.sin(a) * d, { from: { x, z }, delay: 0.15 + i * 0.1 }); });
    // the stone axe petrifies what it kills: the ore-bearing ones stay as minable statues
    let chance = 0.5;
    try { chance = Loot.petrifyChance ? Loot.petrifyChance(this.loadout, def) : 0.5; } catch (err) { chance = 0.5; }
    const mon = monsterOf(e) || ev.monster || ev.statue;
    if (!mon) return;
    if (rnd.next() < chance) this.makeStatue(e, mon, def, x, z);
    else this.crumble(e, mon);
  }
  makeStatue(e, mon, def, x, z) {
    e.keepModel = true; e.leaveModel = true;
    const g = groupOf(mon);
    if (has(mon, 'petrify') && (mon.stone || 0) < 1 && !mon._stoneAnim) mon.petrify(0.7);
    else if (!has(mon, 'petrify') && has(mon, 'setStone')) mon.setStone(1);
    const st = this.roomState(this.curId);
    const rec = { id: def.id || e.id, x, z, yaw: g ? g.rotation.y : 0, mined: false };
    st.statues.push(rec);
    const s = { id: rec.id, def, x, z, model: mon, rec, r: (e.radius || 0.5) + 0.95, enemy: e };
    this.statues.push(s);
    this.addInteract({ kind: 'statue', x, z, r: s.r, label: 'Mine', statue: s, y: (mon.height || 1) + 0.4 });
    if (g && !g.parent) { g.position.set(x, 0, z); this.scene3.add(g); }
  }
  /** Not ore-bearing: the stone body crumbles to rubble a moment later. */
  crumble(e, mon) {
    e.keepModel = true; e.leaveModel = true;
    if (has(mon, 'petrify') && (mon.stone || 0) < 1 && !mon._stoneAnim) mon.petrify(0.5);
    const room = this.curId;
    this.later(0.9, () => {
      if (this.curId !== room) return;
      let sh = null;
      try { sh = has(mon, 'shatter') ? mon.shatter() : null; } catch (err) { sh = null; }
      if (sh) { sh.enemy = e; this.shards.push(sh); } else { const g = groupOf(mon); if (g && g.parent) g.parent.remove(g); if (has(e, 'removeStatue')) e.removeStatue(); }
      this.game.audio && this.game.audio.play('stone_crack', { vol: 0.35 });
    });
  }
  restoreStatues(st) {
    for (const rec of st.statues) {
      if (rec.mined) continue;
      let m = null;
      try { m = Monsters.buildMonster ? Monsters.buildMonster(rec.id) : null; } catch (e) { m = null; }
      const g = groupOf(m);
      if (g) { g.position.set(rec.x, 0, rec.z); g.rotation.y = rec.yaw || 0; this.scene3.add(g); if (has(m, 'setStone')) m.setStone(1); if (has(m, 'update')) m.update(0); }
      const s = { id: rec.id, def: MONSTERS[rec.id], x: rec.x, z: rec.z, model: m, rec, r: 1.4 };
      this.statues.push(s);
      this.addInteract({ kind: 'statue', x: rec.x, z: rec.z, r: s.r, label: 'Mine', statue: s, y: ((m && m.height) || 1) + 0.4 });
    }
  }
  updateStatues(dt) {
    const key = this.aw.time;
    for (const s of this.statues) {
      const m = s.model;
      if (!m || s.rec.mined || !has(m, 'update')) continue;
      if ((m._stoneAnim || (m.cracks && m.cracks.length)) && m._tick !== key) { m._tick = key; m.update(dt); }
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i];
      try { sh.update && sh.update(dt); } catch (e) { this.shards.splice(i, 1); continue; }
      if (sh.done) { try { sh.dispose && sh.dispose(); } catch (e) { /* ignore */ } if (sh.enemy && has(sh.enemy, 'removeStatue')) { try { sh.enemy.removeStatue(); } catch (e) { /* ignore */ } } this.shards.splice(i, 1); }
    }
  }

  // ================================================================== interactables
  /** Register something you can use: the engine's player finds it and calls onInteract. */
  addInteract(it) {
    it.onInteract = () => this.interact(it);
    it.enabled = true;
    this.inter.push(it);
    this.aw.addInteractable(it);
    return it;
  }
  disable(it) { it.used = true; it.enabled = false; this.aw.removeInteractable(it); }
  setupInteractables(r, st) {
    const b = this.built, A = (b && b.anchors) || {};
    (b && b.veins || []).forEach((v, i) => {
      if (st.veins.includes(i)) { has(v, 'setMined') && v.setMined(1); return; }
      this.addInteract({ kind: 'vein', x: v.x, z: v.z, r: 1.6, label: 'Mine', vein: v, idx: i, y: 1.2 });
    });
    if (r.type === 'treasure' && !st.pedestal) this.addPedestal(A.pedestal || A.center || { x: 0, z: -1 }, st);
    if (r.type === 'secret' && !st.chest) { const c = A.chest || A.center || { x: 0, z: -1 }; this.addInteract({ kind: 'chest', x: c.x, z: c.z, r: 1.5, label: 'Open', y: 1.0, secret: true, prop: has(b, 'openChest') ? null : this.addChestProp(c) }); }
    if (r.type === 'craft') { const c = A.bench || A.center || { x: 0, z: -1 }; this.addInteract({ kind: 'bench', x: c.x, z: c.z, r: 1.9, label: 'Craft', station: c.station || 'workbench', y: 1.3 }); }
    if (r.type === 'shrine' && !st.shrine) { const c = A.shrine || A.center || { x: 0, z: -1 }; this.addInteract({ kind: 'shrine', x: c.x, z: c.z, r: 1.9, label: 'Approach', y: 1.6 }); }
    if (r.type === 'boss' && st.hole) this.addHole();
    // hidden doors show as cracks in the wall: smash one open
    for (const d of ['n', 'e', 's', 'w']) {
      if (!r.hidden || !r.hidden[d]) continue;
      const nb = roomOf(this.floor, r.doors[d]);
      if (!nb || nb.visited || nb.found) continue;
      const door = b && b.doors && b.doors[d];
      if (!door) continue;
      const D = DIRS[d];
      this.addInteract({ kind: 'crack', x: door.x - D.x * 0.8, z: door.z - D.z * 0.8, r: 1.4, label: 'Smash', dir: d, y: 1.4 });
    }
  }
  addPedestal(a, st) {
    let it = st.pedestalItem;
    if (!it) {
      let extras = [];
      try { const L = Loot.treasureLoot ? Loot.treasureLoot(this.run) : null; it = L && (L.pedestal || (Array.isArray(L) ? L[0] : null)); extras = (L && L.extras) || []; } catch (e) { it = null; }
      if (!it) it = makeItem('quartz', 3);
      st.pedestalItem = it;
      extras.forEach((x, i) => this.pickups.spawn(x, a.x + (i ? 1 : -1) * 1.2, a.z + 1.0, { pop: false }));
    }
    const p = this.pickups.spawn(it, a.x, a.z, { pop: false });
    if (p) { p.y = 1.0; p.pedestal = true; p.refused = true; p.locked = true; }
    this.addInteract({ kind: 'pedestal', x: a.x, z: a.z, r: 1.5, label: 'Take', y: 1.7, pick: p, item: it });
  }
  addChestProp(c) {
    const g = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a4a26 }), iron = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.5), wood); body.position.y = 0.23; g.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.18, 0.54), wood); lid.position.y = 0.52; g.add(lid);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.56), iron); band.position.y = 0.42; g.add(band);
    g.position.set(c.x, 0, c.z);
    g.userData.lid = lid;
    this.scene3.add(g);
    this.props.push(g);
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
      this.props.push(ring, glow);
    }
    this.addInteract({ kind: 'hole', x: h.x, z: h.z, r: 1.7, label: 'Descend', y: 0.9 });
    this.game.audio && this.game.audio.play('ground_split', { vol: 0.6 });
  }
  interact(it) {
    if (!it || it.used || this.deadT || this.trans) return;
    if (this.inFight() && it.kind !== 'hole') return;
    const game = this.game, run = this.run, st = this.roomState(this.curId);
    if (it.kind === 'statue' || it.kind === 'vein') {
      Flow.openMine(game, {
        kind: it.kind, def: it.statue && it.statue.def, monster: it.statue && it.statue.id, vein: it.vein, stage: this.stage,
        at: { x: it.x, y: it.kind === 'statue' ? 0.9 : 0.8, z: it.z }, cam: this.cam, scene: this,
        onDone: (res) => this.afterMine(it, res),
      });
      return;
    }
    if (it.kind === 'pedestal') {
      const ok = run.addItem ? run.addItem(it.item) : true;
      if (!ok) { const oi = run.bag.overflow.indexOf(it.item); if (oi >= 0) run.bag.overflow.splice(oi, 1); hudToast(this.hud, 'Bag full — Tab to make room', { color: '#ff9a8a', icon: 'bag' }); game.audio && game.audio.play('deny'); return; }
      this.disable(it); st.pedestal = true; st.pedestalItem = null;
      if (it.pick) { this.pickups.list = this.pickups.list.filter((p) => p !== it.pick); this.scene3.remove(it.pick.root); }
      this.collected(it.item, true);
      if (game.scenes.reveal) game.pushOverlay('reveal', { item: it.item, onDone: () => this.refreshLoadout() });
      return;
    }
    if (it.kind === 'chest') {
      this.disable(it); st.chest = true;
      game.audio && game.audio.play('chest_creak');
      if (it.prop && it.prop.userData.lid) { const lid = it.prop.userData.lid; this.tween(0.4, (k) => { lid.rotation.x = -k * 1.1; lid.position.z = -k * 0.15; lid.position.y = 0.52 + k * 0.12; }); }
      if (has(this.built, 'openChest')) this.built.openChest(1);
      let items = [];
      try { const L = Loot.chestLoot ? Loot.chestLoot(run, it.secret ? 'gold' : 'old') : null; items = (L && (L.items || L)) || []; } catch (e) { items = []; }
      if (!Array.isArray(items)) items = [items];
      items.forEach((x, i) => { const a = -Math.PI / 2 + (i - (items.length - 1) / 2) * 0.7; this.pickups.spawn(x, it.x + Math.cos(a) * 1.1, it.z + 0.9 + Math.sin(a) * 0.3, { from: { x: it.x, z: it.z }, delay: 0.25 + i * 0.15 }); });
      return;
    }
    if (it.kind === 'bench') { Flow.openCraft(game, { station: it.station, onClose: () => this.refreshLoadout() }); return; }
    if (it.kind === 'shrine') { this.shrine(it, st); return; }
    if (it.kind === 'crack') {
      this.disable(it);
      if (fn(Floors, 'revealSecret')) Floors.revealSecret(this.floor, this.curRoom, it.dir);
      const nb = roomOf(this.floor, this.curRoom.doors[it.dir]); if (nb) { nb.found = true; nb.known = true; }
      const door = this.built.doors && this.built.doors[it.dir];
      if (door && has(door, 'setState')) door.setState('found');
      if (door && has(door, 'setOpen')) door.setOpen(1);
      this.aw.shake(0.5);
      game.audio && game.audio.play('rock_break', { vol: 0.9 });
      hudToast(this.hud, 'A secret passage!', { icon: 'question', color: '#c8b0ff' });
      return;
    }
    if (it.kind === 'hole') {
      this.disable(it);
      game.audio && game.audio.play('fall', { vol: 0.8 });
      this.syncHp();
      this.leaving = { t: 0 };
      if (this.player && has(this.player, 'lockInput')) this.player.lockInput(true);
      this.later(1.0, () => Flow.nextFloor(game));
    }
  }
  afterMine(it, res) {
    const st = this.roomState(this.curId);
    if (res && res.items && res.items.length) this.refreshLoadout();
    if (res && res.left === false) return; // walked away without a single strike: it's still there
    if (it.kind === 'statue') {
      const s = it.statue;
      this.disable(it); s.rec.mined = true;
      let sh = null;
      try { sh = has(s.model, 'shatter') ? s.model.shatter() : null; } catch (e) { sh = null; }
      if (sh) { sh.enemy = s.enemy; this.shards.push(sh); }
      else { const g = groupOf(s.model); if (g && g.parent) g.parent.remove(g); if (s.enemy && has(s.enemy, 'removeStatue')) s.enemy.removeStatue(); }
      this.game.audio && this.game.audio.play('stone_shatter');
      this.aw.shake(0.35);
    } else {
      this.disable(it); st.veins.push(it.idx);
      if (it.vein && has(it.vein, 'setMined')) it.vein.setMined(1);
    }
    this.refreshLoadout();
  }
  /** A shrine: its text and Durgan's remark float as dialogue; your choices are the replies. */
  shrine(it, st) {
    const game = this.game;
    const list = (Events['SHRINES'] || Events.EVENTS || []).filter((e) => !e.stages || e.stages.includes(this.stage));
    st.shrineId = st.shrineId || (list.length ? list[Math.floor(rnd.next() * list.length)].id : null);
    const ev = list.find((e) => e.id === st.shrineId);
    if (!ev) { st.shrine = true; this.disable(it); return; }
    const at = new THREE.Vector3(it.x, it.y, it.z);
    const me = () => (this.player ? new THREE.Vector3(this.player.x, (this.player.height || 1) + 0.3, this.player.z) : at);
    const lines = [{ who: 'shrine', at, text: String(ev.text || ev.title).replace(/\n/g, ' '), card: { title: ev.title } }];
    for (const l of ev.lines || []) lines.push({ who: l.who, at: l.who === 'pip' && this.petF ? this.petF : l.who === 'shrine' ? at : me, text: l.text });
    const choose = (c) => this.shrineChoice(ev, c, it, st);
    lines.push({ who: 'durgan', at: me, text: '…', replies: (ev.choices || []).map((c) => ({ text: c.label, fn: () => choose(c) })) });
    if (game.scenes.dialogue) game.pushOverlay('dialogue', { lines, cam: this.cam, camera: this.cam.camera, freeze: true });
    else if (ev.choices && ev.choices[0]) choose(ev.choices[0]);
  }
  shrineChoice(ev, c, it, st) {
    const run = this.run;
    let out = null;
    try { out = fn(Events, 'resolveChoice') ? Events.resolveChoice(run, ev, c, run.rng) : c.out ? c.out(run, run.rng) : null; } catch (e) { console.error(e); out = null; }
    if (!out) return;
    if (out.blocked) { hudToast(this.hud, out.text || 'Not now.', { color: '#ff9a8a' }); return; } // the shrine stays: come back later
    // "give an item": the first matching thing in the bag
    if (out.pick) {
      const p = out.pick;
      const cand = run.bag.all().find((x) => MATERIALS[x.id] && (!p.filter || p.filter(MATERIALS[x.id], x)));
      if (!cand) { hudToast(this.hud, 'Nothing to give.', { color: '#ff9a8a' }); return; }
      const name = MATERIALS[cand.id].name;
      try { out = p.then(cand, run, run.rng) || {}; } catch (e) { out = {}; }
      hudToast(this.hud, `${p.verb || 'Gave'}: ${name}`, { color: '#cbb89a' });
    }
    st.shrine = true; this.disable(it);
    let res = null;
    try { res = fn(Events, 'applyOutcome') ? Events.applyOutcome(run, out) : null; } catch (e) { console.error(e); res = null; }
    if (out.text) this.banner = { text: out.text, t: 0.4, small: true };
    if (out.hp && this.player) this.player.hp = clamp(run.hp, 1, this.player.maxHp);
    if (res) {
      for (const x of res.items || []) this.collected(x, true);
      for (const x of res.overflow || []) { const oi = run.bag.overflow.indexOf(x); if (oi >= 0) run.bag.overflow.splice(oi, 1); this.pickups.spawn(x, it.x + (rnd.next() - 0.5) * 1.4, it.z + 1.2, { from: { x: it.x, z: it.z } }); }
      if (res.learned) hudToast(this.hud, 'Recipe learned', { icon: 'recipe', color: '#ffe08a' });
      if (res.fight) {
        const ids = [].concat(res.fight).filter((x) => MONSTERS[x]);
        if (ids.length) { this.waves = { list: [ids.map((id) => ({ id, n: 1, elite: !!res.elite }))], i: -1, t: 0.5, done: false }; this.curRoom.cleared = false; this.roomState(this.curId).rewarded = false; this.setDoors(0, 0.3); }
      }
    }
    this.refreshLoadout();
  }
  collected(item, quiet) {
    const m = MATERIALS[item.id];
    const name = (m && m.name) || item.name || item.id;
    hudToast(this.hud, name, { item, color: rarityColor(item) });
    if (!quiet) this.game.audio && this.game.audio.play(rarityOf(item) === 'common' ? 'pickup' : 'ore_rare', { vol: 0.6 });
  }

  // ================================================================== Pip
  spawnPet() {
    if (!this.petF) {
      let model = null;
      try { model = Pet.buildPet ? Pet.buildPet() : null; } catch (e) { model = null; }
      if (!model || !Action.PetFollower) return;
      this.petF = new Action.PetFollower(this.aw, model);
    }
    const pf = this.petF, p = this.player;
    pf.x = p ? p.x - 0.7 : 0; pf.z = p ? p.z + 0.6 : 0;
    this.aw.add(pf);
  }

  // ================================================================== transitions
  checkDoors() {
    const p = this.player, b = this.built, r = this.curRoom;
    if (!p || !b || !b.doors || this.trans || this.inFight() || (this.doorK ?? 1) < 0.9 || p.dead) return;
    for (const d of ['n', 'e', 's', 'w']) {
      const door = b.doors[d], nid = r.doors && r.doors[d];
      if (!door || nid === null || nid === undefined) continue;
      if (r.hidden && r.hidden[d]) { const nb = roomOf(this.floor, nid); if (!nb || !(nb.found || nb.visited)) continue; }
      const D = DIRS[d];
      const along = (p.x - door.x) * D.x + (p.z - door.z) * D.z;
      const side = Math.abs((p.x - door.x) * D.z) + Math.abs((p.z - door.z) * D.x);
      if (along > -0.6 && side < 1.15) { this.startTransition(d, nid); return; }
    }
  }
  startTransition(dir, nid) {
    this.trans = { dir, nid, t: 0, phase: 'out', cam0: this.cam.camera.position.clone() };
    if (this.player && has(this.player, 'lockInput')) this.player.lockInput(true);
    this.game.audio && this.game.audio.play('door_through', { vol: 0.6 });
  }
  updateTransition(dt) {
    const T = this.trans;
    T.t += dt;
    const D = DIRS[T.dir];
    const cam = this.cam.camera, p = this.player;
    if (T.phase === 'out') {
      const k = ease.inQuad(clamp(T.t / 0.24));
      cam.position.copy(T.cam0).add(v3.set(D.x * 4 * k, 0, D.z * 4 * k));
      this.fade = k * 0.96;
      if (p && p.obj) p.obj.position.set(p.x + D.x * 1.3 * k, 0, p.z + D.z * 1.3 * k);
      if (T.t >= 0.24) { this.enterRoom(T.nid, T.dir); T.phase = 'in'; T.t = 0; }
    } else {
      this.aw.update(0); // places models and settles the camera on the new room
      const k = ease.outCubic(clamp(T.t / 0.34));
      cam.position.add(v3.set(-D.x * 4 * (1 - k), 0, -D.z * 4 * (1 - k)));
      this.fade = (1 - k) * 0.96;
      if (T.t >= 0.34) { this.trans = null; this.fade = 0; if (p && has(p, 'lockInput')) p.lockInput(false); }
    }
  }

  // ================================================================== helpers
  later(t, f) { (this.timers || (this.timers = [])).push({ t, fn: f }); }
  tween(dur, f) { (this.tweens || (this.tweens = [])).push({ t: 0, dur, fn: f }); }
  project(x, y, z) {
    if (has(this.cam, 'project')) return this.cam.project(x, y, z, 960, 540);
    v3.set(x, y, z).project(this.cam.camera);
    return { x: (v3.x + 1) / 2 * 960, y: (1 - v3.y) / 2 * 540 };
  }
  onDeath() {
    if (this.deadT) return;
    this.deadT = 0.001;
    this.syncHp();
    this.game.audio && this.game.audio.play('defeat_sting');
  }
  pressed(...codes) { const inp = this.game.input; return codes.some((c) => inp.keyPressed(c)); }
  action(name) { try { return this.game.input.actionPressed(name); } catch (e) { return false; } }

  // ================================================================== frame
  update(dt) {
    const game = this.game;
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
    if (this.trans) { this.updateTransition(dt); return; }
    if (this.leaving) { this.leaving.t += dt; this.fade = clamp(this.leaving.t / 0.9); }
    else this.fade = Math.max(0, this.fade - dt * 2.2);
    // ---- the world (it drives the camera and the room too)
    this.aw.update(dt);
    if (this.deadT) { this.deadT += dt; if (this.deadT > 2.2 && !this.goneOver) { this.goneOver = true; Flow.gameOver(game, 'stone'); } }
    if (this.player && !this.deadT && (this.player.dead || this.player.hp <= 0)) this.onDeath();
    this.syncHp();
    this.updateWaves(dt);
    this.updateStatues(dt);
    this.pickups.update(dt, {
      player: this.player, radius: Math.max(1.6, ((this.loadout.stats && this.loadout.stats.pickupRadius) || 1.2) + 0.5),
      tryTake: (it) => {
        const ok = this.run.addItem ? this.run.addItem(it) : true;
        if (!ok) { const oi = this.run.bag.overflow.indexOf(it); if (oi >= 0) this.run.bag.overflow.splice(oi, 1); }
        return ok;
      },
      onTake: (it) => {
        this.collected(it);
        const r = rarityOf(it);
        if ((r === 'epic' || r === 'legendary') && game.scenes.reveal && !this.inFight()) game.pushOverlay('reveal', { item: it, auto: 2.2, onDone: () => this.refreshLoadout() });
        else this.refreshLoadout();
      },
      onFull: () => { hudToast(this.hud, 'Bag full — Tab to make room', { color: '#ff9a8a', icon: 'bag' }); game.audio && game.audio.play('deny', { vol: 0.5 }); },
      onBounce: () => game.audio && game.audio.play('item_place', { vol: 0.2 }),
    });
    this.pumpPrebuild(dt);
    if (!this.leaving) this.checkDoors();
    // ---- input
    if (this.action('bag') && !this.deadT) this.openBag();
    if (this.pressed('KeyM')) this.mapHeld = !this.mapHeld;
    this.mapOpen += ((this.mapHeld ? 1 : 0) - this.mapOpen) * Math.min(1, dt * 12);
    if (this.action('back')) { if (this.mapHeld) this.mapHeld = false; else if (!game.overlays.length) game.pushOverlay('pause'); }
  }
  openBag() {
    // what you leave on the cloth stays on the floor of this room
    this.syncHp();
    Flow.openBag(this.game, {
      onClose: () => { this.runHpDirty = true; this.refreshLoadout(); },
      onLeave: (items) => { const p = this.player; for (const it of items) this.pickups.spawn(it, (p ? p.x : 0) + (rnd.next() - 0.5) * 1.6, (p ? p.z : 0) + 0.8 + rnd.next() * 0.6, { from: { x: p ? p.x : 0, z: p ? p.z : 0 } }); },
    });
  }

  /** Small HP bars over hurt foes; elites also get their name. */
  drawEnemyBars(ui) {
    const ctx = ui.ctx;
    for (const e of this.aw.enemies) {
      if (e.dead || e.boss || e === this.boss || !e.maxHp) continue;
      if (e.hp >= e.maxHp && !e.elite) continue;
      const h = (e.height || (e.model && e.model.height) || 1) + 0.35;
      const p = this.project(e.x, h, e.z);
      const w = e.elite ? 46 : 28, x = Math.round(p.x - w / 2), y = Math.round(p.y - 6);
      if (x < -60 || x > ui.w + 10 || y < -20 || y > ui.h) continue;
      const k = clamp(e.hp / e.maxHp);
      ctx.fillStyle = '#140c10'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = '#3a1418'; ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = e.elite ? '#e8a030' : '#d8343a'; ctx.fillRect(x, y, Math.round(w * k), 3);
      if (e.elite) { const d = e.def || MONSTERS[e.id] || {}; ui.text(d.name || 'Elite', p.x, y - 10, { align: 'center', font: 'small', color: '#ffd27a', outline: '#140c10' }); }
    }
  }

  draw(ui) {
    const game = this.game, ctx = ui.ctx;
    const touch = ui.touch;
    if (game.overlays.length) {
      if (this.fade > 0.01) { ctx.globalAlpha = clamp(this.fade); ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, ui.w, ui.h); ctx.globalAlpha = 1; }
      return;
    }
    // damage numbers, impacts and (touch) the action controls
    if (!this.trans) this.aw.drawUI(ui);
    if (!this.trans) this.drawEnemyBars(ui);
    let prompt = null;
    const it = this.player && this.player.interactTarget;
    if (it && !this.trans && !it.used && !(this.inFight() && it.kind !== 'hole')) {
      const p = this.project(it.x, it.y || 1.2, it.z);
      prompt = { x: p.x, y: p.y, label: it.label || 'Use', key: 'F' };
    }
    const out = drawActionHud(ui, this.hud, {
      player: this.player, loadout: this.loadout, run: this.run, touch, hidden: !!this.trans || this.mapOpen > 0.5 || !!this.leaving,
      boss: this.boss && !this.boss.dead ? (() => { const b = this.boss, d = b.def || MONSTERS[b.id] || {}; const ph = Array.isArray(d.phases) ? d.phases.length : (b.phases || d.phases || 3); return { name: d.name || 'Boss', title: d.title, hp: b.hp, maxHp: b.maxHp, phases: ph }; })() : null,
      interact: touch ? null : prompt,
    });
    if (out.bag) this.openBag();
    if (out.interact && it) this.interact(it);
    drawMinimap(ui, this.floor, this.curId, { x: ui.w - 7 * 20 - 3 - (touch ? 40 : 10), alpha: this.trans ? 0.5 : 1 });
    if (this.mapOpen > 0.02) drawBigMap(ui, this.floor, this.curId, this.mapOpen, { title: this.sdef.name });
    const B = this.banner;
    if (B && B.t > 0) {
      const a = B.t < 0.4 ? B.t / 0.4 : B.t > 2.6 ? 1 - (B.t - 2.6) / 0.6 : 1;
      ctx.globalAlpha = clamp(a);
      if (B.small) ui.text(B.text, ui.w / 2, 120, { align: 'center', color: '#ffe8b0', outline: '#140c10' });
      else {
        const y = B.boss ? ui.h * 0.72 : 92;
        ui.big(B.text, ui.w / 2, y, { scale: B.boss ? 3 : 2, top: B.boss ? '#ffe0a0' : '#f4ead6', bottom: B.boss ? '#c84a2a' : '#c8a070' });
        if (B.sub) ui.text(B.sub, ui.w / 2, y + (B.boss ? 22 : 16), { align: 'center', color: '#cbb89a', outline: '#140c10' });
      }
      ctx.globalAlpha = 1;
    }
    let f = this.fade;
    if (this.deadT) f = Math.max(f, clamp((this.deadT - 0.9) / 1.2) * 0.92);
    if (f > 0.01) { ctx.globalAlpha = clamp(f); ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, ui.w, ui.h); ctx.globalAlpha = 1; }
  }
}
