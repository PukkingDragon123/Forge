// Mining, zoomed in. The Hades camera leans in on the vein or the petrified foe until the rock
// fills the view; a hand-cut rock face (a grid of stone blocks) settles over it. Ore colour bleeds
// through the cracks, rare finds glint, hairline cracks warn of hazards. Pick a tool from the belt
// (pickaxe, hammer, chisel, bomb, lantern — the ones in your bag; bare hands otherwise), see its
// footprint, and dig in from the edges while your strength lasts. Finds fly into a haul strip and
// go to the bag when you're done (what doesn't fit is left on the floor). Leave any time.
// Params: { kind:'vein'|'statue', def, monster, vein, stage, at:{x,y,z}, cam (HadesCam), scene, onDone({items,left}) }
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import * as Mining from '../systems/mining.js';
import * as Regions from '../data/regions.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { materialSprite } from '../art/sprites.js';
import { clamp, ease } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';
import { hudToast } from '../ui/hud_action.js';

const T = 44;
const DARK = '#140c10';
const TOOL_ICON = { pickaxe: 'pickaxe', hammer: 'hammer', chisel: 'tool', bomb: 'bomb', lantern: 'flare' };
const TOOL_KEY = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
const tileCache = new Map();

function hash(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 1442695040) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];

/** A hand-cut stone block (pixel art, bevelled, speckled). hard = darker, denser stone. */
function rockTile(pal, variant, hard) {
  const key = pal.join() + '|' + variant + '|' + hard;
  let c = tileCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = T;
  const g = c.getContext('2d'), img = g.createImageData(T, T), d = img.data;
  const P = pal.map(hexRgb);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = (y * T + x) * 4;
    let k = 2 + (hash(x >> 1, y >> 1, variant) - 0.5) * 1.3 + (hard ? -0.7 : 0);
    if (x < 2 || y < 2) k += 1.3;                     // lit top-left bevel
    if (x > T - 3 || y > T - 3) k -= 1.4;             // shadowed bottom-right
    if (hash(x, y, variant + 9) > 0.93) k += 0.9;     // speckles
    if (hard && ((x + y * 2 + variant) % 11 === 0)) k -= 0.8; // strata lines
    const ki = Math.max(0, Math.min(P.length - 1, Math.round(k)));
    const col = P[ki];
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  // a seam or two
  for (let s = 0; s < 2; s++) {
    let x = Math.floor(hash(s, variant, 3) * T), y = 0;
    while (y < T) { const i = (y * T + x) * 4; d[i] = P[0][0]; d[i + 1] = P[0][1]; d[i + 2] = P[0][2]; y++; if (hash(x, y, s + variant) > 0.6) x = Math.max(0, Math.min(T - 1, x + (hash(y, x, 5) > 0.5 ? 1 : -1))); if (hash(y, s, variant) > 0.97) break; }
  }
  g.putImageData(img, 0, 0);
  tileCache.set(key, c);
  return c;
}
/** The hollow left behind: dark dirt with a rim. */
function holeTile(pal) {
  const key = 'hole|' + pal.join();
  let c = tileCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = T;
  const g = c.getContext('2d'), img = g.createImageData(T, T), d = img.data;
  const P = pal.map(hexRgb);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = (y * T + x) * 4;
    const edge = Math.min(x, y, T - 1 - x, T - 1 - y);
    const base = mix([10, 8, 12], P[0], 0.5);
    const col = edge < 3 ? mix(base, [0, 0, 0], 0.5) : hash(x >> 1, y >> 1, 77) > 0.85 ? mix(base, P[1], 0.6) : base;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 235;
  }
  g.putImageData(img, 0, 0);
  tileCache.set(key, c);
  return c;
}

