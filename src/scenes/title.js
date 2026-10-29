// Main menu: a voxel cave camp around a campfire and a stew pot (stage_vox 'campfire'). The four
// explorers sit on logs around the fire; they are people of few words, so their personality shows
// in what they do (Bran hammers, Elio reads, Durgan dozes and pokes the fire, Clover fidgets) and
// only now and then in a short exchange. Click one to hear what they can do and to descend with them.
// Everything else is an object in the camp: Elio's books (codex), a scroll (prologue), the
// lantern (settings) and a slate of chalked tallies (your runs).
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig } from '../gfx/camera.js';
import { buildCharacter } from '../models/characters.js';
import { buildStage } from '../models/stage_vox.js';
import { REGIONS } from '../data/regions.js';
import { noteCanvas, tagCanvas } from '../art/handpaint.js';
import { speech, dim } from './common.js';
import { startRun } from './flow.js';
import { CHARACTERS, CHARACTER_ORDER } from '../data/characters.js';
import { BLUEPRINTS, RECIPES } from '../data/blueprints.js';
import { MATERIALS } from '../data/materials.js';
import { SYNERGIES } from '../systems/forge.js';
import { logo, materialSprite } from '../art/sprites.js';
import { COLORS } from '../ui/font.js';
import { save } from '../core/save.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';
import { STORIES } from '../data/stories.js';

const ROUTINE = { bran: 'hammer', elio: 'read', durgan: 'sit', clover: 'sit' };
const SEAT_OF = { elio: 0, clover: 1, durgan: 2, bran: 3 };
// little things they do instead of talking: [anim, seconds, fire-poke?]
const HABITS = {
  bran: [['shrug', 2.2], ['cheer', 1.6], ['idle', 2.5]],           // eyes a blade, stretches his back
  elio: [['point', 1.8, true], ['laugh', 1.6], ['idle', 2.4]],     // feeds Kindle a twig, giggles at a page
  durgan: [['sleep', 6], ['point', 1.6, true], ['shrug', 1.8]],    // dozes off, pokes the embers
  clover: [['cheer', 1.4], ['point', 1.6, true], ['laugh', 1.4], ['wave', 1.4]], // stretches, fidgets
};
const ARGUMENTS = [
  [['durgan', 'That was MY last biscuit.'], ['clover', 'Finders keepers~'], ['durgan', 'It was IN MY BEARD.']],
  [['clover', 'Durgan, your snoring caused a cave-in.'], ['durgan', 'Gnomes do NOT snore.'], ['bran', 'You really do, mate.']],
  [['elio', 'Kindle, not on the pages!'], ['clover', 'Hehe, toasted spellbook.']],
  [['bran', 'Who wants a new frying pan?'], ['durgan', 'Can it be an axe?'], ['bran', '…It can be an axe.']],
  [['clover', 'Bet I find more gold than all of you.'], ['durgan', 'Bet you trip on a rail first.']],
  [['elio', 'Do you think the Lord gets lonely down there?'], ['bran', 'He broke my favorite hammer.'], ['durgan', 'He broke EVERYONE\'S everything.']],
  [['durgan', 'The stone on my arm spread again.'], ['bran', 'Then we go deeper. Tonight.']],
];
const OPENERS = [
  [['clover', 'Stew\'s ready?'], ['bran', 'Almost.']],
  [['elio', 'Kindle\'s purring.'], ['durgan', 'Hmph. Fire doesn\'t purr.']],
  [['bran', 'Who\'s going down first?'], ['clover', 'Not it!']],
];
const STORY = [
  'Deep beneath the Old Hollow Mine, four friends found a door that should never have been opened.',
  'Inside slept the Cursed Lord. When he woke, he laid his curse upon them all…',
  '"Every blade you forge shall shatter. Every friend you love shall turn to stone."',
  'Now one of them must descend — forging, fighting and breaking weapon after weapon — to end the curse forever.',
];

