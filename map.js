"use strict";
const AtlasMap = (() => {
  const canvas = document.getElementById('canvas');
  const box = document.getElementById('map');
  const overlayCanvas = document.getElementById('warCanvas');
  const overlayContext = overlayCanvas?.getContext('2d');
  let redrawBase = true;
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = 2816, H = 2048, S = 262144;

  // Offscreen base-map snapshot canvas (with 20% overscan for seamless 120 FPS pan/zoom!)
  const snap = document.createElement('canvas');
  const labelCanvas = document.createElement('canvas');
  const labelContext = labelCanvas.getContext('2d');
  let labelView = null;
  const sctx = snap.getContext('2d', { alpha: false });
  const OVERSCAN = 1.24;
  let snapView = null;
  let snapDirty = true;
  let snapW = 1, snapH = 1;
  let settleTimer = null;

  // Cached DOM references
  const scaleTextEl = document.getElementById('scaleText');
  const scaleLineEl = document.getElementById('scaleLine');
  const positionEl = document.getElementById('position');
  const zoomInEl = document.getElementById('zoomIn');
  const zoomOutEl = document.getElementById('zoomOut');
  const zoomLevelEl = document.getElementById('zoomLevel');
  const zoomStatusEl = document.getElementById('zoomStatus');

  let lastScaleText = '', lastScaleW = -1, lastPosText = '', lastZoomStr = '';
  let lastZoomInDis = null, lastZoomOutDis = null;

  const layers = {
    relief: true,
    contours: true,
    water: true,
    roads: true,
    rail: true,
    borders: true,
    places: true,
    grid: false
  };

  const PALETTES = {
    light: {
      canvasBg: '#e8ebe0',
      landRelief: '#dde4d2',
      landFlat: '#ecece1',
      outsideMask: 'rgba(246, 246, 232, 0.45)',
      seaFill: '#a6c7c4',
      bathyContour: 'rgba(62, 114, 116, 0.28)',
      coastline: '#648f83',
      contourCoarse: 'rgba(84, 96, 66, 0.28)',
      contourFine: 'rgba(86, 100, 68, 0.34)',
      contourMajor: 'rgba(68, 82, 52, 0.58)',
      borderOuter: '#666d5c',
      borderDistrict: 'rgba(84, 88, 72, 0.56)',
      waterFill: '#8ebcb7',
      waterStroke: '#5f9691',
      river: '#559491',
      stream: '#74aba6',
      buildingFill: '#c7c6b0',
      buildingStroke: '#9f9e88',
      trail: '#8d8267',
      streetOuter: '#8c917c',
      streetOuterMid: '#a5a78f',
      streetInner: '#fff9e6',
      pier: '#728070',
      railBase: '#696f5f',
      railDash: '#f3f0df',
      roadOuterFar: '#9c8c65',
      roadOuter: '#907c56',
      roadInner: '#f7ecc5',
      hwyOuter: '#9b6645',
      hwyInner: '#f6d594',
      gridLine: 'rgba(86, 102, 82, 0.40)',
      gridText: '#4d6355',
      regionTitle: '#2f4b3c',
      neighborTitle: '#5d6b5c',
      seaTitle: '#477477',
      labelDefault: '#1c3e2d',
      labelWater: '#275f60',
      labelCrossing: '#86502d',
      labelHalo: 'rgba(247, 247, 233, 0.94)',
      dotStroke: '#faf9eb',
      capitalCenter: '#f6f4e2',
      activeHalo: '#fff9e7',
      activeRing: '#9c5b34',
      heightStroke: 'rgba(242, 244, 228, 0.94)',
      heightFill: '#4d5b42',
      measureCasing: 'rgba(255, 255, 255, 0.88)',
      measureLine: '#b84a27',
      measureNodeFill: '#fffdf5',
      measureLabelBg: '#1c3227',
      measureLabelText: '#f7f7ee'
    },
    dark: {
      canvasBg: '#0d1211',
      landRelief: '#192320',
      landFlat: '#17201d',
      outsideMask: 'rgba(10, 14, 13, 0.48)',
      seaFill: '#0f1b25',
      bathyContour: 'rgba(92, 152, 178, 0.26)',
      coastline: '#41707a',
      contourCoarse: 'rgba(156, 186, 170, 0.20)',
      contourFine: 'rgba(156, 188, 172, 0.28)',
      contourMajor: 'rgba(188, 218, 202, 0.50)',
      borderOuter: '#93a69a',
      borderDistrict: 'rgba(144, 162, 150, 0.42)',
      waterFill: '#1b3b48',
      waterStroke: '#3e7c90',
      river: '#52a1b9',
      stream: '#42899e',
      buildingFill: '#2f3d38',
      buildingStroke: '#485d55',
      trail: '#8a8570',
      streetOuter: '#2d3934',
      streetOuterMid: '#3b4843',
      streetInner: '#637870',
      pier: '#637870',
      railBase: '#85988f',
      railDash: '#17201d',
      roadOuterFar: '#625642',
      roadOuter: '#1b201e',
      roadInner: '#c4ab7c',
      hwyOuter: '#181512',
      hwyInner: '#e4a45d',
      gridLine: 'rgba(140, 170, 156, 0.24)',
      gridText: '#8ca398',
      regionTitle: '#cde0d5',
      neighborTitle: '#7e9389',
      seaTitle: '#6295a8',
      labelDefault: '#eaf3ee',
      labelWater: '#86d1e0',
      labelCrossing: '#e8aa6e',
      labelHalo: 'rgba(14, 20, 18, 0.94)',
      dotStroke: '#101614',
      capitalCenter: '#101614',
      activeHalo: '#182420',
      activeRing: '#e4a15a',
      heightStroke: 'rgba(14, 20, 18, 0.94)',
      heightFill: '#b5ccc0',
      measureCasing: 'rgba(10, 15, 13, 0.9)',
      measureLine: '#e8a254',
      measureNodeFill: '#131a18',
      measureLabelBg: '#1c2824',
      measureLabelText: '#edf4f0'
    }
  };

  let theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const data = Atlas;
  const points = data.points;
  const cells = new Map();
  const loading = new Set();
  data.cellData = Object.create(null);
  data.buildings = Object.create(null);
  data.fine = Object.create(null);

  const buildingKeys = new Set(data.buildingCells);
  const fineKeys = new Set(data.fineKeys);
  const terrainKeys = new Set(data.terrain);
  const terrainLightCache = new Map();
  const terrainDarkCache = new Map();
  const fineCache = new Map();

  let width = 1, height = 1, ratio = 1, baseZoom = 0.5, frame = 0;
  let motion = null, chosen = null, labels = [], heightLabels = [];
  let view = { x: 1408, y: 1024, z: 0.5 };
  let cursor = null;
  let selectCallback = () => {};
  let overlayDrawer = null;
  let clickInterceptor = null;
  let viewCallback = () => {};
  let measureCallback = () => {};

  let measureMode = false;
  let measurePoints = [];

  const pointers = new Map();
  let gesture = null, dragged = false, downAt = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function project(lon, lat) {
    return [
      (lon + 180) / 360 * S - 623 * 256,
      (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) * S / 2 - 372 * 256
    ];
  }

  function geographic(x, y) {
    return [
      (x + 623 * 256) / S * 360 - 180,
      Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 372 * 256) / S))) * 180 / Math.PI
    ];
  }

  function coordinates(x, y) {
    const [lon, lat] = geographic(x, y);
    return lat.toFixed(4) + '° с. ш., ' + lon.toFixed(4) + '° в. д.';
  }

  function haversineMeters(p1, p2) {
    const [lon1, lat1] = geographic(p1[0], p1[1]);
    const [lon2, lat2] = geographic(p2[0], p2[1]);
    const R = 6371000;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDistance(m) {
    if (m < 1000) return Math.round(m) + ' м';
    if (m < 10000) return (m / 1000).toFixed(2) + ' км';
    return (m / 1000).toFixed(1) + ' км';
  }

  function appendPoly(path, a) {
    for (let i = 0; i < a.length; i += 2) {
      const x = a[i] / 100, y = a[i + 1] / 100;
      if (i) path.lineTo(x, y); else path.moveTo(x, y);
    }
  }

  function geometry(a) {
    const path = new Path2D();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let i = 0; i < a.length; i += 2) {
      const x = a[i] / 100, y = a[i + 1] / 100;
      if (i) path.lineTo(x, y); else path.moveTo(x, y);
      if (x < left) left = x;
      if (y < top) top = y;
      if (x > right) right = x;
      if (y > bottom) bottom = y;
    }
    return { path, b: [left, top, right, bottom] };
  }

  // Merge an array of polylines into ONE single Path2D (reduces 7,333 draw calls -> 1!)
  function mergeArray(arr) {
    if (!arr || !arr.length) return null;
    const path = new Path2D();
    for (let i = 0; i < arr.length; i++) appendPoly(path, arr[i]);
    return path;
  }

  function prepareMergedCell(group) {
    const out = Object.create(null);
    for (const [k, arr] of Object.entries(group)) {
      out[k] = mergeArray(arr);
    }
    return out;
  }

  // Pre-merge overview layers into single Path2D objects for ultra-fast drawing
  const overviewMerged = Object.create(null);
  for (const [k, arr] of Object.entries(data.overview)) {
    overviewMerged[k] = mergeArray(arr);
  }

  // Pre-merge coarse contours into 3 buckets: bathy (h < 0), major600 (h > 0 && h % 600 === 0), allLand (h > 0)
  const bathyPath = new Path2D();
  const landContour600 = new Path2D();
  const landContourAll = new Path2D();
  for (let i = 0; i < data.contours.length; i++) {
    const [h, a] = data.contours[i];
    if (h < 0) appendPoly(bathyPath, a);
    else {
      appendPoly(landContourAll, a);
      if (h % 600 === 0) appendPoly(landContour600, a);
    }
  }

  const seaGeo = geometry(data.sea);
  const sea = seaGeo.path;
  const seaBounds = seaGeo.b;
  const region = geometry(data.region).path;
  const outside = new Path2D();
  outside.rect(0, 0, W, H);
  outside.addPath(region);

  // Dual-theme fast 2816x2048 rasters
  const reliefLight = new Image(), oceanLight = new Image();
  const reliefDark = new Image(), oceanDark = new Image();
  reliefLight.decoding = oceanLight.decoding = reliefDark.decoding = oceanDark.decoding = 'async';
  const onAssetLoad = () => { snapDirty = true; request(); };
  reliefLight.onload = oceanLight.onload = reliefDark.onload = oceanDark.onload = onAssetLoad;
  reliefLight.src = 'assets/relief.webp';
  oceanLight.src = 'assets/sea.webp';
  reliefDark.src = 'assets/relief_dark.webp';
  oceanDark.src = 'assets/sea_dark.webp';

  const cities = points.filter(p => p.k === 'city');
  const featured = points.filter(p => [
    'КПП Псоу', 'Ингурский мост', 'Озеро Рица',
    'Сухумский порт', 'Пицундский причал', 'Очамчырский порт'
  ].includes(p.n) && p.d);
  const rest = points.filter(p => !cities.includes(p) && !featured.includes(p));
  const rank = { rail: 1, village: 2, mountain: 3, river: 4, lake: 5, road: 6, pin: 7, spring: 8 };
  rest.sort((a, b) => (rank[a.k] ?? 9) - (rank[b.k] ?? 9));
  const cityOrder = ['Сухум', 'Гагра', 'Ткуарчал', 'Пицунда', 'Гал', 'Очамчыра', 'Гудаута', 'Новый Афон', 'Гулрыпш'];
  cities.sort((a, b) => cityOrder.indexOf(a.n) - cityOrder.indexOf(b.n));

  function invalidate() {
    snapDirty = true;
    request();
  }

  function scheduleRefresh(ms = 65) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      snapDirty = true;
      request();
    }, ms);
  }

  function request() {
    redrawBase = true;
    requestOverlay();
  }

  function requestOverlay() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function screen(x, y) {
    return [(x - view.x) * view.z + width / 2, (y - view.y) * view.z + height / 2];
  }

  function world(x, y) {
    return [(x - width / 2) / view.z + view.x, (y - height / 2) / view.z + view.y];
  }

  function check(b, v) {
    return b[0] <= v[2] && b[2] >= v[0] && b[1] <= v[3] && b[3] >= v[1];
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function constrained(v) {
    const z = clamp(v.z, baseZoom, 110);
    const mx = Math.min(W / 2, width / z * 0.35);
    const my = Math.min(H / 2, height / z * 0.35);
    return { x: clamp(v.x, mx, W - mx), y: clamp(v.y, my, H - my), z };
  }

  function home(animate = true) {
    const [l, t] = project(39.90, 43.62);
    const [r, b] = project(42.19, 42.36);
    const margin = width < 520 ? 34 : 76;
    baseZoom = Math.max(0.08, Math.min((width - margin) / (r - l), (height - 92) / (b - t)));
    move({ x: (l + r) / 2, y: (t + b) / 2, z: baseZoom }, animate);
  }

  function move(dest, animate = true) {
    dest = constrained(dest);
    if (!animate || reduced) {
      motion = null;
      view = dest;
      snapDirty = true;
    } else {
      motion = { from: { ...view }, to: dest, start: performance.now(), duration: 220 };
    }
    request();
  }

  function zoom(f, sx = width / 2, sy = height / 2, animate = true) {
    const old = (animate && motion) ? motion.to : view;
    const z = clamp(old.z * f, baseZoom, 110);
    const nx = old.x + (sx - width / 2) * (1 / old.z - 1 / z);
    const ny = old.y + (sy - height / 2) * (1 / old.z - 1 / z);
    if (animate) {
      move({ x: nx, y: ny, z }, true);
    } else {
      motion = null;
      view = constrained({ x: nx, y: ny, z });
      scheduleRefresh(70);
      request();
    }
  }

  function resize() {
    const r = box.getBoundingClientRect();
    const previous = baseZoom;
    const wasHome = Math.abs(view.z - previous) < 0.02;
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    if (overlayCanvas) {
      overlayCanvas.width = canvas.width;
      overlayCanvas.height = canvas.height;
    }
    snapW = Math.round(width * OVERSCAN);
    snapH = Math.round(height * OVERSCAN);
    snap.width = Math.round(snapW * ratio);
    snap.height = Math.round(snapH * ratio);
    snapView = null;
    snapDirty = true;
    const saved = { ...view };
    home(false);
    if (!wasHome) move(saved, false);
  }

  function cell(key, buildings = false) {
    const name = key + (buildings ? 'b' : '');
    if (buildings && !buildingKeys.has(key)) return null;
    if (cells.has(name)) return cells.get(name);
    if (!loading.has(name)) {
      loading.add(name);
      const el = document.createElement('script');
      el.src = 'data/cells/' + name + '.js';
      el.onload = () => {
        const store = buildings ? data.buildings : data.cellData;
        cells.set(name, prepareMergedCell(store[key]));
        delete store[key];
        el.remove();
        invalidate();
      };
      el.onerror = () => {
        loading.delete(name);
        el.remove();
      };
      document.head.append(el);
    }
    return null;
  }

  function sheets(v, fn) {
    const y0 = Math.max(0, Math.floor(v[1] / 256));
    const y1 = Math.min(7, Math.floor(v[3] / 256));
    const x0 = Math.max(0, Math.floor(v[0] / 256));
    const x1 = Math.min(10, Math.floor(v[2] / 256));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        fn(x + '_' + y, x, y);
      }
    }
  }

  function getTerrainImage(key) {
    if (!terrainKeys.has(key)) return null;
    const isDark = theme === 'dark';
    const cache = isDark ? terrainDarkCache : terrainLightCache;
    let im = cache.get(key);
    if (!im) {
      im = new Image();
      im.decoding = 'async';
      im.onload = onAssetLoad;
      im.src = (isDark ? 'assets/terrain_dark/' : 'assets/terrain/') + key + '.webp';
      cache.set(key, im);
      if (cache.size > 48) cache.delete(cache.keys().next().value);
    } else {
      cache.delete(key);
      cache.set(key, im);
    }
    return im;
  }

  function fineSheet(key) {
    if (!fineKeys.has(key) || fineCache.has(key)) return;
    fineCache.set(key, null);
    const el = document.createElement('script');
    el.src = 'data/topo/' + key + '.js';
    el.onload = () => {
      // Pre-merge minor & major 50m/200m contours into TWO Path2D objects per tile (528 draw calls -> 2!)
      const minor = new Path2D();
      const major = new Path2D();
      const anchors = [];
      const arr = data.fine[key];
      for (let idx = 0; idx < arr.length; idx++) {
        const [h, a] = arr[idx];
        if (h % 200 === 0) {
          appendPoly(major, a);
          if (a.length > 45) {
            const m = Math.floor(a.length / 4) * 2;
            anchors.push({ h, x: a[m] / 100, y: a[m + 1] / 100 });
          }
        } else {
          appendPoly(minor, a);
        }
      }
      fineCache.set(key, { minor, major, anchors });
      delete data.fine[key];
      el.remove();
      invalidate();
    };
    el.onerror = () => {
      fineCache.delete(key);
      el.remove();
    };
    document.head.append(el);
  }

  function strokePath(c, path, color, weight, z, dash) {
    if (!path) return;
    c.strokeStyle = color;
    c.lineWidth = weight / z;
    if (dash) c.setLineDash(dash.map(n => n / z));
    c.stroke(path);
    if (dash) c.setLineDash([]);
  }

  // Render full crisp base map (terrain + sea + contours + borders + rivers + roads + buildings) into `snap`
  function renderSnapshot(targetView) {
    const P = PALETTES[theme];
    const z = targetView.z;
    const hw = snapW / 2 / z;
    const hh = snapH / 2 / z;
    const v = [targetView.x - hw, targetView.y - hh, targetView.x + hw, targetView.y + hh];

    heightLabels.length = 0;

    sctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.fillStyle = P.canvasBg;
    sctx.fillRect(0, 0, snapW, snapH);

    sctx.save();
    sctx.translate(snapW / 2, snapH / 2);
    sctx.scale(z, z);
    sctx.translate(-targetView.x, -targetView.y);

    sctx.beginPath();
    sctx.rect(0, 0, W, H);
    sctx.clip();

    // Base land color (always clean & sharp at any zoom)
    sctx.fillStyle = layers.relief ? P.landRelief : P.landFlat;
    sctx.fillRect(0, 0, W, H);

    const activeRelief = theme === 'dark' ? reliefDark : reliefLight;
    const activeOcean = theme === 'dark' ? oceanDark : oceanLight;

    // Scale-adaptive raster relief:
    // Full crispness up to z=5; smoothly attenuate past native 30m DEM resolution (z=5..18)
    // so over-stretched pixels never look muddy while crisp 50m/200m vector contours take over!
    if (layers.relief) {
      const reliefAlpha = z <= 5 ? 1 : clamp(1 - (z - 5) / 14, 0.18, 1);
      const useDetailTiles = z >= 1.05;
      let readyTiles = null;
      let allReady = false;
      if (useDetailTiles) {
        readyTiles = [];
        allReady = true;
        sheets(v, (key, x, y) => {
          const im = getTerrainImage(key);
          if (im && im.complete && im.naturalWidth) {
            readyTiles.push([im, x * 256, y * 256]);
          } else {
            allReady = false;
          }
        });
      }
      sctx.save();
      if (reliefAlpha < 0.99) sctx.globalAlpha = reliefAlpha;
      if ((!allReady || !useDetailTiles) && activeRelief.naturalWidth) {
        sctx.drawImage(activeRelief, 0, 0, W, H);
      }
      if (readyTiles) {
        // Overlap by 0.6 world unit to completely eliminate subpixel tile seams!
        const overlap = 0.6;
        for (let i = 0; i < readyTiles.length; i++) {
          const t = readyTiles[i];
          sctx.drawImage(t[0], t[1], t[2], 256 + overlap, 256 + overlap);
        }
      }
      sctx.restore();
    }

    // Outside Abkhazia dim mask (skip when deeply zoomed inside Abkhazia)
    if (z < 5) {
      sctx.fillStyle = P.outsideMask;
      sctx.fill(outside, 'evenodd');
    }

    sctx.lineJoin = 'round';
    sctx.lineCap = 'round';

    // Land contours & borders drawn BEFORE sea (eliminates expensive ctx.clip(land, 'evenodd')!)
    if (layers.contours) {
      const fine = z >= 3.2;
      if (!fine) {
        strokePath(sctx, z > 0.95 ? landContourAll : landContour600, P.contourCoarse, z < 1 ? 0.65 : 0.9, z);
      } else {
        // Boost contour crispness slightly at high zoom as raster hillshade softens
        const boost = z > 8 ? 1.18 : 1.0;
        sheets(v, (key, x, y) => {
          fineSheet(key);
          const sheet = fineCache.get(key);
          if (sheet) {
            strokePath(sctx, sheet.minor, P.contourFine, 0.85 * boost, z);
            strokePath(sctx, sheet.major, P.contourMajor, 1.28 * boost, z);
            for (let i = 0; i < sheet.anchors.length; i++) {
              const a = sheet.anchors[i];
              if (a.x >= v[0] && a.x <= v[2] && a.y >= v[1] && a.y <= v[3]) heightLabels.push(a);
            }
          } else {
            sctx.save();
            sctx.beginPath();
            sctx.rect(x * 256, y * 256, 256, 256);
            sctx.clip();
            strokePath(sctx, landContourAll, P.contourCoarse, 0.9, z);
            sctx.restore();
          }
        });
      }
    }

    if (layers.borders) {
      strokePath(sctx, overviewMerged.boundary, P.borderOuter, z > 0.9 ? 1.65 : 1.25, z, [6, 3.5]);
      if (z > 0.55) {
        strokePath(sctx, overviewMerged.district, P.borderDistrict, 0.95, z, [3, 4]);
      }
    }

    // Sea & bathymetry (only clip/draw when sea intersects viewport!)
    if (check(seaBounds, v)) {
      sctx.save();
      sctx.clip(sea);
      sctx.fillStyle = P.seaFill;
      sctx.fillRect(v[0], v[1], v[2] - v[0], v[3] - v[1]);
      if (layers.relief && activeOcean.naturalWidth) {
        sctx.drawImage(activeOcean, 0, 0, W, H);
      }
      if (layers.contours) {
        strokePath(sctx, bathyPath, P.bathyContour, 0.75, z);
      }
      sctx.restore();
      strokePath(sctx, sea, P.coastline, z > 2 ? 1.2 : 0.95, z);
    }

    // Hydrology
    if (layers.water) {
      if (overviewMerged.water) {
        sctx.fillStyle = P.waterFill;
        sctx.fill(overviewMerged.water);
        if (z > 1.2) strokePath(sctx, overviewMerged.water, P.waterStroke, 0.75, z);
      }
      strokePath(sctx, overviewMerged.river, P.river, z < 0.7 ? 1.05 : 1.6, z);
    }

    // Detailed vector cells (merged Path2D per cell -> ~10 draw calls total!)
    if (z >= 1.1 && (layers.roads || layers.water || layers.places)) {
      for (const [k, b] of Object.entries(data.cells)) {
        if (!check(b, v)) continue;
        const c = cell(k);
        if (c) {
          if (layers.water && c.stream) strokePath(sctx, c.stream, P.stream, z < 3 ? 0.72 : 1.15, z);
          if (layers.roads) {
            if (z >= 2.6 && c.trail) strokePath(sctx, c.trail, P.trail, z > 7 ? 1.1 : 0.75, z, [2.8, 2.4]);
            if (z >= 1.45 && c.street) strokePath(sctx, c.street, z > 6 ? P.streetOuter : P.streetOuterMid, z > 7 ? 2.8 : 1.2, z);
            if (z >= 4 && c.street) strokePath(sctx, c.street, P.streetInner, z > 7 ? 1.7 : 0.82, z);
            if (c.pier) strokePath(sctx, c.pier, P.pier, 1.9, z);
          }
        }
        if (layers.places && z >= 6.8) {
          const houses = cell(k, true);
          if (houses && houses.building) {
            sctx.fillStyle = P.buildingFill;
            sctx.fill(houses.building);
            if (z >= 11) strokePath(sctx, houses.building, P.buildingStroke, 0.65, z);
          }
        }
      }
    }

    // Railways
    if (layers.rail && overviewMerged.rail) {
      strokePath(sctx, overviewMerged.rail, P.railBase, z < 1 ? 0.85 : 1.55, z);
      if (z > 1.2) strokePath(sctx, overviewMerged.rail, P.railDash, 0.82, z, [2.2, 4.2]);
    }

    // Regional roads & highways
    if (layers.roads) {
      strokePath(sctx, overviewMerged.road, z < 0.7 ? P.roadOuterFar : P.roadOuter, z < 1 ? 1.1 : 2.65, z);
      if (z >= 0.95) strokePath(sctx, overviewMerged.road, P.roadInner, 1.48, z);
      strokePath(sctx, overviewMerged.highway, P.hwyOuter, z < 1 ? 2.4 : 4.0, z);
      strokePath(sctx, overviewMerged.highway, P.hwyInner, z < 1 ? 1.35 : 2.45, z);
    }

    sctx.restore();
    snapView = { x: targetView.x, y: targetView.y, z: targetView.z };
    snapDirty = false;
  }

  function needsImmediateSnapshot() {
    if (snapDirty || !snapView) return true;
    const zRatio = view.z / snapView.z;
    if (zRatio > 1.75 || zRatio < 0.58) return true;
    // Check if viewport drifted past our 24% overscan margin
    const maxDx = (snapW - width) / 2 / snapView.z;
    const maxDy = (snapH - height) / 2 / snapView.z;
    if (Math.abs(view.x - snapView.x) > maxDx * 0.95 || Math.abs(view.y - snapView.y) > maxDy * 0.95) return true;
    return false;
  }

  function draw(time) {
    frame = 0;
    const P = PALETTES[theme];
    if (!redrawBase && overlayContext) {
      drawOverlay(time, P);
      return;
    }
    redrawBase = false;

    if (motion) {
      const t = clamp((time - motion.start) / motion.duration, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const { from, to } = motion;
      view = {
        x: from.x + (to.x - from.x) * ease,
        y: from.y + (to.y - from.y) * ease,
        z: Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * ease)
      };
      if (t === 1) {
        motion = null;
        snapDirty = true;
      } else {
        request();
      }
    }

    const interacting = pointers.size > 0 || motion !== null;
    if (needsImmediateSnapshot() && (!interacting || !snapView || Math.abs(view.z / snapView.z - 1) > 0.65 || Math.abs(view.x - snapView.x) > (snapW - width) / 2 / snapView.z || Math.abs(view.y - snapView.y) > (snapH - height) / 2 / snapView.z)) {
      renderSnapshot(view);
    }

    // Ultra-fast GPU blit of cached snapshot canvas (< 0.4ms -> 120 FPS!)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = interacting ? 'low' : 'medium';
    ctx.fillStyle = P.canvasBg;
    ctx.fillRect(0, 0, width, height);

    if (snapView) {
      const scale = view.z / snapView.z;
      const dx = (snapView.x - view.x) * view.z + width / 2 - (snapW / 2) * scale;
      const dy = (snapView.y - view.y) * view.z + height / 2 - (snapH / 2) * scale;
      ctx.drawImage(snap, 0, 0, snap.width, snap.height, dx, dy, snapW * scale, snapH * scale);
    }

    const z = view.z;
    const [x0, y0] = world(0, 0);
    const [x1, y1] = world(width, height);
    const v = [x0 - 2 / z, y0 - 2 / z, x1 + 2 / z, y1 + 2 / z];

    if (layers.grid) drawGrid(v, P);
    drawCachedLabels(P, interacting);
    drawOverlay(time, P);

    // Dirty-checked DOM updates
    const lat = geographic(view.x, view.y)[1];
    const metres = 40075016.69 * Math.cos(lat * Math.PI / 180) / S / z;
    const max = metres * (width < 500 ? 48 : 84);
    const unit = 10 ** Math.floor(Math.log10(max));
    const d = [5, 2, 1].find(i => i * unit <= max) * unit;
    const st = d >= 1000 ? (d / 1000) + ' км' : d + ' м';
    const sw = Math.round(d / metres);
    if (st !== lastScaleText) { scaleTextEl.textContent = st; lastScaleText = st; }
    if (sw !== lastScaleW) { scaleLineEl.style.width = sw + 'px'; lastScaleW = sw; }

    const posStr = coordinates(...(cursor ? world(...cursor) : [view.x, view.y]));
    if (posStr !== lastPosText) { positionEl.textContent = posStr; lastPosText = posStr; }

    const zinDis = z > 109.9;
    const zoutDis = z < baseZoom * 1.001;
    if (zinDis !== lastZoomInDis) { zoomInEl.disabled = zinDis; lastZoomInDis = zinDis; }
    if (zoutDis !== lastZoomOutDis) { zoomOutEl.disabled = zoutDis; lastZoomOutDis = zoutDis; }

    const relZoom = z / Math.max(baseZoom, 0.01);
    const zoomStr = relZoom >= 10 ? relZoom.toFixed(0) + '×' : relZoom.toFixed(1) + '×';
    if (zoomStr !== lastZoomStr) {
      lastZoomStr = zoomStr;
      if (zoomLevelEl) zoomLevelEl.textContent = zoomStr;
      if (zoomStatusEl) zoomStatusEl.textContent = 'Масштаб ' + zoomStr;
      viewCallback({ z, relZoom });
    }
  }

  function drawOverlay(time, palette) {
    const layer = overlayContext || ctx;
    layer.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (overlayContext) layer.clearRect(0, 0, overlayCanvas.width / ratio, overlayCanvas.height / ratio);
    if (overlayDrawer) overlayDrawer(layer, { screen, world, view, width, height, theme, time });
    if (measureMode || measurePoints.length) drawMeasure(palette, layer);
  }

  function drawGrid(v, P) {
    const [west, north] = geographic(v[0], v[1]);
    const [east, south] = geographic(v[2], v[3]);
    const step = view.z > 12 ? 0.02 : view.z > 3 ? 0.1 : view.z > 1 ? 0.25 : 0.5;
    ctx.save();
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = P.gridLine;
    ctx.fillStyle = P.gridText;
    ctx.font = '500 10px Inter, sans-serif';
    for (let lon = Math.ceil(west / step) * step; lon < east; lon += step) {
      const x = Math.round(screen(...project(lon, north))[0]) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(lon.toFixed(2) + '°', x + 4, 13);
    }
    for (let lat = Math.ceil(south / step) * step; lat < north; lat += step) {
      const y = Math.round(screen(...project(east, lat))[1]) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillText(lat.toFixed(2) + '°', 4, y - 4);
    }
    ctx.restore();
  }

  function lettering(ctx, text, lon, lat, size, color, spacing, italic = false, angle = 0) {
    const [rawX, rawY] = screen(...project(lon, lat));
    const x = Math.round(rawX), y = Math.round(rawY);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.textAlign = 'center';
    ctx.font = (italic ? 'italic ' : '600 ') + size + 'px Georgia, serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawCachedLabels(palette, interacting) {
    if (interacting || !labelContext) {
      labelView = null;
      drawLabels(palette, ctx);
      return;
    }
    if (!labelView || labelView.view !== view || labelView.snapshot !== snapView || labelView.chosen !== chosen ||
        labelView.width !== width || labelView.height !== height || labelView.ratio !== ratio || labelView.palette !== palette) {
      const pixelWidth = Math.ceil(width * ratio);
      const pixelHeight = Math.ceil(height * ratio);
      if (labelCanvas.width !== pixelWidth) labelCanvas.width = pixelWidth;
      if (labelCanvas.height !== pixelHeight) labelCanvas.height = pixelHeight;
      labelContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      labelContext.clearRect(0, 0, pixelWidth / ratio, pixelHeight / ratio);
      drawLabels(palette, labelContext);
      labelView = { view, snapshot: snapView, chosen, width, height, ratio, palette };
    }
    ctx.drawImage(labelCanvas, 0, 0, labelCanvas.width / ratio, labelCanvas.height / ratio);
  }

  function drawLabels(P, ctx) {
    labels.length = 0;
    const taken = [], used = new Map();
    const z = view.z, small = width < 600;

    if (z < 1.65) {
      const size = small ? 14 : 20;
      lettering(ctx, 'АБХАЗИЯ', 40.98, 43.201, size, P.regionTitle, small ? 3 : 5.5);
      lettering(ctx, 'РОССИЯ', 40.9, 43.59, small ? 11 : 13.5, P.neighborTitle, 3);
      lettering(ctx, 'ГРУЗИЯ', 41.93, 42.46, small ? 11 : 13.5, P.neighborTitle, 2.5);
      lettering(ctx, 'Чёрное море', 40.53, 42.85, small ? 19 : 29, P.seaTitle, small ? 1 : 2.2, true, 0.10);
    }

    function label(p, priority = false) {
      if (!p) return;
      const [rx, ry] = screen(p.x, p.y);
      const x = Math.round(rx), y = Math.round(ry);
      if (x < 4 || y < 6 || x > width - 4 || y > height - 38) return;

      const normalized = p.n.toLocaleLowerCase('ru').trim();
      const prior = used.get(normalized);
      if (prior && prior.some(q => Math.hypot(x - q[0], y - q[1]) < 125)) return;

      const active = chosen === p;
      const feature = featured.includes(p);
      const city = p.k === 'city';
      const capital = p.n === 'Сухум' && city;

      if (!active && !layers.places && (city || ['rail', 'crossing', 'port', 'village', 'pin', 'mountain', 'spring'].includes(p.k))) return;
      if (!active && ((p.k === 'road' && !layers.roads) || (['river', 'lake'].includes(p.k) && !layers.water) || (p.k === 'rail' && !layers.rail))) return;

      const font = capital
        ? '700 17px Georgia, serif'
        : city
          ? '600 13px Inter, Arial, sans-serif'
          : feature
            ? '600 11.5px Inter, Arial, sans-serif'
            : '500 11.5px Inter, Arial, sans-serif';
      ctx.font = font;
      const tw = Math.ceil(ctx.measureText(p.n).width);
      const offset = feature || active ? 10 : 7;
      const opts = p.n === 'Сухумский порт'
        ? [[offset, 14], [-tw - offset, 15], [offset, -11]]
        : [[offset, -5], [offset, 13], [-tw - offset, -5], [-tw - offset, 13]];

      let pos = null;
      for (const [dx, dy] of opts) {
        const a = [x + dx - 3, y + dy - 13, x + dx + tw + 4, y + dy + 4];
        if (a[0] < 2 || a[2] > width - 2 || a[1] < 0 || a[3] > height - 34) continue;
        if (!taken.some(b => check(b, a))) {
          pos = [dx, dy, a];
          break;
        }
      }
      if (!pos && active) pos = [offset, -6, [x, y - 21, x + tw + offset, y + 2]];
      if (!pos && !priority) return;
      if (pos) {
        taken.push(pos[2]);
        if (!prior) used.set(normalized, []);
        used.get(normalized).push([x, y]);
      }

      const color = p.k === 'crossing'
        ? P.labelCrossing
        : (p.k === 'port' || p.k === 'lake' || p.k === 'river' ? P.labelWater : P.labelDefault);

      ctx.save();
      if (active) {
        ctx.beginPath();
        ctx.arc(x, y, 10.5, 0, Math.PI * 2);
        ctx.fillStyle = P.activeHalo;
        ctx.fill();
        ctx.strokeStyle = P.activeRing;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }

      ctx.lineWidth = 1.6;
      ctx.strokeStyle = P.dotStroke;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (feature && p.k === 'crossing') {
        ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath();
      } else if (p.k === 'mountain') {
        ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 4.5, y + 3.5); ctx.lineTo(x - 4.5, y + 3.5); ctx.closePath();
      } else {
        ctx.arc(x, y, capital ? 5.2 : feature ? 4.6 : city ? 3.8 : 2.6, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();

      if (capital) {
        ctx.fillStyle = P.capitalCenter;
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      if (pos) {
        const [dx, dy] = pos;
        const tx = Math.round(x + dx), ty = Math.round(y + dy);
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = P.labelHalo;
        ctx.strokeText(p.n, tx, ty);
        ctx.fillStyle = color;
        ctx.fillText(p.n, tx, ty);
      }
      ctx.restore();
      labels.push({ p, x, y, b: pos && pos[2] });
    }

    label(chosen, true);
    for (let i = 0; i < cities.length; i++) if (cities[i] !== chosen) label(cities[i], true);
    for (let i = 0; i < featured.length; i++) if (featured[i] !== chosen) label(featured[i], true);

    if (z < 1.65 && layers.water && width > 620) {
      for (const n of ['Бзыбь', 'Кодор']) {
        const p = points.find(o => o.n === n && o.s === 'Река');
        if (p && p !== chosen) label(p);
      }
    }

    if (z > 1.05) {
      for (let i = 0; i < rest.length; i++) {
        const p = rest[i];
        if (p === chosen) continue;
        const threshold = p.s === 'Вершина' ? 1.7 : p.k === 'river' ? 1.5 : p.s === 'Село' ? 1.9 : p.k === 'rail' ? 2.8 : p.k === 'road' ? 7.5 : 3.8;
        if (z >= threshold) label(p);
      }
    }

    if (heightLabels.length && layers.contours) {
      ctx.save();
      ctx.font = 'italic 11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = P.heightStroke;
      ctx.fillStyle = P.heightFill;
      const placed = [];
      for (let i = 0; i < heightLabels.length; i++) {
        const f = heightLabels[i];
        const [rx, ry] = screen(f.x, f.y);
        const x = Math.round(rx), y = Math.round(ry);
        const b = [x - 18, y - 10, x + 18, y + 3];
        if (x < 50 || x > width - 50 || y < 42 || y > height - 45 || taken.some(a => check(a, b)) || placed.some(q => Math.hypot(x - q[0], y - q[1]) < 145)) continue;
        ctx.strokeText(f.h + ' м', x, y);
        ctx.fillText(f.h + ' м', x, y);
        placed.push([x, y]);
      }
      ctx.restore();
    }
  }

  function drawMeasure(P, ctx) {
    if (!measurePoints.length) return;
    const pts = measurePoints.map(p => screen(p[0], p[1]));
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (measureMode && cursor && pts.length) {
      const last = pts[pts.length - 1];
      ctx.beginPath();
      ctx.moveTo(last[0], last[1]);
      ctx.lineTo(cursor[0], cursor[1]);
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = P.measureLine;
      ctx.globalAlpha = 0.65;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }

    if (pts.length >= 2) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.lineWidth = 4.6;
      ctx.strokeStyle = P.measureCasing;
      ctx.stroke();

      ctx.beginPath();
      pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.lineWidth = 2.4;
      ctx.setLineDash([8, 5]);
      ctx.strokeStyle = P.measureLine;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '600 11px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 56) continue;
        const dist = haversineMeters(measurePoints[i - 1], measurePoints[i]);
        const labelText = formatDistance(dist);
        const mx = Math.round((a[0] + b[0]) / 2);
        const my = Math.round((a[1] + b[1]) / 2);
        const tw = ctx.measureText(labelText).width + 12;
        ctx.fillStyle = P.measureLabelBg;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(mx - tw / 2, my - 10, tw, 20, 5);
        else ctx.rect(mx - tw / 2, my - 10, tw, 20);
        ctx.fill();
        ctx.fillStyle = P.measureLabelText;
        ctx.fillText(labelText, mx, my + 0.5);
      }
    }

    pts.forEach(([x, y], idx) => {
      ctx.beginPath();
      ctx.arc(x, y, idx === 0 || idx === pts.length - 1 ? 5.5 : 4.2, 0, Math.PI * 2);
      ctx.fillStyle = P.measureNodeFill;
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = P.measureLine;
      ctx.stroke();
    });

    ctx.restore();
  }

  function emitMeasureState() {
    let total = 0;
    for (let i = 1; i < measurePoints.length; i++) {
      total += haversineMeters(measurePoints[i - 1], measurePoints[i]);
    }
    measureCallback({
      active: measureMode,
      count: measurePoints.length,
      totalMeters: total,
      formatted: formatDistance(total)
    });
  }

  function setMeasureMode(on) {
    measureMode = !!on;
    canvas.classList.toggle('measuring', measureMode);
    if (!measureMode) measurePoints = [];
    emitMeasureState();
    request();
  }

  function addMeasurePoint(wx, wy) {
    measurePoints.push([wx, wy]);
    emitMeasureState();
    request();
  }

  function undoMeasure() {
    if (measurePoints.length) {
      measurePoints.pop();
      emitMeasureState();
      request();
    }
  }

  function clearMeasure() {
    measurePoints = [];
    emitMeasureState();
    request();
  }

  function setTheme(nextTheme) {
    theme = nextTheme === 'dark' ? 'dark' : 'light';
    invalidate();
  }

  function locate(p) {
    chosen = p;
    cursor = null;
    move({ x: p.x, y: p.y, z: Math.max(baseZoom * 2.2, p.z) });
  }

  function clear() {
    chosen = null;
    request();
  }

  function pointAt(x, y) {
    let near = null, dist = 19;
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < dist) { near = l.p; dist = d; }
    }
    if (near) return near;
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      if (l.b && check(l.b, [x, y, x, y])) return l.p;
    }
    return null;
  }

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function captureGesture() {
    const a = [...pointers.values()];
    if (!a.length) { gesture = null; return; }
    const b = a[1] || a[0];
    const x = (a[0][0] + b[0]) / 2, y = (a[0][1] + b[1]) / 2;
    gesture = {
      screen: [x, y],
      point: world(x, y),
      z: view.z,
      distance: Math.max(1, Math.hypot(a[0][0] - b[0], a[0][1] - b[1]))
    };
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    motion = null;
    box.focus({ preventScroll: true });
    pointers.set(e.pointerId, local(e));
    canvas.setPointerCapture(e.pointerId);
    dragged = pointers.size > 1;
    downAt = performance.now();
    captureGesture();
    if (!measureMode) canvas.classList.add('drag');
  });

  canvas.addEventListener('pointermove', e => {
    const pos = local(e);
    cursor = pos;
    if (!pointers.has(e.pointerId)) {
      const posStr = coordinates(...world(...pos));
      if (posStr !== lastPosText) { positionEl.textContent = posStr; lastPosText = posStr; }
      if (measureMode) {
        canvas.style.cursor = 'crosshair';
        if (measurePoints.length) request();
      } else {
        canvas.style.cursor = pointAt(...pos) ? 'pointer' : '';
      }
      return;
    }
    pointers.set(e.pointerId, pos);
    const a = [...pointers.values()], b = a[1] || a[0];
    const mx = (a[0][0] + b[0]) / 2, my = (a[0][1] + b[1]) / 2;
    if (Math.hypot(mx - gesture.screen[0], my - gesture.screen[1]) > 3 || a.length > 1) {
      dragged = true;
      canvas.classList.add('drag');
    }
    const z = a.length > 1
      ? clamp(gesture.z * Math.hypot(a[0][0] - b[0], a[0][1] - b[1]) / gesture.distance, baseZoom, 110)
      : gesture.z;
    view = constrained({
      x: gesture.point[0] - (mx - width / 2) / z,
      y: gesture.point[1] - (my - height / 2) / z,
      z
    });
    request();
  });

  function release(e) {
    if (!pointers.has(e.pointerId)) return;
    const pos = local(e);
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      canvas.classList.remove('drag');
      if (dragged) scheduleRefresh(35);
      if (e.type === 'pointerup' && !dragged && performance.now() - downAt < 650) {
        if (measureMode) {
          addMeasurePoint(...world(...pos));
        } else if (clickInterceptor && clickInterceptor(pos[0], pos[1], { screen, world, view })) {
          // Handled by War Room tactical overlay
        } else {
          const p = pointAt(...pos);
          if (p) selectCallback(p, false);
        }
      }
    }
    captureGesture();
  }

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { cursor = null; request(); });
  canvas.addEventListener('dblclick', e => {
    if (!measureMode) zoom(2, ...local(e), true);
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    zoom(Math.exp(-clamp(dy, -240, 240) * 0.0028), ...local(e), false);
  }, { passive: false });

  box.addEventListener('keydown', e => {
    if (e.target !== box) return;
    const step = 110 / view.z;
    const v = motion ? motion.to : view;
    if (e.key === '+' || e.key === '=') zoom(1.7, width / 2, height / 2, true);
    else if (e.key === '-') zoom(1 / 1.7, width / 2, height / 2, true);
    else if (e.key === 'Home') home();
    else if (e.key.startsWith('Arrow')) {
      move({
        x: v.x + ({ ArrowLeft: -step, ArrowRight: step }[e.key] || 0),
        y: v.y + ({ ArrowUp: -step, ArrowDown: step }[e.key] || 0),
        z: v.z
      });
    } else return;
    e.preventDefault();
  });

  new ResizeObserver(resize).observe(box);
  document.fonts.ready.then(invalidate);

  return {
    layers,
    home,
    zoom: (f, sx, sy) => zoom(f, sx, sy, true),
    locate,
    clear,
    request: invalidate,
    coordinates,
    setTheme,
    getTheme: () => theme,
    setMeasureMode,
    addMeasurePoint,
    undoMeasure,
    clearMeasure,
    isMeasuring: () => measureMode,
    onSelect: f => { selectCallback = f; },
    onViewChange: f => { viewCallback = f; },
    onMeasureChange: f => { measureCallback = f; },
    mark: p => { chosen = p; request(); },
    setOverlay: fn => { overlayDrawer = fn; request(); },
    setClickInterceptor: fn => { clickInterceptor = fn; },
    flyTo: (x, y, z) => move({ x, y, z: z || Math.max(baseZoom * 2.2, 2.2) }, true),
    redrawOverlay: requestOverlay
  };
})();
