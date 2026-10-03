'use strict';
// Per-video media: images in three slots (cover art, logo, background) and fonts.
// Nothing here is uploaded anywhere — files are read locally by the browser.
(function (VG) {
  const U = VG.util;

  const SLOTS = {
    cover: 'Cover art',
    logo: 'Logo',
    background: 'Background image',
  };

  const assets = {
    SLOTS,
    images: { cover: null, logo: null, background: null },

    async setImage(slot, blob, name) {
      const { img, url, w, h } = await U.loadImage(blob);
      this.clearImage(slot);
      this.images[slot] = { id: U.uid(), slot, name: name || SLOTS[slot], img, url, w, h, cache: new Map() };
      return this.images[slot];
    },

    clearImage(slot) {
      const old = this.images[slot];
      if (old) {
        URL.revokeObjectURL(old.url);
        if (old.img && typeof old.img.close === 'function') old.img.close();
      }
      this.images[slot] = null;
      return old;
    },

    // A canvas version of the image, capped in size; blurred versions are rendered small
    // (blur hides the lost detail) with edges extended so the blur doesn't fade them out.
    prepareImage(asset, blur) {
      let c = asset.cache.get(blur);
      if (c) return c;
      const iw = asset.w;
      const ih = asset.h;
      c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      if (blur <= 0) {
        const s = Math.min(1, 4096 / Math.max(iw, ih));
        c.width = Math.max(1, Math.round(iw * s));
        c.height = Math.max(1, Math.round(ih * s));
        ctx.drawImage(asset.img, 0, 0, c.width, c.height);
      } else {
        const s = Math.min(1, 1024 / Math.max(iw, ih));
        const w = Math.max(1, Math.round(iw * s));
        const h = Math.max(1, Math.round(ih * s));
        c.width = w;
        c.height = h;
        const radius = blur * Math.max(w, h) * 0.06;
        const m = radius * 2.5;
        ctx.filter = `blur(${radius.toFixed(2)}px)`;
        ctx.drawImage(asset.img, -m, -m, w + 2 * m, h + 2 * m);
      }
      asset.cache.set(blur, c);
      if (asset.cache.size > 8) asset.cache.delete(asset.cache.keys().next().value);
      return c;
    },
  };

  // System fonts available on macOS, with fallbacks for other systems.
  const fonts = {
    list: [
      { name: 'Avenir Next', stack: '"Avenir Next", Avenir, "Helvetica Neue", Arial, sans-serif' },
      { name: 'Helvetica Neue', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
      { name: 'Futura', stack: 'Futura, "Century Gothic", "Avenir Next", sans-serif' },
      { name: 'Gill Sans', stack: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' },
      { name: 'DIN Condensed', stack: '"DIN Condensed", "DIN Alternate", "Arial Narrow", sans-serif' },
      { name: 'Arial Black', stack: '"Arial Black", "Arial Bold", Gadget, sans-serif' },
      { name: 'Impact', stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
      { name: 'Copperplate', stack: 'Copperplate, "Copperplate Gothic Light", serif' },
      { name: 'Didot', stack: 'Didot, "Bodoni 72", "Times New Roman", serif' },
      { name: 'Georgia', stack: 'Georgia, serif' },
      { name: 'Menlo (mono)', stack: 'Menlo, Monaco, Consolas, monospace' },
      { name: 'Courier New (mono)', stack: '"Courier New", Courier, monospace' },
      { name: 'Marker Felt', stack: '"Marker Felt", "Comic Sans MS", cursive' },
      { name: 'System UI', stack: 'system-ui, -apple-system, sans-serif' },
    ],
    custom: [],
    version: 0,
    all() {
      return [...this.custom, ...this.list];
    },
    stack(name) {
      const f = this.all().find((x) => x.name === name);
      return f ? f.stack : 'system-ui, sans-serif';
    },
    async addFile(file) {
      const name = file.name.replace(/\.[^.]+$/, '');
      const family = 'UserFont-' + U.hashStr(name + file.size);
      const face = new FontFace(family, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      if (!this.custom.some((f) => f.name === name)) this.custom.unshift({ name, stack: `"${family}", sans-serif`, custom: true });
      this.version++;
      return name;
    },
  };

  VG.assets = assets;
  VG.fonts = fonts;
})(window.VG);
