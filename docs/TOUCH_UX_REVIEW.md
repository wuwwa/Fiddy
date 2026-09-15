# Browser touch UX review

The hold, drag, and release mechanics suit a touchscreen. The main problems were discovering those gestures, hitting small secondary controls, and fitting controls around the artwork in landscape.

## Changes

- Touch targets are at least 48 CSS pixels on phones and touch-capable devices, including sound, angle, zoom, palette, and drawing controls. The Shapes speed slider has a 48-pixel interaction area and a 28-pixel thumb.
- The phone toolbar uses a shorter Toys label, larger icons, and safe-area spacing. Navigation controls allow normal browser panning and pinch zoom; the play canvas retains its gesture ownership.
- Visible soft-toy hints introduce one-finger holding and dragging.
- Shapes and Swirl use the shared collection for mobile navigation. Their secondary controls sit around the artwork. Short landscape layouts and the drawing editor receive separate arrangements.
- The previous long-press selection suppression remains in place. Collection cards still scroll normally.

## Verification

- All 14 toys were checked at 320 × 568 and 568 × 320 browser viewports for visible control dimensions, overlap, clipping, and unwanted page scrolling. No issues remained in these checks.
- Representative layouts were also reviewed at 390 × 700, 667 × 375, 844 × 390, 768 × 1024, 1024 × 768, and 1366 × 768. Shapes additionally fits a 568 × 280 viewport, accounting for browser controls consuming landscape space.
- Browser checks exercised collection scrolling and selection, guide modality, Escape and button dismissal, focus return, paused rendering while help is open, zoom, speed, pause/play, drawing, Undo, and cancellation. The existing saved drawing was preserved.
- The production build and all 263 existing tests passed.

These are desktop-browser viewport and interaction checks, not physical phone tests. Actual iOS Safari/Android touch feel, pinch behavior, browser bars, and device safe areas still need hands-on verification.
