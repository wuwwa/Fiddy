# Rare bonus transformations

Agreed direction recorded September 13, 2026. **A bonus is an experience, not a test of the person using it.** This principle supersedes the earlier six-star collection objective and the requirement to keep interacting during the bonus. The user also requested that the bonus explain itself through its behavior, without visible narration. Activation is deliberately manual, through a button. The older automatic eligibility and Surprises proposals below are reference material, not the current activation plan.

## Design principles

- The full experience is available while watching, squishing, tossing or doing very little. Precision, speed and effort do not improve the result.
- Interaction changes the material's movement and the character's immediate reactions. It does not earn progress, unlock spectacle or determine a better ending.
- No score, collection quota, target ring, winning screen, visible countdown or completion requirement. Decorative stars belong to the scene.
- Novelty comes from a transformed material and a character with its own life: expressions, playful movement, light and optional sound.
- The transition respects a held grip and the current motion. Safety can delay the physical morph; it never reduces what the bonus offers.
- Any future ordinary-play eligibility schedule remains separate from the experience itself. Faster or more skillful play does not improve a bonus.

## Current prototype: a little slime visit

Open `/?toy=jelly&bonus=demo` on the development server and tap the small **sparkle button beside Jelly’s name** (accessible label: **Activate bonus**). Its soft circular surface replaces the large gold call-to-action. The same Jelly becomes a glossy azure slime with an expressive face. Its awakening and gentle hops, wandering gaze, spontaneous happy moments and surrounding starlight unfold on their own. The person can freely handle it or simply watch.

The bonus arrives with a half-second physical morph and a 0.35-second reveal, followed by 24 seconds with the companion and a three-second sleepy farewell. The return and historical material comparison retain their gentler 1.25-second blends. These are visible, unpaused scene seconds; no clock is shown. Holding or throwing the body can delay the physical transition until release and landing. The exit button is always available. There is no result, inventory or performance counter.

The character mould preserves volume and settles approximately 19% taller than ordinary Jelly. The face now uses only two small rounded ink strokes, following the live skin through deformation and tumbling. They squint and curve into happy expressions; glossy eye highlights, cheeks and the open mouth were removed after the user found the face uncanny. Normal-motion gravity reaches 45% of ordinary gravity; bonus-only edge compliance is 1.7 times ordinary compliance to support a readable dome. Decorative stars and motes orbit the companion, with no hit detection or collection logic. Optional short chimes mark awakening and farewell; physical foley still follows touch.

Reset resets the body without restarting the visit. Collection menus, hidden tabs and pause stop scene time and sound. Returning to the page does not catch up missed time. Navigation disposes the companion and effects. Reduced motion retains the same visit and free interaction, with ordinary gravity, higher damping, no autonomous hops, static stars and no moving motes or rays. Reload starts ordinary Jelly; replay uses the existing renderer.

The only visible bonus UI is the development launch button and an exit control. Concise state announcements remain for screen readers. The original material comparison remains at `/?toy=jelly&bonus=materials`; both preview interfaces are excluded from production builds.

## Validation

The full suite passes **334 tests**, and the TypeScript/Vite build passes. Tests now check a complete visit without input, identical scene progression regardless of material movement after awakening, pause/stall handling, safe return, early exit and replay. Existing morph, face, audio and lifecycle checks remain.

Run `node --import tsx --test tests/bonus-round.test.ts tests/bonus-character.test.ts tests/bonus-audio.test.ts tests/slime-morph.test.ts tests/transformation.test.ts` for focused coverage. Browser checks use `QA_ORIGIN` and `node qa/production-smoke.mjs --bonus --fever`, with `--webgl` for the fallback renderer. They watch a full visit with zero fidget input, check natural return, then exercise optional touch, reset, pause, replay, reduced motion, compact layouts and disposal. These are desktop and emulated-touch checks; physical-phone feel remains untested.

## Superseded direction

The earlier Jelly Fever experiment asked the person to move the toy through six targets and awarded catch effects and a crown finale. Removing its explanatory copy did not remove that performance requirement. That objective and its score, catch logic, progress-dependent expressions and completion UI have now been removed. Future bonuses should follow the experience principles above.

