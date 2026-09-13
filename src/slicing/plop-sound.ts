/** Original, rounded gel foley. Rendered once when sound is enabled. */
export function plopBuffer(context: BaseAudioContext, kind: 'pull' | 'plop') {
  const rate = context.sampleRate, duration = kind === 'pull' ? 4.7 : .62;
  const buffer = context.createBuffer(2, Math.ceil(rate * duration), rate);
  let seed = 37261, low = 0, slower = 0;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296 * 2 - 1; };
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  for (let i = 0; i < left.length; i++) {
    const t = i / rate, noise = random();
    low += (noise - low) * (1 - Math.exp(-Math.PI * 2 * 380 / rate));
    slower += (noise - slower) * (1 - Math.exp(-Math.PI * 2 * 75 / rate));
    if (kind === 'pull') {
      // Almost tactile: a little low, damp friction beneath the main plop.
      const fade = Math.min(1, t / .05, (duration - t) / .05);
      const envelope = .65 + .23 * Math.sin(t * 8.4 + Math.sin(t * 3.1));
      const value = (low - slower) * .32 * envelope * fade;
      left[i] = value; right[i] = value * .96;
    } else {
      // A short falling bubble mode gives a plop, with a softer second lobe
      // adding mouth-like weight instead of a bell's sustained partials.
      const attack = 1 - Math.exp(-t / .009), decay = Math.exp(-t / .085);
      const phase = Math.PI * 2 * (76 * t + 148 * .026 * (1 - Math.exp(-t / .026)));
      const body = Math.sin(phase) * .7 + Math.sin(phase * 1.97 + .18) * .13;
      const delayed = Math.max(0, t - .026);
      const bubblePhase = Math.PI * 2 * (112 * delayed + 130 * .019 * (1 - Math.exp(-delayed / .019)));
      const bubble = Math.sin(bubblePhase) * (1 - Math.exp(-delayed / .006)) * Math.exp(-delayed / .043) * .17;
      const value = Math.tanh(body * attack * decay + bubble + low * .14 * attack * Math.exp(-t / .027));
      const tail = Math.min(1, (duration - t) / .04);
      left[i] = value * tail; right[i] = value * .98 * tail;
    }
  }
  return buffer;
}
