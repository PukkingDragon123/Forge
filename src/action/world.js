// ActionWorld: the real-time combat simulation for one room. Fixed 60 Hz steps (independent of the
// render rate), circle-vs-tile collision with sliding, soft crowd separation, central damage with
// hit-stop / knockback / flash / numbers / statuses / events, projectiles, ground telegraphs,
// pickups with magnet, interactables, timers, slow-mo, and the FX layer.
import * as THREE from 'three';
import { Grid, FLOOR } from './grid.js';
import { Entity } from './entity.js';
import { FX } from './fx.js';
import { HadesCam } from './camera.js';

export const STEP = 1 / 60;
const TAU = Math.PI * 2;
const hexRgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

export const STATUS_COLORS = { burn: '#ff8a3a', poison: '#8aff5a', slow: '#9ab8ff', freeze: '#9ae8ff', stun: '#ffe85a', bleed: '#ff4a5a', root: '#b8d080' };
const DOT = { burn: 6, bleed: 4, poison: 2.2 }; // damage per second (poison per stack)
/** Rooms bring their own grid class (C's RoomGrid): give it the collision helpers the engine needs. */
export function adaptGrid(g) {
  if (!g) return new Grid();
  for (const k of ['at', 'blocks', 'blocksShot', 'circleFree', 'freeNear']) if (typeof g[k] !== 'function') g[k] = Grid.prototype[k];
  return g;
}

// ------------------------------------------------------------------ projectiles
const projGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
projGeo.userData.keep = true;
export class Projectile {
  constructor(world, o) {
    this.world = world;
    this.team = o.team || 'enemy';
    this.x = o.x; this.z = o.z; this.y = o.y ?? 0.6;
    const d = o.dir || { x: 0, z: 1 }, L = Math.hypot(d.x, d.z) || 1;
    this.speed = o.speed ?? 8;
    this.vx = (d.x / L) * this.speed; this.vz = (d.z / L) * this.speed;
    this.radius = o.radius ?? 0.18;
    this.dmg = o.dmg ?? 5;
    this.life = o.life ?? 2.5; this.age = 0;
    this.pierce = o.pierce ?? 0;
    this.kb = o.kb ?? 0.3;
    this.status = o.status || null;
    this.color = o.color || (this.team === 'player' ? '#ffd27a' : '#ff6a4a');
    this.onHit = o.onHit || null;
    this.onEnd = o.onEnd || null;
    this.homing = o.homing || 0;
    this.gravity = o.gravity || 0; this.vy = o.vy || 0;
    this.spin = o.spin ?? 8;
    this.trail = o.trail !== false;
    this.hits = new Set();
    this.dead = false;
    this.source = o.source || null;
    this.element = o.element || null;
    this.crit = !!o.crit;
    if (o.model) this.mesh = o.model;
    else {
      this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.color).multiplyScalar(2.2) });
      this.mesh = new THREE.Mesh(projGeo, this.mat);
      const s = (this.radius / 0.18) * (o.scale ?? 1);
      this.mesh.scale.setScalar(s);
    }
    this.mesh.position.set(this.x, this.y, this.z);
    world.fx.root.add(this.mesh);
  }
  step(h) {
    const w = this.world;
    this.age += h;
    if (this.homing) {
      const t = w.nearestOf(this.team === 'player' ? w.enemies : w.player ? [w.player] : [], this.x, this.z, 8);
      if (t) {
        const dx = t.x - this.x, dz = t.z - this.z, L = Math.hypot(dx, dz) || 1;
        const k = Math.min(1, this.homing * h);
        this.vx += ((dx / L) * this.speed - this.vx) * k; this.vz += ((dz / L) * this.speed - this.vz) * k;
      }
    }
    if (this.gravity) { this.vy -= this.gravity * h; this.y += this.vy * h; if (this.y <= 0.05) { this.end(true); return; } }
    this.x += this.vx * h; this.z += this.vz * h;
    if (w.grid.blocksShot(w.grid.at(this.x, this.z))) { this.end(true); return; }
    const foes = this.team === 'player' ? w.enemies : w.player ? [w.player, ...w.allies.filter((a) => a.team === 'player' && a.hp !== undefined)] : [];
    for (const e of foes) {
      if (!e || e.dead || this.hits.has(e)) continue;
      const r = this.radius + e.radius;
      if ((e.x - this.x) ** 2 + (e.z - this.z) ** 2 > r * r) continue;
      if (e.untargetable) continue;
      this.hits.add(e);
      const L = Math.hypot(this.vx, this.vz) || 1;
      const dealt = w.damage(e, { dmg: this.dmg, kb: this.kb, dir: { x: this.vx / L, z: this.vz / L }, status: this.status, source: this.source || this, element: this.element, crit: this.crit, tag: 'projectile' });
      if (this.onHit) this.onHit(e, this, dealt);
      if (this.pierce-- <= 0) { this.end(false); return; }
    }
    if (this.age >= this.life) this.end(false);
  }
  end(wall) {
    if (this.dead) return;
    this.dead = true;
    const w = this.world;
    if (wall) w.fx.spark(this.x, this.y, this.z, this.color, 6, { speed: [1, 3] });
    if (this.onEnd) this.onEnd(this, wall);
    this.mesh.parent && this.mesh.parent.remove(this.mesh);
    if (this.mat) this.mat.dispose();
  }
  sync(dt) {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.x += this.spin * dt; this.mesh.rotation.y += this.spin * 0.7 * dt;
    if (this.trail && Math.random() < 0.7) this.world.fx.glow(this.x, this.y, this.z, this.color, 1, { spread: 0.03, ySpread: 0.03, vel: [0, 0.1, 0], drift: 0.1, life: [0.12, 0.25], size: [1, 2] });
  }
}

