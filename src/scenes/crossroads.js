// The crossroads: no map. Each time you move on, your explorer walks into a cavern where the
// tunnel splits. Every mouth tells you something (eyes in the dark, a trader's lantern, the glint
// of ore, woodsmoke…) and the narrator reads it out in the letterbox. Click a mouth to take it.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { ParticleSystem } from '../gfx/particles.js';
import { pixelTexture } from '../gfx/materials.js';
import { REGIONS, TUNNELS } from '../data/regions.js';
import { MONSTERS } from '../data/monsters.js';
import { FLOORS } from '../systems/mapgen.js';
import { CW, CH, mouthLayout, crossroadsCanvas, foregroundCanvas } from '../art/crossroads_art.js';
import { lanternCanvas, glowCanvas } from '../art/handpaint.js';
import { buildCharacter } from '../models/characters.js';
import { hud } from './common.js';
import { travel, openBag } from './flow.js';
import { clamp, ease, hash2 } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

const PX = 0.01, LB = 40;
const SIDE = { 1: ['Ahead'], 2: ['Left', 'Right'], 3: ['Left', 'Ahead', 'Right'], 4: ['Far left', 'Left', 'Right', 'Far right'] };
const OMEN = {
  monster: ['Something growls in the dark.', 'Eyes glint, low to the ground.', 'Fresh claw marks. Something hunts down there.'],
  elite: ['Deep gouges rake the stone. Whatever made them is big.', 'A heavy, patient breathing echoes out.'],
  boss: ['A cold wind rises from below. The guardian of this layer is waiting.'],
  mining: ['The walls glitter with ore.', 'Old pick marks… and a seam of something bright.'],
  treasure: ['A golden gleam, just out of sight.', 'Coins in the dirt. Someone dropped them… or something.'],
  merchant: ['A lantern sways ahead. Someone is humming a sales pitch.', 'A painted sign: a coin purse. A trader!'],
  event: ['Pale lights drift in the tunnel. Strange.', 'Whispers. Or maybe the wind.'],
  camp: ['Woodsmoke. Someone left a fire burning.', 'Warmth on your face. A safe place to rest?'],
};
const SIGHT = { glint: 'A vein glints along the way.', shadow: 'Something shifts in the dark along this path.', cart: 'An abandoned cart sits by the entrance.', note: 'A scrap of paper flutters on the frame.' };
const RISK = ['', 'a little risky', 'dangerous'];
const FLAVOR = [
  'Rusted rails, cold lamps. The old iron workings go on and on.',
  'Light bends strangely here. The crystals hum.',
  'Spores drift like snow. The fungus forest breathes.',
  'Carved pillars, flooded halls. The first miners lived here.',
  'The rock sweats heat. Somewhere below, the mountain bleeds.',
  'Silence. Bones. The air tastes of the curse.',
];

export class CrossroadsScene extends Scene {
  enter(params = {}) {
    const run = this.game.run;
    this.run = run;
    this.map = run.map;
    this.R = REGIONS[run.region];
    const cur = this.map.nodes[this.map.current];
    this.choices = cur.out.map((id) => {
      const node = this.map.nodes[id];
      const edge = this.map.edges.find((e) => e.a === cur.id && e.b === id);
      return { node, edge, tunnel: edge ? edge.tunnel : 'tunnel', type: node.type };
    });
    this.boss = this.choices.some((c) => c.type === 'boss');
    this.mouths = mouthLayout(this.choices.length, this.boss);
    this.seed = 31 + cur.id * 7 + run.region * 101;
    this.hover = -1;
    this.sel = -1;
    this.leaving = false;
    this.narr = { text: '', t: 0 };
    this.intro = params.intro || params.newRegion || !run.flags['seenRegion' + run.region] ? 0 : 99;
    run.flags['seenRegion' + run.region] = true;
    this.lb = 0;
    this.buildWorld();
    this.game.audio.music(this.R.music);
    this.amb = this.game.audio.loop(run.region === 4 ? 'lava' : 'cave');
    this.say(this.boss ? `Only one way remains. ${MONSTERS[this.R.boss] ? MONSTERS[this.R.boss].name + ' waits below.' : ''}` : `${FLAVOR[run.region]} The tunnel splits.`);
  }
  exit() { this.amb && this.amb.stop(1); }

