// The mine map: a voxel cross-section of the current layer, rooms carved into rock and joined by tunnels.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { VoxelGrid, meshVoxels, GLOW } from '../gfx/voxel.js';
import { CameraRig, FlickerLight } from '../gfx/camera.js';
import { ParticleSystem } from '../gfx/particles.js';
import { REGIONS, TUNNELS, NODE_TYPES } from '../data/regions.js';
import { FLOORS } from '../systems/mapgen.js';
import { nodeBadge } from '../art/sprites.js';
import { buildCharacter } from '../models/characters.js';
import { hud, ribbonTitle, ring } from './common.js';
import { travel, openBag } from './flow.js';
import { fbm3, hash3, clamp, ease, mixHex } from '../core/math.js';
import { RNG } from '../core/rng.js';
import { COLORS } from '../ui/font.js';
import { save } from '../core/save.js';

const VW = 64, VH = 84, VD = 12, S = 0.2;

export class MapScene extends Scene {
  enter(params = {}) {
    const run = this.game.run;
    this.run = run;
    this.map = run.map;
    this.R = REGIONS[run.region];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(this.R.pal.sky);
    scene.fog = new THREE.Fog(new THREE.Color(this.R.pal.sky), 24, 40);
    this.rig = new CameraRig(28, 0.5, 80);
    this.world = { scene, camera: this.rig.camera, post: { outline: 0.5, edge: 0.4, bloom: 0.8, vignette: 0.45, levels: 26 } };
    this.buildVoxels(scene);
    // lights
    scene.add(new THREE.HemisphereLight(0x9a9ac0, 0x2a1a14, 0.5));
    const dir = new THREE.DirectionalLight(0xfff0d8, 1.4);
    dir.position.set(-3, 5, 12);
    scene.add(dir);
    this.lights = [];
    this.fx = new ParticleSystem(1200, { additive: true });
    this.dust = new ParticleSystem(600);
    scene.add(this.fx.object, this.dust.object);
    // explorer figurine
    this.hero = buildCharacter(run.char);
    this.hero.group.scale.setScalar(0.42);
    scene.add(this.hero.group);
    const cur = this.map.nodes[this.map.current];
    const hp = this.nodePos(cur);
    this.hero.group.position.set(hp.x + 0.2, hp.floor, 0.6);
    this.hero.play && this.hero.play('idle', { loop: true });
    this.placeLights();
    // camera
    this.camY = hp.y;
    this.camTargetY = hp.y - 1.2;
    const startY = params.intro || params.newRegion ? this.worldTop() - 2 : this.camTargetY;
    this.rig.cut([0, startY + 1.5, 21], [0, startY - 0.5, 0], 28);
    this.camY = startY;
    this.titleT = params.intro || params.newRegion || !run.flags['seenRegion' + run.region] ? 0 : 99;
    run.flags['seenRegion' + run.region] = true;
    this.hover = null;
    this.dragY = null;
    this.game.audio.music(this.R.music);
    this.amb = this.game.audio.loop(run.region === 4 ? 'lava' : 'cave');
    this.time = 0;
    if (!save.data.seen.tips.map) this.tip = true;
  }
  exit() { this.amb && this.amb.stop(1); }

  nodePos(n) {
    const vx = 6 + n.x * (VW - 12);
    const vy = VH - 9 - n.y * (VH - 20);
    return { vx, vy, x: (vx - VW / 2) * S, y: (vy - VH) * S, floor: (vy - 3.5 - VH) * S };
  }
  worldTop() { return 0; }

