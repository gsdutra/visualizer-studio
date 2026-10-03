'use strict';
(function (VG) {
  const B = VG.analysis.binding;

  // Retro "outrun" scene: a perspective grid floor scrolling toward the viewer and a
  // striped sun on the horizon.
  const FS = `
uniform float uHorizon;
uniform vec3 uGridCol;
uniform vec3 uFloorCol;
uniform float uFloorAmt;
uniform float uLine;
uniform float uGlow;
uniform float uDensity;
uniform float uTravel;
uniform float uCamH;
uniform float uFog;
uniform float uBright;
uniform int uSun;
uniform vec2 uSunPos;
uniform float uSunR;
uniform vec3 uSunTop;
uniform vec3 uSunBot;
uniform float uStripes;
uniform float uSunGlow;
void main() {
  vec2 p = P();
  float px = PX();
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  if (uSun == 1) {
    vec2 q = p - uSunPos;
    float d = length(q) - uSunR;
    float tt = clamp(q.y / (2.0 * uSunR) + 0.5, 0.0, 1.0);
    vec3 sc = mix(uSunBot, uSunTop, tt);
    float a = clamp(0.5 - d / px, 0.0, 1.0);
    if (uStripes > 0.5) {
      // Classic "sliced" sun: gaps start below the center and get wider toward the bottom.
      float s = -q.y / uSunR;
      float f = fract(s * uStripes);
      float gap = mix(0.06, 0.65, clamp(s, 0.0, 1.0));
      float fw = fwidth(s * uStripes);
      if (s > 0.0) a *= smoothstep(gap - fw, gap + fw, f);
    }
    float g = uSunGlow * exp(-max(d, 0.0) / (0.03 + 0.12 * uSunGlow)) * 0.8;
    col = sc * a + mix(uSunBot, uSunTop, 0.6) * g * (1.0 - a);
    alpha = clamp(a + g * (1.0 - a), 0.0, 1.0);
  }
  // Derivatives are taken outside the branch so they stay well-defined at the horizon.
  float z = uCamH / max(uHorizon - p.y, 1e-3);
  vec2 w = vec2(p.x * z, z + uTravel) * uDensity;
  vec2 fw = max(fwidth(w), vec2(1e-5));
  if (p.y < uHorizon) {
    vec2 gd = abs(fract(w - 0.5) - 0.5) / fw;
    float line = min(gd.x, gd.y);
    float a = clamp(uLine - line + 0.5, 0.0, 1.0);
    float glow = uGlow * exp(-line / (uLine * 4.0 + 1.0));
    float fog = exp(-z * uFog);
    vec3 grid = uGridCol * uBright * (a + glow * 0.6) * fog;
    col = col * (1.0 - uFloorAmt) + uFloorCol * uFloorAmt + grid;
    alpha = max(alpha * (1.0 - uFloorAmt) + uFloorAmt, clamp(max(grid.r, max(grid.g, grid.b)), 0.0, 1.0));
  }
  float hl = exp(-abs(p.y - uHorizon) / 0.006) * uGlow;
  col += uGridCol * uBright * hl * 0.8;
  alpha = clamp(alpha + hl, 0.0, 1.0);
  outColor = vec4(col, alpha) * uOpacity;
}`;

  VG.registerLayer({
    type: 'grid',
    label: 'Retro grid & sun',
    icon: 'grid',
    blurb: 'Synthwave floor grid racing toward you, with a striped sun.',
    layout: ['horizon', 'sunX', 'sunY', 'sunSize'],
    defaults: {
      horizon: -0.1,
      gridColor: 'p1',
      floorColor: '#07010f',
      floorAmount: 1,
      line: 1.6,
      glow: 0.6,
      density: 1.2,
      speed: 0.6,
      camHeight: 0.35,
      fog: 0.35,
      sun: true,
      sunX: 0,
      sunY: 0.22,
      sunSize: 0.3,
      sunTop: 'p3',
      sunBottom: 'p2',
      stripes: 7,
      sunGlow: 0.6,
      react: B('kick', { release: 0.25 }),
      speedReact: 1.5,
      sunPulse: 0.04,
      gridFlash: 0.6,
    },
    controls: [
      {
        group: 'Grid',
        items: [
          { key: 'horizon', type: 'range', label: 'Horizon height', min: -1, max: 1, step: 0.005 },
          { key: 'gridColor', type: 'color', label: 'Grid color' },
          { key: 'line', type: 'range', label: 'Line width', min: 0.3, max: 6, step: 0.1 },
          { key: 'glow', type: 'range', label: 'Glow', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'density', type: 'range', label: 'Grid density', min: 0.2, max: 5, step: 0.05, fmt: 'x' },
          { key: 'speed', type: 'range', label: 'Speed', min: -3, max: 3, step: 0.05, fmt: 'x' },
          { key: 'camHeight', type: 'range', label: 'Camera height', min: 0.05, max: 1.5, step: 0.01 },
          { key: 'fog', type: 'range', label: 'Distance fade', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'floorColor', type: 'color', label: 'Floor color' },
          { key: 'floorAmount', type: 'range', label: 'Floor opacity', min: 0, max: 1, step: 0.01, fmt: 'pct' },
        ],
      },
      {
        group: 'Sun',
        items: [
          { key: 'sun', type: 'toggle', label: 'Show sun', rerender: true },
          { key: 'sunX', type: 'range', label: 'Sun X', min: -1, max: 1, step: 0.005, show: (L) => L.sun },
          { key: 'sunY', type: 'range', label: 'Sun Y', min: -1, max: 1, step: 0.005, show: (L) => L.sun },
          { key: 'sunSize', type: 'range', label: 'Sun size', min: 0.02, max: 0.8, step: 0.005, show: (L) => L.sun },
          { key: 'sunTop', type: 'color', label: 'Sun top color', show: (L) => L.sun },
          { key: 'sunBottom', type: 'color', label: 'Sun bottom color', show: (L) => L.sun },
          { key: 'stripes', type: 'range', label: 'Stripes', min: 0, max: 20, step: 1, fmt: 'int', show: (L) => L.sun },
          { key: 'sunGlow', type: 'range', label: 'Sun glow', min: 0, max: 2, step: 0.01, fmt: 'pct', show: (L) => L.sun },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'speedReact', type: 'range', label: 'Rushes forward when loud', min: 0, max: 6, step: 0.05, fmt: 'x' },
          { key: 'gridFlash', type: 'range', label: 'Grid flash', min: 0, max: 3, step: 0.01, fmt: 'pct' },
          { key: 'sunPulse', type: 'range', label: 'Sun pulse', min: 0, max: 0.5, step: 0.005, fmt: 'pct' },
        ],
      },
    ],
    render(R, L, F) {
      const env = R.val(L.react);
      const m = Math.min(R.w, R.h);
      R.draw(
        R.program('grid', FS),
        {
          uHorizon: L.horizon * R.half[1],
          uGridCol: R.col(L.gridColor),
          uFloorCol: R.col(L.floorColor),
          uFloorAmt: L.floorAmount,
          uLine: L.line * (m / 1080),
          uGlow: L.glow,
          uDensity: L.density,
          uTravel: F.t * L.speed + L.speedReact * R.integ(L.react),
          uCamH: L.camHeight,
          uFog: L.fog,
          uBright: 1 + L.gridFlash * env,
          uSun: L.sun ? 1 : 0,
          uSunPos: R.pos(L.sunX, L.sunY),
          uSunR: L.sunSize * (1 + L.sunPulse * env),
          uSunTop: R.col(L.sunTop),
          uSunBot: R.col(L.sunBottom),
          uStripes: L.stripes,
          uSunGlow: L.sunGlow,
        },
        L.blend,
        L.opacity
      );
    },
  });
})(window.VG);
