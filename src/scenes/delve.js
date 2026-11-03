// First-person delve (docs/REDESIGN.md §7): walk the tunnel out of the last room, reach a junction
// where the way splits left / forward / right (the next rooms on the old map, node.out sorted by x),
// raise the old map or just pick a tunnel mouth, and walk into it. Nothing on screen while walking:
// letterbox, torchlight, Pip trotting ahead, bats, drips, fireflies, a snake slipping past far ahead.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { makeFPWorld, stageToWorld } from '../gfx/fpcam.js';
import { buildFPSafe, makePet, eye, seedOf, worldCurve, EYE } from './fp_kit.js';
import { enterNode, openMap, openBag, actOf, actDef } from './flow.js';
import * as ENC from '../systems/encounters.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

export const NODE_LOOK = {
  start: { icon: 'start', label: 'Start' },
  monster: { icon: 'monster', label: 'Monster' },
  elite: { icon: 'elite', label: 'Elite' },
  boss: { icon: 'boss', label: 'Herald' },
  vein: { icon: 'mining', label: 'Ore vein' },
  mining: { icon: 'mining', label: 'Ore vein' },
  event: { icon: 'event', label: 'Unknown' },
  treasure: { icon: 'treasure', label: 'Old chest' },
  camp: { icon: 'camp', label: 'Camp' },
};
const DIR_WORD = { '-1': 'Left', 0: 'Ahead', 1: 'Right' };

/** Play an act's delve music (falls back to the act's own track). */
export function delveMusic(game, run) {
  const au = game.audio;
  if (!au) return;
  const A = actDef(run);
  au.music(A.music || 'mine');
}

