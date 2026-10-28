// Tweens + generator coroutines. Coroutines are the backbone of every cutscene:
//   co.start(function* () { yield 0.5; yield tw.to(cam, {x: 3}, 1).done; yield () => ready; });
import { ease as E } from './math.js';

export class Tweens {
  constructor() { this.list = []; }
  /** Tween numeric props of obj toward targets. Returns a handle with a .done promise. */
  to(obj, props, dur = 0.3, opts = {}) {
    const from = {};
    for (const k in props) from[k] = obj[k];
    let resolve;
    const done = new Promise((r) => (resolve = r));
    const tw = {
      obj, props, from, dur: Math.max(1e-4, dur), t: -(opts.delay || 0),
      ease: typeof opts.ease === 'string' ? E[opts.ease] : opts.ease || E.outCubic,
      onUpdate: opts.onUpdate, onDone: opts.onDone, resolve, done, killed: false,
      kill() { this.killed = true; this.resolve(); },
    };
    if (opts.unique !== false) {
      // kill tweens on the same object+props so new intent wins
      for (const o of this.list) if (o.obj === obj && Object.keys(o.props).some((k) => k in props)) o.killed = true;
    }
    this.list.push(tw);
    return tw;
  }
  /** Animate a plain value via callback: tw.value(0, 1, 0.5, v => ...) */
  value(a, b, dur, fn, opts = {}) {
    const o = { v: a };
    return this.to(o, { v: b }, dur, { ...opts, unique: false, onUpdate: () => fn(o.v) });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      if (tw.killed) { this.list.splice(i, 1); tw.resolve(); continue; }
      tw.t += dt;
      if (tw.t < 0) continue;
      // capture start values at the moment the tween actually begins (supports delays)
      if (!tw.started) { for (const k in tw.props) tw.from[k] = tw.obj[k]; tw.started = true; }
      const p = Math.min(1, tw.t / tw.dur);
      const e = tw.ease(p);
      for (const k in tw.props) tw.obj[k] = tw.from[k] + (tw.props[k] - tw.from[k]) * e;
      tw.onUpdate && tw.onUpdate(e);
      if (p >= 1) {
        this.list.splice(i, 1);
        tw.onDone && tw.onDone();
        tw.resolve();
      }
    }
  }
  clear() { for (const t of this.list) t.resolve(); this.list.length = 0; }
}

export class Coroutines {
  constructor() { this.list = []; }
  start(genFn, ...args) {
    const it = typeof genFn === 'function' ? genFn(...args) : genFn;
    let resolve;
    const handle = { stack: [it], wait: 0, cond: null, promiseDone: true, done: false, killed: false };
    handle.finished = new Promise((r) => (resolve = r));
    handle.resolve = resolve;
    handle.kill = () => { handle.killed = true; };
    this.list.push(handle);
    this._step(handle, 0);
    return handle;
  }
  _step(h, dt) {
    if (h.killed) { h.done = true; h.resolve(); return; }
    if (h.wait > 0) { h.wait -= dt; if (h.wait > 0) return; }
    if (h.cond && !h.cond()) return;
    h.cond = null;
    if (!h.promiseDone) return;
    // run until the routine yields something that waits
    for (let guard = 0; guard < 1000; guard++) {
      const top = h.stack[h.stack.length - 1];
      if (!top) { h.done = true; h.resolve(); return; }
      const r = top.next(h.sent);
      h.sent = undefined;
      if (r.done) { h.stack.pop(); h.sent = r.value; continue; }
      const v = r.value;
      if (v == null) return; // wait one frame
      if (typeof v === 'number') { h.wait = v; return; }
      if (typeof v === 'function') { if (!v()) { h.cond = v; return; } continue; }
      if (v && typeof v.next === 'function') { h.stack.push(v); continue; }
      if (v && v.done instanceof Promise) { this._await(h, v.done); return; }
      if (v && v.finished instanceof Promise) { this._await(h, v.finished); return; }
      if (v instanceof Promise) { this._await(h, v); return; }
      return;
    }
  }
  _await(h, p) {
    h.promiseDone = false;
    p.then((val) => { h.promiseDone = true; h.sent = val; });
  }
  update(dt) {
    for (let i = 0; i < this.list.length; i++) {
      const h = this.list[i];
      if (!h.done) this._step(h, dt);
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].done) this.list.splice(i, 1);
  }
  clear() { for (const h of this.list) { h.killed = true; h.resolve(); } this.list.length = 0; }
}
