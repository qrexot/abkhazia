"use strict";
window.AbkhaziaGame = window.AbkhaziaGame || {};

// 5 Внешних спонсоров: все пакеты полностью подключены к движку (ресурсы, орг., дух, спавн дивизий, relDelta, бонус за контроль коридора)
window.AbkhaziaGame.SPONSORS = [
  {
    id: 'russia',
    name: 'Россия',
    tag: 'Северный вектор',
    desc: 'Поставки вооружения, бронетехники, ПВО и ракет ОТРК. Контроль КПП Псоу даёт +20% к объёму поставок.',
    bonusSector: 'psou',
    packages: [
      { id: 'ru_arms',     name: 'Конвой БК',     short: '+340 ОРУЖ, +8% орг.',      costPP: 24, minRel: 20, grant: { weapons: 340, orgAll: 8 },              relDelta: 6 },
      { id: 'ru_armor',    name: 'Бронеколонна',  short: 'Танк. бригада + 180 ОРУЖ', costPP: 42, minRel: 45, grant: { weapons: 180, spawn: 'armor' },          relDelta: 8 },
      { id: 'ru_missiles', name: 'Дивизион ОТРК', short: '+3 ракеты ОТРК, +140 ОР',  costPP: 54, minRel: 65, grant: { missiles: 3, weapons: 140 },             relDelta: 5 }
    ]
  },
  {
    id: 'georgia',
    name: 'Грузия',
    tag: 'Южный вектор',
    desc: 'Поставки вооружения, БПЛА, ПВО и контрактников. Контроль Ингурского моста даёт +20% к объёму поставок.',
    bonusSector: 'ingur',
    packages: [
      { id: 'ge_supply',     name: 'Южный транзит', short: '+280 ОРУЖ, +10% орг.',    costPP: 22, minRel: 20, grant: { weapons: 280, orgAll: 10 },              relDelta: 6 },
      { id: 'ge_drones',     name: 'ЗРК и БПЛА',    short: 'ЗРК ПВО + 180 ОРУЖ',      costPP: 38, minRel: 45, grant: { weapons: 180, spawn: 'aa' },             relDelta: 7 },
      { id: 'ge_volunteers', name: 'Южный корпус',  short: '+420 Л/С, +2 ракеты ОТРК',costPP: 50, minRel: 65, grant: { manpower: 420, missiles: 2, weapons: 120 }, relDelta: 5 }
    ]
  },
  {
    id: 'north_caucasus',
    name: 'Северный Кавказ',
    tag: 'Горные добровольцы',
    desc: 'Добровольческие отряды, опытные в горной войне. Контроль Ауадхары даёт +20% к объёму поставок.',
    bonusSector: 'auadkhara',
    packages: [
      { id: 'nc_volunteers',    name: 'Добровольцы',   short: '+420 Л/С, +6% дух',        costPP: 22, minRel: 15, grant: { manpower: 420, morale: 6 },              relDelta: 8 },
      { id: 'nc_mountain_gear', name: 'Горный отряд',  short: 'Горные егеря + 140 ОРУЖ',  costPP: 36, minRel: 40, grant: { weapons: 140, spawn: 'mountain' },       relDelta: 6 },
      { id: 'nc_battalion',     name: 'Горный бат.',   short: '+550 Л/С + РСЗО «Град»',   costPP: 52, minRel: 65, grant: { manpower: 550, spawn: 'artillery' },     relDelta: 6 }
    ]
  },
  {
    id: 'turkey',
    name: 'Турция',
    tag: 'Черноморский вектор',
    desc: 'Морские поставки БПЛА, снаряжения и ДРГ через порты. Контроль Сухума даёт +20% к объёму поставок.',
    bonusSector: 'sukhum',
    packages: [
      { id: 'tr_trade',    name: 'Морской конвой', short: '+260 ОРУЖ, +10% орг.',     costPP: 22, minRel: 20, grant: { weapons: 260, orgAll: 10 },              relDelta: 7 },
      { id: 'tr_uav',      name: 'Отряд БПЛА/ДРГ', short: 'Группа ДРГ + 180 ОРУЖ',    costPP: 40, minRel: 45, grant: { weapons: 180, spawn: 'sof' },            relDelta: 8 },
      { id: 'tr_missiles', name: 'ОТРК и ПВО',     short: '+2 ракеты + ЗРК ПВО',      costPP: 54, minRel: 65, grant: { missiles: 2, spawn: 'aa' },              relDelta: 5 }
    ]
  },
  {
    id: 'mediators',
    name: 'Посредники / ООН',
    tag: 'Дипломатический канал',
    desc: 'Гуманитарные конвои, рост боевого духа, восстановление организации и политического веса.',
    bonusSector: null,
    packages: [
      { id: 'un_aid',      name: 'Гумконвой',      short: '+220 Л/С, +8% дух, +10% орг.', costPP: 18, minRel: 10, grant: { manpower: 220, morale: 8, orgAll: 10 }, relDelta: 8 },
      { id: 'un_pressure', name: 'Дипломат. пакет',short: '+45 ПО, +10% боевой дух',      costPP: 30, minRel: 35, grant: { pp: 45, morale: 10 },                   relDelta: 6 }
    ]
  }
];

window.AbkhaziaGame.TREATIES = {
  ceasefire_3: {
    id: 'ceasefire_3',
    name: 'Заморозка фронта (3 дня)',
    desc: 'Останавливает боевые действия и удары на 3 дня. Стороны восстанавливают организацию и окапываются.',
    durationDays: 3,
    costPP: 15
  },
  ceasefire_5: {
    id: 'ceasefire_5',
    name: 'Перемирие (5 дней)',
    desc: 'Пятидневная деэскалация по текущей линии соприкосновения.',
    durationDays: 5,
    costPP: 22
  },
  demilitarize_border: {
    id: 'demilitarize_border',
    name: 'Запрет ударов (2 дня)',
    desc: 'На 2 дня запрещает ракетные, авиа- и дроновые удары для обеих сторон, оставляя только наземные манёвры.',
    durationDays: 2,
    costPP: 12
  },
  demarcation_5: {
    id: 'demarcation_5',
    name: 'Демаркационная линия МС (5 дней)',
    desc: 'Вводит миротворцев и буферную зону на 5 дней по текущей линии соприкосновения.',
    durationDays: 5,
    costPP: 25
  },
  peace_treaty: {
    id: 'peace_treaty',
    name: 'Мирное соглашение (Финал)',
    desc: 'Завершает кампанию (доступно с 12-го дня) и фиксирует победу по очкам контроля.',
    durationDays: 0,
    costPP: 30
  }
};
