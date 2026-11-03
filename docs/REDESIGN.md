# FORGLITE v5 — Hades camera, Isaac rooms, loot & crafting

Source of truth for the v5 rebuild (supersedes v4: the first-person delve is gone). Every agent reads
this first; stay inside your file scope (§10) and talk to other modules only through the contracts
in §6–9. Where older code disagrees with this file, this file wins.

## 1. The player's request (all of it matters)

- The game is about **getting loot and crafting**.
- Look: **detailed blocky voxel / pixel-art environments**, backgrounds **super detailed**, everything
  **far more cinematic**.
- Camera **like Hades** (angled top-down, following the player). Gameplay structure **like The Binding
  of Isaac** (a floor of rooms with doors, clear rooms, find items, boss room) — **roguelike and
  strategic** — but you **collect loot and mine ores from monsters**.
- **Combat like Hades: really cool, super satisfying.** **Skill slots**; **new skills are crafted**
  (skills or **amulets** that help you fight).
- **Manage your inventory**: things in the inventory — **amulets, swords, weapons** — **buff you**.
  The game is about **managing the inventory to fight**.
- **Remake all the scenes.** **Stage 1: an overgrown mushroom dungeon with a fat mushroom boss.**
- **Mining zooms in** and you **use tools like a pickaxe**.
- **Crafting: place ingredients in order**; you can **find recipes**.
- **Interactive tutorial**: while you are being chased, **a mushroom guy comes to help you, teaches
  you, then gets frozen too**.
- **Title 100× better.** **Only one character unlocked at first: the warrior** (Durgan).
- **Real zoom-in dialogue with floating text and your replies**, really polished.

## 2. Story frame (kept from v4, trimmed)

The Forglite crew — **Durgan** (gnome warrior, playable at start), Bran, Elio, Clover (locked) and
**Pip** the mole-dog — live in a dungeon camp and sell ore. Intro (first run only, skippable after):
stew → the creepy chest → the snake totem → trip over Pip → Medusa rises → her gaze petrifies the
friends, the ore and Durgan's axe (it becomes a stone axe that **petrifies whatever it kills**) → her
snakes chase you → **tutorial chase** (§5) with **Morel**, a friendly mushroom guy, who teaches you
to fight, dash, mine and craft, then is **petrified saving you** → you fall into **Stage 1**.

**Stages** (Isaac floors). Stage 1 is the showcase and must be fully polished; stages 2–4 reuse
content and must be playable.

| # | id | Name | Look | Boss | Frees |
|---|----|------|------|------|-------|
| 0 | `shroom` | The Overgrown Mycelium | mossy stone dungeon swallowed by giant mushrooms, glowing caps, spore haze, roots, ferns, puddles, ruined pillars, fireflies | **Grand Puffcap** — a fat, jiggly mushroom king (spore clouds, belly slam, spawns shroomlings) | Bran |
| 1 | `cistern` | The Crystal Cistern | flooded halls, crystals, lily pads | Glasscoil | Elio |
| 2 | `foundry` | The Ember Foundry | forge-halls, lava, chains | Cinderfang | Clover |
| 3 | `garden` | Medusa's Garden | marble ruins, statues, jade light | Medusa | — (ending) |

Freeing a friend **unlocks them as a playable hero** (meta) and gives a run-long assist.

## 3. Core loop

```
floor: start room → pick a door → room: enemies spawn, doors lock → Hades-style fight → room clear
  → loot drops (magnet pickup) + petrified foes become ore statues → MINE them (zoom-in, tools) →
  special rooms: ore vein room, treasure (pedestal / chest), craft room (workbench), shrine (choice
  event with dialogue), secret room → boss room → boss → hole to next floor
```
Strategy lives in: **which doors**, **what to carry** (bag space is tight: ore is bulky), **what to
craft and in which order**, **which skills/amulets**, **when to mine** (statues cost time and tool
uses; some rooms have a timer of danger — e.g. spores grow).

## 4. Combat feel (Hades bar — owner P)

