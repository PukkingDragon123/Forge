// Dev harness for the forge UI (?scene=forgetest&char=bran[&mode=pickaxe][&flat=1])
//   flat=1 opens the forge without a 3D anvil/rig, the way the mining spot does.
import { Scene } from '../core/game.js';
import { Run } from '../systems/run.js';
import { buildSet } from '../models/environments.js';
import { buildProp } from '../models/props.js';
import { makeWorld, hud } from './common.js';
import { openForge } from './forgeui.js';
import { openBag } from './flow.js';

export class ForgeTestScene extends Scene {
  enter(p) {
    this.game.run = this.game.run || new Run(p.char || 'bran', 'test');
    this.flat = !!p.flat;
    const set = buildSet('arena', this.game.run.region);
    this.set = set;
    this.world = makeWorld(set);
    const forge = buildProp('forge');
    forge.position.copy(set.anchors.forge);
    this.world.scene.add(forge);
    this.open(p.mode || 'weapon');
  }
  open(mode) {
    const a = this.set.anchors.forge;
    const rig = this.flat ? {} : { anvil: a, rig: this.world.rig, world: this.world };
    this.ctrl = openForge(this, { mode, monster: mode === 'weapon' ? 'rustrat' : undefined, ...rig, onDone: (w) => { this.result = w; setTimeout(() => this.open(mode), 500); } });
  }
  update(dt) { this.world.rig.update(dt); this.world.sparks.update(dt); this.world.dust.update(dt); this.set.update && this.set.update(dt, this.time); this.ctrl && this.ctrl.update(dt); }
  draw(ui) {
    const h = hud(ui, this.game);
    if (h.bagClicked) openBag(this.game);
    this.ctrl && this.ctrl.draw(ui);
  }
}