  buildWorld() {
    const run = this.run;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050608');
    const bgCanvas = crossroadsCanvas(run.region, this.R.pal, this.choices.map((c) => ({ tunnel: c.tunnel, type: c.type })), this.seed);
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(CW * PX, CH * PX), new THREE.MeshBasicMaterial({ map: pixelTexture(bgCanvas) }));
    scene.add(this.bg);
    const fgc = foregroundCanvas(run.region, this.R.pal);
    this.fg = new THREE.Mesh(new THREE.PlaneGeometry(fgc.width * PX, fgc.height * PX), new THREE.MeshBasicMaterial({ map: pixelTexture(fgc), transparent: true, alphaTest: 0.5 }));
    this.fg.position.z = 3;
    scene.add(this.fg);
    const cam = new THREE.OrthographicCamera(-4.8, 4.8, 2.7, -2.7, 0.1, 50);
    cam.userData.viewHeight = 5.4;
    cam.position.set(0, 0, 10);
    this.cam = cam;
    this.world = { scene, camera: cam, post: { tone: 0, saturation: 1, contrast: 1, lift: [0, 0, 0], gain: [1, 1, 1], vignette: 0.35, dither: 0, bloom: 0.5, threshold: 0.78, outline: 0.75, edge: 0.35 } };
    scene.add(new THREE.HemisphereLight(0x6a8a9a, 0x3a2216, 0.7));
    this.lamp = new THREE.PointLight(0xffb35a, 4.5, 10, 1.1);
    this.lamp.position.set(0, 1.6, 2);
    scene.add(this.lamp);
    const rim = new THREE.DirectionalLight(0xff9a50, 1.0);
    rim.position.set(0, 2, -3);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x5a8aa8, 0.5);
    fill.position.set(-2, 0.5, 4);
    scene.add(fill);
    this.dust = new ParticleSystem(300);
    scene.add(this.dust.object);
    const hero = buildCharacter(run.char);
    const box = new THREE.Box3().setFromObject(hero.group);
    const h = Math.max(0.3, box.max.y - box.min.y);
    this.heroScale = (run.char === 'durgan' ? 140 : run.char === 'clover' ? 156 : 184) * PX / h;
    this.heroFoot = -box.min.y;
    hero.group.scale.setScalar(this.heroScale);
    scene.add(hero.group);
    this.hero = hero;
    this.heroPos = { x: -80, y: 506, s: 1 };
    this.placeHero();
    hero.group.rotation.y = Math.PI / 2;
    hero.play('walk', { loop: true });
    this.walkIn = { t: 0, dur: 1.8 };
  }
  placeHero() {
    const s = this.heroScale * this.heroPos.s;
    this.hero.group.scale.setScalar(s);
    this.hero.group.position.set((this.heroPos.x - 480) * PX, (270 - this.heroPos.y) * PX + this.heroFoot * s, 1 + (1 - this.heroPos.s));
  }
  bgOffset() { return { x: -24 + Math.round(Math.sin(this.time * 0.13) * 12), y: -14 + Math.round(Math.sin(this.time * 0.09) * 4) }; }
  mouthScreen(i) { const m = this.mouths[i], o = this.bgOffset(); return { x: m.x + o.x, y: m.y + o.y, w: m.w, h: m.h }; }

  say(text) { if (text !== this.narr.text) this.narr = { text, t: 0 }; }
  describe(i) {
    const c = this.choices[i], T = TUNNELS[c.tunnel] || TUNNELS.tunnel;
    const lines = OMEN[c.type] || OMEN.event;
    const omen = lines[Math.floor(hash2(c.node.id, 3, this.seed) * lines.length)];
    const side = SIDE[this.choices.length][i];
    const risk = RISK[T.risk] ? `, ${RISK[T.risk]}` : '';
    const sight = c.edge && c.edge.sight ? ` ${SIGHT[c.edge.sight]}` : '';
    const boss = c.type === 'boss' && MONSTERS[this.R.boss] ? ` {bad}${MONSTERS[this.R.boss].name}{/} lies beyond.` : '';
    return `{gold}${side}:{/} ${T.name.toLowerCase()}${risk}. ${omen}${sight}${boss}`;
  }

  choose(i) {
    if (this.leaving || this.walkIn) return;
    this.leaving = true;
    this.sel = i;
    const c = this.choices[i], m = this.mouthScreen(i);
    this.say(`{gold}${SIDE[this.choices.length][i]}.{/} Into the ${(TUNNELS[c.tunnel] || TUNNELS.tunnel).name.toLowerCase()}…`);
    this.game.audio.play('footstep');
    this.hero.play('walk', { loop: true });
    this.hero.group.rotation.y = Math.PI - clamp((m.x - this.heroPos.x) / 500, -0.9, 0.9);
    this.tw.to(this.heroPos, { x: m.x, y: m.y + 18, s: 0.5 }, 1.5, { ease: 'inOutQuad' });
    this.tw.to(this.cam, { zoom: 1.45 }, 1.6, { ease: 'inOutCubic' });
    this.zoomTo = { x: (m.x - 480) * PX * 0.6, y: (270 - (m.y - m.h * 0.4)) * PX * 0.6 };
    this.co.start(function* () { yield 1.35; travel(this.game, c.edge || { a: this.map.current, b: c.node.id, tunnel: c.tunnel }, c.node); }.bind(this));
  }

  update(dt) {
    const inp = this.game.input;
    if (this.intro < 3.2) { this.intro += dt; if (this.intro < 2.4 && inp.pressed) this.intro = 2.4; }
    this.lb = Math.min(1, this.lb + dt * 1.5);
    this.narr.t += dt;
    const o = this.bgOffset();
    this.bg.position.set((CW / 2 + o.x - 480) * PX, (270 - CH / 2 - o.y) * PX, 0);
    // the foreground rocks drift faster than the cave: parallax depth
    const fx = -64 + (o.x + 24) * 1.9, fy = -34 + (o.y + 14) * 1.5;
    this.fg.position.x = (fx + (CW + 80) / 2 - 480) * PX;
    this.fg.position.y = (270 - (fy + (CH + 40) / 2)) * PX;
    // walk in from the left, then turn toward the tunnels
    if (this.walkIn && this.intro >= 2.4) {
      this.walkIn.t += dt;
      const k = clamp(this.walkIn.t / this.walkIn.dur, 0, 1);
      this.heroPos.x = -80 + (480 + 80) * ease.outQuad(k);
      if (k >= 1) { this.walkIn = null; this.hero.play('idle', { loop: true }); }
    }
    if (!this.walkIn && !this.leaving) {
      const target = this.hover >= 0 ? Math.PI - clamp((this.mouthScreen(this.hover).x - 480) / 600, -0.8, 0.8) : Math.PI * 0.82;
      const r = this.hero.group.rotation;
      r.y += (target - r.y) * Math.min(1, dt * 5);
    }
    this.placeHero();
    if (this.zoomTo) { this.cam.position.x += (this.zoomTo.x - this.cam.position.x) * Math.min(1, dt * 2); this.cam.position.y += (this.zoomTo.y - this.cam.position.y) * Math.min(1, dt * 2); }
    this.cam.updateProjectionMatrix();
    this.lamp.intensity = 4.5 + Math.sin(this.time * 7.3) * 0.25 + Math.sin(this.time * 17.1) * 0.15;
    this.hero.update(dt);
    this.dust.update(dt);
    if (Math.random() < 0.5) this.dust.emit({ pos: [rnd.float(-4.6, 4.6), rnd.float(-2.4, 2.6), 0.5], vel: [0.03, 0.015, 0], spread: 0.02, life: [3, 6], size: 1, color: '#e8d0a8', alpha: 0.5, fadeIn: 1 });
    // keyboard: left/right to pick, confirm to go
    if (!this.leaving && !this.walkIn && !this.game.overlays.length) {
      if (inp.actionPressed('left')) this.hover = Math.max(0, (this.hover < 0 ? 1 : this.hover) - 1);
      if (inp.actionPressed('right')) this.hover = Math.min(this.choices.length - 1, this.hover + 1);
      if (inp.actionPressed('confirm') && this.hover >= 0) this.choose(this.hover);
      if (inp.actionPressed('back')) this.game.pushOverlay('pause');
    }
  }

  draw(ui) {
    const ctx = ui.ctx;
    const active = !this.leaving && !this.walkIn && this.intro >= 2.4;
    // what waits beyond each mouth, animated in the dark
    let hov = -1;
    this.choices.forEach((c, i) => {
      const m = this.mouthScreen(i);
      const vx = m.x, vy = m.y - m.h * 0.32;
      this.omen(ui, c.type, vx, vy, i);
      if (active) {
        const h = ui.hit('mouth' + i, m.x - m.w / 2, m.y - m.h, m.w, m.h + 30, { sound: false });
        if (h.hover) hov = i;
        if (h.clicked) {
          // touch: the first tap shows what lies down that tunnel, the second takes it
          if (!this.game.input.touch || this.picked === i) this.choose(i);
          else { this.picked = i; this.game.audio.play('ui_pop'); }
        }
      }
    });
    if (active && hov >= 0) this.hover = hov;
    else if (active && this.game.input.touch) this.hover = this.picked ?? -1;
    else if (active && this.game.input.moved) this.hover = -1;
    const show = this.leaving ? this.sel : this.hover;
    if (show >= 0) {
      const m = this.mouthScreen(show);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + Math.sin(this.time * 4) * 0.06;
      ctx.drawImage(glowCanvas(Math.round(m.w * 0.7), '#ffcf8a'), m.x - Math.round(m.w * 0.7), m.y - m.h * 0.55 - Math.round(m.w * 0.7));
      ctx.restore();
      if (!this.leaving) this.say(this.describe(show) + (this.game.input.touch && this.picked === show ? ' {dim}(tap it again to go){/}' : ''));
      if (!this.leaving && active && this.game.input.touch && this.picked === show) ui.touchButton('confirm', ui.w - 64, ui.h - 92, 32, { icon: 'arrowR', label: 'GO', style: 'brass', glow: true });
    } else if (!this.leaving && this.narr.t > 6 && active) this.say(this.boss ? 'Only one way remains. Steel yourself.' : (this.game.input.touch ? 'Which way? (tap a tunnel)' : 'Which way? (click a tunnel)'));
    // the hanging lamp
    const o = this.bgOffset();
    const lx = 504 + o.x, ly = 96 + o.y;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + Math.sin(this.time * 7.3) * 0.08;
    ctx.drawImage(glowCanvas(90), lx - 90, ly - 60);
    ctx.restore();
    ui.img(lanternCanvas(Math.floor(this.time * 9) % 4), lx - 20, ly - 10, { scale: 2 });

    // letterbox + narration
    const bar = Math.round(LB * ease.outCubic(this.lb));
    ui.rect(0, 0, ui.w, bar, '#050406');
    ui.rect(0, ui.h - bar, ui.w, bar, '#050406');
    if (this.lb > 0.6) {
      const h = hud(ui, this.game);
      if (h.bagClicked && !this.leaving) openBag(this.game);
      ui.text(`{dim}depth ${Math.min(FLOORS, (this.map.nodes[this.map.current].row ?? 0) + 1)} of ${FLOORS}{/}`, ui.w - 10, 24, { align: 'right', font: 'small' });
      const n = Math.floor(this.narr.t * 70);
      const shown = this.typed(this.narr.text, n);
      ui.text(shown, ui.w / 2, ui.h - bar + 14, { align: 'center', color: '#efe2c8', maxW: ui.w - 200 });
    }
    // region title card
    if (this.intro < 3.2) {
      const a = this.intro < 2.4 ? 1 : 1 - (this.intro - 2.4) / 0.8;
      ui.rect(0, 0, ui.w, ui.h, '#050406', clamp(a, 0, 1));
      const t = clamp(this.intro / 0.8, 0, 1) * clamp(a * 1.5, 0, 1);
      ui.ctx.globalAlpha = t;
      ui.text(`{dim}Layer ${this.run.region + 1}{/}`, ui.w / 2, ui.h / 2 - 46, { align: 'center' });
      ui.big(this.R.name, ui.w / 2, ui.h / 2 - 16, { scale: 3, top: '#fff2d8', bottom: '#d89a5a' });
      ui.text(this.R.sub, ui.w / 2, ui.h / 2 + 18, { align: 'center', color: '#c8b8a0' });
      ui.ctx.globalAlpha = 1;
    }
  }
  /** Typewriter that never cuts a {color} tag in half. */
  typed(str, n) {
    let out = '', vis = 0;
    for (let i = 0; i < str.length && vis < n; i++) {
      if (str[i] === '{') { const j = str.indexOf('}', i); if (j > i) { out += str.slice(i, j + 1); i = j; continue; } }
      out += str[i]; vis++;
    }
    const opens = (out.match(/\{(?!\/)[^}]*\}/g) || []).length, closes = (out.match(/\{\/\}/g) || []).length;
    return opens > closes ? out + '{/}' : out;
  }

  omen(ui, type, x, y, i) {
    const t = this.time + i * 1.7, ctx = ui.ctx;
    const glow = (r, col, a) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(glowCanvas(r, col), Math.round(x - r), Math.round(y - r)); ctx.restore(); };
    const eyes = (ex, ey, col, gap, size) => {
      const blink = (t * 0.7) % 3.5 < 0.12;
      if (blink) return;
      for (const s of [-1, 1]) { ui.rect(ex + s * gap - size / 2, ey, size, Math.max(1, size / 2), col); ui.rect(ex + s * gap - size / 2 + (s < 0 ? 0 : size - 1), ey, 1, 1, '#ffffff'); }
    };
    switch (type) {
      case 'monster': eyes(x + Math.sin(t * 0.4) * 6, y + 8, '#ff3a2a', 4, 3); break;
      case 'elite': glow(26, '#ff4a2a', 0.18); eyes(x - 10, y + 2, '#ff6a1a', 6, 4); eyes(x + 12, y + 6, '#ff6a1a', 5, 3); break;
      case 'boss': glow(46, '#c03aff', 0.25 + Math.sin(t * 2) * 0.08); eyes(x, y - 4, '#ff2a4a', 12, 6); break;
      case 'mining': for (let k = 0; k < 6; k++) if (Math.sin(t * 3 + k * 2.1) > 0.7) ui.rect(x - 24 + ((k * 37) % 48), y - 10 + ((k * 23) % 30), 1, 1, k % 2 ? '#bff4ff' : '#ffffff'); glow(20, '#6ad8ff', 0.12); break;
      case 'treasure': glow(28, '#ffcf4a', 0.3 + Math.sin(t * 2.5) * 0.08); if (Math.sin(t * 4) > 0.8) ui.rect(x + Math.sin(t) * 8, y + 4, 1, 1, '#ffffff'); break;
      case 'merchant': glow(30, '#ffb35a', 0.32); ui.img(lanternCanvas(Math.floor(t * 9) % 4), x - 9 + Math.round(Math.sin(t * 1.4) * 2), y - 6); break;
      case 'camp': glow(32, '#ff7a2a', 0.3 + Math.sin(t * 9) * 0.05 + Math.sin(t * 13) * 0.04); if (Math.random() < 0.2) ui.burst(x + rnd.float(-4, 4), y + 6, 1, { colors: ['#8a8078', '#6a625a'], speed: 6, gravity: -14, life: 2, size: 2 }); break;
      case 'event': for (let k = 0; k < 3; k++) { const wx = x + Math.sin(t * 0.8 + k * 2) * 18, wy = y + Math.cos(t * 0.6 + k) * 10; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.drawImage(glowCanvas(8, '#a08aff'), Math.round(wx - 8), Math.round(wy - 8)); ctx.restore(); ui.rect(wx, wy, 1, 1, '#ffffff'); } break;
      default: break;
    }
  }
}
