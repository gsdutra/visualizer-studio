'use strict';
// Iterative radix-2 FFT with precomputed twiddles and bit-reversal table.
(function (VG) {
  class FFT {
    constructor(n) {
      const levels = Math.round(Math.log2(n));
      if (1 << levels !== n) throw new Error('FFT size must be a power of two');
      this.n = n;
      this.cos = new Float64Array(n / 2);
      this.sin = new Float64Array(n / 2);
      for (let i = 0; i < n / 2; i++) {
        this.cos[i] = Math.cos((2 * Math.PI * i) / n);
        this.sin[i] = Math.sin((2 * Math.PI * i) / n);
      }
      this.rev = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        let x = i;
        let r = 0;
        for (let b = 0; b < levels; b++) {
          r = (r << 1) | (x & 1);
          x >>>= 1;
        }
        this.rev[i] = r;
      }
    }

    // In-place forward transform of the complex signal (re, im).
    transform(re, im) {
      const n = this.n;
      const rev = this.rev;
      const cos = this.cos;
      const sin = this.sin;
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) {
          let t = re[i];
          re[i] = re[j];
          re[j] = t;
          t = im[i];
          im[i] = im[j];
          im[j] = t;
        }
      }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >>> 1;
        const step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = i, k = 0; j < i + half; j++, k += step) {
            const l = j + half;
            const tre = re[l] * cos[k] + im[l] * sin[k];
            const tim = im[l] * cos[k] - re[l] * sin[k];
            re[l] = re[j] - tre;
            im[l] = im[j] - tim;
            re[j] += tre;
            im[j] += tim;
          }
        }
      }
    }
  }

  VG.FFT = FFT;
})(window.VG);
