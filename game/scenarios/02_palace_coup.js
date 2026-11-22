"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'palace_coup',
  title: 'Единая власть → Раскол',
  tag: 'Фаза кризиса · 3 дня',
  difficulty: 'Политический старт',
  crisisDays: 3,
  desc: 'Сначала Абхазия едина, но в руководстве начинается острый кризис власти. Первые 3 дня идёт скрытая борьба за лояльность районов и гарнизонов за политические очки — на 4-й день страна раскалывается по итогам влияния и вспыхивает война!',
  factions: {
    A: { name: 'Блок Реформаторов (Запад)', color: '#3b82f6', manpower: 2400, weapons: 950, supply: 600, pp: 140, missiles: 1, morale: 82, relations: { russia: 40, north_caucasus: 35, turkey: 35, georgia: 25, mediators: 45 } },
    B: { name: 'Блок Силовиков (Сухум)',   color: '#e15548', manpower: 2400, weapons: 950, supply: 600, pp: 140, missiles: 1, morale: 82, relations: { russia: 40, north_caucasus: 35, turkey: 35, georgia: 25, mediators: 45 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu'],
    B: ['sukhum','gulrypsh','dranda','myku','tkuarchal','ochamchyra','gal','ingur'],
    neutral: ['new_afon','gumista','shroma','tsebelda','lata','chkhalta']
  },
  loyaltyA: {
    new_afon: 55, gumista: 50, shroma: 46, tsebelda: 48, lata: 50, chkhalta: 52,
    gudauta: 75, gagra: 72, sukhum: 28, tkuarchal: 30, ochamchyra: 35, gal: 32
  },
  garrisons: {
    gudauta: { infantry: 350, mountain: 90, armor: 8, artillery: 5, aa: 3, drones: 5, fort: 0.10 },
    sukhum:  { infantry: 380, mountain: 90, armor: 8, artillery: 5, aa: 3, drones: 5, fort: 0.12 },
    gumista: { infantry: 220, mountain: 60, armor: 4, artillery: 2, aa: 1, drones: 2, fort: 0.10 },
    chkhalta:{ infantry: 180, mountain: 100, armor: 2, artillery: 2, aa: 1, drones: 2, fort: 0.20 }
  }
});
