// Handcrafted voxel props on the shared 0.04 m grid (same as stages, explorers and monsters):
// painted voxel by voxel in the warm-pastel stage palette, greedy-meshed with baked AO and lit in
// real time, glowing voxels bloom. See prop_vox.js (kit), prop_camp.js, prop_cave.js, prop_folk.js.
// buildProp(name, opts) → THREE.Group. Dynamic props expose userData.update(dt, t),
// userData.emit(P, dt) (P = { add: ParticleSystem, alpha: ParticleSystem }) and userData.lights;
// chests expose userData.open(v) / userData.lid, rope bridges userData.yAt(x).
import * as THREE from 'three';
import * as K from './prop_camp.js';
import * as V from './prop_cave.js';
import * as F from './prop_folk.js';
export { makeFlame } from './prop_vox.js';
export { surfaceMat } from './prop_cave.js';

const BUILDERS = {
  campfire: K.campfire,
  tent: K.tent,
  sleepingbag: K.sleepingbag,
  backpack: K.backpack,
  lantern: K.lantern,
  cookpot: K.cookpot,
  map: K.map,
  pickaxe: K.pickaxe,
  shovel: K.shovel,
  crate: K.crate,
  barrel: K.barrel,
  minecart: K.minecart,
  rails: K.rails,
  support: K.support,
  crystal: V.crystal,
  crystalcluster: V.crystalcluster,
  rock: V.rockProp,
  stalactite: V.stalactite,
  mushroom: V.mushroom,
  anvil: K.anvil,
  forge: K.forge,
  chest: K.chest,
  torch: K.torch,
  brazier: K.brazier,
  pillar: V.pillar,
  statue: V.statue,
  sarcophagus: V.sarcophagus,
  chains: V.chains,
  bones: V.bones,
  lavapool: V.lavapool,
  waterpool: V.waterpool,
  ladder: K.ladder,
  elevator: K.elevator,
  ropebridge: K.ropebridge,
  door: V.door,
  signpost: K.signpost,
  books: K.books,
  sack: K.sack,
  banner: V.banner,
  urn: V.urn,
  web: V.web,
  vent: V.vent,
  merchantcart: (o) => K.merchantcart(o, BUILDERS),
  roots: V.roots,
  vines: V.vines,
  mole: (o) => F.mole(o, BUILDERS),
  miner: F.miner,
  snail: F.snail,
  shrine: V.shrine,
  goldpile: K.goldpile,
  log: K.logProp,
};

/** Build a prop by name. Unknown names return an empty group (with a console warning). */
export function buildProp(name, opts = {}) {
  const b = BUILDERS[name];
  if (!b) { console.warn('unknown prop', name); return new THREE.Group(); }
  const g = b(opts || {});
  g.name = name;
  return g;
}
export const PROP_NAMES = Object.keys(BUILDERS);

/** Run update/emit hooks for every prop under root. P = { add, alpha } particle systems. */
export function tickProps(root, dt, t, P) {
  root.traverse((o) => {
    const u = o.userData;
    if (!u) return;
    if (u.update) u.update(dt, t);
    if (P && u.emit) u.emit(P, dt);
  });
}
