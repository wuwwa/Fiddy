# Material interactions

The collection should reward different kinds of touch. The same gesture should feel and behave differently in gel, elastic rubber, foam, and dough. Keep these responses discoverable through movement and sound, with no scores, objectives, progress bars, or extra titles.

## Current iteration: strain, fatigue, release

- Jelly is the most fragile gel. Hidden fatigue builds from actual deformation sustained over time: compression, stretching, and torsion can overwork the material until it gives way.
- Loop tolerates more accumulated strain. Its fatigue threshold is higher, so the same strong deformation must last longer.
- Star, Cushion, and Dumpling remain solid. Their existing differences in resistance, creep, and recovery continue under heavy input.
- Brief taps and light deformation remain safe. Fatigue recovers as the material relaxes; lifting a finger does not instantly erase it. There is no tap counter, visible meter, or instruction to pop the toy.
- A rupture begins at the most strained patch. The actual held skin rapidly releases into a low, spreading, softly lobed gel puddle, settles briefly, then draws back into its mould over about two seconds. The same visible geometry and material remain present throughout. Every contact releases at rupture; fresh touches work after recovery. Sound remains a short wet snap with a low body tone.
- Reduced motion relaxes the held shape smoothly without a spreading collapse. Reset cancels every stage. Opening the collection or hiding the page freezes the reaction and clears active grips, preserving fatigue until the simulation resumes.

Implementation uses an explicit reaction capability in each material profile, measured deformation from the physics cage and touched skin, a deterministic fatigue integrator, reusable surface buffers, and the shared audio engine. Thresholds and recovery are tunable per material.

Validation: solids remain intact; sustained excessive strain ruptures gels; ordinary taps remain safe; relaxing a shape reduces fatigue; stale pointer releases do not interrupt recovery; the skin never disappears or crosses the floor; reset and repeated cycles reuse graphics resources; both renderers and reduced motion remain usable.

## Jelly cleanup

The air-pocket experiment was removed at the user's request, including local bubble reactions and audio. The added depth-capture pass, procedural texture, and scattering finish were also removed. Jelly uses the shared physical material, a smoother rounded shape, and restrained studio lighting. Pressing, stretching, multi-touch, and sustained whole-body fatigue remain the core interactions.

## Implemented: kneadable putty

Putty is a separate dense material with bounded plastic deformation. Sustained local strain gradually changes its resting cage; volume projection redistributes displaced material into neighboring cells. A long top squeeze retains a flatter profile. Brief touches remain elastic, and release returns partway before settling into the learned shape. Pulling can leave a rounded raised region that can be kneaded in another direction. Reset restores the original mould exactly.

Verified: actual surface-volume checks, retained front dents/top flattening/pulls, brief taps, repeated five-finger extreme input, partial release, fixed-timestep consistency, exact reset, and reduced motion. Learned shapes become idle without continuing to creep or schedule frames. Browser checks cover desktop mouse, phone touch, keyboard, sound, orientation changes, and stable graphics resources on WebGPU and forced WebGL2. Quiet dry contact accents and low rubbing texture use the shared bounded audio graph. Memory lasts for the current toy session; physical-device feel still needs a phone pass.

## Implemented: two-finger wringing

Gentle pair rotation now eases automatic inward pressure, allowing the existing cage to turn locally around both fingertips. Contact geometry is sampled on fixed physics ticks, with a short onset and gradual pressure restoration. Pinching, common translation, and small jitter keep the ordinary pressure mapping. Ending one contact preserves the other; cancel, reset, and orientation changes clear pair state. Actual skin measurements and trusted browser gestures cover Jelly, Cushion, and Loop on both rendering backends. A stationary held twist remains quiet under the existing gesture audio system.

Verified: gentle rotation produces more local turning with less unintended indentation; matched pinches and common translations retain their behavior; lifting one finger preserves the other and restores its pressure smoothly. The Loop retains its actual opening and each material keeps its existing recovery. Physical phone feel still needs device testing before adding any further stored twist.

## Implemented: upright shape rotation

Jelly, Cushion, Loop, Star, Dumpling, and Putty turn around their vertical axis when a horizontal drag starts in the empty canvas beside them. The gesture keeps ownership until release, including when it crosses the skin; existing material grips exclude rotation. Left/Right arrows rotate the focused toy when Space is released. Holding Space retains pressing, arrow-key stretching, and Q/E twisting.

The visible mesh and contact shadow turn together while the material cage remains in its local frame. Picking and camera-plane drags use the rotated transform, so newly exposed faces stay touchable and retained putty dents turn with the body. Rotation adds no pressure or fatigue. Small background movements are ignored; a moving release coasts briefly, while holding still before release keeps the selected angle. Reduced motion removes the coast. Reset restores the initial facing; cancellation, blur, resize, collection opening, and visibility changes stop motion and clear input while preserving orientation.

Validation: `tests/rotation.test.ts` covers drag thresholds, full revolutions, release and cancellation, frame-rate consistency, and the floor/picking/pull mapping of all six shapes. `qa/rotation-smoke.mjs` uses trusted mouse, touch, and keyboard events to check gesture ownership, deformation after turning, reset, interruptions, reduced motion, idle rendering, and narrow layouts on WebGPU and WebGL. `qa/turn-smoke.mjs` checks that two-finger wringing retains local material behavior without rotating the whole shape. Physical phone feel still needs hands-on evaluation.

## Unscheduled idea: lift, drop, and settle

Prototype a toy whose base can detach after a deliberate upward pull, then falls and squashes on landing. This needs gravity, ground contact, and a stable free-body mode, so it follows the anchored material interactions. Keep the fixed camera and bound off-screen travel.

Further automatic additions are on hold at the user's request. Prioritize hands-on evaluation of the existing materials and only make further additions when explicitly requested. The lift/drop idea is an unscheduled possibility, not the next automatic task.
