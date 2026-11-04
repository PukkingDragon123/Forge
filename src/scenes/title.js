// Main menu: the crew's camp deep in an old dungeon (stage_vox 'campmenu'; 'campfire' until it exists).
// It opens like a film: the camera glides in from the dungeon gate while the FORGLITE logo is forged
// letter by letter — hammer blows, sparks, white-hot letters cooling to gold — and settles on the
// crew resting by the fire (Durgan stirs the stew, Pip snores). Only Durgan, the warrior, can set out
// at first; Bran, Elio and Clover are locked (alive and greyed before the story, stone statues after
// it) until they are freed in the dungeon. Tap a forger: the camera pushes in on them and a card
// shows who they are; Choose starts the run. Settings, the codex and the recipe book are objects in
// the camp (the lantern, Elio's books, the old map crate).
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig } from '../gfx/camera.js';
import { buildCharacter } from '../models/characters.js';
import { buildStage } from '../models/stage_vox.js';
import { buildPet } from '../models/pet.js';
import { noteCanvas, tagCanvas } from '../art/handpaint.js';
import { campAnchors, playFirst } from '../art/cutscene_art.js';
import { dim } from './common.js';
import { startRun } from './flow.js';
import { CHARACTERS, CHARACTER_ORDER } from '../data/characters.js';
import { BLUEPRINTS, RECIPES } from '../data/blueprints.js';
import * as STEW_DATA from '../data/stews.js';
import * as CRAFT from '../systems/crafting.js';
import * as UNLOCKS from '../systems/unlocks.js';
import { MATERIALS } from '../data/materials.js';
import { SYNERGIES } from '../systems/forge.js';
import { logo } from '../art/sprites.js';
import { COLORS } from '../ui/font.js';
import { save } from '../core/save.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

/** The first function a module exports under any of these names (modules evolve; no hard binds). */
const fnOf = (mod, ...names) => { for (const n of names) { const f = mod && mod[n]; if (typeof f === 'function') return f; } return null; };
/** Who can set out: the warrior from the start; the others once freed. */
export function heroUnlocked(id) {
  const f = fnOf(UNLOCKS, 'isHeroUnlocked', 'heroUnlocked', 'isUnlockedHero');
  if (f) { try { return !!f(id); } catch (e) { /* fall through */ } }
  const u = save.data.unlocks || {};
  const list = u.heroes || u.characters || u.chars;
  return id === 'durgan' || (Array.isArray(list) && list.includes(id));
}
/** Which boss holds each friend (stage order). */
const FREED_BY = { bran: 'Grand Puffcap', elio: 'Glasscoil', clover: 'Cinderfang' };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const v3 = (a) => (!a ? null : a.isVector3 ? a.clone() : Array.isArray(a) ? V(a[0], a[1], a[2]) : V(a.x || 0, a.y || 0, a.z || 0));
const faceTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

// what each forger does while resting: [anim names, first one that exists wins]
const ROUTINE = {
  durgan: ['stir', 'sit'],
  bran: ['polish', 'sit'],
  elio: ['read', 'sit'],
  clover: ['count', 'sit'],
};
// little things they do now and then: [anims, seconds]
const HABITS = {
  durgan: [[['stir'], 6], [['laugh'], 1.6], [['sleep'], 5]],
  bran: [[['polish'], 6], [['sleep'], 6], [['shrug'], 2]],
  elio: [[['read'], 6], [['laugh'], 1.6], [['cast', 'point'], 1.8]],
  clover: [[['count'], 6], [['cheer'], 1.4], [['laugh'], 1.6]],
};
// the gesture a forger makes when you pick them
const GREET = { bran: ['cheer', 'wave'], elio: ['cast', 'wave'], durgan: ['shrug', 'cheer'], clover: ['wave'] };
const HELLO = { bran: 'Ready when you are.', elio: 'Kindle says hi!', durgan: 'Axe is sharp. Stew is hot.', clover: 'Ooh, me?' };
const LOCKED_LINE = { bran: '…', elio: '…', clover: '…' };

// ------------------------------------------------------------------ the logo, forged in
/** Split the logo into letters (runs of opaque columns), with a white-hot and an orange-hot copy. */
function forgeLogo(lg) {
  const w = lg.width, h = lg.height;
  const data = lg.getContext('2d').getImageData(0, 0, w, h).data;
  const col = new Array(w).fill(0);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (data[(y * w + x) * 4 + 3] > 40) col[x]++;
  // a letter ends where the column gets thin (the outline joins letters, so "thin" is ≤ 3 px)
  const segs = [];
  let start = -1;
  for (let x = 0; x <= w; x++) {
    const on = x < w && col[x] > 3;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { if (x - start > 6) segs.push([start, x]); else if (segs.length) segs[segs.length - 1][1] = x; start = -1; }
  }
  let letters = segs;
  if (letters.length < 5 || letters.length > 12) { letters = []; for (let i = 0; i < 8; i++) letters.push([Math.round((i / 8) * w), Math.round(((i + 1) / 8) * w)]); }
  // widen each slice to the gap midpoints so the outline is never cut
  const cuts = letters.map(([a, b], i) => [i ? Math.round((letters[i - 1][1] + a) / 2) : 0, i < letters.length - 1 ? Math.round((b + letters[i + 1][0]) / 2) : w]);
  const tint = (fill) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(lg, 0, 0);
    g.globalCompositeOperation = 'source-in';
    if (Array.isArray(fill)) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, fill[0]); gr.addColorStop(1, fill[1]); g.fillStyle = gr; } else g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
    return c;
  };
  return { w, h, cuts, white: tint('#fff8e0'), orange: tint(['#ffd060', '#ff5a10']) };
}

