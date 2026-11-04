// Enemy brains: small state machines on top of Enemy (enemy.js). Every attack is telegraphed on the ground
// (fx.telegraph), lands at the end of its wind-up, and is followed by a recovery window to punish. Light enemies
// get interrupted by hits during wind-ups; elites/bosses only when their poise breaks.
//   move → windup (tell) → act (strike / dash / shot) → recover → move
import { inCircle, inCone, inLine, shoot, hazard, shockwave, puff, ringFx } from './fx.js';
import { sfx } from './enemy.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const RED = '#ff3a2a', GREEN = '#7aff9a', GOLD = '#ffd25e', PURPLE = '#c87aff';

export class Brain {
  constructor(e, cfg = {}) {
    this.e = e; this.cfg = cfg;
    this.state = 'move'; this.t = 0;
    this.cd = rnd(0.7, 1.6) * (cfg.firstCd ?? 1);
    this.minions = [];
  }
  get w() { return this.e.world; }
  get p() { return this.e.world.player; }
  set(s) { this.state = s; this.t = 0; }
  update(dt) {
    this.t += dt; this.cd -= dt;
    const p = this.p;
    if (!p || p.dead) { this.e.stop(); if (this.state !== 'move') this.set('move'); return; }
    this.tick(dt);
  }
  tick() {}
  /** Interrupt a wind-up (light enemies: any hit; heavy ones: poise break). */
  interrupt(hit, force) {
    if (this.state === 'windup' && (force || this.e.poiseMax <= 0)) {
      this.e.clearTele(); this.set('recover'); this.recover = force ? 0.9 : 0.4;
      this.cd = Math.max(this.cd, 0.5);
    }
  }
  /** Where the player will be in `t` seconds. */
  lead(t = 0.2) { const p = this.p; return { x: p.x + (p.vx || 0) * t, z: p.z + (p.vz || 0) * t }; }
  bounds() { const r = this.w.room && this.w.room.bounds; return r || { x0: -40, x1: 40, z0: -40, z1: 40 }; }
  inRoom(pt, m = 0.8) { const b = this.bounds(); return { x: clamp(pt.x, b.x0 + m, b.x1 - m), z: clamp(pt.z, b.z0 + m, b.z1 - m) }; }
  mouth() { const e = this.e, f = e.faceVec; return { x: e.x + f.x * e.radius * 0.8, z: e.z + f.z * e.radius * 0.8, y: Math.min(1.4, e.height * 0.55) }; }
  /** Summon helpers around me (capped). */
  summon(id, n, r = 2.2, opts = {}) {
    this.minions = this.minions.filter((m) => !m.dead);
    const room = Math.max(0, (opts.cap || 4) - this.minions.length);
    for (let i = 0; i < Math.min(n, room); i++) {
      const a = (i / n) * TAU + rnd(-0.3, 0.3);
      const pt = this.inRoom({ x: this.e.x + Math.cos(a) * r, z: this.e.z + Math.sin(a) * r }, 1);
      const m = this.w._spawnEnemy ? this.w._spawnEnemy(this.w, id, pt.x, pt.z, { delay: 0.25 + i * 0.2, spawn: opts.spawn || 'spores', stage: this.e.stage, minion: true }) : null;
      if (m) this.minions.push(m);
    }
  }
  recoverTick(next = 'move') { this.e.stop(); if (this.t >= (this.recover ?? 0.5)) this.set(next); }
}

// ------------------------------------------------------------------ CHASER: walk up, swipe a cone (or slam)
class Chaser extends Brain {
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg, d = e.distTo(p), R = c.range || 1.7;
    if (this.state === 'move') {
      if (d > R * 0.8) e.steer(p, e.speed); else e.face(p);
      if (d < R + 0.3 && this.cd <= 0) {
        this.dir = e.dirTo(p); e.faceDir(this.dir);
        if (c.slam) { this.wind = 0.95; e.tele({ shape: 'circle', x: e.x, z: e.z, r: 2.3, dur: this.wind, color: RED }); }
        else { this.wind = 0.55; e.tele({ shape: 'cone', x: e.x, z: e.z, r: R + 0.5, angle: 1.9, dir: this.dir, dur: this.wind, color: RED }); }
        e.mon.play('windup'); this.set('windup');
      }
    } else if (this.state === 'windup') {
      e.stop();
      if (this.t >= this.wind) {
        e.mon.play('attack');
        if (c.slam) {
          if (inCircle(p, e.x, e.z, 2.3)) e.hitPlayer({ kb: 1.6, mul: 1.3 });
          shockwave(this.w, { x: e.x, z: e.z, r0: 2.2, r1: 5, dur: 0.6, width: 0.6, dmg: Math.round(e.dmg * 0.7), source: e });
          puff(this.w, e.x, e.z, '#b8a888', 18); this.w.shake && this.w.shake(0.5); sfx(this.w, 'ground_slam', { vol: 0.7 });
        } else {
          if (inCone(p, e.x, e.z, this.dir, 1.9, R + 0.5)) e.hitPlayer({ kb: 1.1 });
          sfx(this.w, 'swipe', { vol: 0.5 });
          if (e.eliteVariant) shockwave(this.w, { x: e.x, z: e.z, r0: 0.8, r1: 3.5, dur: 0.6, width: 0.5, dmg: Math.round(e.dmg * 0.5), color: GOLD, source: e });
        }
        this.recover = c.slam ? 0.9 : 0.6; this.cd = c.cd || 2; this.set('recover');
      }
    } else this.recoverTick();
  }
}