// ------------------------------------------------------------------ the world
export class ActionWorld {
  constructor(game, opts = {}) {
    this.game = game;
    this.scene = opts.scene || new THREE.Scene();
    this.cam = opts.cam || new HadesCam(opts.camOpts || {});
    this.fx = new FX(this);
    this.scene.add(this.fx.root);
    this.room = null;
    this.grid = new Grid();
    this.player = null;
    this.enemies = [];        // team 'enemy' entities
    this.allies = [];         // player-side helpers (turrets, summons) and neutral actors
    this.projectiles = [];
    this.pickups = [];
    this.interactables = [];
    this.time = 0;            // simulated seconds
    this.acc = 0;
    this.stop = 0;            // hit-stop seconds left (real time)
    this.scale = 1;           // slow-mo
    this.slow = null;
    this.timers = [];
    this._ev = {};
    this.hadEnemies = false;
    this.paused = false;
    this.fxScale = 1;
    this.maxDt = 0.1;         // frame-time cap (tests on slow machines raise this with maxSteps)
    this.maxSteps = 8;
    this.stats = { hits: 0, kills: 0, dmgDealt: 0, dmgTaken: 0 };
    if (opts.room) this.setRoom(opts.room);
  }

  // ---------------------------------------------------------------- room
  /** Swap in a room (C's Room). Keeps the player; clears foes, shots, pickups, interactables. */
  setRoom(room) {
    if (this.room && this.room.group && this.room.group.parent === this.scene) this.scene.remove(this.room.group);
    this.room = room;
    this.grid = adaptGrid(room.grid);
    if (room.group && !room.group.parent) this.scene.add(room.group);
    if (room.fog) this.scene.fog = room.fog;
    const bg = room.bgColor || room.bg || (room.background && room.background.isColor ? room.background : null);
    if (bg) this.scene.background = bg;
    if (room.setCamera) room.setCamera(this.cam.camera);
    if (room.bounds) this.cam.setBounds(room.bounds);
    for (const e of [...this.enemies]) this.remove(e);
    for (const a of [...this.allies]) this.remove(a);
    for (const p of this.projectiles) p.end(false);
    this.projectiles = []; this.pickups.forEach((p) => p.obj && p.obj.parent && p.obj.parent.remove(p.obj)); this.pickups = [];
    this.interactables = []; this.timers = []; this.hadEnemies = false;
  }

