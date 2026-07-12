// config.js — theme presets and physics/visual tunables.
//
// The scene reads as an *energy landscape* for an energy-based model: a smooth
// multi-basin surface where the ball is a state descending the energy gradient
// into a low-energy well. The `ebm` theme is the one in use; embed.js spreads it
// and overrides the backdrop to white and the particle to a faceted logo-colour gem.

export const THEMES = {
  // Energy-based-model diagram: pale frosted background with faint contours, a
  // shaded slate quad-surface with peaks + a deep central well, and a glowing
  // amber particle that settles at the low-energy minimum.
  ebm: {
    background: '#e9edf3',
    transparent: true,
    bodyClass: 'ebm',
    fog: { color: '#e9edf3', near: 130, far: 320 },

    // Flat, paper-toned fill so the line work reads as a pencil drawing rather
    // than a shaded CG surface; it still occludes the back of the mesh. Kept
    // light + near-flat (tiny height tint) so there are no dark spots.
    surface: { enabled: true, colorLow: '#dde4ee', colorHigh: '#eef2f8', roughness: 0.97, metalness: 0.0 },

    // Graphite grid lines — the "pencil" of the sketch.
    wireframe: { color: '#2a3038', opacity: 0.5 },

    // No glowing point cloud on this theme — the surface + grid carry it.
    points: { enabled: false, colorLow: '#ffffff', colorHigh: '#ffffff', size: 1, opacity: 0, additive: false },

    // Matte particle with faint construction lines drawn on it, so its rotation
    // is visible as it rolls (a plain matte sphere shows no spin).
    ball: { style: 'matte', color: '#23262e', line: '#7b8494', roughness: 0.88, lon: 6, lat: 4 },
    shadow: { color: '#1c2128', opacity: 0.45, additive: false },

    bloom: { enabled: false, strength: 0, radius: 0.5, threshold: 0.9 },
    env: { intensity: 0.35 },
  },
};

// Dark companion to `ebm` — the same pencil-sketch language, inverted onto a
// near-black stage. The fill sits just above the page colour so the disc reads
// as part of the page (and still occludes the back of the mesh via depth),
// while a whitish-grey grid carries the line work. embed.js fades the rim into
// the page background and overrides the particle to a faceted logo-colour gem.
THEMES.ebmDark = {
  ...THEMES.ebm,
  background: '#14151a',
  fog: { color: '#14151a', near: 130, far: 320 },
  // Unlit page-coloured occluder (see terrain.js): no lighting, so the fill
  // never deviates from the page — it exists only to hide the lines behind
  // hills, exactly like the light theme's white-on-white fill. The tints sit
  // symmetric around the page colour (#14151a): peaks a whisper lighter,
  // valleys a whisper darker, the zero-plane rendering as the page itself.
  surface: { ...THEMES.ebm.surface, unlit: true, colorLow: '#0c0d10', colorHigh: '#1c1d24' },
  // Whitish cool-grey grid; lower opacity than the light theme so overlapping
  // lines on the dark stage don't read as a busy tangle.
  wireframe: { color: '#c3c8d2', opacity: 0.34 },
  ball: { ...THEMES.ebm.ball, line: '#9aa3b4' },
  // Muted light-grey contact blob, normal blending — a dark shadow vanishes
  // on the near-black ground, and additive reads as a glow. This sits between:
  // a soft matte halo that grounds the ball without glowing.
  shadow: { color: '#8b93a3', opacity: 0.3, additive: false },
};

// World + simulation tunables. Distances are in scene units; the terrain spans
// roughly [-SIZE/2, SIZE/2] on both X and Z. Kept small + bowl-shaped so the
// ball stays inside a contained dish and is always visible.
export const CONFIG = {
  // --- Terrain (the energy surface) ---
  size: 112,           // world extent of the bounding square
  segments: 52,        // grid resolution per side (segments+1 verts per side)
  shape: 'circle',     // 'circle' clips the grid/surface to a disc; 'square' = full square
  radius: 53,          // disc radius when shape === 'circle'
  edgeLock: 0.66,      // pin the surface to 0 from this fraction of the radius out to the rim
                       // (flat locked edge — the landscape always slopes back down to it)
  baseBowl: 0.08,      // very gentle outward bowl; the features below carry the shape
  featureAmp: 11,      // master amplitude scale for the landscape features
  morphSpeed: 1.8,     // overall drift speed of the hills/valleys (higher = quicker)
  // Soft height limits: keep dips/peaks shallow enough that you never see the
  // underside of a deep "pouch". Smooth (no hard crease); softness = sharpness.
  clamp: { min: -12, max: 13, softness: 0.32 },

  // Many small hills and valleys, generated procedurally and scattered across
  // the disc with alternating signs. Each drifts continuously (terrain.js morph)
  // so the gradient is always moving. amp is a fraction of featureAmp.
  featuresAuto: {
    count: 20,
    amp: [0.55, 0.95],   // |amplitude| fraction per bump
    sigma: [7, 12],      // small radii → fine-grained relief
    spread: 0.64,        // placed within this fraction of the radius
    jitter: 9,           // how far each wanders
    ampJitter: 0.4,      // how much each rises/sinks over time
  },

  // --- Ball physics (a state descending the energy gradient) ---
  ball: {
    radius: 3.8,
    gravity: 230,      // pulls the ball down-slope (scales gradient → acceleration)
    friction: 3.4,     // velocity damping per second — settles smoothly, no ping-pong
    maxSpeed: 52,      // clamp to keep it in the dish
    flickScale: 1.0,   // multiplier on release velocity from a drag
    spin: true,        // roll the ball to match motion
    edgePush: 225,     // hidden inward force strength (higher = tilts inward more firmly)
    edgePower: 0.7,    // falloff exponent; <1 = wider band (felt further from the rim)
  },

  // --- Idle auto-demo ---
  idle: {
    delay: 3.5,        // seconds of no interaction before the demo kicks in
    impulseEvery: [3.5, 6], // seconds between gentle nudges
    impulse: 16,       // strength of each nudge
  },

  // --- Camera (fixed, fairly top-down so wells stay visible) ---
  camera: {
    distance: 116,
    height: 96,        // ~40° look — enough relief, but top-down enough to hide undersides
    fov: 48,
    drift: { ampX: 3.5, ampZ: 2.5, speed: 0.08 }, // subtle Lissajous breathing
  },
};
