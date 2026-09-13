import { CURSOR_PATH_SAMPLES } from './geometry';

export const starVertex = /* glsl */ `
attribute float aSize;
attribute float aBrightness;
attribute float aPhase;
attribute float aTravel;
attribute float aStrand;
attribute float aStroke;
uniform float uTime;
uniform float uPixelRatio;
uniform float uScale;
uniform float uHalo;
uniform float uEnergy;
uniform float uSwirl;
uniform float uCursor;
uniform sampler2D uCursorPath;
uniform float uPathCount;
uniform float uCursorMask;
uniform float uFlowDistance;
varying vec3 vColor;
varying float vBrightness;
varying float vHaloVisible;
vec3 cursor(float t, bool closed) {
  float sampleIndex = closed ? fract(t) * ${CURSOR_PATH_SAMPLES}.0 : clamp(t, 0.0, 1.0) * ${CURSOR_PATH_SAMPLES - 1}.0;
  float index = floor(sampleIndex);
  float nextIndex = closed ? mod(index + 1.0, ${CURSOR_PATH_SAMPLES}.0) : min(index + 1.0, ${CURSOR_PATH_SAMPLES - 1}.0);
  float row = (aStroke + 0.5) / uPathCount;
  vec3 a = texture2D(uCursorPath, vec2((index + 0.5) / ${CURSOR_PATH_SAMPLES}.0, row)).xyz;
  vec3 b = texture2D(uCursorPath, vec2((nextIndex + 0.5) / ${CURSOR_PATH_SAMPLES}.0, row)).xyz;
  return mix(a, b, fract(sampleIndex));
}
vec2 cursorTangent(float t, bool closed) {
  vec2 tangent = cursor(t + 0.001, closed).xy - cursor(t - 0.001, closed).xy;
  return length(tangent) > 0.00001 ? normalize(tangent) : vec2(1.0, 0.0);
}
vec3 spiral(float t) {
  float radius = (2.95 * pow(t, 0.90) + 1.2 * smoothstep(0.88, 1.0, t)) * (1.0 + aStrand * 0.18);
  float angle = 1.23 + (1.0 - t) * 3.14159265359 * 4.55;
  return vec3(radius * cos(angle), radius * sin(angle) - 1.05, 0.13 * sin(angle) * t);
}
void main() {
  vec3 p = position;
  float fade = 1.0;
  if (uSwirl > 0.5 && aTravel >= 0.0) {
    float t = fract(aTravel - uTime * 0.008);
    vec3 scatter = position - spiral(aTravel);
    float turn = (aTravel - t) * 3.14159265359 * 4.55;
    scatter.xy = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * scatter.xy;
    p = spiral(t) + scatter * (0.35 + t * 0.65) / (0.35 + aTravel * 0.65);
    fade = smoothstep(0.02, 0.12, t) * (1.0 - smoothstep(0.985, 1.0, t));
  }
  if (uCursor > 0.5 && aTravel >= 0.0) {
    float pathLength = texture2D(uCursorPath, vec2(0.5 / ${CURSOR_PATH_SAMPLES}.0, (aStroke + 0.5) / uPathCount)).w;
    bool closed = pathLength > 0.0;
    float t = fract(aTravel + uFlowDistance * (1.0 + 0.10 * sin(aPhase)) / max(abs(pathLength), 0.001));
    vec3 scatter = position - cursor(aTravel, closed);
    vec2 before = cursorTangent(aTravel, closed), after = cursorTangent(t, closed);
    float cosine = dot(before, after), sine = before.x * after.y - before.y * after.x;
    scatter.xy = mat2(cosine, sine, -sine, cosine) * scatter.xy;
    p = cursor(t, closed) + scatter;
    if (!closed) fade *= smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.96, 1.0, t));
    // This is a location on the outline, so it must not travel with an individual star.
    float returnEdge = -0.30 + (p.y + 2.02) * 0.34;
    float quiet = (1.0 - smoothstep(-0.72, -0.50, p.y)) * smoothstep(returnEdge - 0.06, returnEdge + 0.06, p.x);
    fade *= mix(1.0, 0.25, quiet * uCursorMask);
  }
  p.z += sin(uTime * 0.3 + aPhase) * 0.008;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  float perspective = clamp(8.0 / -view.z, 0.3, 2.0);
  float size = aSize * uPixelRatio * uScale * perspective;
  vHaloVisible = aSize > 3.2 ? 1.0 : 0.0;
  float haloScale = uSwirl > 0.5 && aTravel < 0.0 ? 45.0 : 15.0;
  gl_PointSize = uHalo > 0.5 ? size * haloScale : max(1.0, size * 1.85);
  vColor = color;
  vBrightness = aBrightness * (0.86 + 0.14 * sin(aPhase + uTime * (0.55 + aSize * 0.07))) * uEnergy * fade;
}
`;

export const starFragment = /* glsl */ `
uniform float uHalo;
varying vec3 vColor;
varying float vBrightness;
varying float vHaloVisible;
void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  if (radius > 1.0 || (uHalo > 0.5 && vHaloVisible < 0.5)) discard;
  float alpha;
  if (uHalo > 0.5) alpha = exp(-radius * radius * 5.5) * pow(1.0 - radius, 2.0) * 0.18;
  else alpha = (1.0 - smoothstep(0.20, 0.72, radius));
  vec3 tint = uHalo > 0.5 ? vColor : mix(vColor, vec3(1.0), (1.0 - smoothstep(0.0, 0.45, radius)) * 0.26 * vHaloVisible);
  gl_FragColor = vec4(tint, alpha * vBrightness);
  #include <colorspace_fragment>
}
`;
