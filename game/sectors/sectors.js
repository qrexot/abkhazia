"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};

window.AbkhaziaGame.TERRAINS = {
  urban:         { name: 'Городская застройка', defBonus: 0.35, armorMod: 0.85, mountainMod: 1.05, moveCost: 1.0 },
  coast:         { name: 'Прибрежная полоса',   defBonus: 0.10, armorMod: 1.25, mountainMod: 0.95, moveCost: 0.9 },
  valley:        { name: 'Долина / предгорье',  defBonus: 0.15, armorMod: 1.15, mountainMod: 1.00, moveCost: 1.0 },
  mountain:      { name: 'Горный район',        defBonus: 0.42, armorMod: 0.65, mountainMod: 1.35, moveCost: 1.4 },
  high_mountain: { name: 'Высокогорное ущелье', defBonus: 0.62, armorMod: 0.40, mountainMod: 1.55, moveCost: 1.8 },
  fortress:      { name: 'Горный укрепрайон',   defBonus: 0.55, armorMod: 0.55, mountainMod: 1.40, moveCost: 1.5 },
  bridgehead:    { name: 'Речной рубеж / мост', defBonus: 0.38, armorMod: 0.80, mountainMod: 1.05, moveCost: 1.2 },
  pass:          { name: 'Горный перевал',      defBonus: 0.48, armorMod: 0.55, mountainMod: 1.45, moveCost: 1.5 },
  crossing:      { name: 'Пограничный КПП',     defBonus: 0.25, armorMod: 1.10, mountainMod: 1.00, moveCost: 1.0 }
};

