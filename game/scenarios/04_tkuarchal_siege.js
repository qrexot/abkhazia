"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'tkuarchal_siege',
  title: 'Блокада Ткуарчала (413 дней)',
  tag: 'Блокада · Выживание',
  category: 'blockade',
  difficulty: 'Высокий',
  crisisDays: 0,
  desc: 'Жёсткая позиционная осада шахтёрского Ткуарчала в глубоком тылу Востока. В городе 12 400 мирных жителей и укрепрайон в горных тоннелях: гарнизон не может идти в наступление, но вылазки ДРГ срывают тыл Востока, а вертолётный мост из Гудауты держит город живым. Восток должен сжать кольцо, разбить тоннели и взять крепость.',
  factions: {
    A: { name: 'Гудаута и гарнизон Ткуарчала', color: '#3b82f6', manpower: 2550, weapons: 1180, supply: 640, pp: 95, missiles: 2, morale: 92, relations: { russia: 58, north_caucasus: 60, turkey: 20, georgia: 10, mediators: 42 } },
    B: { name: 'Восточное кольцо блокады',     color: '#e15548', manpower: 3100, weapons: 1380, supply: 740, pp: 80, missiles: 3, morale: 84, relations: { russia: 22, north_caucasus: 20, turkey: 50, georgia: 52, mediators: 34 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon','gumista','tkuarchal'],
    B: ['shroma','sukhum','gulrypsh','dranda','tsebelda','lata','chkhalta','myku','ochamchyra','gal','ingur']
  },
  garrisons: {
    tkuarchal: { infantry: 480, mountain: 260, armor: 0,  artillery: 0, aa: 5, drones: 2, fort: 0.55 },
    gumista:   { infantry: 420, mountain: 120, armor: 8,  artillery: 6, aa: 4, drones: 4, fort: 0.34 },
    gudauta:   { infantry: 340, mountain: 100, armor: 8,  artillery: 6, aa: 4, drones: 6, fort: 0.18 },
    ochamchyra:{ infantry: 440, mountain: 120, armor: 10, artillery: 8, aa: 5, drones: 6, fort: 0.18 },
    myku:      { infantry: 320, mountain: 140, armor: 6,  artillery: 6, aa: 0, drones: 4, fort: 0.22 },
    gal:       { infantry: 380, mountain: 100, armor: 8,  artillery: 6, aa: 4, drones: 4, fort: 0.16 },
    chkhalta:  { infantry: 240, mountain: 140, armor: 0,  artillery: 0, aa: 0, drones: 2, fort: 0.28 },
    sukhum:    { infantry: 420, mountain: 95,  armor: 8,  artillery: 6, aa: 4, drones: 6, fort: 0.26 }
  }
});
