// The crossroads: no map. Each time you move on, your explorer walks into a cavern where the
// tunnel splits (a voxel stage_vox 'crossroads' set). Every mouth is dressed for where it leads
// and shows an omen (eyes in the dark, a trader's sign, the glint of ore, woodsmoke…), and the
// narrator reads it out in the letterbox. Click a mouth to take it.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig } from '../gfx/camera.js';
import { REGIONS, TUNNELS } from '../data/regions.js';
import { MONSTERS } from '../data/monsters.js';
import { FLOORS } from '../systems/mapgen.js';
import { glowCanvas } from '../art/handpaint.js';
import { buildCharacter } from '../models/characters.js';
import { buildStage } from '../models/stage_vox.js';
import { hud } from './common.js';
import { travel, openBag } from './flow.js';
import { clamp, ease, hash2 } from '../core/math.js';

const LB = 40;
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
const HOVER_COL = { monster: '#ff6a4a', elite: '#ff7a3a', boss: '#d05aff', mining: '#8ae0ff', treasure: '#ffd25e', merchant: '#ffc070', camp: '#ff9a4a', event: '#b8a0ff' };

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
    this.stage = buildStage('crossroads', run.region, { choices: this.choices.map((c) => ({ tunnel: c.tunnel, type: c.type })), seed: this.seed });
    this.stage.attach(scene);
    const C0 = this.stage.camera;
    this.rig = new CameraRig(C0.fov);
    this.rig.sway = 0.03;
    this.rig.cut(C0.pos, C0.look, C0.fov);
    this.stage.setCamera(this.rig.camera);
    this.home = C0;
    this.world = { scene, camera: this.rig.camera, post: { bloom: 0.8, threshold: 0.78, vignette: 0.36, outline: 0.6, edge: 0.32, saturation: 1.1 } };
    this.mouths = this.stage.anchors.mouths;
    // a warm light that leans into the tunnel you're looking at
    this.pick = new THREE.PointLight(0xffcf8a, 0, 4.5, 1.5);
    scene.add(this.pick);
    const hero = buildCharacter(run.char);
    scene.add(hero.group);
    this.hero = hero;
    const A = this.stage.anchors;
    this.heroStart = A.heroStart.clone();
    hero.group.position.copy(this.heroStart);
    hero.group.rotation.y = Math.PI / 2;
    hero.play('walk', { loop: true });
    this.walkIn = { t: 0, dur: 3.0 };
  }

  project(v) { return this.rig.project(v, 960, 540); }
  /** A tunnel mouth as a screen rect (projected from its 3D opening). */
  mouthScreen(i) {
    const m = this.mouths[i];
    const a = this.project(new THREE.Vector3(m.x - m.w / 2, 0, m.z + 0.3)), b = this.project(new THREE.Vector3(m.x + m.w / 2, m.h, m.z + 0.3));
    const w = Math.abs(b.x - a.x), h = Math.abs(a.y - b.y);
    return { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y), w, h };
  }

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
    const c = this.choices[i], m = this.mouths[i];
    this.say(`{gold}${SIDE[this.choices.length][i]}.{/} Into the ${(TUNNELS[c.tunnel] || TUNNELS.tunnel).name.toLowerCase()}…`);
    this.game.audio.play('footstep');
    const hero = this.hero;
    hero.play('walk', { loop: true });
    // the camera leans in after the explorer as they walk into the mouth
    this.rig.moveTo([m.x * 0.55, 1.75, 3.6], [m.x, 0.95, m.z - 1.2], 38, 1.6, 'inOutCubic');
    this.co.start(function* () {
      const path = [hero.group.position.clone(), new THREE.Vector3(m.x, 0, m.z + 0.6), new THREE.Vector3(m.x, 0, m.z - 1.4)];
      for (let k = 1; k < path.length; k++) {
        const a = path[k - 1], b = path[k], dur = Math.max(0.35, a.distanceTo(b) / 2.4);
        hero.group.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        let t = 0;
        while (t < dur) { t += this.game.ui.dt || 0.016; hero.group.position.lerpVectors(a, b, ease.inOutQuad(Math.min(1, t / dur))); yield null; }
      }
      travel(this.game, c.edge || { a: this.map.current, b: c.node.id, tunnel: c.tunnel }, c.node);
    }.bind(this));
  }

  update(dt) {
    const inp = this.game.input;
    if (this.intro < 3.2) { this.intro += dt; if (this.intro < 2.4 && inp.pressed) this.intro = 2.4; }
    this.lb = Math.min(1, this.lb + dt * 1.5);
    this.narr.t += dt;
    this.stage.update(dt, this.time);
    const A = this.stage.anchors;
    // walk in from the left, then turn toward the tunnels
    if (this.walkIn && this.intro >= 2.4) {
      this.walkIn.t += dt;
      const k = clamp(this.walkIn.t / this.walkIn.dur, 0, 1);
      this.hero.group.position.lerpVectors(this.heroStart, A.heroCenter, ease.outQuad(k));
      if (k >= 1) { this.walkIn = null; this.hero.play('idle', { loop: true }); }
    }
    if (!this.walkIn && !this.leaving) {
      const hp = this.hero.group.position;
      const m = this.hover >= 0 ? this.mouths[this.hover] : null;
      const target = m ? Math.atan2(m.x - hp.x, m.z - hp.z) : Math.PI * 0.86;
      const r = this.hero.group.rotation;
      let d = target - r.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      r.y += d * Math.min(1, dt * 5);
    }
    // the camera drifts a little toward the tunnel being considered
    if (!this.leaving) {
      const m = this.hover >= 0 ? this.mouths[this.hover] : null, H = this.home, b = this.time * 0.15;
      const px = H.pos[0] + (m ? m.x * 0.12 : Math.sin(b) * 0.2), lx = H.look[0] + (m ? m.x * 0.25 : 0);
      this.rig.aim([px, H.pos[1] + Math.sin(b * 0.8) * 0.05, H.pos[2] - (m ? 0.35 : 0)], [lx, H.look[1], H.look[2]], H.fov, 1.8);
    }
    this.rig.update(dt);
    // a warm light leaning into the tunnel you're looking at
    const show = this.leaving ? this.sel : this.hover;
    if (show >= 0) {
      const m = this.mouths[show];
      this.pick.position.set(m.x, Math.min(1.4, m.h * 0.6), m.z + 0.8);
      this.pick.color.set(HOVER_COL[m.type] || '#ffcf8a');
      this.pick.intensity += (3.2 - this.pick.intensity) * Math.min(1, dt * 6);
    } else this.pick.intensity *= Math.max(0, 1 - dt * 6);
    this.hero.update(dt);
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
    let hov = -1;
    if (active) this.choices.forEach((c, i) => {
      const m = this.mouthScreen(i);
      const h = ui.hit('mouth' + i, m.x - m.w / 2, m.y - m.h, m.w, m.h + 30, { sound: false });
      if (h.hover) hov = i;
      if (h.clicked) {
        // touch: the first tap shows what lies down that tunnel, the second takes it
        if (!this.game.input.touch || this.picked === i) this.choose(i);
        else { this.picked = i; this.game.audio.play('ui_pop'); }
      }
    });
    if (active && hov >= 0) this.hover = hov;
    else if (active && this.game.input.touch) this.hover = this.picked ?? -1;
    else if (active && this.game.input.moved) this.hover = -1;
    const show = this.leaving ? this.sel : this.hover;
    if (show >= 0) {
      const m = this.mouthScreen(show), r = Math.round(Math.max(20, m.w * 0.7));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2 + Math.sin(this.time * 4) * 0.05;
      ctx.drawImage(glowCanvas(r, HOVER_COL[this.choices[show].type] || '#ffcf8a'), Math.round(m.x - r), Math.round(m.y - m.h * 0.5 - r));
      ctx.restore();
      if (!this.leaving) this.say(this.describe(show) + (this.game.input.touch && this.picked === show ? ' {dim}(tap it again to go){/}' : ''));
      if (!this.leaving && active && this.game.input.touch && this.picked === show) ui.touchButton('confirm', ui.w - 64, ui.h - 92, 32, { icon: 'arrowR', label: 'GO', style: 'brass', glow: true });
    } else if (!this.leaving && this.narr.t > 6 && active) this.say(this.boss ? 'Only one way remains. Steel yourself.' : (this.game.input.touch ? 'Which way? (tap a tunnel)' : 'Which way? (click a tunnel)'));

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
}
