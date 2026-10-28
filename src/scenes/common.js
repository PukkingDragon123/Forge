// Shared scene UI: HUD, speech bubbles, banners, QTE prompts, world setup.
import * as THREE from 'three';
import { COLORS } from '../ui/font.js';
import { bar, ribbon as ui_ribbon } from '../ui/frames.js';
import { portrait } from '../art/sprites.js';
import { CHARACTERS } from '../data/characters.js';
import { REGIONS } from '../data/regions.js';
import { CameraRig } from '../gfx/camera.js';
import { ParticleSystem } from '../gfx/particles.js';
import { fx as rnd } from '../core/rng.js';
import { Painter } from '../art/pixel.js';

/** Build a world from an environment Set. */
export function makeWorld(set, opts = {}) {
  const scene = new THREE.Scene();
  if (set.attach) set.attach(scene); // env sets bring their own fog + background
  else {
    scene.background = new THREE.Color(set.background || '#07060b');
    scene.fog = new THREE.FogExp2(new THREE.Color(set.fog || '#07060b'), opts.fogDensity ?? 0.045);
    scene.add(set.group);
  }
  const rig = new CameraRig(set.camera ? set.camera.fov : 40);
  if (set.camera) rig.cut(set.camera.pos, set.camera.look, set.camera.fov);
  const sparks = new ParticleSystem(1500, { additive: true });
  const dust = new ParticleSystem(800);
  scene.add(sparks.object, dust.object);
  // P = particle pair expected by props' userData.emit(P, dt)
  return { scene, rig, sparks, dust, P: { add: sparks, alpha: dust }, camera: rig.camera, post: opts.post || {} };
}

export function bark(charId, kind, rng = rnd) {
  const lines = CHARACTERS[charId].barks[kind];
  return lines ? rng.pick(lines) : '';
}

// ---------------------------------------------------------------------------- HUD
export function hud(ui, game, opts = {}) {
  const run = game.run;
  if (!run) return {};
  const c = CHARACTERS[run.char];
  // portrait plate
  ui.panel('leather', 4, 4, 128, 30, { stitch: false, rivets: false, tone: 'dark' });
  ui.img(portrait(run.char, opts.expr || (run.hp < run.maxHp * 0.3 ? 'hurt' : 'neutral'), 24), 7, 7);
  ui.text(c.name, 35, 8, { color: COLORS.white, outline: '#140c10', outlineShadow: false });
  const hpw = 70;
  ui.img(bar(hpw, 7, run.hp / run.maxHp, ['#7a1a22', '#d03a3a', '#ff8a7a']), 35, 20);
  ui.text(`${run.hp}/${run.maxHp}`, 35 + hpw + 3, 20, { font: 'small', color: '#ffb0a0' });
  if (ui.hit('hud-hp', 35, 18, hpw, 10).hover) ui.tooltip({ title: 'Health', body: 'Lose it all and the curse drags you back to the campfire.' });
  // coins
  ui.panel('leather', 134, 4, 50, 18, { stitch: false, rivets: false, tone: 'dark' });
  ui.icon('coin', 138, 8);
  ui.text(String(run.coins), 150, 9, { color: COLORS.gold, outline: '#140c10', outlineShadow: false });
  // region + floor
  const R = REGIONS[run.region];
  const rt = `${R.name}`;
  const rw = ui.measure(rt) + 16;
  ui.panel('stone', ui.w - rw - 4, 4, rw, 18, { tone: ['gray', 'blue', 'gray', 'ember', 'ember', 'purple'][run.region] });
  ui.text(rt, ui.w - rw / 2 - 4, 9, { align: 'center', color: '#f4ecd8', outline: '#140c10', outlineShadow: false });
  let bagClicked = false;
  if (opts.bag !== false) {
    bagClicked = ui.button('hud-bag', 4, ui.h - 24, 52, 20, 'Bag', { icon: 'bag', style: 'wood', key: 'TAB' });
    if (game.input.actionPressed('bag')) bagClicked = true;
  }
  return { bagClicked };
}