export class DelveScene extends Scene {
  enter(params = {}) {
    const game = this.game, run = game.run;
    this.run = run;
    if (!run) { game.go('title', {}, { transition: 'none' }); return; }
    const map = run.map, act = actOf(run);
    this.act = act;
    this.start = !!params.start;
    const cur = map.nodes[map.current];
    let opts = (cur ? cur.out : []).map((id) => map.nodes[id]).filter(Boolean).sort((a, b) => a.x - b.x);
    if (opts.length > 3) opts = [opts[0], opts[Math.floor(opts.length / 2)], opts[opts.length - 1]];
    const dirs = opts.length === 1 ? [0] : opts.length === 2 ? [-1, 1] : [-1, 0, 1];
    this.choices = opts.map((node, i) => ({ node, dir: dirs[i] }));
    this.rng = run.rng.fork ? run.rng.fork('delve' + map.current + ':' + act) : run.rng;
    const seed = seedOf(run.seed, act, map.current, 'delve');
    const length = this.start ? 15 : 10 + Math.round(this.rng.next() * 4);
    const bend = this.rng.pick([-1, 0, 0, 1]);
    // ---- the tunnel out, and the junction at its end (pieces join at anchors.end)
    this.tunnel = buildFPSafe('tunnel', act, { seed, length, bend });
    // a faint coloured glow deep in a tunnel hints at what the old map says lies beyond
    const HINT = { vein: '#ffd25e', mining: '#ffd25e', treasure: '#ffe6a0', camp: '#ff9a4a', elite: '#ff4a3a', boss: '#ff3a5a' };
    const hints = this.choices.filter((c) => HINT[c.node.type]).map((c) => ({ dir: c.dir, color: HINT[c.node.type] }));
    this.junction = buildFPSafe('junction', act, { seed: seed + 1, exits: dirs, hints });
    const path = this.tunnel.anchors.path;
    const TE = this.tunnel.anchors.end;
    if (TE && TE.pos) { this.junction.group.position.copy(TE.pos); this.junction.group.rotation.y = TE.yaw || 0; }
    else {
      const end = path.getPointAt(1), tan = path.getTangentAt(1);
      this.junction.group.position.set(end.x, end.y - EYE, end.z);
      this.junction.group.rotation.y = Math.atan2(-tan.x, -tan.z);
    }
    this.junction.group.updateMatrixWorld(true);
    const world = makeFPWorld([this.tunnel, this.junction], { charId: run.char });
    this.world = world;
    this.fp = world.fp;
    const arms = this.fp.arms;
    if (arms) { arms.hold && arms.hold('torch'); arms.play && arms.play('walk'); }
    this.pet = makePet(world.scene);
    // ---- exits in world space: the mouth you walk to, and a point deep inside the tunnel
    const J = this.junction.anchors;
    for (const c of this.choices) {
      const ex = (J.exits || []).find((e) => e.dir === c.dir) || (J.exits || [])[0];
      const mouth = ex ? ex.mouth || ex.pos : new THREE.Vector3(c.dir * 3, EYE, -6);
      const deep = ex ? ex.look || ex.mouth || ex.pos : new THREE.Vector3(c.dir * 6, EYE, -7);
      c.pos = eye(stageToWorld(this.junction, ex && ex.pos ? ex.pos : mouth));
      c.mouth = eye(stageToWorld(this.junction, mouth));
      c.look = eye(stageToWorld(this.junction, deep));
      c.hover = 0;
    }
    this.jpath = J.path && J.path.getPointAt ? worldCurve(this.junction, J.path) : null;
    this.stand = eye(stageToWorld(this.junction, J.stand || new THREE.Vector3(0, EYE, -2)));
    // ---- start walking
    const p0 = path.getPointAt(0);
    const t0 = path.getTangentAt(0);
    this.fp.place(p0, Math.atan2(-t0.x, -t0.z));
    this.fp.onStep = (side) => game.audio && game.audio.play('footstep_stone', { vol: 0.35, pitch: side === 'l' ? 0.95 : 1.05 });
    this.state = 'walk';
    this.lb = 1;        // letterbox amount
    this.fade = 1;      // black → scene
    this.uiK = 0;       // junction UI fade-in
    this.mapOpen = false;
    this.walkDur = path.getLength() / 1.5;
    this.fp.moveAlong(path, this.walkDur, { ease: 'walk', look: 'tangent' }).then((ok) => { if (ok) this.arriveJunction(); });
    this.title = this.start ? { text: actDef(run).name || '', sub: actDef(run).sub || '', t: 0 } : null;
    // ---- little cinematic life along the way
    const pal = (actDef(run).pal || {});
    this.glow = pal.glow || '#ffd890';
    this.glow2 = pal.glow2 || '#ffe8b0';
    this.beats = [];
    const k1 = 0.22 + this.rng.next() * 0.25, k2 = 0.55 + this.rng.next() * 0.2;
    this.beats.push({ k: k1, kind: this.rng.chance(0.6) ? 'bats' : 'drips' });
    if (this.rng.chance(0.55)) this.beats.push({ k: k2, kind: 'snake' });
    this.bats = []; this.snake = null;
    this.ambush = null;
    delveMusic(game, run);
    game.audio && game.audio.loop && (this.amb = game.audio.loop('cave'));
  }

  exit() {
    this.amb && this.amb.stop && this.amb.stop(1);
    for (const st of [this.tunnel, this.junction]) if (st && st.dispose) { try { st.dispose(); } catch (e) { /* placeholder */ } }
  }

  // ------------------------------------------------------------------ junction
  arriveJunction() {
    const fp = this.fp;
    this.state = 'arrive';
    const go = this.jpath ? fp.moveAlong(this.jpath, Math.max(1.2, this.jpath.getLength() / 1.5), { ease: 'walk', look: this.centerLook(), lookWeight: 0.5 }) : fp.walkTo(this.stand, 1.1, { ease: 'walk', look: this.centerLook() });
    go.then(() => {
      fp.setFov(68, 2.5);
      this.state = 'choose';
      this.scan = this.choices.length > 1 ? this.choices.map((c) => c.mouth).concat([this.centerLook()]) : [this.centerLook()];
      this.scanT = 0;
      this.lookHome = this.centerLook();
      this.chooseT = 0;
      const a = fp.arms; a && a.play && a.play('idle');
      // Pip sits and sniffs toward the most interesting tunnel (ore and chests smell best)
      const best = this.choices.find((c) => ['vein', 'mining', 'treasure'].includes(c.node.type)) || this.rng.pick(this.choices);
      this.sniff = best;
      if (this.pet) { this.pet.play('sniff'); this.game.audio && this.game.audio.play('pip_sniff', { vol: 0.5 }); }
    });
  }
  centerLook() {
    const v = new THREE.Vector3();
    for (const c of this.choices) v.add(c.look);
    return this.choices.length ? v.multiplyScalar(1 / this.choices.length) : this.stand.clone().add(new THREE.Vector3(0, 0, -3));
  }

