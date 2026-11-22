"use strict";
(() => {
  const $ = s => document.querySelector(s);
  const layout = $('#layout');
  const side = $('#side');
  const map = AtlasMap;
  const dialog = $('#dialog');

  const layerNames = {
    relief: 'Рельеф и отмывка',
    contours: 'Горизонтали',
    water: 'Реки и озёра',
    roads: 'Дороги и трассы',
    rail: 'Железные дороги',
    borders: 'Границы и районы',
    places: 'Населённые пункты',
    grid: 'Координатная сетка'
  };

  const presets = {
    atlas:  { relief: true,  contours: true,  water: true, roads: true, rail: true, borders: true, places: true, grid: false },
    topo:   { relief: true,  contours: true,  water: true, roads: true, rail: true, borders: true, places: true, grid: true  },
    scheme: { relief: false, contours: false, water: true, roads: true, rail: true, borders: true, places: true, grid: false }
  };

  function hydrateIcons() {
    if (typeof icon !== 'function') return;
    document.querySelectorAll('[data-icon]').forEach(el => {
      el.innerHTML = icon(el.dataset.icon);
    });
  }

  function setLayerPanel(isOpen) {
    const panel = $('#layers');
    const btn = $('#layerButton');
    if (!panel || !btn) return;
    panel.hidden = !isOpen;
    btn.setAttribute('aria-expanded', String(isOpen));
  }

  function syncPresetButtons() {
    document.querySelectorAll('.presetBtn').forEach(btn => {
      const p = presets[btn.dataset.preset];
      const match = p && Object.keys(p).every(k => map.layers[k] === p[k]);
      btn.classList.toggle('active', !!match);
    });
  }

  function setLayer(k, v) {
    map.layers[k] = v;
    const check = document.querySelector('#layerItems input[name="' + k + '"]');
    if (check) check.checked = v;
    syncPresetButtons();
    map.request();
  }

  function applyPreset(name) {
    const p = presets[name];
    if (!p) return;
    for (const [k, v] of Object.entries(p)) {
      map.layers[k] = v;
      const check = document.querySelector('#layerItems input[name="' + k + '"]');
      if (check) check.checked = v;
    }
    syncPresetButtons();
    map.request();
  }

  function applyTheme(theme, persist) {
    const dark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const meta = $('#themeColorMeta');
    if (meta) meta.setAttribute('content', dark ? '#0d1211' : '#f4f3ec');
    const ic = $('#themeIcon');
    if (ic && typeof icon === 'function') ic.innerHTML = icon(dark ? 'sun' : 'moon');
    const lbl = $('#themeLabel');
    if (lbl) lbl.textContent = dark ? 'Светлая' : 'Тёмная';
    if (persist) {
      try { localStorage.setItem('abkhazia_atlas_theme', theme); } catch (e) {}
    }
    map.setTheme(theme);
  }

  function buildLayerControls() {
    const box = $('#layerItems');
    if (!box) return;
    box.replaceChildren();
    for (const [k, label] of Object.entries(layerNames)) {
      const row = document.createElement('label');
      row.className = 'layerRow';
      const name = document.createElement('span');
      name.textContent = label;
      const tog = document.createElement('span');
      tog.className = 'toggle';
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.name = k;
      inp.checked = !!map.layers[k];
      inp.onchange = () => setLayer(k, inp.checked);
      const track = document.createElement('span');
      track.className = 'toggleTrack';
      tog.append(inp, track);
      row.append(name, tog);
      box.append(row);
    }
    document.querySelectorAll('.presetBtn').forEach(btn => {
      btn.onclick = () => applyPreset(btn.dataset.preset);
    });
    syncPresetButtons();
  }

  function toggleSidebar() {
    if (window.matchMedia('(max-width: 820px)').matches) {
      side.classList.toggle('open');
    } else {
      layout.classList.toggle('collapsed');
    }
  }

  hydrateIcons();
  buildLayerControls();

  document.querySelectorAll('[data-action="side"]').forEach(b => { b.onclick = toggleSidebar; });
  $('#layerButton').onclick = () => setLayerPanel($('#layers').hidden);
  $('#themeToggle').onclick = () => applyTheme(map.getTheme() === 'dark' ? 'light' : 'dark', true);
  $('#home').onclick = () => map.home();
  $('#brandHome').onclick = e => { e.preventDefault(); map.home(); };
  $('#zoomIn').onclick = () => map.zoom(1.7);
  $('#zoomOut').onclick = () => map.zoom(1 / 1.7);
  $('#dialogClose').onclick = () => dialog.close();
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });

  document.addEventListener('keydown', e => {
    const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
    if (e.key === 'Escape' && !dialog.open) {
      side.classList.remove('open');
      setLayerPanel(false);
    } else if (!dialog.open && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 't' || k === 'е') applyTheme(map.getTheme() === 'dark' ? 'light' : 'dark', true);
      else if (k === 'b' || k === 'и') toggleSidebar();
    }
  });

  $('#canvas').addEventListener('pointerdown', () => setLayerPanel(false));

  let initTheme = 'dark';
  try {
    const saved = localStorage.getItem('abkhazia_atlas_theme');
    if (saved === 'light' || saved === 'dark') initTheme = saved;
  } catch (e) {}
  applyTheme(initTheme, false);
})();
