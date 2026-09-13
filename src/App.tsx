import { useEffect, useState, type CSSProperties } from 'react';
import { Collection } from './player/Collection';
import { ToyPlayer } from './player/ToyPlayer';
import { resolveToyRoute, toyLocationHref } from './player/navigation';
import type { ToyDefinition } from './toys/types';

export function App() {
  const [toy, setToy] = useState(() => resolveToyRoute(location).toy);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hidden, setHidden] = useState(document.hidden);
  const Icon = toy.icon;

  useEffect(() => {
    const onPopState = () => {
      const route = resolveToyRoute(location);
      if (route.replacement) history.replaceState(history.state, '', route.replacement);
      setToy(route.toy);
      setCollectionOpen(false);
    };
    onPopState();
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

  useEffect(() => {
    document.title = toy.name;
    document.querySelector('meta[name="description"]')?.setAttribute('content', toy.description);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', toy.theme.background);
  }, [toy]);

  const selectToy = (next: ToyDefinition) => {
    if (next.id !== toy.id) {
      history.pushState(null, '', toyLocationHref(next.id, location));
      setToy(next);
    }
    setCollectionOpen(false);
  };
  const theme = Object.fromEntries(Object.entries(toy.theme).map(([key, value]) => [`--toy-${key}`, value])) as CSSProperties;

  return <main className="toy" style={theme}>
    <header className="masthead">
      <button className="wordmark" onClick={() => setCollectionOpen(true)} aria-label="Open toy collection" aria-haspopup="dialog"><Icon /><span>{toy.name.toLowerCase()}<span className="wordmark-dot">.</span></span></button>
    </header>
    <ToyPlayer key={toy.id} toy={toy} paused={collectionOpen || hidden} reducedMotion={reducedMotion} sound={sound} onSoundChange={setSound} collectionOpen={collectionOpen} onOpenCollection={() => setCollectionOpen(true)} />
    <Collection open={collectionOpen} selected={toy} onClose={() => setCollectionOpen(false)} onSelect={selectToy} />
  </main>;
}
