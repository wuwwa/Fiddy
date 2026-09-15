# Daily-use release review

September 13, 2026. Product direction and future monetization research live in [PRODUCT_STRATEGY.md](PRODUCT_STRATEGY.md).

## Implemented behavior

- Opening a URL without a toy parameter restores the last valid toy saved in this browser. A restored entry gets an explicit toy URL using `replaceState`, so later Back/Forward navigation is independent of changing preferences. First-time visitors still start with Jelly.
- Explicit valid toy links win over preferences. Invalid/empty explicit IDs retain the Jelly fallback and existing URL correction. Other query parameters and fragments survive navigation.
- Collection cards have independent 48 × 48 CSS-pixel favorite buttons. Favorites sort first in registry order; other toys follow once each. Toggling keeps the dialog open and focus on the same button.
- All 15 toys have actual render captures totaling approximately **33 KB** in WebP format. Opening the collection mounts lazy images, not toy simulations. A failed preview falls back to the existing icon. Short mobile descriptions remain visible.
- The collection identifies Fiddy and its product promise. Player controls and gestures remain unchanged.
- `fiddy-preferences-v1` holds a version, favorite IDs and last toy ID. Reads validate IDs and remove duplicates; blocked, corrupt or quota-limited storage does not block play. Existing Silk palette and Shapes drawing data use their original keys.

No economy, payment, account, analytics, install/offline system or production deployment is part of this change. Existing uncommitted touch-interface edits were preserved.

## Automated and visual evidence

- **279 unit tests pass**, including route precedence, invalid storage, duplicate favorites and registry ordering. TypeScript and the production build pass.
- `qa/daily-use-smoke.mjs` passes against compiled assets: no preview requests before opening; favorite reorder and focus retention; restoration; explicit/invalid links; Back/Forward; removal of all favorites; blocked/corrupt storage; failed-image fallback; selection after image failure; Escape/focus return; 48-pixel favorite targets and usable collection scrolling at 390 × 844, 320 × 568 and 568 × 320.
- `qa/player-smoke.mjs` passes against the development server, where its physics diagnostics are available. It checks sound, navigation without reload, keyboard traversal through the whole collection, pinned close controls, scrolling and short landscape controls. Its tab sequence now includes each favorite button.
- `qa/production-smoke.mjs` passes against the compiled preview for all 15 toys with WebGPU preferred, including cancellation, reduced motion and cleanup. Zero runtime errors.
- Reviewed actual preview captures and phone/landscape collection screenshots. Corrected image sizing so wide cards use a bounded image box rather than an oversized intrinsic grid item.

Detailed local artifacts are in the Git-ignored `qa/artifacts/` directory. These are desktop Chrome checks, not physical-phone evidence.

## Timing and lifecycle audit

Desktop Chrome used an NVIDIA RTX 4070 SUPER. The dedicated timing probe uses an emulated 390 × 844 touch viewport, real dispatched touch events, three entry visits, three switching cycles and ten seconds of moving contact per representative toy. It instruments animation callback timestamps; this is not GPU presentation timing or a thermal endurance test. Local entry has no network throttling. Readiness is observed through the shared player's ready state, with polling/automation overhead.

| Measurement | Observed result |
|---|---|
| Local Jelly entry, browser cache disabled | 1,203 ms to observed ready; 208 ms navigation TTFB |
| Local Jelly entry, warm browser cache | 813 ms and 791 ms to observed ready |
| Selection to ready, three cycles | Jelly 299–424 ms; Silk first 801 ms then 128–132 ms; Dust 48–49 ms; Tide 51–300 ms |
| Jelly, ten-second touch sequence | 6.1 ms median / 6.1 ms p95 animation intervals |
| Magnetic Dust, ten-second touch sequence | 18.2 ms median / 18.3 ms p95 |
| ASCII Tide, ten-second touch sequence | 6.1 ms median / 6.1 ms p95 |
| Wider 1200 × 900 production probe | Dust 30.3 ms median / 36.4 ms p95; Tide 18.2 / 24.2 ms |
| Fly HTTP fetch, first observed request in final pass | HTTP 200 in 157 ms, including response body |
| Fly HTTP fetch, subsequent requests | HTTP 200 in 49–76 ms |
| Twelve Jelly/field lifecycle cycles per renderer | Both pass; warm-up-to-end heap growth 765,328 bytes WebGPU / 756,080 bytes WebGL; final DOM 374 nodes / 204 listeners on both |

Switch timing excludes the collection entrance animation but includes automation dispatch/readiness polling. These are small samples, not stable benchmarks or statistical estimates. The much shorter intervals on desktop hardware must not be interpreted as iPhone FPS. The wider production probe uses separate instrumentation and gestures; its results establish a reason to investigate viewport sensitivity, not a controlled scaling factor.

Browser-cache-cold and warm local entry are distinct from a hosting Machine cold start. The final Fly requests were observational and did **not** establish that the Machine was stopped. The earlier [deployment review](DEPLOYMENT_REVIEW.md) recorded an approximately nine-second cold-start check including a follow-up status check; neither that measurement nor HTTP-only timings equal toy-ready time. No production Machine was stopped or reconfigured here.

**Prioritized next performance work:**