The remaining schedule and material notes below record earlier decisions. Any reference there to **30 seconds of qualifying bonus interaction** is historical: the current bonus advances while visible, whether or not the person interacts.

## Historical first milestone: material comparison

Run the development server and open `/?toy=jelly&bonus=materials`. The clearly labeled **Jelly bonus preview** has Ordinary and Transformed buttons. Ordinary visits have no preview controls; the production build omits this development interface. This demonstration stays transformed until manually switched back. Reset retains the selected material; navigation away or reload starts a new ordinary session. There is no earned progress to save in this milestone.

The prototype adapts to Jelly's current lift-and-toss solver. Its edge compliance blends from 0.0018 to 0.0108 and internal damping from 1.7 to 1.105. Softer constraints give a slower rise after compression and a broader wobble. Volume constraints, gravity, grip mapping, velocity limits and collision bounds retain their existing settings. The surface blends toward a berry tint with slightly higher roughness. These are experimental comparison values, not physically calibrated material constants or final release tuning.

An eased blend takes 1.25 seconds of safe simulation time. Both entry and exit wait until no grip or unconsumed release endpoint remains, the body touches the stage, and maximum particle speed is below 0.65 world units per second. A fresh grab or airborne movement freezes a partial blend. Reversals continue from the current value. The same live positions, velocities, mesh, renderer and animation loop remain in use. Collection pause, hidden tabs and disposal use the existing lifecycle. Pending blends keep a resting scene awake until completion; fully settled materials sleep normally. Reduced motion retains its existing higher damping and reduced landing bounce. Sound uses the existing bank and levels.

Jelly's current solver has no rupture system or separate surface-wave layer. The prototype's longer response comes from deformation of the body itself. Grounded rupture code remains separate; this work does not restore it.

Validation recorded for this milestone:

- `npm test`, `npm run build` and `git diff --check` passed. The stale registry test now reflects the existing Butter-first default. Compiled production JavaScript was checked to confirm the preview interface is absent.
- Physics/session tests cover continuous requests, deferred holds and release endpoints, landing, catching during a blend, reversals, invalid time inputs, retained material on Reset, retired callbacks, volume bounds, extreme throws and both motion settings.
- `node --import tsx qa/bonus-study.ts` compares matched simulated presses. At 0.125 seconds after release, ordinary Jelly has risen to a height of 1.657 world units and transformed Jelly to 1.041. Their resting heights are 1.557 and 1.305. A sustained quiet-speed criterion is first met after approximately 5.18 and 5.90 seconds respectively. Maximum release-sequence volume errors are under 0.93% and 0.27%, with no safety resets. These are deterministic solver observations, not evidence of user enjoyment or phone performance.
- With the development server running, set `QA_ORIGIN` and run `node qa/production-smoke.mjs --bonus`, then `node qa/production-smoke.mjs --bonus --webgl`. Both passed with no browser errors. Checks cover renderer reuse, keyboard and trusted touch input, cancellation, pause/resume, simulated document visibility, compact portrait/landscape bounds, reduced motion, repeated reversals and isolation from Dumpling. Desktop and phone-sized captures were visually reviewed. Hidden-document simulation does not establish real lock/unlock behavior.

Next: compare the feel on a physical phone before selecting final parameters, then implement the schedule, engagement reporting and storage specified below. Physical-device comparison and adult evaluation have not been conducted.

## Purpose and sequence

Fiddy currently offers simple toys with promising physical interactions; repeat-use appeal remains unproven. First deepen Jelly, Putty and Silk through distinct material behavior, satisfying releases, discoverable gesture depth and usefulness with little visual attention. Evaluate ordinary play independently so rewards cannot conceal weak mechanics.

The roadmap is **material refinement → voluntary-return evidence → Jelly bonus experiment → broader transformations → separate collecting and monetization decisions**.

Ordinary fidgeting can eventually earn a rare, temporary transformation of the current toy. The transformed material is the reward. “Slot-like” describes the unpredictable arrival of a bonus, not a separate casino interface. The distant guarantee is a fallback, not a visible goal to chase.

