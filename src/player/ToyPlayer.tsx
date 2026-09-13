import { useEffect, useRef, useState } from 'react';
import type { ToyDefinition } from '../toys/types';
import { ToySession } from './ToySession';
import { CollectionIcon, ResetIcon, SoundIcon } from './Icons';

export function ToyPlayer({ toy, paused, reducedMotion, sound, onSoundChange, collectionOpen, onOpenCollection }: {
  toy: ToyDefinition;
  paused: boolean;
  reducedMotion: boolean;
  sound: boolean;
  onSoundChange(enabled: boolean): void;
  collectionOpen: boolean;
  onOpenCollection(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const session = useRef<ToySession | null>(null);
  const latest = useRef({ paused, reducedMotion, sound, onSoundChange });
  latest.current = { paused, reducedMotion, sound, onSoundChange };
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [interacting, setInteracting] = useState(false);
  const [supportsSound, setSupportsSound] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const Icon = toy.icon;

  useEffect(() => {
    setStatus('loading'); setError(''); setInteracting(false); setSupportsSound(false); setAudioError(''); setAudioBusy(false);
    const current = new ToySession(toy, host.current!, {
      onReady: audio => { setSupportsSound(audio); setStatus('ready'); },
      onInteractionChange: setInteracting,
      onError: message => { setError(message); setStatus('error'); setInteracting(false); },
      onSoundError: message => { setAudioError(message); latest.current.onSoundChange(false); },
    }, latest.current);
    session.current = current;
    void current.start();
    return () => { current.dispose(); if (session.current === current) session.current = null; };
  }, [toy, generation]);

  useEffect(() => { session.current?.setPaused(paused); }, [paused]);
  useEffect(() => { session.current?.setReducedMotion(reducedMotion); }, [reducedMotion]);

  const toggleSound = async () => {
    const current = session.current;
    if (!current || audioBusy) return;
    setAudioBusy(true); setAudioError('');
    onSoundChange(!sound);
    await current.setSound(!sound);
    if (session.current === current) setAudioBusy(false);
  };
  const reset = () => status === 'error' ? setGeneration(value => value + 1) : session.current?.reset();

  return <div className={`toy-player ${status === 'ready' ? 'is-ready' : ''} ${interacting ? 'is-playing' : ''}`} data-toy-id={toy.id} data-desktop-instructions={toy.copy.desktopInstructionsOnly || undefined}>
    <div className="scene-wrap">
      <div key={generation} ref={host} className="toy-host" />
      {status === 'loading' && <div className="loading" role="status"><span className="loading-mark"><Icon /></span>{toy.copy.loading}</div>}
      {status === 'error' && <div className="error-panel" role="alert"><Icon /><h2>Couldn’t load this toy</h2><p>{error}</p><button className="retry-button" onClick={reset}><ResetIcon />Try again</button></div>}
    </div>
    <section className="interaction-dock" aria-label={`${toy.name} controls`}>
      <p id="toy-instructions" className={`instructions ${toy.copy.touchInstructions ? 'instructions-pointer' : ''}`}>{toy.copy.instructions.map((instruction, index) => <span key={index}>{instruction}</span>)}</p>
      {toy.copy.touchInstructions && <p id="toy-touch-instructions" className="instructions instructions-touch">{toy.copy.touchInstructions.map((instruction, index) => <span key={index}>{instruction}</span>)}</p>}
      {toy.copy.rotationHint && <p id="toy-rotation-instructions" className="rotation-instructions">{toy.copy.rotationHint}</p>}
      <div className="control-cluster">
        <div className="control-pill floating-surface">
          {supportsSound && <><button className="sound-toggle" onClick={toggleSound} disabled={status !== 'ready' || audioBusy} aria-pressed={sound} aria-label={sound ? `Mute ${toy.name.toLowerCase()} sounds` : `Enable ${toy.name.toLowerCase()} sounds`}><SoundIcon enabled={sound} /></button><span className="control-divider" /></>}
          <button onClick={reset} disabled={status === 'loading'} aria-label={`Reset ${toy.name.toLowerCase()}`}><ResetIcon /><span>Reset</span></button>
        </div>
        <button className="collection-trigger floating-surface" onClick={onOpenCollection} aria-label="Open collection of toys" aria-haspopup="dialog" aria-expanded={collectionOpen}><CollectionIcon /><span className="collection-label-full">Collection</span><span className="collection-label-short" aria-hidden="true">Toys</span></button>
      </div>
      <p className="keyboard-hint" id="keyboard-instructions">{toy.copy.keyboardHint}</p>
      <span className="sr-only" role="status">{audioError}</span>
    </section>
  </div>;
}