window.AbkhaziaGame.SECTORS = [
  {
    id: 'psou', name: 'КПП Псоу', abkhaz: 'Ԥсоу', region: 'west',
    x: 719.27, y: 699.46, terrain: 'crossing', vp: 5, manpower: 230, industry: 24,
    supplyHub: true, port: false, rail: true, borderWith: 'russia',
    adj: ['tsandrypsh']
  },
  {
    id: 'tsandrypsh', name: 'Цандрыпш', abkhaz: 'Цандрыԥшь', region: 'west',
    x: 770.64, y: 711.27, terrain: 'coast', vp: 2, manpower: 180, industry: 10,
    supplyHub: false, port: false, rail: true,
    adj: ['psou', 'gagra']
  },
  {
    id: 'gagra', name: 'Гагра', abkhaz: 'Гагра', region: 'west',
    x: 899.15, y: 796.75, terrain: 'urban', vp: 7, manpower: 470, industry: 30,
    supplyHub: true, port: true, rail: true, helipad: true, helipadName: 'Вертолётная пл. Гагра',
    adj: ['tsandrypsh', 'bzypta', 'ritsa']
  },
  {
    id: 'bzypta', name: 'Бзыбский узел', abkhaz: 'Бзыԥҭа', region: 'west',
    x: 980.41, y: 865.58, terrain: 'bridgehead', vp: 4, manpower: 260, industry: 15,
    supplyHub: false, port: false, rail: true,
    adj: ['gagra', 'pitsunda', 'ritsa', 'lykhny', 'gudauta']
  },
  {
    id: 'pitsunda', name: 'Пицунда', abkhaz: 'Пицунда', region: 'west',
    x: 956.66, y: 933.35, terrain: 'coast', vp: 4, manpower: 260, industry: 18,
    supplyHub: true, port: true,
    adj: ['bzypta', 'gudauta']
  },
  {
    id: 'ritsa', name: 'Озеро Рица', abkhaz: 'Риҵа', region: 'west',
    x: 1105.82, y: 612.70, terrain: 'high_mountain', vp: 2, manpower: 70, industry: 4,
    supplyHub: false, port: false, helipad: true, helipadName: 'Горная пл. Рица',
    adj: ['gagra', 'bzypta', 'auadkhara', 'lykhny']
  },
  {
    id: 'auadkhara', name: 'Ауадхара', abkhaz: 'Ауадҳара', region: 'west',
    x: 1181.53, y: 579.52, terrain: 'high_mountain', vp: 1, manpower: 50, industry: 3,
    supplyHub: false, port: false, borderWith: 'north_caucasus',
    adj: ['ritsa', 'pskhu']
  },
  {
    id: 'lykhny', name: 'Лыхны', abkhaz: 'Лыхны', region: 'west',
    x: 1159.44, y: 950.07, terrain: 'valley', vp: 2, manpower: 220, industry: 10,
    supplyHub: false, port: false,
    adj: ['bzypta', 'ritsa', 'gudauta', 'pskhu', 'new_afon']
  },
  {
    id: 'gudauta', name: 'Гудаута', abkhaz: 'Гәдоуҭа', region: 'west',
    x: 1165.84, y: 990.27, terrain: 'urban', vp: 8, manpower: 530, industry: 34,
    supplyHub: true, port: true, rail: true, airfield: true, airfieldName: 'Аэродром Бомбора', helipad: true, helipadName: 'Авиабаза Гудаута',
    adj: ['bzypta', 'pitsunda', 'lykhny', 'new_afon']
  },
  {
    id: 'pskhu', name: 'Псху', abkhaz: 'Ԥсҳәы', region: 'center',
    x: 1304.13, y: 709.77, terrain: 'high_mountain', vp: 2, manpower: 65, industry: 4,
    supplyHub: false, port: false, helipad: true, helipadName: 'Высокогорная пл. Псху',
    adj: ['auadkhara', 'lykhny', 'shroma', 'tsebelda']
  },
  {
    id: 'new_afon', name: 'Новый Афон', abkhaz: 'Афон Ҿыц', region: 'west',
    x: 1303.77, y: 1004.77, terrain: 'fortress', vp: 5, manpower: 290, industry: 18,
    supplyHub: false, port: false, rail: true,
    adj: ['gudauta', 'lykhny', 'gumista']
  },
  {
    id: 'gumista', name: 'Гумистинский мост', abkhaz: 'Гәымсҭа', region: 'center',
    x: 1421.50, y: 1073.14, terrain: 'bridgehead', vp: 5, manpower: 230, industry: 12,
    supplyHub: false, port: false, rail: true,
    adj: ['new_afon', 'shroma', 'sukhum']
  },
  {
    id: 'shroma', name: 'Шрома (Высоты)', abkhaz: 'Шрома', region: 'center',
    x: 1470.74, y: 1026.67, terrain: 'mountain', vp: 3, manpower: 140, industry: 7,
    supplyHub: false, port: false,
    adj: ['pskhu', 'gumista', 'sukhum', 'tsebelda']
  },
  {
    id: 'sukhum', name: 'Сухум', abkhaz: 'Аҟәа', region: 'center',
    x: 1453.61, y: 1089.51, terrain: 'urban', vp: 9, manpower: 640, industry: 38,
    supplyHub: true, port: true, rail: true, capital: true, helipad: true, helipadName: 'Штабная пл. Сухум',
    adj: ['gumista', 'shroma', 'gulrypsh']
  },
  {
    id: 'gulrypsh', name: 'Гулрыпш', abkhaz: 'Гәылрыԥшь', region: 'east',
    x: 1514.09, y: 1163.18, terrain: 'coast', vp: 3, manpower: 260, industry: 15,
    supplyHub: false, port: false, rail: true,
    adj: ['sukhum', 'dranda', 'tsebelda']
  },
  {
    id: 'dranda', name: 'Дранда (Аэродром)', abkhaz: 'Дранда', region: 'east',
    x: 1557.49, y: 1218.51, terrain: 'valley', vp: 4, manpower: 240, industry: 18,
    supplyHub: true, port: false, rail: true, airfield: true, airfieldName: 'Аэропорт Бабушара', helipad: true, helipadName: 'Вертолётная пл. Бабушара',
    adj: ['gulrypsh', 'tsebelda', 'myku', 'ochamchyra']
  },
  {
    id: 'tsebelda', name: 'Цебельда', abkhaz: 'Ҵабал', region: 'east',
    x: 1645.89, y: 1066.79, terrain: 'pass', vp: 3, manpower: 130, industry: 7,
    supplyHub: false, port: false,
    adj: ['pskhu', 'shroma', 'gulrypsh', 'dranda', 'lata']
  },
  {
    id: 'lata', name: 'Лата (Ниж. Кодор)', abkhaz: 'Лаҭа', region: 'east',
    x: 1788.80, y: 1060.05, terrain: 'mountain', vp: 3, manpower: 110, industry: 6,
    supplyHub: false, port: false,
    adj: ['tsebelda', 'chkhalta', 'myku']
  },
  {
    id: 'chkhalta', name: 'Чхалта (Кодор)', abkhaz: 'Чхалҭа', region: 'east',
    x: 1931.59, y: 998.78, terrain: 'high_mountain', vp: 5, manpower: 120, industry: 8,
    supplyHub: true, port: false, helipad: true, helipadName: 'Горная пл. Чхалта', borderWith: 'north_caucasus',
    adj: ['lata', 'tkuarchal']
  },
  {
    id: 'myku', name: 'Мыку (Отап)', abkhaz: 'Мықә', region: 'east',
    x: 1798.69, y: 1258.89, terrain: 'valley', vp: 2, manpower: 190, industry: 10,
    supplyHub: false, port: false,
    adj: ['dranda', 'lata', 'tkuarchal', 'ochamchyra']
  },
  {
    id: 'tkuarchal', name: 'Ткуарчал', abkhaz: 'Тҟәарчал', region: 'east',
    x: 1936.36, y: 1244.67, terrain: 'fortress', vp: 6, manpower: 310, industry: 24,
    supplyHub: true, port: false, rail: true, helipad: true, helipadName: 'Площадка Ткуарчал',
    adj: ['chkhalta', 'myku', 'ochamchyra', 'gal']
  },
  {
    id: 'ochamchyra', name: 'Очамчыра', abkhaz: 'Очамчыра', region: 'east',
    x: 1783.09, y: 1378.60, terrain: 'urban', vp: 5, manpower: 340, industry: 20,
    supplyHub: true, port: true, rail: true, helipad: true, helipadName: 'Прибрежная пл. Очамчыра',
    adj: ['dranda', 'myku', 'tkuarchal', 'gal']
  },
  {
    id: 'gal', name: 'Гал', abkhaz: 'Гал', region: 'east',
    x: 1976.13, y: 1460.96, terrain: 'urban', vp: 5, manpower: 390, industry: 20,
    supplyHub: true, port: false, rail: true, helipad: true, helipadName: 'Площадка Гал',
    adj: ['tkuarchal', 'ochamchyra', 'ingur']
  },
  {
    id: 'ingur', name: 'Ингурский мост', abkhaz: 'Егры', region: 'east',
    x: 2059.11, y: 1506.91, terrain: 'crossing', vp: 3, manpower: 120, industry: 14,
    supplyHub: true, port: false, rail: true, borderWith: 'georgia',
    adj: ['gal']
  }
];

