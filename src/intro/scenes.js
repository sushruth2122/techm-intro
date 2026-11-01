import * as THREE from 'three';
import { SCENE, span, lerp, ease, clamp01 } from './timeline.js';
import {
  PAL, rng, DC, DC_HOT, rackX, unitY, rackFront, CRANES, AGV_ROUTES, FACTORY, CAMPUS, FACILITY, XCEL,
  coolingFlows, dataCenterShape, portShape, factoryShape, campusShape, airportShape, retailShape, xcelShape, facilityShape,
} from './shapes.js';
import { GlowPoints, FlowPoints, state, linesMaterial, beamMaterial, scannerMaterial, panelMaterial } from './materials.js';

// One scene per dashboard. Each owns a particle target (`state`), a wireframe, a camera
// drift (`cam`, start → end pose) and its live effects, all driven by `update(local, vis)`
// where `local` is seconds since the scene began and `vis` fades it in and out.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HDR = (r, g, b) => new THREE.Color().setRGB(r, g, b);
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const RED = [1.8, 0.06, 0.12];
const GREEN = [0.05, 1.6, 0.7];
const CYAN = [0.1, 0.9, 1.6];

function scene(ctx, def) {
  const shape = def.shape();
  const group = new THREE.Group();
  ctx.world.add(group);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(shape.lines.pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(shape.lines.col, 3));
  const wire = new THREE.LineSegments(g, linesMaterial(ctx.sh));
  wire.frustumCulled = false;
  group.add(wire);
  const sc = {
    ...def,
    state: state(shape),
    group,
    origin: V(...def.origin),
    cam: def.cam.map(([p, t]) => ({ pos: V(...p), tgt: V(...t) })),
    update(local, vis) {
      group.visible = vis > 0;
      if (!group.visible) return sc.reset?.();
      wire.material.uniforms.uReveal.value = -0.3 + def.top * ease.out(span(local, SCENE.wire));
      wire.material.uniforms.uOpacity.value = 0.5 * vis;
      sc.props?.(local, vis);
    },
  };
  return sc;
}

// Pulsing glow markers (sensors, occupancy, chargers…).
function pulses(sh, items, speed = 3) {
  const pts = new GlowPoints(items.length, sh);
  const r = rng(items.length * 7 + 3);
  const phase = items.map(() => r() * 6.28);
  return {
    pts,
    update(opacity) {
      const t = sh.uTime.value;
      items.forEach((it, i) => pts.set(i, it.p, it.c, it.s * (0.75 + 0.35 * Math.sin(t * speed + phase[i]))));
      pts.commit();
      pts.material.uniforms.uOpacity.value = opacity;
      pts.visible = opacity > 0;
    },
  };
}

// Particles streaming between pairs of points.
function flows(sh, n, seed, pick, color) {
  const r = rng(seed);
  const start = new Float32Array(n * 3), end = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [a, b] = pick(r, i);
    start.set(a, i * 3);
    end.set(b, i * 3);
    s[i] = r();
  }
  return new FlowPoints({ start, end, seed: s }, sh, color);
}

// The SIA AI core: glowing sphere, icosahedral shell and two orbiting rings.
function makeCore(glowTex) {
  const circle = (rad, color) => {
    const pts = [];
    for (let i = 0; i < 96; i++) pts.push(V(Math.cos((i / 96) * Math.PI * 2) * rad, 0, Math.sin((i / 96) * Math.PI * 2) * rad));
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, ...ADD }));
  };
  const parts = {
    sphere: new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshBasicMaterial({ color: HDR(0.5, 1.3, 1.8), ...ADD })),
    shell: new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.15, 1)), new THREE.LineBasicMaterial({ color: HDR(0.1, 0.9, 1.6), ...ADD })),
    ringA: circle(1.75, HDR(1.6, 0.1, 0.2)),
    ringB: circle(2.05, HDR(0.1, 0.9, 1.6)),
    glow: new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: HDR(0.3, 1.0, 1.6), ...ADD })),
  };
  parts.glow.scale.setScalar(4.5);
  const group = new THREE.Group();
  group.add(...Object.values(parts));
  return {
    group,
    update(t, grow, fade) {
      group.visible = grow > 0 && fade > 0;
      if (!group.visible) return;
      group.scale.setScalar(Math.max(0.001, grow * (1 + 0.04 * Math.sin(t * 5))));
      parts.shell.rotation.set(t * 0.4, t * 0.6, 0);
      parts.ringA.rotation.set(1.2, t * 1.1, 0);
      parts.ringB.rotation.set(0.4, -t * 0.8, 0.6);
      for (const k of ['sphere', 'shell', 'ringA', 'ringB']) parts[k].material.opacity = fade;
      parts.glow.material.opacity = 0.7 * fade;
    },
  };
}

