# FORGLITE — Medusa's Curse (v4 redesign)

The source of truth for the v4 rebuild. Every agent reads this first. Where this file and older
code disagree, this file wins. Keep to your file scope (§9); talk to other modules only through the
contracts in §7–8.

## 1. What the player asked for (paraphrased, all of it matters)

- Explorers are **much shorter: chibi** — big heads, stubby bodies — but **more detailed, cool and cute**.
- The crew is **a group of forgers making a living digging diamonds and ore goods**. Their **camp is in a
  dungeon** (full dungeon theme), with **stew** on the fire.
- **Main menu 100× better. No loading screen.** It opens straight onto **the crew resting** at camp.
  **No intro cutscene at boot.**
- **Click a forger → the camera zooms in on them cinematically.** Click **Choose** → the **intro
  cinematic** starts:
  1. You drink **stew from the gnome** (Durgan; if you *are* Durgan, Bran ladles) — it's really good.
  2. Your forger says they **found something in a weird, very old, scary chest**.
  3. They pull out a **totem**: a statuette of **a beautiful girl covering her eyes, wrapped in snakes**
     (Medusa).
  4. You **trip over your pet mole-dog**; the statuette **breaks**.
  5. **The ground splits**; a figure **crawls out — Medusa**. She **thanks you for freeing her and will
     spare you**.
  6. She **petrifies all your friends, your ores and your weapon**.
  7. She **unleashes her snake heralds** to chase you. You **scoop up the dog and run** — a
     **first-person running cinematic** through detailed caves.
- Exploration is **first person**, **not side-scrolling**, a **"Minecraft-like cage system"**: blocky
  voxel tunnels where you choose **left / right / forward** and walk on. **Don't show anything**
  while walking (no UI), but **encounters happen**: a monster suddenly appears, you see an **ore vein**,
  or a **random event like Slay the Spire** — **all in first-person cinematic**, with **cool
  choice-based events**.
- **To get ore**: either a **QTE to mine an ore vein**, or **defeat a monster** — **your sword
  petrifies the defeated monster** and **you mine the statue for ore**. New, **strategy based**.
- Environments and mines look like **dungeon + nature**, **super stunning**.
- **Remove too much text and QTEs.** **Ore takes more backpack slots.** **More monster encounters.**
- **A map like Slay the Spire**: an **old map** you can look at so you **don't get lost in the cave**.
- **No elevators. No NPCs.** (No merchants, no talking strangers.)
- **Your job: kill all the snakes and rescue your friends.**
- The game is **much more about strategy: gathering ingredients and crafting.**

## 2. Story and structure

The **Forglite crew** — Bran (blacksmith), Elio (elemental mage with Kindle), Durgan (gnome warrior
and the camp cook), Clover (rabbit rogue) — plus their **pet mole-dog, Pip**, live in a camp in an old
dungeon and sell what they dig.

**Intro** (after Choose, §4). Medusa petrifies the three friends you did not pick, the ore sacks, the
diamond crate and your weapon. Each of her three **Snake Heralds** coils around one statue-friend and
drags it down into a crack. The fourth snake chases you. First-person chase. You fall/slide into the
Undercroft; silence; Pip licks your face; you find **the old map** in your pack. Act 1 begins.

**Acts** (Slay-the-Spire style; each act is one map):

| # | id | Name | Look | Boss |
|---|----|------|------|------|
| 0 | `undercroft` | The Mossy Undercroft | brick vaults, iron gates, roots through the ceiling, moss, ferns, waterfalls, torches | **Thornscale** — moss & thorn serpent |
| 1 | `cistern` | The Crystal Cistern | flooded halls, arches standing in water, crystal clusters, lily pads, glow-fish | **Glasscoil** — crystal serpent |
| 2 | `foundry` | The Ember Foundry | ancient dwarf forge-halls, lava channels, chains, anvils, ash-trees with ember leaves | **Cinderfang** — two-headed fire serpent |
| 3 | `garden` | Medusa's Garden | overgrown marble temple, statues of petrified adventurers, snake carvings, pale jade light | **Medusa** |

