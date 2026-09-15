import type { Binding } from './surface';
import { JellyTransformation } from './transformation';

export const FREE_STEP = 1 / 120;
export const FREE_FLOOR = 0.04;
export type Point = { x: number; y: number; z: number };
type Edge = { a: number; b: number; length: number; lambda: number };
type Tet = { ids: number[]; volume: number; lambda: number };
export interface FreeBodyOptions {
  tets?: number[][];
  /** Same cage topology, used only during the bonus. Ordinary material demos keep their original mould. */
  bonusMorphRest?: Float64Array;
  damping?: number;
  edgeCompliance?: number;
  volumeCompliance?: number;
  restitution?: number;
}
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));

/** A round crown and broad lower body, normalized to the original jelly's volume. */
export function createSlimeMorphRest(rest: Float64Array, triangles: number[]) {
  const count = Math.max(...triangles) + 1, result = new Float64Array(rest.length);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    minX = Math.min(minX, rest[i * 3]); maxX = Math.max(maxX, rest[i * 3]);
    minY = Math.min(minY, rest[i * 3 + 1]); maxY = Math.max(maxY, rest[i * 3 + 1]);
    minZ = Math.min(minZ, rest[i * 3 + 2]); maxZ = Math.max(maxZ, rest[i * 3 + 2]);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const rx = (maxX - minX) / 2, ry = (maxY - minY) / 2, rz = (maxZ - minZ) / 2;
  for (let i = 0; i < rest.length; i += 3) {
    let x = (rest[i] - cx) / rx, y = (rest[i + 1] - cy) / ry, z = (rest[i + 2] - cz) / rz;
    const radius = Math.hypot(x, y, z);
    if (radius > 1e-8) { x /= radius; y /= radius; z /= radius; }
    result[i] = cx + x * rx * 1.07 * (1 - 0.14 * y);
    result[i + 1] = FREE_FLOOR + ry * 2.45 * ((y + 1) / 2) ** 1.45;
    result[i + 2] = cz + z * rz * 1.02 * (1 - 0.14 * y);
  }
  const volume = (points: Float64Array) => {
    const origin = count * 3; let total = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i] * 3, b = triangles[i + 1] * 3, c = triangles[i + 2] * 3;
      const ax = points[a] - points[origin], ay = points[a + 1] - points[origin + 1], az = points[a + 2] - points[origin + 2];
      const bx = points[b] - points[origin], by = points[b + 1] - points[origin + 1], bz = points[b + 2] - points[origin + 2];
      const dx = points[c] - points[origin], dy = points[c + 1] - points[origin + 1], dz = points[c + 2] - points[origin + 2];
      total += Math.abs(ax * (by * dz - bz * dy) + ay * (bz * dx - bx * dz) + az * (bx * dy - by * dx)) / 6;
    }
    return total;
  };
  const scale = Math.cbrt(volume(rest) / volume(result));
  for (let i = 0; i < result.length; i += 3) {
    result[i] = cx + (result[i] - cx) * scale;
    result[i + 1] = FREE_FLOOR + (result[i + 1] - FREE_FLOOR) * scale;
    result[i + 2] = cz + (result[i + 2] - cz) * scale;
  }
  return result;
}

/** Free tetrahedral elastic body. No particle is fixed and no world-space rest force exists. */
export class FreeJellyPhysics {
  readonly positions: Float64Array;
  readonly velocities: Float64Array;
  readonly previous: Float64Array;
  readonly invMass: Float64Array;
  readonly edges: Edge[] = [];
  readonly tets: Tet[] = [];
  readonly center: Point = { x: 0, y: 0, z: 0 };
  private readonly gradients = new Float64Array(12);
  private readonly contact: Uint8Array;
  private grip: { binding: Binding; target: Point; filtered: Point; lambda: Float64Array;
    pressure: number; desiredPressure: number; restHeight: number } | null = null;
  private pendingRelease: FreeJellyPhysics['grip'] = null;
  private readonly transformation = new JellyTransformation();
  private readonly morphEdges: number[] = [];
  private readonly morphVolumes: number[] = [];
  private reactionCooldown = 0;
  bounds = { x: 2.5, top: 5.5, z: 1.65 };
  reducedMotion = false;
  bonusGravity = false;
  impact = 0;
  pressure = 0;
  speed = 0;
  resetCount = 0;

