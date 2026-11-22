"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'mountain_shield',
  title: 'Хребет против Побережья',
  tag: 'Горы vs Море',
  difficulty: 'Асимметричный',
  crisisDays: 0,
  desc: 'Нестандартный раздел по высоте: Горная коалиция держит весь Главный Кавказский хребет, Рицу, Псху, Шрому, Кодор и Ткуарчал; Прибрежная лига контролирует все порты, шоссе и города у моря.',
  factions: {
    A: { name: 'Прибрежная лига портов', color: '#3b82f6', manpower: 2800, weapons: 1300, supply: 780, pp: 65, missiles: 2, morale: 83, relations: { russia: 45, north_caucasus: 15, turkey: 55, georgia: 35, mediators: 40 } },
    B: { name: 'Горная коалиция хребта', color: '#e15548', manpower: 2500, weapons: 1150, supply: 640, pp: 95, missiles: 3, morale: 92, relations: { russia: 30, north_caucasus: 70, turkey: 20, georgia: 35, mediators: 30 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','pitsunda','gudauta','new_afon','gumista','sukhum','gulrypsh','dranda','ochamchyra','gal','ingur'],
    B: ['bzypta','ritsa','auadkhara','lykhny','pskhu','shroma','tsebelda','lata','chkhalta','myku','tkuarchal']
  },
  garrisons: {
    ritsa:    { infantry: 220, mountain: 260, armor: 2, artillery: 5, aa: 3, drones: 6, fort: 0.35 },
    pskhu:    { infantry: 200, mountain: 240, armor: 0, artillery: 4, aa: 2, drones: 4, fort: 0.40 },
    shroma:   { infantry: 320, mountain: 260, armor: 4, artillery: 7, aa: 3, drones: 7, fort: 0.35 },
    tsebelda: { infantry: 300, mountain: 250, armor: 4, artillery: 6, aa: 3, drones: 6, fort: 0.32 },
    chkhalta: { infantry: 280, mountain: 280, armor: 2, artillery: 6, aa: 3, drones: 6, fort: 0.40 },
    tkuarchal:{ infantry: 360, mountain: 260, armor: 6, artillery: 8, aa: 4, drones: 7, fort: 0.42 },
    sukhum:   { infantry: 480, mountain: 90,  armor: 12, artillery: 7, aa: 4, drones: 9, fort: 0.18 },
    gudauta:  { infantry: 420, mountain: 80,  armor: 10, artillery: 6, aa: 4, drones: 8, fort: 0.15 }
  }
});
