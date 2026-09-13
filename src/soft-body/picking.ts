import { Vector2, type Camera, type Mesh, type Raycaster } from 'three/webgpu';

const nearby=new Vector2();

/** Retry an exact triangle-edge miss with a numerical nudge, not a wider hitbox.
 * Settled cage roundoff can move symmetric vertices by ~1e-18; Three's triangle
 * test occasionally misses both faces at that shared edge. The fallback is far
 * below a CSS pixel and still has to intersect the actual rendered surface.
 */
export function pickSoftSurface(raycaster:Raycaster,mesh:Mesh,camera:Camera,pointer:Vector2) {
  const hit=raycaster.intersectObject(mesh,false)[0];
  if(hit) return hit;
  nearby.set(pointer.x+1e-7,pointer.y+1e-7);
  raycaster.setFromCamera(nearby,camera);
  const adjacent=raycaster.intersectObject(mesh,false)[0];
  raycaster.setFromCamera(pointer,camera);
  return adjacent;
}
