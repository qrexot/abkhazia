"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'gudauta_standoff',
  title: 'Гудаутский узел',
  tag: 'Война на два фронта',
  difficulty: 'Тактический',
  crisisDays: 0,
  desc: 'Гудаута, Лыхны, Новый Афон и Рица образуют мощный центральный кулак с аэродромом, но вынуждены держать два фронта одновременно — против Гагры с севера и Сухума с юга.',
  factions: {
    A: { name: 'Гудаутский центр',            color: '#3b82f6', manpower: 2700, weapons: 1320, supply: 740, pp: 85, missiles: 3, morale: 90, relations: { russia: 55, north_caucasus: 55, turkey: 25, georgia: 10, mediators: 30 } },
    B: { name: 'Коалиция Гагры и Сухума',     color: '#e15548', manpower: 2650, weapons: 1120, supply: 660, pp: 70, missiles: 2, morale: 84, relations: { russia: 35, north_caucasus: 25, turkey: 50, georgia: 40, mediators: 40 } }
  },
  owners: {
    A: ['bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon','gumista'],
    B: ['psou','tsandrypsh','gagra','shroma','sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: {
    gudauta:  { infantry: 540, mountain: 180, armor: 14, artillery: 9, aa: 5, drones: 10, fort: 0.25 },
    new_afon: { infantry: 420, mountain: 150, armor: 8,  artillery: 6, aa: 3, drones: 7,  fort: 0.28 },
    bzypta:   { infantry: 420, mountain: 140, armor: 8,  artillery: 6, aa: 3, drones: 6,  fort: 0.22 },
    gagra:    { infantry: 460, mountain: 130, armor: 9,  artillery: 6, aa: 3, drones: 7,  fort: 0.20 },
    sukhum:   { infantry: 500, mountain: 120, armor: 10, artillery: 7, aa: 4, drones: 8,  fort: 0.22 }
  }
});
