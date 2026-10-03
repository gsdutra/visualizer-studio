'use strict';
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  // One shader for every spectrum style. Values come in through a float texture:
  // one row per series (ring layers), one texel per bar (or waveform point).
  const FS = `
uniform int uMode;
uniform sampler2D uData;
uniform float uN;
uniform int uK;
uniform vec2 uCenter;
uniform float uWidth;
uniform float uHeight;
uniform float uMinH;
uniform float uBarW;
uniform float uRound;
uniform float uRadius;
uniform float uRot;
uniform int uMirror;
uniform int uDir;
uniform vec3 uColA;
uniform vec3 uColB;
uniform int uColMode;
uniform vec3 uLayerCol[6];
uniform float uThick;
uniform float uGlow;
uniform int uRingFill;
uniform float uWaveFill;

float val(float idx) {
  return texelFetch(uData, ivec2(int(clamp(idx, 0.0, uN - 1.0)), 0), 0).r;
}

vec3 colorAt(float u, float hf) {
  if (uColMode == 1) return mix(uColA, uColB, clamp(u, 0.0, 1.0));
  if (uColMode == 2) return mix(uColA, uColB, clamp(hf, 0.0, 1.0));
  return uColA;
}

float angleFromTop(vec2 p) {
  float a = atan(p.x, p.y) - uRot;
  return mod(a + PI, TAU) - PI;
}

void main() {
  vec2 p = P() - uCenter;
  float px = PX();
  float gw = 0.003 + 0.03 * uGlow;
  vec3 pc = vec3(0.0);
  float pa = 0.0;
  float best = 0.0;
  vec3 bestCol = vec3(0.0);
  float glow = 0.0;
  vec3 glowCol = vec3(0.0);

  if (uMode <= 1) {
    float cw = uWidth / uN;
    float i0 = floor((p.x + uWidth * 0.5) / cw);
    for (int k = -1; k <= 1; k++) {
      float idx = i0 + float(k);
      if (idx < 0.0 || idx >= uN) continue;
      float h = uMinH + val(idx) * uHeight;
      float cx = -uWidth * 0.5 + (idx + 0.5) * cw;
      float hw = 0.5 * uBarW * cw;
      vec2 q = vec2(p.x - cx, p.y);
      float d = uMode == 0
        ? sdRoundBox(q - vec2(0.0, h * 0.5), vec2(hw, h * 0.5), min(uRound * hw, h * 0.5))
        : sdRoundBox(q, vec2(hw, h), min(uRound * hw, h));
      float a = clamp(0.5 - d / px, 0.0, 1.0);
      vec3 c = colorAt((idx + 0.5) / uN, abs(p.y) / max(uMinH + uHeight, 1e-4));
      if (a > best) { best = a; bestCol = c; }
      float g = uGlow * exp(-max(d, 0.0) / gw);
      if (g > glow) { glow = g; glowCol = c; }
    }
    pc = bestCol * best;
    pa = best;
  } else if (uMode == 2) {
    float ang = angleFromTop(p);
    float span = uMirror == 1 ? PI : TAU;
    float u = uMirror == 1 ? abs(ang) / PI : (ang + PI) / TAU;
    float side = (uMirror == 1 && ang < 0.0) ? -1.0 : 1.0;
    float arc = span / uN;
    float i0 = floor(u * uN);
    for (int k = -1; k <= 1; k++) {
      float idx = i0 + float(k);
      if (uMirror == 1 && (idx < 0.0 || idx >= uN)) continue;
      float wi = mod(idx, uN);
      float len = uMinH + val(wi) * uHeight;
      float ac = uMirror == 1 ? side * (idx + 0.5) * arc : (idx + 0.5) * arc - PI;
      vec2 q = rot(ac + uRot) * p;
      float hw = 0.5 * uBarW * arc * uRadius;
      float y0 = uDir == 0 ? uRadius : (uDir == 1 ? max(uRadius - len, 0.0) : uRadius - len * 0.5);
      float y1 = uDir == 0 ? uRadius + len : (uDir == 1 ? uRadius : uRadius + len * 0.5);
      float hh = 0.5 * (y1 - y0);
      float d = sdRoundBox(q - vec2(0.0, y0 + hh), vec2(hw, hh), min(uRound * hw, hh));
      float a = clamp(0.5 - d / px, 0.0, 1.0);
      vec3 c = colorAt((wi + 0.5) / uN, abs(q.y - uRadius) / max(uMinH + uHeight, 1e-4));
      if (a > best) { best = a; bestCol = c; }
      float g = uGlow * exp(-max(d, 0.0) / gw);
      if (g > glow) { glow = g; glowCol = c; }
    }
    pc = bestCol * best;
    pa = best;
  } else if (uMode == 3) {
    float r = length(p);
    float ang = angleFromTop(p);
    float u = uMirror == 1 ? abs(ang) / PI : (ang + PI) / TAU;
    if (uMirror == 1) u = clamp(u, 0.5 / uN, 1.0 - 0.5 / uN);
    for (int k = 5; k >= 0; k--) {
      if (k >= uK) continue;
      float v = texture(uData, vec2(u, (float(k) + 0.5) / float(uK))).r;
      float rk = uRadius + uMinH + v * uHeight;
      float d = uRingFill == 1 ? max(r - rk, uRadius * 0.985 - r) : abs(r - rk) - uThick * 0.5;
      float a = clamp(0.5 - d / px, 0.0, 1.0);
      vec3 c = uLayerCol[k];
      pc = c * a + pc * (1.0 - a);
      pa = a + pa * (1.0 - a);
      float g = uGlow * exp(-max(d, 0.0) / gw) / float(uK);
      glow += g;
      glowCol += c * g;
    }
    glowCol = glow > 0.0 ? glowCol / glow : glowCol;
    glow = min(glow, 1.0);
  } else if (uMode == 4) {
    float u = (p.x + uWidth * 0.5) / uWidth;
    if (u >= 0.0 && u <= 1.0) {
      float du = 1.0 / uN;
      float y = texture(uData, vec2(u, 0.5)).r * uHeight;
      float y1 = texture(uData, vec2(min(u + du, 1.0), 0.5)).r * uHeight;
      float slope = (y1 - y) / (du * uWidth);
      float py = uMirror == 1 ? abs(p.y) : p.y;
      float yy = uMirror == 1 ? abs(y) : y;
      float d = abs(py - yy) / sqrt(1.0 + slope * slope) - uThick * 0.5;
      float edge = smoothstep(0.0, 0.015, u) * smoothstep(1.0, 0.985, u);
      float a = clamp(0.5 - d / px, 0.0, 1.0) * edge;
      vec3 c = colorAt(u, abs(y) / max(uHeight, 1e-4));
      float fillA = 0.0;
      if (uWaveFill > 0.0) {
        bool inside = uMirror == 1 ? (abs(p.y) <= yy) : ((p.y >= 0.0 && p.y <= y) || (p.y <= 0.0 && p.y >= y));
        fillA = inside ? uWaveFill * edge : 0.0;
      }
      float aa = max(a, fillA);
      pc = c * aa;
      pa = aa;
      glow = uGlow * exp(-max(d, 0.0) / gw) * edge;
      glowCol = c;
    }
  } else {
    float r = length(p);
    float ang = angleFromTop(p);
    float u = uMirror == 1 ? abs(ang) / PI : (ang + PI) / TAU;
    float v = texture(uData, vec2(u, 0.5)).r;
    float rr = uRadius + v * uHeight;
    float d = abs(r - rr) - uThick * 0.5;
    float a = clamp(0.5 - d / px, 0.0, 1.0);
    vec3 c = colorAt(u, abs(v));
    float fillA = 0.0;
    if (uWaveFill > 0.0) fillA = (r >= min(uRadius, rr) && r <= max(uRadius, rr)) ? uWaveFill : 0.0;
    float aa = max(a, fillA);
    pc = c * aa;
    pa = aa;
    glow = uGlow * exp(-max(d, 0.0) / gw);
    glowCol = c;
  }

  vec3 outc = pc + glowCol * glow * (1.0 - pa);
  float outa = clamp(pa + glow * (1.0 - pa), 0.0, 1.0);
  outColor = vec4(outc, outa) * uOpacity;
}`;

  const MODES = { bars: 0, mirror: 1, circle: 2, ring: 3, wave: 4, circlewave: 5 };
  const isCircle = (L) => L.mode === 'circle' || L.mode === 'ring' || L.mode === 'circlewave';
  const isLinear = (L) => L.mode === 'bars' || L.mode === 'mirror' || L.mode === 'wave';
  const isWave = (L) => L.mode === 'wave' || L.mode === 'circlewave';
  const isBars = (L) => !isWave(L);

  const specBuf = new Float32Array(VG.analysis.NB);
  const scratch = new Map();
  const getBuf = (n) => {
    let b = scratch.get(n);
    if (!b) {
      b = new Float32Array(n);
      scratch.set(n, b);
    }
    return b;
  };

  const kernels = new Map();
  const smoothTmp = new Float32Array(1024);
  function gaussianSmooth(arr, n, sigma, wrap) {
    if (sigma < 0.15) return;
    const key = Math.round(sigma * 100);
    let k = kernels.get(key);
    if (!k) {
      const r = Math.ceil(sigma * 2.5);
      k = new Float32Array(2 * r + 1);
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
      for (let i = 0; i < k.length; i++) k[i] /= s;
      kernels.set(key, k);
    }
    const r = (k.length - 1) / 2;
    const tmp = smoothTmp;
    for (let i = 0; i < n; i++) tmp[i] = arr[i];
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) {
        let idx = i + j;
        if (wrap) idx = ((idx % n) + n) % n;
        else idx = idx < 0 ? -idx - 1 : idx >= n ? 2 * n - idx - 1 : idx;
        s += tmp[U.clamp(idx, 0, n - 1)] * k[j + r];
      }
      arr[i] = s;
    }
  }

  // Average + peak of the log-spectrum between two band edges.
  function rangeValue(spec, e0, e1) {
    const NB = spec.length;
    if (e1 - e0 < 1) {
      const c = U.clamp((e0 + e1) * 0.5 - 0.5, 0, NB - 1);
      const i = Math.floor(c);
      const f = c - i;
      return spec[i] * (1 - f) + spec[Math.min(NB - 1, i + 1)] * f;
    }
    let s = 0;
    let w = 0;
    let mx = 0;
    const b0 = Math.max(0, Math.floor(e0));
    const b1 = Math.min(NB, Math.ceil(e1));
    for (let b = b0; b < b1; b++) {
      const ov = Math.min(e1, b + 1) - Math.max(e0, b);
      if (ov > 0) {
        s += spec[b] * ov;
        w += ov;
        if (spec[b] > mx) mx = spec[b];
      }
    }
    return w > 0 ? 0.5 * (s / w) + 0.5 * mx : 0;
  }

  function computeBars(A, L, t, N, out, wrap) {
    A.spectrumAt(Math.max(0, t), specBuf, L.release);
    const lo = U.clamp(L.minHz, 20, 19000);
    const hi = U.clamp(L.maxHz, lo * 1.25, 20000);
    const ratio = hi / lo;
    let e0 = A.bandOf(lo) + 0.5;
    for (let j = 0; j < N; j++) {
      const e1 = A.bandOf(lo * Math.pow(ratio, (j + 1) / N)) + 0.5;
      out[j] = rangeValue(specBuf, e0, e1);
      e0 = e1;
    }
    if (L.smooth > 0.001) gaussianSmooth(out, N, L.smooth * 2.5, wrap);
    const floor = U.clamp(L.floor, 0, 0.9);
    for (let j = 0; j < N; j++) {
      let v = (out[j] - floor) / (1 - floor);
      v = v <= 0 ? 0 : Math.pow(v, L.curve) * L.gain * (1 + L.tilt * (j / N));
      out[j] = Math.min(v, 1.3);
    }
  }

  VG.registerLayer({
    type: 'spectrum',
    upright: true,
    label: 'Spectrum',
    icon: 'spectrum',
    blurb: 'Audio bars, circular spectrum, layered ring or waveform.',
    layout: ['x', 'y', 'width', 'height', 'radius'],
    defaults: {
      mode: 'bars',
      bars: 64,
      minHz: 35,
      maxHz: 16000,
      release: 0.12,
      smooth: 0.35,
      gain: 1,
      curve: 1.4,
      floor: 0.1,
      tilt: 0.3,
      height: 0.3,
      minHeight: 0.006,
      barWidth: 0.7,
      round: 0,
      x: 0,
      y: -0.05,
      width: 0.8,
      radius: 0.2,
      rotation: 0,
      mirror: true,
      direction: 'out',
      layers: 4,
      layerSpread: 0.12,
      layerDelay: 0.035,
      ringFill: true,
      thickness: 0.004,
      window: 40,
      stabilize: true,
      waveFill: 0,
      colorMode: 'single',
      color: 'p4',
      color2: 'p1',
      glow: 0,
      react: B('bass', { release: 0.15 }),
      pulse: 0,
    },
    controls: [
      {
        group: 'Spectrum',
        items: [
          {
            key: 'mode',
            type: 'select',
            label: 'Style',
            rerender: true,
            options: [
              ['bars', 'Bars'],
              ['mirror', 'Mirrored bars (up & down)'],
              ['circle', 'Circular bars'],
              ['ring', 'Layered ring (Trap Nation style)'],
              ['wave', 'Waveform line'],
              ['circlewave', 'Circular waveform'],
            ],
          },
          { key: 'bars', type: 'range', label: (L) => (L.mode === 'ring' ? 'Detail (points)' : 'Number of bars'), min: 8, max: 256, step: 1, fmt: 'int', show: isBars },
          { key: 'minHz', type: 'range', label: 'Lowest frequency', min: 20, max: 2000, step: 1, fmt: 'hz', log: true, show: isBars },
          { key: 'maxHz', type: 'range', label: 'Highest frequency', min: 500, max: 20000, step: 10, fmt: 'hz', log: true, show: isBars },
          { key: 'release', type: 'range', label: 'Fall smoothness', min: 0, max: 0.6, step: 0.005, fmt: 's', show: isBars },
          { key: 'smooth', type: 'range', label: (L) => (isWave(L) ? 'Line smoothing' : 'Neighbour smoothing'), min: 0, max: 1, step: 0.01, fmt: 'pct' },
          { key: 'gain', type: 'range', label: 'Sensitivity', min: 0, max: 3, step: 0.01, fmt: 'x' },
          { key: 'curve', type: 'range', label: 'Contrast', min: 0.5, max: 4, step: 0.05, fmt: 'x', show: isBars },
          { key: 'floor', type: 'range', label: 'Noise floor', min: 0, max: 0.8, step: 0.01, fmt: 'pct', show: isBars },
          { key: 'tilt', type: 'range', label: 'Treble boost', min: 0, max: 2, step: 0.01, fmt: 'pct', show: isBars },
          { key: 'window', type: 'range', label: 'Time window', min: 5, max: 200, step: 1, fmt: 'ms', show: isWave },
          { key: 'stabilize', type: 'toggle', label: 'Stabilize (oscilloscope trigger)', show: isWave },
        ],
      },
      {
        group: 'Shape & position',
        items: [
          { key: 'x', type: 'range', label: 'Position X', min: -1, max: 1, step: 0.005 },
          { key: 'y', type: 'range', label: 'Position Y', min: -1, max: 1, step: 0.005 },
          { key: 'width', type: 'range', label: 'Width (of frame)', min: 0.05, max: 1, step: 0.005, fmt: 'pct', show: isLinear },
          { key: 'radius', type: 'range', label: 'Radius', min: 0, max: 0.6, step: 0.002, show: isCircle },
          { key: 'height', type: 'range', label: (L) => (isWave(L) ? 'Amplitude' : 'Max length'), min: 0, max: 0.8, step: 0.002 },
          { key: 'minHeight', type: 'range', label: 'Minimum length', min: 0, max: 0.05, step: 0.001, show: isBars },
          { key: 'barWidth', type: 'range', label: 'Bar thickness', min: 0.05, max: 1, step: 0.01, fmt: 'pct', show: (L) => ['bars', 'mirror', 'circle'].includes(L.mode) },
          { key: 'round', type: 'range', label: 'Rounded ends', min: 0, max: 1, step: 0.01, fmt: 'pct', show: (L) => ['bars', 'mirror', 'circle'].includes(L.mode) },
          { key: 'direction', type: 'select', label: 'Bars grow', options: [['out', 'Outward'], ['in', 'Inward'], ['both', 'Both ways']], show: (L) => L.mode === 'circle' },
          { key: 'mirror', type: 'toggle', label: (L) => (L.mode === 'wave' ? 'Mirror up/down' : 'Mirror left/right (symmetric)'), show: (L) => isCircle(L) || L.mode === 'wave' },
          { key: 'rotation', type: 'range', label: 'Rotation', min: -180, max: 180, step: 1, fmt: 'deg', show: isCircle },
          { key: 'layers', type: 'range', label: 'Layers', min: 1, max: 6, step: 1, fmt: 'int', show: (L) => L.mode === 'ring' },
          { key: 'layerSpread', type: 'range', label: 'Layer size step', min: 0, max: 0.6, step: 0.01, fmt: 'pct', show: (L) => L.mode === 'ring' },
          { key: 'layerDelay', type: 'range', label: 'Layer echo delay', min: 0, max: 0.15, step: 0.005, fmt: 's', show: (L) => L.mode === 'ring' },
          { key: 'ringFill', type: 'toggle', label: 'Filled (off = outlines)', show: (L) => L.mode === 'ring' },
          { key: 'thickness', type: 'range', label: 'Line thickness', min: 0.0005, max: 0.03, step: 0.0005, show: (L) => isWave(L) || (L.mode === 'ring' && !L.ringFill) },
          { key: 'waveFill', type: 'range', label: 'Fill under the line', min: 0, max: 1, step: 0.01, fmt: 'pct', show: isWave },
        ],
      },
      {
        group: 'Color',
        items: [
          { key: 'colorMode', type: 'select', label: (L) => (L.mode === 'ring' ? 'Back layers' : 'Coloring'), rerender: true, options: [['single', 'Single color'], ['gradient', 'Gradient across'], ['height', 'Gradient by height'], ['palette', 'Palette (ring layers)']] },
          { key: 'color', type: 'color', label: (L) => (L.mode === 'ring' ? 'Front layer color' : 'Color') },
          { key: 'color2', type: 'color', label: 'Second color', show: (L) => L.colorMode === 'gradient' || L.colorMode === 'height' },
          { key: 'glow', type: 'range', label: 'Halo', min: 0, max: 2, step: 0.01, fmt: 'pct' },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Pulse listens to' },
          { key: 'pulse', type: 'range', label: (L) => (isCircle(L) ? 'Radius pulse' : 'Height pulse'), min: 0, max: 1, step: 0.005, fmt: 'pct' },
        ],
      },
    ],
    render(R, L, F) {
      const A = F.analysis;
      const mode = MODES[L.mode] != null ? MODES[L.mode] : 0;
      const env = R.val(L.react);
      const pulse = 1 + L.pulse * env;
      let N;
      let K = 1;
      let data;
      if (mode >= 4) {
        N = 512;
        data = getBuf(N);
        A.waveformAt(F.t, Math.max(5, L.window) / 1000, N, data, L.stabilize);
        if (L.smooth > 0.001) gaussianSmooth(data, N, L.smooth * 6, false);
        for (let i = 0; i < N; i++) data[i] *= L.gain;
        if (mode === 5 && !L.mirror) {
          for (let i = 0; i < N; i++) data[i] *= Math.min(1, Math.min(i, N - 1 - i) / (N * 0.06));
        }
      } else {
        N = U.clamp(Math.round(L.bars), 4, 256);
        K = mode === 3 ? U.clamp(L.layers | 0, 1, 6) : 1;
        data = getBuf(N * K);
        const wrap = mode >= 2 && !L.mirror;
        for (let k = 0; k < K; k++) {
          const row = data.subarray(k * N, (k + 1) * N);
          computeBars(A, L, F.t - (mode === 3 ? k * L.layerDelay : 0), N, row, wrap);
          if (k > 0) {
            // Back layers are bigger (and pushed out a little) so their colors peek out
            // around the front layer, like stacked outlines.
            const m = 1 + k * L.layerSpread;
            const off = k * L.layerSpread * 0.35;
            for (let j = 0; j < N; j++) row[j] = row[j] * m + off;
          }
        }
      }
      const tex = R.dataTexture('spec:' + L.id + ':' + N + 'x' + K, N, K, data);
      const layerCols = new Float32Array(18);
      const front = R.col(L.color);
      for (let k = 0; k < 6; k++) {
        let c;
        if (k === 0) c = front;
        else if (L.colorMode === 'palette') c = R.palCycle(k - 1);
        else if (L.colorMode === 'gradient' || L.colorMode === 'height') {
          const b = R.col(L.color2);
          const f = k / Math.max(1, K - 1);
          c = [U.lerp(front[0], b[0], f), U.lerp(front[1], b[1], f), U.lerp(front[2], b[2], f)];
        } else {
          const f = 1 - 0.18 * k;
          c = [front[0] * f, front[1] * f, front[2] * f];
        }
        layerCols.set(c, k * 3);
      }
      const center = R.pos(L.x, L.y);
      const linearH = mode <= 1 || mode === 4;
      R.draw(
        R.program('spectrum', FS),
        {
          uMode: mode,
          uData: tex,
          uN: N,
          uK: K,
          uCenter: center,
          uWidth: L.width * 2 * R.half[0],
          uHeight: L.height * (linearH ? pulse : 1),
          uMinH: L.minHeight,
          uBarW: L.barWidth,
          uRound: L.round,
          uRadius: L.radius * pulse,
          uRot: L.rotation * U.DEG,
          uMirror: L.mirror ? 1 : 0,
          uDir: { out: 0, in: 1, both: 2 }[L.direction] || 0,
          uColA: front,
          uColB: R.col(L.color2),
          uColMode: { gradient: 1, height: 2 }[L.colorMode] || 0,
          uLayerCol: layerCols,
          uThick: L.thickness,
          uGlow: L.glow,
          uRingFill: L.ringFill ? 1 : 0,
          uWaveFill: L.waveFill,
        },
        L.blend,
        L.opacity
      );
    },
  });
})(window.VG);