Each Herald's venom keeps one friend in stone. **Kill the Herald → the friend's statue cracks → the
friend steps out** (rescue cinematic) and **joins as a companion** (§5.6). The order of rescues is
the order of the other three crew in `CHARACTER_ORDER`, skipping the hero. Act 3 is short (≈6 rows)
and ends with Medusa. Win: the four crew + Pip back at camp, eating stew.

## 3. Screens and flow

```
boot ─► title (camp menu, instant) ─click forger─► zoom ─Choose─► cutscene 'intro' (3rd person)
     ─► cutscene 'chase' (1st person) ─► delve (act 0 start) ─► … ─► boss ─► cutscene 'rescue_<id>' ─► delve (next act)
     … act 3 boss 'medusa' ─► cutscene 'ending' ─► title
death at any point ─► cutscene 'fallen' (you turn to stone) ─► title
```

Scene names (registered in `scenes/index.js` by the integrator):

| name | file | owner | what |
|---|---|---|---|
| `title` | scenes/title.js | F | camp menu, zoom, choose |
| `cutscene` | scenes/cutscene.js | F | all cinematics (overlay or scene) |
| `delve` | scenes/delve.js | E1 | first-person walk, junction choice, raising the old map |
| `combat` | scenes/combat.js | E2 | first-person fight → petrify → mine the statue |
| `vein` | scenes/vein.js | E1 | first-person ore-vein mining QTE |
| `event` | scenes/event.js | E1 | first-person choice event |
| `treasure` | scenes/treasure.js | E1 | first-person old chest (sometimes a monster) |
| `camp` | scenes/camp.js | D | rest site: Rest / Cook / Forge (third person, cozy nook) |
| `oldmap` | scenes/oldmap.js | D | overlay: the hand-inked old map |
| `bag` | scenes/bag.js | D | overlay: backpack |
| `reveal` | scenes/reveal.js | (keep) | overlay: card + voxel model reveal |
| `pause` | scenes/pause.js | (keep) | overlay |
| `gameover`, `victory` | scenes/endings.js | F | thin wrappers around the cinematics |

**Removed** (integrator deletes at the end): `crossroads`/`map`, `travel`, `travel_qte`, `mining` (grid
wall), `merchant` (rooms.js), old cutscene scripts `prologue`, `dive`, `descend`, every elevator,
every NPC (mole merchant etc.).

`scenes/flow.js` (owner **E1**) is the glue. Its exported API (others call only these):

```js
startRun(game, charId, seed)        // new Run, then cutscene 'intro' → 'chase' → delve
enterNode(game, node)               // called by delve when you arrive at a node: routes to the node's scene
finishNode(game, opts)              // encounter done → back to delve (walk on), or boss → rescue → next act
gameOver(game, cause)               // → cutscene 'fallen'
victory(game)                       // → cutscene 'ending'
openBag(game, { loot, onClose })    // bag overlay (D's scene)
openMap(game, { pick, onPick })     // old map overlay (D's scene); pick:true lets the player choose the next node
```

## 4. Look, feel and text rules (everyone)

- **Voxel art everywhere**, Eastward-colourful lighting, many 2D particles, no lazy 2D. Environments
  are **dungeon + nature**: masonry, arches, iron, chains, torches *and* roots, moss, ferns, vines,
  flowers, mushrooms, water, fireflies. Super stunning, colourful, lit.
- **Chibi crew**: ≈2.2–2.6 heads tall, head ≈40% of height, stubby limbs, big gloves/boots, readable
  silhouettes, **still no realistic faces** (Bran: visor/goggles; Durgan: helmet + beard; Clover:
  porcelain rabbit mask; Elio: glowing eyes in the hood). Detailed (fine voxel grid), cute and cool.
- **First person** uses blocky voxel worlds on the 0.04 grid (Minecraft-like chunky but richly
  coloured and lit). Camera eye height ≈ 0.95 m (chibi hero carrying Pip). Gentle head bob, never
  nausea-inducing; FOV ≈ 62°.
