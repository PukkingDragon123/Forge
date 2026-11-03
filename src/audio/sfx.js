// SFX library. Each entry: { vol, verb (reverb send), fn(s) → duration }.
// s.tone / s.noise / s.fm / s.pluck / s.kick schedule relative to the play time; s.p = pitch multiplier.
const r = (a, b) => a + Math.random() * (b - a);
const HP = (f, f2, Q) => ({ type: 'highpass', f, f2, Q });
const LP = (f, f2, Q) => ({ type: 'lowpass', f, f2, Q });
const BP = (f, f2, Q) => ({ type: 'bandpass', f, f2, Q });

// shared building blocks ------------------------------------------------------------
function chime(s, notes, o = {}) {
  notes.forEach((f, i) => s.fm({ t: (o.t || 0) + i * (o.gap ?? 0.07), f, ratio: o.ratio ?? 3.01, index: o.index ?? 1.6, dur: o.dur ?? 0.9, vol: o.vol ?? 0.12, idxDecay: 0.3 }));
}
function whoosh(s, o = {}) {
  s.noise({ t: o.t || 0, dur: o.dur ?? 0.22, a: o.a ?? (o.dur ?? 0.22) * 0.45, vol: o.vol ?? 0.25, filter: BP(o.f ?? 500, o.f2 ?? 2800, o.Q ?? 1.2) });
}
function thud(s, o = {}) {
  s.tone({ t: o.t || 0, f: o.f ?? 140, f2: o.f2 ?? 50, dur: o.dur ?? 0.18, vol: o.vol ?? 0.4, a: 0.002 });
  s.noise({ t: o.t || 0, dur: Math.min(0.12, o.dur ?? 0.18), vol: (o.vol ?? 0.4) * 0.5, filter: LP(o.nf ?? 700) });
}
function clink(s, o = {}) {
  s.fm({ t: o.t || 0, f: o.f ?? 2200, ratio: o.ratio ?? 2.76, index: o.index ?? 2.5, dur: o.dur ?? 0.25, vol: o.vol ?? 0.15 });
}
function crackle(s, n, o = {}) {
  for (let i = 0; i < n; i++) s.noise({ t: (o.t || 0) + r(0, o.spread ?? 0.2), dur: r(0.006, 0.02), vol: (o.vol ?? 0.2) * r(0.5, 1), filter: BP(r(1500, 5000), null, 2) });
}
function creak(s, o = {}) {
  s.tone({ t: o.t || 0, type: 'sawtooth', f: o.f ?? 120, f2: o.f2 ?? 95, dur: o.dur ?? 0.5, a: 0.05, vol: o.vol ?? 0.12, vib: { rate: o.rate ?? 23, depth: 0.08 }, filter: BP(o.ff ?? 900, null, 3) });
}
function growl(s, o = {}) {
  const f = o.f ?? 75;
  for (const d of [0, 7, -9]) s.tone({ t: o.t || 0, type: 'sawtooth', f: f * (1 + d / 400), f2: (o.f2 ?? f * 0.8), dur: o.dur ?? 0.7, a: o.a ?? 0.08, vol: (o.vol ?? 0.18) / 2, vib: { rate: o.rate ?? 18, depth: 0.06 }, filter: LP(o.ff ?? 700, (o.ff ?? 700) * 0.6, 2), dist: o.dist ?? 8 });
  s.noise({ t: o.t || 0, dur: o.dur ?? 0.7, a: 0.08, vol: (o.vol ?? 0.18) * 0.6, filter: BP(o.nf ?? 400, null, 1.5), brown: true });
}

