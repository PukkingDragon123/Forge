// Base actor for the action engine. Enemies (agent N) extend it; the player does too.
// Positions live on the ground plane (x, z); `y` is a visual lift (jumps, flyers).
//   status: { burn, poison, slow, freeze, stun, bleed, root } — seconds left (poison also has .poisonStacks)
export class Entity {
  constructor(opts = {}) {
    this.x = opts.x || 0; this.z = opts.z || 0; this.y = 0;
    this.vx = 0; this.vz = 0;        // intended velocity (m/s), set by brains / the player each step
    this.kbx = 0; this.kbz = 0;      // knockback velocity, decays
    this.radius = opts.radius ?? 0.4;
    this.mass = opts.mass ?? 1;      // knockback divides by this; bosses ~6–10
    this.team = opts.team || 'enemy';
    this.hp = opts.hp ?? 10; this.maxHp = opts.maxHp ?? this.hp;
    this.armor = opts.armor || 0;    // flat damage reduction per hit (min 1 gets through)
    this.dmgTaken = 1;               // multiplier (vulnerability)
    this.dead = false;
    this.invuln = 0;                 // seconds of immunity
    this.status = {};
    this.poisonStacks = 0;
    this.model = null;               // THREE.Object3D (or an object with .group)
    this.facing = 0;                 // radians: atan2(dx, dz) — model front is +Z at 0
    this.fly = false;                // flyers ignore pits
    this.solid = true;               // takes part in entity separation
    this.flashT = 0;
    this.age = 0;
  }
  /** Seconds of crowd control left (can't act). */
  get disabled() { return (this.status.stun || 0) > 0 || (this.status.freeze || 0) > 0; }
  /** Movement multiplier from statuses. */
  get speedMul() { return this.disabled || (this.status.root || 0) > 0 ? 0 : (this.status.slow || 0) > 0 ? 0.5 : 1; }
  /** The Object3D that represents this entity in the scene. */
  get obj() { return this.model ? (this.model.isObject3D ? this.model : this.model.group) : null; }
  update(dt, world) {} // eslint-disable-line no-unused-vars
  /** Called after damage is applied (hp already reduced). React: anims, stagger. */
  hurt(hit, world) {} // eslint-disable-line no-unused-vars
  /** Called once when hp reaches 0. */
  die(world) {} // eslint-disable-line no-unused-vars
  /** Sync the model with the simulation (called each rendered frame). */
  sync(dt) {
    const o = this.obj;
    if (!o) return;
    o.position.set(this.x, this.y, this.z);
    o.rotation.y = this.facing;
    if (this.model && this.model.update && !this.noModelUpdate) this.model.update(dt);
  }
}
