// Data integrity + smoke checks for the v5 systems (no browser needed): `node tools/check.mjs`
// ✘ = error (fails the check) · ⚠ = warning (content another part of the team is still adding)
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { MATERIALS } = await import('../src/data/materials.js');
const { MONSTERS } = await import('../src/data/monsters.js');
const { STAGES } = await import('../src/data/regions.js');
const { RECIPES: BP_RECIPES } = await import('../src/data/blueprints.js');
const { SHRINES, resolveChoice, applyOutcome } = await import('../src/data/events.js');
const { CHARACTERS, STARTER_HERO } = await import('../src/data/characters.js');
const { SHAPES } = await import('../src/data/shapes.js');
const { STEWS } = await import('../src/data/stews.js');
const { SKILLS } = await import('../src/data/skills.js');
const { CRAFT, STATIONS } = await import('../src/data/recipes.js');
const { RNG } = await import('../src/core/rng.js');
const { Run } = await import('../src/systems/run.js');
const { makeItem } = await import('../src/systems/items.js');
const { computeLoadout } = await import('../src/systems/loadout.js');
const { craft, craftPreview, knownRecipes } = await import('../src/systems/crafting.js');
const { generateFloor, encounterFor, doorState, stageBoss, stageRoster } = await import('../src/systems/floorgen.js');
const { rollDrops, statueOre, roomReward, treasureLoot, bossLoot, chestLoot } = await import('../src/systems/loot.js');
const { startMine } = await import('../src/systems/mining.js');
const { unlockedHeroes } = await import('../src/systems/unlocks.js');

let errors = 0, warnings = 0;
const fail = (m) => { errors++; console.log('✘', m); };
const warn = (m) => { warnings++; console.log('⚠', m); };
const mat = (id, ctx) => { if (!MATERIALS[id]) fail(`${ctx}: unknown material "${id}"`); };
const items = (list, ctx) => { for (const it of list || []) { if (!it || !MATERIALS[it.id]) fail(`${ctx}: bad item ${JSON.stringify(it)}`); } };
const missing = new Set();
const monOk = (id, ctx) => { if (!MONSTERS[id] && !missing.has(id)) { missing.add(id); warn(`${ctx}: monster "${id}" not in the roster yet`); } };
const words = (s) => String(s).trim().split(/\s+/).length;
const finite = (o, ctx) => { for (const [k, v] of Object.entries(o)) if (typeof v === 'number' && !Number.isFinite(v)) fail(`${ctx}: ${k} = ${v}`); };

// ---------------------------------------------------------------- materials & items
for (const m of Object.values(MATERIALS)) {
  if (!SHAPES[m.shape]) fail(`${m.id}: unknown shape ${m.shape}`);
  if (!m.desc) fail(`${m.id}: missing desc`);
  if (m.kind === 'ore' && SHAPES[m.shape].length < 3) fail(`${m.id}: ores are bulky (3–4 cells)`);
  if (m.kind === 'gem' && SHAPES[m.shape].length > 2) fail(`${m.id}: gems are small`);
  if (m.kind === 'forage' && !m.cook) fail(`${m.id}: forage without cook effects`);
  if (m.kind === 'weapon' && !(m.wpn && m.wpn.type && m.wpn.dmg)) fail(`${m.id}: weapon without wpn`);
  if (m.kind === 'amulet' && !m.passive && !m.procs) fail(`${m.id}: amulet without passive/procs`);
  if (m.kind === 'charm' && !m.passive && !m.adj) fail(`${m.id}: charm without passive/adj`);
  if (m.kind === 'skill' && !SKILLS[m.skill]) fail(`${m.id}: skill gem → unknown skill ${m.skill}`);
  if (m.kind === 'potion' && !m.potion) fail(`${m.id}: potion without potion`);
  if (m.kind === 'tool' && m.tool && !['pickaxe', 'hammer', 'chisel', 'bomb', 'lantern'].includes(m.tool.kind)) fail(`${m.id}: tool kind ${m.tool.kind}`);
}
const count = (k) => Object.values(MATERIALS).filter((m) => m.kind === k).length;
if (count('amulet') + count('charm') < 16) fail(`only ${count('amulet') + count('charm')} amulets/charms (want ≥ 16)`);
if (Object.keys(SKILLS).length < 10) fail('fewer than 10 skills');
for (const s of Object.values(SKILLS)) {
  if (!s.name || !s.cd || !s.params) fail(`skill ${s.id}: incomplete`);
  if (words(s.desc) > 8) warn(`skill ${s.id}: desc over 8 words`);
  if (!MATERIALS['skill_' + s.id]) fail(`skill ${s.id}: no gem item skill_${s.id}`);
  if (!Object.values(CRAFT).some((r) => r.out === 'skill_' + s.id)) fail(`skill ${s.id}: no recipe crafts it`);
}
for (const k of ['pickaxe', 'hammer', 'chisel', 'bomb', 'lantern']) if (!Object.values(MATERIALS).some((m) => m.tool && m.tool.kind === k)) fail(`no ${k} tool`);

