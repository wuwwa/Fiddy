import { loadFoley, type FoleyBank, type FoleyLoader } from '../audio/foley';

const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
type Voice = { source: AudioBufferSourceNode; gain: GainNode };

/** Dry blade friction and a short fabric-like slice, without a liquid exit. */
export class SliceAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private pull: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private panner: StereoPannerNode | null = null;
  private bank: FoleyBank | null = null;
  private loading: Promise<FoleyBank> | null = null;
  private variation = 0;
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
  constructor(private pitch = 1, private createContext: () => AudioContext = () => new AudioContext(), private load: FoleyLoader = loadFoley) {
    this.pitch = Number.isFinite(pitch) ? Math.max(.8, Math.min(1.2, pitch)) : 1;
  }
  private create() {
    const ctx = this.context = this.createContext();
    const master = this.master = ctx.createGain(), pull = this.pull = ctx.createGain();
    const low = this.lowpass = ctx.createBiquadFilter(), high = ctx.createBiquadFilter();
    const panner = this.panner = ctx.createStereoPanner(), limiter = ctx.createDynamicsCompressor();
    master.gain.value = pull.gain.value = 0;
    low.type = 'lowpass'; low.frequency.value = 4300; low.Q.value = .5;
    high.type = 'highpass'; high.frequency.value = 35; high.Q.value = .5;
    limiter.threshold.value = -9; limiter.knee.value = 8; limiter.ratio.value = 3; limiter.attack.value = .003; limiter.release.value = .12;
    pull.connect(low); low.connect(panner); panner.connect(high); high.connect(master); master.connect(limiter); limiter.connect(ctx.destination);
    this.nodes = [master, pull, low, high, panner, limiter];
  }
  async setEnabled(enabled: boolean) {
    if (this.disposed) return;
    const revision = ++this.revision; this.enabled = false; this.stop();
    if (!enabled) return;
    if (!this.context) this.create();
    const ctx = this.context!;
    const resume = ctx.resume();
    const loading = this.loading ??= this.load(ctx, 'slice');
    let bank: FoleyBank;
    try { [, bank] = await Promise.all([resume, loading]); }
    catch (error) {
      if (this.loading === loading) this.loading = null;
      if (!this.disposed && revision === this.revision) throw error;
      return;
    }
    if (this.disposed || revision !== this.revision) return;
    this.bank = bank;
    if (!this.bed) {
      this.bed = ctx.createBufferSource(); this.bed.buffer = bank.motion;
      this.bed.loop = true; this.bed.playbackRate.value = this.pitch;
      this.bed.connect(this.pull!); this.nodes.push(this.bed); this.bed.start();
    }
    this.enabled = true; this.master!.gain.setTargetAtTime(this.paused ? 0 : .72, ctx.currentTime, .025);
  }
  private playPlop(gain: number, pitch: number) {
    const ctx = this.context!;
    // Keep the entry and exit voices bounded, even under artificial rapid input.
    if (this.voices.length >= 2 || !this.bank) return;
    const source = ctx.createBufferSource(), envelope = ctx.createGain();
    const voice = { source, gain: envelope }; this.voices.push(voice);
    const choices = pitch > 1 ? this.bank.press : this.bank.release;
    source.buffer = choices[this.variation++ % choices.length];
    source.playbackRate.value = this.pitch * pitch * (1 + .025 * Math.sin(this.variation * 2.39996));
    const now = ctx.currentTime, duration = source.buffer.duration / source.playbackRate.value;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + .008);
    envelope.gain.setValueAtTime(gain, now + Math.max(.009, duration - .05));
    envelope.gain.linearRampToValueAtTime(0, now + duration);
    source.connect(envelope); envelope.connect(this.panner!);
    source.onended = () => { source.disconnect(); envelope.disconnect(); const index = this.voices.indexOf(voice); if (index !== -1) this.voices.splice(index, 1); };
    source.start(now); source.stop(now + duration + .005);
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
    if (amount > 0 && !this.touching) this.playPlop(.22, 1.08);
    this.touching = amount > 0;
    this.pull!.gain.cancelScheduledValues(now);
    this.pull!.gain.setTargetAtTime(amount * (.075 + load * .065) * (1 - submerged * .25), now, contact ? .045 : .025);
    this.lowpass!.frequency.setTargetAtTime((4300 - submerged * 1400 + load * 700) * this.pitch, now, .09);
    this.bed!.playbackRate.setTargetAtTime(this.pitch * (.8 + amount * .32), now, .08);
  }
  finish() {
    const ctx = this.context;
    if (this.disposed || !this.enabled || this.paused || !ctx || ctx.state !== 'running') return;
    this.accentAt = ctx.currentTime;
    this.pull!.gain.cancelScheduledValues(ctx.currentTime); this.pull!.gain.setTargetAtTime(0, ctx.currentTime, .018);
    this.playPlop(.32, 1);
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
    this.bed = null; this.nodes = []; this.voices = []; this.context = null; this.bank = null; this.loading = null;
    if (ctx) setTimeout(() => { for (const voice of voices) { voice.source.disconnect(); voice.gain.disconnect(); } nodes.forEach(node => node.disconnect()); void ctx.close().catch(() => {}); }, 80);
  }
}