export class TitleScene extends Scene {
  enter(params = {}) {
    const scene = new THREE.Scene();
    this.stage = buildStage('campfire', 0);
    this.stage.attach(scene);
    const C0 = this.stage.camera;
    this.rig = new CameraRig(C0.fov);
    this.rig.sway = 0.035;
    this.rig.cut(C0.pos, C0.look, C0.fov);
    this.stage.setCamera(this.rig.camera);
    this.home = { pos: C0.pos.slice(), look: C0.look.slice(), fov: C0.fov };
    this.world = { scene, camera: this.rig.camera, post: { bloom: 0.85, threshold: 0.78, vignette: 0.38, outline: 0.6, edge: 0.35, saturation: 1.12, contrast: 1.04 } };
    const A = this.stage.anchors;
    this.chars = {};
    for (const id of CHARACTER_ORDER) {
      const seat = A.seats[SEAT_OF[id] ?? 0];
      const c = buildCharacter(id);
      c.group.position.set(seat.pos.x, 0, seat.pos.z);
      // face the fire (Bran faces his anvil), but front-row explorers never turn fully away from us
      const look = id === 'bran' ? A.anvil : A.fire;
      let home = Math.atan2(look.x - seat.pos.x, look.z - seat.pos.z);
      if (seat.pos.z > 0) home = Math.sign(home) * Math.min(Math.abs(home), 1.65);
      c.home = home;
      c.group.rotation.y = home;
      c.seatHeight = seat.height;
      c.seatPos = seat.pos.clone().setY(0);
      c.setSeated && c.setSeated(true, c.seatHeight);
      c.id = id;
      scene.add(c.group);
      c.play(ROUTINE[id], { loop: true });
      this.chars[id] = c;
    }
    this.focus = null;
    this.bubbles = [];
    this.convo = null;
    this.convoT = 5 + rnd.float(0, 2); // one brief exchange a little after the menu appears…
    this.firstConvo = true;
    this.habitT = 3 + rnd.float(0, 3);
    this.acts = {}; // id -> seconds left in a habit
    this.state = save.data.seen.intro || params.skipintro ? 'menu' : 'story';
    this.introCut = this.state === 'story' && !!this.game.scenes.cutscene;
    const pending = STORIES.find((st) => save.data.stats.bestRegion >= st.need && !save.data.unlocks.story.includes(st.id));
    if (pending && this.state === 'menu') { this.tale = { story: pending, i: -1, t: 1.2 }; this.state = 'tale'; }
    this.storyIdx = 0; this.storyT = 0;
    this.panel = null;
    this.crackle = this.game.audio.loop('campfire');
    this.game.audio.music('campfire');
    this.hammerT = 0;
    this.fade = 0;
  }
  exit() { this.crackle && this.crackle.stop(1); }

  project(v) { return this.rig.project(v, 960, 540); }
  headOf(c) { return c.headPos ? c.headPos() : c.group.localToWorld(new THREE.Vector3(0, 1.2, 0)); }

  say(id, text, dur = 2.8) {
    if (!text) return; // bark() and friends return '' when the explorer stays quiet
    this.bubbles = this.bubbles.filter((b) => b.id !== id);
    this.bubbles.push({ id, text, t: dur, dur });
    const c = this.chars[id];
    if (c && !this.acts[id] && c.anim !== 'hammer' && c.anim !== 'read' && !this.focus) c.play('sitTalk', { loop: true });
    for (const o of CHARACTER_ORDER) if (o !== id && o !== this.focus) { const oc = this.chars[o]; oc.lookAt && oc.lookAt(this.headOf(c)); }
  }
  routine(c) { c.play(ROUTINE[c.id], { loop: true }); }

  /** Start the prologue: the cinematic overlay when it exists, else the painted letterbox story. */
  playPrologue(first = false) {
    if (this.game.scenes.cutscene) {
      this.state = 'cut';
      this.game.pushOverlay('cutscene', { id: 'prologue', onDone: () => { this.state = 'menu'; if (first) { save.data.seen.intro = true; save.write(); } } });
    } else { this.state = 'story'; this.storyIdx = 0; this.storyT = 0; }
  }