window.AbkhaziaGame.SECTOR_MAP = Object.fromEntries(
  window.AbkhaziaGame.SECTORS.map(s => [s.id, s])
);

// Strategic bridges & narrow gorge chokepoints (river/canyon assault defense bonus + high demolition value)
window.AbkhaziaGame.BRIDGES = {
  psou__tsandrypsh:   { name: 'Мост через р. Псоу',       kind: 'bridge' },
  bzypta__gagra:      { name: 'Бзыбский авто/ж-д мост',   kind: 'bridge' },
  bzypta__ritsa:      { name: 'Юпшарский каньон',         kind: 'gorge'  },
  gumista__new_afon:  { name: 'Западный подход к Гумисте',kind: 'bridge' },
  gumista__sukhum:    { name: 'Гумистинский мост',        kind: 'bridge' },
  dranda__ochamchyra: { name: 'Кодорский мост',           kind: 'bridge' },
  lata__tsebelda:     { name: 'Кодорский тоннель / скалы',kind: 'gorge'  },
  myku__tkuarchal:    { name: 'Мост через р. Галидзга',   kind: 'bridge' },
  gal__ingur:         { name: 'Ингурский мост',           kind: 'bridge' }
};

// Naval corridors between major ports (allows amphibious landings & sea supply)
window.AbkhaziaGame.SEA_LINKS = [
  ['gagra', 'pitsunda'],
  ['pitsunda', 'gudauta'],
  ['gudauta', 'sukhum'],
  ['sukhum', 'ochamchyra'],
  ['pitsunda', 'sukhum'],
  ['gudauta', 'ochamchyra']
];

