"use strict";
const glyphs = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  play: '<path d="m9 5 11 7-11 7V5Z"/>',
  pause: '<path d="M9 5v14m6-14v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  layers: '<path d="m3 9 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5M3 17l9 5 9-5"/>',
  legend: '<path d="m3 5 6 2 6-2 6 2v13l-6-2-6 2-6-2V5Zm6 2v13m6-15v13"/>',
  index: '<path d="M6 5h14v15H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm1 0v15m4-10h5m-5 4h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  ruler: '<path d="M21.3 8.7 15.3 2.7a1 1 0 0 0-1.4 0L2.7 13.9a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0L21.3 10.1a1 1 0 0 0 0-1.4ZM7.5 10.5l2 2m1.5-5 2 2m-9 4.5 2 2m8.5-10.5 2 2"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="2"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 11v6m4-6v6"/>',
  city: '<path d="M3 20h18M5 20V9l6-4v15m0-9h8v9M8 10v1m0 3v1m6-1h2m-2 3h2"/>',
  lake: '<path d="M2 15c3-3 5 3 9 0s5 3 11 0M2 19c3-3 5 3 9 0s5 3 11 0M4 11l5-7 5 7m-2-3 3-4 5 7"/>',
  port: '<circle cx="12" cy="5" r="2"/><path d="M12 7v13M8 10h8M3 14c0 4 4 7 9 7s9-3 9-7M3 14l-1 3m1-3 3 1m15-1 1 3m-1-3-3 1"/>',
  crossing: '<path d="M4 20v-7h3v7m-1-9 14-6-1-3-15 7 2 3Zm3-4 2 2m3-4 2 2M3 21h6"/>',
  mountain: '<path d="m2 19 8-14 5 8 2-3 5 9H2Zm5-9 3 2 2-3"/>',
  village: '<path d="m3 12 8-7 8 7M5 11v9h12v-9M9 20v-6h4v6"/>',
  rail: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 10h12M9 14h1m4 0h1M9 18l-3 4m9-4 3 4"/>',
  river: '<path d="M6 3c14 3-8 8 4 11s2 6 0 7M11 3c13 4-6 8 4 10s3 7 0 9"/>',
  road: '<path d="m7 3-4 18m14-18 4 18M12 3v3m0 4v3m0 4v3"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  spring: '<path d="M12 3s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>'
};

function icon(key) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (glyphs[key] || glyphs.pin) + '</svg>';
}

document.querySelectorAll('[data-icon]').forEach(el => {
  el.innerHTML = icon(el.dataset.icon);
});
