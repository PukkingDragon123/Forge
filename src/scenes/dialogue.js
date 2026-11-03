// PLACEHOLDER (owner: agent F) — see docs/REDESIGN.md. Replace with the real scene.
import { Scene } from '../core/game.js';

export class DialogueOverlay extends Scene {
  enter(params = {}) { this.params = params; }
  draw(ui) { ui.text('dialogue (placeholder)', 20, 20); }
}
