// Isaac-style minimap: a small window of the floor around the current room in the top-right corner
// (visited rooms filled, known-but-unvisited rooms as dim outlines, icons for special rooms, the
// current room glowing), and a big parchment map when you hold / toggle M.
import { icon } from '../../ui/icons.js';
import { clamp } from '../../core/math.js';

const INK = '#140c10';
export const ROOM_ICON = { boss: 'skull', treasure: 'crown', craft: 'forge', vein: 'pickaxe', shrine: 'star', secret: 'question', start: 'campfire' };

function roomsOf(floor) { return floor.rooms instanceof Map ? [...floor.rooms.values()] : Object.values(floor.rooms || {}); }

/** Which rooms are shown: visited ones and their neighbours (and anything flagged known). */
export function shownRooms(floor) {
  const rooms = roomsOf(floor);
  const byId = (id) => (floor.rooms instanceof Map ? floor.rooms.get(id) : floor.rooms[id]);
  const out = new Set();
  for (const r of rooms) {
    if (!(r.visited || r.known || r.mapped)) continue;
    if (r.type === 'secret' && !r.visited && !r.mapped) continue;
    out.add(r);
    if (r.visited) for (const d of ['n', 'e', 's', 'w']) {
      const nb = r.doors && r.doors[d] != null ? byId(r.doors[d]) : null;
      if (nb && (nb.type !== 'secret' || nb.visited)) out.add(nb);
    }
  }
  return [...out];
}

function drawCell(ui, r, x, y, cw, ch, cur, t) {
  const ctx = ui.ctx;
  const vis = r.visited;
  ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, cw + 2, ch + 2);
  ctx.fillStyle = cur ? '#f4ead6' : vis ? (r.cleared ? '#8a8098' : '#a07a6a') : '#2e2a36';
  ctx.fillRect(x, y, cw, ch);
  if (cur) { const a = 0.5 + Math.sin(t * 5) * 0.3; ctx.globalAlpha = a; ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, cw, 1); ctx.fillRect(x, y + ch - 1, cw, 1); ctx.globalAlpha = 1; }
  else if (!vis) { ctx.fillStyle = '#4a4458'; ctx.fillRect(x, y, cw, 1); ctx.fillRect(x, y, 1, ch); }
  const ic = ROOM_ICON[r.type];
  if (ic && r.type !== 'start') {
    const i = icon(ic);
    if (i) { ctx.globalAlpha = vis || r.type === 'boss' || r.mapped ? 1 : 0.7; ctx.drawImage(i.canvas, Math.round(x + cw / 2 - i.w / 2), Math.round(y + ch / 2 - i.h / 2)); ctx.globalAlpha = 1; }
  }
}

