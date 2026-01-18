/**
 * Neon Arcana - Общие константы игры
 * Этот файл используется и клиентом, и сервером
 */

// ===========================================
// ИГРОВОЙ ЦИКЛ
// ===========================================

/** Количество тиков игровой логики в секунду */
export const TICK_RATE = 20;

/** Длительность одного тика в миллисекундах */
export const TICK_DURATION_MS = 1000 / TICK_RATE;

/** Длительность одного тика в секундах */
export const TICK_DURATION_SEC = 1 / TICK_RATE;

/** Целевой FPS для рендеринга */
export const TARGET_FPS = 60;

// ===========================================
// РАЗМЕРЫ КАРТЫ И CANVAS
// ===========================================

/** Ширина игрового поля */
export const GAME_WIDTH = 1280;

/** Высота игрового поля */
export const GAME_HEIGHT = 720;

// ===========================================
// ДЛИТЕЛЬНОСТЬ МАТЧА
// ===========================================

/** Длительность матча в секундах (15 минут) */
export const MATCH_DURATION_SEC = 15 * 60;

/** Время начала Escalation (после 10 минуты) */
export const ESCALATION_START_SEC = 10 * 60;

/** Бонус урона по башням за минуту после escalation (%) */
export const ESCALATION_TOWER_DAMAGE_BONUS = 2;

// ===========================================
// ЭКОНОМИКА
// ===========================================

/** Стартовое количество эфира */
export const STARTING_ETHER = 100;

/** Базовый пассивный доход эфира в секунду */
export const PASSIVE_INCOME_PER_SEC = 5;

/** Доход за нанесение 100 HP урона башне */
export const ETHER_PER_TOWER_DAMAGE = 2;

/** Штраф к доходу для лидера (%) */
export const LEADER_INCOME_PENALTY = 20;

/** Бонус к доходу для отстающего (%) */
export const UNDERDOG_INCOME_BONUS = 30;

/** Бонус к доходу при критическом HP башни (< 30%) */
export const CRITICAL_HP_INCOME_BONUS = 50;

/** Время без агрессии для штрафа к доходу (сек) */
export const AGGRESSION_TIMEOUT_SEC = 60;

/** Штраф к доходу за отсутствие агрессии (%) */
export const NO_AGGRESSION_PENALTY = 30;

// ===========================================
// БАШНИ
// ===========================================

export const TOWER_CONFIG = {
  /** Базовое HP главной башни */
  BASE_HP: 1000,

  /** DPS главной башни (базовый) */
  BASE_DPS: 15,

  /** Радиус атаки башни */
  ATTACK_RANGE: 150,

  /** Размер башни (для рендеринга и коллизий) */
  SIZE: 60,

  /** Уровни улучшения башни [HP, DPS, стоимость, время улучшения в сек] */
  UPGRADES: [
    { level: 1, hp: 1000, dps: 15, cost: 0, upgradeTime: 0 },
    { level: 2, hp: 1400, dps: 20, cost: 150, upgradeTime: 5 },
    { level: 3, hp: 1900, dps: 25, cost: 300, upgradeTime: 7 },
    { level: 4, hp: 2500, dps: 30, cost: 500, upgradeTime: 10 },
  ],
} as const;

// ===========================================
// ВСПОМОГАТЕЛЬНЫЕ БАШНИ
// ===========================================

export const SUPPORT_TOWER_CONFIG = {
  /** Максимальное количество вспомогательных башен */
  MAX_COUNT: 3,

  /** Типы вспомогательных башен */
  TYPES: {
    DEFENSIVE: {
      name: "Оборонительная",
      hp: 400,
      dps: 25,
      cost: 120,
      buildTime: 5,
      attackRange: 120,
    },
    BUFF: {
      name: "Усиливающая",
      hp: 300,
      dps: 0,
      cost: 100,
      buildTime: 5,
      buffRange: 100,
      damageBonus: 20, // %
    },
    ECONOMIC: {
      name: "Экономическая",
      hp: 250,
      dps: 0,
      cost: 150,
      buildTime: 5,
      incomeBonus: 2, // эфир/сек
    },
  },
} as const;

