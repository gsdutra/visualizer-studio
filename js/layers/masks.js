'use strict';
// Shape masks — an effect layer meant to sit on top: geometric shapes (filled or as outlines)
// act as windows, and each window shows a fragment of the video below it, transformed:
// mirrored, upside down, rotated, zoomed, taken from elsewhere, color-shifted or negative.
// On beats the shapes can snap-rotate and/or reshuffle what they show.
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  const FS = `
uniform int uCount;
uniform vec4 uA[16];
uniform vec4 uB[16];
uniform vec4 uC[16];
uniform vec4 uD[16];
uniform vec3 uCol[16];
uniform vec3 uTint[16];
uniform float uStroke;
uniform float uGlow;
uniform float uDim;

float shapeSd(vec2 q, float type, float r) {
  if (type < 0.5) return length(q) - r;
  if (type < 1.5) return sdNgon(q, r, 3.0);
  if (type < 2.5) return sdNgon(q, r, 4.0);
  if (type < 3.5) return sdNgon(rot(0.7853982) * q, r, 4.0);
  if (type < 4.5) return sdNgon(q, r, 6.0);
  if (type < 5.5) return sdStar(q, r, 5.0, 2.6);
  if (type < 6.5) return abs(q.y) - r;
  return sdNgon(q, r, 5.0);
}

void main() {
  vec2 p = P();
  vec2 h = HALF();
  float px = PX();
  vec4 acc = vec4(0.0, 0.0, 0.0, uDim);
  for (int i = 0; i < 16; i++) {
    if (i >= uCount) break;
    vec4 A = uA[i];
    vec4 S = uB[i];
    vec4 C = uC[i];
    float al = uD[i].x;
    if (al <= 0.001) continue;
    // Skip shapes that are nowhere near this pixel (bands cross the whole screen).
    if (abs(S.x - 6.0) > 0.5 && length(p - A.xy) > A.z * 1.15 + 0.05 + uGlow * 0.15) continue;
    vec2 q = rot(-A.w) * (p - A.xy);
    float d = shapeSd(q, S.x, A.z);
    float w = S.y;
    float region = w > 0.0 ? abs(d + w * 0.5) - w * 0.5 : d;
    float m = clamp(0.5 - region / px, 0.0, 1.0) * al;
    if (m > 0.0) {
      vec2 fq = q;
      float flags = C.z;
      if (mod(flags, 2.0) >= 1.0) fq.x = -fq.x;
      if (mod(floor(flags * 0.5), 2.0) >= 1.0) fq.y = -fq.y;
      fq = rot(S.z) * fq / S.w;
      vec2 sp = A.xy + rot(A.w) * fq + C.xy;
      vec3 frag = texture(uScene, sp / (2.0 * h) + 0.5).rgb;
      if (mod(floor(flags * 0.25), 2.0) >= 1.0) frag = vec3(1.0) - clamp(frag, 0.0, 1.0);
      if (mod(floor(flags * 0.125), 2.0) >= 1.0) {
        float l = dot(frag, vec3(0.299, 0.587, 0.114));
        frag = mix(frag, uTint[i] * (0.2 + 1.6 * l), 0.85);
      }
      if (abs(C.w) > 0.001) frag = max(hueRotate(frag, C.w), 0.0);
      acc = vec4(frag * m, m) + acc * (1.0 - m);
    }
    if (uStroke > 0.0) {
      float sd = w > 0.0 ? min(abs(d), abs(d + w)) : abs(d);
      float line = clamp(0.5 - (sd - uStroke * 0.5) / px, 0.0, 1.0) * al;
      vec3 sc = uCol[i];
      acc = vec4(sc * line, line) + acc * (1.0 - line);
      acc.rgb += sc * uGlow * al * exp(-sd / (0.004 + 0.02 * uGlow)) * (1.0 - line);
    }
  }
  outColor = finishEffect(texture(uScene, vUv).rgb, acc);
}`;

  const TYPE = { circle: 0, triangle: 1, square: 2, diamond: 3, hexagon: 4, star: 5, band: 6, pentagon: 7 };
  // Shapes used when "Shapes" is set to Mixed (each can be switched on/off).
  const MIX = [
    ['sTriangle', 'triangle', 'Triangles'],
    ['sSquare', 'square', 'Squares'],
    ['sPentagon', 'pentagon', 'Pentagons'],
    ['sCircle', 'circle', 'Circles'],
    ['sHexagon', 'hexagon', 'Hexagons'],
    ['sDiamond', 'diamond', 'Diamonds'],
    ['sStar', 'star', 'Stars'],
  ];
  const RIGHT = [Math.PI / 2, Math.PI, -Math.PI / 2];
  const uA = new Float32Array(64);
  const uB = new Float32Array(64);
  const uC = new Float32Array(64);
  const uD = new Float32Array(64);
  const uCol = new Float32Array(48);
  const uTint = new Float32Array(48);

  const isShards = (L) => L.composition === 'shards';
  const isPopups = (L) => L.composition === 'popups';
  const beats = (L) => L.beatMode !== 'calm';
  const snaps = (L) => L.beatMode === 'snap' || L.beatMode === 'both';

  VG.registerLayer({
    type: 'masks',
    label: 'Shape masks',
    icon: 'masks',
    category: 'effect',
    blurb: 'Geometric windows showing mirrored, flipped, rotated pieces of the video below. Best as the top layer.',
    layout: ['x', 'y', 'size', 'spread'],
    defaults: {
      composition: 'constellation',
      shape: 'mixed',
      sTriangle: true,
      sSquare: true,
      sPentagon: true,
      sCircle: true,
      sHexagon: true,
      sDiamond: false,
      sStar: false,
      style: 'mixed',
      count: 7,
      size: 0.2,
      minSize: 0.25,
      life: 3,
      outline: 0.03,
      spread: 0.8,
      x: 0,
      y: 0,
      rotation: 0,
      spin: 6,
      drift: 1,
      tMirror: true,
      tFlip: true,
      tRotate: true,
      tZoom: true,
      tOffset: true,
      tTint: true,
      tHue: false,
      tInvert: false,
      colorChance: 0.5,
      animate: 0.3,
      stroke: 0.002,
      strokePalette: true,
      strokeColor: 'p4',
      glow: 0.4,
      dim: 0,
      react: B('bass', { release: 0.2 }),
      pulse: 0.08,
      beatMode: 'calm',
      beat: B('kick', { release: 0.15, threshold: 0.5 }),
      snapAngle: 45,
      snapEase: 0.25,
    },
    controls: [
      {
        group: 'Composition',
        items: [
          {
            key: 'composition',
            type: 'select',
            label: 'Composition',
            rerender: true,
            options: [
              ['popups', 'Random pop-ups (psychedelic)'],
              ['constellation', 'Constellation (scattered shapes)'],
              ['concentric', 'Concentric (nested shapes)'],
              ['grid', 'Mosaic grid'],
              ['orbit', 'Orbit (circling the center)'],
              ['shards', 'Shards (broken-mirror bands)'],
            ],
          },
          {
            key: 'shape',
            type: 'select',
            label: 'Shapes',
            rerender: true,
            show: (L) => !isShards(L),
            options: [['mixed', 'Mixed'], ['triangle', 'Triangles'], ['square', 'Squares'], ['pentagon', 'Pentagons'], ['circle', 'Circles'], ['hexagon', 'Hexagons'], ['diamond', 'Diamonds'], ['star', 'Stars']],
          },
          ...MIX.map(([key, , label]) => ({ key, type: 'toggle', label: `Mix in ${label.toLowerCase()}`, show: (L) => !isShards(L) && L.shape === 'mixed' })),
          { key: 'style', type: 'select', label: 'Filled or outlines', show: (L) => !isShards(L), options: [['mixed', 'Mixed'], ['filled', 'Filled'], ['outline', 'Outlines only']] },
          { key: 'count', type: 'range', label: (L) => (isPopups(L) ? 'How many at once' : 'How many'), min: 1, max: 16, step: 1, fmt: 'int' },
          { key: 'size', type: 'range', label: (L) => (isShards(L) ? 'Band width' : isPopups(L) ? 'Biggest size' : 'Size'), min: 0.02, max: 1.5, step: 0.005 },
          { key: 'minSize', type: 'range', label: 'Smallest size (of the biggest)', min: 0.05, max: 1, step: 0.01, fmt: 'pct', show: isPopups },
          { key: 'life', type: 'range', label: 'How long each shape stays', min: 0.4, max: 12, step: 0.1, fmt: 's', show: isPopups },
          { key: 'outline', type: 'range', label: 'Outline thickness', min: 0.003, max: 0.25, step: 0.001, show: (L) => !isShards(L) && L.style !== 'filled' },
          { key: 'spread', type: 'range', label: (L) => (L.composition === 'orbit' ? 'Orbit size' : 'Spread'), min: 0, max: 1.5, step: 0.01, show: (L) => ['popups', 'constellation', 'orbit', 'shards'].includes(L.composition) },
          { key: 'x', type: 'range', label: 'Center X', min: -1, max: 1, step: 0.005 },
          { key: 'y', type: 'range', label: 'Center Y', min: -1, max: 1, step: 0.005 },
          { key: 'rotation', type: 'range', label: (L) => (isShards(L) ? 'Band angle' : 'Rotation'), min: -180, max: 180, step: 1, fmt: 'deg' },
          { key: 'spin', type: 'range', label: 'Spin', min: -90, max: 90, step: 0.5, fmt: 'degs' },
          { key: 'drift', type: 'range', label: 'Drift', min: 0, max: 4, step: 0.05, fmt: 'x', show: (L) => L.composition === 'constellation' },
        ],
      },
      {
        group: 'What appears inside',
        items: [
          { key: 'tMirror', type: 'toggle', label: 'Mirrored' },
          { key: 'tFlip', type: 'toggle', label: 'Upside down' },
          { key: 'tRotate', type: 'toggle', label: 'Rotated' },
          { key: 'tZoom', type: 'toggle', label: 'Zoomed in' },
          { key: 'tOffset', type: 'toggle', label: 'Taken from another spot' },
          { key: 'animate', type: 'range', label: 'Pieces slowly turn and breathe', min: 0, max: 1, step: 0.01, fmt: 'pct' },
          { key: 'tTint', type: 'toggle', label: 'Tinted with palette colors' },
          { key: 'tHue', type: 'toggle', label: 'Color shifted (any hue, psychedelic)' },
          { key: 'tInvert', type: 'toggle', label: 'Negative colors' },
          { key: 'colorChance', type: 'range', label: 'How many get a color change', min: 0, max: 1, step: 0.01, fmt: 'pct' },
        ],
      },
      {
        group: 'Edges',
        items: [
          { key: 'stroke', type: 'range', label: 'Edge line', min: 0, max: 0.015, step: 0.0005 },
          { key: 'strokePalette', type: 'toggle', label: 'Edge colors from the palette', rerender: true },
          { key: 'strokeColor', type: 'color', label: 'Edge color', show: (L) => !L.strokePalette },
          { key: 'glow', type: 'range', label: 'Edge glow', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'dim', type: 'range', label: 'Darken outside the shapes', min: 0, max: 1, step: 0.01, fmt: 'pct' },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Pulse listens to' },
          { key: 'pulse', type: 'range', label: 'Size pulse', min: 0, max: 1, step: 0.01, fmt: 'pct' },
          {
            key: 'beatMode',
            type: 'select',
            label: 'On beats',
            rerender: true,
            options: [
              ['calm', 'Calm (just drift)'],
              ['snap', 'Snap-rotate'],
              ['shuffle', 'Reshuffle what each shape shows'],
              ['both', 'Snap + reshuffle'],
            ],
          },
          { key: 'beat', type: 'binding', label: 'Beats come from', show: beats },
          { key: 'snapAngle', type: 'range', label: 'Snap angle', min: -180, max: 180, step: 5, fmt: 'deg', show: snaps },
          { key: 'snapEase', type: 'range', label: 'Snap smoothness (how long each turn takes)', min: 0.05, max: 2, step: 0.01, fmt: 's', show: snaps },
        ],
      },
    ],
    render(R, L, F) {
      const t = F.t;
      const n = U.clamp(L.count | 0, 1, 16);
      const pulse = 1 + L.pulse * R.val(L.react);
      const snapOn = snaps(L);
      const shuffleOn = L.beatMode === 'shuffle' || L.beatMode === 'both';
      // Smooth snap: every beat adds an eased turn; fast beats blend into continuous motion.
      const snap = snapOn ? R.A.easedCount(L.beat, t, L.snapEase) : 0;
      const sh = shuffleOn ? R.hits(L.beat).count : 0;
      const geo = [];
      if (L.tMirror) geo.push('mirror');
      if (L.tFlip) geo.push('flip');
      if (L.tRotate) geo.push('rotate');
      if (L.tZoom) geo.push('zoom');
      if (L.tOffset) geo.push('offset');
      const colorTricks = [];
      if (L.tTint) colorTricks.push('tint');
      if (L.tHue) colorTricks.push('hue');
      if (L.tInvert) colorTricks.push('invert');
      const mix = MIX.filter(([key]) => L[key]).map(([, s]) => s);
      if (!mix.length) mix.push('circle');
      const c = R.pos(L.x, L.y);
      const hx = R.half[0];
      const hy = R.half[1];
      const spin = (L.rotation + L.spin * t) * U.DEG;
      const seed = R.seedOf(L);
      const fixed = L.shape === 'mixed' ? null : L.shape;
      const pickShape = (v) => fixed || mix[Math.floor(v * mix.length) % mix.length];
      const cols = Math.max(1, Math.round(Math.sqrt((n * hx) / hy)));
      const rows = Math.max(1, Math.ceil(n / cols));
      for (let i = 0; i < n; i++) {
        const r = (k) => U.hash3(seed, i, k);
        let type = pickShape(r(1));
        let outlineW = L.style === 'filled' ? 0 : L.style === 'outline' ? L.outline : r(2) < 0.5 ? L.outline : 0;
        let x = c[0];
        let y = c[1];
        let size = L.size * pulse;
        let ang = spin;
        let fragRot = 0;
        let alpha = 1;
        let cycle = 0;
        let life = 0.5 + 0.5 * Math.sin(t * 0.45 + i * 1.7);
        if (L.composition === 'popups') {
          // Each window lives for a while at a random spot, fades out, and comes back
          // somewhere else as a different shape showing a different piece.
          const span = Math.max(0.4, L.life) * (0.7 + 0.6 * r(900));
          const ph = t / span + r(901);
          cycle = Math.floor(ph);
          life = ph - cycle;
          const fade = Math.min(0.3, 0.45 / span);
          alpha = U.smoothstep(0, fade, life) * (1 - U.smoothstep(1 - fade, 1, life));
          const q = (k) => U.hash3(seed + cycle * 7919, i, k);
          type = pickShape(q(1));
          const sz = L.minSize + (1 - L.minSize) * Math.pow(q(5), 1.4);
          outlineW = L.style === 'filled' ? 0 : L.style === 'outline' || q(2) < 0.5 ? L.outline * (0.5 + sz) : 0;
          x = c[0] + (q(3) * 2 - 1) * hx * L.spread;
          y = c[1] + (q(4) * 2 - 1) * hy * L.spread;
          size = L.size * sz * pulse * (0.9 + 0.1 * alpha + 0.12 * life);
          ang = q(6) * Math.PI * 2 + (q(7) - 0.5) * 2 * L.spin * U.DEG * life * span;
        } else if (L.composition === 'concentric') {
          if (!fixed) type = pickShape(U.hash3(seed, 0, 1));
          size = L.size * Math.pow(0.72, i) * pulse;
          ang = spin * (i % 2 ? -1 : 1) + i * 0.35;
        } else if (L.composition === 'grid') {
          const cw = (2 * hx) / cols;
          const ch = (2 * hy) / rows;
          x = -hx + cw * ((i % cols) + 0.5) + c[0];
          y = hy - ch * (Math.floor(i / cols) + 0.5) + c[1];
          size = Math.min(L.size, 0.46 * Math.min(cw, ch)) * pulse;
          ang = spin * (i % 2 ? -1 : 1);
        } else if (L.composition === 'orbit') {
          const oa = spin * 0.6 + (i / n) * Math.PI * 2;
          x = c[0] + Math.cos(oa) * L.spread * 0.42;
          y = c[1] + Math.sin(oa) * L.spread * 0.42;
          size = L.size * 0.55 * pulse;
          ang = spin - oa * 1.5;
        } else if (L.composition === 'shards') {
          type = 'band';
          const reach = Math.hypot(hx, hy);
          const off = (((i + 0.5) / n) * 2 - 1) * reach * 0.85 * L.spread;
          const dir = (L.rotation + (r(3) - 0.5) * 14 + L.spin * t * 0.2) * U.DEG;
          x = c[0] - Math.sin(dir) * off;
          y = c[1] + Math.cos(dir) * off;
          size = L.size * 0.3 * (0.6 + 0.8 * r(4)) * pulse;
          ang = dir;
        } else {
          const w = R.wander(L, i, t * L.drift * 0.35);
          x = c[0] + ((r(3) - 0.5) * 1.7 * L.spread + w[0] * 0.18) * hx;
          y = c[1] + ((r(4) - 0.5) * 1.7 * L.spread + w[1] * 0.18) * hy;
          size = L.size * (0.4 + 0.75 * r(5)) * pulse;
          ang = spin * (r(6) < 0.5 ? -1 : 1) + r(6) * Math.PI * 2;
        }
        if (snapOn) {
          const step = L.snapAngle * U.DEG * snap * (i % 2 ? -1 : 1);
          if (type === 'band') fragRot += step;
          else ang += step;
        }
        // What this window shows (new for every pop-up, and reshuffled on beats when enabled).
        let flags = 0;
        let zoom = 1;
        let ox = 0;
        let oy = 0;
        let hue = 0;
        const g = (k) => U.hash3(seed + k + cycle * 131, i, sh);
        const pick = geo.length ? geo[Math.floor(g(17) * geo.length) % geo.length] : null;
        if (pick === 'mirror') flags |= 1;
        else if (pick === 'flip') flags |= 2;
        else if (pick === 'rotate') fragRot += RIGHT[Math.floor(g(29) * 3) % 3];
        else if (pick === 'zoom') zoom = 1.5 + g(29) * 1.3;
        else if (pick === 'offset') {
          ox = (g(29) - 0.5) * 0.7;
          oy = (g(31) - 0.5) * 0.5;
        }
        if (geo.length > 1 && g(41) < 0.3) flags |= flags & 1 ? 2 : 1;
        // Pieces slowly turn and breathe inside their windows.
        const sway = isPopups(L) ? (life - 0.5) * 2 * (g(43) < 0.5 ? -1 : 1) : Math.sin(t * 0.45 + i * 1.7);
        fragRot += L.animate * sway * 0.6;
        zoom *= 1 + L.animate * 0.2 * (isPopups(L) ? life : 0.5 + 0.5 * Math.sin(t * 0.6 + i));
        if (colorTricks.length && g(53) < L.colorChance) {
          const ct = colorTricks[Math.floor(g(59) * colorTricks.length) % colorTricks.length];
          if (ct === 'invert') flags |= 4;
          else if (ct === 'tint') flags |= 8;
          else hue = (60 + g(61) * 240) * U.DEG;
        }
        uA.set([x, y, size, ang], i * 4);
        uB.set([TYPE[type] != null ? TYPE[type] : 0, type === 'band' ? 0 : outlineW, fragRot, zoom], i * 4);
        uC.set([ox, oy, flags, hue], i * 4);
        uD.set([alpha, 0, 0, 0], i * 4);
        uCol.set(L.strokePalette ? R.palCycle(i) : R.col(L.strokeColor), i * 3);
        uTint.set(R.palCycle(i + 1 + Math.floor(g(67) * 3)), i * 3);
      }
      R.effect(
        R.program('masks', VG.GL.FS_EFFECT + FS),
        { uCount: n, uA, uB, uC, uD, uCol, uTint, uStroke: L.stroke, uGlow: L.glow, uDim: L.dim },
        L
      );
    },
  });
})(window.VG);
