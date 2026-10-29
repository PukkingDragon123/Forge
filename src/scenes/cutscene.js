// Cutscenes: illustrated, parallax pixel-art panels with layered 2D particles, flickering light,
// light shafts, letterboxed typewriter captions, crossfades and timed sound cues.
// Use as an overlay (game.pushOverlay('cutscene', {id, onDone})) or as a scene (game.go).
// Tap / click / space advances (finishes the caption first), the Skip tag or Esc ends it.
// Also exports FX2D: a screen-space particle + light-sting layer other scenes use for cinematics.
import { Scene } from '../core/game.js';
import { PW, PH, M, cutsceneDef, paintJob } from '../art/cutscene_art.js';
import { glowCanvas, tagCanvas } from '../art/handpaint.js';
import { makeCanvas } from '../art/pixel.js';
import { clamp, ease, hexToRgb } from '../core/math.js';

const BAR = 36;
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOf = (arr) => arr[(Math.random() * arr.length) | 0];

// ------------------------------------------------------------------ particles (shared look)
const KIND = {
  dust: { col: ['#f0e0c8', '#d8c8e8', '#ffe8c8'], add: false },
  ember: { col: ['#ffd27a', '#ff9a3a', '#ff6a2a', '#fff0b0'], add: true },
  curse: { col: ['#c86bff', '#ff5af0', '#e0b0ff'], add: true },
  ash: { col: ['#a8a0b0', '#7a7288', '#c8c0d0'], add: false },
  sparkle: { col: ['#ffffff', '#fff0c0'], add: true },
  spore: { col: ['#5af0c8', '#b0ffe0'], add: true },
  drip: { col: ['#bfe8ff', '#ffffff'], add: true },
  rock: { col: ['#4a3a40', '#6a5a5a', '#2a2026'], add: false },
  shard: { col: ['#ffffff', '#e8eef8', '#ff9af0', '#c0d0ff'], add: true },
  spark: { col: ['#ffffff', '#fff0a8', '#ffd25e'], add: true },
  stone: { col: ['#8a8a96', '#a8a8b4', '#6a6a76'], add: false },
  petal: { col: ['#ffb8c8', '#ffd8b0', '#fff0e0'], add: false },
  confetti: { col: ['#ffd25e', '#fff0a8', '#ff8ab0', '#7fe3ff'], add: true },
};
function spawn(list, kind, x, y, o = {}) {
  const K = KIND[kind] || KIND.dust;
  const c = o.col && Math.random() < 0.6 ? o.col : pickOf(K.col);
  const p = { kind, x, y, vx: 0, vy: 0, g: 0, t: 0, life: 3, size: 1, col: c, add: K.add, rot: 0, vr: 0, ph: Math.random() * 6.28 };
  const s = o.scale || 1;
  switch (kind) {
    case 'dust': Object.assign(p, o.fast ? { vx: rnd(-3, 3), vy: rnd(-120, -60) * (o.up ? 1 : -1), life: rnd(1, 2) } : { vx: rnd(-4, 4), vy: rnd(-3, 2), life: rnd(4, 7) }); break;
    case 'ember': Object.assign(p, { vx: rnd(-6, 6), vy: rnd(-34, -14), life: rnd(1.4, 3) }); break;
    case 'curse': Object.assign(p, { vx: rnd(-5, 5), vy: rnd(-22, -8), life: rnd(1.8, 3.2), size: Math.random() < 0.3 ? 2 : 1 }); break;
    case 'ash': Object.assign(p, { vx: rnd(-6, 2), vy: rnd(5, 13), life: rnd(5, 8) }); break;
    case 'sparkle': Object.assign(p, { life: rnd(0.5, 1.2), size: 2 }); break;
    case 'spore': Object.assign(p, { vx: rnd(-3, 3), vy: rnd(-8, -2), life: rnd(4, 7), size: Math.random() < 0.3 ? 2 : 1 }); break;
    case 'drip': Object.assign(p, { vy: rnd(90, 140), life: 3 }); break;
    case 'rock': Object.assign(p, { vx: rnd(-8, 8), vy: rnd(10, 40), g: 260, life: 3, size: Math.random() < 0.5 ? 2 : 3, vr: rnd(-6, 6) }); break;
    case 'shard': { const a = rnd(0, 6.28), sp = rnd(50, 170) * s; Object.assign(p, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40 * s, g: 120 * s, life: rnd(0.9, 1.8), size: Math.random() < 0.4 ? 3 : 2, vr: rnd(-14, 14) }); break; }
    case 'spark': { const a = rnd(0, 6.28), sp = rnd(70, 230) * s; Object.assign(p, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 80 * s, life: rnd(0.3, 0.9) }); break; }
    case 'stone': { const a = rnd(-3.0, -0.1), sp = rnd(30, 110) * s; Object.assign(p, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 200 * s, life: rnd(1, 2), size: Math.random() < 0.5 ? 2 : 3, vr: rnd(-8, 8) }); break; }
    case 'petal': Object.assign(p, { vx: rnd(-10, -2), vy: rnd(8, 16), life: rnd(5, 8), size: 2, vr: rnd(-3, 3) }); break;
    case 'confetti': { const a = rnd(-2.6, -0.5), sp = rnd(80, 200) * s; Object.assign(p, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 140 * s, life: rnd(1.2, 2.2), size: 2, vr: rnd(-10, 10) }); break; }
    default: break;
  }
  if (o.up && kind !== 'dust') p.vy = -Math.abs(p.vy);
  if (o.life) p.life = o.life;
  list.push(p);
}
function stepParticles(list, dt, h) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.t += dt;
    if (p.t >= p.life || p.y > h + 20) { list.splice(i, 1); continue; }
    p.vy += p.g * dt;
    let sway = 0;
    if (p.kind === 'curse' || p.kind === 'spore' || p.kind === 'ash' || p.kind === 'petal') sway = Math.sin(p.t * 2 + p.ph) * 10;
    p.x += (p.vx + sway) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.kind === 'spark' || p.kind === 'shard') { p.vx *= 1 - dt * 1.2; }
  }
}
function drawParticles(ctx, list, scale = 1) {
  for (const add of [false, true]) {
    ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
    for (const p of list) {
      if (p.add !== add) continue;
      const k = p.t / p.life;
      let a = k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1;
      if (p.kind === 'sparkle' || p.kind === 'ember') a *= 0.65 + 0.35 * Math.sin(p.t * 18 + p.ph);
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = p.col;
      const x = Math.round(p.x), y = Math.round(p.y), s = p.size * scale;
      if (p.kind === 'sparkle') { ctx.fillRect(x - s, y, s * 2 + scale, scale); ctx.fillRect(x, y - s, scale, s * 2 + scale); }
      else if (p.kind === 'shard' || p.kind === 'rock' || p.kind === 'stone' || p.kind === 'confetti' || p.kind === 'petal') {
        const flat = Math.abs(Math.cos(p.rot));
        ctx.fillRect(x, y, Math.max(scale, Math.round(s * (0.4 + flat))), s);
        if (p.kind === 'shard' && Math.sin(p.rot * 2) > 0.6) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, scale, scale); }
      } else if (p.kind === 'spark') { ctx.fillRect(x, y, s, s); ctx.globalAlpha *= 0.5; ctx.fillRect(Math.round(x - p.vx * 0.02), Math.round(y - p.vy * 0.02), s, s); }
      else if (p.kind === 'drip') { ctx.fillRect(x, y, scale, 3 * scale); }
      else ctx.fillRect(x, y, s, s);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ the panel player
export class CutscenePlayer {
  /** def = {panels}; opts: {hold: keep the last panel up, noSkip, onCaption} */
  constructor(game, def, opts = {}) {
    this.game = game;
    this.panels = def.panels;
    this.opts = opts;
    this.cv = makeCanvas(PW, PH);
    this.cx = this.cv.getContext('2d');
    this.prev = makeCanvas(PW, PH);
    this.jobs = this.panels.map((p) => paintJob(p));
    this.i = -1; this.t = 0; this.fadeIn = 0; this.xfade = 0;
    this.parts = [];
    this.flash = null; this.shakeT = 0;
    this.done = false; this.finishing = 0;
    this.vig = this.vignette();
  }
  vignette() {
    const c = makeCanvas(PW, PH), g = c.getContext('2d');
    const id = g.createImageData(PW, PH);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const dx = (x - PW / 2) / (PW * 0.62), dy = (y - PH / 2) / (PH * 0.62), d = Math.hypot(dx, dy);
      const a = clamp((d - 0.7) * 1.3, 0, 0.5);
      const i = (y * PW + x) * 4;
      id.data[i] = 26; id.data[i + 1] = 12; id.data[i + 2] = 40; id.data[i + 3] = Math.round(a * 255) - ((x + y) % 2 ? 6 : 0);
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  get panel() { return this.panels[this.i]; }
  start(i) {
    if (i > 0) this.prev.getContext('2d').drawImage(this.cv, 0, 0);
    this.i = i; this.t = 0; this.xfade = i > 0 ? 1 : 0;
    this.cues = (this.panel.cues || []).map((c) => ({ ...c }));
    this.bursts = (this.panel.fx || []).filter((f) => f.burst).map((f) => ({ ...f, fired: false }));
    this.hidden = null;
    this.typed = 0;
    const au = this.game.audio;
    if (au && this.panel.music) au.music(this.panel.music);
  }
  next() {
    if (this.i + 1 >= this.panels.length) { if (this.opts.hold) { this.held = true; return; } this.finish(); return; }
    if (!this.jobs[this.i + 1].canvases) { this.wantNext = true; return; }
    this.start(this.i + 1);
  }
  finish() { if (!this.finishing) this.finishing = 0.001; }
  skip() { this.finish(); }
  update(dt) {
    // paint: the panel we need now first, then the next one in the background
    const need = this.i < 0 ? 0 : this.i;
    if (!this.jobs[need].canvases) this.jobs[need].step(this.i < 0 ? 30 : 12);
    else if (this.jobs[need + 1] && !this.jobs[need + 1].canvases) this.jobs[need + 1].step(7);
    if (this.i < 0) { if (this.jobs[0].canvases) this.start(0); return; }
    if (this.wantNext && this.jobs[this.i + 1] && this.jobs[this.i + 1].canvases) { this.wantNext = false; this.start(this.i + 1); }
    if (this.finishing) { this.finishing += dt; if (this.finishing > 0.7) this.done = true; }
    const P = this.panel;
    this.t += dt;
    this.fadeIn = Math.min(1, this.fadeIn + dt * 1.2);
    this.xfade = Math.max(0, this.xfade - dt * 1.4);
    this.typed += dt * 46;
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.flash) { this.flash.t += dt; if (this.flash.t > 0.6) this.flash = null; }
    const au = this.game.audio;
    for (const c of this.cues) if (!c.done && this.t >= c.t) {
      c.done = true;
      if (c.sfx && au) au.play(c.sfx);
      if (c.flash) this.flash = { col: c.flash, t: 0 };
      if (c.shake) this.shakeT = Math.max(this.shakeT, c.shake);
      if (this.game.haptic && c.shake) this.game.haptic(Math.round(20 + c.shake * 30));
    }
    // particles: rate emitters, timed bursts
    const cam = this.camAt(this.t);
    for (const f of P.fx || []) {
      if (f.burst || !f.rate) continue;
      let n = f.rate * dt; while (n > 0) { if (Math.random() < n) this.emit(f, cam); n -= 1; }
    }
    for (const b of this.bursts) if (!b.fired && this.t >= b.at) { b.fired = true; for (let k = 0; k < b.burst; k++) this.emit(b, cam); }
    if (P.hideLayerAt && this.t >= P.hideLayerAt.t) this.hidden = P.hideLayerAt.layer;
    stepParticles(this.parts, dt, PH);
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    const cap = P.caption || '';
    if (!this.held && this.t > (P.dur || 6) && this.typed >= cap.length + 30) this.next();
  }
  camAt(t) {
    const P = this.panel, k = ease.inOutSine(clamp(t / (P.dur || 6), 0, 1));
    const [a, b] = P.cam;
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k };
  }
  emit(f, cam) {
    const dy = this.panel.dy ?? -40;
    const vx = (x) => x - M - cam.x, vy = (y) => y + dy - M - cam.y;
    let x, y;
    if (f.x !== undefined) { x = vx(f.x) + rnd(-(f.spread || 4), f.spread || 4); y = vy(f.y) + rnd(-(f.spread || 4) * 0.3, (f.spread || 4) * 0.3); }
    else if (f.kind === 'drip' || f.kind === 'rock' || f.kind === 'ash' || f.kind === 'petal') { x = rnd(-10, PW + 10); y = rnd(-12, -2); }
    else if (f.fast) { x = rnd(0, PW); y = f.up ? PH + 4 : -4; }
    else { x = rnd(0, PW); y = rnd(0, PH); }
    spawn(this.parts, f.kind, x, y, f);
  }
  /** Advance on input. Returns true if the input was used. */
  input() {
    const inp = this.game.input;
    if (this.finishing || this.i < 0) return false;
    if (inp.actionPressed('back') && !this.opts.noSkip) { this.skip(); return true; }
    if (inp.pressed || inp.actionPressed('confirm') || inp.actionPressed('strike')) {
      const cap = this.panel.caption || '';
      if (this.typed < cap.length) this.typed = cap.length + 1;
      else if (!this.held) this.next();
      return true;
    }
    return false;
  }
  renderPanel(job, panel, t) {
    const g = this.cx, P = panel;
    const cam = this.camAt(t);
    const sh = this.shakeT > 0 ? this.shakeT * 6 : 0;
    const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    g.save();
    g.fillStyle = '#0a0610'; g.fillRect(0, 0, PW, PH);
    if (P.grade && P.grade.sat !== undefined) g.filter = `saturate(${P.grade.sat})`;
    job.canvases.forEach((c, li) => {
      if (this.hidden === li && panel === this.panel) return;
      const d = P.layers[li].depth;
      const ox = clamp(cam.x * d, -M, M) + sx * d, oy = clamp(cam.y * d, -M, M) + sy * d;
      g.drawImage(c, Math.round(-M - ox), Math.round(-M - oy));
    });
    g.filter = 'none';
    // light shafts and flickering lights
    g.globalCompositeOperation = 'lighter';
    for (const s of P.shafts || []) {
      const x = s.x - M - cam.x * 0.8 + Math.sin(this.t * 0.5 + s.x) * 6;
      const a = s.a * (0.8 + Math.sin(this.t * 1.3 + s.x * 0.1) * 0.2);
      const gr = g.createLinearGradient(0, s.fromBottom ? PH : 0, 0, s.fromBottom ? 0 : PH);
      gr.addColorStop(0, hexA(s.col, a)); gr.addColorStop(1, hexA(s.col, 0));
      g.fillStyle = gr;
      g.beginPath();
      if (s.fromBottom) { g.moveTo(x - s.w * 1.6, PH); g.lineTo(x + s.w * 1.6, PH); g.lineTo(x + s.w * 0.4, 0); g.lineTo(x - s.w * 0.4, 0); }
      else { g.moveTo(x - s.w / 2, 0); g.lineTo(x + s.w / 2, 0); g.lineTo(x + s.w * 1.7, PH); g.lineTo(x - s.w * 1.2, PH); }
      g.fill();
    }
    for (const l of P.lights || []) {
      const fl = 1 + (Math.sin(this.t * 9 + l.x) * 0.5 + Math.sin(this.t * 23 + l.y) * 0.3) * (l.flicker || 0);
      const gc = glowCanvas(Math.round(l.r), l.col);
      g.globalAlpha = clamp(0.55 * fl, 0, 1);
      g.drawImage(gc, Math.round(l.x - M - cam.x - l.r), Math.round(l.y + (P.dy ?? -40) - M - cam.y - l.r));
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }
  draw(ui) {
    const ctx = ui.ctx;
    ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, ui.w, ui.h);
    if (this.i < 0) {
      const a = 0.4 + Math.sin(performance.now() / 300) * 0.3;
      ui.text('{dim}…{/}', ui.w / 2, ui.h / 2, { align: 'center', color: `rgba(255,255,255,${a})` });
      return;
    }
    const P = this.panel;
    this.renderPanel(this.jobs[this.i], P, this.t);
    const g = this.cx;
    drawParticles(g, this.parts);
    g.drawImage(this.vig, 0, 0);
    if (this.flash) { const k = 1 - this.flash.t / 0.6; g.globalAlpha = k * 0.8; g.fillStyle = `rgb(${this.flash.col.map((v) => Math.round(v * 255)).join(',')})`; g.fillRect(0, 0, PW, PH); g.globalAlpha = 1; }
    if (this.xfade > 0) { g.globalAlpha = ease.inOutSine(this.xfade); g.drawImage(this.prev, 0, 0); g.globalAlpha = 1; }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.cv, 0, 0, PW, PH, 0, 0, ui.w, ui.h);
    // letterbox + caption
    ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, ui.w, BAR); ctx.fillRect(0, ui.h - BAR, ui.w, BAR);
    const cap = P.caption || '';
    const n = Math.floor(this.typed);
    ui.text(cap.slice(0, n), ui.w / 2, ui.h - BAR + 12, { align: 'center', color: '#f4e6cc', maxW: 720 });
    if (n >= cap.length && !this.held) ui.text('›', ui.w / 2 + 380, ui.h - 22 + Math.round(Math.sin(this.t * 5)), { color: '#c9a36a' });
    // a title for bosses and new layers
    if (P.title) {
      const k = clamp((this.t - 0.6) / 0.6, 0, 1) * clamp(((P.dur || 6) - this.t) / 0.8, 0, 1);
      if (k > 0) {
        ctx.globalAlpha = k;
        ui.big(P.title, ui.w / 2, 92, { scale: 3, top: '#fff6e0', bottom: '#e8a060' });
        if (P.sub) ui.text(P.sub, ui.w / 2, 120, { align: 'center', color: '#e8d8c0', outline: '#140c10' });
        ctx.globalAlpha = 1;
      }
    }
    // skip tag (top right)
    if (!this.opts.noSkip && !this.held) {
      const w = ui.measure('Skip ››') + 16, c = tagCanvas(w), x = ui.w - c.width - 10, y = 8;
      const h = ui.hit('cs-skip', x, y, c.width, c.height + 4, { sound: false });
      ctx.globalAlpha = h.hover ? 1 : 0.7;
      ui.img(c, x, y);
      ui.text('Skip ››', x + 10, y + 11, { color: '#3a2214' });
      ctx.globalAlpha = 1;
      if (h.clicked) this.skip();
    }
    // fades
    const fade = Math.max(1 - this.fadeIn, this.finishing ? clamp(this.finishing / 0.7, 0, 1) : 0);
    if (fade > 0) { ctx.globalAlpha = fade; ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, ui.w, ui.h); ctx.globalAlpha = 1; }
  }
}
function hexA(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`; }

// ------------------------------------------------------------------ the overlay / scene
export class CutsceneScene extends Scene {
  get freezesBelow() { return true; }
  enter(p = {}) {
    this.p = p;
    this.player = new CutscenePlayer(this.game, cutsceneDef(p.id || 'prologue', p), { noSkip: p.noSkip });
    this.closed = false;
  }
  update(dt, rdt = dt) {
    const pl = this.player;
    pl.update(Math.min(0.1, rdt));
    if (pl.done && !this.closed) {
      this.closed = true;
      const g = this.game, isOverlay = g.overlays.includes(this);
      if (isOverlay) g.popOverlay(this);
      const fn = this.p.onDone || this.p.next;
      if (fn) fn();
      else if (!isOverlay) g.go(g.run ? 'map' : 'title', {}, { transition: 'fade' });
    }
  }
  draw(ui) {
    this.player.input();
    this.player.draw(ui);
  }
}

// ------------------------------------------------------------------ FX2D: screen-space cinematic stings
/**
 * A 2D effects layer drawn over a 3D scene: shards, sparks, embers, confetti, expanding rings,
 * radial light bursts and colour washes. Coordinates are UI pixels (960×540).
 */
export class FX2D {
  constructor() { this.parts = []; this.rings = []; this.rays = []; this.washes = []; this.amb = []; }
  burst(kind, x, y, n, o = {}) { for (let i = 0; i < n; i++) spawn(this.parts, kind, x + rnd(-2, 2), y + rnd(-2, 2), { scale: 1.6, ...o }); }
  ring(x, y, col = '#ffffff', o = {}) { this.rings.push({ x, y, col, t: 0, life: o.life || 0.55, r0: o.r0 || 6, r1: o.r1 || 120, w: o.w || 3 }); }
  rays(x, y, col = '#fff0c0', o = {}) { this.rays.push({ x, y, col, t: 0, life: o.life || 1.2, n: o.n || 14, len: o.len || 420, a: o.a || 0.35, spin: o.spin ?? 0.25 }); }
  wash(col, a = 0.35, life = 0.5) { this.washes.push({ col, a, t: 0, life }); }
  /** Continuous ambient emitter: {kind, rate, area:[x,y,w,h], col, up} */
  ambient(list) { this.amb = list; }
  update(dt, w = 960, h = 540) {
    for (const e of this.amb) {
      let n = (e.rate || 0) * dt;
      while (n > 0) {
        if (Math.random() < n) {
          const [ax, ay, aw, ah] = e.area || [0, 0, w, h];
          const top = e.kind === 'drip' || e.kind === 'ash' || e.kind === 'rock' || e.kind === 'petal';
          spawn(this.parts, e.kind, ax + Math.random() * aw, top ? ay - 4 : ay + Math.random() * ah, { scale: 1.4, ...e });
        }
        n -= 1;
      }
    }
    stepParticles(this.parts, dt, h);
    if (this.parts.length > 1400) this.parts.splice(0, this.parts.length - 1400);
    for (const arr of [this.rings, this.rays, this.washes]) for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += dt; if (arr[i].t >= arr[i].life) arr.splice(i, 1); }
  }
  draw(ui) {
    const ctx = ui.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rays) {
      const k = r.t / r.life, a = r.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      ctx.fillStyle = hexA(r.col, a);
      for (let i = 0; i < r.n; i++) {
        const ang = (i / r.n) * Math.PI * 2 + r.t * r.spin + (i % 2) * 0.05, wa = 0.05 + (i % 3) * 0.02;
        const L = r.len * (0.6 + (i % 4) * 0.12) * ease.outCubic(Math.min(1, k * 3));
        ctx.beginPath(); ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + Math.cos(ang - wa) * L, r.y + Math.sin(ang - wa) * L);
        ctx.lineTo(r.x + Math.cos(ang + wa) * L, r.y + Math.sin(ang + wa) * L);
        ctx.fill();
      }
    }
    for (const r of this.rings) {
      const k = ease.outCubic(r.t / r.life), rad = r.r0 + (r.r1 - r.r0) * k;
      ctx.globalAlpha = 1 - r.t / r.life;
      ctx.strokeStyle = r.col; ctx.lineWidth = Math.max(1, r.w * (1 - k));
      ctx.beginPath(); ctx.arc(Math.round(r.x), Math.round(r.y), rad, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const wsh of this.washes) { ctx.globalAlpha = wsh.a * (1 - wsh.t / wsh.life); ctx.fillStyle = wsh.col; ctx.fillRect(0, 0, ui.w, ui.h); }
    ctx.globalAlpha = 1;
    ctx.restore();
    drawParticles(ctx, this.parts, 1);
  }
}
