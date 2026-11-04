// Dev arena for tuning combat feel (agent P):
//   ?scene=arena&char=durgan&enemies=shroomling,sporegoblin&room=0[&weapon=axe][&skills=whirlwind,frost_nova][&n=2][&dummy=1]
// Builds a room (C's buildRoom), the player (P's engine), spawns foes with N's spawnEnemy when its
// brains exist (else stand-in bots that drive real monster models), Pip follows, waves respawn.
import { Scene } from '../core/game.js';
import { ActionWorld, Player, PetFollower } from '../action/index.js';
import { Dummy, Bot } from '../action/testbots.js';
import * as Rooms from '../models/room_vox.js';
import * as Enemies from '../action/enemies/index.js';
import * as Loadout from '../systems/loadout.js';
import * as Pets from '../models/pet.js';
import * as RunMod from '../systems/run.js';
import { drawText } from '../ui/font.js';

const TAU = Math.PI * 2;

export class ArenaScene extends Scene {
  enter(p = {}) {
    const game = this.game;
    this.p = p;
    this.char = p.char || 'durgan';
    if (!game.run && RunMod.Run) { try { game.run = new RunMod.Run(this.char, p.seed || 'arena'); } catch (e) { game.run = null; } }
    const run = game.run;
    const lo = typeof Loadout.computeLoadout === 'function' ? Loadout.computeLoadout(run) : { weapon: null, skills: [null, null], stats: {} };
    const loadout = { ...lo, stats: { ...(lo.stats || {}) } };
    if (p.weapon || !loadout.weapon) loadout.weapon = { bp: p.weapon || 'axe', name: 'Test ' + (p.weapon || 'axe'), dmg: +(p.dmg || 12), ids: ['iron', 'iron'], grade: 2, element: p.element || null };
    if (p.skills) loadout.skills = String(p.skills).split(',').concat([null, null]).slice(0, 2).map((s) => s || null);
    else if (!loadout.skills || !loadout.skills.some(Boolean)) loadout.skills = ['whirlwind', 'chain_spark'];
    // room
    let room = null;
    try { room = Rooms.buildRoom(+(p.room || 0), { id: 0, type: 'fight', seed: 7 }, { seed: +(p.seed2 || 7), type: 'fight', doors: { n: 'locked', s: 'locked', e: false, w: false }, size: p.size || 'normal' }); } catch (e) { console.error(e); }
    const world = new ActionWorld(game, { room });
    this.aw = world;
    const P = new Player(world, this.char, loadout, { hp: 999, maxHp: 999 });
    P.x = 0; P.z = (room && room.bounds ? room.bounds.z1 : 4) - 1.6;
    world.cam.follow(P, true);
    try { if (typeof Pets.buildPet === 'function') { const pet = new PetFollower(world, Pets.buildPet()); world.add(pet); } } catch (e) { /* no pet */ }
    this.wave = 0;
    this.spawnWave();
    world.on('roomCleared', () => { this.cleared = 1.6; });
    this.world = { scene: world.scene, camera: world.cam.camera, post: { bloom: 0.8, threshold: 0.8, vignette: 0.32, outline: 0.55, edge: 0.3, saturation: 1.12 } };
    game.audio && game.audio.music && game.audio.music('combat');
  }
  spawnWave() {
    const w = this.aw, p = this.p;
    const ids = String(p.enemies || 'shroomling,sporegoblin').split(',').filter(Boolean);
    const n = +(p.n || 1);
    const spots = (w.room && w.room.spawns && w.room.spawns.length ? w.room.spawns : [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 0, z: -3 }, { x: -2, z: 1 }, { x: 2, z: 1 }]);
    const brains = Enemies.BRAINS && Object.keys(Enemies.BRAINS).length > 0;
    let k = this.wave * 3;
    if (p.dummy) for (let i = 0; i < +p.dummy; i++) { const s = spots[k++ % spots.length]; w.add(new Dummy(s.x, s.z)); }
    for (const id of ids) for (let i = 0; i < n; i++) {
      const s = spots[k++ % spots.length];
      let e = null;
      if (brains) { try { e = Enemies.spawnEnemy(w, id, s.x, s.z, {}); } catch (err) { console.error(err); e = null; } }
      if (!e || !e.model) { if (e) w.remove(e); e = w.add(new Bot(id, s.x, s.z)); }
    }
    this.wave++;
  }
  exit() { if (this.aw) this.aw.dispose(); }
  update(dt) {
    this.aw.update(dt);
    if (this.cleared > 0) { this.cleared -= dt; if (this.cleared <= 0) this.spawnWave(); }
  }
  draw(ui) {
    const w = this.aw, P = w.player;
    w.drawUI(ui);
    if (!P) return;
    // a compact debug HUD (the real HUD is agent U's)
    const x = 12, y = ui.h - 28;
    ui.rect(x, y, 104, 8, '#140c10', 0.8);
    ui.rect(x + 1, y + 1, Math.round(102 * Math.max(0, P.hp) / P.maxHp), 6, '#e8483a');
    drawText(ui.ctx, `${Math.ceil(P.hp)}`, x + 108, y - 2, { color: '#ffd8c8', outline: '#140c10' });
    for (let i = 0; i < P.dashMax; i++) ui.rect(x + i * 10, y - 8, 8, 4, i < P.dashCharges ? '#ffe8a0' : '#3a3038');
    if (!ui.touch) {
      const sk = P.skills.map((id, i) => `${['Q', 'E'][i]} ${id || '-'}${P.skillCd[i] > 0 ? ' ' + P.skillCd[i].toFixed(1) : ''}`).join('   ');
      drawText(ui.ctx, `WASD move · LMB/J attack · RMB/K special${P.specialCd > 0 ? ' ' + P.specialCd.toFixed(1) : ''} · SPACE dash · ${sk}`, ui.w / 2, ui.h - 14, { align: 'center', color: '#e8d8c0', outline: '#140c10', font: 'small' });
    }
    drawText(ui.ctx, `wave ${this.wave} · kills ${w.stats.kills} · ${Math.round(this.game.fps)} fps`, ui.w - 10, ui.h - 14, { align: 'right', color: '#a89878', outline: '#140c10', font: 'small' });
    void TAU;
  }
}
