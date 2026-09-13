import * as THREE from 'three/webgpu';
import { normalView, positionViewDirection, uniform } from 'three/tsl';
import { SoftBodyPhysics, STEP, FLOOR, MAX_CONTACTS, type StrainSample } from './physics';
import { createSoftGeometry } from './geometry';
import { createStudioEnvironment, createContactShadow } from './lighting';
import { SurfaceRipples } from './ripples';
import { SoftToyActivity } from './activity';
import { updateSoftSurface } from './surface';
import { pickSoftSurface } from './picking';
import { dragPressure, localDragDelta } from './input';
import { CapturedPointers } from './pointers';
import { PairTurnPressure } from './pair-turn';
import { UprightRotation } from './rotation';
import { SoftBodyAudio } from './audio';
import { disposeRendererOutput, trackRendererTextures } from './renderer-textures';
import { entranceAt, entranceStretchAt, ENTRANCE_DURATION } from './entrance';
import { MaterialResponse } from './reactions';
import { BurstVisual, recoveryAt } from './burst-visual';
import type { SoftToyProfile } from './profiles';
import type { ToyContext, ToyController } from '../toys/types';

export async function createSoftToyScene(canvas: HTMLCanvasElement, context: ToyContext, profile: SoftToyProfile): Promise<ToyController | null> {
  const { signal } = context;
  let paused = context.preferences.paused;
  const renderer = new THREE.WebGPURenderer({
    canvas, antialias: true,
    forceWebGL: new URLSearchParams(location.search).get('renderer') === 'webgl',
  });
  let disposed = false;
  const physics = new SoftBodyPhysics(profile.feel);
  const rotation=new UprightRotation();
  const ripples=new SurfaceRipples();
  const audio = new SoftBodyAudio(profile.soundPitch,undefined,profile.soundTexture);
  const response=new MaterialResponse(profile.reaction);
  const strain:StrainSample={strain:0,point:{x:0,y:1,z:0},direction:{x:0,y:-1,z:0}};
  const scene = new THREE.Scene();
  const background = new THREE.Color(context.theme.background);
  scene.background = background;
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
  const cleanup: (()=>void)[] = [];
  let environmentTarget: THREE.RenderTarget | null = null;
  let pmrem: THREE.PMREMGenerator | null = null;
  let disposeRendererTextures = () => {};
  let frameId = 0;
  let requestFrame=()=>{};
  const dispose = () => {
    if(disposed) return;
    disposed=true;
    cancelAnimationFrame(frameId);
    for(const fn of cleanup.splice(0)) fn();
    requestFrame=()=>{};
    renderer.onDeviceLost=()=>{};
    audio.dispose();
    scene.traverse(object=>{
      if(object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials=Array.isArray(object.material)?object.material:[object.material];
        materials.forEach(material=>material.dispose());
      }
    });
    environmentTarget?.dispose();
    pmrem?.dispose();
    disposeRendererTextures();
    disposeRendererOutput(renderer);
    scene.clear();
    scene.environment=null;
    renderer.dispose();
  };

  try {
    await renderer.init();
    if(signal.aborted) { dispose(); return null; }
    // init() selects the actual backend, including automatic WebGL fallback.
    disposeRendererTextures=trackRendererTextures(renderer.backend as unknown as Parameters<typeof trackRendererTextures>[0]);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.onDeviceLost = () => {
      if(disposed) return;
      context.onError('Graphics connection lost. Try again to restart.');
      dispose();
    };
    const room = createStudioEnvironment(context.theme.background,profile.material.surface);
    pmrem = new THREE.PMREMGenerator(renderer);
    try { environmentTarget = pmrem.fromScene(room.scene, 0.015); }
    finally { room.dispose(); }
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = 0.75;

    scene.add(new THREE.HemisphereLight(0xfff9f4,0xd399ac,0.6));
    const key = new THREE.DirectionalLight(0xfff6e9,0.25);
    key.position.set(-3,6,4);
    scene.add(key);
    const rim=new THREE.DirectionalLight(0xffd2de,0.2);
    rim.position.set(3,4,-3); scene.add(rim);

    const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshBasicNodeMaterial({color:background,toneMapped:false,fog:false}));
    floor.rotation.x=-Math.PI/2;
    floor.position.y=FLOOR-0.008;
    scene.add(floor);
    const contact=createContactShadow(context.theme.foreground);
    contact.shadow.position.y=FLOOR;
    scene.add(contact.shadow);cleanup.push(()=>contact.texture.dispose());

    const geometry=createSoftGeometry(profile.shape);
    const finish=profile.material;
    const material=new THREE.MeshPhysicalNodeMaterial({
      color:finish.color, metalness:0, roughness:finish.roughness,
      transmission:finish.transmission, thickness:finish.thickness, ior:finish.ior,
      attenuationColor:new THREE.Color(finish.absorption), attenuationDistance:finish.absorptionDistance,
      clearcoat:finish.clearcoat, clearcoatRoughness:finish.clearcoatRoughness, envMapIntensity:1,
    });
    const opticalDepth=uniform(finish.thickness);
    if(finish.transmission>0.5) {
      // Approximate the path through a rounded solid after refraction. The old
      // view-normal fade erased absorption at the rim and created a milky halo.
      // Snell's law keeps a substantial path length even at grazing angles.
      const facing=normalView.dot(positionViewDirection).clamp(0,1);
      const refractedChord=facing.mul(facing).oneMinus().div(finish.ior*finish.ior).oneMinus().sqrt();
      material.thicknessNode=refractedChord.mul(opticalDepth);
    }
    const jelly=new THREE.Mesh(geometry,material);
    scene.add(jelly);
    const position=geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setUsage(THREE.DynamicDrawUsage);
    const original=new Float32Array(position.array);
    const bindings=Array.from({length:position.count},(_,i)=>physics.bind(original[i*3],original[i*3+1],original[i*3+2]));
    const burst=profile.reaction.kind==='pop'?new BurstVisual(geometry,original):null;
    if(burst) cleanup.push(()=>burst.dispose());


    physics.reducedMotion=context.preferences.reducedMotion;
    let entranceAge=0;
    const updatePose=()=>{
      const entrance=entranceAt(entranceAge,physics.reducedMotion);
      const stretch=entranceStretchAt(entranceAge,physics.reducedMotion);
      const width=entrance.scale/Math.sqrt(stretch);
      const height=entrance.scale*stretch;
      jelly.scale.set(width,height,width);
      jelly.position.y=FLOOR*(1-height)+entrance.lift;
      jelly.rotation.y=rotation.angle;
      const compression=physics.compressionAmount*(response.bursting?1-recoveryAt(response.age):1);
      opticalDepth.value=finish.thickness/Math.sqrt(1-compression);
      contact.shadow.scale.setScalar(1/Math.sqrt(1-compression));
      contact.shadow.material.opacity=entrance.shadow;
      contact.shadow.rotation.set(-Math.PI/2,0,rotation.angle);
      jelly.updateMatrixWorld();
    };
    updatePose();

    let pixelRatio=Math.min(Math.max(devicePixelRatio || 1,1.5), 1.75);
    let layoutWidth=0,layoutHeight=0;
    let releaseForResize=()=>{};
    const resize=()=>{
      if(disposed) return;
      const width=canvas.clientWidth, height=canvas.clientHeight;
      if(!width || !height) return;
      // Captured points use a plane from the camera at grab time. Release them
      // before changing that camera so orientation changes cannot drag the skin.
      // Adaptive resolution keeps the same CSS size and retains every grip.
      if(layoutWidth && layoutHeight && (width!==layoutWidth || height!==layoutHeight)) releaseForResize();
      layoutWidth=width;layoutHeight=height;
      camera.aspect=width/height;
      // Keep the standalone jelly comfortably large, with room to stretch.
      const mobile=width<701;
      // Match the compact dock on short screens and leave room for the skin
      // to stretch without crossing either the header or the reset control.
      const preferredHeight=Math.max(260,height-(mobile?245:190));
      const usableHeight=Math.max(120,Math.min(preferredHeight,height-130));
      const viewHeight=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      const distance=Math.max(3.4/viewHeight*height/usableHeight,3.85/(viewHeight*camera.aspect))+0.5;
      camera.position.set(0,distance*0.42,distance*0.91);
      camera.lookAt(0,0.80,0);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width,height,false);
      requestFrame();
    };
    const observer=new ResizeObserver(resize); observer.observe(canvas); resize();
    cleanup.push(()=>observer.disconnect());

    const raycaster=new THREE.Raycaster();
    const pointer=new THREE.Vector2();
    const localAnchor=new THREE.Vector3();
    const inverseDragMatrix=new THREE.Matrix4();
    const intersection=new THREE.Vector3();
    type PointerGrab = {
      id:number; pressure:number; appliedPressure:number;
      anchor:THREE.Vector3; normal:THREE.Vector3; plane:THREE.Plane;
      rippleOrigin:THREE.Vector3; strength:number; offset:THREE.Vector3;
      dragLength:number; pendingMovement:number; startedAt:number; clientX:number; clientY:number;
    };
    const pointers=new CapturedPointers<PointerGrab>(canvas,MAX_CONTACTS);
    const rotationPointers=new CapturedPointers<object>(canvas,1);
    const rotationKeys=new Set<string>();
    const pairTurns=new PairTurnPressure(MAX_CONTACTS);
    const KEYBOARD_CONTACT=-1;
    let keyboard=false;
    const keys=new Set<string>();
    const keyboardOffset=new THREE.Vector3();
    const keyboardPreviousOffset=new THREE.Vector3();
    const keyboardDirection=new THREE.Vector3(),keyboardOrigin=new THREE.Vector3(),keyboardNormal=new THREE.Vector3(0,1,0);
    const keyboardRippleOrigin=new THREE.Vector3();
    let keyboardTwist=0,keyboardStrength=0.5,keyboardStartedAt=0;
    let gestureMotion=0,lastAudioCompression=0;
    let interactionCount=0, peakDisplacement=0;
    const setRay=(x:number,y:number)=>{
      const rect=canvas.getBoundingClientRect();
      pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(pointer,camera);
    };
    const syncInteraction=()=>{
      const active=pointers.size>0 || keyboard || rotationPointers.size>0 || rotationKeys.size>0;
      canvas.classList.toggle('is-grabbing',active);
      context.onInteractionChange(active);
    };
    const releaseFeedback=(origin:THREE.Vector3,strength:number,dragLength:number,startedAt:number)=>{
      if(!physics.reducedMotion)ripples.add(origin,
        Math.min(1,0.3+physics.compressionAmount*1.2+strength*0.3)*profile.rippleStrength);
      const held=1-Math.exp(-Math.max(0,(performance.now()-startedAt)/1000)/1.2);
      const stretch=Math.min(1,dragLength/profile.feel.dragLimit);
      const compression=THREE.MathUtils.clamp(physics.compressionAmount/0.54,0,1);
      audio.play('release',Math.min(1,0.18+stretch*0.38+compression*0.28+held*0.24));
    };
    const endPointer=(id:number,feedback=true)=>{
      const contact=pointers.end(id);
      if(!contact) return;
      physics.release(id,feedback);
      pairTurns.end(id);
      if(feedback) releaseFeedback(contact.rippleOrigin,contact.strength,contact.dragLength,contact.startedAt);
      syncInteraction();requestFrame();
    };
    const endKeyboard=(feedback=true)=>{
      if(!keyboard) return;
      const dragLength=keyboardOffset.length();
      keyboard=false;keys.clear();keyboardOffset.set(0,0,0);keyboardTwist=0;
      physics.release(KEYBOARD_CONTACT,feedback);
      if(feedback) releaseFeedback(keyboardRippleOrigin,keyboardStrength,dragLength,keyboardStartedAt);
      syncInteraction();requestFrame();
    };
    const endAll=()=>{
      pointers.clear();
      pairTurns.clear();
      rotationPointers.clear();rotationKeys.clear();rotation.stop();
      keyboard=false;keys.clear();keyboardOffset.set(0,0,0);keyboardTwist=0;
      gestureMotion=0;lastAudioCompression=THREE.MathUtils.clamp(physics.compressionAmount/0.54,0,1);
      physics.releaseAll();
      syncInteraction();requestFrame();
    };
    const down=(event:PointerEvent)=>{
      if(paused || response.bursting || keyboard || rotationPointers.size || rotationKeys.size || pointers.has(event.pointerId) || pointers.size>=MAX_CONTACTS || event.button!==0) return;
      rotation.stop();updatePose();
      setRay(event.clientX,event.clientY);
      const hit=pickSoftSurface(raycaster,jelly,camera,pointer);
      if(!hit) {
        // The gesture is chosen at pointerdown and never changes when a drag
        // crosses the skin. Existing grips always retain their material action.
        if(pointers.size || !rotationPointers.begin(event.pointerId,{}))return;
        rotation.begin(event.clientX,Math.min(canvas.clientWidth,canvas.clientHeight),event.timeStamp);
        event.preventDefault();canvas.classList.add('is-pointer-focused');canvas.focus({preventScroll:true});
        syncInteraction();requestFrame();return;
      }
      const contact:PointerGrab={
        id:event.pointerId,pressure:1,appliedPressure:1,
        anchor:hit.point.clone(),normal:(hit.normal ?? hit.face!.normal).clone().normalize(),
        plane:new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),hit.point),
        rippleOrigin:new THREE.Vector3(),strength:0.5,offset:new THREE.Vector3(),
        dragLength:0,pendingMovement:0,startedAt:performance.now(),clientX:event.clientX,clientY:event.clientY,
      };
      if(!pointers.begin(event.pointerId,contact)) return;
      event.preventDefault();
      canvas.classList.add('is-pointer-focused');
      canvas.focus({preventScroll:true});
      localAnchor.copy(hit.point);jelly.worldToLocal(localAnchor);
      contact.rippleOrigin.copy(physics.toMaterialPoint(localAnchor));
      if(!physics.beginGrab(localAnchor,contact.normal,event.pointerId)) {
        pointers.end(event.pointerId);syncInteraction();return;
      }
      pairTurns.begin(event.pointerId,event.clientX,event.clientY);
      interactionCount++;
      physics.impulse(localAnchor,contact.normal.clone().negate(),profile.feel.pokeKick);
      if(!physics.reducedMotion)ripples.add(contact.rippleOrigin,profile.rippleStrength);
      syncInteraction();audio.play('press');
      requestFrame();
    };
    const move=(event:PointerEvent)=>{
      if(rotationPointers.has(event.pointerId)) {
        rotation.move(event.clientX,event.timeStamp);updatePose();requestFrame();return;
      }
      const contact=pointers.get(event.pointerId);
      if(!contact) {
        if(event.pointerType==='mouse' && pointers.size===0 && !keyboard) {
          setRay(event.clientX,event.clientY);
          canvas.classList.toggle('is-hovering',!!pickSoftSurface(raycaster,jelly,camera,pointer));
        }
        return;
      }
      // A stationary release during entrance scaling is not a new drag sample.
      if(event.clientX===contact.clientX && event.clientY===contact.clientY) return;
      contact.clientX=event.clientX;contact.clientY=event.clientY;
      setRay(event.clientX,event.clientY);
      if(raycaster.ray.intersectPlane(contact.plane,intersection)) {
        localDragDelta(intersection,contact.anchor,inverseDragMatrix.copy(jelly.matrixWorld).invert(),intersection);
        // Pressure follows the touched face. Moving away from that face releases
        // the poke; sideways motion bends and twists the body around the base.
        pairTurns.move(event.pointerId,event.clientX,event.clientY);
        contact.pressure=dragPressure(intersection,contact.normal);
        contact.appliedPressure=pairTurns.pressure(event.pointerId,contact.pressure);
        physics.setPressure(contact.appliedPressure,event.pointerId);
        contact.pendingMovement+=contact.offset.distanceTo(intersection);
        contact.offset.copy(intersection);
        contact.dragLength=intersection.length();
        contact.strength=Math.min(1,contact.dragLength);
        physics.moveGrab(intersection,event.pointerId);
      }
    };
    const up=(event:PointerEvent)=>{
      const released=event.type==='pointerup';
      if(rotationPointers.has(event.pointerId)) {
        if(released)move(event);
        rotation.release(event.timeStamp,released && !physics.reducedMotion);
        rotationPointers.end(event.pointerId);
        syncInteraction();requestFrame();return;
      }
      // Some devices coalesce the last movement into pointerup. Cancellation
      // coordinates may be stale or zero, so only sample an actual release.
      if(released && pointers.has(event.pointerId)) move(event);
      endPointer(event.pointerId,released);
    };
    const beginKeyboard=()=>{
      if(keyboard || pointers.size>0 || rotationPointers.size || rotationKeys.size)return false;
      rotation.stop();updatePose();
      canvas.classList.remove('is-pointer-focused');
      keyboard=true;keyboardOffset.set(0,0,0);keyboardTwist=0;keyboardStrength=0.5;keyboardStartedAt=performance.now();
      // Pick actual skin, even on hollow or lobed shapes and stretched tips.
      let top=0;
      for(let i=1;i<position.count;i++)if(position.getY(i)>position.getY(top))top=i;
      localAnchor.fromBufferAttribute(position,top);
      keyboardNormal.fromBufferAttribute(geometry.getAttribute('normal'),top).normalize();
      keyboardRippleOrigin.copy(physics.toMaterialPoint(localAnchor));
      if(!physics.beginGrab(localAnchor,keyboardNormal,KEYBOARD_CONTACT)){
        keyboard=false;syncInteraction();return false;
      }
      interactionCount++;
      physics.impulse(localAnchor,keyboardNormal.clone().negate(),profile.feel.pokeKick);
      if(!physics.reducedMotion)ripples.add(keyboardRippleOrigin,profile.rippleStrength);
      syncInteraction();audio.play('press');requestFrame();return true;
    };
    const keyboardTargetIsInteractive=(event:KeyboardEvent)=>{
      const target=event.target;
      if(!(target instanceof HTMLElement) || target===canvas)return false;
      if(target.isContentEditable || target.matches('input,textarea,select') || !!target.closest('[role="dialog"]'))return true;
      return (event.code==='Space' || event.code.startsWith('Arrow')) && !!target.closest('button,a');
    };
    const keyDown=(event:KeyboardEvent)=>{
      if(paused || response.bursting || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || keyboardTargetIsInteractive(event))return;
      if(event.code==='Space') {
        event.preventDefault();
        if(!keyboard && (event.repeat || !beginKeyboard()))return;
        keys.add('Space');requestFrame();
      } else if(event.code==='KeyQ' || event.code==='KeyE') {
        event.preventDefault();
        if(!keyboard && !beginKeyboard())return;
        if(!event.repeat && !keys.has(event.code)){
          keyboardTwist=THREE.MathUtils.clamp(keyboardTwist+(event.code==='KeyE'?.12:-.12),-.8,.8);
          physics.setTwist(keyboardTwist,KEYBOARD_CONTACT);
        }
        keys.add(event.code);requestFrame();
      } else if(keyboard && (event.code.startsWith('Arrow') || event.code==='KeyQ' || event.code==='KeyE')) {
        event.preventDefault(); keys.add(event.code);
      } else if(!keyboard && (event.code==='ArrowLeft' || event.code==='ArrowRight')) {
        event.preventDefault();
        if(pointers.size || rotationPointers.size || event.repeat)return;
        canvas.classList.remove('is-pointer-focused');
        rotationKeys.add(event.code);
        rotation.rotate(event.code==='ArrowRight'?0.055:-0.055);
        updatePose();syncInteraction();requestFrame();
      }
    };
    const keyUp=(event:KeyboardEvent)=>{
      if(keyboard && ['Space','KeyQ','KeyE','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code))event.preventDefault();
      keys.delete(event.code);
      if(keyboard && !keys.has('Space') && !keys.has('KeyQ') && !keys.has('KeyE'))endKeyboard();
      if(rotationKeys.delete(event.code)) {syncInteraction();requestFrame();}
    };
    const leave=()=>{canvas.classList.remove('is-hovering');};
    const cancelGrab=()=>{endAll();audio.stop();canvas.classList.remove('is-pointer-focused');};
    releaseForResize=()=>{cancelGrab();canvas.classList.remove('is-hovering');};
    const visibility=()=>{if(document.hidden){endAll();audio.stop();} lastTime=0;accumulator=0;if(!document.hidden)requestFrame();};
    const listen=(target:EventTarget,type:string,handler:EventListener)=>{
      target.addEventListener(type,handler); cleanup.push(()=>target.removeEventListener(type,handler));
    };
    listen(canvas,'pointerdown',down as EventListener);
    listen(canvas,'pointermove',move as EventListener);
    listen(canvas,'pointerup',up as EventListener);
    listen(canvas,'pointercancel',up as EventListener);
    listen(canvas,'lostpointercapture',up as EventListener);
    listen(canvas,'pointerleave',leave);
    listen(window,'keydown',keyDown as EventListener);
    listen(window,'keyup',keyUp as EventListener);
    listen(window,'blur',cancelGrab);
    listen(canvas,'blur',cancelGrab);
    listen(document,'visibilitychange',visibility);
    cleanup.push(endAll);

    const updateGestureAudio=(elapsed:number,keyboardMovement:number)=>{
      const contacts=pointers.size+(keyboard?1:0);
      let movement=keyboardMovement,stretch=keyboard?keyboardOffset.length()/profile.feel.dragLimit:0;
      for(const contact of pointers.values()) {
        movement=Math.max(movement,contact.pendingMovement);
        stretch=Math.max(stretch,contact.dragLength/profile.feel.dragLimit);
        contact.pendingMovement=0;
      }
      const compression=THREE.MathUtils.clamp(physics.compressionAmount/0.54,0,1);
      const seconds=Math.max(elapsed,0.001);
      // One shared envelope follows the most active finger. More contacts never
      // multiply volume, and motion decays even while a stretched pose is held.
      const handMotion=1-Math.exp(-movement/seconds*0.45);
      const creepMotion=Math.min(0.12,Math.abs(compression-lastAudioCompression)/Math.max(elapsed,STEP)*0.08);
      gestureMotion=contacts?Math.max(gestureMotion*Math.exp(-elapsed/0.1),handMotion,creepMotion):0;
      lastAudioCompression=compression;
      audio.update({contacts,compression,stretch:Math.min(1,stretch),motion:gestureMotion,
        twist:THREE.MathUtils.clamp(Math.abs(physics.twistAmount)/0.8,0,1)});
    };

    const updateMaterialResponse=(elapsed:number)=>{
      const wasBursting=response.bursting;
      if(!wasBursting) physics.measureStrain(strain);
      const popped=response.step(elapsed,strain);
      if(popped) {
        burst?.trigger(strain.point,strain.direction);
        endAll();audio.stop();audio.play('pop',0.8);
        ripples.clear();
      }
      if(wasBursting && !response.bursting) {
        // The visible surface has already returned to its mould continuously.
        physics.reset();burst?.clear();
      }
    };

    let lastTime=0, accumulator=0, slowFrames=0, frames=0, fps=60, inFrame=false;
    const activity=new SoftToyActivity();
    const frame=(time:number)=>{
      frameId=0;
      if(disposed) return;
      if(paused || document.hidden) {lastTime=0;return;}
      inFrame=true;
      const rawElapsed=lastTime ? (time-lastTime)/1000 : STEP;
      const elapsed=Math.min(rawElapsed,0.05);
      lastTime=time;
      if(rotationKeys.size)rotation.rotate(((rotationKeys.has('ArrowRight')?1:0)-(rotationKeys.has('ArrowLeft')?1:0))*elapsed*1.5);
      else rotation.step(elapsed);
      let keyboardMovement=0;
      if(keyboard) {
        keyboardPreviousOffset.copy(keyboardOffset);
        const previousTwist=keyboardTwist;
        keyboardDirection.set((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0),
          (keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0),0).clampLength(0,1);
        keyboardDirection.applyQuaternion(camera.quaternion).multiplyScalar(elapsed*1.1);
        localDragDelta(keyboardDirection,keyboardOrigin,inverseDragMatrix.copy(jelly.matrixWorld).invert(),keyboardDirection);
        keyboardOffset.add(keyboardDirection).clampLength(0,profile.feel.dragLimit*2);
        keyboardTwist=THREE.MathUtils.clamp(keyboardTwist+((keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0))*elapsed*1.45,-0.8,0.8);
        physics.setPressure(dragPressure(keyboardOffset,keyboardNormal),KEYBOARD_CONTACT);
        physics.moveGrab(keyboardOffset,KEYBOARD_CONTACT);
        physics.setTwist(keyboardTwist,KEYBOARD_CONTACT);
        keyboardStrength=Math.max(0.5,Math.min(1,keyboardOffset.length()));
        keyboardMovement=keyboardOffset.distanceTo(keyboardPreviousOffset)+Math.abs(keyboardTwist-previousTwist)*0.5;
      }
      if(!response.bursting) {
        accumulator+=elapsed;
        let steps=0;
        while(accumulator>=STEP && steps<6) {
          pairTurns.step(STEP);
          for(const contact of pointers.values()) {
            const pressure=pairTurns.pressure(contact.id,contact.pressure);
            if(Math.abs(pressure-contact.appliedPressure)>0.000001) {
              contact.appliedPressure=pressure;physics.setPressure(pressure,contact.id);
            }
          }
          physics.step();
          accumulator-=STEP;steps++;
        }
      } else accumulator=0;
      updateMaterialResponse(elapsed);
      updateGestureAudio(elapsed,keyboardMovement);
      entranceAge=Math.min(ENTRANCE_DURATION,entranceAge+elapsed);
      updatePose();
      ripples.advance(elapsed);
      if(response.bursting) burst?.update(response.age,physics.reducedMotion);
      else updateSoftSurface(geometry,physics,original,bindings,ripples,accumulator/STEP);
      try {renderer.render(scene,camera);} catch(error) {
        console.error(error);
        context.onError('Could not render this toy. Try again to restart it.'); dispose(); return;
      }
      frames++;
      fps=fps*0.97+(1/Math.max(rawElapsed,0.001))*0.03;
      if(frames>120 && rawElapsed>1/52) slowFrames++; else slowFrames=Math.max(0,slowFrames-1);
      if(slowFrames>100 && pixelRatio>0.85) {pixelRatio=Math.max(0.85,pixelRatio*0.8);resize();slowFrames=0;}
      const keepRunning=activity.update(elapsed,entranceAge>=ENTRANCE_DURATION && !ripples.active && physics.isAtRest() && !response.active && !rotation.active && !rotationKeys.size);
      if(import.meta.env.DEV && (frames%6===0 || response.bursting || !keepRunning)) {
        const state=physics.diagnostics();peakDisplacement=Math.max(peakDisplacement,state.displacement);
        const bounds=geometry.boundingBox!;
        const normals=geometry.getAttribute('normal') as THREE.BufferAttribute;
        const normalMiddle=Math.floor(normals.count/2);
        canvas.dataset.diagnostics=JSON.stringify({backend:renderer.backend.constructor.name,shape:profile.shape,
          fps,pixelRatio,frames,interactionCount,pointerCount:pointers.size,keyboardActive:keyboard,
          peakDisplacement,entrance:entranceAge,sleeping:!keepRunning,
          height:bounds.max.y-bounds.min.y,width:bounds.max.x-bounds.min.x,...state,
          reaction:{kind:profile.reaction.kind,fatigue:response.fatigue,strain:strain.strain,phase:response.bursting?'burst':'ready',age:response.age,pops:response.count},
          burst:burst?.diagnostics() ?? {active:false,phase:'ready',droplets:0},
          surface:{positionVersion:position.version,normalVersion:normals.version,
            normalSample:[normals.getX(0),normals.getY(0),normals.getZ(0),normals.getX(normalMiddle),normals.getY(normalMiddle),normals.getZ(normalMiddle)],
            sphereRadius:geometry.boundingSphere!.radius},
          pairTurn:pairTurns.diagnostics(),
          rotation:{angle:rotation.angle,velocity:rotation.velocity,pointerCount:rotationPointers.size,keyboardActive:rotationKeys.size>0},
          audio:audio.diagnostics(),memory:{...renderer.info.memory}});
      }
      inFrame=false;
      if(keepRunning) frameId=requestAnimationFrame(frame);
    };

    await renderer.compileAsync(scene,camera);
    if(signal.aborted) {dispose();return null;}
    renderer.render(scene,camera);
    requestFrame=()=>{
      activity.wake();
      if(disposed || paused || document.hidden || frameId!==0 || inFrame) return;
      lastTime=0;accumulator=0;
      frameId=requestAnimationFrame(frame);
    };
    requestFrame();
    signal.addEventListener('abort',dispose,{once:true});
    cleanup.push(()=>signal.removeEventListener('abort',dispose));
    return {
      reset:()=>{endAll();rotation.reset();updatePose();audio.stop();response.reset();burst?.clear();physics.reset();ripples.clear();requestFrame();},
      setSound:async(enabled)=>{await audio.setEnabled(enabled);requestFrame();},
      setPaused:(value)=>{paused=value;if(value){endAll();audio.stop();}lastTime=0;accumulator=0;if(!value)requestFrame();},
      setReducedMotion:(value)=>{physics.reducedMotion=value;if(value){ripples.clear();rotation.velocity=0;}requestFrame();},
      dispose,
    };
  } catch(error) {
    dispose();
    if(!signal.aborted) throw error;
    return null;
  }
}