// ------------------------------------------------------------------ HOPPER: hop in, leap onto a marked spot
class Hopper extends Brain {
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg, d = e.distTo(p), R = c.range || 1.8;
    if (this.state === 'move') {
      if (d > R * 0.7) e.steer(p, e.speed); else e.face(p);
      if (d < R + 1.4 && this.cd <= 0) {
        const l = this.lead(0.3), dx = l.x - e.x, dz = l.z - e.z, dd = Math.hypot(dx, dz) || 1, reach = Math.min(dd, 3.2);
        this.tgt = this.inRoom({ x: e.x + (dx / dd) * reach, z: e.z + (dz / dd) * reach });
        this.from = { x: e.x, z: e.z };
        this.wind = 0.55;
        e.tele({ shape: 'circle', x: this.tgt.x, z: this.tgt.z, r: 1.0, dur: this.wind + 0.32, color: RED });
        e.face(this.tgt); e.mon.play('windup'); this.set('windup');
      }
    } else if (this.state === 'windup') {
      e.stop(); e.face(this.tgt);
      if (this.t >= this.wind) { e.mon.play('attack'); this.set('leap'); sfx(this.w, 'hop', { vol: 0.4 }); }
    } else if (this.state === 'leap') {
      const k = clamp(this.t / 0.32, 0, 1);
      const nx = this.from.x + (this.tgt.x - this.from.x) * k, nz = this.from.z + (this.tgt.z - this.from.z) * k;
      e.move(nx - e.x, nz - e.z); e.stop();
      e.y = Math.sin(k * Math.PI) * 0.8;
      if (k >= 1) {
        e.y = 0;
        puff(this.w, e.x, e.z, '#c8b898', 10);
        if (inCircle(p, this.tgt.x, this.tgt.z, 1.05)) e.hitPlayer({ kb: 1.2 });
        if (c.trail === 'fire') hazard(this.w, { x: e.x, z: e.z, r: 0.9, life: 2.4, dmg: Math.round(e.dmg * 0.35), color: '#ff7a2a', status: { burn: 1 }, source: e });
        if (e.eliteVariant) shockwave(this.w, { x: e.x, z: e.z, r0: 0.6, r1: 3.6, dur: 0.6, width: 0.5, dmg: Math.round(e.dmg * 0.6), color: GOLD, source: e });
        this.w.shake && this.w.shake(0.12);
        this.recover = 0.55; this.cd = c.cd || 1.6; this.set('recover');
      }
    } else this.recoverTick();
  }
  interrupt(hit, force) { if (this.state === 'windup') super.interrupt(hit, force); }
}

// ------------------------------------------------------------------ LUNGER: circle in, dash along a line
class Lunger extends Brain {
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg, d = e.distTo(p), R = c.range || 3.2, L = c.lunge || 4;
    if (this.state === 'move') {
      // close to striking distance, drifting sideways so lunges come from angles
      if (d > R * 0.85) e.steer(p, e.speed);
      else { const dir = e.dirTo(p); const s = this.side || (this.side = Math.random() < 0.5 ? -1 : 1); e.want.x = -dir.z * s * e.speed * 0.6; e.want.z = dir.x * s * e.speed * 0.6; e.faceDir(dir); }
      if (d < R + 0.4 && this.cd <= 0) {
        this.dir = e.dirTo(this.lead(0.15)); e.faceDir(this.dir, true);
        this.len = Math.min(L, d + 1.4);
        this.wind = e.eliteVariant ? 0.45 : 0.55;
        e.tele({ shape: 'line', x: e.x, z: e.z, len: this.len, width: 1.0, dir: this.dir, dur: this.wind, color: RED });
        e.mon.play('windup'); this.set('windup'); this.dashes = e.eliteVariant ? 2 : 1;
      }
    } else if (this.state === 'windup') {
      e.stop();
      if (this.t >= this.wind) { e.mon.play('attack'); this.set('dash'); this.hit = false; sfx(this.w, 'lunge', { vol: 0.5 }); }
    } else if (this.state === 'dash') {
      const sp = this.len / 0.2;
      e.move(this.dir.x * sp * dt, this.dir.z * sp * dt); e.stop();
      if (!this.hit && e.distTo(p) < e.radius + (p.radius || 0.35) + 0.35) { this.hit = true; e.hitPlayer({ kb: 1.4, element: c.element, status: c.element === 'fire' ? { burn: 1 } : c.status ? { [c.status]: 1 } : undefined }); }
      if (this.t >= 0.2) {
        if (--this.dashes > 0) { this.dir = e.dirTo(p); e.faceDir(this.dir, true); this.len = Math.min(L, e.distTo(p) + 1.2); this.wind = 0.3; e.tele({ shape: 'line', x: e.x, z: e.z, len: this.len, width: 1.0, dir: this.dir, dur: 0.3, color: GOLD }); e.mon.play('windup'); this.set('windup'); }
        else { this.recover = 0.7; this.cd = c.cd || 1.8; this.side = 0; this.set('recover'); }
      }
    } else this.recoverTick();
  }
}

// ------------------------------------------------------------------ SPITTER: keep range, spit darts
class Spitter extends Brain {
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg, d = e.distTo(p), R = c.range || 5.5;
    if (this.state === 'move') {
      const dir = e.dirTo(p);
      if (d > R) e.steer(p, e.speed);
      else if (d < R * 0.55) { e.want.x = -dir.x * e.speed; e.want.z = -dir.z * e.speed; e.faceDir(dir); }
      else { const s = this.side || (this.side = Math.random() < 0.5 ? -1 : 1); e.want.x = -dir.z * s * e.speed * 0.5; e.want.z = dir.x * s * e.speed * 0.5; e.faceDir(dir); }
      if (this.cd <= 0 && d < R + 1.5 && (!this.w.lineOfSight || this.w.lineOfSight(e.x, e.z, p.x, p.z))) {
        this.wind = 0.5; this.dir = e.dirTo(p);
        this.h = e.tele({ shape: 'line', x: e.x, z: e.z, len: Math.min(9, d + 2), width: 0.32, dir: this.dir, dur: this.wind, color: '#ffb04a', follow: () => ({ x: e.x, z: e.z, dir: e.dirTo(this.p) }) });
        e.mon.play('windup'); this.set('windup');
      }
    } else if (this.state === 'windup') {
      e.stop(); e.face(p);
      if (this.t >= this.wind) {
        e.mon.play('attack');
        const base = e.dirTo(this.lead(0.12)), a0 = Math.atan2(base.x, base.z);
        const n = (c.shots || 1) + (e.eliteVariant ? 2 : 0), spread = c.spread || 0.28;
        const m = this.mouth();
        for (let i = 0; i < n; i++) {
          const a = a0 + (n > 1 ? (i - (n - 1) / 2) * spread : 0);
          shoot(this.w, e, { x: m.x, z: m.z, y: m.y, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: c.projSpeed || 7.5, kind: c.element === 'fire' ? 'spore' : 'thorn', color: c.element === 'fire' ? '#ff8a3a' : c.status === 'slow' ? '#7affc8' : '#e8ffa0', element: c.element, status: c.element === 'fire' ? { burn: 1 } : c.status ? { [c.status]: 1 } : undefined });
        }
        sfx(this.w, 'spit', { vol: 0.5 });
        this.recover = 0.35; this.cd = c.cd || 2; this.set('recover');
      }
    } else this.recoverTick();
  }
}

