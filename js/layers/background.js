'use strict';
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  const FS = `
uniform int uMode;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uThree;
uniform float uAngle;
uniform vec2 uCenter;
uniform float uRadius;
uniform sampler2D uTex;
uniform int uHasTex;
uniform vec2 uTexSize;
uniform float uZoom;
uniform vec2 uPan;
uniform float uBright;
uniform float uSat;
uniform vec3 uTint;
uniform float uTintAmt;

vec3 grad(float t) {
  t = clamp(t, 0.0, 1.0);
  if (uThree > 0.5) return t < 0.5 ? mix(uC1, uC2, t * 2.0) : mix(uC2, uC3, t * 2.0 - 1.0);
  return mix(uC1, uC2, t);
}

void main() {
  vec2 p = P();
  vec2 h = HALF();
  vec3 col;
  if (uMode == 3 && uHasTex == 1) {
    float ia = uTexSize.x / uTexSize.y;
    float fa = h.x / h.y;
    vec2 q = (p - uPan) / uZoom;
    vec2 uv;
    if (ia > fa) uv = vec2(q.x / (2.0 * h.y * ia), q.y / (2.0 * h.y)) + 0.5;
    else uv = vec2(q.x / (2.0 * h.x), q.y * ia / (2.0 * h.x)) + 0.5;
    uv.y = 1.0 - uv.y;
    col = texture(uTex, uv).rgb;
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, uSat);
    col = mix(col, uTint * (0.2 + 1.4 * l), uTintAmt);
  } else if (uMode == 1) {
    vec2 d = vec2(sin(uAngle), cos(uAngle));
    float ext = abs(d.x) * h.x + abs(d.y) * h.y;
    col = grad(0.5 - dot(p, d) / (2.0 * ext));
  } else if (uMode == 2 || uMode == 3) {
    col = grad(smoothstep(0.0, 1.0, length(p - uCenter) / max(uRadius, 1e-3)));
  } else {
    col = uC1;
  }
  outColor = vec4(col * uBright, 1.0) * uOpacity;
}`;

  const isImage = (L) => L.mode === 'image';
  const isGrad = (L) => L.mode === 'linear' || L.mode === 'radial' || L.mode === 'image';

  VG.registerLayer({
    type: 'background',
    upright: true,
    label: 'Background',
    icon: 'bg',
    blurb: 'Solid color, gradient, or an image (cover art, photo).',
    layout: ['cx', 'cy', 'radius'],
    defaults: {
      mode: 'radial',
      color1: '#1b1530',
      color2: '#05040a',
      color3: '#000000',
      three: false,
      angle: 0,
      cx: 0,
      cy: 0,
      radius: 1.2,
      source: 'background',
      blur: 0.2,
      brightness: 0.75,
      saturation: 1,
      tint: 'p1',
      tintAmount: 0,
      zoom: 1.05,
      drift: 0.3,
      driftSpeed: 1,
      react: B('bass', { release: 0.2 }),
      pulse: 0.03,
      flash: 0,
    },
    controls: [
      {
        group: 'Background',
        items: [
          { key: 'mode', type: 'select', label: 'Type', rerender: true, options: [['solid', 'Solid color'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient'], ['image', 'Image']] },
          { key: 'source', type: 'slot', label: 'Image', show: isImage },
          { key: 'blur', type: 'range', label: 'Blur', min: 0, max: 1, step: 0.01, fmt: 'pct', show: isImage },
          { key: 'brightness', type: 'range', label: 'Brightness', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'saturation', type: 'range', label: 'Saturation', min: 0, max: 2, step: 0.01, fmt: 'pct', show: isImage },
          { key: 'tint', type: 'color', label: 'Tint color', show: isImage },
          { key: 'tintAmount', type: 'range', label: 'Tint amount', min: 0, max: 1, step: 0.01, fmt: 'pct', show: isImage },
          { key: 'zoom', type: 'range', label: 'Zoom', min: 1, max: 2.5, step: 0.01, fmt: 'x', show: isImage },
          { key: 'drift', type: 'range', label: 'Slow camera drift', min: 0, max: 1, step: 0.01, fmt: 'pct', show: isImage },
          { key: 'driftSpeed', type: 'range', label: 'Drift speed', min: 0, max: 4, step: 0.05, fmt: 'x', show: isImage },
          { key: 'color1', type: 'color', label: 'Color 1', hint: (L) => (isImage(L) ? 'Used when no image is loaded' : '') },
          { key: 'color2', type: 'color', label: 'Color 2', show: isGrad },
          { key: 'three', type: 'toggle', label: 'Use a third color', rerender: true, show: isGrad },
          { key: 'color3', type: 'color', label: 'Color 3', show: (L) => isGrad(L) && L.three },
          { key: 'angle', type: 'range', label: 'Angle', min: 0, max: 360, step: 1, fmt: 'deg', show: (L) => L.mode === 'linear' },
          { key: 'cx', type: 'range', label: 'Center X', min: -1, max: 1, step: 0.01, show: (L) => L.mode === 'radial' || isImage(L) },
          { key: 'cy', type: 'range', label: 'Center Y', min: -1, max: 1, step: 0.01, show: (L) => L.mode === 'radial' || isImage(L) },
          { key: 'radius', type: 'range', label: 'Radius', min: 0.1, max: 3, step: 0.01, show: (L) => L.mode === 'radial' || isImage(L) },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'pulse', type: 'range', label: 'Zoom pulse', min: 0, max: 0.3, step: 0.005, fmt: 'pct', show: isImage },
          { key: 'flash', type: 'range', label: 'Brightness pulse', min: 0, max: 2, step: 0.01, fmt: 'pct' },
        ],
      },
    ],
    render(R, L) {
      const env = R.val(L.react);
      const tex = isImage(L) ? R.image(R.asset(L.source), L.blur) : null;
      const w = R.wander(L, 0, R.F.t * 0.35 * L.driftSpeed);
      const panAmt = 0.06 * L.drift;
      let zoom = Math.max(L.zoom, 1 + panAmt * 2.4) * (1 + L.pulse * env);
      if (tex && R.turning) {
        // A turning photo has to cover the whole circle the frame sweeps through.
        const [hx, hy] = R.half;
        const ia = tex.w / tex.h;
        const minExt = ia > hx / hy ? Math.min(hy * ia, hy) : Math.min(hx, hx / ia);
        zoom = Math.max(zoom, (Math.hypot(hx, hy) + panAmt * 1.42) / minExt);
      }
      const mode = { solid: 0, linear: 1, radial: 2, image: 3 }[L.mode] || 0;
      R.draw(
        R.program('background', FS),
        {
          uMode: mode,
          uC1: R.col(L.color1),
          uC2: R.col(L.color2),
          uC3: R.col(L.color3),
          uThree: L.three ? 1 : 0,
          uAngle: L.angle * U.DEG,
          uCenter: R.pos(L.cx, L.cy),
          uRadius: L.radius,
          uTex: tex ? tex.tex : R.black,
          uHasTex: tex ? 1 : 0,
          uTexSize: tex ? [tex.w, tex.h] : [1, 1],
          uZoom: zoom,
          uPan: [w[0] * panAmt, w[1] * panAmt],
          uBright: L.brightness * (1 + L.flash * env),
          uSat: L.saturation,
          uTint: R.col(L.tint),
          uTintAmt: L.tintAmount,
        },
        L.blend,
        L.opacity
      );
    },
  });
})(window.VG);
