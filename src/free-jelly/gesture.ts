import type { Point } from './physics';

/** Holding and pushing down build pressure; only lifting or sliding unload it. */
export function jellyPressure(anchor: Point, target: Point, age: number) {
  const dx = target.x - anchor.x, dy = target.y - anchor.y;
  const hold = 0.12 + 0.5 * (1 - Math.exp(-Math.max(0, age) / 0.16));
  const upward = Math.min(1, Math.max(0, dy) / 0.35);
  const lifting = upward * upward * (3 - 2 * upward);
  const sliding = Math.max(0, 1 - Math.abs(dx) / 0.65);
  return Math.min(1, hold + Math.max(0, -dy) / 0.85) * (1 - lifting) * sliding;
}
