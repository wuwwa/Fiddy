# Primary toy behaviors

September 13, 2026: choosing a toy now chooses its behavior. Jelly and Dumpling lift and toss; Loop and Star stretch; Cushion compresses and recovers; Putty kneads and holds deformation; Dough folds and merges. The mode selector is removed. Gesture instructions remain available to screen readers.

Toy metadata determines behavior consistently across collection selection, entry, reloads and history. Legacy mode query parameters are removed without dropping other URL options or fragments. Saved mode choices no longer override behavior; favorites and the last toy remain intact. Legacy Free Jelly bookmarks resolve to Jelly.

Jelly's primary toss simulation does not include the grounded rupture effect. Grounded implementations remain in source. Dumpling retains its low-bounce, high-damping tuning; subjective landing feel still needs hands-on evaluation.

The following notes describe the earlier two-mode implementation and are historical.

---

# Resting and Free movement

September 13, 2026. Implemented locally; part of ordinary material refinement, before the [bonus experiment](BONUS_ROUNDS.md).

## Direction and behavior

Movement belongs to the toy, rather than creating a duplicate collection entry. **Jelly, Cushion, Loop, Star and Dumpling** each have one card and a **Lift & toss / Stretch** play-style selector in the player. The collection remains at 15 toys. Stretch uses each toy's existing grounded simulation (internally `resting`). Lift & toss uses the `free` simulation, supporting pressing, lifting, tossing, landing and catching under gravity on a plain stage.

Two independent UX reviews converged on gesture labels: “Resting” sounds inactive and “Free” does not explain the interaction. Grounded stretching and airborne pictograms reinforce the choices. The selector stays above the toy to avoid crowding the bottom controls, with Lift & toss first. The surrounding caption and reset note are omitted visually to keep the player quiet; the reset description remains available to screen readers. Native toggle buttons preserve keyboard focus through renderer changes and expose the selected state; an underline accompanies the selected fill. Automatic switching while dragging was rejected because pulling already means stretching in the grounded simulation and changing solvers discards deformation.

The selector refinement passed the production build and existing WebGPU mode browser checks across all five shapes, including persistence, history, rapid switching, focus retention, and compact portrait/landscape bounds. Desktop, 320×568 and 844×390 screenshots were visually reviewed. This establishes layout and behavior, not user-tested intuitiveness.

Each free shape uses its existing mould and material finish, with separate elasticity, damping and landing response. Cushion settles softly, Loop has a firmer elastic response, Star bends at its lobes, and Dumpling has a slower recovery. These are tuning intentions to compare through play, not evidence that users can already distinguish every material. Putty and Dough keep their specialized plasticity and kneading behavior; the other visual and particle toys have no movement toggle.

Switching movement **starts a fresh body**. The two solvers do not transfer deformed geometry. The player releases old input and disposes the previous renderer before mounting the chosen mode, preserves keyboard focus on the toggle, and shows loading until that renderer is ready. Sound and reduced-motion choices continue to apply. Reset operates on the current mode and does not change the saved movement choice.

The [earlier Free Jelly experiment](FREE_JELLY.md) records the original hypothesis and pressure correction. Grounded Free-mode holds use a broad pressure constraint: holding builds a squish, downward travel deepens it, upward travel unloads it and lifts the toy. Contact bounce is suppressed while pressing; rebound follows release. Pressure adapts to the current resting height so a Loop or Star lying flat can still compress. Keyboard interaction finds Loop's rim instead of aiming through its hole.

## Navigation and saved choices

