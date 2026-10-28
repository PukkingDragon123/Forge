// Quick-time events shared by travel and event scenes. All timers use real (unscaled) time.
import { prompt, ring } from './common.js';
import { COLORS } from '../ui/font.js';
import { bar } from '../ui/frames.js';
import { ease } from '../core/math.js';

const KEYS = { strike: 'SPACE', block: 'SHIFT' };

/** Was the action pressed this frame (keyboard, or mouse button when not over UI)? */
export function actionHit(game, action) {
  const inp = game.input;
  if (inp.actionPressed(action)) return true;
  if (game.ui.overUI()) return false;
  if (action === 'strike' && inp.pressed && !inp.consumed) return true;
  if (action === 'block' && inp.rpressed) return true;
  return false;
}

/**
 * Timing QTE: a ring shrinks onto a target; press when it closes.
 * opts: action ('strike'|'block'), label, dur (approach seconds), window (± seconds), pos () => {x,y}
 */
export class TimingQTE {
  constructor(game, opts = {}) {
    this.game = game;
    this.action = opts.action || 'strike';
    this.label = opts.label || 'NOW!';
    this.dur = opts.dur ?? 1.1;
    this.win = opts.window ?? 0.16;
    this.pos = opts.pos || (() => ({ x: game.ui.w / 2, y: game.ui.h / 2 }));
    this.t = 0;
    this.state = 'pending';
    this.flash = 0;
    game.audio && game.audio.play('qte_prompt');
  }
  update(rdt) {
    if (this.state !== 'pending') { this.flash += rdt; return this.state; }
    this.t += rdt;
    if (actionHit(this.game, this.action)) {
      this.game.input.consume();
      const d = Math.abs(this.t - this.dur);
      this.state = d <= this.win ? 'win' : 'lose';
      this.perfect = d <= this.win * 0.45;
    } else if (this.t > this.dur + this.win) this.state = 'lose';
    if (this.state !== 'pending') this.game.audio && this.game.audio.play(this.state === 'win' ? 'qte_success' : 'qte_fail');
    return this.state;
  }
  draw(ui) {
    const { x, y } = this.pos();
    const k = Math.min(1, this.t / this.dur);
    const ctx = ui.ctx;
    const done = this.state !== 'pending';
    const col = done ? (this.state === 'win' ? '#7dff8a' : '#ff5d5d') : this.action === 'block' ? '#7fb8ff' : '#ffd25e';
    // target + approach ring
    ring(ctx, x, y, 9, col, 2, 0.9);
    ring(ctx, x, y, 8, '#140c10', 1, 0.6);
    if (!done) {
      const r = 9 + (1 - ease.inQuad(k)) * 30;
      ring(ctx, x, y, r, col, 2, 0.35 + k * 0.65);
      if (Math.abs(this.t - this.dur) <= this.win) ring(ctx, x, y, 12, '#ffffff', 1, 0.8);
    } else {
      ring(ctx, x, y, 9 + this.flash * 60, col, 2, Math.max(0, 1 - this.flash * 2));
    }
    const lw = ui.measure(this.label);
    const kc = KEYS[this.action];
    const total = lw + 4 + (kc.length * 4 + 10) + 12;
    prompt(ui, Math.round(x - total / 2), Math.round(y + 18), kc, this.label, this.t, { mouse: this.action === 'block' ? 'mouseR' : 'mouseL', color: col });
  }
}

/** Mash QTE: fill a bar by pressing repeatedly before time runs out. */
export class MashQTE {
  constructor(game, opts = {}) {
    this.game = game;
    this.label = opts.label || 'MASH!';
    this.need = opts.need ?? 12;
    this.dur = opts.dur ?? 3.2;
    this.pos = opts.pos || (() => ({ x: game.ui.w / 2, y: game.ui.h / 2 }));
    this.t = 0; this.n = 0; this.state = 'pending'; this.kick = 0;
    game.audio && game.audio.play('qte_prompt');
  }
  update(rdt) {
    if (this.state !== 'pending') return this.state;
    this.t += rdt;
    this.kick = Math.max(0, this.kick - rdt * 6);
    if (actionHit(this.game, 'strike')) {
      this.game.input.consume();
      this.n++; this.kick = 1;
      this.game.audio && this.game.audio.play('blip', { pitch: 1 + this.n * 0.04, vol: 0.5 });
      if (this.n >= this.need) this.state = 'win';
    } else if (this.t >= this.dur) this.state = 'lose';
    if (this.state !== 'pending') this.game.audio && this.game.audio.play(this.state === 'win' ? 'qte_success' : 'qte_fail');
    return this.state;
  }
  draw(ui) {
    const { x, y } = this.pos();
    const w = 90;
    const s = Math.round(this.kick * 2);
    ui.big(this.label, x, y - 14 - s, { scale: 2, top: '#fff6d8', bottom: '#ffb84a' });
    ui.img(bar(w, 8, this.n / this.need, ['#2a6a1a', '#5fd17a', '#b8f5a8']), Math.round(x - w / 2), y + 2);
    ui.img(bar(w, 4, 1 - this.t / this.dur, ['#6a4a1a', '#ffd25e', '#fff0a8']), Math.round(x - w / 2), y + 12);
    prompt(ui, Math.round(x - 30), y + 20, 'SPACE', 'MASH!', this.t * 2, { mouse: 'mouseL' });
  }
}

