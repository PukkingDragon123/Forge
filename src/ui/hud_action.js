// The action HUD (Hades-like, minimal): a forged-iron health bar with a trailing chip bar and the
// number, dash pips above it, the weapon and two skill slots with cooldown sweeps at the bottom
// right, the bag button, a boss bar across the top, floating pickup toasts above the health bar, a
// contextual interact prompt over the thing you can use, and a red pulse at low health.
// Touch: the skill slots, the bag and the interact prompt are also on-screen buttons.
import { icon } from './icons.js';
import { itemSprite, materialSprite, weaponSprite } from '../art/sprites.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import * as Skills from '../data/skills.js';
import { clamp, ease } from '../core/math.js';

const INK = '#140c10';

/** Persistent HUD state (chip bar, toasts). One per scene. */
export function makeHudState() { return { chip: null, hpShown: null, toasts: [], hurtT: 0, lastHp: null, bossChip: null, t: 0 }; }

/** A pickup toast: icon + name, stacking above the health bar. */
export function hudToast(st, text, opts = {}) {
  const same = st.toasts.find((t) => t.text === text && t.t < 1.2);
  if (same) { same.n = (same.n || 1) + 1; same.t = 0; return; }
  st.toasts.push({ text, t: 0, item: opts.item || null, color: opts.color || '#f4ead6', icon: opts.icon || null, n: 1 });
  if (st.toasts.length > 5) st.toasts.shift();
}

function skillDef(id) {
  const S = Skills.SKILLS || {};
  return (id && (S[id] || S[id.id])) || null;
}
function skillIcon(def, id) {
  return (def && def.icon) || { spore_burst: 'poison', stone_spikes: 'block', ember_dash: 'fire', shield_bash: 'shield', whirlwind: 'axe', frost_nova: 'ice', chain_spark: 'shock', root_snare: 'bleed', gem_shards: 'gem', mushroom_turret: 'star' }[id] || 'sparkle';
}

/** Forged-iron frame around a rect. */
function frame(ctx, x, y, w, h, lit = '#8a7a6a', dark = '#2a2026') {
  ctx.fillStyle = INK; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = dark; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = lit; ctx.fillRect(x - 1, y - 1, w + 2, 1); ctx.fillRect(x - 1, y - 1, 1, h + 2);
}

