"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'diplomatic_freeze',
  title: 'Женевский тупик (Кризис 5 дн.)',
  tag: 'Политика + Война',
  difficulty: 'Дипломатический',
  crisisDays: 5,
  desc: 'Пять дней острейшего политического кризиса перед неизбежным расколом. В центре страны — спорные сектора. Кто успеет перетянуть лояльность городов, заручиться спонсорами и подготовить армию?',
  factions: {
    A: { name: 'Западный штаб (Гудаута)', color: '#3b82f6', manpower: 2700, weapons: 1200, supply: 680, pp: 110, missiles: 2, morale: 85, relations: { russia: 50, north_caucasus: 45, turkey: 25, georgia: 15, mediators: 45 } },
    B: { name: 'Восточный штаб (Сухум)', color: '#e15548', manpower: 2700, weapons: 1200, supply: 680, pp: 110, missiles: 2, morale: 85, relations: { russia: 25, north_caucasus: 25, turkey: 45, georgia: 45, mediators: 45 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','new_afon'],
    B: ['dranda','tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: { gudauta:{infantry:460,mountain:110,armor:10,artillery:7,aa:4,fort:0.20}, new_afon:{infantry:420,armor:8,artillery:6,fort:0.24}, gagra:{infantry:300,armor:6,fort:0.15}, dranda:{infantry:440,armor:10,artillery:7,aa:4,fort:0.20}, tkuarchal:{infantry:400,mountain:130,artillery:6,fort:0.28}, ochamchyra:{infantry:340,armor:8,fort:0.18} }
});
