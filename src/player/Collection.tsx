import { useEffect, useRef, type CSSProperties } from 'react';
import { toys } from '../toys/registry';
import { toyLocationHref } from './navigation';
import type { ToyDefinition } from '../toys/types';

export function Collection({ open, selected, onClose, onSelect }: {
  open: boolean;
  selected: ToyDefinition;
  onClose(): void;
  onSelect(toy: ToyDefinition): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return <dialog ref={dialog} className="collection-dialog floating-surface" aria-labelledby="collection-title"
    onCancel={onClose} onClose={event => { if (!event.currentTarget.open) onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className="collection-heading">
      <h2 id="collection-title">Collection</h2>
      <button className="close-collection" onClick={onClose} aria-label="Close collection" autoFocus>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </div>
    <nav className="collection-list" aria-label="Toys">
      {toys.map(toy => {
        const Icon = toy.icon;
        const active = toy.id === selected.id;
        const theme = Object.fromEntries(Object.entries(toy.theme).map(([key, value]) => [`--toy-${key}`, value])) as CSSProperties;
        return <a key={toy.id} className={`collection-item ${active ? 'is-selected' : ''}`} aria-current={active ? 'page' : undefined} style={theme}
          href={toyLocationHref(toy.id, location)}
          onClick={event => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault(); onSelect(toy);
          }}>
          <span className="collection-art" style={{ background: toy.theme.background, color: toy.theme.accent }}><Icon /></span>
          <span className="collection-item-copy"><strong>{toy.name}</strong><span>{toy.description}</span></span>
          {active && <span className="collection-current">Selected</span>}
        </a>;
      })}
    </nav>
    <p className="collection-count">{toys.length} {toys.length === 1 ? 'toy' : 'toys'}</p>
  </dialog>;
}
