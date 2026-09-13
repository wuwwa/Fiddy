import type { MaterialReaction } from './profiles';

export const POP_DURATION=2.05;
export const REFORM_START=0.9;
const unit=(value:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;

/** Hidden material fatigue integrates measured deformation, never input events. */
export class MaterialResponse {
  private fatigueAmount=0;
  private burstAge=POP_DURATION;
  private pops=0;
  constructor(readonly reaction:MaterialReaction) {}

  get bursting() { return this.burstAge<POP_DURATION; }
  get age() { return this.burstAge; }
  get count() { return this.pops; }
  get fatigue() { return this.reaction.kind==='pop'?Math.min(1,this.fatigueAmount/this.reaction.threshold):0; }
  get active() { return this.bursting || this.fatigueAmount>0; }

  step(seconds:number,input:{strain:number}) {
    const dt=Number.isFinite(seconds)?Math.max(0,Math.min(0.05,seconds)):0;
    if(dt===0) return false;
    if(this.bursting) {
      this.burstAge+=dt;
      if(this.burstAge>=POP_DURATION-1e-9) this.burstAge=POP_DURATION;
      return false;
    }
    if(this.reaction.kind==='solid') return false;
    const load=Math.pow(Math.max(0,(unit(input.strain)-this.reaction.strainOnset)/(1-this.reaction.strainOnset)),1.7);
    // Light deformation allows the gel to heal faster than it accumulates
    // fatigue. Strong sustained strain progressively overcomes that recovery.
    const recovery=(1-load)**2/this.reaction.relaxation;
    const decay=Math.exp(-recovery*dt);
    this.fatigueAmount=this.fatigueAmount*decay+(recovery>0.000001?load*(1-decay)/recovery:load*dt);
    if(this.fatigueAmount<0.0001) this.fatigueAmount=0;
    if(this.fatigueAmount<this.reaction.threshold) return false;
    this.fatigueAmount=0;this.burstAge=0;this.pops++;
    return true;
  }

  reset() {this.fatigueAmount=0;this.burstAge=POP_DURATION;this.pops=0;}
}
