// terrain.js — analytic gaussian height-field rendered as a synced
// wireframe grid + glowing point cloud.
//
// The field is the sum of a few moving gaussian "features" (peaks when their
// amplitude is positive, valleys when negative) over a gentle outward bowl that
// keeps the ball framed. Because it's closed-form we get the exact gradient for
// free — that's what gives the ball clean, stable downhill physics — and
// morphing is just easing each feature's parameters toward new random targets.

import * as THREE from 'three';

export class HeightField {
  constructor(config, theme) {
    this.cfg = config;
    this.theme = theme;

    this.size = config.size;
    this.seg = config.segments;
    this.half = this.size / 2;
    this.step = this.size / this.seg;

    // Circular container clips the grid/surface to a disc; the ball also bounces
    // off this radius (see ball.js _clampToField).
    this.shape = config.shape || 'square';
    this.boundaryRadius = config.radius || this.half;

    // Locked edges: pin the surface to 0 near the rim so it always comes back
    // down. Flattening ramps from edgeLock·R out to the boundary radius.
    this._locked = this.shape === 'circle' && config.edgeLock !== false;
    this._lockEnd = this.boundaryRadius;
    this._lockStart = (config.edgeLock ?? 0.66) * this.boundaryRadius;

    // Soft height clamp keeps dips/peaks from getting deep enough to show their
    // undersides (smooth, so the gradient stays continuous for the physics).
    this._clamp = config.clamp || null;
    this._clampK = config.clamp?.softness ?? 0.32;

    // Build the hills-and-valleys features. Each is anchored (so the overall
    // shape holds) but drifts continuously via slow sine oscillation, so the
    // gradient is always moving. Random freqs/phases keep them out of lockstep.
    const specs = config.featuresAuto ? this._autoFeatures(config.featuresAuto) : config.landscape;
    const TAU = Math.PI * 2;
    const sp = config.morphSpeed ?? 1; // overall drift-speed multiplier
    this.features = specs.map((spec) => ({
      spec,
      cx: spec.x, cz: spec.z, amp: config.featureAmp * spec.amp, sigma: spec.sigma,
      osc: {
        fx: this._rand(0.13, 0.32) * sp, px: this._rand(0, TAU),
        fz: this._rand(0.13, 0.32) * sp, pz: this._rand(0, TAU),
        fa: this._rand(0.09, 0.22) * sp, pa: this._rand(0, TAU),
        fs: this._rand(0.10, 0.24) * sp, ps: this._rand(0, TAU),
      },
    }));
    this._time = 0;

    // Transient local "lift": hovering / clicking raises the ground under the
    // cursor, which relaxes back once the pointer leaves. Folded into the field
    // (see height/gradient) so the ball physics react to it as well.
    this._lift = { x: 0, z: 0, amp: 0 };
    this._liftTargetX = 0;
    this._liftTargetZ = 0;
    this._hovering = false;
    this._liftSigma = this.boundaryRadius * 0.16; // footprint of the raised area
    this._liftMax = 8;                            // steady-state hover height
    this._liftPop = 13;                           // instant height from a click

    this._buildMeshes();
    this.update(0); // populate vertex positions/colors for frame 0
  }

  // --- field math ---------------------------------------------------------

  height(x, z) {
    let S = 0;
    for (const f of this.features) {
      const dx = x - f.cx;
      const dz = z - f.cz;
      S += f.amp * Math.exp(-(dx * dx + dz * dz) / (2 * f.sigma * f.sigma));
    }
    if (this._lift.amp > 1e-3) {
      const lx = x - this._lift.x, lz = z - this._lift.z;
      S += this._lift.amp * Math.exp(-(lx * lx + lz * lz) / (2 * this._liftSigma * this._liftSigma));
    }
    // Locked edges: force the surface to 0 at the rim so it always comes back
    // down — hills/valleys live in the interior and slope into a flat rim.
    const raw = this._locked
      ? this._edgeMask(Math.hypot(x, z)) * S
      : this.cfg.baseBowl * (x * x + z * z) * 0.01 + S;
    return this._clamp ? softClamp(raw, this._clamp.min, this._clamp.max, this._clampK) : raw;
  }