  update(dt) {
    if (this.introCut) { this.introCut = false; this.playPrologue(true); }
    this.stage.update(dt, this.time);
    for (const id in this.chars) this.chars[id].update(dt);
    const A = this.stage.anchors;
    // camera: a slow breath around the fire, a push-in on the chosen explorer, or follow the leaver
    if (this.state === 'leaving') { /* driven by the coroutine */ }
    else if (this.focus) {
      const c = this.chars[this.focus];
      const head = this.headOf(c);
      const out = new THREE.Vector3(c.seatPos.x, 0, c.seatPos.z + 2.4).sub(A.fire).setY(0).normalize();
      const pos = head.clone().addScaledVector(out, 2.6).add(new THREE.Vector3(0, 0.55, 0));
      const right = new THREE.Vector3(out.z, 0, -out.x);
      const look = head.clone().add(new THREE.Vector3(0, -0.25, 0)).addScaledVector(right, -0.62);
      this.rig.aim(pos.toArray(), look.toArray(), 34, 2.6);
    } else {
      const b = this.time * 0.18;
      this.rig.aim([this.home.pos[0] + Math.sin(b) * 0.25, this.home.pos[1] + Math.sin(b * 0.7) * 0.06, this.home.pos[2]], this.home.look, this.home.fov, 1.6);
    }
    this.rig.update(dt);
    // speech: rare, short exchanges (never while an explorer is in focus)
    for (const b of this.bubbles) b.t -= dt;
    this.bubbles = this.bubbles.filter((b) => b.t > 0);
    if (!this.focus && this.state === 'menu') {
      this.convoT -= dt;
      if (this.convoT <= 0) {
        if (!this.convo) this.convo = { lines: (this.firstConvo ? rnd.pick(OPENERS) : rnd.pick(ARGUMENTS)).slice(0, 3), i: 0 };
        const [id, text] = this.convo.lines[this.convo.i];
        this.say(id, text);
        const c = this.chars[id];
        if (/!|\?/.test(text) && c.anim === 'sitTalk') c.play(rnd.pick(['argue', 'laugh', 'point', 'shrug']), { onDone: () => c.play('sitTalk', { loop: true }) });
        this.convo.i++;
        this.convoT = 2.6;
        if (this.convo.i >= this.convo.lines.length) {
          this.convo = null; this.firstConvo = false;
          this.convoT = 40 + rnd.float(0, 20); // …then at most one short exchange every 40–60 s
          this.co.start(function* () { let w = 3; while (w > 0) { w -= this.game.ui.dt || 0.016; yield null; } this.settle(); }.bind(this));
        }
      }
      // body language in between
      this.habitT -= dt;
      if (this.habitT <= 0) {
        this.habitT = 5 + rnd.float(0, 6);
        const free = CHARACTER_ORDER.filter((id) => !this.acts[id] && !this.bubbles.some((b) => b.id === id));
        if (free.length) this.habit(rnd.pick(free));
      }
    }
    for (const id in this.acts) {
      this.acts[id] -= dt;
      if (this.acts[id] <= 0) { delete this.acts[id]; const c = this.chars[id]; if (c && this.focus !== id && this.state !== 'leaving') this.routine(c); }
    }
    if (this.state === 'tale') {
      const tl = this.tale;
      tl.t -= dt;
      if (tl.t <= 0 || (this.game.input.pressed && tl.i >= 0)) {
        tl.i++;
        if (tl.i >= tl.story.lines.length) { save.learn('unlocks.story', tl.story.id); this.state = 'menu'; this.tale = null; this.settle(); }
        else { const [id, text] = tl.story.lines[tl.i]; this.say(id, text, 4); tl.t = 3.2; }
      }
    }
    // Bran's hammer: sparks and a soft clang
    const bran = this.chars.bran;
    if (bran && bran.anim === 'hammer') {
      this.hammerT += dt;
      if (this.hammerT > 1.1) {
        this.hammerT = 0;
        const a = A.anvil;
        this.stage.P.add.emit({ pos: [a.x - 0.1, 0.5, a.z], radial: [0.6, 1.6], radialUp: 1.2, count: 12, life: [0.2, 0.5], size: 1, color: ['#fff0b0', '#ffb040'], glow: 4, gravity: 6 });
        if (!this.focus) this.game.audio.play('anvil_ring', { vol: 0.18 });
      }
    }
  }
  /** Everyone stops looking at the last speaker and goes back to what they were doing. */
  settle() {
    for (const o of CHARACTER_ORDER) { const c = this.chars[o]; if (o === this.focus) continue; c.lookAt && c.lookAt(null); if (!this.acts[o] && c.anim === 'sitTalk') this.routine(c); }
  }
  habit(id) {
    const c = this.chars[id];
    const [anim, dur, poke] = rnd.pick(HABITS[id] || [['idle', 2]]);
    c.play(anim, { loop: true });
    this.acts[id] = dur;
    if (poke) {
      c.lookAt && c.lookAt(new THREE.Vector3(0, 0.3, 0));
      this.co.start(function* () {
        let w = 0.6; while (w > 0) { w -= this.game.ui.dt || 0.016; yield null; }
        this.stage.P.add.emit({ pos: [0, 0.35, 0], radial: [0.4, 1.4], radialUp: 2, count: 18, life: [0.6, 1.4], size: 1, color: ['#ffd27a', '#ff8a3a', '#fff0b0'], glow: 3.5, gravity: -0.4 });
        this.game.audio.play('sizzle', { vol: 0.12 });
        if (this.stage.fireLight) this.stage.fireLight.intensity += 3;
        w = dur; while (w > 0) { w -= this.game.ui.dt || 0.016; yield null; }
        c.lookAt && c.lookAt(null);
      }.bind(this));
    }
  }

