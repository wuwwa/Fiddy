import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { createBonusCharacter, type BonusCharacterState } from '../src/free-jelly/bonus-character';

function fixture() {
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 40);
  camera.position.set(0, 3, 12); camera.lookAt(0, 1, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const geometry = new THREE.SphereGeometry(1, 20, 12); geometry.translate(0, 1.05, 0);
  const material = new THREE.MeshBasicNodeMaterial(), body = new THREE.Mesh(geometry, material); scene.add(body);
  const character = createBonusCharacter(scene, camera, body);
  const state: BonusCharacterState = { active: true, amount: 1, phase: 'visiting', age: 3, delight: 0,
    grabbed: false, pressure: 0, speed: 0, impact: 0, target: new THREE.Vector3(1.4, 3, 0), reducedMotion: false };
  const step = (count = 30) => { for (let i = 0; i < count; i++) character.update(1 / 60, state); };
  return { scene, body, character, state, step, dispose() { character.dispose(); geometry.dispose(); material.dispose(); } };
}

test('the face stays attached and finite through translation, squash and tumbling', () => {
  const f = fixture();
  try {
    for (const [x, y, z, sx, sy, sz, angle] of [[0, 0, 0, 1, 1, 1, 0], [1.1, 1.3, 0.3, 1.35, 0.55, 1.1, 0], [-0.7, 1.1, 0, 0.7, 1.6, 0.9, 2.1]]) {
      f.body.position.set(x, y, z); f.body.scale.set(sx, sy, sz); f.body.rotation.z = angle; f.step();
      assert.equal(f.character.diagnostics().attached, true, `transform ${x},${y},${z},${sx},${sy},${sz},${angle}`);
      assert.equal(f.character.diagnostics().visible, true);
      const face = f.scene.getObjectByName('Jelly companion')!;
      for (const child of face.children) {
        const mesh = child as THREE.Mesh, positions = mesh.geometry.getAttribute('position');
        assert.ok(mesh.geometry.drawRange.count > 0);
        for (let i = 0; i < mesh.geometry.drawRange.count; i++) {
          assert.ok(Number.isFinite(positions.getX(i)) && Number.isFinite(positions.getY(i)) && Number.isFinite(positions.getZ(i)));
        }
      }
    }
  } finally { f.dispose(); }
});

test('the companion reacts to handling, enjoys its own happy moments and grows sleepy', () => {
  const f = fixture();
  try {
    f.step(); assert.equal(f.character.diagnostics().expression, 'content');
    f.state.grabbed = true; f.step(); assert.equal(f.character.diagnostics().expression, 'curious');
    f.state.pressure = 0.8; f.step(); assert.equal(f.character.diagnostics().expression, 'squished');
    f.state.grabbed = false; f.state.pressure = 0; f.state.delight = 1; f.step(1); assert.equal(f.character.diagnostics().expression, 'happy');
    f.state.grabbed = false; f.state.pressure = 0; f.state.speed = 4; f.state.delight = 0; f.step(60);
    assert.equal(f.character.diagnostics().expression, 'surprised');
    f.state.speed = 0; f.state.phase = 'farewell'; f.step(); assert.equal(f.character.diagnostics().expression, 'sleepy');
    f.state.active = false; f.step(1); assert.equal(f.character.diagnostics().visible, false);
    f.state.active = true; f.state.phase = 'waiting'; f.state.amount = 0.3; f.state.delight = 0; f.state.speed = 0; f.step(1);
    assert.equal(f.character.diagnostics().expression, 'waking');
  } finally { f.dispose(); }
});

test('reduced motion keeps an awake static face and disposal releases every owned resource once', () => {
  const f = fixture();
  f.state.reducedMotion = true; f.step();
  const opening = f.character.diagnostics().eyeOpening;
  f.step(250); assert.equal(f.character.diagnostics().eyeOpening, opening);
  let disposed = 0;
  const face = f.scene.getObjectByName('Jelly companion')!;
  for (const child of face.children) {
    const mesh = child as THREE.Mesh;
    mesh.geometry.addEventListener('dispose', () => disposed++);
    (mesh.material as THREE.Material).addEventListener('dispose', () => disposed++);
  }
  f.character.dispose(); f.character.dispose();
  assert.equal(disposed, 2); assert.equal(f.scene.getObjectByName('Jelly companion'), undefined);
  f.dispose();
});
