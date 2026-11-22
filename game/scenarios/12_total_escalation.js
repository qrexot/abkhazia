"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'total_escalation',
  title: 'Тотальная эскалация 2026',
  tag: 'Максимум сил · ОТРК',
  difficulty: 'Высокий темп',
  crisisDays: 0,
  desc: 'Полномасштабная кампания на всех 24 секторах с максимальными арсеналами: танковые колонны, плотная ПВО, дивизионы ракет ОТРК, рои БПЛА и открытые каналы поставок всех внешних сил.',
  factions: {
    A: { name: 'Западная армия',  color: '#3b82f6', manpower: 4200, weapons: 2200, supply: 1200, pp: 110, missiles: 6, morale: 90, relations: { russia: 65, north_caucasus: 60, turkey: 40, georgia: 20, mediators: 25 } },
    B: { name: 'Восточная армия', color: '#e15548', manpower: 4200, weapons: 2200, supply: 1200, pp: 110, missiles: 6, morale: 90, relations: { russia: 35, north_caucasus: 40, turkey: 65, georgia: 60, mediators: 25 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon','gumista'],
    B: ['shroma','sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: {
    gagra:     { infantry: 500, mountain: 160, armor: 14, artillery: 8, aa: 5, drones: 12, fort: 0.20 },
    gudauta:   { infantry: 620, mountain: 180, armor: 18, artillery: 10, aa: 6, drones: 14, fort: 0.22 },
    new_afon:  { infantry: 480, mountain: 150, armor: 10, artillery: 7, aa: 4, drones: 10, fort: 0.25 },
    gumista:   { infantry: 650, mountain: 180, armor: 16, artillery: 10, aa: 5, drones: 12, fort: 0.28 },
    sukhum:    { infantry: 700, mountain: 180, armor: 18, artillery: 11, aa: 6, drones: 14, fort: 0.28 },
    shroma:    { infantry: 480, mountain: 200, armor: 8,  artillery: 8, aa: 4, drones: 10, fort: 0.25 },
    dranda:    { infantry: 500, mountain: 120, armor: 15, artillery: 8, aa: 5, drones: 12, fort: 0.18 },
    chkhalta:  { infantry: 380, mountain: 260, armor: 4,  artillery: 7, aa: 4, drones: 10, fort: 0.35 },
    tkuarchal: { infantry: 520, mountain: 240, armor: 10, artillery: 9, aa: 5, drones: 10, fort: 0.32 },
    ochamchyra:{ infantry: 500, mountain: 120, armor: 14, artillery: 8, aa: 5, drones: 10, fort: 0.20 },
    gal:       { infantry: 480, mountain: 100, armor: 12, artillery: 7, aa: 4, drones: 10, fort: 0.18 }
  }
});
