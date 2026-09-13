import { Vector3 } from 'three';

export type DrawPoint = readonly [number, number];
export type DrawStroke = DrawPoint[];
export type OutlinePath = { points: Vector3[]; closed: boolean; length: number; sample: (t: number, out?: Vector3) => Vector3 };
export type Outline = { id: string; name: string; paths: OutlinePath[]; length: number };

export function makePath(input: readonly DrawPoint[], closed = true): OutlinePath {
  const points: Vector3[] = [];
  for (const [x, y] of input) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const point = new Vector3(x, y, 0);
    if (!points.length || point.distanceToSquared(points[points.length - 1]) > 1e-10) points.push(point);
  }
  if (closed && points.length > 1 && points[0].distanceToSquared(points[points.length - 1]) < 1e-10) points.pop();
  if (points.length < 2) throw new Error('Draw a line with a little more length.');
  const lengths = [0], segments = closed ? points.length : points.length - 1;
  for (let i = 0; i < segments; i++) lengths.push(lengths[i] + points[i].distanceTo(points[(i + 1) % points.length]));
  const length = lengths[segments];
  if (length < .001) throw new Error('Draw a line with a little more length.');
  return { points, closed, length, sample(t, out = new Vector3()) {
    const distance = (closed ? ((t % 1 + 1) % 1) : Math.max(0, Math.min(1, t))) * length;
    let low = 0, high = segments;
    while (low + 1 < high) { const mid = (low + high) >>> 1; if (lengths[mid] <= distance) low = mid; else high = mid; }
    return out.copy(points[low]).lerp(points[(low + 1) % points.length], (distance - lengths[low]) / (lengths[low + 1] - lengths[low]));
  }};
}

function rounded(corners: DrawStroke, amounts: number[]): DrawStroke {
  const output: DrawStroke = [];
  for (let i = 0; i < corners.length; i++) {
    const previous = corners[(i + corners.length - 1) % corners.length], corner = corners[i], next = corners[(i + 1) % corners.length];
    const lerp = (a: DrawPoint, b: DrawPoint, t: number): DrawPoint => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const start = lerp(corner, previous, amounts[i]), end = lerp(corner, next, amounts[i]);
    for (let j = 0; j < 20; j++) { const t = j / 20; output.push(lerp(lerp(start, corner, t), lerp(corner, end, t), t)); }
    output.push(end);
  }
  return output;
}

function parametric(fn: (t: number) => DrawPoint, closed = true): OutlinePath {
  return makePath(Array.from({length: closed ? 512 : 513}, (_, i) => fn(i / 512 * Math.PI * 2)), closed);
}
function outline(id: string, name: string, paths: OutlinePath[]): Outline { return {id, name, paths, length:paths.reduce((sum, path) => sum + path.length, 0)}; }
const cursorCorners: DrawStroke = [[-1.85,2.02],[2.02,.82],[.43,-.28],[-.28,-2.02]];
export const cursorOutline = outline('cursor', 'Cursor', [makePath(rounded(cursorCorners, [.19,.19,.14,.19]))]);
export const circleOutline = outline('circle', 'Circle', [parametric(t => [1.8 * Math.cos(t), 1.8 * Math.sin(t)])]);
export const PRESET_OUTLINES: Outline[] = [
  cursorOutline,
  circleOutline,
  outline('heart', 'Heart', [parametric(t => [Math.pow(Math.sin(t), 3) * 1.9, (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) * .12 + .25])]),
  outline('star', 'Star', [makePath(rounded(Array.from({length:10}, (_,i) => { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .83 : 1.95; return [Math.cos(a)*r, Math.sin(a)*r] as DrawPoint; }), Array(10).fill(.09)))]),
  outline('infinity', 'Infinity', [parametric(t => [2 * Math.cos(t), 1.3 * Math.sin(t) * Math.cos(t)])]),
  outline('flower', 'Flower', [parametric(t => { const r = 1.4 + .45 * Math.cos(5*t); return [r*Math.cos(t), r*Math.sin(t)]; })]),
  outline('triangle', 'Triangle', [makePath(rounded([[0,1.9],[-1.8,-1.45],[1.8,-1.45]], [.1,.1,.1]))]),
  outline('square', 'Square', [makePath(rounded([[-1.6,1.6],[1.6,1.6],[1.6,-1.6],[-1.6,-1.6]], [.16,.16,.16,.16]))]),
  outline('wave', 'Wave', [parametric(t => [(t / Math.PI - 1) * 2, .85 * Math.sin(t * 1.5)], false)]),
];

/** Resample before smoothing so slow pointer events don't create dense knots. */
export function drawingOutline(strokes: readonly DrawStroke[], connectEnds = false): Outline {
  const valid = strokes.slice(0, 16).map(stroke => stroke.slice(0, 1600).filter(p => p.length === 2 && p.every(Number.isFinite))).filter(stroke => stroke.length >= 2 && stroke.some(p => Math.hypot(p[0]-stroke[0][0],p[1]-stroke[0][1])>.0001));
  if (!valid.length) throw new Error('Draw a line first, then animate it.');
  const all = valid.flat(), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const extent = Math.max(maxX-minX, maxY-minY);
  if (extent < .08) throw new Error('Make your drawing a little larger.');
  const cx = (minX+maxX)/2, cy = (minY+maxY)/2, scale = 3.65/extent;
  const paths: OutlinePath[] = [];
  for (const stroke of valid) {
    const points = stroke.map(([x,y]) => [(x-cx)*scale,(y-cy)*scale] as DrawPoint);
    const a = points[0], b = points[points.length-1];
    const closed = connectEnds || (points.length > 6 && Math.hypot(a[0]-b[0],a[1]-b[1]) < .18);
    let source: OutlinePath;
    try { source = makePath(points, closed); } catch { continue; }
    if (source.length < .08) continue;
    const count = Math.max(8, Math.min(800, Math.ceil(source.length/.022)));
    let samples: DrawStroke = Array.from({length:count}, (_,i) => { const p = source.sample(i/(closed ? count : count-1)); return [p.x,p.y]; });
    for (let pass = 0; pass < 2; pass++) samples = samples.map((p,i) => {
      if (!closed && (i === 0 || i === samples.length-1)) return p;
      const before = samples[(i+samples.length-1)%samples.length], after = samples[(i+1)%samples.length];
      return [(before[0]+p[0]*2+after[0])/4,(before[1]+p[1]*2+after[1])/4];
    });
    paths.push(makePath(samples, closed));
  }
  if (!paths.length) throw new Error('Draw a line with a little more length.');
  return outline('custom', 'Your drawing', paths);
}
