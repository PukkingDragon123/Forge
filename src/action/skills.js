// The ten crafted skills (ids fixed by docs/REDESIGN.md §7). Data (name, icon, cd, desc, params) comes
// from data/skills.js when present; these defaults fill the gaps. cast(P, world, id) returns true if
// the skill went off. Damage = the player's weapon base × mul × buffs (with a floor so skills stay
// useful on a weak blade).
import * as THREE from 'three';
import { Entity } from './entity.js';
import * as SK from '../data/skills.js';

// Defaults mirror data/skills.js param names (metres, seconds, absolute damage scaled by the dmg stat).
export const SKILL_DEFAULTS = {
  spore_burst: { name: 'Spore Burst', icon: 'poison', cd: 7, aim: 'self', radius: 2.6, dur: 4, tick: 0.5, dmg: 4, poison: 3, slow: 0.2 },
  stone_spikes: { name: 'Stone Spikes', icon: 'block', cd: 6, aim: 'dir', length: 6.5, width: 1.1, count: 6, delay: 0.06, dmg: 22, stun: 0.5, kb: 0.8 },
  ember_dash: { name: 'Ember Dash', icon: 'fire', cd: 9, aim: 'dash', dur: 6, trailLife: 2.4, trailWidth: 0.9, tick: 0.4, dmg: 5, burn: 2 },
  shield_bash: { name: 'Shield Bash', icon: 'shield', cd: 5, aim: 'dir', range: 2.6, angle: 80, dmg: 16, stun: 1.4, kb: 2.4, lunge: 1.2 },
  whirlwind: { name: 'Whirlwind', icon: 'axe', cd: 8, aim: 'self', radius: 2.3, dur: 1.4, ticks: 7, dmg: 8, moveMul: 0.6, kb: 0.6 },
  frost_nova: { name: 'Frost Nova', icon: 'ice', cd: 10, aim: 'self', radius: 3.6, dmg: 12, freeze: 1.8, slowAfter: 2 },
  chain_spark: { name: 'Chain Spark', icon: 'shock', cd: 6, aim: 'target', range: 7, jumps: 4, jumpRange: 4.5, dmg: 15, falloff: 0.85, stun: 0.25 },
  root_snare: { name: 'Root Snare', icon: 'harvest', cd: 9, aim: 'target', range: 6, radius: 2.8, hold: 2.4, tick: 0.5, dmg: 3 },
  gem_shards: { name: 'Gem Shards', icon: 'gem', cd: 5, aim: 'dir', count: 7, spread: 55, speed: 15, range: 9, dmg: 10, pierce: 2 },
  mushroom_turret: { name: 'Mushroom Turret', icon: 'monster', cd: 14, aim: 'self', dur: 9, rate: 1.1, range: 7, dmg: 7, poison: 1, hp: 40 },
};
export const SKILL_IDS = Object.keys(SKILL_DEFAULTS);

/** Merged definition for a skill id (D's data overrides the defaults; params are flattened in). */
export function skillDef(id) {
  const d = SKILL_DEFAULTS[id];
  if (!d) return null;
  const ext = (SK.SKILLS && SK.SKILLS[id]) || {};
  return { id, ...d, ...ext, ...(ext.params || {}) };
}

// ------------------------------------------------------------------ helpers
const lerp = (a, b, t) => a + (b - a) * t;
const STONE = ['#8a7e72', '#a8998a', '#6a6058', '#c8baa8'];
const ROOT = ['#6a4a2a', '#8a6a3a', '#5a7a3a', '#7a9a4a'];
function play(au, name, o) { au && au.play(name, o); }
function spikeMesh(h, colors, r = 0.17) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = 1 - i * 0.22;
    const m = new THREE.Mesh(new THREE.ConeGeometry(r * s * 1.4, h * s, 4, 1), new THREE.MeshLambertMaterial({ color: colors[i % colors.length], flatShading: true }));
    m.position.set((Math.random() - 0.5) * 0.22, (h * s) / 2, (Math.random() - 0.5) * 0.22);
    m.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI, (Math.random() - 0.5) * 0.4);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
