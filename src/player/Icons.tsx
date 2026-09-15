/** The same little body demonstrates the two gestures without relying on color. */
export function MovementIcon({ mode }: { mode: 'resting' | 'free' }) {
  return <svg className="movement-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {mode === 'resting' ? <>
      <path d="M4 26h24M8 23c-2-2-1-5 1-7l3-4c2-3 6-3 8 0l3 4c2 2 3 5 1 7Z" fill="currentColor" fillOpacity=".12" />
      <path d="M4 12V6m0 0h6M4 6l5 5m19 1V6m0 0h-6m6 0-5 5" />
    </> : <>
      <path d="M4 26h9M8 22c-1-6 1-13 7-16m-4-1 4 1-1 4" strokeDasharray="2 3" />
      <path d="M19 9c3-2 7 0 8 3s0 7-3 8-7-1-8-4 0-5 3-7Z" fill="currentColor" fillOpacity=".12" />
    </>}
  </svg>;
}

export function SoundIcon({ enabled }: { enabled: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    {enabled ? <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /> : <path d="m16 9 5 6m0-6-5 6" />}
  </svg>;
}
export function ResetIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 10a8 8 0 1 1 .7 6M4 4v6h6" /></svg>;
}
export function CollectionIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>;
}