/** Small corner minimap. Returns the rect it occupied. opts: { x, y, cols, rows, alpha } */
export function drawMinimap(ui, floor, curId, opts = {}) {
  if (!floor) return null;
  const cw = 17, ch = 12, gap = 3;
  const cols = opts.cols || 7, rows = opts.rows || 5;
  const W = cols * (cw + gap) + gap, H = rows * (ch + gap) + gap;
  const X = opts.x ?? ui.w - W - 10, Y = opts.y ?? 10;
  const ctx = ui.ctx;
  const cur = floor.rooms instanceof Map ? floor.rooms.get(curId) : floor.rooms[curId];
  if (!cur) return null;
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.fillStyle = 'rgba(10,8,14,0.62)'; ctx.fillRect(X, Y, W, H);
  ctx.fillStyle = '#3a3040'; ctx.fillRect(X, Y, W, 1); ctx.fillRect(X, Y + H - 1, W, 1); ctx.fillRect(X, Y, 1, H); ctx.fillRect(X + W - 1, Y, 1, H);
  ctx.save(); ctx.beginPath(); ctx.rect(X + 1, Y + 1, W - 2, H - 2); ctx.clip();
  const ox = X + gap + Math.floor(cols / 2) * (cw + gap), oy = Y + gap + Math.floor(rows / 2) * (ch + gap);
  const shown = shownRooms(floor);
  // corridors between shown neighbours
  ctx.fillStyle = '#5a5068';
  for (const r of shown) {
    if (!r.visited) continue;
    for (const [d, dx, dy] of [['e', 1, 0], ['s', 0, 1]]) {
      if (r.doors && r.doors[d] != null) {
        const x = ox + (r.gx - cur.gx) * (cw + gap), y = oy + (r.gy - cur.gy) * (ch + gap);
        if (dx) ctx.fillRect(x + cw, y + ch / 2 - 1, gap, 2); else ctx.fillRect(x + cw / 2 - 1, y + ch, 2, gap);
      }
    }
  }
  for (const r of shown) {
    const x = ox + (r.gx - cur.gx) * (cw + gap), y = oy + (r.gy - cur.gy) * (ch + gap);
    if (x < X - cw || y < Y - ch || x > X + W || y > Y + H) continue;
    drawCell(ui, r, x, y, cw, ch, r === cur, ui.time);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  return { x: X, y: Y, w: W, h: H };
}

/** Big map (hold / toggle M): every shown room on an old parchment sheet. k = open 0..1 */
export function drawBigMap(ui, floor, curId, k = 1, opts = {}) {
  if (!floor || k <= 0) return;
  const ctx = ui.ctx;
  const shown = shownRooms(floor);
  if (!shown.length) return;
  const minX = Math.min(...shown.map((r) => r.gx)), maxX = Math.max(...shown.map((r) => r.gx));
  const minY = Math.min(...shown.map((r) => r.gy)), maxY = Math.max(...shown.map((r) => r.gy));
  const cw = 34, ch = 24, gap = 6;
  const W = (maxX - minX + 1) * (cw + gap) + gap + 40, H = (maxY - minY + 1) * (ch + gap) + gap + 60;
  const X = Math.round(ui.w / 2 - W / 2), Y = Math.round(ui.h / 2 - H / 2 + (1 - k) * 30);
  ctx.globalAlpha = clamp(k) * 0.55; ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, ui.w, ui.h); ctx.globalAlpha = clamp(k);
  // parchment
  ctx.fillStyle = '#3a2614'; ctx.fillRect(X - 3, Y - 3, W + 6, H + 6);
  ctx.fillStyle = '#d8c49a'; ctx.fillRect(X, Y, W, H);
  ctx.fillStyle = '#c8b088'; for (let i = 0; i < 40; i++) { const sx = X + ((i * 97) % W), sy = Y + ((i * 53) % H); ctx.fillRect(sx, sy, 3 + (i % 4), 1); }
  ui.text(opts.title || 'Map', X + W / 2, Y + 8, { align: 'center', color: '#3a2214' });
  const ox = X + 20 + gap, oy = Y + 32 + gap;
  ctx.fillStyle = '#6a5038';
  for (const r of shown) {
    if (!r.visited) continue;
    const x = ox + (r.gx - minX) * (cw + gap), y = oy + (r.gy - minY) * (ch + gap);
    if (r.doors && r.doors.e != null && shown.some((o) => o.id === r.doors.e)) ctx.fillRect(x + cw, y + ch / 2 - 1, gap, 3);
    if (r.doors && r.doors.s != null && shown.some((o) => o.id === r.doors.s)) ctx.fillRect(x + cw / 2 - 1, y + ch, 3, gap);
  }
  for (const r of shown) {
    const x = ox + (r.gx - minX) * (cw + gap), y = oy + (r.gy - minY) * (ch + gap);
    ctx.fillStyle = '#3a2214'; ctx.fillRect(x - 1, y - 1, cw + 2, ch + 2);
    ctx.fillStyle = r.id === curId ? '#fff6dc' : r.visited ? (r.cleared ? '#b8a07a' : '#c88a6a') : '#a89070';
    ctx.fillRect(x, y, cw, ch);
    const ic = ROOM_ICON[r.type];
    if (ic && r.type !== 'start') { const i = icon(ic); if (i) ctx.drawImage(i.canvas, Math.round(x + cw / 2 - i.w / 2), Math.round(y + ch / 2 - i.h / 2)); }
    if (r.id === curId) { ctx.fillStyle = '#b8243a'; ctx.fillRect(x + cw / 2 - 2, y + ch / 2 - 2, 4, 4); }
  }
  ctx.globalAlpha = 1;
}
