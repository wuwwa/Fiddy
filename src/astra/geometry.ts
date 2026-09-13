import { BufferAttribute, BufferGeometry, Color, DataTexture, FloatType, NearestFilter, RGBAFormat, Vector3 } from 'three';
import { cursorOutline, type Outline } from './paths';

export type AstraShape = 'swirl' | 'cursor';
export const SPIRAL_CENTER_Y = -1.05;

/** Seeded samples keep the artwork stable across reset, resize, and remount. */
export function randomSource(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function spiralPoint(t: number, out = new Vector3(), strand = 0) {
  const tail = Math.max(0, Math.min(1, (t - .88) / .12));
  const radius = (2.95 * Math.pow(Math.max(0, t), .90) + 1.2 * tail * tail * (3 - 2 * tail)) * (1 + strand * .18);
  const angle = 1.23 + (1 - t) * Math.PI * 4.55;
  return out.set(radius * Math.cos(angle), radius * Math.sin(angle) + SPIRAL_CENTER_Y, .13 * Math.sin(angle) * t);
}

export function cursorPoint(t: number, out = new Vector3()) {
  return cursorOutline.paths[0].sample(t, out);
}

export const CURSOR_PATH_SAMPLES = 1024;

/** Uniform arc-length samples let the GPU move stars through corners at a steady speed. */
export function createCursorPathTexture(outline: Outline = cursorOutline) {
  const samples = new Float32Array(CURSOR_PATH_SAMPLES * outline.paths.length * 4), point = new Vector3();
  outline.paths.forEach((path, row) => {
    for (let i = 0; i < CURSOR_PATH_SAMPLES; i++) {
      const offset = (row * CURSOR_PATH_SAMPLES + i) * 4;
      path.sample(i / (path.closed ? CURSOR_PATH_SAMPLES : CURSOR_PATH_SAMPLES - 1), point).toArray(samples, offset);
      samples[offset + 3] = path.length * (path.closed ? 1 : -1);
    }
  });
  const texture = new DataTexture(samples, CURSOR_PATH_SAMPLES, outline.paths.length, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

const palette = ['#d7eeff', '#83bde8', '#f9faff', '#efb496', '#b9e4ef'].map(value => new Color(value));

export function createStars(shape: AstraShape, background = false, outline: Outline = cursorOutline) {
  const count = background ? 1700 : shape === 'swirl' ? 8500 : 4800;
  const random = randomSource(background ? 821 : shape === 'swirl' ? 606 : 314);
  const position = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  const size = new Float32Array(count), brightness = new Float32Array(count), phase = new Float32Array(count), travel = new Float32Array(count), strands = new Float32Array(count), strokes = new Float32Array(count);
  const point = new Vector3();
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(.000001, random()))) * Math.cos(random() * Math.PI * 2);
  for (let i = 0; i < count; i++) {
    const t = Math.pow(random(), shape === 'swirl' ? .8 : 1);
    const core = !background && shape === 'swirl' && i < 120;
    travel[i] = !background && !core ? t : -1;
    if (background) point.set((random() - .5) * 22, (random() - .5) * 14, -1 - random() * 4);
    else if (core) point.set(normal() * .095, SPIRAL_CENTER_Y + normal() * .10, normal() * .09);
    else if (shape === 'swirl') {
      strands[i] = random() < .30 ? 1 : 0;
      spiralPoint(t, point, strands[i]);
      // Fine companion strands stay distinct from the brighter main arm.
      const spread = (strands[i] ? .015 + .020 * t : .035 + .035 * t) * (random() < .16 ? 3 : 1);
      point.x += normal() * spread; point.y += normal() * spread;
      point.z += normal() * spread * 1.3;
    } else {
      let distance = t * outline.length, stroke = 0;
      while (stroke < outline.paths.length - 1 && distance > outline.paths[stroke].length) distance -= outline.paths[stroke++].length;
      strokes[i] = stroke; travel[i] = distance / outline.paths[stroke].length;
      outline.paths[stroke].sample(travel[i], point);
      const spread = random() < .13 ? .135 : .065;
      point.x += normal() * spread; point.y += normal() * spread; point.z += normal() * .08;
    }
    point.toArray(position, i * 3);
    const kind = random(), beacon = kind > (background ? .990 : core ? .87 : strands[i] ? .991 : shape === 'swirl' ? .965 : .955), middle = kind > (strands[i] ? .62 : .80);
    const hue = random(), color = palette[hue < .17 ? 3 : hue < .5 ? 1 : hue < .72 ? 0 : hue < .94 ? 2 : 4];
    color.toArray(colors, i * 3);
    size[i] = beacon ? 4.4 + Math.pow(random(), 1.7) * 3.4 : middle ? 1.45 + random() * 1.65 : .60 + random() * .75;
    brightness[i] = beacon ? 1.0 + random() * .25 : middle ? .55 + random() * .40 : .22 + random() * .40;
    if (background) { size[i] *= .85; brightness[i] *= .65; }
    if (core) { size[i] *= .7; brightness[i] *= .8; }
    if (strands[i]) size[i] *= .86;
    if (!background && shape === 'swirl' && !core && t < .16) brightness[i] *= .62;
    phase[i] = random() * Math.PI * 2;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  geometry.setAttribute('aBrightness', new BufferAttribute(brightness, 1));
  geometry.setAttribute('aPhase', new BufferAttribute(phase, 1));
  geometry.setAttribute('aTravel', new BufferAttribute(travel, 1));
  geometry.setAttribute('aStrand', new BufferAttribute(strands, 1));
  geometry.setAttribute('aStroke', new BufferAttribute(strokes, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
