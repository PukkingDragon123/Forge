// The fight's tiny HUD: a heart counter, the foe's slim bar, the blade's stone meter, the special
// charge, companion + stew icons and the wind-up warning. Numbers and icons, almost no words.
import { clamp } from '../../core/math.js';
import { COLORS } from '../../ui/font.js';

const fmt = (n) => (n >= 100000 ? Math.round(n / 1000) + 'k' : n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
export { fmt };

export function drawHeart(ui, s) {
  const run = s.run;
  const x = 10, y = 10;
  const k = clamp(run.hp / run.maxHp, 0, 1);
  const low = k < 0.3;
  const beat = low ? 1 + Math.max(0, Math.sin(s.time * 8)) * 0.25 : 1 + s.heartKick * 0.4;
  const ctx = ui.ctx;
  ctx.save();
  ctx.translate(x + 8, y + 8);
  ctx.scale(beat * 2, beat * 2);
  ui.icon('heart', -5, -5);
  ctx.restore();
  ui.text(`${Math.max(0, Math.ceil(run.hp))}`, x + 22, y + 3, { color: low ? COLORS.bad : COLORS.white, outline: '#140c10', outlineShadow: false });
  // statuses on you
  if (s.sim) {
    const st = s.sim.pst;
    const map = [['web', 'event'], ['daze', 'eye'], ['poison', 'poison'], ['burn', 'fire'], ['cracked', 'curse']];
    let ix = x + 26 + ui.measure(String(Math.ceil(run.hp)));
    for (const [k2, ic] of map) if (st[k2] > 0) { ui.icon(ic, ix, y + 3); ix += 11; }
  }
  // companions and stews in a little row underneath
  let cx = x;
  const cy = y + 22;
  for (const c of s.comp) {
    const pop = c.pop > 0 ? 1 + c.pop * 0.6 : 1;
    ctx.save();
    ctx.translate(cx + 5, cy + 5); ctx.scale(pop, pop);
    ui.icon(c.icon, -5, -5, { alpha: c.used ? 0.35 : 1 });
    ctx.restore();
    cx += 13;
  }
  if (s.comp.length && s.buffs.length) cx += 4;
  for (const b of s.buffs) { ui.icon(b.icon || 'star', cx, cy, { alpha: 0.9 }); cx += 12; }
}

export function drawMonsterBar(ui, s) {
  const sim = s.sim;
  if (!sim || s.hideBar) return;
  const hp = sim.m.hp, max = sim.m.maxHp;
  const big = s.boss;
  const bw = big ? 260 : s.elite ? 160 : 120;
  const x = Math.round(ui.w / 2 - bw / 2), y = 12;
  ui.text(s.def.name + (s.elite ? ' {epic}★{/}' : ''), ui.w / 2, y - 2, { align: 'center', font: big ? 'body' : 'small', color: big ? COLORS.gold : '#e8dccc', outline: '#140c10', outlineShadow: false });
  const by = y + (big ? 11 : 8), bh = big ? 5 : 3;
  ui.rect(x - 1, by - 1, bw + 2, bh + 2, '#140c10');
  ui.rect(x, by, bw, bh, '#3a2a2a');
  const tw = Math.round(bw * clamp(s.hpTrail, 0, 1));
  ui.rect(x, by, tw, bh, '#f0e0c8');
  const fw = Math.round(bw * clamp(hp / max, 0, 1));
  const cols = big ? ['#b03ad0', '#ff9af0'] : ['#d03a3a', '#ff8a7a'];
  if (fw > 0) { ui.rect(x, by, fw, bh, cols[0]); ui.rect(x, by, fw, 1, cols[1]); }
  if (big && s.def.phases) for (const ph of s.def.phases) ui.rect(x + Math.round(bw * ph.at), by - 1, 1, bh + 2, '#ffd25e');
  // the foe's statuses, icons only
  const st = sim.m.st;
  const list = [];
  if (st.burn > 0) list.push(['fire', st.burn]);
  if (st.frozen > 0) list.push(['ice', '!']); else if (st.chill > 0) list.push(['ice', st.chill]);
  if (st.poison > 0) list.push(['poison', st.poison]);
  if (st.bleed > 0) list.push(['bleed', st.bleed]);
  if (st.stun > 0) list.push(['shock', '!']);
  let sx = Math.round(ui.w / 2 - list.length * 11);
  for (const [ic, n] of list) {
    ui.icon(ic, sx, by + bh + 3);
    ui.text(String(n), sx + 10, by + bh + 4, { font: 'small', color: COLORS.white, outline: '#140c10' });
    sx += 22;
  }
}

/** Bottom-left: what you hold and how much of it is stone. */
export function drawBlade(ui, s) {
  const x = 10, y = ui.h - 22;
  const w = s.weapon;
  if (!w || s.usingPick) {
    ui.icon('pickaxe', x, y - 1);
    ui.text('pickaxe', x + 13, y, { font: 'small', color: '#b8a888', outline: '#140c10' });
    return;
  }
  ui.icon(w.bp && ['sword', 'dagger', 'axe', 'hammer', 'spear', 'staff'].includes(w.bp) ? w.bp : 'sword', x, y - 1);
  const k = clamp(s.stoneShown, 0, 1);
  const bw = 44, bx = x + 14, by = y + 2;
  ui.rect(bx - 1, by - 1, bw + 2, 6, '#140c10');
  ui.rect(bx, by, bw, 4, '#3a4a5a');
  const sw = Math.round(bw * k);
  ui.rect(bx, by, sw, 4, '#8e8a84');
  ui.rect(bx, by, sw, 1, '#c8c4bc');
  if (k > 0 && k < 1) ui.rect(bx + sw, by - 1, 1, 6, '#9affd8');
  // segment ticks, and how many more kills the blade has in it
  for (let i = 1; i < 5; i++) ui.rect(bx + Math.round((bw * i) / 5), by, 1, 4, '#140c10');
  const left = s.killsLeft();
  if (left !== null && left < 100) ui.text(left <= 0 ? '!' : '×' + left, bx + bw + 5, y, { font: 'small', color: left <= 1 ? '#ff8a7a' : '#c8c4bc', outline: '#140c10' });
  if (ui.hit('fp-stone', x, y - 3, bw + 18, 12, { cursor: false }).hover) {
    ui.tooltip({ title: w.name, body: `{@sword}${fmt(w.dmg)}  · Stone ${Math.round(k * 100)}%\nFull stone: it crumbles.` });
  }
}

/** Special charge, near the Special button. */
export function drawSpecial(ui, s) {
  const sim = s.sim;
  if (!sim) return;
  const full = sim.special >= 1;
  // on touch the charge rings the Special medallion itself (it appears when full)
  const cx = ui.w - (ui.touch ? 150 : 44), cy = ui.h - (ui.touch ? 120 : 30);
  const r = ui.touch ? 33 : 11;
  const ctx = ui.ctx;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#140c10';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = full ? (Math.sin(s.time * 10) > 0 ? '#fff0b0' : '#ffd25e') : '#9a6ad8';
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(sim.special, 0, 1)); ctx.stroke();
  ctx.restore();
  if (ui.touch) { if (!full) ui.icon('star', cx - 5, cy - 5, { alpha: 0.45 }); return; }
  ui.icon('star', cx - 5, cy - 5, { alpha: full ? 1 : 0.5 });
  if (full) ui.keycap('E', cx + 14, cy - 6, Math.sin(s.time * 10) > 0);
  if (full && ui.hit('fp-special', cx - r - 2, cy - r - 2, r * 2 + 4, r * 2 + 4).clicked) s.trySpecial();
}

