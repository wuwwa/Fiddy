import type { BonusRoundSnapshot } from '../toys/types';

/** A little visit, never a skill check. Only visible, unpaused scene time advances it. */
export class JellyBonusRound {
  phase: BonusRoundSnapshot['phase'] = 'idle';
  age = 0;

  get snapshot(): BonusRoundSnapshot { return { phase: this.phase }; }
  get active() { return this.phase !== 'idle'; }
  get animated() { return this.active; }
  get delight() {
    if (this.phase !== 'visiting' || this.age < 2) return 0;
    return Math.max(0, Math.cos((this.age - 3) * Math.PI / 3.8)) ** 12;
  }

  start() {
    if (this.active) return false;
    this.phase = 'waiting'; this.age = 0;
    return true;
  }
  finish() {
    if (!this.active || this.phase === 'returning') return;
    this.phase = 'returning'; this.age = 0;
  }
  step(elapsed: number, material: string) {
    if (!Number.isFinite(elapsed) || elapsed <= 0 || !this.active) return;
    this.age += Math.min(elapsed, 0.05);
    if (this.phase === 'waiting' && material === 'transformed') { this.phase = 'intro'; this.age = 0; }
    else if (this.phase === 'intro' && this.age >= 0.35) { this.phase = 'visiting'; this.age = 0; }
    else if (this.phase === 'visiting' && this.age >= 24) { this.phase = 'farewell'; this.age = 0; }
    else if (this.phase === 'farewell' && this.age >= 3) this.finish();
    else if (this.phase === 'returning' && material === 'ordinary') { this.phase = 'idle'; this.age = 0; }
  }
}
