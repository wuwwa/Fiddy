import type { TransformationState } from '../toys/types';

/** A material blend, advanced only by the toy's existing fixed physics step. */
export class JellyTransformation {
  private progress = 0;
  private target = 0;
  private waiting = false;
  private duration = 1.25;

  get amount() { return this.progress * this.progress * (3 - 2 * this.progress); }
  get pending() { return this.progress !== this.target; }
  get state(): TransformationState {
    if (!this.pending) return this.target ? 'transformed' : 'ordinary';
    return this.waiting ? 'waiting' : this.target ? 'entering' : 'leaving';
  }

  request(enabled: boolean, duration = 1.25) {
    this.target = enabled ? 1 : 0;
    this.duration = Number.isFinite(duration) && duration > 0 ? duration : 1.25;
    this.waiting = this.pending;
  }

  step(elapsed: number, safe: boolean) {
    if (!this.pending) return;
    this.waiting = !safe;
    if (!safe || !Number.isFinite(elapsed) || elapsed <= 0) return;
    // Bonus arrival is brisk; ordinary comparisons and the return stay gentle.
    // Reversals keep their current value; grabs and flight freeze the blend.
    const travel = Math.min(elapsed, 1 / 30) / this.duration;
    this.progress = this.target > this.progress
      ? Math.min(this.target, this.progress + travel)
      : Math.max(this.target, this.progress - travel);
  }
}