export class TitleScene extends Scene {
  enter() {
    const scene = new THREE.Scene();
    try { this.stage = buildStage('campmenu', 0); this.menuStage = true; } catch (e) { this.stage = buildStage('campfire', 0); this.menuStage = false; }
    this.stage.attach(scene);
    const A = (this.A = campAnchors(this.stage));
    const C0 = (A.cams && A.cams.menu) || this.stage.camera || { pos: [0, 2.6, 6.2], look: [0, 0.7, 0], fov: 38 };
    this.home = { pos: (v3(C0.pos) || V(0, 2.6, 6.2)).toArray(), look: (v3(C0.look) || V(0, 0.7, 0)).toArray(), fov: C0.fov || 38 };
    this.rig = new CameraRig(this.home.fov);
    this.rig.sway = 0.03;
    this.stage.setCamera && this.stage.setCamera(this.rig.camera);
    this.world = { scene, camera: this.rig.camera, post: { bloom: 0.9, threshold: 0.76, vignette: 0.42, outline: 0.6, edge: 0.35, saturation: 1.14, contrast: 1.05, exposure: 1 } };
    this.post0 = { ...this.world.post };
    // who may set out; the story has happened once the intro has been seen
    this.unlocked = Object.fromEntries(CHARACTER_ORDER.map((id) => [id, heroUnlocked(id)]));
    this.cursed = !!(save.data.seen && save.data.seen.intro);
    // the crew
    this.chars = {};
    for (const id of CHARACTER_ORDER) {
      const seat = A.seats[id];
      const c = buildCharacter(id);
      c.id = id;
      c.group.position.copy(seat.pos);
      c.home = seat.facing;
      c.group.rotation.y = seat.facing;
      c.seatHeight = seat.height;
      c.seated0 = seat.height > 0.05; // Durgan stands at the pot with his ladle
      c.setSeated && c.setSeated(c.seated0, seat.height);
      scene.add(c.group);
      this.chars[id] = c;
    }
    for (const id of CHARACTER_ORDER) {
      this.routine(this.chars[id]);
      // locked friends: still in stone once the story has happened (they're waiting to be freed)
      if (!this.unlocked[id] && this.cursed) { const c = this.chars[id]; for (let i = 0; i < 30; i++) c.update(1 / 30); c.setStone && c.setStone(1); c.statue = true; }
    }
    // Pip asleep in his bed by the fire
    try {
      this.pip = buildPet();
      this.pip.group.position.copy(A.petBed);
      this.pip.group.rotation.y = faceTo(A.petBed, A.fire) + 0.8;
      this.pip.play('sleep');
      scene.add(this.pip.group);
    } catch (e) { this.pip = null; }
    this.focus = null; this.zoom = null; this.panel = null;
    this.acts = {};
    this.habitT = 4 + rnd.float(0, 3);
    this.bubble = null;
    this.fade = 0;
    this.hintT = 0; this.picked = false;
    this.zzzT = 0;
    // the opening: in from the gate while the logo is forged (skippable; shorter after the first time)
    this.openingDur = save.data.seen && save.data.seen.title ? 4.2 : 7.2;
    this.startOpening();
    this.crackle = this.game.audio.loop('campfire');
    this.game.audio.music('title');
  }
  exit() { this.crackle && this.crackle.stop(1); }

  startOpening() {
    const A = this.A, cams = A.cams || {};
    const H = V(...this.home.pos), L = V(...this.home.look);
    const back = H.clone().sub(L).setY(0).normalize();
    const gate = cams.gate && cams.gate.pos ? { pos: v3(cams.gate.pos), look: v3(cams.gate.look) || L.clone(), fov: cams.gate.fov || 46 } : { pos: H.clone().addScaledVector(back, 7).add(V(0.6, 2.4, 0)), look: L.clone().add(V(0, 0.6, 0)), fov: 46 };
    const wide = cams.wide && cams.wide.pos ? { pos: v3(cams.wide.pos), look: v3(cams.wide.look) || L.clone(), fov: cams.wide.fov || 42 } : { pos: H.clone().addScaledVector(back, 3).add(V(-0.8, 1.2, 0)), look: L.clone(), fov: 42 };
    this.opening = {
      t: 0, dur: this.openingDur,
      pos: new THREE.CatmullRomCurve3([gate.pos, wide.pos, H.clone().add(V(0.15, 0.25, 0.4)), H], false, 'centripetal'),
      look: new THREE.CatmullRomCurve3([gate.look, wide.look, L.clone().add(V(0, 0.15, 0)), L], false, 'centripetal'),
      fov: [gate.fov, wide.fov, this.home.fov],
      struck: 0, logo: null, shine: false, done: false,
    };
    this.state = 'opening';
    this.rig.cut(gate.pos.toArray(), gate.look.toArray(), gate.fov);
  }
  /** Finish the opening now (a click, a key) or when it ends. */
  endOpening() {
    const o = this.opening;
    if (!o || o.done) return;
    o.done = true;
    this.rig.moveTo(this.home.pos, this.home.look, this.home.fov, o.t < o.dur - 0.5 ? 0.8 : 0.3, 'inOutCubic');
    this.state = 'menu';
    this.logoSettle = 0;
    if (save.data.seen) { save.data.seen.title = true; save.write(); }
  }

  project(v) { return this.rig.project(v, 960, 540); }
  headOf(c) { return c.headPos ? c.headPos() : c.group.localToWorld(V(0, 0.8, 0)); }

  routine(c) { if (!c.statue) playFirst(c, ROUTINE[c.id] || ['sit'], { loop: true }); }
  habit(id) {
    const c = this.chars[id];
    if (c.statue) return;
    const [names, dur] = rnd.pick(HABITS[id]);
    if (!playFirst(c, names, { loop: true })) return;
    this.acts[id] = dur;
  }

