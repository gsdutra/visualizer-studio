'use strict';
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  const FS = `
uniform int uCount;
uniform vec2 uPos[8];
uniform float uRad[8];
uniform vec3 uCol[8];
uniform float uInt[8];
uniform int uMesh;
void main() {
  vec2 p = P();
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    vec2 d = p - uPos[i];
    float r = max(uRad[i], 1e-3);
    float q = dot(d, d) / (r * r);
    if (uMesh == 1) {
      float w = 1.0 / pow(q + 0.04, 1.6);
      acc += uCol[i] * uInt[i] * w;
      wsum += w;
    } else {
      acc += uCol[i] * uInt[i] * exp(-q);
    }
  }
  vec3 col = uMesh == 1 ? acc / max(wsum, 1e-6) : acc;
  float a = uMesh == 1 ? 1.0 : clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  outColor = vec4(col, a) * uOpacity;
}`;

  const pos = new Float32Array(16);
  const rad = new Float32Array(8);
  const col = new Float32Array(24);
  const inten = new Float32Array(8);

  VG.registerLayer({
    type: 'blobs',
    label: 'Light blobs',
    icon: 'blobs',
    blurb: 'Big soft lights drifting around, or a flowing gradient (mesh mode).',
    layout: ['x', 'y', 'spread', 'size'],
    blend: 'screen',
    defaults: {
      mode: 'glow',
      count: 4,
      size: 0.45,
      intensity: 0.3,
      speed: 1,
      spread: 0.75,
      x: 0,
      y: 0,
      colorMode: 'palette',
      color: 'p1',
      react: B('bass', { release: 0.35 }),
      sizeReact: 0.25,
      glowReact: 0.6,
      speedReact: 0.5,
    },
    controls: [
      {
        group: 'Light blobs',
        items: [
          { key: 'mode', type: 'select', label: 'Style', options: [['glow', 'Glowing lights'], ['mesh', 'Flowing gradient (fills the screen)']] },
          { key: 'count', type: 'range', label: 'How many', min: 1, max: 8, step: 1, fmt: 'int' },
          { key: 'size', type: 'range', label: 'Size', min: 0.05, max: 1.5, step: 0.01 },
          { key: 'intensity', type: 'range', label: 'Brightness', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'speed', type: 'range', label: 'Speed', min: 0, max: 5, step: 0.05, fmt: 'x' },
          { key: 'spread', type: 'range', label: 'Area', min: 0, max: 1.5, step: 0.01 },
          { key: 'x', type: 'range', label: 'Center X', min: -1, max: 1, step: 0.01 },
          { key: 'y', type: 'range', label: 'Center Y', min: -1, max: 1, step: 0.01 },
          { key: 'colorMode', type: 'select', label: 'Colors', rerender: true, options: [['palette', 'Palette'], ['single', 'Single color']] },
          { key: 'color', type: 'color', label: 'Color', show: (L) => L.colorMode === 'single' },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'glowReact', type: 'range', label: 'Brightness pulse', min: 0, max: 3, step: 0.01, fmt: 'pct' },
          { key: 'sizeReact', type: 'range', label: 'Size pulse', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'speedReact', type: 'range', label: 'Moves faster when loud', min: 0, max: 5, step: 0.05, fmt: 'x' },
        ],
      },
    ],
    render(R, L) {
      const env = R.val(L.react);
      const n = U.clamp(L.count | 0, 1, 8);
      const tau = R.F.t * L.speed + L.speedReact * R.integ(L.react) * 2;
      const c = R.pos(L.x, L.y);
      for (let i = 0; i < n; i++) {
        const w = R.wander(L, i, tau);
        pos[i * 2] = c[0] + w[0] * L.spread * R.half[0];
        pos[i * 2 + 1] = c[1] + w[1] * L.spread * R.half[1];
        const r1 = R.rnd(L, i, 1);
        const r2 = R.rnd(L, i, 2);
        rad[i] = L.size * (0.65 + 0.7 * r1) * (1 + L.sizeReact * env);
        col.set(L.colorMode === 'palette' ? R.palCycle(i) : R.col(L.color), i * 3);
        inten[i] = L.intensity * (1 + L.glowReact * env * (0.5 + r2));
      }
      R.draw(
        R.program('blobs', FS),
        { uCount: n, uPos: pos, uRad: rad, uCol: col, uInt: inten, uMesh: L.mode === 'mesh' ? 1 : 0 },
        L.blend,
        L.opacity
      );
    },
  });
})(window.VG);
