import { FreeJellyPhysics, FREE_STEP } from '../src/free-jelly/physics';
import { createJellyTopology, createJellySkin } from '../src/free-jelly/surface';

/** Compare matched presses and releases without renderer or input timing noise. */
export function studyBonus(transformed: boolean) {
  const topology = createJellyTopology();
  const body = new FreeJellyPhysics(topology.rest, topology.triangles);
  const skin = createJellySkin(topology.rest, topology.triangles);
  const step = (count: number) => { for (let i = 0; i < count; i++) body.step(); };
  try {
    step(900); body.setTransformation(transformed); step(1800);
    const resting = body.diagnostics();
    skin.update(body.positions);
    const positions = skin.geometry.getAttribute('position');
    let top = 0;
    for (let i = 1; i < positions.count; i++) if (positions.getY(i) > positions.getY(top)) top = i;
    body.grab(skin.bindings[top]);
    body.move({ x: positions.getX(top), y: positions.getY(top), z: positions.getZ(top) }, 0.95);
    step(144);
    const pressed = body.diagnostics();
    body.release();
    const samples: { seconds: number; height: number; speed: number }[] = [];
    let quiet = 0, settledAfter = 0, volumeError = 0;
    for (let frame = 1; frame <= 2400; frame++) {
      body.step();
      const d = body.diagnostics();
      volumeError = Math.max(volumeError, Math.abs(d.volumeRatio - 1));
      quiet = body.isAtRest() ? quiet + 1 : 0;
      if (!settledAfter && quiet === 36) settledAfter = (frame - 35) * FREE_STEP;
      if ([15, 30, 60, 120, 240, 480, 960].includes(frame)) samples.push({ seconds: frame * FREE_STEP, height: d.height, speed: d.speed });
    }
    return { transformed, amount: body.transformationAmount, restingHeight: resting.height, pressedHeight: pressed.height,
      settledAfter, volumeError, resets: body.resetCount, samples };
  } finally { skin.geometry.dispose(); }
}

console.log(JSON.stringify([studyBonus(false), studyBonus(true)], null, 2));
