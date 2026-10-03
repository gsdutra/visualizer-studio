'use strict';
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  const FS = `
uniform sampler2D uTex;
uniform int uHasTex;
uniform vec2 uTexSize;
uniform vec2 uCenter;
uniform float uSize;
uniform int uShape;
uniform float uCorner;
uniform float uAngle;
uniform float uScale;
uniform float uBorder;
uniform vec3 uBorderCol;
uniform float uShadow;
uniform vec3 uShadowCol;
uniform float uBright;
uniform vec3 uFillCol;
uniform float uFillAmt;
uniform int uPlaceholder;
uniform vec3 uLabelCol;

// Spinning vinyl record, shown when no image is loaded.
vec4 vinyl(vec2 q) {
  float r = length(q);
  if (r > 1.0) return vec4(0.0);
  vec3 c = vec3(0.035);
  c += vec3(0.03) * (0.5 + 0.5 * sin(r * 190.0)) * smoothstep(0.4, 0.44, r);
  float a = atan(q.y, q.x);
  c += vec3(0.07) * pow(abs(sin(a * 1.0 + 0.6)), 10.0) * smoothstep(0.42, 0.95, r);
  if (r < 0.38) {
    c = uLabelCol * (0.78 + 0.22 * smoothstep(0.38, 0.1, r));
    if (abs(q.y) < 0.025 && q.x > 0.12 && q.x < 0.3) c *= 0.55;
  }
  if (r < 0.03) c = vec3(0.0);
  return vec4(c, 1.0);
}

void main() {
  vec2 p = P();
  vec2 q = rot(-uAngle) * (p - uCenter) / uScale;
  float px = PX() / uScale;
  float ia = uHasTex == 1 ? uTexSize.x / uTexSize.y : 1.0;
  int shape = (uHasTex == 0 && uShape == 0) ? 1 : uShape;
  vec2 hs = shape == 0 ? vec2(0.5 * uSize * ia, 0.5 * uSize) : vec2(0.5 * uSize);
  float d;
  if (shape == 1) d = length(q) - hs.x;
  else if (shape == 2) d = sdRoundBox(q, hs, uCorner * hs.x);
  else d = sdRoundBox(q, hs, 0.0);
  float inside = clamp(0.5 - d / px, 0.0, 1.0);

  // Sample outside of any branch so mipmap derivatives stay well-defined.
  vec2 uv;
  if (shape == 0) uv = q / (2.0 * hs) + 0.5;
  else {
    vec2 s = ia > 1.0 ? vec2(1.0 / ia, 1.0) : vec2(1.0, ia);
    uv = (q / (2.0 * hs)) * s + 0.5;
  }
  uv.y = 1.0 - uv.y;
  vec4 img = texture(uTex, uv);
  if (uHasTex == 0) img = uPlaceholder == 1 ? vinyl(q / hs.x) : vec4(0.0);
  img.rgb += uFillCol * uFillAmt * (1.0 - img.a);
  img.a += uFillAmt * (1.0 - img.a);
  img.rgb *= uBright;
  vec4 col = img * inside;

  if (uBorder > 0.0) {
    float bd = abs(d - uBorder * 0.5) - uBorder * 0.5;
    float ba = clamp(0.5 - bd / px, 0.0, 1.0);
    col = col * (1.0 - ba) + vec4(uBorderCol, 1.0) * ba;
  }
  if (uShadow > 0.0) {
    float od = max(d - uBorder, 0.0);
    float g = uShadow * exp(-od / (0.01 + 0.05 * uShadow));
    col += vec4(uShadowCol * g, g) * (1.0 - col.a);
  }
  outColor = col * uOpacity;
}`;

  VG.registerLayer({
    type: 'image',
    label: 'Cover art / logo',
    icon: 'image',
    blurb: 'Your cover art or logo, with shape, border, glow and a beat pulse.',
    layout: ['x', 'y', 'size'],
    defaults: {
      source: 'cover',
      shape: 'circle',
      size: 0.4,
      x: 0,
      y: 0,
      corner: 0.15,
      rotation: 0,
      spin: 0,
      border: 0,
      borderColor: 'p4',
      shadow: 0,
      shadowColor: '#000000',
      fill: false,
      fillColor: '#000000',
      placeholder: true,
      brightness: 1,
      react: B('bass', { release: 0.15 }),
      pulse: 0.06,
      spinReact: 0,
      flash: 0,
    },
    controls: [
      {
        group: 'Image',
        items: [
          { key: 'source', type: 'slot', label: 'Image' },
          { key: 'shape', type: 'select', label: 'Shape', rerender: true, options: [['circle', 'Circle'], ['rounded', 'Rounded square'], ['square', 'Square'], ['original', 'Original shape']] },
          { key: 'size', type: 'range', label: 'Size', min: 0.02, max: 1.2, step: 0.005 },
          { key: 'corner', type: 'range', label: 'Corner rounding', min: 0, max: 1, step: 0.01, fmt: 'pct', show: (L) => L.shape === 'rounded' },
          { key: 'x', type: 'range', label: 'Position X', min: -1, max: 1, step: 0.005 },
          { key: 'y', type: 'range', label: 'Position Y', min: -1, max: 1, step: 0.005 },
          { key: 'rotation', type: 'range', label: 'Rotation', min: -180, max: 180, step: 1, fmt: 'deg' },
          { key: 'spin', type: 'range', label: 'Spin speed', min: -180, max: 180, step: 1, fmt: 'degs' },
          { key: 'brightness', type: 'range', label: 'Brightness', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'border', type: 'range', label: 'Border width', min: 0, max: 0.05, step: 0.001 },
          { key: 'borderColor', type: 'color', label: 'Border color', show: (L) => L.border > 0 },
          { key: 'shadow', type: 'range', label: 'Glow / shadow', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'shadowColor', type: 'color', label: 'Glow color', show: (L) => L.shadow > 0 },
          { key: 'fill', type: 'toggle', label: 'Fill behind transparent images', rerender: true },
          { key: 'fillColor', type: 'color', label: 'Fill color', show: (L) => L.fill },
          { key: 'placeholder', type: 'toggle', label: 'Show a vinyl record when no image is loaded' },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'pulse', type: 'range', label: 'Size pulse', min: 0, max: 0.5, step: 0.005, fmt: 'pct' },
          { key: 'flash', type: 'range', label: 'Brightness pulse', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'spinReact', type: 'range', label: 'Extra spin when loud', min: -360, max: 360, step: 1, fmt: 'deg' },
        ],
      },
    ],
    render(R, L, F) {
      const env = R.val(L.react);
      const asset = R.asset(L.source);
      const tex = asset ? R.image(asset, 0) : null;
      if (!tex && !L.placeholder && !L.fill && L.border <= 0) return;
      const angle = (L.rotation + L.spin * F.t + L.spinReact * R.integ(L.react)) * U.DEG;
      R.draw(
        R.program('image', FS),
        {
          uTex: tex ? tex.tex : R.black,
          uHasTex: tex ? 1 : 0,
          uTexSize: tex ? [tex.w, tex.h] : [1, 1],
          uCenter: R.pos(L.x, L.y),
          uSize: L.size,
          uShape: { original: 0, circle: 1, rounded: 2, square: 3 }[L.shape] || 0,
          uCorner: L.corner,
          uAngle: angle,
          uScale: 1 + L.pulse * env,
          uBorder: L.border,
          uBorderCol: R.col(L.borderColor),
          uShadow: L.shadow,
          uShadowCol: R.col(L.shadowColor),
          uBright: L.brightness * (1 + L.flash * env),
          uFillCol: R.col(L.fillColor),
          uFillAmt: L.fill ? 1 : 0,
          uPlaceholder: tex ? 0 : L.placeholder ? 1 : 0,
          uLabelCol: R.palCycle(0),
        },
        L.blend,
        L.opacity
      );
    },
  });
})(window.VG);
