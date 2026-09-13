import { Box3, BufferAttribute, Color, DynamicDrawUsage, Sphere, type MeshPhysicalNodeMaterial } from 'three/webgpu';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { DoughFold } from './fold';
import type { SoftBodyPhysics, Binding } from '../soft-body/physics';
import { finishDoughMaterial } from '../soft-body/dough-surface';

const SIZE=48,XZ=2.45,Y=1.7,CENTER=1.35,SUPPORT=0.46,FLOOR=0.045;
// Blend across more parcels so the stretched underside stays continuous.
// Scale the resting density with kernel volume to retain a thick dough body.
const REST_DENSITY=1.02*(SUPPORT/0.36)**3;
const DENSITY_BINS=1024,DENSITY_SCALE=128,BIN_SCALE=(DENSITY_BINS-1)/Math.log1p(32*DENSITY_SCALE);
const contain=(value:number)=>Math.abs(value)<=1.65?value:Math.sign(value)*(1.65+0.34*Math.tanh((Math.abs(value)-1.65)/0.34));

/** A single isosurface allows overhangs, then joins contacting layers. */
export class DoughVolume {
  readonly fold=new DoughFold();
  private readonly cubes:MarchingCubes;
  readonly geometry;
  private readonly bindings:Binding[];
  private readonly deformed:Float32Array;
  private targetCells=0;
  private lastFold=0;
  private readonly flour=new Color('#fbfaf4');
  private readonly dough=new Color('#e4e0d5');
  private readonly color=new Color();
  private readonly histogram=new Uint32Array(DENSITY_BINS);
  private readonly sourceColors:Float32Array;

  constructor(private readonly physics:SoftBodyPhysics,material:MeshPhysicalNodeMaterial) {
    this.cubes=new MarchingCubes(SIZE,material,false,true,24000);
    this.geometry=this.cubes.geometry;
    this.geometry.boundingBox=new Box3();this.geometry.boundingSphere=new Sphere();
    const count=this.geometry.getAttribute('position').count;
    this.geometry.setAttribute('doughRest',new BufferAttribute(new Float32Array(count*3),3).setUsage(DynamicDrawUsage));
    finishDoughMaterial(this.geometry,material,false);
    this.bindings=Array.from({length:this.fold.mixed.length},(_,i)=>this.physics.bind(this.fold.rest[i*3],this.fold.rest[i*3+1],this.fold.rest[i*3+2]));
    this.deformed=new Float32Array(this.fold.rest.length);this.sourceColors=new Float32Array(this.fold.rest.length);
    for(let i=0;i<this.fold.mixed.length;i++) {
      const j=i*3,x=this.fold.original[j],y=this.fold.original[j+1],z=this.fold.original[j+2];
      const dust=Math.sin(x*8.3+z*4.1)*Math.sin(z*7.6-y*3.8)+0.5*Math.sin(y*11.2+x*5.7);
      this.color.copy(this.dough).lerp(this.flour,Math.max(0,Math.min(1,dust*0.6+0.38))).toArray(this.sourceColors,j);
    }
    this.update(0);
  }

