import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this._init();
  }

  _init() {
    // ─── Renderer ────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas:    this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    // ─── Scene ──────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020208);

    // Subtle fog for depth
    this.scene.fog = new THREE.FogExp2(0x020208, 0.003);

    // ─── Camera ─────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.01,
      5000
    );
    this.camera.position.set(0, 14, 20);
    this.camera.lookAt(0, 0, 0);

    // ─── Controls ────────────────────────────────────────────────────────────
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.07;
    this.controls.minDistance    = 0.5;
    this.controls.maxDistance    = 400;
    this.controls.panSpeed       = 1.2;
    this.controls.mouseButtons   = {
      LEFT:   THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT:  THREE.MOUSE.PAN,
    };

    // ─── Lighting ────────────────────────────────────────────────────────────
    this.scene.add(new THREE.AmbientLight(0x0d1a33, 3));

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(15, 25, 10);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x1a0a33, 1);
    fill.position.set(-10, 5, -15);
    this.scene.add(fill);

    // ─── Star Field ──────────────────────────────────────────────────────────
    this._createStarField();

    // ─── Resize ──────────────────────────────────────────────────────────────
    window.addEventListener('resize', () => this._onResize());
  }

  _createStarField() {
    const count     = 3500;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 200 + Math.random() * 600;
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color:           0xffffff,
      size:            0.35,
      sizeAttenuation: true,
      transparent:     true,
      opacity:         0.75,
    });

    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    this.controls.update();
    this.stars.rotation.y += 0.00004;
    this.renderer.render(this.scene, this.camera);
  }

  add(obj)    { this.scene.add(obj); }
  remove(obj) { this.scene.remove(obj); }
}