// ---------------------------------------------------------------- recipes (ordered)
if (Object.keys(CRAFT).length < 24) fail(`only ${Object.keys(CRAFT).length} recipes (want ≥ 24)`);
const sets = new Map();
for (const [id, r] of Object.entries(CRAFT)) {
  mat(r.out, 'recipe ' + id);
  r.ings.forEach((x) => mat(x, 'recipe ' + id));
  if (r.ings.length < 2 || r.ings.length > 5) fail(`recipe ${id}: ${r.ings.length} ingredients`);
  if (!STATIONS.includes(r.station)) fail(`recipe ${id}: station ${r.station}`);
  const key = r.ings.slice().sort().join('|');
  if (sets.has(key)) fail(`recipes ${id} and ${sets.get(key)} use the same ingredients`);
  sets.set(key, id);
  // craft it for real from bag items, and check the wrong order only hints
  const run = new Run(STARTER_HERO, 'craft' + id);
  run.bag.items.length = 0; run.bag.overflow.length = 0;
  const its = r.ings.map((x) => { const it = makeItem(x, 2); run.addItem(it); return it; });
  if (new Set(r.ings).size > 1) {
    const wrong = its.slice().reverse();
    if (wrong.map((i) => i.id).join() !== r.ings.join()) { const p = craftPreview(run, wrong); if (p.ok || p.partial.correct + p.partial.misplaced !== r.ings.length) fail(`recipe ${id}: wrong order did not hint`); }
  }
  const res = craft(run, its);
  if (!res.ok || !res.out || res.out.id !== r.out) fail(`recipe ${id}: craft failed (${res.hint})`);
  else if (run.bag.all().some((it) => its.includes(it))) fail(`recipe ${id}: ingredients not consumed`);
}
for (const [id, r] of Object.entries(BP_RECIPES)) r.ings.forEach((x) => mat(x, 'weapon recipe ' + id));
for (const [id, s] of Object.entries(STEWS)) s.ings.forEach((x) => mat(x, 'stew ' + id));

// ---------------------------------------------------------------- heroes, runs, loadouts
if (unlockedHeroes().join() !== STARTER_HERO) fail(`only ${STARTER_HERO} should start unlocked (got ${unlockedHeroes()})`);
for (const c of Object.values(CHARACTERS)) {
  (c.start || []).forEach((x) => mat(x, 'char ' + c.id));
  if (!MATERIALS[c.weapon] || MATERIALS[c.weapon].kind !== 'weapon') fail(`char ${c.id}: starting weapon ${c.weapon}`);
  if (c.id !== STARTER_HERO && !c.unlock) fail(`char ${c.id}: locked heroes need an unlock line`);
  for (const p of c.perks) if (words(p.short) > 6) warn(`char ${c.id}: perk "${p.short}" over 6 words`);
  const run = new Run(c.id, 'fit');
  if (run.bag.overflow.length) fail(`char ${c.id}: start items don't fit the bag`);
  if (!run.hand) fail(`char ${c.id}: no weapon in hand`);
  if (run.statues.length !== 3 || run.statues.includes(c.id)) fail(`char ${c.id}: statues`);
  const lo = computeLoadout(run);
  if (!lo.weapon || !lo.weapon.dmg || !lo.weapon.type) fail(`char ${c.id}: loadout weapon`);
  finite(lo.stats, `char ${c.id} stats`);
  if (lo.maxHp !== run.maxHp || !(lo.maxHp > 0)) fail(`char ${c.id}: maxHp ${lo.maxHp}/${run.maxHp}`);
}
{ // equip / drink / effects / synergies
  const run = new Run(STARTER_HERO, 'equip');
  const gem = makeItem('skill_whirlwind', 2); run.addItem(gem);
  run.equipSkill(gem, 1);
  if (computeLoadout(run).skills[1] !== 'whirlwind') fail('equipSkill: skill not slotted');
  const amu = makeItem('glass_fang', 2); run.addItem(amu);
  if (!(computeLoadout(run).stats.crit > 0.15)) fail('amulet passive not counted');
  const sword = makeItem('copper_sword', 2); run.addItem(sword);
  const old = run.equipWeapon(sword);
  if (!old || run.hand !== sword || !run.bag.all().includes(old)) fail('equipWeapon swap');
  const te = makeItem('twin_edge', 2); run.bag.items.length = 0; run.bag.place(te, 0, 0, 0); run.bag.place(old, 1, 0, 0);
  if (!computeLoadout(run).links.length) fail('charm adjacency not linked');
  run.hp = 10; const p = makeItem('healing_potion', 2); run.addItem(p);
  const d = run.drink(p); if (!d || !(d.healed > 0)) fail('drink: no heal');
  run.addItem(makeItem('haste_brew', 2)); run.drink(run.bag.all().find((i) => i.id === 'haste_brew'));
  if (!(computeLoadout(run).stats.moveSpd > 1)) fail('potion effect not applied');
  for (let i = 0; i < 3; i++) run.roomCleared();
  if (run.effects.length) fail('effects did not expire');
}

