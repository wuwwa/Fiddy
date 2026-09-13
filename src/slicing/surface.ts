import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { area, type Point } from './model';

type Vertex = [number, number, number, number, number, number];
const mid = (a: Vertex, b: Vertex): Vertex => a.map((n, i) => (n + b[i]) * .5) as Vertex;
const distanceXZ = (a: Vertex, b: Vertex) => (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2;

/** The same continuous crown is retained by every fragment after cutting. */
export function crown(x: number, z: number) { return .14 * Math.exp(-.85 * (x * x + z * z)); }

export function createGelSurface(polygon: Point[], origin: Point, height: number) {
  const shape = new THREE.Shape(polygon.map(p => new THREE.Vector2(p.x, -p.z)));
  const bevel = Math.min(.11, Math.sqrt(area(polygon)) * .065);
  const coarse = new THREE.ExtrudeGeometry(shape, { depth: height - bevel * 2, bevelEnabled: true, bevelSegments: 5, steps: 1, bevelSize: bevel, bevelThickness: bevel, bevelOffset: -bevel, curveSegments: 1 });
  coarse.rotateX(-Math.PI / 2); coarse.translate(0, bevel + .015, 0);
  toCreasedNormals(coarse, .72);
  const input = coarse.attributes.position, normal = coarse.attributes.normal, output: number[] = [], normals: number[] = [];
  const vertex = (i: number): Vertex => [input.getX(i), input.getY(i), input.getZ(i), normal.getX(i), normal.getY(i), normal.getZ(i)];
  function emit(v: Vertex) {
    const x = v[0] + origin.x, z = v[2] + origin.z, c = crown(x, z), u = Math.min(1, (v[1] - .015) / height);
    const lift = c * u ** 3;
    output.push(v[0], v[1] + lift, v[2]);
    // Inverse-transpose of the analytic crown deformation. Interpolating the
    // original bevel normals avoids triangulation scars in sharp reflections.
    const ny = v[4] / (1 + 3 * c * u * u / height), nx = v[3] + 1.7 * x * lift * ny, nz = v[5] + 1.7 * z * lift * ny;
    const length = Math.hypot(nx, ny, nz) || 1; normals.push(nx / length, ny / length, nz / length);
  }
  function subdivide(a: Vertex, b: Vertex, c: Vertex, depth: number) {
    const ab = distanceXZ(a, b), bc = distanceXZ(b, c), ca = distanceXZ(c, a), longest = Math.max(ab, bc, ca);
    if (longest < .23 ** 2 || depth >= 10 || Math.max(a[1], b[1], c[1]) < .02) { emit(a); emit(b); emit(c); return; }
    if (ab === longest) { const m = mid(a, b); subdivide(a, m, c, depth + 1); subdivide(m, b, c, depth + 1); }
    else if (bc === longest) { const m = mid(b, c); subdivide(a, b, m, depth + 1); subdivide(a, m, c, depth + 1); }
    else { const m = mid(c, a); subdivide(a, b, m, depth + 1); subdivide(m, b, c, depth + 1); }
  }
  for (let i = 0; i < input.count; i += 3) subdivide(vertex(i), vertex(i + 1), vertex(i + 2), 0);
  coarse.dispose();
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(output, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}
