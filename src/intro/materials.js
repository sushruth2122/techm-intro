import * as THREE from 'three';
import { rng } from './shapes.js';
import { ACCENT } from '../brand.js';

const accent = new THREE.Color(ACCENT);

// Shared GLSL for the DCMesh heat anomalies and the predictive scan. Anything in
// world space within a heat zone glows red until the scan line has passed it.
const fxDecl = /* glsl */ `
  uniform float uScanX, uScanOn, uHeatOn, uWhite;
  uniform vec4 uHeat[3];
  const vec3 CYAN = vec3(0.0, 0.69, 1.0);
  const vec3 RED = vec3(0.77, 0.01, 0.04);
  const vec3 ACCENT = vec3(${accent.r}, ${accent.g}, ${accent.b});
  const vec3 GREEN = vec3(0.01, 0.77, 0.36);
  vec3 applyFx(vec3 col, vec3 p, out float band) {
    float heat = 0.0;
    for (int i = 0; i < 3; i++) {
      vec3 d = p - uHeat[i].xyz;
      heat += exp(-dot(d, d) / (uHeat[i].w * uHeat[i].w));
    }
    heat = min(heat, 1.0) * uHeatOn;
    float scanned = 1.0 - smoothstep(uScanX - 0.2, uScanX + 0.2, p.x);
    col = mix(col, RED * 2.0, heat * (1.0 - scanned));
    col = mix(col, GREEN * 1.4, heat * scanned * 0.8);
    band = exp(-pow((p.x - uScanX) * 4.0, 2.0)) * uScanOn;
    col += CYAN * band * 0.9;
    return mix(col, vec3(1.0), uWhite);
  }
`;

// ------------------------------------------------------------------ morphing particles

const morphVert = /* glsl */ `
  uniform float uProgress, uSpread, uDur, uRandDelay, uArc, uBias, uBurst, uTime, uEaseOut;
  uniform float uSize, uScale, uFixed, uFixedPx, uTransit, uJitter;
  uniform vec3 uOrigin, uBurstCenter;
  attribute vec3 aFrom, aTo, aColFrom, aColTo;
  attribute float aRand, aSize;
  varying vec3 vColor;
  ${fxDecl}
  void main() {
    // Particles nearer the origin (where the data packet lands) set off first.
    float delay = min(length(aTo - uOrigin) * uSpread + aRand * uRandDelay, 1.0 - uDur);
    float t = clamp((uProgress - delay) / uDur, 0.0, 1.0);
    float e = t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5;
    e = mix(e, 1.0 - pow(1.0 - t, 4.0), uEaseOut);
    vec3 away = aFrom - uBurstCenter;
    away /= max(length(away), 1e-3);
    vec3 ctrl = mix(aFrom, aTo, uBias) + vec3(0.0, uArc * (0.6 + 0.8 * aRand), 0.0) + away * uBurst * (0.4 + aRand);
    vec3 p = mix(mix(aFrom, ctrl, e), mix(ctrl, aTo, e), e);
    float ph = aRand * 6.2831;
    p += vec3(sin(uTime * 1.7 + ph * 7.0), cos(uTime * 1.3 + ph * 5.0), sin(uTime * 1.1 + ph * 3.0)) * uJitter;

    // In flight, particles read as accent / cyan data streams.
    float transit = sin(3.14159 * t) * uTransit;
    vec3 col = mix(aColFrom, aColTo, e);
    col = mix(col, (fract(aRand * 7.31) > 0.55 ? CYAN : ACCENT) * 1.6, transit);
    float band;
    vColor = applyFx(col, p, band);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float px = aSize * uSize * (1.0 + band * 1.2 + transit * 0.5) * uScale / -mv.z;
    gl_PointSize = max(mix(px, aSize * uFixedPx, uFixed), 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const dotFrag = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor * exp(-d * 3.5) * uOpacity, 1.0);
  }
`;

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

export function morphMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uSpread: { value: 0 },
      uDur: { value: 0.5 },
      uRandDelay: { value: 0.2 },
      uArc: { value: 0 },
      uBias: { value: 0.5 },
      uBurst: { value: 0 },
      uEaseOut: { value: 0 },
      uOrigin: { value: new THREE.Vector3() },
      uBurstCenter: { value: new THREE.Vector3() },
      uSize: { value: 0.035 },
      uFixed: { value: 0 },
      uFixedPx: { value: 2 },
      uTransit: { value: 0 },
      uJitter: { value: 0 },
      uWhite: { value: 0 },
      uOpacity: { value: 1 },
      ...shared,
    },
    vertexShader: morphVert,
    fragmentShader: dotFrag,
    ...additive,
  });
}

