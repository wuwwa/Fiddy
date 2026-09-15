# Fiddy product strategy

Research reviewed September 13, 2026. This is a future game plan, not an implemented economy or a revenue forecast. Start here for product and monetization decisions; see [daily-use validation](DAILY_USE_REVIEW.md) for the current release and [bonus transformations](BONUS_ROUNDS.md) for the agreed future experiment.

## Product promise and honest assessment

**Something satisfying for your hands while your attention is elsewhere.** Adults are the initial audience. Ordinary phone use beside a laptop, television, or conversation is the first target; foldable and dual-display use is a separate feasibility track.

Observed in the repository: 16 toys, each opening with its primary behavior; a shared player with lazy loading, pause/disposal, sound and reduced-motion handling; no accounts, remote analytics, or payment backend. Several toys share soft-body machinery. Sharing code is useful, but each toy must earn its place through a distinguishable feel. Existing desktop QA is substantial; it does not establish physical-iPhone performance, haptics, thermals, or demand.

Favorites, actual toy previews and collection branding are implemented. The current homepage opens Butter; explicit toy links select the named toy. The next product question is whether people voluntarily return to a favorite. More toys, points, and deadlines cannot answer that question for us.

**Agreed assessment:** Fiddy currently offers simple toys with promising physical interactions; repeat-use appeal remains unproven. The next refinement work should prioritize distinct material behavior, satisfying releases, discoverable gesture depth, and usefulness with little visual attention. Deepen Jelly, Putty, and Silk before expanding the collection. A touchscreen cannot supply a physical toy's actual resistance, so movement, sound and eventual native haptics must earn their own appeal through device testing.

Bonus systems should enrich toys people already enjoy. Evaluate ordinary play independently so rewards do not conceal weak mechanics. Favorites improve access to a toy; they do not establish a desire to return to it.

**Current material behavior:** [Primary toy behaviors](MOVEMENT_MODES.md) give Jelly and Dumpling lifting, throwing, landing and catching; Loop and Star stretch, Cushion compresses, Putty kneads, and Dough folds and merges. The earlier movement toggle has been removed. Each shape keeps one collection card and its own material finish. A simple stage and shadow provide contact cues without recreating a room. Free motion may increase visual attention, so compare its usefulness beside another activity as well as its immediate appeal. The manual Jelly bonus comparison builds on this current behavior; ordinary play still needs independent evaluation.

**Recommendation:** make the hands-on experience valuable by itself. Sell additional material experiences and optional collecting around it. Keep core play uninterrupted and keep existing toys available. Do not add popups, economy counters, or purchase prompts during a gesture.

## Agreed bonus direction

The roadmap is **material refinement → voluntary-return evidence → Jelly bonus experiment → broader transformations → separate collecting and monetization decisions**.

The current manual prototype is **Jelly awakens**, at `/?toy=jelly&bonus=demo`: a short visit from an expressive azure slime. **The person's performance must not matter.** It offers its full expressions, playful motion, starlight and gentle farewell whether the person watches or handles it. Touch changes its immediate physical response, never a score, unlock or outcome. The previous six-star objective, collection requirement and winning finale have been removed. There is no visible narration or countdown. This philosophy should guide future bonuses toward transformed materials, character moments and sensory variety. See [the direction and validation](BONUS_ROUNDS.md). The current visit uses visible, unpaused time and returns gently on its own; its duration does not require qualifying interaction. Activation is manual through the sparkle button beside Jelly’s name. The previous automatic eligibility proposal is reference material, not the current activation plan.

The selected schedule targets approximately ten minutes of qualifying normal play on average, with a distant two-hour guarantee. Progress will accumulate across visits, and faster tapping will not improve the rate. These are experiment parameters, not current functionality or evidence of improved retention. The [bonus-round specification](BONUS_ROUNDS.md) defines exact timing, lifecycle behavior, persistence and validation. It is separate from the grounded solver's strain-driven rupture and the monetization mechanisms researched below. Current lift-and-toss Jelly has no rupture effect.

## Reading the research