- **Text diet**: no paragraphs. Event text ≤ 2 short lines. Choices ≤ 6 words + icons. Tooltips:
  name + one line + icons/numbers. Speech: ≤ 8 words, rare. Prefer icons, numbers, sound and motion.
- **QTE diet**: at most **one** kind of timed input per activity. Vein mining = a swing-timing QTE
  (the one big QTE). Combat = auto-battle plus an optional Guard tap (no strike-timing QTE). Forging =
  one short 3-beat hammer. Walking = none. Events = none.
- **No loading screen**: anything heavy builds progressively behind darkness, fog or a cinematic
  fade; never a "loading" text.
- **Mobile**: everything works with taps on an 844×390 landscape phone (and the rotated portrait
  mode). On-screen buttons via `ui.touchButton`. Perf budget: a first-person chamber ≤ 250k quads,
  builds ≤ 1.2 s on desktop, streamed where possible.

## 5. Game systems (owner **D** unless noted)

### 5.1 Run state (`systems/run.js`)

```js
new Run(charId, seed)
run.char, run.act (0–3), run.hp, run.maxHp
run.bag            // Backpack 6×5
run.weapon         // { ...finalized weapon, stone: 0..1 } or null (then you fight with the pickaxe)
run.map            // current act map (5.2)
run.companions     // ids of rescued friends, in rescue order
run.statues        // ids still in stone (the other three crew at start)
run.buffs          // [{ id, name, icon, fights: n, ...effects }] from stews
run.recipes        // known stew + weapon recipes
run.stats          // kills, statues mined, veins, stews, forged, …
run.heal(n), run.hurt(n) -> dead?, run.addItem(it) -> placed?, run.removeItem(it)
run.nextAct()      // map for the next act; heals 30%
run.rescue(id)     // move a friend from statues to companions
run.hasCompanion(id)
```
No coins (no merchants). Remove coin UI.

### 5.2 Map (`systems/mapgen.js`)

`generateMap(rng, act)` → `{ act, nodes, edges, rows, current, visited }`, same node shape as today
(`{ id, row, col, x, y, type, out, in, done }`). Rows: acts 0–2 = 10 rows, act 3 = 6 rows. 2–4 nodes
per row, no crossing edges, at most **3** outgoing edges per node (they become left / forward / right
in first person — `node.out` sorted by x: left→right).

Node types: `start`, `monster`, `elite`, `vein`, `event`, `treasure`, `camp`, `boss`.
Weights rows 2…n-3: monster 42, vein 18, event 16, elite 10 (row ≥ 3), treasure 6, camp 8 (row ≥ 4).
Row 1 is monster/vein. Row n-2 is all `camp`. Last row `boss`. At least 2 veins and 1 treasure per
act. **More monsters than before** — monster is always the most common type.

### 5.3 Materials and the backpack (`data/materials.js`, `data/shapes.js`, `systems/backpack.js`)

Keep every existing material id (others reference them). Changes:
- **Ores take more room**: metal ores 3–4 cells (`i3`, `l3`, `l4`, `t4`, `s4`, `o4`), rare ores up to 4;
  gems 1–2 cells; crystals 2; minerals 2; parts 1–2; forage 1.
- New kind **`forage`** (cooking ingredients; ids fixed — other agents use them):
  `glowcap` (exists, becomes forage), `cave_moss`, `fern_root`, `ember_pepper`, `frost_lily`,
  `honeycomb`, `snake_egg`, `bitterbark`, `stone_salt`, `starfruit`.
- New monster parts (drops for the new snakes): `snake_scale`, `venom_gland`, `serpent_fang`,
  `herald_scale` (boss), `gorgon_tear` (Medusa).
- New ore from petrified foes: `petrite` (common grey "stone ore" that every statue gives a little of —
  smeltable, weak, plentiful) and `gorgonite` (rare green-black stone ore from elites and bosses).
- Backpack 6×5, rotation, overflow → discard. Weapons are equipped, not in the bag.

### 5.4 Combat stats, petrify and statue loot (`systems/combat.js`, `systems/petrify.js`)

