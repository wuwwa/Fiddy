import type { ComponentType, ReactNode } from 'react';

export type TransformationState = 'ordinary' | 'waiting' | 'entering' | 'transformed' | 'leaving';
export interface BonusRoundSnapshot {
  phase: 'idle' | 'waiting' | 'intro' | 'visiting' | 'farewell' | 'returning';
}

/** The player does not assume a particular rendering engine or even a canvas. */
export interface ToyController {
  reset(): void;
  dispose(): void;
  setSound?(enabled: boolean): void | Promise<void>;
  setPaused?(paused: boolean): void;
  setReducedMotion?(reduced: boolean): void;
  setTransformation?(enabled: boolean): void;
  startBonusRound?(): void;
  finishBonusRound?(): void;
}

export interface ToyPreferences {
  sound: boolean;
  reducedMotion: boolean;
  paused: boolean;
}

export interface ToyContext {
  signal: AbortSignal;
  theme: Readonly<ToyTheme>;
  preferences: Readonly<ToyPreferences>;
  onInteractionChange(active: boolean): void;
  onTransformationChange?(state: TransformationState): void;
  onBonusRoundChange?(state: BonusRoundSnapshot): void;
  onError(message: string): void;
}

export interface ToyModule {
  /** Resolve after the first usable frame or interface is ready. */
  mount(host: HTMLElement, context: ToyContext): Promise<ToyController | null>;
}

export interface ToyTheme {
  background: string;
  foreground: string;
  accent: string;
  muted: string;
  surface: string;
  border: string;
}

export type ToyMode = 'resting' | 'free';
export type FreeShape = 'jelly' | 'cushion' | 'loop' | 'star' | 'dumpling';

export interface ToyDefinition {
  primaryMode?: ToyMode;
  freePlay?: { copy: ToyDefinition['copy']; load(): Promise<ToyModule> };
  preview?: string;
  id: string;
  name: string;
  description: string;
  icon: ComponentType;
  theme: ToyTheme;
  copy: {
    loading: string;
    instructions: readonly string[];
    touchInstructions?: readonly string[];
    touchGuide?: readonly { gesture: string; description: string }[];
    desktopInstructionsOnly?: boolean;
    rotationHint?: string;
    keyboardHint: ReactNode;
  };
  load(): Promise<ToyModule>;
}
