import { Quaternion, Vector3 } from 'three';

/** A virtual trackball avoids Euler gimbal lock and allows complete revolutions. */
export function trackballPoint(x: number, y: number, width: number, height: number) {
  const radius = Math.max(1, Math.min(width, height) * .43);
  const point = new Vector3((x - width / 2) / radius, (height * .46 - y) / radius, 0);
  const squared = point.x * point.x + point.y * point.y;
  point.z = squared < .5 ? Math.sqrt(1 - squared) : .5 / Math.sqrt(squared);
  return point.normalize();
}

export class RotationMotion {
  orientation = new Quaternion();
  velocity = new Vector3();
  private increment = new Quaternion();
  private axis = new Vector3();

  drag(from: Vector3, to: Vector3, dt: number) {
    this.increment.setFromUnitVectors(from, to);
    this.orientation.premultiply(this.increment).normalize();
    const angle = 2 * Math.acos(Math.min(1, Math.max(-1, this.increment.w)));
    this.axis.set(this.increment.x, this.increment.y, this.increment.z);
    if (this.axis.lengthSq() > 1e-10) {
      this.axis.normalize().multiplyScalar(Math.min(3.8, angle / Math.max(1 / 120, dt)));
      this.velocity.lerp(this.axis, .65);
    } else this.velocity.multiplyScalar(.5);
  }

  rotate(x: number, y: number, z: number) {
    this.axis.set(x, y, z);
    const angle = this.axis.length();
    if (angle) this.orientation.premultiply(this.increment.setFromAxisAngle(this.axis.divideScalar(angle), angle)).normalize();
  }

  step(dt: number) {
    const speed = this.velocity.length();
    if (speed < .002) { this.velocity.set(0, 0, 0); return; }
    // Analytic damping gives consistent travel at 30, 60, and 120 Hz.
    const decay = Math.exp(-3.6 * dt), angle = speed * (1 - decay) / 3.6;
    this.orientation.premultiply(this.increment.setFromAxisAngle(this.axis.copy(this.velocity).divideScalar(speed), angle)).normalize();
    this.velocity.multiplyScalar(decay);
  }

  reset() { this.orientation.identity(); this.velocity.set(0, 0, 0); }
}
