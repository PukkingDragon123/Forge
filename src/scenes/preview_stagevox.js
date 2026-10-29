// Preview bench for the voxel stages (tools/preview/stagevox.entry.js):
//   ?kind=arena|tomb|corridor|room|wall|campfire|crossroads &region=0..5 &tunnel=.. &room=.. &at=x (corridor)
//   &choices=minecart:monster,chainbridge:treasure,crawl:event (crossroads) &char=0 (no actors)
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig } from '../gfx/camera.js';
import { buildStage } from '../models/stage_vox.js';
import { buildCharacter } from '../models/characters.js';

export class StageVoxPreview extends Scene {
  enter(p) {
    this.kind = p.kind || 'arena';
    this.rig = new CameraRig(38);
    const scene = new THREE.Scene();
    this.world = { scene, camera: this.rig.camera, post: { bloom: 0.8, vignette: 0.35 } };
    const choices = (p.choices || 'minecart:monster,chainbridge:treasure,crawl:event').split(',').map((s) => { const [tunnel, type] = s.split(':'); return { tunnel, type }; });
    const t0 = performance.now();
    this.st = buildStage(this.kind, +(p.region || 0), { tunnel: p.tunnel, room: p.room, length: 40, choices });
    this.buildMs = performance.now() - t0;
    console.log(`voxstage ${this.kind} r${p.region || 0} ${p.tunnel || p.room || ''} build ${this.buildMs.toFixed(0)}ms faces ${this.st.faces}`);
    this.st.attach(scene);
    this.st.setCamera(this.rig.camera);
    const a = this.st.anchors;
    this.actors = [];
    const put = (o, v, ry = 0) => { o.group.position.copy(v); o.group.rotation.y = ry; scene.add(o.group); this.actors.push(o); return o; };
    if (p.char !== '0') {
      try {
        if (this.kind === 'campfire') {
          ['bran', 'elio', 'durgan', 'clover'].forEach((id, i) => {
            const s = a.seats[i];
            const c = put(buildCharacter(id), s.pos.clone().setY(0), s.rotY);
            c.setSeated && c.setSeated(true, s.height);
            c.play('sit', { loop: true });
          });
        } else if (this.kind === 'crossroads') {
          put(buildCharacter(p.who || 'bran'), a.heroCenter, Math.PI).play('idle', { loop: true });
        } else {
          const at = this.kind === 'corridor' ? new THREE.Vector3(+(p.at || 3), this.st.floorAt(+(p.at || 3)), 0) : (a.player || new THREE.Vector3(-1.4, 0, 0.6));
          const c = put(buildCharacter(p.who || 'bran'), at, this.kind === 'wall' ? 0.5 : Math.PI / 2);
          c.play(this.kind === 'corridor' ? 'walk' : 'idle', { loop: true });
          if (a.monster) put(buildCharacter(p.foe || 'durgan'), a.monster, -Math.PI / 2).play('idle', { loop: true });
        }
      } catch (e) { console.warn('actors skipped', e.message); }
    }
    const c = this.st.camera;
    this.rig.cut(c.pos, c.look, c.fov);
    if (this.kind === 'corridor') {
      const x = +(p.at || 3), y = this.st.floorAt(x);
      this.st.follow(x, y + 1.2);
      this.st.stream.all();
      this.rig.cut([x, y + 1.7, 6.6], [x, y + 0.9, 0], 36);
    }
    if (p.cx) this.rig.cut([+p.cx, +p.cy, +p.cz], [+(p.lx ?? 0), +(p.ly ?? 1), +(p.lz ?? 0)], +(p.fov || 38));
    this.ready = true;
  }
  update(dt) {
    if (!this.ready) return;
    this.st.update(dt, this.time);
    for (const o of this.actors) o.update(dt);
    this.rig.update(dt);
  }
  draw(ui) {
    if (!this.ready) return;
    ui.text(`${this.kind} build ${this.buildMs.toFixed(0)}ms faces ${this.st.faces} fps ${this.game.fps.toFixed(0)}`, 4, ui.h - 10, { font: 'small', color: '#9d8f7d' });
  }
}
