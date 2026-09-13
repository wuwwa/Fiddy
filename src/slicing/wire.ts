import * as THREE from 'three';
import type { CutLine, KnifePress } from './knife';

const SEGMENTS = 64, SIDES = 8;

/** A fine cord with a resisted center and pulled ends, using one reusable mesh. */
export class CuttingWire {
  readonly geometry = new THREE.BufferGeometry();
  readonly material = new THREE.MeshStandardMaterial({ color: '#f8f1df', roughness: .32, metalness: .12, emissive: '#8c877a', emissiveIntensity: .16 });
  readonly mesh = new THREE.Mesh(this.geometry, this.material);
  private readonly submergedMaterial = new THREE.MeshBasicMaterial({ color: '#fff3dc', transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  private readonly submerged = new THREE.Mesh(this.geometry, this.submergedMaterial);
  private readonly positions = new Float32Array((SEGMENTS + 1) * (SIDES + 1) * 3);
  private readonly normals = new Float32Array(this.positions.length);
  constructor() {
    const indices: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) for (let j = 0; j < SIDES; j++) {
      const a = i * (SIDES + 1) + j, b = a + SIDES + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    this.geometry.setIndex(indices);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh.frustumCulled = false; this.mesh.name = 'cutting-wire';
    // A faint direct view keeps a hair-thin submerged cord legible alongside
    // its refracted image. The overlay shares every vertex with the real cord.
    this.submerged.frustumCulled = false; this.submerged.renderOrder = 5; this.mesh.add(this.submerged);
  }
  update(line: CutLine | null, press: KnifePress, height: number, cameraDistance: number) {
    this.mesh.visible = !!line;
    if (!line) return;
    const restLength = Math.min(6, line.width + 1.25), depth = press.depth;
    const load = press.phase === 'cutting' ? Math.sin(depth * Math.PI) * press.resistance : 0;
    // Gel holds the center back while the ends pull through. Extra tension
    // straightens the cord; the shortened chord preserves its material length.
    const bow = .38 * load / (.4 + 2.4 * press.tension);
    const length = restLength / (1 + 8 * bow * bow / (3 * restLength * restLength));
    this.submerged.visible = depth > .08 && depth < 1;
    this.submergedMaterial.opacity = .42 * Math.sin(Math.PI * depth);
    // Keep the center readable on phones while preserving a threadlike silhouette.
    const radius = .0125 * Math.min(1.8, cameraDistance / 10.7);
    this.material.emissiveIntensity = .12 + .18 * press.tension;
    this.mesh.position.set(line.center.x, height + .21 - depth * (height + .235) - bow, line.center.z);
    this.mesh.rotation.y = -line.angle;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS, x = (t - .5) * length, q = 1 - (2 * t - 1) ** 2;
      const y = bow * q, slope = -4 * bow * (2 * t - 1) / length;
      const inverseLength = 1 / Math.hypot(1, slope), taper = .7 + .3 * Math.sin(Math.PI * t) ** .3;
      for (let j = 0; j <= SIDES; j++) {
        const angle = j / SIDES * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
        const nx = -slope * inverseLength * c, ny = inverseLength * c, nz = s;
        const index = (i * (SIDES + 1) + j) * 3;
        this.positions[index] = x + nx * radius * taper; this.positions[index + 1] = y + ny * radius * taper; this.positions[index + 2] = nz * radius * taper;
        this.normals[index] = nx; this.normals[index + 1] = ny; this.normals[index + 2] = nz;
      }
    }
    this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.normal.needsUpdate = true;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); this.submergedMaterial.dispose(); }
}
