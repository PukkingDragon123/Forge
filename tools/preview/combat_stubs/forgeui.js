// Preview-only stand-in for src/scenes/forgeui.js: auto-forges the best simple weapon.
import { evaluate, finalizeWeapon } from '../../../src/systems/forge.js';
import { matOf } from '../../../src/systems/items.js';
export function openForge(scene, opts) {
  const run = scene.game.run;
  let t = 0;
  const ctrl = {
    active: true,
    update(dt) {
      t += dt;
      if (t < 1.2 || !this.active) return;
      this.active = false;
      if (new URLSearchParams(location.search).has('noforge')) return opts.onDone(null);
      const items = run.bag.items.filter((it) => matOf(it).weapon).slice(0, 4);
      const bp = run.blueprints.find((b) => b !== 'pickaxe');
      const res = evaluate(bp, items, { char: run.char });
      if (!res.valid) return opts.onDone(null);
      for (const it of items) run.bag.remove(it);
      opts.onDone(finalizeWeapon(res, 3, { char: run.char }));
    },
    draw(ui) { ui.panel('parchment', ui.w / 2 - 60, ui.h / 2 - 15, 120, 30); ui.text('Forging (stub)…', ui.w / 2, ui.h / 2 - 4, { align: 'center', color: '#3a2618' }); },
  };
  return ctrl;
}