  raiseMap() {
    if (this.mapOpen || this.state !== 'choose') return;
    const a = this.fp.arms;
    if (a) { a.hold && a.hold('map'); a.play && a.play('raiseMap'); }
    this.game.audio && this.game.audio.play('map_unfold');
    this.mapOpen = true;
    const o = openMap(this.game, {
      pick: true, live: true, options: this.choices.map((c) => c.node),
      onPick: (node) => { const c = this.choices.find((x) => x.node === node || x.node.id === (node && node.id)); this.closeMap(); if (c) this.choose(c); },
      onClose: () => this.closeMap(),
    });
    if (!o) this.closeMap();
  }
  closeMap() {
    if (!this.mapOpen) return;
    this.mapOpen = false;
    const a = this.fp.arms;
    if (a) { a.play && a.play('lowerMap'); this.after(0.55, () => { if (!this.mapOpen && a.hold) a.hold('torch'); }); }
    this.game.audio && this.game.audio.play('map_fold');
  }

  choose(c) {
    if (this.state !== 'choose') return;
    this.state = 'go';
    this.picked = c;
    const fp = this.fp, game = this.game;
    game.audio && game.audio.play('click');
    fp.lookTo(c.look, 0.45);
    fp.setFov(62, 2);
    const here = this.fp.pos.clone();
    const pts = [here, here.clone().lerp(c.mouth, 0.5), c.mouth, c.mouth.clone().lerp(c.look, 0.5), c.look];
    const curve = new THREE.CatmullRomCurve3(pts);
    const dur = curve.getLength() / 1.7;
    const ambushId = ENC.ambushFor ? ENC.ambushFor(this.run, c.node) : (c.node.type === 'monster' && this.rng.chance(0.2) ? 'adder' : null);
    if (this.pet) this.pet.play('walk');
    this.goT = 0; this.goDur = dur + 0.35;
    this.after(0.35, () => {
      fp.moveAlong(curve, dur, { ease: 'walk', look: 'tangent' });
      if (ambushId) this.after(dur * 0.48, () => this.startAmbush(c, ambushId));
      else this.after(dur * 0.72, () => enterNode(game, c.node));
    });
  }
  /** Something lunges out of the dark before you reach the room. */
  startAmbush(c, monsterId) {
    const fp = this.fp, game = this.game;
    this.ambush = { t: 0, c };
    fp.path = null;
    fp.shake(0.9); fp.punch([0, 0, 1], 0.12); fp.setFov(54, 9);
    game.audio && game.audio.play('hiss', { vol: 1 });
    game.audio && game.audio.play('snake_rattle', { vol: 0.8 });
    game.hitStop && game.hitStop(0.12);
    if (this.pet) this.pet.play('bark');
    game.renderer && game.renderer.doFlash && game.renderer.doFlash(0.35, [1, 0.3, 0.25]);
    this.after(0.75, () => enterNode(game, c.node, { ambush: monsterId || true }));
  }

  // ------------------------------------------------------------------ timers
  after(t, fn) { (this.timers || (this.timers = [])).push({ t, fn }); }

