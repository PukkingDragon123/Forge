// Main menu: a cozy cave camp. The squad chats, argues, hammers and reads around the fire.
// Click an explorer to see their abilities; descend to start a run.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { buildSet } from '../models/environments.js';
import { buildCharacter } from '../models/characters.js';
import { buildProp } from '../models/props.js';
import { makeWorld, speech, ribbonTitle, dim } from './common.js';
import { startRun } from './flow.js';
import { CHARACTERS, CHARACTER_ORDER } from '../data/characters.js';
import { BLUEPRINTS, RECIPES } from '../data/blueprints.js';
import { MATERIALS } from '../data/materials.js';
import { SYNERGIES } from '../systems/forge.js';
import { logo, materialSprite, portrait } from '../art/sprites.js';
import { COLORS } from '../ui/font.js';
import { save } from '../core/save.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

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

export class TitleScene extends Scene {
  enter() {
    const set = buildSet('campfire', 0);
    this.set = set;
    this.w = makeWorld(set, { fogDensity: 0.035 });
    this.world = this.w;
    this.w.post = { bloom: 0.85, vignette: 0.45 };
    const a = set.anchors;
    this.center = (a.center || new THREE.Vector3()).clone();
    this.chars = {};
    CHARACTER_ORDER.forEach((id, i) => {
      const c = buildCharacter(id);
      const st = a.seats && a.seats[i];
      const seat = st ? st.pos.clone().sub(new THREE.Vector3(0, st.height, 0)) : new THREE.Vector3(Math.cos(i * 1.57) * 1.3, 0, Math.sin(i * 1.57) * 1.3);
      c.group.position.copy(seat);
      if (st) c.group.rotation.y = st.rotY;
      else c.group.lookAt(this.center.x, 0, this.center.z);
      c.seatHeight = st ? st.height : 0.35;
      c.seat = seat.clone();
      c.home = c.group.rotation.y;
      c.id = id;
      this.w.scene.add(c.group);
      c.play(ROUTINE[id] === 'hammer' || ROUTINE[id] === 'read' ? ROUTINE[id] : 'sit', { loop: true });
      this.chars[id] = c;
    });
    if (a.anvil) { const anv = buildProp('anvil'); anv.position.copy(a.anvil); anv.scale.setScalar(0.6); this.w.scene.add(anv); }
    this.angle = 0.3;
    this.focus = null;
    this.bubbles = [];
    this.convo = null; this.convoT = 3;
    this.state = save.data.seen.intro ? 'menu' : 'story';
    this.storyIdx = 0; this.storyT = 0;
    this.panel = null;
    this.crackle = this.game.audio.loop('campfire');
    this.game.audio.music('campfire');
    this.hammerT = 0;
    this.camPos = new THREE.Vector3(); this.camLook = this.center.clone();
  }
  exit() { this.crackle && this.crackle.stop(1); }

  say(id, text, dur = 2.6) {
    this.bubbles = this.bubbles.filter((b) => b.id !== id);
    this.bubbles.push({ id, text, t: dur, dur });
    const c = this.chars[id];
    if (c && c.anim !== 'hammer' && c.anim !== 'read' && !this.focus) c.play('sitTalk', { loop: true });
  }

