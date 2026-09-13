export const ENTRANCE_DURATION = 0.95;

/** A brief stretch in the air, a soft landing, and a smaller settling rebound. */
export function entranceStretchAt(seconds: number, reducedMotion: boolean) {
  if(reducedMotion || seconds>=ENTRANCE_DURATION) return 1;
  const t=Math.max(0,seconds)/ENTRANCE_DURATION;
  return 1+0.12*Math.exp(-(((t-0.16)/0.12)**2))
    -0.18*Math.exp(-(((t-0.44)/0.11)**2))+0.055*Math.exp(-(((t-0.67)/0.11)**2));
}

/** A small rise into view followed by one soft landing; never loops. */
export function entranceAt(seconds: number, reducedMotion: boolean) {
  if (reducedMotion || seconds >= ENTRANCE_DURATION) return { scale: 1, lift: 0, shadow: 1 };
  const t = Math.max(0, seconds) / ENTRANCE_DURATION;
  const spring = 1-Math.exp(-7*t)*(Math.cos(10*t)+0.7*Math.sin(10*t));
  return {
    scale: Math.max(0.035, 0.035+0.965*spring),
    lift: 0.32*Math.exp(-9*t),
    shadow: Math.min(1, t*4),
  };
}
