'use strict';
// Shared helpers. Every script in this app hangs off the global `VG` namespace,
// so the page works when index.html is opened straight from disk (no server, no modules).
window.VG = window.VG || {};

(function (VG) {
  const U = {};

  U.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.fract = (x) => x - Math.floor(x);
  U.smoothstep = (a, b, x) => {
    const t = U.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.DEG = Math.PI / 180;

  // Deterministic PRNG (mulberry32): the same seed always gives the same sequence,
  // which keeps the preview and the exported video identical.
  U.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Stateless hash of three integers → [0, 1).
  U.hash3 = (a, b, c) => {
    let h = (a ^ Math.imul((b | 0) + 0x9e3779b9, 0x85ebca6b) ^ Math.imul((c | 0) + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  U.hashStr = (s) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };

  // A smooth, never-quite-repeating 2D path in [-1, 1]², built from a few sines with
  // random frequencies and phases. `t` is "travel time" (seconds × speed).
  U.makeWander = (rand) => {
    const axes = [];
    const amps = [0.58, 0.3, 0.12];
    const freqs = [0.045, 0.11, 0.27];
    for (let axis = 0; axis < 2; axis++) {
      const comps = [];
      for (let j = 0; j < 3; j++) {
        comps.push({ a: amps[j], f: freqs[j] * (0.65 + rand() * 0.7), p: rand() * Math.PI * 2 });
      }
      axes.push(comps);
    }
    return (t) => {
      const out = [0, 0];
      for (let axis = 0; axis < 2; axis++) {
        let v = 0;
        for (const c of axes[axis]) v += c.a * Math.sin(c.f * t * Math.PI * 2 + c.p);
        out[axis] = v;
      }
      return out;
    };
  };

  U.hexToRgb = (hex) => {
    let h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  U.rgbToHex = (rgb) =>
    '#' + rgb.map((v) => Math.round(U.clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');

  U.uid = () => Math.random().toString(36).slice(2, 10);

  U.clone = (o) => JSON.parse(JSON.stringify(o));

  // Fill keys that are missing in `obj` from `defaults` (recursively for plain objects).
  // Used when loading presets saved by an older version of the app.
  U.withDefaults = (defaults, obj) => {
    const out = U.clone(defaults);
    if (!obj || typeof obj !== 'object') return out;
    for (const [k, v] of Object.entries(obj)) {
      const d = out[k];
      if (d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = U.withDefaults(d, v);
      } else {
        out[k] = U.clone(v);
      }
    }
    return out;
  };

  U.debounce = (fn, ms) => {
    let id = 0;
    return (...args) => {
      clearTimeout(id);
      id = setTimeout(() => fn(...args), ms);
    };
  };

  // Yield to the browser without timers (timers are throttled in background tabs).
  const yieldChannel = new MessageChannel();
  const yieldQueue = [];
  yieldChannel.port1.onmessage = () => {
    const r = yieldQueue.shift();
    if (r) r();
  };
  U.yieldNow = () =>
    new Promise((resolve) => {
      yieldQueue.push(resolve);
      yieldChannel.port2.postMessage(null);
    });

  U.fmtTime = (s, decimals = 1) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = s - m * 60;
    const width = decimals > 0 ? 3 + decimals : 2;
    return `${m}:${sec.toFixed(decimals).padStart(width, '0')}`;
  };

  U.parseTime = (str) => {
    const s = String(str).trim();
    if (!s) return NaN;
    const parts = s.split(':').map(Number);
    if (parts.some((p) => !isFinite(p))) return NaN;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  };

  U.fmtBytes = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
    if (n >= 1e6) return Math.round(n / 1e6) + ' MB';
    return Math.max(1, Math.round(n / 1e3)) + ' KB';
  };

  U.fmtDuration = (s) => {
    if (!isFinite(s)) return '—';
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
    return `${sec}s`;
  };

  U.sanitizeFilename = (s) =>
    String(s || 'video')
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'video';

  U.downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  // Tiny DOM builder: h('div', {class: 'x', onclick: fn}, child, 'text', ...)
  U.h = (tag, attrs, ...children) => {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (typeof v === 'boolean' || (k in el && typeof v !== 'string')) el[k] = v;
        else el.setAttribute(k, v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  };

  // Decoded straight from the file data (always "origin-clean", even when the page is opened
  // from disk), plus an object URL for thumbnails.
  U.loadImage = async (blob) => {
    const img = await createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    return { img, url, w: img.width, h: img.height };
  };

  VG.util = U;
})(window.VG);
