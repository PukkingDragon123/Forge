// FORGLITE action engine (docs/REDESIGN.md §4, §6): Hades-style top-down combat for Isaac-style rooms.
//   const world = new ActionWorld(game, { room })            // room = models/room_vox.js buildRoom(...)
//   const P = new Player(world, run.char, computeLoadout(run)) // registers itself as world.player
//   scene.update: world.update(dt) · scene.draw: world.drawUI(ui) · render: { scene: world.scene, camera: world.cam.camera }
export { Grid, FLOOR, WALL, OBSTACLE, PIT } from './grid.js';
export { Entity } from './entity.js';
export { ActionWorld, Projectile, STEP, STATUS_COLORS } from './world.js';
export { HadesCam } from './camera.js';
export { Player, FEEL, tryPlay } from './player.js';
export { PetFollower } from './companion.js';
export { MOVESETS, movesetOf, weaponBase } from './weapons.js';
export { SKILL_DEFAULTS, SKILL_IDS, skillDef, castSkill } from './skills.js';
export { drawControls, TOUCH_LAYOUT } from './touch.js';
export { FX } from './fx.js';