1. **Magnetic Dust on real phones.** It remains the clearest frame-budget concern on desktop, especially at larger viewports. Profile simulation and drawing separately on minimum intended hardware before deciding whether to reduce particle count, resolution or update frequency. Preserve visible touch response and material character.
2. **Confirm naturally cold launch behavior.** With deployment access and a recorded stopped state, measure navigation through toy-ready after natural idling. Compare a warm baseline on the same device/network. Only then evaluate keeping Fly warm or moving static delivery; no cost or hosting change is made here.
3. **Jelly and first Silk readiness.** Profile renderer initialization and first-use compilation on physical devices. Warm browser cache still leaves around 0.8 seconds before Jelly is ready on this desktop run. Avoid adding collection preloading that launches simulations or spends idle battery without evidence.
4. **ASCII Tide viewport sensitivity.** Its emulated phone-sized run is much lighter than the wide desktop probe. Verify canvas work and character density across phone sizes and orientation before changing the model. Do not classify it as universally slow based on the wide probe alone.

Evidence: `daily-performance.json`, `daily-production.txt`, `daily-lifecycle-webgpu.txt`, and `daily-lifecycle-webgl.txt` in `qa/artifacts/`. No runtime errors were recorded in the timing probe.

## Physical-iPhone validation — not yet conducted

This workspace has no connected physical-iPhone test session or recruited participants. No thermal, battery, haptic or usability result is claimed. These remain release gates for a broad mobile launch, with the following ready-to-run protocol.

Test the oldest intended supported iPhone and a current model; record exact model, OS, browser, display refresh setting, battery level, charging state, room conditions and network. Select minimum supported hardware only after this evidence. Test a foldable separately if available; do not assume its second display permits the intended app arrangement.

1. From a fresh browser state, open the site and discover one gesture without instruction. Repeat after saving a favorite and after closing/reopening Safari. Check explicit toy links and browser Back/Forward.
2. Use Jelly, Putty and Silk one-handed in portrait. Record missed contacts, unintended scrolling, fatigue, ability to find Reset/Toys and favorite-button reach. Repeat in landscape with browser bars visible.
3. Start music or a video, enable toy sound, connect/disconnect headphones, receive an interruption, then resume. Record whether the primary audio is unexpectedly stopped and whether sound needs a fresh tap.
4. Background/resume, lock/unlock and rotate during a hold. Confirm no stuck contact, accidental reset, lost favorite or uncontrolled sound. Inspect safe areas on actual hardware.
5. Run a **15-minute session per representative toy**, prioritizing Jelly, Magnetic Dust and ASCII Tide. Keep brightness, charging and room conditions consistent. Record frame timing with remote inspection where available at minutes 1, 5, 10 and 15; report tool overhead. Log thermal state if exposed, otherwise label warmth as subjective. Record battery percentage but do not treat a short percentage change as a precise energy measurement.
6. Compare sustained timing with the first minute and note visible stutter, input lag, thermal warnings and crashes. Any stuck input, crash or lost selection is a failure. Target responsive 60 Hz play where supported; a stable 30 Hz mode is a possible subsequent decision, not implemented or guaranteed here.

## Adult usability pilot — not yet conducted

Recruit five consenting adult participants without claiming the product treats a condition. No recruitment messages were sent. Use pseudonymous notes with permission; no analytics SDK is needed for this exploratory pilot.

- Give each person the site without a tutorial. Observe a two-minute free exploration: first gesture, first toy switch, confusion and accidental actions. Do not explain favorites until the unaided attempt is recorded.
- Ask them to find a favorite and reopen it from a fresh visit. Record success, steps, and whether the result matched their expectation.
- Let them use it alongside a chosen low-risk activity for ten minutes. Ask whether it helped occupy their hands or repeatedly demanded visual attention, and which materials felt different.
- At a consented follow-up 24–72 hours later, ask whether they returned voluntarily before the follow-up and which toy they chose. Do not send a product reminder first. This is qualitative evidence, not a statistically meaningful retention estimate.
- Pilot gate: at least four of five discover a gesture and reopen their chosen toy unaided; no repeated critical navigation problem; record attention interruptions verbatim. If fewer succeed, revise discovery or access before adding economy features. Report non-return reasons even if the interface passes.

## Reproducing checks

With a development server on port 5174:

```powershell
$env:QA_ORIGIN='http://127.0.0.1:5174'
node qa/player-smoke.mjs
# Regenerates tracked images; use only when toy appearance changes.
node qa/capture-previews.mjs
```

After `npm test` and `npm run build`, start `npm run preview -- --port 4173 --strictPort` in another terminal. Run timing and graphics checks sequentially:

```powershell
$env:QA_ORIGIN='http://127.0.0.1:4173'
node qa/daily-use-smoke.mjs
node qa/production-smoke.mjs
node qa/lifecycle-smoke.mjs
node qa/lifecycle-smoke.mjs --webgl
node qa/daily-performance.mjs
```

The timing script also makes four read-only requests to the current Fly site; those measure the deployed version, not this unpublished release. Preview captures are screenshots of this repository's toys with controls hidden for capture, not generated concept art. Chrome's executable can be overridden with `CHROME_PATH`.
