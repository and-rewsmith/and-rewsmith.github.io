// ball.js — a glossy chrome ball that rolls downhill on the height-field.
//
// Physics: the ball is a point mass on the surface. Each step we read the exact
// terrain gradient under it and accelerate down-slope, with friction so it
// settles in basins but keeps enough momentum to climb a ridge and roll back.
//
// Interaction: pointer-down near the ball grabs it; while held it follows the
// pointer (projected onto a horizontal plane at the ball's height); releasing
// converts the recent pointer motion into a flick velocity. When left alone it
// runs a gentle idle demo so the widget always looks alive.

import * as THREE from 'three';

export class Ball {
  constructor(config, theme, terrain) {
    this.cfg = config.ball;
    this.idleCfg = config.idle;
    this.terrain = terrain;
    this.half = terrain.half;

    // State lives in the XZ plane: pos.(x,y) == world (x,z). Start on a hilltop
    // (with a small downhill nudge) so the ball immediately rolls into a valley.
    this.pos = this._findHillStart();
    this.vel = new THREE.Vector2(0, 0);
    const [gx, gz] = terrain.gradient(this.pos.x, this.pos.y);
    const gm = Math.hypot(gx, gz);
    if (gm > 1e-3) this.vel.set(-gx / gm, -gz / gm).multiplyScalar(10);

    this.dragging = false;
    this._samples = [];           // recent pointer positions for flick velocity
    this._timeSinceInput = 999;   // seconds since last user interaction
    this._impulseTimer = this._rand(...this.idleCfg.impulseEvery);

    this._N = new THREE.Vector3();        // current surface normal under the ball
    this._planeNormal = new THREE.Vector3(0, 0, 1); // PlaneGeometry's default normal

    this._buildMeshes(theme);
    this._syncMesh();
  }

