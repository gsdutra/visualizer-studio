'use strict';
// App wiring: panels, preview loop, transport/timeline, media loading, looks, export.
(function (VG) {
  const U = VG.util;
  const h = U.h;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'visualizer-studio.project.v1';
  const PREVIEW_LONG_SIDE = { low: 640, medium: 960, high: 1280, full: 1920 };

  const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
  const ICON = {
    play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
    pause: svg('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>'),
    eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
    eyeOff: svg('<path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0112 6c6 0 9.5 6 9.5 6a16 16 0 01-3.1 3.8M6.2 7.6C3.9 9.3 2.5 12 2.5 12S6 18 12 18c1.6 0 3-.4 4.2-1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    up: svg('<path d="M12 5l-6 6.5h4V19h4v-7.5h4z" fill="currentColor"/>'),
    down: svg('<path d="M12 19l6-6.5h-4V5h-4v7.5H6z" fill="currentColor"/>'),
    copy: svg('<rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 15V6a1 1 0 011-1h9" fill="none" stroke="currentColor" stroke-width="1.7"/>'),
    trash: svg('<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    music: svg('<path d="M9 17.5V6l10-2v11.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6.5" cy="17.5" r="2.5" fill="currentColor"/><circle cx="16.5" cy="15.5" r="2.5" fill="currentColor"/>'),
    picture: svg('<rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.6" fill="currentColor"/><path d="M4 17l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
    speaker: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
    bg: svg('<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 14l16-6" stroke="currentColor" stroke-width="1.4"/>'),
    blobs: svg('<circle cx="9" cy="10" r="5" fill="currentColor" opacity=".55"/><circle cx="15" cy="14" r="5" fill="currentColor" opacity=".85"/>'),
    balls: svg('<circle cx="8.5" cy="12" r="4.5" fill="currentColor"/><circle cx="15.5" cy="12" r="3.5" fill="currentColor"/><path d="M11 12h3" stroke="currentColor" stroke-width="4"/>'),
    poly: svg('<path d="M12 3.5l7.4 4.25v8.5L12 20.5l-7.4-4.25v-8.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z" fill="none" stroke="currentColor" stroke-width="1.4"/>'),
    spectrum: svg('<path d="M5 19v-6M9 19V8M13 19v-9M17 19V5M21 19v-4M1 19v-3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    particles: svg('<circle cx="6" cy="7" r="1.6" fill="currentColor"/><circle cx="14" cy="5" r="1.2" fill="currentColor"/><circle cx="18" cy="11" r="1.8" fill="currentColor"/><circle cx="10" cy="13" r="1.3" fill="currentColor"/><circle cx="5" cy="17" r="1.1" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/>'),
    image: svg('<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>'),
    text: svg('<path d="M5 6h14M12 6v13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    grid: svg('<path d="M2 20h20M5 14h14M8 10.5h8M12 10v10M7.5 20L10 10M16.5 20L14 10M2.5 20l6-9.5M21.5 20l-6-9.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 7a4 4 0 018 0z" fill="currentColor"/>'),
    zoom: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="2" fill="currentColor"/>'),
    vortex: svg('<path d="M12 12c0-1.5 2-1.8 2.6-.4.9 2-1.2 3.9-3.3 3.4-2.9-.7-3.3-4.3-1.3-6.1 2.6-2.3 6.8-1.2 7.8 2.1 1.2 3.9-1.8 7.6-5.7 7.5-4.6-.1-7.7-4.6-6.6-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
    kaleido: svg('<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z M12 3v18 M4.2 7.5l15.6 9 M19.8 7.5l-15.6 9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>'),
    masks: svg('<path d="M9 4.5l6.5 11.2H2.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="15" cy="13.5" r="5.5" fill="currentColor" opacity=".55"/>'),
  };

  // ---------------------------------------------------------------- audio playback
  class Player {
    constructor() {
      this.ctx = null;
      this.gain = null;
      this.buffer = null;
      this.src = null;
      this.playing = false;
      this.offset = 0;
      this.t0 = 0;
      this.clock0 = 0;
      this.volume = 0.8;
      this.duration = 0;
      this.onState = () => {};
    }
    _ensure() {
      if (!this.ctx) {
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
        this.gain = this.ctx.createGain();
        this.gain.gain.value = this.volume;
        this.gain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    setBuffer(buffer, duration) {
      this.pause();
      this.buffer = buffer;
      this.duration = duration;
      this.offset = 0;
    }
    play() {
      if (this.playing) return;
      if (this.offset >= this.duration - 0.02) this.offset = 0;
      if (this.buffer) {
        const ctx = this._ensure();
        const src = ctx.createBufferSource();
        src.buffer = this.buffer;
        src.connect(this.gain);
        src.onended = () => {
          if (this.src !== src) return;
          this.src = null;
          this.playing = false;
          this.offset = this.duration;
          this.onState();
        };
        src.start(0, this.offset);
        this.src = src;
        this.t0 = ctx.currentTime - this.offset;
      } else {
        this.clock0 = performance.now() / 1000 - this.offset;
      }
      this.playing = true;
      this.onState();
    }
    pause() {
      if (!this.playing) return;
      this.offset = this.time();
      if (this.src) {
        const s = this.src;
        this.src = null;
        s.onended = null;
        try {
          s.stop();
        } catch (e) {
          /* already stopped */
        }
        s.disconnect();
      }
      this.playing = false;
      this.onState();
    }
    seek(t) {
      const was = this.playing;
      if (was) this.pause();
      this.offset = U.clamp(t, 0, this.duration);
      if (was) this.play();
    }
    time() {
      if (!this.playing) return this.offset;
      if (this.buffer) return U.clamp(this.ctx.currentTime - this.t0, 0, this.duration);
      let t = performance.now() / 1000 - this.clock0;
      if (t >= this.duration) {
        this.clock0 += Math.floor(t / this.duration) * this.duration;
        t %= this.duration;
      }
      return t;
    }
    // What should be on screen now: subtract the audio output latency (matters a lot with
    // Bluetooth headphones) so visuals line up with what you hear.
    visualTime() {
      const t = this.time();
      if (!this.playing || !this.buffer || !this.ctx) return t;
      const lat = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
      return Math.max(0, t - lat);
    }
    setVolume(v) {
      this.volume = v;
      if (this.gain) this.gain.gain.value = v;
    }
  }

  // ---------------------------------------------------------------- state
  const app = {
    project: null,
    analysis: new VG.analysis.DemoAnalysis(),
    audio: null,
    renderer: null,
    player: new Player(),
    selectedId: null,
    exporting: false,
    dirty: true,
    meters: [],
    collapsed: new Set(),
    support: [],
    lastNow: 0,
    lastResult: null,
  };
  VG.app = app;

  const saveNow = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(app.project));
    } catch (e) {
      /* storage full or blocked — not critical */
    }
  };
  const scheduleSave = U.debounce(saveNow, 500);
  function edited() {
    app.dirty = true;
    scheduleSave();
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = VG.project.normalizeProject(JSON.parse(raw));
      return p.layers.length ? p : null;
    } catch (e) {
      return null;
    }
  }

  function toast(msg, opts = {}) {
    const el = h('div', { class: 'toast' + (opts.kind ? ' ' + opts.kind : '') }, h('span', { class: 'toast-msg' }, msg));
    if (opts.action) {
      el.append(
        h('button', { class: 'btn small', onclick: () => { opts.action.fn(); el.remove(); } }, opts.action.label)
      );
    }
    el.append(h('button', { class: 'toast-x', title: 'Dismiss', onclick: () => el.remove() }, '×'));
    $('toasts').append(el);
    setTimeout(() => el.remove(), opts.timeout || (opts.action ? 9000 : 5500));
  }

  const section = (title, children, cls) => h('section', { class: 'panel' + (cls ? ' ' + cls : '') }, title ? h('h3', null, title) : null, children);
  const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);

  const isVertical = () => app.project.export.orientation === 'vertical';
  const duration = () => app.analysis.duration;

  function getRange() {
    const ex = app.project.export;
    const d = duration();
    if (ex.range === 'section') {
      const s = U.clamp(Number(ex.start) || 0, 0, Math.max(0, d - 0.5));
      const e = U.clamp(Number(ex.end) || d, s + 0.5, d);
      return { start: s, end: e };
    }
    return { start: 0, end: d };
  }

  function fadeAt(t) {
    if (!app.audio) return 1;
    const r = getRange();
    if (t < r.start || t > r.end) return 1;
    const ex = app.project.export;
    return VG.exporter.fadeFactor(t, r.start, r.end, ex.fadeIn, ex.fadeOut);
  }

  // ---------------------------------------------------------------- preview
  function previewSize() {
    const q = PREVIEW_LONG_SIDE[app.project.previewQuality] || 960;
    const s = Math.round((q * 9) / 16);
    return isVertical() ? [s, q] : [q, s];
  }

  function layoutPreview() {
    const vp = $('viewport');
    const frame = $('frame');
    const r = vp.getBoundingClientRect();
    const pad = 20;
    const aw = Math.max(60, r.width - pad * 2);
    const ah = Math.max(60, r.height - pad * 2);
    const aspect = isVertical() ? 9 / 16 : 16 / 9;
    let w = aw;
    let hh = aw / aspect;
    if (hh > ah) {
      hh = ah;
      w = ah * aspect;
    }
    frame.style.width = Math.floor(w) + 'px';
    frame.style.height = Math.floor(hh) + 'px';
    const [pw, ph] = previewSize();
    app.renderer.setSize(pw, ph);
    app.dirty = true;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = app.lastNow ? Math.min(0.1, (now - app.lastNow) / 1000) : 1 / 60;
    app.lastNow = now;
    if (app.exporting) return;
    const p = app.player;
    if (p.playing && app.audio && $('loopSection').checked && app.project.export.range === 'section') {
      const r = getRange();
      const ct = p.time();
      if (ct >= r.end || ct < r.start - 0.05) p.seek(r.start);
    }
    const t = p.visualTime();
    if (p.playing || app.dirty) {
      const base = { project: app.project, analysis: app.analysis, assets: VG.assets, vertical: isVertical() };
      // Effects that build on previous frames (echo tunnel, trails) get a short warm-up while
      // paused, so what you see when you tweak them matches playback.
      const warm = !p.playing && VG.project.needsHistory(app.project);
      if (warm) {
        const steps = 10;
        const step = 0.05;
        for (let k = steps; k >= 1; k--) app.renderer.render(Object.assign({ t: t - k * step, dt: step, fade: 1, reset: k === steps }, base));
      }
      app.renderer.render(Object.assign({ t, dt: warm ? 0.05 : p.playing ? dt : 0, fade: fadeAt(t), reset: !p.playing && !warm }, base));
      app.dirty = false;
    }
    updateMeters(t);
    drawTimeline(t);
    updateTime(t);
  }

  function addMeter(el, b) {
    app.meters.push({ el, b });
  }

  function updateMeters(t) {
    const live = [];
    for (const m of app.meters) {
      if (!m.el.isConnected) continue;
      live.push(m);
      const v = U.clamp(app.analysis.value(m.b, t), 0, 1);
      m.el.style.transform = `scaleX(${v.toFixed(3)})`;
    }
    app.meters = live;
  }

  function updateTime(t) {
    const label = `${U.fmtTime(t)} / ${U.fmtTime(duration())}`;
    const el = $('timeLabel');
    if (el.textContent !== label) el.textContent = label;
  }

  function updatePlayButton() {
    $('btnPlay').innerHTML = app.player.playing ? ICON.pause : ICON.play;
    $('btnPlay').title = app.player.playing ? 'Pause (space)' : 'Play (space)';
  }

  function togglePlay() {
    if (app.exporting) return;
    if (app.player.playing) app.player.pause();
    else {
      if (app.audio && $('loopSection').checked && app.project.export.range === 'section') {
        const r = getRange();
        const ct = app.player.time();
        if (ct < r.start || ct >= r.end) app.player.seek(r.start);
      }
      app.player.play();
    }
  }

  function seekTo(t) {
    app.player.seek(U.clamp(t, 0, duration()));
    app.dirty = true;
  }

  // ---------------------------------------------------------------- timeline
  let timelineColors = null;
  let peaksCache = { key: '', data: null };

  function drawTimeline(t) {
    const c = $('timeline');
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const hh = c.clientHeight;
    if (!w || !hh) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(hh * dpr);
    }
    if (!timelineColors) {
      const cs = getComputedStyle(document.documentElement);
      timelineColors = {
        wave: cs.getPropertyValue('--wave').trim() || '#3a3f4d',
        played: cs.getPropertyValue('--accent').trim() || '#8b5cf6',
        handle: cs.getPropertyValue('--accent-2').trim() || '#22d3ee',
      };
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    const d = duration() || 1;
    const step = 3;
    const n = Math.max(1, Math.floor(w / step));
    const key = n + '|' + (app.audio ? app.audio.id : 'demo');
    if (peaksCache.key !== key) peaksCache = { key, data: app.analysis.peaks(n) };
    const peaks = peaksCache.data;
    const mid = hh / 2;
    const px = (t / d) * w;
    for (let i = 0; i < n; i++) {
      const x = i * step;
      const y0 = mid - Math.max(0.02, peaks[2 * i + 1]) * (mid - 2);
      const y1 = mid - Math.min(-0.02, peaks[2 * i]) * (mid - 2);
      ctx.fillStyle = x < px ? timelineColors.played : timelineColors.wave;
      ctx.fillRect(x, y0, step - 1, Math.max(1, y1 - y0));
    }
    if (app.project.export.range === 'section' && app.audio) {
      const r = getRange();
      const xs = (r.start / d) * w;
      const xe = (r.end / d) * w;
      ctx.fillStyle = 'rgba(8, 9, 12, 0.62)';
      ctx.fillRect(0, 0, xs, hh);
      ctx.fillRect(xe, 0, w - xe, hh);
      ctx.fillStyle = timelineColors.handle;
      ctx.fillRect(xs - 1, 0, 2, hh);
      ctx.fillRect(xe - 1, 0, 2, hh);
      ctx.fillRect(xs - 1, 0, 7, 4);
      ctx.fillRect(xe - 6, 0, 7, 4);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(px) - 1, 0, 2, hh);
  }

  function setupTimeline() {
    const c = $('timeline');
    let drag = null;
    const tAt = (e) => {
      const r = c.getBoundingClientRect();
      return U.clamp((e.clientX - r.left) / r.width, 0, 1) * duration();
    };
    const handleAt = (e) => {
      if (app.project.export.range !== 'section' || !app.audio) return null;
      const r = c.getBoundingClientRect();
      const d = duration();
      const rg = getRange();
      const xs = r.left + (rg.start / d) * r.width;
      const xe = r.left + (rg.end / d) * r.width;
      if (Math.abs(e.clientX - xs) < 7) return 'start';
      if (Math.abs(e.clientX - xe) < 7) return 'end';
      return null;
    };
    c.addEventListener('pointerdown', (e) => {
      if (app.exporting) return;
      c.setPointerCapture(e.pointerId);
      drag = handleAt(e) || 'seek';
      if (drag === 'seek') seekTo(tAt(e));
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag) {
        c.style.cursor = handleAt(e) ? 'ew-resize' : 'pointer';
        return;
      }
      const t = tAt(e);
      const ex = app.project.export;
      if (drag === 'seek') seekTo(t);
      else {
        if (drag === 'start') ex.start = Math.min(t, getRange().end - 0.5);
        else ex.end = Math.max(t, getRange().start + 0.5);
        refreshExportRange();
        edited();
      }
    });
    const end = () => {
      drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  // ---------------------------------------------------------------- tabs
  function switchTab(name) {
    for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === name);
    for (const id of ['media', 'layers', 'effects', 'export']) $('tab-' + id).hidden = id !== name;
  }

  // ---------------------------------------------------------------- media tab
  function buildMedia() {
    const root = $('tab-media');
    root.textContent = '';
    const fileInput = h('input', {
      type: 'file',
      accept: 'audio/*,.wav,.mp3',
      hidden: true,
      onchange: (e) => {
        const f = e.target.files[0];
        if (f) loadAudioFile(f);
        e.target.value = '';
      },
    });
    const dz = h(
      'button',
      { class: 'dropzone', id: 'audioDrop', type: 'button', onclick: () => fileInput.click() },
      h('span', { class: 'dz-icon', html: ICON.music }),
      h('span', { class: 'dz-title', id: 'dzTitle' }, 'Drop your track here or click to choose'),
      h('span', { class: 'dz-sub' }, '.wav or .mp3 · it stays on your computer, nothing is uploaded')
    );
    const prog = h('div', { class: 'progress small', id: 'audioProgress', hidden: true }, h('div', { class: 'progress-fill', id: 'audioProgressFill' }));
    const status = h('div', { class: 'status-line', id: 'audioStatus' });
    root.append(section('Audio', [dz, fileInput, prog, status]));

    const artist = h('input', { type: 'text', id: 'artistInput', spellcheck: false });
    artist.value = app.project.artist;
    artist.addEventListener('input', () => {
      app.project.artist = artist.value;
      edited();
    });
    const title = h('input', { type: 'text', id: 'titleInput', spellcheck: false });
    title.value = app.project.title;
    title.addEventListener('input', () => {
      app.project.title = title.value;
      edited();
    });
    root.append(
      section('Track info', [
        field('Artist', artist),
        field('Title', title),
        h('p', { class: 'muted small' }, 'Text layers show these through {artist} and {title}. They are filled in from the file when possible.'),
      ])
    );

    root.append(
      section('Images', [
        h('div', { class: 'slots', id: 'imageSlots' }),
        h('p', { class: 'muted small' }, 'Drag an image onto a slot. When the logo or background slot is empty, layers use your cover art instead.'),
      ])
    );
    renderSlots();

    const fontInput = h('input', {
      type: 'file',
      accept: '.ttf,.otf,.woff,.woff2',
      hidden: true,
      onchange: async (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
          const name = await VG.fonts.addFile(f);
          renderFonts();
          renderLayerEditor();
          app.dirty = true;
          toast(`Font “${name}” loaded. Pick it in a Text layer.`);
        } catch (err) {
          toast('Could not load that font file.', { kind: 'error' });
        }
      },
    });
    root.append(
      section('Custom font', [
        h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => fontInput.click() }, 'Load a font file…'), fontInput),
        h('div', { class: 'muted small', id: 'fontList' }),
      ])
    );
    renderFonts();
    renderAudioInfo();
  }

  function renderFonts() {
    const el = $('fontList');
    if (!el) return;
    const custom = VG.fonts.custom.map((f) => f.name);
    el.textContent = custom.length
      ? 'Loaded: ' + custom.join(', ') + '. Fonts need to be loaded again after reopening the page.'
      : '.ttf, .otf or .woff2 — for your artist branding. Mac system fonts are always available.';
  }

  function renderAudioInfo() {
    const st = $('audioStatus');
    if (!st) return;
    if (app.audio) {
      const b = app.audio.buffer;
      const info = app.audio.info;
      $('dzTitle').textContent = 'Drop another track to replace it';
      st.textContent = '';
      st.append(
        h('strong', null, info.name),
        h('span', { class: 'muted' }, ` · ${U.fmtTime(b.duration, 0)} · ${(b.sampleRate / 1000).toFixed(1)} kHz · ${b.numberOfChannels === 1 ? 'mono' : 'stereo'}`)
      );
    } else {
      st.textContent = 'No track loaded yet — the preview is running on a demo beat.';
    }
  }

  function setAudioProgress(label, p) {
    const bar = $('audioProgress');
    if (!bar) return;
    if (label == null) {
      bar.hidden = true;
      renderAudioInfo();
      return;
    }
    bar.hidden = false;
    $('audioProgressFill').style.width = Math.round((p || 0) * 100) + '%';
    $('audioStatus').textContent = label + (p ? ` ${Math.round(p * 100)}%` : '');
  }

  const isAudioFile = (f) => /\.(wav|wave|mp3|m4a|aac|flac|ogg|oga|aif|aiff)$/i.test(f.name) || /^audio\//.test(f.type);

  async function loadAudioFile(file) {
    if (app.exporting) return;
    if (!isAudioFile(file)) {
      toast('That doesn’t look like an audio file. Use a .wav or .mp3.', { kind: 'error' });
      return;
    }
    switchTab('media');
    app.player.pause();
    setAudioProgress('Reading the file…', 0);
    try {
      const { buffer, info } = await VG.analysis.decodeFile(file);
      setAudioProgress('Analyzing your track…', 0);
      const an = new VG.analysis.AudioAnalysis(buffer);
      await an.run((p) => setAudioProgress('Analyzing your track…', p));
      app.audio = { id: U.uid(), buffer, info, file };
      app.analysis = an;
      app.player.setBuffer(buffer, buffer.duration);
      if (info.artist) app.project.artist = info.artist;
      if (info.title) app.project.title = info.title;
      $('artistInput').value = app.project.artist;
      $('titleInput').value = app.project.title;
      if (info.cover && !VG.assets.images.cover) await setImage('cover', info.cover, 'Cover art from the file');
      const ex = app.project.export;
      const len = U.clamp((ex.end || 30) - (ex.start || 0), 5, 60);
      const best = suggestSection(len);
      ex.start = best.start;
      ex.end = best.end;
      setAudioProgress(null);
      $('demoBadge').hidden = true;
      refreshExportRange();
      refreshExportInfo();
      app.dirty = true;
      edited();
      toast(`Loaded “${info.name}” (${U.fmtTime(buffer.duration, 0)}). Press space to play.`);
    } catch (e) {
      console.error(e);
      setAudioProgress(null);
      toast(e.message || 'Could not load this file.', { kind: 'error' });
    }
  }

  // The loudest stretch of the song (usually the drop) — default for "render a section".
  function suggestSection(len) {
    const an = app.analysis;
    const d = an.duration;
    if (d <= len) return { start: 0, end: d };
    const loud = an.levelNorm(20, 20000, true);
    const W = Math.round(len * an.rate);
    const ps = new Float64Array(loud.length + 1);
    for (let i = 0; i < loud.length; i++) ps[i + 1] = ps[i] + loud[i];
    let best = 0;
    let bestSum = -1;
    for (let s = 0; s + W < loud.length; s += 15) {
      const sum = ps[s + W] - ps[s];
      if (sum > bestSum) {
        bestSum = sum;
        best = s;
      }
    }
    const start = Math.max(0, best / an.rate - 1);
    return { start: Math.round(start * 10) / 10, end: Math.round(Math.min(d, start + len) * 10) / 10 };
  }

  function renderSlots() {
    const box = $('imageSlots');
    if (!box) return;
    box.textContent = '';
    for (const [slot, label] of Object.entries(VG.assets.SLOTS)) {
      const a = VG.assets.images[slot];
      const input = h('input', {
        type: 'file',
        accept: 'image/*',
        hidden: true,
        onchange: (e) => {
          const f = e.target.files[0];
          if (f) setImage(slot, f, f.name);
          e.target.value = '';
        },
      });
      const thumb = h('div', { class: 'thumb' + (a ? '' : ' empty') }, a ? h('img', { src: a.url, alt: '' }) : h('span', { html: ICON.picture }));
      const el = h(
        'div',
        { class: 'slot', dataset: { slot } },
        thumb,
        h(
          'div',
          { class: 'slot-body' },
          h('div', { class: 'slot-title' }, label),
          h('div', { class: 'muted small slot-meta' }, a ? `${a.name} · ${a.w}×${a.h}` : 'Empty'),
          h(
            'div',
            { class: 'slot-actions' },
            h('button', { class: 'btn small', type: 'button', onclick: () => input.click() }, a ? 'Replace' : 'Choose…'),
            a ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => clearImage(slot) }, 'Remove') : null
          )
        ),
        input
      );
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('over');
        hideDropOverlay();
        const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
        if (f) setImage(slot, f, f.name);
      });
      box.append(el);
    }
  }

  async function setImage(slot, blob, name) {
    try {
      const old = VG.assets.images[slot];
      await VG.assets.setImage(slot, blob, name);
      if (old) app.renderer.forgetAsset(old.id);
      renderSlots();
      renderLayerEditor();
      app.dirty = true;
    } catch (e) {
      console.error(e);
      toast('Could not open that image.', { kind: 'error' });
    }
  }

  function clearImage(slot) {
    const old = VG.assets.clearImage(slot);
    if (old) app.renderer.forgetAsset(old.id);
    renderSlots();
    renderLayerEditor();
    app.dirty = true;
  }

  // ---------------------------------------------------------------- layers tab
  function buildLayersTab() {
    const root = $('tab-layers');
    root.textContent = '';
    const palRow = h('div', { class: 'palette-row', id: 'paletteRow' });
    const palSel = h(
      'select',
      { id: 'paletteSelect' },
      h('option', { value: '' }, 'Try a palette…'),
      Object.keys(VG.project.PALETTES).map((n) => h('option', { value: n }, n))
    );
    palSel.addEventListener('change', () => {
      if (!palSel.value) return;
      app.project.palette = VG.project.PALETTES[palSel.value].slice();
      palSel.value = '';
      renderPalette();
      paletteChanged();
    });
    const seedInput = h('input', { type: 'number', id: 'seedInput', step: 1 });
    seedInput.value = app.project.seed;
    seedInput.addEventListener('change', () => {
      app.project.seed = Math.floor(Number(seedInput.value) || 0);
      edited();
    });
    const seedBtn = h(
      'button',
      {
        class: 'btn small',
        type: 'button',
        onclick: () => {
          app.project.seed = Math.floor(Math.random() * 100000);
          seedInput.value = app.project.seed;
          edited();
        },
      },
      'Shuffle'
    );
    root.append(
      section('Palette & motion', [
        palRow,
        h('div', { class: 'row' }, palSel),
        h('div', { class: 'row seed-row' }, h('span', { class: 'field-label' }, 'Motion seed'), seedInput, seedBtn),
        h('p', { class: 'muted small' }, 'Colors 1–5 are shared by every layer that uses palette colors. The seed reshuffles motion paths; the same seed always gives the same video.'),
      ])
    );
    renderPalette();

    const optionsFor = (effect) =>
      VG.layerOrder.filter((t) => (VG.layerTypes[t].category === 'effect') === effect).map((t) => h('option', { value: t }, VG.layerTypes[t].label));
    const addSel = h(
      'select',
      { class: 'add-layer', title: 'Add a new layer in front of the selected one' },
      h('option', { value: '' }, '+ Add layer…'),
      h('optgroup', { label: 'Visuals' }, optionsFor(false)),
      h('optgroup', { label: 'Effects (change the layers below them)' }, optionsFor(true))
    );
    addSel.addEventListener('change', () => {
      if (addSel.value) addLayer(addSel.value);
      addSel.value = '';
    });
    root.append(section('Layers', [h('div', { class: 'row' }, addSel), h('ul', { class: 'layer-list', id: 'layerList' }), h('p', { class: 'muted small' }, 'Top of the list = in front. Click a layer to edit it.')]));
    root.append(h('div', { id: 'layerEditor' }));
    renderLayerList();
    renderLayerEditor();
  }

  function renderPalette() {
    const row = $('paletteRow');
    if (!row) return;
    row.textContent = '';
    app.project.palette.forEach((c, i) => {
      const inp = h('input', { type: 'color', title: `Palette color ${i + 1}` });
      inp.value = c;
      inp.addEventListener('input', () => {
        app.project.palette[i] = inp.value;
        paletteChanged();
      });
      row.append(h('label', { class: 'pal-swatch' }, inp, h('span', null, String(i + 1))));
    });
  }

  const refreshEditorChips = U.debounce(() => renderLayerEditor(), 150);
  function paletteChanged() {
    edited();
    refreshEditorChips();
  }

  const iconBtn = (name, title, fn, disabled) =>
    h('button', {
      class: 'icon-btn',
      type: 'button',
      title,
      disabled: !!disabled,
      html: ICON[name],
      onclick: (e) => {
        e.stopPropagation();
        fn();
      },
    });

  function renderLayerList() {
    const list = $('layerList');
    if (!list) return;
    list.textContent = '';
    const layers = app.project.layers;
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      const def = VG.layerTypes[L.type];
      const li = h(
        'li',
        { class: 'layer-item' + (L.id === app.selectedId ? ' selected' : '') + (L.enabled ? '' : ' off'), onclick: () => selectLayer(L.id) },
        h('button', {
          class: 'icon-btn eye',
          type: 'button',
          title: L.enabled ? 'Hide layer' : 'Show layer',
          html: L.enabled ? ICON.eye : ICON.eyeOff,
          onclick: (e) => {
            e.stopPropagation();
            L.enabled = !L.enabled;
            renderLayerList();
            edited();
          },
        }),
        h('span', { class: 'layer-icon', html: ICON[def.icon] || '' }),
        h('span', { class: 'layer-name' }, L.name || def.label),
        h(
          'span',
          { class: 'layer-actions' },
          iconBtn('up', 'Move forward', () => moveLayer(i, 1), i === layers.length - 1),
          iconBtn('down', 'Move backward', () => moveLayer(i, -1), i === 0),
          iconBtn('copy', 'Duplicate', () => duplicateLayer(i)),
          iconBtn('trash', 'Delete', () => deleteLayer(i))
        )
      );
      list.append(li);
    }
  }

  function selectLayer(id) {
    app.selectedId = id;
    renderLayerList();
    renderLayerEditor();
  }

  function addLayer(type) {
    const layers = app.project.layers;
    const L = VG.project.createLayer(type);
    if (type === 'background' && layers.length === 0) layers.push(L);
    else {
      const idx = layers.findIndex((x) => x.id === app.selectedId);
      layers.splice(idx >= 0 ? idx + 1 : layers.length, 0, L);
    }
    selectLayer(L.id);
    edited();
  }

  function moveLayer(i, dir) {
    const layers = app.project.layers;
    const j = i + dir;
    if (j < 0 || j >= layers.length) return;
    [layers[i], layers[j]] = [layers[j], layers[i]];
    renderLayerList();
    edited();
  }

  function duplicateLayer(i) {
    const layers = app.project.layers;
    const copy = U.clone(layers[i]);
    copy.id = U.uid();
    copy.seed = Math.floor(Math.random() * 1e6);
    copy.name = (copy.name || VG.layerTypes[copy.type].label) + ' copy';
    layers.splice(i + 1, 0, copy);
    selectLayer(copy.id);
    edited();
  }

  function deleteLayer(i) {
    const layers = app.project.layers;
    const [removed] = layers.splice(i, 1);
    if (app.selectedId === removed.id) app.selectedId = (layers[Math.min(i, layers.length - 1)] || {}).id || null;
    renderLayerList();
    renderLayerEditor();
    edited();
    toast(`Deleted “${removed.name}”`, {
      action: {
        label: 'Undo',
        fn: () => {
          layers.splice(Math.min(i, layers.length), 0, removed);
          selectLayer(removed.id);
          edited();
        },
      },
    });
  }

  function layerCtx(L) {
    const def = VG.layerTypes[L.type];
    const layout = new Set(def.layout || []);
    const vert = () => isVertical();
    return {
      get(obj, key) {
        if (obj === L && layout.has(key) && vert() && L.v && key in L.v) return L.v[key];
        return obj[key];
      },
      set(obj, key, val) {
        if (obj === L && layout.has(key) && vert()) {
          L.v = L.v || {};
          L.v[key] = val;
        } else obj[key] = val;
        if (key === 'name') renderLayerList();
        edited();
      },
      view(obj) {
        return obj === L && vert() && L.v ? Object.assign({}, L, L.v) : obj;
      },
      defaultOf(obj, key) {
        if (obj !== L) return undefined;
        if (key === 'opacity') return 1;
        if (key === 'upright') return !!def.upright;
        return def.defaults[key];
      },
      palette: () => app.project.palette,
      addMeter,
      changed: edited,
      collapsed: app.collapsed,
      rerender: renderLayerEditor,
    };
  }

  function renderLayerEditor() {
    const box = $('layerEditor');
    if (!box) return;
    box.textContent = '';
    const L = app.project.layers.find((x) => x.id === app.selectedId);
    if (!L) {
      box.append(h('p', { class: 'muted pad' }, 'Select a layer above to edit it.'));
      return;
    }
    const def = VG.layerTypes[L.type];
    const name = h('input', { type: 'text', class: 'layer-name-input', spellcheck: false, title: 'Layer name' });
    name.value = L.name || def.label;
    name.addEventListener('input', () => {
      L.name = name.value;
      renderLayerList();
      scheduleSave();
    });
    name.addEventListener('keydown', (e) => e.stopPropagation());
    const headEl = h(
      'div',
      { class: 'panel editor-head' },
      h('div', { class: 'editor-title' }, h('span', { class: 'layer-icon', html: ICON[def.icon] || '' }), name),
      h('p', { class: 'muted small' }, def.blurb)
    );
    if (def.category === 'effect') {
      headEl.append(h('p', { class: 'note' }, 'Effect layer: it changes everything listed below it. Move it up or down to choose what it affects.'));
    }
    if (isVertical() && def.layout && def.layout.length) {
      headEl.append(h('p', { class: 'note' }, 'You are editing the vertical (9:16) layout. Position and size changes here only apply to vertical videos.'));
    }
    box.append(headEl);
    const body = h('div', { class: 'editor-body' });
    box.append(body);
    const common = {
      group: 'Layer blending',
      items: [
        { key: 'opacity', type: 'range', label: 'Opacity', min: 0, max: 1, step: 0.01, fmt: 'pct' },
        { key: 'blend', type: 'select', label: 'Blend mode', options: [['normal', 'Normal'], ['add', 'Add (glowy)'], ['screen', 'Screen (soft light)'], ['multiply', 'Multiply (darken)']] },
        { key: 'upright', type: 'toggle', label: 'Stay upright when the picture spins', show: () => !!app.project.fx.camera.spin },
      ],
    };
    VG.ui.controls.build(body, [...def.controls, common], L, layerCtx(L));
  }

  // ---------------------------------------------------------------- effects tab
  function buildEffects() {
    const root = $('tab-effects');
    root.textContent = '';
    root.append(h('p', { class: 'muted small pad' }, 'Effects apply to the whole picture, after all layers are drawn.'));
    const body = h('div', { class: 'fx-body' });
    root.append(body);
    const fx = app.project.fx;
    VG.ui.controls.build(body, VG.project.FX_CONTROLS, fx, {
      get: (o, k) => o[k],
      set: (o, k, v) => {
        // Layers show "Stay upright when the picture spins" only while the picture spins.
        const spinSwitched = o === fx.camera && k === 'spin' && !o.spin !== !v;
        o[k] = v;
        edited();
        if (spinSwitched) refreshEditorChips();
      },
      view: (o) => o,
      defaultOf: (o, k) => {
        for (const [g, d] of Object.entries(VG.project.FX_DEFAULTS)) if (fx[g] === o) return d[k];
        return undefined;
      },
      palette: () => app.project.palette,
      addMeter,
      changed: edited,
      collapsed: app.collapsed,
      rerender: buildEffects,
    });
  }

  // ---------------------------------------------------------------- export tab
  function seg(label, options, value, onChange) {
    const box = h('div', { class: 'seg' });
    const buttons = options.map(([v, l]) => {
      const b = h('button', { type: 'button', class: 'seg-btn' + (String(v) === String(value) ? ' on' : '') }, l);
      b.addEventListener('click', () => {
        for (const x of buttons) x.classList.remove('on');
        b.classList.add('on');
        onChange(v);
      });
      return b;
    });
    box.append(...buttons);
    return h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-label' }, label)), box);
  }

  function buildExport() {
    const root = $('tab-export');
    root.textContent = '';
    const ex = app.project.export;
    const changed = () => {
      refreshExportInfo();
      edited();
    };
    root.append(
      section('Format', [
        seg('Resolution', [['1080', '1080p'], ['1440', '1440p'], ['2160', '4K']], ex.resolution, (v) => {
          ex.resolution = v;
          changed();
        }),
        seg('Orientation', [['landscape', 'Landscape 16:9'], ['vertical', 'Vertical 9:16']], ex.orientation, (v) => {
          ex.orientation = v;
          layoutPreview();
          renderLayerEditor();
          changed();
        }),
        seg('Frame rate', [[30, '30 fps'], [60, '60 fps']], ex.fps, (v) => {
          ex.fps = Number(v);
          changed();
        }),
        seg('Quality', [['light', 'Light'], ['standard', 'Standard'], ['high', 'High']], ex.quality, (v) => {
          ex.quality = v;
          changed();
        }),
        h('div', { class: 'info', id: 'qualityInfo' }),
      ])
    );

    const startIn = h('input', { type: 'text', id: 'secStart', class: 'time-input', spellcheck: false });
    const endIn = h('input', { type: 'text', id: 'secEnd', class: 'time-input', spellcheck: false });
    const commitTimes = () => {
      const s = U.parseTime(startIn.value);
      const e = U.parseTime(endIn.value);
      if (isFinite(s)) ex.start = s;
      if (isFinite(e)) ex.end = e;
      refreshExportRange();
      changed();
    };
    for (const inp of [startIn, endIn]) {
      inp.addEventListener('change', commitTimes);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') inp.blur();
        e.stopPropagation();
      });
    }
    const setFromPlayhead = (which) => {
      const t = app.player.time();
      if (which === 'start') ex.start = Math.min(t, getRange().end - 0.5);
      else ex.end = Math.max(t, getRange().start + 0.5);
      refreshExportRange();
      changed();
    };
    const sectionBox = h(
      'div',
      { id: 'sectionBox', class: 'section-box' },
      h('div', { class: 'time-row' }, h('span', { class: 'field-label' }, 'Start'), startIn, h('button', { class: 'btn small', type: 'button', onclick: () => setFromPlayhead('start') }, 'Use playhead')),
      h('div', { class: 'time-row' }, h('span', { class: 'field-label' }, 'End'), endIn, h('button', { class: 'btn small', type: 'button', onclick: () => setFromPlayhead('end') }, 'Use playhead')),
      h(
        'div',
        { class: 'time-row' },
        h('span', { class: 'muted small', id: 'secLength' }),
        h(
          'button',
          {
            class: 'btn small ghost',
            type: 'button',
            title: 'Jump to the loudest part of the song',
            onclick: () => {
              if (!app.audio) return;
              const r = getRange();
              const best = suggestSection(U.clamp(r.end - r.start, 5, 120));
              ex.start = best.start;
              ex.end = best.end;
              refreshExportRange();
              changed();
              seekTo(ex.start);
            },
          },
          'Find the drop'
        )
      ),
      h('p', { class: 'muted small' }, 'Tip: drag the cyan handles on the timeline under the preview.')
    );
    const fadeBox = h('div');
    VG.ui.controls.build(
      fadeBox,
      [
        {
          group: 'Fades',
          items: [
            { key: 'fadeIn', type: 'range', label: 'Fade in from black', min: 0, max: 5, step: 0.1, fmt: 's' },
            { key: 'fadeOut', type: 'range', label: 'Fade out to black', min: 0, max: 10, step: 0.1, fmt: 's' },
            { key: 'fadeAudio', type: 'toggle', label: 'Fade the audio too (nice for teasers)' },
          ],
        },
      ],
      ex,
      {
        get: (o, k) => o[k],
        set: (o, k, v) => {
          o[k] = v;
          edited();
        },
        view: (o) => o,
        defaultOf: (o, k) => VG.project.EXPORT_DEFAULTS[k],
        palette: () => app.project.palette,
        changed: edited,
      }
    );
    root.append(
      section('What to render', [
        seg('Range', [['full', 'Whole track'], ['section', 'Just a section']], ex.range, (v) => {
          ex.range = v;
          refreshExportRange();
          changed();
        }),
        sectionBox,
        fadeBox,
      ])
    );

    const generate = [];
    if (window.showSaveFilePicker) {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = ex.saveToDisk;
      cb.addEventListener('change', () => {
        ex.saveToDisk = cb.checked;
        edited();
      });
      generate.push(
        h('label', { class: 'ctl ctl-toggle' }, cb, h('span', { class: 'switch', 'aria-hidden': 'true' }), h('span', { class: 'toggle-label' }, 'Choose where to save first, then write to disk while rendering (best for long or 4K videos)'))
      );
    }
    generate.push(
      h('div', { class: 'summary', id: 'exportSummary' }),
      h('button', { class: 'btn primary big', id: 'btnExport', type: 'button', onclick: startExport }, 'Generate video'),
      h('button', { class: 'btn danger big', id: 'btnStopExport', type: 'button', hidden: true, onclick: () => app.exportAbort && app.exportAbort.abort() }, 'Stop rendering'),
      h('div', { id: 'supportNotes' })
    );
    root.append(section('Generate', generate));
    root.append(
      section('Tips for YouTube', [
        h(
          'ul',
          { class: 'tips' },
          h('li', null, 'Upload in 1440p or 4K even if most people watch in 1080p: YouTube then uses better compression, which makes the 1080p version look better too.'),
          h('li', null, 'Glows and dark gradients can band after YouTube compresses them. A little film grain (Effects tab) hides it.'),
          h('li', null, 'Use your WAV master: the audio is compressed once, at 320 kbps AAC.'),
          h('li', null, 'Vertical + “Just a section” + fades = a quick Short / Reel / TikTok teaser.')
        ),
      ])
    );
    refreshExportRange();
    refreshExportInfo();
    renderSupport();
  }

  function refreshExportRange() {
    const ex = app.project.export;
    const box = $('sectionBox');
    if (!box) return;
    box.hidden = ex.range !== 'section';
    const r = getRange();
    if (document.activeElement !== $('secStart')) $('secStart').value = U.fmtTime(ex.range === 'section' ? r.start : ex.start);
    if (document.activeElement !== $('secEnd')) $('secEnd').value = U.fmtTime(ex.range === 'section' ? r.end : ex.end);
    $('secLength').textContent = `Length: ${U.fmtTime(r.end - r.start)}`;
    refreshExportInfo();
  }

  function refreshExportInfo() {
    const ex = app.project.export;
    const qi = $('qualityInfo');
    if (!qi) return;
    const [W, H] = VG.exporter.dims(ex);
    const r = getRange();
    const secs = Math.max(0, r.end - r.start);
    const mbps = VG.exporter.videoBitrate(ex) / 1e6;
    qi.textContent = `${mbps} Mbps video + 320 kbps audio · about ${U.fmtBytes(VG.exporter.estimateBytes(ex, 60))} per minute`;
    const sum = $('exportSummary');
    sum.textContent = '';
    if (!app.audio) {
      sum.append(h('div', { class: 'warn' }, 'Load your track in the Media tab first.'));
    } else {
      const frames = Math.round(secs * ex.fps);
      sum.append(
        h('div', null, h('strong', null, `${W}×${H}`), ` · ${ex.fps} fps · ${U.fmtTime(secs, 1)}`),
        h('div', { class: 'muted' }, `≈ ${U.fmtBytes(VG.exporter.estimateBytes(ex, secs))} · ${frames.toLocaleString()} frames · MP4 (H.264 + AAC)`)
      );
    }
    $('btnExport').disabled = !app.audio || app.exporting;
    $('btnExport').hidden = !!app.exporting;
    $('btnStopExport').hidden = !app.exporting;
  }

  function renderSupport() {
    const box = $('supportNotes');
    if (!box) return;
    box.textContent = '';
    for (const [kind, msg] of app.support) box.append(h('div', { class: 'notice ' + kind }, msg));
  }

  async function checkSupport() {
    const notes = [];
    if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
      notes.push(['error', 'This browser can’t create videos. Please open this page in Google Chrome (or Microsoft Edge).']);
    } else {
      try {
        const v = await Mediabunny.canEncodeVideo('avc', { width: 1920, height: 1080, quality: new Mediabunny.Quality({ bitrate: 12e6 }), frameRate: 60 });
        if (!v) notes.push(['error', 'H.264 video encoding isn’t available in this browser. Please use Google Chrome.']);
        const a = await Mediabunny.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000, quality: new Mediabunny.Quality({ bitrate: 320000 }) });
        if (!a) notes.push(['warn', 'AAC audio isn’t available in this browser, so audio will be saved as Opus (YouTube accepts it).']);
      } catch (e) {
        notes.push(['warn', 'Could not check video support: ' + e.message]);
      }
    }
    if (!window.showSaveFilePicker) {
      notes.push(['info', 'This browser can’t write to disk while rendering, so the video stays in memory until it’s done. Very long 4K videos might not fit.']);
    }
    app.support = notes;
    renderSupport();
  }

  // Real full screen when the browser allows it; embedded browsers (like an app's browser pane)
  // may silently refuse, so fall back to filling the window.
  function toggleFullscreen() {
    const frame = $('frame');
    if (document.fullscreenElement) return void document.exitFullscreen();
    if (frame.classList.contains('window-fill')) return void frame.classList.remove('window-fill');
    const fallback = () => {
      if (!document.fullscreenElement) frame.classList.add('window-fill');
    };
    if (!document.fullscreenEnabled || !frame.requestFullscreen) return fallback();
    frame.requestFullscreen().then(() => setTimeout(fallback, 250), fallback);
  }

  function suggestedName() {
    const ex = app.project.export;
    const p = app.project;
    const base = [p.artist, p.title].filter((s) => s && s.trim()).join(' - ') || 'visualizer';
    const res = { 1080: '1080p', 1440: '1440p', 2160: '4K' }[ex.resolution] || ex.resolution;
    const tags = [res + ex.fps, ex.orientation === 'vertical' ? 'vertical' : '', ex.range === 'section' ? 'clip' : ''].filter(Boolean).join(' ');
    return U.sanitizeFilename(`${base} (${tags})`) + '.mp4';
  }

  async function keepAwake(on) {
    try {
      if (on && navigator.wakeLock) app.wakeLock = await navigator.wakeLock.request('screen');
      else if (!on && app.wakeLock) {
        await app.wakeLock.release();
        app.wakeLock = null;
      }
    } catch (e) {
      /* not critical */
    }
  }

  async function startExport() {
    if (app.exporting) return;
    if (!app.audio) {
      toast('Load your track first (Media tab).', { kind: 'error' });
      switchTab('media');
      return;
    }
    const ex = app.project.export;
    const range = getRange();
    const name = suggestedName();
    const est = VG.exporter.estimateBytes(ex, range.end - range.start);
    let fileHandle = null;
    if (ex.saveToDisk && window.showSaveFilePicker) {
      try {
        fileHandle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] });
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn('Save picker failed, falling back to download:', e);
      }
    }
    if (!fileHandle && est > 1.8e9 && !confirm(`This video will be about ${U.fmtBytes(est)} and has to fit in memory before downloading. Continue?`)) return;

    app.exporting = true;
    refreshExportInfo();
    app.player.pause();
    document.body.classList.add('exporting');
    const [W, H] = VG.exporter.dims(ex);
    const thumb = $('exportThumb');
    thumb.width = W >= H ? 480 : 270;
    thumb.height = W >= H ? 270 : 480;
    thumb.getContext('2d').clearRect(0, 0, thumb.width, thumb.height);
    $('exportTitle').textContent = `Rendering ${W}×${H} · ${ex.fps} fps`;
    $('exportFill').style.width = '0%';
    $('exportStats').textContent = 'Preparing…';
    $('exportOverlay').hidden = false;
    refreshExportInfo();
    keepAwake(true);
    const ctrl = new AbortController();
    app.exportAbort = ctrl;
    const fps = ex.fps;
    try {
      const res = await VG.exporter.run({
        project: U.clone(app.project),
        assets: VG.assets,
        analysis: app.analysis,
        audioBuffer: app.audio.buffer,
        range,
        fileHandle,
        signal: ctrl.signal,
        onProgress: (p) => {
          const frac = p.done / p.total;
          $('exportFill').style.width = (frac * 100).toFixed(1) + '%';
          if (p.finalizing) {
            $('exportStats').textContent = 'Finishing the file…';
            return;
          }
          const speed = p.done / Math.max(0.001, p.elapsed);
          const left = (p.total - p.done) / Math.max(0.001, speed);
          $('exportStats').textContent = `${Math.floor(frac * 100)}% · frame ${p.done.toLocaleString()} of ${p.total.toLocaleString()} · ${speed.toFixed(0)} fps (${(speed / fps).toFixed(1)}× real time) · about ${U.fmtDuration(left)} left`;
          $('topStatus').textContent = `Rendering… ${Math.floor(frac * 100)}%`;
        },
        onFrame: (canvas) => {
          try {
            thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
          } catch (e) {
            /* thumbnail is cosmetic */
          }
        },
      });
      app.lastResult = res;
      if (res.blob) U.downloadBlob(res.blob, name);
      toast(`Done! ${res.name || name} · ${U.fmtBytes(res.bytes)} · rendered in ${U.fmtDuration(res.seconds)}`, { timeout: 15000 });
    } catch (e) {
      if (e.name === 'AbortError') toast('Export canceled.' + (fileHandle ? ' You can delete the unfinished file.' : ''));
      else {
        console.error(e);
        toast('Export failed: ' + (e.message || e), { kind: 'error', timeout: 15000 });
      }
    } finally {
      app.exporting = false;
      refreshExportInfo();
      app.exportAbort = null;
      document.body.classList.remove('exporting');
      $('exportOverlay').hidden = true;
      $('topStatus').textContent = '';
      keepAwake(false);
      refreshExportInfo();
      app.dirty = true;
    }
  }

  // ---------------------------------------------------------------- looks (presets)
  function buildLookBar() {
    const sel = $('lookSelect');
    sel.textContent = '';
    sel.append(h('option', { value: '', disabled: true }, 'Custom look'));
    const groups = new Map();
    for (const p of VG.presets.LIST) {
      const g = p.group || 'Looks';
      if (!groups.has(g)) {
        groups.set(g, h('optgroup', { label: g }));
        sel.append(groups.get(g));
      }
      groups.get(g).append(h('option', { value: p.id, title: p.blurb }, p.name));
    }
    sel.value = app.project.look || '';
    sel.addEventListener('change', () => applyLook(sel.value));
    $('btnResetLook').addEventListener('click', () => {
      if (app.project.look) applyLook(app.project.look);
      else toast('This is a custom look — pick one from the list to start over.');
    });
    $('btnSurprise').addEventListener('click', surprise);
    $('btnSaveLook').addEventListener('click', saveLook);
    $('btnLoadLook').addEventListener('click', () => $('lookFile').click());
    $('lookFile').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) loadLookFile(f);
      e.target.value = '';
    });
  }

  const snapshotLook = () => {
    const p = app.project;
    return U.clone({ look: p.look, palette: p.palette, seed: p.seed, layers: p.layers, fx: p.fx });
  };

  function restoreLook(s) {
    Object.assign(app.project, U.clone(s));
    afterLookChange();
  }

  function afterLookChange() {
    const layers = app.project.layers;
    const front = [...layers].reverse().find((L) => L.enabled && L.type !== 'text') || layers[layers.length - 1];
    app.selectedId = front ? front.id : null;
    $('lookSelect').value = app.project.look || '';
    buildLayersTab();
    buildEffects();
    edited();
  }

  function applyLook(id) {
    const before = snapshotLook();
    if (!VG.presets.apply(app.project, id)) return;
    afterLookChange();
    const p = VG.presets.LIST.find((x) => x.id === id);
    toast(`Look: ${p.name}. ${p.blurb}`, { action: { label: 'Undo', fn: () => restoreLook(before) } });
  }

  function surprise() {
    const looks = VG.presets.LIST.filter((p) => p.id !== 'blank');
    const look = looks[Math.floor(Math.random() * looks.length)];
    const before = snapshotLook();
    VG.presets.apply(app.project, look.id);
    const names = Object.keys(VG.project.PALETTES);
    const pal = names[Math.floor(Math.random() * names.length)];
    app.project.palette = VG.project.PALETTES[pal].slice();
    app.project.seed = Math.floor(Math.random() * 100000);
    afterLookChange();
    toast(`Surprise: ${look.name} with the “${pal}” palette`, { action: { label: 'Undo', fn: () => restoreLook(before) } });
  }

  function saveLook() {
    const p = app.project;
    const preset = VG.presets.LIST.find((x) => x.id === p.look);
    const name = preset ? preset.name : 'My look';
    const data = { app: 'visualizer-studio', kind: 'look', version: 1, name, palette: p.palette, seed: p.seed, layers: p.layers, fx: p.fx };
    U.downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), U.sanitizeFilename(name) + '.look.json');
  }

  async function loadLookFile(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.layers)) throw new Error('Not a look file');
      const before = snapshotLook();
      if (Array.isArray(data.palette) && data.palette.length >= 5) app.project.palette = data.palette.slice(0, 5);
      if (Number.isFinite(data.seed)) app.project.seed = data.seed;
      app.project.layers = VG.project.normalizeLayers(data.layers);
      app.project.fx = VG.project.normalizeFx(data.fx);
      app.project.look = '';
      afterLookChange();
      toast(`Loaded look “${data.name || file.name}”`, { action: { label: 'Undo', fn: () => restoreLook(before) } });
    } catch (e) {
      toast('That file isn’t a look saved by this app.', { kind: 'error' });
    }
  }

  // ---------------------------------------------------------------- drag & drop, keys
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  let dragDepth = 0;
  function hideDropOverlay() {
    dragDepth = 0;
    $('dropOverlay').hidden = true;
  }

  function setupDrop() {
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e) || app.exporting) return;
      dragDepth++;
      $('dropOverlay').hidden = false;
    });
    window.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) $('dropOverlay').hidden = true;
    });
    window.addEventListener('dragover', (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      hideDropOverlay();
      if (app.exporting) return;
      const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
      const audio = files.find(isAudioFile);
      const img = files.find((f) => f.type.startsWith('image/'));
      const json = files.find((f) => /\.json$/i.test(f.name));
      if (audio) loadAudioFile(audio);
      if (img) {
        if (!VG.assets.images.cover) setImage('cover', img, img.name);
        else {
          switchTab('media');
          toast('Drop images onto one of the slots (cover art, logo, background).');
        }
      }
      if (json) loadLookFile(json);
    });
  }

  function setupKeys() {
    window.addEventListener('keydown', (e) => {
      const el = e.target;
      const tag = (el.tagName || '').toLowerCase();
      const typing = tag === 'textarea' || tag === 'select' || (tag === 'input' && el.type !== 'range' && el.type !== 'checkbox') || el.isContentEditable;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        if (tag === 'button') return;
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'Escape' && $('frame').classList.contains('window-fill')) {
        $('frame').classList.remove('window-fill');
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tag !== 'input') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 5;
        seekTo(app.player.time() + (e.key === 'ArrowLeft' ? -step : step));
      } else if (e.key === 'Home' && tag !== 'input') {
        seekTo(0);
      }
    });
  }

  // ---------------------------------------------------------------- init
  function freshProject() {
    const p = VG.project.defaultProject();
    VG.presets.apply(p, 'la-echo');
    return p;
  }

  function init() {
    app.project = loadSaved() || freshProject();
    try {
      app.renderer = new VG.Renderer($('preview'));
    } catch (e) {
      document.body.innerHTML = '';
      document.body.append(h('div', { class: 'fatal' }, h('h2', null, 'This browser can’t run the visualizer'), h('p', null, e.message + ' Please open this page in Google Chrome.')));
      return;
    }
    app.player.duration = app.analysis.duration;
    app.player.onState = updatePlayButton;
    updatePlayButton();

    for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => switchTab(b.dataset.tab));
    buildLookBar();
    buildMedia();
    buildLayersTab();
    buildEffects();
    buildExport();
    afterLookChangeSelection();

    $('btnPlay').addEventListener('click', togglePlay);
    $('btnCancelExport').addEventListener('click', () => app.exportAbort && app.exportAbort.abort());
    $('btnFullscreen').addEventListener('click', toggleFullscreen);
    const vol = $('volume');
    vol.value = app.player.volume;
    vol.addEventListener('input', () => app.player.setVolume(Number(vol.value)));
    const pq = $('previewQuality');
    pq.value = app.project.previewQuality;
    pq.addEventListener('change', () => {
      app.project.previewQuality = pq.value;
      layoutPreview();
      edited();
    });
    $('loopSection').addEventListener('change', () => (app.dirty = true));
    setupTimeline();
    setupDrop();
    setupKeys();
    new ResizeObserver(() => layoutPreview()).observe($('viewport'));
    layoutPreview();
    checkSupport();
    $('preview').addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      toast('The graphics context was lost. Please reload the page.', { kind: 'error', timeout: 20000 });
    });
    window.addEventListener('beforeunload', saveNow);
    requestAnimationFrame(loop);
  }

  function afterLookChangeSelection() {
    const layers = app.project.layers;
    const front = [...layers].reverse().find((L) => L.enabled && L.type !== 'text') || layers[layers.length - 1];
    app.selectedId = front ? front.id : null;
    renderLayerList();
    renderLayerEditor();
  }

  // Exposed for debugging and automated checks.
  Object.assign(app, { loadAudioFile, startExport, applyLook, setImage, getRange, toast });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.VG);