  // ------------------------------------------------------------------ picking a forger
  pick(id) {
    if (this.focus === id || this.state !== 'menu') return;
    if (this.focus) this.release(true);
    this.focus = id; this.picked = true;
    delete this.acts[id];
    const c = this.chars[id];
    const A = this.A;
    const locked = !this.unlocked[id];
    // camera: a cinematic push-in that arcs around to frame the forger left of centre
    const seat = A.seats[id].pos;
    const head = this.headOf(c);
    const inward = V(A.fire.x - seat.x, 0, A.fire.z - seat.z);
    if (inward.lengthSq() < 1e-4) inward.set(0, 0, 1);
    inward.normalize();
    const camDir = V(this.home.pos[0] - seat.x, 0, this.home.pos[2] - seat.z).normalize();
    const out = inward.multiplyScalar(0.65).addScaledVector(camDir, 0.35).normalize();
    const right = V(out.z, 0, -out.x);
    const zc = A.cams && A.cams.zoom && A.cams.zoom[id];
    const endPos = zc ? v3(zc.pos) : head.clone().addScaledVector(out, 1.55).add(V(0, 0.2, 0)).addScaledVector(right, -0.15);
    const endLook = zc ? v3(zc.look) : head.clone().add(V(0, -0.12, 0)).addScaledVector(right, 0.42);
    const startPos = this.rig.pos.clone(), startLook = this.rig.look.clone();
    const mid = startPos.clone().lerp(endPos, 0.5).lerp(V(...this.home.pos), 0.55).add(V(0, 0.3, 0)).addScaledVector(right, -0.4);
    this.zoom = {
      t: 0, dur: 1.55, fov0: this.rig.fov, fov1: zc ? (zc.fov || 34) + 4 : 30,
      pos: new THREE.CatmullRomCurve3([startPos, mid, endPos], false, 'centripetal'),
      look0: startLook, look1: endLook, endPos, endLook, out, right,
    };
    if (!locked) {
      // the forger stands, turns to us and does their thing; the others look over
      c.setSeated && c.setSeated(false);
      this.turnFrom = c.group.rotation.y; this.turnTo = faceTo(c.group.position, endPos); this.turnT = 0;
      playFirst(c, GREET[id] || ['wave'], { onDone: () => this.focus === id && playFirst(c, ['idle'], { loop: true }) });
      c.setExpression && c.setExpression('happy');
      for (const o of CHARACTER_ORDER) if (o !== id && !this.chars[o].statue) { const oc = this.chars[o]; oc.lookAt && oc.lookAt(this.headOf(c)); }
      this.bubble = { id, text: HELLO[id] || '', t: 2.4, dur: 2.4, delay: 0.9 };
      this.game.audio.play('ui_pop');
    } else {
      this.turnT = 1;
      this.bubble = c.statue ? null : { id, text: LOCKED_LINE[id] || '…', t: 1.6, dur: 1.6, delay: 0.7 };
      this.game.audio.play(c.statue ? 'stone_crack' : 'deny', { vol: 0.5 });
    }
    this.game.audio.play('transition', { vol: 0.4 });
    this.postTarget = locked ? { vignette: 0.7, saturation: 0.8, exposure: 0.95 } : { vignette: 0.66, saturation: 1.04, exposure: 0.97 };
    this.cardT = 0;
  }
  release(quick = false) {
    const id = this.focus;
    const c = this.chars[id];
    if (c && !c.statue) {
      c.setSeated && c.setSeated(c.seated0, c.seatHeight);
      c.group.rotation.y = c.home;
      c.setExpression && c.setExpression('neutral');
      this.routine(c);
    }
    for (const o of CHARACTER_ORDER) if (!this.chars[o].statue) this.chars[o].lookAt && this.chars[o].lookAt(null);
    this.focus = null; this.zoom = null; this.bubble = null;
    this.postTarget = null;
    if (!quick) this.rig.moveTo(this.home.pos, this.home.look, this.home.fov, 1.2, 'inOutCubic');
  }
  choose() {
    const id = this.focus;
    if (!id || this.state !== 'menu' || !this.unlocked[id]) return;
    this.state = 'leaving';
    this.game.audio.play('ui_pop');
    this.game.audio.play('anvil_ring', { vol: 0.6 });
    const z = this.zoom;
    const p = this.rig.pos.clone().lerp(this.headOf(this.chars[id]), 0.25);
    this.rig.moveTo(p.toArray(), z ? z.endLook.toArray() : null, (this.rig.fov || 30) - 3, 0.9, 'inOutSine');
    this.co.start(function* () {
      let t = 0;
      while (t < 0.85) { t += this.game.ui.dt || 0.016; this.fade = clamp(t / 0.85); yield null; }
      startRun(this.game, id);
    }.bind(this));
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.stage.update && this.stage.update(dt, this.time);
    for (const id in this.chars) if (!this.chars[id].statue) this.chars[id].update(dt);
    if (this.pip) this.pip.update(dt);
    // the opening glide
    const o = this.opening;
    if (o && !o.done) {
      o.t += dt;
      const k = ease.inOutSine(clamp(o.t / o.dur));
      const f = o.fov;
      this.rig.cut(o.pos.getPoint(k).toArray(), o.look.getPoint(k).toArray(), k < 0.5 ? f[0] + (f[1] - f[0]) * (k / 0.5) : f[1] + (f[2] - f[1]) * ((k - 0.5) / 0.5));
      this.rig.roll = 0.04 * Math.sin(k * Math.PI);
      if (o.t >= o.dur) this.endOpening();
      const inp = this.game.input;
      if (o.t > 0.4 && (inp.pressed || inp.anyKeyPressed())) { inp.consume && inp.consume(); this.endOpening(); }
    }
    // camera
    const z = this.zoom;
    if (z && this.state === 'menu') {
      if (z.t < z.dur) {
        z.t = Math.min(z.dur, z.t + dt);
        const k = ease.inOutCubic(z.t / z.dur);
        const p = z.pos.getPoint(k), l = z.look0.clone().lerp(z.look1, k);
        this.rig.cut(p.toArray(), l.toArray(), z.fov0 + (z.fov1 - z.fov0) * k);
        this.rig.roll = 0.07 * Math.sin(k * Math.PI);
      } else {
        const b = this.time * 0.35;
        const p = z.endPos.clone().addScaledVector(z.right, Math.sin(b) * 0.08).add(V(0, Math.sin(b * 0.7) * 0.03, 0));
        this.rig.aim(p.toArray(), z.endLook.toArray(), z.fov1, 3);
      }
    } else if (!this.focus && this.state === 'menu' && !this.rig.move) {
      const b = this.time * 0.16;
      this.rig.aim([this.home.pos[0] + Math.sin(b) * 0.22, this.home.pos[1] + Math.sin(b * 0.7) * 0.05, this.home.pos[2]], this.home.look, this.home.fov, 1.4);
    }
    this.rig.update(dt);
    // the chosen forger turns to face us
    if (this.focus && this.turnT < 1) {
      this.turnT = Math.min(1, this.turnT + dt * 2.6);
      const c = this.chars[this.focus];
      const d = Math.atan2(Math.sin(this.turnTo - this.turnFrom), Math.cos(this.turnTo - this.turnFrom));
      c.group.rotation.y = this.turnFrom + d * ease.outCubic(this.turnT);
    }
    const P = this.world.post, T = this.postTarget || this.post0;
    for (const k of ['vignette', 'saturation', 'exposure']) if (T[k] !== undefined) P[k] += (T[k] - P[k]) * (1 - Math.exp(-dt * 4));
    // body language while nobody is picked
    if (!this.focus && this.state === 'menu') {
      this.habitT -= dt;
      if (this.habitT <= 0) {
        this.habitT = 6 + rnd.float(0, 6);
        const free = CHARACTER_ORDER.filter((id) => !this.acts[id] && !this.chars[id].statue);
        if (free.length) this.habit(rnd.pick(free));
      }
    }
    for (const id in this.acts) {
      this.acts[id] -= dt;
      if (this.acts[id] <= 0) { delete this.acts[id]; const c = this.chars[id]; if (c && this.focus !== id && this.state === 'menu') this.routine(c); }
    }
    if (this.bubble) { if (this.bubble.delay > 0) this.bubble.delay -= dt; else { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; } }
    // the stew: steam and the odd bubble; Pip snores; the statues breathe a little jade light
    const P3 = this.stage.P;
    if (P3) {
      const pot = this.A.pot;
      if (rnd.chance(dt * 5)) P3.alpha.emit({ pos: [pot.x + rnd.float(-0.12, 0.12), pot.y + 0.32, pot.z + rnd.float(-0.12, 0.12)], vel: [rnd.float(-0.04, 0.06), rnd.float(0.25, 0.45), 0], spread: 0.04, life: [1.8, 3], size: [1, 2], sizeEnd: 4, color: ['#e8dcd0', '#d0c4c8'], alpha: 0.32, fadeIn: 0.4, swirl: 0.4 });
      if (rnd.chance(dt * 1.2)) P3.add.emit({ pos: [pot.x + rnd.float(-0.1, 0.1), pot.y + 0.3, pot.z + rnd.float(-0.1, 0.1)], vel: [0, 0.3, 0], spread: 0.05, life: [0.3, 0.6], size: 1, color: ['#ffd27a', '#ffb04a'], glow: 2 });
      if (this.pip && this.pip.anim !== 'happy') {
        this.zzzT -= dt;
        if (this.zzzT <= 0) { this.zzzT = 2.4; const b = this.A.petBed; P3.alpha.emit({ pos: [b.x, b.y + 0.3, b.z], vel: [0.05, 0.22, 0], spread: 0.02, life: [1.2, 1.8], size: [1, 2], color: '#e8e0f0', alpha: 0.5, fadeIn: 0.2 }); }
      }
      for (const id of CHARACTER_ORDER) {
        const c = this.chars[id];
        if (!c.statue || !rnd.chance(dt * 2.2)) continue;
        const h = this.headOf(c);
        P3.add.emit({ pos: [h.x + rnd.float(-0.18, 0.18), rnd.float(0.15, h.y), h.z + rnd.float(-0.18, 0.18)], vel: [0, 0.12, 0], spread: 0.04, life: [0.8, 1.6], size: 1, color: ['#7affc0', '#c0ffe0'], glow: 2.2, flicker: 0.5 });
      }
    }
    if (rnd.chance(dt * 0.12) && !this.focus) this.game.audio.play('stew_bubble', { vol: 0.25 });
    if (this.focus && this.game.input.actionPressed('back')) this.release();
  }