  // ---------------------------------------------------------------- entities
  add(e) {
    if (e.team === 'enemy') { if (!this.enemies.includes(e)) this.enemies.push(e); this.hadEnemies = true; }
    else if (e !== this.player && !this.allies.includes(e)) this.allies.push(e);
    e.world = this;
    const o = e.obj;
    if (o && !o.parent) this.scene.add(o);
    return e;
  }
  remove(e) {
    this.enemies = this.enemies.filter((x) => x !== e);
    this.allies = this.allies.filter((x) => x !== e);
    const o = e.obj;
    if (o && o.parent) o.parent.remove(o);
    if (e.onRemove) e.onRemove(this);
  }
  /** Convenience for scenes: put the player in (Player calls this itself when constructed). */
  setPlayer(p) { this.player = p; p.world = this; const o = p.obj; if (o && !o.parent) this.scene.add(o); this.cam.follow(p, true); return p; }
  get all() { return this.player ? [this.player, ...this.enemies, ...this.allies] : [...this.enemies, ...this.allies]; }

  // ---------------------------------------------------------------- time & feel
  hitStop(t) {
    if (t <= 0) return;
    this.stop = Math.max(this.stop, t);
    const g = this.game;
    if (g && g.haptic) g.haptic(Math.min(40, Math.round(8 + t * 300)));
  }
  slowmo(scale = 0.3, dur = 0.6) { this.slow = { scale, dur, t: 0 }; }
  shake(a = 0.3) { this.cam.shake(a); }
  flash(color = '#ffffff', a = 0.3) { const r = this.game && this.game.renderer; if (r && r.doFlash) r.doFlash(a, typeof color === 'string' ? hexRgb(color) : color); }
  after(t, fn) { const tm = { at: this.time + t, fn }; this.timers.push(tm); return tm; }
  every(period, n, fn, delay = 0) { for (let i = 0; i < n; i++) this.after(delay + period * i, () => fn(i)); }

