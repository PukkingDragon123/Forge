// PLACEHOLDER (owner: agent U) — see docs/REDESIGN.md. Replace with the real scene.
import { Scene } from '../core/game.js';

export class DungeonScene extends Scene {
  enter(params = {}) { this.params = params; }
  draw(ui) { ui.text('dungeon (placeholder)', 20, 20); }
}
