import { clamp, type FieldPointer } from '../fields/input';
export type Polarity = 'attract' | 'repel';

export interface DipoleSample { bx: number; by: number; flux: number; gx: number; gy: number; ax: number; ay: number }
/** A finite dipole approximation: opposite virtual poles, with a softened core.
 * Its far field is the dipole equation. Flux contours guide the visible chains;
 * grad(|B|²) supplies bounded attraction, rather than treating B as a velocity. */
export function dipoleSample(x: number, y: number, out: DipoleSample = { bx: 0, by: 0, flux: 0, gx: 0, gy: 0, ax: 0, ay: 0 }): DipoleSample {
  const core2 = .22 ** 2, left = x + 1, right = x - 1;
  const l2 = left * left + y * y + core2, r2 = right * right + y * y + core2;
  const l = Math.sqrt(l2), r = Math.sqrt(r2), l3 = 1 / (l2 * l), r3 = 1 / (r2 * r), l5 = l3 / l2, r5 = r3 / r2;
  out.bx = right * r3 - left * l3; out.by = y * (r3 - l3);
  out.flux = left / l - right / r;
  out.gx = (y * y + core2) * (l3 - r3); out.gy = y * out.bx;
  const xx = r3 - 3 * right * right * r5 - l3 + 3 * left * left * l5;
  const xy = -3 * right * y * r5 + 3 * left * y * l5;
  const yy = r3 - 3 * y * y * r5 - l3 + 3 * y * y * l5;
  out.ax = 2 * (out.bx * xx + out.by * xy); out.ay = 2 * (out.bx * xy + out.by * yy);
  return out;
}

