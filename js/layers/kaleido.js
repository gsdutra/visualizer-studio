'use strict';
// Kaleidoscope — an effect layer: mirrors everything drawn below it.
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  const FS = `
uniform int uMode;
uniform float uSegments;
uniform vec2 uCenter;
uniform float uRot;
uniform float uZoom;
uniform vec2 uSrc;
uniform float uSrcRot;
uniform float uSize;
uniform float uSeam;
uniform vec3 uSeamCol;
uniform float uSeamGlow;
void main() {
  vec2 q = rot(-uRot) * (P() - uCenter);
  float seamD = 1e9;
  if (uMode == 0) {
    // Radial: n mirrored slices around the center.
    float seg = TAU / uSegments;
    float r = length(q);
    float a = mod(atan(q.y, q.x), seg);
    if (a > seg * 0.5) a = seg - a;
    seamD = r * sin(min(a, seg * 0.5 - a));
    q = r * vec2(cos(a), sin(a));
  } else if (uMode == 1) {
    // Triangle: three mirrors, like a real kaleidoscope tube (reflect into one triangle).
    const vec2 n1 = vec2(0.0, 1.0);
    const vec2 n2 = vec2(-0.8660254, -0.5);
    const vec2 n3 = vec2(0.8660254, -0.5);
    for (int i = 0; i < 64; i++) {
      float d1 = dot(q, n1) + uSize;
      float d2 = dot(q, n2) + uSize;
      float d3 = dot(q, n3) + uSize;
      if (d1 >= 0.0 && d2 >= 0.0 && d3 >= 0.0) break;
      if (d1 < 0.0) q -= 2.0 * d1 * n1;
      else if (d2 < 0.0) q -= 2.0 * d2 * n2;
      else q -= 2.0 * d3 * n3;
    }
    seamD = min(dot(q, n1), min(dot(q, n2), dot(q, n3))) + uSize;
  } else if (uMode == 2) {
    seamD = min(abs(q.x), abs(q.y));
    q = abs(q);
  } else {
    seamD = abs(q.x);
    q.x = abs(q.x);
  }
  vec2 sp = rot(uSrcRot) * q / uZoom + uSrc;
  vec3 col = texture(uScene, sp / (2.0 * HALF()) + 0.5).rgb;
  if (uSeam > 0.0) {
    float px = PX();
    float line = clamp(0.5 - (seamD - uSeam * 0.5) / px, 0.0, 1.0);
    float glow = uSeamGlow * exp(-max(seamD, 0.0) / (0.004 + 0.02 * uSeamGlow));
    col = mix(col, uSeamCol, line) + uSeamCol * glow * (1.0 - line);
  }
  outColor = finishEffect(texture(uScene, vUv).rgb, vec4(col, 1.0));
}`;

  const MODES = { radial: 0, triangle: 1, quad: 2, mirror: 3 };

  VG.registerLayer({
    type: 'kaleido',
    label: 'Kaleidoscope',
    icon: 'kaleido',
    category: 'effect',
    blurb: 'Mirrors everything below this layer into a kaleidoscope.',
    layout: ['x', 'y', 'size'],
    defaults: {
      mode: 'radial',
      segments: 8,
      size: 0.22,
      x: 0,
      y: 0,
      rotation: 0,
      spin: 4,
      zoom: 1,
      srcX: 0.15,
      srcY: 0.1,
      drift: 0.3,
      seam: 0,
      seamColor: 'p4',
      seamGlow: 0.3,
      react: B('bass', { release: 0.25 }),
      spinReact: 20,
      zoomPulse: 0.08,
    },
    controls: [
      {
        group: 'Kaleidoscope',
        items: [
          { key: 'mode', type: 'select', label: 'Style', rerender: true, options: [['radial', 'Radial slices'], ['triangle', 'Triangle mirrors (kaleidoscope tube)'], ['quad', 'Mirror quadrants'], ['mirror', 'Mirror left/right']] },
          { key: 'segments', type: 'range', label: 'Slices', min: 2, max: 24, step: 1, fmt: 'int', show: (L) => L.mode === 'radial' },
          { key: 'size', type: 'range', label: 'Triangle size', min: 0.03, max: 0.6, step: 0.005, show: (L) => L.mode === 'triangle' },
          { key: 'x', type: 'range', label: 'Center X', min: -1, max: 1, step: 0.005 },
          { key: 'y', type: 'range', label: 'Center Y', min: -1, max: 1, step: 0.005 },
          { key: 'rotation', type: 'range', label: 'Rotation', min: -180, max: 180, step: 1, fmt: 'deg' },
          { key: 'spin', type: 'range', label: 'Spin', min: -90, max: 90, step: 0.5, fmt: 'degs' },
          { key: 'zoom', type: 'range', label: 'Magnify', min: 0.3, max: 4, step: 0.01, fmt: 'x' },
          { key: 'srcX', type: 'range', label: 'Mirror from X', min: -1, max: 1, step: 0.005, hint: () => 'Which part of the picture gets reflected' },
          { key: 'srcY', type: 'range', label: 'Mirror from Y', min: -1, max: 1, step: 0.005 },
          { key: 'drift', type: 'range', label: 'Wander', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'seam', type: 'range', label: 'Mirror lines', min: 0, max: 0.01, step: 0.0005 },
          { key: 'seamColor', type: 'color', label: 'Line color', show: (L) => L.seam > 0 },
          { key: 'seamGlow', type: 'range', label: 'Line glow', min: 0, max: 2, step: 0.01, fmt: 'pct', show: (L) => L.seam > 0 },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'spinReact', type: 'range', label: 'Extra spin when loud', min: -360, max: 360, step: 1, fmt: 'deg' },
          { key: 'zoomPulse', type: 'range', label: 'Magnify pulse', min: 0, max: 1, step: 0.01, fmt: 'pct' },
        ],
      },
    ],
    render(R, L, F) {
      const env = R.val(L.react);
      const integ = R.integ(L.react);
      const w = R.wander(L, 0, F.t * 0.4);
      const src = R.pos(L.srcX, L.srcY);
      const drift = 0.25 * L.drift;
      R.effect(
        R.program('kaleido', VG.GL.FS_EFFECT + FS),
        {
          uMode: MODES[L.mode] != null ? MODES[L.mode] : 0,
          uSegments: Math.max(2, Math.round(L.segments)),
          uCenter: R.pos(L.x, L.y),
          uRot: (L.rotation + L.spin * F.t + L.spinReact * integ) * U.DEG,
          uZoom: Math.max(0.05, L.zoom * (1 + L.zoomPulse * env)),
          uSrc: [src[0] + w[0] * drift, src[1] + w[1] * drift],
          uSrcRot: w[0] * L.drift * 0.6,
          uSize: L.size,
          uSeam: L.seam,
          uSeamCol: R.col(L.seamColor),
          uSeamGlow: L.seamGlow,
        },
        L
      );
    },
  });
})(window.VG);
