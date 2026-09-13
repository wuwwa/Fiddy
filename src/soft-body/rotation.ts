const TAU=Math.PI*2;
const wrap=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));

/** A horizontal turn leaves the floor and all material coordinates upright. */
export class UprightRotation {
  angle=0;
  velocity=0;
  dragging=false;
  private origin=0;
  private previous=0;
  private lastMotion=0;
  private scale=1;
  private started=false;

  begin(x:number,span:number,time:number) {
    this.stop();
    this.dragging=true;this.started=false;
    this.origin=this.previous=x;this.lastMotion=time;
    this.scale=TAU*0.75/Math.max(240,span);
  }

  move(x:number,time:number) {
    if(!this.dragging || !Number.isFinite(x) || !Number.isFinite(time))return;
    // A tap or a vertical swipe in the background must not turn the shape.
    if(!this.started) {
      const distance=x-this.origin;
      if(Math.abs(distance)<=5)return;
      this.started=true;this.previous=this.origin+Math.sign(distance)*5;
    }
    const delta=(x-this.previous)*this.scale;
    if(!delta)return;
    const elapsed=Math.max(1/120,(time-this.lastMotion)/1000);
    this.angle=wrap(this.angle+delta);
    this.velocity=Math.max(-2.6,Math.min(2.6,delta/elapsed));
    this.previous=x;this.lastMotion=time;
  }

  release(time:number,coast:boolean) {
    this.dragging=false;
    // Holding still before letting go should leave the chosen angle in place.
    if(!coast || time-this.lastMotion>80)this.velocity=0;
  }

  rotate(delta:number) {
    if(!Number.isFinite(delta))return;
    this.velocity=0;this.angle=wrap(this.angle+delta);
  }

  step(dt:number) {
    if(this.dragging || !Number.isFinite(dt) || dt<=0)return;
    const decay=Math.exp(-6*Math.min(dt,0.05));
    this.angle=wrap(this.angle+this.velocity*(1-decay)/6);
    this.velocity*=decay;
    if(Math.abs(this.velocity)<0.002)this.velocity=0;
  }

  stop() {this.dragging=false;this.velocity=0;}
  reset() {this.stop();this.angle=0;}
  get active() {return this.dragging || this.velocity!==0;}
}
