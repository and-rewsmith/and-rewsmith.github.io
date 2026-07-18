// Mounts the interactive energy-landscape widget into the hero.
// Tuned to the site's clean white look (white backdrop, no frosted paper).

import { ElevationWidget } from './widget.js';
import { THEMES, CONFIG } from './config.js';

// The ball's facet palette IS the page palette: the --c-* variables (and the
// --logo-stroke seam) are read from CSS at mount, so the gem, the logo
// triangles, and the diagrams always agree — in both themes, and after any
// future palette edit. Fallbacks cover a missing stylesheet.
const PALETTE_VARS = ['--c-pink', '--c-mint', '--c-orange', '--c-purple', '--c-teal', '--c-yellow', '--c-blue'];
const PALETTE_FALLBACK = ['#ef476f', '#06d6a0', '#f78c6b', '#9b5de5', '#0cb0a9', '#ffd166', '#6a8eea'];
// Parse '#rrggbb' or 'rgb(r, g, b)' (computed custom properties come back in
// either form) into [r, g, b].
function rgbOf(str) {
  const s = (str || '').trim();
  if (s[0] === '#' && s.length >= 7) {
    return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  return m ? m[1].split(',').slice(0, 3).map(Number) : null;
}

// The facets use the mode's palette. In light mode the ball wears the logo
// colours verbatim; in dark mode the page palette is lifted toward pastel so it
// vibrates on near-black, but on the ball's lit 3D stage those brights glare —
// so we pull each facet a little darker (toward black) just for the gem.
function ballPalette(isDark) {
  const cs = getComputedStyle(document.documentElement);
  const k = isDark ? 0.78 : 1; // dark-mode dimming factor (1 = unchanged)
  return PALETTE_VARS.map((name, i) => {
    const rgb = rgbOf(cs.getPropertyValue(name)) || rgbOf(PALETTE_FALLBACK[i]);
    return `rgb(${Math.round(rgb[0] * k)}, ${Math.round(rgb[1] * k)}, ${Math.round(rgb[2] * k)})`;
  });
}

// Build the hero theme for the current mode. Light fades into white; dark
// fades into the page's near-black. Either way the particle is a faceted
// triangle gem in the logo palette, seamed with the logo's stroke colour.
function buildTheme(isDark) {
  const base = isDark ? THEMES.ebmDark : THEMES.ebm;
  const bg = isDark ? '#14151a' : '#ffffff';
  const seam = getComputedStyle(document.documentElement).getPropertyValue('--logo-stroke').trim()
    || (isDark ? '#0d0e12' : '#2b2b2b');
  return {
    ...base,
    background: bg,
    bodyClass: null,                            // no paper backdrop — the panel matches the page
    fog: { color: bg, near: 130, far: 340 },    // edges fade into the page colour
    ball: { ...base.ball, style: 'facets', palette: ballPalette(isDark), line: seam, lineOpacity: 0.85, roughness: 0.82, detail: 1 },
  };
}

// Zoom the camera in for the embed so the landscape reads large in the frame.
const config = {
  ...CONFIG,
  // lookY lifts the framing so the disc sits vertically centred with margin
  // top and bottom — otherwise the front rim hugs the bottom edge and the ball
  // gets clipped there when dragged forward.
  camera: { ...CONFIG.camera, distance: 104, height: 86, fov: 36, lookY: -11 },
};

const mountEl = document.getElementById('energy-hero');

function mount(isDark) {
  if (!mountEl) return;
  window.__energyWidget = new ElevationWidget(mountEl, { theme: buildTheme(isDark), config });
}

mount(document.documentElement.dataset.theme === 'dark');

// Re-theme when the user toggles dark mode. The widget bakes its theme at
// construction (no live setter), so tear down and rebuild — the particle
// resets to centre, which is fine here. A quick opacity dip masks the swap so
// it reads as part of the page's colour cross-fade rather than a hard cut.
window.addEventListener('themechange', (e) => {
  if (!mountEl) return;
  const dark = !!(e.detail && e.detail.dark);
  mountEl.style.transition = 'opacity 0.2s ease';
  mountEl.style.opacity = '0';
  setTimeout(() => {
    window.__energyWidget?.dispose();
    mount(dark);
    mountEl.style.opacity = '1';
  }, 210);
});
