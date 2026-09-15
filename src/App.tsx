import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { Collection } from './player/Collection';
import { ToyPlayer } from './player/ToyPlayer';
import { resolveToyRoute, toyLocationHref } from './player/navigation';
import type { ToyDefinition } from './toys/types';
import { readPreferences, writePreferences } from './player/preferences';

// Access to localStorage itself can throw in restricted browsing contexts.
const preferenceStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};

export function App() {
  const [preferences, setPreferences] = useState(() => readPreferences(preferenceStorage));
  const [initialRoute] = useState(() => resolveToyRoute(location));
  const [toy, setToy] = useState(initialRoute.toy);
  const [mode, setMode] = useState(initialRoute.mode);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hidden, setHidden] = useState(document.hidden);
  const Icon = toy.icon;

  // `dvh` is the best CSS answer for mobile browser chrome, but older iOS
  // versions and embedded webviews still report it inconsistently. Keep one
  // measured app viewport so the canvas and every fixed control share the
  // exact visible height instead of relying on page scrolling as a fallback.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const syncViewport = () => {
      const height = Math.max(1, Math.round(viewport?.height ?? window.innerHeight));
      root.style.setProperty('--app-height', `${height}px`);
      root.style.setProperty('--app-sheet-height', `${Math.max(1, Math.round(height * .88))}px`);
    };
    syncViewport();
    window.addEventListener('resize', syncViewport, { passive: true });
    viewport?.addEventListener('resize', syncViewport, { passive: true });
    return () => {
      window.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('resize', syncViewport);
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--app-sheet-height');
    };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const route = resolveToyRoute(location);
      if (route.replacement) history.replaceState(history.state, '', route.replacement);
      setToy(route.toy);
      setMode(route.mode);
      setCollectionOpen(false);
    };
    if (initialRoute.replacement) history.replaceState(history.state, '', initialRoute.replacement);
    const onVisibility = () => setHidden(document.hidden);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReducedMotion(media.matches);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('visibilitychange', onVisibility);
    media.addEventListener('change', onMotion);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('visibilitychange', onVisibility);
      media.removeEventListener('change', onMotion);
    };
  }, []);

  useEffect(() => { setPreferences(value => ({ ...value, lastToyId: toy.id })); }, [toy]);
  useEffect(() => { writePreferences(preferenceStorage, preferences); }, [preferences]);

  useEffect(() => {
    document.title = toy.name;
    document.querySelector('meta[name="description"]')?.setAttribute('content', toy.description);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', toy.theme.background);
  }, [toy]);

  const selectToy = (next: ToyDefinition) => {
    if (next.id !== toy.id) {
      const nextMode = next.primaryMode ?? 'resting';
      history.pushState(null, '', toyLocationHref(next.id, location));
      setToy(next);
      setMode(nextMode);
    }
    setCollectionOpen(false);
  };
  const theme = Object.fromEntries(Object.entries(toy.theme).map(([key, value]) => [`--toy-${key}`, value])) as CSSProperties;

  return <main className="toy" style={theme}>
    <header className="masthead">
      <button className="wordmark" onClick={() => setCollectionOpen(true)} aria-label="Open toy collection" aria-haspopup="dialog"><Icon /><span>{toy.name.toLowerCase()}<span className="wordmark-dot">.</span></span></button>
    </header>
    <ToyPlayer key={toy.id} toy={toy} mode={mode} paused={collectionOpen || hidden} reducedMotion={reducedMotion} sound={sound} onSoundChange={setSound} collectionOpen={collectionOpen} onOpenCollection={() => setCollectionOpen(true)} />
    <Collection open={collectionOpen} selected={toy} favoriteIds={preferences.favoriteIds}
      onToggleFavorite={id => setPreferences(value => ({ ...value, favoriteIds: value.favoriteIds.includes(id) ? value.favoriteIds.filter(item => item !== id) : [...value.favoriteIds, id] }))}
      onClose={() => setCollectionOpen(false)} onSelect={selectToy} />
  </main>;
}
