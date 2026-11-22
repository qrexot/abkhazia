"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'southern_corridor',
  title: 'Южный коридор (Ингур — порт)',
  tag: 'Асимметрия · Море',
  difficulty: 'Сложный',
  crisisDays: 0,
  desc: 'Восток получает активные поставки через Ингурский мост и Очамчырский порт. Запад контролирует высоты Нового Афона, Шромы и Гудаутский авиаузел, сдерживая южное наступление.',
  factions: {
    A: { name: 'Западный штаб (Гудаута)', color: '#3b82f6', manpower: 3000, weapons: 1250, supply: 680, pp: 80, missiles: 2, morale: 86, relations: { russia: 50, north_caucasus: 55, turkey: 20, georgia: 10, mediators: 35 } },
    B: { name: 'Восточный штаб (Сухум)', color: '#e15548', manpower: 2500, weapons: 1650, supply: 780, pp: 85, missiles: 3, morale: 85, relations: { russia: 20, north_caucasus: 20, turkey: 72, georgia: 65, mediators: 40 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon','gumista','shroma'],
    B: ['sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: { gumista:{infantry:460,armor:8,artillery:6,fort:0.32}, shroma:{infantry:340,mountain:130,artillery:6,fort:0.34}, gudauta:{infantry:380,armor:8,aa:4,fort:0.20}, sukhum:{infantry:460,armor:9,artillery:7,aa:4,fort:0.28}, ochamchyra:{infantry:360,armor:8,artillery:6,aa:4,fort:0.22}, ingur:{infantry:320,armor:8,artillery:6,fort:0.20} }
});
