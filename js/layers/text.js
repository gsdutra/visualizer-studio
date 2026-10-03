'use strict';
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  const FS = `
uniform sampler2D uTex;
uniform vec2 uSizeP;
uniform vec2 uPos;
uniform vec2 uAnchor;
uniform float uScale;
uniform float uAlpha;
void main() {
  vec2 p = P();
  vec2 uv = (p - uPos) / (uScale * uSizeP) + uAnchor;
  vec4 c = texture(uTex, vec2(uv.x, 1.0 - uv.y));
  float inBox = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  outColor = c * inBox * uAlpha * uOpacity;
}`;

  function fillTokens(s, project) {
    return String(s || '')
      .replace(/\{artist\}/gi, project.artist || '')
      .replace(/\{title\}/gi, project.title || '');
  }

  // Lay out the (up to) two lines of text on a 2D canvas at the renderer's resolution.
  function buildText(R, L, project) {
    const ppu = Math.min(R.w, R.h); // pixels per p-unit
    let l1 = fillTokens(L.line1, project);
    let l2 = fillTokens(L.line2, project);
    if (L.uppercase) {
      l1 = l1.toUpperCase();
      l2 = l2.toUpperCase();
    }
    if (!l1 && !l2) return null;
    const stack = VG.fonts.stack(L.font);
    const s1 = Math.max(4, L.size1 * ppu);
    const s2 = Math.max(4, L.size2 * ppu);
    const f1 = `${L.weight1} ${s1.toFixed(1)}px ${stack}`;
    const f2 = `${L.weight2} ${s2.toFixed(1)}px ${stack}`;
    const canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    const measure = (text, font, size) => {
      ctx.font = font;
      ctx.letterSpacing = `${(L.spacing * size).toFixed(2)}px`;
      const m = ctx.measureText(text);
      return {
        w: m.width,
        asc: m.fontBoundingBoxAscent || size * 0.8,
        desc: m.fontBoundingBoxDescent || size * 0.22,
      };
    };
    const m1 = l1 ? measure(l1, f1, s1) : { w: 0, asc: 0, desc: 0 };
    const m2 = l2 ? measure(l2, f2, s2) : { w: 0, asc: 0, desc: 0 };
    const gap = l1 && l2 ? L.gap * s1 : 0;
    const maxS = Math.max(l1 ? s1 : 0, l2 ? s2 : 0);
    const pad = Math.ceil((L.glow * 0.9 + L.outline + 0.08) * maxS) + 4;
    const textW = Math.max(m1.w, m2.w);
    const textH = m1.asc + m1.desc + gap + m2.asc + m2.desc;
    canvas.width = Math.min(8192, Math.ceil(textW + pad * 2));
    canvas.height = Math.min(4096, Math.ceil(textH + pad * 2));
    ctx = canvas.getContext('2d');
    const align = L.align === 'left' || L.align === 'right' ? L.align : 'center';
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    const xFor = (size) => {
      // letterSpacing adds space after the last glyph too; shift to keep text optically aligned
      const sp = L.spacing * size;
      if (align === 'left') return pad;
      if (align === 'right') return canvas.width - pad + sp;
      return canvas.width / 2 + sp / 2;
    };
    const draw = (text, font, size, color, y) => {
      ctx.font = font;
      ctx.letterSpacing = `${(L.spacing * size).toFixed(2)}px`;
      const x = xFor(size);
      if (L.glow > 0) {
        ctx.save();
        ctx.shadowColor = U.rgbToHex(R.col(L.glowColor));
        ctx.shadowBlur = L.glow * size * 0.6;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        ctx.fillText(text, x, y);
        ctx.restore();
      }
      if (L.outline > 0) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = L.outline * size;
        ctx.strokeStyle = U.rgbToHex(R.col(L.outlineColor));
        ctx.strokeText(text, x, y);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    let y = pad;
    if (l1) {
      y += m1.asc;
      draw(l1, f1, s1, U.rgbToHex(R.col(L.color1)), y);
      y += m1.desc + gap;
    }
    if (l2) {
      y += m2.asc;
      draw(l2, f2, s2, U.rgbToHex(R.col(L.color2)), y);
    }
    const ax = align === 'left' ? pad / canvas.width : align === 'right' ? 1 - pad / canvas.width : 0.5;
    return { canvas, wP: canvas.width / ppu, hP: canvas.height / ppu, ax };
  }

  VG.registerLayer({
    type: 'text',
    upright: true,
    label: 'Text',
    icon: 'text',
    blurb: 'Artist and track title (or any text). Use {artist} and {title}.',
    layout: ['x', 'y', 'size1', 'size2', 'align'],
    defaults: {
      line1: '{artist}',
      line2: '{title}',
      font: 'Avenir Next',
      weight1: 800,
      weight2: 400,
      size1: 0.07,
      size2: 0.042,
      uppercase: true,
      spacing: 0.04,
      gap: 0.25,
      align: 'center',
      x: 0,
      y: -0.6,
      color1: '#ffffff',
      color2: '#ffffff',
      glow: 0,
      glowColor: 'p1',
      outline: 0,
      outlineColor: '#000000',
      react: B('none'),
      pulse: 0,
      fadeReact: 0,
    },
    controls: [
      {
        group: 'Text',
        items: [
          { key: 'line1', type: 'text', label: 'Line 1', hint: () => '{artist} and {title} come from the Media tab' },
          { key: 'line2', type: 'text', label: 'Line 2' },
          { key: 'font', type: 'font', label: 'Font' },
          { key: 'weight1', type: 'select', label: 'Line 1 weight', options: [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Heavy'], [900, 'Black']], num: true },
          { key: 'weight2', type: 'select', label: 'Line 2 weight', options: [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Heavy'], [900, 'Black']], num: true },
          { key: 'size1', type: 'range', label: 'Line 1 size', min: 0.01, max: 0.3, step: 0.001 },
          { key: 'size2', type: 'range', label: 'Line 2 size', min: 0.01, max: 0.3, step: 0.001 },
          { key: 'uppercase', type: 'toggle', label: 'UPPERCASE' },
          { key: 'spacing', type: 'range', label: 'Letter spacing', min: -0.05, max: 0.6, step: 0.005, fmt: 'pct' },
          { key: 'gap', type: 'range', label: 'Line gap', min: -0.2, max: 1.5, step: 0.01, fmt: 'pct' },
          { key: 'align', type: 'select', label: 'Align', options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
          { key: 'x', type: 'range', label: 'Position X', min: -1, max: 1, step: 0.005 },
          { key: 'y', type: 'range', label: 'Position Y', min: -1, max: 1, step: 0.005 },
          { key: 'color1', type: 'color', label: 'Line 1 color' },
          { key: 'color2', type: 'color', label: 'Line 2 color' },
          { key: 'glow', type: 'range', label: 'Glow', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'glowColor', type: 'color', label: 'Glow color', show: (L) => L.glow > 0 },
          { key: 'outline', type: 'range', label: 'Outline', min: 0, max: 0.2, step: 0.002, fmt: 'pct' },
          { key: 'outlineColor', type: 'color', label: 'Outline color', show: (L) => L.outline > 0 },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'pulse', type: 'range', label: 'Size pulse', min: 0, max: 0.5, step: 0.005, fmt: 'pct' },
          { key: 'fadeReact', type: 'range', label: 'Only visible on hits', min: 0, max: 1, step: 0.01, fmt: 'pct' },
        ],
      },
    ],
    render(R, L, F) {
      const project = F.project;
      const key = [
        'text', L.id, R.w, R.h, VG.fonts.version, project.artist, project.title, L.line1, L.line2, L.font, L.weight1, L.weight2,
        L.size1, L.size2, L.uppercase, L.spacing, L.gap, L.align, R.col(L.color1), R.col(L.color2), L.glow, R.col(L.glowColor),
        L.outline, R.col(L.outlineColor),
      ].join('|');
      const t = R.canvasTexture(key, () => buildText(R, L, project));
      if (!t) return;
      const env = R.val(L.react);
      const alpha = U.lerp(1, U.clamp(env, 0, 1), L.fadeReact);
      R.draw(
        R.program('text', FS),
        {
          uTex: t.tex,
          uSizeP: [t.wP, t.hP],
          uPos: R.pos(L.x, L.y),
          uAnchor: [t.ax, 0.5],
          uScale: 1 + L.pulse * env,
          uAlpha: alpha,
        },
        L.blend,
        L.opacity
      );
    },
  });
})(window.VG);