/** A spike that bursts up from the floor and sinks back. */
function erupt(world, x, z, h, colors, life = 0.8) {
  const m = spikeMesh(h, colors);
  m.position.set(x, -h, z);
  world.fx.timed(m, life, (k) => {
    const up = k < 0.12 ? k / 0.12 : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    m.position.y = -h + h * (1 - (1 - up) ** 3);
  });
  world.fx.dust(x, z, 4, { speed: [0.6, 1.6] });
  world.fx.chipsAt(x, 0.1, z, colors, 3, { speed: 1.4, up: 2.5 });
}
function mushroomModel() {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.42, 6), new THREE.MeshLambertMaterial({ color: '#efe2c8', flatShading: true }));
  stem.position.y = 0.21;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#c8462e', flatShading: true }));
  cap.position.y = 0.38; cap.scale.y = 0.75;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color('#8affb0').multiplyScalar(2.5) }));
  glow.position.set(0, 0.3, 0.13);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.06), new THREE.MeshLambertMaterial({ color: '#fff4d8' }));
    const a = (i / 5) * Math.PI * 2;
    s.position.set(Math.sin(a) * 0.2, 0.52, Math.cos(a) * 0.2);
    g.add(s);
  }
  g.add(stem, cap, glow);
  g.userData.cap = cap;
  return g;
}

/** A planted spore turret (ally). */
class Turret extends Entity {
  constructor(world, P, x, z, d) {
    super({ x, z, team: 'player', radius: 0.32, mass: 50, hp: d.hp || 40 });
    this.untargetable = false; this.solid = true;
    this.P = P; this.d = d; this.cool = 0.3; this.life = d.dur; this.height = 0.55;
    this.model = mushroomModel();
    this.model.scale.setScalar(0.01);
  }
  update(h, world) {
    this.life -= h;
    const o = this.model;
    const grow = Math.min(1, this.age / 0.25);
    o.scale.setScalar(grow * (1 + Math.sin(this.age * 6) * 0.03) * (this.life < 0.3 ? Math.max(0.01, this.life / 0.3) : 1));
    if (this.life <= 0) { world.fx.smoke(this.x, 0.4, this.z, '#8ac86a', 8); world.kill(this); return; }
    this.cool -= h;
    if (this.cool <= 0) {
      const t = world.nearestEnemy(this.x, this.z, this.d.range);
      if (t) {
        this.cool = this.d.rate;
        const dx = t.x - this.x, dz = t.z - this.z;
        this.facing = Math.atan2(dx, dz);
        o.userData.cap.scale.y = 0.55;
        const h = this.P.skillHit(this.d.dmg, {});
        world.spawnProjectile({ team: 'player', x: this.x, z: this.z, y: 0.42, dir: { x: dx, z: dz }, speed: 12, radius: 0.16, dmg: h.dmg, crit: h.crit, kb: 0.25, color: '#9aff7a', status: this.d.poison ? { poison: 2 + this.d.poison } : null, source: this.P, life: this.d.range / 12 + 0.2, homing: 3 });
        play(world.game && world.game.audio, 'spore_shot', { vol: 0.35, pitch: 1 + Math.random() * 0.2 });
      } else this.cool = 0.2;
    }
    o.userData.cap.scale.y += (0.75 - o.userData.cap.scale.y) * Math.min(1, h * 10);
  }
}