// ------------------------------------------------------------------ CHARGER: long tell, charge, bonk on walls
class Charger extends Brain {
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg, d = e.distTo(p), R = c.range || 7;
    if (this.state === 'move') {
      if (d > R * 0.7) e.steer(p, e.speed); else { e.face(p); e.steer(p, e.speed * 0.4); }
      if (d < R && this.cd <= 0) this.aim(c.gaze ? 0.9 : 0.8);
    } else if (this.state === 'windup') {
      e.stop(); if (this.t < this.wind * 0.6) { this.dir = e.dirTo(p); e.faceDir(this.dir); }
      if (this.t >= this.wind) { e.mon.play('attack'); this.set('charge'); this.hit = false; this.went = 0; sfx(this.w, 'charge', { vol: 0.6 }); }
    } else if (this.state === 'charge') {
      const sp = 10 * (e.boss ? 1 : 1);
      const f = e.move(this.dir.x * sp * dt, this.dir.z * sp * dt); e.stop();
      this.went += sp * dt;
      if (Math.random() < dt * 20) puff(this.w, e.x, e.z, '#b8a888', 2);
      if (!this.hit && e.distTo(p) < e.radius + (p.radius || 0.35) + 0.25) { this.hit = true; e.hitPlayer({ kb: 2.2, mul: 1.3, element: c.element, status: c.element === 'fire' ? { burn: 1 } : undefined }); }
      if (f < 0.4 && this.t > 0.05) {
        // slammed into a wall: dazed, wide open
        puff(this.w, e.x, e.z, '#d8c8a8', 16); this.w.shake && this.w.shake(0.35); sfx(this.w, 'wall_bonk', { vol: 0.7 });
        e.mon.play('stun'); this.recover = 1.3; this.cd = c.cd || 2.6; this.set('recover');
      } else if (this.went > R + 3) {
        if (e.eliteVariant && !this.second) { this.second = true; this.aim(0.4); }
        else { this.second = false; this.recover = 0.7; this.cd = c.cd || 2.6; this.set('recover'); }
      }
    } else this.recoverTick();
  }
  aim(wind) {
    const e = this.e;
    this.dir = e.dirTo(this.p); e.faceDir(this.dir, true);
    this.wind = wind;
    e.tele({ shape: 'line', x: e.x, z: e.z, len: (this.cfg.range || 7) + 3, width: e.radius * 2 + 0.3, dir: this.dir, dur: wind, color: this.cfg.gaze ? PURPLE : RED, follow: () => ({ x: e.x, z: e.z, dir: this.dir }) });
    e.mon.play('windup'); this.set('windup');
  }
}

// ------------------------------------------------------------------ BURROWER: swim through the floor, burst up under you
class Burrower extends Brain {
  constructor(e, cfg) { super(e, cfg); this.state = 'up'; this.cd = rnd(0.8, 1.6); }
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg;
    if (this.state === 'up') {
      e.y = 0;
      const d = e.distTo(p);
      if (d > 1.6) e.steer(p, e.speed * 0.5); else e.face(p);
      if (d < 1.9 && this.t > 0.4 && !this.swiped) { this.swiped = true; this.dir = e.dirTo(p); e.faceDir(this.dir); e.tele({ shape: 'cone', x: e.x, z: e.z, r: 1.9, angle: 2, dir: this.dir, dur: 0.5, color: RED }); e.mon.play('windup'); this.set('swipe'); }
      else if (this.t > 2.2 || this.cd <= 0) this.set('sink');
    } else if (this.state === 'swipe') {
      e.stop();
      if (this.t >= 0.5) { e.mon.play('attack'); if (inCone(p, e.x, e.z, this.dir, 2, 1.9)) e.hitPlayer({ kb: 1 }); this.recover = 0.5; this.set('recovering'); }
    } else if (this.state === 'recovering') { e.stop(); if (this.t >= 0.5) this.set('sink'); }
    else if (this.state === 'sink') {
      e.stop(); e.y = -this.t / 0.4 * e.height;
      if (this.t >= 0.4) { this.set('under'); e.untargetable = true; e.solid = false; e.g.visible = false; this.swiped = false; sfx(this.w, 'burrow', { vol: 0.4 }); }
    } else if (this.state === 'under') {
      // a travelling mound of dirt
      e.steer(p, e.speed * 1.3, { noFace: false });
      if (Math.random() < dt * 14) puff(this.w, e.x, e.z, '#8a6a4a', 2);
      if (e.distTo(p) < 0.9 || this.t > 2.4) {
        this.tgt = this.lead(0.25); this.tgt = this.inRoom(this.tgt);
        e.tele({ shape: 'circle', x: this.tgt.x, z: this.tgt.z, r: 1.1, dur: 0.65, color: RED });
        this.set('rumble');
      }
    } else if (this.state === 'rumble') {
      e.stop(); e.move(this.tgt.x - e.x, this.tgt.z - e.z);
      if (Math.random() < dt * 20) puff(this.w, e.x, e.z, '#8a6a4a', 2);
      if (this.t >= 0.65) {
        e.g.visible = true; e.untargetable = false; e.solid = true; e.face(p, true);
        e.mon.play('attack'); puff(this.w, e.x, e.z, '#a08a6a', 18); this.w.shake && this.w.shake(0.25);
        if (inCircle(p, e.x, e.z, 1.15)) e.hitPlayer({ kb: 1.6, mul: 1.2 });
        sfx(this.w, 'dirt_burst', { vol: 0.6 });
        this.set('pop');
      }
    } else if (this.state === 'pop') {
      e.y = -(1 - Math.min(1, this.t / 0.25)) * e.height * 0.8;
      if (this.t >= 0.25) { e.y = 0; this.cd = this.cfg.cd || 2.4; this.set('up'); }
    }
  }
  interrupt(hit, force) { if (this.state === 'swipe' && (force || this.e.poiseMax <= 0)) { this.e.clearTele(); this.set('recovering'); } }
  onDeath() { const e = this.e; e.g.visible = true; e.y = 0; e.untargetable = false; e.solid = true; }
}

