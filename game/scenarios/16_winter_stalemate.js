"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'winter_stalemate',
  title: 'Позиционная зима в горах',
  tag: 'Окопная война',
  difficulty: 'Позиционный',
  crisisDays: 0,
  desc: 'Высокогорные перевалы занесены снегом, обе стороны глубоко окопались. Решают артиллерия, РЭБ, истощение боекомплекта и дипломатические прорывы.',
  factions: {
    A: { name: 'Западный штаб (Гудаута)', color: '#3b82f6', manpower: 2600, weapons: 1450, supply: 720, pp: 95, missiles: 3, morale: 82, relations: { russia: 50, north_caucasus: 40, turkey: 25, georgia: 15, mediators: 45 } },
    B: { name: 'Восточный штаб (Сухум)', color: '#e15548', manpower: 2600, weapons: 1450, supply: 720, pp: 95, missiles: 3, morale: 82, relations: { russia: 25, north_caucasus: 25, turkey: 45, georgia: 40, mediators: 45 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon','gumista'],
    B: ['shroma','sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: { gumista:{infantry:520,mountain:120,armor:8,artillery:8,aa:4,fort:0.48}, new_afon:{infantry:400,artillery:7,fort:0.42}, gudauta:{infantry:360,armor:8,aa:4,fort:0.30}, sukhum:{infantry:520,mountain:110,armor:8,artillery:8,aa:4,fort:0.46}, shroma:{infantry:360,mountain:130,artillery:7,fort:0.44}, tkuarchal:{infantry:320,mountain:120,artillery:6,fort:0.48} }
});
