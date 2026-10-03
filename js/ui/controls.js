'use strict';
// Builds settings panels from a declarative schema: { group, items: [{ key, type, label, ... }] }.
// Supported types: range, select, toggle, color, text, slot, font, binding.
(function (VG) {
  const U = VG.util;
  const h = U.h;
  const AN = VG.analysis;

  const FMT = {
    pct: (v) => Math.round(v * 100) + '%',
    x: (v) => v.toFixed(2) + '×',
    s: (v) => (v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s'),
    ms: (v) => Math.round(v) + ' ms',
    deg: (v) => Math.round(v) + '°',
    degs: (v) => Math.round(v) + '°/s',
    degmin: (v) => Math.round(v) + '°/min',
    hz: (v) => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz' : Math.round(v) + ' Hz'),
    int: (v) => String(Math.round(v)),
  };

  function fmtValue(item, v) {
    v = Number(v);
    if (!isFinite(v)) return '—';
    if (FMT[item.fmt]) return FMT[item.fmt](v);
    const decimals = U.clamp(Math.ceil(-Math.log10(item.step || 0.01)), 0, 4);
    return v.toFixed(decimals);
  }

  const DEFAULT_BINDING = AN.binding('bass');

  const labelOf = (item, view) => (typeof item.label === 'function' ? item.label(view) : item.label || item.key);

  // ctx: { get(obj,key), set(obj,key,val,item), view(obj), defaultOf(obj,key), palette(),
  //        addMeter(el, binding), changed(), collapsed: Set }
  function build(container, groups, target, ctx) {
    container.textContent = '';
    const entries = [];
    const refresh = () => {
      for (const e of entries) {
        const view = ctx.view(e.obj);
        e.el.hidden = !!(e.item.show && !e.item.show(view));
        if (e.labelEl && typeof e.item.label === 'function') e.labelEl.textContent = labelOf(e.item, view);
        if (e.hintEl && e.item.hint) {
          const txt = e.item.hint(view) || '';
          e.hintEl.textContent = txt;
          e.hintEl.hidden = !txt;
        }
      }
    };
    const innerCtx = Object.assign({}, ctx, {
      set(obj, key, val, item) {
        ctx.set(obj, key, val, item);
        refresh();
      },
    });
    for (const g of groups) {
      const obj = g.fx ? target[g.fx] : target;
      const id = (g.fx || '') + ':' + g.group;
      const details = h('details', { class: 'group', open: !ctx.collapsed || !ctx.collapsed.has(id) });
      details.addEventListener('toggle', () => {
        if (!ctx.collapsed) return;
        if (details.open) ctx.collapsed.delete(id);
        else ctx.collapsed.add(id);
      });
      details.append(h('summary', null, g.group));
      const body = h('div', { class: 'group-body' });
      for (const item of g.items) {
        const e = control(item, obj, innerCtx);
        if (!e) continue;
        e.item = item;
        e.obj = obj;
        entries.push(e);
        body.append(e.el);
      }
      details.append(body);
      container.append(details);
    }
    refresh();
    return { refresh };
  }

  function control(item, obj, ctx) {
    switch (item.type) {
      case 'range':
        return rangeCtl(item, obj, ctx);
      case 'select':
        return selectCtl(item, obj, ctx);
      case 'toggle':
        return toggleCtl(item, obj, ctx);
      case 'color':
        return colorCtl(item, obj, ctx);
      case 'text':
        return textCtl(item, obj, ctx);
      case 'slot':
        return slotCtl(item, obj, ctx);
      case 'font':
        return fontCtl(item, obj, ctx);
      case 'binding':
        return bindingCtl(item, obj, ctx);
      default:
        return null;
    }
  }

  function head(item, obj, ctx, extra) {
    const labelEl = h('label', { class: 'ctl-label' }, labelOf(item, ctx.view(obj)));
    return { labelEl, el: h('div', { class: 'ctl-head' }, labelEl, extra || null) };
  }

  function hintEl(item, obj, ctx) {
    if (!item.hint) return null;
    const txt = item.hint(ctx.view(obj)) || '';
    const el = h('div', { class: 'hint' }, txt);
    el.hidden = !txt;
    return el;
  }

  function rangeCtl(item, obj, ctx) {
    const log = !!item.log;
    const toSlider = (v) => (log ? (Math.log(Math.max(v, item.min) / item.min) / Math.log(item.max / item.min)) * 1000 : v);
    const fromSlider = (s) => {
      if (!log) return s;
      const v = item.min * Math.pow(item.max / item.min, s / 1000);
      return Math.round(v / item.step) * item.step;
    };
    const input = h('input', { type: 'range' });
    if (log) {
      input.min = 0;
      input.max = 1000;
      input.step = 1;
    } else {
      input.min = item.min;
      input.max = item.max;
      input.step = item.step;
    }
    const cur = () => Number(ctx.get(obj, item.key));
    input.value = toSlider(cur());
    const out = h('button', { class: 'val', type: 'button', title: 'Click to type an exact value' }, fmtValue(item, cur()));
    const sync = () => {
      input.value = toSlider(cur());
      out.textContent = fmtValue(item, cur());
    };
    input.addEventListener('input', () => {
      ctx.set(obj, item.key, fromSlider(Number(input.value)), item);
      out.textContent = fmtValue(item, cur());
    });
    out.addEventListener('click', () => {
      const field = h('input', { type: 'number', class: 'val-edit', step: 'any', value: String(cur()) });
      out.replaceWith(field);
      field.focus();
      field.select();
      let done = false;
      const commit = (ok) => {
        if (done) return;
        done = true;
        const v = Number(field.value);
        if (ok && field.value.trim() !== '' && isFinite(v)) ctx.set(obj, item.key, v, item);
        field.replaceWith(out);
        sync();
      };
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit(true);
        if (e.key === 'Escape') commit(false);
        e.stopPropagation();
      });
      field.addEventListener('blur', () => commit(true));
    });
    const hd = head(item, obj, ctx, out);
    hd.labelEl.title = 'Double-click to reset';
    hd.labelEl.addEventListener('dblclick', () => {
      const d = ctx.defaultOf(obj, item.key);
      if (d === undefined) return;
      ctx.set(obj, item.key, d, item);
      sync();
    });
    const el = h('div', { class: 'ctl ctl-range' }, hd.el, input);
    const hint = hintEl(item, obj, ctx);
    if (hint) el.append(hint);
    return { el, labelEl: hd.labelEl, hintEl: hint };
  }

  function selectCtl(item, obj, ctx) {
    const sel = h('select', null, item.options.map(([v, l]) => h('option', { value: String(v) }, l)));
    sel.value = String(ctx.get(obj, item.key));
    sel.addEventListener('change', () => {
      ctx.set(obj, item.key, item.num ? Number(sel.value) : sel.value, item);
      if (item.rerender && ctx.rerender) ctx.rerender();
    });
    const hd = head(item, obj, ctx);
    const el = h('div', { class: 'ctl ctl-select' }, hd.el, sel);
    const hint = hintEl(item, obj, ctx);
    if (hint) el.append(hint);
    return { el, labelEl: hd.labelEl, hintEl: hint };
  }

  function toggleCtl(item, obj, ctx) {
    const cb = h('input', { type: 'checkbox' });
    cb.checked = !!ctx.get(obj, item.key);
    cb.addEventListener('change', () => ctx.set(obj, item.key, cb.checked, item));
    const labelEl = h('span', { class: 'toggle-label' }, labelOf(item, ctx.view(obj)));
    const el = h('label', { class: 'ctl ctl-toggle' }, cb, h('span', { class: 'switch', 'aria-hidden': 'true' }), labelEl);
    return { el, labelEl };
  }

  const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

  function colorCtl(item, obj, ctx) {
    const pal = ctx.palette();
    const row = h('div', { class: 'color-row' });
    const chips = [];
    for (let i = 0; i < 5; i++) {
      const ref = 'p' + (i + 1);
      const b = h('button', { class: 'chip', type: 'button', title: `Palette color ${i + 1}`, style: { background: pal[i] } });
      b.addEventListener('click', () => {
        ctx.set(obj, item.key, ref, item);
        mark();
      });
      chips.push([ref, b]);
      row.append(b);
    }
    const custom = h('input', { type: 'color', class: 'chip-custom', title: 'Pick any color' });
    const resolved = () => {
      const v = ctx.get(obj, item.key);
      if (isHex(v)) return v.toLowerCase();
      const i = U.clamp((parseInt(String(v).slice(1), 10) || 1) - 1, 0, 4);
      return pal[i] || '#ffffff';
    };
    custom.value = resolved();
    custom.addEventListener('input', () => {
      ctx.set(obj, item.key, custom.value, item);
      mark();
    });
    row.append(h('span', { class: 'or' }, 'or'), custom);
    function mark() {
      const v = ctx.get(obj, item.key);
      for (const [ref, b] of chips) b.classList.toggle('on', v === ref);
      custom.classList.toggle('on', isHex(v));
    }
    mark();
    const hd = head(item, obj, ctx);
    const el = h('div', { class: 'ctl ctl-color' }, hd.el, row);
    const hint = hintEl(item, obj, ctx);
    if (hint) el.append(hint);
    return { el, labelEl: hd.labelEl, hintEl: hint };
  }

  function textCtl(item, obj, ctx) {
    const inp = h('input', { type: 'text', spellcheck: false });
    inp.value = ctx.get(obj, item.key) == null ? '' : String(ctx.get(obj, item.key));
    inp.addEventListener('input', () => ctx.set(obj, item.key, inp.value, item));
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    const hd = head(item, obj, ctx);
    const el = h('div', { class: 'ctl ctl-text' }, hd.el, inp);
    const hint = hintEl(item, obj, ctx);
    if (hint) el.append(hint);
    return { el, labelEl: hd.labelEl, hintEl: hint };
  }

  function slotCtl(item, obj, ctx) {
    const sel = h(
      'select',
      null,
      Object.entries(VG.assets.SLOTS).map(([k, l]) => h('option', { value: k }, l + (VG.assets.images[k] ? '' : ' — empty')))
    );
    sel.value = ctx.get(obj, item.key);
    sel.addEventListener('change', () => ctx.set(obj, item.key, sel.value, item));
    const hd = head(item, obj, ctx);
    const el = h('div', { class: 'ctl ctl-select' }, hd.el, sel, h('div', { class: 'hint' }, 'Add your images in the Media tab. Empty slots fall back to your cover art.'));
    return { el, labelEl: hd.labelEl };
  }

  function fontCtl(item, obj, ctx) {
    const sel = h(
      'select',
      null,
      VG.fonts.all().map((f) => h('option', { value: f.name }, f.name + (f.custom ? ' (your font)' : '')))
    );
    sel.value = ctx.get(obj, item.key);
    sel.addEventListener('change', () => ctx.set(obj, item.key, sel.value, item));
    const hd = head(item, obj, ctx);
    const el = h('div', { class: 'ctl ctl-select' }, hd.el, sel);
    return { el, labelEl: hd.labelEl };
  }

  // Audio binding: which part of the music drives this, plus how it responds.
  function bindingCtl(item, obj, ctx) {
    const b = obj[item.key];
    const sel = h('select', { class: 'src' });
    for (const [g, keys] of AN.SOURCE_GROUPS) {
      const og = h('optgroup', { label: g });
      for (const k of keys) og.append(h('option', { value: k }, AN.SOURCES[k].label));
      sel.append(og);
    }
    sel.value = b.source;
    const meterFill = h('div', { class: 'meter-fill' });
    const meter = h('div', { class: 'meter', title: 'Live reaction level' }, meterFill);
    if (ctx.addMeter) ctx.addMeter(meterFill, b);

    const lo = h('input', { type: 'number', min: 10, max: 20000, step: 1 });
    const hi = h('input', { type: 'number', min: 20, max: 22000, step: 1 });
    lo.value = b.lo;
    hi.value = b.hi;
    const onHz = () => {
      const a = U.clamp(Number(lo.value) || 20, 10, 20000);
      const z = U.clamp(Number(hi.value) || 200, a + 5, 22000);
      b.lo = a;
      b.hi = z;
      ctx.changed();
    };
    lo.addEventListener('change', onHz);
    hi.addEventListener('change', onHz);
    for (const f of [lo, hi]) f.addEventListener('keydown', (e) => e.stopPropagation());
    const hzRow = h('div', { class: 'hz-row' }, lo, h('span', null, 'to'), hi, h('span', null, 'Hz'));

    // Sub-controls edit the binding object directly.
    const bctx = {
      get: (o, k) => o[k],
      set: (o, k, v) => {
        o[k] = v;
        ctx.changed();
      },
      view: (o) => o,
      defaultOf: (o, k) => DEFAULT_BINDING[k],
      palette: ctx.palette,
    };
    const isHits = () => AN.SOURCES[b.source] && AN.SOURCES[b.source].kind === 'hits';
    const subs = [
      rangeCtl({ key: 'gain', label: 'Sensitivity', min: 0, max: 3, step: 0.01, fmt: 'x' }, b, bctx),
      rangeCtl({ key: 'release', label: 'Release (how long it lasts)', min: 0.02, max: 2, step: 0.005, fmt: 's' }, b, bctx),
    ];
    const adv = [
      rangeCtl({ key: 'attack', label: 'Attack (hits: anticipation)', min: 0, max: 0.3, step: 0.005, fmt: 's' }, b, bctx),
      rangeCtl({ key: 'threshold', label: 'Ignore below', min: 0, max: 0.9, step: 0.01, fmt: 'pct' }, b, bctx),
      rangeCtl({ key: 'punch', label: 'Punch (contrast)', min: 0.5, max: 4, step: 0.05, fmt: 'x' }, b, bctx),
    ];
    const advBox = h('details', { class: 'binding-adv' }, h('summary', null, 'Fine-tune'), adv.map((s) => s.el));
    const subBox = h('div', { class: 'binding-sub' }, subs.map((s) => s.el), advBox);

    const update = () => {
      const src = AN.SOURCES[b.source];
      hzRow.hidden = !(src && src.custom);
      subBox.hidden = !src || src.kind === 'none';
      meter.hidden = subBox.hidden;
      subs[1].labelEl.textContent = isHits() ? 'Decay (how long each hit lasts)' : 'Release (smoothness)';
      adv[1].labelEl.textContent = isHits() ? 'Only hits stronger than' : 'Ignore below';
    };
    sel.addEventListener('change', () => {
      b.source = sel.value;
      update();
      ctx.changed();
    });
    update();
    const hd = head(item, obj, ctx, meter);
    const el = h('div', { class: 'ctl ctl-binding' }, hd.el, sel, hzRow, subBox);
    return { el, labelEl: hd.labelEl };
  }

  VG.ui = VG.ui || {};
  VG.ui.controls = { build, fmtValue };
})(window.VG);
