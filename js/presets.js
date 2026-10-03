'use strict';
// Built-in looks. A look is only a starting point: every layer and effect stays editable.
// Positions are frame coordinates (-1..1); `v` holds the layout used for vertical (9:16) videos.
(function (VG) {
  const B = VG.analysis.binding;

  // Liquid Aurora — Aurora Chill's flowing light mixed with Liquid Neon's glowing liquid, with
  // the glow pulsing on the bass. Each variant adds its own endless zoom, and a shape-mask
  // composition sits on top.
  const LA = 'Liquid Aurora · your project';
  const LA_PALETTE = ['#7b5cff', '#ff4fd8', '#36e2d4', '#8fb8ff', '#07051a'];
  const laGradient = () => ({ type: 'blobs', name: 'Aurora gradient', mode: 'mesh', blend: 'normal', count: 5, size: 0.7, intensity: 0.34, speed: 0.35, spread: 0.9, react: B('loud', { release: 0.6 }), glowReact: 0.35, sizeReact: 0.15, speedReact: 0.5 });
  const laLights = () => ({ type: 'blobs', name: 'Glow lights', mode: 'glow', count: 3, size: 0.4, intensity: 0.1, speed: 0.5, spread: 0.7, react: B('bass', { release: 0.3 }), glowReact: 1.1, sizeReact: 0.2 });
  const laBalls = () => ({ type: 'metaballs', name: 'Liquid balls', count: 8, size: 0.07, area: 0.6, speed: 1, style: 'fill', edge: 0.012, glow: 0.3, wobble: 0.35, react: B('bass', { release: 0.15, punch: 1.5 }), sizeReact: 0.7, glowReact: 0.6, speedReact: 1.5 });
  const laDust = () => ({ type: 'particles', name: 'Dust', mode: 'drift', count: 70, size: 0.003, speed: 0.4, twinkle: 0.7, brightness: 0.55, colorMode: 'palette', react: B('bass', { release: 0.2 }), glowReact: 0.8 });
  const laFx = () => ({
    bloom: { intensity: 0.28, threshold: 0.7, radius: 1.1, react: B('bass', { release: 0.25, punch: 1.6 }), reactAmount: 0.6 },
    chroma: { react: B('kick', { release: 0.12, threshold: 0.5 }), reactAmount: 0.003 },
    vignette: { amount: 0.4 },
    grain: { amount: 0.05, size: 1.6 },
  });

  const LIST = [
    {
      id: 'la-echo',
      group: LA,
      name: 'Echo Dive',
      blurb: 'An endless dive: everything pours out of the center in fading echoes. Concentric hexagon windows on top.',
      palette: LA_PALETTE,
      layers: [
        laGradient(), laLights(), laBalls(),
        { type: 'particles', name: 'Burst from the center', mode: 'burst', count: 180, size: 0.0028, sizeVar: 0.6, speed: 0.9, spread: 0.04, streak: 0.25, twinkle: 0.3, brightness: 0.8, colorMode: 'palette', react: B('bass', { release: 0.2 }), speedReact: 5, glowReact: 0.6, streakReact: 1 },
        { type: 'zoom', name: 'Echo tunnel', mode: 'echo', speed: 0.55, speedReact: 1.8, react: B('bass', { release: 0.3 }), trail: 0.6, echoMix: 'max', echoGain: 0.88, hueDrift: 20, spin: 6 },
        { type: 'masks', name: 'Shape masks', composition: 'concentric', shape: 'hexagon', style: 'outline', count: 4, size: 0.42, outline: 0.03, spin: 5, stroke: 0.0025, glow: 0.3, pulse: 0.06, beatMode: 'calm', tZoom: false },
      ],
      fx: laFx(),
    },
    {
      id: 'la-nested',
      group: LA,
      name: 'Nested Worlds',
      blurb: 'The picture holds a smaller copy of itself in a hexagon, forever, while the camera dives in. Broken-mirror bands on top.',
      palette: LA_PALETTE,
      layers: [
        laGradient(), laLights(), laBalls(), laDust(),
        { type: 'zoom', name: 'Nested worlds', mode: 'nested', speed: 0.25, speedReact: 0.9, react: B('bass', { release: 0.3 }), window: 'hexagon', copies: 6, ratio: 0.5, twist: 14, copyHue: 0, edge: 0.003, edgeColor: 'p4', edgeGlow: 0.35 },
        { type: 'masks', name: 'Shape masks', composition: 'shards', count: 4, size: 0.32, spread: 0.85, rotation: 28, spin: 0, tZoom: false, stroke: 0.002, glow: 0.25, beatMode: 'snap', snapAngle: 20, snapEase: 0.9, beat: B('kick', { release: 0.15, threshold: 0.6 }) },
      ],
      fx: laFx(),
    },
    {
      id: 'la-vortex',
      group: LA,
      name: 'Vortex',
      blurb: 'A spiral of glowing hexagons pours endlessly out of the center. Scattered shape windows reshuffle on the kicks.',
      palette: LA_PALETTE,
      layers: [
        laGradient(), laLights(),
        { type: 'vortex', name: 'Vortex', pattern: 'hex', density: 14, size: 0.7, outline: 0.1, twist: 0.35, speed: 0.35, speedReact: 1.2, rotSpeed: 5, glow: 0.25, brightness: 0.75, colorMode: 'depth', opacity: 0.6, pulse: 0.3, flash: 0.5, hole: 0.06 },
        laBalls(), laDust(),
        { type: 'masks', name: 'Shape masks', composition: 'constellation', shape: 'mixed', style: 'mixed', count: 7, size: 0.17, spread: 0.85, drift: 1, spin: 8, beatMode: 'shuffle', stroke: 0.002, glow: 0.3, pulse: 0.1 },
      ],
      fx: laFx(),
    },
    {
      id: 'la-kaleido',
      group: LA,
      name: 'Kaleidoscope',
      blurb: 'The liquid aurora through a three-mirror kaleidoscope, flowing outward in echoes. Big shapes pop up at random, showing mirrored, rotated, scaled pieces of the video.',
      palette: LA_PALETTE,
      layers: [
        laGradient(), laLights(), Object.assign(laBalls(), { style: 'neon', edge: 0.006, glow: 0.4 }), laDust(),
        { type: 'kaleido', name: 'Kaleidoscope', mode: 'triangle', size: 0.3, spin: 3, spinReact: 25, zoom: 0.85, zoomPulse: 0.1, srcX: 0.12, srcY: 0.08, drift: 0.5, seam: 0.001, seamColor: 'p4', seamGlow: 0.12 },
        { type: 'zoom', name: 'Echo tunnel', mode: 'echo', speed: 0.3, speedReact: 1.2, react: B('bass', { release: 0.3 }), trail: 0.25, echoMix: 'max', echoGain: 0.8, hueDrift: 15 },
        { type: 'masks', name: 'Shape masks', composition: 'popups', shape: 'mixed', style: 'mixed', count: 7, size: 0.8, minSize: 0.2, life: 3.2, outline: 0.07, spread: 1, spin: 14, animate: 0.6,
          tTint: false, tHue: false, tInvert: false, colorChance: 0, stroke: 0, glow: 0, beatMode: 'calm', pulse: 0.05 },
      ],
      fx: laFx(),
    },
    {
      id: 'monstercat',
      group: 'Channel styles',
      name: 'Monstercat-style',
      blurb: 'Row of bars, logo and bold artist/title underneath, floating dust.',
      palette: ['#ffd400', '#ff3c8e', '#3cd2ff', '#ffffff', '#0c0c0e'],
      layers: [
        { type: 'background', mode: 'image', source: 'background', blur: 0.25, brightness: 0.42, saturation: 0.9, zoom: 1.08, drift: 0.25, pulse: 0, color1: '#1a1a1d', color2: '#060607', radius: 1.3 },
        { type: 'particles', mode: 'drift', count: 140, size: 0.0035, sizeVar: 0.7, speed: 0.8, direction: 60, wobble: 0.6, twinkle: 0.3, brightness: 0.55, color: 'p4', react: B('bass', { release: 0.2 }), speedReact: 1.5, sizeReact: 0.2, glowReact: 0.3 },
        {
          type: 'spectrum', name: 'Bars', mode: 'bars', bars: 63, minHz: 30, maxHz: 14000, release: 0.14, smooth: 0.45, gain: 1.05, curve: 1.6, floor: 0.12, tilt: 0.4,
          height: 0.3, minHeight: 0.004, barWidth: 0.68, round: 0, x: 0, y: -0.03, width: 0.8, colorMode: 'single', color: 'p1', glow: 0, pulse: 0,
          v: { y: 0.06, width: 0.9, height: 0.32 },
        },
        { type: 'image', name: 'Logo', source: 'logo', shape: 'square', size: 0.2, x: -0.687, y: -0.29, shadow: 0.25, pulse: 0.015, v: { size: 0.18, x: -0.72, y: -0.075 } },
        {
          type: 'text', line1: '{artist}', line2: '{title}', font: 'Avenir Next', weight1: 800, weight2: 500, size1: 0.072, size2: 0.044, uppercase: true, spacing: 0.02, gap: 0.18,
          align: 'left', x: -0.535, y: -0.29, color1: '#ffffff', color2: '#ffffff',
          v: { x: -0.48, y: -0.075, size1: 0.056, size2: 0.034 },
        },
      ],
      fx: { bloom: { intensity: 0.25, threshold: 0.75 }, vignette: { amount: 0.45 }, grain: { amount: 0.035 } },
    },
    {
      id: 'trapnation',
      group: 'Channel styles',
      name: 'Trap Nation-style',
      blurb: 'Cover art in a circle, layered color ring bouncing with the bass, particles bursting out.',
      palette: ['#7a00ff', '#ff0080', '#00d4ff', '#ffffff', '#120610'],
      layers: [
        { type: 'background', mode: 'image', source: 'background', blur: 0.12, brightness: 0.5, zoom: 1.12, drift: 0.35, color1: '#1a0b2e', color2: '#05020a', react: B('bass', { release: 0.12, punch: 2 }), pulse: 0.05 },
        {
          type: 'particles', mode: 'burst', count: 260, size: 0.0035, sizeVar: 0.6, speed: 1.2, spread: 0.22, twinkle: 0.2, streak: 0.4, brightness: 0.9, color: 'p4',
          react: B('bass', { release: 0.15 }), speedReact: 8, sizeReact: 0.6, glowReact: 0.6, streakReact: 1.5,
        },
        {
          type: 'spectrum', name: 'Ring', mode: 'ring', bars: 120, minHz: 40, maxHz: 10000, release: 0.1, smooth: 0.45, gain: 1.1, curve: 1.5, floor: 0.18, tilt: 1.3,
          height: 0.1, minHeight: 0.004, radius: 0.2, mirror: true, layers: 4, layerSpread: 0.16, layerDelay: 0.035, ringFill: true, colorMode: 'palette', color: 'p4', glow: 0.2,
          react: B('bass', { release: 0.12, punch: 2 }), pulse: 0.08,
        },
        { type: 'image', name: 'Cover art', source: 'cover', shape: 'circle', size: 0.4, border: 0.006, borderColor: 'p4', shadow: 0.3, react: B('bass', { release: 0.12, punch: 2 }), pulse: 0.08 },
        { type: 'text', enabled: false, align: 'center', x: 0, y: -0.78, size1: 0.05, size2: 0.03, v: { y: -0.6 } },
      ],
      fx: {
        bloom: { intensity: 0.45, threshold: 0.7 },
        camera: { react: B('kick', { release: 0.15, threshold: 0.5 }), shakeReact: 0.012, zoomReact: 0.02 },
        chroma: { react: B('kick', { release: 0.15, threshold: 0.5 }), reactAmount: 0.004 },
        vignette: { amount: 0.5 },
        grain: { amount: 0.03 },
      },
    },
    {
      id: 'dubstepgutter',
      group: 'Channel styles',
      name: 'Dubstep Gutter-style',
      blurb: 'Dark and aggressive: white circular bars around the logo, heavy shake, glitch on big hits.',
      palette: ['#ffffff', '#d0d0d0', '#8a8a8a', '#ffffff', '#000000'],
      layers: [
        { type: 'background', mode: 'image', source: 'background', blur: 0.3, brightness: 0.35, saturation: 0.7, zoom: 1.1, drift: 0.4, color1: '#151515', color2: '#000000', react: B('sub', { release: 0.15 }), pulse: 0.03, flash: 0.25 },
        { type: 'particles', mode: 'burst', count: 200, size: 0.003, speed: 1, spread: 0.3, streak: 0.6, brightness: 0.8, color: '#ffffff', react: B('sub', { release: 0.15 }), speedReact: 10, streakReact: 2 },
        {
          type: 'spectrum', name: 'Circle bars', mode: 'circle', bars: 90, mirror: true, direction: 'out', radius: 0.205, height: 0.2, minHeight: 0.006, barWidth: 0.5, round: 0.3,
          minHz: 30, maxHz: 12000, release: 0.1, smooth: 0.25, gain: 1.1, curve: 1.8, floor: 0.12, tilt: 0.5, colorMode: 'single', color: '#ffffff', glow: 0.15,
          react: B('sub', { release: 0.12, punch: 2 }), pulse: 0.06,
        },
        { type: 'image', name: 'Logo', source: 'cover', shape: 'circle', size: 0.4, border: 0.008, borderColor: '#ffffff', fill: true, fillColor: '#000000', shadow: 0.6, shadowColor: '#000000', react: B('sub', { release: 0.12, punch: 2 }), pulse: 0.06 },
        { type: 'text', enabled: false, align: 'center', x: 0, y: -0.78, size1: 0.05, size2: 0.03, v: { y: -0.6 } },
      ],
      fx: {
        bloom: { intensity: 0.35, threshold: 0.7 },
        camera: { react: B('kick', { release: 0.2, threshold: 0.5 }), shakeReact: 0.02, zoomReact: 0.03, rotateReact: 1.2 },
        chroma: { react: B('kick', { release: 0.15, threshold: 0.5 }), reactAmount: 0.008 },
        glitch: { react: B('kick', { release: 0.1, threshold: 0.6 }), reactAmount: 0.35 },
        flash: { react: B('kick', { release: 0.1, threshold: 0.5 }), reactAmount: 0.08 },
        vignette: { amount: 0.65 },
        grain: { amount: 0.06 },
        color: { contrast: 1.1, saturation: 0.9 },
      },
    },
    {
      id: 'ncs',
      group: 'Channel styles',
      name: 'NCS-style',
      blurb: 'Blurred cover background, rounded circular bars, title line below.',
      palette: ['#00b4ff', '#00ffd5', '#ff3cac', '#ffffff', '#020611'],
      layers: [
        { type: 'background', mode: 'image', source: 'background', blur: 0.45, brightness: 0.45, zoom: 1.1, drift: 0.3, color1: '#0b1a2e', color2: '#02050b', pulse: 0.02 },
        { type: 'particles', mode: 'drift', count: 120, size: 0.004, twinkle: 0.6, brightness: 0.6, speed: 0.6, direction: -30, color: '#ffffff' },
        {
          type: 'spectrum', name: 'Circle bars', mode: 'circle', bars: 72, mirror: true, radius: 0.225, height: 0.13, barWidth: 0.55, round: 1, minHeight: 0.008,
          minHz: 35, maxHz: 12000, release: 0.12, smooth: 0.35, curve: 1.5, floor: 0.12, gain: 1.1, colorMode: 'single', color: 'p1', glow: 0.25,
          react: B('bass', { release: 0.15 }), pulse: 0.05,
        },
        { type: 'image', name: 'Cover art', source: 'cover', shape: 'circle', size: 0.42, border: 0.012, borderColor: '#ffffff', react: B('bass', { release: 0.15 }), pulse: 0.05 },
        { type: 'text', line1: '{artist} — {title}', line2: '', weight1: 700, size1: 0.04, uppercase: true, spacing: 0.12, align: 'center', x: 0, y: -0.86, v: { y: -0.62, size1: 0.036 } },
      ],
      fx: { bloom: { intensity: 0.5, threshold: 0.6 }, camera: { react: B('kick', { release: 0.15, threshold: 0.5 }), shakeReact: 0.006 }, vignette: { amount: 0.45 }, grain: { amount: 0.03 } },
    },
    {
      id: 'liquidneon',
      group: 'Originals',
      name: 'Liquid Neon',
      blurb: 'Glowing morphing balls over drifting colored lights, with light trails.',
      palette: ['#ff2bd6', '#7a5cff', '#22e1ff', '#ffffff', '#07040f'],
      layers: [
        { type: 'background', mode: 'radial', color1: '#140726', color2: '#030108', radius: 1.2, brightness: 1 },
        { type: 'blobs', mode: 'glow', count: 4, size: 0.5, intensity: 0.2, speed: 0.6, spread: 0.8, react: B('bass', { release: 0.4 }), glowReact: 0.6, sizeReact: 0.2 },
        {
          type: 'metaballs', count: 9, size: 0.075, area: 0.62, speed: 1.1, style: 'fill', edge: 0.012, glow: 0.4, wobble: 0.35,
          react: B('bass', { release: 0.15, punch: 1.5 }), sizeReact: 0.7, glowReact: 0.6, speedReact: 1.5,
        },
        { type: 'particles', mode: 'drift', count: 90, size: 0.003, colorMode: 'palette', brightness: 0.6, twinkle: 0.5 },
        { type: 'text', enabled: false, align: 'center', x: 0, y: -0.78, size1: 0.05, size2: 0.03, v: { y: -0.6 } },
      ],
      fx: {
        bloom: { intensity: 0.6, threshold: 0.6, radius: 1.1, reactAmount: 0.3 },
        trails: { enabled: true, length: 0.15, zoom: 0.08 },
        chroma: { amount: 0.0015, react: B('kick', { release: 0.15 }), reactAmount: 0.003 },
        camera: { react: B('kick', { release: 0.15, threshold: 0.5 }), zoomReact: 0.01 },
        vignette: { amount: 0.45 },
        grain: { amount: 0.045 },
      },
    },
    {
      id: 'aurora',
      group: 'Originals',
      name: 'Aurora Chill',
      blurb: 'Soft flowing gradient, thin waveform and elegant title. Lo-fi / ambient.',
      palette: ['#2b1055', '#7597de', '#d16ba5', '#5ee7c4', '#0b0a17'],
      layers: [
        { type: 'blobs', name: 'Flowing gradient', mode: 'mesh', blend: 'normal', count: 5, size: 0.7, intensity: 0.9, speed: 0.35, spread: 0.9, react: B('loud', { release: 0.6 }), glowReact: 0.25, sizeReact: 0.15, speedReact: 0.5 },
        { type: 'blobs', name: 'Soft lights', mode: 'glow', count: 3, size: 0.35, intensity: 0.12, colorMode: 'single', color: '#ffffff', speed: 0.5, react: B('mid', { release: 0.3 }), glowReact: 0.6 },
        { type: 'particles', mode: 'drift', count: 60, size: 0.003, speed: 0.4, twinkle: 0.7, brightness: 0.5, color: '#ffffff' },
        { type: 'spectrum', name: 'Waveform', mode: 'wave', y: -0.42, width: 0.6, height: 0.06, thickness: 0.003, color: '#ffffff', opacity: 0.75, window: 50, stabilize: true, smooth: 0.3, gain: 1, glow: 0.3, mirror: false, v: { y: -0.3, width: 0.8 } },
        {
          type: 'text', line1: '{title}', line2: '{artist}', font: 'Avenir Next', weight1: 300, weight2: 400, size1: 0.075, size2: 0.032, uppercase: false, spacing: 0.18, gap: 0.5,
          align: 'center', x: 0, y: 0, color1: '#ffffff', color2: '#ffffff', glow: 0.4, glowColor: 'p3', v: { size1: 0.06, size2: 0.03 },
        },
      ],
      fx: { bloom: { intensity: 0.25, threshold: 0.85 }, vignette: { amount: 0.35 }, grain: { amount: 0.06, size: 1.8 } },
    },
    {
      id: 'synthwave',
      group: 'Originals',
      name: 'Synthwave',
      blurb: 'Neon grid racing to a striped sun, stars, scanlines.',
      palette: ['#ff2bd6', '#ff7b00', '#ffd319', '#ffffff', '#0d0221'],
      layers: [
        { type: 'background', mode: 'linear', angle: 0, color1: '#05010f', color2: '#240b48', color3: '#7a1c6b', three: true, brightness: 1 },
        { type: 'particles', name: 'Stars', mode: 'drift', count: 220, size: 0.0022, twinkle: 0.8, speed: 0.1, brightness: 0.8, color: '#ffffff' },
        {
          type: 'grid', horizon: -0.12, sun: true, sunY: 0.08, sunSize: 0.25, stripes: 9, sunTop: 'p3', sunBottom: 'p2', gridColor: 'p1', line: 1.6, glow: 0.7, density: 1.4, speed: 0.5,
          camHeight: 0.32, fog: 0.3, react: B('kick', { release: 0.25 }), speedReact: 1.2, gridFlash: 0.6, sunPulse: 0.03,
        },
        {
          type: 'text', line1: '{artist}', line2: '{title}', font: 'Futura', weight1: 700, weight2: 500, size1: 0.065, size2: 0.035, uppercase: true, spacing: 0.15, gap: 0.35,
          align: 'center', x: 0, y: 0.84, color1: '#ffffff', color2: 'p3', glow: 0.8, glowColor: 'p1', v: { y: 0.62, size1: 0.055, size2: 0.03 },
        },
      ],
      fx: {
        bloom: { intensity: 0.7, threshold: 0.55 },
        chroma: { amount: 0.0015 },
        scanlines: { amount: 0.12, count: 540 },
        camera: { react: B('kick', { release: 0.15, threshold: 0.5 }), zoomReact: 0.008 },
        vignette: { amount: 0.5 },
        grain: { amount: 0.05 },
      },
    },
    {
      id: 'techno',
      group: 'Originals',
      name: 'Minimal Techno',
      blurb: 'Black and white square tunnel rushing on the kick, strobe flashes.',
      palette: ['#ffffff', '#bdbdbd', '#7a7a7a', '#ffffff', '#000000'],
      layers: [
        { type: 'background', mode: 'solid', color1: '#000000', brightness: 1 },
        {
          type: 'polygons', mode: 'tunnel', sides: 4, count: 10, size: 0.5, stroke: 0.0025, glow: 0.12, tunnelSpeed: 0.12, speedReact: 0.8, twist: 3, rotSpeed: 4,
          colorMode: 'single', color: '#ffffff', react: B('kick', { release: 0.2 }), pulse: 0.15, glowReact: 0.8, spinReact: 0,
        },
        { type: 'spectrum', name: 'Waveform', mode: 'wave', y: 0, width: 1, height: 0.12, thickness: 0.0025, color: '#ffffff', opacity: 0.6, mirror: false, window: 30, stabilize: true, smooth: 0.15 },
        { type: 'text', enabled: false, align: 'center', x: 0, y: -0.78, size1: 0.05, size2: 0.03, font: 'DIN Condensed', v: { y: -0.6 } },
      ],
      fx: {
        bloom: { intensity: 0.35, threshold: 0.6 },
        flash: { react: B('kick', { release: 0.08, threshold: 0.5 }), reactAmount: 0.12 },
        chroma: { react: B('kick', { release: 0.12, threshold: 0.5 }), reactAmount: 0.006 },
        camera: { react: B('kick', { release: 0.15, threshold: 0.5 }), zoomReact: 0.02 },
        grain: { amount: 0.08 },
        vignette: { amount: 0.55 },
        color: { contrast: 1.15 },
      },
    },
    {
      id: 'blank',
      group: 'Originals',
      name: 'Blank canvas',
      blurb: 'Just a background — build your own look with "Add layer".',
      palette: ['#8b5cf6', '#22d3ee', '#f472b6', '#ffffff', '#07070b'],
      layers: [{ type: 'background', mode: 'radial', color1: '#16141f', color2: '#050508' }],
      fx: { bloom: { intensity: 0.4 } },
    },
  ];

  function apply(project, id) {
    const p = LIST.find((x) => x.id === id);
    if (!p) return false;
    project.look = id;
    project.palette = p.palette.slice();
    project.layers = p.layers.map((spec, i) => {
      const over = Object.assign({}, spec);
      delete over.type;
      const L = VG.project.createLayer(spec.type, over);
      L.id = `${id}-${i}`;
      L.seed = spec.seed != null ? spec.seed : (i + 1) * 1013;
      return L;
    });
    project.fx = VG.project.normalizeFx(p.fx);
    return true;
  }

  VG.presets = { LIST, apply };
})(window.VG);
