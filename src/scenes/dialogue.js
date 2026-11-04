// Dialogue: the camera leans in on whoever is talking, letterbox bars slide in, and the words float
// above the speaker's head — typed out word by word with a little rise, a soft ink shadow behind
// them and a voice blip per syllable. When it's your turn, your replies float beside Durgan as
// wooden tags (1/2/3, arrows, click or tap). Lines are short (≤ 12 words): nobody gives speeches.
//
//   game.pushOverlay('dialogue', { lines, cam?, camera?, freeze?, bars?, onDone?(result) })
//   speak(game, lines, opts) → the overlay
//   lines: [{ who, at, text, mood?, replies?: [{ text, next?, fn? }], next?, label?, auto?, wait?,
//             card?: { title, sub, color }, beat?(ctx), with?, zoom?: { fov, dist }, noZoom? }]
//     who   speaker id ('durgan', 'morel', 'medusa', 'grand_puffcap', …) → name, colour, voice
//     at    what to float over: a Character (headPos), a Monster (group + height), a game entity
//           ({ model } or { x, z }), an Object3D, a Vector3, or a function returning one
//     with  the listener (the camera frames both), replyAt: where your replies float (defaults to
//           the last line spoken by 'durgan'/'player', else lower centre)
//     auto  seconds before the line moves on by itself; wait: fn → true once the line may close
//     next  index or label to jump to after this line (replies can carry their own next / fn)
//   cam     a HadesCam (zoomTo/release) — used when given or found on the scene below
//   camera  a THREE camera to project with (defaults to the world being drawn)
//   freeze  true: the scene below stops updating while we talk (we tick the camera ourselves)
//
// The floating-text painter is exported (drawFloat / drawReplyTags) so cutscenes share the look.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { tagCanvas } from '../art/handpaint.js';
import { clamp, ease } from '../core/math.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Who talks how: display name, ink colour, voice pitch (×), blip every n letters. */
export const VOICES = {
  durgan: { name: 'Durgan', color: '#ffb35a', pitch: 0.72, every: 2 },
  player: { name: 'Durgan', color: '#ffb35a', pitch: 0.72, every: 2 },
  bran: { name: 'Bran', color: '#ff8a4a', pitch: 0.92, every: 2 },
  elio: { name: 'Elio', color: '#8ab8ff', pitch: 1.22, every: 2 },
  clover: { name: 'Clover', color: '#ffb8d8', pitch: 1.38, every: 2 },
  morel: { name: 'Morel', color: '#b8f08a', pitch: 1.62, every: 2 },
  medusa: { name: 'Medusa', color: '#8affc8', pitch: 0.86, every: 3, whisper: true },
  grand_puffcap: { name: 'Grand Puffcap', color: '#ff8a9a', pitch: 0.5, every: 3 },
  puffcap: { name: 'Grand Puffcap', color: '#ff8a9a', pitch: 0.5, every: 3 },
  pip: { name: 'Pip', color: '#e8c8a0', pitch: 1.9, every: 4 },
  shrine: { name: 'Shrine', color: '#c8b8ff', pitch: 0.7, every: 3, whisper: true },
  narrator: { name: '', color: '#f4e6c8', pitch: 1, every: 99 },
};
const voiceOf = (who) => VOICES[who] || { name: who ? String(who).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '', color: '#f4e6c8', pitch: 1, every: 2 };

const CPS = 42;           // letters per second
const PAUSE = { ',': 0.1, '.': 0.24, '!': 0.24, '?': 0.24, '…': 0.32, ':': 0.12, ';': 0.12, '—': 0.16 };
const BAR = 34;

// ------------------------------------------------------------------ anchors + projection
/** World position of the top of a speaker (where the line floats). */
export function anchorPos(at, out = V()) {
  if (!at) return null;
  if (typeof at === 'function') return anchorPos(at(), out);
  if (at.isVector3) return out.copy(at);
  if (Array.isArray(at)) return out.set(at[0], at[1], at[2]);
  if (typeof at.headPos === 'function') { at.headPos(out); return out.add(V(0, 0.22, 0)); }
  if (at.model && at.model !== at) {
    const m = at.model;
    if (typeof m.headPos === 'function') { m.headPos(out); return out.add(V(0, 0.22, 0)); }
    const r = anchorPos(m, out);
    if (r) return r;
  }
  const g = at.group || (at.isObject3D ? at : null);
  if (g) {
    g.getWorldPosition(out);
    const h = at.height || (at.def && at.def.height) || g.userData.height || 1.2;
    return out.add(V(0, h + 0.25 + (at.fly || 0), 0));
  }
  if (typeof at.x === 'number' && typeof at.z === 'number') return out.set(at.x, (at.y || 0) + (at.height || 1.3), at.z);
  return null;
}
function project(camera, v, w, h) {
  if (!camera || !v) return null;
  camera.updateMatrixWorld();
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, behind: p.z > 1 || p.z < -1 };
}

