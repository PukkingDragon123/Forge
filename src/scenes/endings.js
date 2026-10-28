// Descent between layers, game over, and the ending.
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { buildSet } from '../models/environments.js';
import { buildProp } from '../models/props.js';
import { buildCharacter } from '../models/characters.js';
import { VoxelGrid, meshVoxels, GLOW } from '../gfx/voxel.js';
import { CameraRig, FlickerLight } from '../gfx/camera.js';
import { ParticleSystem } from '../gfx/particles.js';
import { makeWorld, ribbonTitle, speech, dim } from './common.js';
import { REGIONS } from '../data/regions.js';
import { CHARACTERS, CHARACTER_ORDER } from '../data/characters.js';
import { MATERIALS } from '../data/materials.js';
import { save } from '../core/save.js';
import { checkUnlocks } from '../systems/unlocks.js';
import { COLORS } from '../ui/font.js';
import { hash3, fbm3, clamp, ease } from '../core/math.js';
import { logo } from '../art/sprites.js';

// ============================================================================ DESCEND
export class DescendScene extends Scene {
  enter(p) {
    const run = this.game.run;
    this.from = REGIONS[run.region];
    run.nextRegion();
    this.to = REGIONS[run.region];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(this.to.pal.sky);
    scene.fog = new THREE.FogExp2(new THREE.Color(this.to.pal.fog), 0.08);
    // shaft: rings of voxels blending from one palette to the next
    const H = 120, R = 9;
    const g = new VoxelGrid(R * 2 + 2, H, R * 2 + 2);
    for (let y = 0; y < H; y++) {
      const t = y / H; // 0 bottom (new region) → 1 top (old region)
      const pal = t > 0.5 ? this.from.pal : this.to.pal;
      for (let z = 0; z < R * 2 + 2; z++) for (let x = 0; x < R * 2 + 2; x++) {
        const dx = x - R - 0.5, dz = z - R - 0.5, d = Math.hypot(dx, dz);
        const wall = R - 1 + fbm3(x * 0.2, y * 0.1, z * 0.2, 2, 4) * 2.5;
        if (d < wall - 2 || d > wall + 1 || dz > 2) continue;
        let col = pal.rock[1 + Math.floor(fbm3(x * 0.15, y * 0.2, z * 0.15, 2, 9) * 3.99)];
        if (hash3(x, y, z, 3) > 0.985) { g.set(x, y, z, pal.accent[hash3(x, y, z, 5) > 0.5 ? 0 : 1], GLOW); continue; }
        g.set(x, y, z, col);
      }
    }
    const mesh = meshVoxels(g, { size: 0.25, origin: [R + 1, H, R + 1], castShadow: false, receiveShadow: false });
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight(0x8080a0, 0x201810, 0.5));
    this.lamp = new FlickerLight(0xffc070, 3, 6, { amount: 0.2 });
    scene.add(this.lamp);
    this.lift = buildProp('elevator');
    scene.add(this.lift);
    this.hero = buildCharacter(run.char);
    this.lift.add(this.hero.group);
    this.hero.group.position.set(0, 0.15, 0);
    this.hero.play('idle', { loop: true });
    this.rig = new CameraRig(40);
    this.fx = new ParticleSystem(600);
    scene.add(this.fx.object);
    this.world = { scene, camera: this.rig.camera, post: { bloom: 0.9, vignette: 0.5 } };
    this.y = -2;
    this.game.audio.play('elevator');
    this.game.audio.music(this.to.music);
    this.healed = true;
  }
  update(dt) {
    this.y -= dt * 3.2;
    this.lift.position.set(0, this.y, 0);
    this.lamp.home = new THREE.Vector3(0.8, this.y + 2, 0.8);
    this.lamp.tick(this.time);
    this.hero.update(dt);
    const sway = Math.sin(this.time * 0.7) * 0.6;
    this.rig.aim([sway + 2.2, this.y + 1.8, 5.5], [0, this.y + 0.8, 0], 40, 8);
    this.rig.update(dt);
    if (Math.random() < 0.5) this.fx.emit({ pos: [0, this.y + 3, 0], posSpread: [3, 1, 2], vel: [0, 2.4, 0], spread: 0.3, life: [1, 2], size: 1, color: '#c8b8a0', alpha: 0.6 });
    this.fx.update(dt);
    if (this.time > 6.5 && !this.done) {
      this.done = true;
      this.game.go('map', { newRegion: true }, { transition: 'dither' });
    }
    if (this.time > 1.2 && this.game.input.pressed && !this.done) { this.done = true; this.game.go('map', { newRegion: true }, { transition: 'dither' }); }
  }
  draw(ui) {
    const k = this.time;
    const a = clamp(k < 1 ? k : k > 5.5 ? 1 - (k - 5.5) : 1, 0, 1);
    ribbonTitle(ui, 'Descending…', ui.w / 2, 40, 'brown', a);
    ui.ctx.globalAlpha = a;
    ui.text(`Deeper into {gold}${this.to.name}{/}`, ui.w / 2, 62, { align: 'center', outline: '#140c10', thick: true });
    ui.text('{heal}You catch your breath: half your wounds heal.{/}', ui.w / 2, ui.h - 30, { align: 'center', outline: '#140c10', thick: true });
    ui.ctx.globalAlpha = 1;
  }
}

