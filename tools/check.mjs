// Data integrity + balance smoke checks (no browser needed): `npm run check`
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { MATERIALS } = await import('../src/data/materials.js');
const { MONSTERS } = await import('../src/data/monsters.js');
const { REGIONS, TUNNELS } = await import('../src/data/regions.js');
const { RECIPES, BLUEPRINTS } = await import('../src/data/blueprints.js');
const { EVENTS } = await import('../src/data/events.js');
const { CHARACTERS } = await import('../src/data/characters.js');
const { SHAPES } = await import('../src/data/shapes.js');
const { evaluate, finalizeWeapon } = await import('../src/systems/forge.js');
const { generateMap } = await import('../src/systems/mapgen.js');
const { generateMine, MiningRun } = await import('../src/systems/mining.js');
const { simulateFight } = await import('../src/systems/combat.js');
const { RNG } = await import('../src/core/rng.js');
const { Run, chestLoot, merchantStock } = await import('../src/systems/run.js');

let errors = 0;
const fail = (m) => { errors++; console.log('✘', m); };
const mat = (id, ctx) => { if (!MATERIALS[id]) fail(`${ctx}: unknown material "${id}"`); };

for (const m of Object.values(MATERIALS)) {
  if (!SHAPES[m.shape]) fail(`${m.id}: unknown shape ${m.shape}`);
  if (!m.desc) fail(`${m.id}: missing desc`);
}
for (const d of Object.values(MONSTERS)) {
  for (const dr of d.drops || []) mat(dr.id, 'monster ' + d.id);
  if (!d.model || !d.model.arch) fail(`${d.id}: no model arch`);
}
for (const [i, R] of REGIONS.entries()) {
  if (!MONSTERS[R.boss]) fail(`region ${i}: boss ${R.boss}`);
  for (const e of R.elite) if (!MONSTERS[e]) fail(`region ${i}: elite ${e}`);
  for (const t of R.tunnels) if (!TUNNELS[t]) fail(`region ${i}: tunnel ${t}`);
  if (!Object.values(MONSTERS).some((m) => m.region === i && m.tier === 'normal')) fail(`region ${i}: no normal monsters`);
}
for (const [id, r] of Object.entries(RECIPES)) { if (!BLUEPRINTS[r.bp]) fail(`recipe ${id}: bp`); r.ings.forEach((x) => mat(x, 'recipe ' + id)); if (r.ings.length > BLUEPRINTS[r.bp].slots) fail(`recipe ${id}: too many ingredients for ${r.bp}`); }
for (const c of Object.values(CHARACTERS)) { c.start.forEach((x) => mat(x, 'char ' + c.id)); c.blueprints.forEach((b) => { if (!BLUEPRINTS[b]) fail(`char ${c.id}: bp ${b}`); }); }

// events: run each choice's outcome against a run and check gains
const rng = new RNG('check');
for (const e of EVENTS) {
  for (const ch of e.choices) {
    const run = new Run('bran', 'ev' + e.id);
    try {
      const out = ch.out(run, rng);
      const outs = [out, out.qte && out.qte.win, out.qte && out.qte.lose].filter(Boolean);
      for (const o of outs) for (const [id] of o.gain || []) mat(id, `event ${e.id}`);
      if (out.fight && !MONSTERS[out.fight]) fail(`event ${e.id}: fight ${out.fight}`);
      if (typeof out.learn === 'string' && !RECIPES[out.learn]) fail(`event ${e.id}: learn ${out.learn}`);
    } catch (err) { fail(`event ${e.id} / ${ch.label}: ${err.message}`); }
  }
}
// systems smoke
for (let r = 0; r < REGIONS.length; r++) {
  const map = generateMap(new RNG('m' + r), r);
  if (map.nodes.filter((n) => n.type === 'boss').length !== 1) fail(`map ${r}: boss count`);
  for (const n of map.nodes) if (n.row < 6 && !n.out.length) fail(`map ${r}: dead end node ${n.id}`);
  const wall = generateMine(new RNG('w' + r), r);
  const mr = new MiningRun(wall, new RNG('x'), { strikes: 2, magnetic: 1, chain: 1 });
  for (let i = 0; i < 5; i++) { const x = i % 7; mr.strike(x, 0); }
  const run = new Run('clover', 'loot' + r);
  run.region = r;
  for (const k of ['wood', 'iron', 'gold']) chestLoot(run, k).items.forEach((it) => mat(it.id, 'chest'));
  merchantStock(run).forEach((it) => mat(it.id, 'shop'));
}
// balance glance: a typical weapon per region vs the region's monsters (bot skill 0.6)
const W = (bp, ids, char = 'clover') => finalizeWeapon(evaluate(bp, ids.map((id) => ({ id, q: 2, uid: Math.random() })), { char }), 2, { char });
const typical = [W('sword', ['iron', 'copper']), W('sword', ['iron', 'silver', 'amethyst']), W('axe', ['iron', 'iron', 'coal', 'ruby']), W('sword', ['mithril', 'gold', 'silver', 'sapphire']), W('hammer', ['magmasteel', 'coal', 'golem_core', 'ruby', 'diamond']), W('sword', ['mithril', 'cursedore', 'silver', 'diamond'])];
for (let r = 0; r < REGIONS.length; r++) {
  const w = typical[r];
  const pool = Object.values(MONSTERS).filter((m) => m.region === r);
  const row = [];
  for (const m of pool) {
    let wins = 0, t = 0, taken = 0;
    for (let i = 0; i < 12; i++) { const res = simulateFight({ hp: 80, maxHp: 80, char: 'clover', coins: 20 }, w, m.id, r, 0.6); wins += res.won; t += res.t; taken += res.taken; }
    row.push(`${m.id}:${Math.round((wins / 12) * 100)}%/${(t / 12).toFixed(0)}s/-${(taken / 12).toFixed(0)}`);
  }
  console.log(`R${r} weapon ${w.dmg}dmg  ` + row.join('  '));
}
console.log(errors ? `\n${errors} problem(s)` : '\nall data checks passed');
process.exit(errors ? 1 : 0);
