import type { SoftBodyFeel } from './profiles';

type Cell={ids:number[];volume:number};
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};

/** A bounded evolving reference shape. Learning moves neither the current skin
 * nor its velocity. The solver retains its original cell-volume constraints.
 */
export class PlasticMould {
  readonly positions:Float64Array;
  private candidate:Float64Array;
  private exposure:Float64Array;
  private compressionExposure=0;
  private gradients=new Float64Array(12);
  compression=0;
  private yielding=false;

  constructor(private readonly rest:Float64Array,private readonly cells:readonly Cell[],
    private readonly tuning:NonNullable<SoftBodyFeel['plasticity']>) {
    this.positions=new Float64Array(rest);this.candidate=new Float64Array(rest);
    this.exposure=new Float64Array(rest.length/3);
  }

  reset() {
    this.positions.set(this.rest);this.candidate.set(this.rest);this.exposure.fill(0);
    this.compression=this.compressionExposure=0;this.yielding=false;
  }

  learn(actual:Float64Array,weights:Float64Array,compression:number,verticalPressure:number,dt:number) {
    const {dwell,yield:threshold,rate,maxOffset,maxCompression}=this.tuning;
    this.yielding=false;
    if(!Number.isFinite(dt) || dt<=0 || dt>0.05)return false;
    if(verticalPressure>0.15 && compression-this.compression>0.04) this.compressionExposure=Math.min(dwell+0.6,this.compressionExposure+dt);
    else this.compressionExposure=0;
    const compressionBlend=1-Math.exp(-dt*rate*smooth((this.compressionExposure-dwell)/0.6));
    const compressionDelta=(Math.min(maxCompression,Math.max(0,compression))-this.compression)*compressionBlend;
    this.compression+=compressionDelta;this.yielding=Math.abs(compressionDelta)>1e-7;
    let changed=false;
    for(let i=0;i<this.exposure.length;i++) {
      const j=i*3,dx=actual[j]-this.positions[j],dy=actual[j+1]-this.positions[j+1],dz=actual[j+2]-this.positions[j+2];
      const strain=Math.hypot(dx,dy,dz),weight=Math.min(1,weights[i]);
      this.exposure[i]=weight>0.08 && strain>threshold?Math.min(dwell+0.6,this.exposure[i]+dt):0;
      const maturity=smooth((this.exposure[i]-dwell)/0.6);
      // Preserve an elastic layer even after the material starts flowing.
      const blend=1-Math.exp(-dt*rate*weight*maturity*Math.max(0,1-threshold/Math.max(strain,1e-8)));
      let x=this.positions[j]+dx*blend-this.rest[j];
      let y=this.positions[j+1]+dy*blend-this.rest[j+1];
      let z=this.positions[j+2]+dz*blend-this.rest[j+2];
      const bound=Math.min(1,maxOffset/Math.max(maxOffset,Math.hypot(x,y,z)));
      x*=bound;y*=bound;z*=bound;
      this.candidate[j]=this.rest[j]+x;this.candidate[j+1]=this.rest[j+1]+y;this.candidate[j+2]=this.rest[j+2]+z;
      if(blend>0.000001)changed=true;
    }
    if(!changed)return false;
    this.preserveVolume();
    // Spatially varying creep can compress a cell even when the held cage is
    // healthy. Back off the whole update until every cell remains well formed.
    for(let attempt=0;attempt<5;attempt++) {
      if(this.valid()) {this.positions.set(this.candidate);this.yielding=true;return true;}
      for(let j=0;j<this.candidate.length;j++)this.candidate[j]=(this.candidate[j]+this.positions[j])*0.5;
    }
    return false;
  }

  private preserveVolume() {
    const p=this.candidate,g=this.gradients,floor=this.rest[1];
    // Redistribute the displaced material into neighboring cells instead of
    // accepting a shrinking reference shape or stopping creep at a shallow dent.
    for(let pass=0;pass<5;pass++)for(const cell of this.cells) {
      const a=cell.ids[0]*3,b=cell.ids[1]*3,c=cell.ids[2]*3,d=cell.ids[3]*3;
      const ax=p[b]-p[a],ay=p[b+1]-p[a+1],az=p[b+2]-p[a+2];
      const bx=p[c]-p[a],by=p[c+1]-p[a+1],bz=p[c+2]-p[a+2];
      const cx=p[d]-p[a],cy=p[d+1]-p[a+1],cz=p[d+2]-p[a+2];
      g[3]=(by*cz-bz*cy)/6;g[4]=(bz*cx-bx*cz)/6;g[5]=(bx*cy-by*cx)/6;
      g[6]=(cy*az-cz*ay)/6;g[7]=(cz*ax-cx*az)/6;g[8]=(cx*ay-cy*ax)/6;
      g[9]=(ay*bz-az*by)/6;g[10]=(az*bx-ax*bz)/6;g[11]=(ax*by-ay*bx)/6;
      for(let k=0;k<3;k++)g[k]=-g[k+3]-g[k+6]-g[k+9];
      let denominator=1e-8;
      for(let n=0;n<4;n++)if(this.rest[cell.ids[n]*3+1]>floor)
        denominator+=g[n*3]**2+g[n*3+1]**2+g[n*3+2]**2;
      const correction=(cell.volume-(ax*g[3]+ay*g[4]+az*g[5]))/denominator;
      for(let n=0;n<4;n++)if(this.rest[cell.ids[n]*3+1]>floor)
        for(let k=0;k<3;k++)p[cell.ids[n]*3+k]+=correction*g[n*3+k];
    }
    // One shared bound keeps the field smooth at its maximum learned offset.
    let largest=0;
    for(let j=0;j<p.length;j+=3)largest=Math.max(largest,Math.hypot(p[j]-this.rest[j],p[j+1]-this.rest[j+1],p[j+2]-this.rest[j+2]));
    if(largest>this.tuning.maxOffset)for(let j=0;j<p.length;j++)
      p[j]=this.rest[j]+(p[j]-this.rest[j])*this.tuning.maxOffset/largest;
  }

  private valid() {
    const p=this.candidate;
    for(let j=0;j<p.length;j++)if(!Number.isFinite(p[j]) || j%3===1 && p[j]<this.rest[1])return false;
    for(const cell of this.cells) {
      const a=cell.ids[0]*3,b=cell.ids[1]*3,c=cell.ids[2]*3,d=cell.ids[3]*3;
      const ax=p[b]-p[a],ay=p[b+1]-p[a+1],az=p[b+2]-p[a+2];
      const bx=p[c]-p[a],by=p[c+1]-p[a+1],bz=p[c+2]-p[a+2];
      const cx=p[d]-p[a],cy=p[d+1]-p[a+1],cz=p[d+2]-p[a+2];
      const ratio=(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/(6*cell.volume);
      if(!Number.isFinite(ratio) || ratio<0.84 || ratio>1.16)return false;
    }
    return true;
  }

  diagnostics() {
    let offset=0;
    for(let j=0;j<this.positions.length;j+=3)offset=Math.max(offset,
      Math.hypot(this.positions[j]-this.rest[j],this.positions[j+1]-this.rest[j+1],this.positions[j+2]-this.rest[j+2]));
    return {offset,compression:this.compression,yielding:this.yielding};
  }
}