  update(dt:number) {
    if(dt>0)this.fold.step(dt);
    if(this.lastFold!==this.fold.folds) {
      this.lastFold=this.fold.folds;
      for(let i=0;i<this.bindings.length;i++)this.bindings[i]=this.physics.bind(this.fold.rest[i*3],this.fold.rest[i*3+1],this.fold.rest[i*3+2]);
    }
    this.physics.deform(this.fold.positions,this.deformed,this.bindings);
    const c=this.cubes;c.reset();
    const field=c.field,palette=c.palette;
    const stepX=2*XZ/SIZE,stepY=2*Y/SIZE,r2=SUPPORT*SUPPORT;
    for(let i=0;i<this.fold.mixed.length;i++) {
      const j=i*3,px=contain(this.deformed[j]),py=Math.min(2.45,this.deformed[j+1]),pz=contain(this.deformed[j+2]);
      const minX=Math.max(1,Math.floor((px-SUPPORT+XZ)/stepX)),maxX=Math.min(SIZE-2,Math.ceil((px+SUPPORT+XZ)/stepX));
      const minY=Math.max(1,Math.floor((py-SUPPORT-CENTER+Y)/stepY)),maxY=Math.min(SIZE-2,Math.ceil((py+SUPPORT-CENTER+Y)/stepY));
      const minZ=Math.max(1,Math.floor((pz-SUPPORT+XZ)/stepX)),maxZ=Math.min(SIZE-2,Math.ceil((pz+SUPPORT+XZ)/stepX));
      const mixed=Math.min(1,this.fold.mixed[i]+(this.physics.kneading?.blend(this.bindings[i])??0));
      const red=this.sourceColors[j]+(this.dough.r-this.sourceColors[j])*mixed;
      const green=this.sourceColors[j+1]+(this.dough.g-this.sourceColors[j+1])*mixed;
      const blue=this.sourceColors[j+2]+(this.dough.b-this.sourceColors[j+2])*mixed;
      for(let z=minZ;z<=maxZ;z++)for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
        const distance=((x*stepX-XZ-px)**2+(y*stepY+ CENTER-Y-py)**2+(z*stepX-XZ-pz)**2)/r2;
        if(distance>=1)continue;
        const value=(1-distance)**3,index=(z*SIZE+y)*SIZE+x;
        field[index]+=value;palette[index*3]+=red*value;palette[index*3+1]+=green*value;palette[index*3+2]+=blue*value;
      }
    }
    this.histogram.fill(0);
    for(let i=0;i<field.length;i++) {
      if(field[i]>0) {
        for(let k=0;k<3;k++)palette[i*3+k]/=field[i];
        if((Math.floor(i/SIZE)%SIZE)*stepY+CENTER-Y>=FLOOR)this.histogram[Math.min(DENSITY_BINS-1,Math.floor(Math.log1p(field[i]*DENSITY_SCALE)*BIN_SCALE))]++;
      } else {
        // Surface vertices interpolate across filled and empty grid cells.
        // Empty cells must carry dough color, not black, even at low density.
        palette[i*3]=this.dough.r;palette[i*3+1]=this.dough.g;palette[i*3+2]=this.dough.b;
      }
    }
    if(!this.targetCells){for(let i=0;i<field.length;i++)if(field[i]>REST_DENSITY && (Math.floor(i/SIZE)%SIZE)*stepY+CENTER-Y>=FLOOR)this.targetCells++;}
    let cells=0,bin=DENSITY_BINS-1;
    for(;bin>0;bin--){cells+=this.histogram[bin];if(cells>=this.targetCells)break;}
    // Preserve material volume when the flap occupies the same space as the base.
    // Logarithmic bins also resolve the thin boundary of tightly packed folds.
    c.isolation=Math.max(0.00001,Math.expm1((bin+(cells-this.targetCells)/Math.max(1,this.histogram[bin]))/BIN_SCALE)/DENSITY_SCALE);
    // Intersect the density with the work surface before meshing. A smooth rim
    // gives the underside a flat contact patch with consistent surface normals.
    for(let y=1;y<SIZE-1;y++) {
      const plane=c.isolation+(y*stepY+CENTER-Y-FLOOR)*12;
      if(plane>8)break;
      for(let z=1;z<SIZE-1;z++)for(let x=1;x<SIZE-1;x++) {
        const i=(z*SIZE+y)*SIZE+x,h=Math.max(0,0.4-Math.abs(field[i]-plane))/0.4;
        field[i]=Math.min(field[i],plane)-h*h*0.1;
      }
    }
    c.update();
    const p=c.positionArray,n=c.normalArray,rest=this.geometry.getAttribute('doughRest') as BufferAttribute;
    const box=this.geometry.boundingBox!;box.makeEmpty();
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(let i=0;i<c.count*3;i+=3) {
      p[i]*=XZ;p[i+1]=p[i+1]*Y+CENTER;p[i+2]*=XZ;
      n[i]/=XZ;n[i+1]/=Y;n[i+2]/=XZ;
      const len=Math.hypot(n[i],n[i+1],n[i+2])||1;for(let k=0;k<3;k++)n[i+k]/=len;
      rest.setXYZ(i/3,p[i],p[i+1],p[i+2]);
      minX=Math.min(minX,p[i]);minY=Math.min(minY,p[i+1]);minZ=Math.min(minZ,p[i+2]);
      maxX=Math.max(maxX,p[i]);maxY=Math.max(maxY,p[i+1]);maxZ=Math.max(maxZ,p[i+2]);
    }
    box.min.set(minX,minY,minZ);box.max.set(maxX,maxY,maxZ);box.getBoundingSphere(this.geometry.boundingSphere!);rest.needsUpdate=true;
  }

  reset(){this.fold.reset();this.lastFold=0;
    for(let i=0;i<this.bindings.length;i++)this.bindings[i]=this.physics.bind(this.fold.rest[i*3],this.fold.rest[i*3+1],this.fold.rest[i*3+2]);this.update(0);}
}
