"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};
window.AbkhaziaGame.SCENARIOS = window.AbkhaziaGame.SCENARIOS || [];
window.AbkhaziaGame.SCENARIOS.push({
  id: 'gal_ingur',
  title: 'Ингурский рубеж (Гал — Очамчыра)',
  tag: 'Южный театр',
  difficulty: 'Манёвренный',
  crisisDays: 0,
  desc: 'Южный фронт: равнинные коридоры Гала, Ингурского моста и Очамчырского порта идеально подходят для бронетехники и быстрых фланговых ударов.',
  factions: {
    A: { name: 'Северо-Центральный союз', color: '#3b82f6', manpower: 2600, weapons: 1120, supply: 660, pp: 70, missiles: 2, morale: 84, relations: { russia: 50, north_caucasus: 40, turkey: 30, georgia: 10, mediators: 30 } },
    B: { name: 'Южно-Восточный альянс',   color: '#e15548', manpower: 2650, weapons: 1220, supply: 740, pp: 75, missiles: 2, morale: 87, relations: { russia: 15, north_caucasus: 20, turkey: 50, georgia: 65, mediators: 45 } }
  },
  owners: {
    A: ['psou','tsandrypsh','gagra','bzypta','pitsunda','ritsa','auadkhara','lykhny','gudauta','pskhu','new_afon','gumista','shroma','sukhum','gulrypsh','tsebelda'],
    B: ['dranda','lata','chkhalta','myku','tkuarchal','ochamchyra','gal','ingur']
  },
  garrisons: {
    gulrypsh:  { infantry: 400, mountain: 90, armor: 10, artillery: 6, aa: 3, drones: 7, fort: 0.15 },
    dranda:    { infantry: 420, mountain: 80, armor: 11, artillery: 6, aa: 4, drones: 8, fort: 0.20 },
    ochamchyra:{ infantry: 480, mountain: 90, armor: 12, artillery: 7, aa: 4, drones: 8, fort: 0.22 },
    gal:       { infantry: 480, mountain: 80, armor: 12, artillery: 7, aa: 4, drones: 8, fort: 0.20 },
    ingur:     { infantry: 360, mountain: 60, armor: 8,  artillery: 5, aa: 3, drones: 6, fort: 0.25 }
  }
});
