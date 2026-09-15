// A small volumetric cage drives the render mesh. XPBD volume constraints keep
// a pressed region plump while elastic rest forces bring it back to its mould.
import { jellyProfile, type SoftBodyFeel } from './profiles';
import { pressureFrame, undoDeformation, twistWeight } from './pressure';
import { PlasticMould } from './plasticity';
import { KneadingMemory } from './kneading';
export const FLOOR = 0.04;
const CELLS = 4;
const SIDE = CELLS + 1;
const COUNT = SIDE ** 3;
const MIN = [-1.4, FLOOR, -1.4];
const SIZE = [2.8, 2.0, 2.8];
export const STEP = 1 / 120;
export const MAX_CONTACTS = 5;

export type Point = { x: number; y: number; z: number };
export type StrainSample = { strain:number; point:Point; direction:Point };
type Edge = { a: number; b: number; length: number; lambda: number };
type Tet = { ids: number[]; volume: number; lambda: number };
export type Binding = { ids: number[]; weights: number[] };
type Grab = { weights: Float64Array; target: Point; rawTarget:Point; consumedTarget:Point; filtered: Point;
  anchor: Point; localAnchor: Point; restAnchor:Point; normal: Point; verticalLoad: number; manualTwist:number;
  contact:Binding; contactStart:Point; contactRest:Point; contactLambda:Float64Array; start:Float64Array;
  age:number; pressure:number; dentDepth:number; pulling:number; folding:number };
const index = (x: number, y: number, z: number) => (y * SIDE + z) * SIDE + x;

export class SoftBodyPhysics {
  readonly rest = new Float64Array(COUNT * 3);
  readonly positions = new Float64Array(COUNT * 3);
  readonly velocities = new Float64Array(COUNT * 3);
  private previous = new Float64Array(COUNT * 3);
  private invMass = new Float64Array(COUNT);
  private edges: Edge[] = [];
  private tets: Tet[] = [];
  private gradients = new Float64Array(12);
  private renderOffsets = new Float64Array(COUNT * 3);
  private grabs = new Map<number, Grab>();
  private strainContacts:Grab[]=[];
  private lastStrainedContact:Grab|null=null;
  private readonly strainPoint:Point={x:0,y:0,z:0};
  private contactForces = new Float64Array(COUNT * 3);
  private contactWeights = new Float64Array(COUNT);
  private plastic:PlasticMould|null=null;
  readonly kneading:KneadingMemory|null;
  reducedMotion = false;
  private compression = 0;
  private previousCompression = 0;
  private compressionVelocity = 0;
  private twist = 0;
  private previousTwist = 0;
  private twistVelocity = 0;
  private dentDepth = 0;
  private pullRelaxation = 0;
  private flickCount=0;
  private lastFlick:{x:number;y:number;z:number;id:number}|null=null;
  get compressionAmount() { return this.compression; }
  get twistAmount() { return this.twist; }

  /** Measured shape strain and its local origin; reuses the caller's storage. */
  measureStrain(output:StrainSample):StrainSample {
    let edgeSquared=0;
    for(let i=0;i<this.edges.length;i++) {
      const edge=this.edges[i],a=edge.a*3,b=edge.b*3;
      const length=Math.hypot(this.positions[a]-this.positions[b],this.positions[a+1]-this.positions[b+1],this.positions[a+2]-this.positions[b+2]);
      // A single highly stretched cage edge must not outweigh the visible skin.
      const distortion=Math.min(1,Math.abs(length/edge.length-1));
      edgeSquared+=distortion*distortion;
    }
    let strain=Math.max(Math.max(0,this.compression)/0.5,Math.abs(this.twist)/0.62,
      Math.sqrt(edgeSquared/this.edges.length)/0.32);
    let dominant=-1;
    const contacts=this.strainContacts;
    const count=contacts.length || (this.lastStrainedContact?1:0);
    for(let i=0;i<count;i++) {
      const g=contacts.length?contacts[i]:this.lastStrainedContact!;
      let dx=0,dy=0,dz=0;
      for(let b=0;b<g.contact.ids.length;b++) {
        const j=g.contact.ids[b]*3,w=g.contact.weights[b];
        dx+=(this.positions[j]-this.rest[j])*w;
        dy+=(this.positions[j+1]-this.rest[j+1])*w;
        dz+=(this.positions[j+2]-this.rest[j+2])*w;
      }
      strain=Math.max(strain,Math.hypot(dx,dy,dz)/0.52);
      const x=g.restAnchor.x+dx,y=g.restAnchor.y+dy,z=g.restAnchor.z+dz;
      // This is the same volume-preserving pressure/twist map used by deform(),
      // expressed directly here to avoid temporary frame and point objects.
      const height=y-FLOOR,frequency=Math.PI;
      const width=(1-this.compression+0.16*this.compression*Math.cos(height*frequency))**(-0.5*(this.feel.foam?.lateralExpansion ?? 1));
      const angle=this.twist*twistWeight(y),cos=Math.cos(angle),sin=Math.sin(angle);
      const point=this.strainPoint;
      point.x=(x*cos+z*sin)*width;
      point.y=Math.max(FLOOR+0.005,FLOOR+(1-this.compression)*height+0.16*this.compression/frequency*Math.sin(height*frequency));
      point.z=(z*cos-x*sin)*width;
      const sx=point.x-g.restAnchor.x,sy=point.y-g.restAnchor.y,sz=point.z-g.restAnchor.z;
      const displacement=Math.hypot(sx,sy,sz);
      if(displacement>dominant) {
        dominant=displacement;
        output.point.x=point.x;output.point.y=point.y;output.point.z=point.z;
        const inverse=1/Math.max(displacement,0.000001);
        output.direction.x=displacement>0.000001?sx*inverse:-g.normal.x;
        output.direction.y=displacement>0.000001?sy*inverse:-g.normal.y;
        output.direction.z=displacement>0.000001?sz*inverse:-g.normal.z;
        this.lastStrainedContact=g;
      }
    }
    if(!count) {
      output.point.x=0;output.point.y=FLOOR+1;output.point.z=0;
      output.direction.x=0;output.direction.y=-1;output.direction.z=0;
    }
    output.strain=Number.isFinite(strain)?Math.max(0,Math.min(1,strain)):0;
    return output;
  }

