// Voxel chunks that pop off monsters when they're hit and burst out when they die (instanced cubes that tumble,
// bounce on the floor and shrink away).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

export class VoxelBurst {
  constructor(max, size) {
    this.max = max;
    this.size = size;
    const geo = new THREE.BoxGeometry(size, size, size);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.setRGB(1, 1, 1));
    this.items = [];
  }
  /** pos: Vector3 (parent space), rgb: linear [r,g,b], vel: [x,y,z] */
  emit(pos, rgb, vel, life = 1.2, glow = false) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ p: pos.clone(), v: new THREE.Vector3(vel[0], vel[1], vel[2]), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), c: glow ? rgb.map((x) => Math.min(1, x * 1.6 + 0.2)) : rgb, t: 0, life, s: 0.75 + Math.random() * 0.6 });
  }
  update(dt, floorY = 0) {
    const it = this.items;
    for (let i = it.length - 1; i >= 0; i--) {
      const o = it[i];
      o.t += dt;
      if (o.t > o.life) { it.splice(i, 1); continue; }
      o.v.y -= 9.5 * dt;
      o.p.addScaledVector(o.v, dt);
      if (o.p.y < floorY + this.size * 0.5) {
        o.p.y = floorY + this.size * 0.5;
        if (o.v.y < -0.6) { o.v.y *= -0.38; o.v.x *= 0.6; o.v.z *= 0.6; o.w.multiplyScalar(0.5); }
        else { o.v.set(o.v.x * 0.8, 0, o.v.z * 0.8); o.w.multiplyScalar(0.8); }
      }
      o.r.addScaledVector(o.w, dt);
    }
    for (let i = 0; i < it.length; i++) {
      const o = it[i];
      const k = o.t / o.life, sc = o.s * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      _q.setFromEuler(_e.set(o.r.x, o.r.y, o.r.z));
      _m.compose(o.p, _q, _s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.setRGB(o.c[0], o.c[1], o.c[2]));
    }
    this.mesh.count = it.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  get active() { return this.items.length > 0; }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.removeFromParent(); }
}
void _p;