// ------------------------------------------------------------------ FLYER: orbit, then dive through you
class Flyer extends Brain {
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg, d = e.distTo(p), R = c.range || 3.4;
    if (this.state === 'move') {
      const dir = e.dirTo(p), s = this.side || (this.side = Math.random() < 0.5 ? -1 : 1);
      const radial = (d - R) * 1.6;
      e.want.x = (-dir.z * s) * e.speed * 0.8 + dir.x * radial;
      e.want.z = (dir.x * s) * e.speed * 0.8 + dir.z * radial;
      e.faceDir(dir);
      if (this.cd <= 0 && d < R + 2.5) {
        this.tgt = this.inRoom(this.lead(0.3), 0.5);
        this.wind = 0.5;
        e.tele({ shape: 'circle', x: this.tgt.x, z: this.tgt.z, r: 0.9, dur: this.wind, color: c.element === 'fire' ? '#ff8a3a' : RED });
        e.face(this.tgt); e.mon.play('windup'); this.set('windup');
      }
    } else if (this.state === 'windup') {
      e.stop(); e.face(this.tgt);
      if (this.t >= this.wind) { this.dir = e.dirTo(this.tgt); this.len = e.distTo(this.tgt) + 1.6; e.mon.play('attack'); this.set('dive'); this.hit = false; sfx(this.w, 'swoop', { vol: 0.5 }); }
    } else if (this.state === 'dive') {
      const sp = this.len / 0.35;
      e.move(this.dir.x * sp * dt, this.dir.z * sp * dt); e.stop();
      if (!this.hit && e.distTo(p) < e.radius + (p.radius || 0.35) + 0.3) { this.hit = true; e.hitPlayer({ kb: 1, element: c.element, status: c.element === 'fire' ? { burn: 1 } : undefined }); }
      if (this.t >= 0.35) { this.recover = 0.5; this.cd = c.cd || 2.2; this.side = -this.side; this.set('recover'); }
    } else this.recoverTick();
  }
}

// ------------------------------------------------------------------ PUFFER: waddle close, inflate, burst a spore cloud
class Puffer extends Brain {
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg, d = e.distTo(p), R = c.range || 3.2;
    if (this.state === 'move') {
      if (d > R * 0.6) e.steer(p, e.speed); else e.face(p);
      if (d < R && this.cd <= 0) { this.wind = 1.0; e.tele({ shape: 'circle', x: e.x, z: e.z, r: 2.4, dur: this.wind, color: GREEN }); e.mon.play('windup'); this.set('windup'); sfx(this.w, 'inflate', { vol: 0.5 }); }
    } else if (this.state === 'windup') {
      e.stop(); e.mon.group.scale.setScalar((e.eliteVariant ? 1.18 : 1) * (1 + Math.min(1, this.t / this.wind) * 0.18));
      if (this.t >= this.wind) {
        e.mon.group.scale.setScalar(e.eliteVariant ? 1.18 : 1);
        e.mon.play('special');
        if (inCircle(p, e.x, e.z, 2.4)) e.hitPlayer({ kb: 1.4, status: { poison: 1 } });
        hazard(this.w, { x: e.x, z: e.z, r: 2.2, life: 3.2, dmg: Math.max(1, Math.round(e.dmg * 0.35)), color: '#7affb0', status: { poison: 1 }, source: e });
        puff(this.w, e.x, e.z, '#bfffd8', 20); sfx(this.w, 'spore_burst', { vol: 0.7 });
        this.recover = 1.2; this.cd = c.cd || 3.2; this.set('recover');
      }
    } else this.recoverTick();
  }
  interrupt(hit, force) { if (force) { this.e.mon.group.scale.setScalar(this.e.eliteVariant ? 1.18 : 1); super.interrupt(hit, force); } }
  onDeath() {
    // it pops when it dies: one last cloud
    const e = this.e;
    e.mon.group.scale.setScalar(e.eliteVariant ? 1.18 : 1);
    hazard(this.w, { x: e.x, z: e.z, r: 1.7, life: 2.6, dmg: Math.max(1, Math.round(e.dmg * 0.3)), color: '#7affb0', status: { poison: 1 }, source: e });
    sfx(this.w, 'spore_burst', { vol: 0.6 });
  }
}

// ------------------------------------------------------------------ SHELL: armoured bruiser; hides when beaten on, then rolls
class Shell extends Brain {
  constructor(e, cfg) { super(e, cfg); this.hits = []; }
  onHurt() {
    const now = this.w.time || 0;
    this.hits = this.hits.filter((t) => now - t < 2); this.hits.push(now);
    if (this.hits.length >= 3 && this.state !== 'shell' && this.state !== 'roll') { this.e.clearTele(); this.hits = []; this.set('shell'); this.e.dmgTaken = 0.15; this.e.mon.play('stun'); sfx(this.w, 'shell_clink', { vol: 0.6 }); }
  }
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg, d = e.distTo(p), R = c.range || 1.6;
    if (this.state === 'move') {
      if (d > R * 0.8) e.steer(p, e.speed); else e.face(p);
      if (d < R + 0.3 && this.cd <= 0) { this.dir = e.dirTo(p); e.faceDir(this.dir); e.tele({ shape: 'cone', x: e.x, z: e.z, r: R + 0.5, angle: 1.7, dir: this.dir, dur: 0.6, color: RED }); e.mon.play('windup'); this.set('windup'); }
    } else if (this.state === 'windup') {
      e.stop();
      if (this.t >= 0.6) { e.mon.play('attack'); if (inCone(p, e.x, e.z, this.dir, 1.7, R + 0.5)) e.hitPlayer({ kb: 1.3 }); this.recover = 0.6; this.cd = c.cd || 2.2; this.set('recover'); }
    } else if (this.state === 'shell') {
      e.stop();
      if (this.t >= 1.5) { e.dmgTaken = 1; this.dir = e.dirTo(p); e.faceDir(this.dir, true); e.tele({ shape: 'line', x: e.x, z: e.z, len: 7, width: e.radius * 2 + 0.2, dir: this.dir, dur: 0.45, color: RED }); this.set('aim'); }
    } else if (this.state === 'aim') { e.stop(); if (this.t >= 0.45) { this.set('roll'); this.hit = false; this.went = 0; } }
    else if (this.state === 'roll') {
      const sp = 8;
      const f = e.move(this.dir.x * sp * dt, this.dir.z * sp * dt); e.stop(); this.went += sp * dt;
      if (!this.hit && e.distTo(p) < e.radius + (p.radius || 0.35) + 0.2) { this.hit = true; e.hitPlayer({ kb: 1.8, mul: 1.2 }); }
      if (f < 0.4 || this.went > 7) { puff(this.w, e.x, e.z, '#c8b898', 10); e.mon.play('stun'); this.recover = 1.0; this.cd = c.cd || 2.2; this.set('recover'); }
    } else this.recoverTick();
  }
}