  // Highest sampled point within the central half of the field — a hilltop the
  // ball can roll down from.
  _findHillStart() {
    const R = this.terrain.boundaryRadius * 0.5;
    let bx = 0, bz = 0, bh = -Infinity;
    const N = 26;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -R + (2 * R) * i / (N - 1);
        const z = -R + (2 * R) * j / (N - 1);
        if (x * x + z * z > R * R) continue;
        const h = this.terrain.height(x, z);
        if (h > bh) { bh = h; bx = x; bz = z; }
      }
    }
    return new THREE.Vector2(bx, bz);
  }

  _buildMeshes(theme) {
    this.group = new THREE.Group();
    this._disposables = [];

    if (theme.ball.style === 'wireframe') {
      this.mesh = this._buildWireframeBall(theme);
    } else if (theme.ball.style === 'glow') {
      this.mesh = this._buildGlowBall(theme);
    } else if (theme.ball.style === 'facets') {
      this.mesh = this._buildFacetedBall(theme);
    } else if (theme.ball.style === 'matte') {
      this.mesh = this._buildMatteBall(theme);
    } else {
      this.mesh = this._buildGlossyBall(theme);
    }
    this.mesh.castShadow = false;
    this.group.add(this.mesh);

    // Camera-facing additive halo so the particle reads as glowing.
    if (theme.ball.glow) {
      const haloTex = makeBlobTexture(theme.ball.glow);
      const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: theme.ball.glowOpacity ?? 0.9,
      });
      this.halo = new THREE.Sprite(haloMat);
      this.halo.scale.setScalar(this.cfg.radius * (theme.ball.glowSize || 4));
      this._disposables.push(haloTex, haloMat);
      this.group.add(this.halo);
    }

    // Soft blob under the ball: glow on dark, shadow on blueprint/light.
    const shadow = theme.shadow;
    const blobMat = new THREE.MeshBasicMaterial({
      map: makeBlobTexture(shadow.color),
      transparent: true,
      depthWrite: false,
      opacity: shadow.opacity,
      blending: shadow.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    // Contact shadow — kept small + tight so it reads as the ball touching the
    // ground (not a big soft hover shadow). Oriented to the slope each frame.
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(this.cfg.radius * 3.4, this.cfg.radius * 3.4), blobMat);
    blobMat.polygonOffset = true;        // sit just above the surface, no z-fight
    blobMat.polygonOffsetFactor = -2;
    blobMat.polygonOffsetUnits = -2;
    this._disposables.push(this.blob.geometry, blobMat.map, blobMat);
    this.group.add(this.blob);
  }

  // Chrome sphere lit by the scene's environment map.
  _buildGlossyBall(theme) {
    const geo = new THREE.SphereGeometry(this.cfg.radius, 48, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.ball.color),
      metalness: theme.ball.metalness,
      roughness: theme.ball.roughness,
      emissive: new THREE.Color(theme.ball.emissive),
    });
    mat.envMapIntensity = theme.env.intensity;
    this._disposables.push(geo, mat);
    return new THREE.Mesh(geo, mat);
  }

  // Matte sphere with faint construction lines mapped on it, so the rotation is
  // visible as it rolls (a plain matte sphere shows no spin).
  _buildMatteBall(theme) {
    const geo = new THREE.SphereGeometry(this.cfg.radius, 48, 32);
    const tex = makeGridTexture(theme.ball.color, theme.ball.line, theme.ball.lon ?? 7, theme.ball.lat ?? 4, theme.ball.palette);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: theme.ball.roughness ?? 0.88,
      metalness: 0.0,
    });
    mat.envMapIntensity = theme.env.intensity;
    this._disposables.push(geo, tex, mat);
    return new THREE.Mesh(geo, mat);
  }

  // Faceted polyhedron whose triangular faces are flat-shaded in the site's
  // logo palette and outlined with dark seams — a colourful "triangle" gem that
  // echoes the logo's triangle motif. Rolling reveals different coloured faces.
  _buildFacetedBall(theme) {
    const g = new THREE.Group();
    const detail = theme.ball.detail ?? 1; // 0 = 20 big faces, 1 = 80, ...
    const geo = new THREE.IcosahedronGeometry(this.cfg.radius, detail);

    // One palette colour per triangular face. IcosahedronGeometry is
    // non-indexed (3 unique verts per face), so we colour verts in triples.
    const palette = (theme.ball.palette && theme.ball.palette.length)
      ? theme.ball.palette : [theme.ball.color || '#ef476f'];
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let f = 0; f < pos.count / 3; f++) {
      c.set(palette[f % palette.length]);
      for (let v = 0; v < 3; v++) {
        const idx = (f * 3 + v) * 3;
        colors[idx] = c.r; colors[idx + 1] = c.g; colors[idx + 2] = c.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: theme.ball.roughness ?? 0.85,
      metalness: 0.0,
    });
    mat.envMapIntensity = theme.env.intensity;
    g.add(new THREE.Mesh(geo, mat));

    // Dark triangle seams, echoing the logo's pencil outlines. WireframeGeometry
    // draws every triangle edge (not just sharp creases).
    const edges = new THREE.WireframeGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(theme.ball.line ?? '#2b2f38'),
      transparent: true,
      opacity: theme.ball.lineOpacity ?? 0.85,
    });
    g.add(new THREE.LineSegments(edges, edgeMat));

    this._disposables.push(geo, mat, edges, edgeMat);
    return g;
  }

  // Emissive amber particle for the energy-based-model theme.
  _buildGlowBall(theme) {
    const geo = new THREE.SphereGeometry(this.cfg.radius, 32, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.ball.color),
      emissive: new THREE.Color(theme.ball.emissive),
      emissiveIntensity: theme.ball.emissiveIntensity ?? 1.2,
      roughness: 0.45,
      metalness: 0.0,
    });
    mat.envMapIntensity = theme.env.intensity;
    this._disposables.push(geo, mat);
    return new THREE.Mesh(geo, mat);
  }

  // Blueprint particle: a faint solid core (so it reads as a 3D sphere and
  // occludes the back of the cage) under a lat/long wireframe.
  _buildWireframeBall(theme) {
    const g = new THREE.Group();

    const coreGeo = new THREE.SphereGeometry(this.cfg.radius * 0.985, 24, 18);
    const coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.ball.fill),
      transparent: true,
      opacity: theme.ball.fillOpacity,
      depthWrite: true, // write depth so back-facing cage lines are hidden
    });
    g.add(new THREE.Mesh(coreGeo, coreMat));

    const cageGeo = new THREE.SphereGeometry(this.cfg.radius, 16, 12);
    const cageMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.ball.color),
      wireframe: true,
      transparent: true,
      opacity: theme.ball.lineOpacity,
    });
    g.add(new THREE.Mesh(cageGeo, cageMat));

    this._disposables.push(coreGeo, coreMat, cageGeo, cageMat);
    return g;
  }

  // --- simulation ---------------------------------------------------------

  update(dt) {
    this._timeSinceInput += dt;

    if (!this.dragging) {
      // Idle auto-demo: nudge the ball if the user has been away.
      if (this._timeSinceInput > this.idleCfg.delay) {
        this._impulseTimer -= dt;
        if (this._impulseTimer <= 0) {
          const a = Math.random() * Math.PI * 2;
          this.vel.x += Math.cos(a) * this.idleCfg.impulse;
          this.vel.y += Math.sin(a) * this.idleCfg.impulse;
          this._impulseTimer = this._rand(...this.idleCfg.impulseEvery);
        }
      }

      // Integrate in small fixed sub-steps so the ball can't overshoot a steep
      // well in one frame (that overshoot is what made it ping-pong/"teleport").
      const steps = Math.min(8, Math.max(1, Math.ceil(dt / 0.008)));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) this._integrate(h);
    }

    this._syncMesh(dt);
  }

  _integrate(h) {
    // Down-slope acceleration from the analytic gradient.
    const [gx, gz] = this.terrain.gradient(this.pos.x, this.pos.y);
    this.vel.x += -this.cfg.gravity * gx * h;
    this.vel.y += -this.cfg.gravity * gz * h;

    // Hidden inward edge force: a radial pull toward the centre that grows
    // toward the rim, so the ball is always pushed back inward. edgePower < 1
    // widens the band so it's felt further in.
    if (this.cfg.edgePush) {
      const r = Math.hypot(this.pos.x, this.pos.y);
      if (r > 1e-3) {
        const f = this.cfg.edgePush * Math.pow(r / this.terrain.boundaryRadius, this.cfg.edgePower ?? 1);
        this.vel.x -= (this.pos.x / r) * f * h;
        this.vel.y -= (this.pos.y / r) * f * h;
      }
    }

    // Friction (frame-rate independent) and speed clamp.
    this.vel.multiplyScalar(Math.exp(-this.cfg.friction * h));
    const sp = this.vel.length();
    if (sp > this.cfg.maxSpeed) this.vel.multiplyScalar(this.cfg.maxSpeed / sp);

    // Integrate, then keep inside the field (reflect with damping at edges).
    this.pos.x += this.vel.x * h;
    this.pos.y += this.vel.y * h;
    this._clampToField();
  }

  _clampToField() {
    if (this.terrain.shape === 'circle') {
      // Keep the ball inside the disc; reflect off the rim with damping.
      const lim = this.terrain.boundaryRadius - this.cfg.radius;
      const d = Math.hypot(this.pos.x, this.pos.y);
      if (d > lim) {
        const nx = this.pos.x / d, nz = this.pos.y / d;
        this.pos.x = nx * lim;
        this.pos.y = nz * lim;
        const vn = this.vel.x * nx + this.vel.y * nz; // outward velocity component
        if (vn > 0) { this.vel.x -= 1.4 * vn * nx; this.vel.y -= 1.4 * vn * nz; }
      }
      return;
    }
    const lim = this.half - this.cfg.radius;
    if (this.pos.x < -lim) { this.pos.x = -lim; this.vel.x = Math.abs(this.vel.x) * 0.4; }
    else if (this.pos.x > lim) { this.pos.x = lim; this.vel.x = -Math.abs(this.vel.x) * 0.4; }
    if (this.pos.y < -lim) { this.pos.y = -lim; this.vel.y = Math.abs(this.vel.y) * 0.4; }
    else if (this.pos.y > lim) { this.pos.y = lim; this.vel.y = -Math.abs(this.vel.y) * 0.4; }
  }

  _syncMesh(dt = 0) {
    const x = this.pos.x, z = this.pos.y;
    const surfaceY = this.terrain.height(x, z);
    const r = this.cfg.radius;

    // Seat the ball along the surface normal so it nestles into the slope and
    // sits *in* a well, rather than floating straight above the ground.
    const [gx, gz] = this.terrain.gradient(x, z);
    this._N.set(-gx, 1, -gz).normalize();
    this.mesh.position.set(x + this._N.x * r, surfaceY + this._N.y * r, z + this._N.z * r);

    // Contact shadow hugs the surface (lies along the slope, just under the ball).
    this.blob.position.set(x + this._N.x * 0.25, surfaceY + this._N.y * 0.25, z + this._N.z * 0.25);
    this.blob.quaternion.setFromUnitVectors(this._planeNormal, this._N);

    if (this.halo) this.halo.position.copy(this.mesh.position);

    // Roll the ball to match its motion (rolling without slipping).
    if (this.cfg.spin && dt > 0) {
      const sp = this.vel.length();
      if (sp > 0.01) {
        // Axis = up × velocity, angle = distance / radius.
        const axis = new THREE.Vector3(this.vel.y, 0, -this.vel.x).normalize();
        this.mesh.rotateOnWorldAxis(axis, (sp * dt) / this.cfg.radius);
      }
    }
  }

  // --- pointer controls ---------------------------------------------------

  attachControls(domElement, camera) {
    this.dom = domElement;
    this.camera = camera;
    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane();
    this._ndc = new THREE.Vector2();
    this._hit = new THREE.Vector3();
    this._closest = new THREE.Vector3();

    this._onDown = (e) => this._pointerDown(e);
    this._onMove = (e) => this._pointerMove(e);
    this._onUp = (e) => this._pointerUp(e);

    domElement.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
  }

  _setNdc(e) {
    const r = this.dom.getBoundingClientRect();
    this._ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  // Is the pointer over (or very near) the ball?
  _isOverBall(e) {
    this._setNdc(e);
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const center = this.mesh.position;
    this._raycaster.ray.closestPointToPoint(center, this._closest);
    return this._closest.distanceTo(center) <= this.cfg.radius * 2.4;
  }

  // Begin a drag started by the widget's touch grab-zone, bypassing the
  // over-ball hit test and the touch guard that _pointerDown applies to
  // presses on the canvas. The shared window pointermove/up handlers (set in
  // attachControls) then drive and end the drag.
  grab() {
    this.dragging = true;
    this.vel.set(0, 0);
    this._samples.length = 0;
    this._timeSinceInput = 0;
    this.dom.classList.add('is-grabbing');
    this._recordSample();
  }

  _pointerDown(e) {
    if (e.pointerType === 'touch') return; // desktop only — let touch scroll the page
    if (!this._isOverBall(e)) return; // only grab when on the ball

    this.dragging = true;
    this.vel.set(0, 0);
    this._samples.length = 0;
    this._timeSinceInput = 0;
    this.dom.classList.remove('is-grab');
    this.dom.classList.add('is-grabbing');
    this._recordSample();
  }

  _pointerMove(e) {
    if (!this.dragging) {
      // Show the grab cursor only while hovering the ball.
      this.dom.classList.toggle('is-grab', this._isOverBall(e));
      return;
    }
    this._setNdc(e);
    this._raycaster.setFromCamera(this._ndc, this.camera);

    // Drop the ball where the cursor meets the actual terrain surface. This is
    // stable in depth — projecting onto a ball-height plane instead made the
    // ball jump nearer/farther (appear to teleport across hills).
    let x, z, ok = false;
    const surf = this.terrain.surface;
    if (surf) {
      surf.geometry.computeBoundingSphere(); // terrain morphs, so refresh bounds
      const hits = this._raycaster.intersectObject(surf, false);
      if (hits.length) { x = hits[0].point.x; z = hits[0].point.z; ok = true; }
    }
    if (!ok) {
      // Fallback: a FIXED horizontal plane (constant height → no depth jump).
      this._plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0));
      if (this._raycaster.ray.intersectPlane(this._plane, this._hit)) { x = this._hit.x; z = this._hit.z; ok = true; }
    }
    if (ok) {
      this.pos.x = x;
      this.pos.y = z;
      this._clampToField(); // keep the dragged ball inside the container (disc or square)
      this._recordSample();
      this._syncMesh();
    }
  }

  _pointerUp(e) {
    if (!this.dragging) return;
    this.dragging = false;
    this._timeSinceInput = 0;
    this.dom.classList.remove('is-grabbing');
    // Keep the grab cursor if we're still hovering the ball, else default.
    if (e && e.clientX != null) this.dom.classList.toggle('is-grab', this._isOverBall(e));

    // Flick: velocity from pointer motion over the last ~120ms.
    const now = performance.now();
    const recent = this._samples.filter((s) => now - s.t < 120);
    if (recent.length >= 2) {
      const a = recent[0], b = recent[recent.length - 1];
      const span = (b.t - a.t) / 1000;
      if (span > 0.001) {
        this.vel.set((b.x - a.x) / span, (b.z - a.z) / span).multiplyScalar(this.cfg.flickScale);
        const sp = this.vel.length();
        if (sp > this.cfg.maxSpeed) this.vel.multiplyScalar(this.cfg.maxSpeed / sp);
      }
    }
  }

  _recordSample() {
    this._samples.push({ x: this.pos.x, z: this.pos.y, t: performance.now() });
    if (this._samples.length > 8) this._samples.shift();
  }

  _rand(a, b) { return a + Math.random() * (b - a); }

  dispose() {
    this.dom?.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    for (const d of this._disposables) d?.dispose?.();
  }
}