export class MineZoomOverlay extends Scene {
  get freezesBelow() { return true; }
  enter(p = {}) {
    this.p = p;
    const run = this.game.run;
    this.t = 0; this.k = 0;
    try { this.ses = Mining.startMine(run, { source: p.kind === 'statue' ? 'statue' : 'vein', monster: p.def || p.monster, stage: p.stage }); } catch (e) { console.error('startMine', e); this.ses = null; }
    this.tool = 'pickaxe';
    this.fly = [];
    this.pops = [];
    this.shake = 0;
    this.used = 0;
    this.leaving = 0;
    this.revealT = new Map();
    const S = Regions.STAGES || Regions.ACTS || [];
    const st = S[p.stage | 0] || {};
    this.pal = (st.pal && st.pal.rock) || ['#1e2218', '#2a3022', '#36402c', '#465238', '#5a6646'];
    this.hardPal = this.pal.map((h) => { const c = hexRgb(h); return '#' + mix(c, [20, 22, 34], 0.35).map((v) => v.toString(16).padStart(2, '0')).join(''); });
    // the camera leans in (HadesCam.zoomTo when available, otherwise we move it ourselves)
    const cam = p.cam, at = p.at || { x: 0, y: 0.8, z: 0 };
    this.cam3 = cam && cam.camera;
    if (this.cam3) { this.pos0 = this.cam3.position.clone(); this.q0 = this.cam3.quaternion.clone(); this.fov0 = this.cam3.fov; }
    this.target = new THREE.Vector3(at.x, at.y, at.z);
    if (cam && typeof cam.zoomTo === 'function') { try { cam.zoomTo(this.target, { fov: 26, dist: 4.2, dur: 0.6 }); this.camDriven = true; } catch (e) { this.camDriven = false; } }
    this.game.audio && this.game.audio.play('vein_glint', { vol: 0.6 });
  }
  exit() {
    const cam = this.p.cam;
    if (cam && typeof cam.release === 'function') { try { cam.release(0.5); } catch (e) { /* ignore */ } }
    else if (this.cam3 && this.pos0) { this.cam3.position.copy(this.pos0); this.cam3.quaternion.copy(this.q0); this.cam3.fov = this.fov0; this.cam3.updateProjectionMatrix(); }
  }
  /** Board placement on screen. */
  board(ui) {
    const s = this.ses;
    const w = s ? s.w : 7, h = s ? s.h : 6;
    const k = ease.outBack(clamp(this.k));
    return { x: Math.round(ui.w / 2 - (w * T) / 2), y: Math.round(ui.h / 2 - (h * T) / 2 - 18 + (1 - k) * 40), w, h };
  }
  finish(left) {
    if (this.leaving) return;
    const s = this.ses, game = this.game, run = game.run;
    const res = s ? s.finish() : { items: [], hpLoss: 0 };
    this.leaving = 0.001;
    // finds go to the bag; what doesn't fit lands on the floor by the rock
    const scene = this.p.scene;
    const items = [];
    for (const it of res.items) {
      const ok = run.addItem ? run.addItem(it) : false;
      if (ok) items.push(it);
      else if (scene && scene.pickups && this.p.at) { if (run.bag && run.bag.overflow.includes(it)) run.bag.overflow.splice(run.bag.overflow.indexOf(it), 1); scene.pickups.spawn(it, this.p.at.x + (rnd.next() - 0.5) * 1.2, this.p.at.z + 0.9, { from: { x: this.p.at.x, z: this.p.at.z } }); }
    }
    if (res.hpLoss && scene && scene.player) { scene.player.hp = Math.max(1, scene.player.hp - res.hpLoss); scene.syncHp && scene.syncHp(); }
    else if (res.hpLoss && run.hurt) run.hurt(res.hpLoss);
    this.result = { items, left: left ? this.used > 0 : true };
    if (scene && scene.hud && items.length) hudToast(scene.hud, `Mined ${items.length} find${items.length > 1 ? 's' : ''}`, { icon: 'pickaxe', color: '#ffe08a' });
  }
  update(dt) {
    this.t += dt;
    this.k = Math.min(1, this.k + dt * 2.4);
    this.shake = Math.max(0, this.shake - dt * 3);
    const cam = this.p.cam;
    if (this.camDriven && cam && typeof cam.update === 'function') cam.update(dt);
    else if (this.cam3) {
      // lean in ourselves: closer and lower, looking at the rock
      const k = ease.inOutCubic(clamp(this.leaving ? 1 - this.leaving / 0.4 : this.k));
      const want = this.target.clone().add(new THREE.Vector3(0, 2.6, 3.4));
      this.cam3.position.copy(this.pos0).lerp(want, k);
      const look = new THREE.Vector3().copy(this.target);
      const m = new THREE.Matrix4().lookAt(this.cam3.position, look, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      this.cam3.quaternion.copy(this.q0).slerp(q, k);
      this.cam3.fov = this.fov0 + (26 - this.fov0) * k; this.cam3.updateProjectionMatrix();
    }
    for (let i = this.fly.length - 1; i >= 0; i--) { const f = this.fly[i]; f.t += dt; if (f.t > f.dur) this.fly.splice(i, 1); }
    for (let i = this.pops.length - 1; i >= 0; i--) { const f = this.pops[i]; f.t += dt; if (f.t > 1.1) this.pops.splice(i, 1); }
    if (this.leaving) {
      this.leaving += dt;
      if (this.leaving > 0.45) {
        this.game.popOverlay(this);
        this.p.onDone && this.p.onDone(this.result || { items: [], left: true });
      }
    } else if (this.ses && this.ses.strikes <= 0 && !this.endT) this.endT = 0.9;
    if (this.endT) { this.endT -= dt; if (this.endT <= 0) this.finish(true); }
  }
  strike(x, y) {
    const s = this.ses, game = this.game, ui = game.ui;
    if (!s || this.leaving || this.endT) return;
    const r = s.use(this.tool, x, y);
    if (!r.ok) { this.note = { text: r.reason, t: 0 }; game.audio && game.audio.play('deny', { vol: 0.5 }); return; }
    this.used++;
    const B = this.board(ui);
    const cx = (tx) => B.x + tx * T + T / 2, cy = (ty) => B.y + ty * T + T / 2;
    let big = false;
    for (const e of r.events) {
      if (e.type === 'break') { ui.burst(cx(e.x), cy(e.y), 10, { colors: this.pal.slice(2), speed: 90, gravity: 300, up: 40, size: 2 }); }
      else if (e.type === 'crack') { this.pops.push({ x: cx(e.x), y: cy(e.y), text: 'crack', t: 0, col: '#cbb89a' }); game.audio && game.audio.play('stone_crack', { vol: 0.6 }); }
      else if (e.type === 'ore' || e.type === 'gem' || e.type === 'pocket') {
        const it = e.item;
        const m = MATERIALS[it.id] || {};
        const col = (RARITY[m.rarity] || RARITY.common).color;
        ui.burst(cx(e.x), cy(e.y), 16, { colors: [col, '#ffffff', '#fff0b0'], speed: 120, gravity: 120, kind: 'star', life: 0.8 });
        this.fly.push({ item: it, x0: cx(e.x), y0: cy(e.y), t: 0, dur: 0.75 });
        this.pops.push({ x: cx(e.x), y: cy(e.y) - 10, text: m.name || it.id, t: 0, col });
        game.audio && game.audio.play(RARITY[m.rarity] && RARITY[m.rarity].order >= 2 ? 'ore_rare' : 'ore_common', { vol: 0.7 });
        big = big || (RARITY[m.rarity] && RARITY[m.rarity].order >= 2);
      } else if (e.type === 'cracked') this.pops.push({ x: cx(e.x), y: cy(e.y) + 8, text: 'chipped!', t: 0, col: '#ffb08a' });
      else if (e.type === 'shatter') { this.pops.push({ x: cx(e.x), y: cy(e.y), text: 'shattered…', t: 0, col: '#ff8a7a' }); game.audio && game.audio.play('stone_shatter', { vol: 0.6 }); }
      else if (e.type === 'hazard') {
        this.shake = 1;
        game.renderer && game.renderer.doFlash && game.renderer.doFlash(0.3, e.hz === 'gas' ? [0.4, 1, 0.5] : [1, 0.3, 0.2]);
        this.pops.push({ x: cx(e.x), y: cy(e.y), text: `${e.hz === 'gas' ? 'spore gas' : e.hz === 'cavein' ? 'cave-in!' : 'critter!'} -${e.dmg}`, t: 0, col: '#ff8a7a' });
        game.audio && game.audio.play(e.hz === 'cavein' ? 'rock_break' : 'hurt', { vol: 0.8 });
      } else if (e.type === 'blast') { this.shake = 0.8; ui.burst(cx(e.x), cy(e.y), 30, { colors: ['#ffd27a', '#ff8a3a', '#5a4a3a'], speed: 180, gravity: 200, size: 2 }); game.audio && game.audio.play('rock_break'); }
      else if (e.type === 'smash') { this.shake = 0.45; game.audio && game.audio.play('heavy_hit', { vol: 0.6 }); }
      else if (e.type === 'reveal') { this.revealT.set(e.x + ',' + e.y, 0); }
    }
    this.shake = Math.max(this.shake, big ? 0.35 : 0.18);
    if (this.tool === 'pickaxe' || this.tool === 'chisel') game.audio && game.audio.play(r.events.some((e) => e.type === 'crack') ? 'pick_hit' : 'pick_perfect', { vol: 0.55, pitch: 0.9 + rnd.next() * 0.2 });
    if (this.tool === 'lantern') game.audio && game.audio.play('vein_glint');
    game.hitStop && game.hitStop(0.04);
  }
  /** Tiles the selected tool would touch from (x, y). */
  footprint(x, y) {
    const t = this.tool;
    if (t === 'hammer') return [[x - 1, y], [x, y], [x + 1, y]];
    if (t === 'bomb' || t === 'lantern') { const o = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) o.push([x + dx, y + dy]); return o; }
    return [[x, y]];
  }