// ------------------------------------------------------------------ CASTER: radial bursts and aimed volleys from range
class Caster extends Brain {
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg, d = e.distTo(p), R = c.range || 6;
    if (this.state === 'move') {
      const dir = e.dirTo(p);
      if (d > R) e.steer(p, e.speed); else if (d < R * 0.5) { e.want.x = -dir.x * e.speed; e.want.z = -dir.z * e.speed; e.faceDir(dir); } else { e.face(p); const s = this.side || (this.side = 1); e.want.x = -dir.z * s * e.speed * 0.4; e.want.z = dir.x * s * e.speed * 0.4; }
      if (this.cd <= 0) {
        this.radial = !this.radial;
        this.wind = this.radial ? 0.8 : 0.55;
        if (this.radial) e.tele({ shape: 'ring', x: e.x, z: e.z, r: 1.6, inner: 0.55, dur: this.wind, color: c.element === 'fire' ? '#ff8a3a' : PURPLE });
        else e.tele({ shape: 'line', x: e.x, z: e.z, len: 8, width: 0.35, dir: e.dirTo(p), dur: this.wind, color: PURPLE, follow: () => ({ x: e.x, z: e.z, dir: e.dirTo(this.p) }) });
        e.mon.play('windup'); this.set('windup');
      }
    } else if (this.state === 'windup') {
      e.stop(); e.face(p);
      if (this.t >= this.wind) {
        e.mon.play('special');
        const m = this.mouth(), col = c.element === 'fire' ? '#ff8a3a' : '#d8a0ff';
        if (this.radial) {
          const n = (c.burst || 8) + (e.eliteVariant ? 4 : 0), a0 = Math.random() * TAU;
          for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; shoot(this.w, e, { x: e.x, z: e.z, y: m.y, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: 4.4, color: col, element: c.element }); }
        } else {
          const b = e.dirTo(this.lead(0.15)), a0 = Math.atan2(b.x, b.z);
          for (let i = -1; i <= 1; i++) { const a = a0 + i * 0.22; shoot(this.w, e, { x: m.x, z: m.z, y: m.y, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: 6.5, color: col, element: c.element }); }
        }
        sfx(this.w, 'cast', { vol: 0.5 });
        this.recover = 0.5; this.cd = c.cd || 3; this.set('recover');
      }
    } else this.recoverTick();
  }
}

// ------------------------------------------------------------------ SPAWNER: hangs back, calls friends, snaps when cornered
class Spawner extends Brain {
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg, d = e.distTo(p);
    if (this.state === 'move') {
      const dir = e.dirTo(p);
      if (d < 3.5) { e.want.x = -dir.x * e.speed; e.want.z = -dir.z * e.speed; } else if (d > 7) e.steer(p, e.speed);
      e.faceDir(dir);
      if (d < 2.2 && (this.snap ?? 0) <= 0) { this.dir = dir; e.tele({ shape: 'circle', x: e.x, z: e.z, r: 2.4, dur: 0.7, color: RED }); e.mon.play('windup'); this.set('windup'); this.snap = 3; }
      else if (this.cd <= 0) { e.mon.play('roar'); this.set('call'); sfx(this.w, 'summon', { vol: 0.6 }); }
      this.snap = (this.snap ?? 0) - dt;
    } else if (this.state === 'windup') {
      e.stop();
      if (this.t >= 0.7) { e.mon.play('attack'); if (inCircle(p, e.x, e.z, 2.4)) e.hitPlayer({ kb: 2 }); shockwave(this.w, { x: e.x, z: e.z, r0: 2.3, r1: 4.5, dur: 0.5, width: 0.5, dmg: Math.round(e.dmg * 0.5), source: e }); this.recover = 0.7; this.set('recover'); }
    } else if (this.state === 'call') {
      e.stop();
      if (this.t >= 0.5 && !this.called) { this.called = true; this.summon(c.minion || 'shroomling', e.eliteVariant ? 3 : 2, 2, { cap: 4 }); }
      if (this.t >= 1.1) { this.called = false; this.cd = c.cd || 6; this.set('move'); }
    } else this.recoverTick();
  }
}