## Earlier timed-material specification: Jelly only

- Jelly becomes a slower-flowing material with a more lingering rebound and broader wobble. A restrained appearance change communicates the state. The same gestures must produce a perceptibly different physical response; a palette change alone is insufficient.
- Preserve familiar lift-and-toss gestures, current live deformation and momentum. Bonus state must not replace or reset the simulation.
- Earn eligibility during ordinary play, then activate only after release and safe settling on the stage. Blend into the new response without a discontinuity.
- Run the transformation for **30 seconds of qualifying interaction**. Pause the remaining duration during inactivity, menus, navigation or backgrounding. At exhaustion, restore ordinary behavior after release and safe settling, using a smooth transition.
- Preserve earned eligibility and remaining bonus time across visits. Existing toy geometry need not persist across reloads; ordinary scene startup still applies.
- Add an optional **Surprises** setting to the future collection interface, **off by default for the initial experiment**. Turning it off restores ordinary play smoothly and pauses saved progress, eligibility and remaining duration. Re-enabling resumes that state; it does not award a fresh bonus.
- Respect mute and reduced motion. There are no separate reels, prize screens, collectible rewards, countdowns, purchase prompts or louder audio in this prototype.

The first milestone supplies experimental compliance, damping and appearance values. Refine them through hands-on comparison before choosing release values. Preserve stable contact, bounded deformation and the established recovery behavior throughout.

## Rarity schedule

The agreed target is **approximately ten minutes of qualifying normal-play time on average, with a two-hour ceiling**. Time accumulates across visits. An average is not a countdown or a promise of a bonus every ten minutes.

| Rule | Initial experiment value |
|---|---|
| Initial period without a trigger | First 60 qualifying active seconds of each cycle |
| Random opportunity | Once per additional five qualifying active seconds |
| Probability at each opportunity | Independent probability of 1/108, approximately 0.926% |
| First random opportunity | 65 qualifying active seconds into the cycle |
| Guaranteed eligibility | 7,200 qualifying active seconds into the cycle |
| Bonus duration | 30 qualifying active seconds, excluded from normal-play progress |
| New cycle | Begins after the bonus has ended and ordinary behavior is restored |

At 7,200 seconds, award eligibility without requiring a successful random roll. Eligibility may wait for a safe transition after release and settling; the ceiling guarantees earning the transformation, not changing physics during an active gesture.

For independent rolls, before the negligible effect of the ceiling, expected eligibility time is `60 + 5 × 108 = 600` seconds. The median is **435 seconds (7 minutes 15 seconds)** and the 95th percentile is **1,675 seconds (27 minutes 55 seconds)**. These are mathematical schedule properties, not measured user behavior. The guarantee is deliberately much farther away than typical eligibility.

Keep partial five-second progress and completed-roll bookkeeping across visits. Resetting a toy or reloading must not erase progress, replay a completed random opportunity or grant fresh rolls. Accrual stops when eligibility is earned; do not stack bonuses while waiting to enter one. Normal-play progress also remains stopped during the transformation and its exit transition.

Progress remains hidden during play. Explain the mechanism through optional collection information without suggesting a random result is “almost” due. The documentation can state the average, chance and ceiling; the play surface should not pressure users to continue until a deadline.

## Qualifying activity

Count deliberate interaction with the actual toy, including meaningful holds. The initial prototype counts only Jelly because it is the only participating toy. Playing another toy neither consumes Jelly's saved bonus nor advances its cycle.

Exclude empty-space input, autonomous animation, released flight and settling without qualifying interaction, background or inactive instances, collection menus and stalled-frame catch-up. Restoring a tab must not convert elapsed wall-clock time into earned time. Multiple fingers and faster tapping cannot earn more than one second of progress per elapsed second.

Toy-specific engagement detection must consider accepted contact and meaningful interaction rather than raw input-event counts or animation activity. The existing interaction boolean alone does not establish meaningful activity. Do not require pressure hardware; touch, mouse and keyboard interactions should all be assessed for equivalent engagement in the later prototype.

