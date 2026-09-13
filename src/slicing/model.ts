export interface Point { x: number; z: number }
export type SliceKind = 'slab' | 'prism';
export interface Piece {
  id: number;
  polygon: Point[];
  offset: Point;
  target: Point;
  velocity: Point;
  age: number;
  bornStroke: number;
}
const EPS = 1e-8;
export const MAX_PIECES = 48;
const valid = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) < 100 && Math.abs(p.z) < 100;
const cross = (a: Point, b: Point) => a.x * b.z - a.z * b.x;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, z: a.z - b.z });
export function area(polygon: readonly Point[]) {
  return Math.abs(polygon.reduce((sum, p, i) => sum + cross(p, polygon[(i + 1) % polygon.length]), 0)) / 2;
}
export function center(polygon: readonly Point[]): Point {
  let x = 0, z = 0, weight = 0;
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length], w = cross(p, q);
    x += (p.x + q.x) * w; z += (p.z + q.z) * w; weight += w;
  });
  return { x: x / (3 * weight), z: z / (3 * weight) };
}
export function silhouette(kind: SliceKind): Point[] {
  if (kind === 'prism') return Array.from({ length: 6 }, (_, i) => ({ x: 1.65 * Math.cos(i * Math.PI / 3), z: 1.65 * Math.sin(i * Math.PI / 3) }));
  const points: Point[] = [];
  // A rounded square keeps a soft silhouette around perfectly planar new cuts.
  for (let corner = 0; corner < 4; corner++) {
    const angle = corner * Math.PI / 2;
    const cx = Math.cos(angle + Math.PI / 4) > 0 ? 1.03 : -1.03;
    const cz = Math.sin(angle + Math.PI / 4) > 0 ? .87 : -.87;
    for (let i = 0; i <= 10; i++) {
      const a = angle + i / 10 * Math.PI / 2;
      points.push({ x: cx + .38 * Math.cos(a), z: cz + .38 * Math.sin(a) });
    }
  }
  return points;
}
function clean(points: Point[]): Point[] {
  return points.filter((p, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    return Math.hypot(p.x - previous.x, p.z - previous.z) > EPS;
  });
}
function clip(polygon: readonly Point[], start: Point, direction: Point, sign: number): Point[] {
  const result: Point[] = [];
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    const a = cross(direction, sub(p, start)) * sign, b = cross(direction, sub(q, start)) * sign;
    if (a >= -EPS) result.push({ ...p });
    if ((a > EPS && b < -EPS) || (a < -EPS && b > EPS)) {
      const t = a / (a - b);
      result.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
    }
  });
  return clean(result);
}
/** Distances along an infinite line where it enters/exits a convex footprint. */
export function chord(polygon: readonly Point[], start: Point, end: Point): [number, number] | null {
  if (!valid(start) || !valid(end)) return null;
  const delta = sub(end, start), length = Math.hypot(delta.x, delta.z);
  if (length < EPS) return null;
  const direction = { x: delta.x / length, z: delta.z / length };
  let low = -Infinity, high = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], edge = sub(polygon[(i + 1) % polygon.length], p);
    const numerator = cross(edge, sub(start, p)), denominator = cross(edge, direction);
    if (Math.abs(denominator) < EPS) { if (numerator < -EPS) return null; }
    else if (denominator > 0) low = Math.max(low, -numerator / denominator);
    else high = Math.min(high, -numerator / denominator);
    if (low > high - EPS) return null;
  }
  return Number.isFinite(low) && Number.isFinite(high) ? [low, high] : null;
}
/** A finite, edge-to-edge stroke splits the actual solid, never just its drawing. */
export function splitPolygon(polygon: readonly Point[], start: Point, end: Point): [Point[], Point[]] | null {
  const span = chord(polygon, start, end), length = Math.hypot(end.x - start.x, end.z - start.z);
  if (!span || length < .16 || span[0] < -.035 || span[1] > length + .035) return null;
  const direction = sub(end, start);
  const halves: [Point[], Point[]] = [clip(polygon, start, direction, 1), clip(polygon, start, direction, -1)];
  for (const half of halves) {
    const a = area(half);
    const perimeter = half.reduce((sum, p, i) => sum + Math.hypot(p.x - half[(i + 1) % half.length].x, p.z - half[(i + 1) % half.length].z), 0);
    if (half.length < 3 || a < .035 || 2 * a / perimeter < .025) return null;
  }
  return halves;
}
export class SliceModel {
  pieces: Piece[] = [];
  cuts = 0;
  stroke = 0;
  private nextId = 0;
  private countedStroke = -1;
  constructor(readonly kind: SliceKind) { this.reset(); }
  reset() {
    this.nextId = this.cuts = this.stroke = 0;
    this.countedStroke = -1;
    this.pieces = [this.make(silhouette(this.kind), { x: 0, z: 0 }, -1)];
    this.pieces[0].age = 10;
  }
  private make(polygon: Point[], offset: Point, bornStroke: number): Piece {
    return { id: this.nextId++, polygon, offset: { ...offset }, target: { ...offset }, velocity: { x: 0, z: 0 }, age: 0, bornStroke };
  }
  beginStroke() { this.stroke++; }
  slice(start: Point, end: Point, reduced = false) {
    if (!valid(start) || !valid(end)) return 0;
    let count = 0;
    const dx = end.x - start.x, dz = end.z - start.z, length = Math.hypot(dx, dz);
    if (length < .16) return 0;
    const normal = { x: -dz / length, z: dx / length };
    const result: Piece[] = [];
    for (const piece of this.pieces) {
      const halves = piece.bornStroke === this.stroke || this.pieces.length + count >= MAX_PIECES ? null
        : splitPolygon(piece.polygon, sub(start, piece.offset), sub(end, piece.offset));
      if (!halves) { result.push(piece); continue; }
      halves.forEach((polygon, i) => {
        const child = this.make(polygon, piece.offset, this.stroke), sign = i === 0 ? 1 : -1;
        const distance = .105;
        child.target = { x: piece.target.x + normal.x * sign * distance, z: piece.target.z + normal.z * sign * distance };
        if (reduced) { child.offset = { ...child.target }; child.age = 10; }
        else child.velocity = { x: piece.velocity.x + normal.x * sign * .35, z: piece.velocity.z + normal.z * sign * .35 };
        result.push(child);
      });
      count++;
    }
    this.pieces = result;
    if (count && this.countedStroke !== this.stroke) { this.cuts++; this.countedStroke = this.stroke; }
    return count;
  }
  contact(start: Point, end: Point) {
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    return this.pieces.some(piece => {
      const span = chord(piece.polygon, sub(start, piece.offset), sub(end, piece.offset));
      return span && Math.min(length, span[1]) - Math.max(0, span[0]) > .0001;
    });
  }
  step(dt: number, reduced: boolean) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .05);
    for (const piece of this.pieces) {
      piece.age += dt;
      for (const axis of ['x', 'z'] as const) {
        if (reduced) { piece.offset[axis] = piece.target[axis]; piece.velocity[axis] = 0; continue; }
        // Exact critically damped spring: safe at low frame rates and on resume.
        const displacement = piece.offset[axis] - piece.target[axis], c = piece.velocity[axis] + 13 * displacement, decay = Math.exp(-13 * dt);
        piece.offset[axis] = piece.target[axis] + (displacement + c * dt) * decay;
        piece.velocity[axis] = (piece.velocity[axis] - 13 * c * dt) * decay;
      }
    }
  }
  get moving() { return this.pieces.some(p => p.age < 1.8); }
}
