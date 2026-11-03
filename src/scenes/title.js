// Main menu: the crew's camp deep in an old dungeon (stage_vox 'campmenu'; 'campfire' until it exists).
// It opens straight on the four forgers resting by the fire — no loading screen, no story scroll:
// Durgan stirs the stew, Bran polishes a blade (or dozes), Elio reads with Kindle bobbing beside him,
// Clover counts diamonds, and Pip the mole-dog sleeps in his bed. They hardly talk; what they do is
// the menu. Tap a forger and the camera pushes in on them; a small card shows who they are; Choose
// starts the story. Settings and the codex are objects in the camp (the lantern, Elio's book).
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
import { SYNERGIES } from '../systems/forge.js';
import { logo } from '../art/sprites.js';
import { COLORS } from '../ui/font.js';
import { save } from '../core/save.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

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
const HELLO = { bran: 'Ready when you are.', elio: 'Kindle says hi!', durgan: 'Stew first.', clover: 'Ooh, me?' };

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
    // the first frame starts a touch further out and settles in while the dark fades
    const p0 = V(...this.home.pos).add(V(0, 0.35, 0.9));
    this.rig.cut(p0.toArray(), this.home.look, this.home.fov + 3);
    this.rig.moveTo(this.home.pos, this.home.look, this.home.fov, 2.6, 'outCubic');
    this.stage.setCamera && this.stage.setCamera(this.rig.camera);
    this.world = { scene, camera: this.rig.camera, post: { bloom: 0.9, threshold: 0.76, vignette: 0.42, outline: 0.6, edge: 0.35, saturation: 1.14, contrast: 1.05, exposure: 1 } };
    this.post0 = { ...this.world.post };
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
    // (hand props — Durgan's ladle, Bran's blade and rag, Clover's gems, Elio's book — come with the anims)
    for (const id of CHARACTER_ORDER) this.routine(this.chars[id]);
    // Pip asleep in his bed by the fire
    try {
      this.pip = buildPet();
      this.pip.group.position.copy(A.petBed);
      this.pip.group.rotation.y = faceTo(A.petBed, A.fire) + 0.8;
      this.pip.play('sleep');
      scene.add(this.pip.group);
    } catch (e) { this.pip = null; }
    this.focus = null; this.zoom = null; this.panel = null;
    this.state = 'menu';
    this.acts = {};
    this.habitT = 4 + rnd.float(0, 3);
    this.bubble = null;
    this.fadeIn = 1; this.fade = 0;
    this.hintT = 0; this.picked = false;
    this.zzzT = 0;
    this.crackle = this.game.audio.loop('campfire');
    this.game.audio.music('camp');
  }
  exit() { this.crackle && this.crackle.stop(1); }

  project(v) { return this.rig.project(v, 960, 540); }
  headOf(c) { return c.headPos ? c.headPos() : c.group.localToWorld(V(0, 0.8, 0)); }

  routine(c) { playFirst(c, ROUTINE[c.id] || ['sit'], { loop: true }); }
  habit(id) {
    const c = this.chars[id];
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
    // camera: a cinematic push-in that arcs around to frame the forger left of centre
    const seat = A.seats[id].pos;
    const head = this.headOf(c);
    // forgers face the fire, so the close-up is shot from the fire side (an across-the-campfire shot),
    // leaning toward the menu camera so the room behind stays the one we know
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
    // the arc swings out through the wide shot (never through the camp or past someone's face)
    const mid = startPos.clone().lerp(endPos, 0.5).lerp(V(...this.home.pos), 0.55).add(V(0, 0.3, 0)).addScaledVector(right, -0.4);
    this.zoom = {
      t: 0, dur: 1.55, fov0: this.rig.fov, fov1: zc ? (zc.fov || 34) + 4 : 30,
      pos: new THREE.CatmullRomCurve3([startPos, mid, endPos], false, 'centripetal'),
      look0: startLook, look1: endLook, endPos, endLook, out, right,
    };
    // the forger stands, turns to us and does their thing; the others look over
    c.setSeated && c.setSeated(false);
    const camPos = endPos.clone();
    this.turnFrom = c.group.rotation.y; this.turnTo = faceTo(c.group.position, camPos); this.turnT = 0;
    playFirst(c, GREET[id] || ['wave'], { onDone: () => this.focus === id && playFirst(c, ['idle'], { loop: true }) });
    c.setExpression && c.setExpression('happy');
    for (const o of CHARACTER_ORDER) if (o !== id) { const oc = this.chars[o]; oc.lookAt && oc.lookAt(this.headOf(c)); }
    this.bubble = { id, text: HELLO[id] || '', t: 2.4, dur: 2.4, delay: 0.9 };
    this.game.audio.play('ui_pop');
    this.game.audio.play('transition', { vol: 0.4 });
    if (id === 'clover' || id === 'elio') this.game.audio.play('sparkle', { vol: 0.4 });
    this.postTarget = { vignette: 0.66, saturation: 1.04, exposure: 0.97 };
    this.cardT = 0;
  }
  release(quick = false) {
    const id = this.focus;
    const c = this.chars[id];
    if (c) {
      c.setSeated && c.setSeated(c.seated0, c.seatHeight);
      c.group.rotation.y = c.home;
      c.setExpression && c.setExpression('neutral');
      this.routine(c);
    }
    for (const o of CHARACTER_ORDER) this.chars[o].lookAt && this.chars[o].lookAt(null);
    this.focus = null; this.zoom = null; this.bubble = null;
    this.postTarget = null;
    if (!quick) this.rig.moveTo(this.home.pos, this.home.look, this.home.fov, 1.2, 'inOutCubic');
  }
  choose() {
    const id = this.focus;
    if (!id || this.state !== 'menu') return;
    this.state = 'leaving';
    this.game.audio.play('ui_pop');
    this.game.audio.play('stew_bubble', { vol: 0.6 });
    // a last little push toward the forger, then into the story
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
    for (const id in this.chars) this.chars[id].update(dt);
    if (this.pip) this.pip.update(dt);
    this.fadeIn = Math.max(0, this.fadeIn - dt * 1.6);
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
        // a slow breathing drift around the forger
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
    // grade eases toward the focus look (the others sink a little into the dark)
    const P = this.world.post, T = this.postTarget || this.post0;
    for (const k of ['vignette', 'saturation', 'exposure']) if (T[k] !== undefined) P[k] += (T[k] - P[k]) * (1 - Math.exp(-dt * 4));
    // body language while nobody is picked
    if (!this.focus && this.state === 'menu') {
      this.habitT -= dt;
      if (this.habitT <= 0) {
        this.habitT = 6 + rnd.float(0, 6);
        const free = CHARACTER_ORDER.filter((id) => !this.acts[id]);
        if (free.length) this.habit(rnd.pick(free));
      }
    }
    for (const id in this.acts) {
      this.acts[id] -= dt;
      if (this.acts[id] <= 0) { delete this.acts[id]; const c = this.chars[id]; if (c && this.focus !== id && this.state === 'menu') this.routine(c); }
    }
    if (this.bubble) { if (this.bubble.delay > 0) this.bubble.delay -= dt; else { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; } }
    // the stew: steam and the odd bubble; Pip snores
    const P3 = this.stage.P;
    if (P3) {
      const pot = this.A.pot;
      if (rnd.chance(dt * 5)) P3.alpha.emit({ pos: [pot.x + rnd.float(-0.12, 0.12), pot.y + 0.32, pot.z + rnd.float(-0.12, 0.12)], vel: [rnd.float(-0.04, 0.06), rnd.float(0.25, 0.45), 0], spread: 0.04, life: [1.8, 3], size: [1, 2], sizeEnd: 4, color: ['#e8dcd0', '#d0c4c8'], alpha: 0.32, fadeIn: 0.4, swirl: 0.4 });
      if (rnd.chance(dt * 1.2)) P3.add.emit({ pos: [pot.x + rnd.float(-0.1, 0.1), pot.y + 0.3, pot.z + rnd.float(-0.1, 0.1)], vel: [0, 0.3, 0], spread: 0.05, life: [0.3, 0.6], size: 1, color: ['#ffd27a', '#ffb04a'], glow: 2 });
      if (this.pip && this.pip.anim !== 'happy') {
        this.zzzT -= dt;
        if (this.zzzT <= 0) { this.zzzT = 2.4; const b = this.A.petBed; P3.alpha.emit({ pos: [b.x, b.y + 0.3, b.z], vel: [0.05, 0.22, 0], spread: 0.02, life: [1.2, 1.8], size: [1, 2], color: '#e8e0f0', alpha: 0.5, fadeIn: 0.2 }); }
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
    if (this.state === 'leaving') { this.drawFade(ui); return; }
    // the forgers are the menu
    if (!this.panel) {
      for (const id of CHARACTER_ORDER) {
        const c = this.chars[id];
        const top = this.project(this.headOf(c));
        const feet = this.project(c.group.position);
        if (top.behind) continue;
        const hgt = Math.max(44, feet.y - top.y + 30), wdt = Math.max(40, hgt * 0.8);
        const hit = ui.hit('char-' + id, top.x - wdt / 2, top.y - 22, wdt, hgt + 6, { cursor: 'hand', sound: false });
        if (hit.hover && this.focus !== id && !ui.touch) this.tag(ui, top.x, top.y - 44, CHARACTERS[id].name, CHARACTERS[id].color);
        if (hit.clicked) this.pick(id);
      }
    }
    // a word from the picked forger
    if (this.bubble && this.bubble.delay <= 0 && this.bubble.text) {
      const c = this.chars[this.bubble.id], b = this.bubble;
      const p = this.project(this.headOf(c).add(V(0, 0.18, 0)));
      if (!p.behind) this.speech(ui, p.x, p.y - 6, b.text, clamp(b.t * 3) * clamp((b.dur - b.t) * 6));
    }
    if (this.focus) { this.drawCard(ui); this.drawFade(ui); return; }
    // the logo, small and floating over the camp
    const lg = logo(1);
    const bob = Math.round(Math.sin(this.time * 1.1) * 2);
    const la = clamp((this.time - 0.4) * 1.5);
    ui.img(lg, Math.round(ui.w / 2 - lg.width / 2), 12 + bob, { alpha: la });
    // camp objects: the lantern (settings) and Elio's book (codex)
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
      obj('codex-map', this.A.mapCrate, 0.3, 0.1, 'Codex', () => { this.panel = 'codex'; this.game.audio.play('map_unfold'); });
      // a small medallion in the corner for settings (always there on phones, and when the camp has no lantern)
      if ((ui.touch || !this.A.lantern) && ui.iconButton('settings-gear', ui.w - 26, ui.h - 30, 'tool', { size: 20 })) this.panel = 'settings';
    }
    // one tiny hint, until someone is picked
    if (!this.panel && !this.picked && this.time > 2.2) {
      const a = clamp((this.time - 2.2) * 1.2) * (0.75 + 0.25 * Math.sin(this.time * 2.4));
      ui.ctx.globalAlpha = a;
      ui.text(ui.touch ? 'tap a forger' : 'pick a forger', ui.w / 2, ui.h - 22, { align: 'center', color: '#f4e6c8', outline: '#140c10' });
      ui.ctx.globalAlpha = 1;
    }
    if (this.panel === 'codex') this.drawCodex(ui);
    if (this.panel === 'settings') this.drawSettings(ui);
    this.drawFade(ui);
  }
  drawFade(ui) {
    const a = Math.max(this.fade, ease.inOutSine(clamp(this.fadeIn)));
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

  /** The forger's card: who they are, three perks in a few words, and Choose. */
  drawCard(ui) {
    const id = this.focus, C = CHARACTERS[id];
    this.cardT = (this.cardT || 0) + ui.dt;
    const k = ease.outCubic(clamp((this.cardT - 0.75) * 2.6));
    if (k <= 0) return;
    const touch = ui.touch;
    const W = 236, H = touch ? 196 : 182;
    const x = Math.round(ui.w - W - 26 + (1 - k) * 40), y = Math.round(ui.h / 2 - H / 2 - 10);
    // ui.img/icon reset the alpha after each draw, so every piece carries it
    ui.img(noteCanvas(W, H, 21 + CHARACTER_ORDER.indexOf(id)), x, y, { alpha: k });
    const ink = '#3a2214';
    const txt = (str, tx, ty, o) => { ui.ctx.globalAlpha = k; ui.text(str, tx, ty, o); ui.ctx.globalAlpha = 1; };
    ui.big(C.name, x + 18, y + 14, { scale: 2, top: C.color || '#e8a060', bottom: '#5a2a14', outline: '#2a160c', align: 'left', valign: 'top', alpha: k });
    txt(C.title || '', x + 18, y + 40, { color: '#6a4a30' });
    ui.icon('heart', x + W - 52, y + 16, { alpha: k }); txt(`${C.hp}`, x + W - 38, y + 17, { color: '#8a2a20' });
    const perks = (C.perks || C.passives || []).slice(0, 3);
    perks.forEach((p, i) => {
      const yy = y + 62 + i * 24;
      ui.icon(p.icon || 'star', x + 18, yy + 2, { alpha: k });
      const line = p.short || p.name || '';
      txt(line, x + 36, yy + 3, { color: ink, maxW: W - 52 });
    });
    if (k < 1) return;
    const bw = touch ? 120 : 108, bh = touch ? 30 : 24;
    if (ui.button('choose', x + 18, y + H - bh - 14, bw, bh, 'Choose', { style: 'gold', icon: 'pickaxe', key: touch ? undefined : 'SPACE' }) || this.game.input.actionPressed('confirm')) this.choose();
    if (ui.button('back', x + W - 70, y + H - bh - 14, 52, bh, 'Back', { style: 'wood' })) this.release();
    // arrows: the next forger
    const idx = CHARACTER_ORDER.indexOf(id);
    if (this.game.input.actionPressed('right')) this.pick(CHARACTER_ORDER[(idx + 1) % 4]);
    else if (this.game.input.actionPressed('left')) this.pick(CHARACTER_ORDER[(idx + 3) % 4]);
    // a click on the camp away from the card and the forger goes back to the wide shot
    else if (this.game.input.pressed && !this.game.input.consumed && ui.mx < x - 10 && this.zoom && this.zoom.t >= this.zoom.dur) {
      const c = this.chars[id], top = this.project(this.headOf(c)), feet = this.project(c.group.position);
      const onHer = Math.abs(ui.mx - top.x) < 70 && ui.my > top.y - 30 && ui.my < feet.y + 20;
      if (!onHer) this.release();
    }
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
    ui.text(`{#7a3a00}Weapons ${known.length}/${Object.keys(RECIPES).length}{/}`, x + 14, y + 28, { color: ink });
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
