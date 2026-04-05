import '../style.css';
import * as THREE from 'three';
import { Scene } from './scene.js';
import { Simulation } from './simulation.js';
import { SpacetimeMesh } from './spacetime.js';
import { BodyManager } from './bodies.js';
import { UI } from './ui.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('sim-canvas');
const scene3d = new Scene(canvas);
const simulation = new Simulation(scene3d.renderer);
const spacetime = new SpacetimeMesh(scene3d.scene);
const bodyMgr = new BodyManager(scene3d.scene);
const ui = new UI(simulation, bodyMgr, scene3d);

// ─── Wire UI callbacks ───────────────────────────────────────────────────────
ui.onAddBody = (params) => {
  const body = bodyMgr.createBody(params);
  const ok = simulation.addBody(body);
  if (!ok) {
    bodyMgr.removeBody(body);
    ui._flashError('Maximum bodies reached');
    return;
  }
  ui.updateBodyList(simulation.bodies);
};

ui.onRemoveBody = (id) => {
  const body = simulation.bodies.find(b => b.id === id);
  if (!body) return;
  bodyMgr.removeBody(body);
  simulation.removeBody(id);
  if (ui.selectedId === id) ui.selectedId = null;
  ui.updateBodyList(simulation.bodies);
};

ui.onClear = () => {
  bodyMgr.removeAll(simulation.bodies);
  simulation.clearBodies();
  ui.selectedId = null;
  ui.updateBodyList([]);
};

ui.onSelectBody = (id) => {
  const body = simulation.bodies.find(b => b.id === id);
  if (!body) return;
  // Smoothly pan camera to look at body
  const target = new THREE.Vector3(body.pos[0], body.pos[2], body.pos[1]);
  scene3d.controls.target.lerp(target, 0.5);
};

bodyMgr.onChanged = () => ui.updateBodyList(simulation.bodies);

// ─── Animation Loop ──────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  // Physics step
  simulation.step();

  // Sync meshes to body positions
  for (const body of simulation.bodies) {
    bodyMgr.updateMesh(body);
  }

  // Update spacetime deformation
  spacetime.update(simulation.bodies, 0.016, scene3d.camera, scene3d.controls.target);

  // Update UI metrics
  ui.updateFPS();

  // Render
  scene3d.render();
}

animate();

// ─── Handle panel toggle on small screens ───────────────────────────────────
document.getElementById('btn-toggle-panel').addEventListener('click', () => {
  document.getElementById('side-panel').classList.toggle('hidden');
});
