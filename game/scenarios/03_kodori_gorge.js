"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'kodori_gorge',
  title: 'Битва за Кодор и Чхалту',
  tag: 'Горная война',
  difficulty: 'Высокая оборона',
  crisisDays: 0,
  desc: 'Ожесточённая горная кампания вокруг Верхнего Кодора (Чхалта, Лата, Цебельда). Восточная группировка опирается на высокогорные ущелья и Ткуарчал, Западная — на Сухум, аэродром Дранда и побережье.',
  factions: {
    A: { name: 'Сухумско-Прибрежный корпус', color: '#3b82f6', manpower: 2700, weapons: 1200, supply: 700, pp: 65, missiles: 2, morale: 85, relations: { russia: 50, north_caucasus: 30, turkey: 35, georgia: 15, mediators: 30 } },
    B: { name: 'Кодорско-Восточный фронт',   color: '#e15548', manpower: 2500, weapons: 1150, supply: 680, pp: 80, missiles: 2, morale: 90, relations: { russia: 20, north_caucasus: 55, turkey: 35, georgia: 55, mediators: 35 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon','gumista','shroma','sukhum','gulrypsh','dranda'],
    B: ['tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: {
    gulrypsh: { infantry: 420, mountain: 150, armor: 10, artillery: 7, aa: 3, drones: 8, fort: 0.12 },
    dranda:   { infantry: 380, mountain: 120, armor: 10, artillery: 6, aa: 4, drones: 8, fort: 0.15 },
    shroma:   { infantry: 300, mountain: 140, armor: 4,  artillery: 4, aa: 2, drones: 4, fort: 0.15 },
    tsebelda: { infantry: 340, mountain: 220, armor: 4,  artillery: 6, aa: 3, drones: 6, fort: 0.30 },
    lata:     { infantry: 300, mountain: 240, armor: 3,  artillery: 6, aa: 3, drones: 6, fort: 0.35 },
    chkhalta: { infantry: 320, mountain: 280, armor: 2,  artillery: 7, aa: 4, drones: 8, fort: 0.42 },
    tkuarchal:{ infantry: 340, mountain: 200, armor: 5,  artillery: 6, aa: 3, drones: 6, fort: 0.30 },
    myku:     { infantry: 300, mountain: 120, armor: 6,  artillery: 5, aa: 2, drones: 5, fort: 0.18 }
  }
});
