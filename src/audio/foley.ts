export type FoleyMaterial = 'gel' | 'putty' | 'cloth' | 'foam' | 'rubber' | 'star' | 'dumpling' | 'dough' | 'slice';
export type FoleyBank = { press: AudioBuffer[]; release: AudioBuffer[]; pop: AudioBuffer[]; motion: AudioBuffer };
export type FoleyLoader = (context: AudioContext, material: FoleyMaterial) => Promise<FoleyBank>;

// Envelopes and balance reinforce each material's own recordings.
export const foleyCharacter = {
  gel:      { cutoff: 1800, contact: .85, release: .50, motion: .32, attack: .006, rate: 1.02 },
  foam:     { cutoff: 1800, contact: .65, release: .38, motion: .45, attack: .022, rate: .82 },
  rubber:   { cutoff: 2900, contact: .60, release: .70, motion: .32, attack: .010, rate: 1.08 },
  star:     { cutoff: 3200, contact: .70, release: .48, motion: .25, attack: .008, rate: 1.12 },
  dumpling: { cutoff: 1700, contact: .85, release: .38, motion: .30, attack: .014, rate: .86 },
  putty:    { cutoff: 2400, contact: .72, release: .62, motion: .42, attack: .012, rate: .94 },
  dough:    { cutoff: 3000, contact: .80, release: .42, motion: .55, attack: .020, rate: .90 },
  cloth:    { cutoff: 4400, contact: .55, release: .38, motion: .42, attack: .025, rate: .92 },
  slice:    { cutoff: 3400, contact: .65, release: .65, motion: .35, attack: .008, rate: 1 },
} as const satisfies Record<FoleyMaterial, object>;

// Reuse decoded recordings across toy changes. Evict failures so a retry works.
const buffers = new Map<string, Promise<AudioBuffer>>();
async function buffer(context: AudioContext, name: string) {
  const key = `${context.sampleRate}:${name}`;
  let pending = buffers.get(key);
  if (!pending) {
    pending = (async () => {
      const base = import.meta.env?.BASE_URL ?? '/';
      const response = await fetch(`${base}audio/asmr/${name}.wav`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Could not load foley: ${name} (${response.status})`);
      return context.decodeAudioData(await response.arrayBuffer());
    })();
    buffers.set(key, pending);
    void pending.catch(() => { if (buffers.get(key) === pending) buffers.delete(key); });
  }
  return pending;
}

export const loadFoley: FoleyLoader = async (context, material) => {
  const prefix = `v2-${material}`;
  const selection = { press: [`${prefix}-press-a`, `${prefix}-press-b`], release: [`${prefix}-release-a`, `${prefix}-release-b`], motion: `${prefix}-motion` };
  const [press, release, pop, motion] = await Promise.all([
    Promise.all(selection.press.map(name => buffer(context, name))),
    Promise.all(selection.release.map(name => buffer(context, name))),
    // A rupture is a shorter, stronger dry contact, never a shared wet splat.
    Promise.all(selection.press.map(name => buffer(context, name))),
    buffer(context, selection.motion),
  ]);
  return { press, release, pop, motion };
};
