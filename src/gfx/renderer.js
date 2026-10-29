// Low-resolution 3D renderer + pixel-art post pipeline + UI canvas compositor.
import * as THREE from 'three';
import { makeBrightPass, makeBlur, makeComposite } from './post.js';
import { bindSpriteRenderer } from './voxsprite.js';

export const LAYER_SOLID = 0;
export const LAYER_FX = 1;

const BASE_W = 960, BASE_H = 540;

export class Renderer {
  constructor(stage) {
    this.stage = stage;
    this.gl = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    this.gl.setPixelRatio(1);
    this.gl.autoClear = true;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.BasicShadowMap;
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace; // composite shader converts to sRGB itself
    this.gl.toneMapping = THREE.NoToneMapping;
    bindSpriteRenderer(this.gl); // 2D sprites are rendered from voxel models on this context
    this.canvas3d = this.gl.domElement;
    this.canvasUI = document.createElement('canvas');
    stage.appendChild(this.canvas3d);
    stage.appendChild(this.canvasUI);
    this.ctx = this.canvasUI.getContext('2d');

    const ext = this.gl.extensions;
    this.hdr = !!(ext.get('EXT_color_buffer_float') || ext.get('EXT_color_buffer_half_float'));
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const mk = (w, h, opts = {}) => new THREE.WebGLRenderTarget(w, h, { type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...opts });
    // linear filtering is safe: the composite samples exact pixel centers, the bloom downsample averages
    this.rtScene = mk(BASE_W, BASE_H);
    this.rtScene.depthTexture = new THREE.DepthTexture(BASE_W, BASE_H);
    this.rtScene.depthTexture.type = THREE.UnsignedIntType;
    this.rtNormal = new THREE.WebGLRenderTarget(BASE_W, BASE_H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rtBright = mk(BASE_W / 2, BASE_H / 2);
    this.rtA1 = mk(BASE_W / 2, BASE_H / 2); this.rtA2 = mk(BASE_W / 2, BASE_H / 2);
    this.rtB1 = mk(BASE_W / 4, BASE_H / 4); this.rtB2 = mk(BASE_W / 4, BASE_H / 4);

    this.normalMat = new THREE.MeshNormalMaterial();
    this.brightMat = makeBrightPass();
    this.blurMat = makeBlur();
    this.compMat = makeComposite();
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.blackScene = new THREE.Scene();
    this.blackScene.background = new THREE.Color(0x07060b);

    this.scale = 3; this.vw = BASE_W; this.vh = BASE_H; this.dpr = 1;
    this.scaleBias = 0;
    this.time = 0;
    this.flash = 0; this.flashColor = new THREE.Vector3(1, 1, 1);
    // a probe that sits inside the phone's safe area (notch, rounded corners, home bar)
    this.safe = document.createElement('div');
    this.safe.style.cssText = 'position:fixed;pointer-events:none;visibility:hidden;left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(this.safe);
    this.resize();
    const re = () => this.resize();
    window.addEventListener('resize', re);
    window.addEventListener('orientationchange', () => setTimeout(re, 120));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', re);
  }

  /** bias: +1 = chunkier pixels, -1 = finer pixels, 0 = auto */
  setScaleBias(b) { this.scaleBias = b | 0; this.resize(); }

  resize() {
    // Fixed 960×540 stage scaled to fit the window (letterboxed). Whole-number scales are
    // preferred when close, so pixels stay even; otherwise a crisp nearest-neighbour stretch.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const area = this.safe ? this.safe.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const AW = area.width || window.innerWidth, AH = area.height || window.innerHeight;
    const fit = Math.min(AW / BASE_W, AH / BASE_H);
    const whole = Math.floor(fit * dpr) / dpr;
    const s = whole >= 1 && fit - whole < 0.12 ? whole : fit;
    const vw = BASE_W, vh = BASE_H;
    this.scale = s; this.vw = vw; this.vh = vh; this.dpr = dpr;
    this.gl.setSize(vw, vh, false);
    const cssW = Math.round(vw * s), cssH = Math.round(vh * s);
    for (const c of [this.canvas3d, this.canvasUI]) {
      c.style.width = cssW + 'px';
      c.style.height = cssH + 'px';
    }
    this.canvasUI.width = vw; this.canvasUI.height = vh;
    this.ctx.imageSmoothingEnabled = false;
    // center the overflow so cropping is symmetric
    this.stage.style.left = Math.floor((area.left || 0) + (AW - cssW) / 2) + 'px';
    this.stage.style.top = Math.floor((area.top || 0) + (AH - cssH) / 2) + 'px';
    this.stage.style.width = cssW + 'px'; this.stage.style.height = cssH + 'px';
    this.rtScene.setSize(vw, vh);
    this.rtNormal.setSize(vw, vh);
    const hw = Math.max(1, vw >> 1), hh = Math.max(1, vh >> 1);
    const qw = Math.max(1, vw >> 2), qh = Math.max(1, vh >> 2);
    this.rtBright.setSize(hw, hh); this.rtA1.setSize(hw, hh); this.rtA2.setSize(hw, hh);
    this.rtB1.setSize(qw, qh); this.rtB2.setSize(qw, qh);
    this.compMat.uniforms.resolution.value.set(vw, vh);
    this.onResize && this.onResize(vw, vh);
  }

  /** Convert client (CSS) coordinates into virtual pixel coordinates. */
  toVirtual(cx, cy) {
    const r = this.canvasUI.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * this.vw, y: ((cy - r.top) / r.height) * this.vh };
  }

