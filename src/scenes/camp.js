// PLACEHOLDER (owner: agent D) — see docs/REDESIGN.md §3. Replace with the real scene.
import { Scene } from '../core/game.js';

export class CampScene extends Scene {
  enter(params = {}) { this.params = params; }
  draw(ui) { ui.text && ui.text('camp (placeholder)', 20, 20); }
}
