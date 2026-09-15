import { BufferAttribute, CanvasTexture, Color, SRGBColorSpace, type BufferGeometry, type MeshPhysicalNodeMaterial } from 'three/webgpu';
import { attribute, color, mix, step, texture, vec2, vec3, vec4 } from 'three/tsl';

/** Print is sampled in the original material coordinates: it squishes with
 * the foam instead of floating above it or sliding when the mesh deforms. */
export function addButterLettering(geometry: BufferGeometry, material: MeshPhysicalNodeMaterial) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffe8a0'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#234a79'; ctx.strokeStyle = '#234a79'; ctx.textAlign = 'center';
  ctx.font = '600 68px Arial, sans-serif'; ctx.fillText('SALTED', 1024, 175);
  ctx.font = 'bold 252px Georgia, serif'; ctx.fillText('BUTTER', 1024, 440);
  ctx.font = '48px Arial, sans-serif'; ctx.fillText('4 OZ.  ·  NET WT. 113 g', 1024, 543);
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(240, 594); ctx.lineTo(1808, 594); ctx.stroke();
  for (let i = 0; i <= 8; i++) {
    const x = 240 + i * 196;
    ctx.beginPath(); ctx.moveTo(x, 594); ctx.lineTo(x, i % 2 === 0 ? 636 : 620); ctx.stroke();
  }
  ctx.font = '29px Arial, sans-serif'; ctx.fillText('8 TABLESPOONS', 1024, 683);

  const print = new CanvasTexture(canvas);
  print.colorSpace = SRGBColorSpace; print.anisotropy = 4;
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const coordinates = new Float32Array(positions.count * 4);
  geometry.computeBoundingBox();
  const base = geometry.boundingBox!.min.y;
  const cos = Math.cos(-0.22), sin = Math.sin(-0.22);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) * cos + positions.getZ(i) * sin;
    const z = -positions.getX(i) * sin + positions.getZ(i) * cos;
    coordinates.set([x / 2.5 + 0.5, (positions.getY(i) - base) / 0.9, z / 0.95 + 0.5,
      Math.abs(normals.getY(i)) ** 6], i * 4);
  }
  geometry.setAttribute('butterPrint', new BufferAttribute(coordinates, 4));
  const rest = vec4(attribute('butterPrint', 'vec4'));
  const frontU = mix(rest.x.oneMinus(), rest.x, step(0.5, rest.z));
  const side = texture(print, vec2(frontU, rest.y)).rgb;
  const top = texture(print, vec2(rest.x, rest.z.oneMinus())).rgb;
  material.colorNode = mix(vec3(color(new Color('#ffe8a0'))), mix(side, top, rest.w), rest.y.smoothstep(0.07, 0.2));
  return () => print.dispose();
}