// ============================================================================ GAME OVER
export class GameOverScene extends Scene {
  enter(p) {
    const run = this.game.run;
    this.run = run;
    const set = buildSet('arena', run ? run.region : 0);
    this.set = set;
    this.w = makeWorld(set, { fogDensity: 0.09 });
    this.world = this.w;
    this.w.post = { saturation: 0.55, vignette: 0.7, exposure: 0.8 };
    this.hero = buildCharacter(run ? run.char : 'bran');
    this.hero.group.position.copy(set.anchors.player || new THREE.Vector3());
    this.w.scene.add(this.hero.group);
    this.hero.play('defeat');
    this.hero.setExpression('hurt');
    const a = this.hero.group.position;
    this.w.rig.cut([a.x + 1.2, 1.1, a.z + 2.4], [a.x, 0.5, a.z], 38);
    this.w.rig.moveTo([a.x + 2.5, 3.2, a.z + 6], [a.x, 0.4, a.z], 44, 6, 'inOutSine');
    this.game.audio.play('defeat_sting');
    this.game.audio.music('defeat');
    this.unlocked = checkUnlocks();
    this.cause = p.cause || '';
  }
  update(dt) {
    this.w.rig.update(dt); this.w.dust.update(dt); this.w.sparks.update(dt);
    this.hero.update(dt);
    const a = this.hero.group.position;
    if (Math.random() < 0.6) this.w.sparks.emit({ pos: [a.x, 0.3, a.z], posSpread: [0.6, 0.2, 0.4], vel: [0, 0.6, 0], spread: 0.2, life: [1, 2], size: 1, color: ['#c86bff', '#ff5af0'], glow: 3 });
  }
  draw(ui) {
    const k = this.time;
    dim(ui, clamp((k - 1.5) * 0.4, 0, 0.45));
    if (k > 1) ribbonTitle(ui, 'The curse takes hold…', ui.w / 2, 26, 'purple', clamp(k - 1, 0, 1));
    if (k < 2.5) return;
    const run = this.run;
    const W = 260, H = 196, x = ui.w / 2 - W / 2, y = 52;
    ui.panel('parchment', x, y, W, H, { seed: 9 });
    const ink = '#3a2618';
    ui.text('…and drags you back to the campfire.', ui.w / 2, y + 10, { align: 'center', color: ink });
    const st = run ? run.stats : {};
    const lines = [
      ['Reached', run ? REGIONS[run.region].name : '-'],
      ['Floors explored', st.floors || 0], ['Monsters slain', st.kills || 0], ['Weapons shattered', st.shattered || 0],
      ['Masterworks', st.masterworks || 0], ['Ores mined', st.mined || 0], ['Coins earned', st.coins || 0],
    ];
    lines.forEach(([a, b], i) => {
      ui.text(a, x + 18, y + 30 + i * 13, { color: ink });
      ui.text(String(b), x + W - 18, y + 30 + i * 13, { align: 'right', color: '#7a2a1a' });
    });
    if (this.unlocked.length) {
      ui.text('{#a05a00}New ores unlocked:{/} ' + this.unlocked.map((id) => MATERIALS[id].name).join(', '), x + 18, y + 128, { color: ink, maxW: W - 36 });
    }
    ui.text('{dim}No upgrades carry over — only what you discovered.{/}', ui.w / 2, y + H - 34, { align: 'center', font: 'small' });
    if (ui.button('go-camp', ui.w / 2 - 60, y + H - 24, 120, 20, 'Back to camp', { style: 'gold', icon: 'campfire' }) || (k > 4 && this.game.input.actionPressed('confirm'))) {
      this.game.run = null;
      this.game.go('title', {}, { transition: 'fade' });
    }
  }
}