  // ---------------------------------------------------------------- events
  on(ev, fn) { (this._ev[ev] || (this._ev[ev] = [])).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { if (this._ev[ev]) this._ev[ev] = this._ev[ev].filter((f) => f !== fn); }
  emit(ev, data) { for (const f of [...(this._ev[ev] || [])]) { try { f(data); } catch (e) { console.error(e); } } }

  // ---------------------------------------------------------------- collision & queries
  /** Move a circle through the grid, sliding along walls. Sub-steps so dashes can't tunnel. */
  moveCircle(e, dx, dz) {
    const L = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(L / 0.15));
    const sx = dx / n, sz = dz / n;
    let hit = false;
    for (let i = 0; i < n; i++) {
      e.x += sx; e.z += sz;
      if (this.resolve(e)) hit = true;
    }
    return hit;
  }
  /** Push a circle out of blocked tiles. Returns true if it touched something. */
  resolve(e) {
    const g = this.grid, r = e.radius, t = g.tile, fly = !!e.fly;
    let touched = false;
    for (let it = 0; it < 3; it++) {
      const [a0, b0] = g.toTile(e.x - r, e.z - r), [a1, b1] = g.toTile(e.x + r, e.z + r);
      let moved = false;
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
        if (!g.blocks(g.get(a, b), fly)) continue;
        const [cx, cz] = g.toWorld(a, b);
        const nx = Math.max(cx - t / 2, Math.min(e.x, cx + t / 2)), nz = Math.max(cz - t / 2, Math.min(e.z, cz + t / 2));
        let ddx = e.x - nx, ddz = e.z - nz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-5) { // centre inside the tile: push out along the shallowest axis
          const px = e.x - cx, pz = e.z - cz;
          if (Math.abs(px) > Math.abs(pz)) { ddx = Math.sign(px) || 1; ddz = 0; } else { ddx = 0; ddz = Math.sign(pz) || 1; }
          d = 0;
          e.x = (ddx ? cx + ddx * (t / 2 + r) : e.x); e.z = (ddz ? cz + ddz * (t / 2 + r) : e.z);
        } else {
          const push = r - d;
          e.x += (ddx / d) * push; e.z += (ddz / d) * push;
        }
        moved = true; touched = true;
      }
      if (!moved) break;
    }
    return touched;
  }
  queryCircle(x, z, r, filter = null) {
    const out = [];
    for (const e of this.all) {
      if (e.dead) continue;
      if (filter && !filter(e)) continue;
      const rr = r + (e.radius || 0);
      if ((e.x - x) ** 2 + (e.z - z) ** 2 <= rr * rr) out.push(e);
    }
    return out;
  }
  nearestOf(list, x, z, maxR = Infinity, filter = null) {
    let best = null, bd = maxR * maxR;
    for (const e of list) {
      if (!e || e.dead || e.untargetable || (filter && !filter(e))) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  nearestEnemy(x, z, maxR = Infinity, filter = null) { return this.nearestOf(this.enemies, x, z, maxR, filter); }
  lineOfSight(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (this.grid.tile * 0.5)));
    for (let i = 1; i < n; i++) { const k = i / n; if (this.grid.blocksShot(this.grid.at(ax + (bx - ax) * k, az + (bz - az) * k))) return false; }
    return true;
  }
  /** Is (x, z) inside a shape? shape: { shape:'circle'|'cone'|'line'|'ring', x, z, r, r0, angle, dir{x,z}, len, width } (+ target radius pad). */
  inShape(s, x, z, pad = 0) {
    const dx = x - s.x, dz = z - s.z;
    const shape = s.shape || 'circle';
    if (shape === 'circle') return dx * dx + dz * dz <= (s.r + pad) ** 2;
    if (shape === 'ring') { const d = Math.hypot(dx, dz); return d <= s.r + pad && d >= (s.r0 ?? s.r * 0.6) - pad; }
    const dir = s.dir || { x: Math.sin(s.facing || 0), z: Math.cos(s.facing || 0) };
    const L = Math.hypot(dir.x, dir.z) || 1, ux = dir.x / L, uz = dir.z / L;
    const along = dx * ux + dz * uz, side = -dx * uz + dz * ux;
    if (shape === 'line') return along >= -pad && along <= (s.len ?? 4) + pad && Math.abs(side) <= (s.width ?? 1) / 2 + pad;
    if (shape === 'cone') {
      const d = Math.hypot(dx, dz);
      if (d > (s.r ?? 2) + pad) return false;
      if (d < pad + 0.2) return true;
      return Math.acos(Math.max(-1, Math.min(1, along / d))) <= (s.angle ?? 1.2) / 2 + Math.atan2(pad, d);
    }
    return false;
  }
  /** Damage everything of `team` inside a shape. Returns the list hit. */
  areaDamage(shape, hit, opts = {}) {
    const team = opts.team || 'enemy';
    const list = team === 'enemy' ? this.enemies : this.player ? [this.player] : [];
    const out = [];
    for (const e of [...list]) {
      if (e.dead || e.untargetable || (opts.exclude && opts.exclude.has(e))) continue;
      if (!this.inShape(shape, e.x, e.z, e.radius || 0)) continue;
      const dir = hit.dir || { x: e.x - shape.x, z: e.z - shape.z };
      const L = Math.hypot(dir.x, dir.z) || 1;
      this.damage(e, { ...hit, dir: { x: dir.x / L, z: dir.z / L } });
      out.push(e);
      if (opts.exclude) opts.exclude.add(e);
    }
    return out;
  }

  // ---------------------------------------------------------------- damage
  /**
   * The one place damage happens. hit: { dmg, crit?, kb (metres), dir {x,z}, stun?, element?,
   * status? {burn|poison|slow|freeze|bleed|root|stun: seconds}, source, tag?, hitstop?, quiet?, ignoreInvuln? }
   */
  damage(t, hit) {
    if (!t || t.dead) return 0;
    if (t.invuln > 0 && !hit.ignoreInvuln) return 0;
    if (t.untargetable) return 0;
    if (t.onBeforeHit && t.onBeforeHit(hit, this) === false) return 0;
    let dmg = Math.max(0, hit.dmg || 0) * (t.dmgTaken ?? 1);
    if (t.status.freeze > 0 && hit.tag !== 'dot') dmg *= 1.25; // frozen foes crack
    if (t.armor && hit.tag !== 'dot') dmg = Math.max(1, dmg - t.armor);
    dmg = Math.round(dmg);
    if (t === this.player && t.onDamaged) dmg = t.onDamaged(dmg, hit, this);
    t.hp -= dmg;
    const isPlayer = t === this.player;
    const quiet = hit.quiet || hit.tag === 'dot';
    // knockback (metres → initial velocity), stun
    const kb = (hit.kb || 0) / Math.max(0.5, t.mass || 1);
    if (kb > 0 && hit.dir && !(t.status.freeze > 0 && hit.tag !== 'freezeHit')) { t.kbx += hit.dir.x * kb * 9; t.kbz += hit.dir.z * kb * 9; }
    if (hit.stun) t.status.stun = Math.max(t.status.stun || 0, hit.stun);
    if (hit.status) this.applyStatus(t, hit.status);
    // feedback
    const y = (t.height || 1) * 0.8 + (t.y || 0);
    if (!quiet || dmg > 0) {
      if (isPlayer) this.fx.number(t.x, y + 0.2, t.z, '-' + dmg, 'hurt');
      else this.fx.number(t.x, y, t.z, dmg, hit.crit ? 'crit' : hit.tag === 'dot' ? 'text' : dmg >= 40 && hit.heavy ? 'heavy' : 'hit', hit.tag === 'dot' ? { color: STATUS_COLORS[hit.element] || '#ffd8a0' } : {});
    }
    if (!quiet) {
      if (t.model && t.model.flash) t.model.flash(isPlayer ? '#ff5a4a' : '#ffffff', isPlayer ? 0.16 : 0.08);
      t.flashT = 0.1;
      const hs = hit.hitstop ?? (isPlayer ? 0.07 : hit.crit ? 0.085 : hit.heavy ? 0.075 : 0.045);
      this.hitStop(hs);
      const hx = t.x - (hit.dir ? hit.dir.x * t.radius * 0.6 : 0), hz = t.z - (hit.dir ? hit.dir.z * t.radius * 0.6 : 0);
      this.fx.impact(hx, y * 0.75, hz, { color: hit.crit ? '#ffe070' : '#ffffff', size: hit.crit || hit.heavy ? 20 : 13 });
      this.fx.spark(hx, y * 0.7, hz, hit.crit ? '#ffe070' : t.sparkColor || '#ffd8a0', hit.crit || hit.heavy ? 16 : 9);
      if (t.chipColors && !isPlayer) this.fx.chipsAt(hx, y * 0.6, hz, t.chipColors, hit.heavy ? 8 : 4, { dir: hit.dir ? [hit.dir.x * 1.5, 0, hit.dir.z * 1.5] : [0, 0, 0] });
      if (isPlayer) { this.cam.shake(0.45); this.flash('#ff2a1a', 0.18); }
      else this.cam.shake(hit.crit || hit.heavy ? 0.22 : 0.1);
      if (hit.dir && !isPlayer) this.cam.punch(hit.dir, hit.heavy ? 0.12 : 0.05);
      const au = this.game && this.game.audio;
      if (au) au.play(isPlayer ? 'player_hurt' : hit.crit ? 'crit' : hit.heavy ? 'heavy_hit' : 'hit', { vol: isPlayer ? 0.9 : 0.6, pitch: 0.9 + Math.random() * 0.25 });
    }
    // bookkeeping + lifesteal / thorns
    if (isPlayer) { this.stats.dmgTaken += dmg; this.emit('playerHurt', { hit, dealt: dmg }); }
    else { this.stats.dmgDealt += dmg; this.stats.hits++; }
    const src = hit.source;
    if (!isPlayer && src && src === this.player && this.player.onDealt) this.player.onDealt(dmg, t, hit);
    this.emit('hit', { target: t, hit, dealt: dmg });
    if (t.hurt) t.hurt(hit, this, dmg);
    if (t.hp <= 0 && !t.dead) this.kill(t, hit);
    return dmg;
  }
  heal(t, n, quiet = false) {
    if (!t || t.dead || n <= 0) return 0;
    const before = t.hp;
    t.hp = Math.min(t.maxHp, t.hp + n);
    const got = Math.round(t.hp - before);
    if (got > 0 && !quiet) this.fx.number(t.x, (t.height || 1) + 0.2, t.z, '+' + got, 'heal');
    return got;
  }
  kill(t, hit = {}) {
    if (t.dead) return;
    t.dead = true; t.hp = 0;
    if (t === this.player) {
      this.emit('playerDead', { hit });
      if (t.die) t.die(this, hit);
      return;
    }
    this.stats.kills++;
    if (t.die) t.die(this, hit);
    this.hitStop(t.boss ? 0.3 : t.elite ? 0.12 : 0.06);
    if (t.boss) this.slowmo(0.25, 1.4);
    if (t.team === 'enemy') {
      this.emit('enemyKilled', { enemy: t, def: t.def || null, id: t.id, x: t.x, z: t.z, hit });
      // remove from the active list (its model may linger: the brain/statue owns it after death)
      this.enemies = this.enemies.filter((e) => e !== t);
      if (!t.keepModel) { const o = t.obj; if (o && o.parent && !t.leaveModel) this.after(t.corpseTime ?? 0.6, () => { if (!t.leaveModel && o.parent) o.parent.remove(o); }); }
      if (!this.enemies.length && this.hadEnemies) { this.hadEnemies = false; this.after(0.25, () => { if (!this.enemies.length) this.emit('roomCleared', {}); }); }
    } else {
      this.allies = this.allies.filter((e) => e !== t);
      const o = t.obj; if (o && o.parent) this.after(0.3, () => o.parent && o.parent.remove(o));
    }
  }
  applyStatus(t, st) {
    for (const k in st) {
      const v = st[k];
      if (!v) continue;
      if (t.statusResist && t.statusResist[k]) continue;
      if (k === 'poison') { t.poisonStacks = Math.min(5, (t.poisonStacks || 0) + 1); t.status.poison = Math.max(t.status.poison || 0, v); }
      else {
        const had = (t.status[k] || 0) > 0;
        t.status[k] = Math.max(t.status[k] || 0, k === 'freeze' && t.boss ? v * 0.4 : v);
        if (!had && t !== this.player) this.fx.number(t.x, (t.height || 1) * 1.1, t.z, { burn: 'BURN', freeze: 'FROZEN', stun: 'STUN', slow: 'SLOW', bleed: 'BLEED', root: 'ROOTED' }[k] || k.toUpperCase(), 'status', { color: STATUS_COLORS[k] });
      }
    }
  }

  // ---------------------------------------------------------------- projectiles / telegraphs / pickups / interactables
  spawnProjectile(o) { const p = new Projectile(this, o); this.projectiles.push(p); return p; }
  telegraph(o) { return this.fx.telegraph(o); }
  /** A floor pickup: { x, z, obj?, radius, magnet (m), onPickup(player) }. Bobs and is pulled toward the player. */
  addPickup(p) {
    p.t = 0; p.vy = p.vy ?? 3.2; p.y = p.y ?? 0.4; p.vx = p.vx ?? (Math.random() - 0.5) * 2.4; p.vz = p.vz ?? (Math.random() - 0.5) * 2.4;
    p.delay = p.delay ?? 0.45;
    if (p.obj && !p.obj.parent) this.scene.add(p.obj);
    this.pickups.push(p);
    return p;
  }
  addInteractable(it) { this.interactables.push(it); return it; }
  removeInteractable(it) { this.interactables = this.interactables.filter((x) => x !== it); }

  // ---------------------------------------------------------------- the loop
  update(dt) {
    dt = Math.min(dt, this.maxDt);
    if (this.paused) { this.syncModels(0); this.cam.update(dt); return; }
    // slow-mo envelope
    let scale = 1;
    if (this.slow) {
      const s = this.slow; s.t += dt;
      const k = s.t / s.dur;
      scale = k < 0.15 ? 1 - (1 - s.scale) * (k / 0.15) : k > 0.7 ? s.scale + (1 - s.scale) * ((k - 0.7) / 0.3) : s.scale;
      if (s.t >= s.dur) this.slow = null;
    }
    this.scale = scale;
    let simDt = dt * scale;
    if (this.stop > 0) { this.stop -= dt; simDt = 0; }
    if (this.player && this.player.sample) this.player.sample(dt); // read input once per rendered frame
    this.acc += simDt;
    let n = 0;
    while (this.acc >= STEP && n < this.maxSteps) { this.step(STEP); this.acc -= STEP; n++; }
    if (n >= this.maxSteps) this.acc = 0;
    this.syncModels(simDt);
    this.fx.update(simDt > 0 ? simDt : dt * 0.15, dt);
    this.cam.update(dt);
    if (this.room && this.room.update) this.room.update(dt, this.time);
  }
  step(h) {
    this.time += h;
    // timers
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) { this.timers = this.timers.filter((t) => t.at > this.time); for (const t of due) { try { t.fn(); } catch (e) { console.error(e); } } }
    }
    const P = this.player;
    if (P && !P.dead) P.step(h, this);
    for (const e of [...this.enemies]) this.stepEntity(e, h);
    for (const a of [...this.allies]) this.stepEntity(a, h);
    if (P) this.tickStatus(P, h);
    // crowd separation
    const list = this.all.filter((e) => e.solid && !e.dead);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if ((a === P && b.team === 'enemy' && P.ghosting) || (b === P && a.team === 'enemy' && P.ghosting)) continue;
      const dx = b.x - a.x, dz = b.z - a.z, r = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), push = (r - d) * 0.5;
      const ma = a.mass || 1, mb = b.mass || 1, ka = mb / (ma + mb), kb = ma / (ma + mb);
      a.x -= (dx / d) * push * ka * 2; a.z -= (dz / d) * push * ka * 2;
      b.x += (dx / d) * push * kb * 2; b.z += (dz / d) * push * kb * 2;
      this.resolve(a); this.resolve(b);
      if (a.onBump) a.onBump(b, this); if (b.onBump) b.onBump(a, this);
    }
    // projectiles
    for (const p of this.projectiles) if (!p.dead) p.step(h);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    // pickups
    this.stepPickups(h);
  }
  stepEntity(e, h) {
    if (e.dead) return;
    e.age += h;
    if (e.invuln > 0) e.invuln -= h;
    this.tickStatus(e, h);
    if (!e.disabled) e.update(h, this);
    if (!e.moveSelf) {
      const m = e.speedMul;
      const dx = (e.vx * m + e.kbx) * h, dz = (e.vz * m + e.kbz) * h;
      if (dx || dz) {
        const wall = this.moveCircle(e, dx, dz);
        if (wall && Math.hypot(e.kbx, e.kbz) > 6 && e.onWallSlam) e.onWallSlam(this);
      }
    }
    const kd = Math.exp(-(e.kbDamp ?? 9) * h);
    e.kbx *= kd; e.kbz *= kd;
  }
  tickStatus(e, h) {
    const s = e.status;
    for (const k in s) {
      if (s[k] <= 0) continue;
      s[k] -= h;
      if (k === 'poison' && s[k] <= 0) e.poisonStacks = 0;
    }
    // damage over time every 0.5 s
    e._dotT = (e._dotT || 0) + h;
    if (e._dotT >= 0.5) {
      e._dotT -= 0.5;
      let d = 0, el = null;
      if (s.burn > 0) { d += DOT.burn * 0.5; el = 'burn'; }
      if (s.bleed > 0) { d += DOT.bleed * 0.5; el = el || 'bleed'; }
      if (s.poison > 0) { d += DOT.poison * 0.5 * (e.poisonStacks || 1); el = el || 'poison'; }
      if (d > 0 && !e.dead) this.damage(e, { dmg: d * (e === this.player ? 0.5 : 1), tag: 'dot', element: el, quiet: true, ignoreInvuln: true });
    }
    // looks
    if (!e.dead && Math.random() < 0.3) {
      const y = (e.height || 1) * 0.6;
      if (s.burn > 0) this.fx.glow(e.x, y, e.z, ['#ffb03a', '#ff6a1a'], 1, { spread: e.radius * 0.6, vel: [0, 1.2, 0] });
      if (s.poison > 0) this.fx.glow(e.x, y, e.z, ['#9aff5a', '#5ac82a'], 1, { spread: e.radius * 0.6, vel: [0, 0.6, 0], glowK: 1.6 });
      if (s.freeze > 0) this.fx.glow(e.x, y, e.z, ['#c8f4ff', '#ffffff'], 1, { spread: e.radius * 0.7, vel: [0, 0.2, 0], glowK: 2 });
      if (s.stun > 0) this.fx.glow(e.x, (e.height || 1) + 0.15, e.z, '#ffe85a', 1, { spread: 0.2, vel: [0, 0.3, 0] });
      if (s.root > 0) this.fx.dust(e.x, e.z, 1, { color: ['#7a9a4a', '#5a7a3a'], spread: e.radius * 0.6 });
    }
    if (s.freeze > 0 && e.model && e.model.flash && Math.random() < 0.08) e.model.flash('#bfefff', 0.2);
  }
  stepPickups(h) {
    const P = this.player;
    for (const p of this.pickups) {
      p.t += h;
      if (p.y > 0.25 || p.vy > 0) { p.vy -= 14 * h; p.y += p.vy * h; if (p.y < 0.25) { p.y = 0.25; p.vy = Math.abs(p.vy) > 1.5 ? -p.vy * 0.35 : 0; } }
      p.x += p.vx * h; p.z += p.vz * h; p.vx *= Math.exp(-4 * h); p.vz *= Math.exp(-4 * h);
      if (this.grid.blocks(this.grid.at(p.x, p.z))) { p.vx *= -0.5; p.vz *= -0.5; const [fx, fz] = this.grid.freeNear(p.x, p.z, 0.2); p.x = fx; p.z = fz; }
      if (!P || P.dead || p.t < p.delay || p.taken) continue;
      const dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz);
      const mag = (p.magnet ?? 2.2) + (P.stats ? (P.stats.pickupRadius || 0) : 0);
      if (d < mag) { const pull = 10 * (1 - d / mag) + 3; p.x += (dx / (d || 1)) * pull * h; p.z += (dz / (d || 1)) * pull * h; }
      if (d < (p.radius ?? 0.45) + P.radius * 0.5) {
        p.taken = true;
        if (p.onPickup) p.onPickup(P, p);
        if (p.obj && p.obj.parent) p.obj.parent.remove(p.obj);
        this.fx.glow(p.x, 0.4, p.z, p.color || '#ffe08a', 6, { spread: 0.15, vel: [0, 1.4, 0] });
        if (this.game && this.game.audio) this.game.audio.play(p.sound || 'pickup', { vol: 0.5, pitch: 0.95 + Math.random() * 0.2 });
      }
    }
    this.pickups = this.pickups.filter((p) => !p.taken);
  }
  syncModels(dt) {
    const P = this.player;
    if (P) P.sync(dt);
    for (const e of this.enemies) e.sync(e.status.freeze > 0 || e.status.stun > 0 ? dt * 0.15 : dt);
    for (const a of this.allies) a.sync(dt);
    for (const p of this.projectiles) p.sync(dt);
    for (const p of this.pickups) if (p.obj) { p.obj.position.set(p.x, p.y + Math.sin(p.t * 4) * 0.05, p.z); p.obj.rotation.y += dt * 2; }
  }

  // ---------------------------------------------------------------- UI
  /** Draw world-anchored UI (damage numbers, impacts) and, on touch, the action controls. */
  drawUI(ui) {
    this.fx.drawUI(ui, this.cam.camera);
    if (this.player && this.player.drawControls) this.player.drawControls(ui);
  }
  dispose() {
    for (const p of this.projectiles) p.end(false);
    this.fx.dispose();
    this.timers = []; this._ev = {};
  }
}

export { Entity, Grid, FLOOR, TAU };