// ================================================================== BOSS · GRAND PUFFCAP (stage 0)
class Puffcap extends Brain {
  constructor(e, cfg) { super(e, cfg); this.phase = 1; this.cd = 1.4; this.last = ''; this.walk = 1.2; }
  get sp() { return [1, 1.15, 1.32][this.phase - 1]; }
  pick() {
    const P = this.phase;
    this.minions = this.minions.filter((m) => !m.dead);
    let pool = P === 1 ? ['slam', 'spores', 'hop', 'spores'] : P === 2 ? ['slam', 'spores', 'hop', 'roll', 'roll', 'summon'] : ['slam', 'storm', 'hop', 'roll', 'summon', 'storm'];
    if (this.minions.length >= 3) pool = pool.filter((a) => a !== 'summon');
    pool = pool.filter((a) => a !== this.last);
    const a = pool[Math.floor(Math.random() * pool.length)];
    this.last = a;
    return a;
  }
  tick(dt) {
    const e = this.e, p = this.p;
    const f = e.hp / e.maxHp;
    if (this.state !== 'phase' && ((this.phase === 1 && f <= 0.66) || (this.phase === 2 && f <= 0.33))) return this.phaseUp();
    const s = this.state, t = this.t, sp = this.sp;
    if (s === 'move') {
      e.steer(p, e.speed * sp * (this.phase === 3 ? 1.2 : 1));
      if (this.cd <= 0) this.begin(this.pick());
    } else if (s === 'phase') {
      e.stop();
      if (t >= 1.6) { e.invuln = 0; this.cd = 0.6; this.set('move'); }
    } else if (s === 'slam') {
      e.stop();
      if (t < 1.0 / sp) e.face(p);
      else if (!this.done) {
        this.done = true; e.mon.play('attack');
        if (inCircle(p, e.x, e.z, 3.0)) e.hitPlayer({ kb: 2.4, mul: 1.4 });
        shockwave(this.w, { x: e.x, z: e.z, r0: 2.8, r1: 9, dur: 1.0 / sp, width: 0.8, dmg: Math.round(e.dmg * 0.9), source: e });
        if (this.phase >= 3) setTimeout0(this, 0.45, () => shockwave(this.w, { x: e.x, z: e.z, r0: 1.5, r1: 9, dur: 1.0, width: 0.7, dmg: Math.round(e.dmg * 0.8), source: e }));
        puff(this.w, e.x, e.z, '#e8d8b8', 30); this.w.shake && this.w.shake(1.0); this.w.hitStop && this.w.hitStop(0.06);
        sfx(this.w, 'ground_slam', { vol: 1 });
      }
      if (t >= 1.0 / sp + 0.9) this.after();
    } else if (s === 'spores') {
      e.stop(); e.face(p);
      if (t >= 0.7 / sp && !this.done) { this.done = true; e.mon.play('special'); this.ring(this.phase >= 3 ? 16 : 12, 4.2, Math.random() * TAU); sfx(this.w, 'spore_burst', { vol: 0.9 }); }
      if (this.phase >= 2 && t >= 0.7 / sp + 0.35 && !this.done2) { this.done2 = true; this.ring(12, 3.6, Math.random() * TAU); }
      if (t >= 0.7 / sp + 0.9) this.after();
    } else if (s === 'hop') {
      if (t < 0.55 / sp) { e.stop(); e.face(this.tgt); }
      else if (t < 0.55 / sp + 0.85) {
        if (!this.up) { this.up = true; e.mon.play('attack'); e.ghost = true; sfx(this.w, 'hop', { vol: 0.9, pitch: 0.6 }); }
        const k = clamp((t - 0.55 / sp) / 0.85, 0, 1);
        e.x = this.from.x + (this.tgt.x - this.from.x) * k; e.z = this.from.z + (this.tgt.z - this.from.z) * k;
        e.y = Math.sin(k * Math.PI) * 3.4; e.stop();
      } else if (!this.done) {
        this.done = true; e.y = 0; e.ghost = false;
        if (this.w.resolve) this.w.resolve(e);
        if (inCircle(p, e.x, e.z, 2.4)) e.hitPlayer({ kb: 2.4, mul: 1.3 });
        if (this.phase >= 2) shockwave(this.w, { x: e.x, z: e.z, r0: 2.2, r1: 6.5, dur: 0.7, width: 0.7, dmg: Math.round(e.dmg * 0.7), source: e });
        puff(this.w, e.x, e.z, '#e8d8b8', 26); this.w.shake && this.w.shake(1.1); sfx(this.w, 'ground_slam', { vol: 1 });
      } else if (t >= 0.55 / sp + 0.85 + 0.8) this.after();
    } else if (s === 'roll') {
      if (this.sub === 'aim') {
        e.stop();
        if (t >= this.wind) { this.sub = 'go'; this.t = 0; this.went = 0; this.hit = false; e.mon.play('attack'); sfx(this.w, 'charge', { vol: 0.9 }); }
      } else if (this.sub === 'go') {
        const v = 9 * sp;
        const fr = e.move(this.dir.x * v * dt, this.dir.z * v * dt); e.stop();
        this.went += v * dt;
        e.mon.root.rotation.x = Math.sin((this.w.time || 0) * 30) * 0.08;
        if (Math.random() < dt * 25) puff(this.w, e.x, e.z, '#c8b898', 2);
        if (!this.hit && e.distTo(p) < e.radius + (p.radius || 0.35) + 0.2) { this.hit = true; e.hitPlayer({ kb: 2.8, mul: 1.3 }); }
        if (fr < 0.4 || this.went > 14) {
          this.bounces = (this.bounces || 0) + 1;
          puff(this.w, e.x, e.z, '#e8d8b8', 18); this.w.shake && this.w.shake(0.7); sfx(this.w, 'wall_bonk', { vol: 0.9 });
          if (this.bounces <= (this.phase >= 3 ? 2 : 1)) this.aimRoll(0.4);
          else { this.sub = 'dizzy'; this.t = 0; e.mon.play('stun'); }
        }
      } else if (this.sub === 'dizzy') { e.stop(); if (t >= 1.5) this.after(); }
    } else if (s === 'summon') {
      e.stop();
      if (t >= 0.6 && !this.done) { this.done = true; this.summon('shroomling', this.phase >= 3 ? 4 : 3, 3, { cap: 5 }); }
      if (t >= 1.4) this.after();
    } else if (s === 'storm') {
      e.steer(p, e.speed * 0.4);
      this.acc = (this.acc || 0) + dt;
      while (this.acc >= 0.11) {
        this.acc -= 0.11; this.spin = (this.spin || 0) + 0.5;
        for (const off of [0, Math.PI]) { const a = this.spin + off; shoot(this.w, e, { x: e.x, z: e.z, y: 1.2, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: 4.2, dmg: Math.round(e.dmg * 0.5), color: '#9affc8' }); }
      }
      if (t >= 3.0) this.after();
    }
  }
  begin(a) {
    const e = this.e, p = this.p;
    this.set(a); this.done = this.done2 = this.up = false;
    e.mon.root && (e.mon.root.rotation.x = 0);
    if (a === 'slam') { e.mon.play('windup'); e.tele({ shape: 'circle', x: e.x, z: e.z, r: 3.0, dur: 1.0 / this.sp, color: RED }); sfx(this.w, 'inflate', { vol: 0.8, pitch: 0.6 }); }
    else if (a === 'spores') { e.mon.play('windup'); e.tele({ shape: 'ring', x: e.x, z: e.z, r: 2.4, inner: 0.6, dur: 0.7 / this.sp, color: GREEN }); }
    else if (a === 'hop') { this.from = { x: e.x, z: e.z }; this.tgt = this.inRoom(this.lead(0.4), 2); e.mon.play('windup'); e.tele({ shape: 'circle', x: this.tgt.x, z: this.tgt.z, r: 2.4, dur: 0.55 / this.sp + 0.85, color: RED }); }
    else if (a === 'roll') { this.bounces = 0; this.aimRoll(0.8 / this.sp); }
    else if (a === 'summon') { e.mon.play('roar'); sfx(this.w, 'summon', { vol: 0.8 }); }
    else if (a === 'storm') { e.mon.play('special'); this.spin = Math.random() * TAU; }
  }
  aimRoll(wind) {
    const e = this.e;
    this.sub = 'aim'; this.t = 0; this.wind = wind;
    this.dir = e.dirTo(this.p); e.faceDir(this.dir, true);
    e.mon.play('windup');
    e.tele({ shape: 'line', x: e.x, z: e.z, len: 14, width: e.radius * 2, dir: this.dir, dur: wind, color: RED });
  }
  ring(n, speed, a0) { const e = this.e; for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; shoot(this.w, e, { x: e.x, z: e.z, y: 1.1, dir: { x: Math.sin(a), z: Math.cos(a) }, speed, dmg: Math.round(e.dmg * 0.6), color: '#9affc8', size: 0.3, status: { poison: 1 } }); } }
  after() { const e = this.e; e.ghost = false; e.y = 0; this.sub = null; if (e.mon.root) e.mon.root.rotation.x = 0; this.cd = rnd(0.9, 1.6) / this.sp; this.set('move'); }
  phaseUp() {
    const e = this.e;
    e.clearTele(); this.after();
    this.phase++;
    this.set('phase'); e.invuln = 1.6; e.ghost = false; e.y = 0;
    e.mon.play('roar'); e.mon.setPhase && e.mon.setPhase(this.phase);
    this.w.shake && this.w.shake(1.2);
    this.ring(18, 3.4, 0);
    const ph = (e.def.phases || [])[this.phase - 2];
    if (typeof this.w.emit === 'function') this.w.emit('bossPhase', { enemy: e, phase: this.phase, text: ph ? ph.text : '' });
    sfx(this.w, 'boss_roar', { vol: 1 });
  }
  interrupt(hit, force) { if (force) { this.e.clearTele(); this.after(); } }
  onDeath() { const e = this.e; e.ghost = false; e.y = 0; this.minions.forEach((m) => { if (!m.dead && m.hp > 0) m.hp = 0; }); }
}
/** Tiny timer on the brain clock (kept in the brain so it pauses with the game). */
function setTimeout0(brain, t, fn) { (brain._timers || (brain._timers = [])).push({ t, fn }); if (!brain._timerHook) { brain._timerHook = true; const up = brain.update.bind(brain); brain.update = (dt) => { for (const T of brain._timers) { T.t -= dt; if (T.t <= 0 && !T.done) { T.done = true; T.fn(); } } brain._timers = brain._timers.filter((T) => !T.done); up(dt); }; } }

