"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'russian_peacekeepers',
  title: 'Северный щит (КПП Псоу)',
  tag: 'Асимметрия · РФ / БПЛА',
  difficulty: 'Сложный',
  crisisDays: 0,
  desc: 'Западный блок опирается на мощную логистику у Псоу, аэродром Гудауты и передовую группу поддержки РФ. Восточный блок превосходит в численности, БПЛА и удерживает Сухум с Ткуарчалом.',
  factions: {
    A: { name: 'Западный штаб (Гудаута)', color: '#3b82f6', manpower: 2400, weapons: 1650, supply: 800, pp: 80, missiles: 4, morale: 88, relations: { russia: 78, north_caucasus: 55, turkey: 15, georgia: 5, mediators: 25 } },
    B: { name: 'Восточный штаб (Сухум)', color: '#e15548', manpower: 3300, weapons: 1350, supply: 700, pp: 85, missiles: 2, morale: 84, relations: { russia: 15, north_caucasus: 20, turkey: 65, georgia: 55, mediators: 40 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','new_afon','gumista'],
    B: ['pskhu','shroma','sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: { psou:{infantry:340,armor:10,artillery:6,aa:4,fort:0.25}, gudauta:{infantry:420,armor:10,artillery:7,aa:4,fort:0.25}, gumista:{infantry:480,mountain:110,armor:8,fort:0.34}, sukhum:{infantry:500,mountain:110,armor:9,artillery:7,aa:4,fort:0.28}, dranda:{infantry:360,armor:8,artillery:6,fort:0.18}, tkuarchal:{infantry:320,mountain:120,fort:0.32}, gal:{infantry:320,armor:6,fort:0.15} }
});