The tables distinguish **industry examples** from **Fiddy hypotheses**. Revenue purpose, operational burden, product-fit judgments, and recommendations are our analysis, not claims that a source proves revenue uplift. A related source supports the business-model family, not an assertion that another company uses every proposed variant. This is a broad catalog relevant to this product, not an exhaustive list of every enterprise business model.

Decisions mean **adopt** in the future direction, **experiment later** after evidence and design, or **avoid** for this product. None authorizes implementation or purchases now. Burden includes customer support, content production, commerce, and ongoing operations, not just programming.

## Revenue models

| Mechanism | Revenue purpose; example / source | Burden | Effect on fidgeting; recommendation |
|---|---|---|---|
| Paid download | Revenue before first play; Apple's paid model [A] | Low–medium; storefront and updates | Adds trial friction. **Experiment later**, after a strong free demo. |
| Permanent unlock | One payment for a defined expansion; non-consumable IAP [A] | Medium; entitlement restoration | Little interruption after purchase. **Adopt** as a first commercial candidate; avoid promising all future work forever. |
| Toy / material packs | Sell distinct experiences; Fiddy hypothesis using non-consumables [A] | Medium; art, feel and QA per pack | Strongest fit. **Adopt**; preview exact contents before purchase. |
| Bundles | Raise order value through grouped content; Supercell offers bundles [S] | Medium; owned-item treatment | **Experiment later** with real savings and no repurchase of owned items. |
| Subscription | Recurring payment for recurring value; Apple's subscription model [A] | High; release cadence and churn support | **Experiment later** only after demonstrating reliable new content. A static toy shelf does not justify a subscription by itself. |
| Season pass | Sell an optional reward track; Brawl Pass [B] | High; seasons, rewards, entitlement rules | Diverts attention toward completion. **Experiment later**, with purchased content remaining earnable. |
| Consumable currency | Repeat sales of spendable credits; Apple's consumable model [A] | High; ledger, refunds and fraud | Obscures price if layered. **Experiment later** only if there is a clear need beyond direct purchase. |
| Rewarded ads | Sell voluntary ad impressions in exchange for an item; AdMob [G] | High; SDK, consent, mediation, reward validation | Requires attention. **Experiment later** only in the collection, never to resume play. |
| Interstitial ads | Monetize transitions; AdMob formats [G2] | Medium–high | Breaks the low-attention promise. **Avoid** forced full-screen ads. |
| Banner ads | Sell ongoing screen exposure; AdMob formats [G2] | Medium–high | Competes with touch space and quiet visuals. **Avoid** in the toy player. |
| Sponsorship | Partner funds a themed material pack; Fiddy hypothesis | High; sales, contracts and creative approvals | **Experiment later** for clearly identified optional packs. No branded interruption during play. |
| Licensing / business sales | Sell a kiosk, installation or organization license; Fiddy hypothesis | High; sales cycle, support and deployment | **Experiment later** as a separate channel. Do not claim clinical benefit without evidence. |
| Merchandise | Margin from physical toys or branded objects; physical-goods category [A2], Fiddy hypothesis | High; manufacturing, shipping and returns | **Experiment later** after audience demand; keep purchasing outside play. |
| Affiliate revenue | Commission on relevant physical products; FTC disclosure guidance [F2], Fiddy hypothesis | Medium; partners and disclosure | **Experiment later** on an optional editorial page, not beside a fingertip. |

First pricing work should test willingness to pay for a specific pack. No price, conversion target, or revenue estimate is established yet. Model contribution as net receipts minus refunds, platform/payment costs, content production, hosting, support and acquisition; do not confuse gross purchases with profit. Subscription revenue needs churn assumptions; ad revenue needs actual eligible impressions and fill rates.

## Progression and earned collecting

These are Fiddy hypotheses informed by reward-track and character-unlock examples [B, U]. They are not current functionality. Earned collecting is a later decision than the [Jelly transformation experiment](BONUS_ROUNDS.md), which has no currency or collectible reward.

