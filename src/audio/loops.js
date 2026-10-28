// Ambient loops: continuous beds (looped noise/drones) + randomly scheduled details via tick().
// def.start(kit, h) builds sustained sources into h.gain (push to h.sources for cleanup);
// def.tick(kit, h, t, dt) may schedule one-shot details in [t, t+dt).
const r = (a, b) => a + Math.random() * (b - a);

function bed(kit, h, { brown = true, filter, filter2, vol = 0.3, lfo }) {
  const ctx = kit.ctx;
  const src = ctx.createBufferSource();
  src.buffer = brown ? kit.brown : kit.white;
  src.loop = true;
  let node = src;
  for (const f of [filter, filter2]) {
    if (!f) continue;
    const bq = ctx.createBiquadFilter();
    bq.type = f.type; bq.frequency.value = f.f; bq.Q.value = f.Q ?? 0.7;
    node.connect(bq); node = bq;
    if (lfo && f === filter) {
      const o = ctx.createOscillator(); o.frequency.value = lfo.rate;
      const g = ctx.createGain(); g.gain.value = lfo.depth;
      o.connect(g); g.connect(bq.frequency); o.start(); h.sources.push(o);
    }
  }
  const g = ctx.createGain();
  g.gain.value = vol;
  node.connect(g); g.connect(h.gain);
  src.start(ctx.currentTime, Math.random() * 1.5);
  h.sources.push(src);
  return g;
}

function drone(kit, h, f, vol, cut = 200) {
  const ctx = kit.ctx;
  for (const det of [-6, 5]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut;
    const g = ctx.createGain(); g.gain.value = vol;
    o.connect(lp); lp.connect(g); g.connect(h.gain);
    o.start(); h.sources.push(o);
  }
}

const drip = (kit, h, t, vol = 0.1) => {
  const f = r(1000, 1700);
  kit.tone(h.gain, { t, f, f2: f * 0.5, sweep: 0.05, dur: 0.09, vol });
  if (Math.random() < 0.5) kit.tone(h.gain, { t: t + r(0.08, 0.16), f: f * 0.9, f2: f * 0.45, sweep: 0.04, dur: 0.07, vol: vol * 0.35 });
};
const pop = (kit, h, t, vol = 0.12) => kit.noise(h.gain, { t, dur: r(0.004, 0.018), vol: vol * r(0.4, 1), filter: { type: 'bandpass', f: r(1200, 4500), Q: 1.5 } });

export const LOOPS = {
  campfire: {
    vol: 0.9, verb: 0.12,
    start(kit, h) {
      bed(kit, h, { filter: { type: 'lowpass', f: 380 }, vol: 0.22 });
      bed(kit, h, { brown: false, filter: { type: 'bandpass', f: 2200, Q: 0.6 }, vol: 0.012 });
    },
    tick(kit, h, t, dt) {
      if (Math.random() < dt * 9) pop(kit, h, t + r(0, dt), 0.14);
      if (Math.random() < dt * 0.6) for (let i = 0; i < 4; i++) pop(kit, h, t + r(0, 0.15), 0.1);
      if (Math.random() < dt * 0.25) kit.noise(h.gain, { t, dur: 0.5, a: 0.2, vol: 0.06, filter: { type: 'lowpass', f: 600 }, brown: true });
    },
  },
  cave: {
    vol: 0.8, verb: 0.5,
    start(kit, h) {
      drone(kit, h, 41, 0.05, 160);
      bed(kit, h, { filter: { type: 'lowpass', f: 220 }, vol: 0.12, lfo: { rate: 0.07, depth: 80 } });
    },
    tick(kit, h, t, dt) {
      if (Math.random() < dt * 0.7) drip(kit, h, t + r(0, dt), r(0.04, 0.1));
      if (Math.random() < dt * 0.04) kit.noise(h.gain, { t, dur: 1.4, a: 0.6, vol: 0.05, filter: { type: 'bandpass', f: 300, f2: 700, Q: 1 }, brown: true });
    },
  },
  lava: {
    vol: 0.85, verb: 0.25,
    start(kit, h) {
      bed(kit, h, { filter: { type: 'lowpass', f: 260 }, vol: 0.28, lfo: { rate: 0.15, depth: 90 } });
      drone(kit, h, 36, 0.04, 140);
    },
    tick(kit, h, t, dt) {
      if (Math.random() < dt * 3) {
        const f = r(70, 160);
        kit.tone(h.gain, { t: t + r(0, dt), f, f2: f * r(2, 3.5), sweep: 0.07, dur: 0.1, vol: r(0.04, 0.1) });
      }
      if (Math.random() < dt * 4) pop(kit, h, t + r(0, dt), 0.05);
    },
  },
  water: {
    vol: 0.8, verb: 0.45,
    start(kit, h) {
      bed(kit, h, { brown: false, filter: { type: 'bandpass', f: 900, Q: 0.5 }, filter2: { type: 'lowpass', f: 2500 }, vol: 0.05, lfo: { rate: 0.2, depth: 300 } });
    },
    tick(kit, h, t, dt) {
      if (Math.random() < dt * 2.2) drip(kit, h, t + r(0, dt), r(0.05, 0.12));
      if (Math.random() < dt * 1.5) kit.tone(h.gain, { t: t + r(0, dt), f: r(300, 700), f2: r(800, 1400), sweep: 0.04, dur: 0.05, vol: 0.03 });
    },
  },
  wind: {
    vol: 0.75, verb: 0.4,
    start(kit, h) {
      bed(kit, h, { filter: { type: 'bandpass', f: 420, Q: 0.9 }, vol: 0.35, lfo: { rate: 0.09, depth: 220 } });
      bed(kit, h, { brown: false, filter: { type: 'bandpass', f: 1400, Q: 2 }, vol: 0.012, lfo: { rate: 0.13, depth: 500 } });
    },
  },
  forge_fire: {
    vol: 0.9, verb: 0.15,
    start(kit, h) {
      bed(kit, h, { filter: { type: 'lowpass', f: 520 }, vol: 0.35, lfo: { rate: 0.5, depth: 160 } });
      bed(kit, h, { brown: false, filter: { type: 'highpass', f: 3000 }, vol: 0.01 });
    },
    tick(kit, h, t, dt) {
      if (Math.random() < dt * 12) pop(kit, h, t + r(0, dt), 0.1);
    },
  },
};
