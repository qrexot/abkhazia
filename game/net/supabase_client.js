"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};

// ============================================================================
// ANTI-CHEAT REAL-TIME MULTIPLAYER ADAPTER (SUPABASE REALTIME + ATOMIC RPC)
// - Works seamlessly on GitHub Pages with @supabase/supabase-js CDN
// - Zero direct table writes: every action authenticated by 256-bit player_token
// - Invite link support (?room=ABK-XXXX) & F5 session auto-reconnect
// - Automatic 2.5s polling fallback if WebSockets are blocked by a firewall
// ============================================================================
window.AbkhaziaGame.SupabaseNet = (() => {
  const CFG_KEY = 'abkhazia_supabase_cfg_v2';
  const SESSION_KEY = 'abkhazia_online_session_v2';

  let client = null;
  let channel = null;
  let pollTimer = null;
  let pushTimer = null;
  let pushBusy = false;

  let session = null; // { matchId, roomCode, side: 'A'|'B', token, scenarioId, scenarioTitle, status, hostName, guestName, speed, pausedBy }
  let localSeq = 1;
  let lastAppliedSeq = 0;
  let processedCmdIds = new Set();
  let pendingAckIds = [];

  let onStatusChange = () => {};
  let onRemoteCommand = () => {};
  let onRemoteSnapshot = () => {};
  let onRoomUpdate = () => {};

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

  function saveSession(sess) {
    session = sess;
    try {
      if (sess) localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function loadSavedSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
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

  async function subscribeRoom(matchId) {
    if (!client || !matchId) return;
    if (channel) {
      try { await client.removeChannel(channel); } catch (e) {}
      channel = null;
    }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

    channel = client.channel('abk_room_' + matchId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'online_rooms', filter: 'id=eq.' + matchId }, payload => {
        if (payload && payload.new) handleRoomRow(payload.new);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'online_commands', filter: 'match_id=eq.' + matchId }, payload => {
        if (payload && payload.new && session && session.side === 'A') {
          handleIncomingCommand(payload.new);
        }
      })
      .subscribe();

    // Resilient fallback poller (ensures zero stalls even if WS drops on mobile/NAT)
    pollTimer = setInterval(() => {
      if (!client || !session || !session.matchId) return;
      pollRoomAndCommands();
    }, 2200);
  }

  async function pollRoomAndCommands() {
    if (!client || !session || !session.matchId) return;
    try {
      const { data: room } = await client.from('online_rooms').select('*').eq('id', session.matchId).single();
      if (room) handleRoomRow(room);
      if (session.side === 'A' && room && room.status === 'active') {
        const { data: cmds } = await client
          .from('online_commands')
          .select('*')
          .eq('match_id', session.matchId)
          .eq('processed', false)
          .order('id', { ascending: true })
          .limit(30);
        if (cmds && cmds.length) {
          for (const c of cmds) handleIncomingCommand(c);
        }
      }
    } catch (e) {}
  }

  function handleRoomRow(row) {
    if (!session || row.id !== session.matchId) return;
    const prevStatus = session.status;
    session.status = row.status;
    session.hostName = row.host_name;
    session.guestName = row.guest_name;
    session.speed = row.speed;
    session.pausedBy = row.paused_by;
    session.scenarioId = row.scenario_id;
    session.scenarioTitle = row.scenario_title;
    saveSession(session);

    if (row.seq > localSeq) localSeq = row.seq;
    onRoomUpdate({ ...session, prevStatus });

    // Guest (B) always hydrates authoritative snapshots from Host (A)
    if (session.side === 'B' && row.state_json && Object.keys(row.state_json).length && row.seq > lastAppliedSeq) {
      lastAppliedSeq = row.seq;
      onRemoteSnapshot(row.state_json, row);
    } else if (session.side === 'A' && row.speed !== undefined) {
      // Sync shared pause/speed changes initiated by Guest (B)
      onRoomUpdate({ ...session, prevStatus, speedChanged: true });
    }
  }

  function handleIncomingCommand(cmd) {
    if (!cmd || processedCmdIds.has(cmd.id)) return;
    processedCmdIds.add(cmd.id);
    pendingAckIds.push(cmd.id);
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

    localSeq = 1;
    lastAppliedSeq = 1;
    processedCmdIds.clear();
    pendingAckIds = [];

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
    await subscribeRoom(row.match_id);
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

    lastAppliedSeq = 0;
    processedCmdIds.clear();
    pendingAckIds = [];

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
    await subscribeRoom(row.match_id);
    await pollRoomAndCommands();
    return session;
  }

  async function startMatch(initialState) {
    if (!client || !session || session.side !== 'A') throw new Error('Только хост (Запад А) может начать матч');
    const { error } = await client.rpc('rpc_start_match', {
      p_match_id: session.matchId,
      p_token: session.token,
      p_initial_state: initialState || null
    });
    if (error) throw new Error(error.message || 'Ошибка старта матча');
    localSeq += 1;
    session.status = 'active';
    session.speed = 1;
    saveSession(session);
    onRoomUpdate({ ...session, prevStatus: 'lobby' });
    return true;
  }

  async function submitCommand(action, payload) {
    if (!client || !session || session.status !== 'active') return { ok: false, msg: 'Матч не активен' };
    try {
      const { error } = await client.rpc('rpc_submit_command', {
        p_match_id: session.matchId,
        p_token: session.token,
        p_action: action,
        p_payload: payload || {}
      });
      if (error) return { ok: false, msg: error.message };
      return { ok: true, msg: 'Приказ отправлен штабу' };
    } catch (e) {
      return { ok: false, msg: e.message || 'Ошибка сети' };
    }
  }

  async function pushSnapshot(stateObj, immediate = false) {
    if (!client || !session || session.side !== 'A' || session.status !== 'active') return;
    if (pushBusy && !immediate) return;
    pushBusy = true;
    try {
      localSeq += 1;
      const ackBatch = pendingAckIds.splice(0, 30);
      // Strip transient popups to keep JSON payload lean & ultra-fast!
      const compact = { ...stateObj, popups: [] };
      const { error } = await client.rpc('rpc_push_snapshot', {
        p_match_id: session.matchId,
        p_token: session.token,
        p_seq: localSeq,
        p_day: stateObj.day || 1,
        p_hour: stateObj.hour || 6,
        p_status: stateObj.status === 'finished' ? 'finished' : 'active',
        p_winner: stateObj.winner || null,
        p_state: compact,
        p_processed_cmd_ids: ackBatch.length ? ackBatch : null
      });
      if (error && ackBatch.length) {
        pendingAckIds.unshift(...ackBatch);
      }
      if (!error && stateObj.status === 'finished') {
        session.status = 'finished';
        saveSession(session);
      }
    } catch (e) {
    } finally {
      pushBusy = false;
    }
  }

  function startHostSyncLoop(getStateFn) {
    stopHostSyncLoop();
    pushTimer = setInterval(() => {
      if (!session || session.side !== 'A' || session.status !== 'active') return;
      const st = getStateFn();
      if (st) pushSnapshot(st, false);
    }, 550);
  }

  function stopHostSyncLoop() {
    if (pushTimer) { clearInterval(pushTimer); pushTimer = null; }
  }

  async function setOnlineSpeed(spd) {
    if (!client || !session || session.status !== 'active') return;
    const cleanSpd = (spd === 0 || spd === 1 || spd === 2) ? spd : 1;
    await client.rpc('rpc_set_speed', {
      p_match_id: session.matchId,
      p_token: session.token,
      p_speed: cleanSpd
    });
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
      if (error) { saveSession(null); return null; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.status === 'finished') { saveSession(null); return null; }
      saveSession({
        ...saved,
        roomCode: row.room_code,
        scenarioId: row.scenario_id,
        scenarioTitle: row.scenario_title,
        side: row.side,
        status: row.status,
        hostName: row.host_name,
        guestName: row.guest_name,
        speed: row.speed
      });
      const { data: fullRoom } = await client.from('online_rooms').select('state_json, seq').eq('id', saved.matchId).single();
      if (fullRoom && fullRoom.seq) localSeq = Math.max(localSeq, fullRoom.seq);
      await subscribeRoom(saved.matchId);
      await pollRoomAndCommands();
      return { ...session, stateJson: fullRoom ? fullRoom.state_json : null };
    } catch (e) {
      return null;
    }
  }

  function leaveRoom() {
    stopHostSyncLoop();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (client && channel) {
      try { client.removeChannel(channel); } catch (e) {}
    }
    channel = null;
    processedCmdIds.clear();
    pendingAckIds = [];
    lastAppliedSeq = 0;
    saveSession(null);
    clearUrlRoomCode();
    onRoomUpdate(null);
  }

  // Auto-connect on load if config exists (from supabase_config.js or localStorage)
  const initCfg = loadConfig();
  if (initCfg.url && initCfg.key) {
    setTimeout(() => connect(initCfg.url, initCfg.key), 0);
  }

  return {
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
    tryRestoreSession,
    leaveRoom,
    onStatus: fn => { onStatusChange = fn; },
    onCommand: fn => { onRemoteCommand = fn; },
    onSnapshot: fn => { onRemoteSnapshot = fn; },
    onRoom: fn => { onRoomUpdate = fn; }
  };
})();
