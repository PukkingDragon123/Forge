// Voxel → sprite: renders any 3D (voxel) model into a crisp, outlined 2D canvas so the game's 2D
// pieces (items, props, icons, UI objects) are made from the same voxel art as the 3D world.
// Renders use the game's WebGL context (offscreen target), are lit with a warm key, a cool rim and
// a soft fill, keep hard pixel edges (no AA), get an ink outline, and are cached by key.
import * as THREE from 'three';

let gl = null;
let own = null;
const cache = new Map();

/** The game renderer shares its context so no second WebGL context is created. */
export function bindSpriteRenderer(renderer) { gl = renderer; }

function renderer() {
  if (gl) return gl;
  if (!own) {
    own = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: false });
    own.setPixelRatio(1);
  }
  return own;
}

const LIGHTS = {
  // Eastward-warm key from the upper left, cool rim from behind, lavender fill from below
  warm: [['hemi', 0xfff0dc, 0x5a4a7a, 0.95], ['dir', 0xffd6a8, 1.9, [-1.2, 1.6, 1.4]], ['dir', 0x8ab8ff, 0.9, [1.4, 0.6, -1.2]], ['dir', 0xb08aff, 0.3, [-0.6, -1, 0.8]]],
  ember: [['hemi', 0xffd0a0, 0x4a2a3a, 0.8], ['dir', 0xffa060, 2.0, [-1, 1.2, 1.4]], ['dir', 0xff6a3a, 0.8, [1.4, 0.4, -1]]],
  cool: [['hemi', 0xd8e8ff, 0x2a3a5a, 0.9], ['dir', 0xe0f0ff, 1.7, [-1, 1.4, 1.2]], ['dir', 0x9a7aff, 0.8, [1.2, 0.6, -1.2]]],
};
function addLights(scene, preset) {
  for (const [kind, a, b, c] of LIGHTS[preset] || LIGHTS.warm) {
    if (kind === 'hemi') scene.add(new THREE.HemisphereLight(a, b, c));
    else { const d = new THREE.DirectionalLight(a, b); d.position.set(...c); scene.add(d); }
  }
}

function dispose(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const m = o.material;
    if (m && !Array.isArray(m) && !m.userData.shared) m.dispose && m.dispose();
  });
}

/**
 * Render a model to a canvas (cached by key).
 *   build: () => Object3D (built fresh; disposed after unless opts.keep)
 *   opts: { w, h, yaw, pitch, roll, pad, ppu (px per world unit; default fits), light, outline, outline2,
 *           keep, bg, fov (0 = orthographic) }
 */
/** Count and time of sprite renders (read by the boot probe in tools/). */
export const spriteStats = { n: 0, ms: 0, px: 0 };
if (typeof window !== 'undefined') window.__voxSprites = spriteStats;

export function voxSprite(key, build, opts = {}) {
  const hit = cache.get(key);
  if (hit) return hit;
  const t0 = performance.now();
  const w = Math.max(1, opts.w || 64), h = Math.max(1, opts.h || opts.w || 64);
  const r = renderer();
  const scene = new THREE.Scene();
  addLights(scene, opts.light);
  const obj = build();
  const pivot = new THREE.Group();
  pivot.add(obj);
  pivot.rotation.set(opts.pitch ?? 0.45, opts.yaw ?? -0.6, opts.roll ?? 0, 'XYZ');
  scene.add(pivot);
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const pad = opts.pad ?? 3;
  const ppu = opts.ppu || Math.min((w - pad * 2) / Math.max(1e-3, size.x), (h - pad * 2) / Math.max(1e-3, size.y));
  const halfW = w / 2 / ppu, halfH = h / 2 / ppu;
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 1000);
  cam.position.set(center.x + (opts.ox || 0) / ppu, center.y - (opts.oy || 0) / ppu, center.z + Math.max(10, size.z * 4));
  cam.lookAt(center.x + (opts.ox || 0) / ppu, center.y - (opts.oy || 0) / ppu, center.z);
  const rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  rt.texture.colorSpace = THREE.SRGBColorSpace; // encode to sRGB so the pixels read back as they look
  const prevRT = r.getRenderTarget(), prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
  const prevShadow = r.shadowMap.enabled;
  r.shadowMap.enabled = false;
  r.setRenderTarget(rt);
  r.setClearColor(0x000000, 0);
  r.clear(true, true, true);
  r.render(scene, cam);
  const px = new Uint8Array(w * h * 4);
  r.readRenderTargetPixels(rt, 0, 0, w, h, px);
  r.setRenderTarget(prevRT);
  r.setClearColor(prevClear, prevAlpha);
  r.shadowMap.enabled = prevShadow;
  rt.dispose();
  if (!opts.keep) dispose(obj);
  // flip to canvas order, harden alpha, then ink the silhouette
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4, dst = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const a = px[src + x + 3];
      if (a < 96) continue;
      d[dst + x] = px[src + x]; d[dst + x + 1] = px[src + x + 1]; d[dst + x + 2] = px[src + x + 2]; d[dst + x + 3] = 255;
    }
  }
  if (opts.outline !== false) {
    const ink = opts.outline || [18, 10, 14];
    const rings = opts.outline2 ? 2 : 1;
    for (let ring = 0; ring < rings; ring++) {
      const solid = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] ? 1 : 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        if ((x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])) {
          d[i * 4] = ink[0]; d[i * 4 + 1] = ink[1]; d[i * 4 + 2] = ink[2]; d[i * 4 + 3] = ring ? 150 : 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  out.ppu = ppu;
  spriteStats.n++; spriteStats.ms += performance.now() - t0; spriteStats.px += w * h;
  cache.set(key, out);
  if (cache.size > 1500) { const k0 = cache.keys().next().value; const c0 = cache.get(k0); spriteStats.px -= c0.width * c0.height; cache.delete(k0); }
  return out;
}

export function clearVoxSprites() { cache.clear(); }
