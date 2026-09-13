/** Keep the final rebound frames, then let a settled toy stop drawing. */
export class SoftToyActivity {
  private quietSeconds = 0;

  wake() { this.quietSeconds = 0; }

  /** True means another animation frame is needed. */
  update(elapsed: number, atRest: boolean) {
    if (!atRest) {
      this.wake();
      return true;
    }
    // A delayed frame or returning from a hidden tab cannot satisfy the whole
    // settle window. Observe several quiet frames before freezing the picture.
    const observed = Number.isFinite(elapsed) ? Math.max(0, Math.min(elapsed, 1 / 30)) : 0;
    this.quietSeconds += observed;
    return this.quietSeconds < 0.3;
  }
}
