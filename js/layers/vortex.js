'use strict';
// Vortex — shapes laid out on a log-polar grid (rings of cells that get smaller toward the
// center). Moving the grid along log(radius) is an exact, endless zoom: shapes keep pouring out
// of the center and there is always more detail in the middle. Fully stateless.
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  const FS = `
uniform vec2 uCenter;
uniform float uFlow;
uniform float uDensity;
uniform float uTwist;
uniform float uRot;
uniform int uPattern;
uniform float uSize;
uniform float uOutline;
uniform float uGlow;
uniform float uPulse;
uniform float uBright;
uniform float uHole;
uniform vec3 uCols[4];
uniform int uColorMode;
uniform vec3 uColor;
uniform float uSeed;
void main() {
  vec2 p = P() - uCenter;
  float r = max(length(p), 1e-5);
  float a = atan(p.y, p.x) + uRot;
  float k = uDensity / TAU;
  vec2 lp = vec2(log(r) * k - uFlow, a * k);
  lp.y += lp.x * uTwist;
  vec2 id = floor(lp);
  vec2 f = fract(lp) - 0.5;
  float idy = mod(id.y, uDensity);
  float rnd = hash12(vec2(id.x, idy) + uSeed);
  float s = uSize * uPulse * (0.85 + 0.3 * rnd);
  float d;
  if (uPattern == 0) d = length(f) - 0.5 * s;
  else if (uPattern == 1) d = abs(length(f) - 0.32 * s) - 0.07 * s;
  else if (uPattern == 2) d = sdNgon(f, 0.55 * s, 6.0);
  else if (uPattern == 3) d = sdNgon(mod(id.x + idy, 2.0) < 1.0 ? f : -f, 0.6 * s, 3.0);
  else if (uPattern == 4) { vec2 q = vec2(f.x, f.y * 2.0); d = (length(q) - 0.5 * s) / 2.0; }
  else d = sdRoundBox(f, vec2(0.45 * s), 0.0);
  if (uOutline > 0.0) d = abs(d) - uOutline * 0.5;
  // One screen pixel measured in grid cells (exact, no derivatives needed).
  float cellPerPx = k * PX() / r;
  float m = 1.0 - smoothstep(-cellPerPx, cellPerPx, d);
  float glow = uGlow * exp(-max(d, 0.0) / 0.1);
  // Fade out where cells shrink below a few pixels (avoids shimmer at the very center).
  float vis = smoothstep(1.5, 5.0, 1.0 / cellPerPx) * smoothstep(0.0, max(uHole, 1e-4), r);
  vec3 c;
  if (uColorMode == 0) c = uCols[int(mod(id.x, 4.0))];
  else if (uColorMode == 1) c = uCols[int(min(floor(rnd * 4.0), 3.0))];
  else c = uColor;
  float alpha = (m + glow * (1.0 - m)) * vis;
  outColor = vec4(c * uBright * alpha, clamp(alpha, 0.0, 1.0)) * uOpacity;
}`;

  const PATTERNS = { dots: 0, rings: 1, hex: 2, triangles: 3, petals: 4, squares: 5 };
  const cols = new Float32Array(12);

  VG.registerLayer({
    type: 'vortex',
    label: 'Vortex',
    icon: 'vortex',
    blurb: 'A spiral of shapes pouring endlessly out of the center: a zoom that never ends.',
    layout: ['x', 'y', 'hole'],
    blend: 'add',
    defaults: {
      pattern: 'hex',
      density: 14,
      size: 0.7,
      outline: 0.1,
      twist: 0.3,
      speed: 0.35,
      rotSpeed: 4,
      x: 0,
      y: 0,
      hole: 0.05,
      glow: 0.25,
      brightness: 0.75,
      colorMode: 'depth',
      color: 'p1',
      react: B('bass', { release: 0.2 }),
      speedReact: 1.2,
      pulse: 0.35,
      flash: 0.5,
      spinReact: 0,
    },
    controls: [
      {
        group: 'Vortex',
        items: [
          { key: 'pattern', type: 'select', label: 'Shapes', options: [['hex', 'Hexagons'], ['dots', 'Dots'], ['rings', 'Rings'], ['triangles', 'Triangles'], ['petals', 'Petals'], ['squares', 'Squares']] },
          { key: 'density', type: 'range', label: 'Shapes per ring', min: 3, max: 48, step: 1, fmt: 'int' },
          { key: 'size', type: 'range', label: 'Shape size', min: 0.05, max: 1.2, step: 0.01, fmt: 'pct' },
          { key: 'outline', type: 'range', label: 'Outline only (thickness)', min: 0, max: 0.4, step: 0.01, hint: () => '0 = filled shapes' },
          { key: 'twist', type: 'range', label: 'Spiral twist', min: -2, max: 2, step: 0.01 },
          { key: 'speed', type: 'range', label: 'Zoom speed', min: -2, max: 3, step: 0.01, fmt: 'x' },
          { key: 'rotSpeed', type: 'range', label: 'Rotation', min: -90, max: 90, step: 0.5, fmt: 'degs' },
          { key: 'x', type: 'range', label: 'Center X', min: -1, max: 1, step: 0.005 },
          { key: 'y', type: 'range', label: 'Center Y', min: -1, max: 1, step: 0.005 },
          { key: 'hole', type: 'range', label: 'Empty center', min: 0, max: 0.5, step: 0.005 },
          { key: 'glow', type: 'range', label: 'Glow', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'brightness', type: 'range', label: 'Brightness', min: 0, max: 3, step: 0.01, fmt: 'pct' },
          { key: 'colorMode', type: 'select', label: 'Colors', rerender: true, options: [['depth', 'Palette rings (flowing)'], ['random', 'Palette (random)'], ['single', 'Single color']] },
          { key: 'color', type: 'color', label: 'Color', show: (L) => L.colorMode === 'single' },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'speedReact', type: 'range', label: 'Dives faster when loud', min: 0, max: 6, step: 0.05, fmt: 'x' },
          { key: 'pulse', type: 'range', label: 'Shape pulse', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'flash', type: 'range', label: 'Brightness pulse', min: 0, max: 3, step: 0.01, fmt: 'pct' },
          { key: 'spinReact', type: 'range', label: 'Extra spin when loud', min: -360, max: 360, step: 1, fmt: 'deg' },
        ],
      },
    ],
    render(R, L, F) {
      const env = R.val(L.react);
      const integ = R.integ(L.react);
      const density = Math.max(3, Math.round(L.density));
      const k = density / (Math.PI * 2);
      const travel = L.speed * F.t + L.speedReact * integ;
      for (let i = 0; i < 4; i++) cols.set(R.palCycle(i), i * 3);
      R.draw(
        R.program('vortex', FS),
        {
          uCenter: R.pos(L.x, L.y),
          uFlow: travel * Math.LN2 * k,
          uDensity: density,
          uTwist: L.twist,
          uRot: (L.rotSpeed * F.t + L.spinReact * integ) * U.DEG,
          uPattern: PATTERNS[L.pattern] != null ? PATTERNS[L.pattern] : 2,
          uSize: L.size,
          uOutline: L.outline,
          uGlow: L.glow,
          uPulse: 1 + L.pulse * env,
          uBright: L.brightness * (1 + L.flash * env),
          uHole: L.hole,
          uCols: cols,
          uColorMode: { depth: 0, random: 1, single: 2 }[L.colorMode] || 0,
          uColor: R.col(L.color),
          uSeed: (R.seedOf(L) % 997) * 0.37,
        },
        L.blend,
        L.opacity
      );
    },
  });
})(window.VG);
