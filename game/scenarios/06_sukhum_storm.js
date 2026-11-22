"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'sukhum_storm',
  title: 'Штурм Сухума',
  tag: 'Битва за столицу',
  difficulty: 'Городские бои',
  crisisDays: 0,
  desc: 'Решающая операция за столицу. Западная армия уже закрепилась на Гумистинском мосту и высотах Шромы, нависая над Сухумом, пока Восток подтягивает резервы из Гулрыпша и Дранды.',
  factions: {
    A: { name: 'Группировка «Шрома–Гумиста»', color: '#3b82f6', manpower: 2650, weapons: 1180, supply: 660, pp: 65, missiles: 2, morale: 87, relations: { russia: 45, north_caucasus: 50, turkey: 25, georgia: 15, mediators: 25 } },
    B: { name: 'Оборона Сухума (Восток)',     color: '#e15548', manpower: 2650, weapons: 1180, supply: 680, pp: 75, missiles: 2, morale: 90, relations: { russia: 30, north_caucasus: 25, turkey: 45, georgia: 45, mediators: 45 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon','gumista','shroma'],
    B: ['sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: {
    gumista:  { infantry: 520, mountain: 140, armor: 10, artillery: 8, aa: 3, drones: 8, fort: 0.22 },
    shroma:   { infantry: 420, mountain: 200, armor: 5,  artillery: 7, aa: 3, drones: 7, fort: 0.28 },
    sukhum:   { infantry: 640, mountain: 160, armor: 12, artillery: 9, aa: 5, drones: 10, fort: 0.35 },
    gulrypsh: { infantry: 420, mountain: 100, armor: 9,  artillery: 6, aa: 3, drones: 6, fort: 0.15 }
  }
});
