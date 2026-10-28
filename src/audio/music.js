// Generative music: fixed chord progressions + seeded patterns that evolve every couple of loops.
// Each track is interpreted one 16th-note step at a time by the scheduler in audio.js.
import { mtof } from './kit.js';

// ---------------------------------------------------------------- helpers
function h(a, b = 0, c = 0, d = 0) {
  let x = (a * 374761393 + b * 668265263 + c * 1440662683 + d * 2246822519) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}
const C = (root, ...iv) => [root, ...iv.map((i) => root + i)];
const LP = (f, f2, Q) => ({ type: 'lowpass', f, f2, Q });

// ---------------------------------------------------------------- instruments
const INST = {
  pluck(k, d, t, m, dur, vol, o) { k.pluck(d, { t, f: mtof(m), dur: Math.min(dur, 2.5), vol, bright: o.bright ?? 0.5, filter: o.cut ? LP(o.cut) : null }); },
  bell(k, d, t, m, dur, vol, o) { k.fm(d, { t, f: mtof(m), ratio: o.ratio ?? 3.5, index: o.index ?? 1.6, dur: Math.max(0.4, dur), vol, idxDecay: 0.25 }); },
  marimba(k, d, t, m, dur, vol) {
    k.fm(d, { t, f: mtof(m), ratio: 4.0, index: 1.4, dur: 0.45, vol: vol * 0.7, idxDecay: 0.08 });
    k.tone(d, { t, f: mtof(m), dur: 0.5, vol: vol * 0.6 });
  },
  pad(k, d, t, m, dur, vol, o) {
    const f = mtof(m);
    for (const det of [-7, 6]) k.tone(d, { t, type: o.wave || 'sawtooth', f, detune: det, dur, a: o.attack ?? Math.min(1.2, dur * 0.3), hold: Math.max(0, dur * 0.45), vol: vol * 0.5, filter: LP(o.cut ?? 900, null, 0.7) });
  },
  glass(k, d, t, m, dur, vol, o) {
    const f = mtof(m);
    k.tone(d, { t, type: 'sine', f, dur, a: dur * 0.3, hold: dur * 0.4, vol: vol * 0.6, vib: { rate: 4.5, depth: 0.003 } });
    k.tone(d, { t, type: 'triangle', f: f * 2, detune: 5, dur, a: dur * 0.35, hold: dur * 0.3, vol: vol * 0.25, filter: LP(o.cut ?? 2600) });
  },
  bass(k, d, t, m, dur, vol) {
    const f = mtof(m);
    k.tone(d, { t, type: 'triangle', f, dur: Math.min(dur, 1.6), a: 0.008, vol: vol * 0.8 });
    k.tone(d, { t, type: 'sine', f: f / 2, dur: Math.min(dur, 1.6), a: 0.01, vol: vol * 0.5 });
  },
  sub(k, d, t, m, dur, vol) { k.tone(d, { t, type: 'sine', f: mtof(m), dur, a: 0.05, hold: dur * 0.5, vol }); },
  distbass(k, d, t, m, dur, vol, o) {
    k.tone(d, { t, type: 'sawtooth', f: mtof(m), dur: Math.min(dur, 0.9), a: 0.005, vol: vol * 0.55, dist: 6, filter: LP(o.cut ?? 900, (o.cut ?? 900) * 0.5, 2) });
    k.tone(d, { t, type: 'sine', f: mtof(m) / 2, dur: Math.min(dur, 0.9), a: 0.005, vol: vol * 0.5 });
  },
  lead(k, d, t, m, dur, vol, o) { k.tone(d, { t, type: o.wave || 'square', f: mtof(m), dur, a: 0.02, hold: dur * 0.5, vol: vol * 0.45, vib: { rate: 5.5, depth: 0.006 }, filter: LP(o.cut ?? 2200) }); },
  whistle(k, d, t, m, dur, vol) { k.tone(d, { t, type: 'sine', f: mtof(m), dur, a: 0.04, hold: dur * 0.5, vol, vib: { rate: 5.2, depth: 0.008 } }); },
  brass(k, d, t, m, dur, vol, o) { k.tone(d, { t, type: 'sawtooth', f: mtof(m), dur, a: 0.02, hold: dur * 0.3, vol: vol * 0.5, filter: LP(o.cut ?? 2400, 600, 1.2) }); },
  choir(k, d, t, m, dur, vol) {
    const ctx = k.ctx;
    const f = mtof(m);
    const g = ctx.createGain();
    k._env(g, t, Math.min(1.5, dur * 0.35), vol, dur, dur * 0.35);
    g.connect(d);
    const oscs = [];
    for (const det of [-9, 0, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      oscs.push(o);
      for (const [ff, q, gv] of [[720, 6, 0.6], [1150, 8, 0.35], [2500, 10, 0.12]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q;
        const gg = ctx.createGain(); gg.gain.value = gv * 0.4;
        o.connect(bp); bp.connect(gg); gg.connect(g);
      }
      o.start(t); o.stop(t + dur + 0.1);
    }
    oscs[0].onended = () => { try { g.disconnect(); } catch (e) { /* noop */ } };
  },
  drone(k, d, t, m, dur, vol, o) {
    k.tone(d, { t, type: o.wave || 'sawtooth', f: mtof(m), dur, a: dur * 0.3, hold: dur * 0.4, vol: vol * 0.5, filter: LP(o.cut ?? 320, null, 1), vib: { rate: 0.3, depth: 0.004 } });
    k.tone(d, { t, type: 'sine', f: mtof(m) / 2, dur, a: dur * 0.3, hold: dur * 0.4, vol: vol * 0.5 });
  },
  bubble(k, d, t, m, dur, vol) { k.tone(d, { t, f: mtof(m), f2: mtof(m + 12), sweep: 0.08, dur: 0.12, vol }); },
};

const DRUM = {
  kick: (k, d, t, v) => k.kick(d, t, v, 140, 0.32, 45),
  softkick: (k, d, t, v) => k.kick(d, t, v * 0.6, 110, 0.3, 40),
  heart: (k, d, t, v) => { k.kick(d, t, v * 0.7, 80, 0.3, 35); },
  snare: (k, d, t, v) => {
    k.noise(d, { t, dur: 0.16, vol: 0.22 * v, filter: { type: 'bandpass', f: 1900, Q: 0.7 } });
    k.tone(d, { t, type: 'triangle', f: 200, f2: 150, dur: 0.09, vol: 0.15 * v });
  },
  brush: (k, d, t, v) => k.noise(d, { t, dur: 0.14, a: 0.02, vol: 0.08 * v, filter: { type: 'bandpass', f: 3000, Q: 0.6 } }),
  hat: (k, d, t, v) => k.noise(d, { t, dur: 0.04, vol: 0.07 * v, filter: { type: 'highpass', f: 7000 } }),
  ohat: (k, d, t, v) => k.noise(d, { t, dur: 0.2, vol: 0.06 * v, filter: { type: 'highpass', f: 6500 } }),
  shaker: (k, d, t, v) => k.noise(d, { t, dur: 0.07, a: 0.025, vol: 0.05 * v, filter: { type: 'highpass', f: 5000 } }),
  tom: (k, d, t, v) => k.tone(d, { t, f: 130, f2: 70, sweep: 0.2, dur: 0.28, vol: 0.35 * v }),
  lowtom: (k, d, t, v) => k.tone(d, { t, f: 90, f2: 50, sweep: 0.25, dur: 0.35, vol: 0.4 * v }),
  tak: (k, d, t, v) => k.noise(d, { t, dur: 0.035, vol: 0.12 * v, filter: { type: 'bandpass', f: 2600, Q: 3 } }),
  anvil: (k, d, t, v) => k.fm(d, { t, f: 1180, ratio: 3.52, index: 3, dur: 0.45, vol: 0.07 * v, idxDecay: 0.15 }),
  tink: (k, d, t, v) => k.fm(d, { t, f: 2400, ratio: 2.76, index: 2, dur: 0.15, vol: 0.04 * v }),
  clap: (k, d, t, v) => { for (let i = 0; i < 3; i++) k.noise(d, { t: t + i * 0.012, dur: 0.06, vol: 0.12 * v, filter: { type: 'bandpass', f: 1500, Q: 1 } }); },
  chain: (k, d, t, v) => { for (let i = 0; i < 3; i++) k.fm(d, { t: t + i * 0.03, f: 900 + i * 230, ratio: 1.9, index: 2, dur: 0.08, vol: 0.03 * v }); },
};

// ---------------------------------------------------------------- generic interpreter
function run(def, k, tr, i, t, sp) {
  const d = tr.gain;
  const s = i % 16;
  const bar = Math.floor(i / 16);
  const bpc = def.bpc || 1;
  const totalBars = def.chords.length * bpc;
  const loopN = Math.floor(bar / totalBars);
  const ci = Math.floor(bar / bpc) % def.chords.length;
  const chord = def.chords[ci];
  const chordStart = s === 0 && bar % bpc === 0;
  const phrase = Math.floor(loopN / 2);
  const seed = tr.seed;
  let tt = t;
  if (def.swing && s % 4 === 2) tt += def.swing * sp;
  const chordDur = bpc * 16 * sp;
  def.layers.forEach((L, li) => {
    if ((L.from || 0) > loopN) return;
    if (L.every && loopN % L.every !== L.everyOn) return;
    const st = tr.state[li] || (tr.state[li] = { n: 0, deg: L.start ?? 0 });
    const vol = L.vol;
    switch (L.kind) {
      case 'pad': {
        if (!chordStart) return;
        const notes = L.top ? chord.slice(-L.top) : chord;
        for (const m of notes) INST[L.inst](k, d, tt, m + (L.oct || 0), chordDur + (L.overlap ?? 0.4), vol / Math.sqrt(notes.length), L);
        return;
      }
      case 'drone': {
        if (!chordStart) return;
        INST[L.inst || 'drone'](k, d, tt, (L.fixed ?? chord[0]) + (L.oct || 0), chordDur + 0.6, vol, L);
        return;
      }
      case 'arp': {
        const c = L.pat[s % L.pat.length];
        if (c === '.') return;
        const tones = [];
        for (let o = 0; o < (L.span || 1); o++) for (const m of chord) tones.push(m + 12 * o + (L.oct || 0));
        let idx;
        if (L.order === 'random') idx = Math.floor(h(seed, phrase, bar % totalBars, s) * tones.length);
        else if (L.order === 'updown') { const n = tones.length * 2 - 2; const p = st.n % Math.max(1, n); idx = p < tones.length ? p : n - p; }
        else idx = st.n % tones.length;
        st.n++;
        const accent = c === 'X' ? 1.3 : 1;
        INST[L.inst](k, d, tt, tones[idx], L.dur ?? 1.0, vol * accent * (0.85 + 0.3 * h(seed, i, li)), L);
        return;
      }
      case 'bass': {
        const c = L.pat[s % L.pat.length];
        if (c === '.') return;
        const off = { x: 0, X: 0, o: 12, 5: 7, 3: chord[1] - chord[0], 7: (chord[3] ?? chord[0] + 10) - chord[0] }[c] ?? 0;
        INST[L.inst || 'bass'](k, d, tt, chord[0] + off + (L.oct || 0), L.dur ?? sp * 3, vol * (c === 'X' ? 1.25 : 1), L);
        return;
      }
      case 'drum': {
        const isFill = L.fill && bar % totalBars === totalBars - 1;
        const pat = isFill ? L.fill : L.pat;
        const c = pat[s % pat.length];
        if (c === '.') return;
        if (c === '?' && h(seed, i, li, 7) > 0.5) return;
        DRUM[L.inst](k, d, tt, vol * (c === 'X' ? 1.35 : 1) * (0.9 + 0.2 * h(seed, i, li)));
        return;
      }
      case 'stab': {
        const c = L.pat[s % L.pat.length];
        if (c === '.') return;
        for (const m of chord) INST[L.inst || 'brass'](k, d, tt, m + (L.oct || 0), L.dur ?? 0.25, vol / Math.sqrt(chord.length), L);
        return;
      }
      case 'lead': {
        const grid = L.grid || 2;
        if (bar % totalBars === 0 && s === 0) st.deg = L.start ?? 0;
        if (s % grid !== 0) return;
        const r1 = h(seed + 11, phrase, (bar % totalBars) * 16 + s, li);
        const dens = s % 8 === 0 ? L.density * 1.4 : L.density;
        if (r1 > dens) return;
        const r2 = h(seed + 23, phrase, (bar % totalBars) * 16 + s, li);
        const stepDeg = Math.round((r2 - 0.5) * 4.4);
        st.deg = Math.max(-3, Math.min(L.range ?? 9, st.deg + stepDeg));
        const scale = def.scale;
        const n = scale.length;
        const oct = Math.floor(st.deg / n);
        let m = def.key + scale[((st.deg % n) + n) % n] + 12 * oct + (L.oct || 0);
        if (s % 8 === 0) {
          // snap strong beats to the nearest chord tone
          let best = m, bd = 99;
          for (const cm of chord) for (let o = -2; o <= 3; o++) { const cand = cm + 12 * o; const dd = Math.abs(cand - m); if (dd < bd) { bd = dd; best = cand; } }
          m = best;
        }
        const len = grid * sp * (1 + Math.floor(h(seed + 5, phrase, i % 64, li) * 3));
        INST[L.inst](k, d, tt, m, Math.max(0.12, len * 1.1), vol, L);
        return;
      }
      case 'sparkle': {
        const grid = L.grid || 2;
        if (s % grid !== 0) return;
        if (h(seed + 31, i, li) > L.density) return;
        const m = chord[Math.floor(h(seed + 41, i, li) * chord.length)] + (L.oct || 24);
        INST[L.inst || 'bell'](k, d, tt, m, L.dur ?? 1.2, vol, L);
        return;
      }
      case 'fx': {
        if (s % (L.grid || 4) !== 0) return;
        if (h(seed + 51, i, li) > L.density) return;
        INST[L.inst](k, d, tt, chord[0] + (L.oct || 24) + Math.floor(h(seed, i, 61) * 12), L.dur ?? 0.2, vol, L);
        return;
      }
      default: return;
    }
  });
}

// ---------------------------------------------------------------- tracks
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTA = [0, 2, 4, 7, 9];
const MPENTA = [0, 3, 5, 7, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const HIJAZ = [0, 1, 4, 5, 7, 8, 10];

const DEFS = {
  campfire: {
    bpm: 76, vol: 0.9, bpc: 1, swing: 0.18, key: 62, scale: PENTA,
    chords: [C(50, 4, 7, 11), C(47, 3, 7, 10), C(43, 4, 7, 11), C(45, 4, 7, 9)],
    layers: [
      { kind: 'arp', inst: 'pluck', pat: 'x.x.x.x.x.x.x.x.', order: 'updown', oct: 12, span: 2, dur: 1.4, vol: 0.16, bright: 0.45 },
      { kind: 'bass', inst: 'pluck', pat: 'x.......5.......', oct: -12, dur: 2, vol: 0.2, bright: 0.3 },
      { kind: 'pad', inst: 'pad', oct: 12, vol: 0.05, wave: 'triangle', cut: 800, from: 1 },
      { kind: 'lead', inst: 'pluck', density: 0.28, grid: 2, oct: 12, vol: 0.12, bright: 0.7, from: 1 },
      { kind: 'drum', inst: 'brush', pat: '....x.......x...', vol: 0.4, from: 2 },
    ],
  },
  map: {
    bpm: 66, vol: 0.85, bpc: 2, key: 57, scale: MINOR,
    chords: [C(45, 3, 7, 10), C(41, 4, 7, 11), C(48, 4, 7), C(43, 4, 7, 9)],
    layers: [
      { kind: 'pad', inst: 'pad', oct: 12, vol: 0.06, cut: 700 },
      { kind: 'bass', inst: 'sub', pat: 'x...............', oct: -12, dur: 3, vol: 0.18 },
      { kind: 'sparkle', inst: 'bell', density: 0.12, grid: 2, oct: 24, vol: 0.06, ratio: 3.5 },
      { kind: 'lead', inst: 'whistle', density: 0.12, grid: 4, oct: 12, vol: 0.05, from: 1 },
      { kind: 'drum', inst: 'heart', pat: 'x.......x.......', vol: 0.25, from: 1 },
    ],
  },
  mine: {
    bpm: 88, vol: 0.85, bpc: 1, key: 62, scale: DORIAN,
    chords: [C(50, 3, 7, 10), C(48, 4, 7), C(50, 3, 7, 10), C(45, 3, 7)],
    layers: [
      { kind: 'arp', inst: 'pluck', pat: 'x..x..x.x..x..x.', order: 'random', oct: 12, span: 2, dur: 1.0, vol: 0.13, bright: 0.6 },
      { kind: 'bass', inst: 'bass', pat: 'x.....x.x.......', oct: -12, vol: 0.2 },
      { kind: 'drum', inst: 'softkick', pat: 'x.......x.......', vol: 0.6 },
      { kind: 'drum', inst: 'shaker', pat: '..x...x...x...x.', vol: 0.7 },
      { kind: 'drum', inst: 'tink', pat: '............?...', vol: 0.8 },
      { kind: 'pad', inst: 'pad', oct: 0, vol: 0.035, cut: 600, from: 1 },
      { kind: 'lead', inst: 'whistle', density: 0.2, grid: 2, oct: 12, vol: 0.06, from: 2 },
    ],
  },
  crystal: {
    bpm: 70, vol: 0.85, bpc: 2, key: 65, scale: LYDIAN,
    chords: [C(41, 4, 7, 11), C(43, 4, 7, 14), C(40, 3, 7, 10), C(45, 3, 7, 10)],
    layers: [
      { kind: 'arp', inst: 'bell', pat: 'x.x.x.x.x.x.x.x.', order: 'random', oct: 24, span: 2, dur: 1.3, vol: 0.06, ratio: 3.5, index: 1.4 },
      { kind: 'pad', inst: 'glass', oct: 12, vol: 0.07, cut: 2200 },
      { kind: 'bass', inst: 'sub', pat: 'x...............', oct: -12, dur: 3, vol: 0.16 },
      { kind: 'sparkle', inst: 'bell', density: 0.08, grid: 1, oct: 36, vol: 0.03, ratio: 2.01, from: 1 },
      { kind: 'lead', inst: 'whistle', density: 0.14, grid: 4, oct: 12, vol: 0.05, from: 2 },
    ],
  },
  spore: {
    bpm: 72, vol: 0.85, bpc: 1, swing: 0.12, key: 52, scale: [0, 2, 3, 6, 7, 9, 10],
    chords: [C(40, 3, 7, 14), C(36, 4, 6, 11), C(45, 3, 7, 10), C(47, 5, 7, 10)],
    layers: [
      { kind: 'arp', inst: 'marimba', pat: 'x..x.x..x..x.x..', order: 'updown', oct: 12, span: 2, vol: 0.13 },
      { kind: 'bass', inst: 'bass', pat: 'x.....x.........', oct: -12, vol: 0.18 },
      { kind: 'pad', inst: 'pad', oct: 12, vol: 0.04, wave: 'triangle', cut: 900 },
      { kind: 'fx', inst: 'bubble', density: 0.25, grid: 2, oct: 24, vol: 0.05 },
      { kind: 'drum', inst: 'tak', pat: '....x.......x..?', vol: 0.6, from: 1 },
      { kind: 'lead', inst: 'pluck', density: 0.18, grid: 2, oct: 12, vol: 0.08, bright: 0.3, from: 2 },
    ],
  },
  ruins: {
    bpm: 76, vol: 0.85, bpc: 1, key: 52, scale: HIJAZ,
    chords: [C(40, 4, 7), C(41, 4, 7), C(40, 4, 7), C(38, 3, 7)],
    layers: [
      { kind: 'drone', inst: 'drone', fixed: 40, oct: -12, vol: 0.12, cut: 400 },
      { kind: 'arp', inst: 'pluck', pat: 'x.xx..x.x.xx..x.', order: 'random', oct: 12, span: 2, dur: 0.9, vol: 0.12, bright: 0.85 },
      { kind: 'drum', inst: 'lowtom', pat: 'x.....x...x.....', vol: 0.55 },
      { kind: 'drum', inst: 'tak', pat: '...x.......x..x.', vol: 0.6 },
      { kind: 'lead', inst: 'pluck', density: 0.3, grid: 1, oct: 24, vol: 0.08, bright: 0.9, from: 1 },
    ],
  },
  volcano: {
    bpm: 92, vol: 0.85, bpc: 1, key: 48, scale: [0, 2, 3, 5, 7, 8, 11],
    chords: [C(36, 3, 7), C(44, 4, 7), C(46, 4, 7), C(43, 4, 7)],
    layers: [
      { kind: 'drone', inst: 'drone', fixed: 36, oct: -12, vol: 0.12, cut: 260 },
      { kind: 'bass', inst: 'distbass', pat: 'x..x..x.x..x..x.', oct: -12, vol: 0.13, cut: 700 },
      { kind: 'drum', inst: 'lowtom', pat: 'x...x...x..x.x..', vol: 0.5, fill: 'x.x.x.x.xxxxXXXX' },
      { kind: 'drum', inst: 'kick', pat: 'x.......x.......', vol: 0.5 },
      { kind: 'stab', inst: 'brass', pat: 'x...............', oct: 12, vol: 0.07, dur: 0.6, from: 1 },
      { kind: 'pad', inst: 'choir', oct: 12, vol: 0.035, from: 2 },
    ],
  },
  tomb: {
    bpm: 58, vol: 1.15, bpc: 2, key: 58, scale: MINOR,
    chords: [C(46, 3, 7), C(42, 4, 7), C(39, 3, 7), C(41, 4, 7)],
    layers: [
      { kind: 'pad', inst: 'choir', oct: 12, vol: 0.05 },
      { kind: 'drone', inst: 'drone', oct: -12, vol: 0.1, cut: 300 },
      { kind: 'drum', inst: 'heart', pat: 'x..x............', vol: 0.45 },
      { kind: 'sparkle', inst: 'bell', density: 0.1, grid: 4, oct: 12, vol: 0.06, ratio: 1.41, index: 2.5 },
      { kind: 'drum', inst: 'chain', pat: '..........?.....', vol: 0.6, from: 1 },
      { kind: 'lead', inst: 'whistle', density: 0.1, grid: 4, oct: 12, vol: 0.04, from: 2 },
    ],
  },
  combat: {
    bpm: 132, vol: 0.8, bpc: 1, key: 57, scale: MINOR,
    chords: [C(45, 3, 7), C(41, 4, 7), C(43, 4, 7), C(40, 4, 7)],
    layers: [
      { kind: 'drum', inst: 'kick', pat: 'x...x...x...x.x.', vol: 0.7 },
      { kind: 'drum', inst: 'snare', pat: '....x.......x...', vol: 0.75, fill: '....x.......x.xx' },
      { kind: 'drum', inst: 'hat', pat: 'x.x.x.x.x.x.x.x.', vol: 0.8 },
      { kind: 'bass', inst: 'distbass', pat: 'x.xx.xx.x.xx.xx.', oct: -12, vol: 0.11, cut: 1100 },
      { kind: 'arp', inst: 'pluck', pat: 'xxxxxxxxxxxxxxxx', order: 'updown', oct: 12, span: 2, dur: 0.4, vol: 0.06, bright: 0.8 },
      { kind: 'lead', inst: 'lead', density: 0.35, grid: 2, oct: 12, vol: 0.06, from: 1 },
      { kind: 'stab', inst: 'brass', pat: 'x...............', oct: 12, vol: 0.05, dur: 0.5, from: 1 },
    ],
  },
  boss: {
    bpm: 140, vol: 0.8, bpc: 1, key: 50, scale: [0, 2, 3, 5, 7, 8, 11],
    chords: [C(38, 3, 7), C(46, 4, 7), C(48, 4, 7), C(45, 4, 7)],
    layers: [
      { kind: 'drum', inst: 'kick', pat: 'x..x..x.x..x..x.', vol: 0.8 },
      { kind: 'drum', inst: 'snare', pat: '....x.......x..x', vol: 0.8, fill: '....x...x.x.xxxx' },
      { kind: 'drum', inst: 'hat', pat: 'xxxxxxxxxxxxxxxx', vol: 0.5 },
      { kind: 'bass', inst: 'distbass', pat: 'xx5xxo5xxx5xxo5x', oct: -12, vol: 0.1, cut: 1300 },
      { kind: 'stab', inst: 'brass', pat: 'x..x..x.........', oct: 12, vol: 0.06, dur: 0.22 },
      { kind: 'pad', inst: 'choir', oct: 12, vol: 0.04, from: 1 },
      { kind: 'lead', inst: 'lead', wave: 'sawtooth', density: 0.3, grid: 2, oct: 12, vol: 0.05, from: 1 },
    ],
  },
  finalboss: {
    bpm: 150, vol: 0.8, bpc: 1, key: 51, scale: MINOR,
    chords: [C(39, 3, 7), C(47, 4, 7), C(49, 4, 7), C(46, 3, 7)],
    layers: [
      { kind: 'drum', inst: 'kick', pat: 'x.xx..x.x.xx..x.', vol: 0.85 },
      { kind: 'drum', inst: 'snare', pat: '....x.......x...', vol: 0.85, fill: 'x.x.x.x.xxxxXXXX' },
      { kind: 'drum', inst: 'hat', pat: 'xxxxxxxxxxxxxxxx', vol: 0.55 },
      { kind: 'drum', inst: 'anvil', pat: '......x.......x.', vol: 0.6 },
      { kind: 'bass', inst: 'distbass', pat: 'xxxxxxxxxxxxxxxx', oct: -12, vol: 0.09, cut: 1500 },
      { kind: 'pad', inst: 'choir', oct: 12, vol: 0.06 },
      { kind: 'sparkle', inst: 'bell', density: 0.25, grid: 2, oct: 24, vol: 0.04, ratio: 1.41, index: 3 },
      { kind: 'lead', inst: 'lead', wave: 'sawtooth', density: 0.4, grid: 2, oct: 12, vol: 0.05, from: 1 },
    ],
  },
  shop: {
    bpm: 112, vol: 0.85, bpc: 1, swing: 0.22, key: 60, scale: PENTA,
    chords: [C(48, 4, 7), C(45, 3, 7), C(41, 4, 7), C(43, 4, 7, 10)],
    layers: [
      { kind: 'bass', inst: 'bass', pat: 'x...5...x...5...', oct: -12, vol: 0.18 },
      { kind: 'stab', inst: 'pluck', pat: '....x.......x...', oct: 12, vol: 0.12, dur: 0.4, bright: 0.6 },
      { kind: 'drum', inst: 'softkick', pat: 'x.......x.......', vol: 0.5 },
      { kind: 'drum', inst: 'brush', pat: '....x.......x...', vol: 0.6 },
      { kind: 'drum', inst: 'shaker', pat: 'x.x.x.x.x.x.x.x.', vol: 0.4 },
      { kind: 'lead', inst: 'whistle', density: 0.42, grid: 2, oct: 12, vol: 0.07 },
      { kind: 'sparkle', inst: 'marimba', density: 0.1, grid: 2, oct: 24, vol: 0.05, from: 1 },
    ],
  },
  forge: {
    bpm: 108, vol: 0.8, bpc: 1, key: 52, scale: MINOR,
    chords: [C(40, 3, 7), C(36, 4, 7), C(38, 4, 7), C(47, 4, 7)],
    layers: [
      { kind: 'drum', inst: 'kick', pat: 'x.......x.x.....', vol: 0.65 },
      { kind: 'drum', inst: 'anvil', pat: '....x.......x...', vol: 0.9 },
      { kind: 'drum', inst: 'hat', pat: '..x...x...x...x.', vol: 0.6 },
      { kind: 'drum', inst: 'tink', pat: '.............?.?', vol: 0.8 },
      { kind: 'bass', inst: 'distbass', pat: 'x..x...x..x.x...', oct: -12, vol: 0.12, cut: 900 },
      { kind: 'pad', inst: 'pad', oct: 12, vol: 0.035, cut: 700 },
      { kind: 'lead', inst: 'lead', density: 0.18, grid: 2, oct: 12, vol: 0.04, from: 1 },
    ],
  },
  defeat: {
    bpm: 56, vol: 1.8, bpc: 2, key: 57, scale: MINOR,
    chords: [C(45, 3, 7), C(38, 3, 7), C(40, 4, 7), C(45, 3, 7)],
    layers: [
      { kind: 'pad', inst: 'pad', oct: 12, vol: 0.05, wave: 'triangle', cut: 700 },
      { kind: 'sparkle', inst: 'bell', density: 0.08, grid: 4, oct: 12, vol: 0.05, ratio: 2.01, index: 1 },
      { kind: 'arp', inst: 'pluck', pat: 'x.......x.......', order: 'up', oct: 12, dur: 2, vol: 0.08, bright: 0.2, from: 1 },
    ],
  },
  ending: {
    bpm: 82, vol: 0.9, bpc: 1, swing: 0.12, key: 62, scale: MAJOR,
    chords: [C(50, 4, 7, 11), C(45, 4, 7), C(47, 3, 7, 10), C(43, 4, 7, 11)],
    layers: [
      { kind: 'arp', inst: 'pluck', pat: 'x.x.x.x.x.x.x.x.', order: 'updown', oct: 12, span: 2, dur: 1.3, vol: 0.14, bright: 0.5 },
      { kind: 'bass', inst: 'bass', pat: 'x.......x...5...', oct: -12, vol: 0.16 },
      { kind: 'pad', inst: 'glass', oct: 12, vol: 0.05 },
      { kind: 'lead', inst: 'whistle', density: 0.3, grid: 2, oct: 12, vol: 0.07, from: 1 },
      { kind: 'drum', inst: 'brush', pat: '....x.......x...', vol: 0.5, from: 1 },
      { kind: 'drum', inst: 'softkick', pat: 'x.......x.......', vol: 0.4, from: 2 },
      { kind: 'sparkle', inst: 'bell', density: 0.08, grid: 2, oct: 24, vol: 0.04, from: 2 },
    ],
  },
};

// victory: a short fanfare (non-looping)
const victory = {
  bpm: 120, vol: 0.95, once: true, length: 40,
  step(k, tr, i, t, sp) {
    const d = tr.gain;
    const notes = { 0: 60, 2: 64, 4: 67, 6: 72 };
    if (notes[i] !== undefined) {
      INST.brass(k, d, t, notes[i], sp * 2.2, 0.12, { cut: 2600 });
      INST.bell(k, d, t, notes[i] + 12, 0.8, 0.05, {});
    }
    if (i === 8) {
      for (const m of [60, 64, 67, 72]) INST.brass(k, d, t, m, sp * 22, 0.07, { cut: 2400 });
      for (const m of [84, 88, 91]) INST.bell(k, d, t, m, 2.2, 0.04, { ratio: 2.01, index: 1 });
      DRUM.kick(k, d, t, 0.8);
      DRUM.ohat(k, d, t, 1);
      k.tone(d, { t, type: 'sine', f: mtof(36), dur: sp * 22, a: 0.01, vol: 0.15 });
    }
    if (i === 6 || i === 7) DRUM.snare(k, d, t, 0.5);
  },
};

export const TRACKS = { victory };
for (const [name, def] of Object.entries(DEFS)) {
  TRACKS[name] = { ...def, step: (k, tr, i, t, sp) => run(def, k, tr, i, t, sp) };
}
