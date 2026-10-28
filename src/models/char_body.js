// Anatomy sculpting for the explorers (see char_sdf.js): a humanoid body field — pelvis, ribcage,
// trapezius, neck, deltoids, arms with forearm swell, mitten hands with thumbs, glutes, thighs,
// calves and feet — plus a head with cranium, cheekbones, jaw, chin, brow ridge, nose, lips,
// ears and eye sockets, and helpers for sculpted hair locks. Positions are taken from the rig's
// bones in the bind pose, so every part follows the skeleton it is skinned to.
import * as THREE from 'three';
import { ell, cone, box, bez } from './char_sdf.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
/** World (= character-local in the bind pose) position of a point given in a bone's frame. */
export function W(bone, x = 0, y = 0, z = 0) { return _v.set(x, y, z).applyMatrix4(bone.matrixWorld).toArray(); }
/** World euler of a rotation given in a bone's frame. */
export function WR(bone, rot = [0, 0, 0]) {
  bone.getWorldQuaternion(_q);
  _q.multiply(_q2.setFromEuler(_e.set(rot[0], rot[1], rot[2])));
  _e.setFromQuaternion(_q);
  return [_e.x, _e.y, _e.z];
}

/**
 * Humanoid body. o: { mats: {pelvis, torso, upper, fore, hand, thigh, shin, foot, neck},
 * waist:[w,d], chest:[w,d], hipW, hipD, neckR, delt, trap, arm:[rTop, rElbow, rWrist],
 * leg:[rThigh, rKnee, rAnkle], hand:{len, w, t}, foot:{len, w, h}, belly, chestZ }
 */