  // ------------------------------------------------------------------ UI
  tag(ui, x, y, text, color = '#3a2214', alpha = 1) {
    const w = ui.measure(text) + 16;
    const c = tagCanvas(w);
    const bx = Math.round(clamp(x - c.width / 2, 4, ui.w - c.width - 4)), by = Math.round(clamp(y, 4, ui.h - 24));
    ui.img(c, bx, by, { alpha });
    ui.ctx.globalAlpha = alpha;
    ui.text(text, bx + 10, by + 11, { color });
    ui.ctx.globalAlpha = 1;
  }
  rectOf(v, r = 0.3, up = 0.3) {
    const c = this.project(v.clone().add(V(0, up, 0)));
    const e = this.project(v.clone().add(V(r, up, 0)));
    const s = Math.max(16, Math.abs(e.x - c.x));
    return { x: c.x - s, y: c.y - s, w: s * 2, h: s * 2, cx: c.x, cy: c.y - s, behind: c.behind };
  }

  draw(ui) {
    if (this.state === 'leaving') { this.drawLogo(ui); this.drawFade(ui); return; }
    if (this.state === 'opening') { this.drawLogo(ui); this.drawFade(ui); return; }
    // the forgers are the menu
    if (!this.panel) {
      for (const id of CHARACTER_ORDER) {
        const c = this.chars[id];
        const top = this.project(this.headOf(c));
        const feet = this.project(c.group.position);
        if (top.behind) continue;
        const hgt = Math.max(44, feet.y - top.y + 30), wdt = Math.max(40, hgt * 0.8);
        const hit = ui.hit('char-' + id, top.x - wdt / 2, top.y - 22, wdt, hgt + 6, { cursor: 'hand', sound: false });
        const locked = !this.unlocked[id];
        if (hit.hover && this.focus !== id && !ui.touch) this.tag(ui, top.x, top.y - 44, locked ? `${CHARACTERS[id].name} · locked` : CHARACTERS[id].name, locked ? '#5a5060' : CHARACTERS[id].color);
        // a little padlock over the locked ones
        if (locked && this.focus !== id) { const bob = Math.round(Math.sin(this.time * 2 + id.length) * 1.5); ui.icon('lock', Math.round(top.x - 5), Math.round(top.y - 26 + bob), { alpha: 0.85 }); }
        if (hit.clicked) this.pick(id);
      }
    }
    if (this.bubble && this.bubble.delay <= 0 && this.bubble.text) {
      const c = this.chars[this.bubble.id], b = this.bubble;
      const p = this.project(this.headOf(c).add(V(0, 0.18, 0)));
      if (!p.behind) this.speech(ui, p.x, p.y - 6, b.text, clamp(b.t * 3) * clamp((b.dur - b.t) * 6));
    }
    if (this.focus) { this.drawCard(ui); this.drawFade(ui); return; }
    this.drawLogo(ui);
    if (!this.panel) {
      const obj = (key, v, r, up, label, fn) => {
        if (!v) return;
        const o = this.rectOf(v, r, up);
        if (o.behind) return;
        const h = ui.hit('obj-' + key, o.x, o.y, o.w, o.h, { sound: false, cursor: 'hand' });
        if (h.hover && !ui.touch) this.tag(ui, o.cx, o.y - 26, label);
        if (h.clicked) { this.game.audio.play('ui_pop'); fn(); }
      };
      obj('codex', this.A.books, 0.3, 0.12, 'Codex', () => { this.panel = 'codex'; this.game.audio.play('page_turn'); });
      obj('settings', this.A.lantern, 0.24, 0, 'Settings', () => { this.panel = 'settings'; });
      obj('recipes', this.A.mapCrate, 0.3, 0.1, 'Recipe book', () => { this.panel = 'recipes'; this.game.audio.play('map_unfold'); });
      if ((ui.touch || !this.A.lantern) && ui.iconButton('settings-gear', ui.w - 26, ui.h - 30, 'tool', { size: 20 })) this.panel = 'settings';
      if (ui.iconButton('recipes-btn', ui.w - 26 - (ui.touch || !this.A.lantern ? 26 : 0), ui.h - 30, 'scroll', { size: 20, tip: 'Recipe book' })) { this.panel = 'recipes'; this.game.audio.play('map_unfold'); }
    }
    if (!this.panel && !this.picked && this.time > 1.2) {
      const a = clamp((this.time - 1.2) * 1.2) * (0.75 + 0.25 * Math.sin(this.time * 2.4));
      ui.ctx.globalAlpha = a;
      ui.text(ui.touch ? 'tap Durgan to set out' : 'pick Durgan to set out', ui.w / 2, ui.h - 22, { align: 'center', color: '#f4e6c8', outline: '#140c10' });
      ui.ctx.globalAlpha = 1;
    }
    if (this.panel === 'codex') this.drawCodex(ui);
    if (this.panel === 'settings') this.drawSettings(ui);
    if (this.panel === 'recipes') this.drawRecipes(ui);
    this.drawFade(ui);
  }

