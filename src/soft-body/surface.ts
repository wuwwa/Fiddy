import type { BufferAttribute, BufferGeometry } from 'three/webgpu';
import type { Binding, SoftBodyPhysics } from './physics';
import type { SurfaceRipples } from './ripples';
import { updateSoftBounds, updateSoftNormals } from './mesh-update';

/** Waves follow the current skin, including its dents, compression, and twist. */
export function updateSoftSurface(
  geometry:BufferGeometry, physics:SoftBodyPhysics, rest:Float32Array,
  bindings:Binding[], ripples:SurfaceRipples, alpha=1,
) {
  const position=geometry.getAttribute('position') as BufferAttribute;
  const output=position.array as Float32Array;
  physics.deform(rest,output,bindings,alpha);
  if(ripples.active) {
    updateSoftNormals(geometry,false);
    ripples.apply(rest,geometry.getAttribute('normal').array as Float32Array,output);
  }
  position.needsUpdate=true;
  updateSoftNormals(geometry);
  updateSoftBounds(geometry);
}
