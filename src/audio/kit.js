// Synthesis primitives shared by SFX, music and loops.
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Kit {
  constructor(ctx) {
    this.ctx = ctx;
    this.sr = ctx.sampleRate;
    // white noise (2s) + brown noise (2s), reused everywhere
    this.white = this._noiseBuf((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    this.brown = this._noiseBuf((d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    });
    this.ksCache = new Map();
    this.curves = new Map();
  }

  _noiseBuf(fill) {
    const b = this.ctx.createBuffer(1, Math.floor(this.sr * 2), this.sr);
    fill(b.getChannelData(0));
    return b;
  }

  curve(amount = 20) {
    let c = this.curves.get(amount);
    if (!c) {
      const n = 1024;
      c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x)); }
      this.curves.set(amount, c);
    }
    return c;
  }

  /** Karplus-Strong plucked string buffer (cached per frequency/brightness/duration). */
  ksBuffer(freq, bright = 0.5, dur = 1.6) {
    const key = Math.round(freq * 4) + '|' + Math.round(bright * 10) + '|' + Math.round(dur * 4);
    let b = this.ksCache.get(key);
    if (b) return b;
    const sr = this.sr;
    const len = Math.floor(sr * dur);
    b = this.ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const decay = 0.996 + bright * 0.0035;
    // initial excitation: filtered noise burst (brightness = less smoothing)
    let prev = 0;
    for (let i = 0; i < N && i < len; i++) {
      const w = Math.random() * 2 - 1;
      prev = prev + (w - prev) * (0.25 + bright * 0.7);
      d[i] = prev;
    }
    for (let i = N; i < len; i++) d[i] = 0.5 * (d[i - N] + d[i - N - 1 < 0 ? 0 : i - N - 1]) * decay;
    // de-click the tail
    const fadeN = Math.min(len, Math.floor(sr * 0.05));
    for (let i = 0; i < fadeN; i++) d[len - 1 - i] *= i / fadeN;
    if (this.ksCache.size > 160) this.ksCache.delete(this.ksCache.keys().next().value);
    this.ksCache.set(key, b);
    return b;
  }

  /** Schroeder-ish reverb from feedback comb delays with damping, spread across stereo. */
  makeReverb() {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const output = ctx.createGain();
    output.gain.value = 0.32;
    const pre = ctx.createDelay(0.2);
    pre.delayTime.value = 0.018;
    input.connect(pre);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 180;
    pre.connect(hp);
    const times = [0.0567, 0.0683, 0.0791, 0.0887, 0.1013, 0.1129];
    times.forEach((dt, i) => {
      const d = ctx.createDelay(0.5);
      d.delayTime.value = dt;
      const fb = ctx.createGain();
      fb.gain.value = 0.78 - i * 0.012;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass'; damp.frequency.value = 3200 - i * 220;
      hp.connect(d);
      d.connect(damp); damp.connect(fb); fb.connect(d);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = i % 2 ? 0.55 : -0.55;
        damp.connect(p); p.connect(output);
      } else damp.connect(output);
    });
    return { input, output };
  }

  /** Per-play builder: frequencies scale by pitch, times offset from t0. Tracks the end time. */
  voice(out, t0, pitch = 1) {
    const kit = this;
    const v = {
      p: pitch, t: t0, end: 0, out,
      _mark(t) { const e = t - t0; if (e > v.end) v.end = e; },
      tone(o) { kit.tone(out, { ...o, t: t0 + (o.t || 0), f: o.f * (o.raw ? 1 : pitch), f2: o.f2 && o.f2 * (o.raw ? 1 : pitch) }); v._mark(t0 + (o.t || 0) + o.dur); },
      noise(o) {
        const f = o.filter ? { ...o.filter, f: o.filter.f * (o.raw ? 1 : Math.sqrt(pitch)), f2: o.filter.f2 && o.filter.f2 * (o.raw ? 1 : Math.sqrt(pitch)) } : null;
        kit.noise(out, { ...o, t: t0 + (o.t || 0), filter: f }); v._mark(t0 + (o.t || 0) + o.dur);
      },
      fm(o) { kit.fm(out, { ...o, t: t0 + (o.t || 0), f: o.f * pitch, f2: o.f2 && o.f2 * pitch }); v._mark(t0 + (o.t || 0) + o.dur); },
      pluck(o) { kit.pluck(out, { ...o, t: t0 + (o.t || 0), f: o.f * pitch }); v._mark(t0 + (o.t || 0) + (o.dur || 1)); },
      kick(o = {}) { kit.kick(out, t0 + (o.t || 0), o.vol ?? 1, (o.f || 150) * pitch, o.dur || 0.35, o.end || 45); v._mark(t0 + (o.t || 0) + (o.dur || 0.35)); },
    };
    return v;
  }

  _env(g, t, a, peak, dur, hold = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, a));
    if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + hold + 0.01, dur));
  }

  _filter(src, o, t, dur) {
    if (!o) return src;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.Q.value = o.Q ?? 0.8;
    f.frequency.setValueAtTime(Math.max(20, o.f), t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.sweep ?? dur));
    src.connect(f);
    return f;
  }

  /**
   * Oscillator voice. o: type, f, f2 (sweep target), sweep, dur, a, vol, hold, detune, vib {rate, depth},
   * filter {type,f,f2,Q,sweep}, dist (waveshaper amount)
   */
  tone(dest, o) {
    const ctx = this.ctx, t = o.t;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.f), t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + (o.sweep ?? o.dur));
    if (o.detune) osc.detune.value = o.detune;
    let lfo = null;
    if (o.vib) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = o.vib.rate || 6;
      const lg = ctx.createGain();
      lg.gain.value = (o.vib.depth || 0.01) * o.f;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t); lfo.stop(t + o.dur + 0.05);
    }
    let node = osc;
    if (o.dist) {
      const ws = ctx.createWaveShaper();
      ws.curve = this.curve(o.dist);
      node.connect(ws); node = ws;
    }
    node = this._filter(node, o.filter, t, o.dur);
    const g = ctx.createGain();
    this._env(g, t, o.a ?? 0.004, o.vol ?? 0.3, o.dur, o.hold || 0);
    node.connect(g); g.connect(dest);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
    osc.onended = () => { try { g.disconnect(); } catch (e) { /* noop */ } };
  }

  /** Noise burst. o: dur, a, vol, hold, filter, brown, rate */
  noise(dest, o) {
    const ctx = this.ctx, t = o.t;
    const src = ctx.createBufferSource();
    src.buffer = o.brown ? this.brown : this.white;
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    let node = this._filter(src, o.filter, t, o.dur);
    if (o.filter2) node = this._filter(node, o.filter2, t, o.dur);
    const g = ctx.createGain();
    this._env(g, t, o.a ?? 0.002, o.vol ?? 0.3, o.dur, o.hold || 0);
    node.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
    src.onended = () => { try { g.disconnect(); } catch (e) { /* noop */ } };
  }

  /** FM bell / metal. o: f, ratio, index, dur, vol, a, type, f2, idxDecay */
  fm(dest, o) {
    const ctx = this.ctx, t = o.t;
    const car = ctx.createOscillator();
    car.type = o.type || 'sine';
    car.frequency.setValueAtTime(o.f, t);
    if (o.f2) car.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const mod = ctx.createOscillator();
    mod.frequency.setValueAtTime(o.f * (o.ratio ?? 3.5), t);
    if (o.f2) mod.frequency.exponentialRampToValueAtTime(o.f2 * (o.ratio ?? 3.5), t + o.dur);
    const mg = ctx.createGain();
    const idx = (o.index ?? 4) * o.f;
    mg.gain.setValueAtTime(idx, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.05), t + o.dur * (o.idxDecay ?? 0.5));
    mod.connect(mg); mg.connect(car.frequency);
    let node = this._filter(car, o.filter, t, o.dur);
    const g = ctx.createGain();
    this._env(g, t, o.a ?? 0.002, o.vol ?? 0.25, o.dur);
    node.connect(g); g.connect(dest);
    car.start(t); mod.start(t);
    car.stop(t + o.dur + 0.05); mod.stop(t + o.dur + 0.05);
    car.onended = () => { try { g.disconnect(); mg.disconnect(); } catch (e) { /* noop */ } };
  }

  /** Karplus-Strong pluck. o: f, dur, vol, bright, filter */
  pluck(dest, o) {
    const ctx = this.ctx, t = o.t;
    // render at a cached nearby pitch, fine-tune with playbackRate
    const base = Math.max(30, Math.min(4000, o.f));
    const src = ctx.createBufferSource();
    const dur = Math.min(3, o.dur || 1.5);
    src.buffer = this.ksBuffer(base, o.bright ?? 0.5, Math.max(0.5, Math.ceil(dur * 2) / 2));
    let node = this._filter(src, o.filter, t, dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol ?? 0.3, t);
    g.gain.setValueAtTime(o.vol ?? 0.3, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.05);
    src.onended = () => { try { g.disconnect(); } catch (e) { /* noop */ } };
  }

  kick(dest, t, vol = 1, f = 150, dur = 0.35, end = 45) {
    this.tone(dest, { t, type: 'sine', f, f2: end, sweep: dur * 0.45, dur, vol: 0.55 * vol, a: 0.002 });
    this.noise(dest, { t, dur: 0.025, vol: 0.12 * vol, filter: { type: 'lowpass', f: 2500 } });
  }
}