  // Returns [dH/dx, dH/dz]. Used by the ball to roll downhill.
  gradient(x, z) {
    let S = 0, dSx = 0, dSz = 0;
    for (const f of this.features) {
      const dx = x - f.cx;
      const dz = z - f.cz;
      const g = f.amp * Math.exp(-(dx * dx + dz * dz) / (2 * f.sigma * f.sigma));
      const inv = 1 / (f.sigma * f.sigma);
      S += g;
      dSx += g * -dx * inv;
      dSz += g * -dz * inv;
    }
    if (this._lift.amp > 1e-3) {
      const lx = x - this._lift.x, lz = z - this._lift.z;
      const ls2 = this._liftSigma * this._liftSigma;
      const g = this._lift.amp * Math.exp(-(lx * lx + lz * lz) / (2 * ls2));
      S += g;
      dSx += g * -lx / ls2;
      dSz += g * -lz / ls2;
    }
    let raw, gx, gz;
    if (this._locked) {
      // d/dx[ mask(r)·S ] = mask·dS + S·dmask/dr·(x/r)
      const r = Math.hypot(x, z);
      const m = this._edgeMask(r);
      raw = m * S;
      gx = m * dSx; gz = m * dSz;
      if (r > 1e-5) {
        const dm = this._edgeMaskDeriv(r);
        gx += S * dm * (x / r);
        gz += S * dm * (z / r);
      }
    } else {
      raw = this.cfg.baseBowl * (x * x + z * z) * 0.01 + S;
      gx = this.cfg.baseBowl * 0.02 * x + dSx;
      gz = this.cfg.baseBowl * 0.02 * z + dSz;
    }
    // Chain rule through the soft clamp: d(clamp(raw))/dx = clamp'(raw)·draw/dx.
    if (this._clamp) {
      const d = softClampDeriv(raw, this._clamp.min, this._clamp.max, this._clampK);
      gx *= d; gz *= d;
    }
    return [gx, gz];
  }

  // Scatter many small bumps across the disc with alternating signs (hills +,
  // valleys −) for fine-grained relief. Uniform-in-disc placement via sqrt.
  _autoFeatures(opt) {
    const R = this.boundaryRadius * (opt.spread ?? 0.62);
    const out = [];
    for (let i = 0; i < opt.count; i++) {
      const ang = this._rand(0, Math.PI * 2);
      const rad = Math.sqrt(Math.random()) * R;
      const sign = i % 2 === 0 ? 1 : -1;
      out.push({
        x: Math.cos(ang) * rad,
        z: Math.sin(ang) * rad,
        amp: sign * this._rand(opt.amp[0], opt.amp[1]),
        sigma: this._rand(opt.sigma[0], opt.sigma[1]),
        jitter: opt.jitter,
        ampJitter: opt.ampJitter,
      });
    }
    return out;
  }

  // Radial window: 1 in the interior, smoothly → 0 at the boundary radius.
  _edgeMask(r) {
    const a = this._lockStart, b = this._lockEnd;
    if (r <= a) return 1;
    if (r >= b) return 0;
    const u = (r - a) / (b - a);
    return 1 - u * u * (3 - 2 * u);
  }

  _edgeMaskDeriv(r) {
    const a = this._lockStart, b = this._lockEnd;
    if (r <= a || r >= b) return 0;
    const u = (r - a) / (b - a);
    return -(6 * u * (1 - u)) / (b - a);
  }

  // --- morphing -----------------------------------------------------------

  morph(dt) {
    // Continuously drive every feature from slow sine oscillation, so the
    // gradient never stops moving. Anchored + sign-preserving so the landscape
    // keeps its hills-and-valleys character.
    this._time += dt;
    const t = this._time;
    const amp = this.cfg.featureAmp;
    for (const f of this.features) {
      const s = f.spec, o = f.osc;
      f.cx = s.x + s.jitter * Math.sin(t * o.fx + o.px);
      f.cz = s.z + s.jitter * Math.cos(t * o.fz + o.pz);
      f.amp = amp * (s.amp + s.ampJitter * Math.sin(t * o.fa + o.pa));
      f.sigma = s.sigma * (1 + 0.07 * Math.sin(t * o.fs + o.ps));
    }

    // Ease the transient lift: while hovering, slide the bump toward the cursor
    // and ramp its height up; otherwise relax it back down.
    const lf = this._lift;
    if (this._hovering) {
      const kp = Math.min(1, dt * 14);
      lf.x += (this._liftTargetX - lf.x) * kp;
      lf.z += (this._liftTargetZ - lf.z) * kp;
      lf.amp += (this._liftMax - lf.amp) * Math.min(1, dt * 8);
    } else if (lf.amp > 0) {
      lf.amp -= lf.amp * Math.min(1, dt * 3.2);
      if (lf.amp < 1e-3) lf.amp = 0;
    }
  }

