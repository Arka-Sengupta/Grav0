import * as THREE from 'three';
import { massToColor, massToEmissive, massToGlowColor, BH_THRESHOLD } from './utils.js';

let _idCounter = 0;

// ─── Visual radius: decoupled from physical radius ────────────────────────────
// Makes all bodies clearly visible regardless of their actual AU size
function visualRadius(mass) {
  if (mass >= BH_THRESHOLD) return 0.35 + Math.log10(mass / BH_THRESHOLD + 1) * 0.25;
  if (mass >= 20)    return 0.45;
  if (mass >= 2)     return 0.32;
  if (mass >= 0.5)   return 0.25;
  if (mass >= 0.08)  return 0.18;
  return 0.14;
}

// ─── Trail System ─────────────────────────────────────────────────────────────
const TRAIL_LENGTH = 180; // number of trail points per body

class Trail {
  constructor(scene, color) {
    this.positions = new Float32Array(TRAIL_LENGTH * 3);
    this.alphas    = new Float32Array(TRAIL_LENGTH);
    this._head = 0;
    this._filled = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('alpha',    new THREE.BufferAttribute(this.alphas,    1));
    geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */`
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = (2.5 * alpha + 0.5) * (300.0 / -mvPos.z);
          gl_PointSize = clamp(gl_PointSize, 0.5, 6.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = (1.0 - d * 2.0) * vAlpha * 0.85;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.geo = geo;
    scene.add(this.points);
  }

  push(x, y, z) {
    const i = this._head;
    this.positions[i * 3]     = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this._head = (this._head + 1) % TRAIL_LENGTH;
    if (this._filled < TRAIL_LENGTH) this._filled++;

    // Rewrite alpha values from newest (1.0) to oldest (0.0) in ring order
    for (let j = 0; j < this._filled; j++) {
      // idx counts backwards from head
      const idx = (this._head - 1 - j + TRAIL_LENGTH) % TRAIL_LENGTH;
      this.alphas[idx] = 1.0 - j / this._filled;
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate    = true;
    this.geo.setDrawRange(0, this._filled);
  }

  dispose(scene) {
    scene.remove(this.points);
    this.geo.dispose();
    this.points.material.dispose();
  }
}

// ─── BodyManager ──────────────────────────────────────────────────────────────
export class BodyManager {
  constructor(scene) {
    this.scene = scene;
    this._meshMap  = new Map(); // id → { sphere, glow, ring, trail }
    this._frameCounter = 0;
    this.onChanged = null;
  }

  createBody(params) {
    const id   = ++_idCounter;
    const mass = params.mass;
    const pos  = [...(params.pos ?? [0, 0, 0])];
    const vel  = [...(params.vel ?? [0, 0, 0])];
    const radius = params.radius ?? 1; // physical radius (not used for display)

    const body = { id, mass, radius, pos, vel };

    if (mass >= BH_THRESHOLD) {
      this._createBlackHoleMesh(body);
    } else {
      this._createStarMesh(body);
    }

    if (this.onChanged) this.onChanged();
    return body;
  }

  // ── Convert sim coords → world coords ───────────────────────────────────────
  // Simulation: X = right, Y = forward (on the grid plane), Z = up
  // World: X = right, Y = height above grid, Z = forward (Three.js -Z is forward)
  _toWorld(pos) {
    return [pos[0], pos[2], pos[1]]; // sim.x → w.x, sim.z → w.y(height), sim.y → w.z
  }

  _createStarMesh(body) {
    const vr  = visualRadius(body.mass);
    const col = massToColor(body.mass);
    const em  = massToEmissive(body.mass);
    const gc  = massToGlowColor(body.mass);

    // ── Core sphere (proper 3D) ─────────────────────────────────────────────
    const geo = new THREE.SphereGeometry(vr, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
      color:             new THREE.Color(col),
      emissive:          new THREE.Color(em),
      emissiveIntensity: 2.0,
      metalness:         0.15,
      roughness:         0.25,
    });
    const sphere = new THREE.Mesh(geo, mat);
    const wp = this._toWorld(body.pos);
    sphere.position.set(...wp);
    this.scene.add(sphere);

    // ── Additive glow halo ─────────────────────────────────────────────────
    const glowMat = new THREE.SpriteMaterial({
      color: new THREE.Color(gc),
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(vr * 3.5);
    glow.position.copy(sphere.position);
    this.scene.add(glow);

    // ── Particle trail ──────────────────────────────────────────────────────
    const trail = new Trail(this.scene, gc);

    this._meshMap.set(body.id, { sphere, glow, ring: null, trail });
  }

  _createBlackHoleMesh(body) {
    const vr = visualRadius(body.mass);

    // Event horizon (dark sphere with polish)
    const geo = new THREE.SphereGeometry(vr, 48, 48);
    const mat = new THREE.MeshStandardMaterial({
      color:     0x000000,
      emissive:  0x110000,
      emissiveIntensity: 0.3,
      roughness: 0.0,
      metalness: 1.0,
    });
    const sphere = new THREE.Mesh(geo, mat);
    const wp = this._toWorld(body.pos);
    sphere.position.set(...wp);
    this.scene.add(sphere);

    // Accretion ring (tilted torus)
    const ringGeo = new THREE.TorusGeometry(vr * 2.0, vr * 0.45, 12, 80);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(sphere.position);
    ring.rotation.x = Math.PI * 0.28;
    ring.rotation.z = Math.PI * 0.1;
    this.scene.add(ring);

    // Inner hot ring (thinner, brighter)
    const innerRingGeo = new THREE.TorusGeometry(vr * 1.25, vr * 0.18, 8, 80);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.position.copy(sphere.position);
    innerRing.rotation.x = Math.PI * 0.28;
    innerRing.rotation.z = Math.PI * 0.1;
    this.scene.add(innerRing);

    // Glow corona
    const glowMat = new THREE.SpriteMaterial({
      color: new THREE.Color(0xff3300),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(vr * 6);
    glow.position.copy(sphere.position);
    this.scene.add(glow);

    // No trail for black holes (they barely move)
    this._meshMap.set(body.id, { sphere, glow, ring, innerRing, trail: null });
  }

  updateMesh(body) {
    const meshes = this._meshMap.get(body.id);
    if (!meshes) return;

    const { sphere, glow, ring, innerRing, trail } = meshes;
    const [wx, wy, wz] = this._toWorld(body.pos);

    sphere.position.set(wx, wy, wz);

    // Animate sphere rotation for dynamicity
    sphere.rotation.y += 0.012;
    sphere.rotation.z += 0.004;

    if (glow) {
      glow.position.copy(sphere.position);
      // Pulse glow opacity with time
      const t = performance.now() * 0.001;
      glow.material.opacity = 0.12 + Math.sin(t * 2 + body.id) * 0.06;
    }

    if (ring) {
      ring.position.copy(sphere.position);
      ring.rotation.z += 0.012;
    }
    if (innerRing) {
      innerRing.position.copy(sphere.position);
      innerRing.rotation.z -= 0.02; // counter-rotate inner disk
    }

    // Push to trail every 3 frames
    this._frameCounter++;
    if (trail && this._frameCounter % 3 === 0) {
      trail.push(wx, wy, wz);
    }
  }

  removeBody(body) {
    const meshes = this._meshMap.get(body.id);
    if (!meshes) return;
    const { sphere, glow, ring, innerRing, trail } = meshes;

    const rm = (obj) => { if (!obj) return; obj.geometry?.dispose(); obj.material?.dispose(); this.scene.remove(obj); };
    rm(sphere); rm(glow); rm(ring); rm(innerRing);
    if (trail) trail.dispose(this.scene);

    this._meshMap.delete(body.id);
    if (this.onChanged) this.onChanged();
  }

  removeAll(bodies) { for (const b of bodies) this.removeBody(b); }

  highlightBody(id, highlight) {
    const m = this._meshMap.get(id);
    if (!m?.sphere) return;
    m.sphere.material.emissiveIntensity = highlight ? 5.0 : 2.0;
    if (m.glow) m.glow.material.opacity = highlight ? 0.45 : 0.18;
  }

  pick(raycaster, bodies) {
    const spheres = bodies.map(b => {
      const m = this._meshMap.get(b.id);
      return m ? { mesh: m.sphere, id: b.id } : null;
    }).filter(Boolean);

    const hits = raycaster.intersectObjects(spheres.map(s => s.mesh));
    if (!hits.length) return null;
    const found = spheres.find(s => s.mesh === hits[0].object);
    return found?.id ?? null;
  }
}