  pick(id) {
    if (this.focus === id) return;
    if (this.focus) this.release();
    this.focus = id;
    delete this.acts[id];
    this.bubbles = []; // the focused explorer's greeting is the only line on screen
    this.convo = null; this.convoT = Math.max(this.convoT, 20);
    const c = this.chars[id];
    c.setSeated && c.setSeated(false);
    c.group.rotation.y = Math.atan2(this.rig.camera.position.x - c.group.position.x, this.rig.camera.position.z - c.group.position.z) * 0.6 + c.home * 0.4;
    c.play('wave', { onDone: () => this.focus === id && c.play('idle', { loop: true }) });
    c.setExpression && c.setExpression('happy');
    this.game.audio.play('ui_pop');
    const greet = CHARACTERS[id].barks.start && CHARACTERS[id].barks.start[0];
    if (greet) { this.bubbles.push({ id, text: greet, t: 3, dur: 3 }); }
    for (const o of CHARACTER_ORDER) if (o !== id) { const oc = this.chars[o]; oc.lookAt && oc.lookAt(this.headOf(c)); }
  }
  release() {
    const c = this.chars[this.focus];
    if (c) { c.setSeated && c.setSeated(true, c.seatHeight); c.group.rotation.y = c.home; this.routine(c); c.setExpression && c.setExpression('neutral'); }
    for (const o of CHARACTER_ORDER) this.chars[o].lookAt && this.chars[o].lookAt(null);
    this.bubbles = [];
    this.focus = null;
  }

