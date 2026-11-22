"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};

window.AbkhaziaGame.createGuestMotion = function () {
  let divisions = new Map();
  let strikes = new Map();
  let running = false;
  let lastStreamAt = -Infinity;

  function project(track, now) {
    const age = Math.max(0, now - track.at);
    const seconds = Math.min(age, track.predictMs) / 1000;
    const correction = Math.max(0, 1 - age / track.blendMs);
    return {
      x: track.x + track.vx * seconds + track.dx * correction,
      y: track.y + track.vy * seconds + track.dy * correction
    };
  }

  function blend(previous, x, y, vx, vy, now, blendMs, predictMs, snapDistance) {
    const start = previous ? project(previous, now) : { x, y };
    const snap = Math.hypot(start.x - x, start.y - y) > snapDistance;
    return {
      x, y, vx, vy, at: now, blendMs, predictMs,
      dx: snap ? 0 : start.x - x,
      dy: snap ? 0 : start.y - y
    };
  }

  function accept(frame, now, streamed) {
    if (streamed) lastStreamAt = now;
    const seedOnly = !streamed && now - lastStreamAt < 320;
    const blendMs = streamed ? 110 : 155;
    const predictMs = streamed ? 220 : 635;

    const updatedDivisions = new Map();
    for (const [id, x, y, vx = 0, vy = 0, targetX, targetY] of frame.units) {
      const previous = divisions.get(id);
      if (seedOnly && previous) {
        updatedDivisions.set(id, previous);
        continue;
      }
      const travel = Math.hypot(vx, vy);
      const remainingMs = travel > 0 ? 1000 * Math.hypot(targetX - x, targetY - y) / travel : 0;
      updatedDivisions.set(id, blend(previous, x, y,
        running ? vx : 0, running ? vy : 0, now, blendMs,
        running ? Math.min(predictMs, remainingMs) : 0, 35 + travel * 0.22));
    }

    const updatedStrikes = new Map();
    for (const [id, progress, rate] of frame.strikes) {
      const previous = strikes.get(id);
      updatedStrikes.set(id, seedOnly && previous ? previous : blend(previous, progress, 0,
        running ? rate : 0, 0, now, blendMs, running ? predictMs : 0, 0.85));
    }
    divisions = updatedDivisions;
    strikes = updatedStrikes;
  }

  function stopTracks(tracks, now) {
    for (const [id, track] of tracks) {
      const current = project(track, now);
      tracks.set(id, blend(null, current.x, current.y, 0, 0, now, 1, 0, Infinity));
    }
  }

  return {
    reset() {
      divisions.clear();
      strikes.clear();
      running = false;
      lastStreamAt = -Infinity;
    },
    setRunning(value, now) {
      if (value === running) return;
      running = value;
      lastStreamAt = -Infinity;
      if (!running) {
        stopTracks(divisions, now);
        stopTracks(strikes, now);
      }
    },
    accept,
    division(unit, now) {
      const track = divisions.get(unit.id);
      return track ? project(track, now) : unit;
    },
    strike(effect, now) {
      const track = strikes.get(effect.id);
      return track ? Math.max(0, Math.min(1, project(track, now).x)) : effect.progress;
    },
    needsFrame(now) {
      for (const tracks of [divisions, strikes]) {
        for (const track of tracks.values()) {
          const age = now - track.at;
          if ((track.dx || track.dy) && age < track.blendMs) return true;
          if ((track.vx || track.vy) && age < track.predictMs) return true;
        }
      }
      return false;
    }
  };
};
