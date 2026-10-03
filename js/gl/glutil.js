'use strict';
// Small WebGL2 helpers: programs with typed uniform setters, render targets, textures.
(function (VG) {
  const GL = {};

  // Full-screen triangle; vUv goes 0..1 across the viewport.
  GL.VS_FULL = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  // Shared fragment-shader prelude. Coordinates ("p-space"): origin at the frame center,
  // y up, and the *shorter* side of the frame spans -0.5..0.5. Sizes in layer settings
  // are in these units, so a layout looks the same at 1080p and 4K.
  // When the whole picture spins, P() is turned by the spin angle (uView = its cos, sin):
  // layers draw their content already rotated, so the corners never run empty. SP() is the
  // unturned screen position, and SUV() maps a P() position back to a texture coordinate of
  // the picture drawn so far (effect layers).
  GL.FS_HEAD = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
uniform vec2 uRes;
uniform float uOpacity;
uniform vec2 uView;
#define PI 3.14159265359
#define TAU 6.28318530718
vec2 SP() { return (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y); }
vec2 P() { vec2 s = SP(); return vec2(uView.x * s.x + uView.y * s.y, uView.x * s.y - uView.y * s.x); }
vec2 HALF() { return 0.5 * uRes / min(uRes.x, uRes.y); }
float PX() { return 1.0 / min(uRes.x, uRes.y); }
vec2 SUV(vec2 p) { return vec2(uView.x * p.x - uView.y * p.y, uView.y * p.x + uView.x * p.y) / (2.0 * HALF()) + 0.5; }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// Regular polygon with n sides and circumradius r (flat edge on top).
float sdNgon(vec2 p, float r, float n) {
  float an = PI / n;
  vec2 acs = vec2(cos(an), sin(an));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p.y += clamp(-p.y, 0.0, r * acs.y);
  return length(p) * sign(p.x);
}
// Star with n points; m (2..n) controls how sharp the points are.
float sdStar(vec2 p, float r, float n, float m) {
  float an = PI / n;
  float en = PI / m;
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}
vec3 hueRotate(vec3 c, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * c;
  float cs = cos(a), sn = sin(a);
  yiq.yz = mat2(cs, sn, -sn, cs) * yiq.yz;
  return toRGB * yiq;
}
`;

  // Extra prelude for effect layers: they read the picture drawn so far (uScene) and write the
  // final result themselves, blending their own output with it.
  GL.FS_EFFECT = `
uniform sampler2D uScene;
uniform int uBlendMode;
vec4 finishEffect(vec3 orig, vec4 eff) {
  vec3 e = eff.rgb * uOpacity;
  float a = eff.a * uOpacity;
  vec3 c;
  if (uBlendMode == 1) c = orig + e;
  else if (uBlendMode == 2) c = orig + e * (1.0 - clamp(orig, 0.0, 1.0));
  else if (uBlendMode == 3) c = orig * (1.0 - a) + orig * e;
  else c = orig * (1.0 - a) + e;
  return vec4(c, 1.0);
}
`;

  function numbered(src) {
    return src
      .split('\n')
      .map((l, i) => String(i + 1).padStart(4) + ' ' + l)
      .join('\n');
  }

  GL.compile = (gl, type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      console.error(numbered(src));
      throw new Error('Shader compile error: ' + log);
    }
    return s;
  };

  const SAMPLERS = new Set([0x8b5e /* SAMPLER_2D */]);

  GL.program = (gl, vsSrc, fsSrc) => {
    const p = gl.createProgram();
    gl.attachShader(p, GL.compile(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, GL.compile(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
    const uniforms = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    let unit = 0;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      const u = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
      if (SAMPLERS.has(info.type)) u.unit = unit++;
      uniforms[name] = u;
    }
    return { p, uniforms };
  };

  GL.setUniforms = (gl, prog, values) => {
    for (const name in values) {
      const u = prog.uniforms[name];
      if (!u) continue;
      const v = values[name];
      switch (u.type) {
        case gl.FLOAT:
          if (u.size > 1) gl.uniform1fv(u.loc, v);
          else gl.uniform1f(u.loc, v);
          break;
        case gl.FLOAT_VEC2:
          gl.uniform2fv(u.loc, v);
          break;
        case gl.FLOAT_VEC3:
          gl.uniform3fv(u.loc, v);
          break;
        case gl.FLOAT_VEC4:
          gl.uniform4fv(u.loc, v);
          break;
        case gl.INT:
        case gl.BOOL:
          if (u.size > 1) gl.uniform1iv(u.loc, v);
          else gl.uniform1i(u.loc, v | 0);
          break;
        case gl.UNSIGNED_INT:
          gl.uniform1ui(u.loc, v >>> 0);
          break;
        case gl.SAMPLER_2D:
          gl.activeTexture(gl.TEXTURE0 + u.unit);
          gl.bindTexture(gl.TEXTURE_2D, v);
          gl.uniform1i(u.loc, u.unit);
          break;
        default:
          break;
      }
    }
  };

  GL.texture = (gl, w, h, opts = {}) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const internal = opts.internal || gl.RGBA8;
    const format = opts.format || gl.RGBA;
    const type = opts.type || gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, opts.data || null);
    const filter = opts.filter || gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.wrapS || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.wrapT || gl.CLAMP_TO_EDGE);
    return tex;
  };

  // Render target (framebuffer + color texture). Uses half-float when available so
  // additive glow can go above 1.0 before tone mapping.
  GL.target = (gl, w, h, hdr) => {
    const internal = hdr ? gl.RGBA16F : gl.RGBA8;
    const type = hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const tex = GL.texture(gl, w, h, { internal, type });
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      if (hdr) return GL.target(gl, w, h, false);
      throw new Error('Could not create a render target');
    }
    return { fb, tex, w, h };
  };

  // Off-screen buffer with two outputs: color (location 0) and a second "data" texture
  // (location 1, e.g. distance). `both` draws into the two, `color` into the color only, so
  // the data texture can be read while adding more to the color.
  GL.mrtTarget = (gl, w, h, hdr) => {
    const internal = hdr ? gl.RGBA16F : gl.RGBA8;
    const type = hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const colorTex = GL.texture(gl, w, h, { internal, type });
    const dataTex = GL.texture(gl, w, h, { internal, type, filter: gl.NEAREST });
    const fbBoth = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbBoth);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, dataTex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const fbColor = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbColor);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { both: { fb: fbBoth, w, h }, color: { fb: fbColor, w, h }, colorTex, dataTex, w, h };
  };

  GL.deleteMrtTarget = (gl, t) => {
    if (!t) return;
    gl.deleteFramebuffer(t.both.fb);
    gl.deleteFramebuffer(t.color.fb);
    gl.deleteTexture(t.colorTex);
    gl.deleteTexture(t.dataTex);
  };

  GL.deleteTarget = (gl, t) => {
    if (!t) return;
    gl.deleteFramebuffer(t.fb);
    gl.deleteTexture(t.tex);
  };

  // Upload a canvas (2D) as a premultiplied, mipmapped texture.
  GL.canvasTexture = (gl, canvas, mipmaps = true) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (mipmaps) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };

  VG.GL = GL;
})(window.VG);
