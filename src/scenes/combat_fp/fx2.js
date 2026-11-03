// Screen-space stings for the first-person fight: light rings, god-ray fans, colour washes, slash
// streaks, claw marks and the glowing crack targets on a statue. Pixel-crisp, drawn over the 3D.
import { clamp } from '../../core/math.js';

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1)})`;
};

export class Fx2 {
  constructor() { this.rings = []; this.fans = []; this.washes = []; this.slashes = []; this.claws = []; this.edges = []; }
  ring(x, y, col = '#ffffff', o = {}) { this.rings.push({ x, y, col, t: 0, life: o.life || 0.5, r0: o.r0 || 6, r1: o.r1 || 110, w: o.w || 3 }); }
  rays(x, y, col = '#fff0c0', o = {}) { this.fans.push({ x, y, col, t: 0, life: o.life || 1, n: o.n || 14, len: o.len || 420, a: o.a || 0.3, spin: o.spin ?? 0.3, rot: Math.random() * 6 }); }
  wash(col, a = 0.3, life = 0.45) { this.washes.push({ col, a, t: 0, life }); }
  /** Red-to-dark vignette pulse at the screen edges (getting hit). */
  edge(col = '#d02a2a', a = 0.55, life = 0.6) { this.edges.push({ col, a, t: 0, life }); }
  slash(x1, y1, x2, y2, o = {}) { this.slashes.push({ x1, y1, x2, y2, t: 0, life: o.life || 0.22, col: o.col || '#ffffff', glow: o.glow || '#ffe8a8', w: o.w || 3 }); }
  /** Three monster claw rakes across the view. */
  claw(x, y, col = '#ff6a5a') {
    for (let i = -1; i <= 1; i++) this.claws.push({ x: x + i * 22, y, t: 0, life: 0.45, col, d: i * 0.12 });
  }
  update(dt) {
    for (const arr of [this.rings, this.fans, this.washes, this.slashes, this.claws, this.edges]) {
      for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += dt; if (arr[i].t >= arr[i].life) arr.splice(i, 1); }
    }
  }
  draw(ui) {
    const ctx = ui.ctx, W = ui.w, H = ui.h;
    for (const e of this.edges) {
      const k = e.t / e.life, a = e.a * (1 - k);
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      g.addColorStop(0, hexA(e.col, 0));
      g.addColorStop(1, hexA(e.col, a));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.fans) {
      const k = r.t / r.life, a = r.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      ctx.fillStyle = hexA(r.col, a);
      for (let i = 0; i < r.n; i++) {
        const ang = r.rot + (i / r.n) * Math.PI * 2 + r.t * r.spin, w = 0.07;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + Math.cos(ang - w) * r.len, r.y + Math.sin(ang - w) * r.len);
        ctx.lineTo(r.x + Math.cos(ang + w) * r.len, r.y + Math.sin(ang + w) * r.len);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const r of this.rings) {
      const k = r.t / r.life, rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      ctx.strokeStyle = hexA(r.col, 1 - k);
      ctx.lineWidth = Math.max(1, r.w * (1 - k));
      ctx.beginPath(); ctx.arc(Math.round(r.x), Math.round(r.y), rad, 0, Math.PI * 2); ctx.stroke();
    }
    for (const s of this.slashes) {
      const k = s.t / s.life;
      const n = Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / 2);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const w = Math.sin(u * Math.PI) * s.w * (1 - k * 0.6);
        const x = s.x1 + (s.x2 - s.x1) * u, y = s.y1 + (s.y2 - s.y1) * u;
        ctx.fillStyle = hexA(s.glow, 0.5 * (1 - k));
        ctx.fillRect(Math.round(x) - 1, Math.round(y - w), 3, Math.max(1, Math.round(w * 2)));
        ctx.fillStyle = hexA(s.col, 1 - k);
        ctx.fillRect(Math.round(x), Math.round(y - w / 2), 2, Math.max(1, Math.round(w)));
      }
    }
    ctx.restore();
    for (const c of this.claws) {
      const k = clamp((c.t - c.d) / (c.life - c.d), 0, 1);
      if (k <= 0) continue;
      const grow = Math.min(1, k * 4);
      const a = k < 0.25 ? 1 : 1 - (k - 0.25) / 0.75;
      const x0 = c.x + 40, y0 = c.y - 60, x1 = c.x - 40, y1 = c.y + 60;
      const xe = x0 + (x1 - x0) * grow, ye = y0 + (y1 - y0) * grow;
      const n = Math.ceil(Math.hypot(xe - x0, ye - y0) / 2);
      for (let i = 0; i <= n; i++) {
        const u = i / n, w = Math.sin(u * Math.PI) * 4;
        ctx.fillStyle = hexA('#2a0808', a * 0.8);
        ctx.fillRect(Math.round(x0 + (xe - x0) * u) - 1, Math.round(y0 + (ye - y0) * u - w / 2) - 1, 4, Math.max(2, Math.round(w)) + 2);
        ctx.fillStyle = hexA(c.col, a);
        ctx.fillRect(Math.round(x0 + (xe - x0) * u), Math.round(y0 + (ye - y0) * u - w / 2), 2, Math.max(1, Math.round(w)));
      }
    }
    for (const w of this.washes) {
      const k = w.t / w.life;
      ctx.fillStyle = hexA(w.col, w.a * (1 - k));
      ctx.fillRect(0, 0, W, H);
    }
  }
}

/** A glowing crack target on the statue: jagged pixel cracks + a breathing ring (tap me). */
export function drawCrackTarget(ui, x, y, t, o = {}) {
  const ctx = ui.ctx;
  const seed = o.seed || 1;
  const hit = !!o.hit;
  const pulse = 0.5 + Math.sin(t * 7 + seed) * 0.5;
  const col = hit ? '#6a6a72' : '#7affd8';
  // jagged crack: three branches of 1px steps
  ctx.save();
  if (!hit) ctx.globalCompositeOperation = 'lighter';
  for (let b = 0; b < 3; b++) {
    let px = x, py = y;
    const ang = seed * 2.1 + b * 2.09;
    for (let i = 0; i < 9; i++) {
      const a2 = ang + Math.sin(seed * 13 + i * 1.7 + b) * 0.8;
      px += Math.round(Math.cos(a2) * 2); py += Math.round(Math.sin(a2) * 2);
      ctx.fillStyle = hit ? '#2a2a30' : hexA('#ffffff', 0.9);
      ctx.fillRect(px, py, 1, 1);
      if (!hit) { ctx.fillStyle = hexA(col, 0.35 + pulse * 0.4); ctx.fillRect(px - 1, py - 1, 3, 3); }
    }
  }
  if (!hit) {
    const r = 11 + pulse * 4;
    ctx.strokeStyle = hexA(col, 0.5 + pulse * 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hexA('#ffffff', 0.25 + pulse * 0.3);
    ctx.beginPath(); ctx.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, r + 4, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