// ============================================================================ VICTORY / ENDING
const ENDING = [
  ['', 'The Cursed Lord\'s crown cracks in two. The tomb falls silent.'],
  ['', 'Far above, at a little campfire, three statues of cursed stone begin to crack…'],
  ['bran', 'Oi… did someone turn the sun on down here?'],
  ['clover', 'My ears! I can feel my ears again!'],
  ['durgan', 'Not a scratch on the beard. HAH!'],
  ['elio', 'Kindle, look — the runes are fading! It\'s over!'],
  ['', 'Every weapon you forged is gone. The friends you forged them for are not.'],
];

export class VictoryScene extends Scene {
  enter() {
    const run = this.game.run;
    this.run = run;
    const set = buildSet('campfire', 0, { morning: true });
    this.set = set;
    this.w = makeWorld(set, { fogDensity: 0.02 });
    this.world = this.w;
    this.w.post = { exposure: 1.15, saturation: 1.2, bloom: 1.1 };
    this.chars = CHARACTER_ORDER.map((id, i) => {
      const c = buildCharacter(id);
      const st = set.anchors.seats && set.anchors.seats[i];
      if (st) { c.group.position.copy(st.pos).y -= st.height; c.group.rotation.y = st.rotY; }
      else c.group.position.set((i - 1.5) * 1.2, 0, 0);
      this.w.scene.add(c.group);
      c.play('cheer', { loop: true });
      c.setExpression('happy');
      return c;
    });
    this.w.rig.cut([0, 2.4, 6.5], [0, 0.8, 0], 40);
    this.line = 0; this.lineT = 0;
    this.game.audio.play('victory_sting');
    this.game.audio.music('ending');
    save.learn('unlocks.story', 'ending');
    this.unlocked = checkUnlocks();
  }
  update(dt) {
    this.w.rig.aim([Math.sin(this.time * 0.15) * 3, 2.2, 6.2], [0, 0.8, 0]);
    this.w.rig.update(dt); this.w.sparks.update(dt); this.w.dust.update(dt);
    this.set.update && this.set.update(dt, this.time);
    for (const c of this.chars) c.update(dt);
    this.lineT += dt;
    if ((this.lineT > 3.6 || (this.game.input.pressed && this.lineT > 0.4)) && this.line < ENDING.length) { this.line++; this.lineT = 0; }
    if (Math.random() < 0.2) this.w.sparks.emit({ pos: [0, 2.5, 0], posSpread: [3, 0.5, 2], vel: [0, -0.4, 0], spread: 0.3, life: [1.5, 3], size: 1, color: ['#ffe08a', '#ff8ab0', '#7fe3ff'], glow: 2 });
  }
  draw(ui) {
    if (this.line < ENDING.length) {
      const [who, text] = ENDING[this.line];
      if (who) {
        const c = this.chars[CHARACTER_ORDER.indexOf(who)];
        const p = this.w.rig.project(c.headPos(), ui.w, ui.h);
        speech(ui, p.x, p.y, text, { maxW: 150 });
      } else {
        ui.panel('dark', ui.w / 2 - 170, ui.h - 56, 340, 40);
        ui.text(text, ui.w / 2, ui.h - 48, { align: 'center', maxW: 320 });
      }
      return;
    }
    const lg = logo(1);
    ui.img(lg, Math.round(ui.w / 2 - lg.width / 2), 30);
    ribbonTitle(ui, 'THE CURSE IS BROKEN', ui.w / 2, 96, 'gold');
    const run = this.run;
    ui.text(`${run ? CHARACTERS[run.char].name : 'You'} saved the squad. Wins: {gold}${save.data.stats.wins}{/}`, ui.w / 2, 120, { align: 'center', outline: '#140c10', thick: true });
    if (this.unlocked.length) ui.text('{gold}Unlocked:{/} ' + this.unlocked.map((id) => MATERIALS[id].name).join(', '), ui.w / 2, 134, { align: 'center', outline: '#140c10', thick: true });
    ui.text('{dim}A game about breaking things and making them again.{/}', ui.w / 2, ui.h - 52, { align: 'center' });
    if (ui.button('v-camp', ui.w / 2 - 60, ui.h - 36, 120, 20, 'Back to camp', { style: 'gold', icon: 'campfire' })) { this.game.run = null; this.game.go('title', {}, { transition: 'fade' }); }
  }
}
