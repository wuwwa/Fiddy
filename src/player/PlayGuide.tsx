import { useEffect, useRef } from 'react';
import type { ToyDefinition } from '../toys/types';

export function PlayGuide({ open, toy, onClose }: { open: boolean; toy: ToyDefinition; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  const gestures = toy.copy.touchGuide ?? (toy.copy.touchInstructions ?? toy.copy.instructions).map(gesture => ({ gesture, description: '' }));

  return <dialog ref={dialog} className="play-guide floating-surface" aria-labelledby="play-guide-title"
    onCancel={onClose} onClose={event => { if (!event.currentTarget.open) onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className="guide-heading"><span>{toy.name}</span><h2 id="play-guide-title">How to play</h2></div>
    <ul className="guide-gestures">{gestures.map(({ gesture, description }) => <li key={gesture}><strong>{gesture}</strong>{description && <p>{description}</p>}</li>)}</ul>
    <p className="guide-keyboard">{toy.copy.keyboardHint}</p>
    <p className="guide-reset-note">You can reset the toy whenever you like.</p>
    <button className="guide-close" onClick={onClose} autoFocus>Back to playing</button>
  </dialog>;
}
