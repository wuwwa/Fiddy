import { BufferAttribute, Color, DynamicDrawUsage, type BufferGeometry, type MeshPhysicalNodeMaterial } from 'three/webgpu';
import { attribute, dFdx, dFdy, mx_noise_float, normalView, positionView, vec3 } from 'three/tsl';
import type { Binding } from './physics';
import type { KneadingMemory } from './kneading';

/** Powdery flour patches disappear into pale raw dough where it is worked. */
export class DoughSurface {
  private readonly colors:BufferAttribute;
  private readonly unmixed:Float32Array;
  private readonly blended=new Color('#e7e3d8');
  private revision=-1;

  constructor(geometry:BufferGeometry,private readonly bindings:Binding[],private readonly memory:KneadingMemory) {
    const position=geometry.getAttribute('position');
    this.unmixed=new Float32Array(position.count*3);
    this.colors=new BufferAttribute(new Float32Array(this.unmixed.length),3).setUsage(DynamicDrawUsage);
    geometry.setAttribute('color',this.colors);
    const flour=new Color('#fbfaf4'),dough=new Color('#e4e0d5'),color=new Color();
    for(let i=0;i<position.count;i++) {
      const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
      const dust=Math.sin(x*8.3+z*4.1)*Math.sin(z*7.6-y*3.8)+0.5*Math.sin(y*11.2+x*5.7)
        +0.25*Math.sin(x*24.7-z*18.3+y*13.1);
      const patch=Math.max(0,Math.min(1,dust*0.6+0.38));
      const grain=0.995+0.005*Math.sin(x*117+y*83)*Math.sin(z*103-y*67);
      color.copy(dough).lerp(flour,patch).multiplyScalar(grain).toArray(this.unmixed,i*3);
    }
    this.update();
  }

  finish(geometry:BufferGeometry,material:MeshPhysicalNodeMaterial) {
    finishDoughMaterial(geometry,material);
  }

  update() {
    if(this.revision===this.memory.revision)return;
    this.revision=this.memory.revision;
    for(let i=0;i<this.bindings.length;i++) {
      const blend=this.memory.blend(this.bindings[i]),j=i*3;
      this.colors.setXYZ(i,
        this.unmixed[j]+(this.blended.r-this.unmixed[j])*blend,
        this.unmixed[j+1]+(this.blended.g-this.unmixed[j+1])*blend,
        this.unmixed[j+2]+(this.blended.b-this.unmixed[j+2])*blend);
    }
    this.colors.needsUpdate=true;
  }
}

export function finishDoughMaterial(geometry:BufferGeometry,material:MeshPhysicalNodeMaterial,initialize=true) {
    // Fixed skins preserve grain coordinates; volumes supply remeshed coordinates.
    if(initialize)geometry.setAttribute('doughRest',geometry.getAttribute('position').clone());
    const grain=mx_noise_float(vec3(attribute('doughRest','vec3')).mul(85));
    material.specularIntensity=0.3;
    // The renderer multiplies vertex colors after this node.
    material.colorNode=vec3(grain.mul(0.045).add(0.99));
    const height=vec3(grain.mul(0.00023));
    const sx=positionView.dFdx(),sy=positionView.dFdy();
    const r1=sy.cross(normalView),r2=normalView.cross(sx),det=sx.dot(r1);
    material.normalNode=normalView.mul(det.abs())
      .sub(r1.mul(dFdx(height).x).add(r2.mul(dFdy(height).x)).mul(det.sign())).normalize();
}