/** Pie-shaped cooldown shade over a square slot (k = fraction remaining). */
function sweep(ctx, x, y, s, k) {
  if (k <= 0) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
  ctx.fillStyle = 'rgba(8,6,12,0.68)';
  ctx.beginPath(); ctx.moveTo(x + s / 2, y + s / 2);
  ctx.arc(x + s / 2, y + s / 2, s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/**
 * Draw the HUD. p: { player, loadout, run, boss: { name, hp, maxHp, phase }|null, interact: { x, y, label, key }|null,
 *   hidden (bool), touch (bool) }. Returns { bag, interact, skill: [b0, b1] } (clicked/tapped this frame).
 */
export function drawActionHud(ui, st, p) {
  const ctx = ui.ctx, dt = ui.dt || 1 / 60;
  st.t += dt;
  const out = { bag: false, interact: false, skill: [false, false] };
  if (p.hidden) return out;
  const pl = p.player || {}, run = p.run || {};
  const maxHp = Math.max(1, pl.maxHp || run.maxHp || 1), hp = clamp(pl.hp ?? run.hp ?? maxHp, 0, maxHp);
  if (st.hpShown === null) { st.hpShown = hp; st.chip = hp; st.lastHp = hp; }
  if (hp < st.lastHp) st.hurtT = 0.5;
  st.lastHp = hp;
  st.hpShown += (hp - st.hpShown) * Math.min(1, dt * 18);
  st.chip = st.chip > st.hpShown ? Math.max(st.hpShown, st.chip - maxHp * dt * 0.45) : st.hpShown;
  st.hurtT = Math.max(0, st.hurtT - dt);
  const low = hp / maxHp < 0.3;

  // ---- low-health pulse
  if (low && hp > 0) {
    const a = 0.16 + Math.sin(st.t * 5.5) * 0.08;
    const g = ctx.createRadialGradient(ui.w / 2, ui.h / 2, ui.h * 0.35, ui.w / 2, ui.h / 2, ui.h * 0.85);
    g.addColorStop(0, 'rgba(160,10,20,0)'); g.addColorStop(1, `rgba(170,14,24,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, ui.w, ui.h);
  }

  // ---- health bar (bottom left)
  const bx = 16, by = ui.h - 26, bw = 168, bh = 9;
  const shake = st.hurtT > 0 ? Math.round((Math.random() - 0.5) * 3 * st.hurtT * 2) : 0;
  frame(ctx, bx + shake, by, bw, bh);
  ctx.fillStyle = '#2a0c10'; ctx.fillRect(bx + shake, by, bw, bh);
  ctx.fillStyle = '#f4e6d0'; ctx.fillRect(bx + shake, by, Math.round(bw * st.chip / maxHp), bh);
  const fw = Math.round(bw * st.hpShown / maxHp);
  ctx.fillStyle = low ? '#e0283a' : '#c8283a'; ctx.fillRect(bx + shake, by, fw, bh);
  ctx.fillStyle = low ? '#ff6a6a' : '#ff5a5a'; ctx.fillRect(bx + shake, by, fw, 2);
  ctx.fillStyle = '#7a1420'; ctx.fillRect(bx + shake, by + bh - 2, fw, 2);
  // notches every 25 hp
  ctx.fillStyle = 'rgba(20,10,16,0.45)';
  for (let v = 25; v < maxHp; v += 25) ctx.fillRect(bx + shake + Math.round(bw * v / maxHp), by, 1, bh);
  ui.icon('heart', bx - 12 + shake, by - 4);
  ui.text(`${Math.ceil(hp)}`, bx + bw + 8, by - 1, { color: low ? '#ff8a7a' : '#f4e6d0', outline: INK });
  ui.text(`/${maxHp}`, bx + bw + 8 + ui.measure(`${Math.ceil(hp)}`) + 1, by + 1, { font: 'small', color: '#a8988a', outline: INK });

  // ---- dash pips above the bar
  const dmax = Math.max(1, (p.loadout && p.loadout.stats && p.loadout.stats.dashCharges) || pl.dashMax || 2);
  const dn = clamp(pl.dashCharges ?? dmax, 0, dmax);
  for (let i = 0; i < dmax; i++) {
    const x = bx + i * 13, y = by - 13;
    const full = i < Math.floor(dn + 1e-6);
    const part = !full && i < dn ? dn - Math.floor(dn) : 0;
    ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, 11, 6);
    ctx.fillStyle = '#2a2a3a'; ctx.fillRect(x, y, 9, 4);
    if (full) { ctx.fillStyle = '#9ad8ff'; ctx.fillRect(x, y, 9, 4); ctx.fillStyle = '#e8f8ff'; ctx.fillRect(x, y, 9, 1); }
    else if (part > 0) { ctx.fillStyle = '#4a7aa0'; ctx.fillRect(x, y, Math.round(9 * part), 4); }
  }

  // ---- pickup toasts (stacking upward from the bar)
  for (let i = st.toasts.length - 1; i >= 0; i--) {
    const t = st.toasts[i];
    t.t += dt;
    if (t.t > 2.6) { st.toasts.splice(i, 1); continue; }
  }
  st.toasts.forEach((t, i) => {
    const k = ease.outBack(clamp(t.t / 0.25)), a = t.t > 2.1 ? 1 - (t.t - 2.1) / 0.5 : 1;
    const y = by - 34 - (st.toasts.length - 1 - i) * 18;
    const x = bx - 4 + Math.round((1 - k) * -40);
    ctx.globalAlpha = clamp(a);
    const spr = t.item ? safeSprite(t.item, 16) : null;
    if (spr) ctx.drawImage(spr, x, y - 4, 16, 16);
    else if (t.icon) ui.icon(t.icon, x + 2, y - 1);
    const label = t.n > 1 ? `${t.text} ×${t.n}` : t.text;
    ui.text(label, x + 20, y, { color: t.color, outline: INK });
    ctx.globalAlpha = 1;
  });

  // ---- weapon, skills and bag (bottom right; on touch they sit above the action cluster)
  const touch = !!p.touch;
  const sz = 30, gap = 6;
  if (!touch) {
  const rx = ui.w - 16 - (sz + gap) * 3;
  const ry = ui.h - sz - 14;
  const w = (p.loadout && p.loadout.weapon) || run.hand || null;
  // weapon slot
  frame(ctx, rx, ry, sz, sz, '#a08a5a', '#1e1820');
  ctx.fillStyle = '#16121a'; ctx.fillRect(rx, ry, sz, sz);
  const ws = w ? safeWeapon(w, sz) : null;
  if (ws) ctx.drawImage(ws, rx, ry, sz, sz); else ui.icon('pickaxe', rx + sz / 2, ry + sz / 2, { center: true });
  const stone = w && w.stone ? clamp(w.stone) : 0;
  if (stone > 0) { ctx.fillStyle = 'rgba(150,150,160,0.75)'; ctx.fillRect(rx, ry + sz - Math.round(sz * stone), 3, Math.round(sz * stone)); }
  const wh = ui.hit('hud-weapon', rx, ry, sz, sz, { sound: false });
  if (wh.hover && w) ui.tooltip({ title: w.name || 'Weapon', body: w.dmg ? `${w.dmg} dmg` : '' });
  // skill slots
  const skills = (p.loadout && p.loadout.skills) || run.skills || [null, null];
  for (let i = 0; i < 2; i++) {
    const x = rx + (sz + gap) * (i + 1), y = ry;
    const raw = skills[i];
    const id = raw && (typeof raw === 'string' ? raw : raw.skill || raw.id);
    const def = skillDef(id);
    frame(ctx, x, y, sz, sz, id ? '#7ab8d8' : '#5a5060', '#1e1820');
    ctx.fillStyle = id ? '#1a2230' : '#16121a'; ctx.fillRect(x, y, sz, sz);
    if (id) {
      const ic = icon(skillIcon(def, id));
      if (ic) ctx.drawImage(ic.canvas, Math.round(x + sz / 2 - ic.w), Math.round(y + sz / 2 - ic.h), ic.w * 2, ic.h * 2);
      const cdMax = (def && def.cd) || 6;
      const cd = (pl.skillCd && pl.skillCd[i]) || 0;
      sweep(ctx, x, y, sz, clamp(cd / cdMax));
      if (cd > 0.05) ui.text(cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1), x + sz / 2, y + sz / 2 - 4, { align: 'center', color: '#f4ead6', outline: INK });
      else if (pl.skillReady && pl.skillReady[i]) { ctx.globalAlpha = 0.35 + Math.sin(st.t * 8) * 0.2; ctx.fillStyle = '#bfe8ff'; ctx.fillRect(x, y, sz, 1); ctx.fillRect(x, y + sz - 1, sz, 1); ctx.globalAlpha = 1; }
    } else ui.text('—', x + sz / 2, y + sz / 2 - 4, { align: 'center', color: '#5a5060' });
    if (!touch) ui.keycap(i ? 'E' : 'Q', x + sz - 7, y - 6);
    const h = ui.hit('hud-skill' + i, x, y, sz, sz, { sound: false });
    if (h.hover) ui.tooltip(def ? { title: def.name, body: def.desc || '' } : { title: 'Empty skill slot', body: 'Craft a skill gem' });
    if (h.clicked) out.skill[i] = true;
  }
  }
  // bag
  const rxB = ui.w - 16 - (sz + gap) * 3, ryB = ui.h - sz - 14;
  const bgx = touch ? 10 : rxB - 40, bgy = touch ? 10 + 14 : ryB - 2;
  if (touch) {
    // an on-screen button (Touch_bag → the 'bag' action) so it works while the stick is held
    // (the scene reads the 'bag' action; this only draws and registers the button)
    ui.touchButton('bag', bgx + 20, bgy + 18, 24, { icon: 'bag', style: 'brass' });
  } else {
    const bh2 = ui.hit('hud-bag', bgx, bgy, 32, 32, { sound: false });
    ui.icon('bag', bgx, bgy - (bh2.hover ? 2 : 0), { scale: 2 });
    ui.keycap('TAB', bgx + 22, bgy - 4);
    if (bh2.hover) ui.tooltip({ title: 'Backpack', body: 'Your build lives here' });
    if (bh2.clicked) out.bag = true;
  }

  // ---- boss bar
  const boss = p.boss;
  if (boss && boss.maxHp) {
    const W = 360, X = Math.round(ui.w / 2 - W / 2), Y = 30;
    const k = clamp(boss.hp / boss.maxHp);
    if (st.bossChip === null || st.bossChip < k) st.bossChip = k;
    st.bossChip = Math.max(k, st.bossChip - dt * 0.25);
    ui.text(boss.title ? `${boss.name || 'Boss'}  ·  ${boss.title}` : boss.name || 'Boss', ui.w / 2, Y - 14, { align: 'center', color: '#ffd8a8', outline: INK });
    frame(ctx, X, Y, W, 7, '#c8a050', '#2a1a10');
    ctx.fillStyle = '#20080c'; ctx.fillRect(X, Y, W, 7);
    ctx.fillStyle = '#f4e6d0'; ctx.fillRect(X, Y, Math.round(W * st.bossChip), 7);
    ctx.fillStyle = '#b8243a'; ctx.fillRect(X, Y, Math.round(W * k), 7);
    ctx.fillStyle = '#ff6a6a'; ctx.fillRect(X, Y, Math.round(W * k), 1);
    if (boss.phases > 1) for (let i = 1; i < boss.phases; i++) { ctx.fillStyle = INK; ctx.fillRect(X + Math.round(W * i / boss.phases), Y - 1, 1, 9); }
  } else st.bossChip = null;

  // ---- interact prompt over the target
  const it = p.interact;
  if (it && it.x > -50 && it.x < ui.w + 50) {
    const bob = Math.round(Math.sin(st.t * 4) * 2);
    const label = it.label || 'Use';
    const tw = ui.measure(label) + (touch ? 26 : 28);
    const x = Math.round(clamp(it.x - tw / 2, 4, ui.w - tw - 4)), y = Math.round(clamp(it.y - 26 + bob, 30, ui.h - 40));
    ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, tw + 2, 16);
    ctx.fillStyle = '#2a2026'; ctx.fillRect(x, y, tw, 14);
    ctx.fillStyle = '#c8a050'; ctx.fillRect(x, y, tw, 1);
    if (!touch) { ui.keycap(it.key || 'F', x + 3, y + 1); ui.text(label, x + 20, y + 3, { color: '#f4ead6' }); }
    else { ui.icon('arrowU', x + 3, y + 3); ui.text(label, x + 18, y + 3, { color: '#f4ead6' }); }
    const h = ui.hit('hud-interact', x - 4, y - 4, tw + 8, 22, { sound: false });
    if (h.clicked) out.interact = true;
  }
  return out;
}

function safeSprite(item, size) {
  try {
    if (item.bp) return weaponSprite(item, size);
    if (MATERIALS[item.id]) return materialSprite(item.id, size >= 24 ? 32 : 32);
  } catch (e) { /* missing art */ }
  return null;
}
function safeWeapon(w, size) {
  try {
    if (w.look) return weaponSprite({ bp: w.look.bp || w.bp, ids: w.look.ids || ['iron'], grade: Math.max(0, (w.q ?? 2) - 1) }, 64);
    if (w.id && MATERIALS[w.id]) return materialSprite(w.id, 32);
    if (w.bp) return weaponSprite(w, 64);
  } catch (e) { /* missing art */ }
  return null;
}
void RARITY;
