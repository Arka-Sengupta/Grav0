// Physical constants and unit conversions

// Gravitational constant in simulation units:
// [AU³ / (solar_mass * year²)]
export const G_SIM = 4 * Math.PI * Math.PI; // = 39.478... exact for AU/solar/year

// Speed of light in AU/year
export const C_SIM = 63241.1; // 1 light-year = 63241 AU, so c = 63241 AU/year

// Softening length to prevent singularities (AU)
export const SOFTENING = 0.01;

// Black hole mass threshold (solar masses)
export const BH_THRESHOLD = 1e6;

// Maximum bodies
export const MAX_BODIES = 64;

// Time step (years per simulation step, before timescale multiplier)
// At 60 FPS with timeScale=1: 0.003 yr/frame → 0.18 yr/s → Earth orbit in ~5.5 seconds
export const BASE_DT = 0.003;

// Spacetime grid: how units map to world units
export const SIM_TO_WORLD = 1.0; // 1 AU = 1 world unit

// ─── Unit Conversions ───────────────────────────────────────────────────────

export function solarToKg(m) { return m * 1.989e30; }
export function kgToSolar(m) { return m / 1.989e30; }
export function auToM(r)     { return r * 1.496e11; }
export function mToAu(r)     { return r / 1.496e11; }
export function auToKm(r)    { return r * 1.496e8; }
export function yearToS(t)   { return t * 3.156e7; }

// ─── Color by Mass ───────────────────────────────────────────────────────────

/**
 * Returns a THREE.Color-style hex for a given mass in solar masses.
 * Mapping:
 *   < 0.08  → dim red-brown (brown dwarf)
 *   0.08–2  → orange-yellow (main sequence)
 *   2–8     → yellow-white (hot)
 *   8–20    → blue-white (O/B star)
 *   20–1e6  → cyan-violet (massive)
 *   > 1e6   → black (black hole, handled separately visually)
 */
export function massToColor(mass) {
  if (mass >= BH_THRESHOLD) return 0x111111; // black hole core
  if (mass >= 20)    return 0x88aaff; // blue-white giant
  if (mass >= 8)     return 0xbbddff; // blue-white
  if (mass >= 2)     return 0xffffff; // white/yellow-white
  if (mass >= 0.5)   return 0xffdd88; // yellow (sun-like)
  if (mass >= 0.08)  return 0xff8833; // orange-red
  return 0xcc4411;                    // red dwarf / sub-stellar
}

export function massToEmissive(mass) {
  if (mass >= BH_THRESHOLD) return 0x000000;
  if (mass >= 20)    return 0x2244cc;
  if (mass >= 8)     return 0x3355aa;
  if (mass >= 2)     return 0x886600;
  if (mass >= 0.5)   return 0xcc8800;
  if (mass >= 0.08)  return 0x993300;
  return 0x661100;
}

export function massToGlowColor(mass) {
  if (mass >= BH_THRESHOLD) return 0xff4400; // accretion disk orange
  if (mass >= 20)    return 0x4488ff;
  if (mass >= 8)     return 0x88aaff;
  if (mass >= 2)     return 0xffffff;
  if (mass >= 0.5)   return 0xffcc00;
  if (mass >= 0.08)  return 0xff6600;
  return 0xff2200;
}

// Radius in AU from mass in solar masses (rough main-sequence approximation)
export function defaultRadius(mass) {
  if (mass >= BH_THRESHOLD) return 0.02 * Math.log10(mass / BH_THRESHOLD + 1) + 0.001;
  // Main sequence: R ∝ M^0.8
  return Math.max(0.001, 0.005 * Math.pow(mass, 0.8));
}

// ─── Math Helpers ────────────────────────────────────────────────────────────

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function lerp(a, b, t) { return a + (b - a) * t; }

export function formatMass(m) {
  if (m >= 1e9)  return (m / 1e9).toFixed(2) + ' B M☉';
  if (m >= 1e6)  return (m / 1e6).toFixed(2) + ' M M☉';
  if (m >= 1e3)  return (m / 1e3).toFixed(2) + 'k M☉';
  if (m >= 1)    return m.toFixed(3) + ' M☉';
  return (m * 1000).toFixed(1) + ' mM☉';
}

export function formatDist(d) {
  if (d >= 1000) return (d / 1000).toFixed(2) + ' kAU';
  if (d >= 1)    return d.toFixed(3) + ' AU';
  return (d * 1000).toFixed(1) + ' mAU';
}
