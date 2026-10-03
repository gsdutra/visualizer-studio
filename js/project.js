'use strict';
// The project = everything that describes one video's look and output settings.
// "Looks" (presets) are the style part only: palette, layers and effects.
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;

  const PALETTES = {
    'Neon Night': ['#ff2bd6', '#7a5cff', '#22e1ff', '#ffffff', '#07040f'],
    Sunset: ['#ff5e62', '#ff9966', '#ffd86f', '#ffffff', '#1a0b1e'],
    Ice: ['#5ee7ff', '#3a7bd5', '#b8f2ff', '#ffffff', '#020814'],
    Toxic: ['#9dff00', '#00ff9c', '#00b3ff', '#f2ffe6', '#030a04'],
    Fire: ['#ff3d00', '#ff9100', '#ffd600', '#fff3e0', '#140400'],
    Vaporwave: ['#ff71ce', '#01cdfe', '#05ffa1', '#fffb96', '#1a0933'],
    Monochrome: ['#ffffff', '#bdbdbd', '#7a7a7a', '#ffffff', '#000000'],
    Ocean: ['#00c2a8', '#0077b6', '#90e0ef', '#e0fbfc', '#020c17'],
    Royal: ['#a855f7', '#6366f1', '#f0abfc', '#ffffff', '#0b0618'],
    'Blood Moon': ['#ff0033', '#8b0000', '#ff6f61', '#ffe5e5', '#0a0000'],
    'Pastel Dream': ['#ffb3c6', '#bde0fe', '#cdb4db', '#ffffff', '#1d1a2f'],
    Gold: ['#ffd166', '#f4a261', '#e9c46a', '#fff8e1', '#0d0a02'],
  };

  const FX_DEFAULTS = {
    bloom: { enabled: true, threshold: 0.6, intensity: 0.5, radius: 1, react: B('bass', { release: 0.25 }), reactAmount: 0.3 },
    camera: { shake: 0, shakeSpeed: 12, zoom: 0, rotate: 0, react: B('kick', { release: 0.18, threshold: 0.5 }), shakeReact: 0, zoomReact: 0, rotateReact: 0 },
    chroma: { amount: 0, react: B('kick', { release: 0.15, threshold: 0.5 }), reactAmount: 0 },
    glitch: { amount: 0, react: B('snare', { release: 0.12 }), reactAmount: 0 },
    flash: { color: '#ffffff', amount: 0, react: B('kick', { release: 0.12, threshold: 0.5 }), reactAmount: 0 },
    trails: { enabled: false, length: 0.25, zoom: 0.15, rotate: 0 },
    color: { brightness: 1, contrast: 1, saturation: 1, hue: 0, hueSpeed: 0 },
    vignette: { amount: 0.35, softness: 0.5 },
    grain: { amount: 0.03, size: 1.5 },
    scanlines: { amount: 0, count: 360 },
  };

  const EXPORT_DEFAULTS = {
    resolution: '1080',
    orientation: 'landscape',
    fps: 60,
    quality: 'standard',
    range: 'full',
    start: 0,
    end: 30,
    fadeIn: 0.5,
    fadeOut: 1.5,
    fadeAudio: false,
    saveToDisk: true,
  };

  // Effects panel, same control schema as layers. Keys are paths inside project.fx.
  const FX_CONTROLS = [
    {
      group: 'Glow',
      fx: 'bloom',
      items: [
        { key: 'enabled', type: 'toggle', label: 'Enabled', rerender: true },
        { key: 'intensity', type: 'range', label: 'Intensity', min: 0, max: 3, step: 0.01, fmt: 'pct', show: (o) => o.enabled },
        { key: 'threshold', type: 'range', label: 'Only bright parts above', min: 0, max: 1.5, step: 0.01, fmt: 'pct', show: (o) => o.enabled },
        { key: 'radius', type: 'range', label: 'Size', min: 0.3, max: 2.5, step: 0.01, fmt: 'x', show: (o) => o.enabled },
        { key: 'react', type: 'binding', label: 'Listens to', show: (o) => o.enabled },
        { key: 'reactAmount', type: 'range', label: 'Glow pulse', min: 0, max: 3, step: 0.01, fmt: 'pct', show: (o) => o.enabled },
      ],
    },
    {
      group: 'Camera shake & punch',
      fx: 'camera',
      items: [
        { key: 'react', type: 'binding', label: 'Listens to' },
        { key: 'shakeReact', type: 'range', label: 'Shake on hits', min: 0, max: 0.08, step: 0.001 },
        { key: 'zoomReact', type: 'range', label: 'Zoom punch', min: 0, max: 0.3, step: 0.002, fmt: 'pct' },
        { key: 'rotateReact', type: 'range', label: 'Rotation punch', min: 0, max: 10, step: 0.1, fmt: 'deg' },
        { key: 'shake', type: 'range', label: 'Constant shake', min: 0, max: 0.05, step: 0.001 },
        { key: 'shakeSpeed', type: 'range', label: 'Shake speed', min: 1, max: 40, step: 0.5, fmt: 'x' },
        { key: 'zoom', type: 'range', label: 'Base zoom', min: -0.2, max: 0.5, step: 0.005, fmt: 'pct' },
        { key: 'rotate', type: 'range', label: 'Base rotation', min: -45, max: 45, step: 0.5, fmt: 'deg' },
      ],
    },
    {
      group: 'RGB split (chromatic aberration)',
      fx: 'chroma',
      items: [
        { key: 'amount', type: 'range', label: 'Constant amount', min: 0, max: 0.03, step: 0.0005 },
        { key: 'react', type: 'binding', label: 'Listens to' },
        { key: 'reactAmount', type: 'range', label: 'Split on hits', min: 0, max: 0.05, step: 0.0005 },
      ],
    },
    {
      group: 'Glitch',
      fx: 'glitch',
      items: [
        { key: 'amount', type: 'range', label: 'Constant glitch', min: 0, max: 1, step: 0.01, fmt: 'pct' },
        { key: 'react', type: 'binding', label: 'Listens to' },
        { key: 'reactAmount', type: 'range', label: 'Glitch on hits', min: 0, max: 1, step: 0.01, fmt: 'pct' },
      ],
    },
    {
      group: 'Flash / strobe',
      fx: 'flash',
      items: [
        { key: 'color', type: 'color', label: 'Color' },
        { key: 'react', type: 'binding', label: 'Listens to' },
        { key: 'reactAmount', type: 'range', label: 'Flash on hits', min: 0, max: 1, step: 0.01, fmt: 'pct' },
        { key: 'amount', type: 'range', label: 'Constant wash', min: 0, max: 0.5, step: 0.005, fmt: 'pct' },
      ],
    },
    {
      group: 'Trails (motion echo)',
      fx: 'trails',
      items: [
        { key: 'enabled', type: 'toggle', label: 'Enabled', rerender: true },
        { key: 'length', type: 'range', label: 'Trail length', min: 0.02, max: 2, step: 0.01, fmt: 's', show: (o) => o.enabled },
        { key: 'zoom', type: 'range', label: 'Zoom drift (tunnel feel)', min: -1, max: 1, step: 0.01, show: (o) => o.enabled },
        { key: 'rotate', type: 'range', label: 'Rotation drift', min: -90, max: 90, step: 1, fmt: 'degs', show: (o) => o.enabled },
      ],
    },
    {
      group: 'Color grading',
      fx: 'color',
      items: [
        { key: 'brightness', type: 'range', label: 'Brightness', min: 0.2, max: 2, step: 0.01, fmt: 'pct' },
        { key: 'contrast', type: 'range', label: 'Contrast', min: 0.5, max: 1.8, step: 0.01, fmt: 'pct' },
        { key: 'saturation', type: 'range', label: 'Saturation', min: 0, max: 2, step: 0.01, fmt: 'pct' },
        { key: 'hue', type: 'range', label: 'Hue shift', min: -180, max: 180, step: 1, fmt: 'deg' },
        { key: 'hueSpeed', type: 'range', label: 'Hue cycling speed', min: -60, max: 60, step: 0.5, fmt: 'degs' },
      ],
    },
    {
      group: 'Vignette',
      fx: 'vignette',
      items: [
        { key: 'amount', type: 'range', label: 'Darken edges', min: 0, max: 1, step: 0.01, fmt: 'pct' },
        { key: 'softness', type: 'range', label: 'Softness', min: 0, max: 1, step: 0.01, fmt: 'pct' },
      ],
    },
    {
      group: 'Film grain',
      fx: 'grain',
      items: [
        { key: 'amount', type: 'range', label: 'Amount', min: 0, max: 0.2, step: 0.002, hint: () => 'A little grain hides banding after YouTube compression' },
        { key: 'size', type: 'range', label: 'Grain size', min: 1, max: 4, step: 0.1, fmt: 'x' },
      ],
    },
    {
      group: 'Scanlines (retro TV)',
      fx: 'scanlines',
      items: [
        { key: 'amount', type: 'range', label: 'Amount', min: 0, max: 0.6, step: 0.01, fmt: 'pct' },
        { key: 'count', type: 'range', label: 'Line count', min: 100, max: 1080, step: 10, fmt: 'int' },
      ],
    },
  ];

  function createLayer(type, over = {}) {
    const def = VG.layerTypes[type];
    if (!def) throw new Error('Unknown layer type: ' + type);
    const base = {
      id: U.uid(),
      type,
      name: def.label,
      enabled: true,
      opacity: 1,
      blend: def.blend || 'normal',
      seed: Math.floor(Math.random() * 1e6),
    };
    const L = U.withDefaults(Object.assign(base, U.clone(def.defaults)), over);
    if (L.react) L.react = U.withDefaults(B('none'), L.react);
    return L;
  }

  // Make a loaded/legacy project safe to use: fill any missing settings with defaults.
  function normalizeLayers(layers) {
    return (layers || [])
      .filter((L) => L && VG.layerTypes[L.type])
      .map((L) => {
        const def = VG.layerTypes[L.type];
        const base = { id: L.id || U.uid(), type: L.type, name: def.label, enabled: true, opacity: 1, blend: def.blend || 'normal', seed: 1 };
        const out = U.withDefaults(Object.assign(base, U.clone(def.defaults)), L);
        if (out.react) out.react = U.withDefaults(B('none'), out.react);
        return out;
      });
  }

  function normalizeFx(fx) {
    return U.withDefaults(FX_DEFAULTS, fx || {});
  }

  function defaultProject() {
    return {
      version: 1,
      look: '',
      palette: PALETTES['Neon Night'].slice(),
      seed: 1,
      layers: [],
      fx: U.clone(FX_DEFAULTS),
      export: U.clone(EXPORT_DEFAULTS),
      artist: 'Artist Name',
      title: 'Track Title',
      previewQuality: 'medium',
    };
  }

  function normalizeProject(p) {
    const d = defaultProject();
    if (!p || typeof p !== 'object') return d;
    return {
      version: 1,
      look: typeof p.look === 'string' ? p.look : '',
      palette: Array.isArray(p.palette) && p.palette.length >= 5 ? p.palette.slice(0, 5) : d.palette,
      seed: Number.isFinite(p.seed) ? p.seed : 1,
      layers: normalizeLayers(p.layers),
      fx: normalizeFx(p.fx),
      export: U.withDefaults(EXPORT_DEFAULTS, p.export),
      artist: typeof p.artist === 'string' ? p.artist : d.artist,
      title: typeof p.title === 'string' ? p.title : d.title,
      previewQuality: p.previewQuality || 'medium',
    };
  }

  // True when something in the look builds on previous frames (trails, echo tunnel), so a
  // still frame needs a short warm-up to look the same as during playback.
  function needsHistory(p) {
    return !!((p.fx && p.fx.trails && p.fx.trails.enabled) || p.layers.some((L) => L.enabled && L.type === 'zoom' && L.mode !== 'nested'));
  }

  VG.project = { PALETTES, FX_DEFAULTS, EXPORT_DEFAULTS, FX_CONTROLS, createLayer, normalizeLayers, normalizeFx, defaultProject, normalizeProject, needsHistory };
})(window.VG);