// ===========================================
// ЮНИТЫ
// ===========================================

/** Типы юнитов */
export enum UnitType {
  SCOUT = "scout",
  TANK = "tank",
  RANGER = "ranger",
  SUPPORT = "support",
}

/** Конфигурация юнитов */
export const UNIT_CONFIG = {
  [UnitType.SCOUT]: {
    name: "Разведчик",
    hp: 50,
    dps: 15,
    speed: 150, // % от базовой скорости
    cost: 20,
    range: 32, // ближний бой (увеличено на 2 для теста)
    visionRange: 200, // радиус видимости (большой для разведки)
    unlocked: true, // доступен с начала
    unlockCost: 0,
  },
  [UnitType.TANK]: {
    name: "Танк",
    hp: 200,
    dps: 20,
    speed: 70,
    cost: 50,
    range: 37, // ближний бой (увеличено на 2 для теста)
    visionRange: 100,
    unlocked: true,
    unlockCost: 0,
    tauntChance: 70, // % шанс, что враги атакуют танка
  },
  [UnitType.RANGER]: {
    name: "Стрелок",
    hp: 70,
    dps: 30,
    speed: 100,
    cost: 40,
    range: 152, // дальний бой (увеличено на 2 для теста)
    visionRange: 150,
    unlocked: false,
    unlockCost: 80,
    unlockTime: 10, // секунд на исследование
  },
  [UnitType.SUPPORT]: {
    name: "Поддержка",
    hp: 80,
    dps: 10,
    speed: 100,
    cost: 45,
    range: 82, // средняя дистанция (увеличено на 2 для теста)
    visionRange: 120,
    unlocked: false,
    unlockCost: 100,
    unlockTime: 10,
    healPerSec: 15, // лечение союзников
    healRange: 80,
  },
} as const;

/** Базовая скорость движения (пикселей в секунду) */
export const BASE_MOVEMENT_SPEED = 80;

/** Размер юнита (для рендеринга и коллизий) */
export const UNIT_SIZE = 20;

/** Максимум юнитов в активном бою с каждой стороны */
export const MAX_UNITS_IN_COMBAT = 8;

// ===========================================
// СИСТЕМА КОНТР-ПИКОВ
// ===========================================

/** Бонусы урона при контр-пике (множитель) */
export const COUNTER_BONUSES: Record<
  UnitType,
  Partial<Record<UnitType, number>>
> = {
  [UnitType.SCOUT]: {
    [UnitType.RANGER]: 1.3, // +30% урона по стрелкам
  },
  [UnitType.TANK]: {
    [UnitType.SCOUT]: 1.2, // +20% урона по разведчикам
  },
  [UnitType.RANGER]: {
    [UnitType.TANK]: 1.25, // +25% урона по танкам
  },
  [UnitType.SUPPORT]: {}, // поддержка не имеет бонусов
};

// ===========================================
// УЛУЧШЕНИЯ ЮНИТОВ
// ===========================================

/** Максимальный уровень улучшения */
export const MAX_UPGRADE_LEVEL = 3;

/** Бонус за уровень улучшения HP (%) */
export const HP_UPGRADE_BONUS = 15;

/** Бонус за уровень улучшения урона (%) */
export const DPS_UPGRADE_BONUS = 15;

/** Бонус за уровень улучшения скорости (%) */
export const SPEED_UPGRADE_BONUS = 10;

/** Базовая стоимость улучшения */
export const BASE_UPGRADE_COST = 60;

/** Прирост стоимости за каждый уровень */
export const UPGRADE_COST_INCREMENT = 20;

// ===========================================
// РЕСУРСНЫЕ ТОЧКИ
// ===========================================

