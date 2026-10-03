# Visualizer Studio

Make audio-reactive music videos for YouTube, right in the browser.
Everything runs on your computer: your track and images are never uploaded anywhere.

## Open it

Double-click `index.html`. It needs **Google Chrome** (or Microsoft Edge). If your Mac opens it in
Safari, right-click `index.html` → **Open With** → **Google Chrome**. Safari can show the preview but
can't create the video file.

No install, no internet connection needed.

## Make a video in 3 steps

1. **Media tab**: drop your `.wav` or `.mp3` (WAV master recommended), check artist and title, and
   add your cover art, logo and/or background image. These are optional; empty slots fall back to
   the cover art.
2. **Pick a look** at the top: your Liquid Aurora looks (Echo Dive, Nested Worlds, Vortex,
   Kaleidoscope), the channel styles (Monstercat, Trap Nation, Dubstep Gutter, NCS), the originals
   (Liquid Neon, Aurora Chill, Synthwave, Minimal Techno), or a blank canvas. Then tweak anything in
   **Layers** and **Effects**. Press **space** to play, and click the timeline to jump around.
3. **Export tab**: choose resolution (1080p / 1440p / 4K), landscape or vertical (Shorts/Reels/TikTok),
   30 or 60 fps, quality, and the whole track or just a section. Then click **Generate video**.

## Liquid Aurora (your project)

Four looks that mix Aurora Chill's flowing light with Liquid Neon's glowing liquid. The glow pulses
on the bass, and each look dives endlessly into the center in its own way. Shape masks sit on top
of all four.

| Look | Endless zoom | Shape masks on top | On beats |
| --- | --- | --- | --- |
| Echo Dive | Echo tunnel: everything pours out of the center in fading echoes | Concentric hexagon outlines | Calm |
| Nested Worlds | The picture holds smaller copies of itself in hexagon windows, forever | Broken-mirror bands | Smooth turns |
| Vortex | A spiral of hexagons pouring out of the center | Scattered mixed shapes | Reshuffle |
| Kaleidoscope | Three-mirror kaleidoscope + echo tunnel | Big random pop-ups: triangles, squares, pentagons, circles, hexagons (filled and outlines) | Calm |

The building blocks are layers you can add to any look (**+ Add layer**):

- **Endless zoom** (effect): *Echo tunnel* or *Nested worlds* (circle/hexagon/triangle/square/diamond
  windows), with zoom speed that follows the music.
- **Vortex** (visual): hexagons, dots, rings, triangles, petals or squares on an endless spiral.
- **Kaleidoscope** (effect): radial slices, a three-mirror triangle kaleidoscope, mirrored quadrants,
  or a left/right mirror.
- **Shape masks** (effect): geometric windows, filled or as outlines, showing mirrored,
  upside-down, rotated, zoomed, displaced, tinted or negative pieces of the video.
  - Compositions: random pop-ups (shapes appear at random spots and sizes, then fade and come back
    elsewhere), constellation, concentric, mosaic grid, orbit or broken-mirror shards.
  - Shapes: triangles, squares, pentagons, circles, hexagons, diamonds and stars, each filled or as an
    outline. Choose which ones go in the mix.
  - On beats they can stay calm, snap-rotate (with adjustable smoothness), reshuffle what each window
    shows, or both.

**Effect layers change everything listed below them** in the layer list. Move them up or down to
choose what they affect. Shape masks are meant to be the top layer.

## How the audio reactions work

Every reactive setting has a **"Listens to"** box:

- **Levels** follow the energy of a frequency band: sub, bass, low-mids, mids, highs, air, the whole
  mix, or any custom Hz range. Good for smooth breathing and swelling.
- **Hits** fire a pulse on transients: kick, snare/clap, hi-hats, or a custom range. Good for punches,
  flashes and shakes.
- **Sensitivity** sets how strong the reaction is. **Release** sets how long it lasts. Under
  **Fine-tune**:
  - **Attack**: for hits, starts the pulse slightly *before* the hit so the peak lands exactly on it.
  - **Ignore below**: skips quiet moments or weak hits.
  - **Punch**: adds contrast.
- The bar next to "Listens to" shows the live reaction level while the song plays.

The whole song is analyzed when you load it, and levels are auto-calibrated to your track's own
dynamics. The preview always matches the exported video exactly.

## Good to know

- **Looks are starting points.** Save your own with **Save look** (a small `.json` file) and reuse it
  on your next release with **Load look**.
- **Vertical layouts are separate.** With Vertical 9:16 selected, position and size changes only
  affect vertical videos, so you can arrange a Short without breaking the YouTube version.
- **Render speed** measured on an M3 MacBook (60 fps): 1080p ≈ 3× faster than real time,
  1440p ≈ 1.9×, 4K ≈ 0.9×. A 4-minute song in 4K60 takes about 4–5 minutes. The Liquid Aurora looks
  stack more effects: at 4K60 about 0.5–0.7× (6–8 minutes for a 4-minute song). Keep the tab open while
  it renders; the screen is kept awake automatically.
- **File size** (Standard quality, 60 fps): about 94 MB per minute at 1080p, 185 MB at 1440p,
  460 MB at 4K. "Light" is roughly half. With "Choose where to save first" on, big videos are written
  straight to disk instead of filling up memory.
- **Audio** is encoded once as 320 kbps AAC, in perfect sync with the picture. Use your WAV master.
- **YouTube tips:** upload in 1440p or 4K even if most people watch in 1080p. YouTube then uses better
  compression, and the 1080p version looks better too. A touch of film grain (Effects tab) hides
  banding in dark gradients after YouTube compresses the video.
- **Your settings are remembered** in the browser (look, layers, effects, export options, artist and
  title). The track, images and custom fonts (.ttf/.otf/.woff2) have to be loaded again each time you
  open the page. Mac system fonts are always available.
- **Long DJ mixes** work, but very long files (over ~30 minutes) can use a lot of memory.
- **Links to audio** (SoundCloud, Google Drive, etc.) aren't supported. Browsers block downloading from
  those sites, so load the file from your computer instead.

## For developers

Plain HTML/CSS/JS with no build step. Scripts are classic (non-module) files sharing a global `VG`
namespace, so the page works from `file://`.

| Path | What it does |
| --- | --- |
| `js/core/analysis.js` | Decoding, FFT spectrum, filter-bank band levels, onset ("hits") detection, envelopes |
| `js/gl/renderer.js` | WebGL2 frame renderer: layers → HDR buffer → trails, bloom, camera, grading, grain |
| `js/layers/*.js` | One file per layer type (shader + settings schema + render function). Effect layers (`zoom`, `kaleido`, `masks`) read the picture drawn so far via `R.effect()` |
| `js/project.js`, `js/presets.js` | Project model, effect settings, palettes, built-in looks |
| `js/ui/controls.js`, `js/ui/app.js` | Settings panels built from the schemas, app wiring, preview loop |
| `js/export.js` | Frame-by-frame export: WebCodecs H.264 + AAC → MP4 (Mediabunny) |
| `lib/mediabunny.min.js` | [Mediabunny](https://mediabunny.dev) 1.61.0, for MP4 muxing and reading tags. Licensed under MPL-2.0; source code at [github.com/Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) |

To add a layer type, create `js/layers/<name>.js` that calls `VG.registerLayer({...})`, then add a
`<script>` tag for it in `index.html`.