- **Movement**: 5.6 m/s, snappy accel/decel (0.06 s), 8-direction facing smoothed. Collide with room
  grid. **Dash**: 0.17 s, 4.2 m, i-frames 0.2 s, 2 charges (recharge 0.85 s each), dust burst,
  after-image. Dash-attack (attack within 0.15 s of a dash end → lunging strike).
- **Attack**: weapon combo (3 hits; the 3rd is heavy), aim at mouse (desktop) / right-stick / **auto-
  aim nearest enemy in a 70° cone on touch**; small forward lunge per swing; **hit-stop 45–90 ms**,
  enemy flash + knockback + voxel chips, **camera micro-shake**, slash arc trails, damage numbers
  (crit = bigger, gold). Special attack per weapon type (RMB / button): axe = spin, hammer = ground
  slam, sword = dash thrust, spear = throw, dagger = flurry, staff = bolt.
- **Skills**: 2 skill slots (Q / E; touch buttons) with cooldowns, crafted skill gems (§7).
- **Enemies telegraph** with ground decals (red fill-up), wind-up flashes, readable patterns; contact
  damage is low, attacks are dodgeable. Player i-frames 0.6 s after a hit, red vignette, heart thump.
- **Status**: burn, poison (spores), slow, freeze, stun, bleed; shown as icons and tints.
- **Readability**: enemies outline-pop against the floor; the player always readable (rim light,
  ground ring).
- **Mobile**: left virtual joystick, right cluster: Attack (big), Dash, Special, Skill 1, Skill 2,
  Interact appears contextually. Must be fully playable on an 844×390 phone.

## 5. Tutorial chase (owner F, uses P/N/C)

Top-down, the camera like the rest of the game. Durgan runs from Medusa's snake (it slithers behind
off-screen, its shadow and hiss). **Morel** pops out of a mushroom ring: "This way!" Interactive beats
with floating dialogue (§8) and gated progress:
1. **Move** (stick/WASD) to Morel. 2. **Dash** across a gap/through spores. 3. **Attack** two
shroomling dummies — the axe petrifies them. 4. **Mine** a statue (zoom-in, pickaxe). 5. **Craft**
your first skill at a stump workbench (ingredients in order: given recipe card). 6. **Equip** the
skill and use it on a small wave. 7. The snake catches up; Morel shoves you down a hole and is
**petrified** (stone sweep, his last line). Fall into Stage 1. Skippable after the first time.

## 6. Engine contract (owner P) — `src/action/`

```js
import { ActionWorld, Player, Entity, HadesCam, Grid } from '../action/index.js';

new ActionWorld(game, { room, scene, cam? })   // room = C's Room (§9.1)
  .scene  .cam (HadesCam)  .room  .grid (= room.grid)
  .player  .enemies[]  .projectiles[]  .pickups[]  .interactables[]
  .time  .add(e)  .remove(e)  .update(dt)      // call every frame (handles hitstop/slowmo internally)
  .hitStop(t)  .slowmo(scale, dur)  .shake(a)  .flash(color, a)
  .moveCircle(e, dx, dz)                         // grid collision (walls/obstacles; pits block walkers)
  .queryCircle(x, z, r, filter) → [entity]   .nearestEnemy(x, z, maxR)   .lineOfSight(ax, az, bx, bz)
  .damage(target, hit) → dealt                   // central: armor, buffs, numbers, flash, knockback, status, events
  .spawnProjectile({ team, x, z, dir:{x,z}, speed, radius, dmg, life, pierce, color, model, onHit })
  .telegraph({ shape:'circle'|'line'|'cone'|'ring', x, z, r, len, width, angle, dir, dur, color, onDone })
  .fx.slash(...) .fx.spark(x,y,z,color,n) .fx.ring(x,z,r,color) .fx.number(x,y,z,text,style) .fx.dust(x,z) .fx.decal(...)
  .on(event, fn)   // 'enemyKilled' {enemy, def, x, z}, 'playerHurt' {hit}, 'playerDead', 'roomCleared'
class Entity { x, z, vx, vz, radius, team, hp, maxHp, dead, invuln, status, model (Object3D), facing, update(dt, world), hurt(hit, world) }
Hit = { dmg, crit?, kb (metres), dir {x,z}, stun?, element?, status? {burn|poison|slow|freeze|bleed: n}, source }
new Player(world, charId, loadout)   // loadout = D's computeLoadout(run): { weapon, skills:[id|null,id|null], stats }
  .x .z .hp .dashCharges .skillCd[] .interactTarget  — reads input itself (keys, mouse, touch joystick/buttons)
new HadesCam({ fov })  .camera  .follow(entity)  .setBounds(room.bounds)  .shake(a)  .punch(dir,a)
  .zoomTo({ x, y, z } | entity, { fov, dist, dur })  .release(dur)  .update(dt)
```
P also implements **all player skills** (§7 skill ids) and the **weapon movesets**, the **touch
joystick**, and a dev arena `?scene=arena&char=durgan&enemies=shroomling,sporegoblin` to tune feel.

