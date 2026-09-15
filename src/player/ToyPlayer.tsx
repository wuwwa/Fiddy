import { useEffect, useMemo, useRef, useState } from 'react';
import type { ToyDefinition, ToyMode, TransformationState, BonusRoundSnapshot } from '../toys/types';
import { ToySession } from './ToySession';
import { CollectionIcon, ResetIcon, SoundIcon } from './Icons';
import { BonusPreview } from './BonusPreview';

export function ToyPlayer({ toy, mode, paused, reducedMotion, sound, onSoundChange, collectionOpen, onOpenCollection }: {
  toy: ToyDefinition;
  mode: ToyMode;
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
  const [sessionStatus, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [settled, setSettled] = useState<{ definition: ToyDefinition | null; generation: number }>({ definition: null, generation: -1 });
  const [interacting, setInteracting] = useState(false);
  const [supportsSound, setSupportsSound] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const [transformed, setTransformed] = useState(false);
  const [transformationState, setTransformationState] = useState<TransformationState>('ordinary');
  const [bonusRound, setBonusRound] = useState<BonusRoundSnapshot>({phase:'idle'});
  const bonusDemo = import.meta.env.DEV && toy.id === 'jelly' && mode === 'free'
    && new URLSearchParams(location.search).get('bonus') === 'demo';
  const materialDemo = import.meta.env.DEV && toy.id === 'jelly' && mode === 'free'
    && new URLSearchParams(location.search).get('bonus') === 'materials';
  const Icon = toy.icon;
  const definition = useMemo(() => mode === 'free' && toy.freePlay ? { ...toy, ...toy.freePlay } : toy, [toy, mode]);
  const copy = definition.copy;
  // A mode change must not advertise the retired renderer's ready state while
  // React is scheduling cleanup and the new lazy module is still loading.
  const status = settled.definition === definition && settled.generation === generation ? sessionStatus : 'loading';

  useEffect(() => {
    setStatus('loading'); setError(''); setInteracting(false); setSupportsSound(false); setAudioError(''); setAudioBusy(false);
    setTransformed(false); setTransformationState('ordinary');
    setBonusRound({phase:'idle'});
    const current = new ToySession(definition, host.current!, {
      onReady: audio => { setSupportsSound(audio); setSettled({ definition, generation }); setStatus('ready'); },
      onInteractionChange: setInteracting,
      onTransformationChange: setTransformationState,
      onBonusRoundChange: setBonusRound,
      onError: message => { setError(message); setSettled({ definition, generation }); setStatus('error'); setInteracting(false); setBonusRound({phase:'idle'}); },
      onSoundError: message => { setAudioError(message); latest.current.onSoundChange(false); },
    }, latest.current);
    session.current = current;
    void current.start();
    return () => { current.dispose(); if (session.current === current) session.current = null; };
  }, [definition, generation]);

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
  const previewTransformation = (enabled: boolean) => {
    setTransformed(enabled); session.current?.setTransformation(enabled);
  };

  return <div className={`toy-player ${status === 'ready' ? 'is-ready' : ''} ${interacting ? 'is-playing' : ''} ${bonusRound.phase !== 'idle' ? 'is-bonus-round' : ''}`} data-toy-id={toy.id} data-toy-mode={mode} data-desktop-instructions={copy.desktopInstructionsOnly || undefined}>
    <div className="scene-wrap">
      <div key={generation} ref={host} className="toy-host" />
      {status === 'loading' && <div className="loading" role="status"><span className="loading-mark"><Icon /></span>{copy.loading}</div>}
      {status === 'error' && <div className="error-panel" role="alert"><Icon /><h2>Couldn’t load this toy</h2><p>{error}</p><button className="retry-button" onClick={reset}><ResetIcon />Try again</button></div>}
    </div>
    {bonusDemo && <BonusPreview state={bonusRound} ready={status === 'ready'} paused={paused} onStart={() => session.current?.startBonusRound()} onFinish={() => session.current?.finishBonusRound()} />}
    {materialDemo && <section className="play-style bonus-preview" aria-label="Jelly bonus preview">
      <p className="bonus-preview-label">Jelly bonus preview</p>
      <div className="mode-switch floating-surface" role="group" aria-label="Compare Jelly materials">
        <button disabled={status !== 'ready'} aria-pressed={!transformed} onClick={() => previewTransformation(false)}><span>Ordinary</span></button>
        <button disabled={status !== 'ready'} aria-pressed={transformed} onClick={() => previewTransformation(true)}><span>Transformed</span></button>
      </div>
      <p className="bonus-preview-status" role="status" data-transformation={transformationState}>
        {transformationState === 'waiting' ? 'Release and let Jelly settle'
          : transformationState === 'entering' ? 'Softening…'
          : transformationState === 'leaving' ? 'Returning to ordinary…'
          : transformationState === 'transformed' ? 'Softer stretch · lingering wobble' : 'Press, lift and toss to compare'}
      </p>
    </section>}
    <section className="interaction-dock" aria-label={`${toy.name} controls`}>
      {/* Keep canvas descriptions accessible while leaving play open to discovery. */}
      <p id="toy-instructions" className="sr-only">{copy.instructions.join('. ')}.</p>
      {copy.touchInstructions && <p id="toy-touch-instructions" className="sr-only">{copy.touchInstructions.join('. ')}.</p>}
      {copy.rotationHint && <p id="toy-rotation-instructions" className="sr-only">{copy.rotationHint}</p>}
      <div className="control-cluster">
        <div className="control-pill floating-surface">
          {supportsSound && <><button className="sound-toggle" onClick={toggleSound} disabled={status !== 'ready' || audioBusy} aria-pressed={sound} aria-label={sound ? `Mute ${toy.name.toLowerCase()} sounds` : `Enable ${toy.name.toLowerCase()} sounds`}><SoundIcon enabled={sound} /></button><span className="control-divider" /></>}
          <button onClick={reset} disabled={status === 'loading'} aria-label={`Reset ${toy.name.toLowerCase()}`}><ResetIcon /><span>Reset</span></button>
        </div>
        <button className="collection-trigger floating-surface" onClick={onOpenCollection} aria-label="Open collection of toys" aria-haspopup="dialog" aria-expanded={collectionOpen}><CollectionIcon /><span className="collection-label-full">Collection</span><span className="collection-label-short" aria-hidden="true">Toys</span></button>
      </div>
      <p className="sr-only" id="keyboard-instructions">{copy.keyboardHint}</p>
      <span className="sr-only" role="status">{audioError}</span>
    </section>
  </div>;
}
