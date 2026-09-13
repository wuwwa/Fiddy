import * as THREE from 'three/webgpu';

/** Feathered emitters with a darker room keep highlights distinct from the body. */
export function createStudioEnvironment(tint: string, surface?:'gel') {
  const scene=new THREE.Scene();
  const room=new THREE.Mesh(new THREE.SphereGeometry(12,24,16),
    new THREE.MeshBasicNodeMaterial({color:new THREE.Color(tint).multiplyScalar(0.24),side:THREE.BackSide}));
  scene.add(room);
  const size=128,data=new Uint8Array(size*size*4);
  const falloff=(v:number)=>1-THREE.MathUtils.smoothstep(Math.abs(v),0.48,1);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const offset=(y*size+x)*4;
    data[offset]=data[offset+1]=data[offset+2]=255;
    data[offset+3]=Math.round(255*falloff(x/(size-1)*2-1)*falloff(y/(size-1)*2-1));
  }
  const diffusion=new THREE.DataTexture(data,size,size);
  diffusion.magFilter=diffusion.minFilter=THREE.LinearFilter;diffusion.needsUpdate=true;
  const softbox=(position:THREE.Vector3,width:number,height:number,intensity:number,color:number)=>{
    const material=new THREE.MeshBasicNodeMaterial({map:diffusion,
      color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide,transparent:true,depthWrite:false});
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
    panel.position.copy(position);panel.lookAt(0,0,0);scene.add(panel);
  };
  if(surface==='gel') {
    softbox(new THREE.Vector3(-4,6,5),3.6,5.5,16,0xfffaf6);
    softbox(new THREE.Vector3(4,2,2),3.2,4.5,1.5,0xffeef4);
    softbox(new THREE.Vector3(1,5,-4),3.2,2,4,0xfff3eb);
  } else {
    softbox(new THREE.Vector3(-4,6,5),3.6,4.8,18,0xfffaf6);
    softbox(new THREE.Vector3(5,3,1),1.8,3.6,3,0xffeef4);
    softbox(new THREE.Vector3(1,5,-4),3.6,2,5,0xfff3eb);
  }
  return {scene,dispose:()=>{
    diffusion.dispose();
    scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(object.material as THREE.Material).dispose();}});
  }};
}

export function createContactShadow(tint:string) {
  const size=256,data=new Uint8Array(size*size*4);
  const color=new THREE.Color(tint).getHex(THREE.SRGBColorSpace);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const distance=((x/(size-1)-0.5)*2)**2+((y/(size-1)-0.5)*2)**2;
    // Wide penumbra, medium contact, and a small dark core at the resting base.
    const alpha=0.14*Math.exp(-distance*4)+0.28*Math.exp(-distance*22)+0.14*Math.exp(-distance*80);
    const offset=(y*size+x)*4;
    data[offset]=(color>>16)&255;data[offset+1]=(color>>8)&255;data[offset+2]=color&255;
    data[offset+3]=Math.round(alpha*255);
  }
  const texture=new THREE.DataTexture(data,size,size);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;
  const material=new THREE.MeshBasicNodeMaterial({map:texture,transparent:true,depthWrite:false});
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.2,3.5),material);
  shadow.rotation.x=-Math.PI/2;
  return {shadow,texture};
}