## 7. Items, inventory, crafting, mining (owner D) — `systems/*`, `data/*`

- **Inventory = your build.** Bag grid **6×5**. Items **inside the bag give their passive buffs**
  (amulets, charms, spare weapons give small passives, a few have adjacency synergies — Backpack-
  Battles style). Equipment: **weapon (hand)** and **2 skill slots** (skill gems). Ore / gems /
  parts / forage are crafting ingredients and **take a lot of space** (ores 2×2 or L-shapes).
- `computeLoadout(run)` → `{ weapon, skills:[id|null,id|null], stats:{ dmg, atkSpd, moveSpd, crit,
  critDmg, maxHp, armor, dashCharges, lifesteal, thorns, statusChance{}, element, lootLuck, oreLuck,
  pickPower } , synergies:[...] }`.
- **Item kinds**: `weapon`, `amulet`, `charm`, `skill` (gem), `tool` (pickaxe, hammer, chisel, bomb,
  lantern), `ore`, `gem`, `crystal`, `part`, `forage`, `recipe` (scroll), `potion`.
- **Skills (≥10)**, ids fixed for P: `spore_burst` (AoE poison cloud), `stone_spikes` (line of
  spikes), `ember_dash` (dash leaves fire), `shield_bash` (stun cone), `whirlwind` (spinning AoE),
  `frost_nova` (freeze ring), `chain_spark` (chaining lightning), `root_snare` (roots hold foes),
  `gem_shards` (fan of piercing shards), `mushroom_turret` (plant a spore turret). Data:
  `SKILLS[id] = { name, icon, cd, desc(≤8 words), params{} }`.
- **Amulets & charms (≥16)**, e.g. Mycelium Heart (+max HP, regen out of combat), Spore Lantern (spores
  on dash), Ore Magnet (+loot pickup radius, +oreLuck), Glass Fang (+crit), Stone Skin (+armor), Twin
  Edge (adjacent weapons +dmg)…
- **Crafting = ingredients in order.** `RECIPES[id] = { out, ings:[ordered ids], station:'workbench'|
  'forge'|'cauldron', hidden? }`. `craft(run, ordered)` → `{ ok, out, newRecipe, partial:{correct,
  misplaced} }` — wrong order of the right ingredients gives a hint ("2 in place, 1 misplaced").
  Recipes are **found** as scrolls (treasure, shrines, bosses, secret rooms) and remembered in the
  recipe book (meta-persistent once found). Results: skills, amulets, charms, weapons, potions, tools.