- Keep `CombatSim` but remove strike-timing (strikes are automatic; crits roll by chance). Inputs:
  `pressGuard()` (perfect = parry), `useSpecial()`. Monster HP/damage scale by **act** (4 entries).
- **Petrify**: your blade carries Medusa's stone. On a kill the foe turns to stone; **the stone creeps
  up your blade**: `weapon.stone += stoneCost(monsterDef)` (normal 0.12, elite 0.25, boss 0.4). At
  `stone >= 1` the weapon is fully stone and **crumbles after the fight** → you fight with the
  pickaxe (`PICK_WEAPON`, weak) until you forge again. Stews/items can reduce stone.
- `statueLoot(run, monsterDef, cracksHit)` → items: always some `petrite`, plus the monster's
  material drops (`def.drops`), plus an ore or gem tied to the monster's theme; more cracks hit → better
  quality and an extra roll.
- `veinLoot(run, act, hits)` (hits = [{q:'perfect'|'good'|'miss'}…]) → ore items by act.

### 5.5 Crafting (`systems/forge.js` keep, `systems/cooking.js` new, `data/stews.js` new)

- **Forge** (at camp): blueprint + ore cards in the mould → weapon (existing `evaluate` /
  `finalizeWeapon`), then **one short 3-beat hammer** for the grade. New weapon starts at `stone: 0`.
- **Cook** (at camp): drop 2–4 ingredients (forage, parts, sometimes gems) in the pot → a **stew**
  with effects for the next N fights or instantly: heal, +max HP, +damage %, −stone per kill
  ("Gorgon Broth"), +statue loot, +guard window, regen. Named stews are discovered recipes
  (`data/stews.js`: `{ id, name, ings: [...], effects, fights }`); unknown mixes still give a weak
  generic stew from their tags. Durgan (hero or companion) makes stews 50% stronger.
- **Rest**: heal 30% max HP.
- A camp site gives **one** action (Rest / Cook / Forge) — strategy. Each rescued companion adds a
  free extra action of their speciality (Bran: Forge, Durgan: Cook, Elio: Enchant (+element to the
  weapon), Clover: Scout (reveals the event types on the map and +1 treasure roll)).

### 5.6 Characters data (`data/characters.js`)

Short, icon-friendly: `{ id, name, title, hp, color, start: [item ids], blueprints, perks: [{ icon,
name, short }] }` — `short` ≤ 6 words. Companion bonus per crew member (`companion: { icon, short }`).
Barks: at most 6 tiny lines each.

### 5.7 Events (`data/events.js`, owner **D**)

≥ 16 events across the acts. **No NPCs** — places, objects, creatures that don't talk. Each:
`{ id, acts: [..], title (≤ 3 words), text (≤ 2 short lines), vignette: <key>, choices: [{ label (≤ 6
words), icon, effect, risk? }] }`. Examples: Snake Egg Clutch, Petrified Adventurer (statue holding a
sword), Mushroom Ring, Root-bound Chest, Old Dwarf Forge, Whispering Well, Hot Spring, Collapsed
Bridge, Glowworm Grotto, Sleeping Troll, Herb Garden (gather forage), Shrine of Scales. `vignette`
keys are the props E1 builds in the chamber (list them in `data/events.js` header).

## 6. Models (contracts)

### 6.1 Crew, pet, Medusa, first-person arms — owner **A** (`models/characters.js`, `vox_char_*.js`, new `models/pet.js`, `models/medusa.js`, `models/fp_arms.js`)