// ---------------------------------------------------------------------------- speech bubble
const bubbleCache = new Map();
export function speech(ui, x, y, text, opts = {}) {
  const maxW = opts.maxW || 120;
  const lines = ui.layout(text, 'body', maxW);
  const w = Math.max(...lines.map((l) => l.w)) + 10;
  const h = lines.length * 11 + 6;
  const key = w + 'x' + h + (opts.dark ? 'd' : '');
  let bg = bubbleCache.get(key);
  if (!bg) {
    const p = new Painter(w, h + 5);
    const fill = opts.dark ? '#1c1421' : '#fff6e0', shade = opts.dark ? '#140f19' : '#e6d6b8';
    p.rect(1, 0, w - 2, h, fill); p.rect(0, 1, w, h - 2, fill);
    p.hline(1, w - 2, h - 1, shade); p.hline(2, w - 3, h - 2, shade);
    // tail
    const tx = Math.floor(w / 2) - 2;
    p.rect(tx, h, 4, 1, fill); p.rect(tx + 1, h + 1, 2, 1, fill); p.set(tx + 1, h + 2, fill);
    p.outline('#140c10');
    bg = p.toCanvas();
    bubbleCache.set(key, bg);
  }
  const bx = Math.round(Math.max(2, Math.min(ui.w - w - 2, x - w / 2))), by = Math.round(y - h - 6);
  const alpha = opts.alpha ?? 1;
  ui.img(bg, bx, by, { alpha });
  ui.ctx.globalAlpha = alpha;
  ui.text(text, bx + 5, by + 4, { maxW, color: opts.dark ? COLORS.white : '#2a1d16' });
  ui.ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------- banners & prompts
export function ribbonTitle(ui, text, cx, y, color = 'red', alpha = 1) {
  const tw = ui.measure(text);
  const w = Math.max(70, tw + 34);
  const img = ui_ribbon(w, color);
  ui.img(img, Math.round(cx - w / 2), y, { alpha });
  ui.ctx.globalAlpha = alpha;
  ui.text(text, cx, y + 3, { align: 'center', color: '#fff6e0', outline: '#2a0e0e', outlineShadow: false });
  ui.ctx.globalAlpha = 1;
}

/** QTE prompt: keycap + mouse glyph + label, pulsing. */
export function prompt(ui, x, y, keyLabel, label, t = 0, opts = {}) {
  const pulse = Math.sin(t * 10) > 0;
  const k = ui.keycap(keyLabel, Math.round(x), Math.round(y), pulse && opts.pulse !== false);
  let cx = x + k.w + 3;
  if (opts.mouse) { ui.icon(opts.mouse, cx, y + 1); cx += 11; }
  if (label) ui.text(label, cx, y + 2, { color: opts.color || COLORS.white, outline: '#140c10', outlineShadow: false });
}

/** Big pixel ring (approach circle) at screen pos. */
export function ring(ctx, x, y, r, color, thickness = 1, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const steps = Math.max(16, Math.floor(r * 6));
  let lx = null, ly = null;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r);
    if (px === lx && py === ly) continue;
    ctx.fillRect(px, py, thickness, thickness);
    lx = px; ly = py;
  }
  ctx.globalAlpha = 1;
}

/** Dim the screen for modals. */
export function dim(ui, a = 0.6) { ui.rect(0, 0, ui.w, ui.h, '#07060b', a); }

/** Ambient dust motes + embers around a camera-facing box. */
export function ambientDust(world, center, size, color = '#d8c8b0', rate = 0.3) {
  if (Math.random() < rate) world.dust.emit({ pos: center, posSpread: size, vel: [0.04, 0.01, 0], spread: 0.03, life: [3, 6], size: 1, color, alpha: 0.55, fadeIn: 1 });
}