  update(dt) {
    const a = this.set.anchors;
    this.set.update && this.set.update(dt, this.time);
    for (const e of this.set.emitters || []) e(this.w, dt);
    for (const id in this.chars) this.chars[id].update(dt);
    this.w.sparks.update(dt); this.w.dust.update(dt);
    // camera: slow orbit, or focus on a chosen explorer
    if (this.state === 'leaving') { /* driven by coroutine */ }
    else if (this.focus) {
      const c = this.chars[this.focus];
      const p = c.group.position;
      const dir = new THREE.Vector3(p.x - this.center.x, 0, p.z - this.center.z).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const cam = p.clone().add(dir.multiplyScalar(-0.2)).add(side.multiplyScalar(0.9)).add(new THREE.Vector3(0, 1.05, 0));
      const toward = this.center.clone().sub(p).normalize().multiplyScalar(1.7);
      cam.add(toward);
      this.w.rig.aim(cam.toArray(), [p.x, p.y + 0.75, p.z], 30, 3.5);
    } else {
      this.angle += dt * 0.06;
      const r = 6.4;
      this.w.rig.aim([this.center.x + Math.sin(this.angle) * r, 2.6 + Math.sin(this.time * 0.2) * 0.2, this.center.z + Math.cos(this.angle) * r], [this.center.x, 0.7, this.center.z], 38, 1.5);
    }
    this.w.rig.update(dt);
    // ambient life: conversations
    for (const b of this.bubbles) b.t -= dt;
    this.bubbles = this.bubbles.filter((b) => b.t > 0);
    if (!this.focus && this.state === 'menu') {
      this.convoT -= dt;
      if (this.convoT <= 0) {
        if (!this.convo) { this.convo = { lines: rnd.pick(ARGUMENTS), i: 0 }; }
        const [id, text] = this.convo.lines[this.convo.i];
        this.say(id, text);
        const c = this.chars[id];
        if (/!|\?/.test(text) && c.anim === 'sitTalk') c.play(rnd.pick(['argue', 'laugh', 'point', 'shrug']), { onDone: () => c.play('sitTalk', { loop: true }) });
        this.convo.i++;
        this.convoT = 2.4;
        if (this.convo.i >= this.convo.lines.length) { this.convo = null; this.convoT = 6 + rnd.float(0, 4); }
      }
    }
    // Bran's hammer sparks + clang
    const bran = this.chars.bran;
    if (bran && bran.anim === 'hammer') {
      this.hammerT += dt;
      if (this.hammerT > 1.1) {
        this.hammerT = 0;
        const ap = a.anvil || bran.group.position.clone().add(new THREE.Vector3(0.4, 0.4, 0.3));
        this.w.sparks.emit({ pos: [ap.x, ap.y + 0.45, ap.z], radial: [0.8, 2], radialUp: 1.2, count: 14, life: [0.2, 0.6], size: 1, color: ['#fff0b0', '#ffb040'], glow: 4, gravity: 6 });
        if (!this.focus) this.game.audio.play('anvil_ring', { vol: 0.25 });
      }
    }
    // dust motes & fireflies
    if (Math.random() < 0.4) this.w.dust.emit({ pos: [this.center.x, 1.5, this.center.z], posSpread: [4, 1.3, 3], vel: [0.04, 0.02, 0], spread: 0.03, life: [3, 6], size: 1, color: '#e0c8a0', alpha: 0.5, fadeIn: 1 });
  }

  pick(id) {
    if (this.focus === id) return;
    if (this.focus) this.release();
    this.focus = id;
    const c = this.chars[id];
    c.play('wave', { onDone: () => c.play('idle', { loop: true }) });
    c.setExpression('happy');
    this.game.audio.play('ui_pop');
    this.say(id, CHARACTERS[id].barks.start[0], 3);
    // the others cheer them on
    for (const o of CHARACTER_ORDER) if (o !== id) { const oc = this.chars[o]; oc.lookAt && oc.lookAt(c.group.position.clone().add(new THREE.Vector3(0, 1, 0))); }
  }
  release() {
    const c = this.chars[this.focus];
    if (c) { c.play(ROUTINE[c.id] === 'hammer' || ROUTINE[c.id] === 'read' ? ROUTINE[c.id] : 'sit', { loop: true }); c.setExpression('neutral'); }
    for (const o of CHARACTER_ORDER) this.chars[o].lookAt && this.chars[o].lookAt(null);
    this.focus = null;
  }

  descend() {
    const id = this.focus;
    this.state = 'leaving';
    const c = this.chars[id];
    const a = this.set.anchors;
    const ent = a.mineEntrance || new THREE.Vector3(0, 0.8, -6);
    this.game.audio.play('transition');
    for (const o of CHARACTER_ORDER) if (o !== id) { const oc = this.chars[o]; oc.play('wave', { loop: true }); oc.setExpression('happy'); }
    this.say(CHARACTER_ORDER.find((o) => o !== id), rnd.pick(['Come back in one piece!', 'Save us some ore!', 'Go get him!']), 3);
    this.co.start(function* () {
      c.play('walk', { loop: true });
      const start = c.group.position.clone();
      const dest = new THREE.Vector3(ent.x, 0, ent.z + 0.6);
      c.group.lookAt(dest.x, c.group.position.y, dest.z);
      const cam = this.w.rig;
      cam.moveTo([start.x + 1.8, 1.6, start.z + 2.6], [dest.x, 0.9, dest.z], 34, 1.6, 'inOutCubic');
      let t = 0;
      const dur = 2.8;
      while (t < dur) { t += this.game.ui.dt || 0.016; c.group.position.lerpVectors(start, dest, ease.inOutSine(Math.min(1, t / dur))); yield null; }
      cam.moveTo([ent.x, 1.2, ent.z + 1.2], [ent.x, 0.9, ent.z - 4], 50, 1.4, 'inCubic');
      yield 1.0;
      startRun(this.game, id);
    }.bind(this));
  }

