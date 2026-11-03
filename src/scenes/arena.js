// PLACEHOLDER (owner: agent P) — see docs/REDESIGN.md. Replace with the real scene.
import { Scene } from '../core/game.js';

export class ArenaScene extends Scene {
  enter(params = {}) { this.params = params; }
  draw(ui) { ui.text('arena (placeholder)', 20, 20); }
}