  // --- transient lift (driven by the widget's hover/click handlers) -------

  hoverAt(x, z) {
    if (this._lift.amp < 0.05) { this._lift.x = x; this._lift.z = z; } // snap when fresh
    this._liftTargetX = x;
    this._liftTargetZ = z;
    this._hovering = true;
  }
  hoverEnd() { this._hovering = false; }
  burst(x, z) {
    this._lift.x = this._liftTargetX = x;
    this._lift.z = this._liftTargetZ = z;
    this._lift.amp = Math.max(this._lift.amp, this._liftPop);
  }

  _rand(a, b) { return a + Math.random() * (b - a); }

  // --- meshes -------------------------------------------------------------

  _buildMeshes() {
    const n = this.seg + 1;
    const count = n * n;
    this.vertCount = count;

    this._positions = new Float32Array(count * 3);
    this._colors = new Float32Array(count * 3);

    // Fill X/Z once (only Y changes per frame). `inside` masks vertices to the
    // circular container so we can clip the grid + surface to a disc.
    const inside = new Array(count);
    const circle = this.shape === 'circle';
    const R2 = this.boundaryRadius * this.boundaryRadius;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const vi = j * n + i;
        const x = -this.half + i * this.step;
        const z = -this.half + j * this.step;
        this._positions[vi * 3] = x;
        this._positions[vi * 3 + 2] = z;
        inside[vi] = circle ? (x * x + z * z) <= R2 : true;
      }
    }

    const posAttr = new THREE.BufferAttribute(this._positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this._posAttr = posAttr;

    // Wireframe: connect each vertex to its right and bottom neighbour, but only
    // when both endpoints are inside the container.
    const lineIndex = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * n + i;
        if (i < n - 1 && inside[a] && inside[a + 1]) lineIndex.push(a, a + 1);
        if (j < n - 1 && inside[a] && inside[a + n]) lineIndex.push(a, a + n);
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', posAttr); // shared attribute
    lineGeo.setIndex(lineIndex);

    // For circular fields, fade the grid lines to transparent in a thin band at
    // the very rim, so the disc has no hard circle outline. A tiny shader does
    // the per-vertex alpha (LineBasicMaterial can't).
    let lineMat;
    if (circle) {
      const fadeStart = this.boundaryRadius * (this.cfg.edgeLineFade ?? 0.88);
      lineMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          // ShaderMaterial writes raw values to the (sRGB) framebuffer with no
          // colorspace pass, so the uniform must hold display-space values —
          // otherwise the lines render darker than the theme colour says.
          uColor: { value: new THREE.Color(this.theme.wireframe.color).convertLinearToSRGB() },
          uOpacity: { value: this.theme.wireframe.opacity },
          uFadeStart: { value: fadeStart },
          uFadeEnd: { value: this.boundaryRadius },
        },
        vertexShader: `
          varying float vR;
          void main() {
            vR = length(position.xz);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uOpacity; uniform float uFadeStart; uniform float uFadeEnd;
          varying float vR;
          void main() {
            float a = uOpacity * (1.0 - smoothstep(uFadeStart, uFadeEnd, vR));
            if (a <= 0.001) discard;
            gl_FragColor = vec4(uColor, a);
          }`,
      });
    } else {
      lineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(this.theme.wireframe.color),
        transparent: true,
        opacity: this.theme.wireframe.opacity,
      });
    }
    this.lines = new THREE.LineSegments(lineGeo, lineMat);

    // Group everything so the widget can add/transform it together.
    this.group = new THREE.Group();

    // Optional filled, lit surface (gives the landscape real 3D form). Built
    // before the lines so the grid reads as drawn on top; polygonOffset keeps
    // the fill from z-fighting the lines.
    if (this.theme.surface?.enabled) {
      const tri = [];
      for (let j = 0; j < n - 1; j++) {
        for (let i = 0; i < n - 1; i++) {
          const a = j * n + i, b = a + 1, cc = a + n, d = a + n + 1;
          // Keep each triangle only if all its corners are inside the container.
          if (inside[a] && inside[cc] && inside[b]) tri.push(a, cc, b);
          if (inside[b] && inside[cc] && inside[d]) tri.push(b, cc, d); // +Y winding
        }
      }
      const sm = this.theme.surface;
      const surfGeo = new THREE.BufferGeometry();
      surfGeo.setAttribute('position', posAttr); // shared attribute
      surfGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      surfGeo.setIndex(tri);

      // Height-based vertex tint (dark valleys → light peaks) on top of lighting.
      const useTint = !!(sm.colorLow && sm.colorHigh);
      if (useTint) {
        this._surfColors = new Float32Array(count * 3);
        surfGeo.setAttribute('color', new THREE.BufferAttribute(this._surfColors, 3));
        this._surfColorAttr = surfGeo.getAttribute('color');
        this._surfLow = new THREE.Color(sm.colorLow);
        this._surfHigh = new THREE.Color(sm.colorHigh);
        // Dissolve the fill into the page background toward the rim, so the disc
        // has no hard coloured edge — it fades to the page colour as r → R.
        // The mix runs at dithering_fragment, AFTER the colorspace pass, so the
        // uniform must hold display-space values — on a dark page a linear-space
        // target fades visibly darker than the page (invisible on white).
        this._surfBg = new THREE.Color(this.theme.background).convertLinearToSRGB();
        this._surfFadeStart = this.boundaryRadius * (sm.edgeFade ?? 0.3);
        this._surfFadeEnd = this.boundaryRadius;
        // Alpha-dissolve the very rim to fully transparent before the clipped
        // triangle boundary (a jagged polygon, not a true circle — the clip
        // keeps whole grid cells, so the geometric edge wanders up to a cell
        // diagonal inside R). The colour mix above hides the edge only while
        // fill == page; during a theme toggle the page colour changes under
        // the old render and an opaque rim would flash its jagged silhouette.
        this._surfAFadeStart = this.boundaryRadius * 0.76;
        this._surfAFadeEnd = this.boundaryRadius * 0.93;
      }
      // Unlit fill (sm.unlit): a pure page-coloured occluder. On a near-black
      // page, lighting always shades slopes into visible grey patches, so the
      // dark theme skips lighting entirely — the fill renders as the page
      // colour (plus a whisper of height tint) and the grid carries the form.
      // transparent + depthWrite: the rim alpha-dissolve below needs blending,
      // while the depth write keeps the fill occluding the lines behind hills.
      const surfMat = sm.unlit
        ? new THREE.MeshBasicMaterial({
            color: useTint ? 0xffffff : new THREE.Color(sm.color),
            vertexColors: useTint,
            transparent: true,
            depthWrite: true,
            side: THREE.FrontSide,
            polygonOffset: true,
            polygonOffsetFactor: 3,
            polygonOffsetUnits: 2,
          })
        : new THREE.MeshStandardMaterial({
            color: useTint ? 0xffffff : new THREE.Color(sm.color),
            vertexColors: useTint,
            transparent: true,
            depthWrite: true,
            roughness: sm.roughness,
            metalness: sm.metalness,
            side: THREE.FrontSide, // cull undersides — no front/back z-fight on steep folds
            flatShading: false,
            polygonOffset: true,
            polygonOffsetFactor: 3, // push the fill behind the grid so lines never z-fight it
            polygonOffsetUnits: 2,
          });
      // Dissolve the fill into the page background toward the rim. Done in the
      // fragment shader *after* lighting so the very edge is the exact page
      // colour (a lit white vertex colour would render slightly off).
      if (useTint) {
        surfMat.onBeforeCompile = (shader) => {
          shader.uniforms.uBg = { value: this._surfBg };
          shader.uniforms.uFadeStart = { value: this._surfFadeStart };
          shader.uniforms.uFadeEnd = { value: this._surfFadeEnd };
          shader.uniforms.uAFadeStart = { value: this._surfAFadeStart };
          shader.uniforms.uAFadeEnd = { value: this._surfAFadeEnd };
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec2 vSurfXZ;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfXZ = position.xz;');
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec2 vSurfXZ;\nuniform vec3 uBg;\nuniform float uFadeStart;\nuniform float uFadeEnd;\nuniform float uAFadeStart;\nuniform float uAFadeEnd;')
            .replace('#include <dithering_fragment>', '#include <dithering_fragment>\nfloat _r = length(vSurfXZ);\nfloat _bf = smoothstep(uFadeStart, uFadeEnd, _r);\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uBg, _bf);\ngl_FragColor.a *= 1.0 - smoothstep(uAFadeStart, uAFadeEnd, _r);');
        };
      }
      this.surface = new THREE.Mesh(surfGeo, surfMat);
      // Render the now-transparent fill before every other transparent object
      // (grid lines, ball blob) so it stays the bottom layer, as it was when
      // it drew in the opaque pass.
      this.surface.renderOrder = -1;
      this.surfaceGeo = surfGeo;
      this.group.add(this.surface);
    }

    this.group.add(this.lines);

    // Points: same positions + per-vertex colour graded by height (optional).
    if (this.theme.points.enabled !== false) {
      const pointGeo = new THREE.BufferGeometry();
      pointGeo.setAttribute('position', posAttr); // shared attribute
      pointGeo.setAttribute('color', new THREE.BufferAttribute(this._colors, 3));
      this._colorAttr = pointGeo.getAttribute('color');
      const pointMat = new THREE.PointsMaterial({
        size: this.theme.points.size,
        map: makeDotTexture(),
        vertexColors: true,
        transparent: true,
        opacity: this.theme.points.opacity,
        depthWrite: false,
        blending: this.theme.points.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        sizeAttenuation: true,
      });
      this.points = new THREE.Points(pointGeo, pointMat);

      this._colLow = new THREE.Color(this.theme.points.colorLow);
      this._colHigh = new THREE.Color(this.theme.points.colorHigh);
      this.group.add(this.points);
    }
  }

  // Recompute Y for every vertex and the height-graded colours.
  update() {
    const n = this.seg + 1;
    const amp = this.cfg.featureAmp;
    const grade = !!this._colorAttr;
    const tint = !!this._surfColorAttr;
    const low = this._colLow, high = this._colHigh;
    const sLow = this._surfLow, sHigh = this._surfHigh;
    const c = new THREE.Color();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const vi = j * n + i;
        const idx = vi * 3;
        const x = this._positions[idx];
        const z = this._positions[idx + 2];
        const y = this.height(x, z);
        this._positions[idx + 1] = y;

        if (grade) {
          // Map height → [0,1] for point colour grading.
          const t = THREE.MathUtils.clamp((y + amp) / (2 * amp), 0, 1);
          c.copy(low).lerp(high, t);
          this._colors[idx] = c.r;
          this._colors[idx + 1] = c.g;
          this._colors[idx + 2] = c.b;
        }
        if (tint) {
          // Light, low-contrast height tint.
          const ts = THREE.MathUtils.clamp((y + amp * 0.9) / (amp * 1.8), 0, 1);
          c.copy(sLow).lerp(sHigh, ts);
          this._surfColors[idx] = c.r;
          this._surfColors[idx + 1] = c.g;
          this._surfColors[idx + 2] = c.b;
        }
      }
    }
    this._posAttr.needsUpdate = true;
    if (grade) this._colorAttr.needsUpdate = true;
    if (tint) this._surfColorAttr.needsUpdate = true;
    // Recompute normals so the filled surface shades correctly as it morphs.
    if (this.surfaceGeo) this.surfaceGeo.computeVertexNormals();
  }

  dispose() {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    if (this.surface) {
      this.surface.geometry.dispose();
      this.surface.material.dispose();
    }
    if (this.points) {
      this.points.geometry.dispose();
      this.points.material.map?.dispose();
      this.points.material.dispose();
    }
  }
}

function smoothstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Numerically stable softplus: ~max(x,0), smoothly rounded near 0.
function softplus(x, k) {
  const kx = k * x;
  return (Math.max(kx, 0) + Math.log1p(Math.exp(-Math.abs(kx)))) / k;
}
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

// Smoothly limit h to [lo, hi] (soft floor then soft ceiling) and its derivative
// w.r.t. h, so deep dips/tall peaks flatten gently instead of clipping hard.
function softClamp(h, lo, hi, k) {
  const floored = lo + softplus(h - lo, k);
  return hi - softplus(hi - floored, k);
}
function softClampDeriv(h, lo, hi, k) {
  const floored = lo + softplus(h - lo, k);
  return sigmoid(k * (h - lo)) * sigmoid(k * (hi - floored));
}

// Soft circular sprite so the point cloud reads as round glowing dots rather
// than hard squares.
function makeDotTexture() {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
