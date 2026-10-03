'use strict';
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  // Classic metaballs: every ball adds r²/d² to a field; the surface is where the field = 1.
  // Distance to the surface is estimated from the field's screen-space derivative, which
  // gives clean anti-aliased edges and outlines at any resolution.
  const FS = `
uniform int uCount;
uniform vec3 uBall[16];
uniform vec3 uCol[16];
uniform int uStyle;
uniform float uEdge;
uniform float uGlow;
uniform float uWobble;
uniform float uTime;
void main() {
  vec2 p = P();
  float f = 0.0;
  vec3 cacc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uCount) break;
    vec2 d = p - uBall[i].xy;
    float r = uBall[i].z;
    float c = r * r / (dot(d, d) + 1e-6);
    f += c;
    cacc += uCol[i] * c;
  }
  if (uWobble > 0.0) f *= 1.0 + uWobble * 0.12 * sin(p.x * 13.0 + uTime * 1.7) * sin(p.y * 11.0 - uTime * 1.3);
  vec3 col = cacc / max(f, 1e-6);
  float sd = (f - 1.0) / max(fwidth(f), 1e-6);
  float px = PX();
  float inside = clamp(sd + 0.5, 0.0, 1.0);
  float edgePx = max(uEdge / px, 1.0);
  vec3 outc;
  float a;
  if (uStyle == 0) {
    float rim = exp(-max(sd, 0.0) / (edgePx * 2.0));
    outc = mix(col * 0.55, col * 1.3, rim) * inside;
    a = inside;
  } else if (uStyle == 1) {
    float line = clamp(edgePx * 0.5 - abs(sd) + 0.5, 0.0, 1.0);
    outc = col * 1.4 * line;
    a = line;
  } else {
    float rim = exp(-max(sd, 0.0) / (edgePx * 1.5));
    outc = col * (0.12 + 0.9 * rim) * inside;
    a = inside * (0.2 + 0.8 * rim);
  }
  float g = uGlow * pow(clamp(f, 0.0, 1.0), 3.0) * (1.0 - inside);
  outc += col * g;
  a = clamp(a + g * (1.0 - a), 0.0, 1.0);
  outColor = vec4(outc, a) * uOpacity;
}`;

  const balls = new Float32Array(48);
  const cols = new Float32Array(48);

  VG.registerLayer({
    type: 'metaballs',
    label: 'Morphing balls',
    icon: 'balls',
    blurb: 'Liquid balls that wander around and melt into each other.',
    layout: ['x', 'y', 'area', 'size'],
    defaults: {
      count: 8,
      size: 0.085,
      sizeVar: 0.5,
      area: 0.7,
      x: 0,
      y: 0,
      speed: 1.2,
      style: 'fill',
      edge: 0.01,
      glow: 0.5,
      wobble: 0.3,
      colorMode: 'palette',
      color: 'p1',
      react: B('bass', { release: 0.15 }),
      sizeReact: 0.6,
      speedReact: 1,
      glowReact: 0.5,
    },
    controls: [
      {
        group: 'Morphing balls',
        items: [
          { key: 'style', type: 'select', label: 'Style', options: [['fill', 'Liquid (filled)'], ['neon', 'Neon outline'], ['glass', 'Glass']] },
          { key: 'count', type: 'range', label: 'How many', min: 1, max: 16, step: 1, fmt: 'int' },
          { key: 'size', type: 'range', label: 'Ball size', min: 0.01, max: 0.35, step: 0.005 },
          { key: 'sizeVar', type: 'range', label: 'Size variety', min: 0, max: 1, step: 0.01, fmt: 'pct' },
          { key: 'area', type: 'range', label: 'Roaming area', min: 0, max: 1.4, step: 0.01 },
          { key: 'x', type: 'range', label: 'Center X', min: -1, max: 1, step: 0.01 },
          { key: 'y', type: 'range', label: 'Center Y', min: -1, max: 1, step: 0.01 },
          { key: 'speed', type: 'range', label: 'Speed', min: 0, max: 6, step: 0.05, fmt: 'x' },
          { key: 'edge', type: 'range', label: 'Edge / outline width', min: 0.001, max: 0.05, step: 0.001 },
          { key: 'glow', type: 'range', label: 'Outer glow', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'wobble', type: 'range', label: 'Wobble', min: 0, max: 1, step: 0.01, fmt: 'pct' },
          { key: 'colorMode', type: 'select', label: 'Colors', rerender: true, options: [['palette', 'Palette'], ['single', 'Single color']] },
          { key: 'color', type: 'color', label: 'Color', show: (L) => L.colorMode === 'single' },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'sizeReact', type: 'range', label: 'Swell', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'glowReact', type: 'range', label: 'Glow pulse', min: 0, max: 3, step: 0.01, fmt: 'pct' },
          { key: 'speedReact', type: 'range', label: 'Moves faster when loud', min: 0, max: 6, step: 0.05, fmt: 'x' },
        ],
      },
    ],
    render(R, L, F) {
      const env = R.val(L.react);
      const n = U.clamp(L.count | 0, 1, 16);
      const tau = F.t * L.speed + L.speedReact * R.integ(L.react) * 2;
      const c = R.pos(L.x, L.y);
      for (let i = 0; i < n; i++) {
        const w = R.wander(L, i, tau + i * 3.7);
        const r1 = R.rnd(L, i, 1);
        const r2 = R.rnd(L, i, 2);
        balls[i * 3] = c[0] + w[0] * L.area * R.half[0];
        balls[i * 3 + 1] = c[1] + w[1] * L.area * R.half[1];
        balls[i * 3 + 2] = L.size * (1 - L.sizeVar * 0.5 + L.sizeVar * r1) * (1 + L.sizeReact * env * (0.6 + 0.8 * r2));
        cols.set(L.colorMode === 'palette' ? R.palCycle(i) : R.col(L.color), i * 3);
      }
      R.draw(
        R.program('metaballs', FS),
        {
          uCount: n,
          uBall: balls,
          uCol: cols,
          uStyle: { fill: 0, neon: 1, glass: 2 }[L.style] || 0,
          uEdge: L.edge,
          uGlow: L.glow * (1 + L.glowReact * env),
          uWobble: L.wobble,
          uTime: F.t,
        },
        L.blend,
        L.opacity
      );
    },
  });
})(window.VG);
