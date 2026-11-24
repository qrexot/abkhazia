"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};

window.AbkhaziaGame.WarRoom = (() => {
  const G = window.AbkhaziaGame;
  const E = G.Engine;
  const guestMotion = G.createGuestMotion();
  let guestMatchId = null;
  let lastMapDrawTime = 0;

  function syncGuestMotion(session) {
    const matchId = session?.side === 'B' ? session.matchId : null;
    if (matchId !== guestMatchId) {
      guestMotion.reset();
      guestMatchId = matchId;
    }
    guestMotion.setRunning(Boolean(matchId && session.status === 'active' && session.speed > 0), performance.now());
  }

  function renderDivisionAt(unit, screen, time = lastMapDrawTime) {
    const position = guestMatchId ? guestMotion.division(unit, time) : unit;
    return screen(position.x, position.y);
  }

  function seedGuestMotion(snapshot, speed) {
    const moving = new Map((snapshot.motionUnits || []).map(unit => [unit[0], unit]));
    guestMotion.accept({
      units: snapshot.divisions.map(unit => moving.get(unit.id) || [unit.id, unit.x, unit.y]),
      strikes: snapshot.activeStrikes.map(strike => [strike.id, strike.progress, speed * 0.65])
    }, performance.now(), false);
  }
  const $ = s => document.querySelector(s);
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  let active = true;
  let gameEntered = false;
  let pendingMarch = null;
  let selectedDivIds = new Set();
  let multiSelect = false;
  let localSession = false;
  let localSpeed = 0;
  let setupRole, setupScenario;
  let selectedCityId = null;
  let selectedCorridorKey = null;
  let selectedOpMode = 'standard';
  let dirType = 'capture_city';
  let dirEffort = 'medium';
  let dirTargetId = '';
  let currentTab = 'army';
  let obsTab = 'un';
  let armedAction = null;
  let lastScreenFn = null;
  let lastWorldFn = null;
  const tacLayers = { routes: true, rail: true, infra: true, supply: true };

  // Right-click box-selection & battleplan drawing state
  let rmbDown = false;
  let rmbStart = null;
  let rmbCur = null;
  let rmbDragging = false;
  let drawLineMode = false;
  let drawingLine = false;
  let draftLineWorld = [];
  let shiftHeld = false;

  // Zero-thrash DOM sync
  let lastHudRender = 0;
  let lastSideRender = 0;
  const hudParts = new Map();
  let lastSideHtml = '';
  let renderedEventKey = null;
  let submittedEventKey = null;
  let countdownTimer = null;
  let renderFrame = null;
  const inviteCode = G.SupabaseNet?.getUrlRoomCode();
  let lastVictorySig = null;
  let uiPointerDown = false;

  const hudEl = $('#warHud');
  const alertEl = $('#warHoverTip');
  const feedBox = $('#warLensBar');
  const eventOverlay = $('#eventOverlay');
  const victoryOverlay = $('#victoryOverlay');
  const sideWar = $('#warSideContent');
  const warDialog = $('#dialog');
  const warDialogTitle = $('#dialogTitle');
  const warDialogBody = $('#dialogBody');
  const toastEl = $('#toast');
  const canvasEl = $('#canvas');
  const entryEl = $('#gameEntry');
  const marchStatusEl = $('#marchStatus');

  [hudEl, sideWar].forEach(el => {
    if (el) el.addEventListener('pointerdown', () => { uiPointerDown = true; });
  });
  window.addEventListener('pointerup', () => { uiPointerDown = false; });
  window.addEventListener('pointercancel', () => { uiPointerDown = false; });
  window.addEventListener('keydown', e => { if (e.key === 'Shift') shiftHeld = true; });
  window.addEventListener('keyup', e => { if (e.key === 'Shift') shiftHeld = false; });

  let toastTimer = null;
  function notify(msg) {
    if (!toastEl || !msg) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
  }

  function playerSide() {
    const r = E.getRole();
    if (r === 'observer') return null;
    if (r === 'pvp') {
      const ps = E.getPvpSide();
      return ps === 'UN' ? null : ps;
    }
    return r;
  }

  function renderEntry() {
    const saved = G.SupabaseNet?.getSavedRoom();
    const invited = Boolean(inviteCode && onlineJoinCode);
    entryEl.innerHTML = `
      <div>
        <h2 id="gameEntryTitle">Выберите режим</h2>
        ${invited ? '<p>Вас пригласили в онлайн-комнату <strong>' + escapeHtml(inviteCode) + '</strong>.</p>' : ''}
      </div>
      <div class="entryActions">
        ${localSession ? '<button class="warBtn primary" id="continueLocal">Продолжить партию</button>' : ''}
        <button type="button" class="warBtn ${invited || localSession ? '' : 'primary'}" id="entrySolo">${icon('play')} ${localSession ? 'Новая партия' : 'Одиночная игра'}</button>
        <button type="button" class="warBtn ${invited ? 'primary' : ''}" id="entryOnline">${invited ? 'Войти в ' + escapeHtml(inviteCode) : 'Онлайн 1×1'}</button>
        ${saved ? '<button type="button" class="warBtn" id="entryResume">Вернуться в комнату ' + escapeHtml(saved.roomCode) + ' · ' + (saved.side === 'A' ? 'Запад' : 'Восток') + '</button>' : ''}
      </div>
      <button type="button" class="entryBrowse" id="entryBrowse">Осмотреть карту</button>`;
    if (localSession) $('#continueLocal').onclick = () => { showGame(); E.setSpeed(localSpeed); };
    $('#entrySolo').onclick = openGameSetup;
    $('#entryOnline').onclick = () => enterOnline();
    if (saved) $('#entryResume').onclick = () => enterOnline(true);
    $('#entryBrowse').onclick = () => {
      entryEl.hidden = true;
      $('#modeToggle').hidden = false;
      $('#map').focus({ preventScroll: true });
    };
  }

  function showGame() {
    gameEntered = true;
    entryEl.hidden = true;
    document.body.classList.remove('map-entry');
    $('#modeToggle').hidden = Boolean(G.SupabaseNet?.getSession());
    AtlasMap.redrawOverlay();
    renderDom(true);
  }

  function showEntry() {
    if (gameEntered && localSession) localSpeed = E.getSpeed();
    multiSelect = false;
    gameEntered = false;
    resetMarchStatus();
    armedAction = null;
    drawLineMode = drawingLine = false;
    draftLineWorld = [];
    document.body.classList.remove('draw-line-mode');
    document.body.classList.add('map-entry');
    $('#modeToggle').hidden = true;
    E.setSpeed(0);
    entryEl.hidden = false;
    renderEntry();
    AtlasMap.redrawOverlay();
    (entryEl.querySelector('.primary') || $('#entrySolo')).focus({ preventScroll: true });
  }

  function openGameSetup() {
    if (G.SupabaseNet?.getSession()) { openOnlineModal(); return; }
    warDialogTitle.textContent = 'Новая игра';
    warDialogBody.className = 'scenModal gameSetup';
    const scenarios = G.SCENARIOS;
    const current = E.getState();
    warDialogBody.innerHTML = `
      <form id="gameSetupForm" class="gameSetupForm">
        <label class="onlineField"><span>Режим</span><select id="setupRole">
          <option value="A">За Запад против ИИ</option>
          <option value="B">За Восток против ИИ</option>
          <option value="pvp">Двое за одним экраном</option>
          <option value="observer">Наблюдатель</option>
        </select></label>
        <label class="onlineField"><span>Сценарий</span><select id="setupScenario">
          ${scenarios.map(sc => '<option value="' + escapeHtml(sc.id) + '">' + escapeHtml(sc.title) + '</option>').join('')}
        </select></label>
        <div class="onlineScenarioPreview" id="setupPreview" aria-live="polite"></div>
        <button type="submit" class="warBtn primary">Начать игру</button>
      </form>`;
    const scenario = $('#setupScenario');
    scenario.value = setupScenario || current?.scenarioId || scenarios[0].id;
    $('#setupRole').value = setupRole || E.getRole();
    $('#setupRole').onchange = e => { setupRole = e.target.value; };
    const update = () => {
      const selected = G.getScenario(scenario.value);
      $('#setupPreview').innerHTML = '<strong>' + escapeHtml(selected.title) + '</strong><span>' +
        escapeHtml(selected.tag + ' · ' + selected.difficulty) + '</span><p>' + escapeHtml(selected.desc) + '</p>';
    };
    scenario.onchange = () => { setupScenario = scenario.value; update(); };
    update();
    $('#gameSetupForm').onsubmit = event => {
      event.preventDefault();
      const role = $('#setupRole').value;
      dirTargetId = '';
      localSession = true;
      multiSelect = false;
      resetMarchStatus();
      selectedDivIds.clear();
      selectedCityId = selectedCorridorKey = null;
      currentTab = 'army';
      E.setSpeed(0);
      E.setRole(role);
      if (role === 'pvp') E.setPvpSide('A');
      E.initScenario(scenario.value);
      warDialog.close();
      showGame();
      if (role !== 'pvp') E.setSpeed(1);
    };
    if (!warDialog.open) warDialog.showModal();
  }

  let messageTimer;
  function setMarchStatus(message, state) {
    clearTimeout(messageTimer);
    if (state === 'done' || state === 'error') messageTimer = setTimeout(() => { marchStatusEl.hidden = true; }, 6500);
    marchStatusEl.textContent = message;
    marchStatusEl.dataset.state = state;
    marchStatusEl.hidden = !message;
  }

  function resetMarchStatus() {
    pendingMarch = null;
    setMarchStatus('', '');
  }

  async function submitMarch(ids, x, y, selectingTarget = false) {
    if (pendingMarch) { notify('Предыдущий марш ожидает ответа'); return; }
    if (selectedOpMode === 'massive') {
      const preview = E.previewMarch(ids, x, y, selectedOpMode);
      if (!preview.ok) { setMarchStatus(preview.msg, 'error'); return; }
      if (!window.confirm('Марш к «' + preview.target + '»\nПрорыв: ' + preview.paid +
        ' · Обычный марш: ' + preview.downgraded + ' · Останутся: ' + preview.skipped +
        '\nРасход: ' + preview.paid * 100 + ' ОР и ' + preview.paid * 8 + ' ПО. Отдать приказ?')) return;
    }
    const action = armedAction;
    const ticket = {};
    pendingMarch = ticket;
    if (E.getOnlineMode() === 'guest') setMarchStatus('Ожидаем ответа ведущего…', 'waiting');
    const result = await E.submitMarch(ids, x, y, selectedOpMode);
    if (ticket !== pendingMarch) return;
    resetMarchStatus();
    setMarchStatus(result.msg + (result.ok && !E.getSpeed() ? ' · Игра на паузе' : ''), result.ok ? 'done' : 'error');
    if (result.ok && selectingTarget && armedAction === action) armedAction = null;
    renderDom(true);
  }

  async function reportOrder(result) {
    if (result && typeof result.then === 'function') notify('Ожидаем ответа ведущего…');
    const outcome = await result;
    notify(outcome.msg);
    return outcome;
  }

  async function finishMapOrder(action, result) {
    if (action.busy) return;
    action.busy = true;
    try {
      const outcome = await reportOrder(result);
      if (armedAction !== action || !outcome.ok) return;
      if (outcome.division) {
        selectedDivIds.clear();
        selectedDivIds.add(outcome.division.id);
      }
      armedAction = null;
    } finally {
      action.busy = false;
      renderDom(true);
    }
  }

  function bootGame() {
    active = true;
    document.body.classList.add('war-mode');
    if (sideWar) sideWar.hidden = false;
    if (hudEl) hudEl.hidden = false;
    renderEntry();
    AtlasMap.setOverlay(drawWarOverlay);
    AtlasMap.setClickInterceptor(handleLeftClick);
    renderDom(true);
  }

  // ==================== RIGHT-CLICK BOX SELECTION & BATTLEPLAN ====================
  canvasEl.addEventListener('contextmenu', e => { if (active && gameEntered) e.preventDefault(); });

  canvasEl.addEventListener('pointerdown', e => {
    if (!active || !gameEntered) return;
    if (drawLineMode && e.button === 0 && lastWorldFn) {
      const r = canvasEl.getBoundingClientRect();
      const [wx, wy] = lastWorldFn(e.clientX - r.left, e.clientY - r.top);
      drawingLine = true;
      draftLineWorld = [{ x: wx, y: wy }];
      e.stopImmediatePropagation();
      e.preventDefault();
      AtlasMap.redrawOverlay();
      return;
    }
    if (e.button !== 2) return;
    const r = canvasEl.getBoundingClientRect();
    rmbDown = true;
    rmbDragging = false;
    rmbStart = [e.clientX - r.left, e.clientY - r.top];
    rmbCur = [...rmbStart];
    canvasEl.setPointerCapture(e.pointerId);
  });

  canvasEl.addEventListener('pointermove', e => {
    if (!active || !gameEntered) return;
    if (drawingLine && lastWorldFn) {
      const r = canvasEl.getBoundingClientRect();
      const [wx, wy] = lastWorldFn(e.clientX - r.left, e.clientY - r.top);
      const prev = draftLineWorld[draftLineWorld.length - 1];
      if (!prev || Math.hypot(wx - prev.x, wy - prev.y) > 14) {
        draftLineWorld.push({ x: wx, y: wy });
        AtlasMap.redrawOverlay();
      }
      e.stopImmediatePropagation();
      return;
    }
    if (!rmbDown) return;
    const r = canvasEl.getBoundingClientRect();
    rmbCur = [e.clientX - r.left, e.clientY - r.top];
    if (Math.hypot(rmbCur[0] - rmbStart[0], rmbCur[1] - rmbStart[1]) > 8) rmbDragging = true;
    AtlasMap.redrawOverlay();
  });

  canvasEl.addEventListener('pointerup', e => {
    if (!active || !gameEntered) return;
    if (drawingLine && e.button === 0) {
      drawingLine = false;
      drawLineMode = false;
      document.body.classList.remove('draw-line-mode');
      const mySide = playerSide();
      if (mySide && draftLineWorld.length >= 2) {
        reportOrder(E.executeDrawnLine(mySide, draftLineWorld, [...selectedDivIds], selectedOpMode));
      }
      draftLineWorld = [];
      renderDom(true);
      AtlasMap.redrawOverlay();
      e.stopImmediatePropagation();
      return;
    }
    if (!rmbDown || e.button !== 2) return;
    rmbDown = false;
    const st = E.getState();
    const mySide = playerSide();
    if (!st || !mySide) { rmbDragging = false; AtlasMap.redrawOverlay(); return; }

    if (rmbDragging && lastScreenFn) {
      const x0 = Math.min(rmbStart[0], rmbCur[0]);
      const y0 = Math.min(rmbStart[1], rmbCur[1]);
      const x1 = Math.max(rmbStart[0], rmbCur[0]);
      const y1 = Math.max(rmbStart[1], rmbCur[1]);
      selectedDivIds.clear();
      for (const d of st.divisions) {
        if (d.side !== mySide) continue;
        const [sx, sy] = renderDivisionAt(d, lastScreenFn);
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) selectedDivIds.add(d.id);
      }
      rmbDragging = false;
      if (selectedDivIds.size) {
        selectedCityId = null;
        currentTab = 'army';
        notify('Выделено дивизий: ' + selectedDivIds.size + ' (ПКМ — отправить в бой)');
      }
      renderDom(true);
      AtlasMap.redrawOverlay();
      return;
    }

    rmbDragging = false;
    if (lastWorldFn) {
      const mine = [...selectedDivIds].filter(id => st.divisions.some(d => d.id === id && d.side === mySide));
      if (!mine.length) {
        notify('Выделите дивизии рамкой (зажатая ПКМ) или кликом ЛКМ');
        return;
      }
      const r = canvasEl.getBoundingClientRect();
      const [wx, wy] = lastWorldFn(e.clientX - r.left, e.clientY - r.top);
      submitMarch(mine, wx, wy);
    }
  });

  function setPlaybackSpeed(speed) {
    if (!gameEntered || G.SupabaseNet?.isOnlineLobby() || E.getState()?.status === 'finished') return;
    if (G.SupabaseNet?.isOnlineMatch()) G.SupabaseNet.setOnlineSpeed(speed);
    else E.setSpeed(speed);
    renderDom(true);
  }

  window.addEventListener('keydown', e => {
    if (!active || document.querySelector('dialog[open]') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    const event = visibleEvent();
    if (!e.repeat && event && ['1', '2', '3'].includes(e.key)) {
      const idx = Number(e.key) - 1;
      if (event.event.choices[idx]) {
        e.preventDefault();
        submitEventChoice(event.key, idx);
        return;
      }
    }
    if (gameEntered && e.code === 'Space' && !e.repeat && !e.target.closest?.('button, a')) {
      e.preventDefault();
      setPlaybackSpeed(E.getSpeed() === 0 ? 1 : 0);
    } else if (e.key === 'Escape' && (armedAction || drawLineMode)) {
      armedAction = null;
      drawLineMode = false;
      drawingLine = false;
      draftLineWorld = [];
      document.body.classList.remove('draw-line-mode');
      renderDom(true);
      AtlasMap.redrawOverlay();
    }
  });

  // ==================== VECTOR VORONOI TERRITORIES & FRONTLINE ====================
  let lastOwnerSig = '';
  let cachedVoronoiCells = null;
  let cachedFrontEdges = [];
  let cachedLandClipPts = null;
  let cachedSeaClipPts = null;

  function buildVoronoiCellsOnce() {
    if (cachedVoronoiCells) return cachedVoronoiCells;
    const clipPolyHalfPlane = (poly, ax, ay, bx, by) => {
      const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
      const nx = bx - ax, ny = by - ay;
      const out = [];
      const inside = p => (p[0] - mx) * nx + (p[1] - my) * ny <= 0;
      for (let i = 0; i < poly.length; i++) {
        const cur = poly[i], nxt = poly[(i + 1) % poly.length];
        const cIn = inside(cur), nIn = inside(nxt);
        if (cIn) out.push(cur);
        if (cIn !== nIn) {
          const d1 = (cur[0] - mx) * nx + (cur[1] - my) * ny;
          const d2 = (nxt[0] - mx) * nx + (nxt[1] - my) * ny;
          const t = d1 / (d1 - d2);
          out.push([cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t]);
        }
      }
      return out;
    };

    cachedVoronoiCells = G.SECTORS.map(s => {
      let poly = [[560, 440], [2340, 440], [2340, 1740], [560, 1740]];
      for (const o of G.SECTORS) {
        if (o.id === s.id) continue;
        poly = clipPolyHalfPlane(poly, s.x, s.y, o.x, o.y);
        if (!poly.length) break;
      }
      return { id: s.id, poly };
    });

    if (window.Atlas && window.Atlas.region) {
      const r = window.Atlas.region;
      cachedLandClipPts = [];
      for (let i = 0; i < r.length; i += 2) cachedLandClipPts.push([r[i] / 100, r[i + 1] / 100]);
    }
    if (window.Atlas && window.Atlas.sea) {
      const s = window.Atlas.sea;
      cachedSeaClipPts = [];
      for (let i = 0; i < s.length; i += 2) cachedSeaClipPts.push([s[i] / 100, s[i + 1] / 100]);
    }
    return cachedVoronoiCells;
  }

  function effectiveCellOwner(st, cellId) {
    // When Tkuarchal is besieged, East controls the surrounding district — West holds ONLY the compact city-valley pocket!
    if (cellId === 'tkuarchal' && st.tkuarchalSiege && st.tkuarchalSiege.active) return 'B';
    return st.cities[cellId].owner;
  }

  function buildTkuarchalPocketPts() {
    // Authentic irregular mountain-valley blockade contour around Tkuarchal (Galidzga river valley & coal-mine heights)
    const tk = G.SECTOR_MAP.tkuarchal;
    const cx = tk.x, cy = tk.y;
    const offsets = [
      [-44, -18], [-32, -34], [-10, -38], [16, -34], [38, -22],
      [46, -2],   [40, 20],   [22, 34],   [-4, 38],  [-28, 30],
      [-44, 14],  [-48, -4]
    ];
    return offsets.map(([dx, dy]) => [cx + dx, cy + dy]);
  }
  const TKUARCHAL_POCKET_PTS = buildTkuarchalPocketPts();

  function updateFrontlineGeometry(st) {
    const siegeFlag = (st.tkuarchalSiege && st.tkuarchalSiege.active) ? '1' : '0';
    const sig = siegeFlag + '|' + G.SECTORS.map(m => st.cities[m.id].owner).join('');
    if (sig === lastOwnerSig && cachedVoronoiCells) return;
    lastOwnerSig = sig;
    const cells = buildVoronoiCellsOnce();
    cachedFrontEdges = [];
    const eps = 1.5;

    for (let i = 0; i < cells.length; i++) {
      if (effectiveCellOwner(st, cells[i].id) !== 'A') continue;
      const pA = cells[i].poly;
      for (let ea = 0; ea < pA.length; ea++) {
        const a1 = pA[ea], a2 = pA[(ea + 1) % pA.length];
        for (let j = 0; j < cells.length; j++) {
          if (effectiveCellOwner(st, cells[j].id) !== 'B') continue;
          const pB = cells[j].poly;
          let matched = false;
          for (let eb = 0; eb < pB.length; eb++) {
            const b1 = pB[eb], b2 = pB[(eb + 1) % pB.length];
            const dSame = Math.hypot(a1[0] - b1[0], a1[1] - b1[1]) < eps && Math.hypot(a2[0] - b2[0], a2[1] - b2[1]) < eps;
            const dRev  = Math.hypot(a1[0] - b2[0], a1[1] - b2[1]) < eps && Math.hypot(a2[0] - b1[0], a2[1] - b1[1]) < eps;
            if (dSame || dRev) {
              cachedFrontEdges.push([a1[0], a1[1], a2[0], a2[1]]);
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
      }
    }
  }

  function drawVectorTerritories(ctx, st, screen) {
    updateFrontlineGeometry(st);
    const cells = cachedVoronoiCells;
    if (!cells || !cachedLandClipPts) return;

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < cachedLandClipPts.length; i++) {
      const [sx, sy] = screen(cachedLandClipPts[i][0], cachedLandClipPts[i][1]);
      if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
    }
    ctx.closePath();
    if (cachedSeaClipPts && cachedSeaClipPts.length > 2) {
      for (let i = 0; i < cachedSeaClipPts.length; i++) {
        const [sx, sy] = screen(cachedSeaClipPts[i][0], cachedSeaClipPts[i][1]);
        if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
      }
      ctx.closePath();
      ctx.clip('evenodd');
    } else {
      ctx.clip();
    }

    const fillMap = {
      A: 'rgba(37, 99, 235, 0.13)',
      B: 'rgba(220, 38, 38, 0.13)',
      neutral: 'rgba(217, 119, 6, 0.10)'
    };
    for (const own of ['A', 'B', 'neutral']) {
      ctx.beginPath();
      let any = false;
      for (const cell of cells) {
        if (effectiveCellOwner(st, cell.id) !== own || cell.poly.length < 3) continue;
        any = true;
        for (let k = 0; k < cell.poly.length; k++) {
          const [sx, sy] = screen(cell.poly[k][0], cell.poly[k][1]);
          if (k) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
        }
        ctx.closePath();
      }
      if (any) { ctx.fillStyle = fillMap[own]; ctx.fill(); }
    }

    if (cachedFrontEdges.length) {
      const isDem = st.demarcationDaysLeft > 0;
      ctx.beginPath();
      for (const e of cachedFrontEdges) {
        const dx = e[2] - e[0], dy = e[3] - e[1];
        const len = Math.hypot(dx, dy);
        if (len < 2) continue;
        const nx = -dy / len, ny = dx / len;
        const steps = Math.max(4, Math.min(12, Math.round(len / 28)));
        const pts = [];
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          let wx = e[0] + dx * t, wy = e[1] + dy * t;
          if (s > 0 && s < steps) {
            const wave = Math.sin(wx * 0.055 + wy * 0.043) * 14 + Math.cos(wx * 0.091 - wy * 0.072) * 8;
            wx += nx * wave;
            wy += ny * wave;
          }
          pts.push(screen(wx, wy));
        }
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length - 1; k++) {
          ctx.quadraticCurveTo(pts[k][0], pts[k][1], (pts[k][0] + pts[k + 1][0]) * 0.5, (pts[k][1] + pts[k + 1][1]) * 0.5);
        }
        ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      }
      ctx.strokeStyle = 'rgba(10, 15, 13, 0.76)';
      ctx.lineWidth = isDem ? 5.0 : 3.8;
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.strokeStyle = isDem ? '#38bdf8' : 'rgba(251, 191, 36, 0.90)';
      ctx.lineWidth = isDem ? 2.5 : 2.0;
      ctx.setLineDash(isDem ? [7, 5] : [6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // ==================== TACTICAL CANVAS OVERLAY ====================
  function drawWarOverlay(ctx, env) {
    if (!gameEntered) return;
    const st = E.getState();
    if (!active || !st) return;
    const { screen, world, view, theme, time } = env;
    lastMapDrawTime = time;
    lastScreenFn = screen;
    lastWorldFn = world;
    const isDark = theme === 'dark';
    const z = view.z;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    drawVectorTerritories(ctx, st, screen);

    // Tactical Real-OSM Road, Railway, Sea & Bridge Network + Blockades/Checkpoints/Minefields
    const corridors = E.getCorridors ? E.getCorridors() : {};
    const corrStates = st.corridors || {};
    const mySideCor = playerSide();
    const roleCor = E.getRole();

    // Sea corridors (shown when a Marine division is selected or infra layer zoomed)
    const marineSelected = [...selectedDivIds].some(id => {
      const d = st.divisions.find(x => x.id === id);
      return d && d.type === 'marines';
    });
    if (tacLayers.infra && (marineSelected || z >= 0.72) && G.SEA_LINKS) {
      ctx.save();
      ctx.strokeStyle = marineSelected ? 'rgba(56, 189, 248, 0.55)' : 'rgba(56, 189, 248, 0.16)';
      ctx.lineWidth = marineSelected ? 2.0 : 1.1;
      ctx.setLineDash([5, 6]);
      for (const [aId, bId] of G.SEA_LINKS) {
        const a = G.SECTOR_MAP[aId], b = G.SECTOR_MAP[bId];
        if (!a || !b) continue;
        const [x1, y1] = screen(a.x, a.y);
        const [x2, y2] = screen(b.x, b.y);
        const len = Math.hypot(x2 - x1, y2 - y1);
        const cx = (x1 + x2) * 0.5 - Math.min(26, len * 0.12);
        const cy = (y1 + y2) * 0.5 + Math.min(30, len * 0.14);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cx, cy, x2, y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    for (const c of Object.values(corridors)) {
      const cs = corrStates[c.key] || {};
      const isSelC = selectedCorridorKey === c.key;
      const isBlocked = !!cs.blocked;

      if (tacLayers.routes || isSelC || isBlocked) {
        const pts = c.pts.map(p => screen(p.x, p.y));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);

        if (isSelC) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 3.4;
          ctx.setLineDash([]);
        } else if (isBlocked) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.78)';
          ctx.lineWidth = 2.6;
          ctx.setLineDash([4, 4]);
        } else if (c.kind === 'highway') {
          ctx.strokeStyle = isDark ? 'rgba(226, 232, 228, 0.28)' : 'rgba(24, 44, 34, 0.26)';
          ctx.lineWidth = 2.1;
          ctx.setLineDash([]);
        } else if (c.kind === 'road') {
          ctx.strokeStyle = isDark ? 'rgba(180, 198, 188, 0.20)' : 'rgba(38, 60, 48, 0.20)';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([5, 4]);
        } else {
          ctx.strokeStyle = isDark ? 'rgba(217, 178, 120, 0.30)' : 'rgba(138, 86, 52, 0.30)';
          ctx.lineWidth = 1.3;
          ctx.setLineDash([3, 4]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Black Sea Railway tactical overlay (real OSM rail polylines!)
      if (tacLayers.rail && c.hasRail && c.railPts) {
        const rPts = c.railPts.map(p => screen(p.x, p.y));
        ctx.beginPath();
        ctx.moveTo(rPts[0][0], rPts[0][1]);
        for (let k = 1; k < rPts.length; k++) ctx.lineTo(rPts[k][0], rPts[k][1]);
        const railBad = isBlocked || cs.railDamaged;
        ctx.strokeStyle = railBad ? 'rgba(239, 68, 68, 0.72)' : (isDark ? 'rgba(56, 189, 248, 0.42)' : 'rgba(2, 132, 199, 0.46)');
        ctx.lineWidth = isSelC ? 2.8 : 1.7;
        ctx.stroke();
        ctx.strokeStyle = isDark ? '#0e1514' : '#f4f3ec';
        ctx.lineWidth = 1.1;
        ctx.setLineDash([2.5, 4.5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw midpoint interactive tactical node (Blown Bridge / Blockade, Checkpoints, Minefields, Bridges)
      const [mx, my] = screen(c.mid.x, c.mid.y);
      const hasCp = !!(cs.checkpoint && cs.checkpoint.hp > 0);
      const showMines = !!(cs.mined && cs.mined.charges > 0 && (roleCor === 'observer' || !mySideCor || cs.mined.side === mySideCor));

      if (isBlocked) {
        ctx.fillStyle = 'rgba(24, 10, 12, 0.96)';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(mx - 14, my - 8, 28, 16, 3);
        else ctx.rect(mx - 14, my - 8, 28, 16);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fca5a5';
        ctx.font = '800 7.5px Inter, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c.bridge ? 'МОСТ✕' : 'ЗАВАЛ', mx, my + 0.5);
        // Repair progress bar if engineers are working on it
        if (cs.blocked.hp < (cs.blocked.maxHp || 100)) {
          const repR = 1 - Math.max(0, cs.blocked.hp / (cs.blocked.maxHp || 100));
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillRect(mx - 12, my + 9.5, 24, 2.5);
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(mx - 12, my + 9.5, Math.round(24 * repR), 2.5);
        }
      } else if (hasCp) {
        const cpCol = cs.checkpoint.side === 'A' ? '#3b82f6' : '#ef4444';
        ctx.fillStyle = 'rgba(12, 17, 16, 0.94)';
        ctx.strokeStyle = cpCol;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(mx - 10, my - 7, 20, 14, 3);
        else ctx.rect(mx - 10, my - 7, 20, 14);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 7.5px Inter, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('БП', mx, my + 0.5);
        const hpR = Math.max(0, cs.checkpoint.hp / (cs.checkpoint.maxHp || 100));
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(mx - 9, my + 8.5, 18, 2.2);
        ctx.fillStyle = cpCol;
        ctx.fillRect(mx - 9, my + 8.5, Math.round(18 * hpR), 2.2);
      } else if (showMines) {
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.92)';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.2;
        ctx.fillRect(-5, -5, 10, 10);
        ctx.strokeRect(-5, -5, 10, 10);
        ctx.restore();
        ctx.fillStyle = '#111';
        ctx.font = '900 8px Inter, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('М', mx, my + 0.5);
      } else if (isSelC || (tacLayers.routes && c.bridge && z >= 0.72)) {
        ctx.fillStyle = isSelC ? '#fbbf24' : 'rgba(14, 20, 18, 0.88)';
        ctx.strokeStyle = isSelC ? '#111' : (isDark ? 'rgba(180,200,190,0.45)' : 'rgba(30,50,40,0.45)');
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(mx - 6, my - 5, 12, 10, 2);
        else ctx.rect(mx - 6, my - 5, 12, 10);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = isSelC ? '#111' : '#cbd5e1';
        ctx.font = '800 7px Inter, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c.bridge ? '═' : '•', mx, my + 0.5);
      } else if (tacLayers.routes && z >= 0.95) {
        ctx.beginPath();
        ctx.arc(mx, my, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(20,40,30,0.25)';
        ctx.fill();
      }
    }

    // Urban battle rings
    for (const m of G.SECTORS) {
      const c = st.cities[m.id];
      if (!c.urbanBattle) continue;
      const [x, y] = screen(m.x, m.y);
      const rad = Math.max(26, (m.vp >= 5 ? 64 : 42) * z);
      const grad = ctx.createRadialGradient(x, y, 2, x, y, rad);
      grad.addColorStop(0, 'rgba(245, 158, 11, 0.30)');
      grad.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }

    // Historically Accurate Tkuarchal City Blockade Pocket Contour (1992-93 encirclement — NOT the whole district!)
    if (st.tkuarchalSiege && st.tkuarchalSiege.active) {
      const tk = G.SECTOR_MAP.tkuarchal;
      const sg = st.tkuarchalSiege;
      const [tx, ty] = screen(tk.x, tk.y);
      const sPts = TKUARCHAL_POCKET_PTS.map(([wx, wy]) => screen(wx, wy));

      ctx.save();
      // Smooth closed organic pocket path
      ctx.beginPath();
      const firstMidX = (sPts[sPts.length - 1][0] + sPts[0][0]) * 0.5;
      const firstMidY = (sPts[sPts.length - 1][1] + sPts[0][1]) * 0.5;
      ctx.moveTo(firstMidX, firstMidY);
      for (let i = 0; i < sPts.length; i++) {
        const nxt = sPts[(i + 1) % sPts.length];
        ctx.quadraticCurveTo(sPts[i][0], sPts[i][1], (sPts[i][0] + nxt[0]) * 0.5, (sPts[i][1] + nxt[1]) * 0.5);
      }
      ctx.closePath();

      // Blue (West) city pocket fill carved inside the Red (East) surrounding district
      ctx.fillStyle = 'rgba(37, 99, 235, 0.24)';
      ctx.fill();

      // Crisp dark casing + red/amber encirclement line
      ctx.strokeStyle = 'rgba(10, 14, 13, 0.85)';
      ctx.lineWidth = 4.4;
      ctx.stroke();

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Subtle inward siege pressure ticks around the perimeter
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.78)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < sPts.length; i += 2) {
        const [px0, py0] = sPts[i];
        const ang = Math.atan2(ty - py0, tx - px0);
        ctx.beginPath();
        ctx.moveTo(px0 - Math.cos(ang) * 5, py0 - Math.sin(ang) * 5);
        ctx.lineTo(px0 + Math.cos(ang) * 3, py0 + Math.sin(ang) * 3);
        ctx.stroke();
      }

      // Compact telemetry pill above the pocket
      const topY = Math.min(...sPts.map(p => p[1]));
      const pillTxt = 'БЛОКАДА ТКУАРЧАЛА · ЗАП ' + Math.round(sg.supplies) + '% · ТОНН ' + Math.round(sg.fortIntegrity) + '%';
      ctx.font = '700 9.5px Inter, Arial, sans-serif';
      const tw = ctx.measureText(pillTxt).width + 14;
      const bx = Math.round(tx - tw / 2);
      const by = Math.round(topY - 22);
      ctx.fillStyle = 'rgba(12, 17, 16, 0.94)';
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, tw, 18, 4);
      else ctx.rect(bx, by, tw, 18);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pillTxt, tx, by + 9);
      ctx.restore();
    }

    // Demarcation checkpoints on active front pairs
    if (st.demarcationDaysLeft > 0) {
      const drawn = new Set();
      for (const m of G.SECTORS) {
        if (st.cities[m.id].owner !== 'A') continue;
        for (const nbId of m.adj) {
          const nb = G.SECTOR_MAP[nbId];
          if (!nb || st.cities[nbId].owner !== 'B') continue;
          const key = m.id + '_' + nbId;
          if (drawn.has(key)) continue;
          drawn.add(key);
          const [x1, y1] = screen(m.x, m.y);
          const [x2, y2] = screen(nb.x, nb.y);
          const mx = (x1 + x2) * 0.5, my = (y1 + y2) * 0.5;
          ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2);
          ctx.fillStyle = st.demarcationForce === 'RU' ? '#1d4ed8' : '#0284c7'; ctx.fill();
          ctx.lineWidth = 1.4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
          ctx.font = '800 7.5px Inter, Arial, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText('МС', mx, my + 0.5);
        }
      }
    }

    // AA Radar Domes & Selected Artillery Support Radius
    for (const d of st.divisions) {
      if (d.type === 'aa') {
        const [x, y] = renderDivisionAt(d, screen, time);
        ctx.beginPath();
        ctx.arc(x, y, G.UNIT_TEMPLATES.aa.radarRadius * z, 0, Math.PI * 2);
        ctx.strokeStyle = d.side === 'A' ? 'rgba(56, 189, 248, 0.24)' : 'rgba(248, 113, 113, 0.22)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (d.type === 'artillery' && selectedDivIds.has(d.id)) {
        const [x, y] = renderDivisionAt(d, screen, time);
        ctx.beginPath();
        ctx.arc(x, y, G.UNIT_TEMPLATES.artillery.supportRadius * z, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.06)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1.3;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Strategic Cities & Capture Rings
    for (const m of G.SECTORS) {
      const c = st.cities[m.id];
      const [rx, ry] = screen(m.x, m.y);
      const x = Math.round(rx), y = Math.round(ry);
      if (x < -25 || y < -25 || x > env.width + 25 || y > env.height + 25) continue;

      const fill = c.owner === 'A' ? '#2563eb' : c.owner === 'B' ? '#dc2626' : '#d97706';
      const sz = m.vp >= 6 ? 7 : 5;

      if (c.urbanBattle) {
        const ringR = sz + 7;
        const fracA = c.controlA / 100;
        ctx.lineWidth = 3.0;
        ctx.beginPath(); ctx.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fracA);
        ctx.strokeStyle = '#3b82f6'; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, ringR, -Math.PI / 2 + Math.PI * 2 * fracA, Math.PI * 1.5);
        ctx.strokeStyle = '#ef4444'; ctx.stroke();
      }

      if (armedAction?.type === 'recruit' && canRecruitAt(st, playerSide(), m.id, armedAction.unit)) {
        ctx.beginPath(); ctx.arc(x, y, sz + 11, 0, Math.PI * 2);
        ctx.strokeStyle = '#8be9cc'; ctx.lineWidth = 3; ctx.stroke();
      }
      if (selectedCityId === m.id) {
        ctx.beginPath(); ctx.arc(x, y, sz + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.8; ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz); ctx.lineTo(x - sz, y); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = isDark ? '#0e1412' : '#ffffff'; ctx.stroke();

      if (m.vp >= 4 || z >= 0.85 || c.urbanBattle || selectedCityId === m.id) {
        const title = c.urbanBattle ? (m.name + ' · ' + Math.round(c.controlA) + '%') : m.name;
        ctx.font = (m.vp >= 6 || c.urbanBattle ? '700 11px' : '600 9.5px') + ' Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = isDark ? 'rgba(11,16,14,0.92)' : 'rgba(248,248,238,0.95)';
        ctx.strokeText(title, x, y + sz + 13);
        ctx.fillStyle = c.urbanBattle ? '#fbbf24' : (isDark ? '#dbe7e0' : '#182b22');
        ctx.fillText(title, x, y + sz + 13);
      }

      // Infrastructure tactical badges (Airfields ✈, Helipads H, Ports ⚓, Supply Cut !)
      if (tacLayers.infra) {
        const inf = c.infra || {};
        const badges = [];
        if (m.airfield) {
          const ok = (inf.airfieldHp ?? 100) > 35;
          badges.push({ txt: ok ? '✈' : '✈✕', col: ok ? '#38bdf8' : '#ef4444' });
        } else if (m.helipad && (z >= 0.65 || selectedCityId === m.id)) {
          const ok = (inf.helipadHp ?? 100) > 35;
          badges.push({ txt: ok ? 'H' : 'H✕', col: ok ? '#34d399' : '#ef4444' });
        }
        if (m.port && (z >= 0.65 || selectedCityId === m.id)) {
          const ok = (inf.portHp ?? 100) > 35;
          badges.push({ txt: '⚓', col: ok ? '#60a5fa' : '#ef4444' });
        }
        if (tacLayers.supply && c.owner !== 'neutral' && c.supplied === false) {
          badges.push({ txt: '!', col: '#f59e0b' });
        }
        if (badges.length) {
          const bw = 13, gap = 2;
          let bx = x + sz + 5;
          const by = y - 6;
          for (const bg of badges) {
            ctx.fillStyle = 'rgba(11, 16, 15, 0.90)';
            ctx.strokeStyle = bg.col;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(bx, by, bw, 12, 2.5);
            else ctx.rect(bx, by, bw, 12);
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = bg.col;
            ctx.font = '800 7.5px Inter, Arial, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(bg.txt, bx + bw / 2, by + 6.3);
            bx += bw + gap;
          }
        }
      }
    }

    // Order Vectors
    const roleNow = E.getRole();
    const mySideNow = playerSide();
    for (const d of st.divisions) {
      if (!d.order || (d.order.type !== 'march' && d.order.type !== 'retreat')) continue;
      if (roleNow === 'pvp' && E.getSpeed() === 0 && mySideNow && d.side !== mySideNow) continue;
      const [fx, fy] = renderDivisionAt(d, screen, time);
      const [tx, ty] = screen(d.order.tx, d.order.ty);
      if (Math.hypot(tx - fx, ty - fy) < 10) continue;

      const isSel = selectedDivIds.has(d.id);
      const isMine = mySideNow && d.side === mySideNow;
      const isMassive = d.order.opMode === 'massive';
      const col = d.order.type === 'retreat' ? '#10b981' : (d.side === 'A' ? '#3b82f6' : '#ef4444');
      const nextWp = (d.order.path && d.order.path.length) ? screen(d.order.path[0].x, d.order.path[0].y) : [tx, ty];
      const nextAng = Math.atan2(nextWp[1] - fy, nextWp[0] - fx);
      const nextLen = Math.hypot(nextWp[0] - fx, nextWp[1] - fy);

      if (isSel) {
        const pts = [[fx, fy]];
        if (d.order.path && d.order.path.length) {
          for (const wp of d.order.path) pts.push(screen(wp.x, wp.y));
        } else {
          pts.push([tx, ty]);
        }
        const prev = pts[pts.length - 2], last = pts[pts.length - 1];
        const endAng = Math.atan2(last[1] - prev[1], last[0] - prev[0]);

        ctx.strokeStyle = isDark ? 'rgba(9,14,12,0.85)' : 'rgba(255,255,255,0.88)';
        ctx.lineWidth = isMassive ? 4.8 : 3.6;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.stroke();

        ctx.strokeStyle = isMassive ? '#f59e0b' : col;
        ctx.lineWidth = isMassive ? 2.6 : 2.0;
        ctx.setLineDash(d.order.type === 'retreat' ? [6, 4] : []);
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = isMassive ? '#f59e0b' : col;
        ctx.beginPath();
        ctx.moveTo(last[0], last[1]);
        ctx.lineTo(last[0] - 9 * Math.cos(endAng - 0.38), last[1] - 9 * Math.sin(endAng - 0.38));
        ctx.lineTo(last[0] - 9 * Math.cos(endAng + 0.38), last[1] - 9 * Math.sin(endAng + 0.38));
        ctx.closePath(); ctx.fill();
      } else {
        const stubLen = (isMine || roleNow === 'observer') ? Math.min(28, nextLen * 0.45) : Math.min(18, nextLen * 0.35);
        const sx = fx + Math.cos(nextAng) * 18, sy = fy + Math.sin(nextAng) * 18;
        const ex = sx + Math.cos(nextAng) * stubLen, ey = sy + Math.sin(nextAng) * stubLen;
        ctx.save();
        ctx.globalAlpha = isMine ? 0.72 : (roleNow === 'observer' ? 0.60 : 0.45);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.8;
        ctx.setLineDash(d.order.type === 'retreat' ? [3, 3] : []);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 6.5 * Math.cos(nextAng - 0.45), ey - 6.5 * Math.sin(nextAng - 0.45));
        ctx.lineTo(ex - 6.5 * Math.cos(nextAng + 0.45), ey - 6.5 * Math.sin(nextAng + 0.45));
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    // Active Flying Strikes
    for (const s of st.activeStrikes) {
      const [sx, sy] = screen(s.sx, s.sy);
      const [tx, ty] = screen(s.tx, s.ty);
      const cx = (sx + tx) * 0.5, cy = Math.min(sy, ty) - 70;
      ctx.strokeStyle = s.color || '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, tx, ty); ctx.stroke();
      ctx.setLineDash([]);
      const p = guestMatchId ? guestMotion.strike(s, time) : s.progress;
      const px = (1 - p) * (1 - p) * sx + 2 * (1 - p) * p * cx + p * p * tx;
      const py = (1 - p) * (1 - p) * sy + 2 * (1 - p) * p * cy + p * p * ty;
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.beginPath(); ctx.arc(tx, ty, 6 + p * 22, 0, Math.PI * 2);
      ctx.strokeStyle = s.color || '#f59e0b'; ctx.lineWidth = 1.6; ctx.stroke();
    }

    // Architectural NATO Division Counters
    const cw = 40, ch = 25;
    for (const d of st.divisions) {
      const [rx, ry] = renderDivisionAt(d, screen, time);
      const x = guestMatchId ? rx : Math.round(rx), y = guestMatchId ? ry : Math.round(ry);
      if (x < -44 || y < -44 || x > env.width + 44 || y > env.height + 44) continue;

      const isSel = selectedDivIds.has(d.id);
      const isPk = d.side === 'N' || d.flag === 'UN' || d.flag === 'RU_PK';
      const accentCol = isPk ? '#38bdf8' : (d.side === 'A' ? '#3b82f6' : '#ef4444');
      const bgCol = isPk ? '#0c2736' : (d.side === 'A' ? '#132138' : '#331519');

      if (isSel) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - cw / 2 - 2.5, y - ch / 2 - 2.5, cw + 5, ch + 5, 5);
        else ctx.rect(x - cw / 2 - 2.5, y - ch / 2 - 2.5, cw + 5, ch + 5);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - cw / 2, y - ch / 2, cw, ch, 4);
      else ctx.rect(x - cw / 2, y - ch / 2, cw, ch);
      ctx.fillStyle = bgCol; ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = d.inCombat ? '#f59e0b' : (isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,20,0.45)');
      ctx.stroke();

      if (d.flag === 'UN') {
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(x - cw / 2 + 1, y - ch / 2 + 1, 5, ch - 2);
      } else if (d.flag === 'RU' || d.flag === 'RU_PK') {
        const fx0 = x - cw / 2 + 1, fy0 = y - ch / 2 + 1, fh = (ch - 2) / 3;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(fx0, fy0, 5, fh);
        ctx.fillStyle = '#2563eb'; ctx.fillRect(fx0, fy0 + fh, 5, fh);
        ctx.fillStyle = '#dc2626'; ctx.fillRect(fx0, fy0 + fh * 2, 5, fh);
      } else if (d.flag === 'TR') {
        ctx.fillStyle = '#dc2626'; ctx.fillRect(x - cw / 2 + 1, y - ch / 2 + 1, 5, ch - 2);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - cw / 2 + 3.5, y, 1.5, 0, Math.PI * 2); ctx.fill();
      } else if (d.flag === 'GE') {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - cw / 2 + 1, y - ch / 2 + 1, 5, ch - 2);
        ctx.fillStyle = '#dc2626'; ctx.fillRect(x - cw / 2 + 2.8, y - ch / 2 + 1, 1.4, ch - 2);
        ctx.fillRect(x - cw / 2 + 1, y - 0.7, 5, 1.4);
      } else {
        ctx.fillStyle = accentCol;
        ctx.fillRect(x - cw / 2 + 1, y - ch / 2 + 1, 4, ch - 2);
      }

      ctx.font = '800 9px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      const codeTxt = d.flag === 'UN' ? 'ООН' : d.flag === 'RU_PK' ? 'МС РФ' : (d.flag === 'RU' ? 'РФ' : d.flag === 'TR' ? 'ТР' : d.flag === 'GE' ? 'ГР' : G.UNIT_TEMPLATES[d.type].short);
      ctx.fillText(codeTxt, x + 2, y - 4);

      if (d.supplied === false) {
        ctx.beginPath(); ctx.arc(x + cw / 2 - 4, y - ch / 2 + 4, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b'; ctx.fill();
      } else if (d.jammedDays > 0) {
        ctx.beginPath(); ctx.arc(x + cw / 2 - 4, y - ch / 2 + 4, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#c084fc'; ctx.fill();
      } else if (d.fort >= 0.28) {
        ctx.beginPath(); ctx.arc(x + cw / 2 - 4, y - ch / 2 + 4, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#34d399'; ctx.fill();
      }

      if (d.onRail || d.onSea) {
        const tag = d.onRail ? 'ЖД' : 'МП';
        ctx.fillStyle = d.onRail ? '#0284c7' : '#2563eb';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - cw / 2, y - ch / 2 - 10, 18, 9, 2);
        else ctx.rect(x - cw / 2, y - ch / 2 - 10, 18, 9);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 6.5px Inter, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(tag, x - cw / 2 + 9, y - ch / 2 - 5.2);
      }

      const barX = x - cw / 2 + 7, barW = cw - 10;
      const hpR = Math.max(0, d.hp / d.maxHp);
      const orgR = Math.max(0, d.org / 100);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(barX, y + ch / 2 - 7.5, barW, 2.5);
      ctx.fillStyle = hpR > 0.55 ? '#22c55e' : hpR > 0.28 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(barX, y + ch / 2 - 7.5, Math.round(barW * hpR), 2.5);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(barX, y + ch / 2 - 3.8, barW, 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(barX, y + ch / 2 - 3.8, Math.round(barW * orgR), 2);
    }

    // Tactical Clash Badges
    for (const bt of st.battles) {
      const [bx, by] = screen(bt.x, bt.y);
      const col = bt.pctA >= 55 ? '#22c55e' : bt.pctA <= 45 ? '#ef4444' : '#f59e0b';
      ctx.beginPath(); ctx.arc(bx, by, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(13, 19, 17, 0.94)'; ctx.fill();
      ctx.lineWidth = 2.4; ctx.strokeStyle = col; ctx.stroke();
      ctx.font = '800 9px Inter, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(bt.pctA + '%', bx, by + 0.5);
    }

    // Floating Popups
    const now = performance.now();
    for (const p of st.popups) {
      const age = now - p.born;
      if (age > 3200) continue;
      const [px, py] = screen(p.x, p.y);
      ctx.globalAlpha = Math.max(0, 1 - age / 3200);
      ctx.font = '800 10.5px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(10,14,12,0.95)';
      ctx.strokeText(p.text, px, py - 18 - age / 110);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, px, py - 18 - age / 110);
      ctx.globalAlpha = 1;
    }

    // Drawn Battleplan Lines
    const drawBattleplan = (pts, col, isDraft) => {
      if (!pts || pts.length < 2) return;
      const sPts = pts.map(p => screen(p.x, p.y));
      ctx.save();
      ctx.strokeStyle = 'rgba(10, 15, 13, 0.72)';
      ctx.lineWidth = isDraft ? 7 : 6;
      ctx.beginPath(); ctx.moveTo(sPts[0][0], sPts[0][1]);
      for (let i = 1; i < sPts.length; i++) ctx.lineTo(sPts[i][0], sPts[i][1]);
      ctx.stroke();

      ctx.strokeStyle = col;
      ctx.lineWidth = isDraft ? 3.4 : 2.8;
      ctx.setLineDash(isDraft ? [8, 5] : [10, 5]);
      ctx.beginPath(); ctx.moveTo(sPts[0][0], sPts[0][1]);
      for (let i = 1; i < sPts.length; i++) ctx.lineTo(sPts[i][0], sPts[i][1]);
      ctx.stroke();
      ctx.setLineDash([]);

      const prev = sPts[sPts.length - 2], last = sPts[sPts.length - 1];
      const ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(last[0], last[1]);
      ctx.lineTo(last[0] - 13 * Math.cos(ang - 0.42), last[1] - 13 * Math.sin(ang - 0.42));
      ctx.lineTo(last[0] - 13 * Math.cos(ang + 0.42), last[1] - 13 * Math.sin(ang + 0.42));
      ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    if (st.drawnPlans) {
      if (st.drawnPlans.A && (roleNow === 'A' || roleNow === 'observer' || (roleNow === 'pvp' && E.getPvpSide() === 'A'))) {
        drawBattleplan(st.drawnPlans.A.points, '#60a5fa', false);
      }
      if (st.drawnPlans.B && (roleNow === 'B' || roleNow === 'observer' || (roleNow === 'pvp' && E.getPvpSide() === 'B'))) {
        drawBattleplan(st.drawnPlans.B.points, '#f87171', false);
      }
    }
    if (drawingLine && draftLineWorld.length >= 2) drawBattleplan(draftLineWorld, '#fbbf24', true);

    // Selection Box Rectangle
    if (rmbDragging && rmbStart && rmbCur) {
      const x = Math.min(rmbStart[0], rmbCur[0]);
      const y = Math.min(rmbStart[1], rmbCur[1]);
      const w = Math.abs(rmbCur[0] - rmbStart[0]);
      const h = Math.abs(rmbCur[1] - rmbStart[1]);
      ctx.fillStyle = 'rgba(77, 154, 115, 0.14)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#5db086';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
    ctx.restore();
    if (guestMatchId && guestMotion.needsFrame(time)) AtlasMap.redrawOverlay();
  }

  function canRecruitAt(st, side, id, type) {
    const fac = st.factions[side], unit = G.UNIT_TEMPLATES[type];
    return st.cities[id].owner === side && !(id === 'tkuarchal' && st.tkuarchalSiege?.active) &&
      fac && unit && fac.manpower >= unit.costMp && fac.weapons >= unit.costWp;
  }

  function handleLeftClick(px, py, env) {
    const st = E.getState();
    if (!active || !gameEntered || !st) return false;
    const mySide = playerSide();
    const [wx, wy] = env.world(px, py);

    if (armedAction && mySide) {
      if (armedAction.busy) return true;
      if (armedAction.type === 'march') {
        const mine = [...selectedDivIds].filter(id => st.divisions.some(d => d.id === id && d.side === mySide));
        submitMarch(mine, wx, wy, true);
        return true;
      }
      if (armedAction.type === 'strike') {
        const result = E.launchStrike(mySide, armedAction.strikeId, wx, wy);
        finishMapOrder(armedAction, result);
        return true;
      }
      if (armedAction.type === 'recruit') {
        const near = E.nearestSectorMeta(wx, wy);
        const [cx, cy] = env.screen(near.x, near.y);
        if (Math.hypot(px - cx, py - cy) > 24 || !canRecruitAt(st, mySide, near.id, armedAction.unit)) {
          notify('Нажмите на подсвеченный город, чтобы развернуть дивизию');
          return true;
        }
        finishMapOrder(armedAction, E.recruitDivision(mySide, armedAction.unit, near.id));
        return true;
      }
      if (armedAction.type === 'airlift') {
        const near = E.nearestSectorMeta(wx, wy);
        const mine = [...selectedDivIds].filter(id => st.divisions.some(d => d.id === id && d.side === mySide));
        const result = E.airliftDivisions(mySide, mine, near.id);
        finishMapOrder(armedAction, result);
        return true;
      }
    }

    const hits = [];
    const addHit = (kind, obj, point, radius) => {
      const distance = Math.hypot(point[0] - px, point[1] - py);
      if (distance < radius) hits.push({ kind, id: obj.id, label: obj.name, distance });
    };
    for (const d of st.divisions) {
      if (d.side !== 'N') addHit('unit', d, renderDivisionAt(d, env.screen), 26);
    }
    for (const city of G.SECTORS) addHit('city', city, env.screen(city.x, city.y), 24);
    if (hits.length) {
      const pick = hit => {
        const unit = hit.kind === 'unit' && E.getState()?.divisions.find(d => d.id === hit.id);
        if (hit.kind === 'unit' && !unit) { notify('Подразделение выбыло'); return; }
        selectedCityId = hit.kind === 'city' ? hit.id : null;
        selectedCorridorKey = null;
        if ((shiftHeld || multiSelect) && unit && unit.side === playerSide()) {
          if (selectedDivIds.has(hit.id)) selectedDivIds.delete(hit.id);
          else selectedDivIds.add(hit.id);
        } else {
          selectedDivIds.clear();
          if (unit) selectedDivIds.add(hit.id);
        }
        currentTab = 'army';
        renderDom(true);
        AtlasMap.redrawOverlay();
      };
      if (hits.length === 1) pick(hits[0]);
      else {
        warDialogTitle.textContent = 'Что выбрать на карте?';
        warDialogBody.className = 'mapPickList';
        warDialogBody.replaceChildren(...hits.sort((a,b) => a.distance - b.distance).map(hit => {
          const button = document.createElement('button');
          button.className = 'warBtn';
          button.textContent = (hit.kind === 'city' ? 'Сектор · ' : 'Подразделение · ') + hit.label;
          button.onclick = () => { warDialog.close(); pick(hit); };
          return button;
        }));
        warDialog.showModal();
      }
      return true;
    }

    // Select road / mountain trail corridor midpoint (to place Checkpoints or Minefields!)
    const corrs = E.getCorridors ? E.getCorridors() : {};
    let hitCorr = null, bestK = 22;
    for (const c of Object.values(corrs)) {
      const [sx, sy] = env.screen(c.mid.x, c.mid.y);
      const dd = Math.hypot(sx - px, sy - py);
      if (dd < bestK) { bestK = dd; hitCorr = c.key; }
    }
    if (hitCorr) {
      selectedCorridorKey = hitCorr;
      selectedCityId = null;
      selectedDivIds.clear();
      currentTab = 'army';
      renderDom(true);
      AtlasMap.redrawOverlay();
      return true;
    }
    return false;
  }

  // ==================== TOP COMMAND HUD ====================
  function initHud() {
    hudEl.innerHTML = `
      <div class="hudOverview">
        <div class="hudPlayback" data-hud="playback"></div>
        <div class="hudClock">
          <strong class="hudScenario"></strong>
          <span class="hudDay"></span>
        </div>
        <div class="hudSituation" data-hud="situation"></div>
      </div>
      <div class="hudToolbar">
        <div class="hudResources" data-hud="resources"></div>
        <div class="hudActions" data-hud="actions"></div>
      </div>
    `;
    hudEl.querySelectorAll('[data-hud]').forEach(node => hudParts.set(node.dataset.hud, { node, html: null }));
    new ResizeObserver(([entry]) => {
      hudEl.parentElement.style.setProperty('--hud-height', Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? hudEl.offsetHeight) + 'px');
    }).observe(hudEl);
    hudEl.addEventListener('click', e => {
      const button = e.target.closest('button');
      if (!button || button.disabled) return;
      const { spd, role, pvp, tlayer } = button.dataset;
      if (spd !== undefined) {
        setPlaybackSpeed(Number(spd));
      } else if (role || pvp) {
        armedAction = null;
        selectedDivIds.clear();
        if (role) E.setRole(role);
        else E.setPvpSide(pvp);
        renderDom(true);
      } else if (tlayer) {
        tacLayers[tlayer] = !tacLayers[tlayer];
        renderDom(true);
        AtlasMap.redrawOverlay();
      } else if (button.id === 'btnOpenOnlineFromHud') {
        enterOnline();
      } else if (button.id === 'btnScenarios') {
        openScenariosModal();
      }
    });
  }

  function updateHudPart(name, html) {
    const part = hudParts.get(name);
    if (part.html === html) return;
    const focused = part.node.contains(document.activeElement) ? document.activeElement : null;
    const selector = focused?.id ? '#' + focused.id : focused && Object.keys(focused.dataset)
      .map(key => '[data-' + key + '="' + focused.dataset[key] + '"]').join('');
    part.html = html;
    part.node.innerHTML = html;
    if (selector) part.node.querySelector(selector)?.focus({ preventScroll: true });
  }

  function renderHud() {
    const st = E.getState();
    if (!st || !hudEl) return;
    if (!hudParts.size) initHud();
    const role = E.getRole();
    const pvpSide = E.getPvpSide();
    const isUnView = role === 'observer' || (role === 'pvp' && pvpSide === 'UN');
    const viewSide = role === 'B' || (role === 'pvp' && pvpSide === 'B') ? 'B' : 'A';
    const fac = st.factions[viewSide];
    const vp = E.computeControlStats(st);
    const vpPctA = Math.round((vp.vpA / Math.max(1, vp.total)) * 100);
    const spd = E.getSpeed();
    const hh = String(st.hour).padStart(2, '0') + ':00';
    const isNight = st.hour >= 21 || st.hour < 6;

    const phaseBadge = st.phase === 'crisis'
      ? `<span class="hudPhase crisis">КРИЗИС · ${st.crisisDaysLeft} дн.</span>`
      : st.demarcationDaysLeft > 0
      ? `<span class="hudPhase demarc">ДЕМАРКАЦИЯ ${st.demarcationForce === 'RU' ? 'РФ' : 'ООН'} · ${st.demarcationDaysLeft} дн.</span>`
      : st.ceasefireDaysLeft > 0
      ? `<span class="hudPhase ceasefire">ПЕРЕМИРИЕ · ${st.ceasefireDaysLeft} дн.</span>`
      : st.noStrikesDaysLeft > 0
      ? `<span class="hudPhase demarc">ЗАПРЕТ УДАРОВ · ${st.noStrikesDaysLeft} дн.</span>`
      : '';

    const un = st.un || { mandate: 100, credibility: 80, embargoDaysLeft: 0 };
    const resHtml = isUnView ? `
      <div class="hudRes">
        <span class="resPill" title="Мандат ООН"><i class="dot ms"></i><b>${un.mandate}</b><small>МП ООН</small></span>
        <span class="resPill" title="Авторитет миссии"><i class="dot mr"></i><b>${un.credibility}%</b><small>АВТОРИТ.</small></span>
        <span class="resPill" title="Оружейное эмбарго"><i class="dot wp"></i><b>${un.embargoDaysLeft > 0 ? un.embargoDaysLeft + ' дн.' : 'Нет'}</b><small>ЭМБАРГО</small></span>
        <span class="resPill" title="Активные бои"><i class="dot pp"></i><b>${st.battles.length}</b><small>БОИ</small></span>
      </div>
    ` : `
      <div class="hudRes">
        <span class="resPill" title="Людские ресурсы"><i class="dot mp"></i><b>${fac.manpower}</b><small>Л/С</small></span>
        <span class="resPill" title="Вооружение и БК"><i class="dot wp"></i><b>${fac.weapons}</b><small>ОРУЖ</small></span>
        <span class="resPill" title="Политические очки"><i class="dot pp"></i><b>${fac.pp}</b><small>ПО</small></span>
        <span class="resPill" title="Ракеты ОТРК"><i class="dot ms"></i><b>${fac.missiles}</b><small>РАК</small></span>
        <span class="resPill" title="Боевой дух (влияет на силу и восстановление)"><i class="dot mr"></i><b>${fac.morale}%</b><small>ДУХ</small></span>
      </div>
    `;

    const online = G.SupabaseNet?.getSession();
    const lobby = online?.status === 'lobby';
    const locked = lobby || online?.status === 'active';
    const clockDisabled = lobby || st.status === 'finished';
    const toggleLabel = lobby ? 'Ожидание' : spd > 0 ? 'Пауза' : 'Запустить';

    updateHudPart('playback', `
      <button id="clockToggle" type="button" class="clockToggle ${spd ? 'isRunning' : ''}" data-spd="${spd ? 0 : 1}" title="${toggleLabel} · Пробел" ${clockDisabled ? 'disabled' : ''}>
        ${icon(spd ? 'pause' : 'play')}<span>${toggleLabel}</span>
      </button>
      <div class="speedGroup" role="group" aria-label="Скорость игры">
        ${(E.getOnlineMode() ? [1, 2] : [1, 2, 4]).map(value => `
          <button type="button" class="${spd === value ? 'active' : ''}" data-spd="${value}" aria-pressed="${spd === value}" aria-label="Скорость ${value}×" ${clockDisabled ? 'disabled' : ''}>${value}×</button>
        `).join('')}
      </div>
    `);

    const scenario = hudEl.querySelector('.hudScenario');
    if (scenario.textContent !== st.scenarioTitle) {
      scenario.textContent = st.scenarioTitle;
      scenario.title = st.scenarioTitle;
    }
    const day = hudEl.querySelector('.hudDay');
    const time = 'День ' + st.day + ' · ' + hh;
    if (day.textContent !== time) day.textContent = time;
    day.classList.toggle('night', isNight);
    updateHudPart('situation', `
      ${phaseBadge}
      <div class="vpMeter" title="Контроль Абхазии (${vp.vpA} vs ${vp.vpB} ОП)">
        <div class="vpNums"><b class="cA">${vpPctA}%</b><span>ФРОНТ</span><b class="cB">${100 - vpPctA}%</b></div>
        <div class="vpTrack"><i style="width:${vpPctA}%"></i></div>
      </div>
    `);
    updateHudPart('resources', resHtml);
    updateHudPart('actions', `
        ${locked ? `
          <button type="button" class="onlineMatchBadge ${online.side === 'A' ? 'sideA' : 'sideB'}" id="btnOpenOnlineFromHud" title="Открыть лобби">
            <i class="onlineLivePulse"></i>
            <span>${escapeHtml(online.roomCode)} · ${online.side === 'A' ? 'Запад' : 'Восток'}${lobby ? ' · Лобби' : ''}</span>
          </button>` : `
        <div class="roleSwitch" role="group" aria-label="Режим игры">
          <button type="button" class="${role === 'A' ? 'active sideA' : ''}" data-role="A" aria-pressed="${role === 'A'}" title="Запад против ИИ">Запад</button>
          <button type="button" class="${role === 'B' ? 'active sideB' : ''}" data-role="B" aria-pressed="${role === 'B'}" title="Восток против ИИ">Восток</button>
          <button type="button" class="${role === 'pvp' ? 'active pvp' : ''}" data-role="pvp" aria-pressed="${role === 'pvp'}" title="Двое за одним экраном">Локально 1×1</button>
          <button type="button" class="${role === 'observer' ? 'active obs' : ''}" data-role="observer" aria-pressed="${role === 'observer'}" title="Наблюдатель и миссия ООН">ООН</button>
        </div>`}
        ${role === 'pvp' ? `
        <div class="pvpSwitch" role="group" aria-label="Активная сторона (Без ИИ)">
          <button type="button" class="${pvpSide === 'A' ? 'active sideA' : ''}" data-pvp="A">А</button>
          <button type="button" class="${pvpSide === 'B' ? 'active sideB' : ''}" data-pvp="B">Б</button>
          <button type="button" class="${pvpSide === 'UN' ? 'active sideUN' : ''}" data-pvp="UN">ООН</button>
        </div>` : ''}
        <div class="tacLayerGroup" role="group" aria-label="Тактические слои">
          <button type="button" class="${tacLayers.routes ? 'active' : ''}" data-tlayer="routes" title="Автодороги и мосты">Пути</button>
          <button type="button" class="${tacLayers.rail ? 'active' : ''}" data-tlayer="rail" title="Железная дорога">ЖД</button>
          <button type="button" class="${tacLayers.infra ? 'active' : ''}" data-tlayer="infra" title="Аэродромы, вертолётные площадки и порты">Авиа/ВРТ</button>
        </div>
        <button type="button" class="hudBtn" id="btnScenarios" ${locked ? 'disabled' : ''}>
          ${icon('index')}<span>Сценарии</span>
        </button>
    `);

    if (alertEl) {
      const alertText = (E.getOnlineMode() && st.onlineAlerts?.[viewSide]) || st.lastAlert || '';
      if (alertEl.textContent !== alertText) alertEl.textContent = alertText;
      alertEl.hidden = !alertText;
    }
    if (feedBox) {
      const items = (st.observerFeed || []).filter(item => {
        if (!E.getOnlineMode()) return true;
        const audience = item.audience || item.side;
        return audience === viewSide || !['A', 'B'].includes(audience);
      }).slice(0, 3);
      if (items.length) {
        const feedHtml = items.map(f => `
          <div class="liveToastCard">
            <span class="obsBadge ${f.side}">${f.side === 'A' ? 'ЗАП' : f.side === 'B' ? 'ВОС' : f.side}</span>
            <span><b>Д.${f.day}</b> ${f.text}</span>
          </div>
        `).join('');
        if (feedBox.innerHTML !== feedHtml) feedBox.innerHTML = feedHtml;
        feedBox.hidden = false;
      } else {
        feedBox.hidden = true;
      }
    }
  }

  // ==================== COMMAND SIDEBAR ====================
  function renderSidePanel(force = false) {
    const st = E.getState();
    if (!st || !sideWar) return;
    const role = E.getRole();
    const mySide = playerSide();

    if (role === 'observer' || (role === 'pvp' && E.getPvpSide() === 'UN')) {
      const html = buildUnObserverPanel(st, role === 'pvp');
      if (force || html !== lastSideHtml) {
        lastSideHtml = html;
        const scroll = sideWar.querySelector('.warBody')?.scrollTop || 0;
        sideWar.innerHTML = html;
        const list = sideWar.querySelector('.warBody');
        if (list) list.scrollTop = scroll;
        sideWar.querySelectorAll('[data-otab]').forEach(b => {
          b.onclick = () => { obsTab = b.dataset.otab; renderSidePanel(true); };
        });
        sideWar.querySelectorAll('[data-un]').forEach(b => {
          b.onclick = () => {
            notify(E.runUnAction(b.dataset.un, b.dataset.ut || 'both').msg);
            renderDom(true);
          };
        });
      }
      return;
    }

    const tabsHtml = `
      <div class="warTabs three" role="tablist">
        <button type="button" class="${currentTab === 'army' ? 'active' : ''}" data-wtab="army">Армия</button>
        <button type="button" class="${currentTab === 'ops' ? 'active' : ''}" data-wtab="ops">Операции</button>
        <button type="button" class="${currentTab === 'politics' ? 'active' : ''}" data-wtab="politics">Политика</button>
      </div>
    `;

    let bodyHtml = '';
    if (armedAction) {
      const msg = armedAction.type === 'march' ? 'Кликните на карте точку наступления'
        : armedAction.type === 'airlift' ? 'Кликните по СВОЕМУ сектору с исправной вертолётной площадкой (H / ✈)'
        : armedAction.type === 'recruit' ? 'Кликните по СВОЕМУ городу для развёртывания'
        : 'Укажите цель на карте: ' + (G.STRIKES[armedAction.strikeId]?.short || '');
      bodyHtml += `<div class="targetBanner"><span>${msg}</span><button type="button" id="cancelArmed">Отмена</button></div>`;
    }

    if (currentTab === 'army') bodyHtml += buildArmyTab(st, mySide);
    else if (currentTab === 'ops') bodyHtml += buildOpsTab(st, mySide);
    else bodyHtml += buildPoliticsTab(st, mySide);

    const fullHtml = tabsHtml + `<div class="warBody">${bodyHtml}</div>`;
    if (force || fullHtml !== lastSideHtml) {
      lastSideHtml = fullHtml;
      const scroll = sideWar.querySelector('.warBody')?.scrollTop || 0;
      const focused = sideWar.contains(document.activeElement) ? document.activeElement : null;
      sideWar.innerHTML = fullHtml;
      if (focused) {
        const dataKey = Object.keys(focused.dataset)[0];
        const replacement = focused.id ? document.getElementById(focused.id)
          : dataKey && [...sideWar.querySelectorAll('button, select, input')].find(el => el.dataset[dataKey] === focused.dataset[dataKey]);
        replacement?.focus({ preventScroll: true });
      }
      sideWar.querySelector('.warBody').scrollTop = scroll;
      sideWar.querySelectorAll('[data-wtab]').forEach(b => {
        b.onclick = () => { currentTab = b.dataset.wtab; renderSidePanel(true); };
      });
      const ca = $('#cancelArmed');
      if (ca) ca.onclick = () => { armedAction = null; renderDom(true); };
      bindHandlers(st, mySide);
    }
  }

  function buildUnObserverPanel(st, isPvpUn) {
    const divsA = st.divisions.filter(d => d.side === 'A').length;
    const divsB = st.divisions.filter(d => d.side === 'B').length;
    const vp = E.computeControlStats(st);
    const pLabel = p => p === 'offensive' ? 'Наступление' : (p === 'defense' ? 'Оборона' : 'Перегрупп.');
    const pClass = p => p === 'offensive' ? 'atk' : (p === 'defense' ? 'def' : 'reg');
    const un = st.un || { mandate: 100, credibility: 80, embargoDaysLeft: 0 };

    const vsRow = (label, vA, vB) => {
      const pctA = Math.round((vA / Math.max(1, vA + vB)) * 100);
      return `
        <div class="vsMetric">
          <div class="vsMetricHead"><b class="cA">${vA}</b><span>${label}</span><b class="cB">${vB}</b></div>
          <div class="vsBar"><i style="width:${pctA}%"></i></div>
        </div>
      `;
    };

    const unConsoleHtml = `
      <div class="unKpiRow">
        <div class="unKpi"><small>Мандат ООН</small><b>${un.mandate} МП</b></div>
        <div class="unKpi"><small>Авторитет</small><b>${un.credibility}%</b></div>
        <div class="unKpi"><small>Эмбарго</small><b>${un.embargoDaysLeft > 0 ? (un.embargoDaysLeft + ' дн.') : 'Нет'}</b></div>
      </div>
      <div class="cmdTitle">Миротворческие операции ООН</div>
      <div class="unActionList">
        <button type="button" class="unActBtn primary" data-un="deploy_peacekeepers" ${un.mandate < 35 ? 'disabled' : ''}>
          <span><strong>Ввести миротворцев (4 дн.)</strong><small>Буферная зона и батальоны ООН на линии фронта</small></span>
          <span class="rangeTag">−35 МП</span>
        </button>
        <button type="button" class="unActBtn" data-un="propose_ceasefire" ${un.mandate < 25 ? 'disabled' : ''}>
          <span><strong>Резолюция о перемирии (3 дн.)</strong><small>Предложить обеим сторонам остановить огонь</small></span>
          <span class="rangeTag">−25 МП</span>
        </button>
        <button type="button" class="unActBtn" data-un="geneva_summit" ${un.mandate < 50 ? 'disabled' : ''}>
          <span><strong>Женевский саммит (6 дн.)</strong><small>Длительное перемирие и миротворческий буфер</small></span>
          <span class="rangeTag">−50 МП</span>
        </button>
        <button type="button" class="unActBtn" data-un="arms_embargo" ${un.mandate < 35 ? 'disabled' : ''}>
          <span><strong>Оружейное эмбарго (5 дн.)</strong><small>Режет приток БК обеим сторонам на −55%</small></span>
          <span class="rangeTag">−35 МП</span>
        </button>
        <button type="button" class="unActBtn" data-un="satellite_audit" ${un.mandate < 15 ? 'disabled' : ''}>
          <span><strong>Спутниковый мониторинг</strong><small>Повышает авторитет миссии ООН (+12%)</small></span>
          <span class="rangeTag">−15 МП</span>
        </button>
        ${st.demarcationDaysLeft > 0 ? `
        <button type="button" class="unActBtn danger" data-un="withdraw_peacekeepers">
          <span><strong>Вывести миротворцев досрочно</strong><small>Снимает буферную зону с линии фронта</small></span>
          <span class="rangeTag">0 МП</span>
        </button>` : ''}
      </div>
      <div class="cmdTitle">Адресная помощь и санкции</div>
      <div class="cmdGrid">
        <button type="button" class="warBtn sm" data-un="humanitarian_aid" data-ut="A" ${un.mandate < 20 ? 'disabled' : ''}>Помощь Западу (−20)</button>
        <button type="button" class="warBtn sm" data-un="humanitarian_aid" data-ut="B" ${un.mandate < 20 ? 'disabled' : ''}>Помощь Востоку (−20)</button>
        <button type="button" class="warBtn primary sm span2" data-un="humanitarian_aid" data-ut="both" ${un.mandate < 20 ? 'disabled' : ''}>Гумконвой обеим сторонам (−20 МП)</button>
        <button type="button" class="warBtn danger sm" data-un="sanctions" data-ut="A" ${un.mandate < 30 ? 'disabled' : ''}>Санкции Западу (−30)</button>
        <button type="button" class="warBtn danger sm" data-un="sanctions" data-ut="B" ${un.mandate < 30 ? 'disabled' : ''}>Санкции Востоку (−30)</button>
      </div>
    `;

    const statsHtml = `
      <div class="factionCards">
        <div class="facMiniCard sideA">
          <div class="facMiniTop"><span>ЗАПАД (А)</span><i class="posPill ${pClass(st.factions.A.posture)}">${pLabel(st.factions.A.posture)}</i></div>
          <div class="facMiniVal">${vp.vpA} <small>ОП</small></div>
          <div class="facMiniSub">${divsA} див. · ${vp.secA} сек.</div>
        </div>
        <div class="facMiniCard sideB">
          <div class="facMiniTop"><span>ВОСТОК (Б)</span><i class="posPill ${pClass(st.factions.B.posture)}">${pLabel(st.factions.B.posture)}</i></div>
          <div class="facMiniVal">${vp.vpB} <small>ОП</small></div>
          <div class="facMiniSub">${divsB} див. · ${vp.secB} сек.</div>
        </div>
      </div>
      <div class="vsPanel">
        ${vsRow('Дивизии на фронте', divsA, divsB)}
        ${vsRow('Людские ресурсы', st.factions.A.manpower, st.factions.B.manpower)}
        ${vsRow('Вооружение и БК', st.factions.A.weapons, st.factions.B.weapons)}
        ${vsRow('Ракеты ОТРК', st.factions.A.missiles, st.factions.B.missiles)}
        <div class="vsFootStat">
          <span>Активных боёв: <b>${st.battles.length}</b></span>
          <span>Уличных боёв: <b>${vp.urbanFights}</b></span>
        </div>
      </div>
      <div class="cmdTitle">Решения штабов и события</div>
      <div class="obsFeed">
        ${(st.observerFeed && st.observerFeed.length) ? st.observerFeed.slice(0, 10).map(f => `
          <div class="obsFeedRow side_${f.side}">
            <span class="obsBadge ${f.side}">${f.side === 'A' ? 'ЗАП' : f.side === 'B' ? 'ВОС' : f.side}</span>
            <span class="obsText"><small>День ${f.day}</small>${f.text}</span>
          </div>
        `).join('') : '<div class="emptyNote">Решения штабов появятся здесь по ходу кампании.</div>'}
      </div>
    `;

    return `
      <div class="warTabs two" role="tablist">
        <button type="button" class="${obsTab === 'un' ? 'active' : ''}" data-otab="un">Миссия ООН</button>
        <button type="button" class="${obsTab === 'stats' ? 'active' : ''}" data-otab="stats">Сводка и лента</button>
      </div>
      <div class="warBody">
        <div class="obsHeaderCard">
          <div class="obsHeaderTop"><span class="obsLiveDot"></span><strong>${isPvpUn ? '3-й игрок: Миссия ООН' : 'Наблюдатель · Миссия ООН'}</strong></div>
          <small>Управляйте миротворцами, санкциями, эмбарго и переговорами между Западом и Востоком.</small>
        </div>
        ${obsTab === 'un' ? unConsoleHtml : statsHtml}
      </div>
    `;
  }

  function buildTkuarchalSiegeCard(st, mySide) {
    const sg = st.tkuarchalSiege;
    if (!sg || !sg.active) return '';
    const fac = st.factions[mySide];
    const sup = Math.round(sg.supplies);
    const fort = Math.round(sg.fortIntegrity);
    const isWest = mySide === 'A';
    const actionsHtml = isWest ? `
      <p class="siegeNote">Гарнизон заперт в горах и не может идти в наступление — он держит тоннели и совершает вылазки ДРГ. Прорвитесь с запада, чтобы снять блокаду.</p>
      <div class="cmdGrid">
        <button type="button" class="warBtn primary sm" data-siege="air_bridge" ${sg.airBridgeCooldown > 0 || fac.weapons < 120 || fac.pp < 14 ? 'disabled' : ''}>
          ${sg.airBridgeCooldown > 0 ? ('Мост · кд ' + sg.airBridgeCooldown + ' дн.') : 'Вертолёт. мост (−120 ОР)'}
        </button>
        <button type="button" class="warBtn sm" data-siege="drg_raid" ${sg.raidCooldown > 0 || fac.pp < 10 ? 'disabled' : ''}>
          ${sg.raidCooldown > 0 ? ('ДРГ · кд ' + sg.raidCooldown + ' дн.') : 'Вылазка ДРГ (−10 ПО)'}
        </button>
      </div>
    ` : `
      <p class="siegeNote">Гарнизон Ткуарчала мешает вашему тылу вылазками ДРГ (ворует БК и продовольствие). Ослабьте тоннели ударами, сжатием кольца и горными егерями — затем берите город.</p>
      <div class="cmdGrid">
        <button type="button" class="warBtn sm" data-siege="tighten_ring" ${sg.ringCooldown > 0 || fac.weapons < 110 || fac.pp < 12 || st.ceasefireDaysLeft > 0 ? 'disabled' : ''}>
          ${sg.ringCooldown > 0 ? ('Кольцо · кд ' + sg.ringCooldown + ' дн.') : 'Сжать кольцо (−110 ОР)'}
        </button>
        <button type="button" class="warBtn danger sm" data-siege="storm_tunnels" ${sg.stormCooldown > 0 || fac.weapons < 150 || fac.pp < 16 || st.ceasefireDaysLeft > 0 ? 'disabled' : ''}>
          ${sg.stormCooldown > 0 ? ('Штурм · кд ' + sg.stormCooldown + ' дн.') : 'Штурм тоннелей (−150 ОР)'}
        </button>
      </div>
    `;

    return `
      <div class="siegeCard">
        <div class="secTop">
          <span class="siegeBadge">БЛОКАДА ТКУАРЧАЛА · Д.${sg.daysBesieged + 1}</span>
          <span class="vpTag">${sg.civilians.toLocaleString('ru-RU')} жит.</span>
        </div>
        <div class="siegeBars">
          <div class="siegeBarRow">
            <div class="loyaltyHead"><span>Продовольствие и БК</span><b>${sup}%</b></div>
            <div class="relBar"><i style="width:${sup}%;background:${sup < 25 ? 'var(--red)' : 'var(--amber)'}"></i></div>
          </div>
          <div class="siegeBarRow">
            <div class="loyaltyHead"><span>Шахтные тоннели (обор.)</span><b>${fort}%</b></div>
            <div class="relBar"><i style="width:${fort}%;background:${fort < 35 ? 'var(--red)' : 'var(--cyan)'}"></i></div>
          </div>
        </div>
        ${actionsHtml}
      </div>
    `;
  }

  function buildArmyTab(st, mySide) {
    const myDivs = st.divisions.filter(d => d.side === mySide);
    const selMine = [...selectedDivIds].map(id => st.divisions.find(d => d.id === id && d.side === mySide)).filter(Boolean);
    const selCity = selectedCityId && G.SECTOR_MAP[selectedCityId];

    let topHtml = '';
    if (selMine.length) {
      const first = selMine[0];
      const title = selMine.length > 1 ? ('Ударная группа: ' + selMine.length + ' див.') : first.name;
      const totalHp = Math.round(selMine.reduce((s, d) => s + d.hp, 0));
      const totalMax = selMine.reduce((s, d) => s + d.maxHp, 0);
      const avgOrg = Math.round(selMine.reduce((s, d) => s + d.org, 0) / selMine.length);

      topHtml = `
        <div class="secCard">
          <div class="secTop">
            <span class="ownerPill ${mySide === 'A' ? 'ownA' : 'ownB'}">${selMine.length > 1 ? 'Группировка' : G.UNIT_TEMPLATES[first.type].name}</span>
            <span class="vpTag">${totalHp}/${totalMax} л/с</span>
          </div>
          <h3>${title}</h3>
          <div class="kpiStrip">
            <div><small>Боеспособность</small><b>${Math.round((totalHp / Math.max(1, totalMax)) * 100)}%</b></div>
            <div><small>Организация</small><b>${avgOrg}%</b></div>
            <div><small>Окапывание</small><b>+${Math.round(first.fort * 100)}%</b></div>
          </div>
          <div class="opModeGroup two">
            <button type="button" class="opModeBtn ${selectedOpMode === 'standard' ? 'active' : ''}" data-opmode="standard"><strong>Стандарт</strong><small>0 доп. затрат</small></button>
            <button type="button" class="opModeBtn ${selectedOpMode === 'massive' ? 'active' : ''}" data-opmode="massive"><strong>Прорыв (+35%)</strong><small>100 ОР · 8 ПО за дивизию</small></button>
          </div>
          ${selMine.every(d => E.isTrappedInTkuarchal(d)) ? '<div class="siegeTrapNotice">Гарнизон в блокаде Ткуарчала: наступление и сухопутное пополнение заблокированы. Используйте вылазки ДРГ и вертолётный мост ниже.</div>' : ''}
          ${selMine.some(d => d.supplied === false) && !selMine.every(d => E.isTrappedInTkuarchal(d)) ? '<div class="siegeTrapNotice">Часть дивизий отрезана от снабжения (−28% сила, нет пополнения по суше). Восстановите взорванный мост/путь или используйте вертолётную ротацию!</div>' : ''}
          <div class="cmdGrid">
            <button type="button" class="warBtn danger" id="btnDivMarch" ${selMine.every(d => E.isTrappedInTkuarchal(d)) ? 'disabled' : ''}>Переместить</button>
            <button type="button" class="warBtn" id="btnDivEntrench">Держать рубеж</button>
            <button type="button" class="warBtn" id="btnDivRetreat" ${selMine.every(d => E.isTrappedInTkuarchal(d)) ? 'disabled' : ''}>Отступить</button>
            <button type="button" class="warBtn primary" id="btnDivReinforce" ${selMine.every(d => E.isTrappedInTkuarchal(d)) ? 'disabled' : ''}>Пополнить</button>
            ${selMine.some(d => G.UNIT_TEMPLATES[d.type]?.airliftable) && !selMine.every(d => E.isTrappedInTkuarchal(d)) ? `<button type="button" class="warBtn sm span2" id="btnDivAirlift" ${!E.hasOperationalHelipad(mySide) ? 'disabled' : ''}>Вертолётная переброска на площадку H (−75 ОР/див.)</button>` : ''}
          </div>
          <div class="microHint"><b>ПКМ-рамка</b> — выделить группу · <b>ПКМ-клик</b> — отправить в бой</div>
        </div>
      `;
    } else if (selectedCorridorKey && E.getCorridors && E.getCorridors()[selectedCorridorKey]) {
      const c = E.getCorridors()[selectedCorridorKey];
      const cs = (st.corridors && st.corridors[c.key]) || {};
      const kindLbl = (c.kind === 'highway' ? 'Главная трасса' : (c.kind === 'trail' ? 'Горная тропа' : 'Дорога')) + (c.hasRail ? ' + ЖД' : '');
      const ownsEdge = st.cities[c.a].owner === mySide || st.cities[c.b].owner === mySide;
      const cp = cs.checkpoint && cs.checkpoint.hp > 0 ? cs.checkpoint : null;
      const mine = cs.mined && cs.mined.charges > 0 ? cs.mined : null;
      const showMine = mine && mine.side === mySide;
      const isBlocked = !!cs.blocked;
      const hasEnemyObs = (cp && cp.side !== mySide) || (mine && mine.side !== mySide);
      topHtml = `
        <div class="secCard">
          <div class="secTop">
            <span class="ownerPill ${isBlocked ? 'ownB' : (ownsEdge ? (mySide === 'A' ? 'ownA' : 'ownB') : 'ownN')}">${kindLbl}</span>
            <button type="button" class="miniLink" id="btnCloseCorr">Закрыть</button>
          </div>
          <h3>${c.label}</h3>
          ${c.bridge ? `<div class="facBox"><strong>[${c.bridge.kind === 'bridge' ? 'МОСТ' : 'УЩЕЛЬЕ'}] ${c.bridge.name}</strong><small>Стратегическая переправа — подрыв полностью перекрывает движение и снабжение!</small></div>` : ''}
          <div class="secMeta">${isBlocked ? ('<b>ПУТЬ ПЕРЕКРЫТ:</b> ' + cs.blocked.reason + '. Движение и снабжение отрезаны! Отправьте сапёров (ИНЖ) или нажмите «Восстановить».') : 'Войска идут строго по реальным трассам и ЖД (2.2× по своей целой ветке). Вы можете взорвать переправу, поставить блокпост или мины.'}</div>
          <div class="kpiStrip">
            <div><small>Проходимость</small><b>${isBlocked ? 'ВЗОРВАН' : 'Открыт'}</b></div>
            <div><small>ЖД-ветка</small><b>${!c.hasRail ? 'Нет' : ((isBlocked || cs.railDamaged) ? 'Повр.' : '2.2× ОК')}</b></div>
            <div><small>Заграждения</small><b>${cp ? ('БП ' + Math.round(cp.hp) + '%') : (showMine ? ('Мины ' + mine.charges) : 'Нет')}</b></div>
          </div>
          <div class="cmdGrid">
            <button type="button" class="warBtn primary sm" id="btnBuildCp" ${!ownsEdge || isBlocked ? 'disabled' : ''}>Блокпост (−90 ОР · 8 ПО)</button>
            <button type="button" class="warBtn sm" id="btnMineCorr" ${!ownsEdge || isBlocked ? 'disabled' : ''}>Заминировать (−75 ОР · 6 ПО)</button>
            ${!isBlocked ? `<button type="button" class="warBtn danger sm span2" id="btnDemolishCorr" ${!ownsEdge ? 'disabled' : ''}>Подорвать ${c.bridge ? 'мост' : 'путь'} / Завал (−60 ОР · 10 ПО)</button>` : `<button type="button" class="warBtn primary sm span2" id="btnRepairCorr" ${!ownsEdge ? 'disabled' : ''}>Восстановить путь и ЖД (дешевле с ИНЖ)</button>`}
            ${!isBlocked && cs.railDamaged ? `<button type="button" class="warBtn sm span2" id="btnRepairCorr" ${!ownsEdge ? 'disabled' : ''}>Отремонтировать ЖД-путь</button>` : ''}
            ${hasEnemyObs ? `<button type="button" class="warBtn danger sm span2" id="btnClearObs">Прорвать / Разминировать (−80 ОР · 8 ПО)</button>` : ''}
          </div>
        </div>
      `;
    } else if (selCity) {
      const c = st.cities[selCity.id];
      const fObj = G.SECTOR_FACILITIES && G.SECTOR_FACILITIES[selCity.id];
      const inf = c.infra || {};
      const supLabel = c.supplied ? (c.supplySource === 'rail' ? 'ЖД-канал' : c.supplySource === 'sea' ? 'Морской' : c.supplySource === 'border' ? 'Граница' : 'Трасса') : 'ОТРЕЗАНО!';
      const needsRepair = c.owner === mySide && ((inf.airfieldHp != null && inf.airfieldHp < 100) || (inf.helipadHp != null && inf.helipadHp < 100) || (inf.portHp != null && inf.portHp < 100));
      topHtml = `
        <div class="secCard">
          <div class="secTop">
            <span class="ownerPill ${c.owner === 'A' ? 'ownA' : c.owner === 'B' ? 'ownB' : 'ownN'}">${selCity.name}</span>
            <span class="vpTag">${selCity.vp} ОП</span>
          </div>
          <div class="secMeta">${G.TERRAINS[selCity.terrain].name} (+${Math.round(G.TERRAINS[selCity.terrain].defBonus * 100)}% обор.)${selCity.rail ? ' · ЖД-станция' : ''}${selCity.port ? ' · Порт' : ''}${selCity.airfield ? ' · Аэродром' : ''}${selCity.helipad ? ' · Верт. пл.' : ''}</div>
          <div class="kpiStrip">
            <div><small>Снабжение</small><b style="color:${c.supplied ? 'var(--accent)' : 'var(--amber)'}">${supLabel}</b></div>
            <div><small>${selCity.airfield ? 'Аэродром ✈' : (selCity.helipad ? 'Верт. пл. H' : 'Авиация')}</small><b>${selCity.airfield ? (Math.round(inf.airfieldHp ?? 100) + '%') : (selCity.helipad ? (Math.round(inf.helipadHp ?? 100) + '%') : 'Нет')}</b></div>
            <div><small>${selCity.port ? 'Порт ⚓' : 'ЖД-узел'}</small><b>${selCity.port ? (Math.round(inf.portHp ?? 100) + '%') : (selCity.rail ? 'Станция' : 'Нет')}</b></div>
          </div>
          ${fObj ? `<div class="facBox"><strong>[${fObj.tag}] ${fObj.name}</strong><small>${fObj.desc} · трофей +${fObj.lootWp} ОРУЖ</small></div>` : ''}
          ${needsRepair ? `<button type="button" class="warBtn primary sm full" id="btnRepairInfra" style="margin-bottom:8px">Ремонт ВПП / Площадки / Порта</button>` : ''}
          <div class="loyaltyWrap">
            <div class="loyaltyHead"><span>Контроль: Запад ${Math.round(c.controlA)}%</span><span>Восток ${100 - Math.round(c.controlA)}%</span></div>
            <div class="loyaltyBar"><i style="width:${c.controlA}%"></i></div>
            ${st.phase === 'crisis' ? `<button type="button" class="warBtn primary full" id="btnCityInfluence">Усилить влияние (−15 ПО)</button>` : ''}
          </div>
        </div>
      `;
    } else {
      const enemyOpts = G.SECTORS.filter(m => st.cities[m.id].owner !== mySide).sort((a, b) => b.vp - a.vp);
      const combatCount = myDivs.filter(d => d.type !== 'aa' && d.type !== 'artillery' && !E.isTrappedInTkuarchal(d)).length;
      const activeDir = st.factions[mySide].activeDirective;
      const isPvp = E.getRole() === 'pvp';
      const hasPlan = !!(st.drawnPlans && st.drawnPlans[mySide]);

      topHtml = `
        ${isPvp ? (() => {
          const rA = st.pvpReady && st.pvpReady.A;
          const rB = st.pvpReady && st.pvpReady.B;
          const otherReady = mySide === 'A' ? rB : rA;
          const btnText = otherReady
            ? 'Готов → Запустить бой (1×)'
            : ('Готов → Ход ' + (mySide === 'A' ? 'Востока' : 'Запада'));
          return `
            <div class="pvpBanner ${mySide === 'A' ? 'pvpA' : 'pvpB'}">
              <div class="pvpTopRow">
                <div>
                  <small>РЕЖИМ 1 НА 1 · БЕЗ ИИ</small>
                  <strong>Командует: ${mySide === 'A' ? 'Запад (А)' : 'Восток (Б)'}</strong>
                </div>
                <span class="pvpStatusPills">
                  <i class="${rA ? 'ok' : ''}">А</i>
                  <i class="${rB ? 'ok' : ''}">Б</i>
                </span>
              </div>
              <div class="pvpHint">${E.getSpeed() === 0 ? 'Пауза: приказы соперника скрыты. Отдайте команды и нажмите кнопку ниже.' : 'Идёт бой в реальном времени! Нажмите Space для новой фазы планирования.'}</div>
              <button type="button" class="warBtn primary sm full" id="btnNextPvp">${btnText}</button>
            </div>
          `;
        })() : ''}
        <div class="dirCard">
          <div class="dirHead">
            <span class="dirEyebrow">ПРИКАЗ СТАВКИ</span>
            ${activeDir ? `<span class="dirActiveTag">Активен</span>` : ''}
          </div>
          <p class="dirSub">Нарисуйте линию наступления по карте или задайте цель — штаб сам подберёт силы и прикроет тыл.</p>
          <div class="cmdGrid" style="margin-bottom:10px">
            <button type="button" class="warBtn ${drawLineMode ? 'danger' : 'primary'} ${hasPlan ? '' : 'span2'}" id="btnDrawLine">
              ${drawLineMode ? 'Отменить рисование (ЛКМ)' : 'Линия наступления'}
            </button>
            ${hasPlan ? `<button type="button" class="warBtn sm" id="btnClearPlan">Сбросить линию</button>` : ''}
          </div>
          <div class="dirTypeGrid">
            <button type="button" class="dirBtn ${dirType === 'capture_city' ? 'active' : ''}" data-dtype="capture_city">Захватить город</button>
            <button type="button" class="dirBtn ${dirType === 'breakthrough' ? 'active' : ''}" data-dtype="breakthrough">Прорвать оборону</button>
            <button type="button" class="dirBtn ${dirType === 'hold_line' ? 'active' : ''}" data-dtype="hold_line">Глухая оборона</button>
            <button type="button" class="dirBtn danger ${dirType === 'all_in' ? 'active' : ''}" data-dtype="all_in">Всё на кон!</button>
          </div>
          ${dirType !== 'hold_line' ? `
            <label class="dirField">
              <span>Целевой сектор</span>
              <select id="dirTargetSel">
                <option value="" ${!dirTargetId ? 'selected' : ''}>Автовыбор цели</option>
                ${dirTargetId && !enemyOpts.some(m => m.id === dirTargetId) ? '<option selected disabled>Цель недоступна · выберите другую</option>' : ''}
                ${enemyOpts.map(m => `<option value="${m.id}" ${m.id === dirTargetId ? 'selected' : ''}>${m.name} (${m.vp} ОП)</option>`).join('')}
              </select>
            </label>
            <div class="dirEffortGrid">
              <button type="button" class="effBtn ${dirEffort === 'low' ? 'active' : ''}" data-deff="low" ${dirType === 'all_in' ? 'disabled' : ''}><strong>${E.directiveCount(combatCount, 'low')} из ${combatCount} · 35%</strong><small>0 затрат</small></button>
              <button type="button" class="effBtn ${dirEffort === 'medium' ? 'active' : ''}" data-deff="medium" ${dirType === 'all_in' ? 'disabled' : ''}><strong>${E.directiveCount(combatCount, 'medium')} из ${combatCount} · 60%</strong><small>−120 ОР · 10 ПО</small></button>
              <button type="button" class="effBtn ${dirEffort === 'allin' ? 'active' : ''}" data-deff="allin"><strong>${E.directiveCount(combatCount, 'allin')} из ${combatCount} · 85%</strong><small>−260 ОР · 20 ПО</small></button>
            </div>
          ` : ''}
          <button type="button" class="warBtn primary full" id="btnExecDirective">Утвердить приказ Ставки</button>
          ${activeDir ? `<div class="dirCurrent">Текущий приказ: <b>${activeDir.label}</b> (${activeDir.effort})</div>` : ''}
        </div>
      `;
    }

    const siegeHtml = buildTkuarchalSiegeCard(st, mySide);
    return `
      ${topHtml}
      ${siegeHtml}
      <div class="cmdHeadRow">
        <div class="cmdTitle">Дивизии (${myDivs.length})</div>
        <button type="button" class="miniLink" id="btnMulti" aria-pressed="${multiSelect}">${multiSelect ? 'Готово (' + selectedDivIds.size + ')' : 'Выбрать несколько'}</button>
        <button type="button" class="miniLink" id="btnSelectAll">Выделить все</button>
      </div>
      <div class="divList">
        ${myDivs.map(d => `
          <button type="button" class="divRow ${selectedDivIds.has(d.id) ? 'active' : ''}" data-pick-div="${d.id}">
            <span class="divTag ${d.side === 'A' ? 'cA' : 'cB'}">${G.UNIT_TEMPLATES[d.type].short}</span>
            <span class="divInfo">
              <strong>${d.name}</strong>
              <small>${E.nearestSectorMeta(d.x, d.y).name} · ${Math.round(d.hp)} л/с · Орг ${Math.round(d.org)}%${d.onRail ? ' · ЖД 2.2×' : ''}${d.supplied === false ? ' · НЕТ БК' : ''}${E.isTrappedInTkuarchal(d) ? ' · БЛОКАДА' : ''}${d.inCombat ? ' · БОЙ' : ''}</small>
              <span class="miniBars"><i class="hp" style="width:${Math.round((d.hp / d.maxHp) * 100)}%"></i><i class="org" style="width:${Math.round(d.org)}%"></i></span>
            </span>
            <span class="orderDot ${d.inCombat ? 'fight' : (d.order ? 'ready' : '')}"></span>
          </button>
        `).join('')}
      </div>
      <div class="cmdTitle">Сформировать дивизию (8 классов)</div>
      <div class="recruitList">
        ${Object.values(G.UNIT_TEMPLATES).map(u => `
          <button type="button" class="recruitRow" data-spawn="${u.id}" title="${u.desc}" ${st.factions[mySide].manpower < u.costMp || st.factions[mySide].weapons < u.costWp ? 'disabled' : ''}>
            <span><strong>${u.name}</strong><small>${u.role} · ${u.costMp} Л/С · ${u.costWp} ОРУЖ</small></span>
            <span class="addTag">${st.factions[mySide].manpower < u.costMp || st.factions[mySide].weapons < u.costWp ? 'Нет ресурсов' : '+'}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function buildOpsTab(st, mySide) {
    const fac = st.factions[mySide];
    const hasAirfield = E.hasOperationalAirfield ? E.hasOperationalAirfield(mySide) : false;
    const hasHelipad = E.hasOperationalHelipad ? E.hasOperationalHelipad(mySide) : false;
    return `
      <div class="cmdTitle">Огневые, ракетные удары, РЭБ и десант</div>
      <div class="strikeList">
        ${Object.values(G.STRIKES).map(s => {
          const noAir = s.requiresAirfield && !hasAirfield;
          const noHeli = s.requiresHelipad && !hasHelipad;
          const banned = st.noStrikesDaysLeft > 0 && s.aaCounterable;
          const ceased = !s.isFriendlyHeal && st.ceasefireDaysLeft > 0;
          const dis = fac.weapons < s.costWp || fac.pp < s.costPP || fac.missiles < s.costMissiles || noAir || noHeli || banned || ceased;
          const btnLabel = noAir ? 'Нет целой ВПП (✈)' : noHeli ? 'Нет целой верт. пл. (H)' : banned ? 'Запрет ударов' : ceased ? 'Перемирие' : 'Применить на карте';
          return `
            <div class="strikeCard">
              <div class="strikeHead"><strong>${s.name}</strong><span class="rangeTag">${s.costWp} ОР · ${s.costPP} ПО${s.costMissiles ? ' · ' + s.costMissiles + ' РАК' : ''}</span></div>
              <p>${s.desc}</p>
              <button type="button" class="warBtn ${s.isDrop || s.isEW || s.isFriendlyHeal ? 'primary' : 'danger'} full sm" data-arm-strike="${s.id}" ${dis ? 'disabled' : ''}>${btnLabel}</button>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function buildPoliticsTab(st, mySide) {
    const fac = st.factions[mySide];
    return `
      <div class="cmdTitle">Военные решения штаба</div>
      <div class="recruitList">
        ${G.DECISIONS.map(dec => {
          const cd = fac.cooldowns[dec.id] || 0;
          const dis = cd > 0 || fac.pp < dec.costPP;
          return `
            <button type="button" class="recruitRow" data-dec="${dec.id}" ${dis ? 'disabled' : ''}>
              <span><strong>${dec.name}</strong><small>${dec.desc}</small></span>
              <span class="rangeTag">${cd > 0 ? (cd + ' дн.') : ('−' + dec.costPP + ' ПО')}</span>
            </button>
          `;
        }).join('')}
      </div>

      <div class="cmdTitle">Военная доктрина</div>
      <div class="opModeGroup two">
        ${Object.values(G.DOCTRINES).map(d => `
          <button type="button" class="opModeBtn ${fac.doctrine === d.id ? 'active' : ''}" data-doc="${d.id}" title="${d.desc}">
            <strong>${d.name}</strong>
            <small>${fac.doctrine === d.id ? 'Активна' : ('−' + d.costPP + ' ПО')}</small>
          </button>
        `).join('')}
      </div>

      <div class="cmdTitle">Переговоры и договоры</div>
      <div class="cmdGrid">
        <button type="button" class="warBtn sm" data-tr="ceasefire_3" ${fac.pp < 15 ? 'disabled' : ''}>Заморозка 3 дн. (−15)</button>
        <button type="button" class="warBtn sm" data-tr="ceasefire_5" ${fac.pp < 22 ? 'disabled' : ''}>Перемирие 5 дн. (−22)</button>
        <button type="button" class="warBtn sm" data-tr="demilitarize_border" ${fac.pp < 12 ? 'disabled' : ''}>Запрет ударов 2 дн. (−12)</button>
        <button type="button" class="warBtn sm" data-tr="demarcation_5" ${fac.pp < 25 ? 'disabled' : ''}>Линия МС 5 дн. (−25)</button>
        <button type="button" class="warBtn primary sm span2" data-tr="peace_treaty" ${st.day < 12 || fac.pp < 30 ? 'disabled' : ''}>
          Мирное соглашение (${st.day < 12 ? ('с 12-го дня · сейчас Д.' + st.day) : '−30 ПО'})
        </button>
      </div>

      <div class="cmdTitle">Внешние спонсоры и поставки</div>
      <div class="sponsorList">
        ${G.SPONSORS.map(sp => {
          const rel = fac.relations[sp.id] || 0;
          const hasBonus = sp.bonusSector && st.cities[sp.bonusSector]?.owner === mySide;
          return `
            <div class="sponsorCard">
              <div class="sponsorHead">
                <strong>${sp.name}${hasBonus ? ' <em class="bonusTag">+20%</em>' : ''}</strong>
                <span class="relBadge">${rel}%</span>
              </div>
              <div class="relBar"><i style="width:${rel}%"></i></div>
              <button type="button" class="warBtn sm full" data-imp="${sp.id}" ${fac.pp < 12 || rel >= 100 ? 'disabled' : ''} style="margin-bottom:6px">Сближение +15% (−12 ПО)</button>
              <div class="pkgList">
                ${sp.packages.map(p => `
                  <button type="button" class="pkgRow" data-aid="${sp.id}:${p.id}" ${rel < p.minRel || fac.pp < p.costPP ? 'disabled' : ''}>
                    <span><b>${p.name}</b><small>${p.short}</small></span>
                    <span class="rangeTag">${rel < p.minRel ? ('от ' + p.minRel + '%') : ('−' + p.costPP + ' ПО')}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function bindHandlers(st, mySide) {
    sideWar.querySelectorAll('[data-opmode]').forEach(b => {
      b.onclick = () => { selectedOpMode = b.dataset.opmode; renderSidePanel(true); };
    });
    const multi = $('#btnMulti');
    if (multi) multi.onclick = () => { multiSelect = !multiSelect; renderDom(true); };
    const bm = $('#btnDivMarch');
    if (bm) bm.onclick = () => { armMapAction({ type: 'march' }); };
    const be = $('#btnDivEntrench');
    if (be) be.onclick = () => { reportOrder(E.orderDivisionsEntrench([...selectedDivIds])); renderDom(true); };
    const br = $('#btnDivRetreat');
    if (br) br.onclick = () => { reportOrder(E.orderDivisionsRetreat([...selectedDivIds])); renderDom(true); };
    const bf = $('#btnDivReinforce');
    if (bf) bf.onclick = () => {
      reportOrder(E.reinforceGroup([...selectedDivIds]));
      renderDom(true);
    };
    const bCloseC = $('#btnCloseCorr');
    if (bCloseC) bCloseC.onclick = () => { selectedCorridorKey = null; renderDom(true); AtlasMap.redrawOverlay(); };
    const bCp = $('#btnBuildCp');
    if (bCp && selectedCorridorKey) bCp.onclick = () => { reportOrder(E.buildCheckpoint(mySide, selectedCorridorKey)); renderDom(true); AtlasMap.redrawOverlay(); };
    const bMn = $('#btnMineCorr');
    if (bMn && selectedCorridorKey) bMn.onclick = () => { reportOrder(E.mineCorridor(mySide, selectedCorridorKey)); renderDom(true); AtlasMap.redrawOverlay(); };
    const bClrO = $('#btnClearObs');
    if (bClrO && selectedCorridorKey) bClrO.onclick = () => { reportOrder(E.clearCorridorEnemyObstacle(mySide, selectedCorridorKey)); renderDom(true); AtlasMap.redrawOverlay(); };
    const bDem = $('#btnDemolishCorr');
    if (bDem && selectedCorridorKey) bDem.onclick = () => { reportOrder(E.demolishCorridor(mySide, selectedCorridorKey)); renderDom(true); AtlasMap.redrawOverlay(); };
    const bRepC = $('#btnRepairCorr');
    if (bRepC && selectedCorridorKey) bRepC.onclick = () => { reportOrder(E.repairCorridor(mySide, selectedCorridorKey)); renderDom(true); AtlasMap.redrawOverlay(); };
    const bRepInf = $('#btnRepairInfra');
    if (bRepInf && selectedCityId) bRepInf.onclick = () => { reportOrder(E.repairCityInfra(mySide, selectedCityId)); renderDom(true); AtlasMap.redrawOverlay(); };
    const bAirlift = $('#btnDivAirlift');
    if (bAirlift) bAirlift.onclick = () => { armMapAction({ type: 'airlift' }); };
    const bi = $('#btnCityInfluence');
    if (bi) bi.onclick = () => { reportOrder(E.crisisInfluence(mySide, selectedCityId)); renderDom(true); };

    const selAll = $('#btnSelectAll');
    if (selAll) selAll.onclick = () => {
      selectedDivIds.clear();
      st.divisions.filter(d => d.side === mySide).forEach(d => selectedDivIds.add(d.id));
      renderDom(true);
      AtlasMap.redrawOverlay();
    };

    sideWar.querySelectorAll('[data-pick-div]').forEach(b => {
      b.onclick = e => {
        const id = b.dataset.pickDiv;
        if (e.shiftKey || multiSelect) {
          if (selectedDivIds.has(id)) selectedDivIds.delete(id);
          else selectedDivIds.add(id);
        } else {
          selectedDivIds.clear();
          selectedDivIds.add(id);
          const d = st.divisions.find(x => x.id === id);
          if (d) {
            const position = guestMatchId ? guestMotion.division(d, lastMapDrawTime) : d;
            AtlasMap.flyTo(position.x, position.y, 1.8);
          }
        }
        renderDom(true);
        AtlasMap.redrawOverlay();
      };
    });

    sideWar.querySelectorAll('[data-spawn]').forEach(b => {
      b.onclick = () => { armMapAction({ type: 'recruit', unit: b.dataset.spawn }); };
    });
    sideWar.querySelectorAll('[data-arm-strike]').forEach(b => {
      b.onclick = () => { armMapAction({ type: 'strike', strikeId: b.dataset.armStrike }); };
    });
    sideWar.querySelectorAll('[data-dec]').forEach(b => {
      b.onclick = () => { reportOrder(E.runDecision(mySide, b.dataset.dec)); renderDom(true); };
    });
    sideWar.querySelectorAll('[data-doc]').forEach(b => {
      b.onclick = () => { reportOrder(E.setDoctrine(mySide, b.dataset.doc)); renderDom(true); };
    });
    sideWar.querySelectorAll('[data-tr]').forEach(b => {
      b.onclick = () => { reportOrder(E.proposeTreaty(mySide, b.dataset.tr)); renderDom(true); };
    });
    sideWar.querySelectorAll('[data-imp]').forEach(b => {
      b.onclick = () => { reportOrder(E.improveSponsor(mySide, b.dataset.imp)); renderDom(true); };
    });
    sideWar.querySelectorAll('[data-aid]').forEach(b => {
      b.onclick = () => {
        const [sp, pk] = b.dataset.aid.split(':');
        reportOrder(E.requestAid(mySide, sp, pk));
        renderDom(true);
      };
    });
    sideWar.querySelectorAll('[data-dtype]').forEach(b => {
      b.onclick = () => {
        dirType = b.dataset.dtype;
        if (dirType === 'all_in') dirEffort = 'allin';
        renderSidePanel(true);
      };
    });
    sideWar.querySelectorAll('[data-deff]').forEach(b => {
      b.onclick = () => { dirEffort = b.dataset.deff; renderSidePanel(true); };
    });
    const dSel = $('#dirTargetSel');
    if (dSel) dSel.onchange = () => { dirTargetId = dSel.value; };
    const bDraw = $('#btnDrawLine');
    if (bDraw) bDraw.onclick = () => {
      drawLineMode = !drawLineMode;
      armedAction = null;
      document.body.classList.toggle('draw-line-mode', drawLineMode);
      notify(drawLineMode ? 'Зажмите ЛКМ и проведите линию наступления по карте' : 'Режим рисования отключён');
      renderDom(true);
    };
    const bClr = $('#btnClearPlan');
    if (bClr) bClr.onclick = () => { reportOrder(E.clearDrawnPlan(mySide)); renderDom(true); };
    const bExec = $('#btnExecDirective');
    if (bExec) bExec.onclick = () => {
      reportOrder(E.issueDirective(mySide, dirType, dirTargetId, dirType === 'all_in' ? 'allin' : dirEffort));
      renderDom(true);
    };
    sideWar.querySelectorAll('[data-siege]').forEach(b => {
      b.onclick = () => {
        reportOrder(E.runTkuarchalSiegeAction(mySide, b.dataset.siege));
        renderDom(true);
      };
    });
    const bPvp = $('#btnNextPvp');
    if (bPvp) bPvp.onclick = () => {
      armedAction = null; selectedDivIds.clear();
      const stNow = E.getState();
      const other = mySide === 'A' ? 'B' : 'A';
      if (stNow.pvpReady && stNow.pvpReady[other]) {
        E.resetPvpReady();
        E.setSpeed(1);
        notify('Оба командующих готовы — бой запущен в реальном времени (1×)!');
      } else {
        E.setPvpReady(mySide, true);
        E.setSpeed(0);
        E.setPvpSide(other);
        notify('Пауза · Передайте управление: ' + (other === 'A' ? 'Запад (А)' : 'Восток (Б)') + '!');
      }
      renderDom(true);
      AtlasMap.redrawOverlay();
    };
  }

  // ==================== SCENARIOS, EVENTS & VICTORY MODALS ====================
  let scenFilter = 'all';
  function classifyScenario(sc) {
    if (sc.category === 'blockade' || sc.id === 'tkuarchal_siege' || sc.id === 'gumista_split') return 'blockade';
    if (sc.crisisDays > 0) return 'crisis';
    if (sc.startDemarcation || sc.startCeasefireDays > 0) return 'peace';
    return 'front';
  }

  function openScenariosModal() {
    warDialogTitle.textContent = 'Сценарии конфликта (' + G.SCENARIOS.length + ')';
    warDialogBody.className = 'scenModal';
    const curId = E.getState()?.scenarioId;
    const filters = [
      { id: 'all', label: 'Все (' + G.SCENARIOS.length + ')' },
      { id: 'blockade', label: 'Блокада Ткуарчала' },
      { id: 'front', label: 'Боевые операции' },
      { id: 'crisis', label: 'Политкризис' },
      { id: 'peace', label: 'Миротворцы и заморозка' }
    ];
    const list = scenFilter === 'all' ? G.SCENARIOS : G.SCENARIOS.filter(sc => classifyScenario(sc) === scenFilter);

    warDialogBody.innerHTML = `
      <div class="modalFilterBar">
        ${filters.map(f => `<button type="button" class="filterPill ${scenFilter === f.id ? 'active' : ''}" data-sf="${f.id}">${f.label}</button>`).join('')}
      </div>
      <div class="scenGrid">
        ${list.map(sc => {
          const isBlock = classifyScenario(sc) === 'blockade';
          return `
            <button type="button" class="scenCard ${sc.id === curId ? 'active' : ''}" data-sc="${sc.id}">
              <div class="scenTop"><strong>${sc.title}</strong><span>${sc.tag}</span></div>
              <p>${sc.desc}</p>
              <div class="scenFoot">
                <span>${sc.difficulty}</span>
                <span>${isBlock ? 'Блокада Ткуарчала' : (sc.crisisDays ? 'Кризис ' + sc.crisisDays + ' дн.' : 'Сразу война')}</span>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    `;
    warDialogBody.querySelectorAll('[data-sf]').forEach(btn => {
      btn.onclick = () => { scenFilter = btn.dataset.sf; openScenariosModal(); };
    });
    warDialogBody.querySelectorAll('[data-sc]').forEach(btn => {
      btn.onclick = () => {
        armedAction = null; selectedDivIds.clear(); selectedCityId = null;
        lastVictorySig = null;
        if (victoryOverlay) victoryOverlay.hidden = true;
        E.initScenario(btn.dataset.sc);
        warDialog.close();
        notify('Сценарий выбран. Нажмите «Запустить», когда будете готовы.');
        renderDom(true);
      };
    });
    if (!warDialog.open) warDialog.showModal();
  }

  let guideTab = 'controls';
  function openGuideModal() {
    warDialogTitle.textContent = 'Как играть — Штаб Абхазии';
    warDialogBody.className = 'scenModal';
    const tabs = [
      { id: 'logistics', label: 'Пути, ЖД и Авиация' },
      { id: 'controls', label: 'Управление и бой' },
      { id: 'pvp', label: 'Игра вдвоём (1 на 1)' },
      { id: 'tkuarchal', label: 'Блокада Ткуарчала' }
    ];
    let content = '';
    if (guideTab === 'logistics') {
      content = `
        <div class="guideGrid">
          <div class="guideBox"><strong>Реальные дороги и ЖД-эшелоны (2.2×)</strong><p>Войска движутся строго по реальным трассам, горным тропам и Черноморской ЖД. По своей целой ЖД-ветке дивизии автоматически идут эшелонами в <b>2.2× быстрее</b> (метка <b>ЖД</b>).</p></div>
          <div class="guideBox"><strong>Подрыв мостов, завалы и блокпосты</strong><p>Кликните по середине любой дороги/моста на карте: можно поставить <b>Блокпост</b>, <b>Мины</b> или <b>Подорвать мост</b>. Взорванный мост полностью останавливает врага и <b>режет снабжение</b>. Восстанавливают <b>Сапёры (ИНЖ)</b>.</p></div>
          <div class="guideBox"><strong>Аэродромы (✈) и Вертолётные площадки (H)</strong><p>Авианалёты требуют целую ВПП (<b>Бомбора</b> или <b>Бабушара</b> >35%). Вертолётная эвакуация, десант ДРГ и <b>переброска пехоты/горных егерей</b> работают через исправные площадки <b>H</b>. Удары ОТРК/авиации выводят ВПП из строя!</p></div>
          <div class="guideBox"><strong>Снабжение и окружения (Котлы)</strong><p>Сектора снабжаются от границ (Псоу, Ингур, Чхалта) и портов по целым дорогам/ЖД. Отрезанные части получают метку <b>НЕТ БК</b> (−28% силы, нельзя пополнять по суше — только вертолётной ротацией).</p></div>
        </div>
      `;
    } else if (guideTab === 'pvp') {
      content = `
        <div class="guideStack">
          <div class="guideStep">
            <span class="stepNum">1</span>
            <div>
              <strong>Включите режим «1 на 1» в верхней панели</strong>
              <p>Нажмите кнопку <b>1 на 1</b> справа сверху — искусственный интеллект полностью отключится. Рядом появится переключатель сторон <b>А</b> (Запад), <b>Б</b> (Восток) и <b>ООН</b> (для третьего друга).</p>
            </div>
          </div>
          <div class="guideStep">
            <span class="stepNum">2</span>
            <div>
              <strong>Планируйте приказы на паузе (Space)</strong>
              <p>Поставьте время на паузу (<b>II</b> или клавиша <b>Space</b>). Сначала игрок за <b>Запад (А)</b> раздаёт приказы войскам, запускает удары, решения и политику.</p>
            </div>
          </div>
          <div class="guideStep">
            <span class="stepNum">3</span>
            <div>
              <strong>Нажмите «Готов → Ход Востока» и передайте управление другу</strong>
              <p>В верхней части левой панели нажмите <b>Готов → Ход Востока</b> (или выберите <b>Б</b> в HUD). Второй игрок отдаёт свои приказы Востоку.</p>
            </div>
          </div>
          <div class="guideStep">
            <span class="stepNum">4</span>
            <div>
              <strong>Запустите время (1× / 2×) и смотрите столкновение</strong>
              <p>Нажмите <b>1×</b> или <b>Space</b> — обе армии одновременно начнут выполнять приказы в реальном времени. В любой момент снова жмите <b>Space</b> для корректировки.</p>
            </div>
          </div>
        </div>
      `;
    } else if (guideTab === 'controls') {
      content = `
        <div class="guideGrid">
          <div class="guideBox"><strong>Выделение войск</strong><p><b>ЛКМ</b> по дивизии — выбрать одну (<b>Shift+ЛКМ</b> — добавить). <b>Зажатая ПКМ</b> — нарисовать рамку и выделить всю группу сразу.</p></div>
          <div class="guideBox"><strong>Приказ на марш / штурм</strong><p>С выделенными дивизиями сделайте короткий <b>ПКМ-клик</b> по карте или нажмите <b>Линия наступления</b> и проведите стрелку ЛКМ по фронту.</p></div>
          <div class="guideBox"><strong>Приказ Ставки (Авто-штаб)</strong><p>Не хотите двигать каждую фишку вручную? Вкладка <b>Армия → Приказ Ставки</b>: выберите цель и масштаб (35% / 60% / 85%) — штаб сам расставит ПВО, артиллерию и ударные части.</p></div>
          <div class="guideBox"><strong>Горячие клавиши</strong><p><b>Space</b> — пауза/пуск · <b>T</b> — светлая/тёмная тема · <b>B</b> — свернуть панель · <b>H</b> — эта справка · <b>Esc</b> — отмена прицеливания.</p></div>
        </div>
      `;
    } else {
      content = `
        <div class="guideStack">
          <div class="guideBox">
            <strong>Почему Ткуарчал в блокаде и гарнизон не идёт в наступление?</strong>
            <p>В сценариях <b>«Раскол по Гумисте»</b> и <b>«Блокада Ткуарчала»</b> шахтёрский город отрезан от Запада в глубоком тылу Востока (12 400 мирных жителей). Гарнизон заперт в горных тоннелях: он <b>не может идти в обычное наступление</b>, но имеет мощную оборону и постоянно <b>мешает Востоку вылазками ДРГ</b> — ворует вооружение, продовольствие и срывает тыловые колонны.</p>
          </div>
          <div class="guideGrid">
            <div class="guideBox">
              <strong class="cA">Как играть за Запад (А)</strong>
              <p>Поддерживайте город через <b>Вертолётный мост</b> (осторожно: ПВО Востока может сбить вертолёт!), бейте по тылу Востока кнопкой <b>Вылазка ДРГ</b> и прорывайтесь по суше через Дранду/Мыку или Чхалту, чтобы <b>прорвать блокаду</b>.</p>
            </div>
            <div class="guideBox">
              <strong class="cB">Как Востоку (Б) взять Ткуарчал</strong>
              <p>Лобовой штурм пехотой почти бесполезен, пока целы тоннели. Удерживайте 4 соседних сектора (чтобы падали запасы), используйте <b>Сжать кольцо</b>, удары <b>Арт-вал / ОТРК / Авиаудар</b> и подведите <b>Горных егерей / Сапёров</b>. Когда тоннели ≤45% или запасы ≤30%, запускайте <b>Штурм тоннелей</b> и забирайте город!</p>
            </div>
          </div>
        </div>
      `;
    }

    warDialogBody.innerHTML = `
      <div class="modalFilterBar">
        ${tabs.map(t => `<button type="button" class="filterPill ${guideTab === t.id ? 'active' : ''}" data-gt="${t.id}">${t.label}</button>`).join('')}
      </div>
      ${content}
    `;
    warDialogBody.querySelectorAll('[data-gt]').forEach(btn => {
      btn.onclick = () => { guideTab = btn.dataset.gt; openGuideModal(); };
    });
    if (!warDialog.open) warDialog.showModal();
  }

  const CAT_LABELS = {
    world: 'МИРОВЫЕ ДЕРЖАВЫ',
    secret: 'СЕКРЕТНАЯ ОПЕРАЦИЯ',
    un: 'ООН И ДИПЛОМАТИЯ',
    war: 'ФРОНТ И ПОТЕРИ',
    frontline: 'ЛИНИЯ ФРОНТА',
    homefront: 'ТЫЛ И ОБЩЕСТВО',
    regional: 'РЕГИОН И КАВКАЗ',
    diplomacy: 'ДИПЛОМАТИЯ ПРОТИВНИКА'
  };

  function visibleEvent() {
    const net = G.SupabaseNet;
    if (!gameEntered) return null;
    if ((E.getOnlineMode() || inviteCode && warDialog.open) && !net?.isOnlineMatch()) return null;
    return E.pendingEventForPlayer();
  }

  async function submitEventChoice(key, index) {
    if (submittedEventKey === key || visibleEvent()?.key !== key) return;
    submittedEventKey = key;
    renderEventModal();
    const result = await E.answerEvent(key, index);
    if (!result.ok && submittedEventKey === key) {
      submittedEventKey = null;
      notify(result.msg);
      renderEventModal();
    }
  }

  function updateEventCountdown() {
    const pe = visibleEvent();
    if (!pe || pe.key !== renderedEventKey) {
      renderEventModal();
      return;
    }
    const remMs = Math.max(0, pe.expiresAt - Date.now());
    const remSec = Math.ceil(remMs / 1000);
    const bar = eventOverlay.querySelector('.evTimerFill');
    const seconds = eventOverlay.querySelector('.evTimerSec');
    bar.style.width = Math.min(100, remMs / pe.durationMs * 100).toFixed(1) + '%';
    bar.classList.toggle('urgent', remSec <= 3);
    const label = remSec + ' с';
    if (seconds.textContent !== label) seconds.textContent = label;
    seconds.classList.toggle('urgent', remSec <= 3);
  }

  function renderEventModal() {
    if (!eventOverlay) return;
    const pe = visibleEvent();
    if (!pe) {
      if (!eventOverlay.hidden) eventOverlay.hidden = true;
      renderedEventKey = null;
      submittedEventKey = null;
      clearInterval(countdownTimer);
      countdownTimer = null;
      return;
    }
    const waiting = submittedEventKey === pe.key;
    if (renderedEventKey === pe.key) {
      for (const button of eventOverlay.querySelectorAll('[data-ev-choice]')) {
        if (button.disabled !== waiting) button.disabled = waiting;
      }
      return;
    }
    renderedEventKey = pe.key;

    const ev = pe.event;
    const isSecret = ev.visibility === 'secret';
    const targetSide = E.getOnlineMode() ? playerSide() : pe.targetSide;
    const sideLabel = targetSide === 'A' ? 'Запад (А)' : 'Восток (Б)';
    const catLabel = CAT_LABELS[ev.cat] || 'СВОДКА ШТАБА';

    eventOverlay.className = 'eventBannerWrap';
    eventOverlay.innerHTML = `
      <div class="eventBanner ${isSecret ? 'isSecret' : 'isBoth'}" role="region" aria-label="${escapeHtml(ev.title)}">
        <div class="evTimerTrack"><i class="evTimerFill"></i></div>
        <div class="evBannerTop">
          <div class="evBadges">
            <span class="eventBadge ${isSecret ? 'secret' : 'both'}">${isSecret ? 'СЕКРЕТНО · ' + sideLabel : 'СРОЧНО · ' + sideLabel}</span>
            <span class="eventCat">${catLabel}</span>
          </div>
          <span class="evTimerSec" title="Осталось времени на решение"></span>
        </div>
        <div class="evBannerBody">
          <strong class="evBannerTitle">${escapeHtml(ev.title)}</strong>
          <p class="evBannerText">${escapeHtml(ev.text)}</p>
        </div>
        <div class="evBannerChoices">
          ${ev.choices.map((ch, idx) => `
            <button type="button" class="evChoicePill" data-ev-choice="${idx}">
              <kbd>${idx + 1}</kbd><span>${escapeHtml(ch.label)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
    eventOverlay.hidden = false;
    eventOverlay.querySelectorAll('[data-ev-choice]').forEach(btn => {
      btn.onclick = () => submitEventChoice(pe.key, Number(btn.dataset.evChoice));
    });
    updateEventCountdown();
    if (!countdownTimer) countdownTimer = setInterval(updateEventCountdown, 160);
  }

  function renderVictoryModal() {
    if (!victoryOverlay) return;
    const st = E.getState();
    if (!st || st.status !== 'finished') {
      if (!victoryOverlay.hidden) victoryOverlay.hidden = true;
      lastVictorySig = null;
      return;
    }
    const sig = st.scenarioId + '_' + st.day + '_' + st.winner;
    if (lastVictorySig === sig && !victoryOverlay.hidden) return;
    lastVictorySig = sig;

    const vp = E.computeControlStats(st);
    const divsA = st.divisions.filter(d => d.side === 'A').length;
    const divsB = st.divisions.filter(d => d.side === 'B').length;
    const headline = st.winner === 'A' ? 'Победа Западного блока'
      : st.winner === 'B' ? 'Победа Восточного блока'
      : 'Ничья по итогам соглашения';

    victoryOverlay.innerHTML = `
      <div class="eventModal isBoth" role="dialog" aria-modal="true" aria-label="${headline}">
        <div class="eventHead">
          <span class="eventBadge both">КАМПАНИЯ ЗАВЕРШЕНА · ДЕНЬ ${st.day}</span>
          <span class="eventCat">${st.scenarioTitle}</span>
        </div>
        <h3 class="eventTitle">${headline}</h3>
        <div class="kpiStrip" style="margin:12px 0">
          <div><small>Запад (А)</small><b class="cA">${vp.vpA} ОП · ${divsA} див.</b></div>
          <div><small>Восток (Б)</small><b class="cB">${vp.vpB} ОП · ${divsB} див.</b></div>
          <div><small>Длительность</small><b>${st.day} дн.</b></div>
        </div>
        <div class="cmdGrid">
          <button type="button" class="warBtn primary" id="btnReplayScen">Переиграть сценарий</button>
          <button type="button" class="warBtn" id="btnPickScen">Выбрать другой сценарий</button>
        </div>
      </div>
    `;
    victoryOverlay.hidden = false;
    $('#btnReplayScen').onclick = () => {
      lastVictorySig = null;
      victoryOverlay.hidden = true;
      E.initScenario(st.scenarioId);
      renderDom(true);
    };
    $('#btnPickScen').onclick = () => {
      victoryOverlay.hidden = true;
      openScenariosModal();
    };
  }

  function armMapAction(action) {
    armedAction = action;
    multiSelect = false;
    if ($('#side').classList.contains('open')) $('#sideClose').click();
    $('#map').focus({ preventScroll: true });
    renderDom(true);
  }

  const commandBar = $('#mapCommand');
  const commandButton = $('#mapCommandAction');
  const commandLabel = $('#mapCommandLabel');
  function renderMapCommand() {
    const state = E.getState();
    const own = state.divisions.filter(d => d.side === playerSide());
    const selected = own.filter(d => selectedDivIds.has(d.id));
    const candidate = own.find(d => !E.isTrappedInTkuarchal(d)) || own[0];
    const blocked = selected.length > 0 && selected.every(d => E.isTrappedInTkuarchal(d));
    commandBar.hidden = !candidate || !!visibleEvent() || state.status === 'finished';
    if (commandBar.hidden) return;
    const prompts = { march: 'Выберите точку назначения', recruit: 'Выберите свой город', airlift: 'Выберите площадку', strike: 'Выберите точку на карте' };
    const label = armedAction ? prompts[armedAction.type] : selected.length > 1 ? 'Выбрано: ' + selected.length
      : selected[0]?.name || (selectedCityId && G.SECTOR_MAP[selectedCityId]?.name) || 'Выберите подразделение';
    const action = armedAction ? 'Отменить выбор' : selected.length ? 'Переместить' : 'К подразделению';
    if (commandLabel.textContent !== label) commandLabel.textContent = label;
    if (commandButton.textContent !== action) commandButton.textContent = action;
    commandButton.disabled = !armedAction && (blocked || (selected.length > 0 && state.phase === 'crisis'));
    if (commandButton.disabled) commandLabel.textContent = blocked ? 'Подразделение в блокаде' : 'Перемещение откроется после кризиса';
    commandButton.onclick = () => {
      if (armedAction) { armedAction = null; renderDom(true); }
      else if (selected.length) armMapAction({ type: 'march' });
      else {
        selectedDivIds.clear();
        selectedDivIds.add(candidate.id);
        selectedCityId = selectedCorridorKey = null;
        currentTab = 'army';
        AtlasMap.flyTo(candidate.x, candidate.y, 1.8);
        AtlasMap.redrawOverlay();
        renderDom(true);
      }
    };
  }

  function renderDom(force = false) {
    if (!active || !gameEntered) return;
    renderEventModal();
    renderVictoryModal();
    if (!force && uiPointerDown) return;
    const activeTag = document.activeElement && document.activeElement.tagName;
    const interacting = !force && (activeTag === 'SELECT' || activeTag === 'INPUT');

    const now = performance.now();
    if (force || now - lastHudRender >= 380) {
      lastHudRender = now;
      renderHud();
      renderMapCommand();
    }
    if (!interacting && (force || now - lastSideRender >= 950)) {
      lastSideRender = now;
      renderSidePanel(force);
    }
  }

  E.subscribe(() => {
    if (!active) return;
    AtlasMap.redrawOverlay();
    if (!renderFrame) renderFrame = requestAnimationFrame(() => {
      renderFrame = null;
      renderDom(false);
    });
  });

  // ==================== ONLINE 1v1 MULTIPLAYER LOBBY (SUPABASE ANTI-CHEAT) ====================
  let onlineShowSetup = false;
  let onlineName = '';
  let onlineScenarioId = '';
  let onlineIntent = inviteCode ? 'join' : 'create';
  let onlineJoinCode = inviteCode || '';
  let onlineError = '';
  let onlineBusy = false;

  try { onlineName = localStorage.getItem('abkhazia_player_name') || ''; } catch (e) {}

  function syncHeaderOnlineBadge() {
    const dot = $('#onlineDot');
    const lbl = $('#onlineLabel');
    const net = G.SupabaseNet;
    if (!dot || !lbl || !net) return;
    const sess = net.getSession();
    if (sess && sess.status === 'active') {
      dot.className = 'onlineDot live';
      lbl.textContent = sess.roomCode + ' · ' + (sess.side === 'A' ? 'А' : 'Б');
    } else if (sess && sess.status === 'lobby') {
      dot.className = 'onlineDot wait';
      lbl.textContent = 'Лобби ' + sess.roomCode;
    } else if (net.isConnected()) {
      dot.className = 'onlineDot ok';
      lbl.textContent = 'Онлайн 1×1';
    } else {
      dot.className = 'onlineDot';
      lbl.textContent = 'Онлайн 1×1';
    }
  }

  function normalizeInvite(value) {
    let code = value.trim();
    if (/[?/:]/.test(code)) {
      try { code = new URL(code, location.href).searchParams.get('room') || ''; }
      catch { return ''; }
    }
    code = code.trim().toUpperCase();
    if (/^[A-Z0-9]{4,6}$/.test(code)) code = 'ABK-' + code;
    return /^ABK-[A-Z0-9]{4,6}$/.test(code) ? code : '';
  }

  function selectedOnlineScenario() {
    return G.getScenario(onlineScenarioId || E.getState()?.scenarioId || 'gumista_split');
  }

  function scenarioPreview() {
    const scenario = selectedOnlineScenario();
    return `<strong>${escapeHtml(scenario.title)}</strong><span>${escapeHtml(scenario.tag)} · ${escapeHtml(scenario.difficulty)}</span>`;
  }

  function renderOnlineEntry(net, connected) {
    const join = onlineIntent === 'join';
    const cfg = net.loadConfig();
    const saved = net.getSavedRoom();
    const busyLabel = join ? 'Входим…' : 'Создаём…';
    return `
      ${connected ? `
        <div class="onlineSwitch" role="group" aria-label="Как начать онлайн-матч">
          <button type="button" data-online-intent="create" aria-pressed="${!join}" ${onlineBusy ? 'disabled' : ''}>Создать комнату</button>
          <button type="button" data-online-intent="join" aria-pressed="${join}" ${onlineBusy ? 'disabled' : ''}>Войти по приглашению</button>
        </div>
        <p class="onlineIntro">${join
          ? 'Вы играете за Восток (Б). Вставьте ссылку или код, который прислал друг.'
          : 'Вы играете за Запад (А). Выберите сценарий, затем отправьте другу приглашение.'}</p>
        <form id="onlineEntryForm" aria-busy="${Boolean(onlineBusy)}">
          <fieldset ${onlineBusy ? 'disabled' : ''}>
            <label class="onlineField"><span>Ваш позывной</span><input id="onPlayerName" type="text" maxlength="28" placeholder="${join ? 'Командующий Востока' : 'Командующий Запада'}" value="${escapeHtml(onlineName)}"></label>
            ${join ? `
              <label class="onlineField"><span>Код или ссылка-приглашение</span><input id="onRoomCode" type="text" spellcheck="false" autocomplete="off" autocapitalize="characters" placeholder="ABK-7K9P" value="${escapeHtml(onlineJoinCode)}" aria-describedby="onlineFeedback"></label>
            ` : `
              <label class="onlineField"><span>Сценарий</span><select id="onScenSelect" aria-describedby="onlineScenarioPreview">
                ${G.SCENARIOS.map(sc => `<option value="${escapeHtml(sc.id)}" ${sc.id === selectedOnlineScenario().id ? 'selected' : ''}>${escapeHtml(sc.title)}</option>`).join('')}
              </select></label>
              <div id="onlineScenarioPreview" class="onlineScenarioPreview">${scenarioPreview()}</div>
            `}
          </fieldset>
          <p id="onlineFeedback" class="onlineFeedback" role="alert" ${onlineError ? '' : 'hidden'}>${escapeHtml(onlineError)}</p>
          <button type="submit" class="warBtn primary onlineMainAction" id="${join ? 'btnJoinRoom' : 'btnCreateRoom'}" ${onlineBusy ? 'disabled' : ''}>${onlineBusy ? busyLabel : join ? 'Войти в комнату' : 'Создать комнату'}</button>
        </form>
      ` : '<p class="onlineIntro">Для онлайн-матча нужно подключение к серверу.</p>'}
      ${saved && connected ? `<button type="button" class="warBtn" id="btnRestoreOnline" ${onlineBusy ? 'disabled' : ''}>Вернуться в комнату ${escapeHtml(saved.roomCode)} · ${saved.side === 'A' ? 'Запад' : 'Восток'}</button>` : ''}
      <details class="onlineSettings" ${onlineShowSetup || !connected ? 'open' : ''}>
        <summary>Настройки подключения</summary>
        <form id="onlineSettingsForm">
          <label class="onlineField"><span>Адрес Supabase</span><input id="sbUrl" type="url" required value="${escapeHtml(cfg.url)}" placeholder="https://project.supabase.co"></label>
          <label class="onlineField"><span>Публичный ключ Supabase</span><input id="sbKey" type="password" required autocomplete="off" value="${escapeHtml(cfg.key)}"></label>
          <p id="onlineSettingsError" class="onlineFeedback" role="alert" hidden></p>
          <button type="submit" class="warBtn" ${onlineBusy ? 'disabled' : ''}>Сохранить подключение</button>
        </form>
      </details>
    `;
  }

  function renderOnlineRoom(net, session) {
    const host = session.side === 'A';
    const lobby = session.status === 'lobby';
    const ready = Boolean(session.hostName && session.guestName);
    const status = !lobby ? (session.status === 'active' ? 'Матч идёт' : 'Матч завершён')
      : ready ? 'Оба игрока в комнате' : 'Ожидание игрока';
    const slot = (side, name) => {
      const own = session.side === side;
      const west = side === 'A';
      return `<div class="onlineSlot ${name ? '' : 'isEmpty'}">
        <span class="onlineSideLetter ${west ? 'sideA' : 'sideB'}">${west ? 'А' : 'Б'}</span>
        <div><small>${west ? 'Запад' : 'Восток'}${own ? ' · Вы' : ''}</small>
        <strong>${escapeHtml(name || 'Свободное место')}</strong></div>
      </div>`;
    };
    return `
      <div class="onlineRoomTitle">
        <div><span>Комната</span><strong>${escapeHtml(session.roomCode)}</strong></div>
        <span class="onlineRoomStatus ${ready ? 'isReady' : ''}" role="status">${status}</span>
      </div>
      <div class="onlineScenarioPreview"><span>Сценарий матча</span><strong>${escapeHtml(session.scenarioTitle)}</strong></div>
      <div class="onlinePlayersRow">${slot('A', session.hostName)}${slot('B', session.guestName)}</div>
      ${host || lobby ? `
        <div class="onlineInviteBox">
          <label class="onlineField" for="inviteUrlInput"><span>Ссылка для друга</span></label>
          <div class="inviteRow">
            <input type="text" readonly id="inviteUrlInput" value="${escapeHtml(net.getInviteUrl())}" aria-label="Ссылка для друга">
            <button type="button" class="warBtn" id="btnCopyInvite">${icon('copy')}<span>Копировать</span></button>
          </div>
          <p id="inviteFeedback" class="onlineIntro" role="status" hidden></p>
        </div>
      ` : ''}
      ${lobby ? `<p class="onlineIntro">${host
        ? (ready ? 'Можно начинать матч.' : 'Отправьте ссылку другу. Когда он войдёт, появится возможность начать матч.')
        : 'Вы подключены. Матч начнётся, когда создатель комнаты нажмёт «Начать матч».'}</p>` : ''}
      <p id="onlineFeedback" class="onlineFeedback" role="alert" ${onlineError ? '' : 'hidden'}>${escapeHtml(onlineError)}</p>
      <div class="onlineRoomActions">
        <button class="warBtn onlineLeave" id="btnLeaveOnline" type="button" ${onlineBusy ? 'disabled' : ''}>Выйти из комнаты</button>
        ${lobby && host ? `<button class="warBtn primary" type="button" id="btnStartOnline" ${!ready || onlineBusy ? 'disabled' : ''}>${onlineBusy ? 'Запускаем…' : 'Начать матч'}</button>` : ''}
        ${!lobby ? '<button class="warBtn primary" id="btnResumeOnline" type="button">Вернуться на карту</button>' : ''}
      </div>
    `;
  }

  async function withOnlineAction(action, run) {
    if (onlineBusy) return;
    onlineError = '';
    onlineBusy = true;
    openOnlineModal();
    try {
      await run();
    } catch (error) {
      const message = error.message || '';
      onlineError = /fetch|network|timeout/i.test(message)
        ? 'Нет ответа от сервера. Проверьте подключение и повторите попытку.'
        : message || 'Не удалось ' + action + '. Попробуйте ещё раз.';
    } finally {
      onlineBusy = false;
      syncHeaderOnlineBadge();
      if (warDialog.open && warDialogBody.classList.contains('onlineModal')) openOnlineModal();
      if (!gameEntered) renderEntry();
      renderDom(true);
    }
  }

  async function copyOnlineInvite() {
    const input = $('#inviteUrlInput');
    if (!input) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(input.value);
      copied = true;
    } catch {
      input.select();
      try { copied = document.execCommand('copy'); } catch {}
    }
    const feedback = $('#inviteFeedback');
    if (feedback) {
      feedback.textContent = copied ? 'Ссылка скопирована.' : 'Ссылка выделена. Скопируйте её вручную.';
      feedback.hidden = false;
    }
  }

  async function enterOnline(restore = false) {
    const net = G.SupabaseNet;
    if (!net.isConnected()) {
      warDialogTitle.textContent = 'Играть вдвоём';
      warDialogBody.className = 'onlineLoading';
      warDialogBody.textContent = 'Подключаем онлайн-модуль…';
      if (!warDialog.open) warDialog.showModal();
      try {
        await net.prepareOnline();
      } catch (error) {
        if (!warDialog.open || !warDialogBody.classList.contains('onlineLoading')) return;
        const retry = document.createElement('button');
        retry.className = 'warBtn';
        retry.textContent = 'Повторить';
        retry.onclick = () => enterOnline(restore);
        warDialogBody.replaceChildren(error.message + ' ', retry);
        return;
      }
      if (!warDialog.open || !warDialogBody.classList.contains('onlineLoading')) return;
    }
    openOnlineModal();
    if (restore && net.isConnected()) restoreOnlineRoom();
  }

  function openOnlineModal() {
    const net = G.SupabaseNet;
    if (!net) { notify('Онлайн-режим недоступен'); return; }
    const session = net.getSession();
    const connected = net.isConnected();
    const focusId = warDialogBody.contains(document.activeElement) ? document.activeElement.id : null;
    warDialogTitle.textContent = 'Онлайн-матч 1×1';
    warDialogBody.className = 'scenModal onlineModal';
    warDialogBody.innerHTML = session ? renderOnlineRoom(net, session) : renderOnlineEntry(net, connected);
    if (!warDialog.open) warDialog.showModal();
    else if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });

    const form = $('#onlineEntryForm');
    if (form) {
      $('#onPlayerName').oninput = e => { onlineName = e.target.value; };
      const codeInput = $('#onRoomCode');
      if (codeInput) codeInput.oninput = e => {
        onlineJoinCode = e.target.value;
        onlineError = '';
        $('#onlineFeedback').hidden = true;
        e.target.removeAttribute('aria-invalid');
      };
      const select = $('#onScenSelect');
      if (select) select.onchange = e => {
        onlineScenarioId = e.target.value;
        $('#onlineScenarioPreview').innerHTML = scenarioPreview();
      };
      form.onsubmit = e => {
        e.preventDefault();
        const join = onlineIntent === 'join';
        const code = join ? normalizeInvite(onlineJoinCode) : '';
        if (join && !code) {
          onlineError = 'Введите код ABK-7K9P или вставьте ссылку-приглашение.';
          const feedback = $('#onlineFeedback');
          feedback.textContent = onlineError;
          feedback.hidden = false;
          codeInput.setAttribute('aria-invalid', 'true');
          codeInput.focus();
          return;
        }
        const name = onlineName.trim() || (join ? 'Командующий Востока' : 'Командующий Запада');
        try { localStorage.setItem('abkhazia_player_name', onlineName.trim()); } catch {}
        if (join) onlineJoinCode = code;
        const scenario = selectedOnlineScenario();
        withOnlineAction(join ? 'войти в комнату' : 'создать комнату', async () => {
          const previousState = E.getState();
          const previousRole = E.getRole();
          const previousSpeed = E.getSpeed();
          try {
            if (join) {
              E.setSpeed(0);
              E.setOnlineMode('guest', 'B');
              const joined = await net.joinRoom(code, name);
              if (E.getState()?.scenarioId !== joined.scenarioId) E.initScenario(joined.scenarioId);
              E.setSpeed(joined.status === 'active' ? joined.speed : 0);
              if (joined.status === 'active') {
                if (warDialogBody.classList.contains('onlineModal')) warDialog.close();
                showGame();
              }
            } else {
              E.setOnlineMode('host', 'A');
              const initial = E.initScenario(scenario.id);
              await net.createRoom(scenario.id, scenario.title, name, { ...initial, popups: [] });
            }
          } catch (error) {
            E.setOnlineMode(null);
            if (previousState && E.getState() !== previousState) E.applyRemoteState(previousState);
            E.setRole(previousRole);
            E.setSpeed(previousSpeed);
            throw error;
          }
        });
      };
    }
    warDialogBody.querySelectorAll('[data-online-intent]').forEach(button => {
      button.onclick = () => {
        if (onlineIntent === button.dataset.onlineIntent) return;
        onlineIntent = button.dataset.onlineIntent;
        onlineError = '';
        openOnlineModal();
        warDialogBody.querySelector('[aria-pressed="true"]')?.focus();
      };
    });

    const settingsForm = $('#onlineSettingsForm');
    if (settingsForm) {
      settingsForm.closest('details').ontoggle = e => { onlineShowSetup = e.target.open; };
      settingsForm.onsubmit = e => {
        e.preventDefault();
        if (onlineBusy) return;
        const url = $('#sbUrl').value.trim();
        const key = $('#sbKey').value.trim();
        if (url && key && net.saveConfig(url, key)) {
          onlineShowSetup = false;
          syncHeaderOnlineBadge();
          openOnlineModal();
        } else {
          const feedback = $('#onlineSettingsError');
          feedback.textContent = 'Не удалось подключиться. Проверьте адрес и публичный ключ.';
          feedback.hidden = false;
        }
      };
    }
    const copy = $('#btnCopyInvite');
    if (copy) copy.onclick = copyOnlineInvite;
    const start = $('#btnStartOnline');
    if (start) start.onclick = () => withOnlineAction('начать матч', () => net.startMatch({ ...E.getState(), popups: [] }));
    const restore = $('#btnRestoreOnline');
    if (restore) restore.onclick = restoreOnlineRoom;
    const resume = $('#btnResumeOnline');
    if (resume) resume.onclick = () => { warDialog.close(); showGame(); };
    const leave = $('#btnLeaveOnline');
    if (leave) leave.onclick = () => {
      if (!window.confirm('Выйти из комнаты ' + session.roomCode + '? Сохранённый вход на этом устройстве будет удалён.')) return;
      net.leaveRoom();
      E.setOnlineMode(null);
      E.initScenario(E.getState().scenarioId);
      onlineError = '';
      onlineJoinCode = '';
      onlineIntent = 'create';
      warDialog.close();
      notify('Вы вышли из онлайн-комнаты');
      showEntry();
    };
  }

  // Wire Supabase Realtime callbacks -> Engine & UI
  if (G.SupabaseNet) {
    G.SupabaseNet.onCommand(cmd => {
      E.executeRemoteCommand(cmd);
    });
    G.SupabaseNet.onSnapshot((snap, roomRow) => {
      syncGuestMotion(G.SupabaseNet.getSession());
      const speed = roomRow.status === 'active' ? roomRow.speed : 0;
      seedGuestMotion(snap, speed);
      E.applyRemoteState(snap, { ...roomRow, speed });
    });
    G.SupabaseNet.onMotion(frame => {
      if (!guestMatchId) return;
      guestMotion.accept(frame, performance.now(), true);
      AtlasMap.redrawOverlay();
    });
    G.SupabaseNet.onRoom(sess => {
      syncGuestMotion(sess);
      syncHeaderOnlineBadge();
      if (!sess) return;
      localSession = false;
      if (!gameEntered) renderEntry();
      if (sess.status === 'active' && sess.prevStatus === 'lobby') {
        E.setOnlineMode(sess.side === 'A' ? 'host' : 'guest', sess.side);
        E.setSpeed(sess.speed);
        if (sess.side === 'A') {
          G.SupabaseNet.startHostSyncLoop(E.getState, E.getMotionFrame);
        }
        if (warDialog.open) warDialog.close();
        showGame();
        notify('Матч начался! Сценарий: ' + sess.scenarioTitle);
        renderDom(true);
      } else if (sess.status === 'active' && sess.speedChanged) {
        if (E.getSpeed() !== sess.speed) E.setSpeed(sess.speed);
        renderDom(true);
      } else if (warDialog.open && warDialogBody.classList.contains('onlineModal')) {
        openOnlineModal();
      }
    });
    G.SupabaseNet.onStatus(() => syncHeaderOnlineBadge());
    G.SupabaseNet.onLateReceipt(notify);
    G.SupabaseNet.onSyncError(message => notify('Синхронизация: ' + message));

    if (inviteCode) setTimeout(() => {
      if (!gameEntered && !warDialog.open) enterOnline();
    }, 350);
  }

  function restoreOnlineRoom() {
    const net = G.SupabaseNet;
    withOnlineAction('вернуться в комнату', async () => {
      const restored = await net.tryRestoreSession();
      if (!restored) throw new Error('Не удалось восстановить комнату. Проверьте подключение или откройте приглашение.');
      E.setOnlineMode(restored.side === 'A' ? 'host' : 'guest', restored.side);
      if (restored.stateJson?.scenarioId === restored.scenarioId) {
        if (restored.side === 'B') {
          syncGuestMotion(restored);
          seedGuestMotion(restored.stateJson, restored.speed);
        }
        E.applyRemoteState(restored.stateJson);
      } else {
        E.initScenario(restored.scenarioId);
      }
      E.setSpeed(restored.status === 'active' ? restored.speed : 0);
      if (restored.side === 'A' && restored.status === 'active') {
        net.startHostSyncLoop(E.getState, E.getMotionFrame);
      }
      net.resumeRoom();
      if (restored.status === 'active') {
        warDialog.close();
        showGame();
      }
    });
  }

  $('#modeToggle').onclick = showEntry;

  const onlineBtn = $('#onlineToggle');
  if (onlineBtn) onlineBtn.onclick = () => enterOnline();

  const guideBtn = $('#guideToggle');
  if (guideBtn) guideBtn.onclick = openGuideModal;
  window.addEventListener('keydown', e => {
    if (!active || warDialog.open || visibleEvent() || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key.toLowerCase() === 'h' || e.key.toLowerCase() === 'р')) {
      openGuideModal();
    }
  });

  bootGame();

  return { bootGame, openScenariosModal, openGuideModal };
})();