  buildVoxels(scene) {
    const R = this.R, pal = R.pal;
    const rng = new RNG(this.run.seed + ':mapvox' + this.run.region);
    const g = new VoxelGrid(VW, VH, VD);
    const seed = rng.int(1, 9999);
    // rock body with strata + ore specks
    for (let z = 0; z < VD; z++) for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      const n = fbm3(x * 0.07, y * 0.09, z * 0.2, 3, seed);
      const strata = Math.sin(y * 0.45 + fbm3(x * 0.05, y * 0.05, 0, 2, seed + 3) * 5);
      let ci = Math.floor(clamp(n * 0.9 + strata * 0.12 + 0.05, 0, 0.999) * 4);
      // cavity back walls are dark, the cut face is bright so rooms read clearly
      let col = z < 4 ? pal.rock[Math.min(2, ci)] : pal.rock[1 + ci];
      if (z === VD - 1) col = mixHex(pal.rock[2 + Math.min(2, ci)], '#c8b8a0', 0.12 + (strata > 0.6 ? 0.08 : 0));
      const h = hash3(x, y, z, seed);
      if (h > 0.992 && z === VD - 1) col = rng.pick([pal.accent[0], pal.metal[2], pal.dirt[2]]);
      g.set(x, y, z, col);
    }
    // ragged surface at the top (grass/dirt layer for region 0; ceiling for others)
    for (let x = 0; x < VW; x++) {
      const top = VH - 1 - Math.floor(fbm3(x * 0.1, 0, 0, 2, seed + 9) * 4);
      for (let y = top; y < VH; y++) for (let z = 0; z < VD; z++) g.clear(x, y, z);
      for (let z = 0; z < VD; z++) g.set(x, top - 1, z, this.run.region === 0 ? pal.moss : pal.dirt[2]);
    }
    const carve = (cx, cy, rx, ry, zMin = 3, flatFloor = null) => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        if (flatFloor !== null && y < flatFloor) continue;
        for (let z = zMin; z < VD; z++) g.clear(x, y, z);
      }
    };
    // tunnels first (so rooms overwrite)
    for (const e of this.map.edges) {
      const a = this.nodePos(this.map.nodes[e.a]), b = this.nodePos(this.map.nodes[e.b]);
      const steps = Math.ceil(Math.hypot(b.vx - a.vx, b.vy - a.vy));
      const wob = rng.float(-3, 3);
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = a.vx + (b.vx - a.vx) * t + Math.sin(t * Math.PI) * wob;
        const y = a.vy + (b.vy - a.vy) * t;
        pts.push([x, y]);
        const r = e.tunnel === 'crawl' ? 1.6 : e.tunnel === 'elevator' ? 2.2 : 2.3;
        carve(x, y, r, r, 4);
      }
      e._pts = pts;
      this.decorateTunnel(g, e, pts, rng);
    }
    // rooms
    for (const n of this.map.nodes) {
      const p = this.nodePos(n);
      const big = n.type === 'boss' ? 1.7 : n.type === 'start' ? 1.2 : 1;
      carve(p.vx, p.vy, 6.5 * big, 4.6 * big, 3, p.vy - 3.5 * big);
      // floor layer
      for (let x = Math.floor(p.vx - 6 * big); x <= p.vx + 6 * big; x++) for (let z = 3; z < VD; z++) {
        const fy = Math.round(p.vy - 3.5 * big) - 1;
        if (g.in(x, fy, z) && g.solid(x, fy, z)) g.set(x, fy, z, pal.dirt[1 + (hash3(x, fy, z, 3) > 0.5 ? 1 : 0)]);
      }
      this.decorateRoom(g, n, p, big, rng);
    }
    const mesh = meshVoxels(g, { size: S, origin: [VW / 2, VH, VD], jitter: 0.07, seed, castShadow: false, receiveShadow: false, glowIntensity: 2.6 });
    scene.add(mesh);
    this.grid = g;
  }

  decorateTunnel(g, e, pts, rng) {
    const R = this.R, pal = R.pal;
    const floorOf = (x, y) => { let yy = Math.round(y); while (yy > 0 && !g.solid(Math.round(x), yy - 1, 6)) yy--; return yy; };
    if (e.tunnel === 'minecart') {
      for (let i = 0; i < pts.length; i += 1) { const [x, y] = pts[i]; const fy = floorOf(x, y); g.set(x, fy, 5, pal.metal[1]); g.set(x, fy, 8, pal.metal[1]); if (i % 2 === 0) for (let z = 5; z <= 8; z++) g.set(x, fy, z, pal.accent[2] || '#5a3820'); }
    } else if (e.tunnel.endsWith('bridge')) {
      // chasm under the middle of the path + planks
      const mid = Math.floor(pts.length / 2);
      for (let i = mid - 4; i <= mid + 4; i++) {
        const p = pts[i]; if (!p) continue;
        const [x, y] = p;
        for (let yy = Math.round(y) - 6; yy < Math.round(y) - 1; yy++) for (let z = 4; z < VD; z++) g.clear(x, yy, z);
        const col = e.tunnel === 'lavabridge' ? '#2e2424' : e.tunnel === 'crystalbridge' ? pal.accent[0] : e.tunnel === 'chainbridge' ? pal.metal[1] : '#8a5a33';
        for (let z = 5; z <= 8; z++) g.set(x, Math.round(y) - 2, z, col, e.tunnel === 'crystalbridge' ? GLOW : 0);
        if (e.tunnel === 'lavabridge') for (let z = 4; z < VD; z++) g.set(x, Math.round(y) - 6, z, '#ff6a1a', GLOW);
      }
    } else if (e.tunnel === 'flooded') {
      for (const [x, y] of pts) { const fy = floorOf(x, y); for (let z = 4; z < VD; z++) g.set(x, fy, z, pal.water, GLOW); }
    } else if (e.tunnel === 'elevator' || e.tunnel === 'stairs') {
      for (let i = 0; i < pts.length; i += 3) { const [x, y] = pts[i]; g.set(x - 2, y, 4, pal.accent[2] || '#5a3820'); g.set(x + 2, y, 4, pal.accent[2] || '#5a3820'); }
    }
    // lantern / crystal along the way
    if (pts.length > 6) {
      const [x, y] = pts[Math.floor(pts.length * 0.35)];
      g.set(x, Math.round(y) + 1, 4, pal.glow, GLOW);
    }
  }

  decorateRoom(g, n, p, big, rng) {
    const R = this.R, pal = R.pal;
    const fy = Math.round(p.vy - 3.5 * big);
    const cx = Math.round(p.vx), z = 6;
    const box = (x0, y0, z0, w, h, d, col, fl = 0) => g.box(x0, y0, z0, x0 + w, y0 + h, z0 + d, col, fl);
    // background wall detail: crystals / mushrooms / pillars
    for (let k = 0; k < 3; k++) {
      const x = cx + rng.int(-5, 5), y = fy + rng.int(2, 5);
      if (!g.solid(x, y, 3)) continue;
      if (R.id === 'prism' || rng.chance(0.15)) box(x, y, 3, 1, rng.int(1, 2), 1, rng.pick([pal.accent[0], pal.accent[1]]), GLOW);
    }
    switch (n.type) {
      case 'treasure': box(cx - 1, fy, z, 3, 2, 2, '#8a5a33'); box(cx - 1, fy + 1, z, 3, 1, 2, '#ffc83a'); box(cx, fy + 1, z + 2, 1, 1, 1, '#ffe08a', GLOW); break;
      case 'mining': for (let k = 0; k < 5; k++) { const x = cx + rng.int(-5, 5), y = fy + rng.int(1, 4); g.set(x, y, 3, rng.pick(['#ffc83a', '#c8743a', '#7fe3ff']), GLOW); } box(cx - 2, fy, z, 1, 3, 1, '#8a5a33'); box(cx - 3, fy + 3, z, 3, 1, 1, '#9aa3b2'); break;
      case 'camp': box(cx - 1, fy, z, 3, 1, 2, '#5a3820'); box(cx, fy + 1, z, 1, 1, 1, '#ffb040', GLOW); box(cx + 2, fy, z - 1, 3, 2, 3, '#7a6a4a'); break;
      case 'merchant': box(cx - 2, fy, z, 4, 2, 2, '#8a5a33'); box(cx - 2, fy + 2, z, 4, 1, 2, '#c84a3a'); box(cx + 2, fy + 3, z, 1, 1, 1, '#ffd890', GLOW); break;
      case 'event': box(cx, fy, z, 1, 3, 1, '#5a4a6a'); box(cx, fy + 3, z, 1, 1, 1, '#c08aff', GLOW); break;
      case 'monster': box(cx - 1, fy, z + 1, 2, 1, 1, '#efe6d0'); g.set(cx + 2, fy, z, '#efe6d0'); break;
      case 'elite': box(cx - 1, fy, z, 3, 3, 2, '#efe6d0'); g.set(cx - 1, fy + 2, z + 2, '#ff5af0', GLOW); g.set(cx + 1, fy + 2, z + 2, '#ff5af0', GLOW); break;
      case 'boss': box(cx - 3, fy, z - 1, 7, 2, 3, pal.rock[4]); box(cx - 2, fy + 2, z - 1, 5, 4, 1, pal.rock[3]); box(cx - 1, fy + 4, z, 1, 1, 1, pal.glow, GLOW); box(cx + 1, fy + 4, z, 1, 1, 1, pal.glow, GLOW); break;
      case 'start': box(cx - 2, fy, z, 1, 5, 1, '#8a5a33'); box(cx + 2, fy, z, 1, 5, 1, '#8a5a33'); box(cx - 2, fy + 5, z, 5, 1, 1, '#8a5a33'); g.set(cx, fy + 4, z, '#ffb060', GLOW); break;
      default: break;
    }
  }

  placeLights() {
    const scene = this.world.scene;
    for (const l of this.lights) scene.remove(l);
    this.lights = [];
    const cur = this.map.nodes[this.map.current];
    const near = [cur, ...cur.out.map((id) => this.map.nodes[id])];
    for (const n of near.slice(0, 5)) {
      const p = this.nodePos(n);
      const col = n === cur ? 0xffb060 : new THREE.Color(NODE_TYPES[n.type].color).getHex();
      const l = new FlickerLight(col, n === cur ? 2.2 : 1.4, 4.5, { amount: 0.15 });
      l.position.set(p.x, p.y + 0.4, 1.2);
      scene.add(l);
      this.lights.push(l);
    }
  }

  available() { const cur = this.map.nodes[this.map.current]; return cur.out.map((id) => this.map.nodes[id]); }

  update(dt) {
    this.time += dt;
    for (const l of this.lights) l.tick(this.time);
    this.fx.update(dt); this.dust.update(dt);
    if (this.hero.update) this.hero.update(dt);
    // camera pan (wheel / drag)
    const inp = this.game.input;
    if (inp.wheel) this.camTargetY -= inp.wheel * 1.2;
    if (inp.down && !this.game.ui.overUI()) {
      if (this.dragY === null) this.dragY = { y: inp.y, cam: this.camTargetY };
      else this.camTargetY = this.dragY.cam + (inp.y - this.dragY.y) * 0.05;
    } else this.dragY = null;
    if (inp.action('up')) this.camTargetY += dt * 8;
    if (inp.action('down')) this.camTargetY -= dt * 8;
    const minY = (8 - VH) * S + 2, maxY = -2.5;
    this.camTargetY = clamp(this.camTargetY, minY, maxY);
    if (this.titleT < 2.2) { this.titleT += dt; this.camY += (this.camTargetY - this.camY) * Math.min(1, dt * 1.2); }
    else this.camY += (this.camTargetY - this.camY) * Math.min(1, dt * 5);
    const sway = Math.sin(this.time * 0.25) * 0.6;
    this.rig.aim([sway, this.camY + 1.6, 21], [sway * 0.4, this.camY - 0.4, 0], 28, 6);
    this.rig.update(dt);
    // ambience: drips, dust, glowing motes on available paths
    if (Math.random() < 0.5) this.dust.emit({ pos: [0, this.camY, 1.5], posSpread: [7, 4, 0.5], vel: [0.05, 0.02, 0], spread: 0.03, life: [3, 6], size: 1, color: '#c8b8a0', alpha: 0.4, fadeIn: 1 });
    for (const n of this.available()) {
      const e = this.map.edges.find((q) => q.a === this.map.current && q.b === n.id);
      if (!e || !e._pts || Math.random() > 0.35) continue;
      const pt = e._pts[Math.floor(Math.random() * e._pts.length)];
      this.fx.emit({ pos: [(pt[0] - VW / 2) * S, (pt[1] - VH) * S, 1.6], posSpread: 0.1, vel: [0, 0.15, 0], spread: 0.05, life: [0.6, 1.2], size: 1, color: '#ffe08a', glow: 3 });
    }
    if (Math.random() < 0.08) {
      const x = (Math.random() - 0.5) * 11;
      this.fx.emit({ pos: [x, this.camY + 3, 1.2], vel: [0, -3, 0], life: [0.8, 1], size: 1, color: this.R.pal.water, glow: 1.5 });
    }
  }

  draw(ui) {
    const run = this.run, map = this.map;
    const h = hud(ui, this.game);
    if (h.bagClicked) openBag(this.game);
    const avail = this.available();
    let hovered = null;
    // edges to available nodes: dotted glowing path highlight in screen space
    const cam = this.rig;
    const proj = (x, y, z = 1.5) => cam.project(new THREE.Vector3(x, y, z), ui.w, ui.h);
    for (const e of map.edges) {
      if (!e._pts) continue;
      const fromCur = e.a === map.current;
      const visited = map.visited.includes(e.a) && map.visited.includes(e.b);
      if (!fromCur && !visited) continue;
      const step = fromCur ? 2 : 3;
      for (let i = 0; i < e._pts.length; i += step) {
        const [vx, vy] = e._pts[i];
        const p = proj((vx - VW / 2) * S, (vy - VH) * S);
        const on = fromCur ? (i / step + Math.floor(this.time * 8)) % 2 === 0 : true;
        if (on && fromCur) { ui.rect(Math.round(p.x) - 1, Math.round(p.y) - 1, 4, 4, '#ff9a3a', 0.35); ui.rect(Math.round(p.x), Math.round(p.y), 2, 2, '#fff0b0'); }
        else if (on) ui.rect(Math.round(p.x), Math.round(p.y), 1, 1, '#b8a888', 0.7);
      }
      // visible encounter marker
      if (fromCur && e.sight) {
        const [vx, vy] = e._pts[Math.floor(e._pts.length / 2)];
        const p = proj((vx - VW / 2) * S, (vy - VH) * S);
        const ic = { glint: 'sparkle', shadow: 'eye', cart: 'minecart', note: 'scroll' }[e.sight];
        ui.icon(ic, p.x, p.y - 4, { center: true });
        if (ui.hit('sight' + e.a + '-' + e.b, p.x - 6, p.y - 10, 12, 12).hover) ui.tooltip({ glint: 'You spot a glinting vein along this tunnel.', shadow: 'Something moves in the dark along this tunnel…', cart: 'An abandoned cart sits on this path.', note: 'A scrap of paper flutters in this tunnel.' }[e.sight]);
      }
    }
    // nodes
    const maxRow = map.nodes[map.current].row + 2;
    for (const n of map.nodes) {
      const p = this.nodePos(n);
      const s = proj(p.x, p.y + 0.15, 1.8);
      if (s.y < -20 || s.y > ui.h + 20) continue;
      const isCur = n.id === map.current;
      const isAvail = avail.includes(n);
      const hidden = n.row > maxRow && n.type !== 'boss';
      const badge = nodeBadge(hidden ? 'event' : n.type, 17);
      const bob = isAvail ? Math.round(Math.sin(this.time * 4 + n.id) * 1.5) : 0;
      const alpha = n.done || isCur ? 0.55 : hidden ? 0.35 : 1;
      if (isAvail) ring(ui.ctx, s.x, s.y - 14 + bob, 11 + Math.sin(this.time * 5) * 1.5, NODE_TYPES[n.type].color, 1, 0.8);
      ui.img(badge, Math.round(s.x - badge.width / 2), Math.round(s.y - 22 + bob), { alpha });
      if (n.done && !isCur) ui.icon('check', s.x + 4, s.y - 24);
      const hit = ui.hit('node' + n.id, s.x - 10, s.y - 24 + bob, 20, 20, { cursor: isAvail ? 'hand' : 'arrow', sound: isAvail });
      if (hit.hover) {
        hovered = n;
        const T = NODE_TYPES[n.type];
        const e = map.edges.find((q) => q.a === map.current && q.b === n.id);
        let body = hidden ? 'Too deep to see from here.' : T.desc || '';
        if (e && isAvail) {
          const tun = TUNNELS[e.tunnel];
          body += `\n\n{gold}Path: ${tun.name}{/}\n${tun.desc}\nRisk: ${'●'.repeat(tun.risk)}${'○'.repeat(3 - tun.risk)}`;
        }
        if (isCur) body = 'You are here.';
        ui.tooltip({ title: hidden ? '???' : T.name, body, color: T.color });
        if (hit.clicked && isAvail) this.choose(n, e);
      }
    }
    // legend + floor
    const fl = map.nodes[map.current].row;
    ui.panel('dark', ui.w - 96, 28, 92, 20);
    ui.text(`Floor ${fl + 1}/${FLOORS}`, ui.w - 50, 34, { align: 'center', color: COLORS.white });
    if (this.tip) {
      ui.panel('parchment', ui.w / 2 - 130, ui.h - 46, 260, 34);
      ui.text('Pick a glowing room connected to yours.\nScroll or drag to look deeper.', ui.w / 2, ui.h - 38, { align: 'center', color: '#3a2618' });
      if (this.game.input.pressed || this.time > 8) { this.tip = false; save.data.seen.tips.map = true; save.write(); }
    }
    // region title card
    if (this.titleT < 3.5) {
      const k = this.titleT;
      const a = k < 0.4 ? k / 0.4 : k > 2.8 ? 1 - (k - 2.8) / 0.7 : 1;
      ribbonTitle(ui, this.R.name, ui.w / 2, 70 - (1 - ease.outBack(Math.min(1, k * 2))) * 20, this.R.ribbon, clamp(a, 0, 1));
      ui.ctx.globalAlpha = clamp(a, 0, 1);
      ui.text(`Layer ${run.region + 1} — ${this.R.sub}`, ui.w / 2, 92, { align: 'center', color: COLORS.white, outline: '#140c10', thick: true });
      ui.ctx.globalAlpha = 1;
    }
    this.hovered = hovered;
  }

  choose(node, edge) {
    if (this.leaving) return;
    this.leaving = true;
    this.game.audio.play('footstep');
    // hero walks toward the tunnel entrance, then travel
    const p = this.nodePos(node);
    const h = this.hero.group;
    this.hero.play && this.hero.play('walk', { loop: true });
    h.rotation.y = p.x > h.position.x ? Math.PI / 2 : -Math.PI / 2;
    this.tw.to(h.position, { x: h.position.x + Math.sign(p.x - h.position.x || 1) * 0.6 }, 0.6, { ease: 'linear' });
    this.co.start(function* () { yield 0.55; travel(this.game, edge, node); }.bind(this));
  }
}