// ---------------------------------------------------------------- floors, encounters, loot, mining
for (let st = 0; st < STAGES.length; st++) {
  monOk(stageBoss(st), `stage ${st} boss`);
  if (!stageRoster(st, 'normal').length) warn(`stage ${st}: no normal monsters`);
  for (let s = 0; s < 40; s++) {
    const f = generateFloor(new RNG('f' + st + ':' + s), st);
    const rooms = [...f.rooms.values()];
    const typeN = (t) => rooms.filter((r) => r.type === t).length;
    if (typeN('boss') !== 1 || typeN('start') !== 1) fail(`floor ${st}/${s}: start/boss count`);
    if (rooms.length < 9) fail(`floor ${st}/${s}: only ${rooms.length} rooms`);
    if (!typeN('treasure') || !typeN('craft') || typeN('vein') < 2) fail(`floor ${st}/${s}: missing special rooms`);
    if (typeN('fight') < Math.max(typeN('vein'), typeN('treasure'), typeN('craft'))) fail(`floor ${st}/${s}: fights should be most common`);
    // reachable through normal doors (secret only through hidden ones)
    const seen = new Set([f.startId]); const q = [f.startId];
    while (q.length) { const r = f.rooms.get(q.shift()); for (const [dir, nid] of Object.entries(r.doors)) if (nid !== null && !seen.has(nid) && !r.hidden[dir]) { seen.add(nid); q.push(nid); } }
    for (const r of rooms) if (r.type !== 'secret' && !seen.has(r.id)) fail(`floor ${st}/${s}: room ${r.id} unreachable`);
    for (const r of rooms) for (const [dir, nid] of Object.entries(r.doors)) if (nid !== null) {
      const n = f.rooms.get(nid);
      if (!Object.values(n.doors).includes(r.id)) fail(`floor ${st}/${s}: one-way door ${r.id}→${nid}`);
      if (doorState(f, r, dir) === null) fail(`floor ${st}/${s}: doorState null for a door`);
    }
    const boss = f.rooms.get(f.bossId);
    if (Object.values(boss.doors).filter((x) => x !== null).length !== 1) warn(`floor ${st}/${s}: boss room is not a dead end`);
    const run = new Run(STARTER_HERO, 'enc' + st + s);
    run.enterStage(st);
    for (const r of rooms) {
      const e = encounterFor(run, r);
      for (const w of e.waves) for (const m of w) { monOk(m.id, `encounter ${r.type}`); if (!(m.n >= 1)) fail('encounter n'); }
      if (r.type === 'fight' && !e.waves.length && stageRoster(st, 'normal').length) fail(`floor ${st}: fight room without enemies`);
    }
  }
  const run = new Run(STARTER_HERO, 'loot' + st);
  run.enterStage(st);
  for (const m of Object.values(MONSTERS).filter((x) => x.region === st)) {
    items(rollDrops(run, m), 'drops ' + m.id);
    for (const [id] of statueOre(run, m)) mat(id, 'statue ' + m.id);
    const mine = startMine(run, { source: 'statue', monster: m });
    let guard = 0;
    while (!mine.done && guard++ < 60) {
      const t = mine.tiles.flat().find((x) => mine.canUse('pickaxe', x.x, x.y) === true);
      if (!t) break;
      mine.use('pickaxe', t.x, t.y);
    }
    items(mine.finish().items, 'statue mine ' + m.id);
  }
  for (let i = 0; i < 8; i++) {
    items(roomReward(run, { size: 'large' }), 'room reward');
    const t = treasureLoot(run); items([t.pedestal, ...t.extras], 'treasure');
    items(chestLoot(run, 'old').items, 'chest');
  }
  items(bossLoot(run, st), 'boss loot');
  // a vein session with every tool
  for (const id of ['hammer', 'chisel', 'bomb', 'lantern']) run.addItem(makeItem(id, 2));
  const mine = startMine(run, { source: 'vein' });
  for (const k of ['lantern', 'bomb', 'hammer', 'chisel', 'pickaxe', 'pickaxe', 'pickaxe']) {
    const t = mine.tiles.flat().find((x) => mine.canUse(k, x.x, x.y) === true);
    if (t) { const r = mine.use(k, t.x, t.y); if (!r.ok) fail(`mine ${k}: ${r.reason}`); }
  }
  const out = mine.finish();
  items(out.items, 'vein mine');
  if (!(out.hpLoss >= 0)) fail('mine hpLoss');
  if (run.bag.all().some((i) => i.id === 'bomb')) fail('bomb not consumed');
}