  // ------------------------------------------------------------------ life
  beat(kind) {
    const fp = this.fp, scene = this.world.scene, fwd = fp.forward();
    const at = (d, side = 0, up = 0) => fp.pos.clone().addScaledVector(fwd.clone().setY(0).normalize(), d).add(new THREE.Vector3(Math.cos(fp.yaw) * side, up, -Math.sin(fp.yaw) * side));
    if (kind === 'bats') {
      const n = 4 + Math.floor(this.rng.next() * 4);
      const from = at(6, -2.4, 1.2), to = at(1.2, 2.6, 0.9);
      for (let i = 0; i < n; i++) {
        const b = batMesh();
        scene.add(b);
        this.bats.push({ g: b, t: -i * 0.09, dur: 1.3 + this.rng.next() * 0.4, from: from.clone().add(new THREE.Vector3(rnd.float(-0.4, 0.4), rnd.float(-0.3, 0.3), rnd.float(-0.4, 0.4))), to: to.clone().add(new THREE.Vector3(rnd.float(-0.5, 0.5), rnd.float(-0.2, 0.4), rnd.float(-0.5, 0.5))), ph: rnd.float(0, 6) });
      }
      this.game.audio && this.game.audio.play('bat_flutter', { vol: 0.6 });
      if (this.pet) this.pet.play('bark');
      fp.glanceAt(from, 0.35);
    } else if (kind === 'snake') {
      const g = snakeMesh();
      scene.add(g.group);
      this.snake = { ...g, t: 0, dur: 2.1, a: at(7.5, -1.8, -EYE + 0.05), b: at(7.5, 1.8, -EYE + 0.05) };
      this.game.audio && this.game.audio.play('hiss', { vol: 0.45 });
      if (this.pet) this.pet.play('yelp');
      fp.glanceAt(at(7.5, 0, -0.6), 0.45);
    } else if (kind === 'drips') {
      for (let i = 0; i < 8; i++) this.after(i * 0.12, () => this.drip(true));
    }
  }
  drip(near = false) {
    const fp = this.fp, fwd = fp.forward().setY(0).normalize();
    const p = fp.pos.clone().addScaledVector(fwd, near ? rnd.float(1.2, 3) : rnd.float(2, 7)).add(new THREE.Vector3(rnd.float(-1, 1), 1.3, rnd.float(-1, 1)));
    this.world.dust.emit({ pos: [p.x, p.y, p.z], vel: [0, -0.2, 0], gravity: -9.8, life: 0.55, size: 1, color: '#bfe8ff', alpha: 0.85, floor: p.y - 1.3 - EYE * 0.98, bounce: 0 });
    if (near) this.game.audio && this.game.audio.play('drip', { vol: 0.25 });
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    if (!this.run) return;
    const game = this.game, inp = game.input, fp = this.fp;
    if (this.timers) {
      for (const tm of this.timers) tm.t -= dt;
      const due = this.timers.filter((tm) => tm.t <= 0);
      this.timers = this.timers.filter((tm) => tm.t > 0);
      for (const tm of due) tm.fn();
    }
    this.fade = Math.max(0, this.fade - dt * 1.6);
    const walking = this.state === 'walk' || this.state === 'arrive';
    this.lb = clamp(this.lb + (walking || this.state === 'go' ? dt * 2 : -dt * 2.5), 0, 1);
    this.uiK = clamp(this.uiK + (this.state === 'choose' && !this.mapOpen ? dt * 3 : -dt * 5), 0, 1);
    // hold anywhere (or Space) to hurry along; drag to glance around
    const hurry = walking && !this.game.overlays.length && (inp.down || inp.action('strike') || inp.action('fast'));
    fp.setHurry(hurry ? 3 : 1);
    if (this.state !== 'choose' || !this.overChoice) fp.dragLook(inp, this.state === 'choose' ? { maxYaw: 1.0, maxPitch: 0.3 } : {});
    // story beats while walking out
    if (this.state === 'walk') {
      const k = fp.progress;
      for (const b of this.beats) if (!b.done && k >= b.k) { b.done = true; this.beat(b.kind); }
      if (rnd.chance(dt * 1.6)) this.drip();
    }
    // fireflies drift in the torchlight everywhere
    if (rnd.chance(dt * 3.5)) {
      const fwd = fp.forward().setY(0).normalize();
      const p = fp.pos.clone().addScaledVector(fwd, rnd.float(1.5, 6)).add(new THREE.Vector3(rnd.float(-1.2, 1.2), rnd.float(-0.5, 0.8), rnd.float(-1.2, 1.2)));
      this.world.sparks.emit({ pos: [p.x, p.y, p.z], vel: [rnd.float(-0.1, 0.1), rnd.float(0, 0.08), rnd.float(-0.1, 0.1)], life: [2, 4], size: [1, 2], color: [this.glow, this.glow2, '#fff6c8'], glow: 2.6, fadeIn: 0.6, flicker: 0.5, swirl: 0.3 });
    }
    this.updatePet(dt);
    this.updateCritters(dt);
    if (this.ambush) { this.ambush.t += dt; }
    this.world.update(dt);
    if (this.title) this.title.t += dt;
    if (this.state === 'choose') {
      this.chooseT += dt;
      // on arrival the head turns to each tunnel in turn, then settles ahead; later it follows the
      // tunnel you hover (and comes back when you don't)
      if (this.scan && this.scan.length) {
        this.scanT -= dt;
        if (this.scanT <= 0) { const v = this.scan.shift(); fp.lookTo(v, 0.55); this.scanT = this.scan.length ? 0.8 : 0; }
      } else {
        const hov = this.choices.find((c) => c.hover > 0.5);
        if (hov && this.lookingAt !== hov) { this.lookingAt = hov; fp.lookTo(hov.mouth.clone().lerp(this.lookHome, 0.25), 0.6); }
        if (!hov && this.lookingAt) { this.idleT = (this.idleT || 0) + dt; if (this.idleT > 0.7) { this.lookingAt = null; this.idleT = 0; fp.lookTo(this.lookHome, 0.8); } } else this.idleT = 0;
      }
      if (this.choices.length === 1 && this.chooseT > 1.1 && !this.mapOpen) this.choose(this.choices[0]);
      if (!this.mapOpen && !this.game.overlays.length) {
        const keyFor = { '-1': ['ArrowLeft', 'KeyA'], 0: ['ArrowUp', 'KeyW'], 1: ['ArrowRight', 'KeyD'] };
        for (const c of this.choices) if (keyFor[c.dir].some((k) => inp.keyPressed(k))) { this.choose(c); return; }
        if (inp.keyPressed('KeyM')) this.raiseMap();
        if (inp.actionPressed('bag')) openBag(game);
      }
    }
  }
  updatePet(dt) {
    const pet = this.pet, fp = this.fp;
    if (!pet) return;
    pet.update && pet.update(dt);
    const curve = fp.curve;
    if (curve && (this.state === 'walk' || this.state === 'go' || this.state === 'arrive')) {
      const k = clamp(fp.progress + 1.1 / Math.max(2, curve.getLength()), 0, 1);
      const p = curve.getPointAt(k), t = curve.getTangentAt(k);
      pet.group.position.lerp(new THREE.Vector3(p.x + Math.cos(fp.yaw) * 0.22, p.y - EYE, p.z - Math.sin(fp.yaw) * 0.22), 1 - Math.exp(-dt * 8));
      pet.group.rotation.y = Math.atan2(t.x, t.z);
      const want = fp.hurry > 1.8 ? 'run' : 'walk';
      if (pet.anim !== want && !['bark', 'yelp', 'sniff'].includes(pet.anim)) pet.play(want);
      if (['bark', 'yelp'].includes(pet.anim) && (this.petT = (this.petT || 0) + dt) > 1.2) { this.petT = 0; pet.play(want); }
    } else if (this.state === 'choose' && this.sniff) {
      const fwd = this.sniff.look.clone().sub(this.stand).setY(0).normalize();
      const spot = this.stand.clone().addScaledVector(fwd, 0.9).setY(this.stand.y - EYE);
      pet.group.position.lerp(spot, 1 - Math.exp(-dt * 3));
      pet.group.rotation.y = Math.atan2(fwd.x, fwd.z);
    }
  }
  updateCritters(dt) {
    const scene = this.world.scene;
    for (const b of this.bats) {
      b.t += dt;
      const k = clamp(b.t / b.dur, 0, 1);
      b.g.visible = b.t > 0;
      b.g.position.lerpVectors(b.from, b.to, ease.inOutSine(k)).add(new THREE.Vector3(0, Math.sin(k * Math.PI * 3 + b.ph) * 0.15, 0));
      b.g.lookAt(b.to);
      const f = Math.sin(b.t * 38 + b.ph);
      b.g.children[1].rotation.z = 0.2 + f * 0.9; b.g.children[2].rotation.z = -0.2 - f * 0.9;
      if (b.t > b.dur) { scene.remove(b.g); b.dead = true; }
    }
    this.bats = this.bats.filter((b) => !b.dead);
    const s = this.snake;
    if (s) {
      s.t += dt;
      const k = s.t / s.dur;
      for (let i = 0; i < s.segs.length; i++) {
        const kk = clamp(k - i * 0.035, 0, 1);
        const p = s.a.clone().lerp(s.b, kk);
        const side = s.b.clone().sub(s.a).normalize();
        const n = new THREE.Vector3(-side.z, 0, side.x);
        p.addScaledVector(n, Math.sin(kk * 14 - i * 0.6) * 0.18);
        s.segs[i].position.copy(p);
        s.segs[i].visible = kk > 0 && kk < 1;
      }
      if (s.t > s.dur + 0.6) { scene.remove(s.group); this.snake = null; }
    }
  }

