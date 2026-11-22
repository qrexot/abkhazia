"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'coast_vs_mountains',
  title: 'Побережье против хребта',
  tag: 'Нестандартный фронт',
  difficulty: 'Сложный',
  crisisDays: 0,
  desc: 'Западный штаб контролирует прибрежную магистраль до самого Сухума и порты, но Восточный штаб удерживает все горные крепости — Кодор, Ткуарчал, Цебельду, Шрому и Псху.',
  factions: {
    A: { name: 'Прибрежный штаб (Гудаута)', color: '#3b82f6', manpower: 2800, weapons: 1400, supply: 750, pp: 80, missiles: 2, morale: 84, relations: { russia: 50, north_caucasus: 30, turkey: 30, georgia: 15, mediators: 35 } },
    B: { name: 'Горно-Восточный штаб (Ткуарчал)', color: '#e15548', manpower: 2700, weapons: 1350, supply: 680, pp: 85, missiles: 2, morale: 88, relations: { russia: 30, north_caucasus: 60, turkey: 45, georgia: 35, mediators: 30 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','lykhny','gudauta','new_afon','gumista','sukhum','gulrypsh'],
    B: ['ritsa','auadkhara','pskhu','shroma','tsebelda','lata','chkhalta','dranda','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: { sukhum:{infantry:460,armor:10,artillery:7,aa:4,fort:0.26}, gudauta:{infantry:380,armor:8,artillery:6,aa:4,fort:0.20}, gagra:{infantry:320,armor:6,fort:0.18}, shroma:{infantry:360,mountain:140,artillery:6,fort:0.35}, tsebelda:{infantry:320,mountain:130,fort:0.32}, tkuarchal:{infantry:400,mountain:150,artillery:7,aa:4,fort:0.38}, dranda:{infantry:360,armor:8,artillery:6,fort:0.22}, ochamchyra:{infantry:320,armor:8,fort:0.20} }
});