```js
buildCharacter(id) → Character            // SAME API as today, now chibi
  .group, .play(name, opts), .update(dt), .setExpression(e), .hold(mesh, hand), .showBackItem(b),
  .lookAt(v3|null), .headPos(out), .setSeated(b, h), .flash(c, t), .impactTime(name), .setVisible(b)
  NEW .setStone(k)        // 0..1 petrification: grey stone sweeps up from the feet, cracks, colour gone; 1 = statue (animation frozen)
  NEW anims: 'sitEat' (spoon from bowl), 'drink', 'present' (holds an object up, proud), 'trip' (stumble
      forward, arms flail, falls), 'cower', 'carry' (arms around Pip at chest), 'run', 'stir' (ladle in pot),
      'sleep', 'polish', 'read', 'count' (counting gems), 'cheer', 'hug', 'stepOut' (breaking out of stone)
buildPet() → Pet   (Pip the mole-dog: mole snout & digging claws, floppy dog ears, wagging tail, chibi)
  .group, .play('idle'|'sleep'|'walk'|'run'|'sniff'|'bark'|'dig'|'yelp'|'carried'|'happy'|'lick'), .update(dt), .lookAt(v)
buildMedusa() → MedusaModel   // beautiful chibi-proportioned but tall gorgon, snake hair (animated snakes), coils/serpent tail,
                              // eyes covered by her hands or a veil until the gaze; elegant, menacing
  Monster-compatible: .group, .play('idle'|'windup'|'attack'|'hurt'|'stun'|'roar'|'special'|'die'|'intro'), .update(dt),
       .height, .bounds (Box3), .hitPoint (v3), .flash(c,t), .setPhase(n), .cutPoints [], .fly 0, .dispose()
  Cinematic: .play('crawlOut'|'rise'|'talk'|'gaze'|'summon'|'laugh'), .setEyes(open: 0..1), .setStone(k)
buildMedusaTotem() → THREE.Group   // the statuette: girl covering her eyes, wrapped in snakes; .shatter() returns pieces for the trip
buildFPArms(charId) → FPArms       // chibi gloved hands/sleeves in first person (matches each hero)
  .group (parent it to the camera), .hold('weapon'|'pickaxe'|'map'|'torch'|'pet'|'none', mesh?),
  .play('idle'|'walk'|'run'|'swing'|'guard'|'parry'|'special'|'mine'|'mineHit'|'raiseMap'|'lowerMap'|'hurt'|'reach'|'cast'), .update(dt, { speed })
```
Pip rides in the left arm while running (`hold('pet')`) and trots ahead while walking (a separate
Pet in the world, E1 decides). Medusa is registered as monster id `medusa` (B adds the data entry
with `model: { arch: 'medusa' }`; `models/monsters.js` delegates `arch: 'medusa'` to `buildMedusa()`).

### 6.2 Monsters and snakes — owner **B** (`models/monster*.js`, `vox_mon*.js`, `data/monsters.js`)

- Same `buildMonster(id)` API. Monsters must **face the first-person camera** well (their front looks
  down +Z when `group.rotation.y = 0`; set this consistently and document it in `monsters.js`), and
  attacks lunge toward the camera.
- NEW `monster.setStone(k)` (0..1, freeze at 1), `monster.stoneCracks()` → 3–6 world-space points on the
  statue where glowing cracks appear (tap targets), `monster.crackAt(i)` (a crack opens, chips fly),
  `monster.shatter()` → `{ pieces, update(dt) }` voxel chunks bursting apart (ore chunks glint).
- **New snakes** (ids fixed): normals `adder` (act 0), `vine_viper` (0), `glass_adder` (1), `cistern_naga`
  (1), `ember_asp` (2), `gorgon_snake` (3); elites `coil_brood` (0, a knot of snakes), `basilisk` (3);
  bosses `thornscale` (0), `glasscoil` (1), `cinderfang` (2, two heads). Snakes are cool RPG serpents
  (horns, frills, armour plates, glowing markings), not plain animals.
- **Roster per act** (`data/monsters.js`, use `region`/act index 0–3): ≥ 6 normals and ≥ 2 elites per
  act, built from the existing RPG roster + the snakes. Reuse old bosses as elites where they fit
  (rustjaw → act 0 elite, geodessa → act 1 elite, pyrrhax → act 2 elite, warden → act 3 elite).
  Export `actPool(act, tier)` (replaces `regionPool`).
- `drops` reference material ids from §5.3.
- Data fields unchanged otherwise (`hp`, `dmg`, `armor`, `speed`, `tier`, `region`, `attacks`, …).

