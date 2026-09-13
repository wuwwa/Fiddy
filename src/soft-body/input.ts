import type { Matrix4 } from 'three/webgpu';
import type { Point } from './physics';

/** Convert a world-space drag into the toy's current local frame.
 * Both points share the same transform, so entrance motion cannot invent a drag.
 * The caller supplies its current inverse world matrix and a reusable output.
 */
export function localDragDelta<T extends Point>(
  current: Point, anchor: Point, inverseWorld: Matrix4, output: T,
): T {
  const x=current.x-anchor.x, y=current.y-anchor.y, z=current.z-anchor.z;
  const m=inverseWorld.elements;
  // A displacement uses only the affine matrix's linear part. Do not normalize:
  // nonuniform entrance scaling must preserve the pointer's drag distance.
  output.x=m[0]*x+m[4]*y+m[8]*z;
  output.y=m[1]*x+m[5]*y+m[9]*z;
  output.z=m[2]*x+m[6]*y+m[10]*z;
  return output;
}

/** Let a drag pull free of the automatic hold-to-press action.
 * The surface normal is a unit vector in the same local frame as the offset.
 */
export function dragPressure(offset:Point, surfaceNormal:Point):number {
  const outward=offset.x*surfaceNormal.x+offset.y*surfaceNormal.y+offset.z*surfaceNormal.z;
  const tx=offset.x-outward*surfaceNormal.x;
  const ty=offset.y-outward*surfaceNormal.y;
  const tz=offset.z-outward*surfaceNormal.z;
  // A smooth lateral fade leaves small hand movements alone, but lets a clear
  // sideways/upward pull stretch instead of continuing to deepen the dent.
  const tangentFade=Math.exp(-(tx*tx+ty*ty+tz*tz)/(0.3*0.3));
  // Exactly one at rest, tending toward zero outward and at most 1.3 inward.
  // The continuous curve avoids a change in slope when the pointer crosses back.
  const normalPressure=1.3/(1+0.3*Math.exp(outward/0.16));
  return normalPressure*tangentFade;
}