  constructor(readonly rest: Float64Array, readonly triangles: number[], private readonly options: FreeBodyOptions = {}) {
    this.positions = new Float64Array(rest);
    this.previous = new Float64Array(rest);
    this.velocities = new Float64Array(rest.length);
    this.invMass = new Float64Array(rest.length / 3).fill(1);
    const centre = this.invMass.length - 1;
    const surfaceCount = Math.max(...triangles) + 1;
    for (let i = surfaceCount; i < this.invMass.length; i++) this.invMass[i] = options.tets ? 0.5 : 0.2;
    this.contact = new Uint8Array(this.invMass.length);
    const seen = new Set<string>();
    const addEdge = (a: number, b: number) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) return;
      seen.add(key);
      this.edges.push({ a, b, length: Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]), lambda: 0 });
    };
    const cells = options.tets ?? Array.from({ length: triangles.length / 3 }, (_, f) => [centre, ...triangles.slice(f * 3, f * 3 + 3)]);
    for (const cell of cells) {
      const ids = [...cell];
      if (this.volume(rest, ids) < 0) [ids[2], ids[3]] = [ids[3], ids[2]];
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) addEdge(ids[a], ids[b]);
      this.tets.push({ ids, volume: this.volume(rest, ids), lambda: 0 });
    }
    const morph = options.bonusMorphRest;
    if (morph?.length === rest.length && [...morph].every(Number.isFinite) && this.tets.every(t => this.volume(morph, t.ids) > 0)) {
      for (const edge of this.edges) this.morphEdges.push(Math.hypot(morph[edge.a * 3] - morph[edge.b * 3], morph[edge.a * 3 + 1] - morph[edge.b * 3 + 1], morph[edge.a * 3 + 2] - morph[edge.b * 3 + 2]));
      for (const tet of this.tets) this.morphVolumes.push(this.volume(morph, tet.ids));
    }
    this.updateCenter();
  }

  private volume(p: Float64Array, ids: number[]) {
    const [a, b, c, d] = ids.map(i => i * 3);
    const ax = p[b] - p[a], ay = p[b + 1] - p[a + 1], az = p[b + 2] - p[a + 2];
    const bx = p[c] - p[a], by = p[c + 1] - p[a + 1], bz = p[c + 2] - p[a + 2];
    const cx = p[d] - p[a], cy = p[d + 1] - p[a + 1], cz = p[d + 2] - p[a + 2];
    return (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }

  get grabbed() { return this.grip !== null; }
  get transformationAmount() { return this.transformation.amount; }
  get transformationState() { return this.transformation.state; }
  setTransformation(enabled: boolean) { this.transformation.request(enabled, this.bonusGravity && enabled ? 0.5 : 1.25); }

  /** A small, bounded physical hop. User control always takes priority. */
  celebrate(strength = 1) {
    if (!this.bonusGravity || this.reducedMotion || this.grabbed || this.pendingRelease || this.reactionCooldown > 0 || !Number.isFinite(strength)) return false;
    if (this.speed > 1.2 || this.diagnostics().minY > FREE_FLOOR + 0.12 || this.center.y > this.bounds.top - 1.2) return false;
    const impulse = 1.25 * clamp(strength, 0, 1);
    if (impulse === 0) return false;
    for (let i = 1; i < this.velocities.length; i += 3) this.velocities[i] = clamp(this.velocities[i] + impulse, -14, 2);
    this.reactionCooldown = 0.65;
    return true;
  }

  grab(binding: Binding) {
    if (this.grip || !binding.ids.length || binding.ids.length !== binding.weights.length) return false;
    if (binding.ids.some(id => !Number.isInteger(id) || id < 0 || id >= this.invMass.length) ||
      binding.weights.some(w => !Number.isFinite(w) || w < 0) || Math.abs(binding.weights.reduce((a, b) => a + b, 0) - 1) > 0.001) return false;
    const target = { x: 0, y: 0, z: 0 };
    binding.ids.forEach((id, i) => {
      target.x += this.positions[id * 3] * binding.weights[i];
      target.y += this.positions[id * 3 + 1] * binding.weights[i];
      target.z += this.positions[id * 3 + 2] * binding.weights[i];
    });
    this.pendingRelease = null;
    const shape = this.diagnostics();
    this.grip = { binding, target, filtered: { ...target }, lambda: new Float64Array(3),
      pressure: 0, desiredPressure: 0, restHeight: Math.min(1.85, shape.height) };
    return true;
  }

  move(target: Point, pressure = 0) {
    if (!this.grip || ![target.x, target.y, target.z].every(Number.isFinite)) return;
    this.grip.target = { x: clamp(target.x, -this.bounds.x + 0.2, this.bounds.x - 0.2),
      y: clamp(target.y, FREE_FLOOR + 0.18, this.bounds.top - 0.3), z: clamp(target.z, -this.bounds.z + 0.3, this.bounds.z - 0.3) };
    this.grip.desiredPressure = Number.isFinite(pressure) ? clamp(pressure, 0, 1) : 0;
  }

  /** Normal release keeps simulated momentum. Cancellation adds no throw impulse. */
  release(cancelled = false) {
    // Consume a final endpoint once on the next scheduled physics step. This
    // preserves taps/strokes completed between frames without extra simulation time.
    if (this.grip) this.pendingRelease = cancelled ? null : this.grip;
    if (cancelled) this.pendingRelease = null;
    this.grip = null;
    if (cancelled) { this.velocities.fill(0); this.pressure = 0; }
  }

  reset() {
    this.release(true); this.positions.set(this.rest); this.previous.set(this.rest);
    this.impact = this.speed = this.pressure = this.reactionCooldown = 0; this.updateCenter();
  }

  setBounds(x: number, top: number) {
    if (!Number.isFinite(x) || !Number.isFinite(top)) return;
    this.bounds.x = Math.max(1.45, x); this.bounds.top = Math.max(2.5, top);
    // Orientation changes translate the body as a whole into the new stage.
    const p = this.positions; let minX = Infinity, maxX = -Infinity, maxY = 0;
    for (let i = 0; i < p.length; i += 3) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); maxY = Math.max(maxY, p[i + 1]); }
    const dx = Math.min(0, this.bounds.x - maxX) + Math.max(0, -this.bounds.x - minX);
    const dy = Math.min(0, this.bounds.top - maxY);
    for (let i = 0; i < p.length; i += 3) { p[i] += dx; p[i + 1] = Math.max(FREE_FLOOR, p[i + 1] + dy); }
    this.previous.set(p); this.updateCenter();
  }

  private updateCenter() {
    const p = this.positions; let mass = 0;
    this.center.x = this.center.y = this.center.z = 0;
    for (let i = 0; i < this.invMass.length; i++) {
      const m = 1 / this.invMass[i]; mass += m;
      this.center.x += p[i * 3] * m; this.center.y += p[i * 3 + 1] * m; this.center.z += p[i * 3 + 2] * m;
    }
    this.center.x /= mass; this.center.y /= mass; this.center.z /= mass;
  }

  step() {
    const dt = FREE_STEP, p = this.positions, v = this.velocities;
    this.reactionCooldown = Math.max(0, this.reactionCooldown - dt);
    this.previous.set(p); this.contact.fill(0); this.impact = 0;
    const g = this.grip ?? this.pendingRelease;
    this.pendingRelease = null;
    if (g) {
      const dx = g.target.x - g.filtered.x, dy = g.target.y - g.filtered.y, dz = g.target.z - g.filtered.z;
      const blend = Math.min(1 - Math.exp(-dt * 24), 9 * dt / Math.max(0.00001, Math.hypot(dx, dy, dz)));
      g.filtered.x += dx * blend; g.filtered.y += dy * blend; g.filtered.z += dz * blend; g.lambda.fill(0);
      g.pressure += (g.desiredPressure - g.pressure) * (1 - Math.exp(-dt * 22));
    }
    let lowest = Infinity;
    for (let i = 1; i < p.length; i += 3) lowest = Math.min(lowest, p[i]);
    this.transformation.step(dt, !g && lowest <= FREE_FLOOR + 0.025 && this.speed < (this.bonusGravity ? 1.5 : 0.65));
    const transformed = this.transformation.amount;
    const morphology = this.bonusGravity && this.morphEdges.length ? transformed : 0;
    // The floor supports a palm press. An airborne catch remains a skin grip;
    // pressure becomes effective as the material comes down onto the stage.
    const support = clamp(1 - (lowest - FREE_FLOOR) / 0.14, 0, 1);
    this.pressure = (g?.pressure ?? 0) * support;
    const pressing = this.pressure;
    const restHeight = g?.restHeight ?? 1.56;
    const ceiling = FREE_FLOOR + Math.max(Math.min(0.88, restHeight * 0.62), restHeight - 0.68 * pressing);
    let mx = 0, my = 0, mz = 0, mass = 0;
    for (let i = 0; i < this.invMass.length; i++) {
      const m = 1 / this.invMass[i]; mass += m;
      mx += v[i * 3] * m; my += v[i * 3 + 1] * m; mz += v[i * 3 + 2] * m;
    }
    mx /= mass; my /= mass; mz /= mass;
    const materialDamping = (this.options.damping ?? 1.7) * (1 - 0.35 * transformed);
    const damping = Math.exp(-dt * ((this.reducedMotion ? Math.max(7, materialDamping) : materialDamping) + pressing * 18)), air = Math.exp(-dt * 0.28);
    my *= Math.exp(-dt * pressing * 18);
    const gravity = this.bonusGravity && !this.reducedMotion ? 9.8 * (1 - 0.55 * transformed) : 9.8;
    for (let i = 0; i < this.invMass.length; i++) {
      const j = i * 3;
      v[j] = (mx + (v[j] - mx) * damping) * air;
      v[j + 1] = (my + (v[j + 1] - my) * damping - gravity * dt) * air;
      v[j + 2] = (mz + (v[j + 2] - mz) * damping) * air;
      for (let k = 0; k < 3; k++) p[j + k] += v[j + k] * dt;
    }
    for (const edge of this.edges) edge.lambda = 0;
    for (const tet of this.tets) tet.lambda = 0;
    // The character retains a crown for its face. The material-only experiment
    // keeps its deliberately much softer sixfold compliance.
    const edgeAlpha = (this.options.edgeCompliance ?? 0.0018) * (1 + 5 * transformed - 4.3 * morphology) / (dt * dt);
    const volumeAlpha = (this.options.volumeCompliance ?? 0.00000008) / (dt * dt);
    for (let iteration = 0; iteration < 7; iteration++) {
      for (let edgeIndex = 0; edgeIndex < this.edges.length; edgeIndex++) {
        const e = this.edges[edgeIndex];
        const a = e.a * 3, b = e.b * 3;
        const dx = p[a] - p[b], dy = p[a + 1] - p[b + 1], dz = p[a + 2] - p[b + 2];
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length < 1e-8) continue;
        const restLength = morphology ? e.length + (this.morphEdges[edgeIndex] - e.length) * morphology : e.length;
        const dl = (restLength - length - edgeAlpha * e.lambda) / (this.invMass[e.a] + this.invMass[e.b] + edgeAlpha);
        e.lambda += dl;
        const sa = dl * this.invMass[e.a] / length, sb = dl * this.invMass[e.b] / length;
        p[a] += dx * sa; p[a + 1] += dy * sa; p[a + 2] += dz * sa;
        p[b] -= dx * sb; p[b + 1] -= dy * sb; p[b + 2] -= dz * sb;
      }
      if (g) {
        const alpha = 0.000006 / (dt * dt), { ids, weights } = g.binding;
        let x = 0, y = 0, z = 0, inverseMass = 0;
        for (let n = 0; n < ids.length; n++) {
          const j = ids[n] * 3, w = weights[n];
          x += p[j] * w; y += p[j + 1] * w; z += p[j + 2] * w;
          inverseMass += this.invMass[ids[n]] * w * w;
        }
        const delta = [g.filtered.x - x, g.filtered.y - y, g.filtered.z - z];
        for (let k = 0; k < 3; k++) {
          // A front/side contact must not act as a hinge beneath a pressed body.
          // Give vertical control to the palm while retaining lateral purchase.
          const compliance = alpha * (1 + pressing * (k === 1 ? 6000 : 12));
          const dl = (delta[k] - compliance * g.lambda[k]) / (inverseMass + compliance); g.lambda[k] += dl;
          for (let n = 0; n < ids.length; n++) p[ids[n] * 3 + k] += this.invMass[ids[n]] * weights[n] * dl;
        }
      }
      for (let tetIndex = 0; tetIndex < this.tets.length; tetIndex++) {
        const t = this.tets[tetIndex];
        const a = t.ids[0] * 3, b = t.ids[1] * 3, c = t.ids[2] * 3, d = t.ids[3] * 3;
        const ax = p[b] - p[a], ay = p[b + 1] - p[a + 1], az = p[b + 2] - p[a + 2];
        const bx = p[c] - p[a], by = p[c + 1] - p[a + 1], bz = p[c + 2] - p[a + 2];
        const cx = p[d] - p[a], cy = p[d + 1] - p[a + 1], cz = p[d + 2] - p[a + 2];
        const grad = this.gradients;
        grad[3] = (by * cz - bz * cy) / 6; grad[4] = (bz * cx - bx * cz) / 6; grad[5] = (bx * cy - by * cx) / 6;
        grad[6] = (cy * az - cz * ay) / 6; grad[7] = (cz * ax - cx * az) / 6; grad[8] = (cx * ay - cy * ax) / 6;
        grad[9] = (ay * bz - az * by) / 6; grad[10] = (az * bx - ax * bz) / 6; grad[11] = (ax * by - ay * bx) / 6;
        for (let k = 0; k < 3; k++) grad[k] = -grad[3 + k] - grad[6 + k] - grad[9 + k];
        let denominator = volumeAlpha;
        for (let n = 0; n < 4; n++) denominator += this.invMass[t.ids[n]] * (grad[n * 3] ** 2 + grad[n * 3 + 1] ** 2 + grad[n * 3 + 2] ** 2);
        const current = ax * grad[3] + ay * grad[4] + az * grad[5];
        const restVolume = morphology ? t.volume + (this.morphVolumes[tetIndex] - t.volume) * morphology : t.volume;
        const dl = (restVolume - current - volumeAlpha * t.lambda) / denominator; t.lambda += dl;
        for (let n = 0; n < 4; n++) for (let k = 0; k < 3; k++) p[t.ids[n] * 3 + k] += this.invMass[t.ids[n]] * grad[n * 3 + k] * dl;
      }
      for (let i = 0; i < this.invMass.length; i++) {
        const j = i * 3;
        if (pressing > 0.001) {
          // A broad, slightly rounded palm distributes load instead of pinning
          // one skin point to the ground. Volume constraints spread the sides.
          const radiusSquared = (p[j] - this.center.x) ** 2 + (p[j + 2] - this.center.z) ** 2;
          const palm = ceiling + radiusSquared * 0.055;
          if (p[j + 1] > palm) p[j + 1] += (palm - p[j + 1]) * Math.min(1, pressing * 8);
        }
        if (p[j + 1] < FREE_FLOOR) { this.contact[i] |= 1; p[j + 1] = FREE_FLOOR; }
        if (Math.abs(p[j]) > this.bounds.x) { this.contact[i] |= 2; p[j] = clamp(p[j], -this.bounds.x, this.bounds.x); }
        if (Math.abs(p[j + 2]) > this.bounds.z) { this.contact[i] |= 4; p[j + 2] = clamp(p[j + 2], -this.bounds.z, this.bounds.z); }
        if (p[j + 1] > this.bounds.top) { this.contact[i] |= 8; p[j + 1] = this.bounds.top; }
      }
    }
    this.speed = 0;
    for (let i = 0; i < this.invMass.length; i++) {
      const j = i * 3, incomingY = v[j + 1];
      for (let k = 0; k < 3; k++) {
        if (!Number.isFinite(p[j + k]) || Math.abs(p[j + k]) > 50) { this.resetCount++; this.reset(); return; }
        v[j + k] = clamp((p[j + k] - this.previous[j + k]) / dt, -14, 14);
      }
      if (this.contact[i] & 1) {
        this.impact = Math.max(this.impact, -incomingY);
        v[j] *= 0.78; v[j + 2] *= 0.78;
        if (incomingY < -0.8 && pressing < 0.01) v[j + 1] = Math.max(v[j + 1], -incomingY * (this.reducedMotion ? 0.05 : this.options.restitution ?? 0.24));
      }
      if (this.contact[i] & 2) v[j] *= -0.15;
      if (this.contact[i] & 4) v[j + 2] *= -0.15;
      if (this.contact[i] & 8) v[j + 1] = Math.min(0, v[j + 1]);
      this.speed = Math.max(this.speed, Math.hypot(v[j], v[j + 1], v[j + 2]));
    }
    this.updateCenter();
  }

  isAtRest() { return !this.grabbed && !this.pendingRelease && !this.transformation.pending && this.speed < 0.045; }

  diagnostics() {
    let volume = 0, restVolume = 0, minY = Infinity, maxY = -Infinity;
    for (const tet of this.tets) { volume += this.volume(this.positions, tet.ids); restVolume += tet.volume; }
    for (let i = 1; i < this.positions.length; i += 3) { minY = Math.min(minY, this.positions[i]); maxY = Math.max(maxY, this.positions[i]); }
    return { center: { ...this.center }, minY, height: maxY - minY, speed: this.speed,
      volumeRatio: volume / restVolume, pressure: this.pressure, grabbed: this.grabbed, resets: this.resetCount, particles: this.invMass.length,
      transformation: this.transformationState, transformationAmount: this.transformationAmount };
  }
}
