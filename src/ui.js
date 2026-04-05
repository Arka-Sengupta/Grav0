import * as THREE from 'three';
import { formatMass, BH_THRESHOLD, MAX_BODIES, G_SIM } from './utils.js';

export class UI {
  constructor(simulation, bodyManager, scene3d) {
    this.sim = simulation;
    this.bodyMgr = bodyManager;
    this.scene3d = scene3d;
    this.selectedId = null;
    this._autoOrbit = true; // on by default

    this._frameTimes = [];
    this._lastFrame = performance.now();

    this._bind();
    this._setupRaycasting();
    this.updateGPUBadge();
    this.updateBodyList([]);
  }

  // ─── Compute circular orbital velocity for a new body ──────────────────────
  // Finds the most massive body, calculates v = sqrt(G*M/r) perpendicular
  // to the position vector in the XY plane.
  _calcOrbitalVelocity(px, py, pz) {
    const bodies = this.sim.bodies;
    if (bodies.length === 0) return { vx: 0, vy: 0, vz: 0, ref: null };

    // Find most massive body (the one to orbit around)
    let anchor = bodies[0];
    for (const b of bodies) {
      if (b.mass > anchor.mass) anchor = b;
    }

    const dx = px - anchor.pos[0];
    const dy = py - anchor.pos[1];
    const dz = pz - anchor.pos[2];
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (r < 1e-6) return { vx: 0, vy: 0, vz: 0, ref: anchor };

    // Circular orbital speed: v = sqrt(G * M / r)
    const vOrbit = Math.sqrt(G_SIM * anchor.mass / r);

    // Tangent vector perpendicular to (dx, dy) in the XY plane, CCW
    // For position vector (dx, dy), the perpendicular CCW is (-dy, dx) / r
    const tx = -dy / r;
    const ty = dx / r;
    // tz contribution for 3D: use cross product of radial with world-up (0,0,1)
    // radial = (dx,dy,dz)/r; up = (0,0,1)
    // tangent = up × radial = (-dy/r, dx/r, 0)  (same as above for flat XY)

    // Add the anchor's own velocity so the orbit is relative to it
    return {
      vx: anchor.vel[0] + tx * vOrbit,
      vy: anchor.vel[1] + ty * vOrbit,
      vz: anchor.vel[2],
      ref: anchor,
      r,
      vOrbit,
    };
  }

