// PLACEHOLDER (owner: agent E1) — see docs/REDESIGN.md §3. Replace with the real scene.
import { Scene } from '../core/game.js';

export class TreasureScene extends Scene {
  enter(params = {}) { this.params = params; }
  draw(ui) { ui.text && ui.text('treasure (placeholder)', 20, 20); }
}
