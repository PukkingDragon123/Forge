// Game over and the ending: each one is a 3D cinematic (scenes/cutscene.js 'fallen' / 'ending') that
// holds its final shot under a small card. (DescendScene is kept only so older routes don't break.)
import { Scene } from '../core/game.js';
import { CutsceneScene, Cine } from './cutscene.js';
import { ribbonTitle, dim } from './common.js';
import { REGIONS } from '../data/regions.js';
import { CHARACTERS } from '../data/characters.js';
import { MATERIALS } from '../data/materials.js';
import { save } from '../core/save.js';
import { checkUnlocks } from '../systems/unlocks.js';
import { clamp, ease } from '../core/math.js';
import { logo } from '../art/sprites.js';

// ============================================================================ DESCEND (legacy route)
/** No more lifts between layers: just move on to the next act and back into the delve. */
export class DescendScene extends Scene {
  enter() {
    const run = this.game.run;
    if (run) { if (run.nextAct) run.nextAct(); else if (run.nextRegion) run.nextRegion(); }
    this.go = 0.05;
  }
  update(dt) {
    if (this.go > 0 && (this.go -= dt) <= 0) this.game.go(this.game.scenes.delve ? 'delve' : 'map', {}, { transition: 'fade' });
  }
}

/** A scene that plays a cinematic and keeps its last shot running under a card. */
class HeldCinematic extends Scene {
  play(id, p) {
    this.cine = new Cine(this.game, id, { ...p, hold: true });
    this.world = this.cine.world;
    this.keepWorld = true; // the cine disposes its own world
  }
  update(dt, rdt = dt) {
    this.cine.update(rdt);
    if (this.cine.held) this.heldT = (this.heldT || 0) + rdt;
  }
  exit() { this.cine.dispose(); }
  /** 0..1: how far the card has come in (once the cinematic holds, or once it has run long enough). */
  cardK(after) { const c = this.cine; return clamp(Math.max(c.held ? 0.15 + (this.heldT || 0) * 1.6 : 0, (c.rt - after) * 1.6)); }
}

// ============================================================================ GAME OVER
export class GameOverScene extends HeldCinematic {
  enter(p = {}) {
    const run = this.game.run;
    this.run = run;
    this.play('fallen', { stage: p.stage ?? p.act ?? p.region ?? (run ? run.stage ?? run.act ?? 0 : 0), char: run ? run.char : undefined });
    this.unlocked = checkUnlocks();
    this.cause = p.cause || '';
  }
  draw(ui) {
    const c = this.cine;
    c.input();
    c.draw(ui);
    const k = this.cardK(5.2);
    if (k <= 0) return;
    dim(ui, 0.35 * k);
    const run = this.run;
    const W = 260, H = 196, x = ui.w / 2 - W / 2, y = 64 + Math.round((1 - ease.outCubic(k)) * 24);
    ui.ctx.globalAlpha = k;
    ui.panel('parchment', x, y, W, H, { seed: 9 });
    const ink = '#3a2618';
    ui.text('Turned to stone…', ui.w / 2, y + 10, { align: 'center', color: ink });
    const st = run ? run.stats : {};
    const stage = run ? (run.stage ?? run.act ?? 0) : 0;
    const R = REGIONS[Math.min(stage, REGIONS.length - 1)];
    const lines = [
      ['Reached', R ? R.name : '-'],
      ['Foes turned to stone', st.kills || 0], ['Statues mined', st.statues || st.mined || 0], ['Rooms cleared', st.rooms || 0],
      ['Things crafted', st.crafted || st.forged || 0], ['Ore found', st.ores || 0], ['Friends freed', st.rescues || (run && run.companions ? run.companions.length : 0)],
    ];
    lines.forEach(([a, b], i) => {
      ui.text(a, x + 18, y + 30 + i * 13, { color: ink });
      ui.text(String(b), x + W - 18, y + 30 + i * 13, { align: 'right', color: '#7a2a1a' });
    });
    if (this.unlocked.length) ui.text('{#a05a00}New ores unlocked:{/} ' + this.unlocked.map((id) => MATERIALS[id].name).join(', '), x + 18, y + 128, { color: ink, maxW: W - 36 });
    ui.ctx.globalAlpha = 1;
    if (k < 1) return;
    if (ui.button('go-camp', ui.w / 2 - 60, y + H - 24, 120, 20, 'Back to camp', { style: 'gold', icon: 'campfire' }) || this.game.input.actionPressed('confirm')) {
      this.game.run = null;
      this.game.go('title', {}, { transition: 'fade' });
    }
  }
}

// ============================================================================ VICTORY / ENDING
export class VictoryScene extends HeldCinematic {
  enter() {
    const run = this.game.run;
    this.run = run;
    this.play('ending', { char: run ? run.char : undefined });
    save.learn('unlocks.story', 'ending');
    this.unlocked = checkUnlocks();
  }
  draw(ui) {
    const c = this.cine;
    c.input();
    c.draw(ui);
    const k = this.cardK(1e9);
    if (k <= 0) return;
    ui.ctx.globalAlpha = k;
    const lg = logo(1);
    ui.img(lg, Math.round(ui.w / 2 - lg.width / 2), 30);
    ribbonTitle(ui, 'THE CREW IS HOME', ui.w / 2, 96, 'gold', k);
    const run = this.run;
    ui.text(`${run ? CHARACTERS[run.char].name : 'You'} beat Medusa and freed the crew. Wins: {gold}${save.data.stats.wins}{/}`, ui.w / 2, 120, { align: 'center', outline: '#140c10', thick: true });
    if (this.unlocked.length) ui.text('{gold}Unlocked:{/} ' + this.unlocked.map((id) => MATERIALS[id].name).join(', '), ui.w / 2, 134, { align: 'center', outline: '#140c10', thick: true });
    ui.text('{dim}Stew is on. Pip gets the first bowl.{/}', ui.w / 2, ui.h - 52, { align: 'center', outline: '#140c10' });
    ui.ctx.globalAlpha = 1;
    if (k < 1) return;
    if (ui.button('v-camp', ui.w / 2 - 60, ui.h - 36, 120, 20, 'Back to camp', { style: 'gold', icon: 'campfire' })) { this.game.run = null; this.game.go('title', {}, { transition: 'fade' }); }
  }
}
