"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.pickRandomEvent = function(usedIds, allowSecret) {
  const pool = (window.AbkhaziaGame.EVENTS || []).filter(e => !usedIds.has(e.id) && (allowSecret || e.visibility === 'both'));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
};