export const SFX = {
  // ---------------------------------------------------------------- UI
  hover: { vol: 0.5, verb: 0, fn: (s) => { s.tone({ f: 2100, dur: 0.035, vol: 0.05 }); return 0.05; } },
  click: { vol: 0.8, verb: 0.05, fn: (s) => { s.tone({ type: 'triangle', f: 950, f2: 480, dur: 0.06, vol: 0.18 }); s.noise({ dur: 0.02, vol: 0.12, filter: BP(3200, null, 2) }); return 0.08; } },
  deny: { vol: 0.8, verb: 0.05, fn: (s) => { s.tone({ type: 'square', f: 220, f2: 190, dur: 0.09, vol: 0.08, filter: LP(1200) }); s.tone({ t: 0.1, type: 'square', f: 180, f2: 140, dur: 0.14, vol: 0.08, filter: LP(1000) }); return 0.26; } },
  blip: { vol: 0.7, verb: 0.05, fn: (s) => { s.tone({ f: 1250, dur: 0.06, vol: 0.12 }); return 0.07; } },
  _tick: { vol: 0.9, verb: 0.05, fn: (s) => { s.tone({ type: 'triangle', f: 1600, f2: 1100, sweep: 0.02, dur: 0.05, vol: 0.12 }); s.noise({ dur: 0.012, vol: 0.06, filter: BP(4000, null, 3) }); return 0.06; } },
  ui_pop: { vol: 0.8, verb: 0.1, fn: (s) => { s.tone({ f: 420, f2: 980, sweep: 0.05, dur: 0.09, vol: 0.18 }); s.noise({ dur: 0.03, vol: 0.06, filter: HP(4000) }); return 0.1; } },
  card_pick: { vol: 0.8, verb: 0.08, fn: (s) => { whoosh(s, { dur: 0.08, f: 2000, f2: 4500, vol: 0.12 }); s.tone({ type: 'triangle', f: 1300, f2: 1700, dur: 0.05, vol: 0.06 }); return 0.1; } },
  card_place: { vol: 0.8, verb: 0.06, fn: (s) => { s.noise({ dur: 0.06, vol: 0.2, filter: LP(900) }); s.tone({ f: 190, f2: 120, dur: 0.06, vol: 0.18 }); return 0.08; } },
  card_flip: { vol: 0.8, verb: 0.08, fn: (s) => { whoosh(s, { dur: 0.07, f: 1500, f2: 5200, vol: 0.13 }); whoosh(s, { t: 0.06, dur: 0.06, f: 2400, f2: 6000, vol: 0.08 }); return 0.14; } },
  page_turn: { vol: 0.8, verb: 0.1, fn: (s) => { s.noise({ dur: 0.22, a: 0.08, vol: 0.14, filter: BP(1000, 2600, 0.8) }); crackle(s, 5, { spread: 0.18, vol: 0.05 }); return 0.25; } },
  scroll_open: { vol: 0.8, verb: 0.2, fn: (s) => { s.noise({ dur: 0.3, a: 0.1, vol: 0.12, filter: BP(1300, 3200, 0.9) }); crackle(s, 6, { spread: 0.25, vol: 0.05 }); chime(s, [880, 1320], { t: 0.18, gap: 0.08, vol: 0.06 }); return 0.9; } },
  bag_open: { vol: 0.8, verb: 0.08, fn: (s) => { creak(s, { f: 90, f2: 70, dur: 0.18, vol: 0.1, ff: 600 }); crackle(s, 4, { t: 0.05, spread: 0.12, vol: 0.06 }); clink(s, { t: 0.16, f: 2400, dur: 0.15, vol: 0.06 }); return 0.35; } },
  bag_close: { vol: 0.8, verb: 0.08, fn: (s) => { thud(s, { f: 160, f2: 80, dur: 0.1, vol: 0.25 }); clink(s, { t: 0.05, f: 2000, dur: 0.12, vol: 0.06 }); return 0.2; } },
  rotate: { vol: 0.8, verb: 0.05, fn: (s) => { whoosh(s, { dur: 0.08, f: 900, f2: 2400, vol: 0.1 }); s.tone({ t: 0.06, type: 'triangle', f: 1400, dur: 0.03, vol: 0.06 }); return 0.1; } },
  drop: { vol: 0.8, verb: 0.08, fn: (s) => { thud(s, { f: 130, f2: 60, dur: 0.12, vol: 0.3 }); return 0.14; } },
  transition: { vol: 0.6, verb: 0.3, fn: (s) => { whoosh(s, { dur: 0.45, f: 300, f2: 1600, vol: 0.12, Q: 0.7 }); return 0.5; } },
  sparkle: { vol: 0.7, verb: 0.35, fn: (s) => { for (let i = 0; i < 6; i++) s.fm({ t: i * 0.045 + r(0, 0.02), f: r(2400, 4200), ratio: 2.01, index: 1.2, dur: 0.35, vol: 0.04 }); return 0.6; } },

  // ---------------------------------------------------------------- economy
  coin: { vol: 0.8, verb: 0.15, fn: (s) => { s.fm({ f: 1976, ratio: 2.0, index: 0.7, dur: 0.12, vol: 0.12 }); s.fm({ t: 0.07, f: 2637, ratio: 2.0, index: 0.7, dur: 0.35, vol: 0.12 }); return 0.45; } },
  coins: { vol: 0.8, verb: 0.15, fn: (s) => { for (let i = 0; i < 7; i++) s.fm({ t: i * 0.05 + r(0, 0.03), f: r(1900, 3200), ratio: 2.4, index: 1.2, dur: 0.25, vol: 0.07 }); return 0.6; } },

  // ---------------------------------------------------------------- mining
  ore_common: { vol: 0.9, verb: 0.15, fn: (s) => { thud(s, { f: 180, f2: 90, dur: 0.1, vol: 0.2 }); chime(s, [988], { vol: 0.08, dur: 0.4 }); return 0.45; } },
  ore_rare: { vol: 0.9, verb: 0.3, fn: (s) => { chime(s, [1047, 1319, 1568], { gap: 0.06, vol: 0.1 }); s.noise({ t: 0.05, dur: 0.4, a: 0.1, vol: 0.04, filter: HP(6000) }); return 1.0; } },
  ore_epic: { vol: 0.9, verb: 0.35, fn: (s) => { s.kick({ f: 90, end: 35, dur: 0.5, vol: 0.6 }); chime(s, [880, 1109, 1319, 1760], { gap: 0.07, vol: 0.11, dur: 1.2 }); s.noise({ dur: 0.9, a: 0.3, vol: 0.05, filter: HP(5000) }); return 1.4; } },
  ore_legendary: {
    vol: 0.95, verb: 0.45, fn: (s) => {
      s.kick({ f: 80, end: 30, dur: 0.8, vol: 0.8 });
      for (const f of [261.6, 329.6, 392, 523.3]) s.tone({ type: 'sawtooth', f, dur: 1.8, a: 0.25, vol: 0.035, filter: LP(1800, 900) });
      chime(s, [1047, 1319, 1568, 2093, 2637], { gap: 0.08, vol: 0.1, dur: 1.5 });
      s.noise({ dur: 1.4, a: 0.5, vol: 0.06, filter: HP(5000) });
      return 2.0;
    },
  },
  pick_strike: { vol: 0.9, verb: 0.15, fn: (s) => { s.noise({ dur: 0.02, vol: 0.35, filter: HP(2500) }); clink(s, { f: r(2000, 2400), ratio: 3.1, index: 3, dur: 0.18, vol: 0.12 }); thud(s, { f: 160, f2: 70, dur: 0.12, vol: 0.3 }); return 0.25; } },
  rock_crack: { vol: 0.9, verb: 0.12, fn: (s) => { crackle(s, 4, { spread: 0.08, vol: 0.25 }); s.tone({ f: 110, f2: 70, dur: 0.12, vol: 0.2 }); return 0.15; } },
  rock_break: {
    vol: 0.95, verb: 0.2, fn: (s) => {
      thud(s, { f: 120, f2: 45, dur: 0.25, vol: 0.45, nf: 500 });
      s.noise({ dur: 0.35, a: 0.01, vol: 0.25, filter: LP(1500, 400), brown: true });
      for (let i = 0; i < 6; i++) s.noise({ t: 0.05 + r(0, 0.3), dur: 0.02, vol: 0.12 * r(0.4, 1), filter: BP(r(1200, 3500), null, 3) });
      return 0.45;
    },
  },
  hard_clang: { vol: 0.9, verb: 0.25, fn: (s) => { s.fm({ f: 820, ratio: 2.7, index: 5, dur: 0.6, vol: 0.18 }); s.noise({ dur: 0.03, vol: 0.3, filter: HP(3000) }); thud(s, { f: 150, f2: 90, dur: 0.1, vol: 0.2 }); return 0.65; } },
  hazard: { vol: 0.8, verb: 0.2, fn: (s) => { for (const t of [0, 0.18]) { s.tone({ t, type: 'square', f: 233, dur: 0.14, vol: 0.06, filter: LP(1400) }); s.tone({ t, type: 'square', f: 247, dur: 0.14, vol: 0.06, filter: LP(1400) }); } return 0.35; } },
  gas: { vol: 0.8, verb: 0.2, fn: (s) => { s.noise({ dur: 0.8, a: 0.15, vol: 0.18, filter: HP(2500, 5000) }); s.noise({ dur: 0.6, a: 0.1, vol: 0.08, filter: BP(800, null, 2) }); return 0.85; } },
  cave_in: {
    vol: 1, verb: 0.3, fn: (s) => {
      s.noise({ dur: 1.5, a: 0.1, vol: 0.45, filter: LP(300, 120), brown: true });
      for (let i = 0; i < 6; i++) thud(s, { t: r(0, 1.1), f: r(90, 160), f2: 40, dur: 0.25, vol: 0.35 });
      for (let i = 0; i < 12; i++) s.noise({ t: r(0, 1.3), dur: 0.02, vol: 0.1, filter: BP(r(1000, 3000), null, 3) });
      return 1.6;
    },
  },

  // ---------------------------------------------------------------- forge
  hammer_perfect: {
    vol: 1, verb: 0.35, fn: (s) => {
      s.fm({ f: 1180, ratio: 3.52, index: 7, dur: 1.3, vol: 0.2, idxDecay: 0.15 });
      s.fm({ f: 2360, ratio: 2.01, index: 1.5, dur: 0.9, vol: 0.06 });
      s.noise({ dur: 0.04, vol: 0.4, filter: HP(2000) });
      s.kick({ f: 120, end: 40, dur: 0.3, vol: 0.7 });
      s.noise({ t: 0.02, dur: 0.5, a: 0.02, vol: 0.05, filter: HP(7000) });
      return 1.35;
    },
  },
  hammer_good: { vol: 1, verb: 0.25, fn: (s) => { s.fm({ f: 1050, ratio: 3.52, index: 5, dur: 0.75, vol: 0.16, idxDecay: 0.15 }); s.noise({ dur: 0.04, vol: 0.3, filter: HP(1800) }); s.kick({ f: 110, end: 40, dur: 0.25, vol: 0.5 }); return 0.8; } },
  hammer_miss: { vol: 0.9, verb: 0.15, fn: (s) => { s.noise({ dur: 0.12, vol: 0.3, filter: LP(700) }); s.tone({ f: 210, f2: 150, dur: 0.15, vol: 0.25 }); s.fm({ t: 0.01, f: 730, ratio: 1.41, index: 3, dur: 0.25, vol: 0.07 }); return 0.3; } },
  anvil_ring: { vol: 0.9, verb: 0.4, fn: (s) => { s.fm({ f: 1320, ratio: 3.52, index: 4, dur: 2.6, vol: 0.14, idxDecay: 0.1 }); s.fm({ f: 2640, ratio: 1.5, index: 1, dur: 1.8, vol: 0.05 }); return 2.6; } },
  quench: {
    vol: 0.9, verb: 0.25, fn: (s) => {
      s.noise({ dur: 1.4, a: 0.05, vol: 0.3, filter: HP(2000, 6000) });
      s.noise({ dur: 0.9, a: 0.02, vol: 0.15, filter: BP(900, 2400, 1) });
      for (let i = 0; i < 10; i++) s.tone({ t: r(0.05, 1), f: r(300, 700), f2: r(900, 1500), dur: 0.05, vol: 0.05 });
      return 1.45;
    },
  },
  forge_whoosh: { vol: 0.9, verb: 0.2, fn: (s) => { whoosh(s, { dur: 0.5, f: 180, f2: 1900, vol: 0.28, Q: 0.8 }); s.noise({ dur: 0.5, a: 0.2, vol: 0.12, filter: LP(400), brown: true }); return 0.55; } },
  forge_ignite: {
    vol: 0.9, verb: 0.25, fn: (s) => {
      whoosh(s, { dur: 0.35, f: 250, f2: 1400, vol: 0.25 });
      s.noise({ t: 0.1, dur: 1.2, a: 0.3, vol: 0.3, filter: LP(500, 900), brown: true });
      crackle(s, 12, { t: 0.15, spread: 1, vol: 0.12 });
      return 1.35;
    },
  },
  metal_pour: {
    vol: 0.9, verb: 0.2, fn: (s) => {
      s.noise({ dur: 1.0, a: 0.08, vol: 0.2, filter: LP(600, 300, 4), brown: true });
      for (let i = 0; i < 9; i++) s.tone({ t: r(0, 0.9), f: r(120, 260), f2: r(300, 500), dur: 0.08, vol: 0.12 });
      s.noise({ dur: 0.8, a: 0.2, vol: 0.06, filter: HP(4000) });
      return 1.05;
    },
  },
  sizzle: { vol: 0.8, verb: 0.1, fn: (s) => { s.noise({ dur: 0.45, a: 0.02, vol: 0.18, filter: HP(3500) }); crackle(s, 8, { spread: 0.4, vol: 0.08 }); return 0.5; } },
  synergy: {
    vol: 0.95, verb: 0.35, fn: (s) => {
      chime(s, [523, 659, 784, 1047, 1319], { gap: 0.055, vol: 0.12, dur: 1.0, index: 2.2 });
      s.tone({ type: 'sawtooth', f: 262, dur: 0.6, a: 0.02, vol: 0.05, filter: LP(2400, 600) });
      s.noise({ dur: 0.6, a: 0.15, vol: 0.05, filter: HP(6000) });
      return 1.2;
    },
  },
  chips_tick: { vol: 0.8, verb: 0.1, fn: (s) => { s.tone({ f: 660, dur: 0.07, vol: 0.18 }); s.tone({ type: 'triangle', f: 1320, dur: 0.05, vol: 0.06 }); return 0.08; } },
  mult_tick: { vol: 0.8, verb: 0.1, fn: (s) => { s.tone({ type: 'square', f: 520, dur: 0.08, vol: 0.08, filter: LP(2500) }); s.tone({ f: 1040, dur: 0.05, vol: 0.08 }); return 0.09; } },
  xmult: {
    vol: 0.95, verb: 0.25, fn: (s) => {
      for (const f of [220, 277, 330]) s.tone({ type: 'sawtooth', f, dur: 0.32, a: 0.005, vol: 0.06, filter: LP(3500, 700) });
      s.fm({ f: 1760, ratio: 2, index: 2, dur: 0.5, vol: 0.08 });
      whoosh(s, { dur: 0.15, f: 1500, f2: 5000, vol: 0.1 });
      s.kick({ f: 140, end: 50, dur: 0.2, vol: 0.4 });
      return 0.55;
    },
  },
  dmg_total: {
    vol: 1, verb: 0.35, fn: (s) => {
      s.kick({ f: 100, end: 30, dur: 0.7, vol: 0.9 });
      s.noise({ dur: 0.3, vol: 0.25, filter: LP(3000, 300) });
      for (const f of [196, 247, 294, 392]) s.tone({ type: 'sawtooth', f, dur: 1.0, a: 0.01, vol: 0.04, filter: LP(3000, 500) });
      chime(s, [1568, 2093], { gap: 0.05, vol: 0.08 });
      return 1.1;
    },
  },
  recipe_discover: {
    vol: 1, verb: 0.45, fn: (s) => {
      chime(s, [523, 659, 784, 988, 1175, 1568], { gap: 0.07, vol: 0.11, dur: 1.4 });
      for (const f of [261.6, 329.6, 392, 493.9]) s.tone({ t: 0.35, type: 'triangle', f, dur: 1.8, a: 0.3, vol: 0.06, vib: { rate: 5, depth: 0.004 } });
      s.noise({ t: 0.3, dur: 1.3, a: 0.4, vol: 0.05, filter: HP(6000) });
      return 2.2;
    },
  },

  // ---------------------------------------------------------------- combat
  sword_swing: { vol: 0.8, verb: 0.08, fn: (s) => { whoosh(s, { dur: 0.16, f: 600, f2: 3400, vol: 0.22, Q: 1.5 }); return 0.18; } },
  hit: { vol: 0.95, verb: 0.12, fn: (s) => { s.noise({ dur: 0.07, vol: 0.4, filter: LP(2400) }); s.tone({ f: 170, f2: 60, dur: 0.12, vol: 0.4 }); return 0.14; } },
  heavy_hit: {
    vol: 1, verb: 0.2, fn: (s) => {
      s.kick({ f: 95, end: 32, dur: 0.35, vol: 1 });
      s.noise({ dur: 0.18, vol: 0.4, filter: LP(1800, 300) });
      s.tone({ type: 'sawtooth', f: 90, f2: 50, dur: 0.15, vol: 0.12, dist: 30, filter: LP(1200) });
      return 0.38;
    },
  },
  crit: {
    vol: 1, verb: 0.25, fn: (s) => {
      s.noise({ dur: 0.05, vol: 0.45, filter: HP(1500) });
      s.tone({ f: 200, f2: 55, dur: 0.18, vol: 0.45 });
      s.fm({ f: 2400, ratio: 1.5, index: 2.5, dur: 0.45, vol: 0.12 });
      whoosh(s, { dur: 0.1, f: 3000, f2: 8000, vol: 0.1 });
      return 0.5;
    },
  },
  block: { vol: 0.95, verb: 0.15, fn: (s) => { s.fm({ f: 760, ratio: 1.41, index: 4, dur: 0.3, vol: 0.18 }); s.noise({ dur: 0.05, vol: 0.3, filter: BP(1800, null, 1) }); thud(s, { f: 120, f2: 70, dur: 0.1, vol: 0.25 }); return 0.32; } },
  parry: {
    vol: 1, verb: 0.4, fn: (s) => {
      s.fm({ f: 1480, ratio: 2.0, index: 3, dur: 1.0, vol: 0.18, idxDecay: 0.2 });
      s.fm({ f: 2220, ratio: 1.5, index: 1, dur: 0.8, vol: 0.07 });
      s.noise({ dur: 0.2, vol: 0.18, filter: HP(4000, 9000) });
      return 1.0;
    },
  },
  hurt: { vol: 0.9, verb: 0.1, fn: (s) => { thud(s, { f: 140, f2: 55, dur: 0.18, vol: 0.4 }); s.tone({ type: 'sawtooth', f: 180, f2: 110, dur: 0.18, vol: 0.06, filter: BP(700, null, 3) }); return 0.2; } },
  dodge: { vol: 0.8, verb: 0.1, fn: (s) => { whoosh(s, { dur: 0.12, f: 1200, f2: 3600, vol: 0.16 }); return 0.14; } },
  monster_growl: { vol: 0.9, verb: 0.25, fn: (s) => { growl(s, { f: 72 * r(0.9, 1.1), dur: 0.8, vol: 0.22 }); return 0.85; } },
  monster_hurt: { vol: 0.85, verb: 0.15, fn: (s) => { s.tone({ type: 'sawtooth', f: 330, f2: 190, dur: 0.18, vol: 0.08, vib: { rate: 30, depth: 0.05 }, filter: LP(1600) }); s.noise({ dur: 0.08, vol: 0.12, filter: BP(1200, null, 2) }); return 0.2; } },
  monster_die: {
    vol: 0.95, verb: 0.3, fn: (s) => {
      growl(s, { f: 110, f2: 45, dur: 0.9, vol: 0.2, ff: 900 });
      thud(s, { t: 0.55, f: 100, f2: 40, dur: 0.35, vol: 0.45 });
      s.noise({ t: 0.6, dur: 0.6, a: 0.05, vol: 0.12, filter: LP(1200, 300), brown: true });
      return 1.2;
    },
  },
  boss_roar: {
    vol: 1, verb: 0.45, fn: (s) => {
      growl(s, { f: 55, f2: 48, dur: 1.7, a: 0.25, vol: 0.32, ff: 1100, dist: 14, rate: 14 });
      growl(s, { f: 82, f2: 66, dur: 1.5, a: 0.2, vol: 0.18, ff: 1500 });
      s.kick({ f: 70, end: 28, dur: 1.0, vol: 0.6 });
      return 1.8;
    },
  },
  boss_intro: {
    vol: 1, verb: 0.5, fn: (s) => {
      s.kick({ f: 60, end: 25, dur: 1.5, vol: 1 });
      s.noise({ dur: 2.0, a: 1.6, vol: 0.18, filter: BP(200, 3000, 1.5) });
      for (const f of [73.4, 87.3, 110, 146.8]) s.tone({ t: 1.6, type: 'sawtooth', f, dur: 1.4, a: 0.01, vol: 0.07, filter: LP(2400, 400), dist: 6 });
      s.kick({ t: 1.6, f: 90, end: 30, dur: 0.8, vol: 1 });
      return 3.1;
    },
  },
  shatter: {
    vol: 1, verb: 0.4, fn: (s) => {
      s.noise({ dur: 0.06, vol: 0.5, filter: HP(1500) });
      for (let i = 0; i < 16; i++) s.fm({ t: r(0, 0.5) * r(0.2, 1), f: r(1800, 6500), ratio: r(1.3, 3.7), index: r(1, 4), dur: r(0.15, 0.5), vol: 0.05 });
      s.noise({ dur: 0.6, a: 0.005, vol: 0.18, filter: HP(5000, 2500) });
      thud(s, { f: 160, f2: 60, dur: 0.15, vol: 0.25 });
      return 1.0;
    },
  },
  crack: { vol: 0.9, verb: 0.2, fn: (s) => { s.noise({ dur: 0.015, vol: 0.5, filter: HP(2000) }); s.fm({ f: 3200, ratio: 1.7, index: 3, dur: 0.12, vol: 0.06 }); creak(s, { t: 0.02, f: 220, f2: 180, dur: 0.18, vol: 0.05, ff: 2000 }); return 0.22; } },
  harvest_slice: { vol: 0.9, verb: 0.12, fn: (s) => { whoosh(s, { dur: 0.1, f: 2500, f2: 7000, vol: 0.2, Q: 2 }); s.noise({ t: 0.06, dur: 0.12, vol: 0.25, filter: LP(800) }); s.tone({ t: 0.06, f: 220, f2: 120, dur: 0.1, vol: 0.15 }); return 0.2; } },

  // ---------------------------------------------------------------- treasure
  chest_open: {
    vol: 0.95, verb: 0.3, fn: (s) => {
      clink(s, { f: 1700, dur: 0.1, vol: 0.1 });
      creak(s, { t: 0.05, f: 140, f2: 95, dur: 0.55, vol: 0.12 });
      chime(s, [784, 988, 1175, 1568], { t: 0.45, gap: 0.06, vol: 0.09 });
      s.noise({ t: 0.45, dur: 0.8, a: 0.2, vol: 0.05, filter: HP(6000) });
      return 1.4;
    },
  },
  chest_locked: { vol: 0.9, verb: 0.1, fn: (s) => { for (let i = 0; i < 4; i++) clink(s, { t: i * 0.05, f: r(900, 1300), ratio: 1.4, dur: 0.06, vol: 0.08 }); thud(s, { t: 0.22, f: 120, f2: 70, dur: 0.1, vol: 0.2 }); return 0.35; } },
  mimic_reveal: {
    vol: 1, verb: 0.3, fn: (s) => {
      growl(s, { f: 95, dur: 0.6, vol: 0.25, ff: 900 });
      thud(s, { t: 0.35, f: 200, f2: 60, dur: 0.12, vol: 0.5 });
      thud(s, { t: 0.55, f: 200, f2: 60, dur: 0.12, vol: 0.5 });
      for (const f of [233, 247, 349]) s.tone({ type: 'sawtooth', f, dur: 0.9, a: 0.02, vol: 0.04, filter: LP(1600) });
      return 1.0;
    },
  },
  key_unlock: { vol: 0.9, verb: 0.2, fn: (s) => { clink(s, { f: 1500, ratio: 1.6, dur: 0.08, vol: 0.1 }); clink(s, { t: 0.1, f: 1250, ratio: 1.6, dur: 0.08, vol: 0.1 }); thud(s, { t: 0.2, f: 300, f2: 150, dur: 0.06, vol: 0.2 }); chime(s, [1319, 1760], { t: 0.28, vol: 0.07 }); return 0.9; } },

  // ---------------------------------------------------------------- travel / world
  footstep: { vol: 0.6, verb: 0.15, fn: (s) => { s.noise({ dur: 0.06, vol: 0.18, filter: LP(r(500, 800)) }); s.tone({ f: r(80, 110), f2: 50, dur: 0.06, vol: 0.12 }); return 0.07; } },
  step_metal: { vol: 0.7, verb: 0.2, fn: (s) => { s.noise({ dur: 0.04, vol: 0.15, filter: BP(2000, null, 2) }); clink(s, { f: r(600, 800), ratio: 2.3, index: 2, dur: 0.15, vol: 0.06 }); return 0.16; } },
  drip: { vol: 0.7, verb: 0.5, fn: (s) => { s.tone({ f: r(1100, 1600), f2: r(500, 700), sweep: 0.05, dur: 0.09, vol: 0.12 }); return 0.1; } },
  splash: { vol: 0.85, verb: 0.3, fn: (s) => { s.noise({ dur: 0.35, a: 0.01, vol: 0.3, filter: BP(1500, 600, 0.8) }); for (let i = 0; i < 6; i++) s.tone({ t: r(0.05, 0.4), f: r(400, 900), f2: r(1200, 2000), dur: 0.05, vol: 0.06 }); return 0.45; } },
  bridge_creak: { vol: 0.8, verb: 0.3, fn: (s) => { creak(s, { f: 150, f2: 120, dur: 0.6, vol: 0.12, ff: 700, rate: 17 }); creak(s, { t: 0.3, f: 210, f2: 170, dur: 0.4, vol: 0.06, ff: 1100 }); return 0.75; } },
  bridge_snap: {
    vol: 1, verb: 0.35, fn: (s) => {
      s.noise({ dur: 0.03, vol: 0.6, filter: HP(1200) });
      crackle(s, 8, { spread: 0.15, vol: 0.3 });
      s.pluck({ t: 0.02, f: 82, dur: 1.2, vol: 0.35, bright: 0.8 });
      whoosh(s, { t: 0.1, dur: 0.6, f: 1500, f2: 300, vol: 0.18 });
      return 1.2;
    },
  },
  minecart_roll: {
    vol: 0.85, verb: 0.2, fn: (s) => {
      s.noise({ dur: 1.2, a: 0.15, vol: 0.25, filter: LP(400), brown: true });
      for (let i = 0; i < 6; i++) { clink(s, { t: i * 0.2, f: 900, ratio: 1.8, index: 2, dur: 0.08, vol: 0.06 }); s.noise({ t: i * 0.2 + 0.03, dur: 0.03, vol: 0.12, filter: BP(1200, null, 2) }); }
      return 1.25;
    },
  },
  elevator: {
    vol: 0.85, verb: 0.3, fn: (s) => {
      s.tone({ type: 'sawtooth', f: 55, dur: 1.5, a: 0.2, vol: 0.06, filter: LP(300), vib: { rate: 9, depth: 0.03 } });
      for (let i = 0; i < 10; i++) clink(s, { t: i * 0.13 + r(0, 0.04), f: r(700, 1200), ratio: 1.9, index: 1.5, dur: 0.07, vol: 0.05 });
      thud(s, { t: 1.3, f: 140, f2: 60, dur: 0.2, vol: 0.35 });
      return 1.6;
    },
  },
  door_creak: { vol: 0.85, verb: 0.35, fn: (s) => { creak(s, { f: 110, f2: 70, dur: 1.2, vol: 0.13, ff: 650, rate: 13 }); thud(s, { t: 1.1, f: 100, f2: 50, dur: 0.25, vol: 0.3 }); return 1.4; } },
  rumble: { vol: 1, verb: 0.3, fn: (s) => { s.noise({ dur: 1.8, a: 0.4, vol: 0.45, filter: LP(160, 90), brown: true }); s.tone({ f: 38, dur: 1.6, a: 0.4, vol: 0.2 }); return 1.9; } },
  wind_whoosh: { vol: 0.7, verb: 0.4, fn: (s) => { s.noise({ dur: 1.4, a: 0.6, vol: 0.18, filter: BP(300, 1200, 0.7) }); return 1.45; } },

  // ---------------------------------------------------------------- QTE / feedback
  qte_prompt: { vol: 0.8, verb: 0.15, fn: (s) => { s.tone({ type: 'triangle', f: 1568, dur: 0.07, vol: 0.13 }); s.tone({ t: 0.08, type: 'triangle', f: 2093, dur: 0.1, vol: 0.13 }); return 0.2; } },
  qte_success: { vol: 0.9, verb: 0.25, fn: (s) => { chime(s, [1047, 1568, 2093], { gap: 0.045, vol: 0.1, dur: 0.6 }); return 0.75; } },
  qte_fail: { vol: 0.9, verb: 0.1, fn: (s) => { s.tone({ type: 'sawtooth', f: 180, f2: 90, dur: 0.35, vol: 0.09, filter: LP(1200) }); s.tone({ type: 'sawtooth', f: 190, f2: 95, dur: 0.35, vol: 0.06, filter: LP(1200) }); return 0.38; } },
  heal: {
    vol: 0.9, verb: 0.4, fn: (s) => {
      chime(s, [659, 784, 988, 1319], { gap: 0.09, vol: 0.08, ratio: 2.0, index: 0.8, dur: 1.0 });
      s.tone({ type: 'triangle', f: 330, f2: 660, dur: 0.8, a: 0.2, vol: 0.06 });
      return 1.3;
    },
  },
  unlock: { vol: 0.95, verb: 0.4, fn: (s) => { chime(s, [784, 988, 1175], { gap: 0, vol: 0.09, dur: 1.4 }); chime(s, [1568, 1976, 2349], { t: 0.18, gap: 0.05, vol: 0.07, dur: 1.2 }); return 1.6; } },
  victory_sting: {
    vol: 0.95, verb: 0.35, fn: (s) => {
      const n = [523, 659, 784, 1047];
      n.forEach((f, i) => s.tone({ t: i * 0.11, type: 'sawtooth', f, dur: 0.35, a: 0.01, vol: 0.06, filter: LP(2600, 1200) }));
      for (const f of [523, 659, 784]) s.tone({ t: 0.45, type: 'sawtooth', f, dur: 1.1, a: 0.02, vol: 0.05, filter: LP(2600, 900), vib: { rate: 5, depth: 0.005 } });
      chime(s, [1568, 2093, 2637], { t: 0.45, gap: 0.05, vol: 0.07 });
      s.kick({ t: 0.45, f: 120, end: 40, dur: 0.4, vol: 0.6 });
      return 1.6;
    },
  },
  defeat_sting: {
    vol: 0.95, verb: 0.45, fn: (s) => {
      [392, 349, 311, 262].forEach((f, i) => s.tone({ t: i * 0.32, type: 'triangle', f, dur: 0.6, a: 0.03, vol: 0.12 }));
      for (const f of [131, 156, 196]) s.tone({ t: 1.0, type: 'sawtooth', f, dur: 1.6, a: 0.3, vol: 0.04, filter: LP(900, 300) });
      return 2.6;
    },
  },

  // ---------------------------------------------------------------- elements & specials
  fire_whoosh: { vol: 0.9, verb: 0.2, fn: (s) => { s.noise({ dur: 0.5, a: 0.08, vol: 0.3, filter: BP(300, 1300, 0.9), brown: true }); crackle(s, 7, { spread: 0.45, vol: 0.12 }); return 0.55; } },
  ice_crack: { vol: 0.9, verb: 0.35, fn: (s) => { s.noise({ dur: 0.02, vol: 0.4, filter: HP(3000) }); s.fm({ f: 3100, ratio: 1.41, index: 3, dur: 0.4, vol: 0.09 }); for (let i = 0; i < 5; i++) s.fm({ t: 0.04 + i * 0.04, f: r(3500, 6000), ratio: 2, index: 1, dur: 0.2, vol: 0.035 }); return 0.5; } },
  zap: {
    vol: 0.9, verb: 0.2, fn: (s) => {
      for (let i = 0; i < 5; i++) s.tone({ t: i * 0.035, type: 'square', f: r(300, 1400), f2: r(80, 300), dur: 0.05, vol: 0.06, filter: HP(400) });
      s.noise({ dur: 0.22, vol: 0.18, filter: BP(4000, 2000, 1.5) });
      return 0.26;
    },
  },
  poison_bubble: { vol: 0.8, verb: 0.2, fn: (s) => { for (let i = 0; i < 6; i++) s.tone({ t: i * 0.06 + r(0, 0.03), f: r(180, 320), f2: r(500, 900), dur: 0.06, vol: 0.09 }); return 0.45; } },
  curse_hum: {
    vol: 0.85, verb: 0.4, fn: (s) => {
      s.tone({ type: 'sawtooth', f: 110, dur: 1.1, a: 0.25, vol: 0.06, filter: LP(700, 300), vib: { rate: 4, depth: 0.01 } });
      s.tone({ type: 'sawtooth', f: 116.5, dur: 1.1, a: 0.25, vol: 0.06, filter: LP(700, 300) });
      s.tone({ type: 'sine', f: 55, dur: 1.1, a: 0.2, vol: 0.12 });
      return 1.15;
    },
  },
  special_charge: { vol: 0.9, verb: 0.3, fn: (s) => { s.tone({ type: 'sawtooth', f: 110, f2: 880, dur: 0.85, a: 0.2, vol: 0.07, filter: LP(400, 4000, 3) }); s.noise({ dur: 0.85, a: 0.6, vol: 0.08, filter: HP(3000, 8000) }); return 0.9; } },
  special_fire: {
    vol: 1, verb: 0.45, fn: (s) => {
      s.kick({ f: 90, end: 25, dur: 0.9, vol: 1 });
      whoosh(s, { dur: 0.4, f: 400, f2: 4000, vol: 0.25 });
      s.noise({ dur: 0.7, a: 0.01, vol: 0.25, filter: LP(4000, 300) });
      for (const f of [147, 220, 294, 440]) s.tone({ type: 'sawtooth', f, dur: 0.9, a: 0.01, vol: 0.05, filter: LP(3000, 600) });
      return 1.0;
    },
  },
  kindle_cast: { vol: 0.85, verb: 0.25, fn: (s) => { s.tone({ f: 600, f2: 1500, sweep: 0.12, dur: 0.18, vol: 0.12 }); s.fm({ t: 0.08, f: 2093, ratio: 2, index: 1.2, dur: 0.3, vol: 0.06 }); return 0.4; } },
  // ---------------------------------------------------------------- v4: Medusa's curse, Pip, first-person
  hiss: { vol: 0.9, verb: 0.25, fn: (s) => { s.noise({ dur: 0.75, a: 0.09, vol: 0.2, filter: BP(5200, 6800, 1.1) }); s.noise({ dur: 0.6, a: 0.05, vol: 0.08, filter: HP(7500) }); s.noise({ t: 0.05, dur: 0.5, a: 0.1, vol: 0.06, filter: BP(2600, 3400, 2) }); return 0.8; } },
  snake_rattle: { vol: 0.85, verb: 0.2, fn: (s) => { for (let i = 0; i < 24; i++) s.noise({ t: i * 0.032 + r(0, 0.006), dur: 0.014, vol: 0.16 * (1 - i / 30), filter: BP(r(4200, 5200), null, 2.5) }); return 0.85; } },
  petrify: {
    vol: 0.95, verb: 0.45, fn: (s) => {
      s.tone({ type: 'sawtooth', f: 220, f2: 82, dur: 1.5, a: 0.05, vol: 0.05, filter: LP(1400, 300), vib: { rate: 7, depth: 0.02 } });
      s.tone({ type: 'sine', f: 660, f2: 330, dur: 1.2, a: 0.02, vol: 0.05, vib: { rate: 9, depth: 0.03 } });
      s.noise({ dur: 1.6, a: 0.9, vol: 0.16, filter: LP(500, 2400), brown: true });
      for (let i = 0; i < 26; i++) s.noise({ t: 0.1 + (i / 26) ** 0.7 * 1.4, dur: r(0.008, 0.02), vol: 0.1 + i * 0.006, filter: BP(r(1400, 4200), null, 2) });
      thud(s, { t: 1.45, f: 120, f2: 45, dur: 0.3, vol: 0.35 });
      return 1.8;
    },
  },
  stone_crack: { vol: 0.95, verb: 0.2, fn: (s) => { s.noise({ dur: 0.02, vol: 0.5, filter: HP(1800) }); crackle(s, 7, { spread: 0.12, vol: 0.22 }); s.tone({ f: 170, f2: 90, dur: 0.1, vol: 0.18 }); s.noise({ t: 0.04, dur: 0.25, a: 0.01, vol: 0.08, filter: LP(1800, 500), brown: true }); return 0.3; } },
  stone_shatter: {
    vol: 1, verb: 0.35, fn: (s) => {
      s.kick({ f: 110, end: 35, dur: 0.45, vol: 0.7 });
      s.noise({ dur: 0.08, vol: 0.5, filter: HP(1200) });
      s.noise({ dur: 0.9, a: 0.005, vol: 0.28, filter: LP(2200, 300), brown: true });
      for (let i = 0; i < 14; i++) thud(s, { t: r(0.05, 0.7), f: r(200, 420), f2: r(80, 140), dur: 0.07, vol: r(0.06, 0.14), nf: 1500 });
      crackle(s, 16, { spread: 0.6, vol: 0.14 });
      return 1.1;
    },
  },
  slurp: { vol: 0.85, verb: 0.08, fn: (s) => { s.noise({ dur: 0.38, a: 0.06, vol: 0.2, filter: BP(520, 1700, 4) }); s.tone({ t: 0.32, f: 340, f2: 170, dur: 0.12, vol: 0.12 }); s.tone({ t: 0.46, type: 'triangle', f: 520, f2: 760, sweep: 0.08, dur: 0.12, vol: 0.06 }); return 0.6; } },
  stew_bubble: { vol: 0.7, verb: 0.15, fn: (s) => { for (let i = 0; i < 5; i++) { const f = r(110, 230); s.tone({ t: i * 0.09 + r(0, 0.05), f, f2: f * r(2.2, 3), sweep: 0.06, dur: 0.08, vol: 0.09 }); } return 0.55; } },
  ladle: { vol: 0.85, verb: 0.15, fn: (s) => { clink(s, { f: 1400, ratio: 1.9, index: 1.5, dur: 0.18, vol: 0.08 }); s.noise({ t: 0.06, dur: 0.32, a: 0.04, vol: 0.12, filter: BP(900, 500, 1.2) }); for (let i = 0; i < 3; i++) s.tone({ t: 0.12 + i * 0.07, f: r(300, 500), f2: r(700, 1000), sweep: 0.04, dur: 0.05, vol: 0.05 }); return 0.5; } },
  trip: { vol: 0.95, verb: 0.12, fn: (s) => { whoosh(s, { dur: 0.22, f: 700, f2: 2600, vol: 0.18 }); s.tone({ t: 0.05, type: 'triangle', f: 520, f2: 300, dur: 0.18, vol: 0.12, vib: { rate: 16, depth: 0.04 } }); thud(s, { t: 0.32, f: 150, f2: 55, dur: 0.22, vol: 0.5 }); s.noise({ t: 0.32, dur: 0.2, vol: 0.1, filter: LP(900) }); return 0.6; } },
  statue_break: {
    vol: 1, verb: 0.35, fn: (s) => {
      s.noise({ dur: 0.05, vol: 0.5, filter: HP(1500) });
      for (let i = 0; i < 12; i++) s.fm({ t: r(0, 0.35), f: r(900, 3200), ratio: r(1.3, 2.6), index: r(1, 3), dur: r(0.1, 0.35), vol: 0.06 });
      thud(s, { f: 190, f2: 70, dur: 0.14, vol: 0.35 });
      crackle(s, 10, { t: 0.05, spread: 0.4, vol: 0.12 });
      s.tone({ t: 0.25, type: 'sine', f: 140, f2: 60, dur: 1.4, a: 0.3, vol: 0.06 });
      return 1.6;
    },
  },
  ground_split: {
    vol: 1, verb: 0.5, fn: (s) => {
      s.kick({ f: 55, end: 22, dur: 1.6, vol: 1 });
      s.noise({ dur: 2.2, a: 0.15, vol: 0.32, filter: LP(180, 1200), brown: true });
      for (let i = 0; i < 30; i++) s.noise({ t: (i / 30) * 1.8 + r(0, 0.05), dur: r(0.01, 0.03), vol: 0.22, filter: BP(r(800, 3200), null, 1.5) });
      for (let i = 0; i < 6; i++) thud(s, { t: 0.3 + i * 0.28, f: r(90, 140), f2: 40, dur: 0.25, vol: 0.25 });
      s.tone({ t: 0.8, type: 'sawtooth', f: 98, f2: 92, dur: 1.6, a: 0.6, vol: 0.05, filter: LP(600), vib: { rate: 5, depth: 0.02 } });
      return 2.4;
    },
  },
  medusa_laugh: {
    vol: 0.95, verb: 0.6, fn: (s) => {
      const notes = [740, 698, 659, 622, 587];
      notes.forEach((f, i) => {
        const t = i * 0.19;
        s.tone({ t, type: 'triangle', f: f * 1.06, f2: f, sweep: 0.12, dur: 0.17, a: 0.01, vol: 0.09, vib: { rate: 11, depth: 0.025 }, filter: BP(1600, null, 1.2) });
        s.tone({ t, type: 'sine', f: f * 2, f2: f * 1.9, dur: 0.15, a: 0.01, vol: 0.03 });
        s.noise({ t, dur: 0.12, a: 0.01, vol: 0.05, filter: BP(3200, null, 3) });
      });
      s.noise({ t: 0.9, dur: 1.0, a: 0.2, vol: 0.08, filter: BP(5800, 7200, 1.2) });
      s.tone({ t: 0.95, type: 'sine', f: 1175, f2: 880, dur: 0.9, a: 0.05, vol: 0.04, vib: { rate: 6, depth: 0.03 } });
      return 2.0;
    },
  },
  medusa_whisper: {
    vol: 0.9, verb: 0.6, fn: (s) => {
      for (let i = 0; i < 6; i++) s.noise({ t: i * 0.22 + r(0, 0.06), dur: r(0.15, 0.28), a: 0.05, vol: 0.09, filter: BP(r(1800, 3600), r(2400, 5200), 3) });
      s.noise({ dur: 1.5, a: 0.4, vol: 0.06, filter: BP(6200, 5000, 1.5) });
      s.tone({ type: 'sine', f: 196, f2: 207, dur: 1.5, a: 0.5, vol: 0.05, vib: { rate: 3, depth: 0.01 } });
      return 1.6;
    },
  },
  gaze: {
    vol: 1, verb: 0.6, fn: (s) => {
      s.kick({ f: 70, end: 28, dur: 1.2, vol: 0.8 });
      for (const [f, k] of [[220, 0], [277, 0.04], [330, 0.08], [415, 0.12]]) s.fm({ t: k, f, f2: f * 2, ratio: 1.5, index: 3, dur: 1.4, vol: 0.06, idxDecay: 0.8 });
      s.tone({ type: 'sawtooth', f: 55, dur: 1.5, a: 0.02, vol: 0.08, filter: LP(400, 2400, 4) });
      s.noise({ dur: 1.4, a: 0.3, vol: 0.14, filter: HP(3000, 9000) });
      return 1.6;
    },
  },
  pip_yip: { vol: 0.85, verb: 0.12, fn: (s) => { s.tone({ type: 'triangle', f: 900, f2: 1500, sweep: 0.05, dur: 0.12, vol: 0.14 }); s.tone({ t: 0.06, type: 'triangle', f: 1400, f2: 760, sweep: 0.08, dur: 0.1, vol: 0.1 }); return 0.2; } },
  pip_bark: { vol: 0.85, verb: 0.15, fn: (s) => { for (const t of [0, 0.2]) { s.tone({ t, type: 'square', f: 640, f2: 420, dur: 0.1, vol: 0.06, filter: LP(2200) }); s.noise({ t, dur: 0.08, vol: 0.12, filter: BP(1300, null, 1.5) }); } return 0.35; } },
  pip_dig: { vol: 0.8, verb: 0.1, fn: (s) => { for (let i = 0; i < 6; i++) s.noise({ t: i * 0.07 + r(0, 0.02), dur: r(0.04, 0.07), vol: 0.14, filter: LP(r(900, 1600)), brown: i % 2 === 0 }); for (let i = 0; i < 3; i++) thud(s, { t: r(0.05, 0.4), f: r(160, 240), f2: 90, dur: 0.05, vol: 0.06 }); return 0.5; } },
  pip_whine: { vol: 0.85, verb: 0.2, fn: (s) => { s.tone({ type: 'sine', f: 880, f2: 1250, sweep: 0.25, dur: 0.6, a: 0.05, vol: 0.1, vib: { rate: 9, depth: 0.03 } }); s.tone({ t: 0.35, type: 'sine', f: 1200, f2: 780, sweep: 0.3, dur: 0.35, vol: 0.07 }); return 0.75; } },
  pip_lick: { vol: 0.7, verb: 0.05, fn: (s) => { for (let i = 0; i < 3; i++) s.noise({ t: i * 0.11, dur: 0.07, a: 0.02, vol: 0.12, filter: BP(1800, 900, 3) }); return 0.35; } },
  footstep_stone: { vol: 0.6, verb: 0.2, fn: (s) => { s.noise({ dur: 0.05, vol: 0.16, filter: BP(r(1400, 2200), null, 1.2) }); s.tone({ f: r(110, 140), f2: 60, dur: 0.05, vol: 0.1 }); crackle(s, 2, { spread: 0.04, vol: 0.04 }); return 0.07; } },
  footstep_water: { vol: 0.6, verb: 0.25, fn: (s) => { s.noise({ dur: 0.14, a: 0.01, vol: 0.14, filter: BP(1300, 600, 0.9) }); s.tone({ t: 0.03, f: r(500, 800), f2: r(1100, 1500), sweep: 0.04, dur: 0.05, vol: 0.04 }); return 0.16; } },
  run_breath: { vol: 0.7, verb: 0.08, fn: (s) => { s.noise({ dur: 0.18, a: 0.07, vol: 0.09, filter: BP(1100, 1600, 1.5) }); s.noise({ t: 0.22, dur: 0.22, a: 0.04, vol: 0.11, filter: BP(900, 700, 1.4) }); return 0.45; } },
  vein_glint: { vol: 0.7, verb: 0.4, fn: (s) => { s.fm({ f: r(2600, 3400), ratio: 2.01, index: 1.1, dur: 0.5, vol: 0.06 }); s.fm({ t: 0.06, f: r(3600, 4400), ratio: 2.01, index: 0.9, dur: 0.4, vol: 0.04 }); s.noise({ dur: 0.3, a: 0.05, vol: 0.03, filter: HP(7000) }); return 0.6; } },
  pick_hit: { vol: 0.95, verb: 0.15, fn: (s) => { clink(s, { f: r(1500, 1900), ratio: 2.3, index: 2, dur: 0.16, vol: 0.12 }); crackle(s, 5, { spread: 0.1, vol: 0.18 }); thud(s, { f: 160, f2: 70, dur: 0.1, vol: 0.3 }); return 0.25; } },
  pick_perfect: { vol: 1, verb: 0.3, fn: (s) => { clink(s, { f: 2093, ratio: 2.01, index: 1.8, dur: 0.5, vol: 0.14 }); thud(s, { f: 190, f2: 70, dur: 0.12, vol: 0.35 }); chime(s, [1319, 1760, 2349], { t: 0.08, gap: 0.05, vol: 0.07, dur: 0.6 }); crackle(s, 8, { spread: 0.15, vol: 0.2 }); return 0.8; } },
  pick_miss: { vol: 0.9, verb: 0.15, fn: (s) => { thud(s, { f: 110, f2: 55, dur: 0.12, vol: 0.3 }); s.noise({ t: 0.03, dur: 0.18, a: 0.02, vol: 0.12, filter: BP(2600, 1200, 2) }); s.tone({ t: 0.05, type: 'square', f: 180, f2: 150, dur: 0.12, vol: 0.04, filter: LP(900) }); return 0.25; } },
  chest_creak: { vol: 0.9, verb: 0.3, fn: (s) => { creak(s, { f: 110, f2: 82, dur: 0.95, vol: 0.13, rate: 19, ff: 700 }); creak(s, { t: 0.3, f: 150, f2: 120, dur: 0.6, vol: 0.06, ff: 1100 }); s.noise({ t: 0.85, dur: 0.15, vol: 0.12, filter: LP(600) }); return 1.1; } },
  map_unfold: { vol: 0.8, verb: 0.15, fn: (s) => { for (let i = 0; i < 3; i++) s.noise({ t: i * 0.12, dur: 0.16, a: 0.04, vol: 0.12, filter: BP(r(900, 1400), r(2400, 3200), 0.8) }); crackle(s, 10, { spread: 0.4, vol: 0.05 }); return 0.5; } },
  map_fold: { vol: 0.8, verb: 0.1, fn: (s) => { s.noise({ dur: 0.18, a: 0.05, vol: 0.12, filter: BP(1300, 2400, 0.8) }); crackle(s, 5, { spread: 0.15, vol: 0.05 }); thud(s, { t: 0.18, f: 200, f2: 120, dur: 0.05, vol: 0.08 }); return 0.28; } },
  cook_add: { vol: 0.85, verb: 0.15, fn: (s) => { s.tone({ f: r(240, 320), f2: r(700, 900), sweep: 0.05, dur: 0.08, vol: 0.14 }); s.noise({ t: 0.02, dur: 0.16, a: 0.01, vol: 0.12, filter: BP(1200, 700, 1) }); for (let i = 0; i < 3; i++) s.tone({ t: 0.1 + i * 0.07, f: r(150, 260), f2: r(400, 600), sweep: 0.05, dur: 0.06, vol: 0.05 }); return 0.35; } },
  cook_done: { vol: 0.9, verb: 0.3, fn: (s) => { for (let i = 0; i < 6; i++) s.tone({ t: i * 0.05, f: r(140, 240), f2: r(420, 700), sweep: 0.05, dur: 0.07, vol: 0.06 }); chime(s, [784, 988, 1175, 1568], { t: 0.3, gap: 0.07, vol: 0.08 }); s.noise({ t: 0.3, dur: 0.6, a: 0.2, vol: 0.04, filter: HP(5000) }); return 1.2; } },
  guard: { vol: 0.95, verb: 0.15, fn: (s) => { s.fm({ f: 620, ratio: 1.41, index: 3, dur: 0.22, vol: 0.14 }); s.noise({ dur: 0.04, vol: 0.26, filter: BP(1600, null, 1) }); thud(s, { f: 110, f2: 65, dur: 0.1, vol: 0.28 }); return 0.25; } },
  herald_roar: {
    vol: 1, verb: 0.5, fn: (s) => {
      s.noise({ dur: 1.6, a: 0.15, vol: 0.26, filter: BP(4800, 3600, 0.9) });
      growl(s, { f: 62, f2: 50, dur: 1.4, a: 0.2, vol: 0.26, ff: 1000, dist: 12, rate: 16 });
      for (let i = 0; i < 18; i++) s.noise({ t: 0.9 + i * 0.03, dur: 0.012, vol: 0.12, filter: BP(4600, null, 2.5) });
      s.kick({ f: 66, end: 26, dur: 1.0, vol: 0.6 });
      return 1.7;
    },
  },
  swallow: { vol: 0.8, verb: 0.05, fn: (s) => { s.tone({ f: 260, f2: 140, dur: 0.12, vol: 0.12 }); s.noise({ dur: 0.1, vol: 0.06, filter: LP(700) }); return 0.15; } },
  yum: { vol: 0.8, verb: 0.15, fn: (s) => { s.tone({ type: 'triangle', f: 520, f2: 700, sweep: 0.15, dur: 0.22, vol: 0.09, vib: { rate: 7, depth: 0.02 } }); s.tone({ t: 0.22, type: 'triangle', f: 700, f2: 560, sweep: 0.2, dur: 0.3, vol: 0.08, vib: { rate: 7, depth: 0.02 } }); chime(s, [1568, 2093], { t: 0.2, gap: 0.06, vol: 0.04 }); return 0.6; } },
  stinger: {
    vol: 1, verb: 0.5, fn: (s) => {
      s.kick({ f: 80, end: 30, dur: 0.8, vol: 0.9 });
      for (const f of [233, 247, 349, 466]) s.tone({ type: 'sawtooth', f, dur: 1.2, a: 0.01, vol: 0.045, filter: LP(2600, 500) });
      s.noise({ dur: 0.4, a: 0.005, vol: 0.2, filter: HP(2500, 800) });
      return 1.3;
    },
  },
  heartbeat: { vol: 0.9, verb: 0.1, fn: (s) => { s.kick({ f: 70, end: 35, dur: 0.22, vol: 0.6 }); s.kick({ t: 0.24, f: 62, end: 32, dur: 0.22, vol: 0.45 }); return 0.5; } },
  hug: { vol: 0.8, verb: 0.15, fn: (s) => { s.noise({ dur: 0.25, a: 0.06, vol: 0.1, filter: LP(900) }); chime(s, [659, 784, 988], { t: 0.12, gap: 0.08, vol: 0.06, dur: 0.8 }); return 0.9; } },
  rescue: {
    vol: 1, verb: 0.5, fn: (s) => {
      chime(s, [523, 659, 784, 1047, 1319], { gap: 0.09, vol: 0.09, dur: 1.4 });
      for (const f of [261.6, 329.6, 392]) s.tone({ t: 0.4, type: 'triangle', f, dur: 1.6, a: 0.2, vol: 0.06 });
      s.noise({ t: 0.3, dur: 1.2, a: 0.3, vol: 0.05, filter: HP(5500) });
      return 2.0;
    },
  },
  // ---------------------------------------------------------------- v4: names other scenes asked for
  shield_bash: { vol: 0.95, verb: 0.15, fn: (s) => { thud(s, { f: 170, f2: 60, dur: 0.16, vol: 0.5 }); s.fm({ f: 520, ratio: 1.41, index: 2.5, dur: 0.25, vol: 0.12 }); s.noise({ dur: 0.06, vol: 0.25, filter: BP(1400, null, 1) }); return 0.3; } },
  knife_throw: { vol: 0.85, verb: 0.1, fn: (s) => { whoosh(s, { dur: 0.14, f: 1800, f2: 5200, vol: 0.18, Q: 2 }); s.tone({ t: 0.04, type: 'triangle', f: 2400, f2: 1800, dur: 0.06, vol: 0.05 }); clink(s, { t: 0.16, f: 2600, dur: 0.12, vol: 0.06 }); return 0.3; } },
  equip: { vol: 0.85, verb: 0.15, fn: (s) => { clink(s, { f: 1500, ratio: 2.1, dur: 0.2, vol: 0.1 }); whoosh(s, { t: 0.02, dur: 0.1, f: 900, f2: 2400, vol: 0.08 }); clink(s, { t: 0.1, f: 2200, ratio: 2.4, dur: 0.25, vol: 0.07 }); return 0.4; } },
  pickup: { vol: 0.8, verb: 0.12, fn: (s) => { s.tone({ type: 'triangle', f: 660, f2: 990, sweep: 0.06, dur: 0.1, vol: 0.12 }); s.fm({ t: 0.06, f: 1320, ratio: 2, index: 0.8, dur: 0.25, vol: 0.06 }); return 0.3; } },
  loot: { vol: 0.85, verb: 0.25, fn: (s) => { thud(s, { f: 200, f2: 110, dur: 0.06, vol: 0.18 }); chime(s, [988, 1319, 1568], { t: 0.04, gap: 0.05, vol: 0.07, dur: 0.6 }); s.noise({ t: 0.05, dur: 0.4, a: 0.1, vol: 0.03, filter: HP(6000) }); return 0.7; } },
  pip_sniff: { vol: 0.75, verb: 0.08, fn: (s) => { for (let i = 0; i < 4; i++) s.noise({ t: i * 0.08 + r(0, 0.02), dur: 0.05, a: 0.015, vol: 0.1, filter: BP(r(2200, 3000), null, 2) }); return 0.35; } },
  bat_flutter: { vol: 0.75, verb: 0.3, fn: (s) => { for (let i = 0; i < 9; i++) s.noise({ t: i * 0.05 + r(0, 0.015), dur: 0.03, vol: 0.09 * (1 - i / 12), filter: BP(r(700, 1100), null, 1.6) }); s.tone({ t: 0.1, type: 'sine', f: 4200, f2: 3600, dur: 0.05, vol: 0.02 }); return 0.5; } },
  page: { vol: 0.8, verb: 0.1, fn: (s) => { s.noise({ dur: 0.2, a: 0.07, vol: 0.13, filter: BP(1000, 2600, 0.8) }); crackle(s, 4, { spread: 0.15, vol: 0.05 }); return 0.22; } },
  quill: { vol: 0.7, verb: 0.08, fn: (s) => { for (let i = 0; i < 5; i++) s.noise({ t: i * 0.06 + r(0, 0.02), dur: r(0.03, 0.06), a: 0.01, vol: 0.06, filter: BP(r(3500, 5000), null, 3) }); return 0.35; } },
  kindle_hit: { vol: 0.85, verb: 0.2, fn: (s) => { s.noise({ dur: 0.18, a: 0.005, vol: 0.2, filter: BP(1800, 600, 1) }); s.tone({ f: 900, f2: 300, dur: 0.16, vol: 0.08 }); crackle(s, 5, { spread: 0.15, vol: 0.12 }); return 0.25; } },
  item_place: { vol: 0.8, verb: 0.06, fn: (s) => { thud(s, { f: 210, f2: 120, dur: 0.06, vol: 0.2 }); clink(s, { t: 0.02, f: 1700, ratio: 2.2, dur: 0.1, vol: 0.05 }); return 0.12; } },
};
