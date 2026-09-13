# Adding a toy

The collection has three layers:

1. **Toy definitions** describe the name, icon, theme, instructions, and lazy loader. They contain no rendering code.
2. **The shared player** renders navigation, loading/error states, instructions, sound/reset controls, and the collection picker. It owns the active session and preferences.
3. **Toy modules** create and clean up their own interface, simulation, input handling, and audio. A module may use Three.js, 2D canvas, or ordinary HTML.

Jelly, Cushion, Putty, Loop, Star, and Dumpling are working examples. Their definitions live in `src/toys/`, with small adapters in each toy's `src/<id>/entry.ts`. All six use the configurable engine in `src/soft-body/`.

For another soft toy, start with `src/soft-body/profiles.ts`: a profile controls shape, material, local elasticity, separate press/pull travel limits, surface-grab compliance, recovery time after a pull, initial and held inward dent depth, vertical compression, holding creep, torsion and recovery springs, ripples, and sound pitch. The common engine follows the touched surface normal for inward pressure, releases automatic pressure during a pull, and converts off-center presses and sideways drags into anchored twists. It also provides keyboard compression/stretching/twisting, an entrance animation, bounded physics, and rendering. Toys with different mechanics can still implement their own independent module.

For a new silhouette, extend `SoftToyShape` and `createSoftGeometry()`. Return a welded, indexed surface with outward normals, keep it within the existing lattice bounds, and round its bottom contact near `FLOOR`. The geometry can be nonconvex: Loop demonstrates a torus whose opening stays empty to raycasting. Keyboard pressing automatically selects an actual top vertex. The collection geometry tests demonstrate topology, contour, and press/pull/recovery checks for custom shapes.

`feel.plasticity` opts a dense material into bounded shape memory. Putty demonstrates sustained-strain dwell, a retained elastic layer, local reference-shape flow, volume projection, and retained top compression. Other profiles remain elastic when this setting is absent. Keep plasticity separate from rupture capability. Validate actual visible deformation and volume after repeated kneading, idle stability, and exact reset before registering another material with memory. The optional `soundTexture: 'putty'` selects dry contact accents and rubbing from the shared audio graph.

Choose a `reaction` in the soft-toy profile: `{ kind: 'solid' }` retains its form under heavy play, while `{ kind: 'pop', threshold, relaxation, strainOnset }` enables fatigue from sustained physical deformation and automatic rupture/recovery. `strainOnset` sets where deformation begins to accumulate fatigue, `threshold` sets tolerance, and `relaxation` controls recovery under low strain. Jelly and Loop show two levels of fragility. Keep reaction settings separate from elastic stiffness; a soft dense solid should not pop just because it stretches easily. The shared scene handles contact release, continuous surface recovery, reduced motion, and reusable animation buffers.

The shared soft-body engine accepts up to five simultaneous contacts. `beginGrab(point, normal, id)`, `moveGrab(offset, id)`, `setPressure(amount, id)`, and `release(id)` address one contact; `releaseAll()` cancels the whole interaction. A repeated ID or a sixth contact is rejected without replacing existing fingers. The default ID keeps single-contact use simple. Scene input owns independent raycast anchors and capture records, while the solver combines the resulting constraints. Include simultaneous pinching, opposite pulls, and partial-release checks when tuning a new material.

## Add an entry

Create a definition implementing `ToyDefinition` from `src/toys/types.ts`. Use `src/toys/jelly.tsx` as a working example. Give the toy a unique, stable `id` and a dynamic `load()` import. Add the definition to the `toys` array in `src/toys/registry.ts`.

The collection card, count, title, instructions, and theme then come from that definition. Optional `copy.touchInstructions` replaces the pointer hint on coarse touch input. Array order controls display order; URLs use stable IDs, such as `?toy=jelly`. Missing and unknown IDs open the default toy. Existing query options, including `renderer=webgl`, survive selection. Do not add placeholder entries for toys that cannot yet be played.

No changes to `App.tsx`, `ToyPlayer`, or `ToySession` are needed for a new entry.

## Implement the module

Export an async `mount(host, context)` function returning a `ToyController`. Resolve when the toy is usable. The host fills the play surface; controls and collection navigation are shared overlays. A module owns only the DOM it appends to its host.

Required controller methods:

- `reset()` restores the toy's initial state.
- `dispose()` stops timers and animation loops, removes listeners and owned DOM, releases graphics resources, and closes/stops owned audio. It must be safe to call more than once.

Optional controller methods:

- `setSound(enabled)` enables/disables sound. Omit it for silent toys; the player hides the sound control.
- `setPaused(paused)` pauses simulation and active sound. The player calls it while the collection is open or the page is hidden.
- `setReducedMotion(reduced)` applies the system motion preference.

The context supplies the initial preferences, the six shared theme colors, an abort signal, and callbacks for interaction and runtime errors. Report interaction changes with `onInteractionChange`; the player tracks the active interaction. Report unrecoverable runtime failures with `onError`; the player disposes the toy and offers a retry.

Observe `context.signal` during asynchronous setup. On abort, release partial resources and return `null`. The player also disposes a controller returned by a late initializer, and suppresses callbacks from canceled sessions. Keep both behaviors: cancellation should release resources promptly, even when a loader or graphics initialization is slow.

## Minimal DOM implementation

This example illustrates the interface; it is not registered as another toy.

```ts
import type { ToyContext, ToyController } from '../toys/types';

export async function mount(
  host: HTMLElement,
  context: ToyContext,
): Promise<ToyController | null> {
  if (context.signal.aborted) return null;
  const button = document.createElement('button');
  button.textContent = 'Press';
  button.style.position = 'absolute';
  button.style.inset = '40% 35%';
  let count = 0;
  let disposed = false;
  const press = () => { button.textContent = `Pressed ${++count}`; };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    button.removeEventListener('click', press);
    context.signal.removeEventListener('abort', dispose);
    button.remove();
  };
  button.addEventListener('click', press);
  context.signal.addEventListener('abort', dispose, { once: true });
  host.append(button);
  return {
    reset() { count = 0; button.textContent = 'Press'; },
    setPaused(value) { button.disabled = value; },
    dispose,
  };
}
```

## Check before registering

Run `npm test` and `npm run build`. Check the new toy's pointer/touch and keyboard interactions, sound behavior when applicable, reduced motion, and small-screen layout. Switch away during loading and active interaction, then back again; there should be one active surface, no continuing audio from the previous toy, and no growth in resources after repeated switches. Check direct URLs and browser Back/Forward.

The session tests in `tests/player.test.ts` use independent test modules to cover delayed loading, cancellation, stale callbacks, preference restoration, unsupported audio, audio failure, and retries. They run without a GPU.
