/** Short event chimes, created only after the shared sound control is enabled. */
export class BonusChimes {
  private context: AudioContext | null = null;
  private enabled = false;
  private disposed = false;
  private voices = new Set<OscillatorNode>();
  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}
  async setEnabled(enabled: boolean) {
    if (this.disposed) return;
    this.enabled = enabled;
    if (!enabled) { this.stop(); return; }
    const context = this.context ??= this.createContext();
    await context.resume();
  }
  play(moment: 'awaken' | 'goodnight') {
    const ctx = this.context;
    if (!this.enabled || this.disposed || !ctx || ctx.state !== 'running') return;
    const notes = moment === 'awaken' ? [392, 523.25, 659.25] : [659.25, 523.25, 392];
    notes.forEach((hz, index) => {
      if (this.voices.size >= 12) return;
      const oscillator = ctx.createOscillator(), gain = ctx.createGain(), at = ctx.currentTime + index * 0.09;
      oscillator.type = 'sine'; oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.035, at + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      oscillator.connect(gain); gain.connect(ctx.destination); this.voices.add(oscillator);
      oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at); oscillator.stop(at + 0.45);
    });
  }
  stop() { for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } } this.voices.clear(); }
  dispose() { this.disposed = true; this.enabled = false; this.stop(); void this.context?.close(); this.context = null; }
}
