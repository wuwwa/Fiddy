import { Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshPhysicalMaterial, RepeatWrapping, DoubleSide } from 'three';

export const SILK_COLORS = [
  { id: 'pearl', name: 'Pearl', color: '#c9beac', sheen: '#eee6d6' },
  { id: 'sand', name: 'Sand', color: '#aa8a62', sheen: '#e8d5b6' },
  { id: 'ink', name: 'Ink', color: '#394347', sheen: '#aebbc0' },
] as const;

export function createSilkMaterial() {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const warp = Math.pow(.5 + .5 * Math.cos(x * Math.PI / 4), 3);
    const weft = Math.pow(.5 + .5 * Math.cos(y * Math.PI / 4), 3);
    const over = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
    const value = Math.round(128 + warp * (over ? 20 : 9) + weft * (over ? 9 : 20));
    const i = (y * size + x) * 4;
    data[i] = data[i+1] = data[i+2] = value; data[i+3] = 255;
  }
  const weave = new DataTexture(data, size, size);
  weave.wrapS = weave.wrapT = RepeatWrapping; weave.repeat.set(16,16);
  weave.magFilter = LinearFilter; weave.minFilter = LinearMipmapLinearFilter; weave.generateMipmaps = true; weave.needsUpdate = true;
  const material = new MeshPhysicalMaterial({
    color: SILK_COLORS[0].color, metalness: 0, roughness: .32,
    iridescence: 0, sheen: 1, sheenRoughness: .38, sheenColor: new Color(SILK_COLORS[0].sheen),
    anisotropy: .65, anisotropyRotation: Math.PI / 2, specularIntensity: .55,
    bumpMap: weave, bumpScale: .0025, side: DoubleSide, clearcoat: 0,
  });
  return { material, weave };
}