// Beams from an AI core into building systems, each drawing on then pulsing with data.
function beams(sh, from, targets, t0, color) {
  return targets.map((p, k) => {
    const a = V(...from), b = V(...p);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 2.0;
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 48, 0.022, 6, false), beamMaterial(sh, color(k)));
    const ping = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 40), new THREE.MeshBasicMaterial({ color: HDR(...color(k)), side: THREE.DoubleSide, ...ADD }));
    ping.rotation.x = -Math.PI / 2;
    ping.position.copy(b);
    return { mesh, ping, at: [t0 + k * 0.1, t0 + 0.5 + k * 0.1] };
  });
}

function updateBeams(list, local, vis) {
  for (const b of list) {
    const s = ease.out(span(local, b.at));
    b.mesh.visible = s > 0;
    b.mesh.material.uniforms.uDraw.value = s;
    b.mesh.material.uniforms.uOpacity.value = vis;
    b.ping.visible = local > b.at[1];
    if (b.ping.visible) {
      const ph = ((local - b.at[1]) * 1.4) % 1;
      b.ping.scale.setScalar(1 + ph * 2.5);
      b.ping.material.opacity = (1 - ph) * vis;
    }
  }
}

// ---------------------------------------------------------------- DCMesh data center

function dataCenter(ctx) {
  const { sh } = ctx;
  const sc = scene(ctx, {
    shape: dataCenterShape, top: 4.2, origin: [-4.2, 0.2, 1.8], arc: 1.4,
    cam: [[[7.5, 5.5, 13], [0, 1.6, -0.3]], [[-5, 4.8, 11.5], [0.4, 1.6, -0.3]]],
  });
  const SCAN = [-7.6, 7.6], scan = [1.35, 2.15];
  sh.uHeat.value = DC_HOT.map((h) => {
    const ys = h.units.map(unitY);
    return new THREE.Vector4(rackX(h.rack), (Math.min(...ys) + Math.max(...ys)) / 2, rackFront(h.row) - 0.2, 0.75);
  });
  const scanner = new THREE.Mesh(new THREE.PlaneGeometry(DC.rows[0] - DC.rows[1] + DC.D + 1.2, 4.2), scannerMaterial(sh));
  scanner.rotation.y = Math.PI / 2;
  scanner.position.set(0, 2.1, (DC.rows[0] + DC.rows[1]) / 2);
  const nodes = [];
  for (const h of DC_HOT) for (const u of h.units) nodes.push(V(rackX(h.rack) + DC.W / 2 - 0.2, unitY(u), rackFront(h.row) + 0.06));
  const anomaly = new GlowPoints(nodes.length, sh);
  const cooling = new FlowPoints(coolingFlows(1400), sh, [0.15, 0.8, 1.6]);
  sc.group.add(scanner, anomaly, cooling);

  sc.props = (local, vis) => {
    sh.uHeatOn.value = span(local, [0.8, 1.1]) * vis;
    sh.uScanX.value = local < scan[0] ? -99 : lerp(SCAN[0], SCAN[1], ease.inOut(span(local, scan)));
    sh.uScanOn.value = clamp01((local - scan[0] + 0.12) / 0.12) * clamp01((scan[1] + 0.12 - local) / 0.12) * vis;
    scanner.visible = sh.uScanOn.value > 0;
    scanner.position.x = sh.uScanX.value;
    scanner.material.uniforms.uOpacity.value = sh.uScanOn.value;
    cooling.material.uniforms.uOpacity.value = span(local, [1.9, 2.3]) * vis;
    const on = span(local, [0.8, 1.05]) * vis;
    anomaly.visible = on > 0;
    if (on > 0) {
      nodes.forEach((p, i) => {
        const fixed = sh.uScanX.value > p.x;
        anomaly.set(i, p, fixed ? GREEN : RED, fixed ? 0.16 : 0.22 + 0.07 * Math.sin(sh.uTime.value * 16 + i));
      });
      anomaly.commit();
      anomaly.material.uniforms.uOpacity.value = on;
    }
  };
  sc.reset = () => {
    sh.uHeatOn.value = 0;
    sh.uScanOn.value = 0;
    sh.uScanX.value = -99;
  };
  return sc;
}

