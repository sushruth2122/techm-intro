// Every intro timing, in seconds. The intro is a pure function of `t`, so skipping
// or replaying is just a matter of evaluating a different time.
// Spark → one 3.2 s scene per dashboard (8) → globe finale that shatters into the
// dashboard links → the camera dives back into the city, which keeps cycling.

// Timing inside one dashboard scene (local seconds from the scene's start).
export const SCENE = {
  start: 3.0,
  dur: 3.2,
  count: 8,
  morph: 1.0, // particles rebuild into the new structure
  wire: [0.4, 1.1], // wireframe edges draw bottom-up
  caption: 0.25,
  callout: 0.9, // first feature call-out; the rest follow every `stagger`
  stagger: 0.22,
};
export const sceneStart = (i) => SCENE.start + i * SCENE.dur;

const END = sceneStart(SCENE.count); // 28.6

export const T = {
  total: END + 4.0,
  pulses: [0.85, 1.9],
  spark: 1.9,
  grid: [1.95, 3.0],
  packet: [2.5, 3.0],
  outro: {
    zoom: [END, END + 1.3],
    globe: [END + 0.3, END + 1.2],
    arcs: [END + 0.65, END + 1.4],
    spin: [END + 1.15, END + 2.1],
    white: [END + 1.65, END + 2.1],
    shatter: [END + 2.1, END + 2.95],
    links: END + 2.75,
    dive: [END + 2.4, END + 4.0],
    remorph: [END + 3.0, END + 4.0],
  },
};

// Overlay elements carrying data-cue="<key>" are shown inside these windows.
export const CUES = {
  presents: [0.25, 1.85],
  hud: [0.5, END + 1.6],
  tour: [2.9, END],
};

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const span = (t, [a, b]) => clamp01((t - a) / (b - a));

export const ease = {
  in: (x) => x * x * x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outBack: (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2),
};
