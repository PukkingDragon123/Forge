// FORGLITE audio: everything synthesized with WebAudio (no files).
// SFX library, generative music tracks, ambient loops, rhythm metronome.
// Master chain: sfx/music buses → (feedback-delay reverb send) → compressor → limiter → out.
import { SFX } from './sfx.js';
import { TRACKS } from './music.js';
import { LOOPS } from './loops.js';
import { Kit } from './kit.js';

const LOOKAHEAD = 0.16;
const TICK_MS = 25;

export class Audio {
  constructor() {
    this.ctx = null;
    this.kit = null;
    this.vol = { master: 0.8, music: 0.6, sfx: 0.9 };
    this.wantTrack = null;
    this.cur = null; // active music track
    this.fading = []; // tracks fading out
    this.loops = new Set();
    this._timer = null;
    this._lastPlay = {};
  }

  /** Create/resume the AudioContext. Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this._build();
        this._timer = setInterval(() => this._tick(), TICK_MS);
        for (const l of this.loops) if (!l.started && !l.stopped) this._startLoop(l);
        if (this.wantTrack) { const t = this.wantTrack; this.wantTrack = null; this.music(t.name, t.opts); }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* audio unavailable */ }
  }

  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 10; this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.22;
    this.limit = ctx.createDynamicsCompressor();
    this.limit.threshold.value = -2.5; this.limit.knee.value = 0; this.limit.ratio.value = 20;
    this.limit.attack.value = 0.001; this.limit.release.value = 0.08;
    this.master.connect(this.comp); this.comp.connect(this.limit); this.limit.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.kit = new Kit(ctx);
    this.reverb = this.kit.makeReverb();
    this.reverb.output.connect(this.master);
    this.musicVerb = ctx.createGain();
    this.musicVerb.gain.value = 0.25;
    this.musicBus.connect(this.musicVerb);
    this.musicVerb.connect(this.reverb.input);
    this._applyVolumes();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05);
  }

  setVolumes(v = {}) {
    for (const k of ['master', 'music', 'sfx']) if (typeof v[k] === 'number') this.vol[k] = Math.max(0, Math.min(1, v[k]));
    this._applyVolumes();
  }

  time() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }

  // ---------------------------------------------------------------- SFX
  play(name, opts = {}) {
    if (!this.ctx) return;
    this.playAt(name, this.ctx.currentTime + 0.005, opts);
  }

  playAt(name, when, opts = {}) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    const def = SFX[name];
    if (!def) return;
    const ctx = this.ctx;
    // tiny debounce for spammy UI sounds
    const now = ctx.currentTime;
    if ((name === 'hover' || name === 'chips_tick' || name === 'mult_tick') && this._lastPlay[name] && now - this._lastPlay[name] < 0.018) return;
    this._lastPlay[name] = now;
    const t = Math.max(now, when ?? now);
    const out = ctx.createGain();
    out.gain.value = (opts.vol ?? 1) * (def.vol ?? 1);
    let node = out;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
      out.connect(pan);
      node = pan;
    }
    node.connect(this.sfxBus);
    let send = null;
    const wet = def.verb ?? 0.15;
    if (wet > 0) {
      send = ctx.createGain();
      send.gain.value = wet;
      node.connect(send);
      send.connect(this.reverb.input);
    }
    const s = this.kit.voice(out, t, opts.pitch ?? 1);
    let dur = 0.5;
    try { dur = def.fn(s) || s.end || 0.5; } catch (e) { dur = 0.5; }
    const life = Math.max(dur, s.end) + (t - now) + 0.3;
    setTimeout(() => { try { out.disconnect(); node.disconnect(); send && send.disconnect(); } catch (e) { /* noop */ } }, life * 1000);
  }

  // ---------------------------------------------------------------- music
  music(name, opts = {}) {
    const fade = opts.fade ?? 1.5;
    if (!this.ctx) { this.wantTrack = { name, opts }; return; }
    if (this.cur && this.cur.name === name && !this.cur.ended) return;
    const def = TRACKS[name];
    this._fadeOut(this.cur, fade);
    this.cur = null;
    if (!def) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(def.vol ?? 1, ctx.currentTime + Math.max(0.05, def.once ? 0.05 : fade));
    g.connect(this.musicBus);
    this.cur = {
      name, def, gain: g, step: 0, next: ctx.currentTime + 0.08, ended: false,
      seed: (Math.random() * 1e6) | 0, state: {},
    };
  }

  stopMusic(fade = 1.2) {
    this.wantTrack = null;
    this._fadeOut(this.cur, fade);
    this.cur = null;
  }

  _fadeOut(tr, fade) {
    if (!tr || !this.ctx) return;
    const t = this.ctx.currentTime;
    tr.gain.gain.cancelScheduledValues(t);
    tr.gain.gain.setValueAtTime(Math.max(0.0001, tr.gain.gain.value), t);
    tr.gain.gain.linearRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
    tr.ended = true;
    const g = tr.gain;
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* noop */ } }, (fade + 3) * 1000);
  }

  // ---------------------------------------------------------------- ambient loops
  loop(name, opts = {}) {
    const def = LOOPS[name];
    const handle = {
      name, def, opts, started: false, stopped: false, vol: opts.vol ?? 1, state: {},
      stop: (fade = 1) => this._stopLoop(handle, fade),
      setVol: (v) => {
        handle.vol = v;
        if (handle.gain && this.ctx) handle.gain.gain.setTargetAtTime(v * (def ? def.vol ?? 1 : 1), this.ctx.currentTime, 0.2);
      },
    };
    if (!def) { handle.stopped = true; return handle; }
    this.loops.add(handle);
    if (this.ctx) this._startLoop(handle);
    return handle;
  }

  _startLoop(h) {
    const ctx = this.ctx;
    h.started = true;
    h.gain = ctx.createGain();
    h.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    h.gain.gain.linearRampToValueAtTime(h.vol * (h.def.vol ?? 1), ctx.currentTime + (h.opts.fade ?? 1.2));
    h.gain.connect(this.sfxBus);
    h.send = ctx.createGain();
    h.send.gain.value = h.def.verb ?? 0.2;
    h.gain.connect(h.send);
    h.send.connect(this.reverb.input);
    h.next = ctx.currentTime + 0.05;
    h.sources = [];
    try { h.def.start && h.def.start(this.kit, h); } catch (e) { /* noop */ }
  }

  _stopLoop(h, fade) {
    if (h.stopped) return;
    h.stopped = true;
    this.loops.delete(h);
    if (!this.ctx || !h.started) return;
    const t = this.ctx.currentTime;
    h.gain.gain.cancelScheduledValues(t);
    h.gain.gain.setValueAtTime(Math.max(0.0001, h.gain.gain.value), t);
    h.gain.gain.linearRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
    setTimeout(() => {
      for (const s of h.sources) { try { s.stop(); } catch (e) { /* noop */ } }
      try { h.gain.disconnect(); h.send.disconnect(); } catch (e) { /* noop */ }
    }, (fade + 0.3) * 1000);
  }

  // ---------------------------------------------------------------- rhythm
  /** Schedule soft beat clicks; returns beat times (audio clock). */
  metronome(bpm, beats, startTime) {
    const spb = 60 / Math.max(20, bpm);
    const start = startTime ?? this.time() + 0.1;
    const times = [];
    for (let i = 0; i < beats; i++) times.push(start + i * spb);
    if (this.ctx) {
      times.forEach((tm, i) => this.playAt('_tick', tm, { vol: i % 4 === 0 ? 1 : 0.6, pitch: i % 4 === 0 ? 1.5 : 1 }));
    }
    return times;
  }

  // ---------------------------------------------------------------- scheduler
  _tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const until = now + LOOKAHEAD;
    const tr = this.cur;
    if (tr && !tr.ended) {
      if (tr.next < now - 0.25) tr.next = now + 0.05; // tab was throttled: resync instead of bursting
      const spStep = 60 / tr.def.bpm / 4;
      while (tr.next < until && !tr.ended) {
        try { tr.def.step(this.kit, tr, tr.step, tr.next, spStep); } catch (e) { /* keep going */ }
        tr.step++;
        tr.next += spStep;
        if (tr.def.once && tr.step >= tr.def.length) { tr.ended = true; }
      }
    }
    for (const h of this.loops) {
      if (!h.started || h.stopped || !h.def.tick) continue;
      if (h.next < now - 0.25) h.next = now + 0.02;
      while (h.next < until) {
        const dt = 0.05;
        try { h.def.tick(this.kit, h, h.next, dt); } catch (e) { /* noop */ }
        h.next += dt;
      }
    }
  }
}
