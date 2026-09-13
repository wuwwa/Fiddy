type Contact={id:number;x:number;y:number;relief:number;target:number};
type Pair={a:Contact;b:Contact;dx:number;dy:number;span:number;eligible:boolean;age:number};
const MIN_SPAN=20;
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};

/** Relieve automatic poking when two captured fingers deliberately turn.
 * Coordinates are CSS pixels; this never adds a rotation or moves the skin.
 * Pair geometry is sampled at physics ticks so separate pointermove events from
 * one touch packet do not briefly turn a common translation into a twist.
 */
export class PairTurnPressure {
  private contacts=new Map<number,Contact>();
  private pairs:Pair[]=[];
  constructor(private readonly limit=5) {}

  begin(id:number,x:number,y:number) {
    if(!Number.isFinite(x) || !Number.isFinite(y) || this.contacts.has(id) || this.contacts.size>=this.limit)return false;
    const b:Contact={id,x,y,relief:0,target:0};
    for(const a of this.contacts.values()) {
      const dx=b.x-a.x,dy=b.y-a.y,span=Math.hypot(dx,dy);
      this.pairs.push({a,b,dx,dy,span,eligible:Number.isFinite(span) && span>=MIN_SPAN,age:0});
    }
    this.contacts.set(id,b);return true;
  }

  move(id:number,x:number,y:number) {
    const contact=this.contacts.get(id);
    if(contact && Number.isFinite(x) && Number.isFinite(y)) {contact.x=x;contact.y=y;}
  }

  end(id:number) {
    this.contacts.delete(id);
    this.pairs=this.pairs.filter(pair=>pair.a.id!==id && pair.b.id!==id);
    // Survivors keep their current relief and regain pressure over time.
  }

  clear() {this.contacts.clear();this.pairs.length=0;}

  step(dt:number) {
    if(!Number.isFinite(dt) || dt<=0)return;
    dt=Math.min(dt,0.05);
    for(const contact of this.contacts.values())contact.target=0;
    for(const pair of this.pairs) {
      const dx=pair.b.x-pair.a.x,dy=pair.b.y-pair.a.y,span=Math.hypot(dx,dy);
      if(!Number.isFinite(span) || span<MIN_SPAN || span<pair.span*0.35) {
        pair.eligible=false;pair.age=0;continue;
      }
      if(!pair.eligible) {
        pair.dx=dx;pair.dy=dy;pair.span=span;pair.eligible=true;pair.age=0;continue;
      }
      const x=dx/span,y=dy/span,baseX=pair.dx/pair.span,baseY=pair.dy/pair.span;
      const angle=Math.abs(Math.atan2(baseX*y-baseY*x,baseX*x+baseY*y));
      const radial=Math.abs(Math.log(span/pair.span));
      // A radial pinch and common translation retain ordinary pressure. Small
      // touch noise is ignored; a turn ramps in between about 2 and 12 degrees.
      const purity=angle/(angle+radial*2+0.000001);
      const amount=smooth((angle-0.035)/0.175)*purity*purity;
      pair.age=amount>0.06?pair.age+dt:0;
      const target=amount*smooth((pair.age-0.025)/0.045);
      pair.a.target=Math.max(pair.a.target,target);pair.b.target=Math.max(pair.b.target,target);
    }
    for(const contact of this.contacts.values()) {
      const time=contact.target>contact.relief?0.07:0.28;
      contact.relief+=(contact.target-contact.relief)*(1-Math.exp(-dt/time));
      if(contact.relief<0.000001)contact.relief=0;
    }
  }

  relief(id:number) {return this.contacts.get(id)?.relief ?? 0;}
  pressure(id:number,base:number) {
    return Number.isFinite(base)?Math.max(0,Math.min(1.3,base))*(1-this.relief(id)):0;
  }
  diagnostics() {
    return {pairs:this.pairs.length,contacts:[...this.contacts.values()].map(({id,relief})=>({id,relief}))};
  }
}
