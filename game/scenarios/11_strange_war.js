"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'strange_war',
  title: '«Странная война»',
  tag: 'Дипломатия и кризис',
  difficulty: 'Медленный старт',
  crisisDays: 2,
  desc: 'После 2 дней политического раскола армии сторон минимальны, но политических очков в избытке. Идёт «странная война»: перемирия, борьба за поставки от России, Турции, Грузии и Северного Кавказа, окапывание и точечные удары перед решающим броском.',
  factions: {
    A: { name: 'Западный совет',   color: '#3b82f6', manpower: 1800, weapons: 650, supply: 520, pp: 160, missiles: 1, morale: 80, relations: { russia: 40, north_caucasus: 40, turkey: 30, georgia: 20, mediators: 50 } },
    B: { name: 'Восточный совет',  color: '#e15548', manpower: 1800, weapons: 650, supply: 520, pp: 160, missiles: 1, morale: 80, relations: { russia: 30, north_caucasus: 30, turkey: 40, georgia: 40, mediators: 50 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon'],
    B: ['sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur'],
    neutral: ['gumista','shroma']
  },
  loyaltyA: { gumista: 50, shroma: 50 },
  garrisons: {
    gudauta: { infantry: 240, mountain: 60, armor: 4, artillery: 3, aa: 2, drones: 4, fort: 0.15 },
    sukhum:  { infantry: 260, mountain: 60, armor: 4, artillery: 3, aa: 2, drones: 4, fort: 0.15 }
  }
});
