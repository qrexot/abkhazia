"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};

// 8 Specialized Division / Battalion Classes (Combined Arms)
window.AbkhaziaGame.UNIT_TEMPLATES = {
  infantry: {
    id: 'infantry', name: 'Мотострелковый полк', short: 'ПЕХ', role: 'Фронт',
    maxHp: 1200, atk: 12, def: 16, speed: 34, costMp: 450, costWp: 200, airliftable: true,
    desc: 'Надёжная основа линии фронта. Держит города и переправы, может перебрасываться по ЖД и вертолётами.'
  },
  mountain: {
    id: 'mountain', name: 'Горные егеря', short: 'ГОР', role: 'Горы',
    maxHp: 900, atk: 16, def: 21, speed: 32, costMp: 380, costWp: 290, airliftable: true,
    desc: 'Элита для Кодора, Чхалты, Рицы, Псху и Ткуарчала. Проходит высокогорье и может перебрасываться вертолётами.'
  },
  armor: {
    id: 'armor', name: 'Танковая бригада', short: 'БРН', role: 'Прорыв',
    maxHp: 800, atk: 27, def: 16, speed: 50, costMp: 240, costWp: 440,
    desc: 'Мощный броневой прорыв вдоль побережья и шоссе, быстро перебрасывается эшелонами по ЖД.'
  },
  artillery: {
    id: 'artillery', name: 'Дивизион РСЗО «Град»', short: 'АРТ', role: 'Огонь',
    maxHp: 550, atk: 24, def: 8, speed: 28, costMp: 190, costWp: 380,
    supportRadius: 155,
    desc: 'Автоматически поддерживает огнём все союзные бои в радиусе 155, подавляет оборону и переправы.'
  },
  aa: {
    id: 'aa', name: 'Комплекс ПВО (ЗРК)', short: 'ПВО', role: 'Защита',
    maxHp: 500, atk: 6, def: 13, speed: 30, costMp: 160, costWp: 360,
    radarRadius: 175,
    desc: 'Создаёт защитный купол ПВО (радиус 175) — перехватывает ракеты, БПЛА, авиацию и вертолётные десанты.'
  },
  marines: {
    id: 'marines', name: 'Морская пехота', short: 'МП', role: 'Десант',
    maxHp: 950, atk: 18, def: 15, speed: 42, costMp: 360, costWp: 340,
    amphibious: true, airliftable: true,
    desc: 'Перебрасывается морем между портами (Гагра, Пицунда, Гудаута, Сухум, Очамчыра) в обход взорванных мостов.'
  },
  sof: {
    id: 'sof', name: 'Группа ДРГ / Спецназ', short: 'ДРГ', role: 'Рейд',
    maxHp: 500, atk: 20, def: 12, speed: 62, costMp: 180, costWp: 320, airliftable: true,
    desc: 'Сверхбыстрая диверсионная группа. Проходит высокогорье, режет тыловые коммуникации и летает на вертолётах.'
  },
  engineering: {
    id: 'engineering', name: 'Инженерно-сапёрный бат.', short: 'ИНЖ', role: 'Форт',
    maxHp: 700, atk: 10, def: 24, speed: 30, costMp: 260, costWp: 280,
    desc: 'Без потерь снимает мины, восстанавливает взорванные мосты/ЖД/аэродромы и строит укрепрайоны (+60% обор.).'
  }
};