## Lifecycle and implementation boundary

The future shared bonus coordinator owns normal-play progress, random opportunities, eligibility and remaining duration. Toys report qualifying engagement and expose an optional transformation control. The coordinator supplies the current bonus state; it does not directly manipulate toy geometry or material fatigue.

Keep bonus progress separate from the grounded solver's strain-driven material-fatigue system. Current lift-and-toss Jelly has no rupture mechanic. Future bonus progress governs accumulated engagement and survives ordinary toy reset. Do not introduce or reuse fatigue as a bonus meter, or treat an impact as a reward opportunity.

Document these transitions for the later implementation:

| State / event | Required behavior |
|---|---|
| Ordinary eligible play | Accumulate qualified time and process each random boundary once |
| Eligibility earned | Stop accrual; retain one pending transformation until a safe entry |
| Current gesture, released flight or unsettled landing | Defer entry without losing eligibility or interrupting contact |
| Active transformation | Consume only qualifying bonus time; no normal-play accrual |
| Duration exhausted | Stop bonus timing; restore ordinary response after release and safe settling |
| Toy reset | Preserve progress, pending eligibility or remaining duration; reset geometry using existing behavior |
| Navigation, cancellation, backgrounding | Release input through existing lifecycle handling and pause saved bonus state; do not turn cancellation into a new roll |
| Surprises disabled | Smoothly restore ordinary response and freeze saved bonus state |
| Reload / later visit | Restore validated bonus state and resume on Jelly when enabled; do not replay elapsed opportunities |

Use versioned local bonus storage separate from favorites and toy-specific saves. Persist enough information to retain the setting, current phase, partial progress, completed opportunities and remaining duration. Save at state transitions and ordinary exits; do not depend solely on a final unload event. Validate stored values and tolerate corrupt, unavailable or quota-limited storage with usable session-only behavior. Clearing browser data removes local progress. No cloud persistence, account, purchase ledger or production analytics is part of this experiment.

Clock and randomness inputs must be injectable for deterministic tests. Ignore callbacks from retired toy sessions and ensure active state has one coordinator owner. Reuse existing pause/disposal handling; do not introduce a second animation loop just to count time.

## Validation and advancement

The complete timed experiment's checks below remain **future work**. The narrower manual prototype has the results recorded above.

1. **Schedule tests:** no roll during the first 60 active seconds; the first roll at 65; one roll per subsequent five-second boundary; success/failure at probability boundaries; exact eligibility at 7,200 despite forced failures; no extra rolls while eligible or transformed. Verify the analytic distribution and simulate it using reproducible seeds.
2. **Persistence and lifecycle tests:** partial intervals, cross-session progress, pending eligibility, remaining duration, off/on, reset, navigation, cancellation, stale/duplicate callbacks and storage failures. No background accrual, stalled-frame catch-up, multi-touch multiplier or reload-based rerolls.
3. **Interaction checks:** enter/exit around holds, throws, catches, navigation, mute and reduced motion without stuck input, unintended resets, visible deformation jumps or extra render loops. Compare transition behavior and frame timing on both existing renderer paths and actual target phones.
4. **Adult comparison:** evaluate refined ordinary Jelly alongside bonus-enabled Jelly. Include a clearly disclosed demonstration so participants can judge the transformed feel without waiting for random eligibility. Keep the natural schedule unchanged in ordinary-use sessions; do not secretly increase the chance to improve observations.
5. **Advancement gate:** advance only if participants perceive a meaningful material change and ordinary play remains satisfying between bonuses. Record enjoyment, interruptions, attempts to hurry the trigger, pressure to continue and non-return reasons. Use the adult-pilot framework already documented; a small pilot supplies qualitative evidence, not a retention claim.

Broader transformations require their own material design and validation after the Jelly gate. Collecting and monetization remain separate later decisions. Before an iPhone release, assess the actual presentation against [Apple's age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/); do not assume a free material transformation is automatically classified as simulated gambling. Recheck the then-current rules when the feature is ready for submission.
