// Main menu: a hand-painted cave camp around a campfire and a stew pot. The four explorers (3D)
// chat, argue, hammer and read. Click one to hear what they can do and to descend with them.
// Everything else is an object in the camp: Elio's books (codex), a scroll (prologue), the
// lantern (settings) and a slate of chalked tallies (your runs).
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig } from '../gfx/camera.js';
import { ParticleSystem } from '../gfx/particles.js';
import { pixelTexture } from '../gfx/materials.js';
import { buildCharacter } from '../models/characters.js';
import { REGIONS } from '../data/regions.js';
import { campCanvas, flameCanvas, potCanvas, FIRE, SEATS, ANVIL, TUNNEL, OBJECTS } from '../art/camp_art.js';
import { glowCanvas, lanternCanvas, noteCanvas, tagCanvas } from '../art/handpaint.js';
import { anvilCanvas, slateCanvas } from './mining_art.js';
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

const ROUTINE = { bran: 'hammer', elio: 'read', durgan: 'sitTalk', clover: 'sitTalk' };
const ARGUMENTS = [
  [['durgan', 'That was MY last biscuit.'], ['clover', 'Finders keepers~'], ['durgan', 'It was IN MY BEARD.'], ['clover', 'Still found it!']],
  [['clover', 'Durgan, your snoring caused a cave-in.'], ['durgan', 'Gnomes do NOT snore.'], ['bran', 'You really do, mate.']],
  [['elio', 'Kindle, not on the pages!'], ['clover', 'Hehe, toasted spellbook.'], ['elio', 'It\'s a FIRE elemental, what did I expect…']],
  [['bran', 'Who wants a new frying pan? Steel, masterwork.'], ['durgan', 'Can it be an axe?'], ['bran', '…It can be an axe.']],
  [['clover', 'Bet I find more gold than all of you.'], ['durgan', 'Bet you trip on a rail first.'], ['clover', 'Bet you can\'t reach the top bunk.'], ['durgan', '…'], ['elio', 'Ooh, burn!']],
  [['elio', 'Do you think the Lord gets lonely down there?'], ['bran', 'Don\'t feel sorry for him. He broke my favorite hammer.'], ['durgan', 'He broke EVERYONE\'S everything.']],
  [['durgan', 'The stone on my arm spread again.'], ['bran', 'Then we go deeper. Tonight.'], ['clover', 'We? Wait for me!']],
];
const STORY = [
  'Deep beneath the Old Hollow Mine, four friends found a door that should never have been opened.',
  'Inside slept the Cursed Lord. When he woke, he laid his curse upon them all…',
  '"Every blade you forge shall shatter. Every friend you love shall turn to stone."',
  'Now one of them must descend — forging, fighting and breaking weapon after weapon — to end the curse forever.',
];

const PX = 0.01, TILT = 0.3;
const toWorld = (x, y) => ({ x: (x - 480) * PX, y: (270 - y) * PX });

