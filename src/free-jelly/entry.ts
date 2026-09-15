import * as THREE from 'three/webgpu';
import { normalView, positionViewDirection, uniform } from 'three/tsl';
import { FreeJellyPhysics, FREE_FLOOR, FREE_STEP, createSlimeMorphRest } from './physics';
import { jellyPressure } from './gesture';
import { createFreeTopology, createJellySkin, type Binding } from './surface';
import { freeProfiles, freeFeel } from './profiles';
import { JellyBonusRound } from './bonus-round';
import { createBonusEffects } from './bonus-effects';
import { BonusChimes } from './bonus-audio';
import { createBonusCharacter } from './bonus-character';
import { createStudioEnvironment, createContactShadow } from '../soft-body/lighting';
import { disposeRendererOutput, trackRendererTextures } from '../soft-body/renderer-textures';
import { SoftToyActivity } from '../soft-body/activity';
import { SoftBodyAudio } from '../soft-body/audio';
import { CapturedPointers } from '../soft-body/pointers';
import type { ToyContext, ToyController, FreeShape } from '../toys/types';

export const mount = (host: HTMLElement, context: ToyContext) => mountFreeBody(host, context, 'jelly');

export async function mountFreeBody(host: HTMLElement, context: ToyContext, shape: FreeShape): Promise<ToyController | null> {
  if (context.signal.aborted) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'toy-canvas'; canvas.tabIndex = -1;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', `Interactive ${shape}, free movement`);
  canvas.setAttribute('aria-describedby', 'toy-instructions toy-touch-instructions keyboard-instructions');
  host.append(canvas);
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true,
    forceWebGL: new URLSearchParams(location.search).get('renderer') === 'webgl' });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 40);
  const profile = freeProfiles[shape], finish = profile.material;
  const topology = createFreeTopology(shape);
  const physics = new FreeJellyPhysics(topology.rest, topology.triangles, { ...freeFeel[shape], tets: topology.tets,
    ...(shape === 'jelly' ? { bonusMorphRest: createSlimeMorphRest(topology.rest, topology.triangles) } : {}) });
  const skin = createJellySkin(topology.rest, topology.triangles);
  const audio = new SoftBodyAudio(profile.soundPitch, undefined, profile.soundTexture);
  const round = new JellyBonusRound(), chimes = new BonusChimes();
  let effects: ReturnType<typeof createBonusEffects> | null = null;
  let character: ReturnType<typeof createBonusCharacter> | null = null;
  const cleanup: (() => void)[] = [];
  let pmrem: THREE.PMREMGenerator | null = null, environment: THREE.RenderTarget | null = null;
  let releaseTextures = () => {};
  let disposed = false, paused = context.preferences.paused, frameId = 0;
  let wake = () => {};
  physics.reducedMotion = context.preferences.reducedMotion;
  const dispose = () => {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frameId); wake = () => {};
    cleanup.splice(0).forEach(fn => fn());
    renderer.onDeviceLost = () => {};
    audio.dispose(); chimes.dispose(); effects?.dispose(); character?.dispose(); skin.geometry.dispose();
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry !== skin.geometry) object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => m.dispose());
      }
    });
    environment?.dispose(); pmrem?.dispose(); releaseTextures();
    disposeRendererOutput(renderer); renderer.dispose(); scene.clear(); scene.environment = null;
    canvas.remove();
  };
  try {
    await renderer.init();
    if (context.signal.aborted) { dispose(); return null; }
    releaseTextures = trackRendererTextures(renderer.backend as unknown as Parameters<typeof trackRendererTextures>[0]);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.onDeviceLost = () => { if (!disposed) { context.onError('Graphics connection lost. Try again to restart.'); dispose(); } };
    scene.background = new THREE.Color(context.theme.background);
    const room = createStudioEnvironment(context.theme.background, finish.surface);
    pmrem = new THREE.PMREMGenerator(renderer);
    try { environment = pmrem.fromScene(room.scene, 0.015); } finally { room.dispose(); }
    scene.environment = environment.texture; scene.environmentIntensity = 0.85;
    const hemisphere = new THREE.HemisphereLight(0xfff8f1, 0xce7899, 0.65); scene.add(hemisphere);
    const light = new THREE.DirectionalLight(0xfff4e5, 0.4); light.position.set(-3, 6, 4); scene.add(light);
    const material = new THREE.MeshPhysicalNodeMaterial({ color: finish.color, roughness: finish.roughness, metalness: 0, emissive: '#ffcd60', emissiveIntensity: 0,
      transmission: finish.transmission, thickness: finish.thickness, ior: finish.ior, attenuationColor: new THREE.Color(finish.absorption),
      attenuationDistance: finish.absorptionDistance, clearcoat: finish.clearcoat, clearcoatRoughness: finish.clearcoatRoughness });
    const thickness = uniform(finish.thickness);
    const facing = normalView.dot(positionViewDirection).clamp(0, 1);
    if (finish.transmission > 0.5) material.thicknessNode = facing.mul(facing).oneMinus().div(finish.ior * finish.ior).oneMinus().sqrt().mul(thickness);
    const jelly = new THREE.Mesh(skin.geometry, material); scene.add(jelly);
    const ordinaryColor = material.color.clone(), transformedColor = new THREE.Color('#dda4d4');
    const ordinaryAbsorption = material.attenuationColor.clone(), awakenedColor = new THREE.Color('#96e9ff'), awakenedAbsorption = new THREE.Color('#32b1f2');
    const ordinaryBackground = new THREE.Color(context.theme.background), cosmicBackground = new THREE.Color('#101d37');
    const ordinaryGroundLight = hemisphere.groundColor.clone(), awakenedGroundLight = new THREE.Color('#477ec0');
    let reportedBonus = 'idle';
    let quietAge = 0;
    const reportBonus = () => {
      const key = round.phase;
      if (key === reportedBonus) return;
      reportedBonus = key;
      if (round.phase === 'intro') { chimes.play('awaken'); physics.celebrate(0.8); }
      if (round.phase === 'farewell') chimes.play('goodnight');
      context.onBonusRoundChange?.(round.snapshot);
    };
    let reportedTransformation = physics.transformationState;
    const reportTransformation = () => {
      if (reportedTransformation === physics.transformationState) return;
      reportedTransformation = physics.transformationState;
      context.onTransformationChange?.(reportedTransformation);
    };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100),
      new THREE.MeshBasicNodeMaterial({ color: context.theme.background, toneMapped: false }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = FREE_FLOOR - 0.01; scene.add(floor);
    const shadow = createContactShadow(context.theme.foreground);
    shadow.shadow.position.y = FREE_FLOOR; scene.add(shadow.shadow);
    cleanup.push(() => shadow.texture.dispose());

    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), hitPoint = new THREE.Vector3();
    const bary = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    type Grab = { anchor: THREE.Vector3; target: THREE.Vector3; plane: THREE.Plane; distance: number; age: number };
    const pointers = new CapturedPointers<Grab>(canvas, 1);
    const keys = new Set<string>();
    let keyboard: Grab | null = null, lastTime = 0, accumulator = 0;
    let frames = 0, interactions = 0, inFrame = false, slowFrames = 0;
    let pixelRatio = Math.min(devicePixelRatio || 1, 1.75);
    const activity = new SoftToyActivity();
    const syncInteraction = () => {
      canvas.classList.toggle('is-grabbing', physics.grabbed);
      context.onInteractionChange(physics.grabbed);
    };
    const cancel = () => {
      pointers.clear(); keys.clear(); keyboard = null; physics.release(true); audio.stop(); chimes.stop();
      canvas.classList.remove('is-hovering', 'is-pointer-focused'); syncInteraction();
    };
    cleanup.push(cancel);
    let width = 0, height = 0;
    const resize = () => {
      if (disposed || !canvas.clientWidth || !canvas.clientHeight) return;
      if (width && (width !== canvas.clientWidth || height !== canvas.clientHeight)) cancel();
      width = canvas.clientWidth; height = canvas.clientHeight;
      const aspect = width / height, viewHeight = Math.max(5.7, 3.85 / aspect), viewWidth = viewHeight * aspect;
      camera.left = -viewWidth / 2; camera.right = viewWidth / 2;
      camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
      const tiltCos = 12 / Math.hypot(12, 2.85);
      const floorPixel = Math.max(height * 0.5, height - (height < 500 ? 150 : width < 701 ? 220 : 210));
      const targetY = FREE_FLOOR + (floorPixel / height - 0.5) * viewHeight / tiltCos;
      camera.position.set(0, targetY + 2.85, 12); camera.lookAt(0, targetY, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      physics.setBounds(Math.min(4.3, viewWidth / 2 - 0.22), Math.min(5.5, targetY + viewHeight * (0.5 - 70 / height) / tiltCos - 0.25));
      renderer.setPixelRatio(pixelRatio); renderer.setSize(width, height, false); wake();
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); cleanup.push(() => observer.disconnect()); resize();
    const setRay = (x: number, y: number) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
    };
    const bindingAt = (hit: THREE.Intersection): Binding => {
      const position = skin.geometry.getAttribute('position'), face = hit.face!;
      a.fromBufferAttribute(position, face.a); b.fromBufferAttribute(position, face.b); c.fromBufferAttribute(position, face.c);
      THREE.Triangle.getBarycoord(hit.point, a, b, c, bary);
      const weights = new Map<number, number>();
      [face.a, face.b, face.c].forEach((vertex, index) => {
        const binding = skin.bindings[vertex], scale = Math.max(0, bary.getComponent(index));
        binding.ids.forEach((id, i) => weights.set(id, (weights.get(id) ?? 0) + binding.weights[i] * scale));
      });
      const total = [...weights.values()].reduce((sum, w) => sum + w, 0);
      return { ids: [...weights.keys()], weights: [...weights.values()].map(w => w / total) };
    };
    const start = (hit: THREE.Intersection): Grab => ({ anchor: hit.point.clone(), target: hit.point.clone(),
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), hit.point), distance: 0, age: 0 });
    const down = (event: PointerEvent) => {
      if (paused || document.hidden || disposed || physics.grabbed || (event.pointerType === 'mouse' && event.button !== 0)) return;
      setRay(event.clientX, event.clientY);
      const hit = raycaster.intersectObject(jelly)[0];
      if (!hit?.face) return;
      const grab = start(hit);
      if (!pointers.begin(event.pointerId, grab)) return;
      if (!physics.grab(bindingAt(hit))) { pointers.end(event.pointerId); return; }
      physics.move(grab.target, jellyPressure(grab.anchor, grab.target, 0));
      event.preventDefault(); canvas.focus({ preventScroll: true }); canvas.classList.add('is-pointer-focused');
      interactions++; syncInteraction(); audio.play('press', 0.45); wake();
    };
    const move = (event: PointerEvent) => {
      if (paused || disposed) return;
      setRay(event.clientX, event.clientY);
      const grab = pointers.get(event.pointerId);
      if (!grab) { if (!physics.grabbed) canvas.classList.toggle('is-hovering', raycaster.intersectObject(jelly).length > 0); return; }
      event.preventDefault();
      if (raycaster.ray.intersectPlane(grab.plane, hitPoint)) {
        grab.target.copy(hitPoint); grab.distance = grab.target.distanceTo(grab.anchor); wake();
      }
    };
    const up = (event: PointerEvent) => {
      const grab = pointers.get(event.pointerId);
      if (!grab) return;
      const cancelled = event.type !== 'pointerup';
      if (!cancelled) {
        setRay(event.clientX, event.clientY);
        if (raycaster.ray.intersectPlane(grab.plane, hitPoint)) physics.move(hitPoint, jellyPressure(grab.anchor, hitPoint, grab.age));
      }
      pointers.end(event.pointerId);
      physics.release(cancelled); syncInteraction(); if (!cancelled) audio.play('release', 0.4); else audio.stop(); wake();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (document.activeElement !== canvas || paused || document.hidden || disposed || pointers.size) return;
      if (!['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return;
      event.preventDefault(); canvas.classList.remove('is-pointer-focused');
      if (event.code === 'Space' && !event.repeat && !keyboard) {
        // Raycast the current body, including while airborne; keyboard never teleports it home.
        const box = skin.geometry.boundingBox!, height = box.max.y - box.min.y;
        const targets = [new THREE.Vector3(physics.center.x, physics.center.y + 0.3, physics.center.z),
          new THREE.Vector3(physics.center.x, box.max.y - height * 0.15, physics.center.z),
          new THREE.Vector3(box.min.x * 0.25 + box.max.x * 0.75, physics.center.y, physics.center.z)];
        let hit: THREE.Intersection | undefined;
        for (const target of targets) {
          target.project(camera); raycaster.setFromCamera(new THREE.Vector2(target.x, target.y), camera);
          hit = raycaster.intersectObject(jelly)[0];
          if (hit?.face) break;
        }
        if (hit?.face && physics.grab(bindingAt(hit))) {
          keyboard = start(hit); physics.move(keyboard.target, jellyPressure(keyboard.anchor, keyboard.target, 0));
          interactions++; syncInteraction(); audio.play('press', 0.45);
        }
      }
      if (keyboard) keys.add(event.code); wake();
    };
    const keyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
      if (event.code !== 'Space' || !keyboard) return;
      event.preventDefault(); keyboard = null; keys.clear(); physics.release(); syncInteraction(); audio.play('release', 0.4); wake();
    };
    const listen = (target: EventTarget, name: string, fn: EventListener) => {
      target.addEventListener(name, fn); cleanup.push(() => target.removeEventListener(name, fn));
    };
    listen(canvas, 'pointerdown', down as EventListener); listen(canvas, 'pointermove', move as EventListener);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, name, up as EventListener);
    listen(canvas, 'pointerleave', () => canvas.classList.remove('is-hovering'));
    listen(canvas, 'keydown', keyDown as EventListener); listen(window, 'keyup', keyUp as EventListener);
    listen(window, 'blur', () => { cancel(); wake(); }); listen(canvas, 'blur', () => { cancel(); wake(); });
    listen(document, 'visibilitychange', () => {
      if (document.hidden) { cancel(); cancelAnimationFrame(frameId); frameId = 0; }
      lastTime = accumulator = 0; if (!document.hidden) wake();
    });
    const update = () => {
      skin.update(physics.positions);
      if (shape === 'jelly') {
        const stage = round.active ? physics.transformationAmount : 0;
        material.color.copy(ordinaryColor).lerp(round.active ? awakenedColor : transformedColor, physics.transformationAmount);
        material.attenuationColor.copy(ordinaryAbsorption).lerp(awakenedAbsorption, stage);
        material.emissive.set('#92edff');
        material.emissiveIntensity = stage * (0.06 + round.delight * 0.04);
        material.transmission = finish.transmission * (1 - stage * 0.56);
        material.clearcoat = THREE.MathUtils.lerp(finish.clearcoat, 0.5, stage);
        hemisphere.groundColor.copy(ordinaryGroundLight).lerp(awakenedGroundLight, stage);
        (scene.background as THREE.Color).copy(ordinaryBackground).lerp(cosmicBackground, stage);
        floor.material.color.copy(scene.background as THREE.Color);
        material.roughness = finish.roughness + 0.04 * physics.transformationAmount;
        reportTransformation();
      }
      const box = skin.geometry.boundingBox!;
      const altitude = Math.max(0, box.min.y - FREE_FLOOR);
      const spread = Math.min(1.35, (box.max.x - box.min.x) / 2.1);
      shadow.shadow.position.set(physics.center.x, FREE_FLOOR, physics.center.z);
      shadow.shadow.scale.setScalar(spread * (1 + altitude * 0.2));
      shadow.shadow.material.opacity = 0.8 / (1 + altitude * 1.5);
      thickness.value = THREE.MathUtils.clamp(box.max.z - box.min.z, finish.thickness * 0.6, finish.thickness * 1.5);
    };
    const frame = (time: number) => {
      frameId = 0;
      if (disposed || paused || document.hidden) { lastTime = accumulator = 0; return; }
      inFrame = true;
      const rawElapsed = lastTime ? (time - lastTime) / 1000 : FREE_STEP;
      const elapsed = Math.max(0, Math.min(rawElapsed, 0.05)); lastTime = time;
      const grab = keyboard ?? [...pointers.values()][0];
      if (grab) {
        grab.age += elapsed;
        if (keyboard) {
          grab.target.x += ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * elapsed * 2.2;
          grab.target.y += ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) * elapsed * 2.2;
          grab.target.x = THREE.MathUtils.clamp(grab.target.x, -physics.bounds.x + 0.2, physics.bounds.x - 0.2);
          grab.target.y = THREE.MathUtils.clamp(grab.target.y, FREE_FLOOR + 0.18, physics.bounds.top - 0.3);
          grab.distance = grab.target.distanceTo(grab.anchor);
        }
        physics.move(grab.target, jellyPressure(grab.anchor, grab.target, grab.age));
      }
      accumulator += elapsed; let steps = 0, impact = 0;
      while (accumulator >= FREE_STEP && steps < 6) { physics.step(); impact = Math.max(impact, physics.impact); accumulator -= FREE_STEP; steps++; }
      if (impact > 1.2) audio.play('press', Math.min(0.65, impact / 12));
      audio.update({ contacts: physics.grabbed ? 1 : 0, compression: physics.pressure,
        stretch: Math.min(1, (grab?.distance ?? 0) / 2), motion: Math.min(1, physics.speed / 6), twist: 0 });
      update();
      const previousPhase = round.phase;
      round.step(elapsed, physics.transformationState);
      if (round.phase === 'returning' && previousPhase !== 'returning') physics.setTransformation(false);
      physics.bonusGravity = round.active;
      if (effects) {
        effects.update(elapsed, round, physics.center, physics.reducedMotion, physics.transformationAmount);
        reportBonus();
        // The companion has its own idle life; touch only changes how it moves and reacts.
        if (round.phase === 'visiting') {
          quietAge = physics.grabbed || physics.speed > 0.65 ? 0 : quietAge + elapsed;
          if (quietAge > 5.8 && physics.celebrate(0.6)) quietAge = 0;
        } else quietAge = 0;
        character?.update(elapsed, {active:round.active,amount:physics.transformationAmount,phase:round.phase,age:round.age,delight:round.delight,
          grabbed:physics.grabbed,pressure:physics.pressure,speed:physics.speed,impact,target:effects.focusWorld,reducedMotion:physics.reducedMotion});
      }
      try { renderer.render(scene, camera); } catch (error) {
        console.error(error); context.onError('Could not render this toy. Try again to restart it.'); dispose(); return;
      }
      frames++;
      const keepRunning = activity.update(elapsed, physics.isAtRest() && !round.animated);
      if (import.meta.env.DEV && (frames % 6 === 0 || !keepRunning)) {
        canvas.dataset.diagnostics = JSON.stringify({ ...physics.diagnostics(), shape, frames, sleeping: !keepRunning,
          backend: renderer.backend.constructor.name, pointerCount: pointers.size, keyboardActive: !!keyboard,
          interactionCount: interactions, pixelRatio, memory: { ...renderer.info.memory } });
        if (effects) canvas.dataset.bonus = JSON.stringify({...round.snapshot,age:round.age});
        if (character) canvas.dataset.character = JSON.stringify(character.diagnostics());
      }
      if (frames > 90 && rawElapsed > 1 / 50) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 90 && pixelRatio > 0.9) { pixelRatio = Math.max(0.9, pixelRatio * 0.8); resize(); slowFrames = 0; }
      inFrame = false;
      if (keepRunning) frameId = requestAnimationFrame(frame);
    };
    update(); await renderer.compileAsync(scene, camera);
    if (context.signal.aborted) { dispose(); return null; }
    renderer.render(scene, camera);
    wake = () => {
      activity.wake();
      if (disposed || paused || document.hidden || frameId || inFrame) return;
      lastTime = accumulator = 0; frameId = requestAnimationFrame(frame);
    };
    canvas.tabIndex = 0; wake();
    context.signal.addEventListener('abort', dispose, { once: true });
    cleanup.push(() => context.signal.removeEventListener('abort', dispose));
    return {
      reset: () => { cancel(); physics.reset(); update(); wake(); },
      setPaused: value => { paused = value; if (value) { cancel(); cancelAnimationFrame(frameId); frameId = 0; } lastTime = accumulator = 0; if (!value) wake(); },
      setSound: async enabled => {
        try { await Promise.all([audio.setEnabled(enabled), ...(shape === 'jelly' ? [chimes.setEnabled(enabled)] : [])]); }
        catch (error) { await audio.setEnabled(false); await chimes.setEnabled(false); throw error; }
      },
      setReducedMotion: value => { physics.reducedMotion = value; wake(); },
      ...(shape === 'jelly' ? { setTransformation: (enabled: boolean) => {
        if (disposed) return;
        physics.setTransformation(enabled); reportTransformation(); wake();
      }, startBonusRound: () => {
        if (disposed || !round.start()) return;
        effects ??= createBonusEffects(scene, camera);
        character ??= createBonusCharacter(scene, camera, jelly);
        physics.bonusGravity = true;
        physics.setTransformation(true); reportBonus(); wake();
      }, finishBonusRound: () => {
        if (disposed) return;
        round.finish(); physics.setTransformation(false); reportBonus(); wake();
      } } : {}),
      dispose,
    };
  } catch (error) { dispose(); if (!context.signal.aborted) throw error; return null; }
}
