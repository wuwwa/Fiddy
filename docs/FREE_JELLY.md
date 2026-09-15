# Free Jelly: movement before rewards

September 13, 2026. Implemented local comparison experiment; not evidence of retention or physical-iPhone readiness.

**Historical experiment record:** the separate Free Jelly collection entry described below has been replaced by a **Resting / Free** toggle on Jelly, Cushion, Loop, Star and Dumpling. See [movement modes](MOVEMENT_MODES.md) for current behavior and validation. Old Free Jelly links and saved favorites migrate to Jelly. The measurements below describe the earlier Jelly-only release and its pressure correction.

## Why this experiment

The original Jelly fixes the bottom of its simulation cage to the floor and restores the rest toward a fixed mould. It supports local deformation, but cannot be picked up and thrown as a whole object. That common grounded behavior limits how different several soft toys feel.

The references supplied by the user—[Jelly Baby](https://jelly.scottsun.io/) and [Scott's jelly demonstration](https://x.com/scottstts/status/2096008241104711698)—prompted a narrower hypothesis: lifting, momentum and soft landings can deepen a toy without recreating an environment. These are visual and interaction references; this implementation uses Fiddy's own code, not the reference project's source.

**Hypothesis:** the anticipation of a landing, its squash and rebound, and the ability to catch the moving material are satisfying enough to invite voluntary repetition. This may also require more visual attention than the grounded toy. Test both effects; more movement is not automatically better for a fidget used beside another activity.

## Plan and implemented behavior

1. Keep original Jelly available as the comparison baseline. Add **Free Jelly** beside it in the collection, with its own lazy-loaded simulation and a static capture for discovery.
2. Replace fixed anchors with a free elastic body. Press to flatten a patch, pull upward to stretch and lift the whole object, then release to carry momentum.
3. Let gravity produce a landing with squash, rebound and settling at a new position. An off-centre grip can tilt and turn the material. Catch its current visible skin at any time.
4. Use a plain stage, a height-sensitive contact shadow and bounded travel. Frame the stage around player controls on portrait and landscape layouts. No environment downloads are needed.
5. Keep the player quiet. Mouse and one active touch have the same gestures. Extra fingers do not replace the active grip. Keyboard users hold Space, move with arrows and release Space to toss. Sound remains optional; reduced motion increases damping and reduces contact bounce.
6. Verify the material, lifecycle and existing player; compare the two Jelly experiences with adults before considering wider adoption.

Direct comparison links when the local production preview is running: [Free Jelly](http://127.0.0.1:4173/?toy=free-jelly) and [original Jelly](http://127.0.0.1:4173/?toy=jelly).

## Implementation choices

- `src/free-jelly/physics.ts`: 93 moving particles, including a weighted centre; 180 tetrahedra preserve local volume. Extended position-based distance and volume constraints allow deformation without pulling the body toward a fixed world position. Gravity, floor friction and bounded velocity provide containment. Travel limits act as invisible soft collisions, so a strong throw can bounce back from an edge.
- `src/free-jelly/surface.ts`: a closed coarse skin and two precomputed Loop subdivisions produce 1,442 render vertices / 2,880 triangles. Linear material bindings let raycast contacts follow the deformed skin, including while airborne. Surface normals and picking bounds refresh with the skin.
- `src/free-jelly/entry.ts`: one animation loop with fixed 120 Hz simulation steps, at most six per frame, and no suspended-time catch-up. Settled bodies stop drawing. Pointer cancellation, blur, collection pause, visibility changes and orientation changes release captured input. Pauses keep the shape; cancellation clears velocity to avoid an unintended throw on return.
- Rendering shares Fiddy's studio lighting, synthesized audio and Three renderer-disposal helpers. It supports WebGPU and the existing WebGL fallback, with adaptive resolution. The experiment adds no external requests or renderer to other toys.
- A final released endpoint is consumed once by the next scheduled physics step, so quick taps and strokes are not lost between frames. An immediate catch binds at the current shape rather than teleporting it to the original position.
- Grounded pressing uses a broad, rounded palm constraint. `src/free-jelly/gesture.ts` builds pressure during a hold and increases it with downward travel; upward and lateral travel unload it. While pressing, the vertical skin grip yields, motion is damped, and floor contact adds no restitution. Once released, the elastic body recovers normally. Airborne contacts remain skin grips until the floor supports a press.

This is a deliberately elastic body, not a liquid solver. It does not promise flowing topology, tearing or photorealistic refraction. The original Jelly retains its existing rupture and recovery. Free Jelly currently has no rupture, saved geometry, bonus, points, timer, purchase, additional settings or economy. Reset and reload restore its initial shape. Favorites and last-toy restoration use the existing shared preferences.

## Verification

Thirteen automated material and gesture tests cover unanchored resting, pressure and staged lifting, volume, momentum and landing rebound, catching a moving skin, between-frame input, duplicate release and cancellation, extreme repeated throws, bounds and resizing, invalid input, reset, reduced motion and a closed finite render skin. The pressure regressions exercise front, side and crown holds, sustained pushes beyond the floor, and the transition from pressing to lifting. They test the physics and surface in isolation, not device feel.

**Correction after hands-on feedback:** the first release's small crown-press test missed a material defect. A stationary front-face hold barely squashed, and a deep downward drag could make the body roll around the point grip and rise again. The input also removed hold pressure for any drag direction, including down. The corrected pressure model distributes the load, preserves downward pressure and suppresses contact bounce while held. In the regression simulation, ordinary height is about 1.56 units, a settled front hold is about 1.16, and a deep push about 0.93; it stays in floor contact and rebounds after release. These are solver measurements, not physical resistance or usability evidence.

Validation on Windows Chrome with an NVIDIA RTX 4070 SUPER:

| Check | Result |
|---|---|
| Unit suite | **292 passed**, including thirteen Free Jelly material and gesture tests |
| TypeScript and production build | Passed after the pressure correction; the Free Jelly simulation is a separate lazy chunk, approximately 18 kB before compression |
| Production collection smoke | Initial release: all 16 toys passed on WebGPU; the four-toy WebGL subset includes Free Jelly and also passed. No runtime errors were reported |
| Free Jelly touch and keyboard | Focused production checks passed again after the pressure correction on both graphics paths: front-face hold, downward compression, lift, second finger, cancellation, portrait 390×844, landscape 844×390, reduced motion and keyboard focus/grip/move/release |
| Shared player smoke | Passed navigation/history, dialog focus and dismissal, keyboard access to the last collection item, scrolling and compact-screen controls with the expanded registry |
| Repeated switching | Initial release: 12 Free Jelly → Liquid Light cycles passed on **both WebGPU and WebGL**; DOM nodes and listener counts stayed stable after warm-up. Post-warm-up heap growth was 772,520 and 788,396 bytes respectively, within the existing 4 MiB threshold |
| Visual review | Desktop live drag and release inspected; portrait, lifted and landscape captures reviewed for composition and control clearance. The pressure correction was additionally reviewed in front-hold, downward-press and lift captures. Collection preview captured from the running toy (1,252 bytes) |

The initial production sample recorded a 95th-percentile animation callback of 1.3 ms for Free Jelly on WebGPU and 0.9 ms on WebGL in these short runs. These are CPU callback samples in a high-refresh desktop browser, not GPU completion times, sustained-play results, or a phone performance claim. Raw output and captures are in the ignored `qa/artifacts/` directory.

Reproduce with the development server on port 5174 for player checks and production preview on port 4173 for the remaining checks:

```sh
npm test
npm run build
node qa/player-smoke.mjs
node qa/production-smoke.mjs
node qa/production-smoke.mjs --webgl
node qa/production-smoke.mjs --toy=free-jelly
node qa/production-smoke.mjs --toy=free-jelly --webgl
node qa/lifecycle-smoke.mjs --toy=free-jelly
node qa/lifecycle-smoke.mjs --toy=free-jelly --webgl
```

## What to learn next

Compare ordinary original Jelly and Free Jelly with adults, without rewards. Observe a first unaided gesture, whether they discover lifting and catching, whether the release feels satisfying, whether invisible boundaries feel confusing, and whether either toy is comfortable to use while attention is elsewhere. Record frustration and interruptions as well as enjoyment. Later, observe whether they reopen either toy voluntarily; a long first session alone is insufficient.

Physical iPhone sessions remain required: one-handed reach, thumb occlusion, Safari graphics and frame timing, audio coexistence, background/resume, portrait/landscape, and at least 15 minutes of sustained play with thermal observations. Desktop Chrome and phone-sized emulation are not iPhone evidence. Native haptics remain a separate feasibility task.

Use the results to choose Jelly's baseline and tune its material before returning to the [bonus experiment](BONUS_ROUNDS.md). The [product roadmap](PRODUCT_STRATEGY.md) remains **material refinement → voluntary-return evidence → Jelly bonus experiment → broader transformations → separate collecting and monetization decisions**.