// ---------------------------------------------------------------- port construction

function port(ctx) {
  const { sh } = ctx;
  const sc = scene(ctx, {
    shape: portShape, top: 13.5, origin: [-3.5, 0.3, 1.0], arc: 3.0,
    cam: [[[6, 11.5, 29], [-1.5, 4.2, -1]], [[-6, 11, 28], [-1, 4.4, -1]]],
  });
  const agv = AGV_ROUTES.map((route, i) => {
    const curve = new THREE.CatmullRomCurve3(route.map(([x, z]) => V(x, 0.06, z)));
    return new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.03, 5, false), beamMaterial(sh, i === 1 ? [1.4, 0.1, 0.2] : [0.1, 0.9, 1.5]));
  });
  const sensors = pulses(sh, [
    ...CRANES.map((x) => ({ p: V(x, 6.7, x === CRANES[1] ? -4 : -6), c: CYAN, s: 0.35 })),
    { p: V(6, 8.2, 4.6), c: CYAN, s: 0.3 },
    { p: V(-11.2, 5.0, -5.1), c: [0.6, 0.8, 1.6], s: 0.35 },
  ]);
  sc.group.add(...agv, sensors.pts);
  sc.props = (local, vis) => {
    agv.forEach((m, i) => {
      const u = m.material.uniforms;
      u.uDraw.value = ease.out(span(local, [0.9 + i * 0.15, 1.7 + i * 0.15]));
      u.uOpacity.value = 0.8 * vis;
      m.visible = u.uDraw.value > 0;
    });
    sensors.update(span(local, [1.0, 1.3]) * vis);
  };
  return sc;
}

// ---------------------------------------------------------------- manufacturing

function manufacturing(ctx) {
  const { sh } = ctx;
  const sc = scene(ctx, {
    shape: factoryShape, top: 6.5, origin: [0, 0.5, 0], arc: 2.0,
    cam: [[[11, 9.5, 17.5], [0, 1.6, 0]], [[-9, 9.5, 17.5], [0, 1.6, 0]]],
  });
  const products = flows(sh, 700, 81, (r, i) => {
    const z = FACTORY.lines[i % 3] + (r() - 0.5) * 0.3;
    return [[FACTORY.x[0], 1.05, z], [FACTORY.x[1], 1.05, z]];
  }, [0.2, 1.0, 1.6]);
  const qc = pulses(sh, [{ p: V(6.5, 1.95, 0), c: CYAN, s: 0.6 }, { p: V(8.3, 1.5, 4.05), c: GREEN, s: 0.25 }], 6);
  sc.group.add(products, qc.pts);
  sc.props = (local, vis) => {
    products.material.uniforms.uOpacity.value = span(local, [0.9, 1.3]) * vis;
    qc.update(span(local, [1.0, 1.3]) * vis);
  };
  return sc;
}

// ---------------------------------------------------------------- ZMU smart campus

