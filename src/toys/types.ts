import type { ComponentType, ReactNode } from 'react';

/** The player does not assume a particular rendering engine or even a canvas. */
export interface ToyController {
  reset(): void;
  dispose(): void;
  setSound?(enabled: boolean): void | Promise<void>;
  setPaused?(paused: boolean): void;
  setReducedMotion?(reduced: boolean): void;
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

export interface ToyDefinition {
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
