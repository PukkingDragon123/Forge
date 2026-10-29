// 2D pixel particles for the mine: sparks with trails, rolling dust clouds, drips that splash and
// ripple, motes drifting in the light shafts, ore glitter, gem shines, steam, shockwave rings and
// screen-space lens flares for rare finds. Everything is drawn in virtual pixels on the UI canvas.
import { puffCanvas, flareCanvas, glow } from './mine_kit.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class MineFX {
  constructor(floorY) { this.p = []; this.floor = floorY; }
  add(o) { if (this.p.length < 1100) { o.t = 0; this.p.push(o); } return o; }

  sparks(x, y, n, cols = ['#fff6c8', '#ffd27a', '#ffffff', '#ff9a5a'], speed = 180) {
    for (let i = 0; i < n; i++) { const a = rand(-Math.PI, Math.PI * 0.15), s = rand(speed * 0.35, speed); this.add({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: rand(0.25, 0.7), col: pickOf(cols), g: 520, bounced: false }); }
  }
  dust(x, y, n, col = '#c8b4b0', spread = 14) {
    for (let i = 0; i < n; i++) this.add({ k: 'dust', x: x + rand(-spread, spread), y: y + rand(-spread * 0.6, spread * 0.6), vx: rand(-26, 26), vy: rand(-30, 6), r0: Math.round(rand(2, 4)), r1: Math.round(rand(6, 11)), life: rand(0.6, 1.3), col });
  }
  ring(x, y, col = '#fff2d6', r = 22) { this.add({ k: 'ring', x, y, r, life: 0.32, col }); }
  flare(x, y, col, size = 26, life = 1.1) { this.add({ k: 'flare', x, y, col, size, life }); }
  glitter(x, y, col = '#ffffff', size = 1) { this.add({ k: 'glitter', x, y, col, size, life: rand(0.35, 0.7) }); }
  shine(x, y, col = '#ffffff') { this.add({ k: 'glitter', x, y, col, size: 3, life: 0.55 }); }
  mote(x, y) { this.add({ k: 'mote', x, y, vx: rand(-4, 6), vy: rand(-3, 3), life: rand(3, 6), ph: rand(0, 6) }); }
  drip(x, y) { this.add({ k: 'drip', x, y, vy: 0, life: 4 }); }
  steam(x, y) { this.add({ k: 'steam', x, y, vx: rand(-6, 6), vy: rand(-26, -14), r0: 2, r1: Math.round(rand(7, 12)), life: rand(1.4, 2.2), col: '#efe6f4' }); }
  spore(x, y, col) { this.add({ k: 'spore', x, y, vx: rand(-5, 5), vy: rand(-8, -2), life: rand(3, 5), col, ph: rand(0, 6) }); }

  update(dt) {
    const F = this.floor;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const o = this.p[i];
      o.t += dt;
      if (o.t >= o.life) { this.p.splice(i, 1); continue; }
      switch (o.k) {
        case 'spark':
          o.vy += o.g * dt; o.x += o.vx * dt; o.y += o.vy * dt;
          if (o.y > F && !o.bounced) { o.y = F; o.vy *= -0.35; o.vx *= 0.6; o.bounced = true; }
          break;
        case 'dust': o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= 1 - dt * 1.8; o.vy *= 1 - dt * 1.8; break;
        case 'steam': o.x += o.vx * dt + Math.sin(o.t * 3) * 0.2; o.y += o.vy * dt; break;
        case 'mote': o.x += o.vx * dt + Math.sin(o.t * 0.9 + o.ph) * 0.08; o.y += o.vy * dt + Math.cos(o.t * 0.7 + o.ph) * 0.06; break;
        case 'spore': o.x += o.vx * dt + Math.sin(o.t * 1.4 + o.ph) * 0.2; o.y += o.vy * dt; break;
        case 'drip':
          o.vy += 700 * dt; o.y += o.vy * dt;
          if (o.y >= F + 4) {
            this.p.splice(i, 1);
            for (let k = 0; k < 4; k++) this.add({ k: 'spark', x: o.x, y: F + 3, vx: rand(-40, 40), vy: rand(-90, -40), life: 0.35, col: '#cfe4ff', g: 600, bounced: true });
            this.add({ k: 'ring', x: o.x, y: F + 6, r: 9, life: 0.5, col: '#cfe4ff', flat: true });
          }
          break;
        default: break;
      }
    }
  }

  draw(ctx) {
    for (const o of this.p) {
      const k = o.t / o.life, a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
      switch (o.k) {
        case 'spark': {
          ctx.globalAlpha = Math.min(1, a * 1.3);
          ctx.fillStyle = o.col;
          const tx = o.x - o.vx * 0.018, ty = o.y - o.vy * 0.018;
          ctx.fillRect(Math.round(o.x), Math.round(o.y), 1, 1);
          ctx.fillRect(Math.round((o.x + tx) / 2), Math.round((o.y + ty) / 2), 1, 1);
          ctx.globalAlpha *= 0.6; ctx.fillRect(Math.round(tx), Math.round(ty), 1, 1);
          break;
        }
        case 'dust': case 'steam': {
          const r = Math.round(o.r0 + (o.r1 - o.r0) * Math.sqrt(k));
          const c = puffCanvas(r, o.col);
          ctx.globalAlpha = a * (o.k === 'steam' ? 0.45 : 0.7);
          ctx.drawImage(c, Math.round(o.x - c.width / 2), Math.round(o.y - c.height / 2));
          break;
        }
        case 'ring': {
          const r = Math.round(3 + o.r * Math.sqrt(k));
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.fillStyle = o.col;
          const n = Math.max(12, r * 3);
          for (let q = 0; q < n; q++) { const ang = (q / n) * Math.PI * 2; ctx.fillRect(Math.round(o.x + Math.cos(ang) * r), Math.round(o.y + Math.sin(ang) * r * (o.flat ? 0.3 : 0.85)), 1, 1); }
          break;
        }
        case 'glitter': {
          const s = o.size, pulse = Math.sin(k * Math.PI);
          ctx.globalAlpha = pulse;
          ctx.fillStyle = o.col;
          const len = Math.max(1, Math.round(s * pulse * 1.6));
          ctx.fillRect(Math.round(o.x - len), Math.round(o.y), len * 2 + 1, 1);
          ctx.fillRect(Math.round(o.x), Math.round(o.y - len), 1, len * 2 + 1);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(o.x), Math.round(o.y), 1, 1);
          break;
        }
        case 'mote': case 'spore': {
          ctx.globalAlpha = a * (0.4 + 0.6 * Math.abs(Math.sin(o.t * 2.2 + o.ph)));
          ctx.fillStyle = o.k === 'spore' ? o.col : '#fff2d6';
          ctx.fillRect(Math.round(o.x), Math.round(o.y), 1, 1);
          break;
        }
        case 'drip': ctx.globalAlpha = 0.9; ctx.fillStyle = '#d8ecff'; ctx.fillRect(Math.round(o.x), Math.round(o.y), 1, 2); break;
        case 'flare': {
          const g = glow(Math.round(o.size * 1.5), o.col), f = flareCanvas(o.size, o.col);
          const s = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, s);
          ctx.drawImage(g, Math.round(o.x - g.width / 2), Math.round(o.y - g.height / 2));
          const sc = 0.6 + s * 0.8;
          ctx.drawImage(f, Math.round(o.x - (f.width * sc) / 2), Math.round(o.y - (f.height * sc) / 2), Math.round(f.width * sc), Math.round(f.height * sc));
          ctx.restore();
          break;
        }
        default: break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