| Mechanism | Revenue / retention purpose and example | Burden | Effect; recommendation |
|---|---|---|---|
| Active-play points | Give ordinary sessions accumulating value; hypothetical earned credits | Medium; activity definition and economy tuning | **Experiment later**; count meaningful active play, not raw taps, pressure, or background time. |
| Milestones | Establish achievable goals; e.g. explore three material families | Low–medium | **Experiment later**; reveal progress in the collection, not mid-gesture. |
| Discovery rewards | Encourage trying underused toys; hypothetical first-use cosmetic | Medium; avoid accidental farming | **Experiment later**; no required tutorials or prolonged holds. |
| Collection completion | Encourage finishing a set; hypothetical palette series | Medium; content inventory | **Experiment later**; a catalog is useful, persistent incomplete badges are distracting. |
| Cosmetic unlocks | Reward repeat use without weakening free play; hypothetical finishes | Medium–high; material QA | **Adopt** as the preferred future collecting reward, while separately selling genuinely new toy experiences. |
| Sources and spending | Balance earned credits against cosmetic costs; hypothetical catalog | High; tuning and migration | **Experiment later**; one earned currency initially, no energy meter, decay, or payment to keep fidgeting. |

Before a collecting prototype, choose and document earning intervals, eligible gestures, idle handling, item prices, and save/reset behavior. Local saves are acceptable for a disclosed free prototype; purchased entitlements require a verified purchase system. Never present browser storage as a secure wallet.

## Gacha mechanics: full research menu

| Mechanism | Purpose; example / source | Burden | Effect; recommendation |
|---|---|---|---|
| Rarity pools | Make some outcomes more desirable; randomized reward tiers [D] | High; odds and content valuation | **Experiment later** for earned cosmetics; no claim that rare means better fidget physics. |
| Featured banners | Concentrate demand on a temporary pool; Character Event Wishes [H] | High; rotation and support | **Experiment later** with earned rewards and clear reruns; keep the player separate. |
| Rate boosts | Increase appeal of a featured item; Wish guarantee/featured rules [H] | High; exact conditional odds | **Experiment later**; show actual probabilities, not just “UP.” |
| Soft / hard pity | Increasing chances / a maximum attempts guarantee; Wish guarantees [H] | High; persistent counters and simulation | **Experiment later**; source establishes guarantees, not a universal soft-pity curve. Publish any Fiddy curve and exact-item ceiling. |
| Guarantee carryover | Preserve attempts across rotations; shared Character Event Wish counters [H] | High; pool migration | **Adopt if randomness is introduced**. Avoid expiring paid progress. |
| Duplicate conversion | Turn repeats into another reward; Genshin duplicate compensation [H2] | High; conversion valuation | **Experiment later** only if repeats have useful, clearly priced value. |
| Duplicate protection | Improve chances of something unowned; Fiddy hypothesis, compare conversion [H2] | Medium–high | **Prefer over duplicates** if earned random packs are tested. |
| Crafting / exchange | Convert fragments into a chosen item; Fiddy hypothesis, compare currency compensation [H2] | High; conversion rates and balances | **Experiment later**; provide deterministic ownership, not several opaque exchanges. |
| Wishlist / targeted guarantee | Let users aim at a specific reward; historical Epitomized Path [H3] | High; selection/reset semantics | **Experiment later**; changing a wishlist should not silently delete progress. Historical source is not current balance guidance. |
| Single versus multi-pulls | Reduce purchase friction; proposed one-pack / ten-pack UI | Medium–high | **Avoid paid bulk-pull pressure**; batching earned reveals can be optional. Source [H] informs guarantees, not an assumed batch discount. |
| Reveal presentation | Make acquisition memorable; Fiddy hypothesis | Medium; animation, audio and accessibility | **Experiment later**; skippable, reduced-motion aware, and outside play. **Avoid** fake near-misses and false scarcity cues. |

Paid gacha is **deferred**, not the recommended first business model. If reconsidered, compare it directly against fixed-price ownership and earned randomness. Simulate probability distributions, duplicates, worst-case acquisition cost, and guarantee transitions before any launch. Publish base odds, conditional odds, carryover/reset behavior, and whether the guarantee covers the exact advertised item or merely its rarity class.

## FOMO and return incentives