export const state = ({ pos, col }) => ({
  pos: new THREE.BufferAttribute(pos, 3),
  col: new THREE.BufferAttribute(col, 3),
});

export class MorphPoints extends THREE.Points {
  constructor(count, material, seed) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const r = rng(seed);
    const rand = new Float32Array(count), size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      rand[i] = r();
      size[i] = r() < 0.03 ? 2.2 : 0.7 + r() * 0.6;
    }
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    super(g, material);
    this.frustumCulled = false;
  }

  get u() {
    return this.material.uniforms;
  }

  bind(from, to) {
    const g = this.geometry;
    if (this.from !== from) {
      g.setAttribute('aFrom', from.pos);
      g.setAttribute('aColFrom', from.col);
      this.from = from;
    }
    if (this.to !== to) {
      g.setAttribute('aTo', to.pos);
      g.setAttribute('aColTo', to.col);
      this.to = to;
    }
  }
}

// ------------------------------------------------------------------ glow points (packets, nodes)

const glowVert = /* glsl */ `
  uniform float uScale;
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(aSize * uScale / -mv.z, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const glowFrag = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    float a = exp(-d * 14.0) * 1.6 + exp(-d * 3.0) * 0.35;
    gl_FragColor = vec4(vColor * a * uOpacity, 1.0);
  }
`;

export class GlowPoints extends THREE.Points {
  constructor(n, shared) {
    const g = new THREE.BufferGeometry();
    const dyn = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', dyn(new Float32Array(n * 3), 3));
    g.setAttribute('aColor', dyn(new Float32Array(n * 3), 3));
    g.setAttribute('aSize', dyn(new Float32Array(n), 1));
    super(g, new THREE.ShaderMaterial({
      uniforms: { uScale: shared.uScale, uOpacity: { value: 1 } },
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      ...additive,
    }));
    this.frustumCulled = false;
  }

  set(i, p, c, size) {
    const a = this.geometry.attributes;
    a.position.setXYZ(i, p.x, p.y, p.z);
    a.aColor.setXYZ(i, c[0], c[1], c[2]);
    a.aSize.setX(i, size);
  }

  commit() {
    const a = this.geometry.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ looping particle flows

// Particles that endlessly travel from `position` to `aEnd`, fading in and out.
export class FlowPoints extends THREE.Points {
  constructor({ start, end, seed }, shared, color) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(start, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    super(g, new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uScale: shared.uScale, uOpacity: { value: 0 }, uColor: { value: new THREE.Vector3(...color) } },
      vertexShader: /* glsl */ `
        uniform float uTime, uScale, uOpacity;
        attribute vec3 aEnd;
        attribute float aSeed;
        varying float vA;
        void main() {
          float s = fract(uTime * (0.45 + aSeed * 0.35) + aSeed * 7.0);
          vec3 p = mix(position, aEnd, s);
          p.y += sin(s * 6.2831 + aSeed * 20.0) * 0.08;
          vA = sin(3.14159 * s) * uOpacity;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = max(0.06 * uScale / -mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c) * 4.0;
          if (d > 1.0) discard;
          gl_FragColor = vec4(uColor * exp(-d * 3.0) * vA, 1.0);
        }
      `,
      ...additive,
    }));
    this.frustumCulled = false;
  }
}

// ------------------------------------------------------------------ wireframe structures