function campus(ctx) {
  const { sh } = ctx;
  const sc = scene(ctx, {
    shape: campusShape, top: 7.5, origin: [0.8, 0.2, 2.4], arc: -2.6,
    cam: [[[10, 9.5, 20], [0, 3, -0.5]], [[-7, 9, 19], [0, 3, -0.5]]],
  });
  const r = rng(17);
  const glows = [];
  for (const [x, z, sx, sy, sz] of CAMPUS.buildings.slice(0, 4)) {
    for (let k = 0; k < 9; k++) {
      const hot = r() < 0.3;
      glows.push({ p: V(x + (r() - 0.5) * (sx - 0.4), 0.5 + r() * (sy - 0.8), z + sz / 2 + 0.05), c: hot ? [1.4, 0.2, 0.3] : CYAN, s: 0.28 });
    }
  }
  for (const x of CAMPUS.chargers) glows.push({ p: V(x, 0.85, 3.75), c: GREEN, s: 0.3 });
  for (const x of CAMPUS.poles) glows.push({ p: V(x + 0.35, 1.95, 8.2), c: [1.4, 1.4, 1.2], s: 0.3 });
  const occ = pulses(sh, glows, 2.2);
  sc.group.add(occ.pts);
  sc.props = (local, vis) => occ.update(span(local, [1.0, 1.4]) * vis);
  return sc;
}

// ---------------------------------------------------------------- airport

function airport(ctx) {
  const { sh } = ctx;
  const sc = scene(ctx, {
    shape: airportShape, top: 9.8, origin: [-3, 0.2, -4], arc: 2.5,
    cam: [[[10, 11, 15], [-2, 2.5, -8]], [[-12, 10, 14], [-2, 2.5, -8]]],
  });
  const people = flows(sh, 600, 91, (r) => {
    const x = -10 + r() * 14;
    return [[x, 0.25, 1.0], [x * 0.7 - 1.5, 0.25, -1.9]];
  }, [0.2, 1.0, 1.6]);
  const runway = flows(sh, 160, 92, (r) => [[-17, 0.08, -18.2 + (r() - 0.5) * 0.2], [17, 0.08, -18.2]], [1.2, 1.3, 1.6]);
  sc.group.add(people, runway);
  sc.props = (local, vis) => {
    people.material.uniforms.uOpacity.value = span(local, [0.9, 1.3]) * vis;
    runway.material.uniforms.uOpacity.value = span(local, [1.1, 1.5]) * vis;
  };
  return sc;
}

// ---------------------------------------------------------------- retail

function retail(ctx) {
  const { sh } = ctx;
  const sc = scene(ctx, {
    shape: retailShape, top: 4.5, origin: [0, 0.2, 6], arc: 1.5,
    cam: [[[2, 13, 15], [0, 0.5, 0]], [[-6, 11, 14], [0, 0.5, 0]]],
  });
  const heat = pulses(sh, [
    [-5, -1.6, 2.4, 'hot'], [4.5, -3.6, 1.8, 'hot'], [0, -1.6, 2.0, 'warm'], [-4.5, 0.4, 1.6, 'cool'],
    [5, 0.4, 2.2, 'warm'], [0, 3.2, 2.6, 'hot'], [-6, -3.6, 1.4, 'cool'], [6.5, 2.8, 1.6, 'cool'],
  ].map(([x, z, s, k]) => ({ p: V(x, 0.15, z), s, c: k === 'hot' ? [1.5, 0.12, 0.2] : k === 'warm' ? [1.4, 0.55, 0.15] : [0.1, 0.8, 1.4] })), 1.6);
  const shoppers = flows(sh, 420, 93, (r) => {
    const z = [-3.6, -1.6, 0.4, 2.4][Math.floor(r() * 4)];
    return [[(r() - 0.5) * 2, 0.3, 6.2], [(r() < 0.5 ? -1 : 1) * (2 + r() * 6), 0.3, z]];
  }, [0.9, 1.1, 1.5]);
  sc.group.add(heat.pts, shoppers);
  sc.props = (local, vis) => {
    heat.update(span(local, [0.9, 1.4]) * vis * 0.7);
    shoppers.material.uniforms.uOpacity.value = span(local, [1.0, 1.4]) * vis;
  };
  return sc;
}

