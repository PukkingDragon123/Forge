# FORGLITE — Design & Architecture

> Four cave explorers broke the seal of a forbidden tomb and woke the **Cursed Lord**.
> His curse: *every weapon you wield shatters after battle*, and the squad is slowly turning to cursed stone.
> One explorer at a time descends the mine, forging weapons from what they dig and carve,
> to break the curse at the bottom of the Forbidden Tomb. When they fall, the curse drags them
> back to the campfire — and the descent begins anew (pure roguelike: no stat upgrades carry over).

## Pillars
1. **Forge is the heart.** Every fight starts with forging a weapon from ore cards and monster parts
   (Balatro-style Chips × Mult with named synergies), finished with a rhythm hammering minigame.
2. **Everything is a material.** No potions, no generic relics. Ores, gems, crystals, monster parts,
   keys, rune scrolls and tools — each has a weapon effect, a pickaxe effect, and a backpack shape.
3. **Cinematic & cozy.** Low-res 3D (voxel caves + low-poly anime characters) rendered through a
   pixel-art post pipeline (1px outlines, edge highlights, bloom, dithered light), under a fully
   hand-drawn-looking pixel UI. Camera moves, reactions, little cutscenes everywhere.
4. **Easy to read, deep to master.** Each card says exactly what it does. Depth comes from combining.

## Core loop
Campfire (pick explorer) → Map (pick tunnel) → Travel (side-scroll cinematic, inspect, QTEs)
→ Node: Mining / Monster / Elite / Treasure / Merchant / Event / Camp / Boss → back to Map.
Monster: **Forge** (pick blueprint + materials → score) → **Hammer** (rhythm) → **Combat**
(auto-battle + crit/parry/special QTEs) → **Harvest** (carve parts) → **Shatter** (curse breaks weapon).

## Explorers
| | Bran — Blacksmith | Elio — Elemental Mage | Durgan — Gnome Warrior | Clover — Rabbit Rogue |
|---|---|---|---|---|
| HP | 80 | 65 | 100 | 60 |
| Passive | Metal ores ×1.5 chips, alloys +0.5×, wider Perfect window, each Perfect hit +1 Mult. **Salvage**: shattered weapons leave Scrap. | Elemental stacks ×2, reactions +1×. **Kindle** familiar casts the weapon's element every 3s. | Monster parts (shell/bone/scale/core) +50%, heavy weapons +2 Mult. Block windows ×1.6, perfect blocks build **Grit** (+dmg). | Crit window every swing, crit dmg +1×, daggers strike twice. **Lucky**: junk may turn rare, +coins, sees mimic tells. |
| Start | Forge Hammer, Iron×3, Copper×2, Coal | Ember Crystal, Rime Shard, Storm Shard, Copper×2, Quartz | Iron×2, Bone×2, Beetle Shell, Tin | Copper×2, Silver, Junk×2, Rusty Key |
| Blueprints | Sword, Hammer, Pickaxe | Staff, Dagger, Pickaxe | Axe, Hammer, Pickaxe | Dagger, Sword, Pickaxe |

## Materials (see `src/data/materials.js`)
Each material: `kind`, `rarity` (common/uncommon/rare/epic/legendary), `quality` (0..4: Cracked, Rough,
Fine, Pristine, Flawless — value multiplier 0.6/0.8/1/1.25/1.5), `shape` (polyomino), `tags`,
`weapon` effect, `pick` (pickaxe) effect, optional `bag` adjacency effect, `value` (coins).
"Solid" materials (ores, gems, crystals, bone, shell, cores) are required to give a weapon a body:
every blueprint needs ≥1 solid ingredient.

## Forging math
`damage = floor(chips × mult × quality × passives)`; ingredients resolve left→right like Balatro jokers
(`+chips`, `+mult`, `×mult`, element stacks, effects). Synergies (alloys, elemental reactions, sets)
trigger as named banners. Hammering grade: Crude ×0.8 / Standard ×1 / Fine ×1.15 / Superior ×1.3 /
**Masterwork** ×1.6 (+1 harvest cut, +special charge). Named **recipes** (secret weapons) trigger when the
exact ingredient set is used; recipe scrolls reveal them, experimentation discovers them; discoveries persist.

## Mining
Grid (7×7) set in a voxel cave wall. Start at the top row; you may only strike exposed tiles (top row or
orthogonally adjacent to a broken tile). 3 strikes by default; the forged pickaxe adds strikes/effects.
Depth raises rarity. **Clues**: ore tiles leak colored veins into neighbours, rare ores glint, hazards
crack the rock around them, hard rock looks dark & blocky (2 hits).

## Map
Each region is a voxel cross-section: 7 floors of rooms joined by tunnels (plain, minecart track, rope
bridge, elevator, crawlway, flooded). Tunnel type sets the travel scene & hazard QTE; some tunnels show a
visible encounter. Regions: Hollowdeep Mine → Prism Hollows → Sporewood → Sunken Halls → Emberdeep →
Forbidden Tomb. Bosses: Old Rustjaw (minecart colossus), Queen Geodessa (crystal spider),
Mother Mycel (spore titan), the Gilded Warden (rune statue), Pyrrhax (molten wyrm), the Cursed Lord.

## Combat
Auto-attacks at the weapon's speed. QTEs: **Crit ring** (click/Space as the ring closes on the weak spot),
**Parry/Block** (right-click/Shift on the telegraph; tight = parry + counter, loose = block),
**Special** (meter from hits → E for the weapon's elemental special), **Dodge** on unblockable red attacks.
No weapon? Flee QTE or fight bare-handed.

## Tech
- `three` + esbuild. `npm run dev` (live reload :8080), `npm run build` → `dist/index.html` single file.
- **Virtual resolution**: integer pixel scale, height ≈ 360 virtual px (`gfx/renderer.js`). The 3D canvas
  and the UI canvas are both rendered at virtual size and CSS-upscaled with `image-rendering: pixelated`.
- 3D: scene → RT (color+depth) → normal pass → bloom → composite (outline, edge-light, bloom, grading,
  luminance dither). Layers: 0 = solid (outlined), 1 = FX (no outline / no normals).
- UI: immediate-mode on a 2D canvas (`ui/ui.js`): every frame scenes call `ui.button(...)` etc.
- Scenes implement `enter(params)`, `exit()`, `update(dt)`, `draw(ui)` and may expose `world`
  (`{scene, camera}`) for 3D. `game.go(sceneName, params, transition)` switches scenes.

### Folder map
```
src/core     loop, input, rng, tween, save, audio
src/gfx      renderer + post shaders, voxel mesher, materials, particles, camera director
src/ui       ui canvas + IMGUI, pixel fonts, frames, icons, cards, widgets
src/art      pixel sprite generators (ores, items, weapons, portraits, logo)
src/models   3D builders (characters, monsters, props, weapons, environments)
src/data     content tables
src/systems  rules (run, backpack, forge, mapgen, mining, combat, loot, unlocks)
src/scenes   screens
```