// ================================================================== BOSS · SERPENT HERALDS (Glasscoil, Cinderfang, Thornscale)
class Herald extends Brain {
  constructor(e, cfg) { super(e, cfg); this.phase = 1; this.cd = 1.2; }
  get sp() { return this.phase >= 2 ? 1.25 : 1; }
  tick(dt) {
    const e = this.e, p = this.p, c = this.cfg, d = e.distTo(p);
    if (this.phase === 1 && e.hp / e.maxHp <= 0.5) {
      this.phase = 2; e.clearTele(); e.mon.play('roar'); e.mon.setPhase && e.mon.setPhase(2); this.set('phase'); e.invuln = 1.4; this.w.shake && this.w.shake(1);
      if (typeof this.w.emit === 'function') this.w.emit('bossPhase', { enemy: e, phase: 2, text: ((e.def.phases || [])[0] || {}).text || '' });
      sfx(this.w, 'boss_roar', { vol: 1 }); return;
    }
    const s = this.state, t = this.t;
    if (s === 'phase') { e.stop(); if (t > 1.4) { e.invuln = 0; this.summon(c.flavor === 'fire' ? 'ember_asp' : c.flavor === 'crystal' ? 'glass_adder' : 'vine_viper', 2, 3, { spawn: 'ground', cap: 3 }); this.set('move'); } return; }
    if (s === 'move') {
      if (d > 3) e.steer(p, e.speed * this.sp); else e.face(p);
      if (this.cd <= 0) {
        const pool = d < 3.4 ? ['sweep', 'bite', 'special'] : ['bite', 'volley', 'special', 'volley'];
        const a = pool[Math.floor(Math.random() * pool.length)];
        this.begin(a);
      }
      return;
    }
    e.stop();
    const W = this.wind;
    if (s === 'bite') {
      if (t >= W && !this.done) { this.done = true; e.mon.play('attack'); this.t0 = t; sfx(this.w, 'hiss', { vol: 0.9 }); }
      if (this.done && t < W + 0.25) { const v = 5.5 / 0.25; e.move(this.dir.x * v * dt, this.dir.z * v * dt); if (!this.hit && e.distTo(p) < e.radius + 0.6) { this.hit = true; e.hitPlayer({ kb: 2, mul: 1.3 }); } }
      if (t >= W + 0.9) this.after();
    } else if (s === 'sweep') {
      if (t >= W && !this.done) { this.done = true; e.mon.play('multi', { hits: 2 }); if (inCone(p, e.x, e.z, this.dir, 2.9, 3.9)) e.hitPlayer({ kb: 2.4, mul: 1.2 }); this.w.shake && this.w.shake(0.4); sfx(this.w, 'swipe', { vol: 0.9 }); }
      if (t >= W + 0.8) this.after();
    } else if (s === 'volley') {
      if (t >= W && !this.done) {
        this.done = true; e.mon.play('special');
        const b = e.dirTo(this.lead(0.2)), a0 = Math.atan2(b.x, b.z), m = this.mouth();
        const n = this.phase >= 2 ? 7 : 5;
        for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.2; shoot(this.w, e, { x: m.x, z: m.z, y: m.y, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: 7, kind: c.flavor === 'crystal' ? 'thorn' : 'spore', color: this.col(), element: c.flavor === 'fire' ? 'fire' : undefined }); }
        sfx(this.w, 'spit', { vol: 0.8 });
      }
      if (t >= W + 0.6) this.after();
    } else if (s === 'special') {
      if (t >= W && !this.done) {
        this.done = true; e.mon.play('special');
        if (c.flavor === 'fire') {
          // fire breath down a line, leaving burning ground
          if (inLine(p, e.x, e.z, this.dir, 7.5, 1.7)) e.hitPlayer({ kb: 1.6, mul: 1.2, element: 'fire', status: { burn: 2 } });
          for (let i = 1; i <= 3; i++) hazard(this.w, { x: e.x + this.dir.x * i * 2.2, z: e.z + this.dir.z * i * 2.2, r: 1.1, life: 3, dmg: Math.round(e.dmg * 0.3), color: '#ff7a2a', status: { burn: 1 }, source: e });
          sfx(this.w, 'fire_breath', { vol: 1 });
        } else {
          // crystal / thorn burst all around
          const n = this.phase >= 2 ? 16 : 12, a0 = Math.random() * TAU;
          for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; shoot(this.w, e, { x: e.x, z: e.z, y: 1, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: 5, kind: 'thorn', color: this.col() }); }
          shockwave(this.w, { x: e.x, z: e.z, r0: 1, r1: 5, dur: 0.6, width: 0.6, dmg: Math.round(e.dmg * 0.6), color: this.col(), source: e });
          sfx(this.w, 'crystal_burst', { vol: 1 });
        }
      }
      if (t >= W + 0.9) this.after();
    }
  }
  col() { return this.cfg.flavor === 'fire' ? '#ff8a3a' : this.cfg.flavor === 'crystal' ? '#9ae8ff' : '#9aff7a'; }
  begin(a) {
    const e = this.e, p = this.p;
    this.set(a); this.done = false; this.hit = false;
    this.dir = e.dirTo(p); e.faceDir(this.dir, true);
    this.wind = ({ bite: 0.7, sweep: 0.8, volley: 0.6, special: 0.85 }[a]) / this.sp;
    e.mon.play('windup');
    if (a === 'bite') e.tele({ shape: 'line', x: e.x, z: e.z, len: 6, width: 1.6, dir: this.dir, dur: this.wind, color: RED });
    else if (a === 'sweep') e.tele({ shape: 'cone', x: e.x, z: e.z, r: 3.9, angle: 2.9, dir: this.dir, dur: this.wind, color: RED });
    else if (a === 'volley') e.tele({ shape: 'cone', x: e.x, z: e.z, r: 7, angle: 1.0, dir: this.dir, dur: this.wind, color: '#ffb04a' });
    else if (this.cfg.flavor === 'fire') e.tele({ shape: 'line', x: e.x, z: e.z, len: 7.5, width: 1.7, dir: this.dir, dur: this.wind, color: '#ff7a2a' });
    else e.tele({ shape: 'circle', x: e.x, z: e.z, r: 5, dur: this.wind, color: this.col() });
  }
  after() { this.cd = rnd(0.7, 1.4) / this.sp; this.set('move'); }
  interrupt(hit, force) { if (force) { this.e.clearTele(); this.after(); } }
}