// ------------------------------------------------------------------ the floating line
const wordCache = new Map();
/** Lay out a line into positioned words (font 'large', wrapped at maxW). */
function layoutWords(ui, text, maxW, font) {
  const key = text + '|' + maxW + '|' + font;
  let L = wordCache.get(key);
  if (L) return L;
  const space = ui.measure(' ', font) || 4;
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [[]];
  let x = 0, start = 0;
  for (const w of words) {
    const ww = ui.measure(w, font);
    if (x > 0 && x + ww > maxW) { lines.push([]); x = 0; }
    lines[lines.length - 1].push({ w, x, width: ww, start, end: start + w.length });
    x += ww + space;
    start += w.length + 1;
  }
  const lh = font === 'large' ? 15 : 11;
  L = { lines, lh, width: Math.max(...lines.map((ln) => (ln.length ? ln[ln.length - 1].x + ln[ln.length - 1].width : 0))), height: lines.length * lh };
  wordCache.set(key, L);
  if (wordCache.size > 200) wordCache.delete(wordCache.keys().next().value);
  return L;
}

/**
 * Paint a line of floating text centred over (x, y) (the bottom edge of the block sits at y).
 * shown: letters revealed so far (Infinity = all); age: seconds since each letter appeared, via
 * revealT(i) → time letter i appeared; o: { name, color, alpha, font, maxW, tail }.
 */
