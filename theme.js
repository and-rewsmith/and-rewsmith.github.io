// theme.js — dark/light toggle, shared by the main and demo pages.
//
// The no-FOUC inline snippet in each page's <head> has already set
// document.documentElement.dataset.theme before first paint (URL ?theme=
// override, else the saved toggle choice, else light — the OS setting is
// deliberately ignored). This script wires up the nav toggle, persists the
// choice, and announces changes via a `themechange` event so the 3D hero
// can re-theme.

(function () {
  var root = document.documentElement;

  function isDark() {
    return root.dataset.theme === 'dark';
  }

  function apply(dark) {
    root.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
    // Broadcast so non-CSS consumers (e.g. the Three.js hero) can react.
    window.dispatchEvent(new CustomEvent('themechange', { detail: { dark: dark } }));
  }

  document.querySelectorAll('.theme-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      apply(!isDark());
    });
  });
})();
