'use strict';
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  // Particles are fully stateless: each one's position is computed in the vertex shader
  // from its index, a seed and the (audio-driven) travel time. Thousands are cheap and any
  // moment of the song can be rendered without simulating the frames before it.
  const VS = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform float uTau;
uniform float uTime;
uniform uint uSeed;
uniform int uMode;
uniform float uSize;
uniform float uSizeVar;
uniform float uSpread;
uniform vec2 uDir;
uniform vec2 uCenter;
uniform float uStreak;
uniform float uTwinkle;
uniform float uWobble;
uniform float uBright;
out vec2 vLocal;
out float vAlpha;
out float vLen;
flat out int vColor;
#define TAU 6.28318530718

uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
float rnd(uint i, uint k) {
  return float(pcg(i * 9u + k + uSeed * 7919u) & 0x00ffffffu) / 16777215.0;
}
const vec2 CORNERS[6] = vec2[6](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0));

void main() {
  uint id = uint(gl_InstanceID);
  float r1 = rnd(id, 1u);
  float r2 = rnd(id, 2u);
  float r3 = rnd(id, 3u);
  float r4 = rnd(id, 4u);
  float r5 = rnd(id, 5u);
  vec2 hx = 0.5 * uRes / min(uRes.x, uRes.y);
  float size = uSize * mix(1.0 - uSizeVar, 1.0 + uSizeVar, r3);
  float sp = mix(0.6, 1.4, r4);
  vec2 pos = vec2(0.0);
  vec2 dir = vec2(0.0, 1.0);
  float alpha = 1.0;
  float streak = 0.0;
  if (uMode == 0) {
    vec2 box = hx * 2.0 + vec2(0.3);
    float depth = mix(0.35, 1.0, r3);
    vec2 base = (vec2(r1, r2) - 0.5) * box;
    vec2 perp = vec2(-uDir.y, uDir.x);
    vec2 p = base + uDir * uTau * 0.08 * sp * depth + perp * sin(uTau * 0.6 * sp + r5 * TAU) * uWobble * 0.05;
    pos = mod(p + box * 0.5, box) - box * 0.5;
    dir = uDir;
    alpha = depth;
    streak = uStreak * 0.05 * depth;
  } else if (uMode == 1) {
    float a = r1 * TAU;
    float life = fract(r2 + uTau * 0.1 * sp);
    float maxR = length(hx) * 1.15;
    dir = vec2(cos(a), sin(a));
    pos = uCenter + dir * mix(uSpread, maxR, pow(life, 1.5));
    size *= mix(0.35, 1.3, life);
    alpha = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.8, 1.0, life));
    streak = uStreak * 0.15 * life;
  } else if (uMode == 2) {
    float z = mix(0.04, 1.0, fract(r3 - uTau * 0.05 * sp));
    vec2 xy = (vec2(r1, r2) * 2.0 - 1.0) * hx;
    pos = uCenter + xy * 0.3 / z;
    dir = normalize(xy + vec2(1e-4));
    size *= 0.2 / z;
    alpha = (1.0 - smoothstep(0.7, 1.0, z)) * smoothstep(0.04, 0.09, z);
    streak = uStreak * 0.02 / z;
  } else {
    float span = hx.y * 2.0 + 0.3;
    float y = -hx.y - 0.15 + fract(r2 + uTau * 0.05 * sp) * span;
    float x = uCenter.x + (r1 - 0.5) * 2.0 * hx.x * uSpread + sin(uTau * 0.8 * sp + r5 * TAU) * uWobble * 0.04;
    pos = vec2(x, y);
    dir = vec2(0.0, 1.0);
    alpha = smoothstep(-hx.y - 0.15, -hx.y + 0.1, y) * (1.0 - smoothstep(hx.y * 0.2, hx.y + 0.15, y));
    streak = uStreak * 0.03;
  }
  alpha *= mix(1.0, 0.25 + 0.75 * (0.5 + 0.5 * sin(uTime * mix(1.0, 4.0, r5) + r1 * 40.0)), uTwinkle);
  alpha *= uBright;
  vec2 c = CORNERS[gl_VertexID];
  vec2 side = vec2(-dir.y, dir.x);
  float s = max(size, 1e-5) * 2.5;
  vec2 world = pos + side * c.x * s + dir * (c.y * (s + streak * 0.5) - streak * 0.5);
  vLocal = vec2(c.x, c.y * (s + streak * 0.5) / s);
  vLen = (streak * 0.5) / s;
  vAlpha = alpha;
  vColor = int(floor(rnd(id, 6u) * 4.0)) % 4;
  gl_Position = vec4(world / hx, 0.0, 1.0);
}`;

  const FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vAlpha;
in float vLen;
flat in int vColor;
out vec4 outColor;
uniform vec3 uCols[4];
uniform vec3 uColor;
uniform int uColorMode;
uniform int uShape;
uniform float uOpacity;
void main() {
  float d = length(vec2(vLocal.x, max(abs(vLocal.y) - vLen, 0.0))) / 0.4;
  float a = uShape == 1 ? smoothstep(1.0, 0.75, d) : exp(-d * d * 1.3);
  a *= vAlpha / (1.0 + vLen * 0.8);
  vec3 c = uColorMode == 0 ? uCols[vColor] : uColor;
  outColor = vec4(c * a, a) * uOpacity;
}`;

  const MODES = { drift: 0, burst: 1, starfield: 2, rise: 3 };
  const cols = new Float32Array(12);

  VG.registerLayer({
    type: 'particles',
    label: 'Particles',
    icon: 'particles',
    blurb: 'Dust, sparks, a starfield or rising embers that react to the music.',
    layout: ['x', 'y', 'spread'],
    blend: 'add',
    defaults: {
      mode: 'drift',
      count: 160,
      size: 0.004,
      sizeVar: 0.6,
      speed: 1,
      direction: 20,
      spread: 0.1,
      wobble: 0.5,
      twinkle: 0.4,
      streak: 0,
      brightness: 0.8,
      shape: 'soft',
      x: 0,
      y: 0,
      colorMode: 'single',
      color: 'p4',
      react: B('bass', { release: 0.2 }),
      speedReact: 1,
      sizeReact: 0.3,
      glowReact: 0.5,
      streakReact: 0,
    },
    controls: [
      {
        group: 'Particles',
        items: [
          { key: 'mode', type: 'select', label: 'Style', rerender: true, options: [['drift', 'Drifting dust'], ['burst', 'Burst from center'], ['starfield', 'Starfield (fly through)'], ['rise', 'Rising embers']] },
          { key: 'count', type: 'range', label: 'How many', min: 0, max: 3000, step: 10, fmt: 'int' },
          { key: 'size', type: 'range', label: 'Size', min: 0.0005, max: 0.03, step: 0.0005 },
          { key: 'sizeVar', type: 'range', label: 'Size variety', min: 0, max: 1, step: 0.01, fmt: 'pct' },
          { key: 'shape', type: 'select', label: 'Shape', options: [['soft', 'Soft glow'], ['disc', 'Crisp dot']] },
          { key: 'speed', type: 'range', label: 'Speed', min: 0, max: 10, step: 0.05, fmt: 'x' },
          { key: 'direction', type: 'range', label: 'Direction', min: -180, max: 180, step: 1, fmt: 'deg', show: (L) => L.mode === 'drift' },
          { key: 'spread', type: 'range', label: (L) => (L.mode === 'rise' ? 'Width' : 'Start radius'), min: 0, max: 1, step: 0.005, show: (L) => L.mode === 'burst' || L.mode === 'rise' },
          { key: 'wobble', type: 'range', label: 'Wobble', min: 0, max: 2, step: 0.01, fmt: 'pct', show: (L) => L.mode === 'drift' || L.mode === 'rise' },
          { key: 'twinkle', type: 'range', label: 'Twinkle', min: 0, max: 1, step: 0.01, fmt: 'pct' },
          { key: 'streak', type: 'range', label: 'Motion streaks', min: 0, max: 1, step: 0.01, fmt: 'pct' },
          { key: 'brightness', type: 'range', label: 'Brightness', min: 0, max: 3, step: 0.01, fmt: 'pct' },
          { key: 'x', type: 'range', label: 'Center X', min: -1, max: 1, step: 0.01, show: (L) => L.mode === 'burst' || L.mode === 'starfield' || L.mode === 'rise' },
          { key: 'y', type: 'range', label: 'Center Y', min: -1, max: 1, step: 0.01, show: (L) => L.mode === 'burst' || L.mode === 'starfield' },
          { key: 'colorMode', type: 'select', label: 'Colors', rerender: true, options: [['single', 'Single color'], ['palette', 'Palette']] },
          { key: 'color', type: 'color', label: 'Color', show: (L) => L.colorMode === 'single' },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'speedReact', type: 'range', label: 'Speed boost', min: 0, max: 20, step: 0.1, fmt: 'x' },
          { key: 'sizeReact', type: 'range', label: 'Size pulse', min: 0, max: 3, step: 0.01, fmt: 'pct' },
          { key: 'glowReact', type: 'range', label: 'Brightness pulse', min: 0, max: 3, step: 0.01, fmt: 'pct' },
          { key: 'streakReact', type: 'range', label: 'Streak boost', min: 0, max: 5, step: 0.05, fmt: 'x' },
        ],
      },
    ],
    render(R, L, F) {
      const count = U.clamp(L.count | 0, 0, 3000);
      if (!count) return;
      const env = R.val(L.react);
      const tau = F.t * L.speed + L.speedReact * R.integ(L.react);
      const a = L.direction * U.DEG;
      for (let i = 0; i < 4; i++) cols.set(R.palCycle(i), i * 3);
      R.draw(
        R.program('particles', FS, VS, true),
        {
          uTau: tau,
          uTime: F.t,
          uSeed: R.seedOf(L) % 100003,
          uMode: MODES[L.mode] || 0,
          uSize: L.size * (1 + L.sizeReact * env),
          uSizeVar: L.sizeVar,
          uSpread: L.spread,
          uDir: [Math.sin(a), Math.cos(a)],
          uCenter: R.pos(L.x, L.y),
          uStreak: L.streak * (1 + L.streakReact * env),
          uTwinkle: L.twinkle,
          uWobble: L.wobble,
          uBright: L.brightness * (1 + L.glowReact * env),
          uCols: cols,
          uColor: R.col(L.color),
          uColorMode: L.colorMode === 'palette' ? 0 : 1,
          uShape: L.shape === 'disc' ? 1 : 0,
        },
        L.blend,
        L.opacity,
        count
      );
    },
  });
})(window.VG);
