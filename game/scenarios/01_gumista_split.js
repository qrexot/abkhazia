"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'gumista_split',
  title: 'Раскол по Гумисте и блокада Ткуарчала',
  tag: 'Классика · Блокада',
  category: 'blockade',
  difficulty: 'Сбалансированный',
  crisisDays: 0,
  desc: 'Главный исторический расклад: фронт проходит по Гумисте, а шахтёрский Ткуарчал держится в полной блокаде в тылу Востока. Гарнизон заперт в горах, но совершает дерзкие вылазки ДРГ, воруя БК и продовольствие. Задача Востока — дожать блокаду и сломить тоннели; задача Запада — прорваться к городу и удержать воздушный мост.',
  factions: {
    A: { name: 'Западный штаб (Гудаута)', color: '#3b82f6', manpower: 2800, weapons: 1250, supply: 700, pp: 80, missiles: 2, morale: 88, relations: { russia: 52, north_caucasus: 48, turkey: 22, georgia: 10, mediators: 32 } },
    B: { name: 'Восточный штаб (Сухум)',  color: '#e15548', manpower: 2800, weapons: 1260, supply: 700, pp: 80, missiles: 2, morale: 85, relations: { russia: 24, north_caucasus: 25, turkey: 48, georgia: 46, mediators: 35 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon','gumista','tkuarchal'],
    B: ['shroma','sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','ochamchyra','gal','ingur']
  },
  garrisons: {
    gumista:   { infantry: 520, mountain: 120, armor: 10, artillery: 7, aa: 4, drones: 6, fort: 0.36 },
    new_afon:  { infantry: 420, mountain: 110, armor: 8,  artillery: 6, aa: 2, drones: 5, fort: 0.28 },
    gudauta:   { infantry: 380, mountain: 100, armor: 8,  artillery: 6, aa: 4, drones: 8, fort: 0.16 },
    gagra:     { infantry: 280, mountain: 80,  armor: 5,  artillery: 3, aa: 2, drones: 4, fort: 0.12 },
    tkuarchal: { infantry: 360, mountain: 180, armor: 0,  artillery: 0, aa: 4, drones: 2, fort: 0.50 },
    sukhum:    { infantry: 460, mountain: 100, armor: 9,  artillery: 7, aa: 4, drones: 8, fort: 0.28 },
    shroma:    { infantry: 300, mountain: 110, armor: 4,  artillery: 5, aa: 2, drones: 4, fort: 0.24 },
    dranda:    { infantry: 300, mountain: 60,  armor: 8,  artillery: 4, aa: 3, drones: 6, fort: 0.14 },
    ochamchyra:{ infantry: 320, mountain: 100, armor: 6,  artillery: 6, aa: 4, drones: 4, fort: 0.16 },
    myku:      { infantry: 240, mountain: 100, armor: 0,  artillery: 0, aa: 0, drones: 2, fort: 0.18 },
    gal:       { infantry: 280, mountain: 80,  armor: 6,  artillery: 0, aa: 0, drones: 2, fort: 0.14 }
  }
});