  /** Cheap render-activity check; no volume calculations or allocations. */
  isAtRest() {
    if (this.grabs.size || Math.abs(this.compression-(this.plastic?.compression ?? 0)) > 0.00015 || Math.abs(this.compressionVelocity) > 0.001 ||
      Math.abs(this.twist) > 0.0003 || Math.abs(this.twistVelocity) > 0.001) return false;
    for (let i = 0; i < this.positions.length; i++) {
      if ((!this.plastic && Math.abs(this.positions[i] - this.rest[i]) > 0.0005) || Math.abs(this.velocities[i]) > 0.002) return false;
    }
    return true;
  }

  toMaterialPoint(point:Point) { return undoDeformation(point,this.compression,this.twist,this.feel.foam?.lateralExpansion); }

  constructor(readonly feel: SoftBodyFeel = jellyProfile.feel) {
    this.kneading=feel.kneading?new KneadingMemory(COUNT,feel.kneading.workRate):null;
    for (let y = 0; y < SIDE; y++) for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) {
      const i = index(x, y, z);
      this.rest.set([MIN[0] + x / CELLS * SIZE[0], MIN[1] + y / CELLS * SIZE[1], MIN[2] + z / CELLS * SIZE[2]], i * 3);
      this.invMass[i] = y === 0 ? 0 : 1;
    }
    const pairs = new Set<string>();
    const addTet = (ids: number[]) => {
      this.tets.push({ ids, volume: this.volume(this.rest, ids), lambda: 0 });
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
        const lo = Math.min(ids[a], ids[b]);
        const hi = Math.max(ids[a], ids[b]);
        const key = `${lo},${hi}`;
        if (pairs.has(key)) continue;
        pairs.add(key);
        this.edges.push({ a: lo, b: hi, length: Math.hypot(...[0, 1, 2].map(k => this.rest[lo * 3 + k] - this.rest[hi * 3 + k])), lambda: 0 });
      }
    };
    for (let y = 0; y < CELLS; y++) for (let z = 0; z < CELLS; z++) for (let x = 0; x < CELLS; x++) {
      const v = [index(x,y,z), index(x+1,y,z), index(x,y+1,z), index(x+1,y+1,z), index(x,y,z+1), index(x+1,y,z+1), index(x,y+1,z+1), index(x+1,y+1,z+1)];
      // Consistent body diagonal prevents cracks between neighboring cells.
      [[0,1,3,7], [0,3,2,7], [0,2,6,7], [0,6,4,7], [0,4,5,7], [0,5,1,7]].forEach(t => addTet(t.map(i => v[i])));
    }
    if(feel.plasticity)this.plastic=new PlasticMould(this.rest,this.tets,feel.plasticity);
    this.reset();
  }

  private volume(p: Float64Array, ids: number[]) {
    const a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,d=ids[3]*3;
    const ax = p[b]-p[a], ay = p[b+1]-p[a+1], az = p[b+2]-p[a+2];
    const bx = p[c]-p[a], by = p[c+1]-p[a+1], bz = p[c+2]-p[a+2];
    const cx = p[d]-p[a], cy = p[d+1]-p[a+1], cz = p[d+2]-p[a+2];
    return (ax*(by*cz-bz*cy) + ay*(bz*cx-bx*cz) + az*(bx*cy-by*cx)) / 6;
  }

  bind(x: number, y: number, z: number): Binding {
    const c = [x,y,z].map((v,k) => Math.max(0, Math.min(CELLS - 1e-6, (v-MIN[k])/SIZE[k]*CELLS)));
    const b = c.map(Math.floor);
    const t = c.map((v,k) => v-b[k]);
    // Cubic B-splines have continuous curvature and nonnegative weights. The
    // skin cannot overshoot the cage into the sharp ridges of an interpolant.
    const cubic=(v:number)=>[(1-v)**3/6,(3*v**3-6*v*v+4)/6,(-3*v**3+3*v*v+3*v+1)/6,v**3/6];
    const w=t.map(cubic), combined=new Map<number,number>();
    // Blend the contact patch into the fixed bottom row with continuous
    // curvature; ordinary cardinal weights lift it with the first free row.
    const h=Math.max(0,Math.min(1,(y-FLOOR)/0.4));
    const free=h*h*h*(h*(h*6-15)+10);
    for(let iy=0;iy<4;iy++)for(let iz=0;iz<4;iz++)for(let ix=0;ix<4;ix++){
      const id=index(Math.max(0,Math.min(CELLS,b[0]+ix-1)),Math.max(0,Math.min(CELLS,b[1]+iy-1)),Math.max(0,Math.min(CELLS,b[2]+iz-1)));
      combined.set(id,(combined.get(id)??0)+w[0][ix]*w[1][iy]*w[2][iz]*free);
    }
    if(free<1)for(let iz=0;iz<4;iz++)for(let ix=0;ix<4;ix++) {
      const id=index(Math.max(0,Math.min(CELLS,b[0]+ix-1)),0,Math.max(0,Math.min(CELLS,b[2]+iz-1)));
      combined.set(id,(combined.get(id)??0)+w[0][ix]*w[2][iz]*(1-free));
    }
    return { ids:[...combined.keys()], weights:[...combined.values()] };
  }

  deform(rest: Float32Array, output: Float32Array, bindings: Binding[], alpha=1) {
    const compression=this.previousCompression*(1-alpha)+this.compression*alpha;
    const twist=this.previousTwist*(1-alpha)+this.twist*alpha;
    // Interpolate each cage node once, rather than once for every binding.
    for(let j=0;j<this.renderOffsets.length;j++)
      this.renderOffsets[j]=this.previous[j]*(1-alpha)+this.positions[j]*alpha-this.rest[j];
    for (let v = 0; v < bindings.length; v++) {
      const { ids, weights } = bindings[v];
      let x=0,y=0,z=0;
      for (let b=0;b<ids.length;b++) {
        const j=ids[b]*3, weight=weights[b];
        x+=this.renderOffsets[j]*weight;
        y+=this.renderOffsets[j+1]*weight;
        z+=this.renderOffsets[j+2]*weight;
      }
      const pressure=pressureFrame(rest[v*3+1]+y,compression,this.feel.foam?.lateralExpansion);
      const angle=twist*twistWeight(rest[v*3+1]+y),cos=Math.cos(angle),sin=Math.sin(angle);
      const px=rest[v*3]+x,pz=rest[v*3+2]+z;
      output[v*3]=(px*cos+pz*sin)*pressure.width;
      output[v*3+2]=(pz*cos-px*sin)*pressure.width;
      output[v*3+1]=Math.max(FLOOR+0.005,pressure.y);
    }
  }

  beginGrab(point: Point, surfaceNormal:Point={x:0,y:1,z:0}, id=0) {
    // A new finger must never replace another contact or restart its creep.
    if(this.grabs.has(id) || this.grabs.size>=MAX_CONTACTS) return false;
    if(this.isAtRest()) this.pullRelaxation=0;
    const local=this.toMaterialPoint(point);
    // Recover the skin binding at the touched patch, including an existing dent.
    // Constraining this weighted point lets the visible skin follow a pull even
    // when the smoother cage interpolation would otherwise dilute its motion.
    const restPoint={...local};
    for(let iteration=0;iteration<6;iteration++) {
      const binding=this.bind(restPoint.x,restPoint.y,restPoint.z);
      let x=0,y=0,z=0;
      for(let b=0;b<binding.ids.length;b++) {
        const j=binding.ids[b]*3,w=binding.weights[b];
        x+=(this.positions[j]-this.rest[j])*w;
        y+=(this.positions[j+1]-this.rest[j+1])*w;
        z+=(this.positions[j+2]-this.rest[j+2])*w;
      }
      restPoint.x=local.x-x;restPoint.y=local.y-y;restPoint.z=local.z-z;
    }
    const contact=this.bind(restPoint.x,restPoint.y,restPoint.z),contactStart={x:0,y:0,z:0},contactRest={x:0,y:0,z:0};
    for(let b=0;b<contact.ids.length;b++) {
      const j=contact.ids[b]*3,w=contact.weights[b];
      contactStart.x+=this.positions[j]*w;contactStart.y+=this.positions[j+1]*w;contactStart.z+=this.positions[j+2]*w;
      contactRest.x+=this.rest[j]*w;contactRest.y+=this.rest[j+1]*w;contactRest.z+=this.rest[j+2]*w;
    }
    const length=Math.hypot(surfaceNormal.x,surfaceNormal.y,surfaceNormal.z);
    const normal=length>0.001?{x:surfaceNormal.x/length,y:surfaceNormal.y/length,z:surfaceNormal.z/length}:{x:0,y:1,z:0};
    const verticalLoad=Math.max(0,normal.y)**2;
    const weights = new Float64Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const d2 = (this.positions[i*3]-local.x)**2 + (this.positions[i*3+1]-local.y)**2 + (this.positions[i*3+2]-local.z)**2;
      const height = (this.rest[i*3+1]-FLOOR)/SIZE[1];
      weights[i] = Math.exp(-d2 / 0.52) * Math.min(1, height*3.5);
    }
    const grab:Grab={ weights, target: { x: 0, y: 0, z: 0 }, rawTarget:{x:0,y:0,z:0}, consumedTarget:{x:0,y:0,z:0}, filtered: { x: 0, y: 0, z: 0 },
      anchor:{...point}, localAnchor:local, restAnchor:restPoint, normal, verticalLoad, manualTwist:0,
      contact,contactStart,contactRest,contactLambda:new Float64Array(3),
      start:new Float64Array(this.positions), age:0, pressure:1, dentDepth:0, pulling:0, folding:0 };
    this.grabs.set(id,grab);this.strainContacts.push(grab);
    // Keep the existing rebound velocity when caught again; reversing it
    // immediately was a visible snap during rapid play.
    this.compressionVelocity = Math.max(-2.5,Math.min(2.5,this.compressionVelocity +
      this.feel.tapKick*verticalLoad*(this.reducedMotion?0.45:1)*(1-Math.max(0,this.compression))));
    return true;
  }

  setPressure(amount: number, id=0) {
    const g=this.grabs.get(id);
    if(!g || !Number.isFinite(amount)) return;
    g.pressure = Math.max(0, Math.min(1.3, amount));
    this.moveGrab(g.rawTarget,id);
  }
  setTwist(amount:number, id=0) {
    const g=this.grabs.get(id);
    if(g) g.manualTwist=Math.max(-0.8,Math.min(0.8,amount));
  }

  setFold(amount:number,id=0) {
    const g=this.grabs.get(id);
    if(!g || !this.feel.kneading || !Number.isFinite(amount))return;
    g.folding=Math.max(0,Math.min(1,amount));
  }

  moveGrab(offset: Point, id=0) {
    const g=this.grabs.get(id);
    if (!g || !Number.isFinite(offset.x) || !Number.isFinite(offset.y) || !Number.isFinite(offset.z)) return;
    const length = Math.hypot(offset.x, offset.y, offset.z);
    // Resistance increases continuously toward the limit instead of hitting
    // a hard stop when a pointer crosses one exact radius.
    const limit=this.feel.pressDragLimit+(this.feel.dragLimit-this.feel.pressDragLimit)*(1-Math.min(1,g.pressure))+0.4*g.folding;
    const scale = limit*Math.tanh(length/limit)/Math.max(length,0.0001);
    g.rawTarget.x=offset.x;g.rawTarget.y=offset.y;g.rawTarget.z=offset.z;
    g.target.x=offset.x*scale;g.target.y=offset.y*scale;g.target.z=offset.z*scale;
  }

  /** An ordinary release preserves only input the fixed solver has not seen.
   * Cancellation drops that input; existing physical momentum is left alone.
   */
  release(id=0, preserveMovement=true) {
    const grab=this.grabs.get(id);
    if(!grab) return;
    if(preserveMovement && !this.feel.kneading && !this.feel.foam) this.finishMovement(grab,id);
    for(let i=0;i<this.strainContacts.length;i++) if(this.strainContacts[i]===grab) {this.strainContacts.splice(i,1);break;}
    this.grabs.delete(id);
    this.dentDepth=0;
    for(const g of this.grabs.values()) this.dentDepth=Math.max(this.dentDepth,g.dentDepth);
  }

  private finishMovement(g:Grab,id:number) {
    const previous=g.consumedTarget,current=g.rawTarget;
    if(Math.hypot(current.x-previous.x,current.y-previous.y,current.z-previous.z)<0.00001) return;
    // Remap both raw samples with the SAME current pressure. Changing pressure
    // without moving a finger must never invent an extra directional impulse.
    const limit=this.feel.pressDragLimit+(this.feel.dragLimit-this.feel.pressDragLimit)*(1-Math.min(1,g.pressure));
    const length=Math.hypot(previous.x,previous.y,previous.z);
    const scale=limit*Math.tanh(length/limit)/Math.max(length,0.0001);
    const from=this.grabOffset(g,{x:previous.x*scale,y:previous.y*scale,z:previous.z*scale});
    const to=this.grabOffset(g,g.target);
    const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
    const distance=Math.hypot(dx,dy,dz);
    if(!Number.isFinite(distance) || distance<0.00001) return;
    // A pull that began and ended between ticks needs the same gradual return
    // of edge resistance as a pull that was already processed by step().
    this.pullRelaxation=Math.max(this.pullRelaxation,this.pullAmount(g,g.target)*Math.min(1,distance/0.15));
    // The target follows at 38/s in step(). Transfer its missing motion at that
    // rate, with a smooth speed ceiling. Positions stay continuous at release.
    const gain=8*Math.tanh(distance*38/8)/distance*(this.reducedMotion?0.25:1);
    const x=dx*gain,y=dy*gain,z=dz*gain;
    for(let i=0;i<COUNT;i++) {
      if(!this.invMass[i]) continue;
      const j=i*3,w=g.weights[i];
      this.velocities[j]+=x*w;this.velocities[j+1]+=y*w;this.velocities[j+2]+=z*w;
      const speed=Math.hypot(this.velocities[j],this.velocities[j+1],this.velocities[j+2]);
      if(speed>10) {
        const bounded=10/speed;
        this.velocities[j]*=bounded;this.velocities[j+1]*=bounded;this.velocities[j+2]*=bounded;
      }
    }
    this.flickCount++;this.lastFlick={x,y,z,id};
  }

  private pullAmount(g:Grab,target:Point) {
    return (1-Math.exp(-((Math.hypot(target.x,target.y,target.z)/0.16)**2)))*(1-Math.min(1,g.pressure))**2;
  }

  /** Shared legal contact offset, for both held motion and its final sample. */
  private grabOffset(g:Grab,target:Point):Point {
    const frame=pressureFrame(g.localAnchor.y,this.compression,this.feel.foam?.lateralExpansion);
    const desired=this.toMaterialPoint({x:g.anchor.x+target.x-g.normal.x*g.dentDepth,
      y:Math.max(FLOOR+0.005,frame.y+target.y-g.normal.y*g.dentDepth),
      z:g.anchor.z+target.z-g.normal.z*g.dentDepth});
    const offset={x:desired.x-g.localAnchor.x,y:desired.y-g.localAnchor.y,z:desired.z-g.localAnchor.z};
    if(offset.y>0.66) {
      const resisted=0.66+0.16*Math.tanh((offset.y-0.66)/0.16);
      offset.y+=(resisted-offset.y)*this.pullAmount(g,target);
    }
    const strain=Math.hypot(offset.x,offset.y,offset.z),range=1.15+0.65*(1-Math.min(1,g.pressure));
    const limit=Math.min(1,range/Math.max(strain,0.0001));
    offset.x*=limit;offset.y*=limit;offset.z*=limit;
    return offset;
  }

  releaseAll() { this.grabs.clear(); this.strainContacts.length=0;this.dentDepth=0; }

  reset() {
    this.kneading?.reset();
    if(this.plastic) {
      this.plastic.reset();
      for(const edge of this.edges) {
        const a=edge.a*3,b=edge.b*3;
        edge.length=Math.hypot(this.rest[a]-this.rest[b],this.rest[a+1]-this.rest[b+1],this.rest[a+2]-this.rest[b+2]);
      }
    }
    this.positions.set(this.rest);
    this.previous.set(this.rest);
    this.velocities.fill(0);
    this.releaseAll();
    this.compression = this.previousCompression = this.compressionVelocity = 0;
    this.twist=this.previousTwist=this.twistVelocity=this.dentDepth=0;
    this.pullRelaxation=0;
    this.lastStrainedContact=null;
    this.flickCount=0;this.lastFlick=null;
  }

  bounce(strength = 0.8) {
    for (let i = 0; i < COUNT; i++) {
      const h = (this.rest[i*3+1]-FLOOR)/SIZE[1];
      this.velocities[i*3+1] -= strength*h;
      this.velocities[i*3] += this.rest[i*3]*strength*h*0.3;
      this.velocities[i*3+2] += this.rest[i*3+2]*strength*h*0.3;
    }
  }

  impulse(point:Point,direction:Point,strength=1){
    const local=this.toMaterialPoint(point);
    const tip=this.toMaterialPoint({x:point.x+direction.x*0.001,y:point.y+direction.y*0.001,z:point.z+direction.z*0.001});
    const length=Math.hypot(tip.x-local.x,tip.y-local.y,tip.z-local.z);
    const axis={x:(tip.x-local.x)/Math.max(length,0.000001),y:(tip.y-local.y)/Math.max(length,0.000001),z:(tip.z-local.z)/Math.max(length,0.000001)};
    for(let i=0;i<COUNT;i++){
      const distance=(this.positions[i*3]-local.x)**2+(this.positions[i*3+1]-local.y)**2+(this.positions[i*3+2]-local.z)**2;
      const influence=Math.exp(-distance/0.5)*Math.min(1,(this.rest[i*3+1]-FLOOR)*2.5)*Math.min(3,Math.max(0,strength));
      this.velocities[i*3]+=axis.x*influence*2.5;
      this.velocities[i*3+1]+=axis.y*influence*2.5;
      this.velocities[i*3+2]+=axis.z*influence*2.5;
      const speed=Math.hypot(this.velocities[i*3],this.velocities[i*3+1],this.velocities[i*3+2]);
      if(speed>10)for(let k=0;k<3;k++)this.velocities[i*3+k]*=10/speed;
    }
  }

  step(dt = STEP) {
    this.previousCompression = this.compression;
    this.previousTwist = this.twist;
    let target=this.plastic?.compression ?? 0, verticalPressure=0, torqueSum=0, torqueMagnitude=0, pulling=0, pullLoad=0;
    this.dentDepth=0;
    for(const g of this.grabs.values()) {
      g.consumedTarget.x=g.rawTarget.x;g.consumedTarget.y=g.rawTarget.y;g.consumedTarget.z=g.rawTarget.z;
      g.age+=dt;
      const creep=1-Math.exp(-g.age/this.feel.creepTime);
      verticalPressure=Math.max(verticalPressure,g.verticalLoad*g.pressure);
      // The strongest top contact controls the common volume-preserving squash;
      // each finger still contributes its own local indentation and pull.
      target=Math.max(target,Math.min(this.feel.foam?.maxCompression ?? 0.54,g.verticalLoad*g.pressure*(this.feel.pressDepth+
        (this.feel.holdDepth-this.feel.pressDepth)*creep)));
      g.dentDepth=g.pressure*((this.feel.dentDepth+
        (this.feel.holdDentDepth-this.feel.dentDepth)*creep)*(1-g.verticalLoad)+
        (0.06+0.07*creep)*g.verticalLoad);
      this.dentDepth=Math.max(this.dentDepth,g.dentDepth);
      const dx=g.target.x-g.normal.x*g.dentDepth,dz=g.target.z-g.normal.z*g.dentDepth;
      const radius=Math.hypot(g.anchor.x,g.anchor.z);
      const torque=(g.anchor.z*dx-g.anchor.x*dz)/Math.max(0.45,radius*radius);
      const lever=Math.min(1,Math.max(0,(g.localAnchor.y-FLOOR)/0.9));
      const contactTorque=torque*0.9*lever+g.manualTwist;
      torqueSum+=contactTorque;
      torqueMagnitude+=Math.abs(contactTorque);
      g.pulling=this.pullAmount(g,g.target);
      pulling=Math.max(pulling,g.pulling);
      pullLoad+=g.pulling;
    }
    // Only fingers still pressing vertically control the common squash. A
    // separate front/side hold must not suppress its rebound or make a dense
    // material recover faster when the top finger lifts.
    const compressionDrive=Math.min(1,verticalPressure);
    const spring = this.feel.returnSpring+(this.feel.pressSpring-this.feel.returnSpring)*compressionDrive;
    const pressFriction=this.feel.returnDamping+(this.feel.pressDamping-this.feel.returnDamping)*compressionDrive;
    const friction = this.reducedMotion ? Math.max(2*Math.sqrt(spring), this.feel.returnDamping) :
      pressFriction;
    this.compressionVelocity += ((target-this.compression)*spring-this.compressionVelocity*friction)*dt;
    this.compression += this.compressionVelocity*dt;
    const maxCompression=this.feel.foam?.maxCompression ?? 0.58;
    if (this.compression > maxCompression || this.compression < -0.16) {
      this.compression = Math.max(-0.16, Math.min(maxCompression, this.compression));
      this.compressionVelocity = 0;
    }
    // Opposed torques cancel; fingers turning in the same direction combine.
    const twistTarget=0.68*Math.tanh(torqueSum/0.68);
    // A finger with no turning load cannot change another finger's untwisting
    // rebound. Opposed active torques still provide resistance when they cancel.
    const twistDrive=Math.min(1,torqueMagnitude/0.2);
    const twistSpring=this.feel.twistReturnSpring+(this.feel.twistSpring-this.feel.twistReturnSpring)*twistDrive;
    const twistFriction=this.feel.twistReturnDamping+(this.feel.twistDamping-this.feel.twistReturnDamping)*twistDrive;
    const twistDamping=this.reducedMotion?Math.max(2*Math.sqrt(twistSpring),this.feel.twistReturnDamping):
      twistFriction;
    this.twistVelocity+=((twistTarget-this.twist)*twistSpring-this.twistVelocity*twistDamping)*dt;
    this.twist+=this.twistVelocity*dt;
    if(Math.abs(this.twist)>0.8) {this.twist=Math.sign(this.twist)*0.8;this.twistVelocity=0;}
    const p = this.positions, v = this.velocities;
    this.previous.set(p);
    if(this.feel.foam && !this.grabs.size) {
      // Foam's local dents retain their shape on release, then relax without
      // the elastic cage kicking them back. Global compression recovers above.
      const recovery=Math.exp(-dt/this.feel.foam.recoveryTime);
      for(let j=0;j<p.length;j++) {
        p[j]=this.rest[j]+(p[j]-this.rest[j])*recovery;
        v[j]=(p[j]-this.previous[j])/dt;
      }
      return;
    }
    for(const g of this.grabs.values()) {
      const follow=1-Math.exp(-dt*(this.feel.kneading?(this.feel.kneading.followRate+7.8*g.folding):38));
      // Keep the touched patch under the pointer as the rest of the body
      // expands around it. Pressing down still lets the surface sink.
      const offset=this.grabOffset(g,g.target);
      let resisted=follow;
      if(this.feel.kneading) {
        // Bound material speed, not pointer speed: a quick yank loads the dough,
        // while a long, deliberate stroke has time to push the fold through.
        const distance=Math.hypot(offset.x-g.filtered.x,offset.y-g.filtered.y,offset.z-g.filtered.z);
        const limit=(this.feel.kneading.speedLimit+1.1*g.folding)*dt;
        resisted=limit*Math.tanh(distance*follow/limit)/Math.max(distance,1e-8);
      }
      for(const k of ['x','y','z'] as const) g.filtered[k]+=(offset[k]-g.filtered[k])*resisted;
    }
    // Restore edge resistance gradually after a pull. An immediate switch back
    // to the resting stiffness released all the stored strain in one frame.
    this.pullRelaxation=pulling>this.pullRelaxation?pulling:
      pulling+(this.pullRelaxation-pulling)*Math.exp(-dt/this.feel.pullReleaseTime);
    const heldDamping=Math.max(this.feel.damping,18*pulling+4*Math.max(0,this.grabs.size-1));
    const damping = Math.exp(-(this.reducedMotion ? Math.max(9,heldDamping) : heldDamping)*dt);
    this.contactForces.fill(0);
    this.contactWeights.fill(0);
    for(const g of this.grabs.values()) for(let i=0;i<COUNT;i++) {
      const w=g.weights[i],j=i*3;
      this.contactWeights[i]+=w;
      const dx=g.start[j]+g.filtered.x-this.rest[j],dy=g.start[j+1]+g.filtered.y-this.rest[j+1],dz=g.start[j+2]+g.filtered.z-this.rest[j+2];
      // Replacing fingers on an already stretched body must not walk the broad
      // spring targets farther from the mould on every new contact.
      const bounded=Math.min(1,(this.feel.dragLimit+0.35)/Math.max(0.0001,Math.hypot(dx,dy,dz)));
      this.contactForces[j]+=(this.rest[j]+dx*bounded-p[j])*w;
      this.contactForces[j+1]+=(this.rest[j+1]+dy*bounded-p[j+1])*w;
      this.contactForces[j+2]+=(this.rest[j+2]+dz*bounded-p[j+2])*w;
    }
    const forceRest=this.plastic?.positions ?? this.rest;
    for (let i = 0; i < COUNT; i++) {
      if(this.invMass[i]===0) {
        for(let k=0;k<3;k++){p[i*3+k]=this.rest[i*3+k];v[i*3+k]=0;}
        continue;
      }
      const h = (this.rest[i*3+1]-FLOOR)/SIZE[1];
      const stiffness = h < 0.01 ? 260 : this.feel.stiffness;
      for (let k = 0; k < 3; k++) {
        const j = i*3+k;
        let force = (forceRest[j]-p[j])*stiffness;
        // Blend overlapping fingertips instead of multiplying local stiffness
        // with the finger count. Separated contacts retain their full strength.
        force += this.contactForces[j]/Math.max(1,this.contactWeights[i])*this.feel.grabStrength;
        v[j] = (v[j] + force*dt)*damping;
        p[j] += v[j]*dt;
      }
    }
    for (const e of this.edges) e.lambda = 0;
    for (const t of this.tets) t.lambda = 0;
    // As several fingers stretch the same small body, shared tension increases.
    // Two-finger pinches keep their full range; a handful of incompatible pulls
    // yields against the material instead of stretching the cage without bound.
    const tension=1+Math.max(0,pullLoad-2)*5;
    const edgeAlpha = this.feel.edgeCompliance*(1+10*this.pullRelaxation/tension) / (dt*dt);
    const volumeAlpha = (this.feel.foam?.volumeCompliance ?? (0.00000025-0.000000235*pulling)) / (dt*dt);
    for(const g of this.grabs.values()) g.contactLambda.fill(0);
    const contacts=[...this.grabs.values()];
    const iterations=(pulling>0.1 || this.feel.foam?8:4)+Math.max(0,contacts.length-1)*2;
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (const e of this.edges) {
        const a = e.a*3, b = e.b*3;
        const dx = p[a]-p[b], dy = p[a+1]-p[b+1], dz = p[a+2]-p[b+2];
        // Cage coordinates are bounded; this hot path needs no overflow-scaled
        // norm. Avoid Math.hypot overhead in this innermost constraint loop.
        const length = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (length < 1e-8) continue;
        const dl = (-(length-e.length)-edgeAlpha*e.lambda)/(this.invMass[e.a]+this.invMass[e.b]+edgeAlpha);
        e.lambda += dl;
        const sa = dl*this.invMass[e.a]/length, sb = dl*this.invMass[e.b]/length;
        p[a] += dx*sa; p[a+1] += dy*sa; p[a+2] += dz*sa;
        p[b] -= dx*sb; p[b+1] -= dy*sb; p[b+2] -= dz*sb;
      }
      for(let n=0;n<contacts.length;n++) {
        // Reverse each pass so opposing fingers receive equal solver priority.
        const g=contacts[iteration%2?n:contacts.length-1-n];
        if(g.pulling<=0.00001) continue;
        const {ids,weights}=g.contact;
        const pullAlpha=this.feel.pullCompliance*(1+Math.max(0,contacts.length-2))/(dt*dt*g.pulling*(1+2*g.folding));
        let x=0,y=0,z=0,denominator=pullAlpha;
        for(let b=0;b<ids.length;b++) {
          const j=ids[b]*3,w=weights[b];
          x+=p[j]*w;y+=p[j+1]*w;z+=p[j+2]*w;
          denominator+=this.invMass[ids[b]]*w*w;
        }
        const tx=g.contactStart.x+g.filtered.x-g.contactRest.x,ty=g.contactStart.y+g.filtered.y-g.contactRest.y,tz=g.contactStart.z+g.filtered.z-g.contactRest.z;
        const bounded=Math.min(1,(this.feel.dragLimit+0.4*g.folding)/Math.max(0.0001,Math.hypot(tx,ty,tz)));
        const dx=(-(x-g.contactRest.x-tx*bounded)-pullAlpha*g.contactLambda[0])/denominator;
        const dy=(-(y-g.contactRest.y-ty*bounded)-pullAlpha*g.contactLambda[1])/denominator;
        const dz=(-(z-g.contactRest.z-tz*bounded)-pullAlpha*g.contactLambda[2])/denominator;
        g.contactLambda[0]+=dx;g.contactLambda[1]+=dy;g.contactLambda[2]+=dz;
        for(let b=0;b<ids.length;b++) {
          const j=ids[b]*3,scale=this.invMass[ids[b]]*weights[b];
          p[j]+=dx*scale;p[j+1]+=dy*scale;p[j+2]+=dz*scale;
        }
      }
      for (const t of this.tets) {
        const a=t.ids[0]*3,b=t.ids[1]*3,c=t.ids[2]*3,d=t.ids[3]*3;
        const ax = p[b]-p[a], ay = p[b+1]-p[a+1], az = p[b+2]-p[a+2];
        const bx = p[c]-p[a], by = p[c+1]-p[a+1], bz = p[c+2]-p[a+2];
        const cx = p[d]-p[a], cy = p[d+1]-p[a+1], cz = p[d+2]-p[a+2];
        const g = this.gradients;
        g[3]=(by*cz-bz*cy)/6; g[4]=(bz*cx-bx*cz)/6; g[5]=(bx*cy-by*cx)/6;
        g[6]=(cy*az-cz*ay)/6; g[7]=(cz*ax-cx*az)/6; g[8]=(cx*ay-cy*ax)/6;
        g[9]=(ay*bz-az*by)/6; g[10]=(az*bx-ax*bz)/6; g[11]=(ax*by-ay*bx)/6;
        for (let k=0;k<3;k++) g[k]=-g[3+k]-g[6+k]-g[9+k];
        const current=(ax*g[3]+ay*g[4]+az*g[5]);
        // Air can leave foam, but its cells cannot turn inside out. Activate
        // a hard minimum-volume constraint only near collapse; ordinary
        // compression still uses the soft, compressible volume constraint.
        const barrier=!!this.feel.foam && current<t.volume*0.2;
        const alpha=barrier?0:volumeAlpha;
        const targetVolume=barrier?t.volume*0.2:t.volume;
        if(barrier)t.lambda=0;
        let denominator=alpha;
        for(let n=0;n<4;n++) denominator+=this.invMass[t.ids[n]]*(g[n*3]**2+g[n*3+1]**2+g[n*3+2]**2);
        const dl=(-(current-targetVolume)-alpha*t.lambda)/denominator;
        t.lambda+=dl;
        for(let n=0;n<4;n++) for(let k=0;k<3;k++) p[t.ids[n]*3+k]+=this.invMass[t.ids[n]]*g[n*3+k]*dl;
      }
      for (let i=0;i<COUNT;i++) p[i*3+1]=Math.max(FLOOR, p[i*3+1]);
    }
    for (let j=0;j<p.length;j++) {
      // Last-resort containment for bad input or a suspended browser clock.
      if (!Number.isFinite(p[j]) || Math.abs(p[j]-this.rest[j])>3) { this.reset(); return; }
      v[j]=(p[j]-this.previous[j])/dt;
    }
    this.kneading?.step(p,this.previous,this.contactWeights,
      this.compression-this.previousCompression,this.twist-this.previousTwist,dt);
    if(this.plastic?.learn(p,this.contactWeights,this.compression,verticalPressure,dt)) {
      const mould=this.plastic.positions;
      for(const edge of this.edges) {
        const a=edge.a*3,b=edge.b*3;
        edge.length=Math.hypot(mould[a]-mould[b],mould[a+1]-mould[b+1],mould[a+2]-mould[b+2]);
      }
    }
  }

  diagnostics() {
    let displacement = 0, speed = 0, total = 0, initial = 0, minVolumeRatio = Infinity;
    const meanOffset={x:0,y:0,z:0},meanVelocity={x:0,y:0,z:0};
    for(let i=0;i<this.positions.length;i++) {
      displacement=Math.max(displacement,Math.abs(this.positions[i]-this.rest[i]));
      speed=Math.max(speed,Math.abs(this.velocities[i]));
    }
    for(let i=0;i<COUNT;i++) {
      const j=i*3;
      meanOffset.x+=(this.positions[j]-this.rest[j])/COUNT;
      meanOffset.y+=(this.positions[j+1]-this.rest[j+1])/COUNT;
      meanOffset.z+=(this.positions[j+2]-this.rest[j+2])/COUNT;
      meanVelocity.x+=this.velocities[j]/COUNT;meanVelocity.y+=this.velocities[j+1]/COUNT;meanVelocity.z+=this.velocities[j+2]/COUNT;
    }
    for(const t of this.tets) {
      const volume = this.volume(this.positions,t.ids);
      total+=Math.abs(volume); initial+=Math.abs(t.volume);
      minVolumeRatio=Math.min(minVolumeRatio,volume/t.volume);
    }
    return { displacement, speed, compression: this.compression, compressionSpeed: this.compressionVelocity,
      twist:this.twist,twistSpeed:this.twistVelocity,dentDepth:this.dentDepth,
      volumeRatio: total/initial, minVolumeRatio, grabbed: this.grabs.size>0, contactCount:this.grabs.size, particles: COUNT,
      flickCount:this.flickCount,lastFlick:this.lastFlick,meanOffset,meanVelocity,
      ...(this.kneading?{kneading:this.kneading.diagnostics()}: {}),
      ...(this.plastic?{plastic:this.plastic.diagnostics()}: {}) };
  }
}
