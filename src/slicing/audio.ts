import { plopBuffer } from './plop-sound';

const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
type Voice = { source: AudioBufferSourceNode; gain: GainNode };

/** Quiet resistance, a small contact, then one low plop when the wire exits. */
export class SliceAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private pull: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private panner: StereoPannerNode | null = null;
  private plop: AudioBuffer | null = null;
  private bed: AudioBufferSourceNode | null = null;
  private voices: Voice[] = [];
  private nodes: AudioNode[] = [];
  private revision = 0;
  private disposed = false;
  private paused = false;
  private touching = false;
  private accentAt = -Infinity;
  private level = 0;
  enabled = false;
  constructor(private pitch = 1, private createContext: () => AudioContext = () => new AudioContext()) {}
  private create() {
    const ctx = this.context = this.createContext();
    const master = this.master = ctx.createGain(), pull = this.pull = ctx.createGain();
    const low = this.lowpass = ctx.createBiquadFilter(), high = ctx.createBiquadFilter();
    const panner = this.panner = ctx.createStereoPanner(), limiter = ctx.createDynamicsCompressor();
    master.gain.value = pull.gain.value = 0;
    low.type = 'lowpass'; low.frequency.value = 510; low.Q.value = .5;
    high.type = 'highpass'; high.frequency.value = 35; high.Q.value = .5;
    limiter.threshold.value = -9; limiter.knee.value = 8; limiter.ratio.value = 3; limiter.attack.value = .003; limiter.release.value = .12;
    this.bed = ctx.createBufferSource(); this.bed.buffer = plopBuffer(ctx, 'pull');
    this.bed.loop = true; this.bed.playbackRate.value = this.pitch;
    this.plop = plopBuffer(ctx, 'plop');
    this.bed.connect(pull); pull.connect(low); low.connect(panner); panner.connect(high); high.connect(master); master.connect(limiter); limiter.connect(ctx.destination);
    this.nodes = [master, pull, low, high, panner, limiter, this.bed]; this.bed.start();
  }
  async setEnabled(enabled: boolean) {
    if (this.disposed) return;
    const revision = ++this.revision; this.enabled = false; this.stop();
    if (!enabled) return;
    if (!this.context) this.create();
    const ctx = this.context!;
    try { await ctx.resume(); }
    catch (error) { if (!this.disposed && revision === this.revision) throw error; return; }
    if (this.disposed || revision !== this.revision) return;
    this.enabled = true; this.master!.gain.setTargetAtTime(this.paused ? 0 : .72, ctx.currentTime, .025);
  }
  private playPlop(gain: number, pitch: number) {
    const ctx = this.context!;
    // Keep the entry and exit voices bounded, even under artificial rapid input.
    while (this.voices.length >= 2) {
      const old = this.voices.shift()!; old.source.stop(); old.source.disconnect(); old.gain.disconnect();
    }
    const source = ctx.createBufferSource(), envelope = ctx.createGain();
    const voice = { source, gain: envelope }; this.voices.push(voice);
    source.buffer = this.plop; source.playbackRate.value = this.pitch * pitch; envelope.gain.value = gain;
    source.connect(envelope); envelope.connect(this.panner!);
    source.onended = () => { source.disconnect(); envelope.disconnect(); const index = this.voices.indexOf(voice); if (index !== -1) this.voices.splice(index, 1); };
    source.start(ctx.currentTime);
  }
  move(speed: number, contact: boolean, depth = .5, resistance = .5, pan = 0) {
    const ctx = this.context;
    if (!ctx || !this.enabled || this.disposed || this.paused || ctx.state !== 'running') return;
    const amount = contact && speed > 0 ? Math.sqrt(unit(speed / .45)) : 0;
    const load = unit(resistance), submerged = unit(depth), age = ctx.currentTime - this.accentAt;
    const accent = age >= 0 && age < .7 ? Math.exp(-age * 12) : 0;
    this.level = Math.max(amount * (.18 + load * .1), accent * .8);
    const now = ctx.currentTime;
    this.panner!.pan.setTargetAtTime(Number.isFinite(pan) ? Math.max(-.45, Math.min(.45, pan)) : 0, now, .08);
    if (amount > 0 && !this.touching) this.playPlop(.10, 1.18);
    this.touching = amount > 0;
    this.pull!.gain.cancelScheduledValues(now);
    this.pull!.gain.setTargetAtTime(amount * (.075 + load * .10) * (1 - submerged * .35), now, contact ? .08 : .025);
    this.lowpass!.frequency.setTargetAtTime((470 - submerged * 210 + load * 60) * this.pitch, now, .09);
  }
  finish() {
    const ctx = this.context;
    if (this.disposed || !this.enabled || this.paused || !ctx) return;
    this.accentAt = ctx.currentTime;
    this.pull!.gain.cancelScheduledValues(ctx.currentTime); this.pull!.gain.setTargetAtTime(0, ctx.currentTime, .018);
    this.playPlop(.88, 1);
  }
  stop() {
    this.accentAt = -Infinity; this.level = 0; this.touching = false;
    if (!this.context || this.disposed) return;
    const now = this.context.currentTime;
    for (const gain of [this.pull, this.master, ...this.voices.map(v => v.gain)]) { gain?.gain.cancelScheduledValues(now); gain?.gain.setTargetAtTime(0, now, .012); }
    for (const voice of this.voices) voice.source.stop(now + .065);
  }
  setPaused(paused: boolean) { this.paused = paused; this.reset(); }
  reset() { this.stop(); if (!this.paused && this.enabled && this.context) this.master!.gain.setTargetAtTime(.72, this.context.currentTime, .025); }
  get diagnostics() { return { enabled: this.enabled, state: this.context?.state ?? 'uncreated', level: this.level, sources: Number(!!this.bed) + this.voices.length, paused: this.paused }; }
  dispose() {
    if (this.disposed) return;
    this.stop(); this.disposed = true; this.enabled = false; ++this.revision;
    const ctx = this.context, nodes = this.nodes, voices = this.voices;
    this.bed?.stop((ctx?.currentTime ?? 0) + .065);
    this.bed = null; this.nodes = []; this.voices = []; this.context = null; this.plop = null;
    if (ctx) setTimeout(() => { for (const voice of voices) { voice.source.disconnect(); voice.gain.disconnect(); } nodes.forEach(node => node.disconnect()); void ctx.close().catch(() => {}); }, 80);
  }
}
