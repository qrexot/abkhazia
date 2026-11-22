"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.getScenario = function(id) {
  return (window.AbkhaziaGame.SCENARIOS || []).find(s => s.id === id) || window.AbkhaziaGame.SCENARIOS[0];
};
