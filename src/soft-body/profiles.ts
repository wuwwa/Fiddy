import type { FoleyMaterial } from '../audio/foley';

export interface SoftBodyFeel {
  foam?: { lateralExpansion: number; recoveryTime: number; volumeCompliance: number; maxCompression: number };
  kneading?: { followRate:number; speedLimit:number; workRate:number };
  plasticity?: { dwell:number; yield:number; rate:number; maxOffset:number; maxCompression:number };
  stiffness: number;
  damping: number;
  edgeCompliance: number;
  dragLimit: number;
  pressDragLimit: number;
  pullCompliance: number;
  pullReleaseTime: number;
  grabStrength: number;
  pressDepth: number;
  holdDepth: number;
  creepTime: number;
  pressSpring: number;
  pressDamping: number;
  returnSpring: number;
  returnDamping: number;
  tapKick: number;
  pokeKick: number;
  dentDepth: number;
  holdDentDepth: number;
  twistSpring: number;
  twistDamping: number;
  twistReturnSpring: number;
  twistReturnDamping: number;
}

export type SoftToyShape = 'pebble' | 'cushion' | 'butter' | 'loop' | 'star' | 'dumpling' | 'putty' | 'dough';
export type MaterialReaction = { kind:'solid' } | { kind:'pop'; threshold:number; relaxation:number; strainOnset:number };

export interface SoftToyProfile {
  label: string;
  shape: SoftToyShape;
  reaction: MaterialReaction;
  feel: SoftBodyFeel;
  material: {
    surface?: 'gel';
    color: number; roughness: number; transmission: number; thickness: number;
    ior: number; absorption: number; absorptionDistance: number;
    clearcoat: number; clearcoatRoughness: number;
  };
  rippleStrength: number;
  soundPitch: number;
  soundTexture?: FoleyMaterial;
}

export const jellyProfile: SoftToyProfile = {
  label: 'strawberry jelly', shape: 'pebble',
  reaction: { kind:'pop', threshold:1.9, relaxation:0.75, strainOnset:0.38 },
  feel: {
    stiffness: 19, damping: 4.2, edgeCompliance: 0.0014,
    dragLimit: 1.55, pressDragLimit: 0.98, pullCompliance: 0.0000108, pullReleaseTime: 0.25, grabStrength: 1000,
    pressDepth: 0.32, holdDepth: 0.45, creepTime: 0.32,
    pressSpring: 175, pressDamping: 22,
    returnSpring: 105, returnDamping: 8.3, tapKick: 1.35, pokeKick: 1.5,
    dentDepth: 0.24, holdDentDepth: 0.78,
    twistSpring: 62, twistDamping: 13, twistReturnSpring: 38, twistReturnDamping: 5.5,
  },
  material: {
    surface: 'gel',
    color: 0xffe5e5, roughness: 0.085, transmission: 0.9, thickness: 2.1,
    ior: 1.34, absorption: 0xec3852, absorptionDistance: 2.85,
    clearcoat: 0.06, clearcoatRoughness: 0.1,
  },
  rippleStrength: 0.5, soundPitch: 1, soundTexture: 'gel',
};

export const cushionProfile: SoftToyProfile = {
  label: 'memory cushion', shape: 'cushion',
  reaction: { kind:'solid' },
  feel: {
    stiffness: 7, damping: 18, edgeCompliance: 0.0035,
    dragLimit: 1.25, pressDragLimit: 0.58, pullCompliance: 0.000009, pullReleaseTime: 0.8, grabStrength: 650,
    pressDepth: 0.22, holdDepth: 0.42, creepTime: 1.1,
    pressSpring: 55, pressDamping: 24,
    returnSpring: 18, returnDamping: 17, tapKick: 0.8, pokeKick: 0.8,
    dentDepth: 0.20, holdDentDepth: 0.86,
    twistSpring: 38, twistDamping: 18, twistReturnSpring: 16, twistReturnDamping: 14,
  },
  material: {
    color: 0xb6a0e6, roughness: 0.34, transmission: 0.06, thickness: 1.6,
    ior: 1.43, absorption: 0x9b80cc, absorptionDistance: 2,
    clearcoat: 0.28, clearcoatRoughness: 0.25,
  },
  rippleStrength: 0.12, soundPitch: 0.64, soundTexture: 'cloth',
};