  // ------------------------------------------------------------------------ UI
  draw(ui) {
    if (this.state === 'story') return this.drawStory(ui);
    // speech bubbles
    for (const b of this.bubbles) {
      const c = this.chars[b.id];
      const p = this.w.rig.project(c.headPos(), ui.w, ui.h);
      if (p.behind) continue;
      speech(ui, p.x, p.y, b.text, { maxW: 120, alpha: clamp(b.t * 3, 0, 1) * clamp((b.dur - b.t) * 6, 0, 1) });
    }
    if (this.state === 'leaving') return;
    // clickable explorers (screen-space hit boxes around each)
    for (const id of CHARACTER_ORDER) {
      const c = this.chars[id];
      const top = this.w.rig.project(c.headPos(), ui.w, ui.h);
      const feet = this.w.rig.project(c.group.position, ui.w, ui.h);
      const hgt = Math.max(16, feet.y - top.y + 10);
      const wdt = Math.max(14, hgt * 0.6);
      const hit = ui.hit('char-' + id, top.x - wdt / 2, top.y - 8, wdt, hgt + 6, { cursor: 'hand' });
      if (hit.hover && this.focus !== id) {
        ui.text(CHARACTERS[id].name, top.x, top.y - 20, { align: 'center', color: CHARACTERS[id].color, outline: '#140c10', thick: true });
        ui.text(CHARACTERS[id].title, top.x, top.y - 10, { align: 'center', font: 'small', color: COLORS.white, outline: '#140c10' });
      }
      if (hit.clicked) this.pick(id);
    }
    if (this.focus) return this.drawCharPanel(ui);
    // logo + menu
    const lg = logo(1);
    const bob = Math.round(Math.sin(this.time * 1.2) * 2);
    ui.img(lg, Math.round(ui.w / 2 - lg.width / 2), 14 + bob);
    ui.text('{dim}Click an explorer by the fire to choose who descends{/}', ui.w / 2, ui.h - 22, { align: 'center', outline: '#140c10' });
    const bx = 12, by = ui.h - 110;
    if (ui.button('m-codex', bx, by, 96, 20, 'Codex', { icon: 'recipe', style: 'wood' })) this.panel = 'codex';
    if (ui.button('m-settings', bx, by + 24, 96, 20, 'Settings', { icon: 'tool', style: 'wood' })) this.panel = 'settings';
    if (ui.button('m-story', bx, by + 48, 96, 20, 'Prologue', { icon: 'scroll', style: 'wood' })) { this.state = 'story'; this.storyIdx = 0; this.storyT = 0; }
    const st = save.data.stats;
    ui.text(`{dim}Runs ${st.runs} · Wins ${st.wins} · Deepest: ${['Hollowdeep', 'Prism Hollows', 'Sporewood', 'Sunken Halls', 'Emberdeep', 'The Tomb'][st.bestRegion]}{/}`, bx, by + 76, { font: 'small' });
    if (this.panel === 'codex') this.drawCodex(ui);
    if (this.panel === 'settings') this.drawSettings(ui);
  }

