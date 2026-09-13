# ASCII Tide and Liquid Light validation

Local robustness and fidelity pass, 2026-09-12. These checks cover the two field experiences; the existing soft-toy checks remain separate.

## Reproduce

- Run `npm test` and `npm run build`.
- With Vite running, open `/qa/fields-smoke.html` on that local server and select **Run checks**. The page runs the real Canvas 2D and WebGL2 engines and prints its results. It is a development harness and is not an entry point in the production build.
- Open `?toy=ascii-tide` and `?toy=liquid-light` for interactive checks. Test hover/hold, quick swipes, separate taps, keyboard control, Reset, Collection, Back/Forward, and resizing between desktop and phone widths.

## Verified results

- Current checkpoint: **181 tests passed**. Production build passed. The field/input suite has 15 tests and the new tide propagation suite has 3 tests.
- Input regression checks preserve complete gestures and distinct taps between frames, including final pointer-up coordinates. A bounded queue merges move samples under an input flood. Capture failure, cancellation, blur, keyboard-to-pointer handoff, coalesced input support, and disposal are handled.
- The real Canvas 2D harness verified visible deformation from a synthetic touch swipe completed before a render frame, exact initial pixels after Reset, stopped frame counts while paused, capture release on pause, and successful resume.
- Reduced-motion resting pixels remain identical. Enabling reduced motion after normal animation freezes the current phase without a jump; the unit test also checks resuming from that phase.
- Actual WebGL pixels verified two separate rapid-tap blooms and preservation of an off-center bloom after resizing from 800×600 to 390×844.
- GPU stress exercised 720 steps at a simulated 1/30 second per step: rapid strokes, sustained holds, and reduced motion. All 13,400,832 scalar channels across ten floating-point framebuffers were finite at 240, 480, and 720 steps, and after Reset. Observed maximum absolute values were 671.5, 657.5, 107.3125, and 8.6796875 respectively. No graphics errors were reported. An additional 360 unforced steps reduced maximum magnitude from 46.25 to 1, including the constant alpha channel; the opening no longer amplifies unresolved grid turbulence.
- Real allocation tracking found stable resource counts after resizing and Reset, and no remaining owned textures, framebuffers, shaders, programs, or vertex arrays after disposal.
- Forcing `WEBGL_lose_context` on a live player session reached the error path, removed the failed surface, and allowed a new session to become ready.
- Manual browser checks verified the final appearances and gestures of both experiences, seven-entry navigation, and no warnings after repeated switching. Narrow layouts were checked at 390×844 during the implementation pass; the robustness harness additionally exercises that size with actual graphics state.

## Fidelity additions

- Tide's connected membrane carries a local impulse through untouched neighbors.
  Unit tests verify symmetry, matching propagation at 30 and 120 frames per second,
  bounded elevation/velocity, preserved wake state on resize, and exact reset.
  The cached glyph atlas now has six tones; lighting responds to wake height and
  slope. Character identities stay stable as the field moves.
- Fluid uses midpoint backtracing and donor-limited MacCormack dye transport,
  following the scheme described in [GPU Gems 3, chapter 30](https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-30-real-time-simulation-and-rendering-3d-fluids).
  Velocity is advected and smoothed before pressure projection; dye then follows
  the projected velocity. Two owned scratch targets are reused for correction.
- `/qa/fluid-transport.html` compares production GPU shaders with an analytically
  translating Gaussian. L1 error fell from 44.423 to 21.223; peak retention rose
  from 0.576 to 0.842, without new extrema. A divergent flow fixture fell from
  7.514 to 2.921 RMS after projection. This establishes those numerical properties
  on the fixture, not universal accuracy for arbitrary fluid motion.
- `/qa/fluid-poses.html` provides repeatable opening, slow stroke, fast stroke,
  repeated bloom, release, and narrow-surface compositions. Slow and released
  ribbons retain smooth internal color boundaries and rounded curls. Fast extreme
  strokes can carry color to the viewport boundary. `/qa/tide-poses.html` provides
  a sustained vortex and release for visual inspection.
- Final all-thirteen-toy navigation and cross-collection audit is tracked separately
  in `FIDELITY_PASS.md`; earlier seven-entry navigation results are historical.
- Segment-integrated injection avoids multiplying momentum or dye with mouse
  sampling frequency. `/qa/fluid-input.html` sends one identical coalesced stroke
  sampled at 30, 60, and 120 Hz through the production GPU engine. Momentum spread
  falls from 2.2923× to 1.0006×; dye spread falls from 1.7292× to 1.0001×. This tests
  event batching, not pixel-identical trajectories across display refresh rates.
  After this adjustment the full fourteen field checks pass again; the 240/480/720
  stress checkpoints have maximum magnitudes 101.9375, 78.6875, and 11.1016.

## Limits

The field harness uses synthetic PointerEvents and substitutes pointer-capture bookkeeping on its own test canvas; real pointer-capture failure is tested separately. It is not a physical touchscreen test. Browser rendering was checked in the available Chromium-based preview, not every browser or GPU. The 720-step run is a bounded simulation stress test, not an hours-long endurance test. Graphics capabilities that are missing use the player's explicit error/retry path.