- **Mining (zoom-in)**: restore and evolve the grid-wall miner from git history
  (`git show 18b8725^:src/systems/mining.js`): a 7×7 (statue: 5×6) rock face with hidden ores/gems,
  hard rock, hazards; **tools**: pickaxe (1 cell, strong), hammer (row of 3, cracks gems), chisel
  (precise, +quality, slow), bomb (3×3), lantern (reveal). Tool items have uses; each mine session
  has a strike budget. Sources: `vein` (room walls/boulders, by stage), `statue` (petrified monster —
  its ore table comes from the monster's `ore` list in `data/monsters.js`).
- **Floors**: `generateFloor(rng, stage)` → Isaac grid `{ stage, rooms: Map(id → { id, gx, gy, type,
  doors:{n,e,s,w: id|null}, seed, visited, cleared, known }), startId, bossId }`. ~10–14 rooms.
  Types: `start, fight, vein, treasure, craft, shrine, secret, boss`. More fights than anything else.
  `encounterFor(run, room)` → `{ waves: [[{ id, n, elite? }]], reward }`.
- **Loot**: `rollDrops(run, def)` (on kill: small chance items + parts), `statueOre(run, def)`,
  `roomReward(run, room)`, `treasureLoot(run)`, `bossLoot(run, stage)`.
- **Unlocks**: only `durgan` at first; `unlockHero(id)` on rescue; persistent recipe book.
- `Run` (`systems/run.js`): `char, stage, floor, hp, maxHp, bag, weapon, skills[2], recipesKnown,
  tools, stats, flags, companions`; `computeLoadout`.

## 8. Dialogue (owner F) — `scenes/dialogue.js`

`game.pushOverlay('dialogue', { world?, cam?, lines, onDone })` with
`lines: [{ who: 'durgan'|'morel'|'medusa'|…, at: Object3D|Vector3|()=>Vector3, text, mood?,
replies?: [{ text, next?: index|label, fn? }] }]`. The camera **zooms in** on the speaker (HadesCam
`zoomTo`), letterbox bars slide in, the line **floats above the speaker's head** (typewriter, gentle
bob, word pop, small voice blips), **your replies float as 2–3 tags** near Durgan; keys/taps select.
Text diet: lines ≤ 12 words. Used by the tutorial, shrines, boss intros, rescues.

## 9. Worlds (owner C) and models (owners A, N)

### 9.1 Rooms — `models/room_vox.js` (C)
```js
buildRoom(stage, room, { seed, type, doors:{n,e,s,w: false|'open'|'locked'|'boss'|'secret'}, size:'normal'|'large'|'boss' })
  → Room { group, grid (Grid: tile 0.5 m; get(tx,tz) → 0 floor | 1 wall | 2 obstacle | 3 pit; toTile(x,z); toWorld(tx,tz)),
           bounds {x0,x1,z0,z1}, doors {n|e|s|w: { x, z, dir, state, setOpen(k) }},
           spawns: [{x,z}], veins: [{ x, z, kind, setMined(k) }], anchors { center, pedestal, bench, shrine, boss, hole },
           background (Group), lights, fog, background colour, update(dt,t), setCamera(cam), dispose() }
```
Room space: centred at the origin, x → right, z → toward the camera (south). Normal room 15×9 m of
floor, large 22×13, boss 24×15. Doors in wall centres. **The visible area beyond the walls is full of
detail** (Hades-style backdrops: giant mushrooms, roots, chasms, distant ruins, light shafts, falling
spores), no flat voids. Stage 0 is the showcase. Must build fast: room < 0.8 s desktop, progressive
streaming of decoration, neighbours prebuilt in idle time (`prebuildRoom(...)`).
Also: the **title camp** upgrade (with F), the **tutorial chase** strip (`buildRoom(0, {type:'chase'})`
or a dedicated long strip) and the boss arena for Grand Puffcap.

### 9.2 Characters (A)
Same `buildCharacter(id)`, tuned for the **top-down Hades camera** (readable tops of heads, bold
silhouettes, rim). Real-time anims for the action game, all snappy: `run` (fast, leaning), `idleCombat`,
`attack1/2/3` per weapon type (axe/hammer/sword/spear/dagger/staff; or a param), `special_<type>`,
`dash`, `dashAttack`, `cast`, `hurt`, `die`, `mine`, `interact`, `pickup`, `talk`, plus everything the
cutscenes need. `setFacing(angle)` smooth turn. Pip `buildPet()` follows the player in rooms (anims
`run`, `sniff` at veins/statues, `bark`). Durgan is the star: polish him most.

