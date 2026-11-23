"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};

// ============================================================================
// ANTI-CHEAT REAL-TIME MULTIPLAYER ADAPTER (SUPABASE REALTIME + ATOMIC RPC)
// - Works seamlessly on GitHub Pages with @supabase/supabase-js CDN
// - Zero direct table writes: every action authenticated by 256-bit player_token
// - Invite link support (?room=ABK-XXXX) & F5 session auto-reconnect
// - Realtime updates with periodic recovery for missed room and command messages
// ============================================================================
window.AbkhaziaGame.SupabaseNet = (() => {
  const CFG_KEY = 'abkhazia_supabase_cfg_v2';
  const SESSION_KEY = 'abkhazia_online_session_v2';
  const MOTION_EVENT = 'unit-positions-v1';
  const SIGN_ALGORITHM = { name: 'ECDSA', hash: 'SHA-256' };
  const textEncoder = new TextEncoder();

  let client = null;
  let channel = null;
  let pollTimer = null;
  let pushTimer = null;
  let pushSoon = null;
  let pushBusy = false;
  let queuedState = null;
  let lastPublished = null;
  let realtimeReady = false;
  let pollInFlight = null;
  let lastRoomUpdate = '';
  let roomGeneration = 0;
  let roomEventReceivedAt = 0;
  let lastCommandRecoveryAt = 0;
  let motionTimer = null;
  let getHostMotion = null;
  let motionSigner = null;
  let motionVerifier = null;
  let motionPublicKey = null;
  let motionSendBusy = false;
  let motionSeq = 0;
  let lastMotionSeq = 0;
  let lastMotionBody = null;

  let session = null; // { matchId, roomCode, side: 'A'|'B', token, scenarioId, scenarioTitle, status, hostName, guestName, speed, pausedBy }
  let localSeq = 0;
  let lastAppliedSeq = 0;
  let processedCmdIds = new Set();
  let pendingAckIds = new Set();

  let onStatusChange = () => {};
  let onRemoteCommand = () => {};
  let onRemoteSnapshot = () => {};
  let onRemoteMotion = () => {};
  let onRoomUpdate = () => {};
  let onSyncError = () => {};
  let lastReportedError = '';

  function getDefaultConfig() {
    const g = window.ABKHAZIA_SUPABASE_CONFIG || {};
    return { url: (g.url || '').trim(), key: (g.anonKey || '').trim() };
  }

  function loadConfig() {
    const def = getDefaultConfig();
    if (def.url && def.key) return def;
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.url && parsed.key) return { url: parsed.url.trim(), key: parsed.key.trim() };
      }
    } catch (e) {}
    return def;
  }

  function saveConfig(url, key) {
    const clean = { url: (url || '').trim(), key: (key || '').trim() };
    try { localStorage.setItem(CFG_KEY, JSON.stringify(clean)); } catch (e) {}
    return connect(clean.url, clean.key);
  }

  function readStoredSession(storage) {
    try { return JSON.parse(globalThis[storage]?.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function forgetSavedSession(saved) {
    if (!saved) return;
    for (const storage of ['sessionStorage', 'localStorage']) {
      const current = readStoredSession(storage);
      if (current?.matchId === saved.matchId && current.token === saved.token) {
        try { globalThis[storage].removeItem(SESSION_KEY); } catch {}
      }
    }
  }

  function saveSession(sess) {
    const previous = session;
    session = sess;
    if (!sess) {
      forgetSavedSession(previous);
      return;
    }
    // Keep each tab's seat across refreshes, and a fallback for a fresh visit.
    try { globalThis.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(sess)); } catch {}
    const fallback = readStoredSession('localStorage');
    if (previous && fallback && fallback.token !== previous.token) return;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(sess)); } catch {}
  }

  function loadSavedSession() {
    return readStoredSession('sessionStorage') || readStoredSession('localStorage');
  }

  function getSavedRoom() {
    const saved = loadSavedSession();
    if (!saved?.matchId || !saved?.token || !saved?.roomCode) return null;
    if (saved.status === 'finished') return null;
    return { roomCode: saved.roomCode, side: saved.side };
  }

  function isSdkAvailable() {
    return typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function';
  }

  function connect(url, key) {
    if (!url || !key) {
      client = null;
      onStatusChange({ connected: false, msg: 'Укажите URL и Anon Key проекта Supabase' });
      return false;
    }
    if (!isSdkAvailable()) {
      client = null;
      onStatusChange({ connected: false, msg: 'Библиотека Supabase не загружена (проверьте интернет)' });
      return false;
    }
    try {
      client = window.supabase.createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 12 } }
      });
      onStatusChange({ connected: true, msg: 'Supabase подключён' });
      return true;
    } catch (e) {
      client = null;
      onStatusChange({ connected: false, msg: 'Ошибка подключения: ' + e.message });
      return false;
    }
  }

  function getInviteUrl() {
    if (!session || !session.roomCode) return '';
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('room', session.roomCode);
      return u.toString();
    } catch (e) {
      return window.location.origin + window.location.pathname + '?room=' + session.roomCode;
    }
  }

  function getUrlRoomCode() {
    try {
      const u = new URL(window.location.href);
      const r = u.searchParams.get('room');
      return r ? r.trim().toUpperCase() : '';
    } catch (e) { return ''; }
  }

  function clearUrlRoomCode() {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has('room')) {
        u.searchParams.delete('room');
        window.history.replaceState({}, '', u.toString());
      }
    } catch (e) {}
  }

  function resetRoomSync() {
    roomGeneration++;
    stopHostSyncLoop();
    clearTimeout(pollTimer);
    pollTimer = null;
    if (client && channel) client.removeChannel(channel).catch(() => {});
    channel = null;
    realtimeReady = false;
    pollInFlight = null;
    roomEventReceivedAt = 0;
    lastCommandRecoveryAt = 0;
    motionSigner = null;
    motionVerifier = null;
    motionPublicKey = null;
    motionSendBusy = false;
    motionSeq = 0;
    lastMotionSeq = 0;
    lastMotionBody = null;
    lastRoomUpdate = '';
    lastPublished = null;
    lastReportedError = '';
    queuedState = null;
    pushBusy = false;
    localSeq = 0;
    lastAppliedSeq = 0;
    processedCmdIds.clear();
    pendingAckIds.clear();
  }

  function subscribeRoom(currentSession) {
    const generation = roomGeneration;
    const matchId = currentSession.matchId;
    const isHost = currentSession.side === 'A';
    const roomFields = isHost
      ? 'id,status,host_name,guest_name,speed,paused_by,scenario_id,scenario_title,seq,updated_at'
      : '*';
    channel = client.channel('abk_room_' + matchId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'online_rooms', filter: 'id=eq.' + matchId }, ({ new: row }) => {
        if (roomGeneration !== generation || !row) return;
        roomEventReceivedAt = Date.now();
        handleRoomRow(row);
      });
    if (isHost) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'online_commands', filter: 'match_id=eq.' + matchId }, ({ new: cmd }) => {
        if (roomGeneration === generation) handleIncomingCommand(cmd);
      });
    } else {
      channel.on('broadcast', { event: MOTION_EVENT }, ({ payload }) => receiveMotion(payload));
    }
    channel.subscribe(status => {
      if (roomGeneration !== generation) return;
      realtimeReady = status === 'SUBSCRIBED';
      if (realtimeReady) {
        lastMotionBody = null;
        poll();
      }
    });

    function poll() {
      if (roomGeneration !== generation) return Promise.resolve();
      if (pollInFlight) return pollInFlight;
      clearTimeout(pollTimer);
      pollInFlight = (async () => {
        const now = Date.now();
        const fetchRoom = !realtimeReady || now - roomEventReceivedAt >= 5000;
        const fetchCommands = isHost && session.status === 'active' &&
          (!realtimeReady || now - lastCommandRecoveryAt >= 5000);
        const queries = [];
        if (fetchRoom) queries.push((async () => {
          const { data } = await client.from('online_rooms').select(roomFields).eq('id', matchId).single();
          if (roomGeneration === generation && data) handleRoomRow(data);
        })());
        if (fetchCommands) queries.push((async () => {
          const { data } = await client.from('online_commands')
            .select('id,side,action,payload').eq('match_id', matchId).eq('processed', false)
            .order('id', { ascending: true }).limit(30);
          if (roomGeneration !== generation || !data) return;
          lastCommandRecoveryAt = now;
          for (const cmd of data) handleIncomingCommand(cmd);
        })());
        await Promise.allSettled(queries);
      })().finally(() => {
        if (roomGeneration !== generation) return;
        pollInFlight = null;
        if (session.status === 'finished') return;
        pollTimer = setTimeout(poll, realtimeReady ? 2100 : (isHost || session.status !== 'active' ? 1100 : 750));
      });
      return pollInFlight;
    }

    return poll();
  }

  function handleRoomRow(row) {
    if (!session || row.id !== session.matchId) return;
    if (row.updated_at && row.updated_at < lastRoomUpdate) return;
    if (row.updated_at) lastRoomUpdate = row.updated_at;
    localSeq = Math.max(localSeq, Number(row.seq) || 0);
    const prevStatus = session.status;
    const speedChanged = session.speed !== row.speed || session.pausedBy !== row.paused_by;
    if (prevStatus !== row.status || speedChanged ||
        session.hostName !== row.host_name || session.guestName !== row.guest_name ||
        session.scenarioId !== row.scenario_id || session.scenarioTitle !== row.scenario_title) {
      saveSession({
        ...session, status: row.status, speed: row.speed, pausedBy: row.paused_by,
        hostName: row.host_name, guestName: row.guest_name,
        scenarioId: row.scenario_id, scenarioTitle: row.scenario_title
      });
      onRoomUpdate({ ...session, prevStatus, speedChanged });
    }

    if (session.side === 'B' && row.state_json?.scenarioId && row.seq > lastAppliedSeq) {
      lastAppliedSeq = Number(row.seq);
      watchMotionKey(row.state_json.motionPublicKey);
      onRemoteSnapshot(row.state_json, row);
    }
  }

  function handleIncomingCommand(cmd) {
    if (!cmd || cmd.side !== 'B' || processedCmdIds.has(cmd.id)) return;
    processedCmdIds.add(cmd.id);
    pendingAckIds.add(cmd.id);
    onRemoteCommand(cmd);
  }

  async function createRoom(scenarioId, scenarioTitle, playerName, initialState) {
    if (!client) throw new Error('Сначала подключите Supabase (URL и Anon Key)');
    const { data, error } = await client.rpc('rpc_create_room', {
      p_scenario_id: scenarioId,
      p_scenario_title: scenarioTitle,
      p_player_name: playerName || 'Командующий Запада',
      p_initial_state: initialState || {}
    });
    if (error) throw new Error(error.message || 'Ошибка создания комнаты');
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.match_id) throw new Error('Сервер не вернул данные комнаты');

    resetRoomSync();
    localSeq = 1;
    lastAppliedSeq = 1;

    saveSession({
      matchId: row.match_id,
      roomCode: row.room_code,
      side: 'A',
      token: row.player_token,
      scenarioId,
      scenarioTitle,
      status: 'lobby',
      hostName: playerName || 'Командующий Запада',
      guestName: null,
      speed: 0,
      pausedBy: null
    });
    await subscribeRoom(session);
    onRoomUpdate({ ...session });
    return session;
  }

  async function joinRoom(roomCode, playerName) {
    if (!client) throw new Error('Сначала подключите Supabase (URL и Anon Key)');
    const cleanCode = (roomCode || '').trim().toUpperCase();
    const { data, error } = await client.rpc('rpc_join_room', {
      p_room_code: cleanCode,
      p_player_name: playerName || 'Командующий Востока'
    });
    if (error) throw new Error(error.message || 'Не удалось подключиться к комнате');
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.match_id) throw new Error('Комната не найдена');

    resetRoomSync();

    saveSession({
      matchId: row.match_id,
      roomCode: row.room_code,
      side: 'B',
      token: row.player_token,
      scenarioId: row.scenario_id,
      scenarioTitle: row.scenario_title,
      status: row.status,
      hostName: 'Командующий Запада',
      guestName: playerName || 'Командующий Востока',
      speed: 0,
      pausedBy: null
    });
    await subscribeRoom(session);
    return session;
  }

  async function startMatch(initialState) {
    if (!client || !session || session.side !== 'A') throw new Error('Только хост (Запад А) может начать матч');
    const startingSession = session;
    const { error } = await client.rpc('rpc_start_match', {
      p_match_id: startingSession.matchId,
      p_token: startingSession.token,
      p_initial_state: initialState || null
    });
    if (error) throw new Error(error.message || 'Ошибка старта матча');
    if (session?.matchId === startingSession.matchId && session.status === 'lobby') {
      localSeq = Math.max(localSeq, 2);
      saveSession({ ...session, status: 'active', speed: 1 });
      onRoomUpdate({ ...session, prevStatus: 'lobby' });
    }
    return true;
  }

  async function submitCommand(action, payload) {
    if (!client || !session || session.status !== 'active') return { ok: false, msg: 'Матч не активен' };
    try {
      const { error, data } = await client.rpc('rpc_submit_command', {
        p_match_id: session.matchId,
        p_token: session.token,
        p_action: action,
        p_payload: payload || {}
      });
      if (error) return { ok: false, msg: error.message };
      return { ok: true, msg: 'Приказ отправлен штабу', commandId: data == null ? null : String(data) };
    } catch (e) {
      return { ok: false, msg: e.message || 'Ошибка сети' };
    }
  }

  function encodeBytes(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  }

  function decodeBytes(base64) {
    return Uint8Array.from(atob(base64), byte => byte.charCodeAt(0));
  }

  async function createMotionSigner(generation) {
    if (!globalThis.crypto?.subtle) return;
    try {
      const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
      const publicKey = encodeBytes(await crypto.subtle.exportKey('raw', keys.publicKey));
      if (roomGeneration === generation && motionTimer) motionSigner = { publicKey, key: keys.privateKey };
    } catch (error) {
      // Positions also arrive with the authenticated room snapshot.
    }
  }

  function watchMotionKey(value) {
    const key = typeof value === 'string' && value.length === 88 ? value : null;
    if (motionPublicKey === key) return;
    motionPublicKey = key;
    lastMotionSeq = 0;
    motionVerifier = null;
    if (!key || !globalThis.crypto?.subtle) return;
    try {
      motionVerifier = crypto.subtle.importKey('raw', decodeBytes(key),
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']).catch(() => null);
    } catch (error) {}
  }

  function motionMessage(matchId, seq, body) {
    return textEncoder.encode(matchId + ':' + seq + ':' + body);
  }

  async function sendMotion() {
    if (!realtimeReady || session?.status !== 'active' || !motionSigner || motionSendBusy || !getHostMotion) return;
    const body = JSON.stringify(getHostMotion());
    if (body === lastMotionBody || body.length > 40000) return;
    const generation = roomGeneration;
    const seq = ++motionSeq;
    motionSendBusy = true;
    try {
      const signature = await crypto.subtle.sign(SIGN_ALGORITHM, motionSigner.key,
        motionMessage(session.matchId, seq, body));
      if (roomGeneration !== generation || !realtimeReady || session?.status !== 'active') return;
      const result = await channel.send({
        type: 'broadcast', event: MOTION_EVENT, payload: { seq, body, signature: encodeBytes(signature) }
      });
      if (roomGeneration === generation && result === 'ok') lastMotionBody = body;
    } catch (error) {
      // The authoritative snapshot is the fallback when Realtime is unavailable.
    } finally {
      if (roomGeneration === generation) motionSendBusy = false;
    }
  }

  async function receiveMotion(packet) {
    if (session?.status !== 'active' || !session.speed || !motionVerifier || !packet ||
        !Number.isSafeInteger(packet.seq) || packet.seq <= lastMotionSeq ||
        typeof packet.body !== 'string' || packet.body.length > 40000 ||
        typeof packet.signature !== 'string' || packet.signature.length !== 88) return;
    const generation = roomGeneration;
    const verifier = motionVerifier;
    try {
      const key = await verifier;
      if (!key || roomGeneration !== generation || verifier !== motionVerifier) return;
      const valid = await crypto.subtle.verify(SIGN_ALGORITHM, key, decodeBytes(packet.signature),
        motionMessage(session.matchId, packet.seq, packet.body));
      if (!valid || roomGeneration !== generation || verifier !== motionVerifier ||
          session?.status !== 'active' || !session.speed || packet.seq <= lastMotionSeq) return;
      const frame = JSON.parse(packet.body);
      if (!Array.isArray(frame.units) || !Array.isArray(frame.strikes)) return;
      lastMotionSeq = packet.seq;
      onRemoteMotion(frame);
    } catch (error) {}
  }

  function pushSnapshot(state, immediate = false) {
    if (!client || session?.side !== 'A' || session.status !== 'active' || !state) return;
    queuedState = state;
    if (pushBusy) return;
    if (immediate) {
      if (!pushSoon) pushSoon = setTimeout(flushSnapshot, 65);
    } else if (!pushSoon) {
      flushSnapshot();
    }
  }

  async function flushSnapshot() {
    pushSoon = null;
    if (pushBusy || !queuedState || session?.side !== 'A' || session.status !== 'active') return;
    const generation = roomGeneration;
    const state = queuedState;
    queuedState = null;
    const compact = {
      ...state, popups: [],
      motionPublicKey: motionSigner?.publicKey || null,
      motionUnits: getHostMotion?.().units.filter(unit => unit.length === 7) || []
    };
    const signature = JSON.stringify(compact);
    const ackBatch = [...pendingAckIds].slice(0, 30);
    if (!ackBatch.length && signature === lastPublished) return;
    pushBusy = true;
    let retry = false;
    try {
      const { error, data } = await client.rpc('rpc_push_snapshot', {
        p_match_id: session.matchId,
        p_token: session.token,
        p_seq: ++localSeq,
        p_day: state.day ?? 1,
        p_hour: state.hour ?? 6,
        p_status: state.status === 'finished' ? 'finished' : 'active',
        p_winner: state.winner || null,
        p_state: compact,
        p_processed_cmd_ids: ackBatch.length ? ackBatch : null
      });
      if (roomGeneration !== generation) return;
      if (error || data !== true) {
        retry = true;
        if (error) reportSyncError(error.message);
        return;
      }
      lastReportedError = '';
      lastPublished = signature;
      for (const id of ackBatch) pendingAckIds.delete(id);
      while (processedCmdIds.size > 256) {
        const oldest = processedCmdIds.values().next().value;
        if (pendingAckIds.has(oldest)) break;
        processedCmdIds.delete(oldest);
      }
      if (compact.status === 'finished' && session.status !== 'finished') {
        saveSession({ ...session, status: 'finished' });
        onRoomUpdate({ ...session, prevStatus: 'active' });
      }
    } catch (error) {
      if (roomGeneration === generation) {
        retry = true;
        reportSyncError(error.message || 'Сеть недоступна');
      }
    } finally {
      if (roomGeneration === generation) {
        pushBusy = false;
        if (!retry && queuedState && session.status === 'active' && !pushSoon) {
          pushSoon = setTimeout(flushSnapshot, 65);
        }
      }
    }
  }

  function reportSyncError(message) {
    if (lastReportedError === message) return;
    lastReportedError = message;
    onSyncError(message);
  }

  function startHostSyncLoop(getStateFn, getMotionFn) {
    if (pushTimer) return;
    pushTimer = setInterval(() => pushSnapshot(getStateFn()), 550);
    getHostMotion = getMotionFn || null;
    if (getHostMotion) {
      motionTimer = setInterval(sendMotion, 100);
      createMotionSigner(roomGeneration);
    }
  }

  function stopHostSyncLoop() {
    clearInterval(pushTimer);
    clearTimeout(pushSoon);
    pushTimer = null;
    pushSoon = null;
    clearInterval(motionTimer);
    motionTimer = null;
    getHostMotion = null;
  }

  async function setOnlineSpeed(spd) {
    if (!client || !session || session.status !== 'active') return;
    const cleanSpd = (spd === 0 || spd === 1 || spd === 2) ? spd : 1;
    const { error } = await client.rpc('rpc_set_speed', {
      p_match_id: session.matchId,
      p_token: session.token,
      p_speed: cleanSpd
    });
    if (error) reportSyncError(error.message);
  }

  async function tryRestoreSession() {
    if (!client) return null;
    const saved = loadSavedSession();
    if (!saved || !saved.matchId || !saved.token) return null;
    try {
      const { data, error } = await client.rpc('rpc_verify_session', {
        p_match_id: saved.matchId,
        p_token: saved.token
      });
      if (error) {
        if (error.code === 'P0001') forgetSavedSession(saved);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.status === 'finished') { forgetSavedSession(saved); return null; }
      const { data: fullRoom, error: roomError } = await client.from('online_rooms').select('*').eq('id', saved.matchId).single();
      if (roomError || !fullRoom) return null;
      if (fullRoom.status === 'finished') { forgetSavedSession(saved); return null; }
      resetRoomSync();
      saveSession({
        ...saved,
        roomCode: row.room_code,
        scenarioId: row.scenario_id,
        scenarioTitle: row.scenario_title,
        side: row.side,
        speed: fullRoom.speed,
        pausedBy: fullRoom.paused_by,
        status: fullRoom.status,
        hostName: fullRoom.host_name,
        guestName: fullRoom.guest_name
      });
      localSeq = Number(fullRoom.seq) || 0;
      lastAppliedSeq = localSeq;
      lastRoomUpdate = fullRoom.updated_at || '';
      if (row.side === 'B') watchMotionKey(fullRoom.state_json?.motionPublicKey);
      return { ...session, stateJson: fullRoom.state_json };
    } catch (e) {
      return null;
    }
  }

  function leaveRoom() {
    resetRoomSync();
    saveSession(null);
    clearUrlRoomCode();
    onRoomUpdate(null);
  }

  let sdkRequest;
  async function prepareOnline() {
    if (client) return;
    if (!isSdkAvailable()) {
      if (!sdkRequest) sdkRequest = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js';
        script.onload = resolve;
        script.onerror = () => {
          script.remove();
          reject(new Error('Не удалось загрузить онлайн-модуль. Проверьте соединение.'));
        };
        document.head.append(script);
      }).finally(() => { sdkRequest = null; });
      await sdkRequest;
    }
    if (!client) {
      const cfg = loadConfig();
      if (cfg.url && cfg.key) connect(cfg.url, cfg.key);
    }
  }

  return {
    prepareOnline,
    loadConfig,
    saveConfig,
    connect,
    isSdkAvailable,
    isConnected: () => !!client,
    getSession: () => session,
    isOnlineMatch: () => !!(client && session && session.status === 'active'),
    isOnlineLobby: () => !!(client && session && session.status === 'lobby'),
    isHost: () => !!(session && session.side === 'A'),
    isGuest: () => !!(session && session.side === 'B'),
    getInviteUrl,
    getUrlRoomCode,
    createRoom,
    joinRoom,
    startMatch,
    submitCommand,
    pushSnapshot,
    startHostSyncLoop,
    stopHostSyncLoop,
    setOnlineSpeed,
    getSavedRoom,
    tryRestoreSession,
    leaveRoom,
    resumeRoom: () => session && subscribeRoom(session),
    onSyncError: fn => { onSyncError = fn; },
    onStatus: fn => { onStatusChange = fn; },
    onCommand: fn => { onRemoteCommand = fn; },
    onSnapshot: fn => { onRemoteSnapshot = fn; },
    onMotion: fn => { onRemoteMotion = fn; },
    onRoom: fn => { onRoomUpdate = fn; }
  };
})();
