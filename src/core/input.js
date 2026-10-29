// Unified pointer + keyboard + touch input, in virtual (pixel-art) coordinates.
// Touch: one finger drives the "mouse" (tap = click, drag = drag). Holding still for a moment is
// "inspect": tooltips show under the finger, the release does not click, and a right-click fires
// (scroll reading etc.). Extra fingers can press on-screen buttons at the same time; each button
// maps to a keyboard action through a virtual key code ('Touch_strike', …).

const ACTIONS = {
  strike: ['Space', 'KeyJ', 'KeyZ', 'Touch_strike'],
  block: ['ShiftLeft', 'ShiftRight', 'KeyK', 'KeyX', 'Touch_block'],
  special: ['KeyE', 'KeyL', 'KeyC', 'Touch_special'],
  rotate: ['KeyR', 'Touch_rotate'],
  back: ['Escape', 'Backspace', 'Touch_back'],
  confirm: ['Enter', 'NumpadEnter', 'Space', 'Touch_confirm'],
  bag: ['Tab', 'KeyB', 'KeyI', 'Touch_bag'],
  pause: ['KeyP', 'Touch_pause'],
  read: ['Touch_read'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  fast: ['KeyF', 'Touch_fast'],
};
const HOLD_MS = 430, HOLD_SLOP = 9;

export class Input {
  constructor(el, toVirtual) {
    this.el = el;
    this.toVirtual = toVirtual;
    this.x = -999; this.y = -999; this.px = 0; this.py = 0;
    this.down = false; this.rdown = false;
    this.pressed = false; this.released = false; this.rpressed = false; this.rreleased = false;
    this.wheel = 0;
    this.keys = new Set(); this.keysPressed = new Set(); this.keysReleased = new Set();
    // touch mode: on when the last pointer was a finger (coarse pointers start in touch mode)
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.moved = false;
    this.consumed = false;
    this.lastGesture = 0;
    this.downX = 0; this.downY = 0; this.downTime = 0;
    this.longPress = false;      // this press turned into a hold (inspect)
    this.suppressClick = false;  // the release after a hold is not a click
    this.buttons = [];           // on-screen buttons from the last drawn frame: {action, x, y, r}
    this.held = new Set();       // actions held through on-screen buttons
    this.onButton = null;        // callback(action) when an on-screen button goes down (haptics)
    this._ptr = new Map();       // pointerId -> {kind:'primary'|'button'|'extra', action, x, y, t0}
    this._primary = null;
    this._queue = [];
    this.onFirstGesture = null;
    this.onGesture = null;
    this._bind();
  }
  _gesture() {
    if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); }
    this.onGesture && this.onGesture();
    this.lastGesture = performance.now();
  }
  _buttonAt(v) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (Math.hypot(v.x - b.x, v.y - b.y) <= b.r + 4) return b;
    }
    return null;
  }
  _bind() {
    const el = this.el;
    const virt = (e) => this.toVirtual(e.clientX, e.clientY);
    const pos = (e) => { const v = virt(e); this.x = v.x; this.y = v.y; this.moved = true; };
    el.addEventListener('pointermove', (e) => {
      const p = this._ptr.get(e.pointerId);
      if (p && p.kind !== 'primary') return;
      if (!p && e.pointerType === 'touch') return; // stray finger
      this.touch = e.pointerType === 'touch';
      pos(e);
    });
    el.addEventListener('pointerdown', (e) => {
      const isTouch = e.pointerType === 'touch';
      this.touch = isTouch;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      this._gesture();
      e.preventDefault();
      const v = virt(e);
      // on-screen buttons claim the finger that lands on them (any number at once)
      const b = isTouch || e.pointerType === 'pen' ? this._buttonAt(v) : null;
      if (b) {
        this._ptr.set(e.pointerId, { kind: 'button', action: b.action });
        this.held.add(b.action);
        this._queue.push('k+Touch_' + b.action);
        this.onButton && this.onButton(b.action);
        return;
      }
      if (this._primary !== null && isTouch) { this._ptr.set(e.pointerId, { kind: 'extra' }); return; }
      this._primary = e.pointerId;
      this._ptr.set(e.pointerId, { kind: 'primary', x: v.x, y: v.y, t0: performance.now(), touch: isTouch });
      this._queue = this._queue.filter((q) => q !== 'park');
      pos(e);
      if (e.button === 2) this._queue.push('rdown');
      else this._queue.push('down');
    });
    const up = (e) => {
      const p = this._ptr.get(e.pointerId);
      this._ptr.delete(e.pointerId);
      if (p && p.kind === 'button') { this.held.delete(p.action); this._queue.push('k-Touch_' + p.action); return; }
      if (p && p.kind === 'extra') return;
      if (e.pointerId === this._primary) this._primary = null;
      pos(e);
      if (e.button === 2) this._queue.push('rup');
      else this._queue.push('up');
      // a lifted finger leaves no hover behind (next frame), so tooltips don't get stuck
      if (e.pointerType === 'touch') this._queue.push('park');
      this.onGesture && this.onGesture();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    // stop iOS from scrolling/zooming the page under the game
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this._gesture();
      if (e.repeat) return;
      this.touch = false;
      this._queue.push('k+' + e.code);
    });
    window.addEventListener('keyup', (e) => this._queue.push('k-' + e.code));
    window.addEventListener('blur', () => {
      this.keys.clear(); this.down = false; this.rdown = false;
      for (const a of this.held) this.keys.delete('Touch_' + a);
      this.held.clear(); this._ptr.clear(); this._primary = null;
    });
  }
  /** Called once per frame before update. Applies queued events so presses are never lost. */
  poll() {
    this.pressed = this.released = this.rpressed = this.rreleased = false;
    this.keysPressed.clear(); this.keysReleased.clear();
    this.consumed = false;
    // a finger held still becomes an inspect: right-click once, and the release won't click
    const p = this._primary !== null && this._ptr.get(this._primary);
    if (p && p.touch && this.down && !this.longPress && performance.now() - p.t0 > HOLD_MS && Math.hypot(this.x - p.x, this.y - p.y) < HOLD_SLOP) {
      this.longPress = true; this.suppressClick = true; this.rpressed = true;
    }
    // apply at most one press + one release of each button per frame; leave extra for next frame
    const rest = [];
    const did = {};
    for (const ev of this._queue) {
      if (did[ev]) { rest.push(ev); continue; }
      did[ev] = true;
      if (ev === 'down') { this.down = true; this.pressed = true; this.downX = this.x; this.downY = this.y; this.downTime = performance.now(); this.longPress = false; this.suppressClick = false; }
      else if (ev === 'up') { if (this.down || this.pressed) this.released = true; this.down = false; }
      else if (ev === 'park') { if (did.up) rest.push(ev); else { this.x = -999; this.y = -999; } }
      else if (ev === 'rdown') { this.rdown = true; this.rpressed = true; }
      else if (ev === 'rup') { this.rdown = false; this.rreleased = true; }
      else if (ev.startsWith('k+')) { const c = ev.slice(2); this.keys.add(c); this.keysPressed.add(c); }
      else if (ev.startsWith('k-')) { const c = ev.slice(2); this.keys.delete(c); this.keysReleased.add(c); }
    }
    this._queue = rest;
  }
  endFrame() { this.wheel = 0; this.moved = false; }
  key(code) { return this.keys.has(code); }
  keyPressed(code) { return this.keysPressed.has(code); }
  action(name) { return ACTIONS[name].some((c) => this.keys.has(c)); }
  actionPressed(name) { return ACTIONS[name].some((c) => this.keysPressed.has(c)); }
  actionReleased(name) { return ACTIONS[name].some((c) => this.keysReleased.has(c)); }
  anyKeyPressed() { return this.keysPressed.size > 0; }
  /** Mark the current click as handled by UI so world picking ignores it. */
  consume() { this.consumed = true; }
  get dragDist() { return Math.hypot(this.x - this.downX, this.y - this.downY); }
}
