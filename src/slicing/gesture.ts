import type { Point } from './model';

export interface ScreenPoint { x: number; y: number }
const HOLD_DELAY = 180, SWIPE_DISTANCE = 12;

/** One straight stroke, with constant storage regardless of pointer event rate. */
export class SliceGesture {
  mode: 'pending' | 'hold' | 'swipe';
  end: Point;
  screenEnd: ScreenPoint;
  private dirty = false;
  private movedAt: number;
  speed = 0;
  cut = false;
  constructor(readonly start: Point, readonly screenStart: ScreenPoint, readonly startedAt: number, canHold: boolean) {
    this.end = start; this.screenEnd = screenStart; this.mode = canHold ? 'pending' : 'swipe';
    this.movedAt = startedAt;
  }
  advance(now: number) {
    if (this.mode === 'pending' && now - this.startedAt >= HOLD_DELAY) this.mode = 'hold';
  }
  move(end: Point, screen: ScreenPoint, now: number) {
    this.advance(now);
    if (this.mode === 'pending' && Math.hypot(screen.x - this.screenStart.x, screen.y - this.screenStart.y) >= SWIPE_DISTANCE) this.mode = 'swipe';
    const distance = Math.hypot(screen.x - this.screenEnd.x, screen.y - this.screenEnd.y);
    if (distance > .5) { this.speed += (distance / Math.max(4, now - this.movedAt) - this.speed) * .5; this.movedAt = now; }
    this.end = end; this.screenEnd = screen; this.dirty = true;
  }
  consume() {
    if (this.mode !== 'swipe' || !this.dirty) return null;
    this.dirty = false;
    return { start: this.start, end: this.end };
  }
}
