'use strict';
// Audio decoding and analysis.
//
// The whole song is analyzed up front at a fixed rate (60 analysis frames per second):
//   • a log-spaced spectrum (192 bands, 20 Hz – 20 kHz) for spectrum visuals,
//   • per-band levels from a time-domain filter bank (good timing for kicks/bass),
//   • transient "hits" (kick / snare / hats / custom) found by onset detection.
// Every visual parameter that reacts to audio uses a *binding*:
//   { source, lo, hi, gain, attack, release, threshold, punch }
// which is turned into a precomputed envelope. Because everything is precomputed,
// any moment of the song can be rendered instantly and identically (preview == export).
(function (VG) {
  const U = VG.util;
  const RATE = 60;
  const NB = 192;
  const F_MIN = 20;

  const SOURCES = {
    none: { label: 'Nothing (no reaction)', kind: 'none' },
    sub: { label: 'Sub (20–60 Hz)', kind: 'level', lo: 20, hi: 60 },
    bass: { label: 'Bass (60–250 Hz)', kind: 'level', lo: 60, hi: 250 },
    lowmid: { label: 'Low-mids (250–800 Hz)', kind: 'level', lo: 250, hi: 800 },
    mid: { label: 'Mids (0.8–2.5 kHz)', kind: 'level', lo: 800, hi: 2500 },
    high: { label: 'Highs (2.5–8 kHz)', kind: 'level', lo: 2500, hi: 8000 },
    air: { label: 'Air (8–20 kHz)', kind: 'level', lo: 8000, hi: 20000 },
    loud: { label: 'Loudness (whole mix)', kind: 'level', lo: 20, hi: 20000, full: true },
    custom: { label: 'Custom range (level)…', kind: 'level', custom: true },
    kick: { label: 'Kick hits', kind: 'hits', lo: 35, hi: 120, minGap: 0.1 },
    snare: { label: 'Snare / clap hits', kind: 'hits', lo: 1200, hi: 5000, minGap: 0.12 },
    hats: { label: 'Hi-hat hits', kind: 'hits', lo: 7000, hi: 16000, minGap: 0.05 },
    customHits: { label: 'Custom range (hits)…', kind: 'hits', custom: true, minGap: 0.08 },
  };

  const SOURCE_GROUPS = [
    ['Levels — follow the energy', ['sub', 'bass', 'lowmid', 'mid', 'high', 'air', 'loud', 'custom']],
    ['Hits — trigger on transients', ['kick', 'snare', 'hats', 'customHits']],
    ['Off', ['none']],
  ];

  const binding = (source = 'bass', extra = {}) =>
    Object.assign(
      { source, lo: 40, hi: 120, gain: 1, attack: 0.005, release: 0.18, threshold: 0, punch: 1.5 },
      extra
    );

  function sampleArr(arr, x) {
    const n = arr.length;
    if (!(x > 0)) return arr[0];
    if (x >= n - 1) return arr[n - 1];
    const i = Math.floor(x);
    return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
  }

  // RBJ biquad coefficients, normalized: [b0, b1, b2, a1, a2]
  function biquad(type, f, sr, q = Math.SQRT1_2) {
    const w = (2 * Math.PI * f) / sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    let b0, b1, b2;
    if (type === 'lp') {
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = (1 - cw) / 2;
    } else {
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = (1 + cw) / 2;
    }
    return [b0 / a0, b1 / a0, b2 / a0, (-2 * cw) / a0, (1 - alpha) / a0];
  }

  // Map dB values to 0..1 using the track's own dynamics ("auto-calibration"):
  // the loudest moments land near 1 and the quiet parts near 0.
  function normalizeDb(db, range) {
    const n = db.length;
    const out = new Float32Array(n);
    const step = Math.max(1, Math.floor(n / 20000));
    const sample = [];
    for (let i = 0; i < n; i += step) sample.push(db[i]);
    sample.sort((a, b) => a - b);
    const q = (p) => sample[U.clamp(Math.round(p * (sample.length - 1)), 0, sample.length - 1)];
    const ceil = q(0.995);
    if (ceil < -80) return out; // the band is basically silent in this track
    let floor = Math.max(q(0.1), ceil - range);
    if (ceil - floor < 6) floor = ceil - 6;
    const inv = 1 / (ceil - floor);
    for (let i = 0; i < n; i++) out[i] = U.clamp((db[i] - floor) * inv, 0, 1);
    return out;
  }

  class AnalysisBase {
    constructor() {
      this.rate = RATE;
      this.nb = NB;
      this._env = new Map();
      this._cum = new Map();
      this._events = new Map();
    }

    resolve(b) {
      if (!b) return null;
      const src = SOURCES[b.source];
      if (!src || src.kind === 'none') return null;
      let lo = src.lo;
      let hi = src.hi;
      if (src.custom) {
        lo = U.clamp(Number(b.lo) || 20, 10, 20000);
        hi = U.clamp(Number(b.hi) || 200, lo + 5, 22000);
      }
      return { kind: src.kind, lo, hi, full: !!src.full, minGap: src.minGap || 0.08 };
    }

    _key(b, r) {
      return [r.kind, r.lo, r.hi, r.full ? 1 : 0, +b.attack || 0, +b.release || 0, +b.threshold || 0, +b.punch || 1].join('|');
    }

    envelope(b) {
      const r = this.resolve(b);
      if (!r) return null;
      const key = this._key(b, r);
      let env = this._env.get(key);
      if (env) return env;
      const n = this.frames;
      env = new Float32Array(n);
      const attack = Math.max(0, Number(b.attack) || 0);
      const release = Math.max(0.005, Number(b.release) || 0.15);
      const thr = U.clamp(Number(b.threshold) || 0, 0, 0.95);
      const punch = U.clamp(Number(b.punch) || 1, 0.25, 5);
      if (r.kind === 'level') {
        const lv = this.levelNorm(r.lo, r.hi, r.full);
        const aA = attack > 0 ? Math.exp(-1 / (attack * RATE)) : 0;
        const aR = Math.exp(-1 / (release * RATE));
        let y = 0;
        for (let i = 0; i < n; i++) {
          let x = (lv[i] - thr) / (1 - thr);
          x = x <= 0 ? 0 : Math.pow(x, punch);
          y = x > y ? aA * y + (1 - aA) * x : aR * y + (1 - aR) * x;
          env[i] = y;
        }
      } else {
        // Hits: each detected transient fires a pulse that decays with `release`.
        // With attack > 0 the pulse starts rising *before* the hit, so the peak lands
        // exactly on it — only possible because we know the whole song in advance.
        const on = this.onsets(r.lo, r.hi, r.minGap);
        const relF = release * RATE;
        const attF = attack * RATE;
        for (let j = 0; j < on.frames.length; j++) {
          const s = on.strength[j];
          if (s < thr) continue;
          const amp = Math.pow(s, punch);
          const k0 = on.frames[j];
          if (attF >= 1) {
            for (let k = Math.max(0, Math.floor(k0 - attF)); k < k0; k++) {
              const v = amp * (1 - (k0 - k) / attF);
              if (v > env[k]) env[k] = v;
            }
          }
          const kEnd = Math.min(n, k0 + Math.ceil(relF * 8) + 1);
          for (let k = k0; k < kEnd; k++) {
            const v = amp * Math.exp(-(k - k0) / relF);
            if (v > env[k]) env[k] = v;
          }
        }
      }
      this._env.set(key, env);
      return env;
    }

    // Envelope value (≈0..1, times gain) at time t in seconds.
    value(b, t) {
      const env = this.envelope(b);
      if (!env) return 0;
      return sampleArr(env, t * RATE) * (b.gain == null ? 1 : +b.gain);
    }

    // Integral of the envelope from 0 to t. Feeding this into a motion's "travel time"
    // makes things move faster when the music is louder, while staying seekable.
    integral(b, t) {
      const r = this.resolve(b);
      if (!r) return 0;
      const key = this._key(b, r);
      let cum = this._cum.get(key);
      const env = this.envelope(b);
      if (!cum) {
        cum = new Float64Array(env.length);
        for (let i = 1; i < env.length; i++) cum[i] = cum[i - 1] + ((env[i - 1] + env[i]) * 0.5) / RATE;
        this._cum.set(key, cum);
      }
      const x = t * RATE;
      const n = cum.length;
      let v;
      if (!(x > 0)) v = 0;
      else if (x >= n - 1) v = cum[n - 1] + ((x - (n - 1)) / RATE) * env[n - 1];
      else v = sampleArr(cum, x);
      return v * (b.gain == null ? 1 : +b.gain);
    }

    // Moments that count as a "beat" for this binding: each hit (above the threshold) for hit
    // sources, or each time the level jumps up past ~60% for level sources.
    events(b) {
      const r = this.resolve(b);
      if (!r) return null;
      const key = this._key(b, r);
      let ev = this._events.get(key);
      if (ev) return ev;
      const out = [];
      if (r.kind === 'hits') {
        const thr = U.clamp(Number(b.threshold) || 0, 0, 0.95);
        const on = this.onsets(r.lo, r.hi, r.minGap);
        for (let i = 0; i < on.frames.length; i++) if (on.strength[i] >= thr) out.push(on.frames[i] / RATE);
      } else {
        const env = this.envelope(b);
        let armed = true;
        for (let k = 0; k < env.length; k++) {
          if (armed && env[k] > 0.6) {
            out.push(k / RATE);
            armed = false;
          } else if (!armed && env[k] < 0.4) armed = true;
        }
      }
      ev = Float64Array.from(out);
      this._events.set(key, ev);
      return ev;
    }

    // How many beat events happened up to time t, and when the latest one was.
    hitInfo(b, t) {
      const ev = this.events(b);
      if (!ev || !ev.length) return { count: 0, last: -1e9 };
      let lo = 0;
      let hi = ev.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ev[mid] <= t) lo = mid + 1;
        else hi = mid;
      }
      return { count: lo, last: lo ? ev[lo - 1] : -1e9 };
    }

    // A smooth beat counter: every beat adds an eased 0→1 ramp lasting `dur` seconds, and the
    // ramps add up, so beats that come faster than `dur` blend into one continuous motion.
    easedCount(b, t, dur) {
      const ev = this.events(b);
      if (!ev || !ev.length) return 0;
      dur = Math.max(0.01, dur);
      let lo = 0;
      let hi = ev.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ev[mid] <= t) lo = mid + 1;
        else hi = mid;
      }
      let sum = 0;
      for (let j = lo - 1; j >= 0; j--) {
        const age = t - ev[j];
        if (age >= dur) {
          sum += j + 1;
          break;
        }
        const x = age / dur;
        sum += x * x * (3 - 2 * x);
      }
      return sum;
    }

    // Fractional spectrum band index for a frequency in Hz.
    bandOf(f) {
      return (NB * Math.log(Math.max(f, F_MIN) / F_MIN)) / Math.log(this.fMax / F_MIN) - 0.5;
    }

    // Fill `out` (length NB) with the spectrum at time t. `release` (seconds) makes bars
    // fall smoothly: a decaying maximum over the recent past (stateless, so seeking works).
    spectrumAt(t, out, release) {
      const data = this.spec;
      const n = this.frames;
      const x = U.clamp(t * RATE, 0, n - 1);
      const k0 = Math.floor(x);
      const k1 = Math.min(n - 1, k0 + 1);
      const f = x - k0;
      const b0 = k0 * NB;
      const b1 = k1 * NB;
      for (let b = 0; b < NB; b++) out[b] = data[b0 + b] + (data[b1 + b] - data[b0 + b]) * f;
      if (release > 0.001) {
        const tau = release * RATE;
        const R = Math.min(Math.ceil(tau * 4), 120);
        for (let kk = k0; kk >= Math.max(0, k0 - R); kk--) {
          const w = Math.exp(-(x - kk) / tau);
          const base = kk * NB;
          for (let b = 0; b < NB; b++) {
            const v = data[base + b] * w;
            if (v > out[b]) out[b] = v;
          }
        }
      }
      return out;
    }
  }

  class AudioAnalysis extends AnalysisBase {
    constructor(buffer) {
      super();
      this.buffer = buffer;
      this.sr = buffer.sampleRate;
      this.duration = buffer.duration;
      const len = buffer.length;
      const ch = buffer.numberOfChannels;
      const mono = new Float32Array(len);
      for (let c = 0; c < ch; c++) {
        const d = buffer.getChannelData(c);
        for (let i = 0; i < len; i++) mono[i] += d[i];
      }
      if (ch > 1) {
        const s = 1 / ch;
        for (let i = 0; i < len; i++) mono[i] *= s;
      }
      let peak = 0;
      for (let i = 0; i < len; i++) {
        const a = mono[i] < 0 ? -mono[i] : mono[i];
        if (a > peak) peak = a;
      }
      this.mono = mono;
      this.peak = peak || 1;
      this.hop = this.sr / RATE;
      this.frames = Math.max(2, Math.ceil(this.duration * RATE) + 1);
      this.fMax = Math.min(20000, this.sr * 0.49);
      this._bands = new Map();
      this._onsets = new Map();
    }

    async run(onProgress = () => {}) {
      await this._spectrum((p) => onProgress(p * 0.6));
      const list = Object.values(SOURCES).filter((s) => !s.custom && s.kind !== 'none');
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        this.band(s.lo, s.hi, !!s.full);
        if (s.kind === 'hits') this.onsets(s.lo, s.hi, s.minGap);
        onProgress(0.6 + (0.4 * (i + 1)) / list.length);
        await U.yieldNow();
      }
    }

    async _spectrum(onProgress) {
      const N = this.sr > 30000 ? 4096 : 2048;
      const fft = new VG.FFT(N);
      const re = new Float64Array(N);
      const im = new Float64Array(N);
      const win = new Float64Array(N);
      for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      const binHz = this.sr / N;
      const half = N / 2;
      const loBin = new Float64Array(NB);
      const hiBin = new Float64Array(NB);
      const tilt = new Float64Array(NB);
      const ratio = this.fMax / F_MIN;
      for (let b = 0; b < NB; b++) {
        const f0 = F_MIN * Math.pow(ratio, b / NB);
        const f1 = F_MIN * Math.pow(ratio, (b + 1) / NB);
        loBin[b] = f0 / binHz;
        hiBin[b] = f1 / binHz;
        // +3.5 dB/octave around 1 kHz so a typical mix looks roughly flat
        tilt[b] = 3.5 * Math.log2(Math.sqrt(f0 * f1) / 1000);
      }
      const power = new Float64Array(half + 1);
      const out = new Float32Array(this.frames * NB);
      const x = this.mono;
      const len = x.length;
      for (let k = 0; k < this.frames; k++) {
        const start = Math.round(k * this.hop) - half;
        for (let i = 0; i < N; i++) {
          const j = start + i;
          re[i] = j >= 0 && j < len ? x[j] * win[i] : 0;
          im[i] = 0;
        }
        fft.transform(re, im);
        for (let i = 0; i <= half; i++) power[i] = re[i] * re[i] + im[i] * im[i];
        const base = k * NB;
        for (let b = 0; b < NB; b++) {
          const lo = loBin[b];
          const hi = hiBin[b];
          let p;
          if (hi - lo < 1) {
            const c = Math.min((lo + hi) * 0.5, half - 1);
            const i0 = Math.floor(c);
            const fr = c - i0;
            p = power[i0] * (1 - fr) + power[i0 + 1] * fr;
          } else {
            let s = 0;
            let cnt = 0;
            const end = Math.min(hi, half + 1);
            for (let i = Math.ceil(lo); i < end; i++) {
              s += power[i];
              cnt++;
            }
            p = cnt ? s / cnt : 0;
          }
          out[base + b] = 10 * Math.log10(p + 1e-20) + tilt[b];
        }
        if ((k & 127) === 0) {
          onProgress(k / this.frames);
          await U.yieldNow();
        }
      }
      // Normalize the whole spectrogram against its own loudest moments (48 dB window).
      const sample = [];
      const step = Math.max(1, Math.floor(out.length / 400000));
      for (let i = 0; i < out.length; i += step) sample.push(out[i]);
      sample.sort((a, b) => a - b);
      const ceil = sample[Math.floor((sample.length - 1) * 0.997)];
      const floor = ceil - 48;
      const inv = 1 / (ceil - floor);
      for (let i = 0; i < out.length; i++) out[i] = U.clamp((out[i] - floor) * inv, 0, 1);
      this.spec = out;
      onProgress(1);
    }

    // Energy of one frequency band per analysis frame (4th-order band-pass, then RMS).
    band(lo, hi, full) {
      const key = `${lo}|${hi}|${full ? 1 : 0}`;
      let res = this._bands.get(key);
      if (res) return res;
      const sr = this.sr;
      const x = this.mono;
      const len = x.length;
      const hop = this.hop;
      const n = this.frames;
      const H = !full && lo > 15 ? biquad('hp', lo, sr) : null;
      const L = !full && hi < sr * 0.45 ? biquad('lp', hi, sr) : null;
      const blocks = new Float64Array(n);
      let a1 = 0, a2 = 0, b1 = 0, b2 = 0, c1 = 0, c2 = 0, d1 = 0, d2 = 0;
      for (let k = 0; k < n; k++) {
        const s0 = Math.max(0, Math.round((k - 0.5) * hop));
        const s1 = Math.min(len, Math.round((k + 0.5) * hop));
        let acc = 0;
        for (let i = s0; i < s1; i++) {
          let v = x[i];
          let y;
          if (H) {
            y = H[0] * v + a1;
            a1 = H[1] * v - H[3] * y + a2;
            a2 = H[2] * v - H[4] * y;
            v = y;
            y = H[0] * v + b1;
            b1 = H[1] * v - H[3] * y + b2;
            b2 = H[2] * v - H[4] * y;
            v = y;
          }
          if (L) {
            y = L[0] * v + c1;
            c1 = L[1] * v - L[3] * y + c2;
            c2 = L[2] * v - L[4] * y;
            v = y;
            y = L[0] * v + d1;
            d1 = L[1] * v - L[3] * y + d2;
            d2 = L[2] * v - L[4] * y;
            v = y;
          }
          acc += v * v;
        }
        blocks[k] = s1 > s0 ? acc / (s1 - s0) : 0;
      }
      // Low bands use a slightly longer window so bass waveforms don't make the level ripple.
      const w = lo < 100 ? 1 : 0;
      const db = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        let s = 0;
        let c = 0;
        for (let j = k - w; j <= k + w; j++) {
          if (j >= 0 && j < n) {
            s += blocks[j];
            c++;
          }
        }
        db[k] = 10 * Math.log10(s / c + 1e-12);
      }
      res = { blocks, db, norm: normalizeDb(db, 40) };
      this._bands.set(key, res);
      return res;
    }

    levelNorm(lo, hi, full) {
      return this.band(lo, hi, full).norm;
    }

    // Transient detection in one band: look for sudden rises in level (dB) that stand out
    // from the local average, keep the strongest one within `minGap` seconds.
    onsets(lo, hi, minGap) {
      const key = `${lo}|${hi}|${minGap}`;
      let res = this._onsets.get(key);
      if (res) return res;
      const band = this.band(lo, hi, false);
      const n = this.frames;
      const db = new Float32Array(n);
      for (let k = 0; k < n; k++) db[k] = 10 * Math.log10(band.blocks[k] + 1e-12);
      const rise = new Float32Array(n);
      for (let k = 1; k < n; k++) {
        const m = Math.min(db[k - 1], k > 1 ? db[k - 2] : db[k - 1], k > 2 ? db[k - 3] : db[k - 1]);
        rise[k] = Math.max(0, db[k] - m);
      }
      const ps = new Float64Array(n + 1);
      for (let k = 0; k < n; k++) ps[k + 1] = ps[k] + rise[k];
      const W = RATE; // ±1 s neighbourhood for the adaptive threshold
      const cand = [];
      for (let k = 1; k < n - 1; k++) {
        if (rise[k] < rise[k - 1] || rise[k] < rise[k + 1] || rise[k] <= 0) continue;
        const a = Math.max(0, k - W);
        const b = Math.min(n, k + W + 1);
        const mean = (ps[b] - ps[a]) / (b - a);
        if (rise[k] < Math.max(4, mean * 2 + 1.5)) continue;
        const lvl = Math.max(band.norm[k], band.norm[Math.min(n - 1, k + 1)], band.norm[Math.min(n - 1, k + 2)]);
        if (lvl < 0.3) continue;
        let best = k;
        let bestRise = -Infinity;
        for (let j = Math.max(1, k - 2); j <= k; j++) {
          const r = db[j] - db[j - 1];
          if (r > bestRise) {
            bestRise = r;
            best = j;
          }
        }
        cand.push({ k: best, d: rise[k], lvl });
      }
      const gapF = Math.max(1, Math.round(minGap * RATE));
      const kept = [];
      for (const c of cand) {
        const last = kept[kept.length - 1];
        if (last && c.k - last.k < gapF) {
          if (c.d > last.d) kept[kept.length - 1] = c;
        } else kept.push(c);
      }
      // Strength is mostly "how loud is this hit compared with the loudest hits around it",
      // so e.g. an off-beat bass note scores well below the kick next to it.
      const ds = kept.map((c) => c.d).sort((a, b) => a - b);
      const ref = ds.length ? ds[Math.floor((ds.length - 1) * 0.75)] : 1;
      const peak = kept.map((c) => {
        let m = -Infinity;
        for (let j = c.k; j <= Math.min(n - 1, c.k + 3); j++) m = Math.max(m, db[j]);
        return m;
      });
      const span = Math.round(1.5 * RATE);
      const frames = new Int32Array(kept.length);
      const strength = new Float32Array(kept.length);
      let wlo = 0;
      let whi = 0;
      kept.forEach((c, i) => {
        while (kept[wlo].k < c.k - span) wlo++;
        while (whi + 1 < kept.length && kept[whi + 1].k <= c.k + span) whi++;
        let refMax = -Infinity;
        for (let j = wlo; j <= whi; j++) refMax = Math.max(refMax, peak[j]);
        const rel = U.clamp(1 - (refMax - peak[i]) / 10, 0, 1);
        frames[i] = c.k;
        strength[i] = U.clamp((0.7 * rel + 0.3 * Math.min(1, c.d / ref)) * (0.6 + 0.4 * c.lvl), 0, 1);
      });
      res = { frames, strength };
      this._onsets.set(key, res);
      return res;
    }

    // `n` samples of the waveform (mono, peak-normalized) around time t.
    waveformAt(t, windowSec, n, out, stabilize) {
      const x = this.mono;
      const len = x.length;
      const sr = this.sr;
      const win = Math.max(n, Math.round(windowSec * sr));
      let start = Math.round(t * sr - win / 2);
      if (stabilize) {
        // Oscilloscope-style trigger: start at a rising zero crossing so repeating
        // sounds stand still instead of jittering.
        const maxSearch = Math.round(win * 0.5);
        let prev = 0;
        for (let i = 0; i < maxSearch; i++) {
          const j = start + i;
          const v = j >= 2 && j < len ? (x[j] + x[j - 1] + x[j - 2]) / 3 : 0;
          if (i > 0 && prev <= 0 && v > 0) {
            start = j;
            break;
          }
          prev = v;
        }
      }
      const step = win / n;
      const inv = 1 / this.peak;
      for (let i = 0; i < n; i++) {
        const a = start + Math.floor(i * step);
        const b = Math.max(a + 1, start + Math.floor((i + 1) * step));
        let s = 0;
        for (let j = a; j < b; j++) if (j >= 0 && j < len) s += x[j];
        out[i] = (s / (b - a)) * inv;
      }
      return out;
    }

    // Min/max pairs for drawing the timeline waveform.
    peaks(n) {
      if (this._peaks && this._peaks.n === n) return this._peaks.data;
      const x = this.mono;
      const len = x.length;
      const out = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const a = Math.floor((i * len) / n);
        const b = Math.max(a + 1, Math.floor(((i + 1) * len) / n));
        const stride = Math.max(1, Math.floor((b - a) / 512));
        let mn = 0;
        let mx = 0;
        for (let j = a; j < b; j += stride) {
          const v = x[j];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        out[2 * i] = mn / this.peak;
        out[2 * i + 1] = mx / this.peak;
      }
      this._peaks = { n, data: out };
      return out;
    }
  }

  // A fake 124 BPM track so the preview moves before any audio is loaded.
  class DemoAnalysis extends AnalysisBase {
    constructor() {
      super();
      this.demo = true;
      this.bpm = 124;
      this.duration = (60 / this.bpm) * 4 * 32; // 32 bars
      this.frames = Math.ceil(this.duration * RATE) + 1;
      this.fMax = 20000;
      this.peak = 1;
      this._build();
    }

    _section(bar) {
      if (bar < 4) return 0; // intro: hats only
      if (bar < 16) return 1; // drop
      if (bar < 20) return 2; // breakdown
      return 1;
    }

    _build() {
      const n = this.frames;
      const beat = 60 / this.bpm;
      const on = { kick: [], snare: [], hats: [] };
      const totalBeats = Math.floor(this.duration / beat);
      for (let i = 0; i < totalBeats; i++) {
        const t = i * beat;
        const sec = this._section(Math.floor(i / 4));
        if (sec === 1) on.kick.push(t);
        if (sec === 1 && i % 2 === 1) on.snare.push(t);
        if (sec !== 2) on.hats.push(t + beat / 2);
        if (sec === 1) on.hats.push(t + beat * 0.75);
      }
      const envFrom = (times, decay) => {
        const e = new Float32Array(n);
        let p = 0;
        for (let k = 0; k < n; k++) {
          const t = k / RATE;
          while (p + 1 < times.length && times[p + 1] <= t) p++;
          if (times.length && times[p] <= t) e[k] = Math.exp(-(t - times[p]) / decay);
        }
        return e;
      };
      const kickE = envFrom(on.kick, 0.12);
      const snareE = envFrom(on.snare, 0.14);
      const hatE = envFrom(on.hats, 0.05);
      this._kickE = kickE;
      const L = {};
      for (const k of ['sub', 'bass', 'lowmid', 'mid', 'high', 'air', 'loud']) L[k] = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const t = k / RATE;
        const sec = this._section(Math.floor(t / (beat * 4)));
        const pad = 0.5 + 0.5 * Math.sin(t * 0.9);
        const drop = sec === 1;
        L.sub[k] = drop ? 0.12 + 0.88 * kickE[k] : 0.04;
        L.bass[k] = drop ? 0.35 + 0.65 * kickE[k] : sec === 2 ? 0.22 : 0.1;
        L.lowmid[k] = 0.28 + 0.25 * pad + 0.3 * snareE[k];
        L.mid[k] = 0.3 + 0.2 * pad + 0.45 * snareE[k];
        L.high[k] = 0.15 + 0.45 * hatE[k] + 0.35 * snareE[k];
        L.air[k] = 0.1 + 0.75 * hatE[k];
        L.loud[k] = drop ? 0.55 + 0.4 * kickE[k] : sec === 2 ? 0.35 : 0.28 + 0.2 * hatE[k];
      }
      this._levels = L;
      const toOnsets = (times, s) => ({
        frames: Int32Array.from(times.map((t) => Math.round(t * RATE))),
        strength: Float32Array.from(times.map(() => s)),
      });
      this._on = { kick: toOnsets(on.kick, 1), snare: toOnsets(on.snare, 0.9), hats: toOnsets(on.hats, 0.65) };

      const spec = new Float32Array(n * NB);
      const rnd = U.rng(7);
      const jitter = new Float32Array(NB * 64);
      for (let i = 0; i < jitter.length; i++) jitter[i] = rnd() - 0.5;
      for (let b = 0; b < NB; b++) {
        const f = F_MIN * Math.pow(this.fMax / F_MIN, (b + 0.5) / NB);
        const lf = Math.log2(f / F_MIN) / 10;
        const base = 0.6 - 0.22 * lf + 0.05 * Math.sin(lf * 19);
        const lowW = Math.exp(-Math.pow(Math.log2(f / 60), 2) / 1.4);
        const midW = Math.exp(-Math.pow(Math.log2(f / 1800), 2) / 2);
        const highW = U.smoothstep(3500, 11000, f);
        for (let k = 0; k < n; k++) {
          const t = k / RATE;
          const sec = this._section(Math.floor(t / (beat * 4)));
          const drop = sec === 1;
          let v = base * (drop ? 0.75 : 0.5) + 0.05 * Math.sin(t * 1.3 + b * 0.21);
          v += lowW * (drop ? 0.12 + 0.6 * kickE[k] : 0.03);
          v += 0.35 * midW * snareE[k] + 0.3 * highW * hatE[k];
          v += 0.07 * jitter[b * 64 + (k % 64)];
          spec[k * NB + b] = U.clamp(v, 0, 1);
        }
      }
      this.spec = spec;
    }

    levelNorm(lo, hi, full) {
      if (full) return this._levels.loud;
      const c = Math.sqrt(lo * hi);
      const pick = c < 60 ? 'sub' : c < 250 ? 'bass' : c < 800 ? 'lowmid' : c < 2500 ? 'mid' : c < 8000 ? 'high' : 'air';
      return this._levels[pick];
    }

    onsets(lo, hi) {
      const c = Math.sqrt(lo * hi);
      return c < 150 ? this._on.kick : c < 5000 ? this._on.snare : this._on.hats;
    }

    waveformAt(t, windowSec, n, out) {
      for (let i = 0; i < n; i++) {
        const tt = t + (i / n - 0.5) * windowSec;
        const ke = sampleArr(this._kickE, tt * RATE);
        out[i] =
          0.55 * Math.sin(2 * Math.PI * 52 * tt) * ke +
          0.22 * Math.sin(2 * Math.PI * 110 * tt) * (0.6 + 0.4 * Math.sin(tt * 0.7)) +
          0.12 * Math.sin(2 * Math.PI * 330 * tt + 0.4) +
          0.05 * Math.sin(2 * Math.PI * 1320 * tt);
      }
      return out;
    }

    peaks(n) {
      const out = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const v = 0.15 + 0.7 * sampleArr(this._levels.loud, ((i + 0.5) / n) * (this.frames - 1));
        out[2 * i] = -v;
        out[2 * i + 1] = v;
      }
      return out;
    }
  }

  async function decodeFile(file) {
    const info = { name: file.name, artist: '', title: '', cover: null, sampleRate: 0, channels: 0 };
    try {
      if (window.Mediabunny) {
        const input = new Mediabunny.Input({
          source: new Mediabunny.BlobSource(file),
          formats: Mediabunny.ALL_FORMATS,
        });
        try {
          const track = await input.getPrimaryAudioTrack();
          if (track) {
            info.sampleRate = track.sampleRate;
            info.channels = track.numberOfChannels;
          }
          const tags = await input.getMetadataTags();
          if (tags) {
            info.artist = (tags.artist || tags.albumArtist || '').trim();
            info.title = (tags.title || '').trim();
            const imgs = tags.images || [];
            const img = imgs.find((i) => i.kind === 'coverFront') || imgs[0];
            if (img && img.data && img.data.length) info.cover = new Blob([img.data], { type: img.mimeType || 'image/jpeg' });
          }
        } finally {
          if (typeof input.dispose === 'function') input.dispose();
        }
      }
    } catch (e) {
      console.warn('Could not read audio tags:', e);
    }
    if (!info.title) {
      // Fall back to the file name: "Artist - Title.wav"
      const base = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      const parts = base.split(/\s+[-–—]\s+/);
      if (parts.length >= 2) {
        info.artist = info.artist || parts[0].trim();
        info.title = parts.slice(1).join(' - ').trim();
      } else info.title = base.trim();
    }
    // Keep 44.1/48 kHz files at their native rate (no resampling); anything else → 48 kHz.
    const sr = info.sampleRate === 44100 || info.sampleRate === 48000 ? info.sampleRate : 48000;
    const data = await file.arrayBuffer();
    const ctx = new OfflineAudioContext(2, 1, sr);
    let buffer;
    try {
      buffer = await ctx.decodeAudioData(data);
    } catch (e) {
      throw new Error("Couldn't decode this file. Make sure it's a valid .mp3 or .wav.");
    }
    return { buffer, info };
  }

  VG.analysis = { RATE, NB, SOURCES, SOURCE_GROUPS, binding, AudioAnalysis, DemoAnalysis, decodeFile };
})(window.VG);
