import * as THREE from 'three';
import { G_SIM, BH_THRESHOLD, MAX_BODIES } from './utils.js';

const GRID_SIZE = 120;     // Base world coordinates dimension size 
const GRID_SEGMENTS = 200; // Gives us a highly dense mesh when scaled down
const MAX_DEPTH = 18.0; 
const SOFTENING_VIZ = 0.3; 

const spacetimeVertexShader = /* glsl */`
  uniform vec4  uBodies[${MAX_BODIES}]; 
  uniform float uNumBodies;
  uniform float uG;
  uniform float uMaxDepth;
  uniform float uSoftening;
  uniform float uTime;

  varying float vCurvature;
  varying vec2  vWorldPos;

  void main() {
    // Determine actual world space coordinate of this vertex.
    // The mesh follows the camera and scales dynamically, but the physics
    // and grid lines remain anchored to the infinite universe via absolute coords.
    vec4 worldPosRaw = modelMatrix * vec4(position, 1.0);
    vec2 worldPos = vec2(worldPosRaw.x, worldPosRaw.z);
    vWorldPos = worldPos;

    float potential = 0.0;
    int n = int(uNumBodies);

    for (int i = 0; i < ${MAX_BODIES}; i++) {
      if (i >= n) break;
      vec4 body = uBodies[i];
      float mass = body.w;
      if (mass <= 0.0) continue;

      vec2 bodyWorld = vec2(body.x, body.y);
      vec2 diff = worldPos - bodyWorld;
      float r = sqrt(dot(diff, diff) + uSoftening * uSoftening);

      // Dampen visual mass of supermassive black holes sub-linearly
      // so they don't form ultra-wide unnatural flat bowls that cover the entire grid.
      float visualMass = pow(mass, 0.4); 

      // Gather pure Newtonian potential 
      float raw = uG * visualMass / r;
      potential += raw; 
    }

    // Use an asymptotic exponential curve rather than a hard min() clamp.
    // This entirely prevents the grid from hitting a strict numeric limit and 
    // forming flat square "steps" or artificial floors under black holes!
    float normalizedDepth = 1.0 - exp(-potential * 0.0015);
    float displacement = -uMaxDepth * normalizedDepth;

    // Ambient ripple
    float ripple = sin(worldPos.x * 0.25 + uTime * 0.35)
                 * sin(worldPos.y * 0.25 + uTime * 0.30) * 0.06;
    float flatness = 1.0 - clamp(abs(displacement) / uMaxDepth * 2.0, 0.0, 1.0);
    displacement += ripple * flatness;

    // Apply displacement to local pos.z
    vec3 pos = position;
    pos.z += displacement;
    
    vCurvature = clamp(-displacement / uMaxDepth, 0.0, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const spacetimeFragmentShader = /* glsl */`
  varying float vCurvature;
  varying vec2  vWorldPos;
  
  uniform float uTime;
  uniform float uScale;

  void main() {
    // To create an infinite scale-invariant grid, we draw lines based on world pos.
    // As the camera zooms out (uScale increases), we transition smoothly to a larger grid.
    float logScale = log2(max(1.0, uScale * 2.0));
    float zoomLevel = floor(logScale);
    float zoomFract = fract(logScale);

    float spacingPrimary = pow(2.0, zoomLevel);
    float spacingSecondary = pow(2.0, zoomLevel + 1.0);

    float thickness = 0.02 * spacingPrimary;

    vec2 w1 = vWorldPos;
    vec2 grid1 = abs(fract(w1 / spacingPrimary + 0.5) - 0.5) * spacingPrimary;
    vec2 grid2 = abs(fract(w1 / spacingSecondary + 0.5) - 0.5) * spacingSecondary;

    float lineX1 = 1.0 - smoothstep(0.0, thickness, grid1.x);
    float lineY1 = 1.0 - smoothstep(0.0, thickness, grid1.y);
    float line1  = max(lineX1, lineY1);

    float lineX2 = 1.0 - smoothstep(0.0, thickness * 2.0, grid2.x);
    float lineY2 = 1.0 - smoothstep(0.0, thickness * 2.0, grid2.y);
    float line2  = max(lineX2, lineY2);

    float line = max(line2, line1 * (1.0 - zoomFract));

    if (line < 0.01) discard;

    vec3 lowColor  = vec3(0.05, 0.65, 1.00);  
    vec3 midColor  = vec3(0.55, 0.10, 1.00);  
    vec3 highColor = vec3(1.00, 0.85, 1.00);  

    vec3 color;
    if (vCurvature < 0.5) {
      color = mix(lowColor,  midColor,  vCurvature * 2.0);
    } else {
      color = mix(midColor,  highColor, (vCurvature - 0.5) * 2.0);
    }

    float pulse = sin(uTime * 2.5 + vCurvature * 18.0) * 0.5 + 0.5;
    float brightness = 0.5 + vCurvature * 1.0 + pulse * vCurvature * 0.5;

    float alpha = line * (0.25 + vCurvature * 0.75);

    gl_FragColor = vec4(color * brightness, alpha);
  }
`;

export class SpacetimeMesh {
  constructor(scene) {
    this.scene = scene;
    this.time  = 0;

    this._bodyData = new Array(MAX_BODIES)
      .fill(null)
      .map(() => new THREE.Vector4(0, 0, 0, 0));

    const geo = new THREE.PlaneGeometry(
      GRID_SIZE, GRID_SIZE,
      GRID_SEGMENTS, GRID_SEGMENTS
    );

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uBodies:    { value: this._bodyData },
        uNumBodies: { value: 0 },
        uG:         { value: G_SIM },
        uMaxDepth:  { value: MAX_DEPTH },
        uSoftening: { value: SOFTENING_VIZ },
        uTime:      { value: 0 },
        uScale:     { value: 1.0 },
      },
      vertexShader:   spacetimeVertexShader,
      fragmentShader: spacetimeFragmentShader,
      transparent: true,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = -0.5;
    scene.add(this.mesh);
  }

  update(bodies, dt, camera, target) {
    this.time += dt;
    this.material.uniforms.uTime.value      = this.time;
    this.material.uniforms.uNumBodies.value = bodies.length;

    if (camera && target) {
      const dist = camera.position.distanceTo(target);
      const scale = Math.max(0.5, dist / 20.0);
      
      this.mesh.scale.set(scale, scale, 1.0);
      this.material.uniforms.uScale.value = scale;
      
      // Center mesh on target smoothly
      this.mesh.position.x = target.x;
      this.mesh.position.z = target.z;
    }

    for (let i = 0; i < MAX_BODIES; i++) {
      if (i < bodies.length) {
        const b = bodies[i];
        this._bodyData[i].set(b.pos[0], b.pos[1], 0, b.mass);
      } else {
        this._bodyData[i].set(0, 0, 0, 0);
      }
    }
  }
}