export function drawFloat(ui, x, y, text, o = {}) {
  const font = o.font || 'large';
  const maxW = o.maxW || 280;
  const L = layoutWords(ui, text, maxW, font);
  const alpha = o.alpha ?? 1;
  const ctx = ui.ctx;
  const W = L.width, H = L.height + (o.name ? 12 : 0);
  const bx = Math.round(clamp(x - W / 2, 8, ui.w - W - 8)), by = Math.round(clamp(y - H, 8 + (o.top || 0), ui.h - H - 8 - (o.bottom || 0)));
  // a soft ink cloud behind the words (readable over any background, never a hard box)
  ctx.save();
  ctx.globalAlpha = 0.55 * alpha;
  const g = ctx.createRadialGradient(bx + W / 2, by + H / 2, 4, bx + W / 2, by + H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(6,4,10,0.85)'); g.addColorStop(0.6, 'rgba(6,4,10,0.5)'); g.addColorStop(1, 'rgba(6,4,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(bx - 26, by - 16, W + 52, H + 32);
  ctx.restore();
  let ty = by;
  if (o.name) {
    ctx.globalAlpha = alpha;
    ui.text(o.name, bx, ty, { font: 'small', color: o.color || '#f4e6c8', outline: '#08060c' });
    ctx.globalAlpha = 1;
    ty += 12;
  }
  const shown = o.shown ?? Infinity;
  const now = o.now ?? 0;
  for (let li = 0; li < L.lines.length; li++) {
    for (const wd of L.lines[li]) {
      if (wd.start >= shown) continue;
      const t0 = o.revealT ? o.revealT(wd.start) : -1;
      const k = t0 < 0 ? 1 : clamp((now - t0) / 0.14);
      const rise = Math.round((1 - ease.outBack(k)) * 4);
      // a partly revealed word types letter by letter
      const vis = wd.end > shown ? wd.w.slice(0, shown - wd.start) : wd.w;
      ctx.globalAlpha = alpha * (0.35 + 0.65 * k);
      ui.text(vis, bx + wd.x, ty + li * L.lh + rise, { font, color: o.ink || '#fbf2e2', outline: '#0a0610', thick: true });
      ctx.globalAlpha = 1;
    }
  }
  // the little tail toward the speaker
  if (o.tail !== false && alpha > 0.05) {
    const tx = Math.round(clamp(x, bx + 6, bx + W - 6)), tyy = by + H + 3;
    ctx.globalAlpha = 0.7 * alpha;
    ui.rect(tx - 2, tyy, 5, 2, o.color || '#f4e6c8');
    ui.rect(tx - 1, tyy + 2, 3, 2, o.color || '#f4e6c8');
    ctx.globalAlpha = 1;
  }
  return { x: bx, y: by, w: W, h: H };
}

/**
 * Your replies: stacked wooden tags floating near (x, y). Returns the index clicked/tapped (or -1).
 * sel: highlighted index; t: seconds since they appeared (they slide in one after another).
 */
export function drawReplyTags(ui, x, y, replies, sel, t, idPrefix = 'dlg') {
  let picked = -1;
  const touch = ui.touch;
  const gap = touch ? 26 : 21;
  const n = replies.length;
  const top = Math.round(clamp(y - (n * gap) / 2, 40, ui.h - n * gap - 44));
  for (let i = 0; i < n; i++) {
    const r = replies[i];
    const k = ease.outBack(clamp((t - i * 0.07) / 0.28));
    if (k <= 0) continue;
    const label = (touch ? '' : `${i + 1}  `) + r.text;
    const w = ui.measure(label) + 22;
    const c = tagCanvas(Math.max(70, w));
    const left = Math.round(clamp(x, 8, ui.w - c.width - 8));
    const yy = top + i * gap;
    const hit = ui.hit(`${idPrefix}-r${i}`, left - 2, yy - 2, c.width + 4, c.height + (touch ? 8 : 4), { sound: false, cursor: 'hand' });
    const hot = hit.hover || sel === i;
    const slide = Math.round((1 - k) * 18) - (hot ? 4 : 0);
    if (hot) {
      const ctx = ui.ctx;
      ctx.save(); ctx.globalAlpha = 0.35 + 0.15 * Math.sin(ui.time * 7); ctx.fillStyle = '#ffd27a';
      ctx.fillRect(left + slide - 3, yy - 2, c.width + 6, c.height + 4); ctx.restore();
    }
    ui.img(c, left + slide, yy, { alpha: clamp(k) });
    ui.ctx.globalAlpha = clamp(k);
    ui.text(label, left + slide + 11, yy + 11, { color: hot ? '#5a1e00' : '#3a2214' });
    ui.ctx.globalAlpha = 1;
    if (hit.clicked) picked = i;
  }
  return picked;
}

// ------------------------------------------------------------------ the overlay
export class DialogueOverlay extends Scene {
  get freezesBelow() { return !!(this.p && this.p.freeze); }
  enter(p = {}) {
    this.p = p;
    this.lines = (p.lines || []).filter(Boolean).map((l) => (typeof l === 'string' ? { who: 'narrator', text: l } : l));
    this.labels = {};
    this.lines.forEach((l, i) => { if (l.label) this.labels[l.label] = i; });
    this.result = { choices: {}, picked: [] };
    const below = this.game.scene;
    this.cam = p.cam !== undefined ? p.cam : (below && (below.cam || (below.aw && below.aw.cam) || (below.world && below.world.cam))) || null;
    if (this.cam && typeof this.cam.zoomTo !== 'function') this.cam = null;
    this.barsK = 0; this.barsTo = p.bars === false ? 0 : 1;
    this.i = -1; this.line = null;
    this.closing = 0; this.done = false;
    this.replyFor = null; // after you pick, your reply floats over Durgan for a moment
    this.next(0);
    if (this.game.audio && p.sound !== false) this.game.audio.play('dialogue_open', { vol: 0.5 });
  }
  /** The camera the world below is drawn with. */
  camera() {
    if (this.p.camera) return this.p.camera;
    if (this.cam && this.cam.camera) return this.cam.camera;
    const g = this.game;
    for (let i = g.overlays.length - 1; i >= 0; i--) { const o = g.overlays[i]; if (o !== this && o.world && o.world.camera) return o.world.camera; }
    return g.scene && g.scene.world ? g.scene.world.camera : null;
  }
  resolve(next) {
    if (typeof next === 'number') return next;
    if (typeof next === 'string' && next in this.labels) return this.labels[next];
    return this.i + 1;
  }
  next(target) {
    const idx = target === undefined ? this.i + 1 : target;
    if (idx < 0 || idx >= this.lines.length) { this.close(); return; }
    this.i = idx;
    const L = (this.line = this.lines[idx]);
    this.t = 0; this.shown = 0; this.acc = 0; this.revealAt = []; this.blipN = 0;
    this.replyT = -1; this.sel = 0; this.lineDone = false; this.holdT = 0;
    this.text = L.text || '';
    if (L.beat) { try { L.beat(this); } catch (e) { /* a beat must never break the talk */ } }
    if (L.card && this.game.audio) this.game.audio.play('stinger', { vol: 0.6 });
    // lean the camera in on the speaker (framing the listener too)
    if (this.cam && !L.noZoom && (L.at || L.with)) {
      const a = anchorPos(L.at), b = L.with ? anchorPos(L.with) : null;
      const focus = a && b ? a.clone().lerp(b, 0.35) : a || b;
      if (focus) {
        focus.y -= 0.35;
        try { this.cam.zoomTo(focus, { fov: (L.zoom && L.zoom.fov) || this.p.fov || 24, dist: (L.zoom && L.zoom.dist) || this.p.dist, dur: this.i === 0 ? 0.7 : 0.45 }); } catch (e) { /* camera optional */ }
        this.zoomed = true;
      }
    }
    if (!this.text) { this.shown = 0; this.lineDone = true; this.replyT = L.replies && L.replies.length ? 0 : -1; }
  }
  close() {
    if (this.closing) return;
    this.closing = 0.001; this.barsTo = 0;
    if (this.cam && this.zoomed && typeof this.cam.release === 'function') { try { this.cam.release(0.6); } catch (e) { /* camera optional */ } }
    if (this.game.audio && this.p.sound !== false) this.game.audio.play('dialogue_close', { vol: 0.4 });
  }
  /** Reveal the whole line now (first tap), or move on (second tap). */
  advance() {
    const L = this.line;
    if (!L || this.closing) return;
    if (!this.lineDone) { this.finishTyping(); return; }
    if (L.replies && L.replies.length) return; // pick a reply
    if (L.wait && !L.wait(this)) return;
    this.next(this.resolve(L.next));
  }
  finishTyping() {
    const n = this.text.length;
    for (let i = this.shown; i < n; i++) this.revealAt[i] = this.t;
    this.shown = n; this.lineDone = true;
    if (this.line.replies && this.line.replies.length && this.replyT < 0) this.replyT = 0;
  }
  pick(i) {
    const L = this.line, r = L && L.replies && L.replies[i];
    if (!r || this.picking) return;
    this.picking = true;
    this.result.choices[L.label ?? this.i] = i;
    this.result.picked.push(r.text);
    if (this.game.audio) { this.game.audio.play('ui_pop'); this.game.audio.play('voice', { pitch: voiceOf('durgan').pitch, vol: 0.5 }); }
    const replyAt = L.replyAt || this.p.replyAt || this.lastPlayerAt;
    if (r.say !== false && replyAt) this.replyFor = { text: r.text, at: replyAt, t: 0, dur: 1.1 + r.text.length * 0.02 };
    const go = () => {
      this.picking = false;
      if (r.fn) { try { r.fn(this, i); } catch (e) { /* replies are cosmetic if their hook fails */ } }
      if (this.closing) return;
      this.next(this.resolve(r.next !== undefined ? r.next : L.next));
    };
    this.after = { t: this.replyFor ? Math.min(0.9, this.replyFor.dur * 0.7) : 0.15, fn: go };
  }

  update(dt, rdt = dt) {
    if (this.freezesBelow && this.cam && this.cam.update) this.cam.update(rdt);
    this.barsK += (this.barsTo - this.barsK) * (1 - Math.exp(-rdt * 9));
    if (this.closing) {
      this.closing += rdt;
      if (this.closing > 0.35 && !this.done) {
        this.done = true;
        this.game.popOverlay(this);
        const fn = this.p.onDone;
        if (fn) fn(this.result);
      }
      return;
    }
    if (this.after) { this.after.t -= rdt; if (this.after.t <= 0) { const f = this.after.fn; this.after = null; f(); } }
    if (this.replyFor) { this.replyFor.t += rdt; if (this.replyFor.t > this.replyFor.dur) this.replyFor = null; }
    const L = this.line;
    if (!L) return;
    this.t += rdt;
    if (L.who === 'durgan' || L.who === 'player') this.lastPlayerAt = L.at;
    // the typewriter: letters at CPS, punctuation breathes, a voice blip every few letters
    if (!this.lineDone) {
      this.acc += rdt * CPS * (this.fast ? 3 : 1);
      while (this.acc >= 1 && this.shown < this.text.length) {
        const ch = this.text[this.shown];
        this.revealAt[this.shown] = this.t;
        this.shown++;
        this.acc -= 1;
        const v = voiceOf(L.who);
        if (/[A-Za-z0-9]/.test(ch) && (this.blipN++ % v.every) === 0 && this.game.audio) this.game.audio.play(v.whisper ? 'voice_whisper' : 'voice', { pitch: v.pitch * (0.94 + Math.random() * 0.12) * (L.mood === 'shout' ? 1.1 : 1), vol: L.mood === 'whisper' ? 0.25 : 0.42 });
        if (PAUSE[ch]) { this.acc -= PAUSE[ch] * CPS; break; }
      }
      if (this.shown >= this.text.length) { this.lineDone = true; if (L.replies && L.replies.length) this.replyT = 0; }
    } else if (this.replyT >= 0) this.replyT += rdt;
    // lines that move on by themselves (narration, tutorial nudges)
    if (this.lineDone && !(L.replies && L.replies.length)) {
      this.holdT += rdt;
      const autoT = L.auto ?? this.p.auto;
      if (autoT !== undefined && autoT !== null && this.holdT >= autoT && (!L.wait || L.wait(this))) this.next(this.resolve(L.next));
      else if (L.wait && L.wait(this) && L.waitAdvance) this.next(this.resolve(L.next));
    }
    // input: tap/click/confirm to type out or move on; number keys / arrows pick replies; Esc fast-forwards
    const inp = this.game.input;
    const hasReplies = L.replies && L.replies.length && this.lineDone;
    if (hasReplies) {
      const n = L.replies.length;
      if (inp.actionPressed('up') || inp.actionPressed('left')) { this.sel = (this.sel + n - 1) % n; this.game.audio && this.game.audio.play('hover'); }
      if (inp.actionPressed('down') || inp.actionPressed('right')) { this.sel = (this.sel + 1) % n; this.game.audio && this.game.audio.play('hover'); }
      for (let k = 0; k < Math.min(3, n); k++) if (inp.keyPressed('Digit' + (k + 1)) || inp.keyPressed('Numpad' + (k + 1))) this.pick(k);
      if (inp.actionPressed('confirm')) this.pick(this.sel);
    } else if (inp.actionPressed('confirm') || inp.actionPressed('strike') || inp.keyPressed('KeyE') || inp.keyPressed('KeyF')) this.advance();
    if (inp.actionPressed('back')) {
      if (!this.lineDone) this.finishTyping();
      else if (hasReplies) this.pick(0);
      else this.advance();
    }
  }

  draw(ui) {
    const W = ui.w, H = ui.h, ctx = ui.ctx;
    // letterbox
    const bh = Math.round(BAR * clamp(this.barsK));
    if (bh > 0) { ui.rect(0, 0, W, bh, '#030206'); ui.rect(0, H - bh, W, bh, '#030206'); }
    const L = this.line;
    const cam = this.camera();
    const fade = this.closing ? clamp(1 - this.closing / 0.3) : 1;
    // the title card (boss names, places)
    if (L && L.card) {
      const k = clamp(this.t / 0.4) * fade;
      const c = L.card, y = H / 2 + 70;
      ctx.globalAlpha = k;
      const lw = Math.round(220 * ease.outCubic(clamp(this.t / 0.8)));
      ui.rect(W / 2 - lw, y - 36, lw * 2, 1, c.color || '#e8a060', 0.8 * k);
      ui.big(c.title, W / 2, y - 12, { scale: 4, top: '#fff6e0', bottom: c.color || '#e8a060', outline: '#0a0608' });
      if (c.sub) ui.big(c.sub, W / 2, y + 22, { scale: 2, top: '#f0e4d0', bottom: '#c8b8a0', outline: '#0a0608', highlight: false });
      ui.rect(W / 2 - lw, y + 38, lw * 2, 1, c.color || '#e8a060', 0.8 * k);
      ctx.globalAlpha = 1;
    }
    // the line, floating over the speaker
    if (L && this.text) {
      const v = voiceOf(L.who);
      const ap = anchorPos(L.at);
      const p = ap ? project(cam, ap, W, H) : null;
      const x = p && !p.behind ? p.x : W / 2, y = p && !p.behind ? p.y : H - bh - 46;
      const inK = clamp(this.t / 0.18);
      drawFloat(ui, x, y + Math.round((1 - inK) * 6), this.text, {
        name: v.name, color: v.color, alpha: inK * fade, shown: this.shown, now: this.t, revealT: (i) => (this.revealAt[i] ?? -1),
        top: bh + 4, bottom: bh + 4, maxW: L.maxW || 270, tail: !!p,
      });
      // a little "more" mark once the line is out
      if (this.lineDone && !(L.replies && L.replies.length) && !L.auto && !this.closing) {
        const blink = Math.sin(ui.time * 6) > -0.3;
        if (blink) ui.text(ui.touch ? 'tap' : '▼', W - 26, H - bh - 18, { color: '#f4e6c8', outline: '#08060c', align: 'center', font: 'small' });
      }
    }
    // your reply, said aloud
    if (this.replyFor) {
      const r = this.replyFor, ap = anchorPos(r.at), p = ap ? project(cam, ap, W, H) : null;
      const k = clamp(r.t / 0.15) * clamp((r.dur - r.t) / 0.25) * fade;
      drawFloat(ui, p ? p.x : W / 2, p ? p.y : H - bh - 60, r.text, { name: voiceOf('durgan').name, color: voiceOf('durgan').color, alpha: k, top: bh + 4, bottom: bh + 4, maxW: 220 });
    }
    // reply tags
    if (L && L.replies && L.replies.length && this.lineDone && this.replyT >= 0 && !this.picking && !this.closing) {
      const at = L.replyAt || this.p.replyAt || this.lastPlayerAt;
      const ap = at ? anchorPos(at) : null;
      const p = ap ? project(cam, ap, W, H) : null;
      const x = p && !p.behind ? Math.min(W - 230, p.x + 34) : W / 2 - 90;
      const y = p && !p.behind ? p.y + 30 : H - bh - 70;
      const picked = drawReplyTags(ui, x, y, L.replies, this.sel, this.replyT);
      if (picked >= 0) this.pick(picked);
    } else if (L && !this.closing && this.game.input.pressed && !this.game.input.consumed) {
      this.game.input.consume();
      this.advance();
    }
  }
}

/** Push a dialogue (see the header). */
export function speak(game, lines, opts = {}) {
  return game.pushOverlay('dialogue', { ...opts, lines });
}

/** The lines for an in-world boss introduction (camera on the boss, a roar, a name card, a word). */
export function bossIntroLines(id, boss, o = {}) {
  const INTRO = {
    grand_puffcap: { title: 'Grand Puffcap', sub: 'King of the Rot', color: '#ff8a9a', line: 'MORE… SPORES… FOR… THE QUEEN!', reply: [{ text: 'Not today, mushroom.' }, { text: 'Let my friend go!' }] },
    thornscale: { title: 'Thornscale', sub: 'Herald of Roots', color: '#9aff6a', line: 'The queen wants you back, forger.' },
    glasscoil: { title: 'Glasscoil', sub: 'Herald of the Deep Water', color: '#9ae8ff', line: 'Your reflection will be your grave.' },
    cinderfang: { title: 'Cinderfang', sub: 'Herald of Embers', color: '#ff8a3a', line: 'Two heads. One meal.' },
    medusa: { title: 'Medusa', sub: 'The Gorgon Queen', color: '#8affc8', line: 'You came back, little forger.' },
  };
  const I = INTRO[id] || { title: o.title || id, sub: o.sub || '', color: '#e8a060' };
  const lines = [];
  lines.push({ who: id, at: boss, text: '', card: { title: I.title, sub: I.sub, color: I.color }, auto: 2.2, zoom: { fov: 22 }, beat: o.roar });
  if (I.line) lines.push({ who: id, at: boss, text: I.line, replies: o.player && I.reply ? I.reply : undefined, replyAt: o.player, auto: o.player && I.reply ? undefined : 2.6 });
  return lines;
}
