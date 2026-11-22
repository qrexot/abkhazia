-- ============================================================================
-- ШТАБ АБХАЗИИ — ЗАЩИЩЁННЫЙ ОНЛАЙН-МУЛЬТИПЛЕЕР 1 НА 1 (SUPABASE + GITHUB PAGES)
-- ЕДИНЫЙ SQL-СКРИПТ: вставьте целиком в Supabase -> SQL Editor -> New Query -> Run.
--
-- АНТИЧИТ И ЗАЩИТА:
-- 1. Прямые INSERT / UPDATE / DELETE в таблицы ПОЛНОСТЬЮ ЗАПРЕЩЕНЫ через RLS.
-- 2. Все действия идут строго через SECURITY DEFINER RPC с проверкой 256-бит токена (SHA-256).
-- 3. Сценарий блокируется триггером навсегда после создания комнаты (подмена невозможна).
-- 4. Сторона Б физически не может отдавать приказы за Сторону А или менять состояние карты напрямую.
-- 5. Встроенный серверный rate-limit (защита от спама) и проверка аномальных скачков ресурсов.
-- 6. Секретные хэши токенов хранятся отдельно и НЕ читаются через публичный SELECT.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. ТАБЛИЦА ОНЛАЙН-КОМНАТ (МАТЧЕЙ)
create table if not exists public.online_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^ABK-[A-Z0-9]{4,6}$'),
  scenario_id text not null,
  scenario_title text not null,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'finished')),
  host_name text not null default 'Командующий Запада (А)',
  guest_name text,
  ready_a boolean not null default true,
  ready_b boolean not null default false,
  speed integer not null default 1 check (speed in (0, 1, 2, 4)),
  paused_by text check (paused_by in ('A', 'B') or paused_by is null),
  day integer not null default 1 check (day >= 1),
  hour integer not null default 6 check (hour between 0 and 23),
  winner text check (winner in ('A', 'B', 'draw') or winner is null),
  seq bigint not null default 0 check (seq >= 0),
  state_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. СЕКРЕТНАЯ ТАБЛИЦА СЕССИЙ ИГРОКОВ (RLS ПОЛНОСТЬЮ ЗАКРЫТ ДЛЯ ANON — ТОКЕНЫ НЕЛЬЗЯ ПРОЧИТАТЬ!)
create table if not exists public.online_sessions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.online_rooms(id) on delete cascade,
  side text not null check (side in ('A', 'B')),
  display_name text not null,
  token_hash text not null,
  last_seen timestamptz not null default now(),
  unique (match_id, side)
);