  draw(ui) {
    const game = this.game, ctx = ui.ctx, inp = game.input, s = this.ses;
    const fadeK = this.leaving ? 1 - clamp(this.leaving / 0.4) : clamp(this.k * 1.5);
    // vignette that frames the rock
    const g = ctx.createRadialGradient(ui.w / 2, ui.h / 2, 150, ui.w / 2, ui.h / 2, 520);
    g.addColorStop(0, 'rgba(5,4,10,0.25)'); g.addColorStop(1, 'rgba(5,4,10,0.88)');
    ctx.globalAlpha = fadeK; ctx.fillStyle = g; ctx.fillRect(0, 0, ui.w, ui.h); ctx.globalAlpha = 1;
    if (!s) { ui.text('Nothing to mine here.', ui.w / 2, ui.h / 2, { align: 'center', color: '#f4ead6' }); if (inp.pressed || inp.actionPressed('back')) this.finish(false); return; }
    const B = this.board(ui);
    const sx = this.shake > 0 ? Math.round((rnd.next() - 0.5) * 8 * this.shake) : 0, sy = this.shake > 0 ? Math.round((rnd.next() - 0.5) * 6 * this.shake) : 0;
    ctx.save(); ctx.globalAlpha = fadeK; ctx.translate(sx, sy);
    // frame
    ctx.fillStyle = DARK; ctx.fillRect(B.x - 6, B.y - 6, B.w * T + 12, B.h * T + 12);
    ctx.fillStyle = '#3a3040'; ctx.fillRect(B.x - 4, B.y - 4, B.w * T + 8, 2);
    // hover + footprint
    let hx = -1, hy = -1;
    const mx = inp.x - sx, my = inp.y - sy - (ui.touch ? 0 : 0);
    if (mx >= B.x && my >= B.y && mx < B.x + B.w * T && my < B.y + B.h * T) { hx = Math.floor((mx - B.x) / T); hy = Math.floor((my - B.y) / T); }
    const fp = hx >= 0 ? this.footprint(hx, hy) : [];
    const can = hx >= 0 ? s.canUse(this.tool, hx, hy) === true : false;
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
      const t = s.tile(x, y);
      if (!t || t.t === 'void') continue;
      const px = B.x + x * T, py = B.y + y * T;
      if (t.broken) {
        ui.img(holeTile(this.pal), px, py);
        if (t.t === 'hazard') ui.icon(t.hz === 'gas' ? 'poison' : t.hz === 'cavein' ? 'block' : 'monster', px + T / 2, py + T / 2, { center: true, alpha: 0.7 });
        continue;
      }
      ui.img(rockTile(t.t === 'hard' ? this.hardPal : this.pal, (x * 7 + y * 13) % 5, t.t === 'hard'), px, py);
      // ore colour bleeding in from a neighbour
      for (const [dir, col] of Object.entries(t.veins || {})) {
        ctx.globalAlpha = 0.55 * fadeK; ctx.fillStyle = col;
        for (let i = 0; i < 6; i++) {
          const a = hash(x, y, i + dir.length) * (T - 8) + 4;
          if (dir === 'up') ctx.fillRect(px + a, py + 1, 2, 3 + (i % 3) * 2);
          if (dir === 'down') ctx.fillRect(px + a, py + T - 4 - (i % 3) * 2, 2, 3 + (i % 3) * 2);
          if (dir === 'left') ctx.fillRect(px + 1, py + a, 3 + (i % 3) * 2, 2);
          if (dir === 'right') ctx.fillRect(px + T - 4 - (i % 3) * 2, py + a, 3 + (i % 3) * 2, 2);
        }
        ctx.globalAlpha = fadeK;
      }
      if (t.hits) { ctx.fillStyle = DARK; for (let i = 0; i < 9; i++) ctx.fillRect(px + 10 + i * 3, py + 12 + Math.round(Math.sin(i * 1.7) * 5) + i, 2, 1); }
      if (t.crack) { ctx.fillStyle = 'rgba(255,120,90,0.55)'; for (let i = 0; i < 7; i++) ctx.fillRect(px + 6 + i * 4, py + T - 10 - (i % 2) * 3, 3, 1); }
      // glints: rare things sparkle through the rock
      if (t.glint) {
        const ph = (this.t * (1.5 + t.glint * 0.6) + x * 0.7 + y * 1.3) % 2.2;
        if (ph < 0.45) { const a = Math.sin((ph / 0.45) * Math.PI); ctx.globalAlpha = a * fadeK; ctx.fillStyle = '#ffffff'; const gx = px + 8 + hash(x, y, 4) * (T - 16), gy = py + 8 + hash(y, x, 4) * (T - 16); ctx.fillRect(gx - 1, gy, 3, 1); ctx.fillRect(gx, gy - 1, 1, 3); if (t.glint >= 3) { ctx.fillRect(gx - 3, gy, 7, 1); ctx.fillRect(gx, gy - 3, 1, 7); } ctx.globalAlpha = fadeK; }
      }
      // lantern-revealed contents show through faintly
      if (t.revealed && (t.t === 'ore' || t.t === 'gem') && t.mat) { ctx.globalAlpha = 0.55 * fadeK; ui.img(materialSprite(t.mat, 32), px + 6, py + 6); ctx.globalAlpha = fadeK; }
      if (t.revealed && t.t === 'hazard') ui.icon('skull', px + T / 2, py + T / 2, { center: true, alpha: 0.6 });
      if (s.exposed(x, y)) { ctx.fillStyle = 'rgba(255,240,200,0.08)'; ctx.fillRect(px, py, T, 2); }
    }
    for (const [fx, fy] of fp) {
      if (fx < 0 || fy < 0 || fx >= B.w || fy >= B.h) continue;
      const px = B.x + fx * T, py = B.y + fy * T;
      ctx.strokeStyle = can ? 'rgba(154,255,176,0.85)' : 'rgba(255,106,90,0.7)'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, T - 4, T - 4);
    }
    ctx.restore();
    if (hx >= 0 && inp.pressed && !this.leaving && !ui.overUI()) this.strike(hx, hy);

    // ---- strength (strikes) bar
    const sw = 10;
    ui.text('Strength', B.x, B.y - 22, { color: '#f0dcb0', outline: DARK });
    for (let i = 0; i < s.maxStrikes; i++) {
      const on = i < s.strikes;
      ctx.fillStyle = DARK; ctx.fillRect(B.x + 54 + i * (sw + 3), B.y - 22, sw + 2, 9);
      ctx.fillStyle = on ? '#e8c060' : '#3a3040'; ctx.fillRect(B.x + 55 + i * (sw + 3), B.y - 21, sw, 7);
    }
    // ---- haul strip (right of the board)
    const hx0 = B.x + B.w * T + 22;
    ui.text('Haul', hx0, B.y - 2, { color: '#f0dcb0', outline: DARK });
    s.haul.forEach((it, i) => {
      if (this.fly.some((f) => f.item === it)) return;
      ui.img(materialSprite(it.id, 32), hx0 + (i % 3) * 34, B.y + 12 + Math.floor(i / 3) * 34);
    });
    for (const f of this.fly) {
      const i = s.haul.indexOf(f.item);
      const tx = hx0 + (i % 3) * 34, ty = B.y + 12 + Math.floor(i / 3) * 34;
      const k = ease.inOutCubic(clamp(f.t / f.dur));
      const x = f.x0 + (tx + 16 - f.x0) * k, y = f.y0 + (ty + 16 - f.y0) * k - Math.sin(k * Math.PI) * 60;
      const sc = 1 + Math.sin(k * Math.PI) * 0.5;
      ctx.drawImage(materialSprite(f.item.id, 32), Math.round(x - 16 * sc), Math.round(y - 16 * sc), Math.round(32 * sc), Math.round(32 * sc));
    }
    for (const p of this.pops) {
      const a = p.t < 0.8 ? 1 : 1 - (p.t - 0.8) / 0.3;
      ctx.globalAlpha = clamp(a);
      ui.text(p.text, p.x, p.y - p.t * 26, { align: 'center', color: p.col, outline: DARK });
      ctx.globalAlpha = 1;
    }
    // ---- tool belt
    const tools = s.tools();
    const bw = 64, by = B.y + B.h * T + 16;
    const bx0 = Math.round(ui.w / 2 - (tools.length * (bw + 6)) / 2);
    tools.forEach((tl, i) => {
      const x = bx0 + i * (bw + 6), on = tl.kind === this.tool;
      const h = ui.hit('tool-' + tl.kind, x, by, bw, 40);
      ctx.fillStyle = DARK; ctx.fillRect(x - 2, by - 2, bw + 4, 44);
      ctx.fillStyle = on ? '#4a3a20' : h.hover ? '#3a2e2a' : '#241c22'; ctx.fillRect(x, by, bw, 40);
      if (on) { ctx.fillStyle = '#ffd27a'; ctx.fillRect(x, by, bw, 2); }
      ui.icon(TOOL_ICON[tl.kind] || 'tool', x + 6, by + 6, { scale: 2 });
      ui.text(tl.kind === 'pickaxe' && !tl.item ? 'hands' : tl.kind, x + 30, by + 6, { font: 'small', color: on ? '#ffe8b0' : '#cbb89a' });
      ui.text(tl.uses === Infinity ? '∞' : `×${tl.uses}`, x + 30, by + 18, { font: 'small', color: '#9a8a7a' });
      if (tl.strikeCost === 0) ui.text('free', x + 30, by + 28, { font: 'small', color: '#9affb0' });
      if (!ui.touch) ui.keycap(String(i + 1), x + bw - 8, by - 6);
      if (h.clicked || inp.keyPressed(TOOL_KEY[i])) { this.tool = tl.kind; game.audio && game.audio.play('click'); }
      if (h.hover) ui.tooltip({ title: tl.name, body: { pickaxe: 'One block. Strong.', hammer: 'Row of three. Cracks gems.', chisel: 'One block. Finer finds.', bomb: '3×3. Free. Rough on gems.', lantern: 'Reveal 3×3. Free.' }[tl.kind] || '' });
    });
    if (!tools.some((tl) => tl.kind === this.tool)) this.tool = tools[0] ? tools[0].kind : 'pickaxe';
    // ---- leave
    if (ui.button('mine-leave', ui.w - 112, ui.h - 44, 96, 28, s.strikes <= 0 ? 'Done' : 'Leave', { style: s.strikes <= 0 ? 'gold' : 'wood', key: ui.touch ? undefined : 'ESC' }) || (inp.actionPressed('back') && this.t > 0.2)) this.finish(true);
    if (this.note) { this.note.t += ui.dt || 0.016; const a = this.note.t < 1.4 ? 1 : 1 - (this.note.t - 1.4) / 0.4; ctx.globalAlpha = clamp(a); ui.text(this.note.text, ui.w / 2, by + 48, { align: 'center', color: '#ffb8a8', outline: DARK }); ctx.globalAlpha = 1; if (a <= 0) this.note = null; }
    if (s.strikes <= 0 && !this.leaving) ui.big('Spent!', ui.w / 2, B.y - 50, { scale: 2, top: '#fff0c8', bottom: '#c8902a' });
  }
}