  drawCharPanel(ui) {
    const id = this.focus, C = CHARACTERS[id];
    const W = 236, H = 252, x = ui.w - W - 10, y = Math.max(8, ui.h / 2 - H / 2);
    ui.panel('leather', x, y, W, H, { tone: 'dark' });
    ui.img(portrait(id, 'happy', 32), x + 10, y + 10);
    ui.text(C.name, x + 48, y + 12, { color: C.color, outline: '#140c10', outlineShadow: false });
    ui.text(C.title, x + 48, y + 24, { color: COLORS.white });
    ui.icon('heart', x + 48, y + 35); ui.text(`${C.hp} HP`, x + 60, y + 36, { font: 'small', color: '#ffb0a0' });
    ui.icon('coin', x + 100, y + 35); ui.text(`${C.coins}`, x + 112, y + 36, { font: 'small', color: COLORS.gold });
    ui.text(C.blurb, x + 10, y + 50, { maxW: W - 20, color: '#d8c8b0' });
    let yy = y + 80;
    for (const p of C.passives) {
      ui.icon(p.icon, x + 10, yy + 1);
      ui.text(`{gold}${p.name}{/}`, x + 24, yy, {});
      const lines = ui.layout(p.text, 'body', W - 36);
      ui.text(p.text, x + 24, yy + 11, { maxW: W - 36 });
      yy += 13 + lines.length * 11 + 2;
    }
    ui.text('Starting kit', x + 10, yy + 2, { color: COLORS.dim });
    C.start.forEach((m, i) => {
      const sx = x + 10 + i * 20, sy = yy + 13;
      ui.img(materialSprite(m, 18), sx, sy);
      if (ui.hit('kit' + id + i, sx, sy, 18, 18).hover) ui.tooltip({ title: MATERIALS[m].name, body: MATERIALS[m].desc });
    });
    let bxx = x + W - 10 - C.blueprints.length * 14;
    for (const b of C.blueprints) { ui.icon(BLUEPRINTS[b].icon, bxx, yy + 16); if (ui.hit('bp' + id + b, bxx, yy + 14, 12, 12).hover) ui.tooltip({ title: BLUEPRINTS[b].name, body: BLUEPRINTS[b].desc }); bxx += 14; }
    ui.text(`{dim}${C.playstyle}{/}`, x + 10, y + H - 46, { maxW: W - 20, font: 'small' });
    if (ui.button('descend', x + 10, y + H - 28, 130, 22, `Descend with ${C.name}`, { style: 'gold', icon: 'pickaxe', key: 'SPACE' }) || this.game.input.actionPressed('confirm')) this.descend();
    if (ui.button('back', x + W - 82, y + H - 28, 72, 22, 'Back', { style: 'stone' }) || this.game.input.actionPressed('back')) this.release();
    // switch explorers with arrows
    const idx = CHARACTER_ORDER.indexOf(id);
    if (this.game.input.actionPressed('right')) this.pick(CHARACTER_ORDER[(idx + 1) % 4]);
    if (this.game.input.actionPressed('left')) this.pick(CHARACTER_ORDER[(idx + 3) % 4]);
  }

  drawStory(ui) {
    this.storyT += ui.dt;
    // letterbox
    ui.rect(0, 0, ui.w, 34, '#07060b'); ui.rect(0, ui.h - 50, ui.w, 50, '#07060b');
    const text = STORY[this.storyIdx];
    const n = Math.floor(this.storyT * 40);
    ui.text(text.slice(0, n), ui.w / 2, ui.h - 40, { align: 'center', maxW: Math.min(460, ui.w - 40), color: '#f4ecd8' });
    ui.text('{dim}click to continue{/}', ui.w - 10, ui.h - 12, { align: 'right', font: 'small' });
    if (this.game.input.pressed || this.game.input.actionPressed('confirm')) {
      if (n < text.length) this.storyT = 99;
      else {
        this.storyIdx++; this.storyT = 0;
        this.game.audio.play('page_turn');
        if (this.storyIdx >= STORY.length) { this.state = 'menu'; save.data.seen.intro = true; save.write(); }
      }
    }
    if (this.storyIdx === 2) this.w.post = { ...this.w.post, saturation: 0.7 };
    else this.w.post = { ...this.w.post, saturation: 1.12 };
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
    const W = 220, H = 170, x = ui.w / 2 - W / 2, y = ui.h / 2 - H / 2;
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
    if (ui.button('set-shake', x + 14, y + 88, W - 28, 18, `Screen shake: ${s.shake ? 'On' : 'Off'}`, { style: 'wood' })) { s.shake = s.shake ? 0 : 1; save.write(); }
    if (ui.button('set-px', x + 14, y + 110, W - 28, 18, `Pixel size: ${['Auto', 'Chunky', 'Fine'][s.pixelScale || 0]}`, { style: 'wood' })) {
      s.pixelScale = ((s.pixelScale || 0) + 1) % 3; save.write();
      this.game.renderer.setScaleBias(s.pixelScale === 1 ? 1 : s.pixelScale === 2 ? -1 : 0);
    }
    if (ui.button('set-close', x + W / 2 - 40, y + H - 26, 80, 18, 'Close', { style: 'gold' }) || this.game.input.actionPressed('back')) { this.panel = null; save.write(); }
    ui.unblock();
  }
}
