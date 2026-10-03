'use strict';
// Endless zoom — an effect layer: it transforms everything drawn below it.
//   • Echo tunnel: the picture keeps zooming out of the center and leaves fading echoes, so
//     new things keep pouring out of the middle (feedback: each frame builds on the last).
//   • Nested worlds: the frame holds a smaller copy of itself in a window, which holds another,
//     forever; the camera keeps diving in, so new copies keep appearing from the middle.
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  const FS_ECHO = `
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform vec2 uCenter;
uniform float uZoom;
uniform float uRot;
uniform float uDecay;
uniform float uHue;
uniform float uGain;
uniform float uAspect;
uniform int uMix;
void main() {
  vec2 c = vUv - uCenter;
  c.x *= uAspect;
  c = rot(-uRot) * c / uZoom;
  c.x /= uAspect;
  vec2 puv = c + uCenter;
  float inside = step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0);
  vec3 prev = texture(uPrev, puv).rgb * (inside * uDecay);
  if (abs(uHue) > 1e-5) prev = max(hueRotate(prev, uHue), 0.0);
  prev *= uGain;
  vec3 cur = texture(uCur, vUv).rgb;
  vec3 col;
  if (uMix == 0) col = max(cur, prev);
  else if (uMix == 1) col = cur + prev * (1.0 - clamp(cur, 0.0, 1.0));
  else col = cur + prev * 0.5;
  outColor = vec4(col, 1.0);
}`;

  const FS_PASS = `
uniform sampler2D uTex;
void main() { outColor = vec4(texture(uTex, vUv).rgb, 1.0) * uOpacity; }`;

  const FS_NESTED = `
uniform int uCopies;
uniform float uRatio;
uniform float uPhase;
uniform vec2 uCenter;
uniform int uWindow;
uniform float uWin;
uniform float uTwist;
uniform float uCopyHue;
uniform float uSpin;
uniform float uEdge;
uniform vec3 uEdgeCol;
uniform float uEdgeGlow;

float winSd(vec2 q, float r) {
  if (uWindow == 0) return length(q) - r;
  if (uWindow == 1) return sdNgon(q, r, 6.0);
  if (uWindow == 2) return sdNgon(q, r, 3.0);
  if (uWindow == 3) return sdNgon(q, r, 4.0);
  return sdNgon(rot(0.7853982) * q, r, 4.0);
}

void main() {
  vec2 p = P() - uCenter;
  vec2 h = HALF();
  float px = PX();
  float z0 = pow(uRatio, -uPhase);
  int level = 0;
  float edgeD = 1e9;
  float edgeS = 1.0;
  for (int k = 1; k <= 10; k++) {
    if (k > uCopies) break;
    float s = z0 * pow(uRatio, float(k - 1));
    float ang = uSpin + uTwist * (float(k) - uPhase);
    float d = winSd(rot(-ang) * p, uWin * s);
    if (abs(d) < edgeD) { edgeD = abs(d); edgeS = s; }
    if (d < 0.0) level = k; else break;
  }
  float s = z0 * pow(uRatio, float(level));
  float ang = uSpin + uTwist * (float(level) - uPhase);
  vec2 sp = uCenter + rot(-ang) * p / s;
  vec3 col = texture(uScene, sp / (2.0 * h) + 0.5).rgb;
  vec3 orig = texture(uScene, vUv).rgb;
  float hue = uCopyHue * (float(level) - uPhase);
  if (abs(hue) > 1e-4) col = max(hueRotate(col, hue), 0.0);
  if (uEdge > 0.0 && edgeD < 1e8) {
    float w = max(uEdge * edgeS, px * 0.75);
    float line = clamp(0.5 - (edgeD - w * 0.5) / px, 0.0, 1.0);
    float glow = uEdgeGlow * exp(-edgeD / (0.006 * edgeS + 2.0 * px));
    col = mix(col, uEdgeCol, line) + uEdgeCol * glow * (1.0 - line);
  }
  outColor = finishEffect(orig, vec4(col, 1.0));
}`;

  const WINDOWS = { circle: 0, hexagon: 1, triangle: 2, square: 3, diamond: 4 };
  // A window must cover the whole screen just before it loops; this is how much bigger its
  // corner radius must be than the screen-covering circle (1 / cos(π / sides)).
  const COVER = { circle: 1, hexagon: 1 / Math.cos(Math.PI / 6), triangle: 2, square: Math.SQRT2, diamond: Math.SQRT2 };
  const isNested = (L) => L.mode === 'nested';
  const isEcho = (L) => !isNested(L);

  function renderNested(R, L, F) {
    const ratio = U.clamp(L.ratio, 0.2, 0.8);
    const travel = L.speed * F.t + L.speedReact * R.integ(L.react);
    const phase = U.fract(travel / Math.log2(1 / ratio));
    const c = R.pos(L.x, L.y);
    const reach = Math.hypot(R.half[0] + Math.abs(c[0]), R.half[1] + Math.abs(c[1]));
    R.effect(
      R.program('zoom-nested', VG.GL.FS_EFFECT + FS_NESTED),
      {
        uCopies: U.clamp(L.copies | 0, 1, 10),
        uRatio: ratio,
        uPhase: phase,
        uCenter: c,
        uWindow: WINDOWS[L.window] != null ? WINDOWS[L.window] : 1,
        uWin: ratio * reach * (COVER[L.window] || 1) * 1.04,
        uTwist: L.twist * U.DEG,
        uCopyHue: L.copyHue * U.DEG,
        uSpin: (L.spin * F.t + L.spinReact * R.integ(L.react)) * U.DEG,
        uEdge: L.edge,
        uEdgeCol: R.col(L.edgeColor),
        uEdgeGlow: L.edgeGlow,
      },
      L
    );
  }

  VG.registerLayer({
    type: 'zoom',
    label: 'Endless zoom',
    icon: 'zoom',
    category: 'effect',
    blurb: 'Dives endlessly into the center, so new things keep appearing from the middle.',
    layout: ['x', 'y'],
    defaults: {
      mode: 'echo',
      speed: 0.45,
      x: 0,
      y: 0,
      spin: 0,
      react: B('bass', { release: 0.3 }),
      speedReact: 1.5,
      spinReact: 0,
      trail: 0.5,
      echoMix: 'max',
      echoGain: 0.95,
      hueDrift: 0,
      copies: 6,
      ratio: 0.5,
      window: 'hexagon',
      twist: 12,
      copyHue: 0,
      edge: 0.003,
      edgeColor: 'p4',
      edgeGlow: 0.5,
    },
    controls: [
      {
        group: 'Endless zoom',
        items: [
          { key: 'mode', type: 'select', label: 'Style', rerender: true, options: [['echo', 'Echo tunnel (trails pour out of the center)'], ['nested', 'Nested worlds (copies inside copies)']] },
          { key: 'speed', type: 'range', label: 'Zoom speed', min: -2, max: 3, step: 0.01, fmt: 'x', hint: () => 'How many times per second the picture doubles in size. Negative = zoom out.' },
          { key: 'x', type: 'range', label: 'Center X', min: -1, max: 1, step: 0.005 },
          { key: 'y', type: 'range', label: 'Center Y', min: -1, max: 1, step: 0.005 },
          { key: 'spin', type: 'range', label: 'Spin', min: -90, max: 90, step: 0.5, fmt: 'degs' },
          { key: 'trail', type: 'range', label: 'Echo length', min: 0.05, max: 3, step: 0.01, fmt: 's', show: isEcho },
          { key: 'echoMix', type: 'select', label: 'Echo blend', show: isEcho, options: [['max', 'Brightest wins (clean)'], ['screen', 'Screen (dreamy)'], ['add', 'Add (intense)']] },
          { key: 'echoGain', type: 'range', label: 'Echo brightness', min: 0.3, max: 1.2, step: 0.01, fmt: 'pct', show: isEcho },
          { key: 'hueDrift', type: 'range', label: 'Echoes shift color', min: -180, max: 180, step: 1, fmt: 'degs', show: isEcho },
          { key: 'window', type: 'select', label: 'Window shape', show: isNested, options: [['hexagon', 'Hexagon'], ['circle', 'Circle'], ['triangle', 'Triangle'], ['square', 'Square'], ['diamond', 'Diamond']] },
          { key: 'copies', type: 'range', label: 'Copies', min: 1, max: 10, step: 1, fmt: 'int', show: isNested },
          { key: 'ratio', type: 'range', label: 'Copy size', min: 0.25, max: 0.75, step: 0.01, fmt: 'pct', show: isNested },
          { key: 'twist', type: 'range', label: 'Twist per copy', min: -90, max: 90, step: 0.5, fmt: 'deg', show: isNested },
          { key: 'copyHue', type: 'range', label: 'Color shift per copy', min: -180, max: 180, step: 1, fmt: 'deg', show: isNested },
          { key: 'edge', type: 'range', label: 'Window outline', min: 0, max: 0.02, step: 0.0005, show: isNested },
          { key: 'edgeColor', type: 'color', label: 'Outline color', show: isNested },
          { key: 'edgeGlow', type: 'range', label: 'Outline glow', min: 0, max: 2, step: 0.01, fmt: 'pct', show: isNested },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'speedReact', type: 'range', label: 'Dives faster when loud', min: 0, max: 6, step: 0.05, fmt: 'x' },
          { key: 'spinReact', type: 'range', label: 'Extra spin when loud', min: -180, max: 180, step: 1, fmt: 'deg' },
        ],
      },
    ],
    render(R, L, F) {
      if (isNested(L)) {
        renderNested(R, L, F);
        return;
      }
      const env = R.val(L.react);
      const H = R.history(L);
      const dt = U.clamp(F.dt || 0, 0, 0.1);
      const rate = L.speed + L.speedReact * env;
      R.drawTo(H.b, R.program('zoom-echo', FS_ECHO), {
        uCur: R.scene.tex,
        uPrev: H.a.tex,
        uCenter: [0.5 + L.x * 0.5, 0.5 + L.y * 0.5],
        uZoom: Math.pow(2, rate * dt),
        uRot: (L.spin + L.spinReact * env) * U.DEG * dt,
        uDecay: H.valid && dt > 0 ? Math.exp(-dt / Math.max(0.02, L.trail)) : H.valid ? 1 : 0,
        uHue: L.hueDrift * U.DEG * dt,
        uGain: L.echoGain,
        uAspect: R.w / R.h,
        uMix: { max: 0, screen: 1, add: 2 }[L.echoMix] || 0,
      });
      const tmp = H.a;
      H.a = H.b;
      H.b = tmp;
      R.draw(R.program('zoom-pass', FS_PASS), { uTex: H.a.tex }, L.blend, L.opacity);
    },
  });
})(window.VG);