// Radial blob texture in the given color; the material sets blending/opacity so
// the same texture serves as a glow (additive) or a soft shadow (normal).
function makeBlobTexture(color) {
  const c = new THREE.Color(color);
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, `rgba(${rgb},0.9)`);
  g.addColorStop(0.5, `rgba(${rgb},0.3)`);
  g.addColorStop(1.0, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
}

// Sphere texture so a matte ball's rotation is visible as it rolls. Without a
// palette: a dark base with faint construction lines. With a palette: coloured
// longitude panels (a "beach-ball") separated by thin seams.
function makeGridTexture(baseHex, lineHex, lon, lat, palette) {
  const w = 256, h = 128;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');

  if (palette && palette.length) {
    const n = palette.length;
    for (let k = 0; k < n; k++) {            // coloured longitude panels
      ctx.fillStyle = palette[k];
      ctx.fillRect(Math.floor((k / n) * w), 0, Math.ceil(w / n) + 1, h);
    }
    ctx.strokeStyle = lineHex;
    ctx.lineWidth = 2;
    for (let k = 0; k <= n; k++) {            // panel seams
      const x = (k / n) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let k = 1; k < lat; k++) {           // a couple of parallels for spin
      const y = (k / lat) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  } else {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = lineHex;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let k = 0; k < lon; k++) {            // meridians
      const x = (k + 0.5) / lon * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let k = 1; k < lat; k++) {            // parallels
      const y = k / lat * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
