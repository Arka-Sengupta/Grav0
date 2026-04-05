import { G_SIM, C_SIM, SOFTENING, MAX_BODIES, BASE_DT } from './utils.js';

// Pure JS N-body simulation — reliable on all WebGL implementations.
// For 50 bodies @ 60fps this is comfortably fast (O(N²) = 2500 ops/frame).
// GPU acceleration is used by Three.js for rendering; physics runs on CPU.

export class Simulation {
  constructor(_renderer) {
    // _renderer kept for API compatibility (was used for GPUComputationRenderer)
    this.timeScale = 1.0;
    this.paused    = false;
    this.useGPU    = false; // JS physics; displayed as CPU badge

    this.bodies = []; // [{ id, mass, radius, pos:[x,y,z], vel:[x,y,z] }]
    console.log('[Sim] JS N-body mode active (reliable cross-platform)');
  }

  // ─── Physics step: Leapfrog N-body ────────────────────────────────────────
  _stepCPU(dt) {
    const n = this.bodies.length;
    if (n === 0) return;

    // Compute accelerations for all bodies simultaneously
    const ax = new Float64Array(n);
    const ay = new Float64Array(n);
    const az = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const bi = this.bodies[i];
      for (let j = i + 1; j < n; j++) {
        const bj = this.bodies[j];

        const dx = bj.pos[0] - bi.pos[0];
        const dy = bj.pos[1] - bi.pos[1];
        const dz = bj.pos[2] - bi.pos[2];
        const dist2 = dx*dx + dy*dy + dz*dz + SOFTENING*SOFTENING;
        const dist  = Math.sqrt(dist2);
        const distCubed = dist2 * dist;

        // Post-Newtonian correction factor
        const pnI = Math.min(1 + (3 * G_SIM * bj.mass) / (dist * C_SIM * C_SIM), 8);
        const pnJ = Math.min(1 + (3 * G_SIM * bi.mass) / (dist * C_SIM * C_SIM), 8);

        const fiMag = G_SIM * bj.mass * pnI / distCubed;
        const fjMag = G_SIM * bi.mass * pnJ / distCubed;

        ax[i] += fiMag * dx;  ay[i] += fiMag * dy;  az[i] += fiMag * dz;
        ax[j] -= fjMag * dx;  ay[j] -= fjMag * dy;  az[j] -= fjMag * dz;
      }
    }

    // Leapfrog: update velocity then position
    const cSq = C_SIM * C_SIM;
    for (let i = 0; i < n; i++) {
      const b = this.bodies[i];
      b.vel[0] += ax[i] * dt;
      b.vel[1] += ay[i] * dt;
      b.vel[2] += az[i] * dt;

      // Relativistic speed limit (0.9c)
      const v2 = b.vel[0]*b.vel[0] + b.vel[1]*b.vel[1] + b.vel[2]*b.vel[2];
      if (v2 > 0.81 * cSq) {
        const scale = Math.sqrt(0.81 * cSq / v2);
        b.vel[0] *= scale; b.vel[1] *= scale; b.vel[2] *= scale;
      }

      b.pos[0] += b.vel[0] * dt;
      b.pos[1] += b.vel[1] * dt;
      b.pos[2] += b.vel[2] * dt;
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────
  addBody(body) {
    if (this.bodies.length >= MAX_BODIES) return false;
    this.bodies.push({ ...body, pos: [...body.pos], vel: [...body.vel] });
    return true;
  }

  removeBody(id) {
    const idx = this.bodies.findIndex(b => b.id === id);
    if (idx >= 0) this.bodies.splice(idx, 1);
  }

  clearBodies() {
    this.bodies = [];
  }

  step() {
    if (this.paused || this.bodies.length === 0) return;

    const dt = BASE_DT * this.timeScale;

    // Keep each sub-step ≤ BASE_DT for numerical stability.
    // Cap total sub-steps at 32 to stay within frame budget.
    const STEPS = Math.min(32, Math.max(1, Math.ceil(dt / BASE_DT)));
    const subDt  = dt / STEPS;
    for (let s = 0; s < STEPS; s++) {
      this._stepCPU(subDt);
    }
  }

  // Kept for API compatibility (spacetime.js used to call this)
  getPositionTexture() { return null; }
}