export class TitleScene extends Scene {
  enter(params = {}) {
    const pal = REGIONS[0].pal;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050406');
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(9.6, 5.4), new THREE.MeshBasicMaterial({ map: pixelTexture(campCanvas(pal)) })));
    const cam = new THREE.OrthographicCamera(-4.8, 4.8, 2.7, -2.7, 0.1, 50);
    cam.userData.viewHeight = 5.4;
    cam.position.set(0, 0, 10);
    this.cam = cam;
    this.world = { scene, camera: cam, post: { tone: 0, saturation: 1, contrast: 1, lift: [0, 0, 0], gain: [1, 1, 1], vignette: 0.4, dither: 0, bloom: 0.6, threshold: 0.75, outline: 0.75, edge: 0.4 } };
    // firelight from the middle of the circle, a cool cave fill, a warm kicker from the lantern
    scene.add(new THREE.HemisphereLight(0x5a7a8a, 0x2a1810, 0.55));
    const fw = toWorld(FIRE.x, FIRE.y - 30);
    this.fire = new THREE.PointLight(0xff9a40, 7, 9, 1.1);
    this.fire.position.set(fw.x, fw.y, 1.2);
    scene.add(this.fire);
    const back = new THREE.DirectionalLight(0x6a8aa0, 0.35);
    back.position.set(0, 2, -4);
    scene.add(back);
    this.sparks = new ParticleSystem(300, { additive: true });
    this.dust = new ParticleSystem(200);
    scene.add(this.sparks.object, this.dust.object);
    this.chars = {};
    for (const id of CHARACTER_ORDER) {
      const st = SEATS[id];
      const c = buildCharacter(id);
      const box = new THREE.Box3().setFromObject(c.group);
      const h = Math.max(0.3, box.max.y - box.min.y);
      const px = (st.back ? 128 : 158) * (id === 'durgan' ? 0.8 : id === 'clover' ? 0.86 : 1);
      const s = (px * PX) / h;
      // a tilted holder makes the explorers read as seen from a little above, like the painting
      const holder = new THREE.Group();
      holder.rotation.x = TILT;
      holder.scale.setScalar(s);
      holder.add(c.group);
      const w = toWorld(st.x, st.y);
      holder.position.set(w.x, w.y, st.back ? 0.6 : 2);
      c.group.position.y = -box.min.y;
      const look = id === 'bran' ? { x: ANVIL.x + 34, y: ANVIL.y + 30 } : FIRE; // Bran works at his anvil
      c.home = Math.atan2(look.x - st.x, (st.y - look.y) * 2.2);
      c.group.rotation.y = c.home;
      c.seatHeight = 0.34;
      c.setSeated && c.setSeated(true, c.seatHeight);
      c.id = id;
      c.holder = holder;
      c.scale = s;
      c.homePos = holder.position.clone();
      scene.add(holder);
      c.play(ROUTINE[id] === 'hammer' || ROUTINE[id] === 'read' ? ROUTINE[id] : 'sit', { loop: true });
      this.chars[id] = c;
    }
    this.focus = null;
    this.bubbles = [];
    this.convo = null; this.convoT = 3;
    this.state = save.data.seen.intro || params.skipintro ? 'menu' : 'story';
    const pending = STORIES.find((st) => save.data.stats.bestRegion >= st.need && !save.data.unlocks.story.includes(st.id));
    if (pending && this.state === 'menu') { this.tale = { story: pending, i: -1, t: 1.2 }; this.state = 'tale'; }
    this.storyIdx = 0; this.storyT = 0;
    this.panel = null;
    this.zoom = 1; this.pan = { x: 0, y: 0 };
    this.crackle = this.game.audio.loop('campfire');
    this.game.audio.music('campfire');
    this.hammerT = 0;
    this.fade = 0;
  }
  exit() { this.crackle && this.crackle.stop(1); }

  /** World → stage pixels through the (zoomed) ortho camera. */
  project(v) {
    const p = v.clone().project(this.cam);
    return { x: (p.x * 0.5 + 0.5) * 960, y: (-p.y * 0.5 + 0.5) * 540, behind: false };
  }
  headOf(c) { return c.headPos ? c.headPos() : c.group.localToWorld(new THREE.Vector3(0, 1.6, 0)); }

  say(id, text, dur = 2.6) {
    this.bubbles = this.bubbles.filter((b) => b.id !== id);
    this.bubbles.push({ id, text, t: dur, dur });
    const c = this.chars[id];
    if (c && c.anim !== 'hammer' && c.anim !== 'read' && !this.focus) c.play('sitTalk', { loop: true });
  }

  update(dt) {
    for (const id in this.chars) this.chars[id].update(dt);
    this.sparks.update(dt); this.dust.update(dt);
    this.fire.intensity = 7 + Math.sin(this.time * 9.1) * 0.6 + Math.sin(this.time * 15.3) * 0.4 + Math.sin(this.time * 3.1) * 0.3;
    // camera: a slow breath, or a push-in on the chosen explorer
    let tz = 1 + Math.sin(this.time * 0.25) * 0.012, tx = 0, ty = 0;
    if (this.focus && this.state !== 'leaving') { const st = SEATS[this.focus]; tz = 1.75; tx = (st.x - 480 + 120) * PX; ty = (270 - st.y + 70) * PX; }
    if (this.state === 'leaving') { tz = this.leaveZoom; tx = (TUNNEL.x + TUNNEL.w / 2 - 480) * PX; ty = (270 - TUNNEL.y + 40) * PX; }
    const k = Math.min(1, dt * (this.state === 'leaving' ? 1.2 : 3));
    this.zoom += (tz - this.zoom) * k; this.pan.x += (tx - this.pan.x) * k; this.pan.y += (ty - this.pan.y) * k;
    this.cam.zoom = this.zoom; this.cam.position.set(this.pan.x, this.pan.y, 10); this.cam.updateProjectionMatrix();
    // embers rising from the fire
    const fw = toWorld(FIRE.x, FIRE.y - 6);
    if (Math.random() < 0.5) this.sparks.emit({ pos: [fw.x + (Math.random() - 0.5) * 0.5, fw.y, 1.1], vel: [0, 0.9, 0], spread: 0.25, life: [0.8, 1.8], size: 1, color: ['#ffd27a', '#ff8a3a'], glow: 3, gravity: -0.3 });
    if (Math.random() < 0.3) this.dust.emit({ pos: [(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 5, 0.5], vel: [0.03, 0.02, 0], spread: 0.02, life: [3, 6], size: 1, color: '#e8d0a8', alpha: 0.45, fadeIn: 1 });
    // ambient life: conversations
    for (const b of this.bubbles) b.t -= dt;
    this.bubbles = this.bubbles.filter((b) => b.t > 0);
    if (!this.focus && this.state === 'menu') {
      this.convoT -= dt;
      if (this.convoT <= 0) {
        if (!this.convo) this.convo = { lines: rnd.pick(ARGUMENTS), i: 0 };
        const [id, text] = this.convo.lines[this.convo.i];
        this.say(id, text);
        const c = this.chars[id];
        if (/!|\?/.test(text) && c.anim === 'sitTalk') c.play(rnd.pick(['argue', 'laugh', 'point', 'shrug']), { onDone: () => c.play('sitTalk', { loop: true }) });
        this.convo.i++;
        this.convoT = 2.4;
        if (this.convo.i >= this.convo.lines.length) { this.convo = null; this.convoT = 6 + rnd.float(0, 4); }
      }
    }
    if (this.state === 'tale') {
      const tl = this.tale;
      tl.t -= dt;
      if (tl.t <= 0 || (this.game.input.pressed && tl.i >= 0)) {
        tl.i++;
        if (tl.i >= tl.story.lines.length) { save.learn('unlocks.story', tl.story.id); this.state = 'menu'; this.tale = null; }
        else { const [id, text] = tl.story.lines[tl.i]; this.say(id, text, 4); tl.t = 3.2; }
      }
    }
    // Bran's hammer sparks + clang
    const bran = this.chars.bran;
    if (bran && bran.anim === 'hammer') {
      this.hammerT += dt;
      if (this.hammerT > 1.1) {
        this.hammerT = 0;
        const aw = toWorld(ANVIL.x + 30, ANVIL.y + 8);
        this.sparks.emit({ pos: [aw.x, aw.y, 2.2], radial: [0.6, 1.6], radialUp: 1.2, count: 12, life: [0.2, 0.5], size: 1, color: ['#fff0b0', '#ffb040'], glow: 4, gravity: 6 });
        if (!this.focus) this.game.audio.play('anvil_ring', { vol: 0.22 });
      }
    }
  }

  pick(id) {
    if (this.focus === id) return;
    if (this.focus) this.release();
    this.focus = id;
    const c = this.chars[id];
    c.setSeated && c.setSeated(false);
    c.group.rotation.y = c.home * 0.3;
    c.play('wave', { onDone: () => c.play('idle', { loop: true }) });
    c.setExpression && c.setExpression('happy');
    this.game.audio.play('ui_pop');
    this.say(id, CHARACTERS[id].barks.start[0], 3);
    for (const o of CHARACTER_ORDER) if (o !== id) { const oc = this.chars[o]; oc.lookAt && oc.lookAt(this.headOf(c)); }
  }
  release() {
    const c = this.chars[this.focus];
    if (c) { c.setSeated && c.setSeated(true, c.seatHeight); c.group.rotation.y = c.home; c.play(ROUTINE[c.id] === 'hammer' || ROUTINE[c.id] === 'read' ? ROUTINE[c.id] : 'sit', { loop: true }); c.setExpression && c.setExpression('neutral'); }
    for (const o of CHARACTER_ORDER) this.chars[o].lookAt && this.chars[o].lookAt(null);
    this.focus = null;
  }

  descend() {
    const id = this.focus;
    this.state = 'leaving';
    this.leaveZoom = 1.3;
    const c = this.chars[id];
    this.game.audio.play('transition');
    for (const o of CHARACTER_ORDER) if (o !== id) { const oc = this.chars[o]; oc.play('wave', { loop: true }); oc.setExpression && oc.setExpression('happy'); }
    this.say(CHARACTER_ORDER.find((o) => o !== id), rnd.pick(['Come back in one piece!', 'Save us some ore!', 'Go get him!']), 3);
    this.co.start(function* () {
      c.play('walk', { loop: true });
      const start = c.holder.position.clone();
      const dw = toWorld(TUNNEL.x + TUNNEL.w / 2, TUNNEL.y);
      const dest = new THREE.Vector3(dw.x, dw.y, 0.4);
      c.group.rotation.y = Math.atan2(dest.x - start.x, -1.2);
      const s0 = c.holder.scale.x;
      let t = 0;
      const dur = 2.6;
      while (t < dur) {
        t += this.game.ui.dt || 0.016;
        const k = ease.inOutSine(Math.min(1, t / dur));
        c.holder.position.lerpVectors(start, dest, k);
        c.holder.scale.setScalar(s0 * (1 - k * 0.45));
        if (t > 1.2) this.leaveZoom = 1.3 + (t - 1.2) * 1.4;
        yield null;
      }
      this.leaveZoom = 4;
      let f = 0;
      while (f < 0.8) { f += this.game.ui.dt || 0.016; this.fade = f / 0.8; yield null; }
      startRun(this.game, id);
    }.bind(this));
  }

  // ------------------------------------------------------------------------ UI
  tag(ui, x, y, text, color = '#3a2214') {
    const w = ui.measure(text) + 16;
    const c = tagCanvas(w);
    const bx = Math.round(clamp(x - c.width / 2, 4, ui.w - c.width - 4));
    ui.img(c, bx, Math.round(y));
    ui.text(text, bx + 10, Math.round(y) + 11, { color });
  }

  draw(ui) {
    const ctx = ui.ctx;
    // the fire itself, hand-drawn and alive
    const fp = this.project(new THREE.Vector3(toWorld(FIRE.x, FIRE.y).x, toWorld(FIRE.x, FIRE.y).y, 0));
    const z = this.zoom;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + Math.sin(this.time * 9) * 0.06;
    const g = glowCanvas(150, '#ff8a30');
    ctx.drawImage(g, fp.x - 150 * z, fp.y - 170 * z, 300 * z, 300 * z);
    ctx.restore();
    const fl = flameCanvas(Math.floor(this.time * 10) % 8);
    ctx.drawImage(fl, Math.round(fp.x - 38 * z), Math.round(fp.y - 62 * z), Math.round(76 * z), Math.round(70 * z));
    ctx.drawImage(potCanvas(), Math.round(fp.x - 40 * z), Math.round(fp.y - 96 * z), Math.round(80 * z), Math.round(100 * z));
    // steam from the stew pot
    if (Math.random() < 0.25) ui.burst(fp.x + rnd.float(-14, 14) * z, fp.y - 56 * z, 1, { colors: ['#d8d0c8', '#a8a098'], speed: 6, gravity: -18, life: 2.2, size: 2, drag: 0.4 });
    // Bran's anvil and the lantern on its peg
    const an = this.project(new THREE.Vector3(toWorld(ANVIL.x, ANVIL.y).x, toWorld(ANVIL.x, ANVIL.y).y, 0));
    ctx.drawImage(anvilCanvas(false), Math.round(an.x), Math.round(an.y), Math.round(72 * z), Math.round(58 * z));
    const lp = this.project(new THREE.Vector3(toWorld(OBJECTS.settings.x, OBJECTS.settings.y).x, toWorld(OBJECTS.settings.x, OBJECTS.settings.y).y, 0));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45; ctx.drawImage(glowCanvas(40), lp.x - 28 * z, lp.y - 20 * z, 80 * z, 80 * z); ctx.restore();
    ctx.drawImage(lanternCanvas(Math.floor(this.time * 9) % 4), Math.round(lp.x), Math.round(lp.y), Math.round(20 * z), Math.round(30 * z));
    if (this.state === 'story') return this.drawStory(ui);
    // speech bubbles
    for (const b of this.bubbles) {
      const p = this.project(this.headOf(this.chars[b.id]));
      speech(ui, p.x, p.y - 4, b.text, { maxW: 140, alpha: clamp(b.t * 3, 0, 1) * clamp((b.dur - b.t) * 6, 0, 1) });
    }
    if (this.fade > 0) ui.rect(0, 0, ui.w, ui.h, '#050406', this.fade);
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
      const feet = this.project(c.holder.position);
      const hgt = Math.max(30, feet.y - top.y + 16), wdt = Math.max(30, hgt * 0.55);
      const hit = ui.hit('char-' + id, top.x - wdt / 2, top.y - 10, wdt, hgt + 4, { cursor: 'hand', sound: false });
      if (hit.hover && this.focus !== id && !this.panel) this.tag(ui, top.x, top.y - 40, `${CHARACTERS[id].name}, ${CHARACTERS[id].title}`, CHARACTERS[id].color);
      if (hit.clicked && !this.panel) this.pick(id);
    }
    if (this.focus) return this.drawCharPanel(ui);
    const lg = logo(1);
    const bob = Math.round(Math.sin(this.time * 1.2) * 2);
    ui.img(lg, Math.round(ui.w / 2 - lg.width / 2), 14 + bob);
    // camp objects instead of menu buttons
    const obj = (key, label, fn) => {
      const o = OBJECTS[key];
      const h = ui.hit('obj-' + key, o.x, o.y, o.w, o.h, { sound: false });
      if (h.hover && !this.panel) this.tag(ui, o.x + o.w / 2, o.y - 30, label);
      if (h.clicked && !this.panel) { this.game.audio.play('ui_pop'); fn(); }
    };
    obj('codex', 'Forge Codex', () => { this.panel = 'codex'; });
    obj('prologue', 'The story so far', () => { this.state = 'story'; this.storyIdx = 0; this.storyT = 0; });
    obj('settings', 'Settings', () => { this.panel = 'settings'; });
    const st = save.data.stats;
    const so = OBJECTS.slate;
    ui.img(slateCanvas(Math.min(15, st.runs || 0), Math.min(15, st.runs || 0)), so.x - 20, so.y - 12, { scale: 0.75 });
    obj('slate', `Runs ${st.runs} · Wins ${st.wins} · Deepest: ${REGIONS[st.bestRegion || 0].name}`, () => {});
    // the prologue scroll by the fire
    const sc = OBJECTS.prologue;
    ui.img(noteCanvas(40, 14, 5), sc.x, sc.y + 2, { rot: 0.12 });
    if (!this.panel && this.time > 2 && this.time < 30) this.tag(ui, ui.w / 2, ui.h - 40 + Math.round(Math.sin(this.time * 2) * 2), 'Click an explorer by the fire to choose who descends');
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
    this.world.post = { ...this.world.post, saturation: this.storyIdx === 2 ? 0.6 : 1 };
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
