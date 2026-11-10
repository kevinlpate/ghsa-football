/* Stand-in for the Claude dashboard runtime, for the public site.
   Datasets are CSV files in data/<id>.csv, loaded when first read or when a [data-source] element names them.
   dash.draw(name, fn) registers a drawing for every [data-draw="name"] element; drawings run after each data load,
   on resize, when a tab opens (dash.setLink) and when called as dash.draw(name). Elements inside [hidden] are skipped. */
(function () {
  const store = {}, cbs = [], calcs = {}, draws = {};
  let ver = '', queued = false;
  function visible(el) { return !el.closest('[hidden]'); }
  function runDraw(name) {
    const fn = draws[name]; if (!fn) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
      if (!visible(el)) return;
      if (el.parentElement && el.parentElement.closest('[data-draw]') && el.parentElement.closest('[data-draw]') !== el) return;
      try { fn(el); } catch (e) { console.error('draw ' + name, e); }
    });
  }
  function fire() {
    queued = false;
    for (const fn of cbs) { try { fn(); } catch (e) { console.error(e); } }
    Object.keys(draws).forEach(runDraw);
  }
  function soon() { if (!queued) { queued = true; requestAnimationFrame(fire); } }
  function load(id) {
    if (calcs[id] || store[id]) return;
    store[id] = { status: 'loading', data: [], columns: [] };
    fetch('data/' + id + '.csv' + (ver ? '?v=' + ver : ''), { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then((t) => { const rows = d3.csvParse(t); store[id] = { status: 'ok', data: rows, columns: rows.columns }; soon(); })
      .catch((e) => { store[id] = { status: 'error', data: [], columns: [], message: String(e) }; soon(); });
  }
  function calcValue(id) {
    const c = calcs[id]; const ins = c.inputs.map((i) => window.dash.data(i));
    if (ins.some((x) => x.status !== 'ok')) return { status: ins.some((x) => x.status === 'error') ? 'error' : 'loading', data: null };
    try { return { status: 'ok', data: c.fn(...ins.map((x) => x.data)) }; } catch (e) { return { status: 'error', data: null, message: String(e) }; }
  }
  window.dash = {
    data(id) { if (calcs[id]) return calcValue(id); load(id); return store[id]; },
    onData(fn) { cbs.push(fn); try { fn(); } catch (e) { console.error(e); } },
    calc(id, spec) { calcs[id] = spec; },
    draw(name, fn) {
      if (fn) {
        if (typeof fn === 'function') draws[name] = fn;
        else { const made = new WeakMap(); draws[name] = (el) => { if (!made.has(el)) { el.replaceChildren(); made.set(el, fn.mount ? fn.mount(el) : undefined); } if (fn.update) fn.update(el, made.get(el)); }; }
      }
      else runDraw(name);
    },
    loader() {}, refresh() {}, params() { return {}; }, setParams() {}, resetParams() {},
    setLink(name) { try { history.replaceState(null, '', '#' + name); } catch (e) {} soon(); },
    colors: ['var(--cds-chart-1)', 'var(--cds-chart-2)', 'var(--cds-chart-3)'],
    _start(v) {
      ver = v || '';
      document.querySelectorAll('[data-source]').forEach((el) => el.dataset.source.split(/\s+/).forEach((s) => s && load(s)));
      let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(soon, 150); });
      fire();
    }
  };
})();
