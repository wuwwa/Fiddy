export interface AudioMotion {
  contacts:number;
  compression:number;
  stretch:number;
  motion:number;
  twist:number;
}

type Voice = {
  kind:'transient'|'gesture';
  gain:GainNode;
  sources:AudioScheduledSourceNode[];
  nodes:AudioNode[];
  ending:boolean;
};
type GestureVoice = Voice & { tone:OscillatorNode; filter:BiquadFilterNode };
const unit=(value:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;

/** Small synthesized foley graph: bounded accents plus one shared moving texture. */
export class SoftBodyAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Set<Voice>();
  private gesture:GestureVoice | null = null;
  private lastSound={press:-Infinity,release:-Infinity,pop:-Infinity};
  private pendingPop:{strength:number} | null = null;
  private lastMotion=-Infinity;
  private revision=0;
  private disposed=false;
  private variation=0;
  private readonly pitch:number;
  enabled = false;

  constructor(pitch=1, private readonly createContext:()=>AudioContext=()=>new AudioContext(),
    private readonly texture:'gel'|'putty'='gel') {
    this.pitch=Number.isFinite(pitch)?Math.max(0.4,Math.min(1.5,pitch)):1;
  }

  async setEnabled(enabled: boolean) {
    if(this.disposed) return;
    const revision=++this.revision;
    if(!enabled) { this.enabled=false;this.stop();return; }
    if(!this.context) {
      this.context=this.createContext();
      this.master=this.context.createGain();
      this.master.gain.value=0.26;
      // Connect once. Re-enabling must never stack parallel paths to the output.
      this.master.connect(this.context.destination);
      this.noise=this.context.createBuffer(1,Math.ceil(this.context.sampleRate*0.7),this.context.sampleRate);
      const data=this.noise.getChannelData(0);
      let smooth=0;
      for(let i=0;i<data.length;i++) {
        smooth=smooth*0.92+(Math.random()*2-1)*0.08;
        data[i]=smooth*1.8;
      }
    }
    const ctx=this.context;
    try { await ctx.resume(); }
    catch(error) { if(revision===this.revision && !this.disposed) throw error;return; }
    if(revision===this.revision && !this.disposed && this.context===ctx) this.enabled=true;
  }

  play(kind: 'press' | 'release' | 'pop', strength = 0.6) {
    const ctx=this.context,master=this.master,noise=this.noise;
    if(!this.enabled || !ctx || ctx.state!=='running' || !master || !noise) return;
    const now=ctx.currentTime;
    const transients=[...this.voices].filter(voice=>voice.kind==='transient');
    if(kind==='pop') {
      if(now-this.lastSound.pop<0.35) return;
      this.lastSound.pop=now;
      if(transients.length>=3) {
        // Hand the oldest accent's slot to the pop after its short fade. Waiting
        // for onended avoids a hard cutoff and never creates a fourth group.
        this.pendingPop={strength:unit(strength)};
        this.fade(transients[0]);
      } else this.createPop(unit(strength));
      return;
    }
    // Separate cooldowns keep an immediate tap's release audible without making
    // five simultaneous fingers five times louder.
    if(now-this.lastSound[kind]<0.08 || transients.length>=3) return;
    this.lastSound[kind]=now;
    const amount=unit(strength),release=kind==='release';
    if(this.texture==='putty') {this.createPuttyAccent(release,amount);return;}
    const density=1.45-0.45*this.pitch;
    const duration=(release?0.22+0.14*amount:0.13+0.06*amount)*density;
    // Small non-repeating pitch differences keep rapid taps from sounding like
    // a repeated notification. No new sample downloads or media assets.
    const variation=1+0.026*Math.sin(++this.variation*2.39996);
    const start=(release?245+120*amount:190-35*amount)*this.pitch*variation;
    const end=(release?70+20*amount:60+15*amount)*this.pitch;
    const body=ctx.createOscillator(),overtone=ctx.createOscillator(),texture=ctx.createBufferSource();
    const gain=ctx.createGain(),harmonics=ctx.createGain(),textureGain=ctx.createGain(),filter=ctx.createBiquadFilter();
    body.type='sine';overtone.type='sine';
    for(const [osc,ratio] of [[body,1],[overtone,1.92]] as const) {
      osc.frequency.setValueAtTime(start*ratio,now);
      osc.frequency.exponentialRampToValueAtTime(end*ratio*(release?1.45:1),now+duration*0.48);
      if(release) osc.frequency.exponentialRampToValueAtTime(end*ratio*1.7,now+duration*0.64);
      osc.frequency.exponentialRampToValueAtTime(end*ratio,now+duration);
    }
    harmonics.gain.value=release?0.14:0.08;
    texture.buffer=noise;
    filter.type='bandpass';filter.Q.value=0.8;
    filter.frequency.setValueAtTime((release?850:580)*this.pitch,now);
    filter.frequency.exponentialRampToValueAtTime(180*this.pitch,now+duration);
    textureGain.gain.value=(release?0.28:0.45)*(0.65+0.35*this.pitch);
    gain.gain.setValueAtTime(0,now);
    gain.gain.linearRampToValueAtTime(0.13+0.08*amount,now+0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+duration);
    body.connect(gain);
    overtone.connect(harmonics).connect(gain);
    texture.connect(filter).connect(textureGain).connect(gain);
    gain.connect(master);
    const voice:Voice={kind:'transient',gain,sources:[body,overtone,texture],nodes:[body,overtone,texture,filter,harmonics,textureGain,gain],ending:false};
    this.track(voice);
    for(const source of voice.sources) {source.start(now);source.stop(now+duration+0.02);}
  }

  private createPuttyAccent(release:boolean,amount:number) {
    const ctx=this.context!,now=ctx.currentTime,duration=release?0.20:0.16;
    const body=ctx.createOscillator(),texture=ctx.createBufferSource(),gain=ctx.createGain();
    const bodyGain=ctx.createGain(),filter=ctx.createBiquadFilter();
    body.type='sine';body.frequency.setValueAtTime(65+amount*15,now);
    body.frequency.exponentialRampToValueAtTime(48,now+duration);
    bodyGain.gain.value=0.16;
    texture.buffer=this.noise;
    filter.type='bandpass';filter.Q.value=0.55;
    filter.frequency.setValueAtTime(release?650:850,now);
    filter.frequency.exponentialRampToValueAtTime(380,now+duration);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(0.13+amount*0.05,now+0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+duration);
    body.connect(bodyGain).connect(gain);texture.connect(filter).connect(gain);gain.connect(this.master!);
    const voice:Voice={kind:'transient',gain,sources:[body,texture],nodes:[body,texture,bodyGain,filter,gain],ending:false};
    this.track(voice);for(const source of voice.sources) {source.start(now);source.stop(now+duration+0.02);}
  }

  private createPop(amount:number) {
    const ctx=this.context!,now=ctx.currentTime,duration=0.18+0.04*amount;
    const body=ctx.createOscillator(),texture=ctx.createBufferSource();
    const gain=ctx.createGain(),snap=ctx.createGain(),filter=ctx.createBiquadFilter();
    body.type='sine';
    body.frequency.setValueAtTime((155+25*amount)*this.pitch,now);
    body.frequency.exponentialRampToValueAtTime(Math.max(30,(48+9*amount)*this.pitch),now+0.065);
    body.frequency.exponentialRampToValueAtTime(Math.max(26,40*this.pitch),now+duration);
    texture.buffer=this.noise;
    filter.type='bandpass';filter.Q.value=0.65;
    filter.frequency.setValueAtTime((1600+400*amount)*(0.8+0.2*this.pitch),now);
    filter.frequency.exponentialRampToValueAtTime(380*this.pitch,now+0.05);
    // A brief wet snap sits over the round body. Both envelopes start at zero,
    // with no impulse, extra master gain, or long hiss after the pop.
    snap.gain.setValueAtTime(0,now);
    snap.gain.linearRampToValueAtTime(0.6+0.1*amount,now+0.003);
    snap.gain.exponentialRampToValueAtTime(0.0001,now+0.045+0.01*amount);
    gain.gain.setValueAtTime(0,now);
    gain.gain.linearRampToValueAtTime(0.17+0.055*amount,now+0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+duration);
    body.connect(gain);
    texture.connect(filter).connect(snap).connect(gain);
    gain.connect(this.master!);
    const voice:Voice={kind:'transient',gain,sources:[body,texture],nodes:[body,texture,filter,snap,gain],ending:false};
    this.track(voice);
    for(const source of voice.sources) {source.start(now);source.stop(now+duration+0.02);}
  }

  private flushPop() {
    if(!this.pendingPop || !this.enabled || this.disposed || this.context?.state!=='running') return;
    if([...this.voices].filter(voice=>voice.kind==='transient').length>=3) return;
    const {strength}=this.pendingPop;
    this.pendingPop=null;
    this.createPop(strength);
  }

  update(input:AudioMotion) {
    const ctx=this.context;
    if(!this.enabled || !ctx || ctx.state!=='running' || !this.master || !this.noise) return;
    const now=ctx.currentTime;
    const contacts=Number.isFinite(input.contacts)?Math.max(0,Math.min(5,input.contacts)):0;
    const motion=contacts>0?unit(input.motion):0;
    const compression=unit(input.compression),stretch=unit(input.stretch),twist=unit(input.twist);
    if(motion>0.015) this.lastMotion=now;
    if(contacts===0 || now-this.lastMotion>0.14) {
      if(this.gesture) this.fade(this.gesture);
      return;
    }
    if(!this.gesture && motion>0.015) this.gesture=this.createGesture();
    const voice=this.gesture;
    if(!voice || voice.ending) return;
    const gain=Math.pow(motion,0.6)*(0.035+0.05*stretch+0.025*compression+0.02*twist);
    // One smoothly changing texture follows the aggregate motion. A held still
    // finger goes quiet instead of leaving a continuous synthetic drone.
    const smooth=(param:AudioParam,value:number,time:number)=>{
      param.cancelScheduledValues(now);param.setTargetAtTime(value,now,time);
    };
    smooth(voice.gain.gain,Math.min(0.1,gain),0.035);
    smooth(voice.tone.frequency,(85+stretch*175+twist*60+Math.sin(now*13)*stretch*5)*this.pitch,0.055);
    smooth(voice.filter.frequency,(260+stretch*800+motion*450)*(0.8+0.2*this.pitch),0.055);
    smooth(voice.filter.Q,this.texture==='putty'?0.6:0.9+stretch*2.5,0.055);
  }

  private createGesture():GestureVoice {
    const ctx=this.context!,gain=ctx.createGain(),tone=ctx.createOscillator(),texture=ctx.createBufferSource();
    const toneGain=ctx.createGain(),filter=ctx.createBiquadFilter();
    gain.gain.value=0;toneGain.gain.value=this.texture==='putty'?0.025:0.14;
    tone.type='sine';tone.frequency.value=100*this.pitch;
    texture.buffer=this.noise;texture.loop=true;
    filter.type='bandpass';filter.frequency.value=400;filter.Q.value=1;
    tone.connect(toneGain).connect(gain);
    texture.connect(filter).connect(gain);
    gain.connect(this.master!);
    const voice:GestureVoice={kind:'gesture',gain,tone,filter,sources:[tone,texture],nodes:[tone,texture,toneGain,filter,gain],ending:false};
    this.track(voice);
    tone.start();texture.start();
    return voice;
  }

  private track(voice:Voice) {
    this.voices.add(voice);
    voice.sources[0].onended=()=>this.disconnect(voice);
  }

  private disconnect(voice:Voice) {
    if(!this.voices.delete(voice)) return;
    for(const source of voice.sources) { source.onended=null;try {source.stop();} catch { /* Already ended. */ } }
    for(const node of voice.nodes) node.disconnect();
    if(this.gesture===voice) this.gesture=null;
    this.flushPop();
  }

  private fade(voice:Voice) {
    if(voice.ending || !this.context) return;
    voice.ending=true;
    const now=this.context.currentTime;
    if(typeof voice.gain.gain.cancelAndHoldAtTime==='function') voice.gain.gain.cancelAndHoldAtTime(now);
    else voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0,now,0.006);
    for(const source of voice.sources) {try {source.stop(now+0.025);} catch { /* Already ended. */ }}
  }

  stop() {
    this.pendingPop=null;
    for(const voice of this.voices) this.fade(voice);
    this.lastMotion=-Infinity;
    this.lastSound={press:-Infinity,release:-Infinity,pop:this.lastSound.pop};
  }

  diagnostics() {
    return {enabled:this.enabled,contextState:this.context?.state ?? 'uninitialized',
      transientVoices:[...this.voices].filter(voice=>voice.kind==='transient').length,
      gestureActive:!!this.gesture && !this.gesture.ending};
  }

  dispose() {
    if(this.disposed) return;
    this.disposed=true;this.enabled=false;this.revision++;this.pendingPop=null;
    for(const voice of this.voices) this.disconnect(voice);
    this.master?.disconnect();
    void this.context?.close().catch(()=>{});
    this.context=null;this.master=null;this.noise=null;
  }
}

