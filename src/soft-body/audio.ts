import { loadFoley, foleyCharacter, type FoleyBank, type FoleyLoader, type FoleyMaterial } from '../audio/foley';

export interface AudioMotion {
  contacts: number;
  compression: number;
  stretch: number;
  motion: number;
  twist: number;
}

type Voice = {
  kind: 'transient' | 'gesture';
  gain: GainNode;
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  ending: boolean;
};
const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Recorded foley: three accents and one motion-controlled texture at most. */
export class SoftBodyAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private bank: FoleyBank | null = null;
  private loading: Promise<FoleyBank> | null = null;
  private voices = new Set<Voice>();
  private gesture: Voice | null = null;
  private lastSound = { press: -Infinity, release: -Infinity, pop: -Infinity };
  private pendingPop: { strength: number } | null = null;
  private lastMotion = -Infinity;
  private revision = 0;
  private disposed = false;
  private variation = 0;
  private selection = { press: 0, release: 0, pop: 0 };
  private readonly pitch: number;
  enabled = false;

  constructor(pitch = 1, private readonly createContext: () => AudioContext = () => new AudioContext(),
    private readonly texture: FoleyMaterial = 'gel', private readonly load: FoleyLoader = loadFoley) {
    // Preserve the recordings' detail instead of using the old sub-bass pitches.
    this.pitch = Number.isFinite(pitch) ? .86 + .18 * Math.max(.4, Math.min(1.5, pitch)) : 1;
  }

  async setEnabled(enabled: boolean) {
    if (this.disposed) return;
    const revision = ++this.revision;
    if (!enabled) { this.enabled = false; this.stop(); return; }
    if (!this.context) {
      this.context = this.createContext();
      this.master = this.context.createGain();
      this.master.gain.value = .48;
      this.master.connect(this.context.destination);
    }
    const ctx = this.context;
    // Resume in the user activation call stack, before waiting for downloads.
    const resume = ctx.resume();
    const loading = this.loading ??= this.load(ctx, this.texture);
    try {
      const [, bank] = await Promise.all([resume, loading]);
      if (revision === this.revision && !this.disposed && this.context === ctx) {
        this.bank = bank; this.enabled = true;
      }
    } catch (error) {
      if (this.loading === loading) this.loading = null;
      if (revision === this.revision && !this.disposed) {
        this.enabled = false; this.stop(); throw error;
      }
    }
  }

  play(kind: 'press' | 'release' | 'pop', strength = .6) {
    const ctx = this.context;
    if (!this.enabled || !ctx || ctx.state !== 'running' || !this.bank) return;
    const now = ctx.currentTime;
    const transients = [...this.voices].filter(voice => voice.kind === 'transient');
    if (kind === 'pop') {
      if (now - this.lastSound.pop < .35) return;
      this.lastSound.pop = now;
      if (transients.length >= 3) {
        this.pendingPop = { strength: unit(strength) }; this.fade(transients[0]);
      } else this.accent('pop', unit(strength));
      return;
    }
    if (now - this.lastSound[kind] < .08 || transients.length >= 3) return;
    this.lastSound[kind] = now;
    this.accent(kind, unit(strength));
  }

  private voice(buffer: AudioBuffer, kind: Voice['kind']): Voice {
    const ctx = this.context!, source = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    source.buffer = buffer;
    filter.type = 'lowpass'; filter.Q.value = .5;
    filter.frequency.value = foleyCharacter[this.texture].cutoff;
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master!);
    const voice: Voice = { kind, source, gain, filter, ending: false };
    this.voices.add(voice);
    source.onended = () => this.disconnect(voice);
    return voice;
  }

  private accent(kind: 'press' | 'release' | 'pop', amount: number) {
    const ctx = this.context!, now = ctx.currentTime, choices = this.bank![kind];
    const recording = choices[this.selection[kind]++ % choices.length];
    const voice = this.voice(recording, 'transient');
    const character = foleyCharacter[this.texture];
    const rate = this.pitch * character.rate * (1 + .035 * Math.sin(++this.variation * 2.39996));
    const duration = kind === 'pop' ? Math.min(.16, recording.duration / rate) : recording.duration / rate;
    voice.source.playbackRate.value = rate;
    const level = kind === 'pop' ? .32 + .10 * amount : ((kind === 'release' ? .22 : .30) + .15 * amount) * (kind === 'release' ? character.release : character.contact);
    voice.gain.gain.setValueAtTime(0, now);
    const attack = Math.min(character.attack, duration * .2);
    voice.gain.gain.linearRampToValueAtTime(level, now + attack);
    voice.gain.gain.setValueAtTime(level, now + Math.max(attack + .001, duration - .055));
    voice.gain.gain.linearRampToValueAtTime(0, now + duration);
    voice.source.start(now); voice.source.stop(now + duration + .005);
  }

  private flushPop() {
    if (!this.pendingPop || !this.enabled || this.disposed || this.context?.state !== 'running') return;
    if ([...this.voices].filter(voice => voice.kind === 'transient').length >= 3) return;
    const { strength } = this.pendingPop; this.pendingPop = null;
    this.accent('pop', strength);
  }

  update(input: AudioMotion) {
    const ctx = this.context;
    if (!this.enabled || !ctx || ctx.state !== 'running' || !this.bank) return;
    const now = ctx.currentTime;
    const contacts = Number.isFinite(input.contacts) ? Math.max(0, Math.min(5, input.contacts)) : 0;
    const motion = contacts > 0 ? unit(input.motion) : 0;
    const compression = unit(input.compression), stretch = unit(input.stretch), twist = unit(input.twist);
    if (motion > .015) this.lastMotion = now;
    if (contacts === 0 || now - this.lastMotion > .14) {
      if (this.gesture) this.fade(this.gesture);
      return;
    }
    if (!this.gesture && motion > .015) {
      const voice = this.gesture = this.voice(this.bank.motion, 'gesture');
      voice.source.loop = true;
      voice.source.playbackRate.value = this.pitch;
      voice.source.start(now, (this.variation++ * .381966 % 1) * this.bank.motion.duration);
    }
    const voice = this.gesture;
    if (!voice || voice.ending) return;
    const smooth = (param: AudioParam, value: number, time: number) => {
      param.cancelScheduledValues(now); param.setTargetAtTime(value, now, time);
    };
    const character = foleyCharacter[this.texture];
    smooth(voice.gain.gain, Math.pow(motion, .6) * (.19 + .08 * stretch + .05 * compression + .03 * twist) * character.motion, .035);
    smooth(voice.source.playbackRate, this.pitch * character.rate * (.82 + .24 * motion + .12 * stretch), .08);
    smooth(voice.filter.frequency, character.cutoff * (.75 + motion * .2 + stretch * .05), .055);
  }

  private disconnect(voice: Voice) {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    try { voice.source.stop(); } catch { /* Already ended. */ }
    voice.source.disconnect(); voice.filter.disconnect(); voice.gain.disconnect();
    if (this.gesture === voice) this.gesture = null;
    this.flushPop();
  }

  private fade(voice: Voice) {
    if (voice.ending || !this.context) return;
    voice.ending = true;
    const now = this.context.currentTime;
    if (typeof voice.gain.gain.cancelAndHoldAtTime === 'function') voice.gain.gain.cancelAndHoldAtTime(now);
    else voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, .006);
    try { voice.source.stop(now + .025); } catch { /* Already ended. */ }
  }

  stop() {
    this.pendingPop = null;
    for (const voice of this.voices) this.fade(voice);
    this.lastMotion = -Infinity;
    this.lastSound = { press: -Infinity, release: -Infinity, pop: this.lastSound.pop };
  }

  diagnostics() {
    return { enabled: this.enabled, contextState: this.context?.state ?? 'uninitialized',
      transientVoices: [...this.voices].filter(voice => voice.kind === 'transient').length,
      gestureActive: !!this.gesture && !this.gesture.ending };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.enabled = false; this.revision++; this.pendingPop = null;
    for (const voice of this.voices) this.disconnect(voice);
    this.master?.disconnect();
    void this.context?.close().catch(() => {});
    this.context = null; this.master = null; this.bank = null; this.loading = null;
  }
}
