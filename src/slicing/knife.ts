import { chord, MAX_PIECES, splitPolygon, type Point, type SliceModel } from './model';

export interface CutLine { start: Point; end: Point; center: Point; angle: number; width: number; length: number }

// Along the camera's ground-plane bearing: the incision projects vertically.
export const DEFAULT_CUT_ANGLE = Math.atan2(6.5, 4.5);

/** Find an actual cuttable cross-section, including gaps between separated pieces. */
export function findCut(model: SliceModel, point: Point, angle: number): CutLine | null {
  if (model.pieces.length >= MAX_PIECES || !Number.isFinite(point.x + point.z + angle)) return null;
  const dx = Math.cos(angle), dz = Math.sin(angle);
  const start = { x: point.x - dx * 9, z: point.z - dz * 9 }, end = { x: point.x + dx * 9, z: point.z + dz * 9 };
  let low = Infinity, high = -Infinity, length = 0;
  for (const piece of model.pieces) {
    const localStart = { x: start.x - piece.offset.x, z: start.z - piece.offset.z }, localEnd = { x: end.x - piece.offset.x, z: end.z - piece.offset.z };
    if (!splitPolygon(piece.polygon, localStart, localEnd)) continue;
    const span = chord(piece.polygon, localStart, localEnd)!;
    low = Math.min(low, span[0]); high = Math.max(high, span[1]); length += span[1] - span[0];
  }
  if (!Number.isFinite(low) || high - low < .15) return null;
  return { start, end, angle, width: high - low, length, center: { x: start.x + dx * (low + high) / 2, z: start.z + dz * (low + high) / 2 } };
}

/** A slow, pressure-driven knife. No input event can jump directly to a split. */
export class KnifePress {
  phase: 'idle' | 'cutting' | 'complete' | 'lifting' = 'idle';
  depth = 0;
  speed = 0;
  pressure = .5;
  resistance = 0;
  elapsed = 0;
  line: CutLine | null = null;
  private completionDelivered = false;
  begin(line: CutLine) {
    if (this.phase !== 'idle') return false;
    this.line = line; this.phase = 'cutting'; this.depth = 0; this.speed = 0; this.elapsed = 0; this.pressure = .5;
    this.completionDelivered = false;
    return true;
  }
  setPressure(value: number) { this.pressure = Number.isFinite(value) ? Math.max(.05, Math.min(1, value)) : .5; }
  step(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return false;
    dt = Math.min(dt, .05); this.elapsed += dt;
    if (this.phase === 'cutting') {
      const load = Math.min(1, (this.line?.length ?? 3) / 3.3);
      // Enter gently, meet more resistance in the middle, then ease through the base.
      this.resistance = (.35 + .65 * Math.sin(Math.PI * this.depth)) * (.6 + load * .4);
      const desired = (.26 + .2 * this.pressure) / (.8 + this.resistance * .45);
      this.speed += (desired - this.speed) * (1 - Math.exp(-dt * 5));
      this.depth = Math.min(1, this.depth + this.speed * dt);
      if (this.depth >= 1 && !this.completionDelivered) {
        this.completionDelivered = true; this.phase = 'complete'; this.speed = 0; this.resistance = 0;
        return true;
      }
    } else if (this.phase === 'lifting') {
      this.speed = 0; this.resistance = 0; this.depth = Math.max(0, this.depth - dt * 1.9);
      if (this.depth === 0) { this.phase = 'idle'; this.line = null; }
    }
    return false;
  }
  release(immediate = false) {
    this.speed = 0; this.resistance = 0;
    if (immediate || this.depth < .001) this.reset();
    else this.phase = 'lifting';
  }
  reset() {
    this.phase = 'idle'; this.depth = 0; this.speed = 0; this.resistance = 0; this.elapsed = 0; this.line = null; this.completionDelivered = false;
  }
  get moving() { return this.phase === 'cutting' || this.phase === 'lifting'; }
}
