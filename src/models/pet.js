// Pip, the crew's pet mole-dog: a plump chibi pup with a mole's long pink nose and big digging
// claws, a dog's floppy ears and wagging tail, velvety slate fur with a cream belly, and a red
// bandana with a little gold tag. Voxels on the crew grid (0.016 m); about 0.36 m nose to tail.
// Faces +Z. Procedural animation with springs for the ears and tail.
//   const pip = buildPet(); scene.add(pip.group); pip.play('walk'); pip.update(dt); pip.lookAt(v3 | null)
// anims: idle | sleep | walk | run | sniff | bark | dig | yelp | carried | happy | lick
import * as THREE from 'three';
import { VPart, VOX_CHIBI, voxToon, voxGlow, hash } from './vox_char_kit.js';

const VS = VOX_CHIBI;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const C = {
  fur: ['#3a2e30', '#54444a', '#6e5a5e', '#8a7276', '#a88e90'], belly: ['#c8b090', '#e0cca8', '#f4e6c8'],
  pink: ['#b85a6a', '#e07a8a', '#ff9eac', '#ffd0d6'], claw: ['#c8c0b0', '#f0eadc'], ear: ['#6a4a3c', '#8a6450', '#a87e62'],
  bandana: ['#7a1414', '#b42a22', '#e04a36'], gold: ['#b8841e', '#f0c03a', '#fff0a0'], eye: '#0a0608',
};
const velvet = (x, y, z) => C.fur[2 + (hash(x, y >> 1, z, 3) > 0.8 ? 1 : 0) - (hash(x >> 1, y, z >> 1, 4) > 0.86 ? 1 : 0)];

const GEO = new Map();
function geo(key, paint) {
  let g = GEO.get(key);
  if (!g) { const P = new VPart(); paint(P); g = P.geometry(VS, [0, 0, 0], { glowIntensity: 1.6 }); GEO.set(key, g); }
  return g;
}

const PARTS = {
  body(P) {
    // a plump bean, cream underneath, the bandana knotted at the throat
    P.ell(0, 0, 0, 6.6, 6, 9, (x, y, z) => (y < -2.5 && Math.abs(x + 0.5) < 4.5 ? C.belly[hash(x, y, z, 2) > 0.8 ? 1 : 2] : velvet(x, y, z)));
    P.loft(1, 5, (y) => [6.2 - (y - 1) * 0.2, 4.6], (x, y) => C.bandana[y === 4 ? 2 : 1], { shell: 1.4 });
    P.paint((x, y, z) => (z > 5 && y > -1 && y < 6 && P.surface(x, y, z) && Math.abs(x + 0.5) < 5.5 ? C.bandana[(x + y) % 3 ? 1 : 2] : undefined));
    P.cap([0, 1, 8.6], [0, -3, 9.8], 2.4, 0.8, C.bandana[1]); // the bandana's point
    P.ell(0, -1.5, 10, 1.2, 1.2, 0.8, C.gold[1]); P.set(0, -1, 11, C.gold[2]); // the tag
  },
  head(P) {
    P.ell(0, 2.5, 1.5, 6.4, 6, 6.2, velvet);
    P.ell(0, 0.5, 4.5, 4.6, 3.6, 3.6, (x, y, z) => (y < 0 ? C.belly[2] : velvet(x, y, z))); // muzzle
    // the long pink mole snout, wrinkled, with a big round button tip
    P.cap([0, 1, 6.5], [0, 0, 11], 2.6, 1.8, (x, y, z) => C.pink[(z + 40) % 2 ? 1 : 2]);
    P.ell(0, 0.2, 11.8, 2.3, 2, 1.8, (x, y) => C.pink[y > 0.5 ? 3 : 2]);
    P.set(-1, 0, 13, C.pink[0]); P.set(0, 0, 13, C.pink[0]); // nostrils
    // little beady eyes with a glint, set back on the round face
    for (const sx of [-1, 1]) {
      const x = sx < 0 ? -4 : 3;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) P.set(x + dx, 3 + dy, 6, C.eye);
      P.set(x + (sx < 0 ? 0 : 1), 4, 7, '#ffffff');
    }
    for (const sx of [-1, 1]) for (const [y, z] of [[1, 9], [0, 10]]) P.set(sx < 0 ? -3 : 2, y, z, C.fur[0]); // whisker dots
  },
  tongue(P) { P.cap([0, 0, 0], [0, -2, 1.5], 1.2, 1, C.pink[2]); },
  ear(P) { P.ell(0, -3.4, 0, 1.6, 4.6, 3, (x, y) => C.ear[y > -2 ? 2 : y > -5 ? 1 : 0]); },
  tail(P) { P.cap([0, 0, 0], [0, 1.5, -5.5], 1.6, 1, velvet); P.ell(0, 1.8, -6, 1.4, 1.4, 1.4, C.fur[3]); },
  frontLeg(P) {
    P.cap([0, 0, 0], [0, -4, 0.5], 2.4, 2.2, velvet);
    // a big digging paw: a pink pad fringed with pale claws
    P.ell(0, -5, 1.5, 3, 1.6, 3, (x, y) => (y < -5 ? C.pink[1] : C.pink[2]));
    for (let i = 0; i < 4; i++) P.cap([-1.8 + i * 1.2, -5.2, 4], [-1.8 + i * 1.25, -6, 5.6], 0.6, 0.4, C.claw[i & 1]);
  },
  backLeg(P) { P.ell(0, -1, 0, 2.8, 3.4, 3, velvet); P.ell(0, -4, 1.5, 2.2, 1.4, 2.8, C.pink[1]); },
};

