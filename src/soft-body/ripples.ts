import { FLOOR, type Point } from './physics';

type Ripple = { origin:Point; age:number; strength:number };

/** Small, fading surface waves supplement the cage's broader squash and stretch. */
export class SurfaceRipples {
  private waves:Ripple[]=[];
  get active(){return this.waves.length>0;}
  add(origin:Point,strength=1){
    this.waves.push({origin:{...origin},age:0,strength:Math.min(1,Math.max(0,strength))});
    if(this.waves.length>4)this.waves.shift();
  }
  clear(){this.waves.length=0;}
  advance(dt:number){
    for(const wave of this.waves)wave.age+=dt;
    this.waves=this.waves.filter(wave=>wave.age<1.6);
  }
  apply(rest:Float32Array,normals:Float32Array,output:Float32Array){
    if(this.waves.length===0)return;
    for(let i=0;i<rest.length;i+=3){
      let amount=0;
      for(const wave of this.waves){
        const distance=Math.hypot(rest[i]-wave.origin.x,rest[i+1]-wave.origin.y,rest[i+2]-wave.origin.z);
        const phase=distance-wave.age*2.4;
        // Start at zero, then send one soft wave outward. An immediate sine
        // displacement used to make the skin jump as soon as a ripple was added.
        const envelope=(1-Math.exp(-wave.age*24))*Math.exp(-wave.age*3.5);
        amount+=Math.sin(phase*8)*Math.exp(-phase*phase*4)*envelope*wave.strength*0.028;
      }
      amount*=Math.min(1,Math.max(0,(rest[i+1]-FLOOR)/0.35));
      output[i]+=normals[i]*amount;
      output[i+1]=Math.max(FLOOR+0.005,output[i+1]+normals[i+1]*amount);
      output[i+2]+=normals[i+2]*amount;
    }
  }
}