// ---------------------------------------------------------------- Sia Xcel

function xcel(ctx) {
  const { sh } = ctx;
  const sc = scene(ctx, {
    shape: xcelShape, top: 9.8, origin: [-5, 1, -2], arc: 3.0,
    cam: [[[4.5, 6.4, 17.5], [0.5, 5.6, -2]], [[-4.5, 6.8, 17], [0, 5.6, -2]]],
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(17, 8.8), panelMaterial(sh, 17, 8.8));
  glass.position.set(0, 5.2, XCEL.z - 0.05);
  const core = makeCore(ctx.glowTex);
  core.group.position.set(6.6, 10.9, -1.0);
  // the answer streams out of the chat into the generated dashboard
  const stream = flows(sh, 500, 95, (r) => [[-5 + (r() - 0.5) * 3, 6.6 + (r() - 0.5) * 0.8, XCEL.z + 0.1], [-1.5 + r() * 9.4, 3.8 + r() * 4.6, XCEL.z + 0.1]], [0.3, 1.0, 1.6]);
  const cursor = new GlowPoints(1, sh);
  cursor.set(0, V(-5.6, 1.65, XCEL.z + 0.05), [1.4, 1.6, 1.8], 0.25);
  cursor.commit();
  sc.group.add(glass, core.group, stream, cursor);
  sc.props = (local, vis) => {
    glass.material.uniforms.uOpacity.value = span(local, [0.7, 1.2]) * vis;
    core.update(sh.uTime.value, ease.outBack(span(local, [0.8, 1.3])), vis);
    stream.material.uniforms.uOpacity.value = span(local, [1.2, 1.6]) * vis;
    cursor.material.uniforms.uOpacity.value = (Math.sin(sh.uTime.value * 9) > 0 ? 1 : 0.15) * span(local, [0.8, 1.0]) * vis;
  };
  return sc;
}

// ---------------------------------------------------------------- Sia Facility (BMS)

function facility(ctx) {
  const { sh } = ctx;
  const sc = scene(ctx, {
    shape: facilityShape, top: 8.2, origin: [0, 0.2, 3], arc: 2.0,
    cam: [[[12, 10, 19.5], [0, 5.2, -1]], [[-10, 10, 19], [0, 5.2, -1]]],
  });
  const at = [0, 10.4, -1];
  const core = makeCore(ctx.glowTex);
  core.group.position.set(...at);
  const tones = [CYAN, CYAN, CYAN, [0.7, 0.85, 1.6], [0.1, 1.5, 0.7], RED];
  const links = beams(sh, at, [[-3.2, 7.5, -2.2], [1.6, 8.0, -2.2], [3.6, 8.0, -2.2], [-2.25, 4.7, 1.0], [0, 2.2, 3.0], [6, 6.0, 2.25]], 1.0, (k) => tones[k]);
  const { floors, fh } = FACILITY;
  const air = flows(sh, 700, 97, (r, i) => {
    const y = (i % floors) * fh + 1.35;
    return [[-5.5, y, -1 + (r() - 0.5) * 0.15], [5.5, y, -1 + (r() - 0.5) * 0.15]];
  }, [0.1, 0.9, 1.6]);
  sc.group.add(core.group, air, ...links.flatMap((b) => [b.mesh, b.ping]));
  sc.props = (local, vis) => {
    core.update(sh.uTime.value, ease.outBack(span(local, [0.6, 1.1])), vis);
    updateBeams(links, local, vis);
    air.material.uniforms.uOpacity.value = span(local, [1.1, 1.5]) * vis;
  };
  return sc;
}

export function buildScenes(ctx) {
  return [xcel, facility, retail, port, campus, dataCenter, airport, manufacturing].map((f) => f(ctx));
}
