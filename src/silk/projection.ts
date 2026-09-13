import { Camera, Plane, Raycaster, Vector2, Vector3 } from 'three';

/** Screen coordinates to the fabric's resting plane; captured strokes may leave its edges. */
export class SilkProjection {
  readonly ray = new Raycaster();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly hit = new Vector3();
  private readonly point = new Vector2();
  map(camera: Camera, x: number, y: number) {
    this.ray.setFromCamera(this.point.set(x * 2 - 1, 1 - y * 2), camera);
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return { x: -10, y: -10 };
    return { x: this.hit.x / 3.5 + .5, y: this.hit.z / 3.5 + .5 };
  }
}
