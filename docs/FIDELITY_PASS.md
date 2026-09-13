# Collection fidelity pass

Scope: all twelve experiences other than Magnetic Dust. The refinement and local
validation pass is complete. The default landing, thirteen-entry collection,
navigation, accessibility, reduced motion, and local-only delivery remain intact.

## Acceptance evidence

For every experience, inspect rest, sustained interaction, fast input, release,
reset, narrow layout, and pause/switch cleanup. Require a distinct visual material
or composition, direct input with no lost gestures, convincing secondary motion,
bounded prolonged use, and explicit ownership of animation and graphics resources.
Use rendered output to judge appearance, numerical tests for the relevant mechanics,
and actual browser checks for input and graphics behavior. Passing tests alone does
not establish visual fidelity.

## Work inventory

- ASCII Tide: added a connected damped membrane for traveling wakes, 120 Hz
  integration, preserved wake state on resize, slope/elevation lighting, six atlas
  tones, and stable character identities. New tests prove propagation beyond the
  touched node, symmetry, 30/120 Hz agreement, long-hold bounds, and reset. Actual
  Canvas checks verify touch, reduced motion, pause, reset pixels, and disposal.
- Liquid Light: added midpoint backtracing, limited MacCormack dye transport,
  velocity smoothing, corrected projection order/gradient, enforced boundary flow,
  higher simulation/dye resolutions, and distance-driven color progression.
  The opening includes the complete palette. Rendered slow strokes, fast curls,
  12-second release, and 390-pixel width show separated smooth ribbons. GPU tests
  verify translation error at 47.8% of first-order transport with no new extrema,
  resolved divergence reduced from 7.51 to 2.92 RMS, 720 bounded stress steps,
  unforced decay, resize preservation, graphics ownership, and context recovery.
  Stroke force and dye now integrate over each segment instead of multiplying with
  input frequency or subdivisions. The same coalesced gesture at 30/60/120 Hz
  reduced momentum spread from 2.2923× to 1.0006× and dye spread from 1.7292× to
  1.0001× in actual GPU buffers. Updated slow, fast, and narrow poses were inspected.
  Taps remain restrained localized blooms with balanced, budgeted momentum.
- Silk: added anisotropic extension constraints along warp, weft, and both bias
  directions, alternating solver sweeps, consistent corrected velocities, and a
  support-plane bound. A representative long diagonal pull reduced maximum thread
  length from 2.251× to 1.188× while retaining 0.77 units of lateral travel. Tests
  cover sustained grips, extreme corner reversals, complete recovery, drift-free
  rest, and 30/120 Hz consistency. Original down coordinates now choose the grip
  even after a between-frame pointer move; CSS resizing releases capture before
  moving the camera. Actual browser checks pass for both changes. Center/corner
  folds and the 390×844 layout were inspected. The hem follows deformed normals;
  dynamic buffers and cached resting heights avoid needless work. A local CPU
  measurement averaged 2.62 ms per 60 Hz frame with 120 Hz simulation; this is not
  a GPU or phone performance claim. Pearl, Sand, and Ink finishes remain intact.
- Jelly, Cushion, Loop, Star, Dumpling: reviewed the other task's current materials,
  deformed silhouettes, and mobile compositions. Shared mechanics have independent
  multi-contact pressure, rebound, retained flicks, and finite recovery tests.
  Optimized surface updates preserve reference positions, normals, and bounds.
  The final recorded WebGL and WebGPU surface runs both pass, including actual
  contacts and release. A reproduced Star triangle-seam precision miss is fixed
  with a subpixel ray retry; tests retain empty space and the Loop hole.
- Swirl and Shapes: inspected spiral depth and flowing Cursor/Heart compositions.
  `/qa/astra-smoke.html` passes actual GPU particle travel, every preset's resource
  replacement, speed controls, drawing-mode pause/cancel, phone resize, complete
  orientation reset, reduced motion, disposal, and six repeated abort/switches.
  Numerical tests cover custom multi-stroke paths, open ends, and intersections.
- Jelly Slice and Jelly Prism: inspected refractive cut faces, internal bubbles,
  desktop separated halves, and phone cuts. The other task's recorded browser
  run passes slow resistant cutting, audio ownership, repeated cuts, mobile, and
  48-piece stress. Numerical tests verify conservation and bounded fragments.

Completed gates: full tests and production build; per-experience rendered evidence;
navigation and repeated switching across all twelve in-scope pages. Physical-device
performance and touch feel require hardware and must not be inferred from desktop
emulation.

## Final local validation

2026-09-12: 223 tests passed; production build passed. The build retains the existing
large Three.js chunk warning. The new browser harnesses also pass TypeScript checks.
Reproducible field evidence: `/qa/fields-smoke.html`, `/qa/fluid-transport.html`,
`/qa/fluid-poses.html`, and `/qa/tide-poses.html`. The latter two freeze scripted
fluid poses or provide held keyboard input for visual review; they are QA pages,
not production controls. The production toy modules remain independently loaded.

`/qa/dust-silk.html` now passes 12 browser checks, including the attached-patch
burst and camera-resize cancellation. `/qa/collection-fidelity.html` runs actual
collection links, keyboard input, reset, pause, Back/Forward, and refresh across
all twelve in-scope pages. The global frame tracer distinguishes the single
Three.js common-renderer node-clock/inspector callback from toy animation: library
source and a captured callback stack confirm that it does not render a paused toy.
It must be disposed on switching; duplicate callbacks or any paused toy callback
fail the audit. Both 1100×760 and 390×844 runs pass all fourteen checks: twelve
pages, Back/Forward, and direct-link refresh. Shapes' hidden drawing editor is
counted separately from its single playable canvas. The thirteen-entry collection
and the prior canvas's removal are checked on every switch.

After the final fluid adjustment, all fourteen field robustness checks pass again:
720 stress steps remain finite, ten graphics targets stay bounded, reset reuses
allocations, all owned GPU resources are released, and context recovery works.
`/qa/fluid-input.html` reproduces the coalesced-gesture comparison above. This is
an event-batching test, not a claim of pixel-identical nonlinear flows at every
display refresh rate. Use `npx vite --config qa/vite-audit.config.ts --port 5181`
for a local audit without hot reload while other tasks edit the main preview.