export class Pet {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'pip';
    this.mat = voxToon();
    this.glowMat = voxGlow();
    this.t = Math.random() * 10;
    this.anim = 'idle'; this.animT = 0;
    this.look = null; this.lookYaw = 0; this.lookPitch = 0;
    const J = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x * VS, y * VS, z * VS); parent.add(g); return g; };
    const add = (joint, key) => {
      const g = geo(key, PARTS[key]);
      if (g.solid) { const m = new THREE.Mesh(g.solid, this.mat); m.castShadow = true; joint.add(m); }
      return joint;
    };
    const R = (this.rig = {});
    R.root = J(this.group, 0, 0, 0);
    R.body = add(J(R.root, 0, 9, 0), 'body');
    R.head = add(J(R.body, 0, 3, 8), 'head');
    R.tongue = add(J(R.head, 0, -0.5, 11), 'tongue'); R.tongue.visible = false;
    R.earL = add(J(R.head, 5.6, 5.5, 0.5), 'ear'); R.earR = add(J(R.head, -5.6, 5.5, 0.5), 'ear');
    R.tail = add(J(R.body, 0, 2, -8.5), 'tail');
    R.fl = add(J(R.body, 3.4, -4, 5), 'frontLeg'); R.fr = add(J(R.body, -3.4, -4, 5), 'frontLeg');
    R.bl = add(J(R.body, 3.6, -3.5, -5.5), 'backLeg'); R.br = add(J(R.body, -3.6, -3.5, -5.5), 'backLeg');
    // springs for ears & tail
    this.sp = { earL: 0, earLv: 0, earR: 0, earRv: 0, tail: 0, tailv: 0 };
    this._prev = new THREE.Vector3(); this._vel = new THREE.Vector3(); this._first = true;
  }
  play(name) { if (name !== this.anim) { this.anim = name; this.animT = 0; } }
  lookAt(v) { this.look = v ? v.clone() : null; }
  /** Face a direction (atan2(dx, dz), 0 = +Z); turns quickly but smoothly unless instant. */
  setFacing(a, instant = false) {
    this.facingTarget = a;
    if (instant || this.facing === undefined) { this.facing = a; this.group.rotation.y = a; }
  }
  /**
   * Trot after a point on the floor (call every frame instead of update): walks when close, runs to
   * catch up, sits when there. o: { stop (m, 0.4), runAt (m, 1.3), walk (m/s, 2.4), run (m/s, 6.5),
   * idle ('idle' | 'sniff' | …), collide(x, z) → [x, z] (optional, keeps Pip out of walls) }.
   */
  follow(x, z, dt, o = {}) {
    const g = this.group.position, dx = x - g.x, dz = z - g.z, d = Math.hypot(dx, dz);
    const stop = o.stop ?? 0.4, runAt = o.runAt ?? 1.3;
    if (d > stop) {
      const fast = d > runAt, sp = fast ? (o.run ?? 6.5) : (o.walk ?? 2.4);
      const step = Math.min(d - stop * 0.7, sp * dt);
      let nx = g.x + (dx / d) * step, nz = g.z + (dz / d) * step;
      if (o.collide) [nx, nz] = o.collide(nx, nz);
      g.x = nx; g.z = nz;
      this.setFacing(Math.atan2(dx, dz));
      const want = fast ? 'run' : 'walk';
      if (this.anim !== want && !['bark', 'yelp'].includes(this.anim)) this.play(want);
    } else if (this.anim === 'run' || this.anim === 'walk') this.play(o.idle || 'idle');
    this.update(dt);
  }

  update(dt) {
    dt = Math.min(dt || 0, 0.1);
    this.t += dt; this.animT += dt;
    if (this.facingTarget !== undefined) {
      let d = this.facingTarget - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-14 * dt));
      this.group.rotation.y = this.facing;
    }
    const t = this.t, a = this.anim, R = this.rig;
    // pose targets
    let bodyY = 9 * VS, bodyX = 0, bodyZ = 0, head = [0, 0, 0], legs = [0, 0, 0, 0], wag = 6, wagAmp = 0.35, earUp = 0, tongue = false, squash = 0, rootY = 0;
    if (a === 'idle') {
      // sitting up a little, nose twitching, an occasional look round
      bodyX = -0.32; legs = [0.3, 0.3, -0.9, -0.9]; bodyY = 9.5 * VS;
      head = [0.25 + Math.sin(t * 0.7) * 0.06, Math.sin(t * 0.45) * 0.35, Math.sin(t * 0.6) * 0.1];
      wag = 5; wagAmp = 0.3;
    } else if (a === 'sleep') {
      // curled up, nose tucked, breathing slowly
      const br = Math.sin(t * 1.4);
      bodyY = 5.2 * VS + br * 0.002; bodyX = 0.05; legs = [-1.2, -1.2, 1.2, 1.2];
      head = [0.55, 0.6, 0.35]; wag = 0; wagAmp = 0.05; earUp = -0.4; squash = br * 0.03;
    } else if (a === 'walk' || a === 'run') {
      const run = a === 'run', f = run ? 13 : 8, s = Math.sin(t * f), c = Math.cos(t * f);
      legs = run ? [s * 1.1, s * 1.1, -s * 1.1, -s * 1.1] : [s * 0.7, -s * 0.7, -s * 0.7, s * 0.7];
      bodyY = 9 * VS + Math.abs(c) * (run ? 0.03 : 0.012); bodyX = run ? s * 0.12 : 0.02;
      head = [run ? -0.1 + c * 0.08 : 0.08 + Math.abs(s) * 0.05, Math.sin(t * 1.3) * 0.15, 0];
      wag = run ? 10 : 9; wagAmp = run ? 0.25 : 0.45; earUp = run ? -0.6 : 0;
    } else if (a === 'sniff') {
      // nose to the ground, snuffling side to side
      bodyX = 0.35; bodyY = 8 * VS; legs = [-0.3, -0.3, 0.2, 0.2];
      head = [0.75, Math.sin(t * 3.1) * 0.35, 0]; wag = 7; wagAmp = 0.3;
      head[0] += Math.sin(t * 24) * 0.04;
    } else if (a === 'bark') {
      const k = (this.animT * 3) % 1, pop = Math.max(0, Math.sin(k * Math.PI)) ** 2;
      bodyX = -0.3 - pop * 0.15; legs = [0.4, 0.4, -0.9, -0.9]; bodyY = 9.5 * VS + pop * 0.02;
      head = [-0.3 - pop * 0.3, 0, 0]; earUp = pop; wag = 12; wagAmp = 0.4; squash = -pop * 0.12;
    } else if (a === 'dig') {
      // front paws churning, rump up, tail wagging hard
      const s = Math.sin(t * 22);
      bodyX = 0.45; bodyY = 8.5 * VS; legs = [0.6 + s * 0.9, 0.6 - s * 0.9, 0.3, 0.3];
      head = [0.55, Math.sin(t * 5) * 0.1, 0]; wag = 16; wagAmp = 0.4; squash = Math.abs(s) * 0.05;
    } else if (a === 'yelp') {
      // a hop back, ears flung up, then cringing
      const k = clamp(this.animT / 0.5, 0, 1), hop = Math.sin(k * Math.PI);
      rootY = hop * 0.08; bodyZ = -hop * 0.06; bodyX = -0.4 * hop; legs = [-0.8, -0.8, 0.8, 0.8];
      head = [-0.4 * hop + 0.2 * (1 - hop), 0, 0.2]; earUp = 1; wag = 0; wagAmp = 0; squash = -hop * 0.2;
      if (k >= 1) this.play('idle');
    } else if (a === 'carried') {
      // held in someone's arms: paws dangling, head up and looking around, tail curled
      bodyX = -0.5; bodyY = 0; legs = [0.6 + Math.sin(t * 2) * 0.1, 0.6 - Math.sin(t * 2.3) * 0.1, 0.9, 0.9];
      head = [-0.15 + Math.sin(t * 0.9) * 0.08, Math.sin(t * 0.6) * 0.5, 0]; wag = 7; wagAmp = 0.2;
    } else if (a === 'happy') {
      // wriggling, hopping in place, tail a blur
      const s = Math.sin(t * 12);
      rootY = Math.max(0, Math.sin(t * 9)) * 0.04; bodyX = -0.15; legs = [s * 0.4, -s * 0.4, 0, 0];
      head = [-0.2, Math.sin(t * 6) * 0.3, Math.sin(t * 7) * 0.25]; wag = 22; wagAmp = 0.55; earUp = 0.4; squash = Math.max(0, -Math.sin(t * 9)) * 0.12;
    } else if (a === 'lick') {
      const s = Math.sin(t * 14);
      bodyX = -0.5; legs = [0.6, 0.6, -0.9, -0.9]; bodyY = 9.8 * VS;
      head = [-0.45 + s * 0.12, Math.sin(t * 3) * 0.1, 0]; tongue = s > 0; wag = 16; wagAmp = 0.5; earUp = 0.3;
    }
    // look-at overrides the head turn
    if (this.look) {
      this.group.updateMatrixWorld(true);
      const lp = this.look.clone().applyMatrix4(new THREE.Matrix4().copy(this.group.matrixWorld).invert());
      const hp = new THREE.Vector3(0, 0.2, 0.15);
      this.lookYaw = lerp(this.lookYaw, clamp(Math.atan2(lp.x - hp.x, lp.z - hp.z), -1, 1), 1 - Math.exp(-6 * dt));
      this.lookPitch = lerp(this.lookPitch, clamp(-Math.atan2(lp.y - hp.y, Math.hypot(lp.x - hp.x, lp.z - hp.z)), -0.6, 0.5), 1 - Math.exp(-6 * dt));
      head = [this.lookPitch, this.lookYaw, head[2]];
    }
    const f = 1 - Math.exp(-14 * dt), ff = this._first ? 1 : f;
    this._first = false;
    R.root.position.y = lerp(R.root.position.y, rootY, ff);
    R.body.position.y = lerp(R.body.position.y, bodyY, ff);
    R.body.position.z = lerp(R.body.position.z, bodyZ, ff);
    R.body.rotation.x = lerp(R.body.rotation.x, bodyX, ff);
    R.body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
    R.head.rotation.x = lerp(R.head.rotation.x, head[0], ff);
    R.head.rotation.y = lerp(R.head.rotation.y, head[1], ff);
    R.head.rotation.z = lerp(R.head.rotation.z, head[2], ff);
    const legJ = [R.fl, R.fr, R.bl, R.br];
    legs.forEach((v, i) => { legJ[i].rotation.x = lerp(legJ[i].rotation.x, v, ff); });
    R.tongue.visible = tongue;
    // ears and tail on springs (ears also flop with how fast the body moves)
    this.group.updateMatrixWorld(true);
    const wp = new THREE.Vector3().setFromMatrixPosition(R.head.matrixWorld);
    if (dt > 0) { this._vel.lerp(wp.clone().sub(this._prev).divideScalar(dt), 1 - Math.exp(-10 * dt)); }
    this._prev.copy(wp);
    const vy = clamp(this._vel.y * 2, -1.2, 1.2), sp = this.sp;
    for (const [k, side] of [['earL', 1], ['earR', -1]]) {
      const tgt = -earUp * 0.9 + vy * 0.6 + Math.sin(t * 2.1 + side) * 0.05;
      sp[k + 'v'] += ((tgt - sp[k]) * 120 - sp[k + 'v'] * 9) * dt;
      sp[k] += sp[k + 'v'] * dt;
      R[k].rotation.set(0, 0, side * (0.35 + clamp(sp[k], -1.2, 0.9)));
    }
    const wagT = Math.sin(t * wag) * wagAmp;
    sp.tailv += ((wagT - sp.tail) * 160 - sp.tailv * 10) * dt;
    sp.tail += sp.tailv * dt;
    R.tail.rotation.set(-0.3 + (a === 'carried' ? 0.6 : 0), sp.tail, 0);
  }
  dispose() { this.mat.dispose(); this.glowMat.dispose(); }
}

export function buildPet() { return new Pet(); }
export const PET_ANIMS = ['idle', 'sleep', 'walk', 'run', 'sniff', 'bark', 'dig', 'yelp', 'carried', 'happy', 'lick'];
