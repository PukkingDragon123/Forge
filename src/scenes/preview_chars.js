// Preview bench for characters & forged weapons (tools/preview/chars.entry.js).
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig, FlickerLight } from '../gfx/camera.js';
import { buildCharacter } from '../models/characters.js';
import { buildWeaponMesh, crackWeapon } from '../models/weapons3d.js';
import { toon } from '../gfx/materials.js';
import { buildFPArms } from '../models/fp_arms.js';
import { buildPet } from '../models/pet.js';
import { buildMedusa, buildMedusaTotem } from '../models/medusa.js';

export class CharPreview extends Scene {
  enter() {
    const q = new URLSearchParams(location.search);
    this.q = q;
    if (q.get('fp')) return this.enterFP(q);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0a10);
    scene.fog = new THREE.FogExp2(0x0d0a10, 0.05);
    this.rig = new CameraRig(34);
    this.world = { scene, camera: this.rig.camera, post: {} };
    const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 10), toon('#3e322a'));
    floor.position.y = -0.1; floor.receiveShadow = true; scene.add(floor);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 0.5), toon('#2e2622'));
    wall.position.set(0, 3, -3); wall.receiveShadow = true; scene.add(wall);
    const fire = new FlickerLight(0xffa050, 9, 12, { amount: 0.15 });
    fire.position.set(0.5, 1.4, 2.2); fire.castShadow = true; fire.shadow.mapSize.set(1024, 1024);
    scene.add(fire); this.fire = fire;
    scene.add(new THREE.HemisphereLight(0x8a8ab0, 0x2a1a14, 0.55));
    const rim = new THREE.PointLight(0x6a9aff, 4, 8, 1.6); rim.position.set(-2.5, 2.2, -1.5); scene.add(rim);
    const ids = ['bran', 'elio', 'durgan', 'clover'];
    const only = q.get('only');
    this.chars = ids.filter((id) => !only || only.includes(id)).map((id) => {
      const i = ids.indexOf(id);
      const t0 = performance.now();
      const c = buildCharacter(id);
      console.log(`build ${id} ${(performance.now() - t0).toFixed(1)}ms`);
      c.group.position.set(-1.5 + i * 1.0, 0, 0);
      scene.add(c.group);
      if (q.get('seated')) c.setSeated(true, 0.3);
      c.play(q.get('anim') || 'idle', { then: q.get('anim') });
      if (q.get('anim2')) c.loopAnim = q.get('anim2');
      if (q.get('expr')) c.setExpression(q.get('expr'), { hold: 999 });
      if (q.get('rot')) c.group.rotation.y = +q.get('rot');
      if (q.get('carry')) { const pip = buildPet(); pip.play('carried'); pip.group.scale.setScalar(0.8); pip.group.rotation.y = 0; c.carryPoint.add(pip.group); c.pip = pip; }
      return c;
    });
    if (q.get('exprs')) { // expression sheet: one explorer, every face in a row
      this.chars.forEach((c) => c.setVisible(false));
      const id = only || 'bran', EX = ['neutral', 'happy', 'angry', 'surprised', 'sad', 'smug', 'determined', 'hurt', 'sleepy'];
      const ex = EX.map((e, i) => {
        const c = buildCharacter(id);
        c.group.position.set((i - 4) * 0.3, 0, 0);
        scene.add(c.group);
        c.play('idle'); c.setExpression(e, { hold: 999 });
        c.showBackItem(false);
        return c;
      });
      this.chars = ex;
      const h = { bran: 1.53, elio: 1.21, durgan: 0.9, clover: 1.12 }[id];
      this.rig.cut([0, h + 0.03, 4.4], [0, h - 0.02, 0], 34);
    }
    if (q.get('medusa')) { // ?medusa=idle:0,gaze:1.2,attack:0.25 (state:seconds), &stone=0,0.5 &totem=1
      this.chars.forEach((c) => c.setVisible(false));
      const list = q.get('medusa').split(','), st = (q.get('stone') || '0').split(',').map(Number);
      this.meds = list.map((e, i) => {
        const [state, tt] = e.split(':');
        const m = buildMedusa();
        m.group.position.set((i - (list.length - 1) / 2) * 1.9, 0, 0);
        m.group.rotation.y = +(q.get('prot') ?? 0.35);
        scene.add(m.group);
        m.play(state);
        for (let k = 0, n = Math.round(+(tt || 0) * 60); k < n; k++) m.update(1 / 60);
        if (st[i % st.length]) m.setStone(st[i % st.length]);
        if (q.get('cracks')) { m.stoneCracks(); for (let c = 0; c < +q.get('cracks'); c++) m.crackAt(c); for (let k = 0; k < 20; k++) m.update(1 / 60); }
        return m;
      });
      if (q.get('totem')) { const tt = buildMedusaTotem(); tt.position.set(1.2, 0, 0.8); tt.scale.setScalar(+(q.get('tscale') || 1)); scene.add(tt); this.totem = tt; }
      const n = list.length;
      this.rig.cut([0, 1.25, 3.2 + n * 1.3], [0, 1.0, 0], 34);
      if (q.get('cam') === 'face') this.rig.cut([0, 1.8, 1.6], [0, 1.72, 0], 30);
      if (q.get('cam') === 'totem') this.rig.cut([1.2, 0.2, 1.35], [1.2, 0.12, 0.8], 30);
      this.chars = [];
    }
    if (q.get('pet')) { // pet sheet: ?pet=idle,walk,sleep… one Pip per anim
      this.chars.forEach((c) => c.setVisible(false));
      const list = q.get('pet').split(',');
      this.pets = list.map((a, i) => { const p = buildPet(); p.group.position.set((i - (list.length - 1) / 2) * 0.55, 0, 0); p.group.rotation.y = +(q.get('prot') ?? 0.7); p.play(a); scene.add(p.group); return p; });
      this.rig.cut([0, 0.42, 1.2 + list.length * 0.3], [0, 0.16, 0], 34);
      this.chars = [];
    }
    if (q.get('hold')) {
      const bps = ['sword', 'staff', 'axe', 'dagger'];
      this.chars.forEach((c, i) => { c.hold(buildWeaponMesh({ bp: bps[i], ids: ['iron', 'coal', 'ruby'], el: { fire: 2 }, grade: 3 })); c.showBackItem(false); });
    }
    if (q.get('poses')) { // pose sheet: one explorer, frozen at moments of animations (list=anim:seconds,...)
      this.chars.forEach((c) => c.setVisible(false));
      const id = q.get('poses'), list = (q.get('list') || 'idle:0').split(','), n = list.length, sp = +(q.get('sp') || 0.95);
      const BP = { bran: 'hammer', elio: 'staff', durgan: 'axe', clover: 'dagger' };
      this.posed = list.map((e, i) => {
        const [anim, t] = e.split(':');
        const c = buildCharacter(id);
        c.group.position.set((i - (n - 1) / 2) * sp, 0, 0);
        c.group.rotation.y = +(q.get('prot') ?? 0.6);
        scene.add(c.group);
        if (q.get('hold')) { c.hold(buildWeaponMesh({ bp: q.get('bp') || BP[id], ids: ['iron', 'coal', 'ruby'], el: { fire: 3 }, grade: 4 })); c.showBackItem(false); }
        if (q.get('seated')) c.setSeated(true, +q.get('seated'));
        c.play(anim === 'block' || anim === 'idleCombat' ? anim : 'idleCombat');
        for (let k = 0; k < 40; k++) c.update(1 / 60);
        c.play(anim, { then: anim });
        if (q.get('stone')) { const st = q.get('stone').split(',').map(Number); c.setStone(st[i % st.length]); }
        for (let k = 0, m = Math.round(+t * 60); k < m; k++) c.update(1 / 60);
        return c;
      });
      this.chars = [];
    }
    if (q.get('weapons')) {
      this.chars.forEach((c) => c.setVisible(false));
      const list = [
        { bp: 'dagger', ids: ['silver', 'spider_silk', 'spider_silk'], el: { holy: 2 }, grade: 2 },
        { bp: 'sword', ids: ['iron', 'coal', 'ruby', 'bat_fang'], el: { fire: 2 }, grade: 4 },
        { bp: 'axe', ids: ['junk', 'junk', 'junk', 'junk'], el: { bleed: 1 }, grade: 1 },
        { bp: 'hammer', ids: ['golem_core', 'iron', 'iron', 'coal'], el: {}, grade: 3 },
        { bp: 'spear', ids: ['storm', 'copper', 'copper', 'topaz'], el: { shock: 4 }, grade: 2 },
        { bp: 'staff', ids: ['ember', 'rime', 'storm', 'quartz'], el: { fire: 6, ice: 6, shock: 6 }, grade: 2 },
        { bp: 'sword', ids: ['amethyst', 'quartz', 'rime'], el: { ice: 2 }, grade: 2 },
        { bp: 'pickaxe', ids: ['iron', 'lodestone'], el: {}, grade: 2 },
        { bp: 'sword', ids: ['cursedore', 'skull'], el: { curse: 2 }, grade: 2, crack: 0.8 },
      ];
      this.weapons = list.map((w, i) => {
        const m = buildWeaponMesh(w);
        m.position.set(-2.6 + i * 0.65, 0.45, 0.5);
        if (w.crack) crackWeapon(m, w.crack);
        scene.add(m);
        return m;
      });
    }
    const cam = q.get('cam') || (q.get('exprs') ? 'none' : 'wide');
    const [cid, cmode] = cam.split('_');
    const idx = ids.indexOf(cid);
    const HEAD = { bran: 1.53, elio: 1.21, durgan: 0.9, clover: 1.12 };
    if (idx >= 0 && cmode === 'body') { const x = -1.5 + idx * 1.0; const h = HEAD[cid] * 0.55; this.rig.cut([x + 0.4, h + 0.25, 2.6], [x, h, 0], 34); }
    else if (idx >= 0) { const ch = this.chars.find((c) => c.id === cid) || this.chars[0]; const hp = ch.headPos(); const h = hp.y - (ch.headTop || 0.3) * 0.55; const x = ch.group.position.x; this.rig.cut([x + 0.25, h + 0.12, 1.9], [x, h - 0.02, 0], 28); }
    else if (cam === 'faces') this.rig.cut([0, 0.72, 3.0], [0, 0.62, 0], 34);
    else if (q.get('weapons') && q.get('wcam')) { const x = -2.6 + +q.get('wcam') * 0.65; this.rig.cut([x, 0.75, 1.5], [x, 0.72, 0], 34); }
    else if (q.get('weapons')) this.rig.cut([0, 0.75, 3.4], [0, 0.72, 0], 40);
    else if (q.get('poses')) { const n = this.posed.length, sp = +(q.get('sp') || 0.95); this.rig.cut([0, 0.62, 1.0 + n * sp * 1.0], [0, 0.42, 0], 34); }
    else if (cam === 'wide' && !this.pets && !this.meds) this.rig.cut([0, 0.85, 4.8], [0, 0.55, 0], 34);
    this.ff = +(q.get('t') || 0);
  }
  /** First-person arms bench: ?fp=bran&hold=weapon&anim=swing&t=0.2&freeze=1 */
  enterFP(q) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0a10);
    scene.fog = new THREE.FogExp2(0x0d0a10, 0.12);
    const cam = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 60);
    cam.position.set(0, 0.95, 0);
    scene.add(cam);
    this.world = { scene, camera: cam, post: {} };
    this.fpCam = cam;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 14), toon('#4a3a30'));
    floor.position.set(0, -0.1, -5); scene.add(floor);
    for (const x of [-1.6, 1.6]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 14), toon('#3a2e28')); w.position.set(x, 2, -5); scene.add(w); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.4), toon('#33282a')); back.position.set(0, 2, -9); scene.add(back);
    scene.add(new THREE.HemisphereLight(0x9a8ab0, 0x2a1a14, 0.7));
    const key = new FlickerLight(0xffa050, 5, 8, { amount: 0.12 }); key.position.set(0.6, 1.4, -0.6); scene.add(key); this.fire = key;
    const rim = new THREE.PointLight(0x6a9aff, 3, 8, 1.6); rim.position.set(-1.2, 1.6, -3); scene.add(rim);
    const arms = buildFPArms(q.get('fp'));
    cam.add(arms.group);
    const kind = q.get('hold') || 'weapon';
    if (kind === 'weapon') arms.hold('weapon', buildWeaponMesh({ bp: q.get('bp') || 'sword', ids: ['iron', 'coal', 'ruby'], el: { fire: 2 }, grade: 3 }));
    else arms.hold(kind);
    if (kind === 'map') { const c = document.createElement('canvas'); c.width = 128; c.height = 80; const x = c.getContext('2d'); x.fillStyle = '#e8d8b0'; x.fillRect(0, 0, 128, 80); x.strokeStyle = '#5a3a20'; x.lineWidth = 2; x.beginPath(); x.moveTo(20, 70); x.lineTo(60, 40); x.lineTo(100, 12); x.moveTo(60, 40); x.lineTo(30, 14); x.stroke(); for (const [a, b] of [[20, 70], [60, 40], [100, 12], [30, 14]]) { x.fillStyle = '#8a2a1a'; x.fillRect(a - 4, b - 4, 8, 8); } const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; arms.setMapTexture(t); }
    const anim = q.get('anim') || 'idle';
    arms.play(anim, { then: q.get('then') || undefined });
    this.arms = arms;
    this.speed = +(q.get('speed') || 0);
    const ff = +(q.get('t') || 0);
    for (let i = 0, n = Math.round(ff / 0.016); i < n; i++) arms.update(0.016, { speed: this.speed });
    this.chars = [];
  }
  update(dt) {
    if (this.arms) {
      if (!this.q.get('freeze')) this.arms.update(dt, { speed: this.speed });
      if (this.q.get('turn')) this.fpCam.rotation.y = Math.sin(this.time * 2) * 0.4;
      this.fire.tick(this.time);
      return;
    }
    if (this.meds) { if (!this.q.get('freeze')) this.meds.forEach((m) => m.update(dt)); this.fire.tick(this.time); this.rig.update(dt); return; }
    if (this.pets) { if (!this.q.get('freeze')) this.pets.forEach((p) => p.update(dt)); this.rig.update(dt); return; }
    if (this.ff > 0) { const n = Math.ceil(this.ff / 0.016); for (let i = 0; i < n; i++) this.chars.forEach((c) => c.update(0.016)); this.ff = 0; }
    this.fire.tick(this.time);
    if (this.q.get('walk')) this.chars.forEach((c, i) => { c.group.position.x += dt * 0.8; if (c.group.position.x > 3) c.group.position.x -= 5.6; });
    if (!this.q.get('freeze')) this.chars.forEach((c) => { c.update(dt); if (c.pip) c.pip.update(dt); });
    if (this.weapons) this.weapons.forEach((w, i) => { w.rotation.y = this.q.get('spin') === '0' ? 0.45 : this.time * 0.6 + i; });
    this.rig.update(dt);
  }
  draw(ui) {
    if (this.arms) { ui.text(`fp=${this.q.get('fp')} anim=${this.q.get('anim') || 'idle'}`, 6, 6, { font: 'small', color: '#9d8f7d' }); return; }
    ui.text(`anim=${this.q.get('anim') || 'idle'}  fps ${this.game.fps.toFixed(0)}`, 6, 6, { font: 'small', color: '#9d8f7d' });
  }
}
