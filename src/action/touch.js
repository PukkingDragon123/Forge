// On-screen controls for action play on touchscreens (virtual 960×540 coordinates): a floating
// joystick on the left half, and on the right a big Attack medallion ringed by Dash, Special and the
// two skills (with cooldown sweeps), plus Interact when something is in reach.
import { skillDef } from './skills.js';
import { drawText } from '../ui/font.js';

const TAU = Math.PI * 2;
export const TOUCH_LAYOUT = {
  stickZone: [0, 110, 470, 540],     // x0 y0 x1 y1
  stickHome: [130, 430],             // where the faint idle stick sits
  attack: [872, 448, 40],
  dash: [776, 486, 27],
  special: [884, 350, 25],
  skill0: [792, 400, 23],
  skill1: [714, 470, 23],
  interact: [800, 300, 24],
};

function sweep(ctx, x, y, r, k, color = 'rgba(8,6,12,0.62)') {
  if (k <= 0) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, k));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draw the controls for a Player (no-op on desktop). */
export function drawControls(ui, P) {
  if (!ui.touch || !P || P.dead || !P.controls) return;
  const inp = ui.input, L = TOUCH_LAYOUT, ctx = ui.ctx;
  inp.useStick(...L.stickZone);
  // joystick
  const st = inp.stick;
  const bx = st.on ? st.ox : L.stickHome[0], by = st.on ? st.oy : L.stickHome[1];
  ctx.save();
  ctx.globalAlpha = st.on ? 0.55 : 0.22;
  ctx.strokeStyle = '#f4e6c8'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(bx, by, st.r, 0, TAU); ctx.stroke();
  ctx.globalAlpha = st.on ? 0.25 : 0.1;
  ctx.fillStyle = '#140c10'; ctx.beginPath(); ctx.arc(bx, by, st.r, 0, TAU); ctx.fill();
  const kx = bx + st.dx * st.r, ky = by + st.dy * st.r;
  ctx.globalAlpha = st.on ? 0.85 : 0.35;
  ctx.fillStyle = '#e8c890'; ctx.beginPath(); ctx.arc(kx, ky, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.arc(kx, ky + 2, 11, 0, TAU); ctx.fill();
  ctx.restore();
  // buttons
  const moves = P.moves;
  ui.touchButton('a_attack', L.attack[0], L.attack[1], L.attack[2], { icon: (P.weapon && P.weapon.bp) || 'pickaxe', style: 'ember', glow: P.state === 'attack' });
  ui.touchButton('a_dash', L.dash[0], L.dash[1], L.dash[2], { icon: 'speed', style: 'iron' });
  // dash pips
  for (let i = 0; i < P.dashMax; i++) {
    ctx.fillStyle = i < P.dashCharges ? '#ffe8a0' : '#3a3038';
    ctx.fillRect(L.dash[0] - (P.dashMax * 6) / 2 + i * 6, L.dash[1] + L.dash[2] + 2, 4, 3);
  }
  if (moves.special) {
    ui.touchButton('a_special', L.special[0], L.special[1], L.special[2], { icon: 'star', style: 'brass' });
    if (P.specialCd > 0) sweep(ctx, L.special[0], L.special[1], L.special[2] - 2, P.specialCd / (moves.special.cd || 1));
  }
  for (let i = 0; i < 2; i++) {
    const id = P.skills[i], pos = L['skill' + i];
    if (!id) continue;
    const d = skillDef(id);
    ui.touchButton('a_skill' + (i + 1), pos[0], pos[1], pos[2], { icon: (d && d.icon) || 'rune', style: 'rune', glow: P.skillCd[i] <= 0 && P.age % 4 < 0.4, glowColor: '#c8a0ff' });
    if (P.skillCd[i] > 0) {
      sweep(ctx, pos[0], pos[1], pos[2] - 2, P.skillCd[i] / (P.skillCdMax[i] || 1));
      drawText(ctx, String(Math.ceil(P.skillCd[i])), pos[0], pos[1] - 4, { align: 'center', color: '#ffffff', outline: '#140c10' });
    }
  }
  const it = P.interactTarget;
  if (it) {
    ui.touchButton('a_interact', L.interact[0], L.interact[1], L.interact[2], { icon: it.icon || 'arrowU', style: 'jade', glow: true, glowColor: '#9affc8', label: it.label ? undefined : undefined });
    if (it.label) drawText(ctx, it.label, L.interact[0], L.interact[1] - L.interact[2] - 12, { align: 'center', color: '#f4e6c8', outline: '#140c10', font: 'small' });
  }
}