// ------------------------------------------------------------------ the casts
const RAD = Math.PI / 180;
const CAST = {
  spore_burst(P, w, d) {
    const x = P.x, z = P.z, r = d.radius;
    w.fx.disc(x, z, r, '#6ac83a', { life: d.dur, alpha: 0.5, pulse: true });
    w.fx.ring(x, z, r, '#b8ff8a', { life: 0.4 });
    w.fx.smoke(x, 0.3, z, ['#7ab84a', '#9ad86a', '#5a8a3a'], 22, { spread: r * 0.6, rise: 0.3, life: [1.2, 2.4], size: [6, 10], sizeEnd: 16, alpha: 0.45 });
    w.fx.glow(x, 0.4, z, ['#c8ff8a', '#8aff5a'], 18, { spread: r * 0.7, vel: [0, 0.8, 0] });
    const status = { poison: d.poison };
    if (d.slow) status.slow = 1;
    w.every(d.tick, Math.max(1, Math.round(d.dur / d.tick)), (i) => {
      w.areaDamage({ shape: 'circle', x, z, r }, P.skillHit(d.dmg, { kb: i === 0 ? 0.4 : 0, status, quiet: i > 0, hitstop: 0 }));
      w.fx.smoke(x, 0.25, z, ['#7ab84a', '#5a8a3a'], 3, { spread: r * 0.7, rise: 0.2 });
    });
    play(w.game.audio, 'spore_burst');
    return true;
  },
  stone_spikes(P, w, d, aim) {
    const hit = new Set(), ox = P.x, oz = P.z, n = Math.max(1, Math.round(d.count));
    for (let i = 0; i < n; i++) {
      w.after(i * d.delay, () => {
        const k = (i + 1) / n, x = ox + aim.x * d.length * k, z = oz + aim.z * d.length * k;
        if (w.grid.blocksShot(w.grid.at(x, z))) return;
        erupt(w, x, z, 0.8 + (i % 2) * 0.3, STONE);
        if (d.width > 0.9) { const sx = -aim.z * d.width * 0.35, sz = aim.x * d.width * 0.35; erupt(w, x + sx, z + sz, 0.5, STONE, 0.7); erupt(w, x - sx, z - sz, 0.55, STONE, 0.7); }
        w.areaDamage({ shape: 'circle', x, z, r: d.width * 0.65 }, P.skillHit(d.dmg, { kb: d.kb, stun: d.stun, heavy: i === 0, dir: aim }), { exclude: hit });
        if (i % 2 === 0) play(w.game.audio, 'stone_spike', { vol: 0.6, pitch: 0.9 + Math.random() * 0.3 });
      });
    }
    w.shake(0.25);
    return true;
  },
  ember_dash(P, w, d) {
    // a buff: for `dur` seconds every dash leaves a burning trail
    P.buffs.ember = { until: w.time + d.dur, d };
    w.fx.ring(P.x, P.z, 1.4, '#ff8a3a', { life: 0.35 });
    w.fx.glow(P.x, 0.6, P.z, ['#ffb03a', '#ff6a1a', '#ffe08a'], 16, { spread: 0.4, vel: [0, 1.6, 0] });
    w.fx.light(P.x, 1, P.z, '#ff8a3a', 4, 5, 0.3);
    play(w.game.audio, 'ember_dash');
    return true;
  },
  shield_bash(P, w, d, aim) {
    P.lunge(aim, d.lunge * 0.6, 0.12);
    w.after(0.06, () => {
      const hits = w.areaDamage({ shape: 'cone', x: P.x, z: P.z, r: d.range, angle: d.angle * RAD, dir: aim }, P.skillHit(d.dmg, { kb: d.kb, stun: d.stun, heavy: true, dir: aim }));
      w.fx.slash(P.x, P.z, Math.atan2(aim.x, aim.z), d.angle * RAD, d.range, { color: '#ffd27a', core: '#ffffff', width: 1.2, dir: 1, sweep: 0.05 });
      w.fx.ring(P.x + aim.x * 0.8, P.z + aim.z * 0.8, 1.6, '#ffe8a0', { life: 0.25 });
      w.fx.dust(P.x + aim.x, P.z + aim.z, 8);
      w.fx.light(P.x + aim.x, 0.8, P.z + aim.z, '#ffe0a0', 5, 5, 0.2);
      w.shake(hits.length ? 0.35 : 0.15);
      if (hits.length) w.hitStop(0.09);
    });
    play(w.game.audio, 'shield_bash');
    return true;
  },
  whirlwind(P, w, d) {
    P.enterState('whirl', d.dur, { moveMul: d.moveMul });
    const n = Math.max(1, Math.round(d.ticks)), gap = d.dur / n;
    w.every(gap, n, (i) => {
      if (P.dead) return;
      w.areaDamage({ shape: 'circle', x: P.x, z: P.z, r: d.radius }, P.skillHit(d.dmg, { kb: d.kb, hitstop: 0.02 }));
      w.fx.slash(P.x, P.z, P.facing + i * 2.1, Math.PI * 1.9, d.radius, { color: P.moves.color, core: '#ffffff', width: 0.7, dir: 1, sweep: gap * 0.9, hold: 0.06 });
      if (i % 2 === 0) play(w.game.audio, 'whirl', { vol: 0.45, pitch: 1 + (i % 4) * 0.05 });
    });
    return true;
  },
  frost_nova(P, w, d) {
    const r = d.radius;
    const hits = w.areaDamage({ shape: 'circle', x: P.x, z: P.z, r }, P.skillHit(d.dmg, { kb: 0.8, status: { freeze: d.freeze }, tag: 'freezeHit' }));
    if (d.slowAfter) for (const e of hits) w.after(d.freeze, () => { if (!e.dead) e.status.slow = Math.max(e.status.slow || 0, d.slowAfter); });
    w.fx.ring(P.x, P.z, r, '#bff4ff', { life: 0.45 });
    w.fx.ring(P.x, P.z, r * 0.7, '#ffffff', { life: 0.3 });
    w.fx.disc(P.x, P.z, r, '#6ac8ff', { life: 0.7, alpha: 0.45 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, rr = r * (0.55 + Math.random() * 0.4);
      w.after(0.03 + (rr / r) * 0.08, () => erupt(w, P.x + Math.sin(a) * rr, P.z + Math.cos(a) * rr, 0.4 + Math.random() * 0.35, ['#bff4ff', '#8ad8ff', '#ffffff'], 1.1));
    }
    w.fx.glow(P.x, 0.4, P.z, ['#ffffff', '#bff4ff'], 30, { spread: r * 0.6, vel: [0, 0.9, 0] });
    w.fx.light(P.x, 1, P.z, '#9ae8ff', 6, 7, 0.35);
    w.flash('#bff4ff', 0.15);
    w.shake(0.3);
    play(w.game.audio, 'frost_nova');
    return true;
  },
  chain_spark(P, w, d, aim) {
    let first = null, best = -1e9;
    for (const e of w.enemies) {
      if (e.dead || e.untargetable) continue;
      const dx = e.x - P.x, dz = e.z - P.z, dist = Math.hypot(dx, dz);
      if (dist > d.range) continue;
      const score = ((dx * aim.x + dz * aim.z) / (dist || 1)) * 4 - dist * 0.3;
      if (score > best) { best = score; first = e; }
    }
    if (!first) { w.fx.bolt([new THREE.Vector3(P.x, 0.8, P.z), new THREE.Vector3(P.x + aim.x * 3, 0.5, P.z + aim.z * 3)], '#9ae8ff', { life: 0.15 }); play(w.game.audio, 'zap', { vol: 0.5 }); return true; }
    const chain = [first], seen = new Set([first]);
    let cur = first;
    for (let j = 0; j < d.jumps; j++) {
      const nx = w.nearestEnemy(cur.x, cur.z, d.jumpRange, (e) => !seen.has(e));
      if (!nx) break;
      chain.push(nx); seen.add(nx); cur = nx;
    }
    const pts = [new THREE.Vector3(P.x + P.aimX * 0.4, 0.8, P.z + P.aimZ * 0.4)];
    chain.forEach((e, i) => {
      pts.push(new THREE.Vector3(e.x, (e.height || 1) * 0.6, e.z));
      w.after(i * 0.05, () => {
        if (e.dead) return;
        w.damage(e, P.skillHit(d.dmg * Math.pow(d.falloff, i), { kb: 0.3, stun: d.stun, dir: { x: e.x - P.x, z: e.z - P.z } }));
        w.fx.spark(e.x, (e.height || 1) * 0.6, e.z, '#bff4ff', 10, { colorEnd: '#5ab8ff' });
        w.fx.light(e.x, 1, e.z, '#8ad8ff', 3, 4, 0.15);
      });
    });
    w.fx.bolt(pts, '#bff4ff', { life: 0.26, width: 0.08 });
    w.fx.bolt(pts, '#5ab8ff', { life: 0.18, width: 0.14 });
    play(w.game.audio, 'chain_spark');
    return true;
  },
  root_snare(P, w, d) {
    const p = P.aimPoint(d.range), r = d.radius;
    w.fx.disc(p.x, p.z, r, '#5a8a2a', { life: d.hold, alpha: 0.4 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
      w.after(i * 0.02, () => erupt(w, p.x + Math.sin(a) * rr, p.z + Math.cos(a) * rr, 0.45 + Math.random() * 0.4, ROOT, d.hold * 0.9));
    }
    w.every(d.tick, Math.max(1, Math.round(d.hold / d.tick)), (i) => {
      w.areaDamage({ shape: 'circle', x: p.x, z: p.z, r }, P.skillHit(d.dmg, { kb: 0, status: i === 0 ? { root: d.hold } : null, quiet: i > 0, hitstop: 0 }));
    });
    w.fx.ring(p.x, p.z, r, '#c8f08a', { life: 0.35 });
    play(w.game.audio, 'root_snare');
    return true;
  },
  gem_shards(P, w, d, aim) {
    const a0 = Math.atan2(aim.x, aim.z), n = Math.max(1, Math.round(d.count)), spread = d.spread * RAD;
    const cols = ['#ff8ae0', '#8ae8ff', '#ffe08a', '#b08aff'];
    for (let i = 0; i < n; i++) {
      const a = a0 + (n === 1 ? 0 : lerp(-spread / 2, spread / 2, i / (n - 1)));
      const h = P.skillHit(d.dmg, {});
      w.spawnProjectile({ team: 'player', x: P.x + Math.sin(a) * 0.4, z: P.z + Math.cos(a) * 0.4, y: 0.7, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: d.speed, radius: 0.17, dmg: h.dmg, crit: h.crit, kb: 0.5, pierce: d.pierce, life: d.range / d.speed, color: cols[i % cols.length], source: P, spin: 14 });
    }
    w.fx.glow(P.x + aim.x * 0.5, 0.7, P.z + aim.z * 0.5, cols, 10, { spread: 0.2 });
    play(w.game.audio, 'gem_shards');
    return true;
  },
  mushroom_turret(P, w, d, aim) {
    let x = P.x + aim.x * 0.9, z = P.z + aim.z * 0.9;
    if (!w.grid.circleFree(x, z, 0.32)) [x, z] = w.grid.freeNear(x, z, 0.32);
    const t = new Turret(w, P, x, z, d);
    w.add(t);
    w.fx.dust(x, z, 10);
    w.fx.ring(x, z, 1, '#9aff7a', { life: 0.3 });
    play(w.game.audio, 'turret_plant');
    return true;
  },
};

/** Cast a skill. Returns true on success. */
export function castSkill(P, world, id) {
  const d = skillDef(id);
  const fn = CAST[id];
  if (!d || !fn) return false;
  const aim = P.resolveAim(true);
  if (d.aim !== 'self') P.facing = Math.atan2(aim.x, aim.z);
  return fn(P, world, d, aim);
}
