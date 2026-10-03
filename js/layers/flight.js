'use strict';
// 3D flight — an endless flight over a landscape or through a tunnel. Each pixel follows its line
// of sight through a world described by formulas (no 3D models), so the world never ends. Neon
// shapes float along the way or form gates, particles fly past (hidden behind hills), and kicks
// send light waves racing ahead. The ground can be neon, a built-in material or your image, neon
// structures can rise from it, and water below a chosen height mirrors the whole world. Like every layer it's stateless: the camera position comes from
// the song time (plus how loud the music has been, for the speed boost), so any frame renders on
// its own and the preview always matches the export.
(function (VG) {
  const U = VG.util;
  const B = VG.analysis.binding;
  const NB = VG.analysis.NB;
  const SONG_COLS = 48;

  const FS = `
uniform vec3 uCamPos;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
uniform float uFocal;
uniform float uTime;
uniform float uFar;
uniform float uSteps;
uniform vec4 uPath;
uniform uint uSeedU;
uniform int uFogClear;
uniform vec3 uFogCol;
uniform vec3 uLightDir;
uniform vec3 uSunCol;
uniform vec3 uAmbCol;

uniform float uHeight;
uniform float uScale;
uniform float uRough;
uniform float uValley;
uniform float uRoad;
uniform float uCell;
uniform float uDensity;
uniform float uContour;

uniform float uGrid;
uniform float uLineW;
uniform float uLineGlow;
uniform float uLineBright;
uniform vec3 uLineCol;
uniform vec3 uLineCol2;
uniform float uSurf;
uniform vec3 uSurfCol;
uniform vec3 uWinCol;

uniform int uMat;
uniform float uMatScale;
uniform float uMatBright;
uniform float uMatGlow;
uniform vec3 uTint;
uniform float uTintAmt;
uniform int uGridOver;
uniform sampler2D uTex;
uniform int uHasTex;
uniform float uTexScale;
uniform int uTexMirror;

uniform int uSky;
uniform vec3 uSkyTop;
uniform vec3 uSkyHor;
uniform float uSkyBright;
uniform int uSun;
uniform vec3 uSunDir;
uniform float uSunSize;
uniform vec3 uSun1;
uniform vec3 uSun2;
uniform float uSunStripes;
uniform float uSunGlow;
uniform float uStars;

uniform float uWaveZ[8];
uniform float uWaveA[8];
uniform float uWaveW;
uniform vec3 uWaveCol;

uniform float uRadius;
uniform int uShape;
uniform int uShape2;
uniform float uMorph;
uniform float uTwist;
uniform int uTStyle;
uniform float uRing;
uniform float uLines;

uniform sampler2D uNoise;
uniform vec2 uNoiseOff;
uniform sampler2D uSpec;
uniform vec4 uSong;
uniform int uSongMirror;
uniform float uSongCurve;

uniform float uFigSpace;
uniform float uFigDensity;
uniform float uFigSize;
uniform float uFigSpread;
uniform float uFigY;
uniform float uFigSpin;
uniform float uFigThick;
uniform float uFigGlow;
uniform int uFigShape;
uniform int uFigGlass;
uniform vec3 uFigCols[4];
uniform int uFigColMode;
uniform float uFigBright;

uniform float uStSpace;
uniform float uStDensity;
uniform float uStHeight;
uniform float uStSize;
uniform float uStTilt;
uniform float uStTop;
uniform int uStShape;
uniform int uStStyle;
uniform float uStEdge;
uniform float uStGlow;
uniform float uStBright;
uniform vec3 uStCols[4];
uniform int uStColMode;

uniform float uWaterY;
uniform vec3 uWaterCol;
uniform float uClarity;
uniform float uMirror;
uniform float uRipple;
uniform float uRippleSize;
uniform float uRippleT;
uniform sampler2D uScene;

layout(location = 1) out vec4 outData;

uint hashU(uint x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float hashI(ivec2 c, uint k) {
  return float(hashU(uint(c.x) * 0x9E3779B1u ^ hashU(uint(c.y) + k + uSeedU))) * (1.0 / 4294967296.0);
}
float hashF(float c, uint k) { return hashI(ivec2(int(c), 7), k); }
float hash3(vec3 c) {
  uint h = hashU(uint(int(c.x)) * 0x9E3779B1u ^ hashU(uint(int(c.y)) * 0x85EBCA77u ^ hashU(uint(int(c.z)) + uSeedU)));
  return float(h) * (1.0 / 4294967296.0);
}

// Smooth value noise from a 256x256 random texture: one lookup, with the in-between remapped
// so the hills have smooth slopes. The graphics card blends neighboring values with limited
// precision, which is fine for tracing but shows as hatching in the lighting, so shading
// (gPrecise) blends the four values itself.
bool gPrecise;
// Reflections and the ground seen through water are blurred by ripples: trace them with less
// detail (fewer noise layers, fewer steps).
bool gLow;
float vnoise(vec2 p) {
  p += uNoiseOff;
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  if (!gPrecise) return textureLod(uNoise, (i + f + 0.5) / 256.0, 0.0).r;
  ivec2 c = ivec2(i) & 255;
  ivec2 c1 = (c + 1) & 255;
  float a = texelFetch(uNoise, c, 0).r;
  float b = texelFetch(uNoise, ivec2(c1.x, c.y), 0).r;
  float d = texelFetch(uNoise, ivec2(c.x, c1.y), 0).r;
  float e = texelFetch(uNoise, c1, 0).r;
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}
const mat2 OCT = mat2(1.6, 1.2, -1.2, 1.6);
// Fractal noise with a fractional number of layers: fewer layers far away, without popping.
float fbm(vec2 p, float oct) {
  float s = 0.0, a = 1.0, n = 0.0;
  for (int i = 0; i < 7; i++) {
    float w = clamp(oct - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    s += a * w * vnoise(p);
    n += a * w;
    a *= uRough;
    p = OCT * p + vec2(17.3, -9.1);
  }
  return s / max(n, 1e-4);
}
float ridged(vec2 p, float oct) {
  float s = 0.0, a = 1.0, n = 0.0;
  for (int i = 0; i < 7; i++) {
    float w = clamp(oct - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    float v = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
    s += a * w * v * v;
    n += a * w;
    a *= uRough;
    p = OCT * p + vec2(17.3, -9.1);
  }
  return s / max(n, 1e-4);
}

// The winding line the camera flies along (same formula as in the JavaScript camera).
vec2 path(float z) {
  return vec2(uPath.x * (sin(z * uPath.y) + 0.6 * sin(z * uPath.y * 0.47 + 1.7)), uPath.z * sin(z * uPath.w + 0.4));
}
float fogAmt(float t) {
  float x = t / uFar;
  return 1.0 - exp(-x * x * 3.0);
}
// Light waves sent ahead on beats (world z of each wave and its strength).
float waves(float z) {
  float s = 0.0;
  for (int i = 0; i < 8; i++) {
    if (uWaveA[i] > 0.0) s += uWaveA[i] * exp(-abs(z - uWaveZ[i]) / uWaveW);
  }
  return s;
}
// How much of a pixel (footprint fp, world units) a line of width w covers at distance d.
float lineCov(float d, float w, float fp) {
  float ww = max(w, fp);
  return clamp((ww * 0.5 - d) / fp + 0.5, 0.0, 1.0) * min(1.0, w / fp);
}
// Neon line of width w: crisp core + soft glow (width gw), turning into an even average where
// lines are denser than pixels (avoids shimmering in the distance). fp = pixel footprint.
vec2 neonLineW(float d, float w, float gw, float spacing, float fp) {
  fp = max(fp, 1e-5);
  float m = smoothstep(0.2, 0.6, fp / spacing);
  float core = mix(lineCov(d, w, fp), w / spacing, m);
  float glow = mix(exp(-d / gw), 2.0 * gw / spacing, m);
  return vec2(core, glow);
}
vec2 neonLine(float d, float spacing, float fp) {
  return neonLineW(d, uLineW, spacing * 0.045, spacing, fp);
}
// How much the world position changes from one pixel to the next (set in main, used to keep
// lines smooth), the same for the angle around the tunnel, and whether shadows are skipped
// (inside reflections).
vec3 gFw;
float gFu;
bool gNoShadow;
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdSeg(vec3 p, vec3 a, vec3 b) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
vec4 hexGrid(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
  vec4 r = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hc.xy) : vec4(h.zw, hc.zw + 0.5);
  vec2 a = abs(r.xy);
  return vec4(0.5 - max(dot(a, s * 0.5), a.x), r.zw, 0.0);
}

// ---------------------------------------------------------------- terrain
#if SCENE == 0
// The tallest the ground can get (alien ridges are sharpened and reach 1.4x the height).
#if STYLE == 2
#define TOP_K 1.42
#else
#define TOP_K 1.02
#endif
float corridor(vec2 xz) {
  return smoothstep(uRoad, uRoad * 1.8 + 2.0, abs(xz.x - path(xz.y).x));
}
#if STYLE == 6
// "Your song": the ground is the track's spectrum; rows ahead are the music about to play.
float terrainH(vec2 xz, float oct) {
  float dx = (xz.x - path(xz.y).x) / uSong.w;
  float v = (xz.y * uSong.x - uSong.y) * uSong.z;
  float band = uSongMirror == 1 ? 1.0 - abs(dx) : dx * 0.5 + 0.5;
  float lv = texture(uSpec, vec2(clamp(band, 0.01, 0.99), clamp(v, 0.0, 1.0))).r;
  float fade = smoothstep(1.0, 0.8, abs(dx)) * smoothstep(0.0, 0.04, v) * smoothstep(1.0, 0.9, v);
  return uHeight * pow(clamp(lv, 0.0, 1.0), uSongCurve) * fade * mix(1.0, corridor(xz), uValley);
}
#elif STYLE == 3
float lpVert(vec2 v) {
  vec2 xz = v * uCell;
  float h = vnoise(xz * uScale) * 0.75 + hashI(ivec2(v), 3u) * 0.5 * uRough;
  return smoothstep(0.1, 1.0, h) * uHeight * mix(1.0, corridor(xz), uValley);
}
float terrainH(vec2 xz, float oct) {
  vec2 g = xz / uCell;
  vec2 i = floor(g);
  vec2 f = g - i;
  float h00 = lpVert(i);
  float h11 = lpVert(i + 1.0);
  if (f.x > f.y) {
    float h10 = lpVert(i + vec2(1.0, 0.0));
    return h00 + (h10 - h00) * f.x + (h11 - h10) * f.y;
  }
  float h01 = lpVert(i + vec2(0.0, 1.0));
  return h00 + (h11 - h01) * f.x + (h01 - h00) * f.y;
}
#elif STYLE == 5
float terrainH(vec2 xz, float oct) { return 0.0; }
#else
float terrainH(vec2 xz, float oct) {
  vec2 q = xz * uScale;
  float h;
#if STYLE == 1 || STYLE == 2
  h = ridged(q, oct);
#if STYLE == 2
  h = h * h * 1.4;
#endif
#else
  h = smoothstep(0.12, 0.95, fbm(q, oct));
#endif
#if STYLE == 1
  h *= corridor(xz);
#else
  h *= mix(1.0, corridor(xz), uValley);
#endif
  return h * uHeight;
}
#endif
#if STYLE == 5
// Neon city: one building per block (some blocks empty), streets along the flight path.
float bldH(vec2 id) {
  vec2 c = (id + 0.5) * uCell;
  if (abs(c.x - path(c.y).x) < uRoad + uCell * 0.5) return 0.0;
  if (hashI(ivec2(id), 5u) > uDensity) return 0.0;
  float r = hashI(ivec2(id), 6u);
  return uHeight * (0.25 + 0.75 * r * r);
}
float cityD(vec3 p, out float h, out vec3 lp) {
  vec2 id = floor(p.xz / uCell);
  h = bldH(id);
  vec2 c = (id + 0.5) * uCell;
  lp = vec3(p.x - c.x, p.y - h * 0.5, p.z - c.y);
  float d = p.y;
  if (h > 0.0) d = min(d, sdBox(lp, vec3(uCell * 0.36, h * 0.5, uCell * 0.36)));
  return d;
}
#endif
vec3 skyGrad(vec3 rd) {
  return mix(uSkyHor, uSkyTop, smoothstep(-0.03, 0.5, rd.y)) * uSkyBright;
}
vec4 sky(vec3 rd) {
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (uSky == 1) {
    col = skyGrad(rd);
    a = 1.0;
  }
  if (uStars > 0.0 && rd.y > -0.02) {
    vec3 d = rd * 260.0;
    vec3 id = floor(d);
    float h = hash3(id);
    if (h > 1.0 - 0.05 * uStars) {
      vec3 f = d - id - 0.5;
      float tw = 0.6 + 0.4 * sin(uTime * (1.5 + 3.0 * fract(h * 37.0)) + h * 80.0);
      col += vec3(0.9, 0.95, 1.0) * smoothstep(0.3, 0.0, length(f)) * tw * smoothstep(-0.02, 0.15, rd.y);
    }
  }
  if (uSun == 1) {
    float cs = dot(rd, uSunDir);
    if (cs > 0.0) {
      vec3 sr = normalize(cross(vec3(0.0, 1.0, 0.0), uSunDir));
      vec3 su = cross(uSunDir, sr);
      vec2 sp = vec2(dot(rd, sr), dot(rd, su)) / cs / uSunSize;
      float r = length(sp);
      float px = PX() / uFocal / uSunSize;
      float disc = clamp((1.0 - r) / px + 0.5, 0.0, 1.0);
      if (uSunStripes > 0.0 && sp.y < 0.35) {
        // Retro stripes: gaps get wider toward the bottom of the sun.
        float k = clamp((0.35 - sp.y) / 1.35, 0.0, 1.0) * 0.85;
        float f = fract(sp.y * uSunStripes * 0.5);
        float w = px * uSunStripes * 0.5;
        disc *= clamp((f - k) / w + 0.5, 0.0, 1.0);
      }
      vec3 sc = mix(uSun2, uSun1, clamp(sp.y * 0.5 + 0.5, 0.0, 1.0));
      col = col * (1.0 - disc) + sc * disc;
      a = max(a, disc);
      col += sc * uSunGlow * 0.35 * exp(-max(r - 1.0, 0.0) * 2.5) * (1.0 - disc);
    }
  }
  return vec4(col, a);
}
vec4 fogTarget(vec3 rd) {
  return uSky == 1 ? vec4(skyGrad(rd), 1.0) : vec4(0.0);
}
#endif

// ---------------------------------------------------------------- tunnel
#if SCENE == 1
float shapeD(vec2 q, int s) {
  if (s == 0) return uRadius - length(q);
  float n = s == 1 ? 4.0 : s == 2 ? 3.0 : 6.0;
  return -sdNgon(q, uRadius / sqrt(cos(PI / n)), n);
}
vec2 tunnelQ(vec3 p) {
  return rot(-uTwist * p.z) * (p.xy - path(p.z));
}
float tunnelD(vec3 p) {
  vec2 q = tunnelQ(p);
  float d = shapeD(q, uShape);
  if (uMorph > 0.0) d = mix(d, shapeD(q, uShape2), uMorph);
  return d;
}
vec4 fogTarget(vec3 rd) {
  return uFogClear == 1 ? vec4(0.0) : vec4(uFogCol, 1.0);
}
#endif

// Light coming from the sky in a direction (for shiny and glass surfaces).
vec3 skyEnv(vec3 r) {
#if SCENE == 0
  vec3 c = uSky == 1 ? skyGrad(r) : uAmbCol * (0.6 + 0.6 * max(r.y, 0.0));
#else
  vec3 c = uAmbCol * 0.6;
#endif
  return c + uSunCol * pow(max(dot(r, uLightDir), 0.0), 64.0) * 0.6;
}

// ---------------------------------------------------------------- neon shapes
#if FIGS > 0
struct FigInfo {
  vec3 center;
  float s;
  int type;
  float a1;
  float a2;
  vec3 col;
};
float sdBoxFrame(vec3 p, vec3 b, float e) {
  p = abs(p) - b;
  vec3 q = abs(p + e) - e;
  return min(min(
    length(max(vec3(p.x, q.y, q.z), 0.0)) + min(max(p.x, max(q.y, q.z)), 0.0),
    length(max(vec3(q.x, p.y, q.z), 0.0)) + min(max(q.x, max(p.y, q.z)), 0.0)),
    length(max(vec3(q.x, q.y, p.z), 0.0)) + min(max(q.x, max(q.y, p.z)), 0.0));
}
float outline2D(vec3 q, float d2, float th) {
  return length(vec2(abs(d2), q.z)) - th;
}
// Wireframe shapes (the glowing edges).
float frameSD(vec3 q, int type, float s, float th) {
#if FIGS == 2
  // Gates face the camera: flat outlines.
  if (type == 0) { vec2 b = abs(q.xy) - vec2(s * 0.8); return outline2D(q, length(max(b, 0.0)) + min(max(b.x, b.y), 0.0), th); }
  if (type == 1 || type == 4) return outline2D(q, sdNgon(q.xy, s, 3.0), th);
  if (type == 2) return outline2D(q, sdNgon(rot(0.7853982) * q.xy, s, 4.0), th);
  if (type == 3) return outline2D(q, length(q.xy) - s, th);
  return outline2D(q, sdNgon(q.xy, s, 6.0), th);
#else
  if (type == 0) return sdBoxFrame(q, vec3(s * 0.7), th);
  if (type == 1) {
    vec3 p = vec3(abs(q.x), q.y, abs(q.z));
    vec3 c = vec3(s * 0.8, -0.6 * s, s * 0.8);
    float d = min(sdSeg(p, c, vec3(s * 0.8, -0.6 * s, 0.0)), sdSeg(p, c, vec3(0.0, -0.6 * s, s * 0.8)));
    return min(d, sdSeg(p, c, vec3(0.0, s, 0.0))) - th;
  }
  if (type == 2) {
    vec3 p = abs(q);
    p.y /= 1.4;
    float d = min(sdSeg(p, vec3(s, 0.0, 0.0), vec3(0.0, s, 0.0)), sdSeg(p, vec3(0.0, s, 0.0), vec3(0.0, 0.0, s)));
    return min(d, sdSeg(p, vec3(0.0, 0.0, s), vec3(s, 0.0, 0.0))) - th;
  }
  if (type == 3) return length(vec2(length(q.xy) - s, q.z)) - th;
  if (type == 4) return outline2D(q, sdNgon(q.xy, s, 3.0), th);
  return outline2D(q, sdNgon(q.xy, s, 6.0), th);
#endif
}
// Solid versions (glass style).
float solidSD(vec3 q, int type, float s) {
  if (type == 0) return sdBox(q, vec3(s * 0.7));
  if (type == 1) {
    float side = max(1.6 * abs(q.x) + q.y, 1.6 * abs(q.z) + q.y) - s;
    return max(-q.y - 0.6 * s, side * 0.53);
  }
  if (type == 2) return (abs(q.x) + abs(q.y) / 1.4 + abs(q.z) - s) * 0.5;
  if (type == 3) return length(vec2(length(q.xy) - s, q.z)) - s * 0.22;
  if (type == 4) return max(sdNgon(q.xy, s, 3.0), abs(q.z) - s * 0.15);
  return max(sdNgon(q.xy, s, 6.0), abs(q.z) - s * 0.15);
}
// The shape living in spacing cell c (at most one per cell, never crossing into the next).
bool figInfo(float c, out FigInfo f) {
  f.center = vec3(0.0);
  f.s = 1.0;
  f.type = 0;
  f.a1 = 0.0;
  f.a2 = 0.0;
  f.col = vec3(0.0);
  if (hashF(c, 21u) > uFigDensity) return false;
  float zc = (c + 0.5) * uFigSpace;
  vec2 pc = path(zc);
  float h1 = hashF(c, 22u), h2 = hashF(c, 23u), h3 = hashF(c, 24u), h4 = hashF(c, 25u);
  f.type = uFigShape >= 0 ? uFigShape : int(h3 * 6.0) % 6;
#if FIGS == 1
  f.center = vec3(pc.x + (h1 * 2.0 - 1.0) * uFigSpread, uFigY + pc.y + (h2 * 2.0 - 1.0) * uFigSpread * 0.4, zc);
  f.s = uFigSize * (0.7 + 0.6 * h4);
#else
  f.center = vec3(pc.x, uFigY + pc.y, zc);
  f.s = uFigSize;
#endif
  f.a1 = uFigSpin * (h1 < 0.5 ? 1.0 : -1.0) + h2 * TAU;
  f.a2 = f.a1 * 0.61 + h4 * TAU;
  f.col = uFigColMode == 0 ? uFigCols[int(h4 * 4.0) % 4] : uFigCols[0];
  return true;
}
// x: distance to the visible surface (wire or glass), y: distance to the glowing edges.
vec2 figDist(vec3 p, FigInfo f, float pxw) {
  vec3 q = p - f.center;
#if FIGS == 1
  q.xz = rot(f.a1) * q.xz;
  q.xy = rot(f.a2) * q.xy;
#else
  q.xy = rot(f.a1) * q.xy;
#endif
  // Wires never get thinner than about a pixel, so far shapes don't break up.
  float th = max(uFigThick, pxw * 0.8);
  float fr = frameSD(q, f.type, f.s, th);
#if FIGS == 1
  return vec2(uFigGlass == 1 ? solidSD(q, f.type, f.s) : fr, fr);
#else
  return vec2(fr, fr);
#endif
}
// Visit the spacing cells the ray crosses (nearest first). Only shapes whose bounding sphere
// (plus glow) the ray passes through are traced, so most rays cost a few cheap tests.
void traceFigures(vec3 ro, vec3 rd, float tEnd, float pxa, inout float tHit, inout FigInfo hitF, inout vec3 glow) {
  float c0 = floor(ro.z / uFigSpace);
  float c1 = floor((ro.z + rd.z * tEnd) / uFigSpace);
  float dir = c1 >= c0 ? 1.0 : -1.0;
  int n = int(min(abs(c1 - c0) + 1.0, 24.0));
  for (int k = 0; k < 24; k++) {
    if (k >= n) break;
    FigInfo f;
    if (!figInfo(c0 + float(k) * dir, f)) continue;
    float gw = f.s * 0.12;
    float rb = f.s * 1.6 + gw * 6.0;
    vec3 oc = ro - f.center;
    float b = dot(oc, rd);
    float disc = b * b - (dot(oc, oc) - rb * rb);
    if (disc <= 0.0) continue;
    float sq = sqrt(disc);
    float tb = min(-b + sq, tEnd);
    float t = max(-b - sq, 0.0);
    for (int j = 0; j < 64; j++) {
      if (t >= tb) break;
      vec2 d = figDist(ro + rd * t, f, t * pxa);
      if (d.x < 0.001 * t + 0.0008) {
        tHit = t;
        hitF = f;
        return;
      }
      float adv = max(d.x * 0.9, 0.0004 * t + 0.002);
      glow += f.col * exp(-max(d.y, 0.0) / gw) * adv * (1.0 - fogAmt(t)) * uFigGlow * uFigBright / max(uFigSize, 0.1);
      t += adv;
    }
  }
}
vec3 shadeFigure(vec3 pos, vec3 rd, float t, float pxa, FigInfo f) {
  if (uFigGlass == 0 || FIGS == 2) return f.col * uFigBright;
  vec2 e = vec2(0.004, 0.0);
  float pxw = t * pxa;
  vec3 n = normalize(vec3(
    figDist(pos + e.xyy, f, pxw).x - figDist(pos - e.xyy, f, pxw).x,
    figDist(pos + e.yxy, f, pxw).x - figDist(pos - e.yxy, f, pxw).x,
    figDist(pos + e.yyx, f, pxw).x - figDist(pos - e.yyx, f, pxw).x));
  float fres = pow(1.0 - abs(dot(n, rd)), 2.5);
  float edge = clamp(-figDist(pos, f, pxw).y / max(pxw, 1e-4) + 0.5, 0.0, 1.0);
  return f.col * uFigBright * (0.05 + 0.75 * fres + edge);
}
#endif

// ---------------------------------------------------------------- neon structures
#if STRUCT == 1
// One structure per ground cell (some cells empty): an n-sided prism, obelisk, pyramid or
// crystal, sunk into the ground and tilted. Built from a few flat faces (n-fold symmetric).
struct StInfo {
  vec3 base;
  float yaw;
  float tilt;
  float n;
  float r0;
  float r1;
  float hs;
  float h;
  float flatTop;
  vec3 col;
  vec3 center;
  float rb;
};
bool stInfo(vec2 cell, out StInfo s) {
  s.base = vec3(0.0);
  s.yaw = 0.0;
  s.tilt = 0.0;
  s.n = 4.0;
  s.r0 = 1.0;
  s.r1 = 1.0;
  s.hs = 1.0;
  s.h = 1.0;
  s.flatTop = 1.0;
  s.col = vec3(0.0);
  s.center = vec3(0.0);
  s.rb = 0.0;
  ivec2 ic = ivec2(cell);
  if (hashI(ic, 41u) > uStDensity) return false;
  float h1 = hashI(ic, 42u), h2 = hashI(ic, 43u), h3 = hashI(ic, 44u);
  float h4 = hashI(ic, 45u), h5 = hashI(ic, 46u), h6 = hashI(ic, 47u);
  vec2 c = (cell + 0.5 + (vec2(h1, h2) - 0.5) * 0.4) * uStSpace;
  float size = uStSize * (0.6 + 0.8 * h4);
  // Keep the flight path clear.
  if (abs(c.x - path(c.y).x) < uRoad + size * 2.0 + 1.0) return false;
  int type = uStShape >= 0 ? uStShape : int(h3 * 6.0) % 6;
  float height = uStHeight * (0.4 + 0.6 * h5);
  float sink = size * 0.6;
  s.base = vec3(c.x, terrainH(c, 3.0) - sink, c.y);
  s.yaw = h6 * TAU;
  s.tilt = (h1 - 0.5) * 2.0 * uStTilt;
  float H = height + sink;
  if (type <= 2) {
    s.n = type == 0 ? 3.0 : type == 1 ? 4.0 : 6.0;
    s.r0 = size;
    s.r1 = size;
    s.hs = H;
    s.h = H;
    s.flatTop = 1.0;
  } else if (type == 3) {
    s.n = 4.0;
    s.r0 = size * 0.75;
    s.r1 = size * 0.5;
    s.hs = H * 0.86;
    s.h = H;
    s.flatTop = 0.0;
  } else if (type == 4) {
    s.n = 4.0;
    s.r0 = size * 1.6;
    s.r1 = size * 1.6;
    s.hs = 0.0;
    s.h = sink + height * 0.6;
    s.flatTop = 0.0;
  } else {
    s.n = 6.0;
    s.r0 = size * 0.6;
    s.r1 = size * 0.6;
    s.hs = H * 0.72;
    s.h = H;
    s.flatTop = 0.0;
  }
  s.col = uStColMode == 0 ? uStCols[int(h5 * 4.0) % 4] : uStCols[0];
  // Bounding sphere around the middle of the (tilted) shape.
  vec2 yz = transpose(rot(s.tilt)) * vec2(s.h * 0.5, 0.0);
  vec2 xz = transpose(rot(s.yaw)) * vec2(0.0, yz.y);
  s.center = s.base + vec3(xz.x, yz.x, xz.y);
  s.rb = sqrt(s.h * s.h * 0.25 + s.r0 * s.r0);
  return true;
}
vec3 stLocal(vec3 p, StInfo s) {
  vec3 q = p - s.base;
  q.xz = rot(s.yaw) * q.xz;
  q.yz = rot(s.tilt) * q.yz;
  return q;
}
// x: distance to the solid shape, y: distance to its glowing edges (minus their thickness).
vec2 stDist(vec3 q, StInfo s, float th) {
  float an = PI / s.n;
  float a = mod(atan(q.x, q.z) + an, 2.0 * an) - an;
  float rr = length(q.xz);
  vec3 f = vec3(abs(rr * sin(a)), q.y, rr * cos(a));
  float ap0 = s.r0 * cos(an);
  float ap1 = s.r1 * cos(an);
  float d = -f.y;
  if (s.hs > 1e-3) {
    float sl = (ap1 - ap0) / s.hs;
    d = max(d, (f.z - ap0 - sl * f.y) / sqrt(1.0 + sl * sl));
  }
  vec3 v0 = vec3(s.r0 * sin(an), 0.0, ap0);
  vec3 v1 = vec3(s.r1 * sin(an), s.hs, ap1);
  float e = sdSeg(f, v0, v1);
  if (s.flatTop > 0.5) {
    d = max(d, f.y - s.h);
    e = min(e, sdSeg(f, v1, vec3(0.0, s.h, ap1)));
  } else {
    float tk = s.h - s.hs;
    d = max(d, ((f.z - ap1) * tk + (f.y - s.hs) * ap1) / sqrt(tk * tk + ap1 * ap1));
    e = min(e, sdSeg(f, v1, vec3(0.0, s.h, 0.0)));
  }
  return vec2(d, e - th);
}
// Walk the ground cells the ray crosses (nearest first); only structures whose bounding sphere
// the ray passes near are traced.
void traceStructures(vec3 ro, vec3 rd, float tEnd, float pxa, inout float tHit, inout StInfo hitS, inout vec3 glow) {
  vec2 cell = floor(ro.xz / uStSpace);
  vec2 sd = vec2(rd.x >= 0.0 ? 1.0 : -1.0, rd.z >= 0.0 ? 1.0 : -1.0);
  vec2 inv = 1.0 / max(abs(rd.xz), vec2(1e-6));
  vec2 tNext = ((cell + max(sd, 0.0)) * uStSpace - ro.xz) * sd * inv;
  vec2 tDelta = uStSpace * inv;
  float tc = 0.0;
  for (int i = 0; i < 48; i++) {
    if (tc > tEnd) break;
    if (rd.y >= 0.0 && ro.y + rd.y * tc > uStTop) break;
    StInfo s;
    if (stInfo(cell, s)) {
      float gw = 0.08 * (s.r0 + 0.5);
      float rb = s.rb + gw * 6.0;
      vec3 oc = ro - s.center;
      float b = dot(oc, rd);
      float disc = b * b - (dot(oc, oc) - rb * rb);
      if (disc > 0.0) {
        float sq = sqrt(disc);
        float tb = min(-b + sq, tEnd);
        float t = max(-b - sq, 0.0);
        for (int j = 0; j < 64; j++) {
          if (t >= tb) break;
          vec2 d = stDist(stLocal(ro + rd * t, s), s, max(uStEdge, t * pxa * 0.8));
          float surf = uStStyle == 2 ? d.y : d.x;
          if (surf < 0.001 * t + 0.0008) {
            tHit = t;
            hitS = s;
            return;
          }
          float adv = max(surf * 0.85, 0.0004 * t + 0.002);
          glow += s.col * exp(-max(d.y, 0.0) / gw) * adv * (1.0 - fogAmt(t)) * uStGlow * uStBright * 0.5;
          t += adv;
        }
      }
    }
    if (tNext.x < tNext.y) {
      tc = tNext.x;
      tNext.x += tDelta.x;
      cell.x += sd.x;
    } else {
      tc = tNext.y;
      tNext.y += tDelta.y;
      cell.y += sd.y;
    }
  }
}
float structSolid(vec3 p) {
  StInfo s;
  if (!stInfo(floor(p.xz / uStSpace), s)) return 1e3;
  return stDist(stLocal(p, s), s, 0.0).x;
}
#endif

// ---------------------------------------------------------------- shadows
#if SHADOWS == 1
// Soft shadow toward the sun from hills (and structures).
float softShadow(vec3 ro, vec3 rd) {
  if (gNoShadow) return 1.0;
  float top = uStTop;
  float res = 1.0;
  float t = 0.1;
  for (int i = 0; i < 40; i++) {
    vec3 p = ro + rd * t;
    if (p.y > top || t > uFar * 0.6) break;
#if STYLE == 5
    float bh;
    vec3 lp;
    float d = cityD(p, bh, lp);
#else
    // A little tolerance: the shadow test uses a smoother ground than the one drawn.
    float d = p.y - terrainH(p.xz, 3.0) + 0.04;
#endif
#if STRUCT == 1
    d = min(d, structSolid(p));
#endif
    if (d < 0.001) return 0.0;
    res = min(res, 8.0 * d / t);
    t += clamp(d * 0.8, 0.04, 1.5 + 0.05 * t);
  }
  return clamp(res, 0.0, 1.0);
}
#endif

#if STRUCT == 1
// Glass (rim light + sky reflection), solid (dark, lit by the sun) or edges only; the edges
// glow, and the whole structure lights up when a beat wave passes.
vec3 shadeStructure(vec3 pos, vec3 rd, float t, float pxa, StInfo s) {
  float th = max(uStEdge, t * pxa * 0.8);
  vec2 d0 = stDist(stLocal(pos, s), s, th);
  vec3 col = s.col * uStBright * (1.0 + 2.0 * waves(s.base.z));
  if (uStStyle == 2) return col;
  vec2 e = vec2(0.004, 0.0);
  vec3 n = normalize(vec3(
    stDist(stLocal(pos + e.xyy, s), s, th).x - stDist(stLocal(pos - e.xyy, s), s, th).x,
    stDist(stLocal(pos + e.yxy, s), s, th).x - stDist(stLocal(pos - e.yxy, s), s, th).x,
    stDist(stLocal(pos + e.yyx, s), s, th).x - stDist(stLocal(pos - e.yyx, s), s, th).x));
  float edge = clamp(-d0.y / max(t * pxa, 1e-4) + 0.5, 0.0, 1.0);
  float fres = pow(1.0 - abs(dot(n, rd)), 2.5);
  float shadow = 1.0;
#if SHADOWS == 1
  shadow = softShadow(pos + n * 0.05, uLightDir);
#endif
  vec3 body;
  if (uStStyle == 0) body = col * (0.04 + 0.5 * fres) + skyEnv(reflect(rd, n)) * fres * 0.5;
  else body = s.col * 0.12 * (0.25 + 0.75 * max(dot(n, uLightDir), 0.0) * shadow) + col * 0.12 * fres;
  return mix(body, col * 1.3, edge);
}
#endif

// ---------------------------------------------------------------- materials
#if MAT == 1
// Built-in ground materials. Returns the surface color (rgb) and how glossy it is (a); glowing
// parts (lava, circuit traces) go to emit. fp = pixel footprint, used to fade fine detail.
vec4 material(vec3 pos, vec3 n, float hf, float fp, out vec3 emit) {
  vec2 q = pos.xz * uMatScale;
  float slope = 1.0 - n.y;
  // Fine detail fades out before it gets smaller than a pixel (no moire in the distance).
  float fine = 1.0 - smoothstep(0.012, 0.035, fp * uMatScale);
  float mid = 1.0 - smoothstep(0.045, 0.12, fp * uMatScale);
  float d1 = vnoise(q * 0.9);
  float d2 = mix(0.5, vnoise(q * 3.7 + 13.1), mid);
  float d3 = mix(0.5, vnoise(q * 11.0 + 7.7), fine);
  float detail = d1 * 0.5 + d2 * 0.33 + d3 * 0.17;
  emit = vec3(0.0);
  vec3 alb;
  float gloss = 0.1;
  if (uMat == 0) {
    float strata = 0.5 + 0.5 * sin(pos.y * 6.0 * uMatScale + d1 * 4.0);
    alb = mix(vec3(0.2, 0.19, 0.18), vec3(0.5, 0.46, 0.41), detail * 0.75 + strata * 0.25);
    alb *= 0.7 + 0.3 * smoothstep(0.6, 0.2, slope);
    gloss = 0.15;
  } else if (uMat == 1) {
    float rip = 0.5 + 0.5 * sin(dot(pos.xz, vec2(0.8, 0.6)) * 9.0 * uMatScale + d1 * 6.0);
    alb = mix(vec3(0.72, 0.52, 0.32), vec3(0.93, 0.76, 0.52), detail * 0.6 + rip * 0.4 * fine);
    alb *= 0.85 + 0.15 * (1.0 - slope);
    gloss = 0.2;
  } else if (uMat == 2) {
    vec3 rock = mix(vec3(0.22, 0.21, 0.22), vec3(0.45, 0.43, 0.42), detail);
    float line = 0.45 + (d1 - 0.5) * 0.25;
    float snow = smoothstep(line - 0.05, line + 0.05, hf) * smoothstep(0.55, 0.3, slope);
    snow = max(snow, smoothstep(0.85, 1.0, hf));
    alb = mix(rock, vec3(0.92, 0.95, 1.0), snow);
    gloss = mix(0.15, 0.35, snow);
  } else if (uMat == 3) {
    vec3 grass = mix(vec3(0.1, 0.22, 0.06), vec3(0.3, 0.45, 0.13), detail);
    vec3 dirt = mix(vec3(0.25, 0.19, 0.12), vec3(0.42, 0.33, 0.22), d2);
    vec3 rock = mix(vec3(0.3, 0.29, 0.27), vec3(0.5, 0.48, 0.45), d3);
    alb = mix(grass, dirt, smoothstep(0.55, 0.75, d2) * 0.6);
    alb = mix(alb, rock, smoothstep(0.35, 0.6, slope));
    gloss = 0.08;
  } else if (uMat == 4) {
    // Lava: dark rock with glowing cracks, hotter in the valleys.
    alb = mix(vec3(0.04, 0.035, 0.035), vec3(0.12, 0.1, 0.1), detail);
    float cr = abs(vnoise(q * 1.6 + 3.3) - 0.5) + abs(vnoise(q * 4.1 + 9.1) - 0.5) * 0.5 * fine;
    float crack = 1.0 - smoothstep(0.02, 0.09, cr);
    emit = vec3(1.0, 0.33, 0.06) * crack * (0.5 + 0.5 * smoothstep(0.6, 0.0, hf)) * 2.5 * uMatGlow;
    gloss = 0.2;
  } else if (uMat == 5) {
    alb = mix(vec3(0.55, 0.72, 0.85), vec3(0.85, 0.94, 1.0), detail);
    float cr = abs(vnoise(q * 2.3 + 5.0) - 0.5);
    alb *= 1.0 - 0.35 * (1.0 - smoothstep(0.01, 0.04, cr)) * fine;
    gloss = 0.8;
  } else if (uMat == 6) {
    alb = vec3(0.6, 0.62, 0.66);
    gloss = 1.0;
  } else if (uMat == 7) {
    float vein = abs(sin((pos.x + pos.z * 0.7) * 1.3 * uMatScale + fbm(q * 0.8, 3.0) * 7.0));
    alb = mix(vec3(0.35, 0.33, 0.36), vec3(0.93, 0.92, 0.9), smoothstep(0.0, 0.25, mix(0.5, vein, fine)));
    gloss = 0.6;
  } else if (uMat == 8) {
    // Circuit board: glowing traces on a fine grid, some broken, with pads.
    alb = vec3(0.02, 0.06, 0.04) + vec3(0.0, 0.03, 0.015) * detail;
    float k = uMatScale * 1.5;
    vec2 g = pos.xz * k;
    vec2 cid = floor(g);
    vec2 f = fract(g) - 0.5;
    float tx = hashI(ivec2(cid), 31u) < 0.55 ? abs(f.y) : 1.0;
    float tz = hashI(ivec2(cid), 32u) < 0.55 ? abs(f.x) : 1.0;
    float tr = lineCov(min(tx, tz) / k, 0.06 / k, max(fp, 1e-5));
    float pad = (1.0 - smoothstep(0.1, 0.16, length(f))) * step(0.7, hashI(ivec2(cid), 33u)) * fine;
    emit = uLineCol * (tr + pad) * 1.6 * uMatGlow;
    alb = mix(alb, vec3(0.6, 0.55, 0.3), (tr + pad) * 0.3);
    gloss = 0.4;
  } else {
    alb = vec3(0.05);
    gloss = 0.9;
  }
  return vec4(alb, gloss);
}
#endif
#if MAT == 2
// Your image, repeated over the ground and projected from three sides so slopes don't smear.
vec3 texTile(vec2 uv, vec2 dx, vec2 dy) {
  uv = uTexMirror == 1 ? 1.0 - abs(1.0 - mod(uv, 2.0)) : fract(uv);
  return textureGrad(uTex, uv, dx, dy).rgb;
}
vec3 imageAlbedo(vec3 pos, vec3 n, float fp) {
  if (uHasTex == 0) return vec3(0.3 + 0.2 * vnoise(pos.xz * 0.5));
  vec3 w = pow(abs(n), vec3(4.0));
  w /= w.x + w.y + w.z;
  float s = 1.0 / uTexScale;
  vec2 gx = vec2(fp * s, 0.0);
  vec2 gy = vec2(0.0, fp * s);
  vec3 c = vec3(0.0);
  if (w.y > 0.02) c += texTile(pos.xz * s, gx, gy) * w.y;
  if (w.x > 0.02) c += texTile(pos.zy * s, gx, gy) * w.x;
  if (w.z > 0.02) c += texTile(pos.xy * s, gx, gy) * w.z;
  return c;
}
#endif
#if MAT > 0
vec3 lightSurface(vec3 n, vec3 rd, vec3 alb, float gloss, vec3 emit, float shadow, float hf) {
  float diff = max(dot(n, uLightDir), 0.0) * shadow;
  // Light bouncing back from the sky behind the camera, so slopes facing away from the sun
  // (usually the ones facing you) aren't black.
  vec3 back = normalize(vec3(-uLightDir.x, 0.4, -uLightDir.z));
  float fill = max(dot(n, back), 0.0);
  vec3 c = alb * (uSunCol * (diff + fill * 0.18) + uAmbCol * (0.55 + 0.45 * n.y));
  vec3 hv = normalize(uLightDir - rd);
  c += uSunCol * pow(max(dot(n, hv), 0.0), mix(8.0, 160.0, gloss)) * gloss * 0.5 * shadow;
#if MAT == 1
  if (uMat == 6 || uMat == 9) {
    // Chrome mirrors the sky; holographic adds a rainbow that shifts with the viewing angle.
    vec3 r = reflect(rd, n);
    float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
    vec3 env = skyEnv(r);
    if (uMat == 9) env *= 0.6 + 0.6 * cos(TAU * (fres * 1.3 + hf * 0.7 + vec3(0.0, 0.33, 0.67)));
    else env *= alb * 1.4;
    c = mix(c * 0.4, env, 0.55 + 0.4 * fres);
  }
#endif
  return c + emit;
}
#endif

// ---------------------------------------------------------------- surfaces
#if SCENE == 0 && STYLE == 5
vec4 shadeWorld(vec3 pos, vec3 rd, float t, float pxa) {
  float bh;
  vec3 lp;
  float dAll = cityD(pos, bh, lp);
  vec3 lc = mix(uLineCol, uLineCol2, smoothstep(uFar * 0.05, uFar * 0.7, t));
  float wv = waves(pos.z);
  float hw = uCell * 0.36;
  float dB = bh > 0.0 ? sdBox(lp, vec3(hw, bh * 0.5, hw)) : 1e3;
  if (dB > pos.y + 0.002) {
    // Street level: glowing lines along the middle of the streets.
    vec2 gd = abs(fract(pos.xz / uCell - 0.5) - 0.5) * uCell;
    vec2 la = neonLine(gd.x, uCell, gFw.x);
    vec2 lb = neonLine(gd.y, uCell, gFw.z);
    float core = 1.0 - (1.0 - la.x) * (1.0 - lb.x);
    vec3 c = uSurfCol * uSurf * 0.5 + lc * (core * uLineBright * (1.0 + 2.0 * wv) + max(la.y, lb.y) * uLineGlow);
    return vec4(c + uWaveCol * wv * 0.08, 1.0);
  }
  vec3 hs = vec3(hw, bh * 0.5, hw);
  vec3 q = abs(lp) - hs;
  vec3 n;
  float dEdge;
  vec2 fuv;
  float fpn;
  if (q.y > q.x && q.y > q.z) {
    n = vec3(0.0, 1.0, 0.0);
    dEdge = min(-q.x, -q.z);
    fuv = lp.xz;
    fpn = max(gFw.x, gFw.z);
  } else if (q.x > q.z) {
    n = vec3(sign(lp.x), 0.0, 0.0);
    dEdge = min(-q.y, -q.z);
    fuv = vec2(lp.z, lp.y);
    fpn = max(gFw.y, gFw.z);
  } else {
    n = vec3(0.0, 0.0, sign(lp.z));
    dEdge = min(-q.y, -q.x);
    fuv = vec2(lp.x, lp.y);
    fpn = max(gFw.x, gFw.y);
  }
  vec2 ln = neonLine(max(dEdge, 0.0), hw, fpn);
  float shadow = 1.0;
#if SHADOWS == 1
  shadow = softShadow(pos + n * 0.03, uLightDir);
#endif
  float diff = clamp(dot(n, uLightDir), 0.0, 1.0) * shadow;
  vec3 c = uSurfCol * uSurf * (0.35 + 0.65 * diff);
  if (n.y < 0.5) {
    // Windows, some lit.
    vec2 wc = vec2(fuv.x / 0.5, (fuv.y + bh * 0.5) / 0.7);
    vec2 wi = floor(wc);
    vec2 wf = fract(wc) - 0.5;
    ivec2 bid = ivec2(floor(pos.xz / uCell)) * 37 + ivec2(int(n.x * 13.0), int(n.z * 29.0));
    float lit = step(0.62, hashI(ivec2(wi) + bid, 9u));
    float win = smoothstep(0.32, 0.26, abs(wf.x)) * smoothstep(0.3, 0.24, abs(wf.y));
    float far = smoothstep(0.25, 0.6, fpn / 0.5);
    c += uWinCol * lit * mix(win, 0.15, far) * 0.9;
  }
  c += lc * (ln.x * uLineBright * (1.0 + 2.0 * wv) + ln.y * uLineGlow * 0.6);
  return vec4(c, 1.0);
}
#elif SCENE == 0
vec4 shadeWorld(vec3 pos, vec3 rd, float t, float pxa) {
  gPrecise = true;
  float oct = gLow ? 3.0 : 5.0;
  float e = max(0.02, t * pxa * 2.0);
  float h = terrainH(pos.xz, oct);
  vec3 n;
#if STYLE == 3
  vec2 g = pos.xz / uCell;
  vec2 i = floor(g);
  vec2 f = g - i;
  vec3 a = vec3(i.x * uCell, lpVert(i), i.y * uCell);
  vec3 b = vec3((i.x + 1.0) * uCell, lpVert(i + 1.0), (i.y + 1.0) * uCell);
  vec3 cc = f.x > f.y ? vec3((i.x + 1.0) * uCell, lpVert(i + vec2(1.0, 0.0)), i.y * uCell) : vec3(i.x * uCell, lpVert(i + vec2(0.0, 1.0)), (i.y + 1.0) * uCell);
  n = normalize(cross(b - a, cc - a));
  if (n.y < 0.0) n = -n;
#else
  float hx = terrainH(pos.xz + vec2(e, 0.0), oct);
  float hz = terrainH(pos.xz + vec2(0.0, e), oct);
  n = normalize(vec3(h - hx, e, h - hz));
#endif
  float shadow = 1.0;
#if SHADOWS == 1
  gPrecise = false;
  shadow = softShadow(pos + n * 0.03 + vec3(0.0, 0.01, 0.0), uLightDir);
  gPrecise = true;
#endif
  vec3 lc = mix(uLineCol, uLineCol2, smoothstep(uFar * 0.05, uFar * 0.7, t));
  float wv = waves(pos.z);
  float core;
  float glow;
#if STYLE == 4
  // Topographic: glowing lines at equal heights.
  // Measured in height: the line is as wide as uLineW along the slope.
  float slope = max(sqrt(max(1.0 - n.y * n.y, 0.0)) / max(n.y, 0.05), 0.03);
  float dh = abs(fract(pos.y / uContour - 0.5) - 0.5) * uContour;
  vec2 ln = neonLineW(dh, uLineW * slope, uContour * 0.045, uContour, gFw.y);
  core = ln.x;
  glow = ln.y;
#elif STYLE == 3
  float dEdge = f.x > f.y ? min(min(f.y, 1.0 - f.x), (f.x - f.y) * 0.7071) : min(min(f.x, 1.0 - f.y), (f.y - f.x) * 0.7071);
  vec2 ln = neonLine(dEdge * uCell, uCell, max(gFw.x, gFw.z));
  core = ln.x;
  glow = ln.y;
#else
  vec2 gd = abs(fract(pos.xz / uGrid - 0.5) - 0.5) * uGrid;
  vec2 la = neonLine(gd.x, uGrid, gFw.x);
  vec2 lb = neonLine(gd.y, uGrid, gFw.z);
  core = 1.0 - (1.0 - la.x) * (1.0 - lb.x);
  glow = max(la.y, lb.y);
#endif
  vec3 lines = lc * (core * uLineBright * (1.0 + 2.0 * wv) + glow * uLineGlow * (1.0 + wv));
#if MAT == 0
  float diff = clamp(dot(n, uLightDir), 0.0, 1.0) * shadow;
  float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
  vec3 c = uSurfCol * uSurf * (0.3 + 0.7 * diff + 0.6 * rim) + lines;
#else
  float hf = h / max(uHeight, 1e-3);
  // Pixel size on the ground from distance and viewing angle (smooth, unlike the measured one,
  // which carries tiny steps from the tracing and would make fine detail flicker).
  float fpA = t * pxa / max(0.25, abs(dot(n, rd)));
#if MAT == 1
  vec3 emit;
  vec4 m = material(pos, n, hf, fpA, emit);
  vec3 alb = m.rgb;
  float gloss = m.a;
#else
  vec3 emit = vec3(0.0);
  vec3 alb = imageAlbedo(pos, n, fpA);
  float gloss = 0.15;
#endif
  alb *= mix(vec3(1.0), uTint, uTintAmt) * uMatBright;
  vec3 c = lightSurface(n, rd, alb, gloss, emit, shadow, hf);
  if (uGridOver == 1) c += lines;
#endif
  gPrecise = false;
  return vec4(c + uWaveCol * wv * 0.08, 1.0);
}
#else
vec4 shadeWorld(vec3 pos, vec3 rd, float t, float pxa) {
  vec2 q = tunnelQ(pos);
  vec2 e = vec2(0.01, 0.0);
  vec3 n = normalize(vec3(
    tunnelD(pos + e.xyy) - tunnelD(pos - e.xyy),
    tunnelD(pos + e.yxy) - tunnelD(pos - e.yxy),
    tunnelD(pos + e.yyx) - tunnelD(pos - e.yyx)));
  float u = atan(q.y, q.x) / TAU + 0.5;
  float perim = TAU * uRadius;
  float fpz = gFw.z;
  float fpu = gFu * perim;
  vec3 lc = mix(uLineCol, uLineCol2, smoothstep(uFar * 0.05, uFar * 0.7, t));
  float wv = waves(pos.z);
  float head = clamp(dot(n, -rd), 0.0, 1.0);
  vec3 c;
  float a = 1.0;
  if (uTStyle == 3) {
    // Hexagon tiles; a whole number of tiles around so the pattern closes seamlessly.
    float cells = max(3.0, floor(perim / uRing + 0.5));
    float tile = perim / cells;
    vec4 hx = hexGrid(vec2(u * cells, pos.z / tile));
    vec2 ln = neonLine(hx.x * tile, tile, max(fpz, fpu));
    float lit = hashI(ivec2(floor(hx.yz * 2.0)), 4u);
    c = uSurfCol * uSurf * (0.25 + 0.75 * head) + lc * (ln.x * uLineBright * (1.0 + 2.0 * wv) + ln.y * uLineGlow * (1.0 + wv));
    c += lc * step(0.86, lit) * 0.22 * uLineBright * (0.6 + 0.4 * sin(uTime * 3.0 + lit * 40.0));
  } else {
    float nn = max(uLines, 1.0);
    float sides = uShape == 1 ? 4.0 : uShape == 2 ? 3.0 : 6.0;
    float off = uShape == 0 ? 0.0 : 0.5 - 0.25 * sides;
    float dLong = abs(fract(u * nn + off - 0.5) - 0.5) / nn * perim;
    float dRing = abs(fract(pos.z / uRing - 0.5) - 0.5) * uRing;
    vec2 r1 = neonLine(dRing, uRing, fpz);
    vec2 r2 = uLines > 0.5 ? neonLine(dLong, perim / nn, fpu) : vec2(0.0);
    if (uTStyle == 2) {
      // Solid walls: the rings become thin seams, the long lines become light strips.
      float strip = uLines > 0.5 ? lineCov(dLong, uLineW * 3.5, max(fpu, 1e-5)) : 0.0;
      c = uSurfCol * uSurf * (0.35 + 0.9 * head) * (1.0 - r1.x * 0.6);
      c += lc * (strip * uLineBright * (1.0 + 2.0 * wv) + r2.y * uLineGlow * 0.6);
    } else {
      float core = 1.0 - (1.0 - r1.x) * (1.0 - r2.x);
      float glow = max(r1.y, r2.y);
      c = lc * (core * uLineBright * (1.0 + 2.0 * wv) + glow * uLineGlow * (1.0 + wv));
      if (uTStyle == 0) c += uSurfCol * uSurf * (0.25 + 0.75 * head);
      else a = clamp(core + glow * 0.5, 0.0, 1.0);
    }
  }
  return vec4(c + uWaveCol * wv * 0.25, a);
}
#endif

// ---------------------------------------------------------------- tracing
// Distance along the ray to the world (ground, buildings or tunnel wall), or -1 if it's sky.
#if SCENE == 1
float marchWorld(vec3 ro, vec3 rd) {
  // Steps follow the predicted crossing with the wall (from the last two samples), so rays
  // that skim along the tunnel get there in a few steps.
  float t = 0.02;
  float lastT = t;
  float lastF = 0.0;
  bool has = false;
  for (int i = 0; i < 200; i++) {
    if (float(i) >= uSteps || t > uFar) break;
    float f = tunnelD(ro + rd * t);
    if (f < 0.001 * t + 0.0008) {
      if (has && f < 0.0) {
        float a = lastT, fa = lastF, b = t, fb = f;
        for (int k = 0; k < 5; k++) {
          float tm = a + (b - a) * clamp(fa / max(fa - fb, 1e-6), 0.1, 0.9);
          float fm = tunnelD(ro + rd * tm);
          if (fm > 0.0) { a = tm; fa = fm; } else { b = tm; fb = fm; }
        }
        t = a + (b - a) * fa / max(fa - fb, 1e-6);
      }
      return t;
    }
    float stepLen = 0.8 * f;
    if (has) {
      float sl = (f - lastF) / (t - lastT);
      if (sl < -1e-4) stepLen = max(stepLen, 0.7 * f / -sl);
    }
    stepLen = min(stepLen, 0.3 * t + 1.0);
    lastT = t;
    lastF = f;
    has = true;
    t += max(stepLen, 0.001 * t + 0.001);
  }
  return -1.0;
}
#elif STYLE == 5
float marchWorld(vec3 ro, vec3 rd) {
  // Walk the city block by block and test each block's building exactly.
  float tG = rd.y < -1e-5 ? ro.y / -rd.y : 1e9;
  float tEnd = min(tG, uFar);
  if (ro.y > uHeight && rd.y >= 0.0) return -1.0;
  vec2 cell = floor(ro.xz / uCell);
  vec2 sd = vec2(rd.x >= 0.0 ? 1.0 : -1.0, rd.z >= 0.0 ? 1.0 : -1.0);
  vec2 inv = 1.0 / max(abs(rd.xz), vec2(1e-6));
  vec2 tNext = ((cell + max(sd, 0.0)) * uCell - ro.xz) * sd * inv;
  vec2 tDelta = uCell * inv;
  vec3 m = 1.0 / vec3(abs(rd.x) < 1e-6 ? 1e-6 : rd.x, abs(rd.y) < 1e-6 ? 1e-6 : rd.y, abs(rd.z) < 1e-6 ? 1e-6 : rd.z);
  float t = 0.0;
  for (int i = 0; i < 200; i++) {
    if (t > tEnd || float(i) >= uSteps) break;
    float h = bldH(cell);
    if (h > 0.0) {
      vec3 c = vec3((cell.x + 0.5) * uCell, h * 0.5, (cell.y + 0.5) * uCell);
      vec3 hs = vec3(uCell * 0.36, h * 0.5, uCell * 0.36);
      vec3 n = m * (ro - c);
      vec3 k = abs(m) * hs;
      vec3 t1 = -n - k;
      vec3 t2 = -n + k;
      float tn = max(max(t1.x, t1.y), t1.z);
      float tf = min(min(t2.x, t2.y), t2.z);
      if (tn <= tf && tf > 0.0 && tn < tEnd) return max(tn, 0.0);
    }
    if (tNext.x < tNext.y) {
      t = tNext.x;
      tNext.x += tDelta.x;
      cell.x += sd.x;
    } else {
      t = tNext.y;
      tNext.y += tDelta.y;
      cell.y += sd.y;
    }
  }
  return tG < uFar ? tG : -1.0;
}
#else
float marchWorld(vec3 ro, vec3 rd) {
  float maxH = uHeight * TOP_K + 0.01;
  float t = 0.02;
  // Skip the empty air above the highest mountains.
  if (ro.y > maxH) {
    if (rd.y >= -1e-4) return -1.0;
    t = (ro.y - maxH) / -rd.y;
  }
  float lastT = t;
  float lastF = 0.0;
  bool has = false;
  float steps = gLow ? uSteps * 0.5 : uSteps;
  for (int i = 0; i < 200; i++) {
    if (float(i) >= steps || t > uFar) break;
    vec3 p = ro + rd * t;
    if (p.y > maxH && rd.y >= 0.0) return -1.0;
#if STYLE == 2
    // Full-precision ground close to the camera, where sharp ridges would show tiny steps.
    gPrecise = !gLow && t < 18.0;
#endif
    float f = p.y - terrainH(p.xz, gLow ? 2.0 : mix(3.6, 2.2, smoothstep(0.0, uFar, t)));
    // Only an actual crossing counts as a hit (rays skimming a slope would otherwise stop at
    // slightly random spots and the grid lines would turn into speckles).
    if (f < 0.0) {
      if (has) {
        // Home in on the crossing between the last point above and the first below (the split
        // is kept away from the ends so neither side gets stuck), then interpolate.
        float a = lastT, fa = lastF, b = t, fb = f;
        for (int k = 0; k < 5; k++) {
          float tm = a + (b - a) * clamp(fa / max(fa - fb, 1e-6), 0.1, 0.9);
          vec3 pm = ro + rd * tm;
          float fm = pm.y - terrainH(pm.xz, gLow ? 2.0 : mix(3.6, 2.2, smoothstep(0.0, uFar, tm)));
          if (fm > 0.0) { a = tm; fa = fm; } else { b = tm; fb = fm; }
        }
        t = a + (b - a) * fa / max(fa - fb, 1e-6);
      }
      gPrecise = false;
      return t;
    }
    // Step toward where the ray is predicted to meet the ground, but never leap far while
    // close to it (that would skip thin hilltops and speckle the lines).
    float stepLen = 0.5 * f;
    if (has) {
      float sl = (f - lastF) / (t - lastT);
      if (sl < -1e-4) stepLen = max(stepLen, 0.8 * f / -sl);
    }
#if STYLE == 6
    stepLen = min(stepLen, min(0.2 * t + 0.5, 2.5 * f + 0.01 * t));
#elif STYLE == 2
    // Alien ridges are steep and thin: small steps so a line of sight can't slip through one.
    stepLen = min(stepLen, min(0.12 * t + 0.3, 1.2 * f + 0.004 * t));
#elif STYLE == 1
    stepLen = min(stepLen, min(0.25 * t + 0.8, 4.0 * f + 0.01 * t));
#else
    stepLen = min(stepLen, min(0.3 * t + 1.0, 8.0 * f + 0.02 * t));
#endif
    lastT = t;
    lastF = f;
    has = true;
    t += max(stepLen, 0.002 * t + 0.002);
  }
  gPrecise = false;
  return -1.0;
}
#endif

// ---------------------------------------------------------------- water
#if WATER == 1
float waterY(float z) {
#if SCENE == 1
  return path(z).y + uWaterY;
#else
  return uWaterY;
#endif
}
float rippleH(vec2 xz) {
  vec2 q = xz * 0.6 / uRippleSize;
  float a = vnoise(q + vec2(uRippleT * 0.6, uRippleT * 0.25));
  float b = vnoise(q * 2.3 + vec2(-uRippleT * 0.9, uRippleT * 0.7) + 31.0);
  float c = vnoise(q * 5.1 + vec2(uRippleT * 1.3, -uRippleT * 1.1) + 77.0);
  return a * 0.6 + b * 0.3 + c * 0.1;
}
// Water surface normal with moving ripples (calmer where pixels are bigger than the ripples).
vec3 waterNormal(vec3 p, float fp) {
  float e = 0.06 * uRippleSize;
  float h0 = rippleH(p.xz);
  vec2 g = vec2(rippleH(p.xz + vec2(e, 0.0)) - h0, rippleH(p.xz + vec2(0.0, e)) - h0) / e;
  float amp = uRipple * 0.35 * (1.0 - smoothstep(0.2, 1.0, fp / (0.3 * uRippleSize)));
  return normalize(vec3(-g.x * amp, 1.0, -g.y * amp));
}
// Distance along the ray to the water surface, or -1.
float hitWater(vec3 ro, vec3 rd) {
  if (rd.y >= -1e-5 || ro.y <= waterY(ro.z)) return -1.0;
  float t = (ro.y - waterY(ro.z)) / -rd.y;
#if SCENE == 1
  // The surface follows the tunnel's path: refine the flat guess.
  for (int k = 0; k < 3; k++) {
    vec3 p = ro + rd * t;
    t = max(t + (p.y - waterY(p.z)) / -rd.y, 0.0);
  }
#endif
  return t;
}
// The layers below this one, seen in a direction (mirrored in the water when the sky or the
// far end of the tunnel is transparent).
vec3 belowLayers(vec3 d) {
  vec3 cam = vec3(dot(d, uCamR), dot(d, uCamU), dot(d, uCamF));
  if (cam.z < 0.05) return uAmbCol * 0.3;
  return texture(uScene, SUV(cam.xy * uFocal / cam.z)).rgb;
}
// What the mirrored ray sees: the same world (no shadows), the shapes, structures and the sky.
vec3 traceReflection(vec3 ro, vec3 rd, float t0, float pxa) {
  gNoShadow = true;
  gLow = true;
  float tw = marchWorld(ro, rd);
  float tEnd = tw > 0.0 ? tw : uFar;
  vec3 glow = vec3(0.0);
  float tf = 1e9;
#if FIGS > 0
  FigInfo hf;
  traceFigures(ro, rd, tEnd, pxa, tf, hf, glow);
#endif
  float ts = 1e9;
#if STRUCT == 1
  StInfo hs;
  traceStructures(ro, rd, min(tEnd, tf), pxa, ts, hs, glow);
#endif
  vec4 res = vec4(0.0);
  float tt = uFar;
  if (ts < 1e8 && ts <= tf) {
#if STRUCT == 1
    res = vec4(shadeStructure(ro + rd * ts, rd, t0 + ts, pxa, hs), 1.0);
    tt = ts;
#endif
  } else if (tf < 1e8) {
#if FIGS > 0
    res = vec4(shadeFigure(ro + rd * tf, rd, t0 + tf, pxa, hf), 1.0);
    tt = tf;
#endif
  } else if (tw > 0.0) {
    gFw = vec3((t0 + tw) * pxa * 2.0);
    gFu = 0.0;
    res = shadeWorld(ro + rd * tw, rd, t0 + tw, pxa);
    tt = tw;
  } else {
#if SCENE == 0
    res = sky(rd);
#else
    res = fogTarget(rd);
#endif
  }
  vec4 fogTo = fogTarget(rd);
  vec3 behind = belowLayers(rd);
  res.rgb += behind * (1.0 - res.a);
  float fa = fogAmt(t0 + tt);
  vec3 fogCol = fogTo.rgb + behind * (1.0 - fogTo.a);
  vec3 c = mix(res.rgb, fogCol, fa) + glow;
  gNoShadow = false;
  gLow = false;
  return c;
}
vec4 shadeWater(vec3 ro, vec3 rd, float tWater, float tw, float pxa, vec3 fwW) {
  vec3 pos = ro + rd * tWater;
  vec3 n = waterNormal(pos, max(fwW.x, fwW.z));
  float cosI = clamp(dot(n, -rd), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosI, 5.0);
  float refl = mix(fres, 1.0, uMirror);
  // Below the surface: the ground (or tunnel wall), fading into the water color with depth.
  vec3 under = uWaterCol;
  if (tw > 0.0) {
    gLow = true;
    gNoShadow = true;
    vec4 g = shadeWorld(ro + rd * tw, rd, tw, pxa);
    gLow = false;
    gNoShadow = false;
    float k = exp(-(tw - tWater) / max(uClarity, 0.01));
    under = mix(uWaterCol, g.rgb, k * g.a);
  }
  vec3 rr = reflect(rd, n);
  rr.y = abs(rr.y);
  vec3 c = mix(under, traceReflection(pos + vec3(0.0, 0.01, 0.0), rr, tWater, pxa), refl);
  // Sun glint on the ripples, in the sun's own colors.
#if SCENE == 0
  c += mix(uSun2, uSun1, 0.5) * pow(max(dot(rr, uSunDir), 0.0), 250.0) * 1.2 * float(uSun == 1);
#endif
  return vec4(c, 1.0);
}
#endif

void main() {
  vec2 p = P();
  vec3 rd = normalize(uCamR * p.x + uCamU * p.y + uCamF * uFocal);
  vec3 ro = uCamPos;
  float pxa = PX() / uFocal;
  gNoShadow = false;
  gPrecise = false;
  gLow = false;
  float tw = marchWorld(ro, rd);
  float tWater = -1.0;
#if WATER == 1
  tWater = hitWater(ro, rd);
  if (tWater > uFar || (tw > 0.0 && tWater > tw)) tWater = -1.0;
#endif
  float tFront = tWater > 0.0 ? tWater : (tw > 0.0 ? tw : uFar);
  // Screen-space change of the hit positions (computed for every pixel, before any branching).
  vec3 wp = ro + rd * (tw > 0.0 ? tw : uFar);
  gFw = fwidth(wp);
  vec3 fwW = fwidth(ro + rd * tFront);
#if SCENE == 1
  vec2 tq = tunnelQ(wp);
  float tu = atan(tq.y, tq.x) / TAU + 0.5;
  gFu = min(fwidth(tu), fwidth(fract(tu + 0.5)));
#else
  gFu = 0.0;
#endif
  vec3 glow = vec3(0.0);
  float tf = 1e9;
#if FIGS > 0
  FigInfo hf;
  traceFigures(ro, rd, tFront, pxa, tf, hf, glow);
#endif
  float ts = 1e9;
#if STRUCT == 1
  StInfo hs;
  traceStructures(ro, rd, min(tFront, tf), pxa, ts, hs, glow);
#endif
  vec4 res = vec4(0.0);
  float depth = 1.0;
  if (ts < 1e8 && ts <= tf) {
#if STRUCT == 1
    float fa = fogAmt(ts);
    res = vec4(shadeStructure(ro + rd * ts, rd, ts, pxa, hs), 1.0) * (1.0 - fa) + fogTarget(rd) * fa;
    depth = ts / (uFar * 1.5);
#endif
  } else if (tf < 1e8) {
#if FIGS > 0
    float fa = fogAmt(tf);
    res = vec4(shadeFigure(ro + rd * tf, rd, tf, pxa, hf), 1.0) * (1.0 - fa) + fogTarget(rd) * fa;
    depth = tf / (uFar * 1.5);
#endif
  } else if (tWater > 0.0) {
#if WATER == 1
    float fa = fogAmt(tWater);
    res = shadeWater(ro, rd, tWater, tw, pxa, fwW) * (1.0 - fa) + fogTarget(rd) * fa;
    depth = tWater / (uFar * 1.5);
#endif
  } else if (tw > 0.0) {
    float fa = fogAmt(tw);
    res = shadeWorld(ro + rd * tw, rd, tw, pxa) * (1.0 - fa) + fogTarget(rd) * fa;
    depth = tw / (uFar * 1.5);
  } else {
#if SCENE == 0
    res = sky(rd);
#else
    res = fogTarget(rd);
#endif
  }
  res.rgb += glow;
  outColor = res;
  outData = vec4(depth, 0.0, 0.0, 1.0);
}`;

  // Particles: points in 3D around the flight path, projected with the same camera. They read
  // the distance of the scene so they hide behind hills and shapes.
  const VS_P = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform vec2 uView;
uniform vec3 uCamPos;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
uniform float uFocal;
uniform vec4 uPath;
uniform float uCamZ;
uniform float uLen;
uniform float uSpread;
uniform float uBaseY;
uniform float uRadius;
uniform int uKind;
uniform float uSize;
uniform float uStreak;
uniform float uTime;
uniform float uBright;
uniform float uFar;
uniform uint uSeed;
uniform vec3 uVel;
out vec2 vLocal;
out float vAlpha;
out float vDist;
out float vLen;
flat out int vColor;
#define TAU 6.28318530718

uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
float rnd(uint i, uint k) {
  return float(pcg(i * 9u + k + uSeed * 7919u) & 0x00ffffffu) / 16777215.0;
}
vec2 path(float z) {
  return vec2(uPath.x * (sin(z * uPath.y) + 0.6 * sin(z * uPath.y * 0.47 + 1.7)), uPath.z * sin(z * uPath.w + 0.4));
}
const vec2 CORNERS[6] = vec2[6](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0));

void main() {
  uint id = uint(gl_InstanceID);
  float r1 = rnd(id, 1u), r2 = rnd(id, 2u), r3 = rnd(id, 3u), r4 = rnd(id, 4u), r5 = rnd(id, 5u);
  float z0 = uCamZ - 3.0;
  float z = z0 + mod(r3 * uLen - z0, uLen);
  vec2 pc = path(z);
  vec3 pos;
  if (uRadius > 0.0) {
    float a = r1 * TAU;
    pos = vec3(pc + vec2(cos(a), sin(a)) * sqrt(r2) * uRadius * 0.88, z);
  } else {
    pos = vec3(pc.x + (r1 * 2.0 - 1.0) * uSpread, uBaseY + pc.y + (r2 * 2.0 - 1.0) * uSpread * 0.35, z);
  }
  if (uKind == 0) pos += 0.3 * vec3(sin(uTime * 0.3 + r4 * 20.0), sin(uTime * 0.23 + r5 * 20.0), 0.0);
  if (uKind == 3) {
    float span = uRadius > 0.0 ? uRadius * 1.7 : uSpread * 0.7 + 2.0;
    float base = uRadius > 0.0 ? pc.y - uRadius * 0.85 : uBaseY - span * 0.4;
    pos.y = base + mod(r2 * span + uTime * (0.4 + 0.8 * r4), span);
    pos.x += sin(uTime * (0.5 + r5) + r1 * 20.0) * 0.3;
  }
  vec3 v = pos - uCamPos;
  float zc = dot(v, uCamF);
  float alpha = zc > 0.1 ? 1.0 : 0.0;
  zc = max(zc, 0.1);
  vec2 sp = vec2(dot(v, uCamR), dot(v, uCamU)) * uFocal / zc;
  float size = uSize * (uKind == 2 ? 0.45 : 1.0) * mix(0.6, 1.4, r4);
  float trueP = size * uFocal / zc;
  float minP = 0.9 / min(uRes.x, uRes.y);
  float sizeP = max(trueP, minP);
  // Smaller than a pixel: fade instead of shrinking further.
  alpha *= min(1.0, trueP / minP);
  float dist = length(v);
  alpha *= 1.0 - smoothstep(uFar * 0.6, uFar, dist);
  alpha *= smoothstep(0.1, 1.2, zc);
  if (uKind == 2) alpha *= 0.55 + 0.45 * sin(uTime * (2.0 + 4.0 * r5) + r1 * 50.0);
  if (uKind == 3) alpha *= 0.6 + 0.4 * sin(uTime * (3.0 + 5.0 * r5) + r2 * 40.0);
  // Streak: where the point was on screen a moment ago (the camera moved forward since).
  vec3 vp = v + uVel;
  float zp = max(dot(vp, uCamF), 0.1);
  vec2 spPrev = vec2(dot(vp, uCamR), dot(vp, uCamU)) * uFocal / zp;
  vec2 mv = sp - spPrev;
  float len = length(mv) * uStreak;
  vec2 dir = length(mv) > 1e-6 ? normalize(mv) : vec2(0.0, 1.0);
  vec2 side = vec2(-dir.y, dir.x);
  vec2 c = CORNERS[gl_VertexID];
  float s = sizeP * 2.5;
  vec2 q = sp + side * c.x * s + dir * (c.y * (s + len * 0.5) - len * 0.5);
  vLocal = vec2(c.x, c.y * (s + len * 0.5) / s);
  vLen = (len * 0.5) / s;
  vAlpha = alpha * uBright;
  vDist = dist;
  vColor = int(rnd(id, 6u) * 4.0) % 4;
  vec2 scr = vec2(uView.x * q.x - uView.y * q.y, uView.y * q.x + uView.x * q.y);
  vec2 hx = 0.5 * uRes / min(uRes.x, uRes.y);
  gl_Position = vec4(scr / hx, 0.0, 1.0);
}`;

  const FS_P = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vAlpha;
in float vDist;
in float vLen;
flat in int vColor;
out vec4 outColor;
uniform sampler2D uDepth;
uniform vec2 uRes;
uniform float uFarMax;
uniform vec3 uCols[4];
uniform vec3 uColor;
uniform int uColorMode;
uniform float uOpacity;
void main() {
  float sceneD = texture(uDepth, gl_FragCoord.xy / uRes).r * uFarMax;
  if (vDist > sceneD * 1.02 + 0.05) discard;
  float d = length(vec2(vLocal.x, max(abs(vLocal.y) - vLen, 0.0))) / 0.4;
  float a = exp(-d * d * 1.3) * vAlpha / (1.0 + vLen * 0.8);
  vec3 c = uColorMode == 0 ? uCols[vColor] : uColor;
  outColor = vec4(c * a, a) * uOpacity;
}`;

  const FS_COMPOSITE = `
uniform sampler2D uTex;
void main() { outColor = texture(uTex, vUv) * uOpacity; }`;

  const STYLES = { grid: 0, valley: 1, ridges: 2, lowpoly: 3, topo: 4, city: 5, song: 6 };
  const SHAPES = { round: 0, square: 1, triangle: 2, hexagon: 3 };
  const MORPH = [0, 3, 1, 2];
  const T_STYLES = { grid: 0, wire: 1, strips: 2, hex: 3 };
  const FIG_SHAPES = { cube: 0, pyramid: 1, diamond: 2, ring: 3, triangle: 4, hexagon: 5 };
  const PARTS = { dust: 0, sparks: 1, stars: 2, embers: 3 };
  const MATERIALS = { rock: 0, desert: 1, snow: 2, grass: 3, lava: 4, ice: 5, chrome: 6, marble: 7, circuit: 8, holo: 9 };
  const ST_SHAPES = { prism3: 0, prism4: 1, prism6: 2, obelisk: 3, pyramid: 4, crystal: 5 };
  const ST_STYLES = { glass: 0, solid: 1, wire: 2 };
  const STEPS = { low: 48, medium: 72, high: 110 };

  const isTerrain = (L) => L.scene !== 'tunnel';
  const isTunnel = (L) => L.scene === 'tunnel';
  const terr = (...s) => (L) => isTerrain(L) && s.includes(L.terrain);
  const noisy = terr('grid', 'valley', 'ridges', 'lowpoly', 'topo');
  const hasFigs = (L) => L.figures !== 'off';
  const groundOk = (L) => isTerrain(L) && L.terrain !== 'city';
  const isMat = (L) => groundOk(L) && L.surfaceMode === 'material';
  const isImg = (L) => groundOk(L) && L.surfaceMode === 'image';
  const textured = (L) => isMat(L) || isImg(L);
  const hasSt = (L) => groundOk(L) && L.structures;
  const hasWater = (L) => !!L.water;
  const hasParts = (L) => L.particles !== 'off';

  const waveZ = new Float32Array(8);
  const waveA = new Float32Array(8);
  const figCols = new Float32Array(12);
  const stCols = new Float32Array(12);
  const partCols = new Float32Array(12);
  let specData = null;

  // A tiling texture of random values, the raw material for the hills (one per WebGL context).
  const noiseTex = new WeakMap();
  function noiseTexture(R) {
    const gl = R.gl;
    let tex = noiseTex.get(gl);
    if (!tex) {
      const N = 256;
      const data = new Float32Array(N * N);
      const rnd = U.rng(424242);
      for (let i = 0; i < data.length; i++) data[i] = rnd();
      tex = VG.GL.texture(gl, N, N, { internal: gl.R16F, format: gl.RED, type: gl.FLOAT, data, filter: gl.LINEAR, wrapS: gl.REPEAT, wrapT: gl.REPEAT });
      noiseTex.set(gl, tex);
    }
    return tex;
  }

  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  VG.registerLayer({
    type: 'flight',
    label: '3D flight',
    icon: 'flight',
    blurb: 'Fly forever over a 3D landscape or through a tunnel, with neon shapes, particles and light waves on the beat.',
    blend: 'normal',
    defaults: {
      scene: 'terrain',
      terrain: 'grid',
      tunnelShape: 'round',
      tunnelStyle: 'grid',
      res: '1',
      detail: 'medium',
      speed: 6,
      height: 2.2,
      pitch: -8,
      fov: 75,
      winding: 1,
      turns: 1,
      bank: 1,
      sway: 0.3,
      mountains: 3.5,
      size: 1,
      rough: 0.5,
      valley: 0.7,
      road: 3,
      cell: 4,
      density: 0.7,
      contour: 0.35,
      songWidth: 12,
      songLayout: 'mirror',
      songCurve: 1.4,
      radius: 3,
      twist: 0,
      ring: 2,
      lines: 12,
      morphSpeed: 0.08,
      grid: 2,
      lineW: 0.06,
      lineGlow: 0.35,
      lineBright: 1.6,
      lineColor: 'p1',
      lineColor2: 'p2',
      surface: 0.25,
      surfaceColor: 'p5',
      windowColor: 'p3',
      surfaceMode: 'neon',
      material: 'rock',
      texSource: 'texture',
      texScale: 12,
      texMirror: true,
      matScale: 1,
      matBright: 1,
      matGlow: 1,
      tint: '#ffffff',
      tintAmt: 0,
      gridOver: false,
      lightColor: '#fff1dc',
      lightBright: 1.3,
      ambient: 0.9,
      shadows: false,
      structures: false,
      stShape: 'mixed',
      stStyle: 'glass',
      stDensity: 0.45,
      stSpace: 14,
      stSize: 1.5,
      stHeight: 8,
      stTilt: 18,
      stEdge: 0.04,
      stBright: 1.5,
      stGlow: 0.6,
      stPulse: 0.4,
      stColorMode: 'palette',
      stColor: 'p2',
      water: false,
      waterLevel: 1,
      waterFill: 0.3,
      waterColor: '#031a24',
      clarity: 3,
      mirror: 0.25,
      ripple: 0.4,
      rippleSize: 1,
      rippleSpeed: 1,
      rippleReact: 0.6,
      sky: 'gradient',
      skyTop: 'p5',
      skyHorizon: 'p1',
      skyBright: 0.55,
      sun: true,
      sunSize: 0.32,
      sunHeight: 7,
      sunSide: 0,
      sunColor1: 'p3',
      sunColor2: 'p1',
      sunStripes: 8,
      sunGlow: 0.8,
      stars: 0.4,
      far: 70,
      fogTo: 'transparent',
      fogColor: 'p5',
      figures: 'floating',
      figShape: 'mixed',
      figStyle: 'wire',
      figSpace: 14,
      figDensity: 0.7,
      figSize: 1.2,
      figSpread: 6,
      figSpin: 30,
      figThick: 0.04,
      figGlow: 0.8,
      figBright: 1.5,
      figColorMode: 'palette',
      figColor: 'p2',
      particles: 'dust',
      pCount: 600,
      pSize: 0.035,
      pSpread: 12,
      pBright: 1,
      pStreak: 0.5,
      pColorMode: 'palette',
      pColor: 'p4',
      react: B('bass', { release: 0.25 }),
      speedReact: 6,
      glowReact: 1,
      breathe: 0.2,
      figPulse: 0.3,
      beat: B('kick', { release: 0.15, threshold: 0.5 }),
      waves: 1,
      waveSpeed: 40,
      waveColor: 'p4',
      beatFlash: 1,
      fovPunch: 0.08,
    },
    controls: [
      {
        group: 'Scene',
        items: [
          { key: 'scene', type: 'select', label: 'Fly', rerender: true, options: [['terrain', 'Over a landscape'], ['tunnel', 'Through a tunnel']] },
          {
            key: 'terrain',
            type: 'select',
            label: 'Landscape',
            rerender: true,
            show: isTerrain,
            options: [
              ['grid', 'Neon grid hills'],
              ['valley', 'Outrun valley (road between mountains)'],
              ['ridges', 'Alien ridges'],
              ['lowpoly', 'Low-poly'],
              ['topo', 'Topographic (glowing height lines)'],
              ['city', 'Neon city'],
              ['song', 'Your song (fly over the music)'],
            ],
          },
          { key: 'tunnelShape', type: 'select', label: 'Tunnel shape', show: isTunnel, options: [['round', 'Round'], ['square', 'Square'], ['triangle', 'Triangle'], ['hexagon', 'Hexagon'], ['morph', 'Morphing between shapes']] },
          { key: 'morphSpeed', type: 'range', label: 'Shape changes per second', min: 0.01, max: 0.5, step: 0.01, show: (L) => isTunnel(L) && L.tunnelShape === 'morph' },
          { key: 'tunnelStyle', type: 'select', label: 'Walls', show: isTunnel, options: [['grid', 'Neon rings & grid'], ['wire', 'Wireframe (see-through)'], ['strips', 'Solid with light strips'], ['hex', 'Hexagon tiles']] },
          { key: 'res', type: 'select', label: '3D render resolution', options: [['1', 'Full (sharpest)'], ['0.75', '75% (faster)'], ['0.5', '50% (fastest)']], hint: () => 'Lower = faster exports; the glow hides most of the difference' },
          { key: 'detail', type: 'select', label: 'Detail', options: [['low', 'Low (fastest)'], ['medium', 'Medium'], ['high', 'High (far mountains sharper)']] },
        ],
      },
      {
        group: 'Camera',
        items: [
          { key: 'speed', type: 'range', label: 'Flight speed', min: 0, max: 40, step: 0.1, hint: (L) => (isTerrain(L) && L.terrain === 'song' ? 'Here it also sets how stretched out your song is' : '') },
          { key: 'height', type: 'range', label: 'Flying height', min: 0.2, max: 25, step: 0.05, show: isTerrain },
          { key: 'pitch', type: 'range', label: 'Look up / down', min: -45, max: 30, step: 0.5, fmt: 'deg' },
          { key: 'fov', type: 'range', label: 'Field of view (wide angle)', min: 30, max: 120, step: 1, fmt: 'deg' },
          { key: 'winding', type: 'range', label: 'Winding path', min: 0, max: 4, step: 0.01, fmt: 'x' },
          { key: 'turns', type: 'range', label: 'Turns how often', min: 0.2, max: 3, step: 0.01, fmt: 'x' },
          { key: 'bank', type: 'range', label: 'Lean into turns', min: 0, max: 3, step: 0.01, fmt: 'x' },
          { key: 'sway', type: 'range', label: 'Gentle sway', min: 0, max: 2, step: 0.01, fmt: 'x' },
        ],
      },
      {
        group: 'Landscape',
        show: isTerrain,
        items: [
          { key: 'mountains', type: 'range', label: (L) => (L.terrain === 'city' ? 'Building height' : 'Mountain height'), min: 0, max: 25, step: 0.05, show: isTerrain },
          { key: 'size', type: 'range', label: 'Mountain size', min: 0.2, max: 5, step: 0.01, fmt: 'x', show: noisy },
          { key: 'rough', type: 'range', label: 'Roughness', min: 0.2, max: 0.8, step: 0.01, fmt: 'pct', show: noisy },
          { key: 'valley', type: 'range', label: 'Clear path in the middle', min: 0, max: 1, step: 0.01, fmt: 'pct', show: terr('grid', 'ridges', 'lowpoly', 'topo', 'song'), hint: () => 'Keeps the hills out of your way' },
          { key: 'road', type: 'range', label: (L) => (L.terrain === 'city' ? 'Street width' : L.terrain === 'valley' ? 'Road width' : 'Path width'), min: 0, max: 20, step: 0.1, show: isTerrain },
          { key: 'cell', type: 'range', label: (L) => (L.terrain === 'city' ? 'Block size' : 'Triangle size'), min: 1, max: 12, step: 0.1, show: terr('lowpoly', 'city') },
          { key: 'density', type: 'range', label: 'How many buildings', min: 0, max: 1, step: 0.01, fmt: 'pct', show: terr('city') },
          { key: 'windowColor', type: 'color', label: 'Window lights', show: terr('city') },
          { key: 'contour', type: 'range', label: 'Height between lines', min: 0.05, max: 2, step: 0.01, show: terr('topo') },
          { key: 'songWidth', type: 'range', label: 'Width of the music', min: 3, max: 40, step: 0.1, show: terr('song') },
          { key: 'songLayout', type: 'select', label: 'Layout', show: terr('song'), options: [['mirror', 'Bass on both sides, highs in the middle'], ['side', 'Bass left, highs right']] },
          { key: 'songCurve', type: 'range', label: 'Peak contrast', min: 0.5, max: 3, step: 0.01, fmt: 'x', show: terr('song') },
        ],
      },
      {
        group: 'Tunnel',
        show: isTunnel,
        items: [
          { key: 'radius', type: 'range', label: 'Tunnel size', min: 0.8, max: 15, step: 0.05, show: isTunnel },
          { key: 'twist', type: 'range', label: 'Twist', min: -20, max: 20, step: 0.1, fmt: 'deg', show: isTunnel, hint: () => 'Degrees per unit of distance' },
          { key: 'ring', type: 'range', label: (L) => (L.tunnelStyle === 'hex' ? 'Tile size' : 'Ring spacing'), min: 0.3, max: 10, step: 0.05, show: isTunnel },
          { key: 'lines', type: 'range', label: 'Lines along the tunnel', min: 0, max: 48, step: 1, fmt: 'int', show: (L) => isTunnel(L) && L.tunnelStyle !== 'hex' },
        ],
      },
      {
        group: 'Lines & surface',
        items: [
          { key: 'grid', type: 'range', label: 'Grid size', min: 0.3, max: 10, step: 0.05, show: terr('grid', 'valley', 'ridges', 'song') },
          { key: 'lineW', type: 'range', label: 'Line thickness', min: 0.005, max: 0.5, step: 0.005 },
          { key: 'lineBright', type: 'range', label: 'Line brightness', min: 0, max: 5, step: 0.01, fmt: 'pct' },
          { key: 'lineGlow', type: 'range', label: 'Line glow', min: 0, max: 3, step: 0.01, fmt: 'pct' },
          { key: 'lineColor', type: 'color', label: 'Line color (near)' },
          { key: 'lineColor2', type: 'color', label: 'Line color (far)' },
          { key: 'surface', type: 'range', label: 'Surface brightness', min: 0, max: 2, step: 0.01, fmt: 'pct' },
          { key: 'surfaceColor', type: 'color', label: 'Surface color' },
        ],
      },
      {
        group: 'Ground surface',
        show: groundOk,
        items: [
          { key: 'surfaceMode', type: 'select', label: 'Ground look', rerender: true, show: groundOk, options: [['neon', 'Neon grid on dark ground'], ['material', 'Built-in material'], ['image', 'Your image (3D texture slot)']] },
          {
            key: 'material',
            type: 'select',
            label: 'Material',
            rerender: true,
            show: isMat,
            options: [
              ['rock', 'Rocky mountains'],
              ['desert', 'Desert sand'],
              ['snow', 'Snowy peaks'],
              ['grass', 'Grassy hills'],
              ['lava', 'Lava (glowing cracks)'],
              ['ice', 'Ice'],
              ['chrome', 'Chrome'],
              ['marble', 'Marble'],
              ['circuit', 'Circuit board'],
              ['holo', 'Holographic'],
            ],
          },
          { key: 'texSource', type: 'slot', label: 'Image', show: isImg },
          { key: 'texScale', type: 'range', label: 'Image size on the ground', min: 1, max: 80, step: 0.5, show: isImg },
          { key: 'texMirror', type: 'toggle', label: 'Mirror the repeats (hides seams)', show: isImg },
          { key: 'matScale', type: 'range', label: 'Detail size', min: 0.2, max: 5, step: 0.01, fmt: 'x', show: isMat },
          { key: 'matGlow', type: 'range', label: 'Glow', min: 0, max: 4, step: 0.01, fmt: 'pct', show: (L) => isMat(L) && (L.material === 'lava' || L.material === 'circuit') },
          { key: 'matBright', type: 'range', label: 'Brightness', min: 0, max: 3, step: 0.01, fmt: 'pct', show: textured },
          { key: 'tint', type: 'color', label: 'Tint color', show: textured },
          { key: 'tintAmt', type: 'range', label: 'Tint', min: 0, max: 1, step: 0.01, fmt: 'pct', show: textured },
          { key: 'gridOver', type: 'toggle', label: 'Neon grid on top', show: textured },
        ],
      },
      {
        group: 'Neon structures',
        show: groundOk,
        items: [
          { key: 'structures', type: 'toggle', label: 'Structures rising from the ground', rerender: true, show: groundOk },
          { key: 'stShape', type: 'select', label: 'Shapes', show: hasSt, options: [['mixed', 'Mixed'], ['prism3', 'Triangle prisms'], ['prism4', 'Square prisms'], ['prism6', 'Hexagon prisms'], ['obelisk', 'Obelisks'], ['pyramid', 'Pyramids'], ['crystal', 'Crystals']] },
          { key: 'stStyle', type: 'select', label: 'Look', show: hasSt, options: [['glass', 'Glass with glowing edges'], ['solid', 'Solid with glowing edges'], ['wire', 'Glowing edges only']] },
          { key: 'stDensity', type: 'range', label: 'How many', min: 0, max: 1, step: 0.01, fmt: 'pct', show: hasSt },
          { key: 'stSpace', type: 'range', label: 'Spacing', min: 4, max: 60, step: 0.5, show: hasSt },
          { key: 'stSize', type: 'range', label: 'Width', min: 0.2, max: 8, step: 0.05, show: hasSt },
          { key: 'stHeight', type: 'range', label: 'Height', min: 0.5, max: 40, step: 0.1, show: hasSt },
          { key: 'stTilt', type: 'range', label: 'Random tilt', min: 0, max: 60, step: 1, fmt: 'deg', show: hasSt },
          { key: 'stEdge', type: 'range', label: 'Edge thickness', min: 0.005, max: 0.4, step: 0.005, show: hasSt },
          { key: 'stBright', type: 'range', label: 'Brightness', min: 0, max: 5, step: 0.01, fmt: 'pct', show: hasSt },
          { key: 'stGlow', type: 'range', label: 'Glow', min: 0, max: 3, step: 0.01, fmt: 'pct', show: hasSt },
          { key: 'stPulse', type: 'range', label: 'Pulse with the music', min: 0, max: 2, step: 0.01, fmt: 'pct', show: hasSt },
          { key: 'stColorMode', type: 'select', label: 'Colors', rerender: true, show: hasSt, options: [['palette', 'Palette (mixed)'], ['single', 'One color']] },
          { key: 'stColor', type: 'color', label: 'Color', show: (L) => hasSt(L) && L.stColorMode === 'single' },
        ],
      },
      {
        group: 'Water',
        items: [
          { key: 'water', type: 'toggle', label: (L) => (isTunnel(L) ? 'Flooded tunnel' : 'Water'), rerender: true },
          { key: 'waterLevel', type: 'range', label: 'Water level', min: 0, max: 20, step: 0.05, show: (L) => hasWater(L) && isTerrain(L) },
          { key: 'waterFill', type: 'range', label: 'How full', min: 0.05, max: 0.45, step: 0.01, fmt: 'pct', show: (L) => hasWater(L) && isTunnel(L) },
          { key: 'waterColor', type: 'color', label: 'Water color', show: hasWater },
          { key: 'clarity', type: 'range', label: 'Clarity (see the ground below)', min: 0, max: 20, step: 0.1, show: hasWater },
          { key: 'mirror', type: 'range', label: 'Extra mirror', min: 0, max: 1, step: 0.01, fmt: 'pct', show: hasWater, hint: () => '0 = like real water (more mirror toward the distance), 100% = a perfect mirror' },
          { key: 'ripple', type: 'range', label: 'Ripples', min: 0, max: 1.5, step: 0.01, fmt: 'pct', show: hasWater },
          { key: 'rippleSize', type: 'range', label: 'Ripple size', min: 0.2, max: 5, step: 0.01, fmt: 'x', show: hasWater },
          { key: 'rippleSpeed', type: 'range', label: 'Ripple speed', min: 0, max: 4, step: 0.01, fmt: 'x', show: hasWater },
          { key: 'rippleReact', type: 'range', label: 'Ripples grow with the music', min: 0, max: 3, step: 0.01, fmt: 'pct', show: hasWater },
        ],
      },
      {
        group: 'Sky, light & distance',
        items: [
          { key: 'sky', type: 'select', label: 'Sky', show: isTerrain, rerender: true, options: [['gradient', 'Color gradient'], ['transparent', 'Transparent (the layers below are the sky)']] },
          { key: 'skyTop', type: 'color', label: 'Sky top', show: (L) => isTerrain(L) && L.sky === 'gradient' },
          { key: 'skyHorizon', type: 'color', label: 'Sky at the horizon', show: (L) => isTerrain(L) && L.sky === 'gradient' },
          { key: 'skyBright', type: 'range', label: 'Sky brightness', min: 0, max: 2, step: 0.01, fmt: 'pct', show: (L) => isTerrain(L) && L.sky === 'gradient' },
          { key: 'stars', type: 'range', label: 'Stars', min: 0, max: 1, step: 0.01, fmt: 'pct', show: isTerrain },
          { key: 'sun', type: 'toggle', label: 'Retro sun', show: isTerrain, rerender: true },
          { key: 'sunSize', type: 'range', label: 'Sun size', min: 0.05, max: 1, step: 0.01, show: (L) => isTerrain(L) && L.sun },
          { key: 'sunHeight', type: 'range', label: 'Sun height (also the light)', min: -10, max: 45, step: 0.5, fmt: 'deg', show: isTerrain },
          { key: 'sunSide', type: 'range', label: 'Sun left / right (also the light)', min: -60, max: 60, step: 0.5, fmt: 'deg', show: isTerrain },
          { key: 'sunColor1', type: 'color', label: 'Sun top color', show: (L) => isTerrain(L) && L.sun },
          { key: 'sunColor2', type: 'color', label: 'Sun bottom color', show: (L) => isTerrain(L) && L.sun },
          { key: 'sunStripes', type: 'range', label: 'Sun stripes', min: 0, max: 20, step: 1, fmt: 'int', show: (L) => isTerrain(L) && L.sun },
          { key: 'sunGlow', type: 'range', label: 'Sun glow', min: 0, max: 3, step: 0.01, fmt: 'pct', show: (L) => isTerrain(L) && L.sun },
          { key: 'lightColor', type: 'color', label: 'Sunlight color', show: isTerrain },
          { key: 'lightBright', type: 'range', label: 'Sunlight', min: 0, max: 4, step: 0.01, fmt: 'pct', show: isTerrain },
          { key: 'ambient', type: 'range', label: 'Light from the sky', min: 0, max: 2, step: 0.01, fmt: 'pct', show: isTerrain },
          { key: 'shadows', type: 'toggle', label: 'Shadows (slower exports)', show: isTerrain },
          { key: 'far', type: 'range', label: 'How far you can see', min: 15, max: 200, step: 1 },
          { key: 'fogTo', type: 'select', label: 'Far end fades to', show: isTunnel, rerender: true, options: [['transparent', 'Transparent (layers below show through)'], ['color', 'A color']] },
          { key: 'fogColor', type: 'color', label: 'Fade color', show: (L) => isTunnel(L) && L.fogTo === 'color' },
        ],
      },
      {
        group: 'Neon shapes',
        items: [
          { key: 'figures', type: 'select', label: 'Shapes', rerender: true, options: [['off', 'None'], ['floating', 'Floating along the way'], ['gates', 'Gates you fly through']] },
          { key: 'figShape', type: 'select', label: 'Shape', show: hasFigs, options: [['mixed', 'Mixed'], ['cube', 'Cubes / squares'], ['pyramid', 'Pyramids / triangles'], ['diamond', 'Diamonds'], ['ring', 'Rings'], ['triangle', 'Triangles'], ['hexagon', 'Hexagons']] },
          { key: 'figStyle', type: 'select', label: 'Look', show: (L) => L.figures === 'floating', options: [['wire', 'Glowing wireframe'], ['glass', 'Glass with bright edges']] },
          { key: 'figSpace', type: 'range', label: 'Distance between shapes', min: 3, max: 60, step: 0.5, show: hasFigs },
          { key: 'figDensity', type: 'range', label: 'How many', min: 0, max: 1, step: 0.01, fmt: 'pct', show: hasFigs },
          { key: 'figSize', type: 'range', label: 'Size', min: 0.2, max: 10, step: 0.05, show: hasFigs },
          { key: 'figSpread', type: 'range', label: 'Spread around the path', min: 0, max: 30, step: 0.1, show: (L) => L.figures === 'floating' },
          { key: 'figSpin', type: 'range', label: 'Spin', min: -180, max: 180, step: 1, fmt: 'degs', show: hasFigs },
          { key: 'figThick', type: 'range', label: 'Line thickness', min: 0.005, max: 0.4, step: 0.005, show: hasFigs },
          { key: 'figBright', type: 'range', label: 'Brightness', min: 0, max: 5, step: 0.01, fmt: 'pct', show: hasFigs },
          { key: 'figGlow', type: 'range', label: 'Glow', min: 0, max: 3, step: 0.01, fmt: 'pct', show: hasFigs },
          { key: 'figColorMode', type: 'select', label: 'Colors', show: hasFigs, rerender: true, options: [['palette', 'Palette (mixed)'], ['single', 'One color']] },
          { key: 'figColor', type: 'color', label: 'Color', show: (L) => hasFigs(L) && L.figColorMode === 'single' },
        ],
      },
      {
        group: 'Particles',
        items: [
          { key: 'particles', type: 'select', label: 'Particles', rerender: true, options: [['off', 'None'], ['dust', 'Floating dust'], ['sparks', 'Sparks (motion streaks)'], ['stars', 'Twinkling stars'], ['embers', 'Rising embers']] },
          { key: 'pCount', type: 'range', label: 'How many', min: 10, max: 5000, step: 10, fmt: 'int', show: hasParts },
          { key: 'pSize', type: 'range', label: 'Size', min: 0.005, max: 0.3, step: 0.001, show: hasParts },
          { key: 'pSpread', type: 'range', label: 'Spread around the path', min: 1, max: 60, step: 0.5, show: (L) => hasParts(L) && isTerrain(L) },
          { key: 'pBright', type: 'range', label: 'Brightness', min: 0, max: 4, step: 0.01, fmt: 'pct', show: hasParts },
          { key: 'pStreak', type: 'range', label: 'Motion streaks', min: 0, max: 3, step: 0.01, fmt: 'x', show: hasParts },
          { key: 'pColorMode', type: 'select', label: 'Colors', show: hasParts, rerender: true, options: [['palette', 'Palette'], ['single', 'One color']] },
          { key: 'pColor', type: 'color', label: 'Color', show: (L) => hasParts(L) && L.pColorMode === 'single' },
        ],
      },
      {
        group: 'Audio reaction',
        items: [
          { key: 'react', type: 'binding', label: 'Listens to' },
          { key: 'speedReact', type: 'range', label: 'Flies faster when loud', min: 0, max: 40, step: 0.1, hint: (L) => (isTerrain(L) && L.terrain === 'song' ? 'Off for "Your song": the ground under you is always the music playing now' : '') },
          { key: 'glowReact', type: 'range', label: 'Lines glow with the music', min: 0, max: 4, step: 0.01, fmt: 'pct' },
          { key: 'breathe', type: 'range', label: (L) => (isTunnel(L) ? 'Tunnel breathes' : 'Ground breathes'), min: 0, max: 1, step: 0.01, fmt: 'pct' },
          { key: 'figPulse', type: 'range', label: 'Shapes pulse', min: 0, max: 2, step: 0.01, fmt: 'pct', show: hasFigs },
          { key: 'beat', type: 'binding', label: 'Beats come from' },
          { key: 'waves', type: 'range', label: 'Light wave on each beat', min: 0, max: 4, step: 0.01, fmt: 'pct' },
          { key: 'waveSpeed', type: 'range', label: 'Wave speed', min: 5, max: 150, step: 1 },
          { key: 'waveColor', type: 'color', label: 'Wave color' },
          { key: 'beatFlash', type: 'range', label: 'Shapes flash on beats', min: 0, max: 4, step: 0.01, fmt: 'pct', show: hasFigs },
          { key: 'fovPunch', type: 'range', label: 'Wide-angle punch on beats', min: 0, max: 0.5, step: 0.005, fmt: 'pct' },
        ],
      },
    ],
    render(R, L, F) {
      const A = R.A;
      const t = F.t;
      const tunnel = isTunnel(L);
      const style = tunnel ? 0 : STYLES[L.terrain] != null ? STYLES[L.terrain] : 0;
      const song = !tunnel && style === 6;
      const env = R.val(L.react);
      const beatEnv = R.val(L.beat);
      const speed = Math.max(0, L.speed);
      // Distance flown at any time (also used to place the beat waves).
      const zAt = (tt) => (song ? tt * Math.max(0.5, speed) : speed * tt + L.speedReact * A.integral(L.react, tt));
      const camZ = zAt(t);
      const pathV = [L.winding * 5, 0.035 * L.turns, tunnel ? L.winding * 1.6 : 0, 0.027 * L.turns];
      const path = (z) => [pathV[0] * (Math.sin(z * pathV[1]) + 0.6 * Math.sin(z * pathV[1] * 0.47 + 1.7)), pathV[2] * Math.sin(z * pathV[3] + 0.4)];

      // Camera: follows the path, looks a little ahead, leans into turns, sways gently.
      const sw = R.wander(L, 3, t * 0.25);
      const swayR = tunnel ? 0.25 * L.radius : 0.8;
      // Never fly underwater.
      const baseY = tunnel ? 0 : L.water ? Math.max(L.height, L.waterLevel + 0.6) : L.height;
      const p0 = path(camZ);
      const ahead = 6;
      const p1 = path(camZ + ahead);
      const pos = [p0[0] + sw[0] * L.sway * swayR, baseY + p0[1] + sw[1] * L.sway * swayR * 0.5, camZ];
      let fwd = norm([p1[0] - p0[0], p1[1] - p0[1], ahead]);
      fwd = norm([fwd[0], fwd[1] + Math.tan(L.pitch * U.DEG), fwd[2]]);
      const curv = (path(camZ + 4)[0] - 2 * p0[0] + path(camZ - 4)[0]) / 16;
      const roll = U.clamp(-curv * 12 * L.bank, -0.7, 0.7) + sw[0] * 0.04 * L.sway;
      let right = norm(cross([0, 1, 0], fwd));
      let up = cross(fwd, right);
      const cr = Math.cos(roll);
      const sr = Math.sin(roll);
      [right, up] = [
        [right[0] * cr + up[0] * sr, right[1] * cr + up[1] * sr, right[2] * cr + up[2] * sr],
        [up[0] * cr - right[0] * sr, up[1] * cr - right[1] * sr, up[2] * cr - right[2] * sr],
      ];
      const fov = U.clamp(L.fov * (1 + L.fovPunch * beatEnv), 20, 150) * U.DEG;
      const focal = 0.5 / Math.tan(fov / 2);
      const far = Math.max(10, L.far);

      // Light waves racing ahead from each recent beat.
      waveZ.fill(0);
      waveA.fill(0);
      const ev = (L.waves > 0 && A.events(L.beat)) || [];
      const life = far / Math.max(5, L.waveSpeed);
      let lo = 0;
      let hi = ev.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ev[mid] <= t) lo = mid + 1;
        else hi = mid;
      }
      for (let k = lo - 1, n = 0; k >= 0 && n < 8; k--) {
        const age = t - ev[k];
        if (age > life) break;
        waveZ[n] = zAt(ev[k]) + 1 + age * L.waveSpeed;
        waveA[n] = L.waves * Math.exp((-2 * age) / life);
        n++;
      }

      // Tunnel shape (cycling through shapes when morphing).
      let shape = SHAPES[L.tunnelShape] != null ? SHAPES[L.tunnelShape] : 0;
      let shape2 = shape;
      let morph = 0;
      if (tunnel && L.tunnelShape === 'morph') {
        const ph = t * L.morphSpeed;
        const k = Math.floor(ph);
        shape = MORPH[((k % 4) + 4) % 4];
        shape2 = MORPH[(((k + 1) % 4) + 4) % 4];
        morph = U.smoothstep(0.55, 1, ph - k);
      }

      // "Your song": the spectrum around now, as a texture (rows = time, columns = frequency).
      let specTex = R.black;
      let songMap = [0, 0, 0, 1];
      if (song) {
        // Smoothed so the mountains flow: frequencies merged into wider bands, a light blur
        // across them, and a short attack / longer release over time (like a meter), which
        // turns sudden hits into slopes instead of cliffs.
        const rows = 512;
        const back = 1.5;
        const span = far / Math.max(0.5, speed) + back + 1;
        const dtRow = span / (rows - 1);
        const up = 1 - Math.exp(-dtRow / 0.06);
        const down = 1 - Math.exp(-dtRow / 0.25);
        if (!specData || specData.length !== rows * SONG_COLS) specData = new Float32Array(rows * SONG_COLS);
        const row = new Float32Array(NB);
        const merged = new Float32Array(SONG_COLS);
        const per = NB / SONG_COLS;
        for (let r = 0; r < rows; r++) {
          A.spectrumAt(t - back + (r * span) / (rows - 1), row, 0);
          for (let c = 0; c < SONG_COLS; c++) {
            let sum = 0;
            for (let k = 0; k < per; k++) sum += row[c * per + k];
            merged[c] = sum / per;
          }
          const o = r * SONG_COLS;
          for (let c = 0; c < SONG_COLS; c++) {
            const v = 0.25 * merged[Math.max(0, c - 1)] + 0.5 * merged[c] + 0.25 * merged[Math.min(SONG_COLS - 1, c + 1)];
            const prev = r > 0 ? specData[o - SONG_COLS + c] : v;
            specData[o + c] = prev + (v - prev) * (v > prev ? up : down);
          }
        }
        specTex = R.dataTexture('flight-song:' + L.id, SONG_COLS, rows, specData);
        songMap = [1 / Math.max(0.5, speed), t - back, 1 / span, Math.max(1, L.songWidth)];
      }

      const figs = L.figures === 'gates' ? 2 : L.figures === 'floating' ? 1 : 0;
      const mat = tunnel || style === 5 ? 0 : L.surfaceMode === 'material' ? 1 : L.surfaceMode === 'image' ? 2 : 0;
      const st = !tunnel && style !== 5 && L.structures ? 1 : 0;
      const wat = L.water ? 1 : 0;
      const shadows = !tunnel && L.shadows ? 1 : 0;
      for (let i = 0; i < 4; i++) {
        figCols.set(L.figColorMode === 'single' ? R.col(L.figColor) : R.palCycle(i), i * 3);
        stCols.set(L.stColorMode === 'single' ? R.col(L.stColor) : R.palCycle(i + 1), i * 3);
        partCols.set(L.pColorMode === 'single' ? R.col(L.pColor) : R.palCycle(i), i * 3);
      }
      const figSize = (figs === 1 ? Math.min(L.figSize, L.figSpace * 0.4) : L.figSize) * (1 + L.figPulse * env);
      const sunEl = L.sunHeight * U.DEG;
      const sunAz = L.sunSide * U.DEG;
      const sunDir = [Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), Math.cos(sunAz) * Math.cos(sunEl)];
      // Neon-only scenes keep their soft fill light; materials, structures and shadows use the sun
      // (never lower than 12°, so the ground stays lit).
      const realistic = mat > 0 || st > 0 || shadows > 0;
      const elR = Math.max(L.sunHeight, 12) * U.DEG;
      const light = tunnel
        ? norm([0.3, 0.8, 0.5])
        : realistic
          ? [Math.sin(sunAz) * Math.cos(elR), Math.sin(elR), Math.cos(sunAz) * Math.cos(elR)]
          : L.sun
            ? norm([sunDir[0], Math.max(0.35, sunDir[1] + 0.5), sunDir[2]])
            : norm([0.3, 0.8, 0.5]);
      const sunCol = R.col(L.lightColor).map((v) => v * L.lightBright);
      const top = R.col(L.skyTop);
      const hor = R.col(L.skyHorizon);
      const amb = !tunnel && L.sky === 'gradient' ? [0, 1, 2].map((i) => (top[i] + hor[i]) * 0.5 * (0.5 + L.skyBright) * L.ambient) : [0.32, 0.35, 0.45].map((v) => v * L.ambient);
      const heightNow = Math.max(0, L.mountains) * (1 + L.breathe * env);
      const stSpace = Math.max(2, L.stSpace);
      const stSize = Math.min(L.stSize, stSpace * 0.2);
      const stHeight = Math.max(0.2, L.stHeight);
      // Tilted tops stay inside their ground cell, so a structure is never cut off.
      const stTilt = Math.min(L.stTilt * U.DEG, Math.asin(Math.min(1, (stSpace * 0.22) / (stHeight + stSize))));
      const texImg = mat === 2 ? R.image(R.asset(L.texSource || 'texture')) : null;
      const seed = R.seedOf(L) % 100003;

      // 1. The world, into the layer's own buffer (color + distance).
      const scale = U.clamp(parseFloat(L.res) || 1, 0.25, 1);
      const w = Math.max(2, Math.round(R.w * scale));
      const h = Math.max(2, Math.round(R.h * scale));
      const buf = R.offscreen('flight:' + L.id, w, h);
      const key = `flight-${tunnel ? 1 : 0}-${style}-${figs}-${mat}-${st}-${wat}-${shadows}`;
      const defs = [`SCENE ${tunnel ? 1 : 0}`, `STYLE ${style}`, `FIGS ${figs}`, `MAT ${mat}`, `STRUCT ${st}`, `WATER ${wat}`, `SHADOWS ${shadows}`];
      const prog = R.program(key, defs.map((d) => '#define ' + d + '\n').join('') + FS);
      R.drawTo(buf.both, prog, {
        uCamPos: pos,
        uCamR: right,
        uCamU: up,
        uCamF: fwd,
        uFocal: focal,
        uTime: t,
        uFar: far,
        uSteps: Math.round((STEPS[L.detail] || 90) * (style === 5 ? 1.4 : style === 2 && !tunnel ? 1.8 : 1)),
        uPath: pathV,
        uSeedU: seed,
        uFogClear: tunnel ? (L.fogTo === 'color' ? 0 : 1) : 0,
        uFogCol: R.col(L.fogColor),
        uLightDir: light,
        uSunCol: sunCol,
        uAmbCol: amb,
        uHeight: heightNow,
        uScale: 0.07 / Math.max(0.05, L.size),
        uRough: L.rough,
        uValley: L.valley,
        uRoad: Math.max(0, L.road),
        uCell: Math.max(0.5, L.cell),
        uDensity: L.density,
        uContour: Math.max(0.02, L.contour),
        uGrid: Math.max(0.1, L.grid),
        uLineW: L.lineW,
        uLineGlow: L.lineGlow * (1 + 0.5 * L.glowReact * env),
        uLineBright: L.lineBright * (1 + L.glowReact * env),
        uLineCol: R.col(L.lineColor),
        uLineCol2: R.col(L.lineColor2),
        uSurf: L.surface,
        uSurfCol: R.col(L.surfaceColor),
        uWinCol: R.col(L.windowColor),
        uMat: MATERIALS[L.material] != null ? MATERIALS[L.material] : 0,
        uMatScale: Math.max(0.05, L.matScale),
        uMatBright: L.matBright,
        uMatGlow: L.matGlow * (1 + L.glowReact * env),
        uTint: R.col(L.tint),
        uTintAmt: L.tintAmt,
        uGridOver: L.gridOver ? 1 : 0,
        uTex: texImg ? texImg.tex : R.black,
        uHasTex: texImg ? 1 : 0,
        uTexScale: Math.max(0.5, L.texScale),
        uTexMirror: L.texMirror ? 1 : 0,
        uSky: L.sky === 'gradient' ? 1 : 0,
        uSkyTop: R.col(L.skyTop),
        uSkyHor: R.col(L.skyHorizon),
        uSkyBright: L.skyBright,
        uSun: L.sun ? 1 : 0,
        uSunDir: sunDir,
        uSunSize: Math.max(0.01, L.sunSize),
        uSun1: R.col(L.sunColor1),
        uSun2: R.col(L.sunColor2),
        uSunStripes: L.sunStripes,
        uSunGlow: L.sunGlow,
        uStars: L.stars,
        uWaveZ: waveZ,
        uWaveA: waveA,
        uWaveW: 0.8 + L.waveSpeed * 0.02,
        uWaveCol: R.col(L.waveColor),
        uRadius: Math.max(0.3, L.radius) * (1 + 0.5 * L.breathe * env),
        uShape: shape,
        uShape2: shape2,
        uMorph: morph,
        uTwist: L.twist * U.DEG,
        uTStyle: T_STYLES[L.tunnelStyle] != null ? T_STYLES[L.tunnelStyle] : 0,
        uRing: Math.max(0.1, L.ring),
        uLines: Math.max(0, Math.round(L.lines)),
        uNoise: noiseTexture(R),
        uNoiseOff: [(seed % 251) * 0.37 + 11.3, (seed % 241) * 0.53 + 3.1],
        uSpec: specTex,
        uSong: songMap,
        uSongMirror: L.songLayout === 'side' ? 0 : 1,
        uSongCurve: L.songCurve,
        uFigSpace: Math.max(1, L.figSpace),
        uFigDensity: L.figDensity,
        uFigSize: figSize,
        uFigSpread: L.figSpread,
        uFigY: baseY,
        uFigSpin: L.figSpin * U.DEG * t,
        uFigThick: L.figThick,
        uFigGlow: L.figGlow,
        uFigShape: L.figShape === 'mixed' ? -1 : FIG_SHAPES[L.figShape] != null ? FIG_SHAPES[L.figShape] : -1,
        uFigGlass: L.figStyle === 'glass' ? 1 : 0,
        uFigCols: figCols,
        uFigColMode: L.figColorMode === 'single' ? 1 : 0,
        uFigBright: L.figBright * (1 + L.beatFlash * beatEnv),
        uStSpace: stSpace,
        uStDensity: L.stDensity,
        uStHeight: stHeight,
        uStSize: stSize,
        uStTilt: stTilt,
        uStTop: heightNow * (style === 2 ? 1.42 : 1.02) + (st ? stHeight + stSize : 0) + 0.5,
        uStShape: L.stShape === 'mixed' ? -1 : ST_SHAPES[L.stShape] != null ? ST_SHAPES[L.stShape] : -1,
        uStStyle: ST_STYLES[L.stStyle] != null ? ST_STYLES[L.stStyle] : 0,
        uStEdge: L.stEdge,
        uStGlow: L.stGlow,
        uStBright: L.stBright * (1 + L.stPulse * env),
        uStCols: stCols,
        uStColMode: L.stColorMode === 'single' ? 1 : 0,
        uWaterY: tunnel ? Math.max(0.3, L.radius) * (L.waterFill * 2 - 1) : L.waterLevel,
        uWaterCol: R.col(L.waterColor),
        uClarity: L.clarity,
        uMirror: L.mirror,
        uRipple: L.ripple * (1 + L.rippleReact * env),
        uRippleSize: Math.max(0.1, L.rippleSize),
        uRippleT: t * L.rippleSpeed,
        uScene: R.scene.tex,
      });

      // 2. Particles, added on top (hidden behind whatever is closer).
      if (hasParts(L) && L.pCount > 0) {
        const nowSpeed = song ? Math.max(0.5, speed) : speed + L.speedReact * env;
        const dt = 0.06;
        R.drawTo(
          buf.color,
          R.program('flight-particles', FS_P, VS_P, true),
          {
            uCamPos: pos,
            uCamR: right,
            uCamU: up,
            uCamF: fwd,
            uFocal: focal,
            uPath: pathV,
            uCamZ: camZ,
            uLen: far * 0.85,
            uSpread: tunnel ? 0 : L.pSpread,
            uBaseY: baseY,
            uRadius: tunnel ? Math.max(0.3, L.radius) : 0,
            uKind: PARTS[L.particles] != null ? PARTS[L.particles] : 0,
            uSize: L.pSize,
            uStreak: L.pStreak,
            uTime: t,
            uBright: L.pBright * (1 + 0.5 * L.glowReact * env),
            uFar: far,
            uSeed: seed,
            uVel: [fwd[0] * nowSpeed * dt, fwd[1] * nowSpeed * dt, fwd[2] * nowSpeed * dt],
            uDepth: buf.dataTex,
            uFarMax: far * 1.5,
            uCols: partCols,
            uColor: R.col(L.pColor),
            uColorMode: L.pColorMode === 'single' ? 1 : 0,
          },
          'add',
          U.clamp(L.pCount | 0, 0, 5000)
        );
      }

      // 3. Into the picture, like any layer.
      R.draw(R.program('flight-composite', FS_COMPOSITE), { uTex: buf.colorTex }, L.blend, L.opacity);
    },
  });
})(window.VG);