// ================================================================== BOSS · MEDUSA (stage 3)
class Medusa extends Brain {
  constructor(e, cfg) { super(e, cfg); this.phase = 1; this.cd = 1.5; }
  get sp() { return [1, 1.15, 1.3][this.phase - 1]; }
  tick(dt) {
    const e = this.e, p = this.p, d = e.distTo(p);
    const f = e.hp / e.maxHp;
    if (this.state !== 'phase' && ((this.phase === 1 && f <= 0.66) || (this.phase === 2 && f <= 0.33))) {
      this.phase++; e.clearTele(); this.set('phase'); e.invuln = 1.6; e.mon.play('roar'); e.mon.setPhase && e.mon.setPhase(this.phase); this.w.shake && this.w.shake(1.2);
      const ph = (e.def.phases || [])[this.phase - 2];
      if (typeof this.w.emit === 'function') this.w.emit('bossPhase', { enemy: e, phase: this.phase, text: ph ? ph.text : '' });
      sfx(this.w, 'medusa_laugh', { vol: 1 }); return;
    }
    const s = this.state, t = this.t;
    if (s === 'phase') { e.stop(); if (t > 1.6) { e.invuln = 0; if (this.phase >= 2) this.summon('gorgon_snake', 2, 3, { spawn: 'ground', cap: 3 }); this.set('move'); } return; }
    if (s === 'move') {
      if (d > 4) e.steer(p, e.speed * this.sp); else if (d < 2.4) { const dir = e.dirTo(p); e.want.x = -dir.x * e.speed; e.want.z = -dir.z * e.speed; e.faceDir(dir); } else e.face(p);
      if (this.cd <= 0) {
        const pool = d < 3.2 ? ['tail', 'gaze', 'hair'] : ['gaze', 'hair', 'hair', this.phase >= 3 ? 'rings' : 'gaze'];
        this.begin(pool[Math.floor(Math.random() * pool.length)]);
      }
      return;
    }
    e.stop();
    const W = this.wind;
    if (s === 'gaze') {
      if (t < W * 0.5) { this.dir = e.dirTo(p); e.faceDir(this.dir); }
      if (t >= W && !this.done) {
        this.done = true; e.mon.play('special'); if (e.mon.setEyes) e.mon.setEyes(1);
        if (inCone(p, e.x, e.z, this.dir, 1.1, 11)) e.hitPlayer({ kb: 0.5, mul: 1.1, status: { slow: 2.5, stone: 1 }, tag: 'gaze' });
        this.w.flash && this.w.flash('#9affc8', 0.35); sfx(this.w, 'gaze', { vol: 1 });
      }
      if (t >= W + 0.9) { if (e.mon.setEyes) e.mon.setEyes(0); this.after(); }
    } else if (s === 'hair') {
      if (t >= W && !this.done) { this.done = true; e.mon.play('multi', { hits: 5 }); this.spin = Math.random() * TAU; this.acc = 0; }
      if (this.done && t < W + 1.2) {
        this.acc += dt;
        while (this.acc >= 0.08) { this.acc -= 0.08; this.spin += 0.62; shoot(this.w, e, { x: e.x, z: e.z, y: 1.6, dir: { x: Math.sin(this.spin), z: Math.cos(this.spin) }, speed: 5, kind: 'thorn', color: '#9aff9a' }); }
      }
      if (t >= W + 1.5) this.after();
    } else if (s === 'tail') {
      if (t >= W && !this.done) { this.done = true; e.mon.play('attack'); if (inCone(p, e.x, e.z, this.dir, 3.4, 3.8)) e.hitPlayer({ kb: 2.6, mul: 1.3 }); this.w.shake && this.w.shake(0.5); sfx(this.w, 'swipe', { vol: 1 }); }
      if (t >= W + 0.8) this.after();
    } else if (s === 'rings') {
      if (t >= W && !this.done) { this.done = true; e.mon.play('special'); for (let i = 0; i < 3; i++) setTimeout0(this, i * 0.45, () => shockwave(this.w, { x: e.x, z: e.z, r0: 1, r1: 10, dur: 1.2, width: 0.7, dmg: Math.round(e.dmg * 0.7), color: '#9affc8', status: { slow: 1 }, source: e })); }
      if (t >= W + 1.8) this.after();
    }
  }
  begin(a) {
    const e = this.e;
    this.set(a); this.done = false;
    this.dir = e.dirTo(this.p); e.faceDir(this.dir, true);
    this.wind = ({ gaze: 1.2, hair: 0.6, tail: 0.8, rings: 0.8 }[a]) / this.sp;
    e.mon.play('windup');
    if (a === 'gaze') e.tele({ shape: 'cone', x: e.x, z: e.z, r: 11, angle: 1.1, dir: this.dir, dur: this.wind, color: '#9affc8', follow: () => ({ x: e.x, z: e.z, dir: this.dir }) });
    else if (a === 'tail') e.tele({ shape: 'cone', x: e.x, z: e.z, r: 3.8, angle: 3.4, dir: this.dir, dur: this.wind, color: RED });
    else if (a === 'hair') e.tele({ shape: 'ring', x: e.x, z: e.z, r: 2, inner: 0.5, dur: this.wind, color: '#9aff9a' });
    else e.tele({ shape: 'circle', x: e.x, z: e.z, r: 2.2, dur: this.wind, color: '#9affc8' });
    sfx(this.w, a === 'gaze' ? 'medusa_whisper' : 'hiss', { vol: 0.8 });
  }
  after() { this.cd = rnd(0.7, 1.3) / this.sp; this.set('move'); }
  interrupt(hit, force) { if (force) { this.e.clearTele(); if (this.e.mon.setEyes) this.e.mon.setEyes(0); this.after(); } }
}

export const BRAINS = {
  chaser: Chaser, hopper: Hopper, lunger: Lunger, spitter: Spitter, charger: Charger, burrower: Burrower,
  flyer: Flyer, puffer: Puffer, shell: Shell, caster: Caster, spawner: Spawner,
  puffcap: Puffcap, herald: Herald, medusa: Medusa,
};
