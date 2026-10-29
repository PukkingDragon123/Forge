// Immediate-mode pixel UI. Scenes call these every frame inside draw(ui).
// Hit testing uses last frame's top-most registered region, so overlapping widgets behave.
import { drawText, measure, bigText, COLORS, setIconProvider, FONTS, layout } from './font.js';
import { icon, keycap, PAL } from './icons.js';
import * as F from './frames.js';
import { medallion } from './touch.js';
import { fromStrings, withOutline } from '../art/pixel.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

setIconProvider((name) => icon(name));

const CURSORS = {
  arrow: [
    'k.........',
    'kk........',
    'kwk.......',
    'kwwk......',
    'kwwwk.....',
    'kwwwwk....',
    'kwwwwwk...',
    'kwwwwwwk..',
    'kwwwwkkkk.',
    'kwkkwk....',
    'kk..kwk...',
    '.....kwk..',
    '......kk..',
  ],
  hand: [
    '...kk......',
    '..kwwk.....',
    '..kwwk.....',
    '..kwwkkk...',
    '..kwwkwwkk.',
    'kkkwwkwwkwk',
    'kwkwwwwwwwk',
    'kwwwwwwwwwk',
    '.kwwwwwwwwk',
    '.kwwwwwwwk.',
    '..kwwwwwwk.',
    '..kwwwwwk..',
    '...kkkkkk..',
  ],
  grab: [
    '...........',
    '...........',
    '...kkkkk...',
    '..kwkwkwkk.',
    'kkkwwwwwkwk',
    'kwkwwwwwwwk',
    'kwwwwwwwwwk',
    '.kwwwwwwwwk',
    '.kwwwwwwwk.',
    '..kwwwwwwk.',
    '..kwwwwwk..',
    '...kkkkkk..',
  ],
};
const curPal = { k: '#140c10', w: '#fff6e0' };
const cursorCanvases = {};
for (const k in CURSORS) cursorCanvases[k] = fromStrings(CURSORS[k], curPal);

export class UI {
  constructor(renderer, input, audio) {
    this.r = renderer;
    this.ctx = renderer.ctx;
    this.input = input;
    this.audio = audio;
    this.time = 0;
    this.regions = [];
    this.hoverId = null; this.prevHover = null;
    this.activeId = null;
    this.tip = null;
    this.cursor = 'arrow';
    this.floaters = [];
    this.particles = [];
    this.blockers = 0;
    this.focusLayer = 0; // only regions with layer >= focusLayer are interactive
    this.layer = 0;
    this.dragging = null;
    this.toasts = [];
    this._tb = [];
  }
  get w() { return this.r.vw; }
  get h() { return this.r.vh; }
  get mx() { return this.input.x; }
  get my() { return this.input.y; }