- Each supported toy remembers its movement choice in the existing local preference record. `toyModes` is an optional, validated addition to version 1; favorites and per-toy saves remain intact. Unavailable or corrupt storage leaves usable session-only choices.
- Opening the site without a toy query restores the last toy and its mode. Collection links include the saved mode for their toy and preserve normal link behavior.
- An explicit toy link without a mode opens Resting. `?toy=cushion&mode=free` opens Free Cushion. Unsupported or invalid modes are removed from the URL. Invalid explicit toy IDs retain the existing Jelly fallback.
- Mode changes replace the current history entry; changing toys pushes an entry. Browser Back and Forward restore the toy and mode encoded in that entry.
- Legacy `?toy=free-jelly` links become `?toy=jelly&mode=free`. Legacy last-toy and favorite IDs become Jelly, with duplicates removed and the Free choice retained unless an explicit Jelly mode was already saved.
- Only preferences persist, not the current body geometry. Clearing browser data removes local choices and other local toy saves.

Local comparison: [Resting Jelly](http://127.0.0.1:4173/?toy=jelly), [Free Jelly](http://127.0.0.1:4173/?toy=jelly&mode=free), [Free Cushion](http://127.0.0.1:4173/?toy=cushion&mode=free).

## Implementation

`ToyDefinition.freePlay` provides optional copy and a lazy module loader. The registry stays light. The shared player selects the loader; only one simulation is mounted. The mode-specific instructions describe the active gestures.

The existing free solver now accepts shape topology and material parameters. Cushion, Star and Dumpling reuse lower-resolution versions of their existing moulds with subdivided render skins. Loop uses a tubular tetrahedral mesh with interior centreline particles: no tetrahedron spans its hole, and the hole is not pickable. The original grounded geometry resolution is unchanged. Free Jelly keeps its earlier body topology and material defaults.

Free modes are elastic bodies, not flowing liquids. They do not inherit the grounded solver's rupture, plasticity or saved geometry. The Resting modes retain their existing mechanics. There are no bonuses, rewards, new accounts, purchases, hosting changes or deployment in this change.

## Validation and next comparison

Automated coverage includes mode URLs, explicit versus stored choices, legacy migration, invalid storage, all five material topologies, volume, pressure, lifting and landing, and the hollow Loop mesh. Browser checks cover saved choices, reloads, Back/Forward, empty and migrated favorites, blocked storage, keyboard grabs, rapid mode changes, a single live renderer, and compact portrait and landscape controls.

Reproduce with development on port 5174 and the production preview on port 4173. Run browser scripts sequentially:

```sh
npm test
npm run build
node qa/player-smoke.mjs
node qa/daily-use-smoke.mjs
node qa/production-smoke.mjs --modes
node qa/production-smoke.mjs --modes --webgl
node qa/lifecycle-smoke.mjs --toy=jelly --mode=free
```

Validation on Windows Chrome:

| Check | Result |
|---|---|
| Unit suite | **303 passed**, including the existing pressure regressions and new shape, navigation and preference coverage |
| TypeScript / production build | Passed; Free rendering remains lazy-loaded |
| Mode browser checks | Passed on WebGPU and WebGL for all five shapes, keyboard targeting, saved choices, legacy migration, history, blocked storage and rapid switching |
| Shared player and daily-use checks | Passed, including collection focus and scrolling, favorites, previews, navigation and compact-screen controls |
| Lifecycle | Twelve Free Jelly → Liquid Light cycles passed on WebGPU; DOM nodes and listener counts stayed stable after warm-up, with 584,108 bytes of heap growth, below the existing 4 MiB threshold |
| Visual review | Reviewed all five lifted shapes and controls at 390×844, 320×568 and 844×390; no control overlap in those captures |

Raw logs and desktop captures stay in the ignored `qa/artifacts/` directory. These checks establish browser behavior, not sustained phone performance or subjective material satisfaction.

Physical-iPhone feel, performance and thermals remain unverified. Compare both movements with adults: unaided discovery of lifting, satisfaction of a landing and release, whether shapes feel distinct, and usefulness while attention is elsewhere. Observe voluntary returns separately from first-session novelty. Continue the [roadmap](PRODUCT_STRATEGY.md): **material refinement → voluntary-return evidence → Jelly bonus experiment → broader transformations → separate collecting and monetization decisions**.