  // ------------------------------------------------------------------ draw
  draw(ui) {
    if (!this.run) return;
    const fp = this.fp, game = this.game;
    // letterbox while walking
    const bar = Math.round(30 * ease.outCubic(this.lb));
    if (bar > 0) { ui.rect(0, 0, ui.w, bar, '#050406'); ui.rect(0, ui.h - bar, ui.w, bar, '#050406'); }
    // the act's name, once, when a new act begins
    if (this.title && this.title.text) {
      const t = this.title.t, a = clamp(t - 0.8, 0, 1) * clamp(5.2 - t, 0, 1);
      if (a > 0) {
        ui.ctx.globalAlpha = a;
        ui.big(this.title.text, ui.w / 2, ui.h - 88, { scale: 2, top: '#fff2d8', bottom: this.glow });
        if (this.title.sub) ui.text(this.title.sub, ui.w / 2, ui.h - 58, { align: 'center', color: '#d8c8b0', outline: '#140c10' });
        ui.ctx.globalAlpha = 1;
      }
    }
    if (this.uiK > 0.01) this.drawJunction(ui);
    if (this.ambush) {
      const a = clamp(this.ambush.t * 3, 0, 0.6);
      ui.rect(0, 0, ui.w, ui.h, '#3a0606', a * 0.5);
    }
    if (this.fade > 0) ui.rect(0, 0, ui.w, ui.h, '#07060b', this.fade);
    void game;
  }
  drawJunction(ui) {
    const fp = this.fp, game = this.game, run = this.run, k = this.uiK;
    ui.ctx.globalAlpha = k;
    this.overChoice = false;
    // tunnel mouths: tap one to walk in; a chalk mark says what the old map says lies beyond
    for (const c of this.choices) {
      const p = fp.project(c.mouth, ui.w, ui.h);
      // a tunnel out of view pins its marker to that edge of the screen, with an arrow
      let off = 0;
      if (p.behind) { off = c.dir || 1; } else if (p.x < 36) off = -1; else if (p.x > ui.w - 36) off = 1;
      const x = off ? (off < 0 ? 52 : ui.w - 52) : clamp(p.x, 60, ui.w - 60), y = off ? Math.round(ui.h * 0.45) : clamp(p.y, 70, ui.h - 90);
      if (off) ui.icon(off < 0 ? 'arrowL' : 'arrowR', x + (off < 0 ? -34 : 34), y, { center: true, scale: 2, alpha: 0.7 + 0.3 * Math.sin(this.time * 4) });
      const h = ui.hit('mouth' + c.dir, x - 64, y - 70, 128, 140, { sound: false });
      if (h.hover) this.overChoice = true;
      c.hover += ((h.hover ? 1 : 0) - c.hover) * 0.25;
      const look = NODE_LOOK[c.node.type] || NODE_LOOK.monster;
      const bob = Math.round(Math.sin(this.time * 2.2 + c.dir) * 2);
      const ring = 17 + c.hover * 3;
      // a soft dark disc behind a big icon, so it reads on any wall
      ui.ctx.globalAlpha = k * (0.4 + 0.3 * c.hover);
      ui.ctx.fillStyle = '#0a0608';
      ui.ctx.beginPath(); ui.ctx.arc(x, y + bob, ring + 4, 0, Math.PI * 2); ui.ctx.fill();
      ui.ctx.globalAlpha = k * (0.7 + 0.3 * c.hover);
      ui.icon(look.icon, x, y + bob, { scale: 2, center: true });
      ui.ctx.globalAlpha = k;
      if (c.hover > 0.05 || ui.touch) {
        const lbl = `${DIR_WORD[c.dir]} · ${look.label}`;
        const w = ui.measure(lbl) + 14;
        ui.rect(x - w / 2, y + ring + 6 + bob, w, 14, '#140c10', 0.72 * Math.max(c.hover, ui.touch ? 0.8 : 0));
        ui.text(lbl, x, y + ring + 9 + bob, { align: 'center', color: '#f4e6c8' });
      }
      if (this.sniff === c && this.chooseT > 0.6) ui.icon('sparkle', x + 10, y - 22 + bob, { alpha: 0.6 + 0.4 * Math.sin(this.time * 6) });
      if (h.clicked) { this.choose(c); return; }
    }
    // a heart, the bag and the old map — nothing else
    const low = run.hp < run.maxHp * 0.3;
    ui.icon('heart', 10, 10);
    ui.text(`${run.hp}/${run.maxHp}`, 26, 11, { color: low ? '#ff7a6a' : '#ffd8c8', outline: '#140c10' });
    const mb = ui.hit('delve-map', 6, ui.h - 70, 30, 30, { sound: false });
    ui.icon('scroll', 8, ui.h - 68 - (mb.hover ? 2 : 0), { scale: 2 });
    if (mb.hover) ui.tooltip({ title: 'Old map', body: 'See where the tunnels lead (M).' });
    if (mb.clicked) this.raiseMap();
    const bb = ui.hit('delve-bag', 6, ui.h - 34, 30, 30, { sound: false });
    ui.icon('bag', 8, ui.h - 32 - (bb.hover ? 2 : 0), { scale: 2 });
    if (bb.hover) ui.tooltip({ title: 'Backpack', body: 'TAB' });
    if (bb.clicked) openBag(game);
    ui.ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ tiny critters
const BAT_MAT = new THREE.MeshLambertMaterial({ color: 0x1a1418 });
BAT_MAT.userData.keep = true;
function batMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.09), BAT_MAT);
  const wl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.07), BAT_MAT); wl.geometry.translate(-0.08, 0, 0);
  const wr = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.07), BAT_MAT); wr.geometry.translate(0.08, 0, 0);
  wl.position.x = -0.02; wr.position.x = 0.02;
  g.add(body, wl, wr);
  return g;
}
function snakeMesh() {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x14100e });
  const segs = [];
  for (let i = 0; i < 16; i++) {
    const s = 0.07 * (1 - i / 22);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s), mat);
    m.visible = false;
    group.add(m); segs.push(m);
  }
  const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 0.3) });
  for (const x of [-0.022, 0.022]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), eyeM); e.position.set(x, 0.02, 0.02); segs[0].add(e); }
  return { group, segs };
}
