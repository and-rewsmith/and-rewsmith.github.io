// widget.js — assembles the scene: renderer, fixed drifting camera, lights,
// environment reflections, terrain, ball, optional bloom, and the render loop.
//
// Usage:
//   import { ElevationWidget } from './widget.js';
//   const w = new ElevationWidget(container, { theme, config });
//   ...later: w.dispose();

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
// Bloom post-processing is loaded lazily (see _initBloom) only when a theme
// enables it, so the common no-bloom path never fetches those modules.

import { HeightField } from './terrain.js';
import { Ball } from './ball.js';

export class ElevationWidget {
  constructor(container, { theme, config }) {
    this.container = container;
    this.theme = theme;
    this.config = config;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    // --- renderer ---
    // Transparent themes (blueprint) let the CSS graph-paper show through.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !!theme.transparent });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // --- scene + atmosphere ---
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
    // Backdrop is scoped to the widget's own container so the widget can be
    // embedded without touching the host page's <body>.
    if (theme.transparent) {
      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 0);
      if (theme.bodyClass) container.classList.add(theme.bodyClass); // CSS paints the backdrop
    } else {
      this.scene.background = new THREE.Color(theme.background);
      container.style.background = theme.background;
    }
    this._bodyClass = theme.transparent ? theme.bodyClass : null;

    // Environment map drives the chrome ball's reflections.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this._envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this._envRT.texture;
    pmrem.dispose();

    // --- camera (fixed, gentle drift only) ---
    const cam = config.camera;
    this.camera = new THREE.PerspectiveCamera(cam.fov, w / h, 0.1, 2000);
    this._camBase = new THREE.Vector3(0, cam.height, cam.distance);
    this._lookY = cam.lookY ?? 0; // vertical framing offset of the look target
    this.camera.position.copy(this._camBase);
    this.camera.lookAt(0, this._lookY, 0);

    // --- lights (env already lights PBR; these add shape + a key highlight) ---
    this.scene.add(new THREE.HemisphereLight(0xeaf1fb, 0x9aa7bd, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(70, 120, 55); // soft top light — enough shape, no dark pits
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdce6ff, 0.45);
    fill.position.set(-90, 70, -60);
    this.scene.add(fill);

    // --- content ---
    this.terrain = new HeightField(config, theme);
    this.scene.add(this.terrain.group);

    this.ball = new Ball(config, theme, this.terrain);
    this.scene.add(this.ball.group);
    this.ball.attachControls(this.renderer.domElement, this.camera);

    // --- optional bloom (lazy-loaded) ---
    if (theme.bloom.enabled) this._initBloom(w, h);

    // --- hover/click lift (pointer devices only) ---
    this._attachLift();
    // --- touch-only grab zone so the ball can be picked up without scrolling ---
    this._attachBallGrab();

    // --- loop + resize ---
    this.clock = new THREE.Clock();
    this._t = 0;
    this._resize = () => this._onResize();
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(container);
    window.addEventListener('resize', this._resize);

    this._tick = () => this._frame();
    this._raf = requestAnimationFrame(this._tick);
  }

