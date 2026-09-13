import type { Point } from './physics';

const FLOOR = 0.04;
const HEIGHT = 2;
const BELLY = 0.16;
const FREQUENCY = Math.PI * 2 / HEIGHT;

/** The belly spreads a little more than the crown and the contact patch.
 * dy/dY × radialScale² = 1, so this smooth mapping preserves volume. */
export function pressureFrame(y: number, compression: number) {
  const height = y-FLOOR;
  const derivative = 1-compression+BELLY*compression*Math.cos(height*FREQUENCY);
  return {
    y: FLOOR+(1-compression)*height+BELLY*compression/FREQUENCY*Math.sin(height*FREQUENCY),
    width: 1/Math.sqrt(derivative),
  };
}

export function undoPressure(point: Point, compression: number): Point {
  let y=FLOOR+(point.y-FLOOR)/(1-compression);
  for(let i=0;i<6;i++) {
    const mapped=pressureFrame(y,compression);
    y-=(mapped.y-point.y)*mapped.width*mapped.width;
  }
  const {width}=pressureFrame(y,compression);
  return {x:point.x/width,y,z:point.z/width};
}

/** Torsion fades smoothly to zero at the anchored base. */
export function twistWeight(y:number) {
  const t=Math.max(0,Math.min(1,(y-FLOOR)/HEIGHT));
  return t*t*t*(t*(t*6-15)+10);
}

export function deformPoint(point:Point,compression:number,twist:number):Point {
  const frame=pressureFrame(point.y,compression),angle=twist*twistWeight(point.y);
  const cos=Math.cos(angle),sin=Math.sin(angle);
  return {x:(point.x*cos+point.z*sin)*frame.width,y:frame.y,
    z:(point.z*cos-point.x*sin)*frame.width};
}

export function undoDeformation(point:Point,compression:number,twist:number):Point {
  const local=undoPressure(point,compression),angle=twist*twistWeight(local.y);
  const cos=Math.cos(angle),sin=Math.sin(angle);
  return {x:local.x*cos-local.z*sin,y:local.y,z:local.z*cos+local.x*sin};
}
