// Game: owns renderer, input, audio, UI and the scene stack. Handles transitions + time scale.
import { Renderer } from '../gfx/renderer.js';
import { Input } from './input.js';
import { UI } from '../ui/ui.js';
import { Tweens, Coroutines } from './tween.js';
import { save } from './save.js';
import { clamp } from './math.js';

export class Scene {
  constructor(game) {
    this.game = game;
    this.tw = new Tweens();
    this.co = new Coroutines();
    this.world = null; // { scene, camera, post }
    this.time = 0;
  }
  enter(params) {}
  exit() {}
  update(dt) {}
  draw(ui) {}
  /** Overlay scenes (pause, backpack) can ask the game to keep updating the scene below. */
  get isOverlay() { return false; }
}

/** Dispose three.js resources of an object tree (skips anything flagged userData.keep). */
export function disposeTree(root) {
  if (!root) return;
  root.traverse((o) => {
    if (o.userData && o.userData.keep) return;
    if (o.geometry && !o.geometry.userData?.keep) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData && m.userData.keep) continue;
      for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.userData?.keep) v.dispose(); }
      m.dispose();
    }
  });
}

const BAYER8 = (() => {
  const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22], [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]];
  return m;
})();

export class Game {
  constructor(stage, audio) {
    this.renderer = new Renderer(stage);
    this.input = new Input(stage, (x, y) => this.renderer.toVirtual(x, y));
    this.audio = audio;
    this.ui = new UI(this.renderer, this.input, audio);
    this.tw = new Tweens();
    this.co = new Coroutines();
    this.save = save;
    this.scenes = {};
    this.scene = null;
    this.overlays = [];
    this.trans = null;
    this.timeScale = 1;
    this.hitstop = 0;
    this.run = null;
    this.last = performance.now();
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;
    this.paused = false;
    stage.style.cursor = 'none';
    this.input.onFirstGesture = () => audio && audio.unlock();
  }
  register(name, cls) { this.scenes[name] = cls; }

  /** Switch scene with a pixel transition: 'dither' | 'fade' | 'iris' | 'none'. */
  go(name, params = {}, opts = {}) {
    const kind = opts.transition || 'dither';
    const make = () => {
      if (this.scene) { this.scene.exit(); this.scene.tw.clear(); this.scene.co.clear(); if (this.scene.world && !this.scene.keepWorld) disposeTree(this.scene.world.scene); }
      this.overlays = [];
      const Cls = this.scenes[name];
      if (!Cls) throw new Error('Unknown scene ' + name);
      this.scene = new Cls(this);
      this.scene.name = name;
      this.scene.enter(params);
    };
    if (kind === 'none' || !this.scene) { make(); return; }
    if (this.trans) return; // ignore double transitions
    this.trans = { kind, t: 0, dur: opts.dur || 0.45, phase: 'out', make, color: opts.color || '#07060b', cx: opts.cx, cy: opts.cy };
  }
  pushOverlay(name, params = {}) {
    const Cls = this.scenes[name];
    const o = new Cls(this);
    o.name = name;
    o.enter(params);
    this.overlays.push(o);
    return o;
  }
  popOverlay(o) {
    const i = o ? this.overlays.indexOf(o) : this.overlays.length - 1;
    if (i >= 0) { const [ov] = this.overlays.splice(i, 1); ov.exit(); }
  }
  hitStop(t) { this.hitstop = Math.max(this.hitstop, t); }

  start() {
    const loop = (now) => {
      requestAnimationFrame(loop);
      let rdt = (now - this.last) / 1000;
      this.last = now;
      rdt = clamp(rdt, 0, 1 / 20);
      this.frame(rdt);
    };
    requestAnimationFrame(loop);
  }

  frame(rdt) {
    this._fpsAcc += rdt; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
    this.input.poll();
    let dt = rdt * this.timeScale;
    if (this.hitstop > 0) { this.hitstop -= rdt; dt *= 0.04; }
    const ui = this.ui;
    ui.begin(rdt);
    this.tw.update(rdt);
    this.co.update(rdt);
    const top = this.overlays[this.overlays.length - 1];
    if (this.scene) {
      const frozen = top && top.freezesBelow;
      if (!frozen) {
        this.scene.time += dt;
        this.scene.tw.update(dt);
        this.scene.co.update(dt);
        this.scene.update(dt, rdt);
      }
    }
    for (const o of this.overlays) { o.time += rdt; o.tw.update(rdt); o.co.update(rdt); o.update(rdt, rdt); }
    // render 3D (the top-most overlay with a world wins, otherwise the scene)
    let world = this.scene && this.scene.world;
    for (const o of this.overlays) if (o.world) world = o.world;
    this.renderer.render(world, dt);
    // UI: scene first, then overlays (overlays block input below by registering later)
    if (this.scene) this.scene.draw(ui);
    for (const o of this.overlays) { ui.block(2); o.draw(ui); }
    ui.unblock();
    this._drawTransition(rdt);
    ui.end(rdt);
    this.input.endFrame();
  }

  _drawTransition(dt) {
    const tr = this.trans;
    if (!tr) return;
    tr.t += dt;
    let k = clamp(tr.t / tr.dur, 0, 1);
    if (tr.phase === 'out' && k >= 1) {
      tr.make();
      tr.phase = 'hold'; tr.t = 0; tr.dur = 0.06;
      k = 1;
    } else if (tr.phase === 'hold' && k >= 1) {
      tr.phase = 'in'; tr.t = 0; tr.dur = 0.5; k = 0;
    } else if (tr.phase === 'in' && k >= 1) {
      this.trans = null;
      return;
    }
    const cover = tr.phase === 'out' ? k : tr.phase === 'hold' ? 1 : 1 - k;
    const ctx = this.ui.ctx, W = this.ui.w, H = this.ui.h;
    ctx.fillStyle = tr.color;
    if (tr.kind === 'fade') {
      ctx.globalAlpha = cover; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    } else if (tr.kind === 'iris') {
      const cx = tr.cx ?? W / 2, cy = tr.cy ?? H / 2;
      const R = Math.hypot(W, H) * (1 - cover);
      const step = 3; // chunky pixel circle
      for (let y = 0; y < H; y += step) {
        const dy = y + step / 2 - cy;
        const span = R * R - dy * dy;
        if (span <= 0) { ctx.fillRect(0, y, W, step); continue; }
        const hw = Math.sqrt(span);
        const x0 = Math.floor((cx - hw) / step) * step, x1 = Math.ceil((cx + hw) / step) * step;
        if (x0 > 0) ctx.fillRect(0, y, x0, step);
        if (x1 < W) ctx.fillRect(x1, y, W - x1, step);
      }
    } else {
      // dither dissolve with chunky 4px cells + a sweeping bias so it feels directional
      const cell = 4;
      for (let y = 0; y < H; y += cell) {
        for (let x = 0; x < W; x += cell) {
          const b = BAYER8[(y / cell) & 7][(x / cell) & 7] / 64;
          const sweep = (x / W) * 0.35;
          const v = b * 0.65 + sweep;
          if (cover * 1.0 > v) ctx.fillRect(x, y, cell, cell);
        }
      }
    }
  }
}
