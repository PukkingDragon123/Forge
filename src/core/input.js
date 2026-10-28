// Unified pointer + keyboard input, in virtual (pixel-art) coordinates.

const ACTIONS = {
  strike: ['Space', 'KeyJ', 'KeyZ'],
  block: ['ShiftLeft', 'ShiftRight', 'KeyK', 'KeyX'],
  special: ['KeyE', 'KeyL', 'KeyC'],
  rotate: ['KeyR'],
  back: ['Escape', 'Backspace'],
  confirm: ['Enter', 'NumpadEnter', 'Space'],
  bag: ['Tab', 'KeyB', 'KeyI'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  fast: ['KeyF'],
};

export class Input {
  constructor(el, toVirtual) {
    this.el = el;
    this.toVirtual = toVirtual;
    this.x = -999; this.y = -999; this.px = 0; this.py = 0;
    this.down = false; this.rdown = false;
    this.pressed = false; this.released = false; this.rpressed = false; this.rreleased = false;
    this.wheel = 0;
    this.keys = new Set(); this.keysPressed = new Set(); this.keysReleased = new Set();
    this.touch = false;
    this.moved = false;
    this.consumed = false;
    this.lastGesture = 0;
    this.downX = 0; this.downY = 0; this.downTime = 0;
    this._queue = [];
    this.onFirstGesture = null;
    this._bind();
  }
  _gesture() {
    if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); }
    this.lastGesture = performance.now();
  }
  _bind() {
    const el = this.el;
    const pos = (e) => { const v = this.toVirtual(e.clientX, e.clientY); this.x = v.x; this.y = v.y; this.moved = true; };
    el.addEventListener('pointermove', (e) => { this.touch = e.pointerType === 'touch'; pos(e); });
    el.addEventListener('pointerdown', (e) => {
      this.touch = e.pointerType === 'touch';
      pos(e);
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      this._gesture();
      if (e.button === 2) this._queue.push('rdown');
      else this._queue.push('down');
      e.preventDefault();
    });
    const up = (e) => {
      pos(e);
      if (e.button === 2) this._queue.push('rup');
      else this._queue.push('up');
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this._gesture();
      if (e.repeat) return;
      this._queue.push('k+' + e.code);
    });
    window.addEventListener('keyup', (e) => this._queue.push('k-' + e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.down = false; this.rdown = false; });
  }
  /** Called once per frame before update. Applies queued events so presses are never lost. */
  poll() {
    this.pressed = this.released = this.rpressed = this.rreleased = false;
    this.keysPressed.clear(); this.keysReleased.clear();
    this.consumed = false;
    // apply at most one press + one release of each button per frame; leave extra for next frame
    const rest = [];
    let did = {};
    for (const ev of this._queue) {
      const kind = ev.startsWith('k') ? ev : ev;
      if (did[kind]) { rest.push(ev); continue; }
      did[kind] = true;
      if (ev === 'down') { this.down = true; this.pressed = true; this.downX = this.x; this.downY = this.y; this.downTime = performance.now(); }
      else if (ev === 'up') { if (this.down || this.pressed) this.released = true; this.down = false; }
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
