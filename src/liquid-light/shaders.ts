export const vertex = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const header = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 uv;
out vec4 color;
uniform sampler2D source;
uniform sampler2D velocity;
uniform sampler2D pressure;
uniform sampler2D divergence;
uniform sampler2D curl;
uniform sampler2D forwardDye;
uniform sampler2D reverseDye;
uniform vec2 texel;
uniform vec2 sourceSize;
uniform float dt;
uniform float decay;
uniform float strength;
uniform float aspect;
uniform vec2 point;
uniform vec3 amount;
uniform float radius;
// Manual bilinear filtering also works on devices without float-linear filtering.
vec4 sampleLinear(sampler2D image, vec2 p, vec2 size) {
  vec2 st = p * size - 0.5;
  vec2 base = floor(st), f = fract(st);
  vec2 d = 1.0 / size;
  return mix(mix(texture(image, (base + vec2(.5,.5)) * d), texture(image, (base + vec2(1.5,.5)) * d), f.x),
             mix(texture(image, (base + vec2(.5,1.5)) * d), texture(image, (base + vec2(1.5,1.5)) * d), f.x), f.y);
}
vec2 departure(vec2 p) {
  vec2 flow = sampleLinear(velocity, p, 1.0 / texel).xy;
  vec2 midpoint = p - .5 * dt * flow * texel;
  return p - dt * sampleLinear(velocity, midpoint, 1.0 / texel).xy * texel;
}
`;

export const fragments = {
  resample: header + `void main() {
    color = vec4(sampleLinear(source, uv, sourceSize).xyz * amount, 1.0);
  }`,
  advect: header + `void main() {
    vec2 back = departure(uv);
    color = sampleLinear(source, back, sourceSize) * exp(-decay * dt);
  }`,
  correct: header + `void main() {
    vec2 back = departure(uv);
    vec2 p = (floor(back * sourceSize - .5) + .5) / sourceSize;
    vec2 px = 1.0 / sourceSize;
    vec3 a = texture(source, p).rgb;
    vec3 b = texture(source, p + vec2(px.x,0)).rgb;
    vec3 c = texture(source, p + vec2(0,px.y)).rgb;
    vec3 d = texture(source, p + px).rgb;
    vec3 lo = min(min(a,b),min(c,d)), hi = max(max(a,b),max(c,d));
    vec3 forwardValue = texture(forwardDye, uv).rgb;
    vec3 corrected = forwardValue + .5 * (texture(source, uv).rgb - texture(reverseDye, uv).rgb);
    // The donor-cell limiter prevents new extrema at sharp color boundaries.
    corrected = clamp(corrected, lo, hi);
    if (any(lessThan(back, px*.5)) || any(greaterThan(back, 1.0-px*.5))) corrected = forwardValue;
    color = vec4(max(corrected,vec3(0)) * exp(-decay*dt),1);
  }`,
  splat: header + `void main() {
    vec2 delta = uv - point; delta.x *= aspect;
    float falloff = exp(-dot(delta, delta) / radius);
    color = vec4(clamp(texture(source, uv).xyz + amount * falloff, vec3(-900.0), vec3(900.0)), 1.0);
  }`,
  curl: header + `void main() {
    float left = texture(velocity, uv - vec2(texel.x,0)).y;
    float right = texture(velocity, uv + vec2(texel.x,0)).y;
    float bottom = texture(velocity, uv - vec2(0,texel.y)).x;
    float top = texture(velocity, uv + vec2(0,texel.y)).x;
    color = vec4(.5 * (right - left - top + bottom),0,0,1);
  }`,
  viscosity: header + `void main() {
    vec2 center = texture(velocity,uv).xy;
    vec2 neighbors = texture(velocity,uv-vec2(texel.x,0)).xy + texture(velocity,uv+vec2(texel.x,0)).xy
                   + texture(velocity,uv-vec2(0,texel.y)).xy + texture(velocity,uv+vec2(0,texel.y)).xy;
    color = vec4(mix(center,neighbors*.25,1.0-exp(-strength*dt)),0,1);
  }`,
  vorticity: header + `void main() {
    float left = texture(curl, uv - vec2(texel.x,0)).x;
    float right = texture(curl, uv + vec2(texel.x,0)).x;
    float bottom = texture(curl, uv - vec2(0,texel.y)).x;
    float top = texture(curl, uv + vec2(0,texel.y)).x;
    float center = texture(curl, uv).x;
    vec2 force = .5 * vec2(abs(top)-abs(bottom), abs(left)-abs(right));
    force /= length(force) + .0001;
    force *= strength * center;
    color = vec4(clamp(texture(velocity, uv).xy + force * dt, vec2(-700), vec2(700)),0,1);
  }`,
  divergence: header + `void main() {
    vec2 c = texture(velocity, uv).xy;
    float left = texture(velocity, uv - vec2(texel.x,0)).x;
    float right = texture(velocity, uv + vec2(texel.x,0)).x;
    float bottom = texture(velocity, uv - vec2(0,texel.y)).y;
    float top = texture(velocity, uv + vec2(0,texel.y)).y;
    if (uv.x < texel.x) left = -c.x;
    if (uv.x > 1.0-texel.x) right = -c.x;
    if (uv.y < texel.y) bottom = -c.y;
    if (uv.y > 1.0-texel.y) top = -c.y;
    color = vec4(.5*(right-left+top-bottom),0,0,1);
  }`,
  pressure: header + `void main() {
    float left = texture(pressure, uv - vec2(texel.x,0)).x;
    float right = texture(pressure, uv + vec2(texel.x,0)).x;
    float bottom = texture(pressure, uv - vec2(0,texel.y)).x;
    float top = texture(pressure, uv + vec2(0,texel.y)).x;
    float div = texture(divergence, uv).x;
    color = vec4((left+right+bottom+top-div)*.25,0,0,1);
  }`,
  project: header + `void main() {
    float left = texture(pressure, uv - vec2(texel.x,0)).x;
    float right = texture(pressure, uv + vec2(texel.x,0)).x;
    float bottom = texture(pressure, uv - vec2(0,texel.y)).x;
    float top = texture(pressure, uv + vec2(0,texel.y)).x;
    vec2 projected = texture(velocity, uv).xy - .5 * vec2(right-left,top-bottom);
    if (uv.x < texel.x || uv.x > 1.0-texel.x) projected.x = 0.0;
    if (uv.y < texel.y || uv.y > 1.0-texel.y) projected.y = 0.0;
    color = vec4(projected,0,1);
  }`,
  display: header + `void main() {
    vec3 dye = max(sampleLinear(source, uv, sourceSize).rgb, vec3(0));
    vec2 px = 1.0 / sourceSize;
    float left = length(sampleLinear(source, uv - vec2(px.x,0), sourceSize).rgb);
    float right = length(sampleLinear(source, uv + vec2(px.x,0), sourceSize).rgb);
    float bottom = length(sampleLinear(source, uv - vec2(0,px.y), sourceSize).rgb);
    float top = length(sampleLinear(source, uv + vec2(0,px.y), sourceSize).rgb);
    vec3 normal = normalize(vec3((left-right)*1.4, (bottom-top)*1.4, .65));
    float light = .82 + .24 * max(dot(normal, normalize(vec3(-.4,.6,1))),0.0);
    vec3 glow = vec3(0);
    glow += sampleLinear(source, uv + vec2(.008,0), sourceSize).rgb;
    glow += sampleLinear(source, uv - vec2(.008,0), sourceSize).rgb;
    glow += sampleLinear(source, uv + vec2(0,.008), sourceSize).rgb;
    glow += sampleLinear(source, uv - vec2(0,.008), sourceSize).rgb;
    vec3 base = vec3(.007,.012,.027);
    vec3 lit = dye * light + max(glow,vec3(0)) * .02;
    float peak = max(lit.r,max(lit.g,lit.b));
    vec3 mapped = lit * 1.8 / (1.0 + peak * 1.2);
    float sheen = pow(max(dot(normal,normalize(vec3(-.3,.45,1))),0.0),32.0);
    mapped += vec3(.08,.10,.12) * sheen * smoothstep(.05,.6,length(dye)) * min(1.0,abs(left-right)+abs(bottom-top));
    float vignette = 1.0 - .25 * smoothstep(.15,.85,length((uv-.5)*vec2(.9,1)));
    color = vec4((base + pow(max(mapped,vec3(0)), vec3(.78))) * vignette,1);
  }`,
};
