import type { Point } from '../soft-body/physics';

const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};

const BEND_LENGTH=0.64,NEUTRAL_HEIGHT=0.64,ARC_STEP=0.025,ARC_SAMPLES=81;

/** A supported base feeds into a curved flap; contact is joined by the volume mesh. */
export class DoughFold {
  readonly original:Float32Array;
  readonly rest:Float32Array;
  readonly positions:Float32Array;
  readonly mixed:Float32Array;
  private weights:Float32Array;
  private relaxation:Float32Array;
  private readonly neighbors:Float32Array;
  private readonly cohesion:Float32Array;
  private readonly arcX=new Float32Array(ARC_SAMPLES);
  private readonly arcY=new Float32Array(ARC_SAMPLES);
  private owner:number|null=null;
  private direction={x:0,z:1};
  private chooseDirection=false;
  private outward=0;
  private target=0;
  angle=0;
  merge=0;
  folds=0;
  motion=0;
  phase:'idle'|'folding'|'merging'|'returning'='idle';

  constructor() {
    const points:number[]=[];
    for(let y=0.18;y<=1.1;y+=0.18)for(let z=-0.99;z<=1;z+=0.18)for(let x=-1.08;x<=1.1;x+=0.18) {
      if((x/1.06)**2+((y-0.61)/0.5)**2+(z/0.91)**2>1)continue;
      points.push(x+0.035*y,y,z);
    }
    this.original=new Float32Array(points);this.rest=new Float32Array(points);this.positions=new Float32Array(points);
    this.weights=new Float32Array(points.length/3);this.mixed=new Float32Array(this.weights.length);this.relaxation=new Float32Array(points.length);
    this.neighbors=new Float32Array(this.weights.length);this.cohesion=new Float32Array(points.length);
  }

  get active(){return this.phase!=='idle';}
  controls(id:number){return this.owner===id && this.active;}

  begin(id:number,point:Point) {
    if(this.owner!==null || this.active)return;
    this.owner=id;this.outward=0;
    const radius=Math.hypot(point.x,point.z);
    this.chooseDirection=radius<0.5;
    if(!this.chooseDirection)this.direction={x:point.x/radius,z:point.z/radius};
  }

  move(id:number,offset:Point) {
    if(this.owner!==id || this.phase==='merging')return;
    if(Math.hypot(offset.x,offset.y,offset.z)<0.065)return;
    if(this.chooseDirection) {
      const length=Math.hypot(offset.x,offset.z);
      if(length<0.035)return;
      this.direction={x:-offset.x/length,z:-offset.z/length};this.chooseDirection=false;
    }
    let along=offset.x*this.direction.x+offset.z*this.direction.z;
    const planar=Math.hypot(offset.x,offset.z);
    if(this.phase==='idle' && this.outward===0 && planar>0.05 && Math.abs(along)<planar*0.65) {
      this.direction={x:-offset.x/planar,z:-offset.z/planar};along=-planar;
    }
    this.outward=Math.max(this.outward,along);
    const inward=this.outward-along;
    if(inward<0.055 && this.phase==='idle')return;
    if(this.phase==='idle') {
      this.phase='folding';
      this.relaxation.fill(0);
      for(let i=0;i<this.weights.length;i++) {
        const q=this.rest[i*3]*this.direction.x+this.rest[i*3+2]*this.direction.z;
        this.weights[i]=smooth(q/BEND_LENGTH);
      }
    }
    // A normal drag across half the mound rolls the entire flap over.
    this.target=Math.max(this.target,Math.min(Math.PI,inward/0.82*Math.PI));
  }

  release(id:number,complete=true) {
    if(this.owner!==id)return;
    this.owner=null;
    if(!this.active)return;
    if(this.phase==='merging')return;
    if(complete && (this.angle>0.28 || this.target>0.65))this.target=Math.PI;
    else {this.target=0;this.phase='returning';}
  }

  cancel(){if(this.owner!==null)this.release(this.owner,false);}