// ---------------------------------------------------------------- shrine events
const rng = new RNG('check');
for (const e of SHRINES) {
  if (!e.stages || !e.vignette) fail(`shrine ${e.id}: needs stages and vignette`);
  if (e.text.split('\n').length > 2) fail(`shrine ${e.id}: text over 2 lines`);
  if (words(e.title) > 3) warn(`shrine ${e.id}: title over 3 words`);
  for (const l of e.lines || []) if (words(l.text) > 12) warn(`shrine ${e.id}: line over 12 words`);
  for (const ch of e.choices) {
    if (words(ch.label) > 6) fail(`shrine ${e.id}: label "${ch.label}" over 6 words`);
    for (let k = 0; k < 5; k++) {
      const run = new Run(STARTER_HERO, 'ev' + e.id + k);
      run.stage = e.stages[0];
      for (const id of ['amethyst', 'iron', 'glowcap', 'cave_moss', 'glass_fang']) run.addItem(makeItem(id, 2));
      try {
        let out = resolveChoice(run, e, ch, rng);
        if (out.blocked) { fail(`shrine ${e.id} / ${ch.label}: req fails on a stocked run (${out.text})`); break; }
        if (out.pick) {
          const it = run.bag.all().find((i) => out.pick.filter({ ...MATERIALS[i.id], ...i }));
          if (!it) { fail(`shrine ${e.id} / ${ch.label}: nothing to pick`); break; }
          out = out.pick.then(it, run, rng);
        }
        if (out.text && out.text.length > 48) warn(`shrine ${e.id}: result text long`);
        for (const [id] of out.gain || []) mat(id, `shrine ${e.id}`);
        if (out.fight) monOk(out.fight, `shrine ${e.id}`);
        applyOutcome(run, out);
        finite({ hp: run.hp, maxHp: run.maxHp }, `shrine ${e.id}`);
      } catch (err) { fail(`shrine ${e.id} / ${ch.label}: ${err.message}`); break; }
    }
  }
}
if (SHRINES.filter((e) => e.stages.includes(0)).length < 8) fail('stage 0 needs ≥ 8 shrines');
if (!knownRecipes(new Run(STARTER_HERO, 'k')).includes('spore_burst')) fail('the tutorial recipe (spore_burst) must start known');

console.log(`\n${Object.keys(MATERIALS).length} materials · ${count('weapon')} weapons · ${count('amulet')} amulets · ${count('charm')} charms · ${count('skill')} skill gems · ${count('tool')} tools · ${count('potion')} potions · ${Object.keys(CRAFT).length} recipes · ${SHRINES.length} shrines`);
console.log(errors ? `\n${errors} problem(s), ${warnings} warning(s)` : `\nall data checks passed${warnings ? ` (${warnings} warning(s))` : ''}`);
process.exit(errors ? 1 : 0);