  _bind() {
    // ─── Time Controls ────────────────────────────────────────────────
    const playBtn = document.getElementById('btn-play');
    const timeSlider = document.getElementById('time-scale');
    const timeLabel = document.getElementById('time-label');

    playBtn.addEventListener('click', () => {
      this.sim.paused = !this.sim.paused;
      playBtn.textContent = this.sim.paused ? '▶ Play' : '⏸ Pause';
      playBtn.classList.toggle('active', !this.sim.paused);
    });

    timeSlider.addEventListener('input', () => {
      const v = parseFloat(timeSlider.value);
      this.sim.timeScale = Math.pow(10, v);
      const ts = this.sim.timeScale;
      timeLabel.textContent = ts < 1
        ? `×${ts.toFixed(2)}`
        : ts < 100 ? `×${ts.toFixed(1)}` : `×${Math.round(ts)}`;
    });

    // ─── Body Form ────────────────────────────────────────────────────
    const form = document.getElementById('add-body-form');
    form.addEventListener('submit', e => { e.preventDefault(); this._addBodyFromForm(); });

    // ─── Auto-Orbit toggle ────────────────────────────────────────────
    const autoOrbitBtn = document.getElementById('btn-auto-orbit');
    autoOrbitBtn.addEventListener('click', () => {
      this._autoOrbit = !this._autoOrbit;
      autoOrbitBtn.classList.toggle('active', this._autoOrbit);
      autoOrbitBtn.textContent = this._autoOrbit ? '🔄 Auto Orbit: ON' : '🔄 Auto Orbit: OFF';
      this._updateOrbitPreview();
    });

    // Update orbit preview when position inputs change
    ['input-px', 'input-py', 'input-pz'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this._updateOrbitPreview());
    });

    // ─── Presets ──────────────────────────────────────────────────────
    document.getElementById('preset-sun-earth').addEventListener('click', () => this._presetSunEarth());
    document.getElementById('preset-binary').addEventListener('click', () => this._presetBinary());
    document.getElementById('preset-blackhole').addEventListener('click', () => this._presetBlackHole());

    // ─── Reset ────────────────────────────────────────────────────────
    document.getElementById('btn-reset').addEventListener('click', () => this._dispatchClear());

    // ─── Mass preview ─────────────────────────────────────────────────
    const massInput = document.getElementById('input-mass');
    const massUnitToggle = document.getElementById('mass-unit');
    const massPreview = document.getElementById('mass-preview');

    const updateMassPreview = () => {
      const v = parseFloat(massInput.value) || 0;
      const unit = massUnitToggle.value;
      const solar = unit === 'solar' ? v : v / 1.989e30;
      massPreview.textContent = formatMass(solar);
      massPreview.className = solar >= BH_THRESHOLD ? 'mass-preview bh' : 'mass-preview';
    };
    massInput.addEventListener('input', updateMassPreview);
    massUnitToggle.addEventListener('change', updateMassPreview);
  }

  // ─── Raycasting (click to select body) ───────────────────────────────────
  _setupRaycasting() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    this.scene3d.renderer.domElement.addEventListener('click', e => {
      if (e.target !== this.scene3d.renderer.domElement) return;

      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, this.scene3d.camera);

      const picked = this.bodyMgr.pick(raycaster, this.sim.bodies);

      if (this.selectedId !== null) {
        this.bodyMgr.highlightBody(this.selectedId, false);
        document.querySelector(`.body-item[data-id="${this.selectedId}"]`)
          ?.classList.remove('selected');
      }

      if (picked !== null && picked !== this.selectedId) {
        this.selectedId = picked;
        this.bodyMgr.highlightBody(picked, true);
        document.querySelector(`.body-item[data-id="${picked}"]`)
          ?.classList.add('selected');
        if (this.onSelectBody) this.onSelectBody(picked);
      } else {
        this.selectedId = null;
      }
    });
  }

  // Refreshes the orbit hint shown under velocity fields
  _updateOrbitPreview() {
    const hint = document.getElementById('orbit-hint');
    if (!hint) return;

    if (!this._autoOrbit || this.sim.bodies.length === 0) {
      hint.style.display = 'none';
      return;
    }

    const px = parseFloat(document.getElementById('input-px').value) || 0;
    const py = parseFloat(document.getElementById('input-py').value) || 0;
    const pz = parseFloat(document.getElementById('input-pz').value) || 0;
    const orb = this._calcOrbitalVelocity(px, py, pz);

    if (!orb.ref) { hint.style.display = 'none'; return; }

    hint.style.display = 'block';
    hint.innerHTML = `
      <span class="orbit-icon">🔄</span>
      Orbiting <strong>${formatMass(orb.ref.mass)}</strong>
      at <strong>${orb.r?.toFixed(2)} AU</strong><br>
      <span class="orbit-vel">v = ${orb.vOrbit?.toFixed(2)} AU/yr auto-applied</span>
    `;

    // Auto-fill velocity fields so user can see the values
    document.getElementById('input-vx').value = orb.vx.toFixed(4);
    document.getElementById('input-vy').value = orb.vy.toFixed(4);
    document.getElementById('input-vz').value = orb.vz.toFixed(4);
  }

  _addBodyFromForm() {
    const massVal = parseFloat(document.getElementById('input-mass').value);
    const massUnit = document.getElementById('mass-unit').value;
    const mass = massUnit === 'solar' ? massVal : massVal / 1.989e30;

    const px = parseFloat(document.getElementById('input-px').value) || 0;
    const py = parseFloat(document.getElementById('input-py').value) || 0;
    const pz = parseFloat(document.getElementById('input-pz').value) || 0;

    if (isNaN(mass) || mass <= 0) { this._flashError('Enter a valid positive mass'); return; }
    if (this.sim.bodies.length >= MAX_BODIES) { this._flashError(`Max ${MAX_BODIES} bodies`); return; }

    let vx = parseFloat(document.getElementById('input-vx').value) || 0;
    let vy = parseFloat(document.getElementById('input-vy').value) || 0;
    let vz = parseFloat(document.getElementById('input-vz').value) || 0;

    // If Auto Orbit is ON and there are existing bodies, override velocity
    if (this._autoOrbit && this.sim.bodies.length > 0) {
      const orb = this._calcOrbitalVelocity(px, py, pz);
      vx = orb.vx; vy = orb.vy; vz = orb.vz;
    }

    this._dispatchAddBody({ mass, pos: [px, py, pz], vel: [vx, vy, vz] });
  }

  _flashError(msg) {
    const el = document.getElementById('form-error');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(this._errTimer);
    this._errTimer = setTimeout(() => { el.style.opacity = '0'; }, 3000);
  }

  _flashSuccess(msg) {
    const el = document.getElementById('form-error');
    el.textContent = msg;
    el.style.color = 'var(--accent-green)';
    el.style.opacity = '1';
    clearTimeout(this._errTimer);
    this._errTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.color = '';
    }, 2000);
  }

  _dispatchAddBody(params) { if (this.onAddBody) this.onAddBody(params); }
  _dispatchClear() { if (this.onClear) this.onClear(); }

  // ─── Presets ─────────────────────────────────────────────────────────────────
  _presetSunEarth() {
    if (this.onClear) this.onClear();
    setTimeout(() => {
      this.onAddBody?.({ mass: 1.0, pos: [0, 0, 0], vel: [0, 0, 0] });
      this.onAddBody?.({ mass: 3e-6, pos: [1, 0, 0], vel: [0, 6.283, 0] }); // Earth
      this.onAddBody?.({ mass: 9.5e-4, pos: [5.2, 0, 0], vel: [0, 2.755, 0] }); // Jupiter
    }, 100);
  }

  _presetBinary() {
    if (this.onClear) this.onClear();
    setTimeout(() => {
      this.onAddBody?.({ mass: 2.0, pos: [-1.5, 0, 0], vel: [0, -4.44, 0] });
      this.onAddBody?.({ mass: 2.0, pos: [1.5, 0, 0], vel: [0, 4.44, 0] });
    }, 100);
  }

  _presetBlackHole() {
    if (this.onClear) this.onClear();
    setTimeout(() => {
      this.onAddBody?.({ mass: 1e7, pos: [0, 0, 0], vel: [0, 0, 0] });
      this.onAddBody?.({ mass: 1000, pos: [20, 20, 0], vel: [-2603.1701,2678.4409,0] });
    }, 100);
  }

  // ─── Body List ───────────────────────────────────────────────────────────────
  updateBodyList(bodies) {
    const list = document.getElementById('body-list');
    list.innerHTML = '';

    if (bodies.length === 0) {
      list.innerHTML = '<div class="empty-hint">No bodies yet — use a preset or add below</div>';
      this._updateOrbitPreview();
      return;
    }

    for (const b of bodies) {
      const isBH = b.mass >= BH_THRESHOLD;
      const item = document.createElement('div');
      item.className = 'body-item' + (b.id === this.selectedId ? ' selected' : '');
      item.dataset.id = b.id;
      const speed = Math.hypot(b.vel[0], b.vel[1], b.vel[2]).toFixed(2);

      item.innerHTML = `
        <div class="body-dot" style="background:${this._massHex(b.mass)}"></div>
        <div class="body-info">
          <span class="body-name">${isBH ? '⚫ Black Hole' : '⭐ Body'} #${b.id}</span>
          <span class="body-detail">${formatMass(b.mass)}</span>
          <span class="body-detail pos-detail">
            ${b.pos.map(v => v.toFixed(2)).join(' , ')} AU
          </span>
          <span class="body-detail spd-detail">|v| = ${speed} AU/yr</span>
        </div>
        <button class="btn-delete" data-id="${b.id}" title="Remove body">✕</button>
      `;

      item.querySelector('.btn-delete').addEventListener('click', e => {
        e.stopPropagation();
        if (this.onRemoveBody) this.onRemoveBody(parseInt(e.currentTarget.dataset.id));
      });
      item.addEventListener('click', () => {
        if (this.onSelectBody) this.onSelectBody(b.id);
      });

      list.appendChild(item);
    }

    document.getElementById('body-count').textContent = bodies.length;
    document.getElementById('body-count-max').textContent = MAX_BODIES;

    // Refresh orbit hint whenever body list changes
    this._updateOrbitPreview();
  }

  _massHex(mass) {
    if (mass >= BH_THRESHOLD) return '#ff4400';
    if (mass >= 20) return '#88aaff';
    if (mass >= 2) return '#ffffff';
    if (mass >= 0.5) return '#ffcc44';
    if (mass >= 0.08) return '#ff8833';
    return '#cc4411';
  }

  // ─── FPS ─────────────────────────────────────────────────────────────────────
  updateFPS() {
    const now = performance.now();
    const delta = now - this._lastFrame;
    this._lastFrame = now;
    this._frameTimes.push(delta);
    if (this._frameTimes.length > 60) this._frameTimes.shift();
    const avg = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
    document.getElementById('fps-value').textContent = Math.round(1000 / avg);
  }

  updateGPUBadge() {
    const badge = document.getElementById('gpu-badge');
    if (this.sim.useGPU) {
      badge.textContent = '⚡ GPU'; badge.className = 'badge gpu';
    } else {
      badge.textContent = '🖥 CPU'; badge.className = 'badge cpu';
    }
  }
}