  /** The logo: forged letter by letter during the opening, then it lifts to the top of the screen. */
  drawLogo(ui) {
    const o = this.opening;
    if (!o) return;
    const big = logo(2);
    if (!o.logo) { try { o.logo = forgeLogo(big); } catch (e) { o.logo = { w: big.width, h: big.height, cuts: [[0, big.width]], white: big, orange: big }; } }
    const F = o.logo, n = F.cuts.length;
    const ctx = ui.ctx;
    const t = o.done ? Math.max(o.t, 1.1 + n * 0.3 + 1.6) : o.t;
    // where it sits: centre during the opening, small at the top for the menu
    const settle = o.done ? (this.logoSettle = Math.min(1, (this.logoSettle || 0) + ui.dt * 1.4)) : 0;
    const e = ease.inOutCubic(settle);
    const scale = 1 - 0.5 * e;
    const cx = ui.w / 2, cy = (ui.h * 0.36) * (1 - e) + (12 + (big.height * 0.5) / 2) * e + (this.focus ? -200 * e : 0);
    const W = F.w * scale, H = F.h * scale;
    const x0 = Math.round(cx - W / 2), y0 = Math.round(cy - H / 2 + Math.sin(this.time * 1.1) * 2 * e);
    if (this.focus) return;
    for (let i = 0; i < n; i++) {
      const [a, b] = F.cuts[i];
      const strike = 1.1 + i * 0.3;
      const lt = t - strike; // seconds since this letter was struck
      if (lt < -0.18) continue;
      // fall in, squash on the blow, settle
      const fallK = clamp((lt + 0.18) / 0.18);
      const drop = lt < 0 ? Math.round((1 - ease.inQuad(fallK)) * -46 * scale) : 0;
      const squash = lt >= 0 && lt < 0.14 ? 1 - Math.sin((lt / 0.14) * Math.PI) * 0.18 : 1;
      const sw = (b - a) * scale, sh = F.h * scale * squash;
      const dx = x0 + a * scale, dy = y0 + drop + (F.h * scale - sh);
      ctx.drawImage(big, a, 0, b - a, F.h, Math.round(dx), Math.round(dy), Math.round(sw), Math.round(sh));
      // heat: white-hot, then orange, cooling to the metal
      const heat = lt < 0 ? 1 : clamp(1 - lt / 1.6);
      if (heat > 0.01) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, heat * 1.1);
        ctx.drawImage(F.orange, a, 0, b - a, F.h, Math.round(dx), Math.round(dy), Math.round(sw), Math.round(sh));
        ctx.globalAlpha = heat * heat * heat;
        ctx.drawImage(F.white, a, 0, b - a, F.h, Math.round(dx), Math.round(dy), Math.round(sw), Math.round(sh));
        ctx.restore();
      }
      // the blow: sparks, a ring, a ring of the anvil
      if (!o.done && o.struck <= i && lt >= 0) {
        o.struck = i + 1;
        const sx = dx + sw / 2, sy = dy + sh * 0.8;
        ui.burst(sx, sy, 26, { colors: ['#fff4c8', '#ffd27a', '#ff9a3a', '#ff6a1a'], speed: 150, speedMin: 40, up: 60, gravity: 220, life: 0.8, drag: 0.4, glow: true });
        this.game.audio.play('forge_strike', { pitch: 0.92 + (i % 3) * 0.06, vol: 0.7 });
        this.rig.shake(0.08);
        this.game.haptic && this.game.haptic(12);
      }
    }
    // a shine sweeps across once it's all forged
    const shineT = t - (1.1 + n * 0.3 + 0.5);
    if (shineT > 0 && shineT < 0.8) {
      // a bright band that only lights the metal (masked by the letters)
      const k = shineT / 0.8;
      const m = F.mask || (F.mask = document.createElement('canvas'));
      m.width = F.w; m.height = F.h;
      const g = m.getContext('2d');
      g.clearRect(0, 0, F.w, F.h);
      g.fillStyle = '#fff4d0';
      const bx = -60 + (F.w + 120) * k;
      g.beginPath(); g.moveTo(bx, 0); g.lineTo(bx + 34, 0); g.lineTo(bx - 6, F.h); g.lineTo(bx - 40, F.h); g.fill();
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(big, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75 * Math.sin(k * Math.PI);
      ctx.drawImage(m, x0, y0, Math.round(W), Math.round(H));
      ctx.restore();
      if (!o.shine) { o.shine = true; this.game.audio.play('sparkle', { vol: 0.6 }); }
    }
    // the subtitle, only during the opening
    if (!o.done) {
      const st = t - (1.1 + n * 0.3 + 0.9);
      if (st > 0) { ctx.globalAlpha = clamp(st * 1.5); ui.text('a forger\'s tale', cx, y0 + H + 6, { align: 'center', font: 'large', color: '#e8d8b8', outline: '#08060c' }); ctx.globalAlpha = 1; }
      if (o.t > 1.5) { ctx.globalAlpha = 0.5 + 0.2 * Math.sin(this.time * 3); ui.text(ui.touch ? 'tap to skip' : 'click to skip', ui.w - 14, ui.h - 18, { align: 'right', font: 'small', color: '#c8b8a0', outline: '#08060c' }); ctx.globalAlpha = 1; }
    }
  }
  drawFade(ui) {
    const inK = clamp(1 - this.time / 0.9);
    const a = Math.max(this.fade, ease.inOutSine(inK));
    if (a > 0.003) ui.rect(0, 0, ui.w, ui.h, '#040306', a);
  }
  speech(ui, x, y, text, alpha) {
    const w = ui.measure(text) + 14, h = 18;
    const bx = Math.round(clamp(x - w / 2, 4, ui.w - w - 4)), by = Math.round(y - h - 6);
    ui.ctx.globalAlpha = alpha;
    ui.rect(bx + 1, by, w - 2, h, '#f6ecd8'); ui.rect(bx, by + 1, w, h - 2, '#f6ecd8');
    ui.rect(bx + 1, by + h - 1, w - 2, 1, '#c8b494');
    ui.rect(Math.round(x) - 2, by + h, 5, 2, '#f6ecd8'); ui.rect(Math.round(x) - 1, by + h + 2, 3, 2, '#f6ecd8');
    ui.text(text, bx + 7, by + 5, { color: '#3a2214' });
    ui.ctx.globalAlpha = 1;
  }

  /** The forger's card: who they are, three perks in a few words, and Choose (or how to free them). */
  drawCard(ui) {
    const id = this.focus, C = CHARACTERS[id];
    const locked = !this.unlocked[id];
    this.cardT = (this.cardT || 0) + ui.dt;
    const k = ease.outCubic(clamp((this.cardT - 0.75) * 2.6));
    if (k <= 0) return;
    const touch = ui.touch;
    const W = 236, H = locked ? 150 : touch ? 196 : 182;
    const x = Math.round(ui.w - W - 26 + (1 - k) * 40), y = Math.round(ui.h / 2 - H / 2 - 10);
    ui.img(noteCanvas(W, H, 21 + CHARACTER_ORDER.indexOf(id)), x, y, { alpha: k });
    const ink = '#3a2214';
    const txt = (str, tx, ty, o) => { ui.ctx.globalAlpha = k; ui.text(str, tx, ty, o); ui.ctx.globalAlpha = 1; };
    ui.big(C.name, x + 18, y + 14, { scale: 2, top: locked ? '#a8a0a8' : C.color || '#e8a060', bottom: locked ? '#4a4450' : '#5a2a14', outline: '#2a160c', align: 'left', valign: 'top', alpha: k });
    txt(C.title || '', x + 18, y + 40, { color: '#6a4a30' });
    if (locked) {
      ui.icon('lock', x + W - 34, y + 16, { alpha: k });
      txt(this.chars[id].statue ? 'Still in stone.' : 'Not yet.', x + 18, y + 62, { color: ink });
      const hintFn = fnOf(UNLOCKS, 'unlockHintFor', 'unlockHeroHint');
      let hint = null;
      if (hintFn) { try { hint = hintFn(id); } catch (e) { hint = null; } }
      txt(hint || `Beat ${FREED_BY[id] || 'a boss'} to free them.`, x + 18, y + 80, { color: '#7a3a00', maxW: W - 36 });
      const bh = touch ? 30 : 24;
      if (ui.button('back', x + W / 2 - 34, y + H - bh - 14, 68, bh, 'Back', { style: 'wood' })) this.release();
    } else {
      ui.icon('heart', x + W - 52, y + 16, { alpha: k }); txt(`${C.hp}`, x + W - 38, y + 17, { color: '#8a2a20' });
      const perks = (C.perks || C.passives || []).slice(0, 3);
      perks.forEach((p, i) => {
        const yy = y + 62 + i * 24;
        ui.icon(p.icon || 'star', x + 18, yy + 2, { alpha: k });
        txt(p.short || p.name || '', x + 36, yy + 3, { color: ink, maxW: W - 52 });
      });
      if (k < 1) return;
      const bw = touch ? 120 : 108, bh = touch ? 30 : 24;
      if (ui.button('choose', x + 18, y + H - bh - 14, bw, bh, 'Set out', { style: 'gold', icon: 'axe', key: touch ? undefined : 'SPACE' }) || this.game.input.actionPressed('confirm')) this.choose();
      if (ui.button('back', x + W - 70, y + H - bh - 14, 52, bh, 'Back', { style: 'wood' })) this.release();
    }
    if (k < 1) return;
    const idx = CHARACTER_ORDER.indexOf(id);
    if (this.game.input.actionPressed('right')) this.pick(CHARACTER_ORDER[(idx + 1) % 4]);
    else if (this.game.input.actionPressed('left')) this.pick(CHARACTER_ORDER[(idx + 3) % 4]);
    else if (this.game.input.pressed && !this.game.input.consumed && ui.mx < x - 10 && this.zoom && this.zoom.t >= this.zoom.dur) {
      const c = this.chars[id], top = this.project(this.headOf(c)), feet = this.project(c.group.position);
      const onHer = Math.abs(ui.mx - top.x) < 70 && ui.my > top.y - 30 && ui.my < feet.y + 20;
      if (!onHer) this.release();
    }
  }

  /** The recipe book: every recipe you have found, with its ingredients in order. */
  drawRecipes(ui) {
    ui.block(3);
    dim(ui, 0.6);
    const W = Math.min(440, ui.w - 20), H = 260, x = ui.w / 2 - W / 2, y = ui.h / 2 - H / 2;
    ui.panel('parchment', x, y, W, H, { seed: 31 });
    const ink = '#3a2618';
    ui.text('Recipe book', x + W / 2, y + 10, { align: 'center', color: ink });
    const book = recipeBook();
    if (!book.length) ui.text('{dim}Empty. Recipes are found in the dungeon.{/}', x + W / 2, y + 60, { align: 'center', color: ink });
    const per = 9;
    this.recipePage = clamp(this.recipePage || 0, 0, Math.max(0, Math.ceil(book.length / per) - 1));
    book.slice(this.recipePage * per, this.recipePage * per + per).forEach((r, i) => {
      const yy = y + 30 + i * 23;
      ui.text(r.known ? r.name : '? ? ?', x + 16, yy + 4, { color: r.known ? '#7a3a00' : '#9a8a7a' });
      r.ings.forEach((ing, j) => {
        const ix = x + 150 + j * 52;
        if (j) ui.text('›', ix - 9, yy + 4, { color: '#9a7a5a' });
        ui.text(r.known ? ingName(ing) : '?', ix, yy + 4, { color: ink, font: 'small', maxW: 46 });
      });
    });
    if (book.length > per) {
      if (ui.button('rec-prev', x + 14, y + H - 26, 26, 18, '<', { style: 'wood', disabled: this.recipePage === 0 })) this.recipePage--;
      if (ui.button('rec-next', x + 44, y + H - 26, 26, 18, '>', { style: 'wood', disabled: (this.recipePage + 1) * per >= book.length })) this.recipePage++;
    }
    if (ui.button('rec-close', x + W - 70, y + H - 26, 60, 18, 'Close', { style: 'wood' }) || this.game.input.actionPressed('back')) this.panel = null;
    ui.unblock();
  }

  drawCodex(ui) {
    ui.block(3);
    dim(ui, 0.6);
    const W = Math.min(420, ui.w - 20), H = 250, x = ui.w / 2 - W / 2, y = ui.h / 2 - H / 2;
    ui.panel('parchment', x, y, W, H, { seed: 12 });
    const ink = '#3a2618';
    ui.text('Codex', x + W / 2, y + 10, { align: 'center', color: ink });
    const d = save.data.discovered || { recipes: [], synergies: [] };
    const known = d.recipes || [];
    ui.text(`{#7a3a00}Weapons ${known.filter((r) => RECIPES[r]).length}/${Object.keys(RECIPES).length}{/}`, x + 14, y + 28, { color: ink });
    Object.entries(RECIPES).forEach(([rid, r], i) => {
      const kn = known.includes(rid);
      const cx = x + 14 + (i % 2) * (W / 2 - 8), cy = y + 42 + Math.floor(i / 2) * 16;
      ui.icon(BLUEPRINTS[r.bp] ? BLUEPRINTS[r.bp].icon : 'sword', cx, cy + 1, { alpha: kn ? 1 : 0.35 });
      ui.text(kn ? r.name : '? ? ?', cx + 12, cy, { color: kn ? '#7a3a00' : '#9a8a7a' });
    });
    let sy = y + 46 + Math.ceil(Object.keys(RECIPES).length / 2) * 16;
    const STEWS = STEW_DATA.STEWS || {};
    const sk = Object.keys(STEWS);
    if (sk.length && sy < y + H - 60) {
      const ks = d.stews || [];
      ui.text(`{#7a3a00}Stews ${ks.filter((s) => STEWS[s]).length}/${sk.length}{/}`, x + 14, sy, { color: ink });
      sk.slice(0, 8).forEach((sid, i) => {
        const kn = ks.includes(sid);
        ui.text(kn ? STEWS[sid].name : '? ? ?', x + 14 + (i % 2) * (W / 2 - 8), sy + 14 + Math.floor(i / 2) * 12, { color: kn ? '#7a3a00' : '#9a8a7a', font: 'small' });
      });
      sy += 14 + Math.ceil(Math.min(8, sk.length) / 2) * 12 + 6;
    }
    const syn = d.synergies || [];
    ui.text(`{#7a3a00}Synergies ${syn.length}/${SYNERGIES.length}{/}`, x + 14, Math.min(sy, y + H - 40), { color: ink, font: 'small' });
    if (ui.button('codex-close', x + W - 70, y + H - 26, 60, 18, 'Close', { style: 'wood' }) || this.game.input.actionPressed('back')) this.panel = null;
    ui.unblock();
  }

  drawSettings(ui) {
    ui.block(3);
    dim(ui, 0.6);
    const W = 220, H = 140, x = ui.w / 2 - W / 2, y = ui.h / 2 - H / 2;
    ui.panel('leather', x, y, W, H, { tone: 'dark' });
    ui.text('Settings', x + W / 2, y + 10, { align: 'center', color: COLORS.gold });
    const s = save.data.settings;
    const slider = (label, key, yy) => {
      ui.text(label, x + 14, yy, { color: COLORS.white });
      const sx = x + 90, sw = 110;
      ui.rect(sx, yy + 3, sw, 3, '#2a1d22');
      ui.rect(sx, yy + 3, Math.round(sw * s[key]), 3, '#ffb63d');
      ui.rect(sx + Math.round(sw * s[key]) - 2, yy, 4, 9, '#fff6e0');
      const h = ui.hit('sl' + key, sx - 4, yy - 5, sw + 8, 18);
      if (h.down || (h.hover && this.game.input.down)) { s[key] = clamp((ui.mx - sx) / sw, 0, 1); this.game.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx }); }
      if (h.clicked) { save.write(); this.game.audio.play('blip'); }
    };
    slider('Master', 'master', y + 32);
    slider('Music', 'music', y + 50);
    slider('Effects', 'sfx', y + 68);
    if (ui.button('set-shake', x + 14, y + 88, W - 28, 18, `Screen shake: ${s.shake ? 'On' : 'Off'}`, { style: 'wood' })) { s.shake = s.shake ? 0 : 1; save.write(); CameraRig.shakeSetting = s.shake; }
    if (ui.button('set-close', x + W / 2 - 40, y + H - 26, 80, 18, 'Close', { style: 'gold' }) || this.game.input.actionPressed('back')) { this.panel = null; save.write(); }
    ui.unblock();
  }
}

