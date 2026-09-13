import { clamp, type FieldPointer } from '../fields/input';

export interface SilkPointer extends FieldPointer {
  grabU?: number;
  grabV?: number;
  lift?: number;
  grabId?: number;
}

/** A damped sheet with an attached grip, lateral tension, and directional folds. */
export class SilkField {
  readonly side = 73;
  readonly count = this.side * this.side;
  readonly height = new Float32Array(this.count);
  readonly velocity = new Float32Array(this.count);
  readonly next = new Float32Array(this.count);
  readonly offsetX = new Float32Array(this.count);
  readonly offsetZ = new Float32Array(this.count);
  readonly velocityX = new Float32Array(this.count);
  readonly velocityZ = new Float32Array(this.count);
  private readonly nextX = new Float32Array(this.count);
  private readonly nextZ = new Float32Array(this.count);
  readonly surfaceBase = new Float32Array(this.count);
  private readonly linkA: Uint16Array;
  private readonly linkB: Uint16Array;
  private readonly linkX: Float32Array;
  private readonly linkZ: Float32Array;
  private readonly linkLimit: Float32Array;
  private readonly linkAllowance: Float32Array;
  phase = 0;
  held = false;
  grabU = .5;
  grabV = .5;
  private holdAge = 0;
  private lastGrabId = -1;

  constructor() {
    this.updateBase();
    const a: number[] = [], b: number[] = [], x: number[] = [], z: number[] = [], allowanceValues: number[] = [];
    const spacing = 3.5 / (this.side - 1);
    for (let row = 0; row < this.side; row++) for (let col = 0; col < this.side; col++) {
      const i = row * this.side + col;
      // Warp, weft, and both bias directions have different stretch allowances.
      for (const [dc, dr, allowance] of [[1,0,1.06],[0,1,1.08],[1,1,1.12],[-1,1,1.12]]) {
        if (col + dc < 0 || col + dc >= this.side || row + dr >= this.side) continue;
        const j = (row + dr) * this.side + col + dc;
        a.push(i); b.push(j); x.push(dc * spacing); z.push(dr * spacing);
        allowanceValues.push(allowance);
      }
    }
    this.linkA = new Uint16Array(a); this.linkB = new Uint16Array(b);
    this.linkX = new Float32Array(x); this.linkZ = new Float32Array(z); this.linkLimit = new Float32Array(a.length);
    this.linkAllowance = new Float32Array(allowanceValues); this.updateLimits();
  }

  private updateLimits() {
    for (let i = 0; i < this.linkA.length; i++) {
      this.linkLimit[i] = Math.hypot(this.linkX[i], this.linkZ[i], this.surfaceBase[this.linkB[i]] - this.surfaceBase[this.linkA[i]]) * this.linkAllowance[i];
    }
  }

  private updateBase() {
    for (let row = 0; row < this.side; row++) for (let col = 0; col < this.side; col++) {
      this.surfaceBase[row * this.side + col] = this.base(col / (this.side - 1), row / (this.side - 1));
    }
  }

  private limitStrain() {
    // Project only extensions. Compression remains free to form folds. Alternate
    // traversal directions so the gather has no persistent left-to-right bias.
    for (let pass = 0; pass < 4; pass++) {
      for (let n = 0; n < this.linkA.length; n++) {
        const edge = pass % 2 ? this.linkA.length - 1 - n : n;
        const a = this.linkA[edge], b = this.linkB[edge];
        const dx = this.linkX[edge] + this.nextX[b] - this.nextX[a];
        const dy = this.surfaceBase[b] + this.next[b] - this.surfaceBase[a] - this.next[a];
        const dz = this.linkZ[edge] + this.nextZ[b] - this.nextZ[a];
        const distance2 = dx * dx + dy * dy + dz * dz, limit = this.linkLimit[edge];
        if (distance2 <= limit * limit) continue;
        const correction = .5 * (1 - limit / Math.sqrt(distance2));
        this.nextX[a] += dx * correction; this.nextX[b] -= dx * correction;
        this.next[a] += dy * correction; this.next[b] -= dy * correction;
        this.nextZ[a] += dz * correction; this.nextZ[b] -= dz * correction;
      }
    }
  }

  reset() {
    for (const array of [this.height,this.velocity,this.next,this.offsetX,this.offsetZ,this.velocityX,this.velocityZ,this.nextX,this.nextZ]) array.fill(0);
    this.phase = 0; this.held = false; this.holdAge = 0; this.lastGrabId = -1; this.grabU = this.grabV = .5;
    this.updateBase();
    this.updateLimits();
  }

  base(u: number, v: number) {
    const edge = Math.min(u,v,1-u,1-v);
    const fold = u - .11 * Math.sin(v * 5.2);
    return .105 * Math.sin(u * 5.8 + v * 2.1)
      + .125 * Math.sin(fold * 16.5 + .4) * (.55 + .45 * Math.sin(v * Math.PI))
      + .025 * Math.sin(fold * 39 + v * 4)
      + .013 * Math.sin(u * 8 + v * 10 + this.phase)
      + .027 * Math.exp(-edge * 22) * Math.sin(u * 15 + v * 11 + this.phase * .65)
      + .014 * Math.exp(-edge * 170);
  }