export function humanoid(c, S, o) {
  const R = c.rig, d = c.dims, m = o.mats;
  const G = S.group('body', { k: 0.03, sigma: 0.018 });
  const T = d.torsoH;
  // pelvis, belly, ribcage, trapezius — tagged 'torso' so clothing shells can follow them
  G.add(ell(W(R.hips, 0, -0.025, -0.004), [o.hipW, 0.1, o.hipD]), { bone: R.hips, mat: m.pelvis, tag: 'torso', k: 0.045, sigma: 0.025 });
  G.add(ell(W(R.spine, 0, T * 0.24, o.belly || 0), [o.waist[0], T * 0.3, o.waist[1]]), { bone: R.spine, mat: m.torso, tag: 'torso', k: 0.06, sigma: 0.025 });
  G.add(ell(W(R.spine, 0, T * 0.62, o.chestZ ?? 0.006), [o.chest[0], T * 0.3, o.chest[1]]), { bone: R.spine, mat: m.torso, tag: 'torso', k: 0.06, sigma: 0.025 });
  G.add(cone(W(R.spine, -d.shX * 0.78, T * 0.9, -0.012), W(R.spine, d.shX * 0.78, T * 0.9, -0.012), o.trap ?? 0.042), { bone: R.spine, mat: m.torso, tag: 'torso', k: 0.045, sigma: 0.025 });
  G.add(cone(W(R.spine, 0, T * 0.87, -0.01), W(R.head, 0, 0.025, -0.006), o.neckR * 1.3, o.neckR), { bone: R.neck, mat: m.neck || 'skin', k: 0.035, sigma: 0.02 });
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const sh = R['sh' + side], el = R['el' + side], hd = R['hand' + side], hp = R['hip' + side], kn = R['kn' + side], ft = R['ft' + side];
    // shoulder & arm
    G.add(ell(W(sh, sx * 0.004, -0.022, 0), [o.delt, o.delt * 1.2, o.delt * 0.98], WR(sh)), { bone: sh, mat: m.upper, k: 0.035 });
    G.add(cone(W(sh, 0, -0.03, 0), W(el), o.arm[0], o.arm[1]), { bone: sh, mat: m.upper, k: 0.025 });
    G.add(cone(W(el, 0, 0.005, 0), W(hd), o.arm[1] * 1.02, o.arm[2]), { bone: el, mat: m.fore, k: 0.02 });
    G.add(ell(W(el, 0, -d.armLo * 0.3, 0.004), [o.arm[1] * 1.14, d.armLo * 0.3, o.arm[1] * 1.02], WR(el)), { bone: el, mat: m.fore, k: 0.03 });
    // mitten hand: palm (thin across X, palm toward the body), knuckle ridge, thumb
    const H = o.hand;
    G.add(ell(W(hd, 0, -H.len * 0.4, 0.002), [H.t, H.len * 0.48, H.w], WR(hd)), { bone: hd, mat: m.hand, k: 0.018, sigma: 0.012 });
    G.add(ell(W(hd, sx * H.t * 0.1, -H.len * 0.78, H.w * 0.12), [H.t * 0.85, H.len * 0.24, H.w * 0.92], WR(hd)), { bone: hd, mat: m.hand, k: 0.012, sigma: 0.012 });
    G.add(cone(W(hd, -sx * H.t * 0.45, -H.len * 0.22, H.w * 0.55), W(hd, -sx * H.t * 1.05, -H.len * 0.62, H.w * 0.95), H.t * 0.62, H.t * 0.45), { bone: hd, mat: m.hand, k: 0.008, sigma: 0.012 });
    // glute/hip, thigh, knee, calf, shin
    G.add(ell(W(R.hips, sx * d.hipX * 0.95, -0.06, -0.025), [o.leg[0] * 1.08, 0.085, o.leg[0] * 1.05]), { bone: R.hips, mat: m.thigh, tag: 'torso', k: 0.045, sigma: 0.025 });
    G.add(cone(W(hp, 0, -0.03, 0), W(kn), o.leg[0], o.leg[1]), { bone: hp, mat: m.thigh, k: 0.03 });
    G.add(ell(W(kn, 0, 0.0, o.leg[1] * 0.35), [o.leg[1] * 0.9, o.leg[1] * 1.1, o.leg[1] * 0.75], WR(kn)), { bone: kn, mat: m.shin, k: 0.02 });
    G.add(cone(W(kn, 0, -0.01, 0), W(ft), o.leg[1] * 0.95, o.leg[2]), { bone: kn, mat: m.shin, k: 0.02 });
    G.add(ell(W(kn, 0, -d.legLo * 0.32, -o.leg[1] * 0.3), [o.leg[1] * 1.04, d.legLo * 0.28, o.leg[1] * 0.92], WR(kn)), { bone: kn, mat: m.shin, k: 0.03 });
    // foot: ankle, heel, instep→toe (sole flattened by the floor cut below)
    const F = o.foot;
    G.add(ell(W(ft, 0, -d.footH * 0.55, -0.012), [F.w * 0.46, d.footH * 0.62, F.w * 0.55], WR(ft)), { bone: ft, mat: m.foot, k: 0.02, sigma: 0.014 });
    G.add(ell(W(ft, 0, -d.footH + F.h * 0.48, F.len * 0.32), [F.w * 0.5, F.h * 0.5, F.len * 0.5], WR(ft)), { bone: ft, mat: m.foot, k: 0.025, sigma: 0.014 });
  }
  G.sub(box([0, -0.5, 0], [2, 0.5, 2], 0.001), { k: 0.004 }); // flat soles on the floor
  return G;
}

/**
 * Sculpted head on the head bone. o: { R (half width), H (chin→crown), chinY, jaw, chin, brow,
 * nose: {len, r, tip}, eyeV, noseV, mouthV, eyeX, ears: false|{...}, lips }
 * Returns the landmarks used to paint the face texture.
 */
