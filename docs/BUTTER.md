# Butter and follow-up toys

Butter is an original digital interpretation of the slow-rise butter-stick squishy. Its rounded rectangular mesh has small portion marks molded into the top and navy SALTED BUTTER lettering, weight text, and tablespoon ticks. The print uses fixed material coordinates, so it deforms with the foam. Its texture is disposed when the player unmounts.

The first version only slowed the shared gel model. The revised version uses compressible volume constraints, much less lateral expansion, deeper compression, and exponential recovery of local dents. Foam does not receive release-flick impulses or surface ripples. A minimum cell-volume constraint prevents inverted cells during repeated pinches. Other toys retain their existing material parameters.

The opaque, matte finish and heavily damped recovery distinguish it from translucent Jelly. It is a solid toy with no burst mechanic. It uses the existing grounded soft-body player, including touch, keyboard, rotation, sound, reset, reduced-motion, and lifecycle handling.

The reference is the printed slow-rise foam variant described by [Fidget World](https://www.fidgetworld.co.uk/products/butter-stick-squishy) and [ButterSquishy](https://buttersquishy.com/). These describe a pale yellow stick with blue print that compresses and slowly recovers. This implementation is a qualitative visual approximation, not a measured physical reproduction: real resistance, hand grip, free handling, and large folds are not replicated by this grounded touchscreen model. Recovery settings have not been calibrated to a physical sample. Other butter-shaped products may use different materials.

Open `?toy=butter` or select Butter in the collection. A sustained hold compresses the block; release preserves the compression momentarily and gradually restores its shape. No score or completion state interrupts repeat play.

## What to try next

Research checked September 13, 2026. These are product directions, not forecasts of guaranteed popularity. Seller descriptions establish available formats, not independent proof of viral reach.

| Priority | Idea | Interaction for Fiddy | Evidence or hypothesis |
| --- | --- | --- | --- |
| 1 | Squishy ice cube | Translucent rounded cube, firm quick presses, yielding slow holds, gradual return | NeeDoh Nice Cube has documented social-media demand and sellouts; see [Tom's Guide, April 27, 2026](https://www.tomsguide.com/sales-events/where-to-still-buy-the-viral-needoh-nice-cube-plus-10-alternatives-worth-a-look). |
| 2 | Deepen the existing Dumpling | Pinch the pleated top, squash the belly, let the folds re-form | Squishy dumplings were among toys selling out ahead of Easter; see [Axios, April 4, 2026](https://www.axios.com/2026/04/04/needoh-squishy-toys-dumplings-easter). |
| 3 | Glitter raindrop | A clear droplet with particles displaced by each squeeze | An established physical format: [Schylling's Dream Drop](https://schylling.com/product/needoh-dream-drop/). This is evidence of a product, not a ranking of current popularity. |
| 4 | Mochi | Powdery soft skin, pinchable corners, deep palm compression | Design hypothesis: recognizable food plus visually exaggerated softness. Test against Butter before expanding the food collection. |
| 5 | Peelable orange | Catch an edge, peel a springy strip, release to re-wrap | Design hypothesis: gives the collection a new repeatable gesture rather than another shape with identical behavior. |

The first prototype should be the ice cube: it has the clearest demand signal and a distinct pressure response. Build the interaction in Fiddy's own visual style and naming.

## Verification

- Production TypeScript/Vite build.
- Existing unit suite plus Butter-specific closed-surface, cage-bound, compression, gradual recovery, stability, and reset tests in `tests/butter.test.ts`. Additional checks cover volume loss with limited lateral expansion, inverse picking, side-dent retention, idle settling, and repeated two-finger squeeze/twist stability.
- Collection preview generated with `qa/capture-previews.mjs --toy=butter`.
- Browser QA passed in WebGPU and WebGL: desktop keyboard hold/release, emulated mobile touch at 390 × 844, reset, collection switching, no mobile overflow, and no captured browser errors. Screenshots were visually inspected. Physical-device feel still needs hands-on evaluation.
