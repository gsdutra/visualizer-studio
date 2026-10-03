'use strict';
// Offline export: render every frame at its exact timestamp, encode with the browser's
// hardware H.264 encoder (WebCodecs) and package video + AAC audio into an .mp4 (Mediabunny).
// Because frames aren't captured in real time, nothing is ever dropped and sync is exact.
(function (VG) {
  const U = VG.util;

  const RES = { 1080: [1920, 1080], 1440: [2560, 1440], 2160: [3840, 2160] };
  // Video bitrates in Mbps: [light, standard (YouTube's recommendation), high]
  const MBPS = {
    1080: { 30: [5, 8, 12], 60: [7.5, 12, 18] },
    1440: { 30: [10, 16, 24], 60: [15, 24, 36] },
    2160: { 30: [20, 40, 60], 60: [30, 60, 85] },
  };
  const QIDX = { light: 0, standard: 1, high: 2 };
  const AUDIO_BPS = 320000;

  function dims(ex) {
    const [w, h] = RES[ex.resolution] || RES[1080];
    return ex.orientation === 'vertical' ? [h, w] : [w, h];
  }

  function videoBitrate(ex) {
    const t = MBPS[ex.resolution] || MBPS[1080];
    const row = t[ex.fps] || t[60];
    return row[QIDX[ex.quality] != null ? QIDX[ex.quality] : 1] * 1e6;
  }

  function estimateBytes(ex, seconds) {
    return (((videoBitrate(ex) + AUDIO_BPS) * seconds) / 8) * 1.02;
  }

  function fadeFactor(t, start, end, fadeIn, fadeOut) {
    let f = 1;
    if (fadeIn > 0) f = Math.min(f, U.smoothstep(0, 1, (t - start) / fadeIn));
    if (fadeOut > 0) f = Math.min(f, U.smoothstep(0, 1, (end - t) / fadeOut));
    return U.clamp(f, 0, 1);
  }

  // Copy [start, end) of the song (max 2 channels), with optional equal-power audio fades.
  function sliceAudio(buffer, start, end, fadeIn, fadeOut) {
    const sr = buffer.sampleRate;
    const s0 = U.clamp(Math.floor(start * sr), 0, buffer.length - 1);
    const s1 = U.clamp(Math.ceil(end * sr), s0 + 1, buffer.length);
    const len = s1 - s0;
    const srcCh = buffer.numberOfChannels;
    const chs = Math.min(2, srcCh);
    const out = new AudioBuffer({ length: len, numberOfChannels: chs, sampleRate: sr });
    const nIn = Math.min(len, Math.round(fadeIn * sr));
    const nOut = Math.min(len, Math.round(fadeOut * sr));
    for (let c = 0; c < chs; c++) {
      const dst = new Float32Array(len);
      dst.set(buffer.getChannelData(c).subarray(s0, s1));
      // Fold any extra channels (e.g. 5.1) into the stereo pair.
      for (let e = 2 + c; e < srcCh; e += 2) {
        const extra = buffer.getChannelData(e).subarray(s0, s1);
        for (let i = 0; i < len; i++) dst[i] += extra[i] * 0.5;
      }
      for (let i = 0; i < nIn; i++) dst[i] *= Math.sin((i / nIn) * Math.PI * 0.5);
      for (let i = 0; i < nOut; i++) dst[len - 1 - i] *= Math.sin((i / nOut) * Math.PI * 0.5);
      out.copyToChannel(dst, c);
    }
    return out;
  }

  async function pickAudioCodec(channels, sampleRate) {
    for (const bitrate of [AUDIO_BPS, 256000, 192000]) {
      const quality = new Mediabunny.Quality({ bitrate });
      if (await Mediabunny.canEncodeAudio('aac', { numberOfChannels: channels, sampleRate, quality })) return { codec: 'aac', bitrate, sampleRate };
    }
    const quality = new Mediabunny.Quality({ bitrate: 256000 });
    if (await Mediabunny.canEncodeAudio('opus', { numberOfChannels: channels, sampleRate: 48000, quality })) return { codec: 'opus', bitrate: 256000, sampleRate: 48000 };
    throw new Error('This browser cannot encode audio. Please use Google Chrome.');
  }

  // Audio encoders add a short "priming" delay at the start (2112 samples for AAC on macOS).
  // Measure it once by encoding a click and finding where it lands after decoding; the export
  // then starts the audio track that much earlier so the MP4 gets an edit list telling players
  // to skip the priming — keeping the picture and the sound exactly in sync.
  const delayCache = new Map();
  async function measureEncoderDelay(ac, channels) {
    const key = [ac.codec, ac.sampleRate, channels, ac.bitrate].join('|');
    if (delayCache.has(key)) return delayCache.get(key);
    let delay = 0;
    try {
      const sr = ac.sampleRate;
      const len = Math.round(sr * 0.6);
      const clickAt = Math.round(sr * 0.2);
      const buf = new AudioBuffer({ length: len, numberOfChannels: channels, sampleRate: sr });
      for (let c = 0; c < channels; c++) {
        const d = buf.getChannelData(c);
        d[clickAt] = 0.9;
        d[clickAt + 1] = -0.9;
      }
      const out = new Mediabunny.Output({ format: new Mediabunny.Mp4OutputFormat(), target: new Mediabunny.BufferTarget() });
      const src = new Mediabunny.AudioBufferSource({ codec: ac.codec, quality: new Mediabunny.Quality({ bitrate: ac.bitrate }) });
      out.addAudioTrack(src);
      await out.start();
      await src.add(buf);
      src.close();
      await out.finalize();
      const input = new Mediabunny.Input({ source: new Mediabunny.BufferSource(out.target.buffer), formats: Mediabunny.ALL_FORMATS });
      const track = await input.getPrimaryAudioTrack();
      const sink = new Mediabunny.AudioBufferSink(track);
      let best = 0;
      let bestPos = clickAt;
      for await (const { buffer, timestamp } of sink.buffers()) {
        const d = buffer.getChannelData(0);
        const base = Math.round(timestamp * sr);
        for (let i = 0; i < d.length; i++) {
          const a = Math.abs(d[i]);
          if (a > best) {
            best = a;
            bestPos = base + i;
          }
        }
      }
      if (typeof input.dispose === 'function') input.dispose();
      const measured = bestPos - clickAt;
      // Snap to the well-known values when close (the click gets smeared a little by AAC).
      delay = Math.abs(measured - 2112) < 48 ? 2112 : Math.abs(measured - 1024) < 48 ? 1024 : Math.abs(measured) < 48 ? 0 : measured;
      if (delay < 0 || delay > sr * 0.2) delay = 0;
    } catch (e) {
      console.warn('Could not measure the audio encoder delay:', e);
      delay = 0;
    }
    delayCache.set(key, delay);
    return delay;
  }

  async function resample(buffer, sampleRate) {
    if (buffer.sampleRate === sampleRate) return buffer;
    const ctx = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil(buffer.duration * sampleRate), sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
    return ctx.startRendering();
  }

  async function run(opts) {
    const { project, assets, analysis, audioBuffer, range, fileHandle, signal, onProgress, onFrame } = opts;
    const ex = project.export;
    const [W, H] = dims(ex);
    const fps = ex.fps;
    const start = range.start;
    const end = range.end;
    const frameCount = Math.max(1, Math.round((end - start) * fps));
    const quality = new Mediabunny.Quality({ bitrate: videoBitrate(ex) });

    if (!(await Mediabunny.canEncodeVideo('avc', { width: W, height: H, quality, frameRate: fps }))) {
      throw new Error(`This browser can't encode ${W}×${H} H.264 video at ${fps} fps. Try a lower resolution or frame rate.`);
    }
    const channels = Math.min(2, audioBuffer.numberOfChannels);
    const ac = await pickAudioCodec(channels, audioBuffer.sampleRate);
    let audio = sliceAudio(audioBuffer, start, end, ex.fadeAudio ? ex.fadeIn : 0, ex.fadeAudio ? ex.fadeOut : 0);
    audio = await resample(audio, ac.sampleRate);
    const primingDelay = await measureEncoderDelay(ac, channels);

    const target = fileHandle ? new Mediabunny.StreamTarget(await fileHandle.createWritable(), { chunked: true }) : new Mediabunny.BufferTarget();
    const output = new Mediabunny.Output({
      format: new Mediabunny.Mp4OutputFormat({ fastStart: fileHandle ? false : 'in-memory' }),
      target,
    });

    const canvas = new OffscreenCanvas(W, H);
    const renderer = new VG.Renderer(canvas, { preserveDrawingBuffer: true });
    renderer.setSize(W, H);

    const videoSource = new Mediabunny.CanvasSource(canvas, { codec: 'avc', quality, keyFrameInterval: 2, latencyMode: 'quality' });
    output.addVideoTrack(videoSource, { frameRate: fps });
    const audioSource = new Mediabunny.AudioBufferSource(
      { codec: ac.codec, quality: new Mediabunny.Quality({ bitrate: ac.bitrate }) },
      { startTimestamp: -primingDelay / ac.sampleRate }
    );
    output.addAudioTrack(audioSource);
    const tags = {};
    if (project.title) tags.title = project.title;
    if (project.artist) tags.artist = project.artist;
    if (tags.title || tags.artist) output.setMetadataTags(tags);

    const t0 = performance.now();
    const vertical = ex.orientation === 'vertical';
    // Effects that build on previous frames (trails, echo tunnel) get one second of unrecorded
    // warm-up, so the first frames of the video already look "in motion".
    const preroll = VG.project.needsHistory(project) ? Math.round(fps) : 0;
    try {
      await output.start();
      await audioSource.add(audio);
      audioSource.close();
      for (let j = preroll; j >= 1; j--) {
        renderer.render({ t: start - j / fps, dt: 1 / fps, frameIndex: 0, project, analysis, assets, vertical, fade: 1, reset: j === preroll });
      }
      let lastTick = 0;
      let lastThumb = 0;
      for (let i = 0; i < frameCount; i++) {
        if (signal && signal.aborted) throw new DOMException('Export canceled', 'AbortError');
        const t = start + i / fps;
        renderer.render({
          t,
          dt: 1 / fps,
          frameIndex: i,
          project,
          analysis,
          assets,
          vertical,
          fade: fadeFactor(t, start, end, ex.fadeIn, ex.fadeOut),
          reset: i === 0 && preroll === 0,
        });
        if (renderer.lost) throw new Error('The graphics card reset during the export (this can happen if the Mac sleeps). Please try again.');
        await videoSource.add(i / fps, 1 / fps);
        const now = performance.now();
        if (now - lastTick > 80) {
          lastTick = now;
          if (onProgress) onProgress({ done: i + 1, total: frameCount, elapsed: (now - t0) / 1000 });
          if (onFrame && now - lastThumb > 700) {
            lastThumb = now;
            onFrame(canvas);
          }
          await U.yieldNow();
        }
      }
      videoSource.close();
      if (onProgress) onProgress({ done: frameCount, total: frameCount, elapsed: (performance.now() - t0) / 1000, finalizing: true });
      await output.finalize();
    } catch (e) {
      try {
        await output.cancel();
      } catch (_) {
        /* already failed */
      }
      throw e;
    } finally {
      renderer.dispose();
    }

    const seconds = (performance.now() - t0) / 1000;
    if (fileHandle) {
      const file = await fileHandle.getFile();
      return { bytes: file.size, seconds, name: fileHandle.name };
    }
    const buf = output.target.buffer;
    return { blob: new Blob([buf], { type: 'video/mp4' }), bytes: buf.byteLength, seconds };
  }

  VG.exporter = { RES, MBPS, AUDIO_BPS, dims, videoBitrate, estimateBytes, fadeFactor, run };
})(window.VG);
