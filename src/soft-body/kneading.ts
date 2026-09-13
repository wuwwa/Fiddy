import type { Binding, Point } from './physics';

const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

/** A mouse has no second hand or pressure axis. A deliberate drag catches a
 * flap, lifts it clear, and lays it back down as the pointer returns. */
export class DoughMouseFold {
  readonly offset:Point={x:0,y:0,z:0};
  pressure=1;
  engagement=0;

  constructor(private readonly startX:number,private readonly startY:number) {}

  update(raw:Point,x:number,y:number) {
    const pixels=Math.hypot(x-this.startX,y-this.startY);
    this.engagement=Math.max(this.engagement,smooth((pixels-8)/24));
    const distance=Math.hypot(raw.x,raw.y,raw.z);
    const lift=smooth(distance/0.18),layDown=smooth((distance-0.75)/0.7);
    const grip=this.engagement;
    this.offset.x=raw.x*(1+0.3*grip);
    this.offset.z=raw.z*(1+0.3*grip);
    this.offset.y=raw.y*(1-0.25*grip)+0.38*lift*(1-layDown)*grip;
    // Returning the flap naturally restores the palm press without a mode key.
    this.pressure=1-grip*lift*(0.92-0.58*layDown);
    return this.offset;
  }
}

/** A palm keeps pressing during a sideways stroke. Lifting peels a fold free. */
export function kneadingPressure(offset:Point, normal:Point) {
  const outward=offset.x*normal.x+offset.y*normal.y+offset.z*normal.z;
  return 0.16+1.02/(1+0.18*Math.exp(Math.min(30,outward/0.23)));
}

/** Material coordinates keep flour attached to the dough as it stretches.
 * Only deformation under a hand does work; idle time and free recovery do not.
 */
export class KneadingMemory {
  readonly worked:Float64Array;
  revision=0;
  motion=0;

  constructor(count:number,private readonly rate:number) { this.worked=new Float64Array(count); }

  reset() { this.worked.fill(0);this.motion=0;this.revision++; }

  step(actual:Float64Array,previous:Float64Array,weights:Float64Array,
    compressionDelta:number,twistDelta:number,dt:number) {
    if(!Number.isFinite(dt) || dt<=0 || dt>0.05)return;
    let movement=0,changed=false;
    for(let i=0;i<this.worked.length;i++) {
      const weight=Math.min(1,weights[i]);
      if(weight<0.04)continue;
      const j=i*3;
      const travel=Math.hypot(actual[j]-previous[j],actual[j+1]-previous[j+1],actual[j+2]-previous[j+2]);
      // Ignore numerical settling. Common squash and twist happen outside the cage.
      const distance=Math.max(0,travel+Math.abs(compressionDelta)*0.7+Math.abs(twistDelta)*0.35-dt*0.008)*weight;
      if(distance<=0)continue;
      movement=Math.max(movement,distance/dt);
      const before=this.worked[i];
      this.worked[i]=Math.min(10,before+distance*this.rate);
      changed ||= this.worked[i]!==before;
    }
    this.motion=movement;
    if(changed)this.revision++;
  }

  blend(binding:Binding) {
    let work=0;
    for(let i=0;i<binding.ids.length;i++)work+=this.worked[binding.ids[i]]*binding.weights[i];
    return 1-Math.exp(-work);
  }

  diagnostics() {
    let sum=0,maximum=0;
    for(const work of this.worked) {const mixed=1-Math.exp(-work);sum+=mixed;maximum=Math.max(maximum,mixed);}
    return {mixed:sum/this.worked.length,mostWorked:maximum,motion:this.motion};
  }
}