// Стратегические объекты в ключевых городах (дают ежедневный бонус и трофеи при захвате!)
window.AbkhaziaGame.SECTOR_FACILITIES = {
  psou:       { name: 'Северный коридор КПП Псоу и ЖД',  tag: 'КПП·ЖД',  dailyWp: 75,  dailyMp: 90, dailyPP: 3, lootWp: 160, desc: '+75 ОРУЖ и +90 Л/С в день · источник снабжения' },
  gagra:      { name: 'Логистический узел, порт и ВПП',  tag: 'ПОРТ·ЖД', dailyWp: 55,  dailyMp: 80, dailyPP: 2, lootWp: 140, desc: '+55 ОРУЖ и +80 Л/С/дн · порт и вертолёт. пл.' },
  pitsunda:   { name: 'Прибрежный радар ПВО и причал',   tag: 'РАДАР',   dailyWp: 40,  dailyMp: 40, dailyPP: 2, lootWp: 100, desc: '+40 ОРУЖ/дн · морской узел' },
  gudauta:    { name: 'Аэродром Бомбора и арсенал БК',   tag: 'АВИА·ЖД', dailyWp: 110, dailyMp: 70, dailyPP: 6, lootWp: 240, desc: 'Аэродром Бомбора + арсенал (+110 ОРУЖ, +6 ПО/дн)' },
  new_afon:   { name: 'Укреплённый командный рубеж',     tag: 'ФОРТ·ЖД', dailyWp: 40,  dailyMp: 55, dailyPP: 4, lootWp: 90,  desc: '+55% оборона · ЖД-станция · +4 ПО/дн' },
  sukhum:     { name: 'Правительственный квартал и порт',tag: 'ШТАБ·ЖД', dailyWp: 95,  dailyMp: 90, dailyPP: 7, lootWp: 260, desc: 'Столица · порт · ЖД-узел (+95 ОРУЖ и +7 ПО/дн)' },
  dranda:     { name: 'Аэропорт Бабушара и склад БТТ',   tag: 'АВИА·ЖД', dailyWp: 85,  dailyMp: 50, dailyPP: 3, lootWp: 210, desc: 'Аэродром Бабушара + склад БТТ (+85 ОРУЖ/дн)' },
  tkuarchal:  { name: 'Горно-промышленный арсенал',      tag: 'АРСЕНАЛ', dailyWp: 105, dailyMp: 60, dailyPP: 3, lootWp: 230, desc: 'Тоннельный арсенал + верт. пл. (+105 ОРУЖ/дн)' },
  ochamchyra: { name: 'Военно-морской порт и ЖД-узел',   tag: 'ПОРТ·ЖД', dailyWp: 90,  dailyMp: 70, dailyPP: 3, lootWp: 200, desc: 'Морской порт + ЖД-развязка (+90 ОРУЖ/дн)' },
  chkhalta:   { name: 'Горная база Кодорского ущелья',   tag: 'БАЗА·ВРТ',dailyWp: 50,  dailyMp: 60, dailyPP: 2, lootWp: 130, desc: 'Высокогорный склад + верт. пл. (+50 ОРУЖ/дн)' },
  gal:        { name: 'Энергоузел ИнгурГЭС и ЖД',        tag: 'ГЭС·ЖД',  dailyWp: 60,  dailyMp: 80, dailyPP: 5, lootWp: 150, desc: 'ИнгурГЭС · +5 ПО и +60 ОРУЖ/дн' },
  ingur:      { name: 'Южный транзитный коридор и ЖД',   tag: 'КПП·ЖД',  dailyWp: 70,  dailyMp: 65, dailyPP: 3, lootWp: 150, desc: '+70 ОРУЖ и +65 Л/С в день · источник снабжения' }
};