-- 3. ОЧЕРЕДЬ ПРИКАЗОВ ИГРОКОВ (ВСЕ ДЕЙСТВИЯ ПРОХОДЯТ ЧЕРЕЗ СЕРВЕРНУЮ ВАЛИДАЦИЮ)
create table if not exists public.online_commands (
  id bigserial primary key,
  match_id uuid not null references public.online_rooms(id) on delete cascade,
  side text not null check (side in ('A', 'B')),
  action text not null check (action in (
    'march', 'entrench', 'retreat', 'reinforce', 'recruit', 'airlift',
    'strike', 'decision', 'doctrine', 'crisis_influence',
    'improve_sponsor', 'request_aid', 'propose_treaty',
    'directive', 'drawn_line', 'clear_plan',
    'build_checkpoint', 'mine_corridor', 'clear_obstacle',
    'demolish_corridor', 'repair_corridor', 'repair_infra',
    'tkuarchal_action', 'resolve_event'
  )),
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

-- 4. ЖУРНАЛ АНТИЧИТ-СОБЫТИЙ И АУДИТА МАТЧА
create table if not exists public.online_audit (
  id bigserial primary key,
  match_id uuid not null references public.online_rooms(id) on delete cascade,
  side text,
  event_type text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

-- ИНДЕКСЫ ДЛЯ МГНОВЕННОГО REALTIME И ПОИСКА КОМНАТ
create index if not exists idx_online_rooms_code on public.online_rooms(room_code);
create index if not exists idx_online_commands_match_proc on public.online_commands(match_id, processed, id);
create index if not exists idx_online_commands_rate on public.online_commands(match_id, side, created_at desc);

-- АВТООБНОВЛЕНИЕ updated_at
create or replace function public.fn_online_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_online_rooms_touch on public.online_rooms;
create trigger trg_online_rooms_touch
  before update on public.online_rooms
  for each row execute function public.fn_online_touch();

-- ЖЁСТКАЯ БЛОКИРОВКА СЦЕНАРИЯ (ПОСЛЕ СОЗДАНИЯ КОМНАТЫ СЦЕНАРИЙ НЕЛЬЗЯ ИЗМЕНИТЬ НИКОМУ!)
create or replace function public.fn_lock_room_scenario()
returns trigger language plpgsql as $$
begin
  if old.scenario_id is distinct from new.scenario_id then
    raise exception 'ANTICHEAT: Сценарий матча зафиксирован и не может быть изменён';
  end if;
  if old.room_code is distinct from new.room_code then
    raise exception 'ANTICHEAT: Код комнаты не может быть изменён';
  end if;
  if old.status = 'finished' and new.status <> 'finished' then
    raise exception 'ANTICHEAT: Завершённый матч нельзя перезаписать';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_room_scenario on public.online_rooms;
create trigger trg_lock_room_scenario
  before update on public.online_rooms
  for each row execute function public.fn_lock_room_scenario();

-- ============================================================================
-- ЖЁСТКИЙ ROW LEVEL SECURITY (RLS) — ЗАПРЕТ ЛЮБОЙ ПРЯМОЙ ЗАПИСИ ОТ КЛИЕНТОВ!
-- ============================================================================
alter table public.online_rooms enable row level security;
alter table public.online_sessions enable row level security;
alter table public.online_commands enable row level security;
alter table public.online_audit enable row level security;

-- Сброс старых политик при повторном запуске скрипта
drop policy if exists "rooms_read_only" on public.online_rooms;
drop policy if exists "commands_read_only" on public.online_commands;
drop policy if exists "audit_read_only" on public.online_audit;
drop policy if exists "sessions_deny_all" on public.online_sessions;

-- Разрешаем ТОЛЬКО SELECT на комнаты, команды и аудит (для Realtime-подписки)
-- INSERT, UPDATE и DELETE для anon/authenticated полностью ЗАПРЕЩЕНЫ!
create policy "rooms_read_only" on public.online_rooms
  for select to anon, authenticated using (true);

create policy "commands_read_only" on public.online_commands
  for select to anon, authenticated using (true);

create policy "audit_read_only" on public.online_audit
  for select to anon, authenticated using (true);

-- Таблица online_sessions (хэши токенов) ПОЛНОСТЬЮ ЗАКРЫТА даже на чтение!
create policy "sessions_deny_all" on public.online_sessions
  for all to anon, authenticated using (false) with check (false);

-- Явно отзываем права прямой модификации у ролей anon и authenticated
revoke insert, update, delete on public.online_rooms from anon, authenticated;
revoke all on public.online_sessions from anon, authenticated;
revoke insert, update, delete on public.online_commands from anon, authenticated;
revoke insert, update, delete on public.online_audit from anon, authenticated;

-- ============================================================================
-- ПОДКЛЮЧЕНИЕ REALTIME (МГНОВЕННАЯ ДОСТАВКА ПРИКАЗОВ И СНИМКОВ КАРТЫ)
-- ============================================================================
do $$
declare
  tbl text;
begin
  foreach tbl in array array['online_rooms', 'online_commands']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', tbl);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;

-- ============================================================================
-- ВНУТРЕННЯЯ ФУНКЦИЯ ПРОВЕРКИ КРИПТО-ТОКЕНА ИГРОКА
-- ============================================================================
create or replace function public._verify_player_token(
  p_match_id uuid,
  p_token text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_side text;
  v_hash text;
begin
  if p_match_id is null or p_token is null or length(p_token) < 16 then
    raise exception 'AUTH_ERROR: Недействительный токен сессии';
  end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');
  select side into v_side
  from public.online_sessions
  where match_id = p_match_id and token_hash = v_hash;

  if v_side is null then
    raise exception 'AUTH_ERROR: Доступ запрещён (неверный токен для этой комнаты)';
  end if;

  update public.online_sessions
  set last_seen = now()
  where match_id = p_match_id and side = v_side;

  return v_side;
end;
$$;

-- ============================================================================
-- 1. RPC: СОЗДАНИЕ КОМНАТЫ (ХОСТ = ЗАПАД А, СЦЕНАРИЙ ФИКСИРУЕТСЯ НАВСЕГДА)
-- ============================================================================
create or replace function public.rpc_create_room(
  p_scenario_id text,
  p_scenario_title text,
  p_player_name text default 'Командующий Запада',
  p_initial_state jsonb default '{}'::jsonb
)
returns table (
  match_id uuid,
  room_code text,
  side text,
  player_token text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_match_id uuid;
  v_token text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i integer;
  v_try integer := 0;
  v_clean_name text;
begin
  if p_scenario_id is null or length(trim(p_scenario_id)) = 0 then
    raise exception 'Укажите сценарий матча';
  end if;
  v_clean_name := left(coalesce(nullif(trim(p_player_name), ''), 'Командующий Запада'), 32);

  -- Генерируем уникальный код комнаты ABK-XXXX
  loop
    v_try := v_try + 1;
    v_code := 'ABK-';
    for v_i in 1..4 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.online_rooms r where r.room_code = v_code) or v_try > 20;
  end loop;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.online_rooms (
    room_code, scenario_id, scenario_title, status, host_name, ready_a, ready_b,
    speed, day, hour, seq, state_json
  ) values (
    v_code, trim(p_scenario_id), left(coalesce(p_scenario_title, p_scenario_id), 80),
    'lobby', v_clean_name, true, false,
    0, 1, 6, 1, coalesce(p_initial_state, '{}'::jsonb)
  ) returning id into v_match_id;

  insert into public.online_sessions (match_id, side, display_name, token_hash)
  values (v_match_id, 'A', v_clean_name, encode(digest(v_token, 'sha256'), 'hex'));

  insert into public.online_audit (match_id, side, event_type, details)
  values (v_match_id, 'A', 'room_created', 'Сценарий зафиксирован: ' || trim(p_scenario_id));

  return query select v_match_id, v_code, 'A'::text, v_token;
end;
$$;

-- ============================================================================
-- 2. RPC: ПОДКЛЮЧЕНИЕ ДРУГА ПО КОДУ КОМНАТЫ (АТОМАРНО ЗАНИМАЕТ СЛОТ ВОСТОК Б)
-- ============================================================================
create or replace function public.rpc_join_room(
  p_room_code text,
  p_player_name text default 'Командующий Востока'
)
returns table (
  match_id uuid,
  room_code text,
  scenario_id text,
  scenario_title text,
  side text,
  player_token text,
  status text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.online_rooms%rowtype;
  v_token text;
  v_clean_name text;
begin
  select * into v_room
  from public.online_rooms r
  where r.room_code = upper(trim(p_room_code))
  for update;

  if not found then
    raise exception 'Комната % не найдена. Проверьте код приглашения.', p_room_code;
  end if;

  if v_room.status = 'finished' then
    raise exception 'Матч в комнате % уже завершён.', v_room.room_code;
  end if;

  -- Проверяем, не занят ли уже слот B (защита от перехвата стороны третьим лицом!)
  if exists (select 1 from public.online_sessions s where s.match_id = v_room.id and s.side = 'B') then
    raise exception 'Сторона Востока (Б) в комнате % уже занята другим игроком.', v_room.room_code;
  end if;

  v_clean_name := left(coalesce(nullif(trim(p_player_name), ''), 'Командующий Востока'), 32);
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.online_sessions (match_id, side, display_name, token_hash)
  values (v_room.id, 'B', v_clean_name, encode(digest(v_token, 'sha256'), 'hex'));

  update public.online_rooms
  set guest_name = v_clean_name, ready_b = true
  where id = v_room.id;

  insert into public.online_audit (match_id, side, event_type, details)
  values (v_room.id, 'B', 'player_joined', v_clean_name || ' подключился за Восток (Б)');

  return query select v_room.id, v_room.room_code, v_room.scenario_id, v_room.scenario_title, 'B'::text, v_token, v_room.status;
end;
$$;

-- ============================================================================
-- 3. RPC: СТАРТ МАТЧА (ТОЛЬКО ХОСТ A, КОГДА ДРУГ B ПОДКЛЮЧЁН)
-- ============================================================================
create or replace function public.rpc_start_match(
  p_match_id uuid,
  p_token text,
  p_initial_state jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_side text;
  v_room public.online_rooms%rowtype;
begin
  v_side := public._verify_player_token(p_match_id, p_token);
  if v_side <> 'A' then
    raise exception 'Только создатель комнаты (Запад А) может запустить матч';
  end if;

  select * into v_room from public.online_rooms where id = p_match_id for update;
  if v_room.status <> 'lobby' then
    return true;
  end if;
  if not exists (select 1 from public.online_sessions where match_id = p_match_id and side = 'B') then
    raise exception 'Дождитесь подключения друга за Восток (Б)';
  end if;

  update public.online_rooms
  set
    status = 'active',
    speed = 1,
    paused_by = null,
    seq = seq + 1,
    state_json = coalesce(p_initial_state, state_json)
  where id = p_match_id;

  insert into public.online_audit (match_id, side, event_type, details)
  values (p_match_id, 'A', 'match_started', 'Бой начался по сценарию ' || v_room.scenario_id);

  return true;
end;
$$;

-- ============================================================================
-- 4. RPC: ОТПРАВКА ТАКТИЧЕСКОГО ПРИКАЗА (ВАЛИДАЦИЯ ТОКЕНА + RATE LIMIT + ЗАЩИТА СТОРОНЫ)
-- ============================================================================
create or replace function public.rpc_submit_command(
  p_match_id uuid,
  p_token text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_side text;
  v_room public.online_rooms%rowtype;
  v_recent_count integer;
  v_cmd_id bigint;
begin
  v_side := public._verify_player_token(p_match_id, p_token);

  select * into v_room from public.online_rooms where id = p_match_id;
  if not found or v_room.status <> 'active' then
    raise exception 'Матч не активен (статус: %)', coalesce(v_room.status, 'нет');
  end if;

  -- Серверный Rate Limit: не более 18 приказов за 3 секунды от одного игрока
  select count(*) into v_recent_count
  from public.online_commands
  where match_id = p_match_id
    and side = v_side
    and created_at > now() - interval '3 seconds';

  if v_recent_count >= 18 then
    raise exception 'RATE_LIMIT: Слишком много приказов, подождите секунду';
  end if;

  -- Ограничиваем размер payload (защита от мусора)
  if length(coalesce(p_payload::text, '{}')) > 12000 then
    raise exception 'ANTICHEAT: Превышен допустимый размер приказа';
  end if;

  -- Сервер сам проставляет v_side из токена — подделать сторону невозможно!
  insert into public.online_commands (match_id, side, action, payload, processed)
  values (p_match_id, v_side, p_action, coalesce(p_payload, '{}'::jsonb), false)
  returning id into v_cmd_id;

  return v_cmd_id;
end;
$$;

-- ============================================================================
-- 5. RPC: СИНХРОНИЗАЦИЯ СНИМКА КАРТЫ (ТОЛЬКО ХОСТ A + АНТИЧИТ-ПРОВЕРКА РЕСУРСОВ И SEQ)
-- ============================================================================
create or replace function public.rpc_push_snapshot(
  p_match_id uuid,
  p_token text,
  p_seq bigint,
  p_day integer,
  p_hour integer,
  p_status text,
  p_winner text,
  p_state jsonb,
  p_processed_cmd_ids bigint[] default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_side text;
  v_room public.online_rooms%rowtype;
  v_old_wp_a numeric;
  v_new_wp_a numeric;
  v_old_mp_a numeric;
  v_new_mp_a numeric;
  v_new_pp_a numeric;
  v_new_pp_b numeric;
begin
  v_side := public._verify_player_token(p_match_id, p_token);
  if v_side <> 'A' then
    raise exception 'ANTICHEAT: Только хост-симулятор (А) может публиковать состояние';
  end if;

  select * into v_room from public.online_rooms where id = p_match_id for update;
  if not found or v_room.status = 'finished' then
    return false;
  end if;

  -- Защита от отката времени и replay-атак
  if p_seq <= v_room.seq then
    return false;
  end if;
  if p_day < v_room.day then
    raise exception 'ANTICHEAT: Недопустимый откат игрового дня (% < %)', p_day, v_room.day;
  end if;
  if coalesce(p_state->>'scenarioId', v_room.scenario_id) <> v_room.scenario_id then
    raise exception 'ANTICHEAT: Попытка подмены сценария в снимке состояния!';
  end if;

  -- Античит-проверка границ и аномальных скачков ресурсов (защита от правки памяти хостом!)
  v_new_pp_a := coalesce((p_state->'factions'->'A'->>'pp')::numeric, 0);
  v_new_pp_b := coalesce((p_state->'factions'->'B'->>'pp')::numeric, 0);
  if v_new_pp_a > 505 or v_new_pp_b > 505 or v_new_pp_a < 0 or v_new_pp_b < 0 then
    insert into public.online_audit (match_id, side, event_type, details)
    values (p_match_id, 'A', 'anticheat_block', 'Аномальное значение ПО: A=' || v_new_pp_a || ', B=' || v_new_pp_b);
    raise exception 'ANTICHEAT: Недопустимое значение политических очков';
  end if;

  if v_room.seq > 2 and (v_room.state_json ? 'factions') then
    v_old_wp_a := coalesce((v_room.state_json->'factions'->'A'->>'weapons')::numeric, 0);
    v_new_wp_a := coalesce((p_state->'factions'->'A'->>'weapons')::numeric, 0);
    v_old_mp_a := coalesce((v_room.state_json->'factions'->'A'->>'manpower')::numeric, 0);
    v_new_mp_a := coalesce((p_state->'factions'->'A'->>'manpower')::numeric, 0);
    if (v_new_wp_a - v_old_wp_a) > 3500 or (v_new_mp_a - v_old_mp_a) > 6000 then
      insert into public.online_audit (match_id, side, event_type, details)
      values (p_match_id, 'A', 'anticheat_block', 'Подозрительный скачок ресурсов Запада');
      raise exception 'ANTICHEAT: Обнаружен невозможный скачок ресурсов';
    end if;
  end if;

  update public.online_rooms
  set
    seq = p_seq,
    day = p_day,
    hour = greatest(0, least(23, p_hour)),
    status = case when p_status = 'finished' then 'finished' else 'active' end,
    winner = case when p_winner in ('A', 'B', 'draw') then p_winner else null end,
    state_json = p_state
  where id = p_match_id;

  if p_processed_cmd_ids is not null and array_length(p_processed_cmd_ids, 1) > 0 then
    update public.online_commands
    set processed = true
    where match_id = p_match_id and id = any(p_processed_cmd_ids);
  end if;

  return true;
end;
$$;

-- ============================================================================
-- 6. RPC: СИНХРОНИЗИРОВАННАЯ ПАУЗА И СКОРОСТЬ ВРЕМЕНИ (ОБЩИЙ ТАЙМЕР)
-- ============================================================================
create or replace function public.rpc_set_speed(
  p_match_id uuid,
  p_token text,
  p_speed integer
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_side text;
  v_spd integer;
begin
  v_side := public._verify_player_token(p_match_id, p_token);
  v_spd := case when p_speed in (0, 1, 2) then p_speed else 1 end;

  update public.online_rooms
  set
    speed = v_spd,
    paused_by = case when v_spd = 0 then v_side else null end
  where id = p_match_id and status = 'active';

  return true;
end;
$$;

-- ============================================================================
-- 7. RPC: ПРОВЕРКА И ВОССТАНОВЛЕНИЕ СЕССИИ ПОСЛЕ ОБНОВЛЕНИЯ СТРАНИЦЫ (F5)
-- ============================================================================
create or replace function public.rpc_verify_session(
  p_match_id uuid,
  p_token text
)
returns table (
  match_id uuid,
  room_code text,
  scenario_id text,
  scenario_title text,
  side text,
  status text,
  host_name text,
  guest_name text,
  speed integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_side text;
begin
  v_side := public._verify_player_token(p_match_id, p_token);
  return query
    select r.id, r.room_code, r.scenario_id, r.scenario_title, v_side, r.status, r.host_name, r.guest_name, r.speed
    from public.online_rooms r
    where r.id = p_match_id;
end;
$$;

-- Выдаём права на вызов ТОЛЬКО публичных RPC-функций (внутренняя _verify_player_token закрыта!)
revoke all on function public._verify_player_token(uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_create_room(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.rpc_join_room(text, text) to anon, authenticated;
grant execute on function public.rpc_start_match(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.rpc_submit_command(uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.rpc_push_snapshot(uuid, text, bigint, integer, integer, text, text, jsonb, bigint[]) to anon, authenticated;
grant execute on function public.rpc_set_speed(uuid, text, integer) to anon, authenticated;
grant execute on function public.rpc_verify_session(uuid, text) to anon, authenticated;