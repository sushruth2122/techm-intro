import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { T, SCENE, sceneStart, CUES, span, lerp, ease, clamp01 } from './timeline.js';
import { STORY } from './story.js';
import { POOL, GLOBE_N, PAL, rng, sparkShape, gridShape, globeShape, globeGrid, globeArcs } from './shapes.js';
import { MorphPoints, GlowPoints, state, morphMaterial, floorMaterial, arcMaterial, glowTexture } from './materials.js';
import { buildScenes } from './scenes.js';
import { PORTALS, LOOP_DWELL } from '../config.js';
import { ACCENT } from '../brand.js';

const FOV = 42;
const BLOOM = 0.95;
const HUB_WIDEN = 1.15; // pull back a little once the side links frame the scene
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pose = () => ({ pos: new THREE.Vector3(), tgt: new THREE.Vector3() });

const SPARK = V(0, 1.2, 0);
const SPARK_CAM = [
  [0.0, [0, 2.2, 15], [0, 1.2, 0]],
  [1.9, [0, 2.5, 14], [0, 1.2, 0]],
  [3.0, [0.5, 8.5, 17], [0, 0.6, 0]],
];

// The city sits on the globe's surface at 35° latitude, so pulling the camera back
// reveals it as a tiny lit city on a much larger world.
const GLOBE_R = 60;
const GLOBE_LAT = THREE.MathUtils.degToRad(35);
const GLOBE_C = V(0, -GLOBE_R * Math.cos(GLOBE_LAT), -GLOBE_R * Math.sin(GLOBE_LAT));
const GLOBE_VIEW = { dir: V(0, Math.sin(0.44), Math.cos(0.44)), dist: 230 };

const LINK_TONES = [PAL.cyan, PAL.blue, PAL.accent, PAL.cyan, PAL.blue, PAL.accent, PAL.cyan, PAL.accent];
const CYAN = [0, 0.69, 1], ACCENT_LIN = new THREE.Color(ACCENT).toArray();

function bezier(a, b, lift, s, out) {
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 + lift, cz = (a.z + b.z) / 2;
  const u = 1 - s;
  return out.set(u * u * a.x + 2 * u * s * cx + s * s * b.x, u * u * a.y + 2 * u * s * cy + s * s * b.y, u * u * a.z + 2 * u * s * cz + s * s * b.z);
}

// Blend two camera poses with a log-scale distance, so big zooms feel even.
function logBlend(a, b, e, tgtEase, out) {
  const da = a.pos.distanceTo(a.tgt), db = b.pos.distanceTo(b.tgt);
  const dir = a.pos.clone().sub(a.tgt).normalize().lerp(b.pos.clone().sub(b.tgt).normalize(), e).normalize();
  out.tgt.lerpVectors(a.tgt, b.tgt, tgtEase(e));
  out.pos.copy(out.tgt).addScaledVector(dir, Math.exp(lerp(Math.log(da), Math.log(db), e)));
  return out;
}

// A glowing head with a comet trail, flown along a bezier hop.
class Packet {
  constructor(color, shared, n = 26, head = 0.55) {
    this.n = n;
    this.color = color;
    this.head = head;
    this.pts = new GlowPoints(n, shared);
    this.tmp = new THREE.Vector3();
  }

  track(t, seg) {
    this.pts.visible = t >= seg.at[0] - 0.02 && t <= seg.at[1] + 0.35;
    if (!this.pts.visible) return;
    for (let i = 0; i < this.n; i++) {
      const s = seg.ease(span(t - i * 0.012, seg.at));
      const k = 1 - i / this.n;
      const c = i === 0 ? [1.4, 1.6, 1.8] : this.color.map((v) => v * k * 1.4);
      this.pts.set(i, bezier(seg.a, seg.b, seg.lift, s, this.tmp), c, i === 0 ? this.head : this.head * 0.6 * k);
    }
    this.pts.commit();
    this.pts.material.uniforms.uOpacity.value = clamp01((t - seg.at[0]) / 0.08) * (1 - clamp01((t - seg.at[1]) / 0.35));
  }
}

export class Intro {
  constructor({ canvas, overlay, stage, linkRects, onReveal, onDone, onScene }) {
    this.overlay = overlay;
    this.stage = stage;
    this.linkRects = linkRects;
    this.onReveal = onReveal;
    this.onDone = onDone;
    this.onScene = onScene;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    // Pure black: the composer's linear render target would brighten any tinted clear colour.
    this.renderer.setClearColor(0x000000, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 2000);
    this.scene.add(this.camera); // the shattering globe rides along in camera space
    this.camTgt = new THREE.Vector3();
    this.raw = pose(); // camera pose before screen-fit adjustments
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM, 0.4, 0.06);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.build();
    this.bindOverlay();
    this.resize();
    addEventListener('resize', () => this.resize());

