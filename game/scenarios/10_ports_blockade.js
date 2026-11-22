"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'ports_blockade',
  title: 'Битва за порты и логистику',
  tag: 'Морские десанты',
  difficulty: 'Средний',
  crisisDays: 0,
  desc: 'Главный приз — порты Сухума, Очамчыры, Пицунды и Гагры. Разрешены морские переброски между портами, обе стороны имеют усиленные расчёты БПЛА и ракет для ударов по узлам снабжения.',
  factions: {
    A: { name: 'Северная морская флотилия', color: '#3b82f6', manpower: 2500, weapons: 1200, supply: 700, pp: 80, missiles: 4, morale: 85, relations: { russia: 50, north_caucasus: 30, turkey: 50, georgia: 15, mediators: 35 } },
    B: { name: 'Южный портовый альянс',     color: '#e15548', manpower: 2500, weapons: 1200, supply: 700, pp: 80, missiles: 4, morale: 85, relations: { russia: 25, north_caucasus: 25, turkey: 55, georgia: 50, mediators: 35 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon','gumista'],
    B: ['shroma','sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: {
    pitsunda:  { infantry: 380, mountain: 80, armor: 8, artillery: 5, aa: 4, drones: 10, fort: 0.18 },
    gudauta:   { infantry: 420, mountain: 90, armor: 10, artillery: 6, aa: 4, drones: 10, fort: 0.15 },
    sukhum:    { infantry: 480, mountain: 90, armor: 10, artillery: 7, aa: 5, drones: 12, fort: 0.20 },
    ochamchyra:{ infantry: 440, mountain: 80, armor: 9, artillery: 6, aa: 4, drones: 10, fort: 0.18 }
  }
});