// ------------------------------------------------------------------ the recipe book's data
const ingName = (id) => (MATERIALS[id] ? MATERIALS[id].name : String(id).replace(/_/g, ' '));
/** [{ name, ings:[ordered ids], known }] from the crafting system (falls back to the old weapon recipes). */
function recipeBook() {
  const book = fnOf(CRAFT, 'recipeBook', 'knownRecipes', 'listRecipes');
  if (book) { try { const b = book(save.data); if (Array.isArray(b)) return b.map((r) => ({ name: r.name || (r.out && MATERIALS[r.out] ? MATERIALS[r.out].name : r.id), ings: r.ings || [], known: r.known !== false })); } catch (e) { /* fall back */ } }
  const mod = CRAFT, rk = ['RECIPES', 'CRAFT_RECIPES'].find((k) => mod[k] && typeof mod[k] === 'object');
  const R = rk ? mod[rk] : null;
  const known = (save.data.discovered && save.data.discovered.recipes) || [];
  if (R) return Object.entries(R).map(([id, r]) => ({ name: r.name || (MATERIALS[r.out] ? MATERIALS[r.out].name : id), ings: r.ings || [], known: known.includes(id) })).sort((a, b) => b.known - a.known);
  return Object.entries(RECIPES).map(([id, r]) => ({ name: r.name, ings: r.ings, known: known.includes(id) })).sort((a, b) => b.known - a.known);
}
