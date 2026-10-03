'use strict';
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  const FS = `
uniform int uCount;
uniform float uSides;
uniform vec2 uCenters[16];
uniform float uRadius[16];
uniform float uAngle[16];
uniform float uAlpha[16];
uniform vec3 uCol[16];
uniform float uStroke;
uniform float uGlow;
uniform float uFill;
uniform float uRound;
void main() {
  vec2 p = P();
  float px = PX();
  vec3 acc = vec3(0.0);
  float a = 0.0;
  float gw = 0.004 + 0.03 * uGlow;
  for (int i = 0; i < 16; i++) {
    if (i >= uCount) break;
    if (uAlpha[i] <= 0.001) continue;
    vec2 q = rot(-uAngle[i]) * (p - uCenters[i]);
    float r = uRadius[i];
    float rr = min(uRound, r * 0.9);
    float d = sdNgon(q, r - rr, uSides) - rr;
    float line = abs(d) - uStroke * 0.5;
    float aLine = clamp(0.5 - line / px, 0.0, 1.0);
    float aFill = clamp(0.5 - d / px, 0.0, 1.0) * uFill;
    float glow = uGlow * exp(-max(line, 0.0) / gw);
    float ai = max(aLine, aFill) * uAlpha[i];
    acc += uCol[i] * (ai + glow * uAlpha[i] * 0.7);
    a = max(a, ai);
  }
  outColor = vec4(acc, clamp(max(a, max(acc.r, max(acc.g, acc.b))), 0.0, 1.0)) * uOpacity;
}`;

  const centers = new Float32Array(32);
  const radius = new Float32Array(16);
  const angle = new Float32Array(16);
  const alpha = new Float32Array(16);
  const cols = new Float32Array(48);

  VG.registerLayer({
    type: 'polygons',
    label: 'Polygons',
    icon: 'poly',
    blurb: 'Nested rotating shapes, a zooming tunnel, or shapes orbiting the center.',
    layout: ['x', 'y', 'size', 'orbitRadius'],
    blend: 'add',
    defaults: {
      mode: 'rings',
      sides: 6,
      count: 5,
      size: 0.18,
      spacing: 0.35,
      stroke: 0.005,
      glow: 0.4,
      fill: 0,
      round: 0,
      rotation: 0,
      rotSpeed: 8,
      alternate: true,
      twist: 6,
      ripple: 0.04,
      fadeOuter: 0.4,
      x: 0,
      y: 0,
      orbitRadius: 0.32,
      tunnelSpeed: 0.25,
      colorMode: 'palette',
      color: 'p1',
      color2: 'p2',
      react: B('kick', { release: 0.25 }),
      pulse: 0.25,
      spinReact: 30,
      glowReact: 0.6,
      speedReact: 1,
    },
    controls: [
      {
        group: 'Polygons',
        items: [
          { key: 'mode', type: 'select', label: 'Style', rerender: true, options: [['rings', 'Nested rings'], ['tunnel', 'Zooming tunnel'], ['orbit', 'Orbiting shapes']] },
          { key: 'sides', type: 'range', label: 'Sides', min: 3, max: 12, step: 1, fmt: 'int' },
          { key: 'count', type: 'range', label: 'How many', min: 1, max: 16, step: 1, fmt: 'int' },
          { key: 'size', type: 'range', label: 'Size', min: 0.01, max: 0.6, step: 0.005 },
          { key: 'spacing', type: 'range', label: 'Ring spacing', min: 0, max: 1.5, step: 0.01, show: (L) => L.mode === 'rings' },
          { key: 'orbitRadius', type: 'range', label: 'Orbit radius', min: 0, max: 0.8, step: 0.005, show: (L) => L.mode === 'orbit' },
          { key: 'tunnelSpeed', type: 'range', label: 'Tunnel speed', min: -2, max: 2, step: 0.01, show: (L) => L.mode === 'tunnel' },
          { key: 'stroke', type: 'range', label: 'Line width', min: 0.0005, max: 0.04, step: 0.0005 },
          { key: 'fill', type: 'range', label: 'Fill', min: 0, max: 1, step: 0.01, fmt: 'pct' },
          { key: 'glow', type: 'range', label: 'Glow', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'round', type: 'range', label: 'Rounded corners', min: 0, max: 0.1, step: 0.001 },
          { key: 'rotation', type: 'range', label: 'Rotation', min: -180, max: 180, step: 1, fmt: 'deg' },
          { key: 'rotSpeed', type: 'range', label: 'Spin speed', min: -180, max: 180, step: 1, fmt: 'degs' },
          { key: 'alternate', type: 'toggle', label: 'Alternate spin direction' },
          { key: 'twist', type: 'range', label: 'Twist between shapes', min: -45, max: 45, step: 0.5, fmt: 'deg' },
          { key: 'ripple', type: 'range', label: 'Ripple delay (outer rings react later)', min: 0, max: 0.2, step: 0.005, fmt: 's', show: (L) => L.mode === 'rings' },
          { key: 'fadeOuter', type: 'range', label: 'Fade outer rings', min: 0, max: 1, step: 0.01, fmt: 'pct', show: (L) => L.mode === 'rings' },
          { key: 'x', type: 'range', label: 'Center X', min: -1, max: 1, step: 0.01 },
          { key: 'y', type: 'range', label: 'Center Y', min: -1, max: 1, step: 0.01 },
          { key: 'colorMode', type: 'select', label: 'Colors', rerender: true, options: [['palette', 'Palette'], ['gradient', 'Gradient (2 colors)'], ['single', 'Single color']] },
          { key: 'color', type: 'color', label: 'Color', show: (L) => L.colorMode !== 'palette' },
          { key: 'color2', type: 'color', label: 'Second color', show: (L) => L.colorMode === 'gradient' },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'pulse', type: 'range', label: 'Size punch', min: 0, max: 1.5, step: 0.01, fmt: 'pct' },
          { key: 'spinReact', type: 'range', label: 'Extra spin when loud', min: -360, max: 360, step: 1, fmt: 'deg' },
          { key: 'glowReact', type: 'range', label: 'Glow pulse', min: 0, max: 3, step: 0.01, fmt: 'pct' },
          { key: 'speedReact', type: 'range', label: 'Tunnel rushes when loud', min: 0, max: 4, step: 0.05, fmt: 'x', show: (L) => L.mode === 'tunnel' },
        ],
      },
    ],
    render(R, L, F) {
      const n = U.clamp(L.count | 0, 1, 16);
      const env = R.val(L.react);
      const integ = R.integ(L.react);
      const baseRot = (L.rotation + L.rotSpeed * F.t + L.spinReact * integ) * U.DEG;
      const c = R.pos(L.x, L.y);
      const ca = R.col(L.color);
      const cb = R.col(L.color2);
      for (let i = 0; i < n; i++) {
        let cx = c[0];
        let cy = c[1];
        let rad;
        let ang;
        let al = 1;
        if (L.mode === 'tunnel') {
          const travel = F.t * L.tunnelSpeed + L.speedReact * integ * 0.5;
          const fr = U.fract(i / n + travel);
          const rMin = Math.max(0.005, L.size * 0.08);
          const rMax = Math.hypot(R.half[0], R.half[1]) * 1.2;
          rad = rMin * Math.pow(rMax / rMin, fr) * (1 + L.pulse * env * 0.4);
          al = U.smoothstep(0, 0.12, fr) * (1 - U.smoothstep(0.85, 1, fr));
          ang = baseRot + fr * L.twist * U.DEG * 6;
        } else if (L.mode === 'orbit') {
          const oa = baseRot * 0.5 + (i / n) * Math.PI * 2;
          const orr = L.orbitRadius * (1 + L.pulse * env * 0.4);
          cx += Math.cos(oa) * orr;
          cy += Math.sin(oa) * orr;
          rad = L.size * (1 + L.pulse * env);
          ang = baseRot * (L.alternate && i % 2 ? -1 : 1) + i * L.twist * U.DEG;
        } else {
          const e = L.ripple > 0 ? R.valAt(L.react, F.t - i * L.ripple) : env;
          rad = L.size * (1 + i * L.spacing) * (1 + L.pulse * e);
          ang = baseRot * (L.alternate && i % 2 ? -1 : 1) + i * L.twist * U.DEG;
          al = 1 - (i / Math.max(1, n - 1)) * L.fadeOuter;
        }
        centers[i * 2] = cx;
        centers[i * 2 + 1] = cy;
        radius[i] = rad;
        angle[i] = ang;
        alpha[i] = al;
        let col;
        if (L.colorMode === 'palette') col = R.palCycle(i);
        else if (L.colorMode === 'gradient') {
          const k = n > 1 ? i / (n - 1) : 0;
          col = [U.lerp(ca[0], cb[0], k), U.lerp(ca[1], cb[1], k), U.lerp(ca[2], cb[2], k)];
        } else col = ca;
        cols.set(col, i * 3);
      }
      R.draw(
        R.program('polygons', FS),
        {
          uCount: n,
          uSides: U.clamp(Math.round(L.sides), 3, 12),
          uCenters: centers,
          uRadius: radius,
          uAngle: angle,
          uAlpha: alpha,
          uCol: cols,
          uStroke: L.stroke,
          uGlow: L.glow * (1 + L.glowReact * env),
          uFill: L.fill,
          uRound: L.round,
        },
        L.blend,
        L.opacity
      );
    },
  });
})(window.VG);