  _quad(mat, target) {
    this.quad.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.quadScene, this.quadCam);
  }

  /**
   * world: { scene, camera, post?: { outline, edge, bloom, threshold, exposure, saturation, contrast,
   *          vignette, dither, levels, normals, fade, fadeColor, lift, gain, depthSens } }
   */
  render(world, dt = 0) {
    this.time += dt;
    const gl = this.gl;
    const scene = world && world.scene ? world.scene : this.blackScene;
    const camera = world && world.camera ? world.camera : this.quadCam;
    const p = (world && world.post) || {};
    if (camera.isPerspectiveCamera) {
      const a = this.vw / this.vh;
      if (Math.abs(camera.aspect - a) > 1e-4) { camera.aspect = a; camera.updateProjectionMatrix(); }
    } else if (camera.isOrthographicCamera && camera.userData.viewHeight) {
      const h = camera.userData.viewHeight, w = h * (this.vw / this.vh);
      if (camera.right - camera.left !== w) {
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
      }
    }

    // 1) scene color + depth
    camera.layers.enableAll();
    gl.setRenderTarget(this.rtScene);
    gl.render(scene, camera);

    // 2) view-space normals for edge highlights (solid layer only)
    const useNormals = p.normals !== false && p.edge !== 0;
    if (useNormals) {
      const bg = scene.background, fog = scene.fog;
      scene.background = null; scene.fog = null;
      scene.overrideMaterial = this.normalMat;
      camera.layers.set(LAYER_SOLID);
      gl.setClearColor(0x8080ff, 1);
      gl.setRenderTarget(this.rtNormal);
      gl.clear();
      gl.render(scene, camera);
      scene.overrideMaterial = null;
      scene.background = bg; scene.fog = fog;
      camera.layers.enableAll();
      gl.setClearColor(0x000000, 1);
    }

    // 3) bloom
    const bloom = p.bloom ?? 0.7;
    if (bloom > 0) {
      this.brightMat.uniforms.tColor.value = this.rtScene.texture;
      this.brightMat.uniforms.threshold.value = p.threshold ?? 0.85;
      this._quad(this.brightMat, this.rtBright);
      const b = this.blurMat.uniforms;
      b.texel.value.set(1 / this.rtA1.width, 1 / this.rtA1.height);
      b.tColor.value = this.rtBright.texture; b.dir.value.set(1, 0); this._quad(this.blurMat, this.rtA1);
      b.tColor.value = this.rtA1.texture; b.dir.value.set(0, 1); this._quad(this.blurMat, this.rtA2);
      b.texel.value.set(1 / this.rtB1.width, 1 / this.rtB1.height);
      b.tColor.value = this.rtA2.texture; b.dir.value.set(1, 0); this._quad(this.blurMat, this.rtB1);
      b.tColor.value = this.rtB1.texture; b.dir.value.set(0, 1); this._quad(this.blurMat, this.rtB2);
      b.tColor.value = this.rtB2.texture; b.dir.value.set(1, 0); b.texel.value.multiplyScalar(2); this._quad(this.blurMat, this.rtB1);
      b.tColor.value = this.rtB1.texture; b.dir.value.set(0, 1); this._quad(this.blurMat, this.rtB2);
    }

    // 4) composite
    const u = this.compMat.uniforms;
    u.tColor.value = this.rtScene.texture;
    u.tDepth.value = this.rtScene.depthTexture;
    u.tNormal.value = this.rtNormal.texture;
    u.tBloomA.value = this.rtA2.texture;
    u.tBloomB.value = this.rtB2.texture;
    u.cameraNear.value = camera.near ?? 0.1;
    u.cameraFar.value = camera.far ?? 100;
    u.ortho.value = camera.isOrthographicCamera ? 1 : 0;
    u.outline.value = world ? p.outline ?? 0.55 : 0;
    u.edge.value = p.edge ?? 0.3;
    u.useNormals.value = useNormals ? 1 : 0;
    u.depthSens.value = p.depthSens ?? 1;
    u.bloom.value = bloom;
    u.exposure.value = p.exposure ?? 1;
    u.tone.value = p.tone ?? 2;
    u.contrast.value = p.contrast ?? 1.05;
    u.saturation.value = p.saturation ?? 1.1;
    u.vignette.value = p.vignette ?? 0.28;
    u.dither.value = p.dither ?? 0.55;
    u.levels.value = p.levels ?? 56;
    if (p.lift) u.lift.value.set(...p.lift); else u.lift.value.set(0.0, 0.022, 0.04); // deep teal shadows
    if (p.gain) u.gain.value.set(...p.gain); else u.gain.value.set(1.05, 0.99, 0.87); // warm firelit highlights
    u.fade.value = p.fade ?? 0;
    if (p.fadeColor) u.fadeColor.value.set(...p.fadeColor); else u.fadeColor.value.set(0.027, 0.024, 0.043);
    this.flash = Math.max(0, this.flash - dt * 4);
    u.flash.value = this.flash;
    u.flashColor.value.copy(this.flashColor);
    u.time.value = this.time;
    this._quad(this.compMat, null);
  }

  doFlash(strength = 0.6, color = [1, 1, 1]) {
    this.flash = Math.max(this.flash, strength);
    this.flashColor.set(...color);
  }
}