  descend() {
    const id = this.focus;
    this.state = 'leaving';
    this.bubbles = [];
    const c = this.chars[id];
    const A = this.stage.anchors;
    this.game.audio.play('transition');
    for (const o of CHARACTER_ORDER) if (o !== id) { const oc = this.chars[o]; oc.play('wave', { loop: true }); oc.setExpression && oc.setExpression('happy'); oc.lookAt && oc.lookAt(this.headOf(c)); }
    const friend = CHARACTER_ORDER.find((o) => o !== id);
    this.say(friend, rnd.pick(['Come back in one piece!', 'Save us some ore!', 'Go get him!']), 3);
    const cam = this.rig;
    this.co.start(function* () {
      c.setSeated && c.setSeated(false);
      c.play('walk', { loop: true });
      const path = [c.group.position.clone(), new THREE.Vector3(A.mineEntrance.x + 0.2, 0, A.mineEntrance.z + 1.2), new THREE.Vector3(A.mineEntrance.x, 0, A.mineEntrance.z), new THREE.Vector3(A.mineDeep.x, 0, A.mineDeep.z)];
      // the camera turns to watch them go into the dark
      cam.moveTo([A.mineEntrance.x + 1.6, 1.9, A.mineEntrance.z + 4.4], [A.mineEntrance.x, 0.9, A.mineEntrance.z - 0.4], 36, 3.2, 'inOutSine');
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], len = a.distanceTo(b), dur = len / 1.25;
        c.group.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        let t = 0;
        while (t < dur) {
          t += this.game.ui.dt || 0.016;
          c.group.position.lerpVectors(a, b, ease.inOutSine(Math.min(1, t / dur)));
          if (i === path.length - 1) this.fade = clamp(t / dur, 0, 1) * 0.6;
          yield null;
        }
      }
      let f = 0;
      while (f < 0.6) { f += this.game.ui.dt || 0.016; this.fade = 0.6 + (f / 0.6) * 0.4; yield null; }
      startRun(this.game, id);
    }.bind(this));
  }

  // ------------------------------------------------------------------------ UI
  tag(ui, x, y, text, color = '#3a2214') {
    const w = ui.measure(text) + 16;
    const c = tagCanvas(w);
    const bx = Math.round(clamp(x - c.width / 2, 4, ui.w - c.width - 4));
    ui.img(c, bx, Math.round(clamp(y, 4, ui.h - 24)));
    ui.text(text, bx + 10, Math.round(clamp(y, 4, ui.h - 24)) + 11, { color });
  }
  /** Screen rect around a world anchor (r: half-size in metres). */
  rectOf(v, r = 0.3, up = 0.3) {
    const c = this.project(v.clone().add(new THREE.Vector3(0, up, 0)));
    const e = this.project(v.clone().add(new THREE.Vector3(r, up, 0)));
    const s = Math.max(14, Math.abs(e.x - c.x));
    return { x: c.x - s, y: c.y - s, w: s * 2, h: s * 2, cx: c.x, cy: c.y - s };
  }

  draw(ui) {
    if (this.fade > 0) ui.rect(0, 0, ui.w, ui.h, '#050406', this.fade);
    if (this.state === 'cut') return;
    if (this.state === 'story') return this.drawStory(ui);
    // speech bubbles
    for (const b of this.bubbles) {
      const c = this.chars[b.id];
      if (!c) continue;
      const p = this.project(this.headOf(c));
      if (p.behind) continue;
      speech(ui, p.x, p.y - 4, b.text, { maxW: 140, alpha: clamp(b.t * 3, 0, 1) * clamp((b.dur - b.t) * 6, 0, 1) });
    }
    if (this.state === 'tale') {
      ui.rect(0, 0, ui.w, 34, '#050406'); ui.rect(0, ui.h - 34, ui.w, 34, '#050406');
      ui.text(`{gold}Campfire tale:{/} ${this.tale.story.title}`, ui.w / 2, 12, { align: 'center' });
      ui.text('{dim}click to continue{/}', ui.w - 10, ui.h - 20, { align: 'right', font: 'small' });
      return;
    }
    if (this.state === 'leaving') return;
    // the explorers are the menu
    for (const id of CHARACTER_ORDER) {
      const c = this.chars[id];
      const top = this.project(this.headOf(c));
      const feet = this.project(c.group.position);
      const hgt = Math.max(30, feet.y - top.y + 16), wdt = Math.max(30, hgt * 0.62);
      const hit = ui.hit('char-' + id, top.x - wdt / 2, top.y - 10, wdt, hgt + 4, { cursor: 'hand', sound: false });
      if (hit.hover && this.focus !== id && !this.panel) this.tag(ui, top.x, top.y - 40, `${CHARACTERS[id].name}, ${CHARACTERS[id].title}`, CHARACTERS[id].color);
      if (hit.clicked && !this.panel) this.pick(id);
    }
    if (this.focus) return this.drawCharPanel(ui);
    const lg = logo(1);
    const bob = Math.round(Math.sin(this.time * 1.2) * 2);
    ui.img(lg, Math.round(ui.w / 2 - lg.width / 2), 14 + bob);
    // camp objects instead of menu buttons
    const A = this.stage.anchors;
    const obj = (key, v, r, up, label, fn) => {
      const o = this.rectOf(v, r, up);
      const h = ui.hit('obj-' + key, o.x, o.y, o.w, o.h, { sound: false });
      if (h.hover && !this.panel) this.tag(ui, o.cx, o.y - 26, label);
      if (h.clicked && !this.panel) { this.game.audio.play('ui_pop'); fn(); }
    };
    obj('codex', A.books, 0.32, 0.12, 'Forge Codex', () => { this.panel = 'codex'; });
    obj('prologue', A.scroll, 0.28, 0.05, 'The story so far', () => this.playPrologue(false));
    obj('settings', A.lantern, 0.22, 0, 'Settings', () => { this.panel = 'settings'; });
    const st = save.data.stats;
    obj('slate', A.slate, 0.32, 0, `Runs ${st.runs} · Wins ${st.wins} · Deepest: ${REGIONS[st.bestRegion || 0].name}`, () => {});
    if (!this.panel && this.time > 2 && this.time < 30) this.tag(ui, ui.w / 2, ui.h - 40 + Math.round(Math.sin(this.time * 2) * 2), (ui.touch ? 'Tap an explorer by the fire to choose who descends' : 'Click an explorer by the fire to choose who descends'));
    if (this.panel === 'codex') this.drawCodex(ui);
    if (this.panel === 'settings') this.drawSettings(ui);
  }

  drawCharPanel(ui) {
    const id = this.focus, C = CHARACTERS[id];
    const W = 270, H = 300, x = ui.w - W - 16, y = 70;
    ui.img(noteCanvas(W, H, 21), x, y);
    const ink = '#3a2214';
    ui.text(C.name, x + 18, y + 18, { color: '#6a2a10' });
    ui.text(C.title, x + 18, y + 31, { color: ink });
    ui.icon('heart', x + W - 90, y + 18); ui.text(`${C.hp}`, x + W - 76, y + 19, { color: '#8a2a20' });
    ui.icon('coin', x + W - 50, y + 18); ui.text(`${C.coins}`, x + W - 36, y + 19, { color: '#7a5a10' });
    ui.text(C.blurb, x + 18, y + 48, { maxW: W - 36, color: '#4a3220' });
    let yy = y + 48 + ui.layout(C.blurb, 'body', W - 36).length * 11 + 8;
    for (const p of C.passives) {
      ui.icon(p.icon, x + 18, yy + 1);
      ui.text(`{#7a3a10}${p.name}{/}`, x + 32, yy, { color: ink });
      ui.text(p.text, x + 32, yy + 11, { maxW: W - 50, color: '#4a3220' });
      yy += 13 + ui.layout(p.text, 'body', W - 50).length * 11 + 4;
    }
    ui.text('Starting kit', x + 18, yy + 2, { color: '#7a5634' });
    C.start.forEach((m, i) => {
      const sx = x + 18 + i * 22, sy = yy + 14;
      ui.img(materialSprite(m, 32), sx - 4, sy - 4, { scale: 0.6 });
      if (ui.hit('kit' + id + i, sx, sy, 20, 20).hover) ui.tooltip({ title: MATERIALS[m].name, body: MATERIALS[m].desc });
    });
    if (ui.button('descend', x + 18, y + H - 40, 160, 24, `Descend with ${C.name}`, { style: 'gold', icon: 'pickaxe', key: 'SPACE' }) || this.game.input.actionPressed('confirm')) this.descend();
    if (ui.button('back', x + W - 82, y + H - 40, 64, 24, 'Back', { style: 'wood' }) || this.game.input.actionPressed('back')) this.release();
    const idx = CHARACTER_ORDER.indexOf(id);
    if (this.game.input.actionPressed('right')) this.pick(CHARACTER_ORDER[(idx + 1) % 4]);
    if (this.game.input.actionPressed('left')) this.pick(CHARACTER_ORDER[(idx + 3) % 4]);
  }

  drawStory(ui) {
    this.storyT += ui.dt;
    ui.rect(0, 0, ui.w, 44, '#050406'); ui.rect(0, ui.h - 64, ui.w, 64, '#050406');
    const text = STORY[this.storyIdx];
    const n = Math.floor(this.storyT * 40);
    ui.text(text.slice(0, n), ui.w / 2, ui.h - 50, { align: 'center', maxW: 560, color: '#f4ecd8' });
    ui.text('{dim}click to continue{/}', ui.w - 12, ui.h - 16, { align: 'right', font: 'small' });
    if (this.game.input.pressed || this.game.input.actionPressed('confirm')) {
      if (n < text.length) this.storyT = 99;
      else {
        this.storyIdx++; this.storyT = 0;
        this.game.audio.play('page_turn');
        if (this.storyIdx >= STORY.length) { this.state = 'menu'; save.data.seen.intro = true; save.write(); }
      }
    }
    this.world.post = { ...this.world.post, saturation: this.storyIdx === 2 ? 0.6 : 1.12 };
  }

  drawCodex(ui) {
    ui.block(3);
    dim(ui, 0.6);
    const W = Math.min(420, ui.w - 20), H = 250, x = ui.w / 2 - W / 2, y = ui.h / 2 - H / 2;
    ui.panel('parchment', x, y, W, H, { seed: 12 });
    const ink = '#3a2618';
    ui.text('The Forge Codex', x + W / 2, y + 10, { align: 'center', color: ink });
    const d = save.data.discovered;
    ui.text(`{#7a3a00}Secret weapons ${d.recipes.length}/${Object.keys(RECIPES).length}{/}`, x + 14, y + 28, { color: ink });
    Object.entries(RECIPES).forEach(([rid, r], i) => {
      const known = d.recipes.includes(rid);
      const cx = x + 14 + (i % 2) * (W / 2 - 8), cy = y + 42 + Math.floor(i / 2) * 22;
      ui.icon(BLUEPRINTS[r.bp].icon, cx, cy + 1, { alpha: known ? 1 : 0.35 });
      ui.text(known ? r.name : '? ? ?', cx + 12, cy, { color: known ? '#7a3a00' : '#9a8a7a' });
      if (known) r.ings.forEach((m, k) => ui.img(materialSprite(m, 10), cx + 12 + k * 11, cy + 10));
      else ui.text(r.hint, cx + 12, cy + 10, { font: 'small', color: '#9a8a7a', maxW: W / 2 - 30 });
    });
    const sy = y + 42 + Math.ceil(Object.keys(RECIPES).length / 2) * 22 + 4;
    ui.text(`{#7a3a00}Synergies found ${d.synergies.length}/${SYNERGIES.length}:{/} ${d.synergies.map((s) => SYNERGIES.find((q) => q.id === s)?.name).filter(Boolean).join(', ') || '{dim}none yet{/}'}`, x + 14, Math.min(sy, y + H - 40), { color: ink, maxW: W - 28, font: 'small' });
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
      const h = ui.hit('sl' + key, sx - 4, yy - 3, sw + 8, 14);
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