// 10 Tactical & Strategic Special Operations
window.AbkhaziaGame.STRIKES = {
  artillery_barrage: {
    id: 'artillery_barrage', name: 'Артиллерийский вал', short: 'Арт-вал',
    desc: 'Массированный обстрел квадрата: сносит окопы (−28%), бьёт по блокпостам и подавляет организацию врага.',
    costWp: 85, costPP: 8, costMissiles: 0, radius: 115,
    hpDmgPct: 0.14, orgDmg: 22, fortDmg: 0.28, infraDmg: 15, aaCounterable: false, color: '#f59e0b'
  },
  drone_swarm: {
    id: 'drone_swarm', name: 'Рой БПЛА-камикадзе', short: 'Рой БПЛА',
    desc: 'Точечная охота за бронетехникой, артиллерией и вертолётными площадками. Контрится ПВО.',
    costWp: 110, costPP: 12, costMissiles: 0, radius: 110,
    hpDmgPct: 0.22, orgDmg: 18, fortDmg: 0.10, infraDmg: 30, aaCounterable: true, color: '#fb923c'
  },
  missile_strike: {
    id: 'missile_strike', name: 'Ракетный удар (ОТРК)', short: 'ОТРК',
    desc: 'Высокоточный удар по штабам, ВПП аэродромов, ЖД-узлам и мостам (может вывести аэродром/мост из строя!).',
    costWp: 140, costPP: 18, costMissiles: 1, radius: 135,
    hpDmgPct: 0.30, orgDmg: 34, fortDmg: 0.40, infraDmg: 58, canDestroyBridge: true, aaCounterable: true, color: '#ef4444'
  },
  airstrike: {
    id: 'airstrike', name: 'Штурмовой авианалёт', short: 'Авиаудар',
    desc: 'Требует исправный аэродром (Бомбора или Бабушара). Тяжёлый урон войскам, мостам и ВПП врага. Контрится ПВО.',
    requiresAirfield: true, costWp: 125, costPP: 15, costMissiles: 0, radius: 130,
    hpDmgPct: 0.26, orgDmg: 28, fortDmg: 0.24, infraDmg: 48, canDestroyBridge: true, aaCounterable: true, color: '#f97316'
  },
  ew_jamming: {
    id: 'ew_jamming', name: 'РЭБ: Подавление связи', short: 'РЭБ',
    desc: 'Глушит связь и дроны противника в большом радиусе — резко роняет организацию и скорость на 2 дня.',
    costWp: 60, costPP: 14, costMissiles: 0, radius: 190,
    hpDmgPct: 0.02, orgDmg: 38, fortDmg: 0.0, aaCounterable: false, isEW: true, jamDays: 2, color: '#a855f7'
  },
  sabotage_logistics: {
    id: 'sabotage_logistics', name: 'Подрыв мостов и ЖД (ДРГ)', short: 'Подрыв',
    desc: 'Диверсия на ближайшей переправе/дороге: взрывает мост и ЖД-путь (перекрывает движение и снабжение!).',
    costWp: 70, costPP: 16, costMissiles: 0, radius: 140,
    hpDmgPct: 0.08, orgDmg: 24, fortDmg: 0.30, infraDmg: 35, isSabotage: true, canDestroyBridge: true, jamDays: 2, aaCounterable: false, color: '#eab308'
  },
  naval_raid: {
    id: 'naval_raid', name: 'Морская диверсия / блокада порта', short: 'Блокада',
    costWp: 150, costPP: 16, costMissiles: 0, radius: 95,
    hpDmgPct: 0.10, orgDmg: 22, fortDmg: 0.08, infraDmg: 50, isNavalRaid: true, requiresCoast: true,
    aaCounterable: false, color: '#0ea5e9',
    desc: 'Атака морских дронов по порту и берегу: повреждает порт, сжигает −220 ОРУЖ и бьёт по частям у берега.'
  },
  psyops: {
    id: 'psyops', name: 'ИПсО и радиоперехват', short: 'ИПсО',
    costWp: 60, costPP: 18, costMissiles: 0, radius: 135,
    hpDmgPct: 0.0, orgDmg: 26, fortDmg: 0.0, isPsyops: true,
    aaCounterable: false, color: '#ec4899',
    desc: 'Информационная операция: снижает организацию врага в зоне на −26% и боевой дух на −6%.'
  },
  medevac: {
    id: 'medevac', name: 'Вертолётная эвакуация и БК', short: 'Ротация',
    costWp: 90, costPP: 12, costMissiles: 0, radius: 120,
    requiresHelipad: true, hpDmgPct: 0.0, orgDmg: 0, fortDmg: 0.0, isFriendlyHeal: true,
    aaCounterable: false, color: '#22c55e',
    desc: 'Требует исправную вертолётную площадку/аэродром. Подвоз БК и эвакуация своим частям (+18% ХП, +24% орг., спасает окружённых).'
  },
  air_drop: {
    id: 'air_drop', name: 'Вертолётный десант ДРГ', short: 'Десант',
    desc: 'Требует исправную вертолётную площадку/аэродром. Высаживает группу ДРГ в любую точку (контрится ПВО).',
    requiresHelipad: true, costWp: 340, costPP: 24, costMissiles: 0, radius: 50,
    isDrop: true, aaCounterable: true, color: '#38bdf8'
  }
};

// 5 Strategic National Decisions (with cooldowns)
window.AbkhaziaGame.DECISIONS = [
  { id: 'dec_mob',   name: 'Мобилизация резерва',     costPP: 25, cdDays: 5, desc: '+1 100 Л/С в резерв штаба.',               effect: f => { f.manpower += 1100; } },
  { id: 'dec_ammo',  name: 'Экстренный выпуск БК',    costPP: 25, cdDays: 4, desc: '+520 единиц вооружения и техники.',        effect: f => { f.weapons += 520; } },
  { id: 'dec_forts', name: 'Линия обороны (инж.)',    costPP: 30, cdDays: 6, desc: '+18% укреплений всем своим дивизиям.',     effect: 'fortAll' },
  { id: 'dec_rally', name: 'Военное положение',       costPP: 20, cdDays: 6, desc: '+18% организации всем армиям и +12% духа.',effect: 'rallyAll' },
  { id: 'dec_otrk',  name: 'Закупка ракет ОТРК',      costPP: 45, cdDays: 7, desc: '+2 баллистические ракеты и +200 ОРУЖ.',    effect: f => { f.missiles += 2; f.weapons += 200; } }
];

// 4 Military Doctrines
window.AbkhaziaGame.DOCTRINES = {
  balanced:         { id: 'balanced',         name: 'Общевойсковая',  costPP: 0,  desc: 'Сбалансированный бой всех родов войск.' },
  mountain_warfare: { id: 'mountain_warfare', name: 'Горная война',   costPP: 35, desc: '+30% в горах и ущельях (Кодор, Рица, Ткуарчал).' },
  mobile_armor:     { id: 'mobile_armor',     name: 'Бронекулак',     costPP: 35, desc: '+25% скорость марша и +30% удар бронетехники.' },
  fortress_aa:      { id: 'fortress_aa',      name: 'Крепость и ПВО', costPP: 35, desc: '+22% защита городов/укрепрайонов и +20% перехват ПВО.' }
};
