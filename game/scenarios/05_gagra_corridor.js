"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'gagra_corridor',
  title: 'Гагрский коридор и Псоу',
  tag: 'Северо-Запад',
  difficulty: 'Узкий фронт',
  crisisDays: 0,
  desc: 'Битва за северо-западные ворота Абхазии: КПП Псоу, Цандрыпш, Гагра, Пицунда и Рицинский перевал. Узкая прибрежная кишка и горный обход через Рицу решают судьбу снабжения.',
  factions: {
    A: { name: 'Северо-Западный округ', color: '#3b82f6', manpower: 2550, weapons: 1200, supply: 750, pp: 75, missiles: 2, morale: 88, relations: { russia: 65, north_caucasus: 45, turkey: 20, georgia: 10, mediators: 25 } },
    B: { name: 'Центральный фронт',     color: '#e15548', manpower: 2700, weapons: 1100, supply: 640, pp: 75, missiles: 2, morale: 85, relations: { russia: 25, north_caucasus: 35, turkey: 45, georgia: 40, mediators: 40 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara'],
    B: ['lykhny','gudauta','pskhu','new_afon','gumista','shroma','sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: {
    gagra:    { infantry: 520, mountain: 180, armor: 10, artillery: 8, aa: 4, drones: 9, fort: 0.30 },
    bzypta:   { infantry: 460, mountain: 160, armor: 9,  artillery: 7, aa: 3, drones: 7, fort: 0.25 },
    pitsunda: { infantry: 380, mountain: 90,  armor: 7,  artillery: 5, aa: 3, drones: 6, fort: 0.18 },
    ritsa:    { infantry: 240, mountain: 220, armor: 2,  artillery: 5, aa: 2, drones: 5, fort: 0.35 },
    gudauta:  { infantry: 500, mountain: 140, armor: 11, artillery: 7, aa: 4, drones: 8, fort: 0.18 },
    lykhny:   { infantry: 380, mountain: 150, armor: 6,  artillery: 5, aa: 2, drones: 5, fort: 0.15 }
  }
});
