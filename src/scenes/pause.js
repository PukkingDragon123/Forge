// Pause overlay (Esc on the map): resume, volume, abandon run.
import { Scene } from '../core/game.js';
import { dim, ribbonTitle } from './common.js';
import { save } from '../core/save.js';
import { COLORS } from '../ui/font.js';
import { clamp } from '../core/math.js';
import { gameOver } from './flow.js';

export class PauseOverlay extends Scene {
  get freezesBelow() { return true; }
  enter() { this.confirm = false; this.game.audio.play('ui_pop'); }
  draw(ui) {
    const g = this.game;
    dim(ui, 0.65);
    const W = 260, H = 184, x = ui.w / 2 - W / 2, y = ui.h / 2 - H / 2;
    ui.panel('leather', x, y, W, H, { tone: 'dark' });
    ribbonTitle(ui, 'Paused', ui.w / 2, y - 8, 'brown');
    const s = save.data.settings;
    const slider = (label, key, yy) => {
      ui.text(label, x + 14, yy, { color: COLORS.white });
      const sx = x + 76, sw = 108;
      ui.rect(sx, yy + 3, sw, 3, '#2a1d22');
      ui.rect(sx, yy + 3, Math.round(sw * s[key]), 3, '#ffb63d');
      ui.rect(sx + Math.round(sw * s[key]) - 2, yy, 4, 9, '#fff6e0');
      const h = ui.hit('psl' + key, sx - 4, yy - 3, sw + 8, 14);
      if (h.down || (h.hover && g.input.down)) { s[key] = clamp((ui.mx - sx) / sw, 0, 1); g.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx }); }
      if (h.clicked) save.write();
    };
    slider('Master', 'master', y + 18);
    slider('Music', 'music', y + 34);
    slider('Effects', 'sfx', y + 50);
    if (ui.button('p-resume', x + 14, y + 72, W - 28, 20, 'Resume', { style: 'gold', key: 'ESC' }) || (this.time > 0 && g.input.actionPressed('back'))) { save.write(); g.popOverlay(this); return; }
    if (!this.confirm) { if (ui.button('p-abandon', x + 14, y + 98, W - 28, 20, 'Abandon descent', { style: 'red' })) this.confirm = true; }
    else {
      ui.text('{bad}Give up this run?{/}', ui.w / 2, y + 100, { align: 'center' });
      if (ui.button('p-yes', x + 14, y + 114, 80, 18, 'Yes', { style: 'red' })) { g.popOverlay(this); gameOver(g, 'Abandoned'); }
      if (ui.button('p-no', x + W - 94, y + 114, 80, 18, 'No', { style: 'wood' })) this.confirm = false;
    }
    if (ui.touch) {
      // phone settings: buzz and fullscreen
      const s2 = save.data.settings;
      if (ui.button('p-buzz', x + 14, y + H + 6, (W - 34) / 2, 18, `Vibration: ${s2.haptics === 0 ? 'Off' : 'On'}`, { style: 'wood' })) { s2.haptics = s2.haptics === 0 ? 1 : 0; save.write(); g.haptic(20); }
      const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (ui.button('p-full', x + W / 2 + 3, y + H + 6, (W - 34) / 2, 18, fs ? 'Windowed' : 'Fullscreen', { style: 'wood' })) {
        if (fs) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); s2.fullscreen = 0; } else { s2.fullscreen = 1; g.enterFullscreen && g.enterFullscreen(); }
        save.write();
      }
      ui.text('{dim}Tap: strike, pick, act · Hold: inspect · Buttons: guard, special, rotate · Bag: bottom left{/}', ui.w / 2, y + H - 18, { align: 'center', font: 'small', maxW: W - 10 });
    } else ui.text('{dim}Controls: SPACE/click strike · SHIFT/right-click guard · E special · TAB bag · R rotate{/}', ui.w / 2, y + H - 18, { align: 'center', font: 'small', maxW: W - 10 });
  }
}
