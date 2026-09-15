import { jellyProfile, cushionProfile, loopProfile, starProfile, dumplingProfile } from '../soft-body/profiles';
import type { FreeShape } from '../toys/types';
import type { FreeBodyOptions } from './physics';

export const freeProfiles = { jelly: jellyProfile, cushion: cushionProfile, loop: loopProfile, star: starProfile, dumpling: dumplingProfile };
/** Damping and contact response retain a distinction between gel, foam and doughy shapes. */
export const freeFeel: Record<FreeShape, FreeBodyOptions> = {
  jelly: {},
  cushion: { damping: 8, edgeCompliance: 0.0032, restitution: 0.06 },
  loop: { damping: 3.3, edgeCompliance: 0.00025, volumeCompliance: 0.000000002, restitution: 0.2 },
  star: { damping: 4.5, edgeCompliance: 0.0024, volumeCompliance: 0.000000008, restitution: 0.13 },
  dumpling: { damping: 9, edgeCompliance: 0.0034, volumeCompliance: 0.00000002, restitution: 0.05 },
};