  begin(dt) {
    this.dt = dt;
    this.time += dt;
    // resolve hover from last frame registrations (top-most = last)
    let hov = null;
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (r.layer < this.focusLayer) continue;
      if (this.mx >= r.x && this.my >= r.y && this.mx < r.x + r.w && this.my < r.y + r.h) { hov = r.id; break; }
    }
    if (hov !== this.hoverId) {
      if (hov && this.regions.find((r) => r.id === hov && r.sound)) this.audio && this.audio.play('hover');
    }
    this.prevHover = this.hoverId;
    this.hoverId = hov;
    this.regions = [];
    this.input.buttons = this._tb; // on-screen buttons drawn last frame are what fingers can hit
    this._tb = [];
    this.tip = null;
    this.cursor = 'arrow';
    this.layer = 0;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    if (!this.input.down && !this.input.released) this.activeId = null; // keep it through the release frame so slow clicks count
  }

  /** True when pointer is over any interactive UI region (so 3D picking should ignore it). */
  overUI() { return this.hoverId !== null; }

  /** Register an interactive region. Returns {hover, pressed, down, clicked, rclicked}. */
  hit(id, x, y, w, h, opts = {}) {
    this.regions.push({ id, x, y, w, h, layer: opts.layer ?? this.layer, sound: opts.sound !== false });
    const hover = this.hoverId === id;
    const inp = this.input;
    let pressed = false, clicked = false, rclicked = false;
    if (hover && inp.pressed && !inp.consumed) { this.activeId = id; pressed = true; }
    if (hover && inp.released && this.activeId === id && !inp.suppressClick) { clicked = true; inp.consume(); }
    if (hover && inp.rpressed) { rclicked = true; }
    if (pressed) inp.consume();
    if (hover && opts.cursor !== false) this.cursor = opts.cursor || 'hand';
    return { hover, pressed, down: this.activeId === id && inp.down, clicked, rclicked };
  }

  /** Invisible full-screen blocker for modals (call before drawing the modal). */
  block(layer = 1) {
    this.layer = layer;
    this.focusLayer = Math.max(this.focusLayer, layer);
    this.regions.push({ id: '__block' + layer, x: -1e4, y: -1e4, w: 3e4, h: 3e4, layer, sound: false });
  }
  unblock() { this.focusLayer = 0; this.layer = 0; }

  // ------------------------------------------------------------- drawing helpers
  rect(x, y, w, h, color, alpha = 1) {
    const c = this.ctx;
    c.globalAlpha = alpha; c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); c.globalAlpha = 1;
  }
  img(canvas, x, y, opts = {}) {
    const c = this.ctx;
    if (!canvas) return;
    const s = opts.scale || 1;
    const w = canvas.width * s, h = canvas.height * s;
    let dx = Math.round(x), dy = Math.round(y);
    if (opts.center) { dx = Math.round(x - w / 2); dy = Math.round(y - h / 2); }
    if (opts.alpha !== undefined) c.globalAlpha = opts.alpha;
    if (opts.flip || opts.rot) {
      c.save();
      c.translate(dx + w / 2, dy + h / 2);
      if (opts.rot) c.rotate(opts.rot);
      if (opts.flip) c.scale(-1, 1);
      c.drawImage(canvas, -w / 2, -h / 2, w, h);
      c.restore();
    } else c.drawImage(canvas, dx, dy, w, h);
    c.globalAlpha = 1;
  }
  text(str, x, y, opts = {}) { return drawText(this.ctx, str, x, y, opts); }
  measure(str, font = 'body') { return measure(str, font); }
  layout(str, font, maxW) { return layout(str, font, maxW); }
  big(str, x, y, opts = {}) {
    const c = bigText(str, opts);
    const s = opts.pop ? opts.pop : 1;
    if (s !== 1) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(s, s);
      ctx.drawImage(c, Math.round(-c.width / 2), Math.round(-c.height / 2));
      ctx.restore();
      return c;
    }
    const ax = opts.align === 'left' ? 0 : opts.align === 'right' ? c.width : c.width / 2;
    this.img(c, Math.round(x - ax), Math.round(y - (opts.valign === 'top' ? 0 : c.height / 2)), { alpha: opts.alpha });
    return c;
  }
  icon(name, x, y, opts = {}) {
    const ic = icon(name);
    if (!ic) return;
    this.img(ic.canvas, opts.center ? x - ic.w / 2 : x, opts.center ? y - ic.h / 2 : y, opts);
  }
  panel(style, x, y, w, h, opts = {}) {
    const fn = F[style];
    const c = fn(Math.round(w), Math.round(h), opts);
    this.img(c, x, y, { alpha: opts.alpha });
    return c;
  }
  keycap(label, x, y, pressed = false) {
    const k = keycap(label, pressed);
    this.img(k.canvas, x, y);
    drawText(this.ctx, label, x + k.textX, y + k.textY, { font: 'small', color: '#2a1d16' });
    return k;
  }

  // ------------------------------------------------------------- widgets
  /**
   * Pixel button. opts: style ('wood'|'iron'|'gold'|'stone'|'red'|'green'|'purple'), icon, disabled,
   * font, tip, key (keyboard shortcut label), sound
   */
  button(id, x, y, w, h, label, opts = {}) {
    x = Math.round(x); y = Math.round(y);
    const st = this.hit(id, x, y, w, h, { cursor: opts.disabled ? 'arrow' : 'hand' });
    const state = opts.disabled ? 'off' : st.down ? 'down' : st.hover ? 'hover' : 'idle';
    const style = opts.style || 'wood';
    this.img(F.button(w, h, style, state), x, y);
    const off = state === 'down' ? 1 : 0;
    const font = opts.font || (h < 14 ? 'small' : 'body');
    const fh = FONTS[font].cap;
    let cx = x + w / 2;
    const ty = y + Math.floor((h - 3 - fh) / 2) + off;
    const textColor = opts.disabled ? '#8a8078' : style === 'gold' ? '#3a1e08' : '#fff6e0';
    const outline = style === 'gold' ? '#fff0b0' : '#2a160c';
    if (opts.icon) {
      const ic = icon(opts.icon);
      const tw = label ? measure(label, font) : 0;
      const total = ic.w + (label ? 3 + tw : 0);
      const ix = Math.round(cx - total / 2);
      this.img(ic.canvas, ix, y + Math.floor((h - 3 - ic.h) / 2) + off, { alpha: opts.disabled ? 0.5 : 1 });
      if (label) drawText(this.ctx, label, ix + ic.w + 3, ty, { font, color: textColor, outline: style === 'gold' ? undefined : outline, outlineShadow: false });
    } else if (label) {
      drawText(this.ctx, label, cx, ty, { font, color: textColor, align: 'center', outline: style === 'gold' ? undefined : outline, outlineShadow: false });
    }
    if (st.hover && !opts.disabled) {
      // glint sweep
      const t = (this.time * 1.4) % 2.2;
      const gx = x + t * w * 0.8 - 6;
      if (t < 1.3) {
        const c = this.ctx;
        c.save(); c.beginPath(); c.rect(x + 2, y + 1 + off, w - 4, h - 5); c.clip();
        c.globalAlpha = 0.28; c.fillStyle = '#fff';
        for (let i = 0; i < h; i++) c.fillRect(Math.round(gx + i * 0.5), y + i, 3, 1);
        c.restore();
      }
    }
    if (opts.key) this.keycap(opts.key, x + w - 6, y - 6);
    if (st.hover && opts.tip) this.tooltip(opts.tip);
    if (st.clicked && !opts.disabled) { this.audio && this.audio.play(opts.sound || 'click'); return true; }
    if (st.clicked && opts.disabled) this.audio && this.audio.play('deny');
    return false;
  }

  /** Small square icon button. */
  iconButton(id, x, y, iconName, opts = {}) {
    const s = opts.size || 15;
    return this.button(id, x, y, s, s + 2, '', { ...opts, icon: iconName, style: opts.style || 'iron' });
  }

  /** True while the player is on a touchscreen (on-screen controls are shown). */
  get touch() { return this.input.touch; }
  /**
   * On-screen button for touch play, standing in for a keyboard action. Drawn only in touch mode;
   * press it with any finger (several at once). opts: {label, icon, style, glow, small}
   */
  touchButton(action, x, y, r, opts = {}) {
    if (!this.input.touch) return false;
    this._tb.push({ action, x, y, r });
    const held = this.input.held.has(action);
    const m = medallion(r, opts.style || 'brass', held);
    const c = this.ctx;
    if (opts.glow) { c.save(); c.globalAlpha = 0.35 + Math.sin(this.time * 6) * 0.15; c.fillStyle = opts.glowColor || '#ffd27a'; c.beginPath(); c.arc(x, y, r + 5, 0, Math.PI * 2); c.fill(); c.restore(); }
    c.globalAlpha = opts.alpha ?? 0.9;
    c.drawImage(m, Math.round(x - m.width / 2), Math.round(y - m.height / 2 + (held ? 1 : 0)));
    c.globalAlpha = 1;
    if (opts.icon) { const ic = icon(opts.icon); if (ic) { const s = r >= 24 ? 2 : 1; c.drawImage(ic.canvas, Math.round(x - (ic.w * s) / 2), Math.round(y - (ic.h * s) / 2 - (opts.label && r >= 24 ? 4 : 0) + (held ? 1 : 0)), ic.w * s, ic.h * s); } }
    if (opts.label) drawText(c, opts.label, Math.round(x), Math.round(y + (opts.icon && r >= 24 ? r * 0.42 : -3) + (held ? 1 : 0)), { align: 'center', font: 'small', color: '#f4e6c8', outline: '#140c10' });
    return held;
  }

  /** Deferred tooltip; content is rich text string or {title, body, w} or a draw fn(ui, x, y). */
  tooltip(content, opts = {}) { this.tip = { content, opts }; }

  _drawTooltip() {
    if (!this.tip) return;
    const { content, opts } = this.tip;
    if (typeof content === 'function') { content(this, this.mx, this.my); return; }
    const isObj = typeof content === 'object';
    const title = isObj ? content.title : null;
    const body = isObj ? content.body : content;
    const maxW = (isObj && content.w) || opts.w || 150;
    const bodyLines = body ? layout(body, 'body', maxW - 12) : [];
    const tw = Math.max(title ? measure(title, 'body') + 12 : 0, ...bodyLines.map((l) => l.w + 12), 40);
    const th = (title ? 14 : 4) + bodyLines.length * 11 + 6;
    let x = this.mx + 10, y = this.my + 10;
    if (this.input.touch) { x = this.mx - tw / 2; y = this.my - th - 26; if (y < 2) y = this.my + 30; } // above the finger
    if (x + tw > this.w - 2) x = this.input.touch ? this.w - tw - 2 : this.mx - tw - 6;
    if (y + th > this.h - 2) y = this.h - th - 2;
    x = Math.max(2, x); y = Math.max(2, y);
    this.img(F.dark(tw, th, { accent: (isObj && content.accent) || 'gold' }), x, y);
    let cy = y + 5;
    if (title) {
      drawText(this.ctx, title, x + 6, cy, { color: (isObj && content.color) || COLORS.gold, outline: '#140c10', outlineShadow: false });
      cy += 13;
    }
    if (body) drawText(this.ctx, body, x + 6, cy, { maxW: maxW - 12, color: COLORS.text });
  }

  // ------------------------------------------------------------- floaters & 2D particles
  /** Floating popup text (damage numbers, +mult...). */
  float(str, x, y, opts = {}) {
    this.floaters.push({ str, x, y, vy: opts.vy ?? -26, life: opts.life ?? 1.0, t: 0, big: opts.big, color: opts.color, top: opts.top, bottom: opts.bottom, scale: opts.scale || 2, wobble: opts.wobble });
  }
  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.angle !== undefined ? opts.angle + rnd.float(-opts.spread || -0.5, opts.spread || 0.5) : rnd.float(0, Math.PI * 2);
      const sp = rnd.float(opts.speedMin ?? 20, opts.speed ?? 80);
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 0),
        g: opts.gravity ?? 120, life: rnd.float(0.35, opts.life ?? 0.9), t: 0,
        color: Array.isArray(opts.colors) ? rnd.pick(opts.colors) : opts.color || '#ffe08a',
        size: opts.size || (rnd.chance(0.3) ? 2 : 1), drag: opts.drag ?? 0.5, kind: opts.kind || 'px',
        glow: opts.glow,
      });
    }
  }
  toast(text, opts = {}) { this.toasts.push({ text, t: 0, life: opts.life || 2.6, color: opts.color, icon: opts.icon }); }

  _updateFx(dt) {
    const c = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t >= p.life) { this.particles.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt * 0.3;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.t / p.life;
      c.globalAlpha = k < 0.3 ? k / 0.3 : 1;
      if (p.kind === 'spark') {
        c.fillStyle = p.color;
        c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        c.fillRect(Math.round(p.x - p.vx * 0.02), Math.round(p.y - p.vy * 0.02), 1, 1);
      } else if (p.kind === 'star') {
        c.fillStyle = p.color;
        const x = Math.round(p.x), y = Math.round(p.y);
        c.fillRect(x, y - 1, 1, 3); c.fillRect(x - 1, y, 3, 1);
      } else {
        c.fillStyle = p.color;
        c.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    }
    c.globalAlpha = 1;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t >= f.life) { this.floaters.splice(i, 1); continue; }
      const k = f.t / f.life;
      const y = f.y + f.vy * ease.outCubic(Math.min(1, k * 1.4)) ;
      const alpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const pop = k < 0.12 ? 1 + (1 - k / 0.12) * 0.6 : 1;
      if (f.big) {
        const img = bigText(f.str, { scale: f.scale, top: f.top, bottom: f.bottom });
        c.globalAlpha = alpha;
        c.save();
        c.translate(Math.round(f.x), Math.round(y));
        const s = Math.round(pop * 4) / 4;
        c.scale(s, s);
        c.drawImage(img, Math.round(-img.width / 2), Math.round(-img.height / 2));
        c.restore();
        c.globalAlpha = 1;
      } else {
        c.globalAlpha = alpha;
        drawText(c, f.str, f.x, y, { align: 'center', color: f.color || COLORS.text, outline: '#140c10', thick: true });
        c.globalAlpha = 1;
      }
    }
    // toasts (top center stack)
    let ty = 26;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.t += dt;
      if (t.t > t.life) { this.toasts.splice(i, 1); continue; }
      const k = t.t / t.life;
      const slide = k < 0.1 ? ease.outBack(k / 0.1) : k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
      const tw = measure(t.text) + 20 + (t.icon ? 12 : 0);
      const x = Math.round(this.w / 2 - tw / 2);
      c.globalAlpha = clamp(slide, 0, 1);
      this.img(F.dark(tw, 17), x, ty - (1 - slide) * 8);
      if (t.icon) this.icon(t.icon, x + 6, ty + 4 - (1 - slide) * 8);
      drawText(c, t.text, x + 10 + (t.icon ? 12 : 0), ty + 5 - (1 - slide) * 8, { color: t.color || COLORS.text });
      c.globalAlpha = 1;
      ty += 20;
    }
  }

  end(dt) {
    this._updateFx(dt);
    this._drawTooltip();
    // custom cursor
    if (!this.input.touch) {
      const cur = this.dragging ? 'grab' : this.cursor;
      const cc = cursorCanvases[cur] || cursorCanvases.arrow;
      const ox = cur === 'arrow' ? 0 : 3;
      this.img(cc, Math.round(this.mx) - ox, Math.round(this.my));
    }
  }
}

export { COLORS, F as frames, PAL };
