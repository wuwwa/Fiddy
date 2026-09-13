import { clamp, type FieldPointer } from '../fields/input';

export class TideField {
  readonly positions: Float32Array;
  readonly offsets: Float32Array;
  readonly velocity: Float32Array;
  readonly elevation: Float32Array;
  readonly elevationVelocity: Float32Array;
  private readonly nextElevation: Float32Array;
  private readonly elevationForce: Float32Array;
  readonly columns: number;
  readonly rows: number;
  phase = 0;
  constructor(readonly width: number, readonly height: number) {
    this.columns = Math.min(150, Math.max(28, Math.floor(width / 12)));
    this.rows = Math.min(72, Math.max(26, Math.floor(height / 13)));
    this.positions = new Float32Array(this.columns * this.rows * 2);
    this.offsets = new Float32Array(this.positions.length);
    this.velocity = new Float32Array(this.positions.length);
    this.elevation = new Float32Array(this.columns * this.rows);
    this.elevationVelocity = new Float32Array(this.elevation.length);
    this.nextElevation = new Float32Array(this.elevation.length);
    this.elevationForce = new Float32Array(this.elevation.length);
  }
  resized(width: number, height: number) {
    const next = new TideField(width, height);
    next.phase = this.phase;
    for (let row = 0; row < next.rows; row++) for (let col = 0; col < next.columns; col++) {
      const x = col / (next.columns - 1) * (this.columns - 1), y = row / (next.rows - 1) * (this.rows - 1);
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, this.columns - 1), y1 = Math.min(y0 + 1, this.rows - 1);
      for (let axis = 0; axis < 2; axis++) for (const [source, target] of [[this.offsets, next.offsets], [this.velocity, next.velocity]]) {
        const a = source[(y0 * this.columns + x0) * 2 + axis], b = source[(y0 * this.columns + x1) * 2 + axis];
        const c = source[(y1 * this.columns + x0) * 2 + axis], d = source[(y1 * this.columns + x1) * 2 + axis];
        const upper = a + (b - a) * (x - x0), lower = c + (d - c) * (x - x0);
        target[(row * next.columns + col) * 2 + axis] = (upper + (lower - upper) * (y - y0)) * (axis === 0 ? width / this.width : height / this.height);
      }
      for (const [source, target] of [[this.elevation, next.elevation], [this.elevationVelocity, next.elevationVelocity]]) {
        const upper = source[y0 * this.columns + x0] * (1 - x + x0) + source[y0 * this.columns + x1] * (x - x0);
        const lower = source[y1 * this.columns + x0] * (1 - x + x0) + source[y1 * this.columns + x1] * (x - x0);
        target[row * next.columns + col] = (upper * (1 - y + y0) + lower * (y - y0)) * height / this.height;
      }
    }
    return next;
  }
  reset() {
    this.offsets.fill(0); this.velocity.fill(0); this.elevation.fill(0);
    this.elevationVelocity.fill(0); this.nextElevation.fill(0); this.elevationForce.fill(0); this.phase = 0;
  }
  step(dt: number, pointer: FieldPointer, reduced: boolean) {
    if (!Number.isFinite(dt)) return;
    dt = clamp(dt, 0, 1 / 30);
    if (!reduced) this.phase += dt * .22;
    const phase = this.phase;
    const radius = Math.min(this.width, this.height) * .23;
    const strength = reduced ? .32 : 1;
    for (let row = 0; row < this.rows; row++) {
      const v = row / (this.rows - 1);
      for (let col = 0; col < this.columns; col++) {
        const u = col / (this.columns - 1), node = row * this.columns + col, i = node * 2;
        const wave = Math.sin(u * 8.5 + v * 4.8 - phase) * .65 + Math.cos(u * 4.2 - v * 5 + phase * .7) * .35;
        const envelope = Math.sin(v * Math.PI);
        const x = u * (this.width + 28) - 14;
        const y = v * this.height + wave * this.height * .105 * envelope;
        this.positions[i] = x; this.positions[i + 1] = y;
        if (dt > 0) for (const sample of pointer.samples) {
          const endX = sample.x * this.width, endY = sample.y * this.height;
          const sx = sample.dx * this.width, sy = sample.dy * this.height;
          const startX = endX - sx, startY = endY - sy;
          const lengthSquared = sx * sx + sy * sy;
          const along = lengthSquared ? clamp(((x - startX) * sx + (y - startY) * sy) / lengthSquared, 0, 1) : 0;
          const rx = x - (startX + sx * along), ry = y - (startY + sy * along);
          const distance = Math.hypot(rx, ry) + .01;
          const falloff = Math.pow(Math.max(0, 1 - distance / radius), 2) * strength;
          const pulse = sample.start ? 85 : 0;
          this.velocity[i] += (rx / distance * pulse + clamp(sx, -100, 100) * 1.5) * falloff;
          this.velocity[i + 1] += (ry / distance * pulse + clamp(sy, -100, 100) * 1.5) * falloff;
          this.elevationVelocity[node] += (sample.start ? 65 : Math.min(55, Math.sqrt(lengthSquared) * 1.8)) * falloff;
        }
        let fx = 0, fy = 0;
        this.elevationForce[node] = 0;
        if (pointer.inside) {
          const dx = x + this.offsets[i] - pointer.x * this.width;
          const dy = y + this.offsets[i + 1] - pointer.y * this.height;
          const distance = Math.hypot(dx, dy) + .01;
          const falloff = Math.pow(Math.max(0, 1 - distance / radius), 2);
          if (pointer.down) {
            fx = (-dx * 9 - dy * 17) * falloff;
            fy = (-dy * 9 + dx * 17) * falloff;
            this.elevationForce[node] = -360 * falloff * strength;
          } else {
            fx = dx / distance * 650 * falloff;
            fy = dy / distance * 650 * falloff;
          }
        }
        const spring = reduced ? 28 : 15, damping = Math.exp(-(reduced ? 8 : 4.8) * dt);
        this.velocity[i] = (this.velocity[i] + (fx * strength - this.offsets[i] * spring) * dt) * damping;
        this.velocity[i + 1] = (this.velocity[i + 1] + (fy * strength - this.offsets[i + 1] * spring) * dt) * damping;
        const limit = radius * .9;
        this.offsets[i] = clamp(this.offsets[i] + this.velocity[i] * dt, -limit, limit);
        this.offsets[i + 1] = clamp(this.offsets[i + 1] + this.velocity[i + 1] * dt, -limit, limit);
      }
    }
    // A connected damped membrane carries wakes beyond the touched patch.
    // Substeps and separate read/write heights keep the wave solve symmetric.
    const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    const damping = Math.exp(-(reduced ? 8 : 2.3) * h);
    const cx = Math.min(700, 50000 / (this.width / (this.columns - 1)) ** 2);
    const cy = Math.min(700, 50000 / (this.height / (this.rows - 1)) ** 2);
    for (let step = 0; step < steps; step++) {
      for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.columns; col++) {
        const i = row * this.columns + col, z = this.elevation[i];
        const left = this.elevation[row * this.columns + Math.max(0, col - 1)];
        const right = this.elevation[row * this.columns + Math.min(this.columns - 1, col + 1)];
        const top = this.elevation[Math.max(0, row - 1) * this.columns + col];
        const bottom = this.elevation[Math.min(this.rows - 1, row + 1) * this.columns + col];
        const force = (left + right - 2 * z) * cx + (top + bottom - 2 * z) * cy - z * (reduced ? 20 : 8) + this.elevationForce[i];
        this.elevationVelocity[i] = clamp((this.elevationVelocity[i] + force * h) * damping, -180, 180);
        this.nextElevation[i] = clamp(z + this.elevationVelocity[i] * h, -40, 40);
      }
      this.elevation.set(this.nextElevation);
    }
  }
}