/** Dense slow-rise foam: the press is immediate, recovery takes several seconds. */
export const butterProfile: SoftToyProfile = {
  label: 'slow-rise butter stick', shape: 'butter',
  reaction: { kind: 'solid' },
  feel: {
    ...cushionProfile.feel,
    foam: { lateralExpansion: 0.10, recoveryTime: 1.6, volumeCompliance: 0.0015, maxCompression: 0.72 },
    stiffness: 5, damping: 26, edgeCompliance: 0.025,
    dragLimit: 0.7, pressDragLimit: 0.42, pullReleaseTime: 1.4,
    pressDepth: 0.38, holdDepth: 0.68, creepTime: 0.6,
    pressSpring: 70, pressDamping: 25,
    returnSpring: 9, returnDamping: 19,
    tapKick: 0.08, pokeKick: 0.08, dentDepth: 0.22, holdDentDepth: 0.52,
    twistSpring: 30, twistDamping: 22, twistReturnSpring: 9, twistReturnDamping: 18,
  },
  material: {
    color: 0xffe8a0, roughness: 0.64, transmission: 0, thickness: 0.9,
    ior: 1.4, absorption: 0xe6bc64, absorptionDistance: 2,
    clearcoat: 0.035, clearcoatRoughness: 0.5,
  },
  rippleStrength: 0, soundPitch: 0.48, soundTexture: 'foam',
};

export const loopProfile: SoftToyProfile = {
  label: 'mint loop', shape: 'loop',
  reaction: { kind:'pop', threshold:2.7, relaxation:1.0, strainOnset:0.38 },
  feel: {
    ...jellyProfile.feel,
    stiffness: 24, damping: 5.8, edgeCompliance: 0.0019,
    dragLimit: 1.35, pressDragLimit: 0.85, pullCompliance: 0.000013, pullReleaseTime: 0.3,
    pressDepth: 0.25, holdDepth: 0.37, creepTime: 0.24,
    returnSpring: 118, returnDamping: 9.5, tapKick: 1.1, pokeKick: 1.2,
    dentDepth: 0.18, holdDentDepth: 0.53,
    twistReturnSpring: 44, twistReturnDamping: 6.8,
  },
  material: {
    color: 0xb9f5d8, roughness: 0.095, transmission: 0.72, thickness: 0.72,
    ior: 1.38, absorption: 0x2caa78, absorptionDistance: 1.2,
    clearcoat: 0.24, clearcoatRoughness: 0.075,
  },
  rippleStrength: 0.32, soundPitch: 1.2, soundTexture: 'rubber',
};

export const starProfile: SoftToyProfile = {
  label: 'butter star', shape: 'star',
  reaction: { kind:'solid' },
  feel: {
    ...jellyProfile.feel,
    stiffness: 12, damping: 11, edgeCompliance: 0.0028,
    dragLimit: 1.3, pressDragLimit: 0.8, pullCompliance: 0.000014, pullReleaseTime: 0.55,
    grabStrength: 800, pressDepth: 0.23, holdDepth: 0.39, creepTime: 0.65,
    pressSpring: 85, pressDamping: 24, returnSpring: 36, returnDamping: 10,
    tapKick: 0.8, pokeKick: 0.9, dentDepth: 0.20, holdDentDepth: 0.63,
    twistSpring: 46, twistDamping: 16, twistReturnSpring: 25, twistReturnDamping: 10,
  },
  material: {
    color: 0xffdc8a, roughness: 0.25, transmission: 0.14, thickness: 0.9,
    ior: 1.4, absorption: 0xe5a448, absorptionDistance: 1.8,
    clearcoat: 0.18, clearcoatRoughness: 0.19,
  },
  rippleStrength: 0.18, soundPitch: 0.87, soundTexture: 'star',
};

