import * as THREE from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSoftGeometry } from '../soft-body/geometry';
import type { FreeShape } from '../toys/types';

export type Binding = { ids: number[]; weights: number[] };
export type FreeTopology = { rest: Float64Array; triangles: number[]; tets?: number[][] };

/** Closed shapes share their existing mould; a ring gets tube-local tetrahedra. */
export function createFreeTopology(shape: FreeShape): FreeTopology {
  if (shape === 'jelly') return createJellyTopology();
  if (shape === 'loop') return createRingTopology();
  const geometry = createSoftGeometry(shape, shape === 'cushion' ? 2 : 4);
  const p = geometry.getAttribute('position'), rest = new Float64Array((p.count + 1) * 3);
  const centre = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    rest.set([p.getX(i), p.getY(i), p.getZ(i)], i * 3);
    centre.x += p.getX(i); centre.y += p.getY(i); centre.z += p.getZ(i);
  }
  centre.divideScalar(p.count); rest.set(centre.toArray(), p.count * 3);
  const triangles = Array.from(geometry.index!.array); geometry.dispose();
  return { rest, triangles };
}

function createRingTopology(): FreeTopology {
  const segments = 32, sides = 8, surfaceCount = segments * sides;
  const rest = new Float64Array((surfaceCount + segments) * 3), triangles: number[] = [], tets: number[][] = [];
  const baseY = 0.04 + (0.74 + 0.32) * 0.93;
  const vertex = (u: number, v: number) => (u % segments) * sides + v % sides;
  for (let u = 0; u < segments; u++) {
    const angle = u / segments * Math.PI * 2;
    rest.set([Math.cos(angle) * 0.74 * 1.08, Math.sin(angle) * 0.74 * 0.93 + baseY, 0], (surfaceCount + u) * 3);
    for (let v = 0; v < sides; v++) {
      const tubeAngle = v / sides * Math.PI * 2, radius = 0.74 + Math.cos(tubeAngle) * 0.32;
      rest.set([Math.cos(angle) * radius * 1.08, Math.sin(angle) * radius * 0.93 + baseY, Math.sin(tubeAngle) * 0.32 * 1.15], vertex(u, v) * 3);
      const a = vertex(u, v), b = vertex(u + 1, v), c = vertex(u + 1, v + 1), d = vertex(u, v + 1);
      triangles.push(a, b, d, b, c, d);
      const centre = surfaceCount + u, nextCentre = surfaceCount + (u + 1) % segments;
      // Three tets fill each triangular tube prism. None spans the ring's hole.
      tets.push([centre, a, d, c], [centre, a, b, c], [centre, nextCentre, b, c]);
    }
  }
  return { rest, triangles, tets };
}

/** A closed, low resolution collision skin; the last particle is its free centre. */
export function createJellyTopology() {
  const source = new THREE.IcosahedronGeometry(1, 2);
  source.deleteAttribute('normal'); source.deleteAttribute('uv');
  const cage = mergeVertices(source, 0.00005);
  source.dispose();
  const p = cage.getAttribute('position');
  const rest = new Float64Array((p.count + 1) * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = (Math.abs(x) ** 2.15 + Math.abs(y) ** 2.15 + Math.abs(z) ** 2.15) ** (-1 / 2.15);
    rest.set([x * r * 1.12, y * r * 0.87 + 0.96, z * r * 0.96], i * 3);
  }
  rest.set([0, 0.96, 0], p.count * 3);
  const triangles = Array.from(cage.index!.array);
  cage.dispose();
  return { rest, triangles };
}

/** Loop subdivision stores linear weights, so a smooth skin follows the cage. */
export function createJellySkin(rest: Float64Array, triangles: number[]) {
  const surfaceCount = Math.max(...triangles) + 1;
  let bindings: Binding[] = Array.from({ length: surfaceCount }, (_, i) => ({ ids: [i], weights: [1] }));
  let faces = triangles;
  const blend = (parts: [Binding, number][]): Binding => {
    const weights = new Map<number, number>();
    for (const [binding, scale] of parts) binding.ids.forEach((id, i) => weights.set(id, (weights.get(id) ?? 0) + binding.weights[i] * scale));
    return { ids: [...weights.keys()], weights: [...weights.values()] };
  };
  for (let level = 0; level < 2; level++) {
    const neighbours = bindings.map(() => new Set<number>());
    const edges = new Map<string, { a: number; b: number; opposite: number[]; index: number }>();
    const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
    for (let f = 0; f < faces.length; f += 3) {
      const ids = faces.slice(f, f + 3);
      for (let n = 0; n < 3; n++) {
        const a = ids[n], b = ids[(n + 1) % 3], c = ids[(n + 2) % 3];
        neighbours[a].add(b); neighbours[b].add(a);
        const k = key(a, b);
        const edge = edges.get(k) ?? { a, b, opposite: [], index: -1 };
        edge.opposite.push(c); edges.set(k, edge);
      }
    }
    const next = bindings.map((binding, i) => {
      const n = neighbours[i].size, beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      return blend([[binding, 1 - n * beta], ...[...neighbours[i]].map(id => [bindings[id], beta] as [Binding, number])]);
    });
    for (const edge of edges.values()) {
      edge.index = next.length;
      next.push(blend([[bindings[edge.a], 3 / 8], [bindings[edge.b], 3 / 8],
        [bindings[edge.opposite[0]], 1 / 8], [bindings[edge.opposite[1]], 1 / 8]]));
    }
    const nextFaces: number[] = [];
    for (let f = 0; f < faces.length; f += 3) {
      const [a, b, c] = faces.slice(f, f + 3);
      const ab = edges.get(key(a, b))!.index, bc = edges.get(key(b, c))!.index, ca = edges.get(key(c, a))!.index;
      nextFaces.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    bindings = next; faces = nextFaces;
  }
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(bindings.length * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setIndex(faces);
  const update = (points: Float64Array) => {
    for (let i = 0; i < bindings.length; i++) {
      const binding = bindings[i]; let x = 0, y = 0, z = 0;
      for (let n = 0; n < binding.ids.length; n++) {
        const j = binding.ids[n] * 3, w = binding.weights[n];
        x += points[j] * w; y += points[j + 1] * w; z += points[j + 2] * w;
      }
      position.setXYZ(i, x, y, z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  };
  update(rest);
  return { geometry, bindings, update };
}