  step(dt: number, pointer: SilkPointer, reduced: boolean) {
    if (!Number.isFinite(dt)) return;
    dt = clamp(dt, 0, 1 / 30); if (!dt) return;
    if (!reduced) {
      this.phase += dt * .14;
      this.updateBase();
      this.updateLimits();
    }
    const gain = reduced ? .35 : 1;
    const held = pointer.inside && pointer.down && Number.isFinite(pointer.x) && Number.isFinite(pointer.y);
    if (held && (!this.held || (pointer.grabId !== undefined && pointer.grabId !== this.lastGrabId))) {
      this.grabU = clamp(pointer.grabU ?? pointer.x,0,1);
      this.grabV = clamp(pointer.grabV ?? pointer.y,0,1);
      this.holdAge = 0;
      this.lastGrabId = pointer.grabId ?? -1;
    }
    this.held = held;
    if (held) this.holdAge += dt; else this.holdAge = 0;
    const targetX = held ? 1.05 * Math.tanh((pointer.x - this.grabU) * 3.5 / 1.05) : 0;
    const targetZ = held ? 1.05 * Math.tanh((pointer.y - this.grabV) * 3.5 / 1.05) : 0;
    const pull = Math.hypot(targetX,targetZ), dirX = pull > .001 ? targetX / pull : 1, dirZ = pull > .001 ? targetZ / pull : 0;
    const lift = clamp(pointer.lift ?? .95,.2,1.08), grip = held ? (1 - Math.exp(-this.holdAge * 14)) * gain : 0;

    // Moving brushes and completed short strokes leave a ripple without relocating a grip.
    for (const sample of pointer.samples) {
      if (held && sample.down) continue;
      if (![sample.x,sample.y,sample.dx,sample.dy].every(Number.isFinite)) continue;
      const length2 = sample.dx ** 2 + sample.dy ** 2;
      const impulse = gain * ((sample.start ? .5 : 0) + Math.min(1.1,Math.sqrt(length2) * 7));
      if (!impulse) continue;
      for (let row = 0; row < this.side; row++) for (let col = 0; col < this.side; col++) {
        const index = row * this.side + col, u = col / (this.side - 1), v = row / (this.side - 1);
        const along = length2 ? clamp(((u - sample.x + sample.dx) * sample.dx + (v - sample.y + sample.dy) * sample.dy) / length2,0,1) : 0;
        const dx = u - sample.x + sample.dx * (1 - along), dy = v - sample.y + sample.dy * (1 - along);
        this.velocity[index] += Math.exp(-(dx*dx+dy*dy)/.006) * impulse;
      }
    }

    const steps = Math.max(1,Math.ceil(dt * 120)), h = dt / steps;
    const damping = Math.exp(-(reduced ? 9 : 3.7) * h), lateralDamping = Math.exp(-(reduced ? 11 : 5.8) * h);
    for (let step = 0; step < steps; step++) {
      for (let row = 0; row < this.side; row++) for (let col = 0; col < this.side; col++) {
        const i = row * this.side + col, z = this.height[i], u = col / (this.side - 1), v = row / (this.side - 1);
        const left = row*this.side+Math.max(0,col-1), right = row*this.side+Math.min(this.side-1,col+1);
        const top = Math.max(0,row-1)*this.side+col, bottom = Math.min(this.side-1,row+1)*this.side+col;
        const du = u-this.grabU, dv = v-this.grabV, radius2 = du*du+dv*dv;
        const influence = grip ? Math.exp(-radius2/.025) * grip : 0;
        const across = -du*dirZ+dv*dirX, along = du*dirX+dv*dirZ;
        const crease = held ? .16 * pull * Math.cos(across*48) * Math.exp(-across*across/.027-along*along/.15) * (1-Math.exp(-radius2/.003)) * grip : 0;
        const tension = (this.height[left]+this.height[right]-2*z)*850 + (this.height[top]+this.height[bottom]-2*z)*580;
        const force = tension - z*13 + (lift-z)*105*influence + crease*35;
        this.velocity[i] = clamp((this.velocity[i]+force*h)*damping,-6,6);
        this.next[i] = clamp(z+this.velocity[i]*h,-.65,1.1);
        const x = this.offsetX[i], depth = this.offsetZ[i];
        const forceX = (this.offsetX[left]+this.offsetX[right]+this.offsetX[top]+this.offsetX[bottom]-4*x)*740 - x*15 + (targetX-x)*135*influence;
        const forceZ = (this.offsetZ[left]+this.offsetZ[right]+this.offsetZ[top]+this.offsetZ[bottom]-4*depth)*740 - depth*15 + (targetZ-depth)*135*influence;
        this.velocityX[i] = clamp((this.velocityX[i]+forceX*h)*lateralDamping,-4,4);
        this.velocityZ[i] = clamp((this.velocityZ[i]+forceZ*h)*lateralDamping,-4,4);
        this.nextX[i] = clamp(x+this.velocityX[i]*h,-1.05,1.05);
        this.nextZ[i] = clamp(depth+this.velocityZ[i]*h,-1.05,1.05);
      }
      this.limitStrain();
      for (let i = 0; i < this.count; i++) {
        this.next[i] = clamp(this.next[i], Math.max(-.65, -.70 - this.surfaceBase[i]), 1.1);
        this.nextX[i] = clamp(this.nextX[i], -1.05, 1.05); this.nextZ[i] = clamp(this.nextZ[i], -1.05, 1.05);
        // Keep velocity consistent with the constrained position, so projection
        // cannot store a hidden stretching impulse for the next frame.
        this.velocity[i] = clamp((this.next[i] - this.height[i]) / h, -6, 6);
        this.velocityX[i] = clamp((this.nextX[i] - this.offsetX[i]) / h, -4, 4);
        this.velocityZ[i] = clamp((this.nextZ[i] - this.offsetZ[i]) / h, -4, 4);
      }
      this.height.set(this.next);this.offsetX.set(this.nextX);this.offsetZ.set(this.nextZ);
    }
  }
}