export const dumplingProfile: SoftToyProfile = {
  label: 'soft dumpling', shape: 'dumpling',
  reaction: { kind:'solid' },
  feel: {
    ...cushionProfile.feel,
    stiffness: 5.5, damping: 20, edgeCompliance: 0.0038,
    dragLimit: 1.15, pressDragLimit: 0.65, pullCompliance: 0.000013, pullReleaseTime: 1.05,
    grabStrength: 720, pressDepth: 0.20, holdDepth: 0.40, creepTime: 1.3,
    pressSpring: 48, pressDamping: 24, returnSpring: 14, returnDamping: 17,
    tapKick: 0.65, pokeKick: 0.65, dentDepth: 0.18, holdDentDepth: 0.76,
    twistSpring: 32, twistDamping: 19, twistReturnSpring: 12, twistReturnDamping: 14,
  },
  material: {
    color: 0xffe8c8, roughness: 0.44, transmission: 0.025, thickness: 1.5,
    ior: 1.42, absorption: 0xd6ab79, absorptionDistance: 2,
    clearcoat: 0.06, clearcoatRoughness: 0.32,
  },
  rippleStrength: 0.08, soundPitch: 0.53, soundTexture: 'dumpling',
};

export const puttyProfile: SoftToyProfile = {
  label:'soft putty', shape:'putty', reaction:{kind:'solid'},
  feel:{
    ...cushionProfile.feel,
    stiffness:14, damping:19, edgeCompliance:0.0028,
    dragLimit:1.1, pressDragLimit:0.72, pullCompliance:0.000022, pullReleaseTime:0.65,
    grabStrength:850, pressDepth:0.20, holdDepth:0.38, creepTime:0.85,
    returnSpring:40, returnDamping:16, tapKick:0.55, pokeKick:0.55,
    dentDepth:0.18, holdDentDepth:0.7,
    plasticity:{dwell:0.55,yield:0.09,rate:0.85,maxOffset:0.7,maxCompression:0.26},
  },
  material:{
    color:0xdfa080, roughness:0.47, transmission:0, thickness:1.4,
    ior:1.4, absorption:0xb77253, absorptionDistance:2,
    clearcoat:0.07, clearcoatRoughness:0.35,
  },
  rippleStrength:0.035, soundPitch:0.48, soundTexture:'putty',
};

export const doughProfile: SoftToyProfile = {
  label:'kneading dough', shape:'dough', reaction:{kind:'solid'},
  feel:{
    ...puttyProfile.feel,
    stiffness:21, damping:28, edgeCompliance:0.0018,
    dragLimit:1.05, pressDragLimit:0.86, pullCompliance:0.000032, pullReleaseTime:1.2,
    grabStrength:620, pressDepth:0.10, holdDepth:0.39, creepTime:1.8,
    pressSpring:38, pressDamping:27, returnSpring:22, returnDamping:23,
    tapKick:0.12, pokeKick:0.12, dentDepth:0.08, holdDentDepth:0.61,
    twistSpring:30, twistDamping:24, twistReturnSpring:18, twistReturnDamping:22,
    plasticity:{dwell:0.38,yield:0.065,rate:1.05,maxOffset:0.72,maxCompression:0.25},
    kneading:{followRate:4.2,speedLimit:0.55,workRate:0.32},
  },
  material:{
    color:0xffffff, roughness:0.7, transmission:0, thickness:1.4,
    ior:1.4, absorption:0xe4e0d5, absorptionDistance:2,
    clearcoat:0, clearcoatRoughness:0.8,
  },
  rippleStrength:0, soundPitch:0.42, soundTexture:'dough',
};