export const RESOURCE_POINT_CONFIG = {
  /** Кристаллическая шахта (центр карты) */
  CRYSTAL_MINE: {
    name: "Кристаллическая шахта",
    incomePerSec: 5,
    guardianCount: 3,
    guardianHp: 80,
    guardianDps: 10,
    respawnTime: 45, // секунд
    maxGuards: 4, // максимум охранников игрока
    guardRegenPerSec: 5, // регенерация HP охранников
  },

  /** Малый кристалл (ближе к башням) */
  SMALL_CRYSTAL: {
    name: "Малый кристалл",
    incomePerSec: 2,
    guardianCount: 1,
    guardianHp: 50,
    guardianDps: 8,
    respawnTime: 45,
    maxGuards: 4,
    guardRegenPerSec: 5,
  },

  /** Нейтральный лагерь (единоразовый бонус) */
  NEUTRAL_CAMP: {
    name: "Нейтральный лагерь",
    oneTimeBonus: 20,
    guardianCount: 2,
    guardianHp: 60,
    guardianDps: 12,
    respawnTime: 45,
    maxGuards: 0, // нельзя оставить охрану
    guardRegenPerSec: 0,
  },
} as const;

// ===========================================
// ПРЕПЯТСТВИЯ НА ДОРОГАХ
// ===========================================

export const OBSTACLE_CONFIG = {
  /** Баррикада */
  BARRICADE: {
    hp: 100,
    blocksPath: true,
  },

  /** Замедляющая зона */
  SLOW_ZONE: {
    slowPercent: 50, // замедление на 50%
    blocksPath: false,
  },

  /** Нейтральный пост */
  NEUTRAL_POST: {
    hp: 50,
    dps: 8,
    etherReward: 10,
    blocksPath: false,
  },
} as const;

// ===========================================
// СИСТЕМА ПРИОРИТЕТА ЦЕЛЕЙ
// ===========================================

export const TARGET_PRIORITY = {
  /** Вес расстояния */
  DISTANCE_WEIGHT: 1.0,

  /** Вес текущего HP (добивание) */
  HP_WEIGHT: 0.8,

  /** Вес угрозы (DPS врага) */
  THREAT_WEIGHT: 1.2,

  /** Бонус за контр-пик */
  COUNTER_BONUS: 50,

  /** Интервал пересчёта приоритета (сек) */
  RECALCULATE_INTERVAL: 0.5,
} as const;

// ===========================================
// БОЙ
// ===========================================

/** Урон юнитов по башням (% от DPS) */
export const TOWER_DAMAGE_MULTIPLIER = 0.5;

/** Задержка отзыва охраны (сек) */
export const GUARD_RECALL_DELAY = 3;

/** Время появления юнита после создания (сек) */
export const UNIT_SPAWN_DELAY = 1;

// ===========================================
// FFA МЕХАНИКИ
// ===========================================

/** Бонус эфира за урон по башне лидера (%) */
export const LEADER_BOUNTY_BONUS = 25;

/** Доход от руин уничтоженного игрока (эфир/сек) */
export const RUINS_INCOME_PER_SEC = 4;

// ===========================================
// TIMING WINDOWS
// ===========================================

export const TIMING = {
  /** Время улучшения башни (базовое, умножается на уровень) */
  TOWER_UPGRADE_BASE: 5,

  /** Время постройки вспомогательной башни */
  SUPPORT_TOWER_BUILD: 5,

  /** Время исследования юнита */
  UNIT_RESEARCH: 10,

  /** Задержка отзыва охраны */
  GUARD_RECALL: 3,

  /** Задержка появления юнита */
  UNIT_SPAWN: 1,
} as const;

// ===========================================
// ЦВЕТА ИГРОКОВ
// ===========================================

export const PLAYER_COLORS = [
  "#00ffff", // Cyan - Player 1
  "#ff00ff", // Magenta - Player 2
  "#ffff00", // Yellow - Player 3
  "#00ff00", // Green - Player 4
] as const;

/** Цвет нейтральных объектов */
export const NEUTRAL_COLOR = "#888888";

/** Цвет тумана войны */
export const FOG_COLOR = "rgba(0, 0, 0, 0.7)";

// ===========================================
// UI КОНСТАНТЫ
// ===========================================

export const UI = {
  /** Высота панели управления */
  PANEL_HEIGHT: 100,

  /** Размер иконки юнита */
  UNIT_ICON_SIZE: 48,

  /** Высота health bar */
  HEALTH_BAR_HEIGHT: 6,

  /** Отступ health bar над юнитом */
  HEALTH_BAR_OFFSET: 10,
} as const;