export class MagneticField {
  readonly count = 9600;
  readonly position = new Float32Array(this.count * 2);
  readonly velocity = new Float32Array(this.count * 2);
  readonly home = new Float32Array(this.count * 2);
  readonly grain = new Float32Array(this.count);
  readonly directions = new Float32Array(this.count);
  readonly alignment = new Float32Array(this.count);
  polarity: Polarity = 'attract';
  width = 1; height = 1; radius = 1; pole = 1;
  angle = -.35;
  private readonly sample: DipoleSample = { bx: 0, by: 0, flux: 0, gx: 0, gy: 0, ax: 0, ay: 0 };
  constructor(width: number, height: number) {
    let seed = 72413;
    for (let i = 0; i < this.count; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; this.grain[i] = seed / 4294967296; }
    this.resize(width, height); this.reset();
  }
  resize(width: number, height: number) {
    width = Math.max(1, width); height = Math.max(1, height);
    const sx = width / this.width, sy = height / this.height;
    this.width = width; this.height = height; this.radius = Math.min(width * .44, height * .34); this.pole = Math.max(10, this.radius * .23);
    for (let i = 0; i < this.count; i++) {
      // A poured bed: dense in the middle, with scattered grains at its edge.
      // The bounded bell distribution avoids both a cut-out oval and clipped tails.
      const radius = Math.sqrt(-Math.log(1 - .985 * this.grain[i])) / 2.06;
      const angle = this.grain[(i + 113) % this.count] * Math.PI * 2;
      const edge = 1 + .07 * Math.sin(angle * 3 + .8) + .04 * Math.cos(angle * 5);
      this.home[i * 2] = width * (.5 + Math.cos(angle) * radius * edge * .43);
      this.home[i * 2 + 1] = height * (.46 + Math.sin(angle) * radius * edge * .29 + .018 * Math.sin(angle * 2) * radius);
      this.position[i * 2] *= sx; this.position[i * 2 + 1] *= sy;
      this.velocity[i * 2] *= sx; this.velocity[i * 2 + 1] *= sy;
    }
  }
  reset() {
    this.position.set(this.home); this.velocity.fill(0); this.alignment.fill(0); this.angle = -.35;
    for (let i = 0; i < this.count; i++) this.directions[i] = this.grain[(i + 53) % this.count] * Math.PI;
  }
  step(dt: number, pointer: FieldPointer, reduced: boolean) {
    dt = clamp(dt, 0, 1 / 30); if (!dt) return;
    const interacting = pointer.inside && pointer.down, gain = reduced ? .4 : 1;
    let moveX = 0, moveY = 0;
    for (const sample of pointer.samples) if (sample.down) { moveX += sample.dx * this.width; moveY += sample.dy * this.height; }
    if (interacting && Math.hypot(moveX, moveY) > 1) {
      const delta = Math.atan2(moveY, moveX) - this.angle;
      this.angle += Math.atan2(Math.sin(delta * 2), Math.cos(delta * 2)) * .5 * (1 - Math.exp(-dt * 6));
    }
    const cos = Math.cos(this.angle), sin = Math.sin(this.angle), reach = this.radius * 1.25;
    const damping = Math.exp(-(reduced ? 8 : 5.2) * dt);
    for (let i = 0; i < this.count; i++) {
      const index = i * 2, x = this.position[index], y = this.position[index + 1];
      const dx = x - pointer.x * this.width, dy = y - pointer.y * this.height;
      const recovery = interacting ? .3 : 3.8;
      let fx = (this.home[index] - x) * recovery, fy = (this.home[index + 1] - y) * recovery;
      let influence = 0;
      if (interacting) {
        influence = Math.exp(-(dx * dx + dy * dy) / (reach * reach));
        const lx = (dx * cos + dy * sin) / this.pole, ly = (-dx * sin + dy * cos) / this.pole;
        const field = dipoleSample(lx, ly, this.sample);
        // Filings have no visible head/tail: align modulo pi so they never spin a full turn.
        const target = Math.atan2(field.by, field.bx) + this.angle + (this.grain[i] - .5) * .18;
        const delta = target - this.directions[i];
        this.directions[i] += Math.atan2(Math.sin(delta * 2), Math.cos(delta * 2)) * .5 * (1 - Math.exp(-dt * 15 * influence * gain));
        if (this.polarity === 'attract') {
          // Snap gently across flux contours, never along them: this reveals curved chains.
          // Slightly different grain sizes give each chain a physical width.
          const level = (Math.round(Math.sqrt(Math.max(0, field.flux)) * 22) + (this.grain[(i + 31) % this.count] - .5) * .18) / 22;
          const error = field.flux - level * level, gradient2 = field.gx * field.gx + field.gy * field.gy;
          const normal = clamp(-error / (gradient2 + .00002), -1.5, 1.5);
          const ax = clamp(normal * field.gx, -.24, .24) * this.pole * 110;
          const ay = clamp(normal * field.gy, -.24, .24) * this.pole * 110;
          const attraction = Math.hypot(field.ax, field.ay);
          const pullX = field.ax / (1 + attraction) * 35, pullY = field.ay / (1 + attraction) * 35;
          let localX = ax + pullX, localY = ay + pullY;
          // A soft exclusion zone prevents either pole from swallowing all its grains.
          const poleX = lx - (lx >= 0 ? 1 : -1), poleDistance = Math.hypot(poleX, ly) + .001;
          const exclusion = Math.max(0, .27 + this.grain[i] * .20 - poleDistance) * 1600;
          localX += poleX / poleDistance * exclusion; localY += ly / poleDistance * exclusion;
          fx += (localX * cos - localY * sin) * influence * gain;
          fy += (localX * sin + localY * cos) * influence * gain;
        } else {
          const distance = Math.hypot(dx, dy) + .1;
          fx += dx / distance * 1700 * influence * gain; fy += dy / distance * 1700 * influence * gain;
        }
      }
      this.alignment[i] += (influence - this.alignment[i]) * (1 - Math.exp(-dt * (interacting ? 7 : reduced ? 4 : .8)));
      if (!interacting && this.alignment[i] > .0001) {
        const delta = this.grain[(i + 53) % this.count] * Math.PI - this.directions[i];
        this.directions[i] += Math.atan2(Math.sin(delta * 2), Math.cos(delta * 2)) * .5 * (1 - Math.exp(-dt * (reduced ? 1.5 : .35)));
      }
      for (const sample of pointer.samples) {
        if (!sample.down) continue;
        const sx = sample.dx * this.width, sy = sample.dy * this.height, ex = sample.x * this.width, ey = sample.y * this.height;
        const length2 = sx * sx + sy * sy;
        const along = length2 ? clamp(((x - ex + sx) * sx + (y - ey + sy) * sy) / length2, 0, 1) : 0;
        const rx = x - ex + sx * (1 - along), ry = y - ey + sy * (1 - along), distance = Math.hypot(rx, ry) + .1;
        const falloff = Math.pow(Math.max(0, 1 - distance / reach), 2) * gain;
        const pulse = sample.start ? (this.polarity === 'repel' ? 250 : -45) : 0;
        this.velocity[index] += (clamp(sx, -120, 120) * 1.6 + rx / distance * pulse) * falloff;
        this.velocity[index + 1] += (clamp(sy, -120, 120) * 1.6 + ry / distance * pulse) * falloff;
      }
      this.velocity[index] = clamp((this.velocity[index] + fx * dt) * damping, -700, 700);
      this.velocity[index + 1] = clamp((this.velocity[index + 1] + fy * dt) * damping, -700, 700);
      this.position[index] = clamp(x + this.velocity[index] * dt, 1, Math.max(1, this.width - 1));
      this.position[index + 1] = clamp(y + this.velocity[index + 1] * dt, 1, Math.max(1, this.height - 1));
    }
  }
}