    this.mode = 'idle';
    this.t = 0;
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  get playing() {
    return this.mode === 'intro';
  }

  // ------------------------------------------------------------------ setup

  build() {
    const sh = (this.shared = {
      uTime: { value: 0 },
      uScale: { value: 1000 },
      uScanX: { value: -99 },
      uScanOn: { value: 0 },
      uHeatOn: { value: 0 },
      uHeat: { value: [0, 1, 2].map(() => new THREE.Vector4(0, -99, 0, 1)) },
    });

    this.pivot = new THREE.Group();
    this.pivot.position.copy(GLOBE_C);
    this.scene.add(this.pivot);
    this.world = new THREE.Group();
    this.world.position.copy(GLOBE_C).negate();
    this.pivot.add(this.world);
    const world = this.world;

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), floorMaterial(sh));
    this.floor.rotation.x = -Math.PI / 2;
    world.add(this.floor);

    const glowTex = glowTexture();
    this.scenes = buildScenes({ world, sh, glowTex });

    const S = (this.S = { spark: state(sparkShape()), grid: state(gridShape()) });
    this.pool = new MorphPoints(POOL, morphMaterial(sh), 7);
    world.add(this.pool);
    const scenes = this.scenes;
    const seg = (at, from, to, sc, extra = {}) => ({ at, from, to, origin: sc.origin, spread: sc.spread ?? 0.04, arc: sc.arc, burst: 0, transit: 0.9, ...extra });
    this.poolSegs = [
      { at: T.grid, from: S.spark, to: S.grid, origin: SPARK, spread: 0.03, arc: 1.6, burst: 2.5, transit: 0.5 },
      ...scenes.map((sc, i) => seg([sceneStart(i), sceneStart(i) + SCENE.morph], i ? scenes[i - 1].state : S.grid, sc.state, sc)),
      seg(T.outro.remorph, scenes[scenes.length - 1].state, scenes[0].state, scenes[0]),
    ];
    // Double-buffered snapshots let the loop morph from wherever the particles are now.
    const mk = (n) => state({ pos: new Float32Array(n * 3), col: new Float32Array(n * 3) });
    this.snaps = [mk(POOL), mk(POOL)];
    this.snapI = 0;

    // Phase 1 pulses, the spark, and the packet that lands the first scene
    const accel = (x) => x * x;
    this.pulseL = new Packet(PAL.accent, sh);
    this.pulseR = new Packet(PAL.cyan, sh);
    this.packet = new Packet(PAL.cyan, sh, 26, 0.45);
    world.add(this.pulseL.pts, this.pulseR.pts, this.packet.pts);
    this.pulseLSeg = { at: T.pulses, a: V(-10, 1.2, 0), b: SPARK, lift: 0, ease: accel };
    this.pulseRSeg = { at: T.pulses, a: V(10, 1.2, 0), b: SPARK, lift: 0, ease: accel };
    this.packetSeg = { at: T.packet, a: SPARK, b: scenes[0].origin, lift: 2.0, ease: ease.inOut };
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color().setRGB(1.8, 1.6, 1.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.flash.position.copy(SPARK);
    world.add(this.flash);

    // Globe: dotted world, lat/long graticule and arcs out of the city
    S.globe = state(globeShape(GLOBE_R));
    this.globe = new MorphPoints(GLOBE_N, morphMaterial(sh), 17);
    this.globe.bind(S.globe, S.globe);
    this.globe.u.uSize.value = 0.7;
    this.pivot.add(this.globe);
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    const gl = new THREE.BufferGeometry();
    gl.setAttribute('position', new THREE.BufferAttribute(globeGrid(GLOBE_R * 1.002), 3));
    this.latlon = new THREE.LineSegments(gl, new THREE.LineBasicMaterial({ color: new THREE.Color('#2f6bff'), opacity: 0, ...add }));
    this.pivot.add(this.latlon);
    const arcs = globeArcs(GLOBE_R, this.world.position.toArray());
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(arcs.pos, 3));
    ag.setAttribute('aS', new THREE.BufferAttribute(arcs.s, 1));
    ag.setAttribute('aPhase', new THREE.BufferAttribute(arcs.phase, 1));
    ag.setAttribute('aColor', new THREE.BufferAttribute(arcs.col, 3));
    this.arcs = new THREE.LineSegments(ag, arcMaterial(sh));
    this.pivot.add(this.arcs);
    this.X = { from: mk(GLOBE_N), to: mk(GLOBE_N) };
  }

  bindOverlay() {
    const o = this.overlay;
    this.cues = [...o.querySelectorAll('[data-cue]')].map((el) => ({ el, at: CUES[el.dataset.cue], on: false }));
    const tour = o.querySelector('[data-tour]');
    tour.innerHTML = PORTALS.map((p, i) => `<span><b>${String(i + 1).padStart(2, '0')}</b>${p.short ?? p.title}</span>`).join('');
    this.steps = [...tour.children].map((el, i) => ({ el, at: [sceneStart(i), sceneStart(i + 1)], on: false }));
    this.countEl = o.querySelector('[data-count]');
    this.progressEl = o.querySelector('[data-progress]');
    this.flashEl = o.querySelector('[data-flash]');

    const st = this.stage;
    this.cap = {
      el: st.querySelector('[data-caption]'),
      num: st.querySelector('[data-cap-num]'),
      kicker: st.querySelector('[data-cap-kicker]'),
      title: st.querySelector('[data-cap-title]'),
      hot: st.querySelector('[data-cap-hot]'),
      i: -1,
      on: false,
    };
    const layer = st.querySelector('[data-callouts]');
    this.callouts = STORY.map((s, si) => s.callouts.map((c, k) => {
      const el = document.createElement('div');
      el.className = 'callout';
      el.dataset.tone = c.tone;
      el.dataset.side = c.side || 'c';
      el.style.setProperty('--lift', `${c.lift || 48}px`);
      el.innerHTML = '<i class="co-ping"></i><i class="co-dot"></i><i class="co-line"></i><div class="co-box"><b></b><span></span></div>';
      const title = el.querySelector('b'), sub = el.querySelector('span');
      title.textContent = c.title;
      sub.textContent = c.sub;
      layer.append(el);
      return { ...c, title0: c.title, sub0: c.sub, el, title, sub, p: V(...c.p), at: SCENE.callout + k * SCENE.stagger, on: false, ok: false };
    }));
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const dpr = (this.dpr = Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.shared.uScale.value = (h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    // Pull the camera back on narrow screens so structures stay in frame; the scene is then
    // denser on screen, so bloom is eased off to keep it from hazing over.
    this.fit = w / h < 1.4 ? Math.pow(1.4 / (w / h), 0.9) : 1;
    this.bloomK = Math.min(1, 0.3 + 0.5 * (w / h));
    if (this.mode === 'idle') this.renderOnce = true;
  }

  // ------------------------------------------------------------------ public control

  play() {
    this.mode = 'intro';
    this.still = false;
    this.t = 0;
    this.baked = false;
    this.revealed = false;
    this.poolSeg = -1;
    this.loop = null;
    this.world.add(this.pool);
    this.pool.visible = true;
    this.resetGlobe();
    this.pivot.rotation.set(0, 0, 0);
    this.resetStage();
    for (const c of [...this.cues, ...this.steps]) {
      c.on = false;
      c.el.classList.remove('on');
    }
    this.overlay.classList.add('on');
    this.stage.classList.add('on');
  }

  skip() {
    this.held = null;
    this.finish(true);
  }

  // Dev aid: freeze the intro on one moment (`?at=<seconds>`), or pass null to resume.
  hold(t) {
    this.held = t;
  }

  // Start straight on the scene loop (repeat visits, reduced motion).
  startLoop({ still = false } = {}) {
    this.still = still;
    this.stage.classList.add('on');
    this.enterLoop({ fromIntro: false, cold: true });
  }

  // Hovering a dashboard link shows its scene and pauses the auto-advance.
  preview(i) {
    if (!this.loop) return;
    this.loop.paused = true;
    this.goTo(i);
  }

  resume() {
    if (this.loop) this.loop.paused = false;
  }

  finish(skipped) {
    if (this.mode !== 'intro') return;
    if (!this.revealed) {
      this.revealed = true;
      this.onReveal?.({ skipped });
    }
    this.overlay.classList.remove('on');
    this.flashEl.style.opacity = '0';
    this.enterLoop({ fromIntro: !skipped });
    this.onDone?.();
  }

  // ------------------------------------------------------------------ loop

  frame(now) {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    if (this.mode === 'intro') {
      this.t = this.held ?? this.t + dt;
      this.update(this.t);
      if (this.t >= T.total && this.held == null) this.finish(false);
    } else if (this.mode === 'loop') {
      this.updateLoop(this.still ? 0 : dt);
    } else if (!this.renderOnce) return;
    this.renderOnce = false;
    this.composer.render();
    if (this.still) this.mode = 'idle';
  }

  update(t) {
    this.shared.uTime.value = t;
    this.cameraAt(t);
    this.updateSpark(t);
    this.updatePool(t);
    this.updateScenes(t);
    this.updateOutro(t);
    this.updateOverlay(t);
    const i = Math.min(SCENE.count - 1, Math.max(0, Math.floor((t - SCENE.start) / SCENE.dur)));
    const active = t >= SCENE.start && t < sceneStart(SCENE.count);
    this.updateStage(i, t - sceneStart(i), active, false);
  }

  scenePose(i, k, out) {
    const { cam } = this.scenes[i];
    const e = ease.inOut(clamp01(k));
    out.pos.lerpVectors(cam[0].pos, cam[1].pos, e);
    out.tgt.lerpVectors(cam[0].tgt, cam[1].tgt, e);
    return out;
  }

  sparkPose(t, out) {
    let i = 0;
    while (i < SPARK_CAM.length - 2 && t >= SPARK_CAM[i + 1][0]) i++;
    const [t0, p0, g0] = SPARK_CAM[i], [t1, p1, g1] = SPARK_CAM[i + 1];
    const e = ease.inOut(span(t, [t0, t1]));
    out.pos.lerpVectors(V(...p0), V(...p1), e);
    out.tgt.lerpVectors(V(...g0), V(...g1), e);
    return out;
  }

  // The globe pose at the end of the zoom-out (with the slight push-in during the spin).
  globePose(t, out) {
    const o = T.outro;
    const tz = Math.min(t, o.shatter[0]);
    const from = this.scenePose(SCENE.count - 1, 1, pose());
    const to = { tgt: GLOBE_C.clone(), pos: GLOBE_C.clone().addScaledVector(GLOBE_VIEW.dir, GLOBE_VIEW.dist * (1 - 0.07 * ease.inOut(span(tz, [o.zoom[1], o.shatter[0]])))) };
    return logBlend(from, to, ease.inOut(span(tz, o.zoom)), (e) => e * e, out);
  }

  loopPose(i, local, out) {
    return this.scenePose(i, local / Math.max(LOOP_DWELL, SCENE.dur), out);
  }

  applyCamera(widen) {
    const { pos, tgt } = this.raw;
    const k = this.fit * lerp(1, HUB_WIDEN, widen);
    this.camera.position.copy(pos).sub(tgt).multiplyScalar(k).add(tgt);
    this.camTgt.copy(tgt);
    // On portrait screens the links fill the lower half, so aim lower to lift the scene up.
    if (this.camera.aspect < 0.8) this.camTgt.y -= this.camera.position.distanceTo(tgt) * 0.1 * widen;
    this.camera.lookAt(this.camTgt);
    this.camera.updateMatrixWorld();
  }

  cameraAt(t) {
    const raw = this.raw, o = T.outro;
    let widen = 0;
    if (t < SCENE.start) {
      this.sparkPose(t, raw);
    } else if (t < o.zoom[0]) {
      const i = Math.min(SCENE.count - 1, Math.floor((t - SCENE.start) / SCENE.dur));
      const local = t - sceneStart(i);
      const prev = i ? this.scenePose(i - 1, 1, pose()) : this.sparkPose(SCENE.start, pose());
      const cur = this.scenePose(i, local / SCENE.dur, pose());
      const b = ease.inOut(span(local, [0, SCENE.morph + 0.2]));
      raw.pos.lerpVectors(prev.pos, cur.pos, b);
      raw.tgt.lerpVectors(prev.tgt, cur.tgt, b);
    } else if (t < o.dive[0]) {
      this.globePose(t, raw);
    } else {
      // dive back down into the city, landing on the loop's first scene
      const e = ease.inOut(span(t, o.dive));
      logBlend(this.globePose(o.shatter[0], pose()), this.loopPose(0, SCENE.morph, pose()), e, (x) => 1 - (1 - x) * (1 - x), raw);
      widen = e;
    }
    if (t > T.spark && t < T.spark + 1) {
      const a = 0.12 * Math.exp(-(t - T.spark) * 5);
      raw.pos.x += Math.sin(t * 90) * a;
      raw.pos.y += Math.cos(t * 77) * a;
    }
    this.applyCamera(widen);
  }

  // ------------------------------------------------------------------ intro phases

  updateSpark(t) {
    this.pulseL.track(t, this.pulseLSeg);
    this.pulseR.track(t, this.pulseRSeg);
    this.packet.track(t, this.packetSeg);

    const fm = this.flash.material;
    if (t < T.spark) {
      const pre = span(t, [1.5, T.spark]);
      this.flash.scale.setScalar(0.5 + pre * 1.5);
      fm.opacity = pre * pre * 0.6;
    } else {
      const s = span(t, [T.spark, T.spark + 0.6]);
      this.flash.scale.setScalar(2 + 9 * ease.out(s));
      fm.opacity = Math.pow(1 - s, 3);
    }
    this.flash.visible = fm.opacity > 0.001;

    const o = T.outro, z0 = o.zoom[0];
    const f = this.floor.material.uniforms;
    f.uReveal.value = 36 * ease.out(span(t, [T.spark, 3.3]));
    f.uRing.value = t < T.spark ? 0 : 1 - span(t, [2.7, 3.4]);
    f.uOpacity.value = 1 - span(t, [z0 + 0.1, z0 + 0.8]) + span(t, [o.remorph[0], o.remorph[0] + 0.8]);
    this.floor.visible = f.uOpacity.value > 0;

    const s0 = o.shatter[0];
    this.bloom.strength = this.bloomK * (BLOOM
      + 1.6 * Math.exp(-Math.pow((t - T.spark - 0.05) / 0.14, 2))
      + 1.5 * span(t, o.white) * (1 - span(t, [s0, s0 + 0.5])));
  }

  applySeg(m, seg) {
    m.bind(seg.from, seg.to);
    const u = m.u;
    u.uOrigin.value.copy(seg.origin);
    u.uBurstCenter.value.copy(seg.origin);
    u.uSpread.value = seg.spread;
    u.uDur.value = 0.4;
    u.uRandDelay.value = 0.2;
    u.uArc.value = seg.arc;
    u.uBias.value = 0.5;
    u.uBurst.value = seg.burst;
    u.uEaseOut.value = 0;
    u.uTransit.value = seg.transit;
  }

  updatePool(t) {
    const segs = this.poolSegs;
    let k = 0;
    for (let i = 0; i < segs.length; i++) if (t >= segs[i].at[0]) k = i;
    if (k !== this.poolSeg) {
      this.applySeg(this.pool, segs[k]);
      this.poolSeg = k;
    }
    const u = this.pool.u, o = T.outro;
    u.uProgress.value = span(t, segs[k].at);
    u.uOpacity.value = t < T.spark ? 0 : 1;
    u.uJitter.value = 0.006;
    u.uFixed.value = 0;
    // the city glows brighter as it shrinks onto the globe, whitens with it, then recovers
    u.uSize.value = 0.035 * (1 + 1.5 * span(t, [o.zoom[0] + 0.2, o.zoom[0] + 1.2]) * (1 - span(t, o.dive)));
    u.uWhite.value = t < o.shatter[0] ? ease.in(span(t, o.white)) : 1 - span(t, [o.shatter[0] + 0.1, o.remorph[0]]);
  }

  updateScenes(t) {
    this.scenes.forEach((sc, i) => {
      const local = t - sceneStart(i);
      const live = local >= 0 && local < SCENE.dur;
      sc.update(local, live ? span(local, [0.3, 0.6]) * (1 - span(local, [SCENE.dur - 0.25, SCENE.dur])) : 0);
    });
  }

  updateOutro(t) {
    const o = T.outro;
    if (!this.baked) {
      const g = ease.inOut(span(t, o.globe));
      const gu = this.globe.u;
      gu.uOpacity.value = g;
      gu.uWhite.value = ease.in(span(t, o.white));
      this.globe.visible = g > 0;
      const lines = 1 - span(t, [o.white[0] + 0.05, o.shatter[0]]);
      this.latlon.material.opacity = 0.2 * g * lines;
      this.latlon.visible = g > 0;
      const au = this.arcs.material.uniforms;
      au.uDraw.value = span(t, o.arcs);
      au.uOpacity.value = g * lines;
      this.arcs.visible = au.uDraw.value > 0;
      // two full turns, so the city is back where it started for the dive
      this.pivot.rotation.y = 4 * Math.PI * ease.in(span(t, o.spin));
      if (t >= o.shatter[0]) this.bakeShatter();
    }
    if (this.baked) {
      this.pivot.rotation.y = 0;
      this.latlon.visible = this.arcs.visible = false;
      const u = this.globe.u;
      u.uProgress.value = span(t, o.shatter);
      u.uFixed.value = ease.inOut(span(t, [o.shatter[0], o.shatter[0] + 0.5]));
      u.uWhite.value = 1 - ease.out(span(t, [o.shatter[0] + 0.02, o.shatter[0] + 0.55]));
      u.uOpacity.value = 1 - span(t, [o.shatter[1] + 0.05, o.shatter[1] + 0.5]);
      this.globe.visible = u.uOpacity.value > 0;
    }
    const s0 = o.shatter[0];
    const f = t < s0 ? span(t, [s0 - 0.18, s0]) : 1 - span(t, [s0, s0 + 0.3]);
    this.flashEl.style.opacity = (0.85 * ease.inOut(f)).toFixed(3);
    if (t >= o.links && !this.revealed) {
      this.revealed = true;
      this.onReveal?.({ skipped: false });
    }
  }

  // The globe breaks into fragments that fly to the dashboard links, landing on each
  // link's outline. They travel in camera space, so they stay on target while the camera
  // dives back into the city.
  bakeShatter() {
    this.baked = true;
    this.scene.updateMatrixWorld(true);
    const cam = this.camera;
    const W = innerWidth, H = innerHeight;
    let rects = this.linkRects?.() || [];
    if (!rects.length) rects = [{ x: W * 0.3, y: H * 0.3, w: W * 0.4, h: H * 0.4 }];
    const n = rects.length;
    const D = cam.position.distanceTo(GLOBE_C) * 0.45;
    const k = (2 * D * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / H;
    const r = rng(5);
    const v = new THREE.Vector3();

    const X = this.X, lattice = this.S.globe.pos.array;
    const toCam = new THREE.Matrix4().multiplyMatrices(cam.matrixWorldInverse, this.globe.matrixWorld);
    const gc = GLOBE_C.clone().project(cam);
    const angle = new Float32Array(GLOBE_N);
    for (let i = 0; i < GLOBE_N; i++) {
      v.fromArray(lattice, i * 3).applyMatrix4(toCam).toArray(X.from.pos.array, i * 3);
      v.fromArray(lattice, i * 3).applyMatrix4(this.globe.matrixWorld).project(cam);
      angle[i] = Math.atan2(v.y - gc.y, (v.x - gc.x) * cam.aspect);
    }
    X.from.col.array.set(this.S.globe.col.array);

    // one angular wedge of the globe per link, matched by direction from the globe's centre
    const gx = ((gc.x + 1) / 2) * W, gy = ((1 - gc.y) / 2) * H;
    const cards = rects
      .map((rect, idx) => ({ rect, idx, a: Math.atan2(gy - (rect.y + rect.h / 2), rect.x + rect.w / 2 - gx) }))
      .sort((a, b) => a.a - b.a);
    const order = [...angle.keys()].sort((a, b) => angle[a] - angle[b]);
    const pos = X.to.pos.array, col = X.to.col.array;
    order.forEach((i, j) => {
      const { rect, idx } = cards[Math.floor((j * n) / GLOBE_N)];
      let px, py;
      const edge = r() < 0.62;
      if (edge) {
        let d = r() * 2 * (rect.w + rect.h);
        if (d < rect.w) [px, py] = [rect.x + d, rect.y];
        else if ((d -= rect.w) < rect.h) [px, py] = [rect.x + rect.w, rect.y + d];
        else if ((d -= rect.h) < rect.w) [px, py] = [rect.x + rect.w - d, rect.y + rect.h];
        else [px, py] = [rect.x, rect.y + rect.h - (d - rect.w)];
      } else {
        px = rect.x + r() * rect.w;
        py = rect.y + r() * rect.h;
      }
      pos.set([(px - W / 2) * k, (H / 2 - py) * k, -D], i * 3);
      const c = LINK_TONES[idx % LINK_TONES.length], b = edge ? 1.5 : 0.35;
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    });
    for (const s of Object.values(X)) s.pos.needsUpdate = s.col.needsUpdate = true;

    cam.add(this.globe);
    this.globe.position.set(0, 0, 0);
    this.globe.rotation.set(0, 0, 0);
    this.globe.bind(X.from, X.to);
    const u = this.globe.u;
    u.uSpread.value = 0;
    u.uEaseOut.value = 1;
    u.uRandDelay.value = 0.1;
    u.uDur.value = 0.68;
    u.uArc.value = 0;
    u.uBias.value = 0.3;
    u.uBurst.value = 10;
    u.uBurstCenter.value.copy(GLOBE_C).applyMatrix4(cam.matrixWorldInverse);
    u.uTransit.value = 0;
    u.uJitter.value = 0;
    u.uFixedPx.value = 2.2 * this.dpr;
  }

  updateOverlay(t) {
    const toggle = (c, on) => {
      if (on !== c.on) {
        c.on = on;
        c.el.classList.toggle('on', on);
      }
    };
    for (const c of this.cues) toggle(c, t >= c.at[0] && t < c.at[1]);
    for (const s of this.steps) toggle(s, t >= s.at[0] && t < s.at[1]);
    const i = Math.min(SCENE.count, Math.max(1, Math.floor((t - SCENE.start) / SCENE.dur) + 1));
    this.countEl.textContent = `${String(i).padStart(2, '0')} / ${String(SCENE.count).padStart(2, '0')}`;
    this.progressEl.style.transform = `scaleX(${clamp01(t / T.total).toFixed(4)})`;
  }

  // Caption, trending keywords and pinned call-outs for the scene on screen.
  updateStage(i, local, active, looping) {
    const cap = this.cap;
    if (i !== cap.i) {
      cap.i = i;
      const s = STORY[i];
      cap.num.textContent = `${String(i + 1).padStart(2, '0')} / ${String(SCENE.count).padStart(2, '0')}`;
      cap.kicker.textContent = s.kicker;
      cap.title.innerHTML = s.title;
      cap.hot.innerHTML = s.hot.map((w, k) => `<span style="--k:${k}">${w}</span>`).join('');
    }
    const capOn = active && local >= SCENE.caption && (looping || local < SCENE.dur - 0.12);
    if (capOn !== cap.on) {
      cap.on = capOn;
      cap.el.classList.toggle('on', capOn);
    }

    this.world.updateMatrixWorld();
    const v = new THREE.Vector3();
    const scanX = this.shared.uScanX.value;
    this.callouts.forEach((list, si) => {
      for (const c of list) {
        let on = active && si === i && local >= c.at && (looping || local < SCENE.dur - 0.15);
        if (on) {
          v.copy(c.p).applyMatrix4(this.world.matrixWorld).project(this.camera);
          on = v.z < 1;
        }
        if (on !== c.on) {
          c.on = on;
          c.el.classList.toggle('on', on);
        }
        if (!on) continue;
        if (c.resolved && scanX > c.p.x !== c.ok) this.setResolved(c, scanX > c.p.x);
        c.el.style.transform = `translate(${(((v.x + 1) / 2) * innerWidth).toFixed(1)}px, ${(((1 - v.y) / 2) * innerHeight).toFixed(1)}px)`;
      }
    });
  }

  setResolved(c, ok) {
    c.ok = ok;
    c.el.dataset.tone = ok ? 'green' : c.tone;
    c.el.classList.toggle('flip', ok);
    c.title.textContent = ok ? c.resolved.title : c.title0;
    c.sub.textContent = ok ? c.resolved.sub : c.sub0;
  }

  resetStage() {
    this.cap.on = false;
    this.cap.el.classList.remove('on');
    for (const c of this.callouts.flat()) {
      c.on = false;
      c.el.classList.remove('on');
      if (c.resolved) this.setResolved(c, false);
    }
  }

  // ------------------------------------------------------------------ scene loop behind the hub

  resetGlobe() {
    this.pivot.add(this.globe);
    this.globe.position.set(0, 0, 0);
    this.globe.rotation.set(0, 0, 0);
    this.globe.bind(this.S.globe, this.S.globe);
    const u = this.globe.u;
    u.uProgress.value = 0;
    u.uBurst.value = 0;
    u.uEaseOut.value = 0;
    u.uFixed.value = 0;
    u.uWhite.value = 0;
    u.uTransit.value = 0;
    u.uJitter.value = 0;
    u.uOpacity.value = 0;
  }

  enterLoop({ fromIntro, cold = false }) {
    this.mode = 'loop';
    this.held = null;
    this.resetGlobe();
    this.globe.visible = this.latlon.visible = this.arcs.visible = false;
    this.pivot.rotation.set(0, 0, 0);
    for (const p of [this.pulseL, this.pulseR, this.packet]) p.pts.visible = false;
    this.flash.visible = false;
    const f = this.floor.material.uniforms;
    f.uReveal.value = 36;
    f.uRing.value = 0;
    f.uOpacity.value = 1;
    this.floor.visible = true;
    this.world.add(this.pool);
    this.pool.visible = true;
    const u = this.pool.u;
    u.uWhite.value = 0;
    u.uFixed.value = 0;
    u.uSize.value = 0.035;
    u.uOpacity.value = 1;
    u.uJitter.value = 0.006;
    this.bloom.strength = BLOOM * this.bloomK;

    const L = (this.loop = { cur: 0, local: SCENE.morph, clock: SCENE.morph, since: 99, prev: null, paused: false, enter: fromIntro ? 1 : 0, camFrom: pose() });
    if (cold) {
      // nothing on screen yet: start fully formed on the first scene
      this.applySeg(this.pool, { from: this.scenes[0].state, to: this.scenes[0].state, origin: this.scenes[0].origin, spread: 0.04, arc: 0, burst: 0, transit: 0 });
      if (this.still) L.local = L.clock = 3;
    } else if (!fromIntro) {
      // skipped mid-intro: morph from wherever the particles are into the first scene
      L.cur = -1;
      this.goTo(0);
    }
    if (L.cur === 0) this.onScene?.(0, LOOP_DWELL);
    this.renderOnce = true;
  }

  goTo(i) {
    const L = this.loop;
    if (!L) return;
    if (i === L.cur) {
      L.clock = Math.min(L.clock, SCENE.morph);
      return;
    }
    const snap = this.snapshot(this.pool);
    const sc = this.scenes[i];
    this.applySeg(this.pool, { from: snap, to: sc.state, origin: sc.origin, spread: sc.spread ?? 0.04, arc: sc.arc, burst: 0, transit: 0.9 });
    if (L.cur >= 0) L.prev = { i: L.cur, local: L.local, t: 0 };
    L.camFrom.pos.copy(this.raw.pos);
    L.camFrom.tgt.copy(this.raw.tgt);
    L.cur = i;
    L.local = 0;
    L.clock = 0;
    L.since = 0;
    if (this.still) L.local = L.clock = L.since = 3;
    this.onScene?.(i, LOOP_DWELL);
    this.renderOnce = true;
    if (this.still) this.mode = 'loop';
  }

  // CPU copy of the morph shader: where every particle is right now, so a new morph
  // can start from there without a jump.
  snapshot(m) {
    const u = m.u;
    const from = m.from.pos.array, to = m.to.pos.array, cf = m.from.col.array, ct = m.to.col.array;
    const rand = m.geometry.attributes.aRand.array;
    const out = this.snaps[(this.snapI ^= 1)];
    const P = out.pos.array, C = out.col.array;
    const prog = u.uProgress.value, spread = u.uSpread.value, dur = u.uDur.value, rd = u.uRandDelay.value;
    const arc = u.uArc.value, bias = u.uBias.value, eo = u.uEaseOut.value, transit = u.uTransit.value, burst = u.uBurst.value;
    const o = u.uOrigin.value, bc = u.uBurstCenter.value;
    for (let i = 0; i < rand.length; i++) {
      const j = i * 3;
      const fx = from[j], fy = from[j + 1], fz = from[j + 2], tx = to[j], ty = to[j + 1], tz = to[j + 2];
      const delay = Math.min(Math.hypot(tx - o.x, ty - o.y, tz - o.z) * spread + rand[i] * rd, 1 - dur);
      const t = clamp01((prog - delay) / dur);
      let e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      e += (1 - Math.pow(1 - t, 4) - e) * eo;
      let ax = fx - bc.x, ay = fy - bc.y, az = fz - bc.z;
      const al = Math.max(Math.hypot(ax, ay, az), 1e-3);
      const kb = (burst * (0.4 + rand[i])) / al;
      const cx = fx + (tx - fx) * bias + ax * kb, cy = fy + (ty - fy) * bias + arc * (0.6 + 0.8 * rand[i]) + ay * kb, cz = fz + (tz - fz) * bias + az * kb;
      const a = (1 - e) * (1 - e), b = 2 * e * (1 - e), c = e * e;
      P[j] = a * fx + b * cx + c * tx;
      P[j + 1] = a * fy + b * cy + c * ty;
      P[j + 2] = a * fz + b * cz + c * tz;
      const tr = Math.sin(Math.PI * t) * transit, s = (rand[i] * 7.31) % 1 > 0.55 ? CYAN : ACCENT_LIN;
      for (let q = 0; q < 3; q++) C[j + q] = (cf[j + q] + (ct[j + q] - cf[j + q]) * e) * (1 - tr) + s[q] * 1.6 * tr;
    }
    out.pos.needsUpdate = out.col.needsUpdate = true;
    return out;
  }

  updateLoop(dt) {
    const L = this.loop;
    this.shared.uTime.value += dt;
    L.local += dt;
    L.since += dt;
    L.enter = Math.min(1, L.enter + dt / 0.5);
    if (!L.paused && !this.still) {
      L.clock += dt;
      if (L.clock >= LOOP_DWELL) this.goTo((L.cur + 1) % this.scenes.length);
    }
    this.pool.u.uProgress.value = span(L.local, [0, SCENE.morph]);

    if (L.prev) L.prev.t += dt;
    this.scenes.forEach((sc, i) => {
      if (i === L.cur) return;
      if (L.prev && i === L.prev.i) sc.update(L.prev.local + L.prev.t, 1 - span(L.prev.t, [0, 0.4]));
      else sc.update(0, 0);
    });
    // the current scene runs last so its shared uniforms (DCMesh heat/scan) win
    this.scenes[L.cur].update(L.local, span(L.local, [0.3, 0.6]) * L.enter);
    if (L.prev && L.prev.t > 0.4) L.prev = null;

    const target = this.loopPose(L.cur, L.local, pose());
    const b = ease.inOut(span(L.since, [0, 1.3]));
    this.raw.pos.lerpVectors(L.camFrom.pos, target.pos, b);
    this.raw.tgt.lerpVectors(L.camFrom.tgt, target.tgt, b);
    this.applyCamera(1);
    this.updateStage(L.cur, L.local, true, true);
  }
}
