import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ToyContext } from '../toys/types';
import type { FieldSample } from '../fields/input';
import { mountField } from '../fields/surface';
import { SilkField, type SilkPointer } from './model';
import { SilkProjection } from './projection';
import { createSilkMaterial, SILK_COLORS } from './material';
import '../fields/surface.css';
import './style.css';

export async function mount(host: HTMLElement, context: ToyContext) {
  return mountField(host, context, 'Silk. Brush to ripple. Catch a patch and drag to lift and gather the fabric.', canvas => {
    let renderer: THREE.WebGLRenderer | undefined, environment: THREE.WebGLRenderTarget | undefined;
    const geometry = new THREE.PlaneGeometry(3.5, 3.5, 72, 72);
    const {material,weave} = createSilkMaterial();
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setClearColor('#191a18'); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .88;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
      const generator = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
      try { environment = generator.fromScene(room, .035); }
      finally { room.dispose(); generator.dispose(); }
    } catch (error) {
      geometry.dispose(); material.dispose(); weave.dispose(); environment?.dispose(); renderer?.dispose(); renderer?.forceContextLoss();
      throw new Error('Silk needs WebGL2 graphics support. ' + (error instanceof Error ? error.message : 'Please try a browser with hardware acceleration.'));
    }
    const scene = new THREE.Scene(); scene.environment = environment!.texture; scene.environmentIntensity = .32;
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 50);
    camera.position.set(3.7, 3.5, 4.3); camera.lookAt(0, 0, 0);
    const cloth = new THREE.Mesh(geometry, material); cloth.castShadow = cloth.receiveShadow = true; scene.add(cloth);
    const light = new THREE.DirectionalLight('#fff6e6', 2); light.position.set(-3, 5, 2); light.castShadow = true;
    light.shadow.mapSize.set(1024,1024); light.shadow.camera.left = light.shadow.camera.bottom = -3.5; light.shadow.camera.right = light.shadow.camera.top = 3.5;
    light.shadow.camera.near = .2; light.shadow.camera.far = 16; light.shadow.bias = -.0004; light.shadow.normalBias = .025; light.shadow.radius = 6; light.shadow.blurSamples = 12; scene.add(light);
    const rim = new THREE.DirectionalLight('#f2f0e8', .8); rim.position.set(3, 2, -3); scene.add(rim);
    const shadowGeometry = new THREE.PlaneGeometry(6, 6);
    const shadowMaterial = new THREE.ShadowMaterial({opacity:.12,depthWrite:false});
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.74; shadow.receiveShadow = true; scene.add(shadow);

    // A subtle hem follows the same vertices and deformation as the sheet.
    const hemIndices: number[] = [], side = 73;
    for(let col=1;col<side-1;col++)hemIndices.push(side+col);
    for(let row=2;row<side-1;row++)hemIndices.push(row*side+side-2);
    for(let col=side-3;col>0;col--)hemIndices.push((side-2)*side+col);
    for(let row=side-3;row>1;row--)hemIndices.push(row*side+1);
    const hemGeometry = new THREE.BufferGeometry();
    const hemPosition = new THREE.BufferAttribute(new Float32Array(hemIndices.length*3),3).setUsage(THREE.DynamicDrawUsage); hemGeometry.setAttribute('position',hemPosition);
    const hemMaterial = new THREE.LineBasicMaterial({color:'#eee5d7',transparent:true,opacity:.27,depthWrite:false});
    const hem = new THREE.LineLoop(hemGeometry,hemMaterial); scene.add(hem);

    const field = new SilkField(), projection = new SilkProjection();
    const position = geometry.attributes.position as THREE.BufferAttribute, uv = geometry.attributes.uv as THREE.BufferAttribute;
    position.setUsage(THREE.DynamicDrawUsage);
    (geometry.attributes.normal as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    const mapped: SilkPointer = {x:.5,y:.5,dx:0,dy:0,inside:false,down:false,keyboard:false,samples:[]};
    const grabPlane = new THREE.Plane(new THREE.Vector3(0,1,0),0), pullTarget = new THREE.Vector3();
    let grab: {u:number;v:number;y:number;id:number}|null = null, wasDown = false, grabId = 0, disposed = false;

    const controls = document.createElement('div'); controls.className = 'silk-palette'; controls.setAttribute('role','group'); controls.setAttribute('aria-label','Fabric color');
    const controlEvents = new AbortController();
    let colorId: string = 'pearl';
    try { colorId = localStorage.getItem('silk-color-v1') ?? 'pearl'; } catch { /* Default palette is available without storage. */ }
    const buttons: HTMLButtonElement[] = [];
    function chooseColor(id: string, persist: boolean) {
      const selected = SILK_COLORS.find(color=>color.id===id) ?? SILK_COLORS[0]; colorId = selected.id;
      material.color.set(selected.color); material.sheenColor.set(selected.sheen); hemMaterial.color.set(selected.sheen);
      buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(SILK_COLORS[i].id===selected.id)));
      if(persist)try{localStorage.setItem('silk-color-v1',selected.id);}catch{/* Selection remains usable for this session. */}
    }
    for(const color of SILK_COLORS){
      const button = document.createElement('button'); button.type='button';button.setAttribute('aria-label',color.name+' fabric');button.style.setProperty('--fabric-color',color.color);
      const swatch=document.createElement('span');swatch.setAttribute('aria-hidden','true');button.append(swatch,document.createTextNode(color.name));
      button.addEventListener('click',()=>chooseColor(color.id,true),{signal:controlEvents.signal});buttons.push(button);controls.append(button);
    }
    chooseColor(colorId,false);host.append(controls);
    function updateGeometry() {
      for (let i = 0; i < field.count; i++) {
        const u = uv.getX(i), v = 1-uv.getY(i);
        position.setXYZ(i,(u-.5)*3.5+field.offsetX[i],field.surfaceBase[i]+field.height[i],(v-.5)*3.5+field.offsetZ[i]);
      }
      position.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
      const normals = geometry.attributes.normal as THREE.BufferAttribute;
      hemIndices.forEach((index,i)=>hemPosition.setXYZ(i,position.getX(index)+normals.getX(index)*.004,position.getY(index)+normals.getY(index)*.004,position.getZ(index)+normals.getZ(index)*.004));
      hemPosition.needsUpdate = true; hemGeometry.computeBoundingSphere();
    }
    updateGeometry();
    return {
      releaseInputOnResize: true,
      resize(width, height, dpr) {
        renderer!.setPixelRatio(Math.min(dpr,1.5)); renderer!.setSize(width,height,false);
        camera.aspect = width/height;
        const distance = 8.7/Math.min(1,camera.aspect);
        camera.position.set(3.7,camera.aspect<.8?6.2:3.5,4.3).normalize().multiplyScalar(distance);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
      },
      reset() {field.reset();grab=null;wasDown=false;canvas.classList.remove('silk-held');updateGeometry();},
      draw(dt, _time, pointer, reduced) {
        Object.assign(mapped,pointer,projection.map(camera,pointer.x,pointer.y));
        let start: FieldSample | undefined;
        for (const sample of pointer.samples) if (sample.start && sample.down) start = sample;
        const starting = pointer.down && (!wasDown || !!start);
        const intersection = pointer.inside && !grab ? projection.ray.intersectObject(cloth,false)[0] : undefined;
        if(starting){
          // Hit-test the original down sample, even when the pointer has already
          // moved elsewhere before this animation frame consumes the gesture.
          projection.map(camera,start?.x ?? pointer.x,start?.y ?? pointer.y);
          const contact = projection.ray.intersectObject(cloth,false)[0];
          grab = contact?.uv ? {u:contact.uv.x,v:1-contact.uv.y,y:contact.point.y,id:++grabId} : null;
          projection.map(camera,pointer.x,pointer.y);
        }
        if(!pointer.down)grab=null;
        wasDown=pointer.down;
        mapped.grabU=mapped.grabV=mapped.lift=mapped.grabId=undefined;
        mapped.inside=!!intersection;
        if(grab){
          grabPlane.constant=-(grab.y+.7);
          const hit=projection.ray.ray.intersectPlane(grabPlane,pullTarget);
          mapped.x=hit?hit.x/3.5+.5:grab.u;mapped.y=hit?hit.z/3.5+.5:grab.v;
          mapped.grabU=grab.u;mapped.grabV=grab.v;mapped.grabId=grab.id;
          mapped.lift=grab.y+.7-field.base(grab.u,grab.v);mapped.inside=true;
        }
        mapped.samples=pointer.samples.map((sample):FieldSample=>{
          const end=projection.map(camera,sample.x,sample.y),start=projection.map(camera,sample.x-sample.dx,sample.y-sample.dy);
          return {...sample,...end,dx:end.x-start.x,dy:end.y-start.y};
        });
        field.step(dt,mapped,reduced);updateGeometry();renderer!.render(scene,camera);
        canvas.classList.toggle('silk-held',!!grab);
        if(import.meta.env.DEV)canvas.dataset.silk=JSON.stringify({
          phase:field.phase,displacement:field.height.reduce((sum,value)=>sum+Math.abs(value),0),
          lateral:field.offsetX.reduce((sum,value,i)=>sum+Math.hypot(value,field.offsetZ[i]),0),
          held:field.held,grip:[field.grabU,field.grabV],color:colorId,iridescence:material.iridescence,metalness:material.metalness,...renderer!.info.memory,
        });
      },
      dispose() {
        if(disposed)return;disposed=true;controlEvents.abort();controls.remove();
        geometry.dispose();material.dispose();weave.dispose();hemGeometry.dispose();hemMaterial.dispose();shadowGeometry.dispose();shadowMaterial.dispose();environment!.dispose();
        light.shadow.dispose();renderer!.dispose();renderer!.forceContextLoss();canvas.width=canvas.height=0;
      },
    };
  });
}
