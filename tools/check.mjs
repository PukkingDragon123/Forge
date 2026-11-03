// Data integrity + balance smoke checks (no browser needed): `node tools/check.mjs`
// ✘ = error (fails the check) · ⚠ = warning (content another part of the team is still adding)
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { MATERIALS } = await import('../src/data/materials.js');
const { MONSTERS } = await import('../src/data/monsters.js');
const { ACTS } = await import('../src/data/regions.js');
const { RECIPES, BLUEPRINTS } = await import('../src/data/blueprints.js');
const { EVENTS } = await import('../src/data/events.js');
const { CHARACTERS } = await import('../src/data/characters.js');
const { SHAPES } = await import('../src/data/shapes.js');
const { STEWS } = await import('../src/data/stews.js');
const { evaluate, finalizeWeapon } = await import('../src/systems/forge.js');
const { generateMap, nextExits } = await import('../src/systems/mapgen.js');
const { simulateFight, PICK_WEAPON } = await import('../src/systems/combat.js');
const { statueLoot, veinLoot, stoneCost } = await import('../src/systems/petrify.js');
const { previewStew, cook } = await import('../src/systems/cooking.js');
const { encounterFor } = await import('../src/systems/encounters.js');
const { RNG } = await import('../src/core/rng.js');
const { Run, chestLoot } = await import('../src/systems/run.js');
const { makeItem } = await import('../src/systems/items.js');

let errors = 0, warnings = 0;
const fail = (m) => { errors++; console.log('✘', m); };
const warn = (m) => { warnings++; console.log('⚠', m); };
const mat = (id, ctx) => { if (!MATERIALS[id]) fail(`${ctx}: unknown material "${id}"`); };
const missing = new Set();
const monOk = (id, ctx) => { if (!MONSTERS[id] && !missing.has(id)) { missing.add(id); warn(`${ctx}: monster "${id}" not in the roster yet`); } };

for (const m of Object.values(MATERIALS)) {
  if (!SHAPES[m.shape]) fail(`${m.id}: unknown shape ${m.shape}`);
  if (!m.desc) fail(`${m.id}: missing desc`);
  if (['ore'].includes(m.kind) && SHAPES[m.shape].length < 3) fail(`${m.id}: ores take 3–4 cells`);
  if (m.kind === 'forage' && !m.cook) fail(`${m.id}: forage without cook effects`);
}
for (const d of Object.values(MONSTERS)) {
  for (const dr of d.drops || []) mat(dr.id, 'monster ' + d.id);
  if (!d.model || !d.model.arch) fail(`${d.id}: no model arch`);
}
for (const [i, A] of ACTS.entries()) {
  monOk(A.boss, `act ${i} boss`);
  for (const e of A.elite) monOk(e, `act ${i} elite`);
  if (!Object.values(MONSTERS).some((m) => m.region === i && m.tier === 'normal')) warn(`act ${i}: no normal monsters yet`);
}
for (const [id, r] of Object.entries(RECIPES)) { if (!BLUEPRINTS[r.bp]) fail(`recipe ${id}: bp`); r.ings.forEach((x) => mat(x, 'recipe ' + id)); if (r.ings.length > BLUEPRINTS[r.bp].slots) fail(`recipe ${id}: too many ingredients for ${r.bp}`); }
for (const [id, s] of Object.entries(STEWS)) {
  s.ings.forEach((x) => { mat(x, 'stew ' + id); if (MATERIALS[x] && !MATERIALS[x].cook) fail(`stew ${id}: ${x} is not cookable`); });
  const run = new Run('bran', 'stew' + id);
  const p = previewStew(run, s.ings.map((x) => makeItem(x, 2)));
  if (p.recipe !== id || !p.valid) fail(`stew ${id}: not recognised (${p.name})`);
}
for (const c of Object.values(CHARACTERS)) {
  c.start.forEach((x) => mat(x, 'char ' + c.id));
  c.blueprints.forEach((b) => { if (!BLUEPRINTS[b]) fail(`char ${c.id}: bp ${b}`); });
  const run = new Run(c.id, 'fit');
  if (run.bag.overflow.length) fail(`char ${c.id}: start items don't fit the bag`);
  if (run.statues.length !== 3 || run.statues.includes(c.id)) fail(`char ${c.id}: statues`);
  for (const p of c.perks) if (p.short.split(/\s+/).length > 6) warn(`char ${c.id}: perk "${p.short}" over 6 words`);
}