### 6.3 Environments — owner **C** (`models/stage_vox*.js`, `models/prop*.js`, new `models/fp_world.js`)

- `buildStage('campmenu', 0)` — the dungeon camp (main menu + intro + ending). Must show a **first
  frame in < 0.5 s** on desktop: build a small core (floor around the fire, fire, pot, seats) first and
  **stream** the rest of the dungeon in over the next frames (chunks per frame), hidden by darkness
  and revealed as torches flicker on. Contents: vaulted brick dungeon room with arches, iron gate,
  chains, banners, braziers + roots, moss, ferns, hanging vines, a small waterfall into a pool,
  glowing mushrooms; campfire with a **stew pot on a tripod**, bowls, bedrolls, log seats; **ore sacks
  and a glittering diamond crate** (their livelihood), an anvil, pick rack, **the scary old chest**,
  Pip's bed, the old map pinned on a crate. Anchors: `seats{bran,elio,durgan,clover}` (pos, facing,
  height), `pot`, `fire`, `chest`, `petBed`, `crack` (line where the floor splits in the intro),
  `crackOpen(k)` method that animates the split, `medusaRise` (pos), `exitTunnel` (where you flee),
  `sacks`, `crate`, camera presets `cams.menu`, `cams.zoom[charId]`.
- First-person world kit (`models/fp_world.js`), all on the 0.04 grid, per act palette (§2 table):
  ```js
  buildFP('tunnel', act, { seed, length: 8..16, bend: -1|0|1, chase?: bool })  // walkable tunnel
     → stage with .anchors.path (THREE.CatmullRomCurve3 at eye height), .update(dt,t), .attach(scene), .dispose()
  buildFP('junction', act, { seed, exits: [-1,0,1] subset })   // room where the way splits left/forward/right
     → .anchors.stand (pos), .anchors.exits[{ dir, pos, look, mouth }]  // mouth = point inside the opening
  buildFP('chamber', act, { seed, kind: 'monster'|'elite'|'vein'|'event'|'treasure'|'boss', vignette? })
     → .anchors.enter, .anchors.stand, .anchors.look, .anchors.spawns[{ pos, from: 'floor'|'ceiling'|'wall'|'water' }],
       .anchors.vein { pos, normal } (kind vein), .anchors.chest (kind treasure), .anchors.event (kind event),
       .anchors.exit, .anchors.friend (kind boss: where the petrified friend stands)
  buildFP('chase', act, { seed })  // the long intro escape: twisting tunnel with set pieces (a jump over
     a gap, a root curtain, a narrow ledge, a slide down at the end); anchors.path + anchors.beats[{ t, kind }]
  ```
  Streaming: tunnels and chase build segment by segment as the camera advances (like today's
  corridor). Fog/darkness hides the far end. Every stage keeps the existing `Stage` interface
  (`group`, `fog`, `background`, `update`, `attach`, `setCamera`, `flames`, `lights`).