### 9.3 Monsters (N) — `models/monster*`, `data/monsters.js`, `src/action/enemies/*`
- Brains for every enemy used on stages 0–3 (`spawnEnemy(world, id, x, z, opts)` → Enemy, registry
  `BRAINS[arch]`): chaser, lunger, spitter (projectiles), charger, burrower (pops up), flyer, spore
  puffer (clouds), spawner, turret-ish caster, shield bearer, elites with an extra move.
- Stage 0 roster (mushroom dungeon, all new or reworked, cute-creepy, readable top-down): `shroomling`
  (hopper), `sporegoblin` (spear lunger), `bloatcap` (spore puffer that pops), `glowwisp` (flyer),
  `moss_snail` (slow, shell armour), `myconid_brute` (elite charger), `rootling` (burrower), `cap_archer`
  (spitter). **Boss `grand_puffcap`**: fat, jiggly mushroom king, 3 phases (spore rings, belly slam with
  shockwave, summons shroomlings, rolls). **NPC `morel`**: a cute friendly mushroom guy (talk, run,
  wave, cheer, scared, petrify via `setStone`).
- Monster models face +Z at rotation 0 (unchanged); add `move` anim if missing, `setStone`, cracks,
  `shatter` (kept). `def.ore` lists what its statue yields.

## 10. File ownership (don't edit files you don't own; request changes in your report)

| Agent | Owns |
|---|---|
| **A** crew | `models/characters.js`, `models/vox_char_*.js`, `models/weapons3d.js`, `models/pet.js`, `models/medusa.js`, `scenes/preview_chars.js` |
| **N** enemies | `models/monster*.js`, `models/vox_mon*.js`, `models/vox_sculpt.js`, `data/monsters.js`, NEW `src/action/enemies/**`, `scenes/preview_monsters.js` |
| **C** worlds | `models/stage_vox*.js`, `models/prop*.js`, `models/props.js`, NEW `models/room_vox.js` (+ helpers `models/room_*.js`), `tools/preview/*` (own previews) |
| **D** systems | `systems/*`, `data/*` (except `monsters.js`), `tools/check.mjs` |
| **P** combat | NEW `src/action/**` (except `enemies/`), NEW `scenes/arena.js`, `core/input.js` (joystick/twin-stick additions) |
| **U** game | NEW `scenes/dungeon.js` (+ `scenes/dungeon/*`), `scenes/flow.js`, `scenes/bag.js`, NEW `scenes/craft.js`, NEW `scenes/minezoom.js`, `scenes/reveal.js`, `scenes/pause.js`, `ui/cards.js`, NEW `ui/hud_action.js` |
| **F** cinema | `scenes/title.js`, `scenes/cutscene.js`, `art/cutscene_art.js`, `scenes/endings.js`, NEW `scenes/dialogue.js`, NEW `scenes/tutorial.js`, `audio/*` |
| **integrator** | `main.js`, `build.mjs`, `scenes/index.js`, `scenes/common.js`, `core/*` (except input.js), `gfx/*`, `ui/*` (except cards/hud_action), deletions |

## 11. Working rules

- Build into your own folder: `OUTDIR=<scratch>/<agent> node build.mjs`; test with `PAGE=… node
  tools/shot.mjs | tools/mobile.mjs | tools/autoplay.mjs`. Rendering here is software: use
  `window.FORGLITE.timeScale` and 960×540/1280×720 shots, patient waits.
- **Keep the tree buildable at all times.** Placeholders exist for every new module; replace them in
  place, keep the exported names. Code against contracts; feature-check dependencies (`typeof fn ===
  'function'`) and degrade gracefully until they land; re-check placeholders (files start with
  "PLACEHOLDER") and do a final pass with the real modules.
- Text diet: no paragraphs; tooltips = name + ≤ 1 line + icons/numbers.
- Don't commit/push or run git checkout/stash/reset; the integrator commits.
- Finish with a short report: built, API, gaps, requests for other owners, screenshot paths.
