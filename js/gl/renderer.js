'use strict';
// The renderer draws one frame for a given time `t`. It is used twice: once for the
// live preview (small canvas) and once for the export (full-resolution offscreen canvas).
// A frame = all enabled layers drawn into an HDR buffer, then post-processing
// (trails, glow, camera, chromatic aberration, glitch, grading, vignette, grain, fades).
(function (VG) {
  const U = VG.util;
  const GL = VG.GL;

  VG.layerTypes = {};
  VG.layerOrder = [];
  VG.registerLayer = (def) => {
    VG.layerTypes[def.type] = def;
    VG.layerOrder.push(def.type);
  };

  const BLEND = {
    normal: (gl) => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA),
    add: (gl) => gl.blendFunc(gl.ONE, gl.ONE),
    screen: (gl) => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR),
    multiply: (gl) => gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA),
  };

  const FALLBACK = { background: ['cover'], cover: ['logo'], logo: ['cover'], texture: ['background', 'cover'] };

  const BLEND_ID = { normal: 0, add: 1, screen: 2, multiply: 3 };

  const IDENT = [1, 0];

  const FS_PREFILTER = `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-0.5, -0.5)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(0.5, -0.5)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-0.5, 0.5)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  outColor = vec4(c * contrib, 1.0);
}`;

  const FS_DOWN = `
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec2 o = uTexel;
  vec3 s = texture(uTex, vUv).rgb * 4.0;
  s += texture(uTex, vUv + vec2(-o.x, -o.y)).rgb;
  s += texture(uTex, vUv + vec2(o.x, -o.y)).rgb;
  s += texture(uTex, vUv + vec2(-o.x, o.y)).rgb;
  s += texture(uTex, vUv + vec2(o.x, o.y)).rgb;
  outColor = vec4(s / 8.0, 1.0);
}`;

  const FS_UP = `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uSpread;
void main() {
  vec2 o = uTexel * uSpread;
  vec3 s = texture(uTex, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  s += texture(uTex, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  s += texture(uTex, vUv + vec2(0.0, o.y * 2.0)).rgb;
  s += texture(uTex, vUv + vec2(o.x, o.y)).rgb * 2.0;
  s += texture(uTex, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  s += texture(uTex, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  s += texture(uTex, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  s += texture(uTex, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  outColor = vec4(s / 12.0, 1.0);
}`;

  const FS_TRAILS = `
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform float uDecay;
uniform float uZoom;
uniform float uRot;
uniform float uAspect;
void main() {
  vec2 c = vUv - 0.5;
  c.x *= uAspect;
  c = rot(-uRot) * c / uZoom;
  c.x /= uAspect;
  vec3 prev = texture(uPrev, c + 0.5).rgb * uDecay;
  vec3 cur = texture(uCur, vUv).rgb;
  outColor = vec4(max(cur, prev), 1.0);
}`;

  const FS_COMPOSITE = `
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomInt;
uniform vec2 uShake;
uniform float uZoom;
uniform float uRot;
uniform float uAspect;
uniform float uCA;
uniform float uGlitch;
uniform float uGlitchSeed;
uniform vec3 uFlashCol;
uniform float uFlash;
uniform float uVig;
uniform float uVigSoft;
uniform float uGrain;
uniform float uGrainSeed;
uniform float uGrainScale;
uniform float uSat;
uniform float uContrast;
uniform float uBright;
uniform float uHue;
uniform float uFade;
uniform float uScan;
uniform float uScanCount;

vec3 sampleAll(vec2 uv) {
  return texture(uScene, uv).rgb + texture(uBloom, uv).rgb * uBloomInt;
}

void main() {
  vec2 c = vUv - 0.5;
  c.x *= uAspect;
  c = rot(-uRot) * c / uZoom - uShake;
  c.x /= uAspect;
  vec2 uv = c + 0.5;

  float g = 0.0;
  if (uGlitch > 0.001) {
    float rows = 14.0 + floor(30.0 * hash12(vec2(uGlitchSeed, 1.7)));
    float row = floor(uv.y * rows);
    if (hash12(vec2(row, uGlitchSeed)) < uGlitch * 0.55) {
      g = (hash12(vec2(row, uGlitchSeed + 7.0)) - 0.5) * 0.22 * uGlitch;
      uv.x += g;
    }
  }

  float ca = uCA + abs(g) * 0.6;
  vec3 col;
  if (ca < 1e-5) {
    col = sampleAll(uv);
  } else {
    vec2 dir = uv - 0.5;
    col.r = sampleAll(uv + dir * ca + vec2(g * 0.25, 0.0)).r;
    col.g = sampleAll(uv).g;
    col.b = sampleAll(uv - dir * ca - vec2(g * 0.25, 0.0)).b;
  }

  col += uFlashCol * uFlash;

  col *= uBright;
  col = (col - 0.5) * uContrast + 0.5;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  if (abs(uHue) > 0.001) col = hueRotate(col, uHue);

  vec2 vc = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vd = length(vc) / length(vec2(uAspect, 1.0) * 0.5);
  col *= 1.0 - uVig * smoothstep(mix(0.7, 0.1, uVigSoft), 1.15, vd);

  if (uScan > 0.0) col *= 1.0 - uScan * (0.5 + 0.5 * sin(gl_FragCoord.y / uRes.y * uScanCount * TAU));

  col *= uFade;

  col = max(col, 0.0);
  vec3 over = max(col - 0.8, 0.0);
  col = min(col, 0.8) + 0.2 * (1.0 - exp(-over / 0.2));

  if (uGrain > 0.0) {
    vec2 gp = floor(gl_FragCoord.xy / uGrainScale);
    float n = hash12(gp + uGrainSeed * 17.31) + hash12(gp * 1.37 + uGrainSeed * 3.1) - 1.0;
    col += n * uGrain;
  }
  col += (hash12(gl_FragCoord.xy + fract(uGrainSeed * 0.1234) * 97.0) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;

  class Renderer {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
        powerPreference: 'high-performance',
      });
      if (!gl) throw new Error('WebGL2 is not available in this browser.');
      this.gl = gl;
      this.hdr = !!gl.getExtension('EXT_color_buffer_float');
      this.vao = gl.createVertexArray();
      this.programs = new Map();
      this.dataTex = new Map();
      this.imageTex = new Map();
      this.cachedTex = new Map();
      this.wanders = new Map();
      this.black = GL.texture(gl, 1, 1, { data: new Uint8Array([0, 0, 0, 0]) });
      this.w = 0;
      this.h = 0;
      this.trailsValid = false;
      this.palKey = '';
      this.pal = [];
      this.sceneB = null;
      this.persist = new Map();
      this.offscreens = new Map();
      this.frameNo = 0;
      this.view = IDENT;
      this.turning = false;
      this.spinRate = 0;
    }

    get lost() {
      return this.gl.isContextLost();
    }

    setSize(w, h) {
      w = Math.max(2, Math.round(w));
      h = Math.max(2, Math.round(h));
      if (w === this.w && h === this.h) return;
      this.w = w;
      this.h = h;
      this.canvas.width = w;
      this.canvas.height = h;
      this._allocTargets();
      this._clearCachedTex();
    }

    _allocTargets() {
      const gl = this.gl;
      for (const t of [this.scene, this.sceneB, this.trailA, this.trailB, ...(this.mips || [])]) GL.deleteTarget(gl, t);
      for (const e of this.persist.values()) {
        GL.deleteTarget(gl, e.a);
        GL.deleteTarget(gl, e.b);
      }
      this.persist.clear();
      for (const e of this.offscreens.values()) GL.deleteMrtTarget(gl, e.t);
      this.offscreens.clear();
      this.sceneB = null;
      this.trailA = this.trailB = null;
      this.scene = this._sceneTarget();
      this.mips = [];
      let mw = Math.max(1, this.w >> 1);
      let mh = Math.max(1, this.h >> 1);
      const levels = U.clamp(Math.floor(Math.log2(Math.min(this.w, this.h) / 16)), 3, 8);
      for (let i = 0; i < levels; i++) {
        this.mips.push(GL.target(gl, mw, mh, this.hdr));
        mw = Math.max(1, mw >> 1);
        mh = Math.max(1, mh >> 1);
      }
      this.trailsValid = false;
    }

    _bind(target) {
      const gl = this.gl;
      if (target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
        gl.viewport(0, 0, target.w, target.h);
        this.vw = target.w;
        this.vh = target.h;
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.w, this.h);
        this.vw = this.w;
        this.vh = this.h;
      }
    }

    // Compile (once) a program. By default `fs` is the body after the shared prelude and the
    // vertex shader is the full-screen triangle; `rawFs` passes a complete fragment shader.
    program(key, fs, vs, rawFs = false) {
      let p = this.programs.get(key);
      if (!p) {
        p = GL.program(this.gl, vs || GL.VS_FULL, rawFs ? fs : GL.FS_HEAD + fs);
        this.programs.set(key, p);
      }
      return p;
    }

    draw(prog, uniforms, blend = 'normal', opacity = 1, instances = 0) {
      const gl = this.gl;
      gl.useProgram(prog.p);
      GL.setUniforms(gl, prog, { uRes: [this.vw, this.vh], uOpacity: opacity, uView: this.view });
      GL.setUniforms(gl, prog, uniforms);
      if (blend) {
        gl.enable(gl.BLEND);
        (BLEND[blend] || BLEND.normal)(gl);
      } else gl.disable(gl.BLEND);
      gl.bindVertexArray(this.vao);
      if (instances > 0) gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instances);
      else gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // The picture is drawn into one of two buffers. Sampling outside the frame mirrors it, so
    // zoomed-out or offset copies never show hard edges.
    _sceneTarget() {
      const gl = this.gl;
      const t = GL.target(gl, this.w, this.h, this.hdr);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      return t;
    }

    // Effect layers (endless zoom, kaleidoscope, shape masks) read everything drawn so far and
    // write the transformed result into the spare buffer, which then becomes the picture.
    // Their shaders use GL.FS_EFFECT to blend with the original themselves (no copies needed).
    effect(prog, uniforms, L) {
      if (!this.sceneB) this.sceneB = this._sceneTarget();
      this._bind(this.sceneB);
      this.draw(prog, Object.assign({ uScene: this.scene.tex, uBlendMode: BLEND_ID[L.blend] || 0 }, uniforms), null, L.opacity);
      const done = this.sceneB;
      this.sceneB = this.scene;
      this.scene = done;
      this._bind(this.scene);
    }

    // Two buffers that live across frames for one layer (effects that build on the past, like
    // the echo tunnel). `valid` is false when the previous frame didn't go through this layer.
    history(L) {
      let e = this.persist.get(L.id);
      if (!e) {
        e = { a: GL.target(this.gl, this.w, this.h, this.hdr), b: GL.target(this.gl, this.w, this.h, this.hdr), frame: -10 };
        this.persist.set(L.id, e);
      }
      e.valid = e.frame === this.frameNo - 1 && !this.F.reset;
      e.frame = this.frameNo;
      return e;
    }

    drawTo(target, prog, uniforms, blend = null, instances = 0) {
      this._bind(target);
      this.draw(prog, uniforms, blend, 1, instances);
      this._bind(this.scene);
    }

    // A layer's own off-screen buffer (color + distance) of a given size, kept across frames.
    offscreen(key, w, h) {
      let e = this.offscreens.get(key);
      if (e && (e.t.w !== w || e.t.h !== h)) {
        GL.deleteMrtTarget(this.gl, e.t);
        e = null;
      }
      if (!e) {
        e = { t: GL.mrtTarget(this.gl, w, h, this.hdr) };
        this.offscreens.set(key, e);
      }
      e.frame = this.frameNo;
      return e.t;
    }

    // Beat events for a binding at the current time: { count, last }.
    hits(b) {
      return this.A.hitInfo(b, this.F.t);
    }

    // Float data (spectrum bars, waveforms) as a 1-channel texture, one row per series.
    dataTexture(key, w, h, data) {
      const gl = this.gl;
      let e = this.dataTex.get(key);
      if (!e || e.w !== w || e.h !== h) {
        if (e) gl.deleteTexture(e.tex);
        const tex = GL.texture(gl, w, h, {
          internal: gl.R16F,
          format: gl.RED,
          type: gl.FLOAT,
          filter: gl.LINEAR,
          wrapS: gl.REPEAT,
        });
        e = { tex, w, h };
        this.dataTex.set(key, e);
      }
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.FLOAT, data);
      return e.tex;
    }

    // Image asset for a slot ('cover' | 'logo' | 'background'), with optional fallbacks.
    asset(slot, useFallback = true) {
      const imgs = (this.F.assets && this.F.assets.images) || {};
      if (imgs[slot]) return imgs[slot];
      if (useFallback) for (const s of FALLBACK[slot] || []) if (imgs[s]) return imgs[s];
      return null;
    }

    // Texture for an image asset, optionally pre-blurred (blur 0..1).
    image(asset, blur = 0) {
      if (!asset) return null;
      const bq = Math.round(U.clamp(blur, 0, 1) * 50) / 50;
      const key = asset.id + '|' + bq;
      let e = this.imageTex.get(key);
      if (!e) {
        const canvas = VG.assets.prepareImage(asset, bq);
        e = { tex: GL.canvasTexture(this.gl, canvas), w: canvas.width, h: canvas.height, assetId: asset.id };
        this.imageTex.set(key, e);
        // Keep at most a few blurred variants around.
        const keys = [...this.imageTex.keys()];
        if (keys.length > 8) {
          const old = keys[0];
          this.gl.deleteTexture(this.imageTex.get(old).tex);
          this.imageTex.delete(old);
        }
      }
      return e;
    }

    // Generic cache for textures built from a 2D canvas (used by text).
    canvasTexture(key, build) {
      let e = this.cachedTex.get(key);
      if (!e) {
        const res = build();
        if (!res) return null;
        e = Object.assign({}, res, { tex: GL.canvasTexture(this.gl, res.canvas) });
        delete e.canvas;
        this.cachedTex.set(key, e);
        const keys = [...this.cachedTex.keys()];
        if (keys.length > 24) {
          this.gl.deleteTexture(this.cachedTex.get(keys[0]).tex);
          this.cachedTex.delete(keys[0]);
        }
      }
      return e;
    }

    _clearCachedTex() {
      for (const e of this.cachedTex.values()) this.gl.deleteTexture(e.tex);
      this.cachedTex.clear();
    }

    forgetAsset(assetId) {
      for (const [k, e] of [...this.imageTex.entries()]) {
        if (e.assetId === assetId) {
          this.gl.deleteTexture(e.tex);
          this.imageTex.delete(k);
        }
      }
    }

    // ---- helpers for layers -------------------------------------------------------
    seedOf(L) {
      return ((this.project.seed | 0) * 1000003 + (L.seed | 0)) >>> 0;
    }

    rnd(L, i, k = 0) {
      return U.hash3(this.seedOf(L), i, k);
    }

    wander(L, i, t) {
      const key = this.seedOf(L) + ':' + i;
      let w = this.wanders.get(key);
      if (!w) {
        if (this.wanders.size > 4000) this.wanders.clear();
        w = U.makeWander(U.rng(this.seedOf(L) + i * 7919 + 1));
        this.wanders.set(key, w);
      }
      return w(t);
    }

    val(b) {
      return this.A.value(b, this.F.t);
    }

    valAt(b, t) {
      return this.A.value(b, t);
    }

    integ(b) {
      return this.A.integral(b, this.F.t);
    }

    col(ref) {
      if (typeof ref === 'string' && ref[0] === 'p') {
        const i = U.clamp((parseInt(ref.slice(1), 10) || 1) - 1, 0, 4);
        return this.pal[i];
      }
      return U.hexToRgb(ref);
    }

    // i-th color when a layer uses "palette" coloring (cycles the 4 main palette colors).
    palCycle(i) {
      return this.pal[((i % 4) + 4) % 4];
    }

    // Layer position (frame coordinates -1..1) → p-space.
    pos(x, y) {
      return [x * this.half[0], y * this.half[1]];
    }

    // How far the picture has turned at time t (radians, counter-clockwise) for the layer
    // being drawn: 0 when there's no spin or the layer stays upright.
    angleAt(t) {
      return this.turning ? this.spinRate * t : 0;
    }

    // Picture position (what P() returns in shaders) → where it is on screen right now.
    toScreen(p) {
      const [c, s] = this.view;
      return [c * p[0] - s * p[1], s * p[0] + c * p[1]];
    }

    // ---- frame --------------------------------------------------------------------
    render(F) {
      const gl = this.gl;
      if (gl.isContextLost()) return;
      this.F = F;
      this.project = F.project;
      this.A = F.analysis;
      this.frameNo++;
      const m = Math.min(this.w, this.h);
      this.half = [(0.5 * this.w) / m, (0.5 * this.h) / m];
      this.px = 1 / m;
      const pk = F.project.palette.join(',');
      if (pk !== this.palKey) {
        this.palKey = pk;
        this.pal = F.project.palette.map(U.hexToRgb);
        while (this.pal.length < 5) this.pal.push([1, 1, 1]);
      }

      // Whole-picture spin, in degrees per minute (positive = clockwise). It only depends on
      // the time, so any frame can be rendered on its own.
      const spin = (F.project.fx.camera && F.project.fx.camera.spin) || 0;
      this.spinRate = (-spin / 60) * U.DEG;
      const angle = this.spinRate * F.t;
      const spinView = [Math.cos(angle), Math.sin(angle)];

      this._bind(this.scene);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (const L0 of F.project.layers) {
        if (!L0.enabled) continue;
        const def = VG.layerTypes[L0.type];
        if (!def) continue;
        const L = F.vertical && L0.v ? Object.assign({}, L0, L0.v) : L0;
        this.turning = spin !== 0 && !L.upright;
        this.view = this.turning ? spinView : IDENT;
        try {
          def.render(this, L, F);
        } catch (e) {
          console.error('Layer failed to render:', L0.type, e);
          this._bind(this.scene);
        }
      }
      this.turning = false;
      this.view = IDENT;
      // Free history buffers of layers that were removed or switched off a while ago.
      for (const [id, e] of this.persist) {
        if (e.frame < this.frameNo - 600) {
          GL.deleteTarget(gl, e.a);
          GL.deleteTarget(gl, e.b);
          this.persist.delete(id);
        }
      }
      for (const [key, e] of this.offscreens) {
        if (e.frame < this.frameNo - 600) {
          GL.deleteMrtTarget(gl, e.t);
          this.offscreens.delete(key);
        }
      }
      this._post(F);
    }

    _post(F) {
      const gl = this.gl;
      const fx = F.project.fx;
      const A = F.analysis;
      const t = F.t;
      let src = this.scene;

      const tr = fx.trails;
      // Trail length can grow with the music (e.g. longer smears on the bass).
      const trailLen = tr.length + (tr.lengthReact || 0) * A.value(tr.react, t);
      if (tr.enabled && trailLen > 0.001) {
        if (!this.trailA) {
          this.trailA = GL.target(gl, this.w, this.h, this.hdr);
          this.trailB = GL.target(gl, this.w, this.h, this.hdr);
          this.trailsValid = false;
        }
        const dt = U.clamp(F.dt || 1 / 60, 0, 0.1);
        this._bind(this.trailB);
        this.draw(
          this.program('post-trails', FS_TRAILS),
          {
            uCur: this.scene.tex,
            uPrev: this.trailA.tex,
            uDecay: this.trailsValid && !F.reset ? Math.exp(-dt / trailLen) : 0,
            uZoom: Math.exp(tr.zoom * dt),
            uRot: tr.rotate * U.DEG * dt,
            uAspect: this.w / this.h,
          },
          null
        );
        const tmp = this.trailA;
        this.trailA = this.trailB;
        this.trailB = tmp;
        this.trailsValid = true;
        src = this.trailA;
      } else {
        this.trailsValid = false;
      }

      let bloomTex = this.black;
      let bloomInt = 0;
      const bl = fx.bloom;
      if (bl.enabled) {
        bloomInt = Math.max(0, bl.intensity + bl.reactAmount * A.value(bl.react, t));
        if (bloomInt > 0.001) {
          const mips = this.mips;
          this._bind(mips[0]);
          this.draw(
            this.program('post-prefilter', FS_PREFILTER),
            { uTex: src.tex, uTexel: [1 / src.w, 1 / src.h], uThreshold: bl.threshold, uKnee: Math.max(0.05, bl.threshold * 0.5) },
            null
          );
          const down = this.program('post-down', FS_DOWN);
          for (let i = 1; i < mips.length; i++) {
            this._bind(mips[i]);
            this.draw(down, { uTex: mips[i - 1].tex, uTexel: [1 / mips[i - 1].w, 1 / mips[i - 1].h] }, null);
          }
          const up = this.program('post-up', FS_UP);
          for (let i = mips.length - 2; i >= 0; i--) {
            this._bind(mips[i]);
            this.draw(up, { uTex: mips[i + 1].tex, uTexel: [1 / mips[i + 1].w, 1 / mips[i + 1].h], uSpread: bl.radius }, 'add');
          }
          bloomTex = mips[0].tex;
          bloomInt = (bloomInt * 2.2) / mips.length;
        }
      }

      const cam = fx.camera;
      const cenv = A.value(cam.react, t);
      const shakeAmp = cam.shake + cam.shakeReact * cenv;
      if (!this.camWander) this.camWander = [U.makeWander(U.rng(911)), U.makeWander(U.rng(313))];
      const sw = this.camWander[0](t * cam.shakeSpeed);
      const rw = this.camWander[1](t * 0.7);
      const rotA = (cam.rotate + cam.rotateReact * cenv * (rw[0] >= 0 ? 1 : -1)) * U.DEG;
      const zoom = Math.max(0.2, 1 + cam.zoom + cam.zoomReact * cenv);
      const over = 1 + Math.abs(shakeAmp) * 2.2 + Math.abs(rotA) * 0.9;

      const ch = fx.chroma;
      const ca = Math.max(0, ch.amount + ch.reactAmount * A.value(ch.react, t));
      const gx = fx.glitch;
      const glitch = U.clamp(gx.amount + gx.reactAmount * A.value(gx.react, t), 0, 1);
      const fl = fx.flash;
      const flash = Math.max(0, fl.amount + fl.reactAmount * A.value(fl.react, t));
      const co = fx.color;
      const gr = fx.grain;
      const m = Math.min(this.w, this.h);

      this._bind(null);
      this.draw(
        this.program('post-composite', FS_COMPOSITE),
        {
          uScene: src.tex,
          uBloom: bloomTex,
          uBloomInt: bloomInt,
          uShake: [sw[0] * shakeAmp, sw[1] * shakeAmp],
          uZoom: zoom * over,
          uRot: rotA,
          uAspect: this.w / this.h,
          uCA: ca,
          uGlitch: glitch,
          uGlitchSeed: Math.floor(t * 20) % 997,
          uFlashCol: this.col(fl.color),
          uFlash: flash,
          uVig: fx.vignette.amount,
          uVigSoft: fx.vignette.softness,
          uGrain: gr.amount,
          uGrainSeed: F.frameIndex != null ? F.frameIndex % 1000 : Math.floor(t * 60) % 1000,
          uGrainScale: Math.max(1, (m / 1080) * gr.size),
          uSat: co.saturation,
          uContrast: co.contrast,
          uBright: co.brightness,
          uHue: (co.hue + co.hueSpeed * t) * U.DEG,
          uFade: F.fade == null ? 1 : F.fade,
          uScan: fx.scanlines.amount,
          uScanCount: fx.scanlines.count,
        },
        null
      );
    }

    dispose() {
      const gl = this.gl;
      try {
        for (const t of [this.scene, this.sceneB, this.trailA, this.trailB, ...(this.mips || [])]) GL.deleteTarget(gl, t);
        for (const e of this.persist.values()) {
          GL.deleteTarget(gl, e.a);
          GL.deleteTarget(gl, e.b);
        }
        for (const e of this.offscreens.values()) GL.deleteMrtTarget(gl, e.t);
        for (const e of this.imageTex.values()) gl.deleteTexture(e.tex);
        for (const e of this.dataTex.values()) gl.deleteTexture(e.tex);
        this._clearCachedTex();
        for (const p of this.programs.values()) gl.deleteProgram(p.p);
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      } catch (e) {
        /* ignore */
      }
    }
  }

  VG.Renderer = Renderer;
})(window.VG);