- Camp rest site (for D's `camp` scene): `buildStage('campsite', act, {})` — a small dungeon nook with a
  fire, pot, anvil, seats for hero + up to 3 companions + Pip. Anchors `seats[]`, `pot`, `anvil`, `fire`.
- Keep `buildStage('arena'|'tomb'|…)` working until the integrator removes callers.
- Remove elevator / NPC props from all builders.

## 7. First-person scenes (owners **E1**, **E2**)

Shared FP rig — `gfx/fpcam.js` (owner **E1**, E2 uses it):
```js
new FPCam({ fov: 62 }) → .camera, .arms (FPArms), .pet (optional Pet in world)
  .moveAlong(curve, dur, { ease, bob, onArrive }) .lookTo(v3, dur) .turnTo(yaw, dur)
  .shake(a) .punch(dir) .bob(k) .update(dt) .breathe(on)
  .dragLook(input)   // drag/mouse to glance around a little, springs back
```

**E1 — delve, vein, event, treasure, flow**
- `delve`: arrive → (encounter scene) → walk out → junction → choose. At a junction the player
  raises the **old map** in first person (FPArms `raiseMap`), sees the next nodes (D's `oldmap`
  overlay in `pick` mode, or tapping a tunnel mouth in the world: left/forward/right each map to
  `node.out` sorted by x). Choosing turns the camera and walks into that tunnel (8–12 s, hold/tap to
  hurry), then `enterNode`. While walking: **no UI**; Pip trots ahead and sniffs; little cinematic
  touches (bats, drips, a snake shadow passing, fireflies). Sometimes (≈20%) a **monster ambushes in the
  tunnel** instead of waiting in the room (flavour: same combat).
- `vein`: chamber with a glittering ore vein. **The QTE**: a swing meter (a sweeping glint along the
  vein); tap at the bright spot; 3 swings (+1 with a good pickaxe); perfect / good / miss → `veinLoot`;
  each hit chips voxels and ore chunks fly into the bag (`reveal` for rare+). Pip digs out a bonus
  chunk sometimes.
- `event`: chamber vignette (E1 builds vignette props from C's kit or prop kits), event title in a
  small inked tag, ≤ 2 lines, 2–3 choices as wooden tags with icons; outcome shown with motion + a
  one-line result.
- `treasure`: the old chest; open (creak, light), loot; 1 in 5 is a mimic/snake ambush → combat.
- `flow.js` (API in §3).

**E2 — combat (first person), petrify, statue mining**
- Monster enters from its spawn (`from` ceiling/wall/floor/water) with a short cinematic, faces the
  camera; auto-battle runs; your FPArms swing your weapon (or the pickaxe); monster wind-ups glow →
  optional **Guard** (tap / Space; perfect = parry). **Special** when charged (one button). HP shown
  as a tiny heart counter + the monster's small bar; damage numbers as pixel pops. Companions help
  (Elio's Kindle casts, Durgan's shout blocks once, Clover's knife throw, Bran's sharpen) — small
  icons, auto.
- Win → **petrify cinematic**: stone spreads from the wound over the foe (`setStone`), freezes mid-pose;
  the stone creeps up your blade (`weapon.stone`, show it on the blade + a tiny stone meter). Then
  **mine the statue**: glowing cracks appear (`stoneCracks`), tap them (3–6, ~4 s, generous), each
  `crackAt`; then `shatter` → chunks → `statueLoot` → loot flies to the bag (`openBag` if it does not
  fit). If the blade is full stone it crumbles (sad beat) → pickaxe.
- Lose → `gameOver`.
- Boss fights: herald intro cinematic (F's `boss_<id>` script) then the same fight with phases; win →
  petrify → mine → `finishNode` → rescue.

## 8. Menu and cinematics — owner **F** (`scenes/title.js`, `scenes/cutscene.js`, `art/cutscene_art.js`, `scenes/endings.js`, `audio/*`)

- **title**: no boot screen; the camp menu fades in from black within ~0.5 s of page load (C's
  progressive camp). The crew rests (Durgan stirs the stew, Bran polishes a blade or dozes, Elio
  reads with Kindle bobbing, Clover counts diamonds), Pip sleeps, fire crackles, steam rises,
  fireflies. A small, beautiful FORGLITE logo; one tiny hint ("tap a forger"). **Click a forger → a
  cinematic push-in** (dolly + orbit + slight tilt, vignette, everyone else dims a little), the
  forger reacts (looks up, little signature gesture), a small card shows name, title and three perk
  icons with ≤ 6-word lines; **Choose** tag + click elsewhere/back to return. Settings & codex as
  diegetic objects (lantern = settings, Elio's book = codex). **No** prologue at boot, no "story so far".
- **Cinematic scripts** (`cutscene` ids): `intro` (§1, 3rd person in `campmenu`, ≈50–70 s, max ~5
  short lines), `chase` (1st person on `buildFP('chase')`: you run carrying Pip, snakes hiss behind,
  glance back at a Herald, jump, slide; ends in the Undercroft), `boss_thornscale`, `boss_glasscoil`,
  `boss_cinderfang`, `boss_medusa`, `rescue_<bran|elio|durgan|clover>` (herald dead → statue friend
  cracks → steps out → hug/high-five → Pip happy), `ending`, `fallen`. All skippable (existing skip).
- **Audio**: F owns `audio/`. Other agents may call `audio.play(name)` with any name — unknown names
  are silent no-ops — and list the names they used in their final report. F implements at least:
  `hiss`, `snake_rattle`, `petrify`, `stone_crack`, `stone_shatter`, `slurp`, `stew_bubble`,
  `ladle`, `trip`, `statue_break`, `ground_split`, `medusa_laugh`, `medusa_whisper`, `gaze`,
  `pip_yip`, `pip_bark`, `pip_dig`, `pip_whine`, `footstep_stone`, `footstep_water`, `run_breath`,
  `vein_glint`, `pick_hit`, `pick_perfect`, `pick_miss`, `chest_creak`, `map_unfold`, `map_fold`,
  `cook_add`, `cook_done`, `guard`, `parry`, `herald_roar`; music `camp`, `delve0`–`delve3`,
  `combat`, `boss`, `medusa`, `chase`, `ending`; loops `campfire`, `cave`, `water`, `lava`.

## 9. File ownership (do not edit files you don't own)

| Agent | Owns (create/edit/delete) |
|---|---|
| **A** crew | `models/characters.js`, `models/vox_char_*.js`, `models/weapons3d.js`, NEW `models/pet.js`, `models/medusa.js`, `models/fp_arms.js`, `scenes/preview_chars.js` |
| **B** monsters | `models/monsters.js`, `models/monster_*.js`, `models/vox_mon*.js`, `models/vox_sculpt.js`, `data/monsters.js`, `scenes/preview_monsters.js` |
| **C** worlds | `models/stage_vox*.js`, `models/prop*.js`, `models/props.js`, `models/mine_vox.js`, NEW `models/fp_world.js`, `scenes/preview_stagevox.js`, `tools/preview/*` for its own previews |
| **D** systems | `systems/*` (except none), `data/*` (except `monsters.js`), `scenes/camp.js`, `scenes/oldmap.js`, `scenes/bag.js`, `scenes/forgeui.js`, `art/forge_art.js`, `ui/cards.js` |
| **E1** delve | NEW `gfx/fpcam.js`, `scenes/delve.js`, `scenes/vein.js`, `scenes/event.js`, `scenes/treasure.js`, `scenes/flow.js` |
| **E2** combat | `scenes/combat.js` (rewrite), NEW `scenes/combat_fp/*` if you split it, `scenes/reveal.js` |
| **F** cinema | `scenes/title.js`, `scenes/cutscene.js`, `art/cutscene_art.js`, `scenes/endings.js`, `audio/*` |
| **integrator** | `main.js`, `build.mjs`, `scenes/index.js`, `scenes/common.js`, `core/*`, `gfx/renderer.js`, `ui/ui.js`, `ui/*` (other than cards), deletions of removed scenes |

Need a change in a file you don't own? Work around it locally (a small helper in your own file) and
list the request in your final report. Never edit another agent's file.

## 10. Working rules for agents

- Build into your own folder so builds don't collide: `OUTDIR=<your scratch dir> node build.mjs`
  (writes `<OUTDIR>/index.html`). Test with `PAGE=<that file> node tools/shot.mjs …` /
  `tools/mobile.mjs …`. Headless rendering is software (slow): use `window.FORGLITE.timeScale` and
  1280×720 shots.
- Keep your files **always buildable** (other agents build the whole tree). Big rewrites: write new
  code in new files and switch over at the end, or keep the old export names working.
- Until a dependency exists, code against the contract with a tiny local fallback (e.g. a grey box if
  `buildPet` is missing) — `import * as X` + feature checks — never a hard crash.
- Don't commit or push; the integrator does. Don't run `git checkout`/`git stash`/`git reset`.
- Finish with a short report: what you built, the API you exposed, what you could not finish,
  requests for other owners, screenshots paths.
