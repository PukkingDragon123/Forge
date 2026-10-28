// The mine map: a hand-painted pixel-art cross-section of the current layer (1 texel = 1 screen pixel),
// with the explorer figurine standing in their room. Rooms are linked by tunnels you choose between.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { ParticleSystem } from '../gfx/particles.js';
import { pixelTexture } from '../gfx/materials.js';
import { REGIONS, TUNNELS, NODE_TYPES } from '../data/regions.js';
import { FLOORS } from '../systems/mapgen.js';
import { paintMap } from '../art/mapart.js';
import { nodeBadge } from '../art/sprites.js';
import { buildCharacter } from '../models/characters.js';
import { hud, ribbonTitle, ring } from './common.js';
import { travel, openBag } from './flow.js';
import { clamp, ease } from '../core/math.js';
import { COLORS } from '../ui/font.js';
import { save } from '../core/save.js';
import { fx as rnd } from '../core/rng.js';

const PX = 0.01; // world units per map pixel

export class MapScene extends Scene {
  enter(params = {}) {
    const run = this.game.run;
    this.run = run;
    this.map = run.map;
    this.R = REGIONS[run.region];
    // paint once per layer (cached on the map object)
    if (!this.map._art) this.map._art = paintMap(this.map, run.region, run.seed);
    const art = this.map._art;
    this.art = art;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(this.R.pal.sky);
    const tex = pixelTexture(art.canvas);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(art.W * PX, art.H * PX), new THREE.MeshBasicMaterial({ map: tex }));
    scene.add(plane);
    this.cam = new THREE.OrthographicCamera(-4.8, 4.8, 2.7, -2.7, 0.1, 50);
    this.cam.userData.viewHeight = 5.4;
    this.world = { scene, camera: this.cam, post: { outline: 0.6, edge: 0.3, bloom: 0.55, threshold: 0.8, vignette: 0.4, dither: 0.6 } };
    scene.add(new THREE.HemisphereLight(0xfff0e0, 0x403040, 1.1));
    const key = new THREE.DirectionalLight(0xffe0b0, 1.6);
    key.position.set(-2, 3, 5);
    scene.add(key);
    this.fx = new ParticleSystem(600, { additive: true });
    this.dust = new ParticleSystem(400);
    scene.add(this.fx.object, this.dust.object);
    // explorer figurine
    this.hero = buildCharacter(run.char);
    this.hero.group.scale.setScalar(0.21);
    const cur = this.map.nodes[this.map.current];
    const hp = this.toWorld(art.nodePx[cur.id].x - 14, art.nodePx[cur.id].y);
    this.hero.group.position.set(hp.x, hp.y, 0.6);
    this.hero.group.rotation.y = 0.35;
    this.hero.play('idle', { loop: true });
    scene.add(this.hero.group);
    const hl = new THREE.PointLight(0xffc080, 1.2, 1.4, 1.5);
    hl.position.set(hp.x + 0.15, hp.y + 0.4, 0.9);
    scene.add(hl);
    // camera focus in map-pixel space
    const focus = art.nodePx[cur.id].y - 40;
    const intro = params.intro || params.newRegion || !run.flags['seenRegion' + run.region];
    this.camY = intro ? 0 : focus;
    this.camTarget = focus;
    this.titleT = intro ? 0 : 99;
    run.flags['seenRegion' + run.region] = true;
    this.leaving = false;
    this.game.audio.music(this.R.music);
    this.amb = this.game.audio.loop(run.region === 4 ? 'lava' : 'cave');
    this.tip = !save.data.seen.tips.map;
    this.camYr = Math.round(this.camY); this.camX = 0;
    this.time = 0;
  }
  exit() { this.amb && this.amb.stop(1); }

  toWorld(px, py) { return { x: (px - this.art.W / 2) * PX, y: (this.art.H / 2 - py) * PX }; }
  toScreen(px, py, ui) { return { x: Math.round(ui.w / 2 + (px - this.art.W / 2) - this.camX), y: Math.round(ui.h / 2 + (py - this.camYr)) }; }
  available() { const cur = this.map.nodes[this.map.current]; return cur.out.map((id) => this.map.nodes[id]); }

  update(dt) {
    this.time += dt;
    const ui = this.game.ui, inp = this.game.input;
    if (!this.leaving) {
      if (inp.wheel) this.camTarget += inp.wheel * 48;
      if (inp.down && !ui.overUI()) {
        if (!this.drag) this.drag = { y: inp.y, cam: this.camTarget };
        else this.camTarget = this.drag.cam - (inp.y - this.drag.y);
      } else this.drag = null;
      if (inp.action('up')) this.camTarget -= dt * 320;
      if (inp.action('down')) this.camTarget += dt * 320;
    }
    const half = ui.h / 2;
    this.camTarget = clamp(this.camTarget, half - 30, Math.max(half - 30, this.art.H - half + 30));
    this.camY += (this.camTarget - this.camY) * Math.min(1, dt * (this.titleT < 2.5 ? 1.4 : 7));
    this.camYr = Math.round(this.camY);
    // orthographic camera locked to the pixel grid (1 texel = 1 virtual pixel)
    const cam = this.cam;
    cam.userData.viewHeight = ui.h * PX;
    const wy = (this.art.H / 2 - this.camYr) * PX;
    cam.position.set(0, wy, 10);
    cam.lookAt(0, wy, 0);
    cam.updateProjectionMatrix();
    this.hero.update(dt);
    this.fx.update(dt); this.dust.update(dt);
    if (Math.random() < 0.6) this.dust.emit({ pos: [rnd.float(-3.6, 3.6), wy + rnd.float(-2.6, 2.6), 0.4], vel: [0.03, 0.02, 0], spread: 0.02, life: [3, 6], size: 1, color: '#e0d0b8', alpha: 0.45, fadeIn: 1 });
    if (Math.random() < 0.12) this.fx.emit({ pos: [rnd.float(-3.4, 3.4), wy + 2.6, 0.4], vel: [0, -2.2, 0], life: [0.9, 1.2], size: 1, color: this.R.pal.water, glow: 1.4 });
    for (const n of this.available()) {
      const e = this.art.edges.find((q) => q.a === this.map.current && q.b === n.id);
      if (!e || Math.random() > 0.4) continue;
      const pt = e.pts[Math.floor(Math.random() * e.pts.length)];
      const w = this.toWorld(pt[0], pt[1] + 6);
      this.fx.emit({ pos: [w.x, w.y, 0.4], vel: [0, 0.12, 0], spread: 0.04, life: [0.6, 1.2], size: 1, color: '#ffe08a', glow: 3 });
    }
    if (this.titleT < 99) this.titleT += dt;
  }

  draw(ui) {
    const run = this.run, map = this.map, art = this.art;
    const h = hud(ui, this.game);
    if (h.bagClicked) openBag(this.game);
    if (this.game.input.actionPressed('back') && !this.game.overlays.length) this.game.pushOverlay('pause');
    const avail = this.available();
    const cur = map.nodes[map.current];
    // fog of war over rows that are too deep to see
    const revealRow = cur.row + 2;
    const deep = map.nodes.filter((n) => n.row > revealRow && n.type !== 'boss');
    if (deep.length) {
      const fogTop = Math.min(...deep.map((n) => art.nodePx[n.id].y - 80));
      const s0 = this.toScreen(0, fogTop, ui).y;
      const ctx = ui.ctx;
      ctx.fillStyle = '#07060b';
      for (let y = Math.max(0, s0 - (s0 % 2)); y < ui.h; y += 2) {
        const k = clamp((y - s0) / 70, 0, 0.8);
        for (let x = 0; x < ui.w; x += 2) if ((((x >> 1) * 7 + (y >> 1) * 3) % 8) < k * 8) ctx.fillRect(x, y, 2, 2);
      }
    }
    // paths from the current room: marching lantern dots
    for (const e of art.edges) {
      const fromCur = e.a === map.current;
      const visited = map.visited.includes(e.a) && map.visited.includes(e.b);
      if (!fromCur && !visited) continue;
      for (let i = 0; i < e.pts.length; i += 3) {
        const [px, py] = e.pts[i];
        const s = this.toScreen(px, py + 8, ui);
        if (fromCur) {
          if ((i / 3 + Math.floor(this.time * 8)) % 3) continue;
          ui.rect(s.x - 1, s.y - 1, 4, 4, '#ff9a3a', 0.35); ui.rect(s.x, s.y, 2, 2, '#fff0b0');
        } else if (i % 6 === 0) ui.rect(s.x, s.y, 1, 1, '#d8c8a8', 0.6);
      }
      if (fromCur && e.sight) {
        const [px, py] = e.pts[Math.floor(e.pts.length / 2)];
        const s = this.toScreen(px, py - 4, ui);
        const ic = { glint: 'sparkle', shadow: 'eye', cart: 'minecart', note: 'scroll' }[e.sight];
        ui.icon(ic, s.x, s.y, { center: true });
        if (ui.hit('sight' + e.a + '-' + e.b, s.x - 8, s.y - 8, 16, 16).hover) ui.tooltip({ glint: 'You spot a glinting vein along this tunnel.', shadow: 'Something moves in the dark along this tunnel…', cart: 'An abandoned cart sits on this path.', note: 'A scrap of paper flutters in this tunnel.' }[e.sight]);
      }
    }
    // room badges
    for (const n of map.nodes) {
      const np = art.nodePx[n.id];
      const s = this.toScreen(np.x, np.y - 62 * (n.type === 'boss' ? 1.35 : 1), ui);
      if (s.y < -30 || s.y > ui.h + 30) continue;
      const isCur = n.id === map.current, isAvail = avail.includes(n);
      const hidden = n.row > revealRow && n.type !== 'boss';
      const badge = nodeBadge(hidden ? 'event' : n.type, 28);
      const bob = isAvail ? Math.round(Math.sin(this.time * 4 + n.id) * 2) : 0;
      if (isAvail) ring(ui.ctx, s.x, s.y + bob, 18 + Math.sin(this.time * 5) * 2, NODE_TYPES[n.type].color, 1, 0.85);
      ui.img(badge, s.x - Math.round(badge.width / 2), s.y - Math.round(badge.height / 2) + bob, { alpha: n.done || isCur ? 0.55 : hidden ? 0.35 : 1 });
      if (n.done && !isCur) ui.icon('check', s.x + 8, s.y - 14);
      const hit = ui.hit('node' + n.id, s.x - 15, s.y - 15 + bob, 30, 30, { cursor: isAvail ? 'hand' : 'arrow', sound: isAvail });
      if (hit.hover) {
        const T = NODE_TYPES[n.type];
        const e = map.edges.find((q) => q.a === map.current && q.b === n.id);
        let body = hidden ? 'Too deep to see from here.' : T.desc || '';
        if (e && isAvail) { const tun = TUNNELS[e.tunnel]; body += `\n\n{gold}Path: ${tun.name}{/}\n${tun.desc}\nRisk: ${'●'.repeat(tun.risk)}${'○'.repeat(3 - tun.risk)}`; }
        if (isCur) body = 'You are here.';
        ui.tooltip({ title: hidden ? '???' : T.name, body, color: T.color });
        if (hit.clicked && isAvail) this.choose(n, e);
      }
    }
    ui.panel('dark', ui.w - 112, 36, 108, 22);
    ui.text(`Floor ${cur.row + 1} / ${FLOORS}`, ui.w - 58, 43, { align: 'center', color: COLORS.white, outline: '#140c10', outlineShadow: false });
    if (this.tip && this.titleT > 3) {
      ui.panel('parchment', ui.w / 2 - 150, ui.h - 52, 300, 38);
      ui.text('Pick a glowing room linked to yours.\nScroll or drag to look deeper.', ui.w / 2, ui.h - 44, { align: 'center', color: '#3a2618' });
      if (this.game.input.pressed || this.titleT > 12) { this.tip = false; save.data.seen.tips.map = true; save.write(); }
    }
    if (this.titleT < 3.6) {
      const k = this.titleT;
      const a = clamp(k < 0.4 ? k / 0.4 : k > 2.9 ? 1 - (k - 2.9) / 0.7 : 1, 0, 1);
      ribbonTitle(ui, this.R.name, ui.w / 2, 86 - (1 - ease.outBack(Math.min(1, k * 2))) * 20, this.R.ribbon, a);
      ui.ctx.globalAlpha = a;
      ui.text(`Layer ${run.region + 1} — ${this.R.sub}`, ui.w / 2, 110, { align: 'center', color: COLORS.white, outline: '#140c10', thick: true });
      ui.ctx.globalAlpha = 1;
    }
  }

  choose(node, edge) {
    if (this.leaving) return;
    this.leaving = true;
    this.game.audio.play('footstep');
    const art = this.art;
    const e = art.edges.find((q) => q.a === edge.a && q.b === edge.b);
    const h = this.hero.group;
    this.hero.play('walk', { loop: true });
    const target = e ? e.pts[Math.min(10, e.pts.length - 1)] : [art.nodePx[node.id].x, art.nodePx[node.id].y];
    const wt = this.toWorld(target[0], target[1] + 14);
    h.rotation.y = wt.x > h.position.x ? 1.2 : -1.2;
    this.tw.to(h.position, { x: wt.x }, 0.7, { ease: 'linear' });
    // zoom into the tunnel mouth
    this.tw.to(this.cam, { zoom: 2.2 }, 0.75, { ease: 'inCubic' });
    this.camTarget = target[1];
    this.co.start(function* () { yield 0.65; travel(this.game, edge, node); }.bind(this));
  }
}
