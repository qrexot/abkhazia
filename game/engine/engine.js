"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};

// ============================================================================
// REAL-TIME STRATEGIC ENGINE — ABKHAZIA WAR ROOM
// - Dual General Staff AI (West A & East B) with 5 operational styles
// - Zero AI in PvP / Hotseat mode ('pvp'); Dual AI in Observer / UN mode ('observer')
// - 240 dynamic geopolitical, frontline, and secret events
// - Symmetric combined-arms combat, amphibious marine corridors, AA domes, strikes, UN mission
// ============================================================================
window.AbkhaziaGame.Engine = (() => {
  const G = window.AbkhaziaGame;
  let state = null;
  let listeners = [];
  let role = 'A';       // 'A' | 'B' | 'observer' | 'pvp'
  let onlineMode = null; // null | 'host' | 'guest'
  let pvpSide = 'A';    // 'A' | 'B' | 'UN'
  let speed = 1;        // 0 | 1 | 2 | 4
  let loopId = null;
  let backgroundHostTimer = null;
  let lastTick = 0;
  let hourAccum = 0;
  let aiHourCounter = 0;
  let eventHourCounter = 0;
  let usedEventIds = new Set();
  let uidSeq = 1;
  const divisionMotion = new WeakMap();

  const AI_PERSONALITIES = ['blitz_coast', 'mountain_flank', 'artillery_attrition', 'deep_raid', 'opportunist'];

  // ==================== REAL OSM ROAD, RAILWAY & BRIDGE NETWORK ====================
  const HIGHWAY_SET = new Set(['psou','tsandrypsh','gagra','bzypta','gudauta','new_afon','gumista','sukhum','gulrypsh','dranda','ochamchyra','gal','ingur']);

  function edgeKey(a, b) {
    return a < b ? (a + '__' + b) : (b + '__' + a);
  }

  function polylineMidpoint(pts) {
    if (!pts || !pts.length) return { x: 1400, y: 1050 };
    if (pts.length === 1) return pts[0];
    let total = 0;
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      segs.push(d);
      total += d;
    }
    let half = total * 0.5;
    for (let i = 0; i < segs.length; i++) {
      if (half <= segs[i] || i === segs.length - 1) {
        const t = segs[i] > 0.01 ? Math.max(0, Math.min(1, half / segs[i])) : 0.5;
        return {
          x: Number((pts[i].x + (pts[i + 1].x - pts[i].x) * t).toFixed(1)),
          y: Number((pts[i].y + (pts[i + 1].y - pts[i].y) * t).toFixed(1))
        };
      }
      half -= segs[i];
    }
    return pts[Math.floor(pts.length / 2)];
  }

  function polylineLength(pts) {
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    return Math.max(1, total);
  }

  function buildCorridorGraph() {
    const map = {};
    const roadData = G.ROAD_ROUTES || {};
    const railData = G.RAIL_ROUTES || {};
    const bridges = G.BRIDGES || {};

    for (const s of G.SECTORS) {
      for (const nbId of s.adj) {
        const key = edgeKey(s.id, nbId);
        if (map[key]) continue;
        const aId = s.id < nbId ? s.id : nbId;
        const bId = s.id < nbId ? nbId : s.id;
        const a = G.SECTOR_MAP[aId];
        const b = G.SECTOR_MAP[bId];
        if (!a || !b) continue;
        const isHighMtn = a.terrain === 'high_mountain' || b.terrain === 'high_mountain' || a.terrain === 'mountain' || b.terrain === 'mountain' || a.terrain === 'pass' || b.terrain === 'pass';
        const isHwy = HIGHWAY_SET.has(a.id) && HIGHWAY_SET.has(b.id) && !isHighMtn;
        const kind = isHwy ? 'highway' : (isHighMtn ? 'trail' : 'road');

        let pts;
        if (roadData[key] && roadData[key].length >= 2) {
          pts = roadData[key].map(p => ({ x: p[0], y: p[1] }));
        } else {
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          const nx = -dy / len, ny = dx / len;
          const bend = isHwy ? -Math.min(12, len * 0.06) : 0;
          const cx = (a.x + b.x) * 0.5 + nx * bend;
          const cy = (a.y + b.y) * 0.5 + ny * bend;
          pts = [];
          for (let i = 0; i <= 4; i++) {
            const t = i / 4;
            pts.push({
              x: Number(((1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x).toFixed(1)),
              y: Number(((1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y).toFixed(1))
            });
          }
        }

        const hasRail = !!(railData[key] && railData[key].length >= 2);
        const railPts = hasRail ? railData[key].map(p => ({ x: p[0], y: p[1] })) : null;
        const mid = polylineMidpoint(pts);
        const length = polylineLength(pts);
        const bridge = bridges[key] || null;

        map[key] = {
          key,
          a: a.id,
          b: b.id,
          kind, // 'highway' | 'road' | 'trail'
          hasRail,
          bridge,
          pts,
          railPts,
          mid,
          length,
          label: a.name + ' ↔ ' + b.name
        };
      }
    }
    return map;
  }

  const CORRIDORS = buildCorridorGraph();

  // Precompute symmetric naval port adjacency map for amphibious marines
  const SEA_ADJ = {};
  for (const [a, b] of (G.SEA_LINKS || [])) {
    (SEA_ADJ[a] = SEA_ADJ[a] || []).push(b);
    (SEA_ADJ[b] = SEA_ADJ[b] || []).push(a);
  }

  function isRailUsableForSide(key, side) {
    const c = CORRIDORS[key];
    if (!c || !c.hasRail || !state) return false;
    if (state.cities[c.a].owner !== side || state.cities[c.b].owner !== side) return false;
    const cs = state.corridors && state.corridors[key];
    if (cs && (cs.blocked || cs.railDamaged)) return false;
    if (cs && cs.checkpoint && cs.checkpoint.side !== side && cs.checkpoint.hp > 0) return false;
    return true;
  }

  function getCorridorWaypoints(fromId, toId, side = null) {
    const key = edgeKey(fromId, toId);
    const c = CORRIDORS[key];
    if (!c) {
      // Maritime amphibious sea corridor between ports
      const a = G.SECTOR_MAP[fromId], b = G.SECTOR_MAP[toId];
      if (!a || !b) return [];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      // Curve slightly southwest into the Black Sea (+y, -x)
      const cx = (a.x + b.x) * 0.5 - Math.min(28, len * 0.14);
      const cy = (a.y + b.y) * 0.5 + Math.min(34, len * 0.16);
      const out = [];
      for (let i = 1; i <= 6; i++) {
        const t = i / 6;
        out.push({
          x: Number(((1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x).toFixed(1)),
          y: Number(((1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y).toFixed(1)),
          edgeKey: null,
          isSea: true,
          isRail: false,
          sectorId: i === 6 ? toId : null
        });
      }
      return out;
    }
    const useRail = !!(side && isRailUsableForSide(key, side));
    const basePts = useRail && c.railPts ? c.railPts : c.pts;
    const pts = c.a === fromId ? basePts : basePts.slice().reverse();
    return pts.slice(1).map((p, idx, arr) => ({
      x: p.x,
      y: p.y,
      edgeKey: key,
      isRail: useRail,
      isSea: false,
      sectorId: idx === arr.length - 1 ? toId : null
    }));
  }

  const emit = () => { for (const fn of listeners) fn(state); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const enemyOf = side => (side === 'A' ? 'B' : 'A');

  function nearestSectorMeta(x, y) {
    let best = G.SECTORS[0], bestD = Infinity;
    for (const m of G.SECTORS) {
      const d = dist(x, y, m.x, m.y);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  function nearestCorridorKey(x, y, maxDist = 55) {
    let best = null, bestD = maxDist;
    for (const c of Object.values(CORRIDORS)) {
      const d = dist(x, y, c.mid.x, c.mid.y);
      if (d < bestD) { bestD = d; best = c.key; }
    }
    return best;
  }

  function getTerrainAt(x, y) {
    const m = nearestSectorMeta(x, y);
    return G.TERRAINS[m.terrain] || G.TERRAINS.valley;
  }

  function canEnterSector(unitType, sectorId, isTransit) {
    const m = G.SECTOR_MAP[sectorId];
    if (!m) return false;
    if (m.terrain === 'high_mountain') {
      if (unitType !== 'mountain' && unitType !== 'sof') return false;
      if (isTransit) return false;
    }
    return true;
  }

  // Weighted Dijkstra pathfinding over real OSM road, rail & amphibious corridors
  // Strictly avoids blown/blocked corridors (except Engineers repairing them) and prefers friendly rail/highways!
  function computeSectorPath(fromId, toId, unitType, side = null, allowBlockedForEng = false) {
    if (fromId === toId) return [toId];
    const isAmphib = !!(G.UNIT_TEMPLATES[unitType] && G.UNIT_TEMPLATES[unitType].amphibious);
    const isEng = unitType === 'engineering';
    const ceasefire = state && state.ceasefireDaysLeft > 0;

    const costMap = { [fromId]: 0 };
    const parent = {};
    const visited = new Set();
    const open = [{ id: fromId, cost: 0 }];

    while (open.length) {
      open.sort((a, b) => a.cost - b.cost);
      const cur = open.shift();
      if (visited.has(cur.id)) continue;
      visited.add(cur.id);
      if (cur.id === toId) {
        const path = [];
        let n = toId;
        while (n) { path.push(n); n = parent[n]; }
        path.reverse();
        return path;
      }

      const meta = G.SECTOR_MAP[cur.id];
      if (!meta) continue;
      const landNbs = meta.adj || [];
      const seaNbs = (isAmphib && SEA_ADJ[cur.id]) ? SEA_ADJ[cur.id] : [];
      const seenNb = new Set();

      const tryNb = (nb, isSea) => {
        if (seenNb.has(nb) && !isSea) return;
        seenNb.add(nb);
        if (visited.has(nb)) return;
        const isDest = nb === toId;
        if (!canEnterSector(unitType, nb, !isDest)) return;

        // During ceasefire never route through enemy territory
        if (ceasefire && side && state && state.cities[nb].owner !== side) return;

        let stepCost = 100;
        if (isSea) {
          // Port must be operational for amphibious embarkation
          const fromPortOk = !state || (state.cities[cur.id]?.infra?.portHp ?? 100) > 25;
          if (!fromPortOk) return;
          const nbMeta = G.SECTOR_MAP[nb];
          stepCost = dist(meta.x, meta.y, nbMeta.x, nbMeta.y) * 1.15;
        } else {
          const key = edgeKey(cur.id, nb);
          const corr = CORRIDORS[key];
          const cs = state && state.corridors && state.corridors[key];
          if (cs && cs.blocked) {
            if (!(isEng && allowBlockedForEng)) return;
            stepCost = (corr ? corr.length : 100) * 3.5;
          } else {
            const len = corr ? corr.length : 100;
            if (side && isRailUsableForSide(key, side)) {
              stepCost = len * 0.48;
            } else if (corr && corr.kind === 'highway') {
              stepCost = len * 0.80;
            } else if (corr && corr.kind === 'trail') {
              stepCost = len * 1.65;
            } else {
              stepCost = len * 1.05;
            }
            if (cs && cs.checkpoint && side && cs.checkpoint.side !== side && cs.checkpoint.hp > 0) {
              stepCost += 180;
            }
          }
        }

        // Strongly prefer friendly intermediate sectors over marching through enemy territory
        if (!isDest && side && state && state.cities[nb].owner !== side) {
          stepCost += 340;
        }

        const nextCost = cur.cost + stepCost;
        if (nextCost < (costMap[nb] ?? Infinity)) {
          costMap[nb] = nextCost;
          parent[nb] = cur.id;
          open.push({ id: nb, cost: nextCost });
        }
      };

      for (const nb of landNbs) tryNb(nb, false);
      for (const nb of seaNbs) {
        if (!landNbs.includes(nb)) tryNb(nb, true);
      }
    }
    return null;
  }

  // ==================== INFRASTRUCTURE & UNIVERSAL SUPPLY GRAPH ====================
  function hasOperationalAirfield(side) {
    if (!state) return false;
    return G.SECTORS.some(m => m.airfield && state.cities[m.id].owner === side && (state.cities[m.id].infra?.airfieldHp ?? 100) > 35);
  }

  function hasOperationalHelipad(side) {
    if (!state) return false;
    return G.SECTORS.some(m =>
      state.cities[m.id].owner === side &&
      ((m.helipad && (state.cities[m.id].infra?.helipadHp ?? 100) > 35) ||
       (m.airfield && (state.cities[m.id].infra?.airfieldHp ?? 100) > 35))
    );
  }

  function getNearestOperationalFacility(side, kind, tx, ty) {
    if (!state) return null;
    const list = G.SECTORS.filter(m => {
      if (state.cities[m.id].owner !== side) return false;
      const inf = state.cities[m.id].infra || {};
      if (kind === 'airfield') return m.airfield && (inf.airfieldHp ?? 100) > 35;
      if (kind === 'helipad') return (m.helipad && (inf.helipadHp ?? 100) > 35) || (m.airfield && (inf.airfieldHp ?? 100) > 35);
      if (kind === 'port') return m.port && (inf.portHp ?? 100) > 35;
      return m.supplyHub;
    });
    if (!list.length) return null;
    return list.sort((a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty))[0];
  }

  function recomputeSupply() {
    if (!state) return;
    for (const m of G.SECTORS) {
      state.cities[m.id].supplied = false;
      state.cities[m.id].supplySource = 'none';
    }

    for (const side of ['A', 'B']) {
      const owned = G.SECTORS.filter(m => state.cities[m.id].owner === side);
      if (!owned.length) continue;

      // Primary supply anchors: owned border crossings, or operational ports, or fallback highest-VP hub
      let seeds = owned.filter(m => m.borderWith);
      const opPorts = owned.filter(m => m.port && (state.cities[m.id].infra?.portHp ?? 100) > 35);
      for (const p of opPorts) {
        if (!seeds.includes(p)) seeds.push(p);
      }
      if (!seeds.length) {
        const hubs = owned.filter(m => m.supplyHub).sort((a, b) => b.vp - a.vp);
        if (hubs.length) seeds = [hubs[0]];
        else seeds = [owned[0]];
      }

      const visited = new Set();
      const queue = [];
      for (const s of seeds) {
        visited.add(s.id);
        state.cities[s.id].supplied = true;
        state.cities[s.id].supplySource = s.borderWith ? 'border' : (s.port ? 'sea' : 'hub');
        queue.push(s.id);
      }

      while (queue.length) {
        const curId = queue.shift();
        const meta = G.SECTOR_MAP[curId];
        if (!meta) continue;
        for (const nbId of meta.adj) {
          if (visited.has(nbId)) continue;
          if (state.cities[nbId].owner !== side) continue;
          const key = edgeKey(curId, nbId);
          const cs = state.corridors && state.corridors[key];
          // Blown bridge / blocked corridor SEVERS land supply!
          if (cs && cs.blocked) continue;
          visited.add(nbId);
          state.cities[nbId].supplied = true;
          state.cities[nbId].supplySource = isRailUsableForSide(key, side) ? 'rail' : 'road';
          queue.push(nbId);
        }
        // Sea supply propagation between operational owned ports
        if (meta.port && (state.cities[curId].infra?.portHp ?? 100) > 35 && SEA_ADJ[curId]) {
          for (const pId of SEA_ADJ[curId]) {
            if (visited.has(pId)) continue;
            if (state.cities[pId].owner !== side) continue;
            if ((state.cities[pId].infra?.portHp ?? 100) <= 35) continue;
            visited.add(pId);
            state.cities[pId].supplied = true;
            state.cities[pId].supplySource = 'sea';
            queue.push(pId);
          }
        }
      }
    }

    // Tag every division with its live supply state
    for (const d of state.divisions) {
      if (d.side !== 'A' && d.side !== 'B') { d.supplied = true; continue; }
      const sec = nearestSectorMeta(d.x, d.y);
      const c = state.cities[sec.id];
      if (c.owner === d.side) {
        d.supplied = !!c.supplied;
      } else {
        // Fighting in enemy sector: supplied if adjacent friendly supplied sector has an unblocked corridor
        d.supplied = sec.adj.some(nbId => {
          if (state.cities[nbId].owner !== d.side || !state.cities[nbId].supplied) return false;
          const cs = state.corridors && state.corridors[edgeKey(sec.id, nbId)];
          return !(cs && cs.blocked);
        });
      }
    }
  }

  function getFrontlineEnemySectors(side) {
    return G.SECTORS.filter(m =>
      state.cities[m.id].owner !== side &&
      m.adj.some(nb => state.cities[nb] && state.cities[nb].owner === side)
    );
  }

  function getFrontlineFriendlySectors(side) {
    return G.SECTORS.filter(m =>
      state.cities[m.id].owner === side &&
      m.adj.some(nb => state.cities[nb] && state.cities[nb].owner !== side)
    );
  }

  function pickPersonality() {
    return AI_PERSONALITIES[Math.floor(Math.random() * AI_PERSONALITIES.length)];
  }

  function isAiSide(side) {
    if (side !== 'A' && side !== 'B') return false;
    if (onlineMode) return false;
    if (role === 'pvp') return false;
    if (role === 'observer') return true;
    return role !== side;
  }

  function makeDivision(side, type, name, x, y, opts = {}) {
    const tpl = G.UNIT_TEMPLATES[type] || G.UNIT_TEMPLATES.infantry;
    return {
      id: opts.id || ('div_' + (uidSeq++) + '_' + Date.now().toString(36).slice(-4)),
      side,
      flag: opts.flag || null,
      type,
      name,
      x,
      y,
      hp: opts.hp != null ? opts.hp : tpl.maxHp,
      maxHp: tpl.maxHp,
      org: opts.org != null ? opts.org : 92,
      fort: opts.fort != null ? opts.fort : 0.12,
      jammedDays: 0,
      inCombat: false,
      supplied: true,
      onRail: false,
      onSea: false,
      order: null
    };
  }

  function spawnScenarioDivisions(sc) {
    const divs = [];
    let num = 1;
    const namesA = ['Гудаутская', 'Гагрская', 'Бзыбская', 'Пицундская', 'Новоафонская', 'Гумистинская', 'Рицинская', 'Псхуская'];
    const namesB = ['Сухумская', 'Ткуарчалская', 'Очамчырская', 'Гальская', 'Кодорская', 'Чхалтская', 'Драндская', 'Гулрыпшская'];
    let idxA = 0, idxB = 0;

    for (const meta of G.SECTORS) {
      const owner = sc.owners.A.includes(meta.id) ? 'A' : (sc.owners.B.includes(meta.id) ? 'B' : 'neutral');
      if (owner === 'neutral') continue;
      const g = sc.garrisons && sc.garrisons[meta.id];
      if (!g && meta.vp < 4) continue;

      const add = (type, ox, oy, fortVal) => {
        const tpl = G.UNIT_TEMPLATES[type];
        const tag = owner === 'A' ? namesA[idxA++ % namesA.length] : namesB[idxB++ % namesB.length];
        divs.push(makeDivision(owner, type, (num++) + '-я ' + tag + ' (' + tpl.short + ')', meta.x + ox, meta.y + oy, {
          org: 95,
          fort: fortVal || 0.12
        }));
      };

      if (g) {
        if ((g.infantry || 0) >= 220) add('infantry', -5, -3, g.fort || 0.14);
        if ((g.mountain || 0) >= 95) add('mountain', 5, -5, g.fort || 0.16);
        if ((g.armor || 0) >= 6) add('armor', 6, 3, 0.06);
        if ((g.artillery || 0) >= 6) add('artillery', -6, -6, 0.10);
        if ((g.aa || 0) >= 4) add('aa', 0, -7, 0.12);
      } else {
        add(meta.terrain.includes('mountain') ? 'mountain' : 'infantry', 0, 0, 0.10);
      }
    }

    // Symmetrical parity balancer
    const countA = divs.filter(d => d.side === 'A').length;
    const countB = divs.filter(d => d.side === 'B').length;
    const diff = Math.abs(countA - countB);
    if (diff >= 2) {
      const underdog = countA < countB ? 'A' : 'B';
      const hubs = G.SECTORS.filter(m => sc.owners[underdog].includes(m.id) && (m.supplyHub || m.vp >= 4));
      const pool = ['infantry', 'armor', 'mountain', 'artillery', 'sof'];
      const toAdd = Math.min(diff, 6);
      for (let i = 0; i < toAdd && hubs.length; i++) {
        const hub = hubs[i % hubs.length];
        const type = pool[i % pool.length];
        const tpl = G.UNIT_TEMPLATES[type];
        const tag = underdog === 'A' ? namesA[idxA++ % namesA.length] : namesB[idxB++ % namesB.length];
        divs.push(makeDivision(
          underdog, type,
          (num++) + '-я Резерв. ' + tag + ' (' + tpl.short + ')',
          hub.x + ((i % 2 === 0 ? 1 : -1) * 14),
          hub.y + ((i % 3 - 1) * 11),
          { org: 95, fort: 0.16 }
        ));
      }
    }
    return divs;
  }

  function computeControlStats(st) {
    let vpA = 0, vpB = 0, total = 0, secA = 0, secB = 0, urbanFights = 0;
    for (const m of G.SECTORS) {
      const c = st.cities[m.id];
      total += m.vp;
      if (c.owner === 'A') { vpA += m.vp; secA++; }
      else if (c.owner === 'B') { vpB += m.vp; secB++; }
      if (c.controlA > 1 && c.controlA < 99) urbanFights++;
    }
    return { vpA, vpB, total, secA, secB, urbanFights };
  }

  function initScenario(scenarioId) {
    const sc = G.getScenario(scenarioId);
    const cities = {};
    for (const m of G.SECTORS) {
      const owner = sc.owners.A.includes(m.id) ? 'A' : (sc.owners.B.includes(m.id) ? 'B' : 'neutral');
      cities[m.id] = {
        id: m.id,
        owner,
        controlA: owner === 'A' ? 100 : owner === 'B' ? 0 : 50,
        urbanBattle: false,
        supplied: true,
        supplySource: 'road',
        infra: {
          airfieldHp: m.airfield ? 100 : null,
          helipadHp: m.helipad ? 100 : null,
          portHp: m.port ? 100 : null
        },
        loyaltyA: (sc.loyaltyA && sc.loyaltyA[m.id] != null) ? sc.loyaltyA[m.id] : (owner === 'A' ? 80 : owner === 'B' ? 20 : 50)
      };
    }

    const factions = clone(sc.factions);
    for (const s of ['A', 'B']) {
      factions[s].doctrine = 'balanced';
      factions[s].cooldowns = {};
      factions[s].aiStyle = pickPersonality();
      factions[s].posture = 'consolidate';
      factions[s].postureDaysLeft = 1;
      factions[s].activeDirective = null;
    }

    usedEventIds = new Set();
    aiHourCounter = 0;
    eventHourCounter = 0;
    hourAccum = 0;
    if (speed === 0) speed = 1;

    state = {
      scenarioId: sc.id,
      scenarioTitle: sc.title,
      status: sc.crisisDays > 0 ? 'crisis' : 'active',
      phase: sc.crisisDays > 0 ? 'crisis' : 'war',
      day: 1,
      hour: 6,
      crisisDaysLeft: sc.crisisDays || 0,
      ceasefireDaysLeft: sc.startCeasefireDays || 0,
      noStrikesDaysLeft: 0,
      demarcationDaysLeft: sc.startDemarcation ? (sc.startCeasefireDays || 5) : 0,
      demarcationForce: sc.startDemarcation ? 'UN' : null,
      winner: null,
      factions,
      cities,
      divisions: spawnScenarioDivisions(sc),
      activeStrikes: [],
      battles: [],
      popups: [],
      pendingEvent: null,
      interventionCooldown: 0,
      observerFeed: [],
      un: { mandate: 110, credibility: 82, embargoDaysLeft: 0 },
      drawnPlans: { A: null, B: null },
      pvpReady: { A: false, B: false },
      corridors: Object.fromEntries(Object.keys(CORRIDORS).map(k => [k, { checkpoint: null, mined: null, blocked: null, railDamaged: false }])),
      tkuarchalSiege: {
        active: false,
        supplies: 84,
        fortIntegrity: 100,
        civilians: 12400,
        daysBesieged: 0,
        raidsCount: 0,
        raidCooldown: 0,
        airBridgeCooldown: 0,
        ringCooldown: 0,
        stormCooldown: 0,
        broken: false,
        captured: false
      },
      lastAlert: sc.crisisDays > 0
        ? 'Политический кризис (' + sc.crisisDays + ' дн.) — перетягивайте лояльность городов!'
        : 'Сценарий «' + sc.title + '». ПКМ-рамка выделяет дивизии, ПКМ-клик отправляет в бой.'
    };

    recomputeSupply();
    refreshTkuarchalSiege(true);
    if (state.tkuarchalSiege.active && sc.crisisDays === 0) {
      state.lastAlert = 'Ткуарчал в полной блокаде (12 400 жителей) — гарнизон заперт в горах, но совершает вылазки ДРГ!';
    }
    if (sc.startDemarcation) spawnPeacekeepersOnFront('UN');
    if (isAiSide('A')) runSmartAI('A');
    if (isAiSide('B')) runSmartAI('B');

    lastTick = performance.now();
    startLoop();
    emit();
    return state;
  }

  function addPopup(x, y, text, color) {
    if (!state) return;
    state.popups.push({ x, y, text, color, born: performance.now() });
    if (state.popups.length > 30) state.popups.shift();
  }

  function setAlert(msg, audience = 'both') {
    if (!state) return;
    if (!onlineMode || audience === 'both') state.lastAlert = msg;
    if (onlineMode) {
      state.onlineAlerts ||= {};
      if (audience !== 'B') state.onlineAlerts.A = msg;
      if (audience !== 'A') state.onlineAlerts.B = msg;
    }
  }

  function pushFeed(sideTag, text, audience = ['A', 'B'].includes(sideTag) ? sideTag : 'both') {
    if (!state) return;
    state.observerFeed.unshift({ day: state.day, hour: state.hour, side: sideTag, text, audience });
    if (state.observerFeed.length > 14) state.observerFeed.pop();
  }

  function spawnPeacekeepersOnFront(forceType) {
    if (!state) return;
    state.divisions = state.divisions.filter(d => d.side !== 'N');
    const pairs = [];
    for (const m of G.SECTORS) {
      if (state.cities[m.id].owner !== 'A') continue;
      for (const nbId of m.adj) {
        const nb = G.SECTOR_MAP[nbId];
        if (nb && state.cities[nbId].owner === 'B') {
          pairs.push({ x: (m.x + nb.x) / 2, y: (m.y + nb.y) / 2, name: m.name });
        }
      }
    }
    for (let i = 0; i < Math.min(3, pairs.length); i++) {
      const p = pairs[i];
      state.divisions.push(makeDivision(
        'N', 'infantry',
        (forceType === 'RU' ? 'МС РФ (Буфер · ' : 'МС ООН (Буфер · ') + p.name + ')',
        p.x, p.y,
        { flag: forceType === 'RU' ? 'RU_PK' : 'UN', org: 100, fort: 0.40 }
      ));
    }
  }

  // ==================== TKUARCHAL BLOCKADE & PARTISAN DRG SYSTEM ====================
  const MAIN_WEST_HUBS = new Set(['gudauta', 'gagra', 'psou', 'new_afon']);
  const TKUARCHAL_RAID_TARGETS = ['ochamchyra', 'myku', 'gal', 'dranda'];

  function isTkuarchalCutOff() {
    if (!state || !state.cities.tkuarchal || state.cities.tkuarchal.owner !== 'A') return false;
    const queue = ['tkuarchal'];
    const seen = new Set(['tkuarchal']);
    while (queue.length) {
      const cur = queue.shift();
      if (MAIN_WEST_HUBS.has(cur)) return false;
      const meta = G.SECTOR_MAP[cur];
      if (!meta) continue;
      for (const nb of meta.adj) {
        if (seen.has(nb)) continue;
        const cs = state.corridors && state.corridors[edgeKey(cur, nb)];
        if (cs && cs.blocked) continue;
        if (state.cities[nb] && state.cities[nb].owner === 'A') {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    return true;
  }

  function isTrappedInTkuarchal(div) {
    if (!div || !state || !state.tkuarchalSiege || !state.tkuarchalSiege.active) return false;
    if (div.side !== 'A') return false;
    return nearestSectorMeta(div.x, div.y).id === 'tkuarchal';
  }

  function refreshTkuarchalSiege(silent = false) {
    if (!state || !state.tkuarchalSiege) return;
    const sg = state.tkuarchalSiege;
    const tkMeta = G.SECTOR_MAP.tkuarchal;
    const owner = state.cities.tkuarchal.owner;
    const wasActive = sg.active;
    const cutOff = owner === 'A' && isTkuarchalCutOff();

    if (cutOff) {
      sg.active = true;
      // Cancel any outbound march orders for trapped garrison divisions
      for (const d of state.divisions) {
        if (isTrappedInTkuarchal(d)) {
          if (d.order && nearestSectorMeta(d.order.tx, d.order.ty).id !== 'tkuarchal') d.order = null;
          const dd = dist(d.x, d.y, tkMeta.x, tkMeta.y);
          if (dd > 22) {
            const ang = Math.atan2(d.y - tkMeta.y, d.x - tkMeta.x);
            d.x = tkMeta.x + Math.cos(ang) * 18;
            d.y = tkMeta.y + Math.sin(ang) * 18;
          }
        }
      }
    } else if (wasActive) {
      sg.active = false;
      if (owner === 'A') {
        sg.broken = true;
        state.factions.A.morale = clamp(state.factions.A.morale + 12, 20, 100);
        if (!silent) {
          addPopup(tkMeta.x, tkMeta.y - 20, 'БЛОКАДА ТКУАРЧАЛА ПРОРВАНА!', '#22c55e');
          const m = 'БЛОКАДА ТКУАРЧАЛА ПРОРВАНА! Сухопутный коридор открыт, гарнизон свободен (+12% боевой дух).';
          setAlert(m); pushFeed('A', m);
        }
      } else if (owner === 'B') {
        sg.captured = true;
        state.factions.B.morale = clamp(state.factions.B.morale + 10, 20, 100);
        state.factions.B.weapons += 260;
        if (!silent) {
          addPopup(tkMeta.x, tkMeta.y - 20, 'ТКУАРЧАЛ ПАЛ!', '#ef4444');
          const m = 'ТКУАРЧАЛ ВЗЯТ ВОСТОКОМ! Блокада завершена (+260 ОРУЖ, +10% боевой дух).';
          setAlert(m); pushFeed('B', m);
        }
      }
    }
  }

  function executeTkuarchalRaid(manual = false) {
    if (!state || !state.tkuarchalSiege || !state.tkuarchalSiege.active) {
      return { ok: false, msg: 'Ткуарчал не находится в блокаде' };
    }
    const sg = state.tkuarchalSiege;
    if (sg.supplies < 12) return { ok: false, msg: 'В Ткуарчале критически мало припасов для вылазки ДРГ' };

    const targets = TKUARCHAL_RAID_TARGETS
      .map(id => G.SECTOR_MAP[id])
      .filter(m => m && state.cities[m.id].owner === 'B');
    if (!targets.length) return { ok: false, msg: 'Нет восточных тыловых целей рядом с Ткуарчалом' };

    const tgt = targets[Math.floor(Math.random() * targets.length)];
    const roll = Math.random();
    sg.raidsCount += 1;

    if (roll < 0.42) {
      const stolen = 110 + Math.floor(Math.random() * 65);
      state.factions.B.weapons = Math.max(0, state.factions.B.weapons - stolen);
      state.factions.A.weapons += Math.round(stolen * 0.55);
      sg.supplies = clamp(sg.supplies + 14, 0, 100);
      addPopup(tgt.x, tgt.y - 16, 'ДРГ ТКУАРЧАЛА: −' + stolen + ' ОРУЖ!', '#f59e0b');
      const m = 'Вылазка ДРГ из Ткуарчала в ' + tgt.name + ': похищено ' + stolen + ' ОРУЖ и продовольствие (+14% запасов города)!';
      setAlert(m); pushFeed('A', m);
      return { ok: true, msg: m };
    } else if (roll < 0.74) {
      const stolen = 85;
      state.factions.B.weapons = Math.max(0, state.factions.B.weapons - stolen);
      const nearB = state.divisions.filter(d => d.side === 'B' && dist(d.x, d.y, tgt.x, tgt.y) < 110);
      for (const b of nearB) {
        b.org = Math.max(12, b.org - 18);
        b.jammedDays = Math.max(b.jammedDays, 2);
      }
      sg.supplies = clamp(sg.supplies + 10, 0, 100);
      addPopup(tgt.x, tgt.y - 16, 'ДИВЕРСИЯ ДРГ: КОНВОЙ ПОДОРВАН!', '#f59e0b');
      const m = 'ДРГ Ткуарчала подорвали колонну снабжения у ' + tgt.name + ' (−85 ОРУЖ, ' + nearB.length + ' див. Востока дезорганизованы на 2 дн.)!';
      setAlert(m); pushFeed('A', m);
      return { ok: true, msg: m };
    } else {
      const nearB = state.divisions.filter(d => d.side === 'B' && dist(d.x, d.y, tgt.x, tgt.y) < 120);
      for (const b of nearB.slice(0, 2)) {
        b.hp = Math.max(20, b.hp - Math.round(b.maxHp * 0.11));
        b.org = Math.max(12, b.org - 16);
      }
      const stolen = 95;
      state.factions.B.weapons = Math.max(0, state.factions.B.weapons - stolen);
      sg.supplies = clamp(sg.supplies + 11, 0, 100);
      addPopup(tgt.x, tgt.y - 16, 'НОЧНОЙ РЕЙД ДРГ ТКУАРЧАЛА!', '#f59e0b');
      const m = 'Ночной рейд ДРГ из Ткуарчала по гарнизону ' + tgt.name + ': захвачено ' + stolen + ' ОРУЖ и продовольствие (+11% запасов)!';
      setAlert(m); pushFeed('A', m);
      return { ok: true, msg: m };
    }
  }

  function runTkuarchalSiegeAction(side, actionId) {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    const sg = state.tkuarchalSiege;
    if (!sg || !sg.active) return { ok: false, msg: 'Ткуарчал не в блокаде' };
    const fac = state.factions[side];
    const tk = G.SECTOR_MAP.tkuarchal;
    const garrison = state.divisions.filter(d => isTrappedInTkuarchal(d));

    if (side === 'A' && actionId === 'air_bridge') {
      if (!hasOperationalHelipad('A')) return { ok: false, msg: 'Нет исправной вертолётной площадки или аэродрома для вылета' };
      if (sg.airBridgeCooldown > 0) return { ok: false, msg: 'Вертолётный мост: кд ' + sg.airBridgeCooldown + ' дн.' };
      if (fac.weapons < 120 || fac.pp < 14) return { ok: false, msg: 'Нужно 120 ОРУЖ и 14 ПО для вертолётного моста' };
      fac.weapons -= 120; fac.pp -= 14;
      sg.airBridgeCooldown = 2;
      const aaB = state.divisions.filter(d => d.side === 'B' && d.type === 'aa' && dist(d.x, d.y, tk.x, tk.y) <= 210);
      const intercept = aaB.length && Math.random() < Math.min(0.68, aaB.length * 0.35);
      const gainSup = intercept ? 11 : 24;
      const gainHp = intercept ? 0.08 : 0.18;
      sg.supplies = clamp(sg.supplies + gainSup, 0, 100);
      for (const g of garrison) {
        g.hp = Math.min(g.maxHp, g.hp + Math.round(g.maxHp * gainHp));
        g.org = Math.min(100, g.org + (intercept ? 8 : 16));
      }
      const m = intercept
        ? 'Воздушный мост в Ткуарчал попал под огонь ПВО Востока: доставлена только часть груза (+' + gainSup + '% запасов).'
        : 'Вертолётный мост из Гудауты прорвался в Ткуарчал (+' + gainSup + '% продовольствия и БК, гарнизон пополнен)!';
      addPopup(tk.x, tk.y - 18, intercept ? 'ПВО ПОДБИЛО ВЕРТОЛЁТ!' : 'ВОЗДУШНЫЙ МОСТ +' + gainSup + '%', intercept ? '#f59e0b' : '#38bdf8');
      setAlert(m); pushFeed('A', m); emit();
      return { ok: true, msg: m };
    }

    if (side === 'A' && actionId === 'drg_raid') {
      if (sg.raidCooldown > 0) return { ok: false, msg: 'Вылазка ДРГ: кд ' + sg.raidCooldown + ' дн.' };
      if (fac.pp < 10) return { ok: false, msg: 'Нужно 10 ПО для вылазки ДРГ' };
      fac.pp -= 10;
      sg.raidCooldown = 2;
      const res = executeTkuarchalRaid(true);
      emit();
      return res;
    }

    if (side === 'B' && actionId === 'tighten_ring') {
      if (state.ceasefireDaysLeft > 0) return { ok: false, msg: 'Действует перемирие' };
      if (sg.ringCooldown > 0) return { ok: false, msg: 'Сжатие кольца: кд ' + sg.ringCooldown + ' дн.' };
      if (fac.weapons < 110 || fac.pp < 12) return { ok: false, msg: 'Нужно 110 ОРУЖ и 12 ПО' };
      fac.weapons -= 110; fac.pp -= 12;
      sg.ringCooldown = 2;
      sg.fortIntegrity = clamp(sg.fortIntegrity - 22, 0, 100);
      sg.supplies = clamp(sg.supplies - 16, 0, 100);
      for (const g of garrison) g.org = Math.max(12, g.org - 14);
      const m = 'Восток сжал кольцо блокады Ткуарчала: тоннели −22% (ост. ' + Math.round(sg.fortIntegrity) + '%), запасы −16%!';
      addPopup(tk.x, tk.y - 18, 'ОСАДА: ТОННЕЛИ −22%', '#ef4444');
      setAlert(m); pushFeed('B', m); emit();
      return { ok: true, msg: m };
    }

    if (side === 'B' && actionId === 'storm_tunnels') {
      if (state.ceasefireDaysLeft > 0) return { ok: false, msg: 'Действует перемирие' };
      if (sg.stormCooldown > 0) return { ok: false, msg: 'Штурм тоннелей: кд ' + sg.stormCooldown + ' дн.' };
      const nearMtn = state.divisions.some(d => d.side === 'B' && (d.type === 'mountain' || d.type === 'engineering') && dist(d.x, d.y, tk.x, tk.y) < 160);
      if (sg.fortIntegrity > 45 && sg.supplies > 30 && !nearMtn) {
        return { ok: false, msg: 'Сначала ослабьте тоннели (≤45%) / запасы (≤30%) или подведите горных егерей / сапёров' };
      }
      if (fac.weapons < 150 || fac.pp < 16) return { ok: false, msg: 'Нужно 150 ОРУЖ и 16 ПО' };
      fac.weapons -= 150; fac.pp -= 16;
      sg.stormCooldown = 3;
      sg.fortIntegrity = clamp(sg.fortIntegrity - 28, 0, 100);
      for (const g of garrison) {
        g.hp = Math.max(10, g.hp - Math.round(g.maxHp * 0.22));
        g.org = Math.max(10, g.org - 24);
      }
      state.divisions = state.divisions.filter(d => d.side === 'N' || d.hp > 1);
      const m = 'Штурм шахтных рубежей Ткуарчала: укрепления −28% (ост. ' + Math.round(sg.fortIntegrity) + '%), гарнизон понёс тяжёлые потери!';
      addPopup(tk.x, tk.y - 18, 'ШТУРМ ТОННЕЛЕЙ!', '#ef4444');
      setAlert(m); pushFeed('B', m); emit();
      return { ok: true, msg: m };
    }

    return { ok: false, msg: 'Неизвестное действие осады' };
  }

  // ==================== DYNAMIC GEOPOLITICAL & SECRET EVENTS ====================
  function chooseAiEventOption(side, ev, avoidChoice = null) {
    const fac = state.factions[side];
    if (!fac) return ev.choices[0];
    const vp = computeControlStats(state);
    const vpPct = (side === 'A' ? vp.vpA : vp.vpB) / Math.max(1, vp.total);
    const myDivs = state.divisions.filter(d => d.side === side);
    const avgOrg = myDivs.length ? myDivs.reduce((s, d) => s + d.org, 0) / myDivs.length : 80;
    const losing = vpPct < 0.45 || myDivs.length < 10;
    const aggressive = fac.posture === 'offensive' || fac.aiStyle === 'blitz_coast' || fac.aiStyle === 'deep_raid';
    const cautious = fac.posture === 'defense' || fac.aiStyle === 'artillery_attrition';

    let bestChoice = ev.choices[0], bestScore = -1e9;
    for (const ch of ev.choices) {
      const e = ch.eff || {};
      let sc = 0;
      if (e.manpower) sc += e.manpower * (fac.manpower < 1200 ? 0.14 : 0.04);
      if (e.weapons)  sc += e.weapons * (fac.weapons < 900 ? 0.15 : (aggressive ? 0.08 : 0.04));
      if (e.pp)       sc += e.pp * (fac.pp < 55 ? 1.6 : (cautious ? 1.1 : 0.5));
      if (e.missiles) sc += e.missiles * (aggressive ? 30 : 14);
      if (e.morale)   sc += e.morale * (fac.morale < 75 ? 3.5 : 1.2);
      if (e.orgAll)   sc += e.orgAll * (avgOrg < 78 ? 2.8 : 0.8);
      if (e.fortAll)  sc += e.fortAll * (cautious || losing ? 160 : 40);
      if (e.spawn)    sc += losing ? 75 : (aggressive ? 42 : 18);
      if (e.ceasefireDays) sc += (losing || avgOrg < 62) ? 65 : -45;
      if (side === 'A' && (e.weapons || e.fortAll || e.missiles)) sc += 12;
      if (side === 'B' && (e.manpower || e.pp || e.orgAll)) sc += 12;
      if (avoidChoice && ch === avoidChoice && ev.choices.length > 1) sc -= 38;
      if (Object.keys(e).length === 0) sc += cautious ? 14 : -10;
      sc += (Math.random() - 0.5) * 32;
      if (sc > bestScore) { bestScore = sc; bestChoice = ch; }
    }
    return bestChoice;
  }

  function triggerRandomEvent() {
    if (!state || state.pendingEvent || !G.pickRandomEvent) return;
    const isObs = role === 'observer';
    const ev = G.pickRandomEvent(usedEventIds, !isObs);
    if (!ev) return;
    usedEventIds.add(ev.id);

    if (isObs) {
      if (ev.visibility === 'both') {
        const cA = chooseAiEventOption('A', ev);
        const cB = chooseAiEventOption('B', ev, cA);
        applyEventEffect('A', cA.eff);
        applyEventEffect('B', cB.eff);
        const lblA = cA.label.split('(')[0].trim();
        const lblB = cB.label.split('(')[0].trim();
        pushFeed('A', ev.title + ' → ' + lblA);
        pushFeed('B', ev.title + ' → ' + lblB);
        setAlert(ev.title + ' · ЗАП: «' + lblA + '» | ВОС: «' + lblB + '»');
      } else {
        const side = Math.random() < 0.5 ? 'A' : 'B';
        const ch = chooseAiEventOption(side, ev);
        const lbl = ch.label.split('(')[0].trim();
        applyEventEffect(side, ch.eff);
        pushFeed(side, 'ТАЙНО: ' + ev.title + ' → ' + lbl);
        setAlert((side === 'A' ? 'ЗАП' : 'ВОС') + ' (тайно): ' + ev.title + ' → «' + lbl + '»');
      }
      return;
    }

    const side = role === 'pvp' ? pvpSide : role;
    const targetSide = onlineMode
      ? (Math.random() < 0.5 ? 'A' : 'B')
      : (side === 'A' || side === 'B' ? side : Math.random() < 0.5 ? 'A' : 'B');
    openPendingEvent(ev, targetSide);
  }

  function openPendingEvent(event, targetSide, treaty = null) {
    const now = Date.now();
    const durationMs = treaty ? 30000 : onlineMode ? 18000 : 10000;
    const sides = onlineMode && event.visibility === 'both' ? ['A', 'B'] : [targetSide];
    state.pendingEvent = {
      event, targetSide, treaty, durationMs, expiresAt: now + durationMs,
      key: event.id + ':' + now,
      answers: Object.fromEntries(sides.map(side => [side, null]))
    };
    emit();
    if (onlineMode === 'host') G.SupabaseNet?.pushSnapshot(state, true);
  }

  function pendingEventForPlayer() {
    const pending = state?.pendingEvent;
    if (!pending || state.status === 'finished') return null;
    const side = onlineMode ? role : pending.targetSide;
    return pending.answers?.[side] === null ? pending : null;
  }

  function resolvePendingEvent(side, key, choiceIdx, timedOut = false) {
    const pending = state?.pendingEvent;
    if (state?.status === 'finished' || !pending || pending.key !== key || pending.answers[side] !== null) {
      return { ok: false, msg: 'Решение по этому событию уже принято или недоступно' };
    }
    const { event, treaty } = pending;
    const choice = event.choices[choiceIdx];
    if (!Number.isInteger(choiceIdx) || !choice) return { ok: false, msg: 'Неизвестный вариант решения' };
    pending.answers[side] = choiceIdx;
    if (Object.values(pending.answers).every(answer => answer !== null)) state.pendingEvent = null;

    if (treaty) {
      if (choiceIdx === 0) {
        applyTreaty(treaty.side, treaty.type);
      } else {
        setAlert(timedOut ? 'Срок ответа на предложение истёк' : 'Предложение отклонено');
      }
    } else {
      applyEventEffect(side, choice.eff);
      if (!onlineMode && event.visibility === 'both') {
        const other = enemyOf(side);
        if (isAiSide(other)) applyEventEffect(other, chooseAiEventOption(other, event, choice).eff);
      }
      const shortLabel = choice.label.split('(')[0].trim();
      const note = timedOut ? 'Время вышло · Штаб выбрал «' + shortLabel + '»' : event.title + ' → «' + shortLabel + '»';
      setAlert(note, side);
      pushFeed(side, note);
    }
    emit();
    return { ok: true };
  }

  function answerEvent(key, choiceIdx) {
    if (pendingEventForPlayer()?.key !== key) return { ok: false, msg: 'Это событие уже недоступно' };
    if (onlineMode === 'guest') return G.SupabaseNet.submitCommand('resolve_event', { eventKey: key, choiceIdx });
    const result = resolvePendingEvent(onlineMode ? role : state.pendingEvent.targetSide, key, choiceIdx);
    if (result.ok && onlineMode === 'host') G.SupabaseNet?.pushSnapshot(state, true);
    return result;
  }

  function applyEventEffect(side, eff, preferredSectorId = null) {
    if (!eff || !state || (side !== 'A' && side !== 'B')) return;
    const fac = state.factions[side];
    if (eff.manpower) fac.manpower = Math.max(0, fac.manpower + eff.manpower);
    if (eff.weapons) fac.weapons = Math.max(0, fac.weapons + eff.weapons);
    if (eff.pp) fac.pp = clamp(fac.pp + eff.pp, 0, 500);
    if (eff.missiles) fac.missiles = Math.max(0, fac.missiles + eff.missiles);
    if (eff.morale) fac.morale = clamp(fac.morale + eff.morale, 20, 100);
    if (eff.ceasefireDays) state.ceasefireDaysLeft = Math.max(state.ceasefireDaysLeft, eff.ceasefireDays);
    if (eff.orgAll) {
      for (const d of state.divisions) {
        if (d.side === side) d.org = clamp(d.org + eff.orgAll, 10, 100);
      }
    }
    if (eff.fortAll) {
      for (const d of state.divisions) {
        if (d.side === side) d.fort = clamp(d.fort + eff.fortAll, 0, 0.6);
      }
    }
    if (eff.spawn && G.UNIT_TEMPLATES[eff.spawn]) {
      const pref = preferredSectorId && G.SECTOR_MAP[preferredSectorId] && state.cities[preferredSectorId].owner === side
        ? G.SECTOR_MAP[preferredSectorId] : null;
      const hub = pref || G.SECTORS.find(m => state.cities[m.id].owner === side && m.supplyHub)
        || G.SECTORS.find(m => state.cities[m.id].owner === side) || G.SECTORS[0];
      const tpl = G.UNIT_TEMPLATES[eff.spawn];
      state.divisions.push(makeDivision(
        side, eff.spawn,
        'Подкрепление ' + tpl.short + ' (' + hub.name + ')',
        hub.x + (Math.random() - 0.5) * 20,
        hub.y + (Math.random() - 0.5) * 20,
        { org: 92, fort: 0.1 }
      ));
      addPopup(hub.x, hub.y - 12, 'ПОДКРЕПЛЕНИЕ (' + tpl.short + ')', side === 'A' ? '#60a5fa' : '#f87171');
    }
  }

  // ==================== REAL-TIME LOOP ====================
  function advanceClock(now, maxElapsed) {
    const dt = Math.min(maxElapsed, (now - lastTick) / 1000);
    lastTick = now;
    if (!state || state.status === 'finished' || onlineMode === 'guest') return;
    const pending = state.pendingEvent;
    if (pending && Date.now() >= pending.expiresAt) {
      const choices = pending.event.choices;
      const neutral = choices.findIndex(choice => !choice.eff || Object.keys(choice.eff).length === 0);
      const fallback = pending.treaty || neutral < 0 ? choices.length - 1 : neutral;
      for (const [side, answer] of Object.entries(pending.answers)) {
        if (answer === null) resolvePendingEvent(side, pending.key, fallback, true);
      }
      if (onlineMode === 'host') G.SupabaseNet?.pushSnapshot(state, true);
    }
    if (speed === 0) return;
    for (let remaining = dt; remaining > 0 && speed > 0; remaining -= 0.08) {
      stepRealTime(Math.min(remaining, 0.08) * speed, now);
    }
  }

  function startLoop() {
    if (loopId) return;
    lastTick = performance.now();
    const tick = now => {
      loopId = requestAnimationFrame(tick);
      if (onlineMode === 'host' && (document.hidden || now - lastTick < 30)) return;
      advanceClock(now, onlineMode === 'host' ? 0.18 : 0.08);
    };
    loopId = requestAnimationFrame(tick);
  }

  function stepRealTime(simDt, now) {
    hourAccum += simDt / 0.55;
    let newDay = false;
    while (hourAccum >= 1) {
      hourAccum -= 1;
      state.hour += 1;
      aiHourCounter += 1;
      eventHourCounter += 1;

      if (aiHourCounter >= 6) {
        aiHourCounter = 0;
        if (isAiSide('A')) runSmartAI('A');
        if (isAiSide('B')) runSmartAI('B');
      }

      if ((state.day === 1 && state.hour === 10 && usedEventIds.size === 0) || eventHourCounter >= 28) {
        eventHourCounter = 0;
        triggerRandomEvent();
      }

      if (state.hour >= 24) {
        state.hour = 0;
        state.day += 1;
        newDay = true;
      }
    }

    refreshTkuarchalSiege(false);
    const vpNow = computeControlStats(state);

    // 1. Continuous On-Road / On-Rail Division Movement, Obstacle Handling & Entrenchment
    for (const d of state.divisions) {
      if (onlineMode === 'host') divisionMotion.delete(d);
      d.inCombat = false;
      d.onRail = false;
      d.onSea = false;
      if (d.side !== 'A' && d.side !== 'B') continue;
      const fac = state.factions[d.side];
      const tpl = G.UNIT_TEMPLATES[d.type];
      const terr = getTerrainAt(d.x, d.y);

      if (d.order && (d.order.type === 'march' || d.order.type === 'retreat')) {
        const wp = (d.order.path && d.order.path.length) ? d.order.path[0] : { x: d.order.tx, y: d.order.ty };
        const corrState = wp.edgeKey && state.corridors && state.corridors[wp.edgeKey];
        const corrMeta = wp.edgeKey && CORRIDORS[wp.edgeKey];
        const usingRail = !!(wp.isRail && wp.edgeKey && isRailUsableForSide(wp.edgeKey, d.side));
        d.onRail = usingRail;
        d.onSea = !!wp.isSea;

        const roadMult = usingRail ? 2.15 : (wp.isSea ? 1.35 : (corrMeta && corrMeta.kind === 'highway' ? 1.25 : (corrMeta && corrMeta.kind === 'trail' ? 0.72 : 1.0)));
        const supplySpeedMod = d.supplied === false ? 0.72 : 1.0;
        const speedMult = (fac.doctrine === 'mobile_armor' ? 1.25 : 1.0) * (d.jammedDays > 0 ? 0.55 : 1.0) * roadMult * supplySpeedMod;
        const moveSpeed = (tpl.speed / (usingRail ? 0.9 : terr.moveCost)) * speedMult * 0.28;

        let blockedByObstacle = false;

        // Check Blown Bridge / Roadblock, Minefield & Checkpoint at corridor midpoint!
        if (corrState && corrMeta && dist(d.x, d.y, corrMeta.mid.x, corrMeta.mid.y) < 28) {
          // 3a. Blown bridge / Blocked corridor
          if (corrState.blocked) {
            blockedByObstacle = true;
            if (d.type === 'engineering') {
              // Sapper battalion repairs blown bridge/roadblock in real time!
              corrState.blocked.hp = Math.max(0, corrState.blocked.hp - 18 * simDt);
              if (corrState.blocked.hp <= 0) {
                corrState.blocked = null;
                corrState.railDamaged = false;
                blockedByObstacle = false;
                recomputeSupply();
                refreshTkuarchalSiege(false);
                addPopup(corrMeta.mid.x, corrMeta.mid.y - 14, 'ПЕРЕПРАВА ВОССТАНОВЛЕНА!', '#22c55e');
                pushFeed(d.side, 'Сапёры восстановили путь: ' + corrMeta.label);
              }
            } else {
              // Non-engineer cannot cross blown bridge: attempt automatic reroute, else halt!
              const destSec = nearestSectorMeta(d.order.tx, d.order.ty);
              const fromSec = nearestSectorMeta(d.x, d.y);
              const altPath = computeSectorPath(fromSec.id, destSec.id, d.type, d.side, false);
              if (altPath && altPath.length > 1) {
                const newWps = [];
                for (let k = 0; k < altPath.length - 1; k++) {
                  for (const nw of getCorridorWaypoints(altPath[k], altPath[k + 1], d.side)) newWps.push(nw);
                }
                d.order.path = newWps;
                blockedByObstacle = false;
              } else {
                d.order = null;
                addPopup(d.x, d.y - 14, 'ПУТЬ ПЕРЕКРЫТ!', '#ef4444');
                pushFeed(d.side, d.name + ' остановлена: путь ' + corrMeta.label + ' взорван (нужны сапёры ИНЖ)');
              }
            }
          }

          // 3b. Minefield detonation or sapper clearance
          if (!blockedByObstacle && corrState.mined && corrState.mined.side !== d.side && corrState.mined.charges > 0) {
            if (d.type === 'engineering') {
              corrState.mined = null;
              addPopup(corrMeta.mid.x, corrMeta.mid.y - 12, 'САПЁРЫ РАЗМИНИРОВАЛИ!', '#22c55e');
              pushFeed(d.side, 'Сапёры разминировали участок ' + corrMeta.label);
            } else {
              const dmgPct = d.type === 'armor' ? 0.22 : 0.14;
              const dmg = Math.round(d.maxHp * dmgPct);
              d.hp = Math.max(10, d.hp - dmg);
              d.org = Math.max(10, d.org - 26);
              d.jammedDays = Math.max(d.jammedDays, 2);
              corrState.mined.charges -= 1;
              if (corrState.mined.charges <= 0) corrState.mined = null;
              addPopup(corrMeta.mid.x, corrMeta.mid.y - 14, 'ПОДРЫВ НА МИНАХ! −' + dmg, '#f59e0b');
              pushFeed(d.side, d.name + ' подорвалась на минах (' + corrMeta.label + ')!');
            }
          }

          // 3c. Enemy Checkpoint physically HALTS movement & forces combat until breached!
          if (!blockedByObstacle && corrState.checkpoint && corrState.checkpoint.side !== d.side && corrState.checkpoint.hp > 0) {
            if (state.ceasefireDaysLeft > 0) {
              blockedByObstacle = true;
            } else {
              blockedByObstacle = true;
              d.inCombat = true;
              const breachMult = (d.type === 'engineering' || d.type === 'armor' || d.type === 'artillery') ? 1.85 : 1.0;
              const cpDmg = (G.UNIT_TEMPLATES[d.type].atk * 0.42 * breachMult) * simDt;
              const divDmg = 18 * simDt;
              corrState.checkpoint.hp = Math.max(0, corrState.checkpoint.hp - cpDmg);
              d.hp = Math.max(5, d.hp - divDmg);
              d.org = Math.max(10, d.org - 3.5 * simDt);
              if (corrState.checkpoint.hp <= 0) {
                corrState.checkpoint = null;
                blockedByObstacle = false;
                addPopup(corrMeta.mid.x, corrMeta.mid.y - 14, 'БЛОКПОСТ ПРОРВАН!', d.side === 'A' ? '#60a5fa' : '#f87171');
                pushFeed(d.side, 'Блокпост на участке ' + corrMeta.label + ' уничтожен!');
              }
            }
          }
        }

        if (!blockedByObstacle && d.order) {
          const dx = wp.x - d.x;
          const dy = wp.y - d.y;
          const dd = Math.hypot(dx, dy);
          if (dd <= moveSpeed * simDt + 2.0) {
            d.x = wp.x; d.y = wp.y;
            if (d.order.path && d.order.path.length > 1) d.order.path.shift();
            else d.order = null;
          } else {
            const vx = (dx / dd) * moveSpeed;
            const vy = (dy / dd) * moveSpeed;
            d.x += vx * simDt;
            d.y += vy * simDt;
            if (onlineMode === 'host') {
              divisionMotion.set(d, { x: d.x, y: d.y, vx, vy, target: wp, order: d.order });
            }
            d.fort = Math.max(0, d.fort - 0.04 * simDt);
          }
        }
      } else {
        const entRate = d.type === 'engineering' ? 0.055 : 0.022;
        const maxF = d.type === 'engineering' ? 0.60 : 0.45;
        const moraleRec = 0.75 + (fac.morale / 100) * 0.45;
        const orgCap = d.supplied === false ? 58 : 100;
        d.fort = Math.min(maxF, d.fort + entRate * simDt);
        if (d.org < orgCap) d.org = Math.min(orgCap, d.org + 2.8 * moraleRec * simDt);
      }
    }

    // 2. Flying Strikes
    for (let i = state.activeStrikes.length - 1; i >= 0; i--) {
      const s = state.activeStrikes[i];
      s.progress += simDt * 0.65;
      if (s.progress >= 1) {
        resolveStrikeImpact(s);
        state.activeStrikes.splice(i, 1);
      }
    }

    // 3. Symmetric Field & Urban Combat with Lanchester Superiority
    state.battles = [];
    const isNight = state.hour >= 21 || state.hour < 6;
    const nightCombatMult = isNight ? 0.20 : 1.0;
    if (isNight) {
      for (const d of state.divisions) {
        if (d.side !== 'A' && d.side !== 'B') continue;
        d.org = Math.min(100, d.org + 2.8 * simDt);
        d.fort = Math.min(0.55, d.fort + 0.015 * simDt);
      }
    }

    if (state.phase === 'war' && state.ceasefireDaysLeft === 0) {
      const divsA = state.divisions.filter(d => d.side === 'A' && d.hp > 0);
      const divsB = state.divisions.filter(d => d.side === 'B' && d.hp > 0);

      // Build symmetric unique engagement pairs (every division within 68px picks its nearest opponent)
      const pairMap = new Map();
      const deg = {};
      const addPair = (a, b) => {
        const key = a.id + '|' + b.id;
        if (pairMap.has(key)) return;
        pairMap.set(key, [a, b]);
        deg[a.id] = (deg[a.id] || 0) + 1;
        deg[b.id] = (deg[b.id] || 0) + 1;
      };

      for (const a of divsA) {
        let best = null, bestD = 68;
        for (const b of divsB) {
          const d = dist(a.x, a.y, b.x, b.y);
          if (d < bestD) { bestD = d; best = b; }
        }
        if (best) addPair(a, best);
      }
      for (const b of divsB) {
        let best = null, bestD = 68;
        for (const a of divsA) {
          const d = dist(a.x, a.y, b.x, b.y);
          if (d < bestD) { bestD = d; best = a; }
        }
        if (best) addPair(best, b);
      }

      for (const [a, b] of pairMap.values()) {
        a.inCombat = true;
        b.inCombat = true;

        const midX = (a.x + b.x) * 0.5, midY = (a.y + b.y) * 0.5;
        const terr = getTerrainAt(midX, midY);

        const alliesA = divsA.filter(x => dist(x.x, x.y, midX, midY) < 95).length;
        const alliesB = divsB.filter(x => dist(x.x, x.y, midX, midY) < 95).length;
        const flankMultA = Math.min(1.85, 1 + Math.max(0, alliesA - 1) * 0.26);
        const flankMultB = Math.min(1.85, 1 + Math.max(0, alliesB - 1) * 0.26);

        const powA = calcLivePower(a, terr, midX, midY, vpNow) * flankMultA;
        const powB = calcLivePower(b, terr, midX, midY, vpNow) * flankMultB;
        const pctA = Math.round(clamp((powA / Math.max(0.5, powA + powB)) * 100, 8, 92));

        // Normalize by engagement degree so a unit fighting 2 opponents splits its fire cleanly
        const shareA = 1 / Math.max(1, deg[a.id]);
        const shareB = 1 / Math.max(1, deg[b.id]);

        const dmgToA = (powB / Math.max(4, powA)) * 7.5 * shareB * nightCombatMult * simDt;
        const dmgToB = (powA / Math.max(4, powB)) * 7.5 * shareA * nightCombatMult * simDt;
        a.hp = Math.max(0, a.hp - dmgToA);
        b.hp = Math.max(0, b.hp - dmgToB);
        if (state.tkuarchalSiege && state.tkuarchalSiege.active && isTrappedInTkuarchal(a)) {
          const erode = (b.type === 'mountain' || b.type === 'engineering') ? 1.15 : 0.22;
          state.tkuarchalSiege.fortIntegrity = clamp(state.tkuarchalSiege.fortIntegrity - erode * nightCombatMult * simDt, 0, 100);
        }
        a.org = Math.max(0, a.org - (powB / Math.max(4, powA)) * 1.9 * shareB * nightCombatMult * simDt);
        b.org = Math.max(0, b.org - (powA / Math.max(4, powB)) * 1.9 * shareA * nightCombatMult * simDt);

        const pushBackOnRoad = (loser, winner) => {
          const curSec = nearestSectorMeta(loser.x, loser.y);
          const retreatNb = curSec.adj
            .map(id => G.SECTOR_MAP[id])
            .filter(m => m && (state.cities[m.id].owner === loser.side || dist(m.x, m.y, winner.x, winner.y) > dist(curSec.x, curSec.y, winner.x, winner.y)))
            .sort((m1, m2) => dist(m2.x, m2.y, winner.x, winner.y) - dist(m1.x, m1.y, winner.x, winner.y))[0];
          loser.org = 32;
          if (retreatNb && !isTrappedInTkuarchal(loser)) {
            const wps = getCorridorWaypoints(curSec.id, retreatNb.id, loser.side);
            loser.order = { type: 'retreat', tx: retreatNb.x, ty: retreatNb.y, path: wps };
          } else {
            loser.order = null;
          }
        };
        if (b.org < 14 && powA > powB) {
          pushBackOnRoad(b, a);
          addPopup(midX, midY, 'ПРОРЫВ ЗАПАДА!', '#60a5fa');
        } else if (a.org < 14 && powB > powA) {
          pushBackOnRoad(a, b);
          addPopup(midX, midY, 'ПРОРЫВ ВОСТОКА!', '#f87171');
        }

        const bubble = state.battles.find(bt => dist(bt.x, bt.y, midX, midY) < 60);
        if (!bubble) state.battles.push({ x: midX, y: midY, pctA, countA: alliesA, countB: alliesB });
        else bubble.pctA = Math.round((bubble.pctA + pctA) * 0.5);
      }

      state.divisions = state.divisions.filter(d => d.side === 'N' || d.hp > 1);
    }

    // 4. Urban Warfare & Gradual Capture (paused at night and during ceasefire)
    if (state.phase === 'war' && state.ceasefireDaysLeft === 0 && !isNight) {
      for (const m of G.SECTORS) {
        const city = state.cities[m.id];
        const nearA = state.divisions.filter(d => d.side === 'A' && dist(d.x, d.y, m.x, m.y) < 72);
        const nearB = state.divisions.filter(d => d.side === 'B' && dist(d.x, d.y, m.x, m.y) < 72);
        if (!nearA.length && !nearB.length) continue;

        const pushA = nearA.reduce((s, d) => s + (d.hp / d.maxHp) * (d.order?.opMode === 'massive' ? 1.5 : 1.0), 0);
        const pushB = nearB.reduce((s, d) => s + (d.hp / d.maxHp) * (d.order?.opMode === 'massive' ? 1.5 : 1.0), 0);
        let rate = m.vp >= 5 ? 0.72 : 1.45;
        if (m.id === 'tkuarchal' && state.tkuarchalSiege && state.tkuarchalSiege.active && pushB > pushA) {
          const sg = state.tkuarchalSiege;
          if (sg.fortIntegrity > 30 && sg.supplies > 20) rate *= 0.22;
          else if (sg.fortIntegrity > 10 || sg.supplies > 10) rate *= 0.52;
        }
        const prevOwner = city.owner;
        city.controlA = clamp(city.controlA + (pushA - pushB) * rate * simDt, 0, 100);
        city.urbanBattle = city.controlA > 1 && city.controlA < 99;

        if (city.controlA >= 99.5 && prevOwner !== 'A') {
          city.controlA = 100; city.owner = 'A'; city.urbanBattle = false;
          const fObj = G.SECTOR_FACILITIES && G.SECTOR_FACILITIES[m.id];
          if (fObj) { state.factions.A.weapons += fObj.lootWp; state.factions.A.pp = Math.min(500, state.factions.A.pp + 10); }
          addPopup(m.x, m.y - 16, 'ЗАНЯТ: ' + m.name, '#3b82f6');
          const msgA = 'Запад занял ' + m.name + (fObj ? (' (+' + fObj.lootWp + ' ОРУЖ · ' + fObj.tag + ')') : '');
          setAlert(msgA); pushFeed('A', msgA, 'both'); recomputeSupply(); refreshTkuarchalSiege(false);
        } else if (city.controlA <= 0.5 && prevOwner !== 'B') {
          city.controlA = 0; city.owner = 'B'; city.urbanBattle = false;
          const fObj = G.SECTOR_FACILITIES && G.SECTOR_FACILITIES[m.id];
          if (fObj) { state.factions.B.weapons += fObj.lootWp; state.factions.B.pp = Math.min(500, state.factions.B.pp + 10); }
          addPopup(m.x, m.y - 16, 'ЗАНЯТ: ' + m.name, '#ef4444');
          const msgB = 'Восток занял ' + m.name + (fObj ? (' (+' + fObj.lootWp + ' ОРУЖ · ' + fObj.tag + ')') : '');
          setAlert(msgB); pushFeed('B', msgB, 'both'); recomputeSupply(); refreshTkuarchalSiege(false);
        }
      }
    }

    if (newDay) onNewDay();
    if (state.popups.length) state.popups = state.popups.filter(p => now - p.born < 3200);
    emit();
  }

  function calcLivePower(d, terr, cx, cy, vpC) {
    const fac = state.factions[d.side];
    if (!fac) return 1;
    const tpl = G.UNIT_TEMPLATES[d.type];
    const doc = fac.doctrine;
    const isMtn = terr.defBonus >= 0.40;
    const isFortOrUrban = terr === G.TERRAINS.urban || terr === G.TERRAINS.fortress;
    const mtnMult = d.type === 'mountain'
      ? terr.mountainMod * (doc === 'mountain_warfare' ? 1.3 : 1.0)
      : (isMtn && doc === 'mountain_warfare' ? 1.25 : 1.0);
    const armMult = d.type === 'armor' ? terr.armorMod * (doc === 'mobile_armor' ? 1.3 : 1.0) : 1.0;
    const fortDocMult = (doc === 'fortress_aa' && isFortOrUrban) ? 1.22 : 1.0;
    const opMult = d.order?.opMode === 'massive' ? 1.35 : (d.order?.opMode === 'standard' ? 1.12 : 1.0);
    const jamMult = d.jammedDays > 0 ? 0.72 : 1.0;
    const moraleMult = 0.85 + (clamp(fac.morale || 80, 20, 100) / 100) * 0.30;
    const artSup = state.divisions.filter(x => x.side === d.side && x.type === 'artillery' && x.id !== d.id && dist(x.x, x.y, cx, cy) <= 155).length;
    const artMult = 1 + Math.min(0.45, artSup * 0.22);
    const vp = vpC || computeControlStats(state);
    const myVpPct = (d.side === 'A' ? vp.vpA : vp.vpB) / Math.max(1, vp.total);
    const homeMult = myVpPct < 0.36 ? 1.18 : 1.0;
    let siegeMult = 1.0;
    if (state.tkuarchalSiege && state.tkuarchalSiege.active && nearestSectorMeta(cx, cy).id === 'tkuarchal') {
      const sg = state.tkuarchalSiege;
      if (d.side === 'A') {
        const fortScale = 0.25 + (sg.fortIntegrity / 100) * 0.70;
        const supScale = sg.supplies > 15 ? 1.0 : 0.62;
        siegeMult = (1 + fortScale) * supScale; // up to 1.95x tunnel defense when intact!
      } else if (d.side === 'B' && sg.fortIntegrity > 35 && d.type !== 'mountain' && d.type !== 'engineering' && d.type !== 'sof') {
        siegeMult = 0.68; // conventional forces struggle in Tkuarchal mountain approaches
      }
    }
    const supplyMult = d.supplied === false ? 0.72 : 1.0;
    // River / Bridgehead assault penalty if attacking across bridge without engineers or artillery
    const nearSec = nearestSectorMeta(cx, cy);
    const isDefenderHere = state.cities[nearSec.id]?.owner === d.side;
    const hasEngOrArt = artSup > 0 || state.divisions.some(x => x.side === d.side && x.type === 'engineering' && dist(x.x, x.y, cx, cy) <= 95);
    const bridgeMult = (nearSec.terrain === 'bridgehead' && !isDefenderHere && !hasEngOrArt) ? 0.84 : 1.0;
    return Math.max(
      1,
      (tpl.atk * opMult + tpl.def * (1 + d.fort + terr.defBonus) * fortDocMult) *
      (d.hp / d.maxHp) * (0.55 + d.org / 200) * mtnMult * armMult * artMult * jamMult * moraleMult * homeMult * siegeMult * supplyMult * bridgeMult
    );
  }

  function resolveStrikeImpact(s) {
    const def = G.STRIKES[s.type];
    if (!def) return;
    const enemy = enemyOf(s.side);

    if (def.isFriendlyHeal) {
      const friends = state.divisions.filter(d => d.side === s.side && dist(d.x, d.y, s.tx, s.ty) <= def.radius);
      for (const f of friends) {
        f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * 0.18));
        f.org = Math.min(100, f.org + 24);
      }
      addPopup(s.tx, s.ty, 'РОТАЦИЯ +' + friends.length + ' ДИВ.', '#22c55e');
      return;
    }
    if (def.isPsyops) {
      const targets = state.divisions.filter(d => d.side === enemy && dist(d.x, d.y, s.tx, s.ty) <= def.radius);
      for (const t of targets) t.org = Math.max(10, t.org - 26);
      state.factions[enemy].morale = Math.max(25, state.factions[enemy].morale - 6);
      addPopup(s.tx, s.ty, 'ИПсО: −26% ОРГ (' + targets.length + ')', '#ec4899');
      return;
    }
    if (def.isNavalRaid) {
      state.factions[enemy].weapons = Math.max(0, state.factions[enemy].weapons - 220);
      const targets = state.divisions.filter(d => d.side === enemy && dist(d.x, d.y, s.tx, s.ty) <= def.radius);
      for (const t of targets) {
        t.org = Math.max(10, t.org - 22);
        t.hp = Math.max(10, t.hp - Math.round(t.maxHp * 0.10));
      }
      addPopup(s.tx, s.ty, 'БЛОКАДА: −220 ОРУЖ', '#0ea5e9');
      pushFeed(s.side, 'Морская диверсия: уничтожено 220 ед. БК противника');
      return;
    }

    const aaCover = state.divisions.filter(d => d.side === enemy && d.type === 'aa' && dist(d.x, d.y, s.tx, s.ty) <= 175);
    const defDoc = state.factions[enemy].doctrine;

    if (def.isDrop) {
      if (aaCover.length && Math.random() < Math.min(0.75, aaCover.length * 0.35 + (defDoc === 'fortress_aa' ? 0.20 : 0))) {
        addPopup(s.tx, s.ty, 'ДЕСАНТ СБИТ ПВО!', '#ef4444');
        return;
      }
      const num = state.divisions.length + 1;
      state.divisions.push(makeDivision(s.side, 'sof', num + '-я Десантная ДРГ', s.tx, s.ty, { org: 84, fort: 0.02 }));
      addPopup(s.tx, s.ty, 'ДЕСАНТ ВЫСАЖЕН!', '#38bdf8');
      return;
    }

    const targets = state.divisions.filter(d => d.side === enemy && dist(d.x, d.y, s.tx, s.ty) <= def.radius);
    const intercept = (def.aaCounterable && aaCover.length)
      ? Math.min(0.82, aaCover.length * 0.36 + (defDoc === 'fortress_aa' ? 0.20 : 0))
      : 0;
    const mult = 1 - intercept;

    let totalLost = 0;
    for (const t of targets) {
      const dmg = Math.round(t.maxHp * def.hpDmgPct * mult);
      t.hp = Math.max(0, t.hp - dmg);
      t.org = Math.max(10, t.org - Math.round(def.orgDmg * mult));
      t.fort = Math.max(0, Number((t.fort - def.fortDmg * mult).toFixed(2)));
      if (def.jamDays) t.jammedDays = Math.max(t.jammedDays, def.jamDays);
      totalLost += dmg;
    }
    state.divisions = state.divisions.filter(d => d.side === 'N' || d.hp > 1);

    // Damage enemy infrastructure (airfields, helipads, ports) and bridges/railways in strike radius!
    if (def.infraDmg && mult > 0.15) {
      const dmgVal = Math.round(def.infraDmg * mult);
      for (const m of G.SECTORS) {
        if (state.cities[m.id].owner !== enemy) continue;
        if (dist(s.tx, s.ty, m.x, m.y) > def.radius) continue;
        const inf = state.cities[m.id].infra;
        if (!inf) continue;
        if (inf.airfieldHp != null && inf.airfieldHp > 0) {
          inf.airfieldHp = Math.max(0, inf.airfieldHp - dmgVal);
          if (inf.airfieldHp <= 35) {
            addPopup(m.x, m.y - 22, 'ВПП ВЫВЕДЕНА ИЗ СТРОЯ!', '#ef4444');
            pushFeed(s.side, 'Удар вывел из строя аэродром: ' + (m.airfieldName || m.name));
          }
        }
        if (inf.helipadHp != null && inf.helipadHp > 0) {
          inf.helipadHp = Math.max(0, inf.helipadHp - dmgVal);
        }
        if (inf.portHp != null && inf.portHp > 0 && (def.isNavalRaid || def.canDestroyBridge)) {
          inf.portHp = Math.max(0, inf.portHp - dmgVal);
          if (inf.portHp <= 35) pushFeed(s.side, 'Порт ' + m.name + ' повреждён и блокирован!');
        }
      }
      if (def.canDestroyBridge) {
        const ck = nearestCorridorKey(s.tx, s.ty, def.radius * 0.85);
        if (ck && state.corridors[ck]) {
          const cMeta = CORRIDORS[ck];
          const cs = state.corridors[ck];
          if (!cs.blocked && (def.isSabotage || Math.random() < 0.65)) {
            cs.blocked = { side: s.side, reason: cMeta.bridge ? ('Взорван: ' + cMeta.bridge.name) : 'Разрушено полотно / завал', hp: 100, maxHp: 100 };
            if (cMeta.hasRail) cs.railDamaged = true;
            addPopup(cMeta.mid.x, cMeta.mid.y - 16, cMeta.bridge ? 'МОСТ ВЗОРВАН!' : 'ПУТЬ ПЕРЕКРЫТ!', '#ef4444');
            pushFeed(s.side, (cMeta.bridge ? ('Взорван ' + cMeta.bridge.name) : ('Перекрыт путь ' + cMeta.label)) + '!');
            recomputeSupply();
            refreshTkuarchalSiege(false);
          } else if (cMeta.hasRail && !cs.railDamaged) {
            cs.railDamaged = true;
            addPopup(cMeta.mid.x, cMeta.mid.y - 14, 'ЖД-ПУТЬ ПОВРЕЖДЁН!', '#f59e0b');
            pushFeed(s.side, 'Повреждена ЖД-ветка: ' + cMeta.label);
          }
        }
      }
      recomputeSupply();
    }

    if (s.side === 'B' && state.tkuarchalSiege && state.tkuarchalSiege.active) {
      const tk = G.SECTOR_MAP.tkuarchal;
      if (dist(s.tx, s.ty, tk.x, tk.y) <= 95 && def.fortDmg > 0) {
        const fLoss = Math.round((def.fortDmg * 65) * mult);
        const sLoss = Math.round((def.hpDmgPct * 42) * mult);
        state.tkuarchalSiege.fortIntegrity = clamp(state.tkuarchalSiege.fortIntegrity - fLoss, 0, 100);
        state.tkuarchalSiege.supplies = clamp(state.tkuarchalSiege.supplies - sLoss, 0, 100);
      }
    }
    addPopup(
      s.tx, s.ty,
      intercept > 0.45 ? ('ПВО СБИЛО ' + Math.round(intercept * 100) + '%') : (totalLost > 0 ? ('−' + totalLost + ' (' + def.short + ')') : def.short),
      def.color || '#f59e0b'
    );
  }

  function onNewDay() {
    recomputeSupply();
    for (const d of state.divisions) {
      if (d.jammedDays > 0) d.jammedDays -= 1;
      // Encircled / unsupplied divisions suffer daily attrition!
      if ((d.side === 'A' || d.side === 'B') && d.supplied === false && !isTrappedInTkuarchal(d)) {
        d.org = Math.max(12, d.org - 5);
        d.hp = Math.max(15, d.hp - Math.round(d.maxHp * 0.03));
      }
    }

    // Passive daily infrastructure repair (+8% per day if supplied)
    for (const m of G.SECTORS) {
      const c = state.cities[m.id];
      if (!c.infra || !c.supplied) continue;
      if (c.infra.airfieldHp != null && c.infra.airfieldHp < 100) c.infra.airfieldHp = Math.min(100, c.infra.airfieldHp + 8);
      if (c.infra.helipadHp != null && c.infra.helipadHp < 100) c.infra.helipadHp = Math.min(100, c.infra.helipadHp + 10);
      if (c.infra.portHp != null && c.infra.portHp < 100) c.infra.portHp = Math.min(100, c.infra.portHp + 8);
    }

    // Properly run Tkuarchal siege daily drain ONCE per game day (not 60fps!)
    if (state.tkuarchalSiege && state.tkuarchalSiege.active) {
      const sg = state.tkuarchalSiege;
      sg.daysBesieged += 1;
      if (sg.raidCooldown > 0) sg.raidCooldown -= 1;
      if (sg.airBridgeCooldown > 0) sg.airBridgeCooldown -= 1;
      if (sg.ringCooldown > 0) sg.ringCooldown -= 1;
      if (sg.stormCooldown > 0) sg.stormCooldown -= 1;

      const tkAdj = G.SECTOR_MAP.tkuarchal.adj;
      const bCount = tkAdj.filter(id => state.cities[id].owner === 'B').length;
      const drain = bCount >= 4 ? 7 : 4;
      sg.supplies = clamp(sg.supplies - drain, 0, 100);

      if (state.phase === 'war' && state.ceasefireDaysLeft === 0 && sg.supplies >= 15 && sg.daysBesieged % 2 === 0 && Math.random() < 0.72) {
        executeTkuarchalRaid(false);
      }
    }

    if (state.phase === 'crisis') {
      state.crisisDaysLeft -= 1;
      if (state.crisisDaysLeft <= 0) {
        state.phase = 'war';
        state.status = 'active';
        for (const m of G.SECTORS) {
          if (state.cities[m.id].owner === 'neutral') {
            const win = state.cities[m.id].loyaltyA >= 50 ? 'A' : 'B';
            state.cities[m.id].owner = win;
            state.cities[m.id].controlA = win === 'A' ? 100 : 0;
          }
        }
        setAlert('РАСКОЛ ВЛАСТИ! Началась полномасштабная война!');
      }
    }
    if (state.ceasefireDaysLeft > 0) state.ceasefireDaysLeft -= 1;
    if (state.noStrikesDaysLeft > 0) state.noStrikesDaysLeft -= 1;
    if (state.un) {
      state.un.mandate = Math.min(300, state.un.mandate + 14);
      if (state.un.embargoDaysLeft > 0) state.un.embargoDaysLeft -= 1;
    }

    if (state.demarcationDaysLeft > 0) {
      state.demarcationDaysLeft -= 1;
      if (state.demarcationDaysLeft > 0 && Math.random() < 0.28) {
        const pkUnits = state.divisions.filter(d => d.side === 'N');
        const forceTag = state.demarcationForce === 'RU' ? 'МС РФ' : 'МС ООН';
        if (Math.random() < 0.55) {
          const lost = 14 + Math.floor(Math.random() * 28);
          if (pkUnits.length) addPopup(pkUnits[0].x, pkUnits[0].y - 16, 'СРЫВ ДЕМАРКАЦИИ! −' + lost + ' МС', '#ef4444');
          state.demarcationDaysLeft = 0;
          state.ceasefireDaysLeft = 0;
          state.demarcationForce = null;
          state.divisions = state.divisions.filter(d => d.side !== 'N');
          if (state.un) state.un.credibility = clamp(state.un.credibility - 14, 10, 100);
          const m = 'ПРОВОКАЦИЯ НА ЛИНИИ: обстрел блокпоста ' + forceTag + ' (−' + lost + ' МС) — демаркация сорвана!';
          setAlert(m); pushFeed('UN', m);
        } else {
          const culprit = Math.random() < 0.5 ? 'Запада' : 'Востока';
          const m = 'ИНЦИДЕНТ В БУФЕРНОЙ ЗОНЕ: разведгруппа ' + culprit + ' пересекла линию ' + forceTag + '.';
          setAlert(m); pushFeed('UN', m);
          if (state.un) state.un.credibility = clamp(state.un.credibility - 6, 10, 100);
        }
      } else if (state.demarcationDaysLeft === 0) {
        state.demarcationForce = null;
        state.divisions = state.divisions.filter(d => d.side !== 'N');
        const m = 'Срок миротворческой демаркации истёк — миротворцы выведены.';
        setAlert(m); pushFeed('UN', m);
      }
    }

    const vpNow = computeControlStats(state);
    for (const side of ['A', 'B']) {
      const fac = state.factions[side];
      const owned = G.SECTORS.filter(m => state.cities[m.id].owner === side);
      let fMp = 0, fWp = 0, fPP = 0;
      for (const m of owned) {
        const fObj = G.SECTOR_FACILITIES && G.SECTOR_FACILITIES[m.id];
        if (fObj) { fMp += fObj.dailyMp; fWp += fObj.dailyWp; fPP += fObj.dailyPP; }
      }
      fac.manpower += owned.reduce((s, m) => s + Math.round(m.manpower * 0.28), 0) + fMp;
      const rawWp = owned.reduce((s, m) => s + m.industry * 4, 0) + fWp;
      fac.weapons += state.un && state.un.embargoDaysLeft > 0 ? Math.round(rawWp * 0.45) : rawWp;
      fac.pp = Math.min(500, fac.pp + 10 + fPP);

      fac.postureDaysLeft = (fac.postureDaysLeft || 1) - 1;
      const sideDivs = state.divisions.filter(d => d.side === side);
      const avgOrg = sideDivs.length ? sideDivs.reduce((s, d) => s + d.org, 0) / sideDivs.length : 80;
      const vpShare = (side === 'A' ? vpNow.vpA : vpNow.vpB) / Math.max(1, vpNow.total);

      if (fac.postureDaysLeft <= 0) {
        if (fac.posture === 'offensive') {
          fac.posture = vpShare < 0.40 ? 'defense' : 'consolidate';
          fac.postureDaysLeft = 2 + Math.floor(Math.random() * 3);
        } else if (fac.posture === 'consolidate') {
          if (avgOrg >= 72 && fac.weapons >= 380) {
            fac.posture = 'offensive';
            fac.postureDaysLeft = 2;
            fac.aiStyle = pickPersonality();
          } else {
            fac.postureDaysLeft = 2;
          }
        } else {
          fac.posture = (avgOrg >= 76 && fac.weapons >= 420) ? 'offensive' : 'consolidate';
          fac.postureDaysLeft = 2;
        }
      }

      if (isAiSide(side) && state.day % 3 === 0 && role !== 'observer' && G.pickRandomEvent) {
        const aiEv = G.pickRandomEvent(usedEventIds, true);
        if (aiEv && aiEv.visibility === 'secret') {
          usedEventIds.add(aiEv.id);
          applyEventEffect(side, chooseAiEventOption(side, aiEv).eff);
        }
      }

      for (const k of Object.keys(fac.cooldowns || {})) if (fac.cooldowns[k] > 0) fac.cooldowns[k] -= 1;
    }

    if (state.interventionCooldown > 0) state.interventionCooldown -= 1;
    if (state.phase === 'war' && state.day >= 4 && state.interventionCooldown === 0 && state.demarcationDaysLeft === 0) {
      const pctA = vpNow.vpA / Math.max(1, vpNow.total);
      const pctB = vpNow.vpB / Math.max(1, vpNow.total);
      const pressured = pctA < 0.45 ? 'A' : (pctB < 0.45 ? 'B' : null);
      const chance = (pctA < 0.36 || pctB < 0.36) ? 0.52 : 0.24;

      if (Math.random() < chance) {
        state.interventionCooldown = 6;
        const roll = Math.random();
        if (roll < 0.34) {
          const force = Math.random() < 0.5 ? 'UN' : 'RU';
          const days = 3 + Math.floor(Math.random() * 3);
          state.ceasefireDaysLeft = Math.max(state.ceasefireDaysLeft, days);
          state.demarcationDaysLeft = Math.max(state.demarcationDaysLeft, days);
          state.demarcationForce = force;
          spawnPeacekeepersOnFront(force);
          const m = (force === 'RU' ? 'МС РФ' : 'МС ООН') + ': миротворцы заняли линию разграничения на ' + days + ' дн.!';
          setAlert(m); pushFeed(force, m);
        } else if (roll < 0.66 && (pressured === 'A' || (!pressured && Math.random() < 0.5))) {
          const entry = state.cities.psou.owner === 'A' ? G.SECTOR_MAP.psou : (G.SECTORS.find(m => state.cities[m.id].owner === 'A' && m.supplyHub) || G.SECTOR_MAP.psou);
          const ruCount = state.divisions.filter(d => d.flag === 'RU').length;
          if (ruCount < 4) {
            const type = ruCount % 2 === 0 ? 'armor' : 'infantry';
            state.divisions.push(makeDivision('A', type, (ruCount + 7) + '-я Российская сводная (' + G.UNIT_TEMPLATES[type].short + ')', entry.x + 12, entry.y + 8, { flag: 'RU', org: 100, fort: 0.15 }));
          }
          state.factions.A.weapons += 380; state.factions.A.missiles += 1;
          const m = 'КОНТИНГЕНТ РФ: колонна и БК (+380 ОРУЖ) вошла через ' + entry.name + '!';
          setAlert(m); pushFeed('RU', m);
          addPopup(entry.x, entry.y - 16, 'КОНТИНГЕНТ РФ!', '#60a5fa');
        } else {
          const entry = state.cities.ingur.owner === 'B' ? G.SECTOR_MAP.ingur : (G.SECTORS.find(m => state.cities[m.id].owner === 'B' && m.supplyHub) || G.SECTOR_MAP.ingur);
          const tgCount = state.divisions.filter(d => d.flag === 'TR' || d.flag === 'GE').length;
          if (tgCount < 4) {
            const isTr = tgCount % 2 === 0;
            const type = isTr ? 'sof' : 'armor';
            state.divisions.push(makeDivision('B', type, (isTr ? 'Турецкий отряд БПЛА/СПН' : 'Грузинский добровольческий корпус') + ' (' + G.UNIT_TEMPLATES[type].short + ')', entry.x - 12, entry.y - 8, { flag: isTr ? 'TR' : 'GE', org: 100, fort: 0.15 }));
          }
          state.factions.B.weapons += 380; state.factions.B.missiles += 1;
          const m = 'ЮЖНЫЙ КОНТИНГЕНТ: турецко-грузинские части и БК (+380 ОРУЖ) вошли через ' + entry.name + '!';
          setAlert(m); pushFeed('TR', m);
          addPopup(entry.x, entry.y - 16, 'ЮЖНЫЙ КОНТИНГЕНТ!', '#f87171');
        }
      }
    }

    if (state.phase === 'war') {
      if (vpNow.vpA / vpNow.total >= 0.85 || vpNow.secB === 0) {
        state.status = 'finished'; state.winner = 'A'; speed = 0;
        setAlert('КАПИТУЛЯЦИЯ ВОСТОКА! Победа Западного блока (' + vpNow.vpA + '/' + vpNow.total + ' ОП)!');
      } else if (vpNow.vpB / vpNow.total >= 0.85 || vpNow.secA === 0) {
        state.status = 'finished'; state.winner = 'B'; speed = 0;
        setAlert('КАПИТУЛЯЦИЯ ЗАПАДА! Победа Восточного блока (' + vpNow.vpB + '/' + vpNow.total + ' ОП)!');
      }
    }
  }

  // ==================== MULTI-ECHELON GENERAL STAFF AI ====================
  function maybeSendAiDiplomaticOffer(side) {
    if (!state || state.pendingEvent || state.ceasefireDaysLeft > 0 || state.day < 4) return;
    if (role === 'observer' || role === 'pvp' || side === role) return;
    const fac = state.factions[side];
    if ((fac.cooldowns.ai_diplo || 0) > 0) return;

    const vp = computeControlStats(state);
    const myVpPct = (side === 'A' ? vp.vpA : vp.vpB) / Math.max(1, vp.total);
    const myDivs = state.divisions.filter(d => d.side === side);
    const avgOrg = myDivs.length ? myDivs.reduce((s, d) => s + d.org, 0) / myDivs.length : 0;
    const losing = myVpPct < 0.37 || myDivs.length <= 5;
    const exhausted = state.day >= 7 && avgOrg < 58 && Math.random() < 0.25;
    if (!losing && !exhausted) return;

    fac.cooldowns.ai_diplo = 5;
    openPendingEvent({
      id: 'ai_diplo_' + state.day + '_' + side,
      cat: 'diplomacy',
      visibility: 'both',
      title: losing ? (fac.name + ' запрашивает срочное перемирие') : (fac.name + ' предлагает заморозку фронта'),
      text: losing
        ? ('Командование «' + fac.name + '» несёт тяжёлые потери и предлагает остановить огонь на 3 дня для эвакуации и переговоров.')
        : ('Обе группировки истощены затяжными боями. Штаб «' + fac.name + '» предлагает временную передышку на 3 дня.'),
      choices: [
        { label: 'Принять перемирие на 3 дня (+15 ПО, +12% орг. всем)', eff: { ceasefireDays: 3, pp: 15, orgAll: 12 } },
        { label: 'Согласиться за контрибуцию (+220 ОРУЖ, +20 ПО, перемирие 3 дн.)', eff: { ceasefireDays: 3, weapons: 220, pp: 20 } },
        { label: 'Отклонить и дожимать фронт (+8% боевой дух, +10 ПО)', eff: { morale: 8, pp: 10 } }
      ]
    }, role);
    setAlert('Дипломатическая нота от ' + fac.name, role);
    emit();
  }

  function runSmartAI(side) {
    if (!state || state.status === 'finished') return;
    const fac = state.factions[side];
    if (!fac) return;
    const style = fac.aiStyle || 'opportunist';
    const enemySide = enemyOf(side);
    const siegeActive = !!(state.tkuarchalSiege && state.tkuarchalSiege.active);

    // Crisis phase: contest highest-VP neutral sectors smartly
    if (state.phase === 'crisis') {
      const contested = G.SECTORS
        .filter(m => state.cities[m.id].owner === 'neutral')
        .sort((a, b) => b.vp - a.vp);
      if (contested.length && fac.pp >= 15) {
        const pick = contested[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * contested.length)];
        crisisInfluence(side, pick.id);
      }
      return;
    }

    const allMyDivs = state.divisions.filter(d => d.side === side);
    const myDivs = allMyDivs.filter(d => !isTrappedInTkuarchal(d));
    const enemyDivs = state.divisions.filter(d => d.side === enemySide);
    const enemyAA = enemyDivs.filter(d => d.type === 'aa');

    // Exclude besieged Tkuarchal from main-front hubs & frontline centroid so West AI never gets skewed!
    const myCities = G.SECTORS.filter(m => state.cities[m.id].owner === side && !(siegeActive && m.id === 'tkuarchal'));
    const myHubsRaw = myCities.filter(m => m.supplyHub);
    const frontEnemyAll = getFrontlineEnemySectors(side);
    const frontFriendlyAll = getFrontlineFriendlySectors(side).filter(m => !(siegeActive && m.id === 'tkuarchal'));

    // Compute true spatial Frontline Centroid (100% symmetric for Blue A and Red B!)
    const frontPts = frontFriendlyAll.length ? frontFriendlyAll : (myHubsRaw.length ? myHubsRaw : myCities);
    const frontX = frontPts.length ? frontPts.reduce((s, m) => s + m.x, 0) / frontPts.length : 1420;
    const frontY = frontPts.length ? frontPts.reduce((s, m) => s + m.y, 0) / frontPts.length : 1070;

    // Sort friendly hubs by proximity to the active frontline (Gudauta/New Afon for Blue, Sukhum/Dranda for Red!)
    const forwardHubs = (myHubsRaw.length ? myHubsRaw : myCities)
      .slice()
      .sort((a, b) => dist(a.x, a.y, frontX, frontY) - dist(b.x, b.y, frontX, frontY));
    const mainHub = forwardHubs[0] || G.SECTORS[0];
    const secondHub = forwardHubs[1] || mainHub;

    // 1. Doctrine, National Decisions & Smart Sponsor Diplomacy
    const desiredDoc = style === 'blitz_coast' ? 'mobile_armor'
      : style === 'mountain_flank' ? 'mountain_warfare'
      : 'fortress_aa';
    if (fac.doctrine !== desiredDoc && fac.pp >= 35 && Math.random() < 0.38) {
      setDoctrine(side, desiredDoc);
    }

    if (fac.pp >= 25 && fac.weapons < 520 && !(fac.cooldowns.dec_ammo > 0)) {
      runDecision(side, 'dec_ammo');
    } else if (fac.pp >= 25 && fac.manpower < 700 && !(fac.cooldowns.dec_mob > 0)) {
      runDecision(side, 'dec_mob');
    } else if (fac.pp >= 20 && !(fac.cooldowns.dec_rally > 0) && (fac.morale < 78 || (myDivs.length && myDivs.reduce((s, d) => s + d.org, 0) / myDivs.length < 68))) {
      runDecision(side, 'dec_rally');
    } else if (fac.pp >= 30 && !(fac.cooldowns.dec_forts > 0) && Math.random() < 0.28) {
      runDecision(side, 'dec_forts');
    } else if (fac.pp >= 45 && fac.missiles === 0 && !(fac.cooldowns.dec_otrk > 0) && Math.random() < 0.25) {
      runDecision(side, 'dec_otrk');
    }

    // Smart Sponsor Selection: prioritize sponsors where we own the +20% bonusSector & highest relation
    if (fac.pp >= 22 && Math.random() < 0.35) {
      const rankedSponsors = G.SPONSORS.map(sp => {
        const rel = fac.relations[sp.id] || 0;
        const ownsBonus = sp.bonusSector && state.cities[sp.bonusSector]?.owner === side ? 25 : 0;
        return { sp, rel, score: rel + ownsBonus };
      }).sort((a, b) => b.score - a.score);

      const bestSp = rankedSponsors[0];
      if (bestSp) {
        const avail = bestSp.sp.packages.filter(p => bestSp.rel >= p.minRel && fac.pp >= p.costPP);
        if (avail.length) {
          requestAid(side, bestSp.sp.id, avail[avail.length - 1].id);
        } else if (bestSp.rel < 70 && fac.pp >= 12) {
          improveSponsor(side, bestSp.sp.id);
        }
      }
    }

    maybeSendAiDiplomaticOffer(side);

    // 1b. Tkuarchal Blockade AI Tactics
    if (siegeActive) {
      const sg = state.tkuarchalSiege;
      if (side === 'A') {
        if (sg.supplies < 58 && sg.airBridgeCooldown === 0 && fac.weapons >= 140 && fac.pp >= 14) {
          runTkuarchalSiegeAction('A', 'air_bridge');
        } else if (sg.raidCooldown === 0 && fac.pp >= 12 && Math.random() < 0.55) {
          runTkuarchalSiegeAction('A', 'drg_raid');
        }
      } else if (side === 'B' && state.ceasefireDaysLeft === 0) {
        if (sg.fortIntegrity > 35 && sg.ringCooldown === 0 && fac.weapons >= 130 && fac.pp >= 14 && Math.random() < 0.45) {
          runTkuarchalSiegeAction('B', 'tighten_ring');
        } else if ((sg.fortIntegrity <= 45 || sg.supplies <= 30) && sg.stormCooldown === 0 && fac.weapons >= 160 && fac.pp >= 16 && Math.random() < 0.55) {
          runTkuarchalSiegeAction('B', 'storm_tunnels');
        }
      }
    }

    // 2. Reinforce battered units in rear & Counter-Recruit Combined Arms at FORWARD hubs
    for (const d of myDivs) {
      if (!d.inCombat && (d.hp < d.maxHp * 0.74 || d.org < 66)) reinforceDivision(d.id);
    }

    if (allMyDivs.length < 22 && fac.manpower >= 380 && fac.weapons >= 260 && forwardHubs.length) {
      const spawnHub = forwardHubs[Math.random() < 0.7 ? 0 : Math.min(1, forwardHubs.length - 1)];
      const cnt = t => myDivs.filter(d => d.type === t).length;
      const enemyArmor = enemyDivs.filter(d => d.type === 'armor').length;
      let pickType;
      if (cnt('artillery') < 2) pickType = 'artillery';
      else if (cnt('aa') < 2) pickType = 'aa';
      else if (cnt('mountain') < 2) pickType = 'mountain';
      else if (cnt('engineering') < 1) pickType = 'engineering';
      else if (enemyArmor >= 3 && cnt('artillery') < 3) pickType = 'artillery';
      else if (cnt('armor') < 3 && fac.weapons >= 440) pickType = 'armor';
      else {
        const pref = style === 'mountain_flank' ? ['mountain', 'sof', 'infantry']
          : style === 'blitz_coast' ? ['armor', 'marines', 'infantry']
          : style === 'artillery_attrition' ? ['artillery', 'engineering', 'infantry']
          : style === 'deep_raid' ? ['sof', 'marines', 'armor']
          : ['infantry', 'armor', 'mountain', 'marines'];
        pickType = pref[Math.floor(Math.random() * pref.length)];
      }
      recruitDivision(side, pickType, spawnHub.id);
    }

    if (state.ceasefireDaysLeft > 0) return;

    // 3. Tactical Combined-Arms Operations (AA-aware targeting + Medevac + Naval Raid + Barrage!)
    // 3a. Medevac for battered friendly combat cluster
    const batteredFriends = myDivs.filter(d => d.hp < d.maxHp * 0.62 || d.org < 52);
    if (batteredFriends.length >= 2 && fac.weapons >= 110 && fac.pp >= 14 && Math.random() < 0.35) {
      const medTgt = batteredFriends[0];
      launchStrike(side, 'medevac', medTgt.x, medTgt.y);
    }

    // 3b. Offensive strikes with AA-avoidance awareness
    if (enemyDivs.length && fac.weapons >= 100 && fac.pp >= 14 && Math.random() < 0.45) {
      let bestTarget = enemyDivs[0], bestScore = -1e9;
      for (const ed of enemyDivs) {
        const nearCount = enemyDivs.filter(o => dist(ed.x, ed.y, o.x, o.y) <= 95).length;
        const aaNearby = enemyAA.filter(a => dist(a.x, a.y, ed.x, ed.y) <= 175).length;
        const sc = nearCount * 12 + (ed.type === 'artillery' ? 10 : 0) + (ed.inCombat ? 7 : 0) + (ed.fort >= 0.3 ? 6 : 0) - aaNearby * 5;
        if (sc > bestScore) { bestScore = sc; bestTarget = ed; }
      }
      const aaAtTarget = enemyAA.some(a => dist(a.x, a.y, bestTarget.x, bestTarget.y) <= 175);
      const undefHub = frontEnemyAll.find(c =>
        c.supplyHub && !enemyDivs.some(ed => dist(ed.x, ed.y, c.x, c.y) < 95) &&
        !enemyAA.some(a => dist(a.x, a.y, c.x, c.y) <= 175)
      );
      const enemyPort = G.SECTORS.find(m => m.port && state.cities[m.id].owner === enemySide);

      if (bestTarget.fort >= 0.30 && fac.weapons >= 95 && Math.random() < 0.45) {
        launchStrike(side, 'artillery_barrage', bestTarget.x, bestTarget.y);
      } else if (bestTarget.inCombat && bestTarget.jammedDays === 0 && fac.weapons >= 70 && Math.random() < 0.42) {
        launchStrike(side, 'ew_jamming', bestTarget.x, bestTarget.y);
      } else if (enemyPort && state.factions[enemySide].weapons > 550 && fac.weapons >= 180 && fac.pp >= 18 && Math.random() < 0.25) {
        launchStrike(side, 'naval_raid', enemyPort.x, enemyPort.y);
      } else if (state.noStrikesDaysLeft === 0 && undefHub && fac.weapons >= 360 && fac.pp >= 24 && Math.random() < 0.30) {
        launchStrike(side, 'air_drop', undefHub.x + 10, undefHub.y - 10);
      } else if (state.noStrikesDaysLeft === 0 && !aaAtTarget && fac.missiles > 0 && bestScore >= 18 && Math.random() < 0.50) {
        launchStrike(side, 'missile_strike', bestTarget.x, bestTarget.y);
      } else if (state.noStrikesDaysLeft === 0 && !aaAtTarget && Math.random() < 0.50) {
        launchStrike(side, 'drone_swarm', bestTarget.x, bestTarget.y);
      } else {
        launchStrike(side, 'artillery_barrage', bestTarget.x, bestTarget.y);
      }
    }

    // 4. Symmetric Frontline Threat Defense & Combined-Arms Offensives
    const curDivs = state.divisions.filter(d => d.side === side);
    if (!frontEnemyAll.length) return;

    const posture = fac.posture || 'offensive';
    const assigned = new Set();

    // Keep trapped Tkuarchal garrison entrenched
    for (const d of curDivs) {
      if (isTrappedInTkuarchal(d)) {
        assigned.add(d.id);
        orderDivisionsEntrench([d.id]);
      }
    }

    // 3c. AI Corridor Engineering: repair blocked friendly supply corridors, repair airfields, fortify or blow bridges!
    if (fac.weapons >= 120 && fac.pp >= 12) {
      // Repair own damaged airfields/helipads/ports first
      const dmgCity = myCities.find(m => {
        const inf = state.cities[m.id].infra;
        return inf && ((inf.airfieldHp != null && inf.airfieldHp <= 50) || (inf.helipadHp != null && inf.helipadHp <= 40) || (inf.portHp != null && inf.portHp <= 40));
      });
      if (dmgCity) repairCityInfra(side, dmgCity.id);

      // Repair blocked corridors between two friendly sectors to restore supply & rail!
      const brokenFriendly = Object.values(CORRIDORS).find(c => {
        const cs = state.corridors[c.key];
        return cs && (cs.blocked || cs.railDamaged) && state.cities[c.a].owner === side && state.cities[c.b].owner === side;
      });
      if (brokenFriendly) repairCorridor(side, brokenFriendly.key);
    }

    if (fac.weapons >= 220 && fac.pp >= 18 && Math.random() < 0.24) {
      const frontCorridors = Object.values(CORRIDORS).filter(c => {
        const oA = state.cities[c.a].owner, oB = state.cities[c.b].owner;
        return (oA === side && oB === enemySide) || (oB === side && oA === enemySide);
      });
      if (frontCorridors.length) {
        const pickC = frontCorridors[Math.floor(Math.random() * frontCorridors.length)];
        const cs = state.corridors[pickC.key];
        if (cs && !cs.blocked && posture === 'defense' && pickC.bridge && Math.random() < 0.35) {
          demolishCorridor(side, pickC.key);
        } else if (cs && !cs.checkpoint && !cs.blocked) {
          buildCheckpoint(side, pickC.key);
        } else if (cs && !cs.mined && !cs.blocked) {
          mineCorridor(side, pickC.key);
        }
      }
    }

    // 4a. Threat-scored frontline defense: defend highest-threat / highest-VP friendly frontline sectors FIRST!
    const threatened = frontFriendlyAll.map(c => {
      const eNear = enemyDivs.filter(ed => dist(ed.x, ed.y, c.x, c.y) < 145).length;
      const fNear = curDivs.filter(fd => !isTrappedInTkuarchal(fd) && dist(fd.x, fd.y, c.x, c.y) < 110).length;
      return { city: c, eNear, threat: eNear * (1.2 + c.vp * 0.14) - fNear * 0.9 };
    }).sort((a, b) => b.threat - a.threat);

    for (const item of threatened.slice(0, 4)) {
      if (item.eNear === 0 && item.city.vp < 5) continue;
      const need = Math.min(2, Math.max(1, item.eNear));
      for (let k = 0; k < need; k++) {
        const guard = curDivs
          .filter(d => !assigned.has(d.id) && !d.inCombat && d.type !== 'artillery' && d.type !== 'aa')
          .sort((a, b) => {
            const bonusA = (a.type === 'engineering' || a.type === 'infantry' || (item.city.terrain.includes('mountain') && a.type === 'mountain')) ? -45 : 0;
            const bonusB = (b.type === 'engineering' || b.type === 'infantry' || (item.city.terrain.includes('mountain') && b.type === 'mountain')) ? -45 : 0;
            return (dist(a.x, a.y, item.city.x, item.city.y) + bonusA) - (dist(b.x, b.y, item.city.x, item.city.y) + bonusB);
          })[0];
        if (guard) {
          assigned.add(guard.id);
          if (dist(guard.x, guard.y, item.city.x, item.city.y) > 26) orderDivisionsMarch([guard.id], item.city.x, item.city.y, 'standard');
          else orderDivisionsEntrench([guard.id]);
        }
      }
    }

    // 4b. Forward tactical reserve (ONLY 15% of army, anchored at FORWARD hubs, never remote border corners!)
    const reserveTarget = Math.max(1, Math.floor(myDivs.length * 0.15));
    let reserveCount = 0;
    for (const h of forwardHubs.slice(0, 2)) {
      if (reserveCount >= reserveTarget) break;
      const g = curDivs
        .filter(d => !assigned.has(d.id) && !d.inCombat && (d.type === 'infantry' || d.type === 'engineering'))
        .sort((a, b) => dist(a.x, a.y, h.x, h.y) - dist(b.x, b.y, h.x, h.y))[0];
      if (g) {
        assigned.add(g.id);
        reserveCount++;
        if (dist(g.x, g.y, h.x, h.y) > 28) orderDivisionsMarch([g.id], h.x, h.y, 'standard');
        else orderDivisionsEntrench([g.id]);
      }
    }

    // 4c. Smart Support Positioning: Artillery within 155px of main frontline, AA covering forward hubs!
    const hotFront = (threatened[0] && threatened[0].city) || frontFriendlyAll[0] || mainHub;
    const artAnchor = hotFront.adj
      .map(id => G.SECTOR_MAP[id])
      .filter(m => m && state.cities[m.id].owner === side && m.terrain !== 'high_mountain' && dist(m.x, m.y, hotFront.x, hotFront.y) <= 145)
      .sort((a, b) => dist(a.x, a.y, hotFront.x, hotFront.y) - dist(b.x, b.y, hotFront.x, hotFront.y))[0] || hotFront;

    let aaIdx = 0;
    for (const d of curDivs) {
      if (assigned.has(d.id)) continue;
      if (d.hp < d.maxHp * 0.42 || d.org < 32) {
        if (!d.order || d.order.type !== 'retreat') orderDivisionsRetreat([d.id]);
        assigned.add(d.id);
        continue;
      }
      if (d.inCombat) { assigned.add(d.id); continue; }

      if (d.type === 'artillery') {
        assigned.add(d.id);
        if (dist(d.x, d.y, artAnchor.x, artAnchor.y) > 36) orderDivisionsMarch([d.id], artAnchor.x, artAnchor.y, 'standard');
        else orderDivisionsEntrench([d.id]);
      } else if (d.type === 'aa') {
        assigned.add(d.id);
        const aaAnchor = (aaIdx++ % 2 === 0) ? mainHub : secondHub;
        if (dist(d.x, d.y, aaAnchor.x, aaAnchor.y) > 36) orderDivisionsMarch([d.id], aaAnchor.x, aaAnchor.y, 'standard');
        else orderDivisionsEntrench([d.id]);
      }
    }

    // 4d. Pick 2 focal offensive targets (prioritize weak defenses, high VP, and Tkuarchal breakout/capture!)
    const focalTargets = [...frontEnemyAll].sort((a, b) => {
      const eA = enemyDivs.filter(ed => dist(ed.x, ed.y, a.x, a.y) < 70).length;
      const eB = enemyDivs.filter(ed => dist(ed.x, ed.y, b.x, b.y) < 70).length;
      let sA = a.vp * 11 - eA * 15;
      let sB = b.vp * 11 - eB * 15;
      if (style === 'mountain_flank') {
        if (a.terrain.includes('mountain')) sA += 22;
        if (b.terrain.includes('mountain')) sB += 22;
      }
      // East B avoids suiciding into intact Tkuarchal tunnels until softened; pushes hard once softened!
      if (side === 'B' && siegeActive) {
        const sg = state.tkuarchalSiege;
        const tkMod = (sg.fortIntegrity > 45 && sg.supplies > 30) ? -45 : 35;
        if (a.id === 'tkuarchal') sA += tkMod;
        if (b.id === 'tkuarchal') sB += tkMod;
      }
      return sB - sA;
    }).slice(0, 2);

    const targetLoad = Object.fromEntries(frontEnemyAll.map(c => [c.id, 0]));
    const isNightNow = state.hour >= 21 || state.hour < 6;

    for (const d of curDivs) {
      if (assigned.has(d.id)) continue;

      if (isNightNow || posture === 'consolidate' || posture === 'defense') {
        const anchors = frontFriendlyAll.length ? frontFriendlyAll : [mainHub];
        const anchor = [...anchors].sort((a, b) => dist(d.x, d.y, a.x, a.y) - dist(d.x, d.y, b.x, b.y))[0];
        if (dist(d.x, d.y, anchor.x, anchor.y) > 32) orderDivisionsMarch([d.id], anchor.x, anchor.y, 'standard');
        else orderDivisionsEntrench([d.id]);
        continue;
      }

      if (d.order && d.order.type === 'march' && Math.random() < 0.80) {
        const nearTgt = nearestSectorMeta(d.order.tx, d.order.ty);
        if (targetLoad[nearTgt.id] !== undefined) targetLoad[nearTgt.id]++;
        continue;
      }

      const fromSec = nearestSectorMeta(d.x, d.y);
      // Marines can also evaluate amphibious landings on lightly defended enemy ports!
      const candidates = d.type === 'marines'
        ? G.SECTORS.filter(c => state.cities[c.id].owner !== side && (frontEnemyAll.includes(c) || c.port))
        : frontEnemyAll;

      const reachable = candidates.filter(c => computeSectorPath(fromSec.id, c.id, d.type, side, d.type === 'engineering') !== null);
      if (!reachable.length) { orderDivisionsEntrench([d.id]); continue; }

      const scored = reachable.map(c => {
        const isFocal = focalTargets.some(f => f.id === c.id);
        const eHere = enemyDivs.filter(ed => dist(ed.x, ed.y, c.x, c.y) < 70).length;
        let sc = (isFocal ? 85 : 22) + c.vp * 8 - eHere * 10 - dist(d.x, d.y, c.x, c.y) * 0.30 - (targetLoad[c.id] || 0) * 52;
        if ((d.type === 'mountain' || d.type === 'sof') && (c.terrain.includes('mountain') || c.terrain === 'pass' || c.terrain === 'fortress')) sc += 48;
        if (d.type === 'armor' && (c.terrain === 'coast' || c.terrain === 'valley' || c.terrain === 'urban')) sc += 44;
        if (d.type === 'armor' && c.terrain.includes('mountain')) sc -= 45;
        if (d.type === 'marines' && c.port && eHere <= 1) sc += 50;
        if (side === 'B' && siegeActive && c.id === 'tkuarchal') {
          if (d.type === 'mountain' || d.type === 'engineering') sc += 32;
          else if (state.tkuarchalSiege.fortIntegrity > 40) sc -= 55;
        }
        return { city: c, sc: sc + (Math.random() - 0.5) * 18 };
      }).sort((a, b) => b.sc - a.sc);

      const chosenObj = scored.find(x => (targetLoad[x.city.id] || 0) < 3) || null;
      if (!chosenObj) { orderDivisionsEntrench([d.id]); continue; }
      const chosen = chosenObj.city;
      targetLoad[chosen.id] = (targetLoad[chosen.id] || 0) + 1;
      const mode = ((d.type === 'armor' || d.type === 'marines') && fac.weapons >= 260 && fac.pp >= 20 && Math.random() < 0.35) ? 'massive' : 'standard';
      orderDivisionsMarch([d.id], chosen.x, chosen.y, mode);
    }
  }

  // ==================== PLAYER COMMAND API ====================
  function setRole(nextRole) {
    role = nextRole;
    if (state) {
      if (isAiSide('A')) runSmartAI('A');
      if (isAiSide('B')) runSmartAI('B');
    }
    emit();
  }

  function orderDivisionsMarch(divIds, tx, ty, opMode = 'standard', skipOpCost = false) {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    if (state.phase === 'crisis') return { ok: false, msg: 'Идёт фаза кризиса: войска ждут раскола.' };
    const near = nearestSectorMeta(tx, ty);
    let count = 0;

    for (let i = 0; i < divIds.length; i++) {
      const d = state.divisions.find(x => x.id === divIds[i]);
      if (!d || (d.side !== 'A' && d.side !== 'B')) continue;
      if (isTrappedInTkuarchal(d) && near.id !== 'tkuarchal') {
        if (divIds.length === 1) {
          return { ok: false, msg: 'Ткуарчал в блокаде: гарнизон заперт в горах и не может идти в наступление (используйте вылазки ДРГ)' };
        }
        continue;
      }
      if (state.ceasefireDaysLeft > 0 && state.cities[near.id].owner !== d.side) {
        return { ok: false, msg: 'Заморозка фронта (' + state.ceasefireDaysLeft + ' дн.)' };
      }
      const fac = state.factions[d.side];
      let applied = opMode;
      if (opMode === 'massive' && !skipOpCost) {
        if (fac.weapons < 100 || fac.pp < 8) applied = 'standard';
        else { fac.weapons -= 100; fac.pp -= 8; }
      }

      const fromSec = nearestSectorMeta(d.x, d.y);
      const sectorPath = computeSectorPath(fromSec.id, near.id, d.type, d.side, d.type === 'engineering');
      if (!sectorPath) {
        if (divIds.length === 1) {
          return { ok: false, msg: G.UNIT_TEMPLATES[d.type].name + ' не может пройти к ' + near.name + ' (высокогорье или взорван мост — отправьте сапёров ИНЖ)' };
        }
        continue;
      }

      // STRICT ON-ROAD / ON-TRAIL WAYPOINTS: divisions follow exact curved corridors, never cutting off-road!
      const waypoints = [];
      if (sectorPath.length === 1) {
        // Stay cleanly docked at the sector node (tiny spread only for multi-division visibility)
        const ang = divIds.length > 1 ? (i / divIds.length) * Math.PI * 2 : 0;
        const spread = divIds.length > 1 ? 10 : 0;
        waypoints.push({ x: Number((near.x + Math.cos(ang) * spread).toFixed(1)), y: Number((near.y + Math.sin(ang) * spread).toFixed(1)), sectorId: near.id, edgeKey: null });
      } else {
        for (let k = 0; k < sectorPath.length - 1; k++) {
          const segWps = getCorridorWaypoints(sectorPath[k], sectorPath[k + 1], d.side);
          for (const wp of segWps) waypoints.push(wp);
        }
        if (divIds.length > 1 && waypoints.length) {
          const ang = (i / divIds.length) * Math.PI * 2;
          const last = waypoints[waypoints.length - 1];
          last.x = Number((near.x + Math.cos(ang) * 10).toFixed(1));
          last.y = Number((near.y + Math.sin(ang) * 10).toFixed(1));
        }
      }

      d.order = {
        type: 'march',
        tx: waypoints[waypoints.length - 1].x,
        ty: waypoints[waypoints.length - 1].y,
        path: waypoints,
        opMode: applied
      };
      count++;
    }
    emit();
    return { ok: count > 0, msg: count ? ('Отправлено дивизий: ' + count + ' → ' + near.name) : 'Нет доступного маршрута' };
  }

  function orderDivisionsEntrench(divIds) {
    let c = 0;
    for (const id of divIds) {
      const d = state.divisions.find(x => x.id === id);
      if (d && (d.side === 'A' || d.side === 'B')) { d.order = null; c++; }
    }
    emit();
    return { ok: c > 0, msg: 'Оборона и окапывание: ' + c + ' див.' };
  }

  function orderDivisionsRetreat(divIds) {
    let c = 0;
    for (const id of divIds) {
      const d = state.divisions.find(x => x.id === id);
      if (!d || (d.side !== 'A' && d.side !== 'B')) continue;
      const hubs = G.SECTORS.filter(m => state.cities[m.id].owner === d.side && m.supplyHub);
      const home = hubs.sort((a, b) => dist(d.x, d.y, a.x, a.y) - dist(d.x, d.y, b.x, b.y))[0];
      if (!home) continue;
      const fromSec = nearestSectorMeta(d.x, d.y);
      const sp = computeSectorPath(fromSec.id, home.id, d.type, d.side, d.type === 'engineering');
      const wps = [];
      if (sp && sp.length > 1) {
        for (let k = 0; k < sp.length - 1; k++) {
          for (const wp of getCorridorWaypoints(sp[k], sp[k + 1], d.side)) wps.push(wp);
        }
      } else {
        wps.push({ x: home.x, y: home.y, sectorId: home.id, edgeKey: null });
      }
      d.order = { type: 'retreat', tx: home.x, ty: home.y, path: wps };
      c++;
    }
    emit();
    return { ok: c > 0, msg: 'Отход к тыловой базе: ' + c + ' див.' };
  }

  function reinforceDivision(divId) {
    const d = state.divisions.find(x => x.id === divId);
    if (!d || (d.side !== 'A' && d.side !== 'B')) return { ok: false, msg: 'Дивизия не найдена' };
    if (isTrappedInTkuarchal(d)) {
      return { ok: false, msg: 'Ткуарчал в блокаде: пополнение по суше невозможно — используйте Вертолётный мост' };
    }
    if (d.supplied === false) {
      return { ok: false, msg: 'Дивизия отрезана от снабжения: восстановите путь/мост или примените Вертолётную ротацию' };
    }
    const fac = state.factions[d.side];
    const miss = d.maxHp - d.hp;
    if (miss < 25 && d.org >= 95) return { ok: false, msg: 'Дивизия укомплектована' };
    const mp = Math.max(40, Math.round(miss * 0.45));
    const wp = Math.max(25, Math.round(miss * 0.22));
    if (fac.manpower < mp || fac.weapons < wp) return { ok: false, msg: 'Нужно ' + mp + ' Л/С и ' + wp + ' ОРУЖ' };
    fac.manpower -= mp; fac.weapons -= wp;
    d.hp = d.maxHp; d.org = Math.min(100, d.org + 25);
    emit();
    return { ok: true, msg: d.name + ' пополнена до 100%' };
  }

  function recruitDivision(side, type, cityId) {
    const tpl = G.UNIT_TEMPLATES[type];
    const meta = G.SECTOR_MAP[cityId];
    const fac = state.factions[side];
    if (!tpl || !meta || !fac || state.cities[cityId].owner !== side) return { ok: false, msg: 'Выберите свой город' };
    if (cityId === 'tkuarchal' && state.tkuarchalSiege && state.tkuarchalSiege.active) {
      return { ok: false, msg: 'Ткуарчал в блокаде: развёртывание новых дивизий в окружённом городе невозможно' };
    }
    if (fac.manpower < tpl.costMp || fac.weapons < tpl.costWp) return { ok: false, msg: 'Нужно ' + tpl.costMp + ' Л/С и ' + tpl.costWp + ' ОРУЖ' };
    fac.manpower -= tpl.costMp; fac.weapons -= tpl.costWp;
    const num = state.divisions.length + 1;
    const div = makeDivision(
      side, type, num + '-я ' + meta.name + ' (' + tpl.short + ')',
      meta.x + (Math.random() - 0.5) * 22,
      meta.y + (Math.random() - 0.5) * 22,
      { org: 88, fort: 0.08 }
    );
    state.divisions.push(div);
    emit();
    return { ok: true, division: div, msg: 'Развёрнута: ' + div.name };
  }

  function launchStrike(side, strikeType, tx, ty) {
    const def = G.STRIKES[strikeType];
    const fac = state.factions[side];
    if (!def || !fac) return { ok: false, msg: 'Неизвестная операция' };
    if (!def.isFriendlyHeal && state.ceasefireDaysLeft > 0) return { ok: false, msg: 'Перемирие (' + state.ceasefireDaysLeft + ' дн.)' };
    if (state.noStrikesDaysLeft > 0 && def.aaCounterable) {
      return { ok: false, msg: 'Действует запрет авиа/ракетных ударов (' + state.noStrikesDaysLeft + ' дн.)' };
    }
    if (def.requiresAirfield && !hasOperationalAirfield(side)) {
      return { ok: false, msg: 'Нужен исправный аэродром (Бомбора или Бабушара, ВПП > 35%)' };
    }
    if (def.requiresHelipad && !hasOperationalHelipad(side)) {
      return { ok: false, msg: 'Нужна исправная вертолётная площадка или аэродром (ХП > 35%)' };
    }
    const near = nearestSectorMeta(tx, ty);
    if (def.requiresCoast && !near.port && near.terrain !== 'coast') {
      return { ok: false, msg: 'Морская диверсия возможна только у побережья и портов' };
    }
    if (fac.weapons < def.costWp || fac.pp < def.costPP || fac.missiles < def.costMissiles) {
      return { ok: false, msg: 'Недостаточно ресурсов для: ' + def.short };
    }
    fac.weapons -= def.costWp; fac.pp -= def.costPP; fac.missiles -= def.costMissiles;

    let src = null;
    if (def.requiresAirfield) src = getNearestOperationalFacility(side, 'airfield', tx, ty);
    else if (def.requiresHelipad) src = getNearestOperationalFacility(side, 'helipad', tx, ty);
    else if (def.isNavalRaid) src = getNearestOperationalFacility(side, 'port', tx, ty);
    else if (strikeType === 'artillery_barrage') {
      const art = state.divisions.filter(d => d.side === side && d.type === 'artillery').sort((a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty))[0];
      if (art) src = { x: art.x, y: art.y };
    }
    if (!src) {
      const hubs = G.SECTORS.filter(m => state.cities[m.id].owner === side && m.supplyHub);
      src = hubs.sort((a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty))[0] || G.SECTORS[0];
    }
    state.activeStrikes.push({
      id: 'str_' + Math.random().toString(36).slice(2, 8),
      side, type: strikeType, sx: src.x, sy: src.y, tx, ty, progress: 0, color: def.color
    });
    emit();
    return { ok: true, msg: def.short + ' → ' + near.name };
  }

  function runDecision(side, decId) {
    const fac = state.factions[side];
    const dec = G.DECISIONS.find(x => x.id === decId);
    if (!dec || !fac) return { ok: false, msg: 'Не найдено' };
    if ((fac.cooldowns[decId] || 0) > 0) return { ok: false, msg: 'Кулдаун: ' + fac.cooldowns[decId] + ' дн.' };
    if (fac.pp < dec.costPP) return { ok: false, msg: 'Нужно ' + dec.costPP + ' ПО' };
    fac.pp -= dec.costPP;
    fac.cooldowns[decId] = dec.cdDays;
    if (typeof dec.effect === 'function') dec.effect(fac);
    else if (dec.effect === 'fortAll') state.divisions.filter(d => d.side === side).forEach(d => { d.fort = Math.min(0.6, d.fort + 0.18); });
    else if (dec.effect === 'rallyAll') {
      fac.morale = Math.min(100, fac.morale + 12);
      state.divisions.filter(d => d.side === side).forEach(d => { d.org = Math.min(100, d.org + 18); });
    }
    setAlert(fac.name + ': ' + dec.name, side);
    emit();
    return { ok: true, msg: 'Принято: ' + dec.name };
  }

  function setDoctrine(side, docId) {
    const fac = state.factions[side];
    const doc = G.DOCTRINES[docId];
    if (!doc || !fac || fac.doctrine === docId) return { ok: false, msg: 'Уже активна' };
    if (fac.pp < doc.costPP) return { ok: false, msg: 'Нужно ' + doc.costPP + ' ПО' };
    fac.pp -= doc.costPP; fac.doctrine = docId;
    emit();
    return { ok: true, msg: 'Доктрина: ' + doc.name };
  }

  function crisisInfluence(side, cityId) {
    const fac = state.factions[side];
    const city = state.cities[cityId];
    if (!city || !fac || fac.pp < 15) return { ok: false, msg: 'Нужно 15 ПО' };
    fac.pp -= 15;
    city.loyaltyA = clamp(city.loyaltyA + (side === 'A' ? 20 : -20), 0, 100);
    emit();
    return { ok: true, msg: 'Лояльность: Запад ' + city.loyaltyA + '%' };
  }

  function improveSponsor(side, sponsorId) {
    const fac = state.factions[side];
    const sp = G.SPONSORS.find(x => x.id === sponsorId);
    if (!sp || !fac || fac.pp < 12) return { ok: false, msg: 'Нужно 12 ПО' };
    fac.pp -= 12;
    fac.relations[sponsorId] = Math.min(100, (fac.relations[sponsorId] || 0) + 15);
    emit();
    return { ok: true, msg: sp.name + ': отношения ' + fac.relations[sponsorId] + '%' };
  }

  function requestAid(side, sponsorId, pkgId) {
    const fac = state.factions[side];
    const sp = G.SPONSORS.find(x => x.id === sponsorId);
    const pkg = sp && sp.packages.find(p => p.id === pkgId);
    if (!pkg || !fac || (fac.relations[sponsorId] || 0) < pkg.minRel || fac.pp < pkg.costPP) {
      return { ok: false, msg: 'Недостаточно отношений или ПО' };
    }
    fac.pp -= pkg.costPP;
    const hasBonus = sp.bonusSector && state.cities[sp.bonusSector]?.owner === side;
    const mult = hasBonus ? 1.2 : 1.0;
    const g = { ...pkg.grant };
    if (g.weapons) g.weapons = Math.round(g.weapons * mult);
    if (g.manpower) g.manpower = Math.round(g.manpower * mult);
    applyEventEffect(side, g, sp.bonusSector);
    if (pkg.relDelta) fac.relations[sponsorId] = Math.min(100, (fac.relations[sponsorId] || 0) + pkg.relDelta);
    const bonusNote = hasBonus ? ' (+20% коридор)' : '';
    setAlert(sp.name + ': ' + pkg.name + bonusNote, side);
    pushFeed(side, sp.name + ' → ' + pkg.name + bonusNote);
    emit();
    return { ok: true, msg: 'Получено: ' + pkg.name + bonusNote };
  }

  function proposeTreaty(side, treatyType) {
    const fac = state.factions[side];
    const tr = G.TREATIES[treatyType];
    if (!tr || !fac || fac.pp < tr.costPP) return { ok: false, msg: 'Нужно ' + (tr?.costPP || 20) + ' ПО' };
    if (treatyType === 'peace_treaty' && state.day < 12) {
      return { ok: false, msg: 'Мир доступен после 12-го дня войны (сейчас день ' + state.day + ')' };
    }
    if (onlineMode) {
      if (state.status === 'finished') return { ok: false, msg: 'Матч завершён' };
      if (state.pendingEvent) return { ok: false, msg: 'Дождитесь ответа на текущее событие' };
      openPendingEvent({
        id: 'treaty_' + treatyType, cat: 'diplomacy', visibility: 'treaty',
        title: tr.name,
        text: fac.name + ' предлагает заключить соглашение.',
        choices: [{ label: 'Принять' }, { label: 'Отклонить' }]
      }, enemyOf(side), { side, type: treatyType });
      setAlert('Предложение отправлено: ' + tr.name, side);
      return { ok: true, msg: 'Предложение отправлено второй стороне' };
    }
    return applyTreaty(side, treatyType);
  }

  function applyTreaty(side, treatyType) {
    const fac = state.factions[side];
    const tr = G.TREATIES[treatyType];
    if (fac.pp < tr.costPP) {
      setAlert('Соглашение отменено: у инициатора недостаточно политических очков');
      return { ok: false, msg: 'Недостаточно политических очков' };
    }
    fac.pp -= tr.costPP;
    if (treatyType === 'ceasefire_3') {
      state.ceasefireDaysLeft = Math.max(state.ceasefireDaysLeft, 3);
      setAlert(fac.name + ': согласована заморозка фронта (3 дн.)');
    } else if (treatyType === 'ceasefire_5') {
      state.ceasefireDaysLeft = Math.max(state.ceasefireDaysLeft, 5);
      setAlert(fac.name + ': заключено перемирие (5 дн.)');
    } else if (treatyType === 'demilitarize_border') {
      state.noStrikesDaysLeft = Math.max(state.noStrikesDaysLeft, 2);
      setAlert(fac.name + ': запрет авиа- и ракетных ударов на 2 дня');
      pushFeed(side, 'Запрет тяжёлых и авиаударов (2 дн.)');
    } else if (treatyType === 'demarcation_5') {
      state.ceasefireDaysLeft = Math.max(state.ceasefireDaysLeft, 5);
      state.demarcationDaysLeft = Math.max(state.demarcationDaysLeft, 5);
      state.demarcationForce = side === 'A' ? 'RU' : 'UN';
      spawnPeacekeepersOnFront(state.demarcationForce);
      const dm = 'Установлена демаркационная линия (' + (state.demarcationForce === 'RU' ? 'МС РФ' : 'МС ООН') + ') на 5 дн.';
      setAlert(dm); pushFeed(state.demarcationForce, dm);
    } else if (treatyType === 'peace_treaty') {
      const vp = computeControlStats(state);
      state.status = 'finished';
      state.winner = vp.vpA > vp.vpB ? 'A' : (vp.vpB > vp.vpA ? 'B' : 'draw');
      speed = 0;
      setAlert('Подписано мирное соглашение! Итог: Запад ' + vp.vpA + ' ОП · Восток ' + vp.vpB + ' ОП.');
    }
    emit();
    return { ok: true, msg: tr.name };
  }

  // ==================== HIGH COMMAND STRATEGIC DIRECTIVES ====================
  function issueDirective(side, dirType, targetCityId, effort = 'medium') {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    if (state.phase === 'crisis') return { ok: false, msg: 'Во время кризиса директивы наступления недоступны' };
    const fac = state.factions[side];
    const myDivs = state.divisions.filter(d => d.side === side);
    if (!myDivs.length) return { ok: false, msg: 'Нет боеспособных дивизий' };

    const costs = {
      low:    { wp: 0,   pp: 0,  frac: 0.35, opMode: 'standard', label: 'Экономно (35% сил)' },
      medium: { wp: 120, pp: 10, frac: 0.62, opMode: 'standard', label: 'Усиленно (60% сил)' },
      allin:  { wp: 260, pp: 20, frac: 0.88, opMode: 'massive',  label: 'Ва-банк (85% сил)' }
    };
    const cfg = costs[effort] || costs.medium;
    if (dirType !== 'hold_line' && (fac.weapons < cfg.wp || fac.pp < cfg.pp)) {
      return { ok: false, msg: 'Нужно ' + cfg.wp + ' ОРУЖ и ' + cfg.pp + ' ПО для «' + cfg.label + '»' };
    }

    const myHubs = G.SECTORS.filter(m => state.cities[m.id].owner === side && m.supplyHub);
    const frontFriendly = getFrontlineFriendlySectors(side);
    const frontEnemy = getFrontlineEnemySectors(side);
    const safeHub = myHubs[0] || frontFriendly[0] || G.SECTORS[0];
    const rearSupport = (frontFriendly[0] && frontFriendly[0].adj
      .map(id => G.SECTOR_MAP[id])
      .find(m => m && state.cities[m.id].owner === side && m.terrain !== 'high_mountain')) || safeHub;

    for (const d of myDivs) {
      if (d.type === 'aa') {
        if (dist(d.x, d.y, safeHub.x, safeHub.y) > 40) orderDivisionsMarch([d.id], safeHub.x, safeHub.y, 'standard', true);
        else orderDivisionsEntrench([d.id]);
      } else if (d.type === 'artillery') {
        if (dist(d.x, d.y, rearSupport.x, rearSupport.y) > 40) orderDivisionsMarch([d.id], rearSupport.x, rearSupport.y, 'standard', true);
        else orderDivisionsEntrench([d.id]);
      }
    }

    const combatDivs = myDivs.filter(d => d.type !== 'aa' && d.type !== 'artillery' && !isTrappedInTkuarchal(d));
    if (dirType === 'hold_line') {
      const anchors = frontFriendly.length ? frontFriendly : [safeHub];
      combatDivs.forEach((d, idx) => {
        const anc = anchors[idx % anchors.length];
        if (dist(d.x, d.y, anc.x, anc.y) > 34) orderDivisionsMarch([d.id], anc.x, anc.y, 'standard', true);
        else orderDivisionsEntrench([d.id]);
      });
      fac.activeDirective = { type: 'hold_line', label: 'Глухая оборона рубежей', effort: cfg.label };
      const msg = fac.name + ': приказ Ставки — Глухая оборона';
      setAlert(msg, side); pushFeed(side, 'Приказ Ставки: Глухая оборона');
      emit();
      return { ok: true, msg };
    }

    if (state.ceasefireDaysLeft > 0) return { ok: false, msg: 'Действует перемирие / демаркация (' + state.ceasefireDaysLeft + ' дн.)' };

    const tgt = (targetCityId && G.SECTOR_MAP[targetCityId] && state.cities[targetCityId].owner !== side)
      ? G.SECTOR_MAP[targetCityId]
      : (frontEnemy.sort((a, b) => b.vp - a.vp)[0] || G.SECTORS.find(m => state.cities[m.id].owner !== side));
    if (!tgt) return { ok: false, msg: 'Нет доступных целей противника' };

    fac.weapons -= cfg.wp;
    fac.pp -= cfg.pp;

    const sorted = [...combatDivs].sort((a, b) => dist(a.x, a.y, tgt.x, tgt.y) - dist(b.x, b.y, tgt.x, tgt.y));
    const sendCount = Math.max(1, Math.round(sorted.length * cfg.frac));
    const strikers = sorted.slice(0, sendCount);
    const reserves = sorted.slice(sendCount);

    let sent = 0;
    for (const d of strikers) {
      if (orderDivisionsMarch([d.id], tgt.x, tgt.y, cfg.opMode, true).ok) sent++;
    }
    reserves.forEach((d, idx) => {
      const anc = (frontFriendly.length ? frontFriendly : [safeHub])[idx % Math.max(1, frontFriendly.length || 1)];
      if (dist(d.x, d.y, anc.x, anc.y) > 36) orderDivisionsMarch([d.id], anc.x, anc.y, 'standard', true);
      else orderDivisionsEntrench([d.id]);
    });

    if (effort === 'allin' && fac.weapons >= 60 && fac.pp >= 14) {
      launchStrike(side, 'ew_jamming', tgt.x, tgt.y);
    }

    const dirTitle = dirType === 'all_in' ? ('Ва-банк: ' + tgt.name)
      : dirType === 'breakthrough' ? ('Прорыв к ' + tgt.name)
      : ('Штурм: ' + tgt.name);

    fac.activeDirective = { type: dirType, targetId: tgt.id, label: dirTitle, effort: cfg.label, sent };
    const msg = 'Приказ Ставки: ' + dirTitle + ' (' + sent + ' див. в атаку, ' + reserves.length + ' в резерве)';
    setAlert(msg, side); pushFeed(side, dirTitle + ' · ' + cfg.label);
    emit();
    return { ok: true, msg };
  }

  // ==================== PLAYABLE 3RD FACTION: UN MISSION ====================
  function runUnAction(actionId, targetSide = 'both') {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    const un = state.un;
    const spend = cost => {
      if (un.mandate < cost) return false;
      un.mandate -= cost;
      return true;
    };

    if (actionId === 'deploy_peacekeepers') {
      if (!spend(35)) return { ok: false, msg: 'Нужно 35 очков мандата ООН (МП)' };
      state.ceasefireDaysLeft = Math.max(state.ceasefireDaysLeft, 4);
      state.demarcationDaysLeft = Math.max(state.demarcationDaysLeft, 4);
      state.demarcationForce = 'UN';
      spawnPeacekeepersOnFront('UN');
      un.credibility = clamp(un.credibility + 6, 10, 100);
      const m = 'ООН: введены миротворцы и демаркационная линия на 4 дня!';
      setAlert(m); pushFeed('UN', m); emit();
      return { ok: true, msg: m };
    }
    if (actionId === 'withdraw_peacekeepers') {
      state.demarcationDaysLeft = 0;
      state.ceasefireDaysLeft = 0;
      state.demarcationForce = null;
      state.divisions = state.divisions.filter(d => d.side !== 'N');
      const m = 'ООН: миротворческий контингент выведен с линии разграничения.';
      setAlert(m); pushFeed('UN', m); emit();
      return { ok: true, msg: m };
    }
    if (actionId === 'propose_ceasefire') {
      if (!spend(25)) return { ok: false, msg: 'Нужно 25 МП' };
      let accepted = 0;
      for (const s of ['A', 'B']) {
        const fac = state.factions[s];
        const divs = state.divisions.filter(d => d.side === s);
        const avgOrg = divs.length ? divs.reduce((a, d) => a + d.org, 0) / divs.length : 80;
        if ((un.credibility >= 70 && Math.random() < 0.72) || avgOrg < 72 || fac.weapons < 500) accepted++;
      }
      if (accepted === 2) {
        state.ceasefireDaysLeft = Math.max(state.ceasefireDaysLeft, 3);
        un.credibility = clamp(un.credibility + 8, 10, 100);
        const m = 'ООН: ОБЕ стороны приняли резолюцию о прекращении огня на 3 дня!';
        setAlert(m); pushFeed('UN', m); emit();
        return { ok: true, msg: m };
      }
      un.credibility = clamp(un.credibility - 4, 10, 100);
      const m = 'ООН: резолюция о перемирии отклонена (согласились ' + accepted + '/2).';
      setAlert(m); pushFeed('UN', m); emit();
      return { ok: true, msg: m };
    }
    if (actionId === 'humanitarian_aid') {
      if (!spend(20)) return { ok: false, msg: 'Нужно 20 МП' };
      const list = targetSide === 'both' ? ['A', 'B'] : [targetSide];
      for (const s of list) {
        state.factions[s].manpower += 240;
        state.factions[s].morale = clamp(state.factions[s].morale + 5, 20, 100);
        state.divisions.filter(d => d.side === s).forEach(d => { d.org = Math.min(100, d.org + 10); });
      }
      un.credibility = clamp(un.credibility + 5, 10, 100);
      const who = targetSide === 'both' ? 'обеим сторонам' : (targetSide === 'A' ? 'Западу' : 'Востоку');
      const m = 'ООН: гуманитарный конвой доставлен ' + who + ' (+240 Л/С, +10% орг).';
      setAlert(m); pushFeed('UN', m); emit();
      return { ok: true, msg: m };
    }
    if (actionId === 'sanctions') {
      if (!spend(30)) return { ok: false, msg: 'Нужно 30 МП' };
      const s = targetSide === 'B' ? 'B' : 'A';
      state.factions[s].weapons = Math.max(0, state.factions[s].weapons - 280);
      state.factions[s].pp = Math.max(0, state.factions[s].pp - 22);
      state.factions[s].morale = clamp(state.factions[s].morale - 8, 20, 100);
      const m = 'ООН: санкции против ' + (s === 'A' ? 'Запада' : 'Востока') + ' (−280 ОРУЖ, −22 ПО, −8% дух)!';
      setAlert(m); pushFeed('UN', m); emit();
      return { ok: true, msg: m };
    }
    if (actionId === 'arms_embargo') {
      if (!spend(35)) return { ok: false, msg: 'Нужно 35 МП' };
      un.embargoDaysLeft = Math.max(un.embargoDaysLeft, 5);
      const m = 'ООН: оружейное эмбарго на 5 дней (−55% притока БК обеим сторонам)!';
      setAlert(m); pushFeed('UN', m); emit();
      return { ok: true, msg: m };
    }
    if (actionId === 'satellite_audit') {
      if (!spend(15)) return { ok: false, msg: 'Нужно 15 МП' };
      un.credibility = clamp(un.credibility + 12, 10, 100);
      const m = 'ООН: спутниковый отчёт по фронту (авторитет ' + un.credibility + '%).';
      setAlert(m); pushFeed('UN', m); emit();
      return { ok: true, msg: m };
    }
    if (actionId === 'geneva_summit') {
      if (!spend(50)) return { ok: false, msg: 'Нужно 50 МП' };
      state.ceasefireDaysLeft = Math.max(state.ceasefireDaysLeft, 6);
      state.demarcationDaysLeft = Math.max(state.demarcationDaysLeft, 6);
      state.demarcationForce = 'UN';
      spawnPeacekeepersOnFront('UN');
      un.credibility = clamp(un.credibility + 15, 10, 100);
      const m = 'ООН: Женевский саммит — 6 дней перемирия и буферная зона!';
      setAlert(m); pushFeed('UN', m); emit();
      return { ok: true, msg: m };
    }
    return { ok: false, msg: 'Неизвестное действие ООН' };
  }

  // ==================== DRAWN BATTLEPLAN LINE ====================
  function executeDrawnLine(side, points, selectedIds = [], opMode = 'standard') {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    if (state.phase === 'crisis') return { ok: false, msg: 'Во время политического кризиса наступление недоступно' };
    if (state.ceasefireDaysLeft > 0) return { ok: false, msg: 'Действует перемирие / демаркация (' + state.ceasefireDaysLeft + ' дн.)' };
    if (!points || points.length < 2) return { ok: false, msg: 'Проведите линию длиннее по карте' };

    const endPt = points[points.length - 1];
    const startPt = points[0];
    const myDivs = state.divisions.filter(d => d.side === side);
    if (!myDivs.length) return { ok: false, msg: 'Нет доступных дивизий' };

    let chosen = (selectedIds || []).map(id => myDivs.find(d => d.id === id)).filter(Boolean);
    if (!chosen.length) {
      const combat = myDivs
        .filter(d => d.type !== 'aa' && d.type !== 'artillery' && !isTrappedInTkuarchal(d) && d.hp > d.maxHp * 0.35)
        .sort((a, b) => dist(a.x, a.y, startPt.x, startPt.y) - dist(b.x, b.y, startPt.x, startPt.y));
      chosen = combat.slice(0, Math.max(2, Math.min(6, Math.round(combat.length * 0.55))));
      for (const a of myDivs.filter(d => d.type === 'artillery')) {
        if (dist(a.x, a.y, startPt.x, startPt.y) > 130) orderDivisionsMarch([a.id], startPt.x, startPt.y, 'standard');
      }
    }
    if (!chosen.length) return { ok: false, msg: 'Нет боеспособных дивизий для наступления' };

    const targetSpan = points.slice(Math.floor(points.length * 0.45));
    let sent = 0;
    const assignedIds = [];
    for (let i = 0; i < chosen.length; i++) {
      const d = chosen[i];
      const idx = targetSpan.length > 1
        ? Math.min(targetSpan.length - 1, Math.round((i / Math.max(1, chosen.length - 1)) * (targetSpan.length - 1)))
        : 0;
      const tgt = targetSpan[idx] || endPt;
      if (orderDivisionsMarch([d.id], tgt.x, tgt.y, opMode).ok) { sent++; assignedIds.push(d.id); }
    }

    state.drawnPlans[side] = { points: points.slice(), divIds: assignedIds };
    const tgtCity = nearestSectorMeta(endPt.x, endPt.y).name;
    const msg = 'Линия наступления к «' + tgtCity + '»: задействовано ' + sent + ' див.';
    setAlert(msg, side); pushFeed(side, 'Линия наступления → ' + tgtCity + ' (' + sent + ' див.)');
    emit();
    return { ok: sent > 0, msg };
  }

  function clearDrawnPlan(side) {
    if (state && state.drawnPlans) { state.drawnPlans[side] = null; emit(); }
  }

  // ==================== CORRIDOR CHECKPOINTS & MINEFIELDS ====================
  function canFortifyCorridor(side, key) {
    const c = CORRIDORS[key];
    if (!c || !state) return false;
    return state.cities[c.a].owner === side || state.cities[c.b].owner === side;
  }

  function buildCheckpoint(side, key) {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    const c = CORRIDORS[key];
    const cs = state.corridors && state.corridors[key];
    const fac = state.factions[side];
    if (!c || !cs || !fac) return { ok: false, msg: 'Тропа не найдена' };
    if (!canFortifyCorridor(side, key)) return { ok: false, msg: 'Нужно контролировать хотя бы один край этой дороги' };
    if (cs.checkpoint && cs.checkpoint.side === side && cs.checkpoint.hp >= 90) return { ok: false, msg: 'Блокпост уже установлен и исправен' };
    if (cs.checkpoint && cs.checkpoint.side !== side) return { ok: false, msg: 'Здесь стоит блокпост противника — сначала уничтожьте его' };
    if (fac.weapons < 90 || fac.pp < 8) return { ok: false, msg: 'Нужно 90 ОРУЖ и 8 ПО для установки блокпоста' };
    fac.weapons -= 90; fac.pp -= 8;
    cs.checkpoint = { side, hp: 100, maxHp: 100 };
    addPopup(c.mid.x, c.mid.y - 12, 'БЛОКПОСТ УСТАНОВЛЕН', side === 'A' ? '#60a5fa' : '#f87171');
    pushFeed(side, 'Установлен блокпост: ' + c.label);
    emit();
    return { ok: true, msg: 'Блокпост установлен: ' + c.label };
  }

  function mineCorridor(side, key) {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    const c = CORRIDORS[key];
    const cs = state.corridors && state.corridors[key];
    const fac = state.factions[side];
    if (!c || !cs || !fac) return { ok: false, msg: 'Тропа не найдена' };
    if (!canFortifyCorridor(side, key)) return { ok: false, msg: 'Нужно контролировать хотя бы один край этой тропы' };
    if (cs.mined && cs.mined.side === side && cs.mined.charges >= 2) return { ok: false, msg: 'Участок уже полностью заминирован' };
    if (fac.weapons < 75 || fac.pp < 6) return { ok: false, msg: 'Нужно 75 ОРУЖ и 6 ПО для минирования' };
    fac.weapons -= 75; fac.pp -= 6;
    cs.mined = { side, charges: 2 };
    addPopup(c.mid.x, c.mid.y - 12, 'ТРОПА ЗАМИНИРОВАНА', '#f59e0b');
    pushFeed(side, 'Заминирована дорога: ' + c.label);
    emit();
    return { ok: true, msg: 'Заминировано (2 заряда): ' + c.label };
  }

  function clearCorridorEnemyObstacle(side, key) {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    const c = CORRIDORS[key];
    const cs = state.corridors && state.corridors[key];
    const fac = state.factions[side];
    if (!c || !cs || !fac) return { ok: false, msg: 'Тропа не найдена' };
    const hasEnemyCp = cs.checkpoint && cs.checkpoint.side !== side;
    const hasEnemyMine = cs.mined && cs.mined.side !== side;
    if (!hasEnemyCp && !hasEnemyMine) return { ok: false, msg: 'Нет вражеских заграждений на этом участке' };
    if (fac.weapons < 80 || fac.pp < 8) return { ok: false, msg: 'Нужно 80 ОРУЖ и 8 ПО для сапёрного/огневого прорыва' };
    fac.weapons -= 80; fac.pp -= 8;
    if (hasEnemyMine) cs.mined = null;
    if (hasEnemyCp) cs.checkpoint = null;
    addPopup(c.mid.x, c.mid.y - 12, 'ПРОХОД РАСЧИЩЕН!', '#22c55e');
    pushFeed(side, 'Расчищены заграждения на участке ' + c.label);
    emit();
    return { ok: true, msg: 'Проход расчищен: ' + c.label };
  }

  function demolishCorridor(side, key) {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    const c = CORRIDORS[key];
    const cs = state.corridors && state.corridors[key];
    const fac = state.factions[side];
    if (!c || !cs || !fac) return { ok: false, msg: 'Участок не найден' };
    if (!canFortifyCorridor(side, key)) return { ok: false, msg: 'Нужно контролировать хотя бы один край пути' };
    if (cs.blocked) return { ok: false, msg: 'Путь уже перекрыт / взорван' };
    if (fac.weapons < 60 || fac.pp < 10) return { ok: false, msg: 'Нужно 60 ОРУЖ и 10 ПО для подрыва переправы' };
    fac.weapons -= 60; fac.pp -= 10;
    cs.blocked = { side, reason: c.bridge ? ('Взорван: ' + c.bridge.name) : 'Завал / подрыв трассы', hp: 100, maxHp: 100 };
    if (c.hasRail) cs.railDamaged = true;
    recomputeSupply();
    refreshTkuarchalSiege(false);
    addPopup(c.mid.x, c.mid.y - 14, c.bridge ? 'МОСТ ВЗОРВАН!' : 'ПУТЬ ПЕРЕКРЫТ!', '#ef4444');
    pushFeed(side, (c.bridge ? ('Взорван ' + c.bridge.name) : ('Перекрыт путь ' + c.label)) + ' — движение и снабжение остановлены');
    emit();
    return { ok: true, msg: 'Путь перекрыт: ' + c.label };
  }

  function repairCorridor(side, key) {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    const c = CORRIDORS[key];
    const cs = state.corridors && state.corridors[key];
    const fac = state.factions[side];
    if (!c || !cs || !fac) return { ok: false, msg: 'Участок не найден' };
    if (!canFortifyCorridor(side, key)) return { ok: false, msg: 'Нужно контролировать хотя бы один край пути' };
    if (!cs.blocked && !cs.railDamaged) return { ok: false, msg: 'Путь и ЖД полностью исправны' };
    const hasEng = state.divisions.some(d => d.side === side && d.type === 'engineering' && dist(d.x, d.y, c.mid.x, c.mid.y) < 110);
    const wpCost = hasEng ? 45 : 95;
    const ppCost = hasEng ? 5 : 10;
    if (fac.weapons < wpCost || fac.pp < ppCost) return { ok: false, msg: 'Нужно ' + wpCost + ' ОРУЖ и ' + ppCost + ' ПО' + (hasEng ? ' (скидка сапёров)' : '') };
    fac.weapons -= wpCost; fac.pp -= ppCost;
    cs.blocked = null;
    cs.railDamaged = false;
    recomputeSupply();
    refreshTkuarchalSiege(false);
    addPopup(c.mid.x, c.mid.y - 14, 'ПУТЬ ВОССТАНОВЛЕН!', '#22c55e');
    pushFeed(side, 'Восстановлен путь и ЖД: ' + c.label);
    emit();
    return { ok: true, msg: 'Переправа и ЖД восстановлены: ' + c.label };
  }

  function repairCityInfra(side, cityId) {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    const m = G.SECTOR_MAP[cityId];
    const c = state.cities[cityId];
    const fac = state.factions[side];
    if (!m || !c || !fac || c.owner !== side) return { ok: false, msg: 'Выберите свой сектор' };
    const inf = c.infra || {};
    const needs = (inf.airfieldHp != null && inf.airfieldHp < 100) || (inf.helipadHp != null && inf.helipadHp < 100) || (inf.portHp != null && inf.portHp < 100);
    if (!needs) return { ok: false, msg: 'Инфраструктура сектора полностью исправна' };
    const hasEng = state.divisions.some(d => d.side === side && d.type === 'engineering' && dist(d.x, d.y, m.x, m.y) < 95);
    const wpCost = hasEng ? 40 : 80;
    const ppCost = hasEng ? 4 : 8;
    if (fac.weapons < wpCost || fac.pp < ppCost) return { ok: false, msg: 'Нужно ' + wpCost + ' ОРУЖ и ' + ppCost + ' ПО' };
    fac.weapons -= wpCost; fac.pp -= ppCost;
    if (inf.airfieldHp != null) inf.airfieldHp = 100;
    if (inf.helipadHp != null) inf.helipadHp = 100;
    if (inf.portHp != null) inf.portHp = 100;
    recomputeSupply();
    addPopup(m.x, m.y - 16, 'ИНФРАСТРУКТУРА 100%!', '#22c55e');
    pushFeed(side, 'Отремонтированы ВПП/площадки/порт: ' + m.name);
    emit();
    return { ok: true, msg: 'Инфраструктура восстановлена: ' + m.name };
  }

  function airliftDivisions(side, divIds, targetCityId) {
    if (!state || state.status === 'finished') return { ok: false, msg: 'Партия завершена' };
    if (state.phase === 'crisis') return { ok: false, msg: 'Во время кризиса переброска недоступна' };
    const tgt = G.SECTOR_MAP[targetCityId];
    const tgtCity = state.cities[targetCityId];
    const fac = state.factions[side];
    if (!tgt || !tgtCity || !fac) return { ok: false, msg: 'Укажите целевой сектор с вертолётной площадкой' };
    if (tgtCity.owner !== side) return { ok: false, msg: 'Вертолётная переброска возможна только на СВОЮ исправную площадку' };
    const tgtOk = (tgt.helipad && (tgtCity.infra?.helipadHp ?? 100) > 35) || (tgt.airfield && (tgtCity.infra?.airfieldHp ?? 100) > 35);
    if (!tgtOk) return { ok: false, msg: 'В секторе ' + tgt.name + ' нет исправной вертолётной площадки' };

    const eligible = divIds
      .map(id => state.divisions.find(d => d.id === id && d.side === side))
      .filter(d => d && G.UNIT_TEMPLATES[d.type]?.airliftable && !isTrappedInTkuarchal(d));
    if (!eligible.length) return { ok: false, msg: 'Выберите пехоту, горных егерей, МП или ДРГ (техника не влезает в вертолёты)' };

    const srcOk = hasOperationalHelipad(side);
    if (!srcOk) return { ok: false, msg: 'Нет исправной вертолётной площадки для вылета' };
    const wpCost = 75 * eligible.length;
    const ppCost = 10;
    if (fac.weapons < wpCost || fac.pp < ppCost) return { ok: false, msg: 'Нужно ' + wpCost + ' ОРУЖ и ' + ppCost + ' ПО' };
    fac.weapons -= wpCost; fac.pp -= ppCost;

    const enemy = enemyOf(side);
    const enemyAA = state.divisions.filter(d => d.side === enemy && d.type === 'aa');
    let moved = 0, hitByAA = 0;

    for (const d of eligible) {
      const mx = (d.x + tgt.x) * 0.5, my = (d.y + tgt.y) * 0.5;
      const aaThreat = enemyAA.some(a => dist(a.x, a.y, tgt.x, tgt.y) <= 175 || dist(a.x, a.y, mx, my) <= 135);
      if (aaThreat && Math.random() < 0.45) {
        d.hp = Math.max(20, d.hp - Math.round(d.maxHp * 0.25));
        d.org = Math.max(20, d.org - 25);
        hitByAA++;
      }
      d.x = tgt.x + (Math.random() - 0.5) * 10;
      d.y = tgt.y + (Math.random() - 0.5) * 10;
      d.order = null;
      d.fort = 0.05;
      moved++;
    }
    recomputeSupply();
    addPopup(tgt.x, tgt.y - 18, hitByAA ? 'ВЕРТОЛЁТНЫЙ ДЕСАНТ (ОБСТРЕЛ ПВО!)' : ('ВЕРТ. ПЕРЕБРОСКА: ' + moved + ' ДИВ.'), hitByAA ? '#f59e0b' : '#38bdf8');
    pushFeed(side, 'Вертолётная переброска ' + moved + ' див. → ' + tgt.name + (hitByAA ? ' (попали под ПВО!)' : ''));
    emit();
    return { ok: true, msg: 'Переброшено вертолётами: ' + moved + ' див. → ' + tgt.name };
  }

  // ==================== ANTI-CHEAT ONLINE MULTIPLAYER HOOKS ====================
  function setOnlineMode(mode, lockedSide) {
    onlineMode = mode || null;
    if (onlineMode === 'host' && !backgroundHostTimer) {
      backgroundHostTimer = setInterval(() => {
        if (document.hidden) advanceClock(performance.now(), 1.25);
      }, 250);
    } else if (onlineMode !== 'host' && backgroundHostTimer) {
      clearInterval(backgroundHostTimer);
      backgroundHostTimer = null;
    }
    if (onlineMode && (lockedSide === 'A' || lockedSide === 'B')) {
      role = lockedSide;
    }
    emit();
  }

  function getMotionFrame() {
    const precise = n => Math.round(n * 100) / 100;
    return {
      units: state.divisions.map(unit => {
        const position = [unit.id, precise(unit.x), precise(unit.y)];
        const movement = speed && divisionMotion.get(unit);
        if (movement && unit.order === movement.order && unit.x === movement.x && unit.y === movement.y) {
          position.push(precise(movement.vx * speed), precise(movement.vy * speed),
            precise(movement.target.x), precise(movement.target.y));
        }
        return position;
      }),
      strikes: state.activeStrikes.map(strike => [strike.id, Math.round(strike.progress * 1000) / 1000, speed * 0.65])
    };
  }

  function applyRemoteState(snapshot, roomRow) {
    if (!snapshot || !snapshot.scenarioId) return;
    const prevPopups = (state && state.popups) ? state.popups : [];
    // Each network snapshot is handed to the engine exactly once.
    state = { ...snapshot, popups: prevPopups };
    const pending = state.pendingEvent;
    if (pending && !pending.key) {
      const now = Date.now();
      state.pendingEvent = {
        ...pending, key: pending.event.id + ':' + now,
        expiresAt: now + (pending.durationMs || 10000),
        answers: pending.event.visibility === 'both' ? { A: null, B: null } : { [pending.targetSide]: null }
      };
    }
    if (roomRow && typeof roomRow.speed === 'number') speed = roomRow.speed;
    emit();
  }

  function executeRemoteCommand(cmd) {
    if (!state || onlineMode !== 'host' || !cmd) return;
    const side = cmd.side;
    // Strict anti-cheat: Host only accepts remote commands from Guest side 'B'!
    if (side !== 'B') return;
    const p = cmd.payload || {};
    const ownDivIds = ids => (ids || []).filter(id => state.divisions.some(d => d.id === id && d.side === 'B'));

    switch (cmd.action) {
      case 'march':
        orderDivisionsMarch(ownDivIds(p.divIds), Number(p.tx), Number(p.ty), p.opMode === 'massive' ? 'massive' : 'standard');
        break;
      case 'entrench':
        orderDivisionsEntrench(ownDivIds(p.divIds));
        break;
      case 'retreat':
        orderDivisionsRetreat(ownDivIds(p.divIds));
        break;
      case 'reinforce':
        for (const id of ownDivIds(p.divIds)) reinforceDivision(id);
        break;
      case 'recruit':
        recruitDivision('B', p.type, p.cityId);
        break;
      case 'airlift':
        airliftDivisions('B', ownDivIds(p.divIds), p.targetCityId);
        break;
      case 'strike':
        launchStrike('B', p.strikeType, Number(p.tx), Number(p.ty));
        break;
      case 'decision':
        runDecision('B', p.decId);
        break;
      case 'doctrine':
        setDoctrine('B', p.docId);
        break;
      case 'crisis_influence':
        crisisInfluence('B', p.cityId);
        break;
      case 'improve_sponsor':
        improveSponsor('B', p.sponsorId);
        break;
      case 'request_aid':
        requestAid('B', p.sponsorId, p.pkgId);
        break;
      case 'propose_treaty': {
        const result = proposeTreaty('B', p.treatyType);
        if (!result.ok) setAlert(result.msg, 'B');
        break;
      }
      case 'directive':
        issueDirective('B', p.dirType, p.targetCityId, p.effort);
        break;
      case 'drawn_line':
        executeDrawnLine('B', Array.isArray(p.points) ? p.points.slice(0, 60) : [], ownDivIds(p.selectedIds), p.opMode === 'massive' ? 'massive' : 'standard');
        break;
      case 'clear_plan':
        clearDrawnPlan('B');
        break;
      case 'build_checkpoint':
        buildCheckpoint('B', p.key);
        break;
      case 'mine_corridor':
        mineCorridor('B', p.key);
        break;
      case 'clear_obstacle':
        clearCorridorEnemyObstacle('B', p.key);
        break;
      case 'demolish_corridor':
        demolishCorridor('B', p.key);
        break;
      case 'repair_corridor':
        repairCorridor('B', p.key);
        break;
      case 'repair_infra':
        repairCityInfra('B', p.cityId);
        break;
      case 'tkuarchal_action':
        runTkuarchalSiegeAction('B', p.actionId);
        break;
      case 'resolve_event':
        resolvePendingEvent('B', p.eventKey, p.choiceIdx);
        break;
      default:
        return;
    }
    if (G.SupabaseNet && G.SupabaseNet.isHost()) {
      G.SupabaseNet.pushSnapshot(state, true);
    }
  }

  function sendGuestCmd(action, payload) {
    if (G.SupabaseNet) G.SupabaseNet.submitCommand(action, payload);
    return { ok: true, msg: 'Приказ передан по защищённому каналу…' };
  }

  function proxyCmd(action, buildPayload, localFn) {
    return function(...args) {
      if (onlineMode && !G.SupabaseNet?.isOnlineMatch()) return { ok: false, msg: 'Дождитесь начала онлайн-матча' };
      if (onlineMode === 'guest') {
        return sendGuestCmd(action, buildPayload(...args));
      }
      const res = localFn(...args);
      if (onlineMode === 'host' && res && res.ok && G.SupabaseNet) {
        G.SupabaseNet.pushSnapshot(state, true);
      }
      return res;
    };
  }

  return {
    initScenario,
    setOnlineMode,
    getOnlineMode: () => onlineMode,
    getMotionFrame,
    applyRemoteState,
    executeRemoteCommand,

    demolishCorridor: proxyCmd('demolish_corridor', (side, key) => ({ key }), demolishCorridor),
    repairCorridor: proxyCmd('repair_corridor', (side, key) => ({ key }), repairCorridor),
    repairCityInfra: proxyCmd('repair_infra', (side, cityId) => ({ cityId }), repairCityInfra),
    airliftDivisions: proxyCmd('airlift', (side, divIds, targetCityId) => ({ divIds, targetCityId }), airliftDivisions),
    hasOperationalAirfield,
    hasOperationalHelipad,
    recomputeSupply,
    issueDirective: proxyCmd('directive', (side, dirType, targetCityId, effort) => ({ dirType, targetCityId, effort }), issueDirective),
    runTkuarchalSiegeAction: proxyCmd('tkuarchal_action', (side, actionId) => ({ actionId }), runTkuarchalSiegeAction),
    isTrappedInTkuarchal,
    getCorridors: () => CORRIDORS,
    edgeKey,
    buildCheckpoint: proxyCmd('build_checkpoint', (side, key) => ({ key }), buildCheckpoint),
    mineCorridor: proxyCmd('mine_corridor', (side, key) => ({ key }), mineCorridor),
    clearCorridorEnemyObstacle: proxyCmd('clear_obstacle', (side, key) => ({ key }), clearCorridorEnemyObstacle),
    executeDrawnLine: proxyCmd('drawn_line', (side, points, selectedIds, opMode) => ({ points, selectedIds, opMode }), executeDrawnLine),
    clearDrawnPlan: proxyCmd('clear_plan', () => ({}), clearDrawnPlan),
    runUnAction,
    getState: () => state,
    getRole: () => role,
    setRole,
    getPvpSide: () => pvpSide,
    setPvpSide: s => { pvpSide = s; emit(); },
    setPvpReady: (s, val) => { if (state && state.pvpReady) { state.pvpReady[s] = !!val; emit(); } },
    resetPvpReady: () => { if (state && state.pvpReady) { state.pvpReady.A = false; state.pvpReady.B = false; emit(); } },
    getSpeed: () => speed,
    setSpeed: s => { speed = s; emit(); },
    pendingEventForPlayer,
    answerEvent,
    triggerRandomEvent,
    orderDivisionsMarch: proxyCmd('march', (divIds, tx, ty, opMode) => ({ divIds, tx, ty, opMode }), orderDivisionsMarch),
    orderDivisionsEntrench: proxyCmd('entrench', (divIds) => ({ divIds }), orderDivisionsEntrench),
    orderDivisionsRetreat: proxyCmd('retreat', (divIds) => ({ divIds }), orderDivisionsRetreat),
    reinforceDivision: proxyCmd('reinforce', (divId) => ({ divIds: [divId] }), reinforceDivision),
    recruitDivision: proxyCmd('recruit', (side, type, cityId) => ({ type, cityId }), recruitDivision),
    launchStrike: proxyCmd('strike', (side, strikeType, tx, ty) => ({ strikeType, tx, ty }), launchStrike),
    runDecision: proxyCmd('decision', (side, decId) => ({ decId }), runDecision),
    setDoctrine: proxyCmd('doctrine', (side, docId) => ({ docId }), setDoctrine),
    crisisInfluence: proxyCmd('crisis_influence', (side, cityId) => ({ cityId }), crisisInfluence),
    improveSponsor: proxyCmd('improve_sponsor', (side, sponsorId) => ({ sponsorId }), improveSponsor),
    requestAid: proxyCmd('request_aid', (side, sponsorId, pkgId) => ({ sponsorId, pkgId }), requestAid),
    proposeTreaty: proxyCmd('propose_treaty', (side, treatyType) => ({ treatyType }), proposeTreaty),
    computeControlStats,
    nearestSectorMeta,
    subscribe: fn => { listeners.push(fn); }
  };
})();
