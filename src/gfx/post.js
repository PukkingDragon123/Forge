// Post-processing shaders for the pixel-art 3D look.
import * as THREE from 'three';

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export function makeBrightPass() {
  return new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, threshold: { value: 0.85 }, knee: { value: 0.4 } },
    vertexShader: quadVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor; uniform float threshold; uniform float knee;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tColor, vUv).rgb;
        float l = max(c.r, max(c.g, c.b));
        float soft = clamp(l - threshold + knee, 0.0, 2.0 * knee);
        soft = soft * soft / (4.0 * knee + 1e-4);
        float w = max(soft, l - threshold) / max(l, 1e-4);
        gl_FragColor = vec4(c * w, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
}

export function makeBlur() {
  return new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, texel: { value: new THREE.Vector2() } },
    vertexShader: quadVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor; uniform vec2 dir; uniform vec2 texel;
      varying vec2 vUv;
      void main() {
        vec2 o = dir * texel;
        vec3 s = texture2D(tColor, vUv).rgb * 0.227027;
        s += texture2D(tColor, vUv + o * 1.3846153846).rgb * 0.3162162162;
        s += texture2D(tColor, vUv - o * 1.3846153846).rgb * 0.3162162162;
        s += texture2D(tColor, vUv + o * 3.2307692308).rgb * 0.0702702703;
        s += texture2D(tColor, vUv - o * 3.2307692308).rgb * 0.0702702703;
        gl_FragColor = vec4(s, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
}

/**
 * Final composite: 1px depth outlines, normal edge highlights, bloom, tone/grade, vignette,
 * luminance dithering (Bayer 4x4) so light falloff reads like hand-dithered pixel art.
 */
export function makeComposite() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null }, tDepth: { value: null }, tNormal: { value: null },
      tBloomA: { value: null }, tBloomB: { value: null },
      resolution: { value: new THREE.Vector2(640, 360) },
      cameraNear: { value: 0.1 }, cameraFar: { value: 100 }, ortho: { value: 0 },
      outline: { value: 0.55 }, edge: { value: 0.35 }, useNormals: { value: 1 },
      depthSens: { value: 1.0 },
      bloom: { value: 0.7 },
      exposure: { value: 1.0 }, tone: { value: 2.0 }, contrast: { value: 1.06 }, saturation: { value: 1.12 },
      lift: { value: new THREE.Vector3(0.012, 0.008, 0.03) },
      gain: { value: new THREE.Vector3(1.0, 0.98, 0.94) },
      vignette: { value: 0.35 },
      dither: { value: 1.0 }, levels: { value: 28.0 },
      fade: { value: 0 }, fadeColor: { value: new THREE.Vector3(0, 0, 0) },
      flash: { value: 0 }, flashColor: { value: new THREE.Vector3(1, 1, 1) },
      time: { value: 0 },
    },
    vertexShader: quadVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor, tDepth, tNormal, tBloomA, tBloomB;
      uniform vec2 resolution;
      uniform float cameraNear, cameraFar, ortho;
      uniform float outline, edge, useNormals, depthSens, bloom;
      uniform float exposure, tone, contrast, saturation, vignette, dither, levels;
      uniform vec3 lift, gain;
      uniform float fade, flash; uniform vec3 fadeColor, flashColor;
      uniform float time;
      varying vec2 vUv;

      float viewZ(vec2 uv) {
        float d = texture2D(tDepth, uv).x;
        if (ortho > 0.5) return cameraNear + d * (cameraFar - cameraNear);
        float ndc = d * 2.0 - 1.0;
        return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - ndc * (cameraFar - cameraNear));
      }
      vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

      float bayer4(vec2 p) {
        int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
        int i = x + y * 4;
        // 4x4 Bayer matrix / 16
        float m[16];
        m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0;
        m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
        m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0;
        m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
        for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.5;
        return 0.0;
      }
      vec3 aces(vec3 x) {
        const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }
      // gentle shoulder: keeps lamp-lit colours rich instead of ACES' washed, grey highlights
      vec3 softTone(vec3 x) {
        vec3 k = vec3(0.7);
        vec3 o = max(x - k, 0.0);
        return min(x, k) + o / (1.0 + o / (1.0 - k));
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }

      void main() {
        vec2 px = 1.0 / resolution;
        vec3 col = texture2D(tColor, vUv).rgb;
        float rawD = texture2D(tDepth, vUv).x;

        if (outline > 0.0 && rawD < 1.0) {
          float d = viewZ(vUv);
          float dl = viewZ(vUv - vec2(px.x, 0.0));
          float dr = viewZ(vUv + vec2(px.x, 0.0));
          float du = viewZ(vUv + vec2(0.0, px.y));
          float dd = viewZ(vUv - vec2(0.0, px.y));
          vec3 n = nrm(vUv);
          float facing = useNormals > 0.5 ? clamp(abs(n.z), 0.15, 1.0) : 1.0;
          float thr = (0.035 * d + 0.05) * depthSens / facing;
          float farSum = max(0.0, dl - d) + max(0.0, dr - d) + max(0.0, du - d) + max(0.0, dd - d);
          float isOutline = step(thr, farSum);
          float edgeLight = 0.0;
          if (useNormals > 0.5 && isOutline < 0.5) {
            vec3 nl = nrm(vUv - vec2(px.x, 0.0)), nr = nrm(vUv + vec2(px.x, 0.0));
            vec3 nu = nrm(vUv + vec2(0.0, px.y)), nd = nrm(vUv - vec2(0.0, px.y));
            float nd1 = (1.0 - dot(n, nl)) + (1.0 - dot(n, nr)) + (1.0 - dot(n, nu)) + (1.0 - dot(n, nd));
            // only light the edge pixel whose surface turns toward the key light (up/left)
            float towardLight = step(0.0, dot(n - (nl + nr + nu + nd) * 0.25, vec3(-0.35, 1.0, 0.25)));
            float nearSide = step(-0.02 * d, min(min(dl, dr), min(du, dd)) - d);
            edgeLight = step(0.55, nd1) * towardLight * nearSide;
          }
          col *= 1.0 - isOutline * outline;
          col *= 1.0 + edgeLight * edge;
        }

        col += (texture2D(tBloomA, vUv).rgb * 0.6 + texture2D(tBloomB, vUv).rgb * 0.8) * bloom;

        col *= exposure;
        col = tone > 1.5 ? softTone(col) : tone > 0.5 ? aces(col) : clamp(col, 0.0, 1.0);
        col = toSRGB(col);
        // grade
        col = col * gain + lift * (1.0 - col);
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, saturation);
        col = (col - 0.5) * contrast + 0.5;
        // vignette
        vec2 q = vUv - 0.5;
        q.x *= resolution.x / resolution.y;
        col *= 1.0 - vignette * smoothstep(0.35, 1.05, length(q));
        // dithered quantization (crunchy pixel-art light falloff)
        if (dither > 0.0) {
          float b = bayer4(gl_FragCoord.xy) * dither;
          col = floor(col * levels + 0.5 + b) / levels;
        }
        col = mix(col, flashColor, flash);
        col = mix(col, fadeColor, fade);
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
}