export function linesMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: { uReveal: { value: -1 }, uOpacity: { value: 0.5 }, uWhite: { value: 0 }, ...shared },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      varying vec3 vColor;
      varying vec3 vPos;
      void main() {
        vColor = aColor;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uReveal, uOpacity;
      varying vec3 vColor;
      varying vec3 vPos;
      ${fxDecl}
      void main() {
        float edge = uReveal - vPos.y;
        if (edge < 0.0) discard;
        // Structures build bottom-up with a bright leading edge.
        vec3 col = vColor + CYAN * exp(-edge * 4.0) * 1.4;
        float band;
        col = applyFx(col, vPos, band);
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }
    `,
    ...additive,
  });
}

// ------------------------------------------------------------------ data-fabric floor grid

export function floorMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uReveal: { value: 0 },
      uRing: { value: 0 },
      uOpacity: { value: 1 },
      uFade: { value: 30 },
      uTime: shared.uTime,
      uScanX: shared.uScanX,
      uScanOn: shared.uScanOn,
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uReveal, uRing, uOpacity, uFade, uTime, uScanX, uScanOn;
      varying vec2 vP;
      float grid(vec2 p, float s, float w) {
        vec2 q = p / s;
        vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
        return 1.0 - min(min(g.x, g.y) / w, 1.0);
      }
      void main() {
        float r = length(vP);
        float g1 = grid(vP, 1.0, 1.0);
        float g4 = grid(vP, 4.0, 1.4);
        float shown = 1.0 - smoothstep(uReveal - 1.2, uReveal, r);
        float fade = 1.0 - smoothstep(uFade * 0.35, uFade, r);
        vec3 minor = vec3(0.012, 0.05, 0.15);
        vec3 major = vec3(0.0, 0.22, 0.46);
        vec3 col = (minor * g1 + major * g4) * shown * fade;
        float ring = exp(-pow((r - uReveal) * 1.4, 2.0)) * uRing;
        col += vec3(0.5, 0.75, 1.0) * ring * (0.35 + g1 + g4);
        float pulse = smoothstep(0.92, 1.0, fract(r * 0.12 - uTime * 0.35)) * g4 * shown * fade;
        col += major * pulse * 1.5;
        col += vec3(0.0, 0.69, 1.0) * exp(-pow((vP.x - uScanX) * 8.0, 2.0)) * uScanOn * fade * 0.6;
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }
    `,
    ...additive,
  });
}

// ------------------------------------------------------------------ campus AI beams

export function beamMaterial(shared, color) {
  return new THREE.ShaderMaterial({
    uniforms: { uDraw: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Vector3(...color) }, uTime: shared.uTime },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDraw, uOpacity, uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float x = vUv.x;
        if (x > uDraw) discard;
        float head = exp(-pow((uDraw - x) * 18.0, 2.0)) * step(uDraw, 0.999);
        float dash = smoothstep(0.55, 1.0, fract(x * 7.0 - uTime * 2.2));
        vec3 col = uColor * (0.3 + dash * 0.8) + vec3(1.0) * head * 1.2;
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }
    `,
    ...additive,
  });
}

// ------------------------------------------------------------------ globe arcs

export function arcMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: { uDraw: { value: 0 }, uOpacity: { value: 0 }, uTime: shared.uTime },
    vertexShader: /* glsl */ `
      attribute float aS, aPhase;
      attribute vec3 aColor;
      varying float vS, vPhase;
      varying vec3 vColor;
      void main() {
        vS = aS; vPhase = aPhase; vColor = aColor;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDraw, uOpacity, uTime;
      varying float vS, vPhase;
      varying vec3 vColor;
      void main() {
        if (vS > uDraw) discard;
        float pulse = exp(-pow((fract(vS - uTime * 0.45 + vPhase) - 0.5) * 9.0, 2.0));
        gl_FragColor = vec4(vColor * (0.3 + pulse * 1.6) * uOpacity, 1.0);
      }
    `,
    ...additive,
  });
}

// ------------------------------------------------------------------ panels & scanner

export function panelMaterial(shared, w, h) {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) }, uTime: shared.uTime },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity, uTime;
      uniform vec2 uSize;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * uSize;
        float edge = min(min(p.x, uSize.x - p.x), min(p.y, uSize.y - p.y));
        float scan = 0.5 + 0.5 * sin(p.y * 40.0 - uTime * 4.0);
        vec3 col = vec3(0.01, 0.04, 0.1) * (0.8 + 0.2 * scan) + vec3(0.0, 0.5, 1.0) * exp(-edge * 6.0) * 0.8;
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }
    `,
    side: THREE.DoubleSide,
    ...additive,
  });
}

export function scannerMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTime: shared.uTime },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity, uTime;
      varying vec2 vUv;
      void main() {
        float lines = 0.5 + 0.5 * sin(vUv.y * 90.0 - uTime * 30.0);
        float edges = exp(-vUv.y * 40.0) + exp(-(1.0 - vUv.y) * 40.0);
        float sides = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
        vec3 col = vec3(0.0, 0.55, 1.0) * (0.035 + 0.03 * lines + edges * 0.6) * sides;
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }
    `,
    side: THREE.DoubleSide,
    ...additive,
  });
}

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