export function sculptHead(c, S, o) {
  const hb = c.rig.head, R = o.R, H = o.H, yc = o.chinY ?? -0.035;
  const P = (x, y, z) => W(hb, x, y, z);
  const G = S.group('head', { fine: true, k: 0.03, mat: 'face', bone: hb, sigma: 0.02 });
  const eyeY = yc + H * (o.eyeV ?? 0.5), noseY = yc + H * (o.noseV ?? 0.32), mouthY = yc + H * (o.mouthV ?? 0.2), ex = R * (o.eyeX ?? 0.38);
  G.add(ell(P(0, yc + H * 0.63, -R * 0.1), [R, H * 0.38, R * 1.12]));                                   // cranium
  G.add(ell(P(0, yc + H * 0.5, R * 0.12), [R * 0.84, H * 0.3, R * 0.82]));                               // face mass
  G.add(ell(P(0, yc + H * 0.22, R * 0.22), [R * 0.6 * (o.jaw ?? 1), H * 0.19, R * 0.62]), { k: 0.03 });  // jaw
  G.add(ell(P(0, yc + H * 0.08, R * 0.58), [R * 0.28 * (o.chin ?? 1), H * 0.075, R * 0.27]), { k: 0.02 });  // chin
  for (const sx of [-1, 1]) {
    G.add(ell(P(sx * R * 0.5, yc + H * 0.43, R * 0.6), [R * 0.3, H * 0.085, R * 0.3]), { k: 0.022 }); // cheekbones
    if (o.jawAngle) G.add(cone(P(sx * R * 0.62, yc + H * 0.32, -R * 0.12), P(sx * R * 0.26, yc + H * 0.07, R * 0.5), R * 0.13, R * 0.1), { k: 0.022 }); // jaw line, ear → chin
  }
  G.add(cone(P(-R * 0.58, eyeY + H * 0.075, R * 0.86), P(R * 0.58, eyeY + H * 0.075, R * 0.86), R * 0.11 * (o.brow ?? 1)), { k: 0.025 }); // brow ridge
  // nose: bridge, tip, wings
  const N = { len: 1, r: 1, tip: 1, ...(o.nose || {}) };
  G.add(cone(P(0, eyeY + H * 0.02, R * 0.92), P(0, noseY + H * 0.03, R * (1.02 + 0.12 * N.len)), R * 0.06 * N.r, R * 0.085 * N.tip), { k: 0.014 });
  for (const sx of [-1, 1]) G.add(ell(P(sx * R * 0.1 * N.r, noseY + H * 0.02, R * 1.0), [R * 0.075 * N.r, R * 0.06, R * 0.07]), { k: 0.01 });
  // lips
  if (o.lips !== false) {
    G.add(ell(P(0, mouthY + H * 0.012, R * 0.84), [R * 0.2, H * 0.016, R * 0.08]), { k: 0.012 });
    G.add(ell(P(0, mouthY - H * 0.022, R * 0.8), [R * 0.17, H * 0.018, R * 0.08]), { k: 0.012 });
  }
  // ears
  if (o.ears !== false) for (const sx of [-1, 1]) {
    G.add(ell(P(sx * R * 0.96, (eyeY + noseY) / 2, -R * 0.08), [R * 0.1, H * 0.13, R * 0.2], [0, sx * 0.35, sx * 0.08]), { k: 0.012, mat: 'skin' });
  }
  // eye sockets
  for (const sx of [-1, 1]) G.sub(ell(P(sx * ex, eyeY, R * 0.99), [R * 0.17, H * 0.045, R * 0.1]), { k: 0.012 });
  return { G, R, H, yc, eyeY, noseY, mouthY, ex, P, hb };
}

/** Face texture spec rows/cols from the sculpted landmarks. */
export function faceLayout(spec, hd, px = 64) {
  const w = hd.R * 2.1;
  const row = (y) => (1 - (y - hd.yc) / hd.H) * px;
  return {
    ...spec,
    eyeY: Math.round(row(hd.eyeY) - spec.eyeH / 2),
    gap: Math.round((2 * hd.ex) / w * px),
    noseY: Math.round(row(hd.noseY)),
    mouthY: Math.round(row(hd.mouthY)),
    uv: { w, h: hd.H },
  };
}

/** A hair lock: tapered chain of round cones along a bezier (root → tip). */
export function lockOn(G, pts, r0, r1 = 0.002, o = {}) {
  const path = pts.length === 4 ? bez(pts[0], pts[1], pts[2], pts[3], o.n || 5) : bez(pts[0], pts[1], pts[2], null, o.n || 5);
  G.chain(path, (t) => r0 + (r1 - r0) * Math.pow(t, o.pow ?? 0.9), { k: o.k ?? 0.008, mat: o.mat, bone: o.bone, sigma: o.sigma });
}