// events: run each choice against a run and check what it hands out
const rng = new RNG('check');
const checkOut = (o, ctx) => {
  if (!o) return;
  for (const [id] of o.gain || []) mat(id, ctx);
  if (o.fight) monOk(o.fight, ctx);
  if (o.text && o.text.length > 48) warn(`${ctx}: result text is long (${o.text.length})`);
};
for (const e of EVENTS) {
  if (!e.acts || !e.vignette) fail(`event ${e.id}: needs acts and vignette`);
  if (e.text.split('\n').length > 2) fail(`event ${e.id}: text over 2 lines`);
  for (const ch of e.choices) {
    if (ch.label.split(/\s+/).length > 6) fail(`event ${e.id}: label "${ch.label}" over 6 words`);
    const run = new Run('bran', 'ev' + e.id);
    run.act = (e.acts || [0])[0];
    run.equip(finalizeWeapon(evaluate('sword', [{ id: 'iron', q: 2, uid: 1 }], {}), 2, {}));
    run.weapon.stone = 0.5;
    const stock = () => { for (const id of ['amethyst', 'iron', 'bat_fang', 'coal', 'cave_moss']) if (!run.bag.all().some((i) => i.id === id)) run.addItem(makeItem(id, 2)); };
    stock();
    const ok = !ch.req || ch.req(run) === true;
    if (!ok) { fail(`event ${e.id} / ${ch.label}: req fails on a well-stocked run`); continue; }
    try {
      for (let k = 0; k < 6; k++) {
        stock();
        const out = ch.out(run, rng);
        checkOut(out, `event ${e.id}`);
        if (out.pick) {
          const it = run.bag.all().find((i) => out.pick.filter({ ...MATERIALS[i.id], ...i }));
          if (!it) fail(`event ${e.id} / ${ch.label}: nothing to pick`);
          else checkOut(out.pick.then(it, run, rng), `event ${e.id} pick`);
        }
      }
    } catch (err) { fail(`event ${e.id} / ${ch.label}: ${err.message}`); }
  }
}
// maps, encounters, loot
for (let a = 0; a < ACTS.length; a++) {
  for (let s = 0; s < 20; s++) {
    const map = generateMap(new RNG('m' + a + s), a);
    if (map.nodes.filter((n) => n.type === 'boss').length !== 1) fail(`map ${a}: boss count`);
    for (const n of map.nodes) {
      if (n.type !== 'boss' && !n.out.length) fail(`map ${a}: dead end node ${n.id}`);
      if (n.out.length > 3) fail(`map ${a}: node ${n.id} has ${n.out.length} ways on`);
    }
    const run = new Run('clover', 'loot' + a + s);
    run.act = a; run.map = map;
    for (const n of map.nodes) {
      const enc = encounterFor(run, n);
      if (enc && enc.params.monster) monOk(enc.params.monster, `encounter ${n.type}`);
      if (enc && enc.params.event && !EVENTS.some((e) => e.id === enc.params.event)) fail(`encounter: event ${enc.params.event}`);
    }
    map.current = map.rows[0][0].id;
    if (!nextExits(map).length) fail(`map ${a}: no exits from the landing`);
  }
  const run = new Run('durgan', 'loot' + a);
  run.act = a;
  chestLoot(run, 'old').items.forEach((it) => mat(it.id, 'chest'));
  for (const hits of [['perfect', 'perfect', 'perfect'], ['good', 'miss', 'good']]) veinLoot(run, a, hits).forEach((it) => mat(it.id, 'vein'));
  for (const m of Object.values(MONSTERS).filter((x) => x.region === a)) statueLoot(run, m, 3, 4).forEach((it) => mat(it.id, 'statue ' + m.id));
}
{ // cooking applies to a run
  const run = new Run('durgan', 'cook');
  run.hp = 20;
  const res = cook(run, ['fern_root', 'cave_moss', 'honeycomb'].map((x) => { const it = makeItem(x, 2); run.addItem(it); return it; }));
  if (!res.ok || run.hp <= 20 || !run.stews.includes('hearty')) fail('cooking: hearty stew did not apply');
  if (stoneCost({ tier: 'normal' }, PICK_WEAPON) !== 0) fail('petrify: the pickaxe takes stone');
}

// balance glance: a typical weapon per act vs the act's monsters (bot skill 0.6)
const W = (bp, ids, char = 'clover') => finalizeWeapon(evaluate(bp, ids.map((id) => ({ id, q: 2, uid: Math.random() })), { char }), 2, { char });
const typical = [W('sword', ['iron', 'copper', 'petrite']), W('sword', ['iron', 'silver', 'amethyst', 'petrite']), W('axe', ['magmasteel', 'iron', 'coal', 'ruby']), W('sword', ['gold', 'gorgonite', 'silver', 'emerald'])];
for (let a = 0; a < ACTS.length; a++) {
  for (const [label, w] of [['typical', typical[a]], ...(a === 0 ? [['pickaxe', PICK_WEAPON]] : [])]) {
    const pool = Object.values(MONSTERS).filter((m) => m.region === a);
    const row = [];
    for (const m of pool) {
      let wins = 0, t = 0, taken = 0;
      for (let i = 0; i < 10; i++) { const res = simulateFight({ hp: 80, maxHp: 80, char: 'clover' }, w, m.id, a, 0.6); wins += res.won; t += res.t; taken += res.taken; }
      row.push(`${m.id}:${Math.round((wins / 10) * 100)}%/${(t / 10).toFixed(0)}s/-${(taken / 10).toFixed(0)}`);
    }
    console.log(`A${a} ${label} ${w.dmg}dmg  ` + row.join('  '));
  }
}
console.log(errors ? `\n${errors} problem(s), ${warnings} warning(s)` : `\nall data checks passed${warnings ? ` (${warnings} warning(s))` : ''}`);
process.exit(errors ? 1 : 0);