  step(dt:number) {
    if(!Number.isFinite(dt) || dt<=0 || dt>0.05)return;
    if(!this.active){this.positions.set(this.rest);this.motion=0;return;}
    const previousAngle=this.angle,previousMerge=this.merge;
    const delta=this.target-this.angle;
    this.angle+=Math.sign(delta)*Math.min(Math.abs(delta),dt*2.9);
    if(this.phase==='folding' && this.angle>Math.PI-0.025) {this.angle=Math.PI;this.phase='merging';}
    if(this.phase==='merging')this.merge=Math.min(1,this.merge+dt/1.5);
    this.motion=Math.abs(this.angle-previousAngle)/dt*0.35+(this.merge-previousMerge)/dt*0.12;
    const join=smooth(this.merge),dx=this.direction.x,dz=this.direction.z;
    // Integrate the bend's center line. Rotating each slice about the same hinge
    // pulls the underside below the table and bunches it into separate feet.
    for(let i=1;i<ARC_SAMPLES;i++) {
      const angle=this.angle*smooth((i-0.5)*ARC_STEP/BEND_LENGTH);
      this.arcX[i]=this.arcX[i-1]+Math.cos(angle)*ARC_STEP;
      this.arcY[i]=this.arcY[i-1]+Math.sin(angle)*ARC_STEP;
    }
    for(let i=0;i<this.weights.length;i++) {
      const j=i*3,w=this.weights[i],x=this.rest[j],y=this.rest[j+1],z=this.rest[j+2];
      const q=x*dx+z*dz,side=z*dx-x*dz;
      const angle=this.angle*w,cos=Math.cos(angle),sin=Math.sin(angle);
      const sample=Math.max(0,Math.min(ARC_SAMPLES-1.001,q/ARC_STEP)),index=Math.floor(sample),t=sample-index;
      const centerX=q<=0?q:this.arcX[index]*(1-t)+this.arcX[index+1]*t;
      const centerY=this.arcY[index]*(1-t)+this.arcY[index+1]*t;
      const turned=centerX-(y-NEUTRAL_HEIGHT)*sin;
      // Keep a small clearance while the flap turns, before it makes contact.
      const rise=NEUTRAL_HEIGHT+centerY+(y-NEUTRAL_HEIGHT)*cos+0.12*Math.sin(this.angle)*w;
      const spread=1+0.09*join*w;
      this.positions[j]=(turned*dx-side*dz)*spread+this.relaxation[j];
      this.positions[j+1]=Math.max(0.17,rise-0.2*join*w+this.relaxation[j+1]);
      this.positions[j+2]=(turned*dz+side*dx)*spread+this.relaxation[j+2];
    }
    if(this.phase==='merging')this.redistribute(dt);
    if(this.phase==='returning' && this.angle===0) {this.positions.set(this.rest);this.phase='idle';}
    if(this.merge===1) {
      // Bake the united parcel positions. Releasing cannot unfold the old shape.
      this.rest.set(this.positions);
      for(let i=0;i<this.mixed.length;i++)this.mixed[i]=Math.min(1,this.mixed[i]+this.weights[i]*0.22);
      this.folds++;this.angle=this.target=this.merge=0;this.phase='idle';this.owner=null;
    }
  }

  private redistribute(dt:number) {
    const p=this.positions,gain=(1-Math.exp(-dt*20))*0.5,spacing=0.165;
    this.cohesion.fill(0);this.neighbors.fill(0);
    // Surface tension draws exposed parcels into their neighborhood. Repulsion
    // alone left isolated bulges that were baked into every subsequent fold.
    const reach=0.42,settle=1-Math.exp(-dt*2);
    for(let i=0;i<p.length;i+=3)for(let j=i+3;j<p.length;j+=3) {
      const x=p[j]-p[i],y=p[j+1]-p[i+1],z=p[j+2]-p[i+2],distance2=x*x+y*y+z*z;
      if(distance2>=reach*reach)continue;
      const weight=(1-distance2/(reach*reach))**2;
      this.neighbors[i/3]+=weight;this.neighbors[j/3]+=weight;
      this.cohesion[i]+=x*weight;this.cohesion[i+1]+=y*weight;this.cohesion[i+2]+=z*weight;
      this.cohesion[j]-=x*weight;this.cohesion[j+1]-=y*weight;this.cohesion[j+2]-=z*weight;
    }
    for(let i=0;i<p.length;i+=3) {
      const amount=settle/Math.max(1,this.neighbors[i/3]);
      for(let axis=0;axis<3;axis++) {
        const offset=this.cohesion[i+axis]*amount;
        p[i+axis]+=offset;this.relaxation[i+axis]+=offset;
      }
    }
    for(let i=0;i<p.length;i+=3)for(let j=i+3;j<p.length;j+=3) {
      let x=p[j]-p[i],y=p[j+1]-p[i+1],z=p[j+2]-p[i+2],distance=Math.hypot(x,y,z);
      if(distance>=spacing)continue;
      const overlap=spacing-distance;
      if(distance<1e-5){x=this.original[j]-this.original[i];y=this.original[j+1]-this.original[i+1];z=this.original[j+2]-this.original[i+2];distance=Math.hypot(x,y,z);}
      const scale=overlap/Math.max(1e-5,distance)*gain;
      const ax=x*scale,ay=y*scale,az=z*scale;
      p[i]-=ax;p[i+1]-=ay;p[i+2]-=az;p[j]+=ax;p[j+1]+=ay;p[j+2]+=az;
      this.relaxation[i]-=ax;this.relaxation[i+1]-=ay;this.relaxation[i+2]-=az;
      this.relaxation[j]+=ax;this.relaxation[j+1]+=ay;this.relaxation[j+2]+=az;
    }
    let cx=0,cz=0;const count=p.length/3;
    for(let j=0;j<p.length;j+=3){cx+=p[j]/count;cz+=p[j+2]/count;}
    for(let j=0;j<p.length;j+=3) {
      const x=p[j]-cx*dt*2,z=p[j+2]-cz*dt*2;
      const radius=Math.hypot(x,z),bound=radius>0.95?(0.95+0.2*Math.tanh((radius-0.95)/0.2))/radius:1;
      const px=x*bound,pz=z*bound,py=0.17+Math.max(0,p[j+1]-0.17)*Math.exp(-dt*0.35);
      this.relaxation[j]+=px-p[j];this.relaxation[j+1]+=py-p[j+1];this.relaxation[j+2]+=pz-p[j+2];
      p[j]=px;p[j+1]=py;p[j+2]=pz;
    }
  }

  reset(){this.rest.set(this.original);this.positions.set(this.original);this.mixed.fill(0);this.weights.fill(0);this.relaxation.fill(0);
    this.owner=null;this.angle=this.target=this.merge=this.folds=this.motion=0;this.phase='idle';}

  diagnostics(){return {phase:this.phase,angle:this.angle,merge:this.merge,folds:this.folds,parcels:this.mixed.length};}
}