/**
 * The wind-up warning: a ring that closes on the foe as its blow comes, gold where a Guard turns
 * into a parry. Red ones cannot be blocked, only parried.
 */
export function drawTelegraph(ui, s) {
  const T = s.tele, sim = s.sim;
  if (!T || !sim) return;
  const p = s.screen(s.hitWorld());
  const left = T.impact - sim.t;
  const k = clamp(1 - left / T.windup, 0, 1);
  const col = T.kind === 'unblockable' ? '#ff4a4a' : T.kind === 'heavy' ? '#ff9a3a' : '#ffe08a';
  const ctx = ui.ctx;
  const a = T.res ? clamp(1 - T.rt / 0.35, 0, 1) : 1;
  if (a <= 0) return;
  const win = sim.parryWin();
  const inPerfect = Math.abs(left) <= win;
  const r = 10 + (1 - k) * 46;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.lineWidth = inPerfect ? 3 : 2;
  ctx.strokeStyle = inPerfect ? '#ffffff' : col;
  ctx.beginPath(); ctx.arc(Math.round(p.x), Math.round(p.y), T.res ? 10 + T.rt * 60 : r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ffd25e';
  ctx.beginPath(); ctx.arc(Math.round(p.x), Math.round(p.y), 10, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  if (!T.res) {
    ui.icon(T.kind === 'unblockable' ? 'skull' : 'shield', Math.round(p.x) - 5, Math.round(p.y) - 5, { alpha: 0.6 + k * 0.4 });
    if (s.showGuardHint && !ui.touch) ui.keycap('SHIFT', Math.round(p.x) + 16, Math.round(p.y) - 6, inPerfect);
  } else {
    const txt = { parry: 'PARRY', block: 'block', hit: '', miss: 'dodged', interrupt: '' }[T.res];
    if (txt) {
      ctx.globalAlpha = a;
      ui.text(txt, Math.round(p.x), Math.round(p.y) + 14, { align: 'center', font: T.res === 'parry' ? 'body' : 'small', color: T.res === 'parry' ? COLORS.gold : '#c8d8e8', outline: '#140c10' });
      ctx.globalAlpha = 1;
    }
  }
}