| Mechanism | Purpose; example / source | Burden | Effect; recommendation |
|---|---|---|---|
| Seasonal releases | Create anticipation and a reason to browse; Brawl Pass seasons [B] | High; reliable content cadence | **Experiment later** with small, polished cosmetic collections. |
| Rotating shop | Concentrate attention on selected items; Supercell seasonal specials [S] | Medium–high | **Experiment later** with honest dates and a permanent basic catalog. |
| Event exclusives / reruns | Reward early participation while allowing later access; Fortnite's possible later shop availability [E] | High; availability promises | **Experiment later** with published return policy; never imply a guaranteed rerun unless committed. |
| Daily / weekly rewards | Build a recurring check-in; Brawl Stars daily-win rewards [D] | Medium–high | **Experiment later** with flexible weekly discovery; avoid mandatory daily attendance. |
| Streaks | Create continuity and loss aversion; Fiddy hypothesis | Medium | **Avoid** loss of earned value after a missed day. A cumulative non-resetting history is a better hypothesis. |
| Expiring passes | Set a deadline to buy and finish; seasonal pass model [B] | High | **Avoid** paid-content completion pressure; distinguish purchase window from permanent ownership. |
| Social status | Let ownership act as identity; Brawl Pass titles/cosmetics [B] | High if social features are added | **Experiment later** with optional collection sharing; no leaderboards for time spent or money paid. |
| Reminders / comeback events | Reactivate interest; hypothetical new-material reminder | Medium–high; opt-in and delivery | **Experiment later** after users request them. No “your toy misses you” guilt or repeated deadlines. |

The useful version of FOMO here is anticipation: a seasonal material, a preview of what is coming, a clear availability window, and a reliable way to own it. Repeated attention capture would undermine the second-screen premise.

## Purchase presentation tactics

These are hypotheses to evaluate, not claims of effectiveness. Supercell's store documents offers, bonus tracks and bundles [S, S2]; the FTC case [F] is a caution about unclear cost and odds.

| Tactic | Purpose; example | Burden | Effect; recommendation |
|---|---|---|---|
| Starter offer | Lower first-purchase barrier; hypothetical introductory pack | Medium | **Experiment later**; exact contents and a real, non-resetting deadline if any. |
| First-purchase bonus | Encourage conversion; hypothetical bonus finish | Medium | **Experiment later**; direct contents preferred over bonus currency. |
| Price anchoring | Make a bundle appear attractive next to individual items | Low–medium | **Experiment later** only using genuine standalone prices. **Avoid** fabricated discounts. |
| Currency denominations | Increase basket size or leave a residual balance | High | **Avoid** engineered leftover balances; show real-money equivalents and exact-price options. |
| Bundle tiers | Offer choice at different budgets; compare store bundles [S] | Medium | **Experiment later**; include owned-item credits and meaningful differences. |
| Personalized offers | Match content to demonstrated interest; hypothetical favorite-family pack | High; data and experimentation | **Experiment later** with explicit interests; **avoid** vulnerability or spending-distress targeting and hidden individualized prices. |
| Comeback promotions | Give absent users a reason to revisit; hypothetical new-toy sample | Medium | **Experiment later**; offer discovery without threatening accumulated value. |

## Transparency and native feasibility

Apple requires disclosure of odds before purchase for paid randomized virtual items [A2]. Its guidelines also address purchased currency expiry, purchase restoration, subscriptions, and minimum app functionality; recheck the current rules for the target storefront before implementation. An adults-first positioning is not age assurance by itself.

The FTC's HoYoverse case alleged misleading odds and costs, including confusing currency exchanges [F]. Its settlement is case-specific, not a universal implementation checklist. Fiddy should make real cost and exact entitlements legible, and should review age, privacy, refunds and regional requirements before selling randomized rewards.

Do an iPhone feasibility spike **before** choosing a wrapper, a native renderer, or a rewrite:

1. Test Jelly, Silk and Magnetic Dust in Safari and a minimal native-host prototype on physical devices. Compare gesture response, GPU behavior, loading and sustained thermal performance.
2. Prototype event-based native haptics with capability checks and an off switch using Core Haptics [I]. Test timing under load; do not equate browser vibration with native haptic capability.
3. Test sound alongside music, video, calls, headphones and silent mode. Evaluate native audio-session mixing and interruption recovery [I2]. The app should not unexpectedly take over the user's main audio activity.
4. Define offline coverage, asset downloads, updates and storage eviction. No service worker or install flow ships in the daily-use release.
5. Prototype sandbox purchases, restore, refund/revocation and offline entitlement behavior. Do not add a live store until these work.
6. Verify actual supported scene/window behavior on the intended OS and hardware [I3]. A device having multiple displays does not establish that two arbitrary apps can run simultaneously in the desired arrangement. Record device and OS evidence; keep single-screen use fully useful.

## Evidence gates and next decisions

- First: refine Jelly, Putty and Silk for material identity, release satisfaction, gesture depth and use with little visual attention. Validate on physical devices using [daily-use validation](DAILY_USE_REVIEW.md).
- Second: establish voluntary-return evidence with the refined ordinary toys and the adult pilot. Record toy preferences and non-return reasons without reward prompts; do not optimize total screen time as the primary success criterion.
- Third: run the optional [Jelly bonus experiment](BONUS_ROUNDS.md). Compare ordinary and transformed Jelly, retain the natural rarity schedule, and disclose any demonstration used to evaluate feel. Record enjoyment, interruption and pressure to continue.
- Fourth: consider transformations for other toys only if the Jelly experiment produces a meaningful material difference and ordinary play remains satisfying between bonuses. Each new material needs its own design and validation.
- Fifth: make separate collecting and monetization decisions. Test fixed-content packs and optional earned cosmetics with returning users, then establish a sustainable content cadence before seasons or subscriptions. Choose pricing only after evidence. No account or analytics service is implicitly authorized by this document.
- Deferred decisions: native architecture, minimum devices/OS, regional rollout, prices, collecting-economy earning rates and probabilities, purchase ledger, age assurance, analytics, launch schedule and production hosting changes. The bonus prototype's timing and ceiling are specified; its exact spring, damping and wave tuning remain experimental.

## Primary sources

- [A — Apple business models](https://developer.apple.com/app-store/business-models/)
- [A2 — Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [G — AdMob rewarded ads](https://support.google.com/admob/answer/7372450?hl=en)
- [G2 — AdMob formats](https://admob.google.com/home/resources/what-is-admob/)
- [B — Brawl Pass and Brawl Pass Plus](https://support.supercell.com/brawl-stars/en/articles/brawl-pass-quests-7.html)
- [U — Unlocking Brawlers](https://support.supercell.com/brawl-stars/en/articles/unlocking-brawlers-2.html)
- [D — Brawl Stars drop chances](https://support.supercell.com/brawl-stars/en/articles/drop-chances.html)
- [S — About the Supercell Store](https://support.supercell.com/supercell-store/en/articles/what-is-the-supercell-store-4.html)
- [S2 — Supercell store bonus tracks](https://supercell.com/en/news/new-store-features/)
- [H — HoYoverse Wish guarantee explanation](https://support.hoyoverse.com/hc/en-us/articles/50333940684953-How-does-the-Wish-guarantee-system-work)
- [H2 — HoYoverse duplicate compensation](https://support.hoyoverse.com/hc/en-us/articles/52089402385945-What-rewards-do-I-get-for-obtaining-a-duplicate-character-near-or-at-C6)
- [H3 — Epitomized Path introduction, historical](https://www.hoyolab.com/article/533196)
- [E — Epic's battle-pass exclusivity policy announcement](https://www.fortnite.com/news/change-to-item-exclusivity-in-future-fortnite-battle-passes)
- [F — FTC lessons from the HoYoverse settlement](https://www.ftc.gov/business-guidance/blog/2025/01/level-tips-businesses-ftcs-settlement-genshin-impact-developer-hoyoverse)
- [F2 — FTC endorsement guidance](https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers)
- [I — Apple Core Haptics](https://developer.apple.com/documentation/corehaptics)
- [I2 — Apple audio-session coexistence](https://developer.apple.com/documentation/avfaudio/avaudiosession/secondaryaudioshouldbesilencedhint)
- [I3 — Apple scene support](https://developer.apple.com/documentation/uikit/specifying-the-scenes-your-app-supports)