  // Lazy-load the post-processing stack and build the bloom composer. Only runs
  // for themes with bloom enabled; the render loop renders plainly until the
  // composer is ready. NOTE: these addons aren't vendored under /elevation/vendor
  // — add them there (or point the importmap at a CDN) before using a bloom theme.
  async _initBloom(w, h) {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]);
    const b = this.theme.bloom;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), b.strength, b.radius, b.threshold));
    composer.addPass(new OutputPass());
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(w, h);
    this.composer = composer;
  }

  // Hovering / clicking the terrain raises the ground under the cursor.
  // On touch (where the canvas is touch-action: pan-y) a *horizontal* drag
  // lifts while a *vertical* drag still scrolls the page, and a tap pokes.
  _attachLift() {
    const dom = this.renderer.domElement;
    this._liftRay = new THREE.Raycaster();
    this._liftNdc = new THREE.Vector2();
    this._liftPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // ground plane y=0
    this._liftHit = new THREE.Vector3();

    // Where the pointer ray meets the ground plane (cheap + stable in depth).
    const groundPoint = (e) => {
      const r = dom.getBoundingClientRect();
      this._liftNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this._liftRay.setFromCamera(this._liftNdc, this.camera);
      return this._liftRay.ray.intersectPlane(this._liftPlane, this._liftHit) ? this._liftHit : null;
    };

    // A burst at p. overBallOk lets touch taps poke the ground under the ball
    // too (it can't be dragged on touch); a mouse press there is a grab.
    const burstAt = (p, overBallOk) => {
      if (!overBallOk && Math.hypot(p.x - this.ball.pos.x, p.z - this.ball.pos.y) < this.ball.cfg.radius * 2.4) return;
      this.terrain.burst(p.x, p.z);
    };

    this._onLiftMove = (e) => {
      if (e.pointerType === 'touch') { this._touchMove(e, groundPoint); return; }
      if (this.ball.dragging) { this.terrain.hoverEnd(); return; } // don't fight a ball drag
      const p = groundPoint(e);
      if (p) this.terrain.hoverAt(p.x, p.z); else this.terrain.hoverEnd();
    };
    this._onLiftLeave = () => this.terrain.hoverEnd();

    this._onLiftDown = (e) => {
      if (e.pointerType === 'touch') {
        // Decide later (move/up): tap → poke, horizontal drag → lift,
        // vertical drag → scroll. We never preventDefault, so pan-y scrolls.
        this._touch = { x: e.clientX, y: e.clientY, t: e.timeStamp, mode: 'pending' };
        return;
      }
      const p = groundPoint(e);
      if (p) burstAt(p, false);
    };
    this._onLiftUp = (e) => {
      if (e.pointerType !== 'touch' || !this._touch) return;
      const tc = this._touch;
      this._touch = null;
      if (tc.mode === 'lift') { this.terrain.hoverEnd(); return; }
      // A quick, near-stationary touch is a tap → poke (even over the ball).
      const moved = Math.hypot(e.clientX - tc.x, e.clientY - tc.y);
      if (tc.mode === 'pending' && moved <= 10 && e.timeStamp - tc.t <= 600) {
        const p = groundPoint(e);
        if (p) burstAt(p, true);
      }
    };
    this._onLiftCancel = () => { if (this._touch) { this.terrain.hoverEnd(); this._touch = null; } };

    dom.addEventListener('pointermove', this._onLiftMove);
    dom.addEventListener('pointerdown', this._onLiftDown);
    dom.addEventListener('pointerup', this._onLiftUp);
    dom.addEventListener('pointercancel', this._onLiftCancel);
    dom.addEventListener('pointerleave', this._onLiftLeave);
  }

  // A small transparent disc that tracks the ball. Because it's touch-action:
  // none, a touch starting on it drags the ball freely (no page scroll), while
  // touches anywhere else on the canvas still scroll/lift/poke. Touch only —
  // on desktop the ball is grabbed straight off the canvas.
  _attachBallGrab() {
    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;
    const zone = document.createElement('div');
    Object.assign(zone.style, {
      position: 'absolute', left: '-999px', top: '-999px',
      width: '76px', height: '76px', margin: '-38px 0 0 -38px',
      borderRadius: '50%', background: 'transparent', touchAction: 'none', zIndex: '2',
    });
    this.container.appendChild(zone);
    this._grabZone = zone;
    this._grabVec = new THREE.Vector3();

    this._onGrab = (e) => {
      if (e.pointerType !== 'touch') return;
      this.ball.grab();                              // shared window move/up finish the drag
      try { zone.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
      e.preventDefault();
    };
    zone.addEventListener('pointerdown', this._onGrab);
  }

  // Keep the grab zone centred on the ball's projected screen position.
  _positionGrabZone() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const x = this.ball.pos.x, z = this.ball.pos.y;
    const y = this.terrain.height(x, z) + this.ball.cfg.radius; // ~ball centre
    this._grabVec.set(x, y, z).project(this.camera);
    this._grabZone.style.left = ((this._grabVec.x * 0.5 + 0.5) * w).toFixed(1) + 'px';
    this._grabZone.style.top = ((-this._grabVec.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
  }

  // Touch drag: lock to an axis on first real movement. Horizontal → lift the
  // terrain along the drag; vertical → leave it to the browser (pan-y scroll).
  _touchMove(e, groundPoint) {
    const tc = this._touch;
    if (!tc || tc.mode === 'scroll') return;
    if (tc.mode === 'pending') {
      const dx = e.clientX - tc.x, dy = e.clientY - tc.y;
      if (Math.hypot(dx, dy) < 8) return;            // wait for a clear direction
      tc.mode = Math.abs(dx) > Math.abs(dy) ? 'lift' : 'scroll';
      if (tc.mode === 'scroll') return;              // hand the gesture to the page
    }
    const p = groundPoint(e);                         // mode === 'lift'
    if (p) this.terrain.hoverAt(p.x, p.z);
  }

  _frame() {
    this._raf = requestAnimationFrame(this._tick);
    const dt = Math.min(this.clock.getDelta(), 0.05); // clamp to avoid jumps on tab refocus
    this._t += dt;

    this.terrain.morph(dt);
    this.terrain.update();
    this.ball.update(dt);

    // Subtle Lissajous camera breathing — depth without letting the user orbit.
    const d = this.config.camera.drift;
    this.camera.position.set(
      this._camBase.x + Math.sin(this._t * d.speed) * d.ampX,
      this._camBase.y,
      this._camBase.z + Math.cos(this._t * d.speed * 1.3) * d.ampZ,
    );
    this.camera.lookAt(0, this._lookY, 0);

    if (this._grabZone) this._positionGrabZone();

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    if (this._bodyClass) this.container.classList.remove(this._bodyClass);
    this._ro.disconnect();
    window.removeEventListener('resize', this._resize);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointermove', this._onLiftMove);
    dom.removeEventListener('pointerdown', this._onLiftDown);
    dom.removeEventListener('pointerup', this._onLiftUp);
    dom.removeEventListener('pointercancel', this._onLiftCancel);
    dom.removeEventListener('pointerleave', this._onLiftLeave);
    if (this._grabZone) { this._grabZone.removeEventListener('pointerdown', this._onGrab); this._grabZone.remove(); }
    this.ball.dispose();
    this.terrain.dispose();
    this._envRT.dispose();
    this.composer?.dispose?.();
    this.renderer.dispose();
    // Release the WebGL context immediately rather than waiting for GC —
    // matters when the widget is rebuilt repeatedly (theme toggling), since
    // browsers cap live contexts and evict the oldest.
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}
