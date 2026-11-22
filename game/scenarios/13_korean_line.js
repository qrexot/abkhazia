"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'korean_line',
  title: 'Гумистинская демаркация',
  tag: 'Буферная зона · МС',
  difficulty: 'Тактический',
  crisisDays: 0,
  startCeasefireDays: 5,
  startDemarcation: true,
  desc: 'Временная линия разграничения по типу 38-й параллели вдоль реки Гумиста. Миротворческий контингент держит буфер 5 дней — обе стороны копят силы, ведут разведку и готовят решающий удар.',
  factions: {
    A: { name: 'Западный штаб (Гудаута)', color: '#3b82f6', manpower: 2900, weapons: 1350, supply: 720, pp: 90, missiles: 3, morale: 85, relations: { russia: 58, north_caucasus: 45, turkey: 20, georgia: 10, mediators: 45 } },
    B: { name: 'Восточный штаб (Сухум)', color: '#e15548', manpower: 2900, weapons: 1350, supply: 720, pp: 90, missiles: 3, morale: 85, relations: { russia: 22, north_caucasus: 25, turkey: 52, georgia: 45, mediators: 48 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon','gumista'],
    B: ['shroma','sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: { gumista:{infantry:500,mountain:120,armor:10,artillery:7,aa:4,fort:0.42}, new_afon:{infantry:360,armor:8,artillery:6,fort:0.30}, gudauta:{infantry:360,mountain:100,armor:8,aa:4,fort:0.18}, sukhum:{infantry:500,mountain:110,armor:10,artillery:7,aa:4,fort:0.38}, shroma:{infantry:340,mountain:120,artillery:6,fort:0.32}, dranda:{infantry:320,armor:8,artillery:4,fort:0.18}, tkuarchal:{infantry:280,mountain:110,fort:0.30} }
});
