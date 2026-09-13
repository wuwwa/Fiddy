import * as THREE from 'three/webgpu';
import { FLOOR } from './physics';
import { POP_DURATION, REFORM_START } from './reactions';
import { updateSoftBounds, updateSoftNormals } from './mesh-update';

export const BURST_DURATION=POP_DURATION;
const smooth=(value:number)=>{
  const t=Math.max(0,Math.min(1,value));
  return t*t*t*(t*(t*6-15)+10);
};
type Point={x:number;y:number;z:number};
export const recoveryAt=(age:number)=>smooth((age-REFORM_START)/(BURST_DURATION-REFORM_START));

/** The existing skin releases from the strained patch, settles, then recovers. */
export class BurstVisual {
  private readonly source:Float32Array;
  private readonly puddle:Float32Array;
  private readonly delays:Float32Array;
  private readonly distances:Float32Array;
  private active=false;
  private disposed=false;
  private quietStart=-1;
  private phase:'ready'|'release'|'settle'|'recover'='ready';

  constructor(private readonly geometry:THREE.BufferGeometry,private readonly rest:Float32Array) {
    this.source=new Float32Array(rest.length);
    this.puddle=new Float32Array(rest.length);
    this.delays=new Float32Array(rest.length/3);
    this.distances=new Float32Array(rest.length/3);
  }

  trigger(point:Point,direction:Point) {
    if(this.disposed) return;
    const position=this.geometry.getAttribute('position');
    if(position.count*3!==this.rest.length) return;
    this.source.set(position.array);
    let radius=0,reach=0;
    for(let i=0;i<position.count;i++) {
      const j=i*3;
      radius=Math.max(radius,Math.hypot(this.rest[j],this.rest[j+2]));
      const distance=Math.hypot(this.source[j]-point.x,this.source[j+1]-point.y,this.source[j+2]-point.z);
      this.distances[i]=distance;reach=Math.max(reach,distance);
    }
    const length=Math.hypot(direction.x,direction.z);
    const dx=length>0.001?direction.x/length:0.4,dz=length>0.001?direction.z/length:0.9165;
    const axis=Math.atan2(dz,dx);
    for(let i=0;i<position.count;i++) {
      const j=i*3,x=this.rest[j],y=this.rest[j+1],z=this.rest[j+2];
      const angle=Math.atan2(z,x),edge=Math.min(1,Math.hypot(x,z)/Math.max(radius,0.001));
      // A few broad, unequal lobes retain the look of a continuous wet material.
      const lobe=0.18*Math.sin(angle*3+0.6)+0.095*Math.sin(angle*5-0.4);
      const outward=Math.max(0,Math.cos(angle-axis));
      const spread=1.28+edge*edge*(lobe+0.18*outward**6);
      this.puddle[j]=x*spread+dx*0.07*edge*edge;
      this.puddle[j+1]=FLOOR+Math.max(0,y-FLOOR)*(0.18-0.025*edge*edge);
      this.puddle[j+2]=z*spread+dz*0.07*edge*edge;
      // The release starts where the material was strained, then crosses its skin.
      this.delays[i]=this.distances[i]/Math.max(reach,0.001)*0.105;
    }
    this.active=true;this.phase='release';this.quietStart=-1;
  }

  update(age:number,reducedMotion:boolean) {
    if(this.disposed || !this.active) return;
    if(!Number.isFinite(age) || age>=BURST_DURATION) {this.restore();this.clear();return;}
    const t=Math.max(0,age);
    const recover=recoveryAt(t);
    this.phase=t<0.31?'release':t<REFORM_START?'settle':'recover';
    const position=this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const target=position.array;
    if(reducedMotion && this.quietStart<0) {
      // A live preference change starts from the currently visible surface.
      // Stay in quiet recovery for this cycle even if the preference flips back.
      this.source.set(target);this.quietStart=t;
    }
    const quiet=smooth((t-this.quietStart)/Math.max(0.001,BURST_DURATION-this.quietStart));
    for(let i=0;i<position.count;i++) {
      const j=i*3;
      if(this.quietStart>=0) {
        // Preserve the whole body and gradually relax the exact held deformation.
        const squeeze=1-0.035*Math.sin(Math.PI*quiet)**2;
        target[j]=this.source[j]+(this.rest[j]-this.source[j])*quiet;
        target[j+1]=FLOOR+(this.source[j+1]+(this.rest[j+1]-this.source[j+1])*quiet-FLOOR)*squeeze;
        target[j+2]=this.source[j+2]+(this.rest[j+2]-this.source[j+2])*quiet;
        continue;
      }
      const release=smooth((t-this.delays[i])/0.205);
      const recoil=0.045*Math.sin(t*19)*Math.exp(-t*5)*release*(1-recover);
      let x=this.source[j]+(this.puddle[j]-this.source[j])*release;
      let y=this.source[j+1]+(this.puddle[j+1]-this.source[j+1])*release;
      let z=this.source[j+2]+(this.puddle[j+2]-this.source[j+2])*release;
      const wave=0.032*Math.sin(this.distances[i]*7-t*19)*Math.exp(-t*4)*release*(1-recover);
      x=x*(1+recoil)*(1-recover)+this.rest[j]*recover;
      z=z*(1+recoil)*(1-recover)+this.rest[j+2]*recover;
      y=y*(1-recover)+this.rest[j+1]*recover;
      const lift=Math.min(1,Math.max(0,(y-FLOOR)/0.25));
      target[j]=x;target[j+1]=Math.max(FLOOR,y+wave*lift);target[j+2]=z;
    }
    this.refresh();
  }

  private refresh() {
    this.geometry.getAttribute('position').needsUpdate=true;
    updateSoftNormals(this.geometry);
    updateSoftBounds(this.geometry);
  }
  private restore() {
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).array.set(this.rest);
    this.refresh();
  }
  clear() { this.active=false;this.phase='ready'; }
  diagnostics() { return {active:this.active,phase:this.phase,droplets:0}; }
  dispose() { this.disposed=true;this.clear(); }
}
