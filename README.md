# FORGLITE

A cozy, cursed, pixel-art forging roguelike. Four cave explorers broke the seal of a forbidden tomb
and woke the **Cursed Lord**: every weapon they wield now **shatters after battle**, and the squad is
slowly turning to stone. One explorer at a time descends the mine, digging ore, carving monster parts
and forging a brand-new weapon for every fight, to break the curse at the bottom of the Forbidden Tomb.

Inspired by Balatro (Chips × Mult combos), Slay the Spire (branching paths, distinct heroes) and
Backpack Battles (shaped inventory), and played like a cinematic, choice-driven adventure. Everything
(art, models, music and sound) is generated in code: hand-painted 2D pixel-art stages lit by warm
lamps and teal shadows, with sculpted, rigged low-poly 3D characters and monsters on top. There are
almost no menus: choices are things in the world (tunnel mouths, chests, an anvil, a rug of goods).

## Play

```bash
npm install
npm run dev      # http://localhost:8080 with live reload
npm run build    # writes dist/index.html, a single self-contained file
```

`dist/index.html` can be opened directly in a browser (no server needed).

## How to play

1. **The campfire.** Click one of the four explorers sitting around the stew pot to hear what they
   can do, then *Descend*. The books, the scroll and the lantern are the codex, prologue and settings.
2. **The crossroads.** There is no map. Each time the tunnel splits, every mouth hints at what lies
   beyond (eyes in the dark, a trader's lantern, ore glints, woodsmoke) and the narrator reads it out.
   Click a tunnel to take it. Its kind (minecart track, rope bridge, lift, crawlway…) sets the risks.
3. **Travel.** Your explorer walks the tunnel. Click glinting things to inspect them, and react to
   QTEs (collapsing bridges, ambushes, minecart chases).
4. **Mining.** You get 3 strikes with your old pick, plus whatever a freshly forged pickaxe adds.
   Start at the top and dig through connected tiles. Deeper means rarer. Read the clues: colored veins
   point at ore, rare ores glint, cracks warn of hazards.
5. **Forging.** Before every fight you set up a portable forge. Pick a blueprint and ingredient cards:
   ores add Chips, gems multiply Mult, monster parts add effects. Named synergies (Steel, Electrum,
   Prismatic…) and secret recipes stack up. Then hammer on the beat: all Perfect makes a **Masterwork**.
6. **Combat.** Your weapon attacks on its own. Time your **crits** (SPACE / left-click as the ring
   closes), **parry or block** telegraphed attacks (SHIFT / right-click), and unleash your **special**
   (E) when the meter fills.
7. **Harvest & shatter.** Carve the monster for parts (better blades carve more), then watch the
   curse shatter your weapon. Forge again.
8. **Backpack.** Your 5×5 bag fits shaped items (TAB). Rotate with R or right-click. Some neighbours
   help each other: coal stokes metals, quartz resonates with gems, amber preserves parts.

No permanent stat upgrades: each run starts fresh. You keep only discoveries: new ores, secret weapon
recipes, synergies and campfire story scenes.

## Explorers

| | Playstyle |
|---|---|
| **Bran**, Blacksmith | Metal ores ×1.5 chips, doubled alloy bonuses, wider Perfect windows; salvages scrap from shattered blades. |
| **Elio**, Elemental Mage | Doubled element stacks and stronger reactions. His familiar **Kindle** casts your weapon's element every 3 s. |
| **Durgan**, Gnome Warrior | Huge block/parry windows, perfect blocks build Grit, monster trophies are 50% stronger, heavy weapons hit harder. |
| **Clover**, Rabbit Rogue | Crit window on every swing, double-striking daggers, +50% coins, junk turns lucky, sniffs out mimics. |

## Project layout

See [DESIGN.md](DESIGN.md) for the full design and architecture.

```
src/core     loop, input, rng, tweens/coroutines, save
src/gfx      low-res renderer + post shaders, voxel mesher, materials, particles, camera rig
src/ui       immediate-mode pixel UI, hand-authored pixel fonts, icons, frames, cards
src/art      procedural pixel sprites (ores, items, weapons, portraits, logo)
src/models   3D characters, voxel monsters, props, environments, weapon meshes
src/audio    synthesized SFX and procedural music
src/data     materials, monsters, regions, blueprints & recipes, events, characters
src/systems  forge scoring, backpack, map/mining generation, combat simulation, run state
src/scenes   title, map, travel, mining, forge, combat, rooms, events, endings
tools        build helpers, headless screenshot + data checks (`npm run check`)
```