/** Shell game: watch the gem, follow the shuffle, pick the right shell. */
export class ShellGame {
  constructor(game, opts = {}) {
    this.game = game;
    this.rng = opts.rng;
    this.cx = opts.cx ?? game.ui.w / 2;
    this.cy = opts.cy ?? game.ui.h / 2;
    this.pos = [0, 1, 2]; // shell i sits at slot pos[i]
    this.gem = this.rng ? this.rng.int(0, 2) : 1;
    this.phase = 'show'; this.t = 0;
    this.swaps = []; for (let i = 0; i < 7; i++) { const a = this.rng ? this.rng.int(0, 2) : i % 3; let b = this.rng ? this.rng.int(0, 1) : 1; if (b >= a) b++; this.swaps.push([a, b]); }
    this.swapI = 0; this.swapT = 0; this.picked = -1; this.state = 'pending';
  }
  slotX(s) { return this.cx + (s - 1) * 46; }
  update(rdt) {
    this.t += rdt;
    if (this.phase === 'show' && this.t > 1.4) { this.phase = 'cover'; this.t = 0; }
    else if (this.phase === 'cover' && this.t > 0.5) { this.phase = 'shuffle'; this.t = 0; }
    else if (this.phase === 'shuffle') {
      this.swapT += rdt * (2.2 + this.swapI * 0.25);
      if (this.swapT >= 1) {
        const [a, b] = this.swaps[this.swapI];
        const ia = this.pos.indexOf(a), ib = this.pos.indexOf(b);
        this.pos[ia] = b; this.pos[ib] = a;
        this.swapT = 0; this.swapI++;
        this.game.audio && this.game.audio.play('card_flip', { vol: 0.5 });
        if (this.swapI >= this.swaps.length) { this.phase = 'pick'; this.t = 0; }
      }
    } else if (this.phase === 'reveal' && this.t > 1.2) this.state = this.picked === this.gem ? 'win' : 'lose';
    return this.state;
  }
  shellPos(i) {
    let s = this.pos[i];
    let x = this.slotX(s), lift = 0;
    if (this.phase === 'shuffle' && this.swapI < this.swaps.length) {
      const [a, b] = this.swaps[this.swapI];
      const k = ease.inOutQuad(this.swapT);
      if (s === a || s === b) {
        const to = s === a ? b : a;
        x = this.slotX(s) + (this.slotX(to) - this.slotX(s)) * k;
        lift = Math.sin(k * Math.PI) * (s === a ? -10 : 6);
      }
    }
    if (this.phase === 'show' || ((this.phase === 'reveal') && (i === this.picked || i === this.gem))) lift = -16;
    if (this.phase === 'cover') lift = -16 * (1 - Math.min(1, this.t / 0.4));
    return { x, y: this.cy + lift };
  }
  draw(ui) {
    for (let i = 0; i < 3; i++) {
      const p = this.shellPos(i);
      const base = { x: p.x, y: this.cy };
      if (i === this.gem && (this.phase === 'show' || this.phase === 'cover' || this.phase === 'reveal')) {
        ui.icon('gem', base.x - 4, base.y + 2);
        ui.icon('sparkle', base.x + 2, base.y - 1, { alpha: 0.7 });
      }
      this.drawShell(ui, p.x, p.y, i);
    }
    if (this.phase === 'pick') {
      ui.text('Which shell?', this.cx, this.cy + 26, { align: 'center', color: COLORS.gold, outline: '#140c10' });
      for (let i = 0; i < 3; i++) {
        const p = this.shellPos(i);
        const h = ui.hit('shell' + i, p.x - 16, p.y - 14, 32, 26);
        if (h.hover) ui.rect(p.x - 15, p.y + 12, 30, 1, '#ffd25e');
        if (h.clicked) { this.picked = i; this.phase = 'reveal'; this.t = 0; this.game.audio && this.game.audio.play(i === this.gem ? 'sparkle' : 'deny'); }
      }
    }
  }
  drawShell(ui, x, y) {
    const c = ui.ctx;
    x = Math.round(x); y = Math.round(y);
    // walnut shell dome
    const rows = [[6, 14], [4, 18], [3, 20], [2, 22], [1, 24], [1, 24], [0, 26], [0, 26], [0, 26], [1, 24]];
    rows.forEach(([o, w], j) => {
      c.fillStyle = '#140c10'; c.fillRect(x - 13 + o - 1, y - 8 + j, w + 2, 1);
    });
    rows.forEach(([o, w], j) => {
      c.fillStyle = j < 2 ? '#d8a070' : j < 5 ? '#b07845' : '#8a5a33';
      c.fillRect(x - 13 + o, y - 8 + j, w, 1);
      if (j > 1) { c.fillStyle = '#6a4024'; c.fillRect(x - 13 + o + 4 + (j % 3), y - 8 + j, 1, 1); c.fillRect(x + 6 - (j % 2), y - 8 + j, 1, 1); }
    });
    c.fillStyle = '#140c10'; c.fillRect(x - 13, y + 2, 26, 1);
    c.fillStyle = '#ffe0b0'; c.fillRect(x - 6, y - 6, 3, 1);
  }
}
