import type { CSSProperties } from 'react';
import type { BonusRoundSnapshot } from '../toys/types';
import './bonus-preview.css';

export function BonusPreview({ state, ready, paused, onStart, onFinish }: {
  state: BonusRoundSnapshot; ready: boolean; paused: boolean; onStart(): void; onFinish(): void;
}) {
  const active = state.phase !== 'idle';
  return <div className={`bonus-event bonus-phase-${state.phase}`} data-bonus-phase={state.phase} data-paused={paused || undefined}>
    {active && <div className="bonus-atmosphere" aria-hidden="true">
      <div className="bonus-aura" /><div className="bonus-rays" />
      {Array.from({ length: 18 }, (_, i) => <i className="bonus-dust" key={i} style={{
        '--x': `${(i * 37 + 9) % 100}%`, '--y': `${(i * 53 + 11) % 100}%`, '--delay': `${-i * 0.37}s`, '--size': `${2 + i % 3}px`,
      } as CSSProperties} />)}
    </div>}
    {!active && <section className="bonus-invitation" aria-label="Jelly awakens bonus preview">
      <button className="bonus-start" disabled={!ready} onClick={onStart} aria-label="Activate bonus" title="Activate bonus">
        <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <path d="m12 5 2.6 6.4L21 14l-6.4 2.6L12 23l-2.6-6.4L3 14l6.4-2.6L12 5Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M22 3v6m-3-3h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="23" cy="22" r="1.3" fill="currentColor" />
        </svg>
      </button>
    </section>}
    {active && <>
      <header className="bonus-hud">
        <button className="bonus-exit" onClick={onFinish} disabled={state.phase === 'returning'} aria-label="End bonus round">✕</button>
      </header>
      <span className="sr-only" role="status">{state.phase === 'visiting' ? 'Jelly is awake.'
        : state.phase === 'returning' ? 'Returning to Jelly.' : state.phase === 'farewell' ? 'Jelly is getting sleepy.' : 'Bonus starting.'}</span>
    </>}
  </div>;
}
