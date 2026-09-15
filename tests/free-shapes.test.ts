import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { createFreeTopology, createJellySkin } from '../src/free-jelly/surface.ts';
import { FreeJellyPhysics, FREE_FLOOR } from '../src/free-jelly/physics.ts';
import { freeFeel } from '../src/free-jelly/profiles.ts';
import { toys } from '../src/toys/registry.ts';
import type { FreeShape } from '../src/toys/types.ts';

test('free movement belongs to five existing toys, with no duplicate collection entry', () => {
  assert.deepEqual(toys.filter(toy => toy.freePlay).map(toy => toy.id), ['jelly', 'cushion', 'loop', 'star', 'dumpling']);
  assert.equal(toys.some(toy => toy.id === 'free-jelly'), false);
});

for (const shape of ['cushion', 'loop', 'star', 'dumpling'] as FreeShape[]) {
  test(`${shape}: the closed skin settles, presses, lifts and lands without losing material or resetting`, () => {
    const t = createFreeTopology(shape), skin = createJellySkin(t.rest, t.triangles);
    const p = new FreeJellyPhysics(t.rest, t.triangles, { ...freeFeel[shape], tets: t.tets });
    const step = (n: number) => { for (let i = 0; i < n; i++) p.step(); };
    try {
      const edges = new Map<string, number>();
      for (let f = 0; f < t.triangles.length; f += 3) for (let k = 0; k < 3; k++) {
        const a = t.triangles[f + k], b = t.triangles[f + (k + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      assert.ok([...edges.values()].every(count => count === 2));
      assert.ok(p.tets.every(tet => tet.volume > 0));
      step(1200); assert.ok(p.isAtRest()); const resting = p.diagnostics();
      skin.update(p.positions); const positions = skin.geometry.getAttribute('position'); let id = 0;
      for (let i = 1; i < positions.count; i++) if (positions.getY(i) > positions.getY(id)) id = i;
      p.grab(skin.bindings[id]); p.move({ x: positions.getX(id), y: positions.getY(id), z: positions.getZ(id) }, 0.62); step(300);
      assert.ok(p.diagnostics().height < resting.height * 0.85, 'Thin shapes must also squash when lying flat');
      assert.equal(p.diagnostics().minY, FREE_FLOOR);
      assert.ok(p.diagnostics().volumeRatio > 0.95);
      p.move({ x: 0.4, y: 3, z: 0 }); step(180);
      assert.ok(p.diagnostics().minY > 0.2, 'The entire body lifts');
      p.release(); step(1800);
      assert.ok(p.isAtRest()); assert.equal(p.resetCount, 0);
      assert.ok(Math.abs(p.diagnostics().volumeRatio - 1) < 0.03);
      skin.update(p.positions);
      assert.ok([...skin.geometry.getAttribute('position').array].every(Number.isFinite));
    } finally { skin.geometry.dispose(); }
  });
}

test('free Loop has an empty, unclickable opening and tetrahedra only inside its tube', () => {
  const topology = createFreeTopology('loop'), skin = createJellySkin(topology.rest, topology.triangles);
  const material = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(skin.geometry, material);
  try {
    const y = 0.04 + 1.06 * 0.93;
    mesh.updateMatrixWorld();
    const ray = new THREE.Raycaster(new THREE.Vector3(0, y, 4), new THREE.Vector3(0, 0, -1));
    assert.equal(ray.intersectObject(mesh).length, 0);
    ray.ray.origin.x = 0.8;
    assert.ok(ray.intersectObject(mesh).length > 0);
    for (const tet of topology.tets!) {
      const x = tet.reduce((n, id) => n + topology.rest[id * 3], 0) / 4 / 1.08;
      const ty = (tet.reduce((n, id) => n + topology.rest[id * 3 + 1], 0) / 4 - y) / 0.93;
      assert.ok(Math.hypot(x, ty) > 0.4, 'No material bridges the central opening');
    }
  } finally { skin.geometry.dispose(); material.dispose(); }
});
