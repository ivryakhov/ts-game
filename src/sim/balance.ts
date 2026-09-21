/**
 * Числовые характеристики игры. Собраны в одном месте, потому что их
 * предстоит крутить сотнями итераций: панель правки на лету и Автопрогон
 * из тикетов спеки 0003 будут читать именно отсюда.
 */

/** Частота симуляции. Длительность Тика неизменна; скорость меняет только их число за кадр. */
export const TICKS_PER_SECOND = 20;

/** Условных единиц карты в секунду. */
const BASE_SPEED_PER_SECOND = 120;
/** Урона в секунду. */
const BASE_DAMAGE_PER_SECOND = 15;

const perTick = (perSecond: number): number => perSecond / TICKS_PER_SECOND;

/** Типы Юнитов. Поддержка вырезана из v1 — см. docs/v1-plan.md. */
export type UnitKind = 'scout' | 'tank' | 'ranger';

export const UNIT_KINDS: readonly UnitKind[] = ['scout', 'tank', 'ranger'];

export interface UnitStats {
  readonly maxHp: number;
  readonly cost: number;
  /**
   * Бьёт ли Юнит издали. Дальний не лезет в свалку и не занимает в ней
   * место — это его свойство, а не следствие того, что число дальности
   * вышло больше ближнего порога.
   */
  readonly ranged: boolean;
  /** Условных единиц карты за один Тик. */
  readonly speedPerTick: number;
  /** Урона за один Тик. */
  readonly damagePerTick: number;
  /**
   * На каком расстоянии вдоль Дороги Юнит достаёт врага. У ближних она
   * равна дальности сближения, у Стрелка заметно больше — он и бьёт
   * из-за спин.
   */
  readonly range: number;
}

/** Дальность ближнего удара: на ней враги замечают друг друга и встают. */
export const MELEE_RANGE = 26;

export const UNIT_STATS: Readonly<Record<UnitKind, UnitStats>> = {
  scout: {
    maxHp: 50,
    cost: 20,
    ranged: false,
    speedPerTick: perTick(BASE_SPEED_PER_SECOND * 1.5),
    damagePerTick: perTick(BASE_DAMAGE_PER_SECOND),
    range: MELEE_RANGE,
  },
  tank: {
    maxHp: 200,
    cost: 50,
    ranged: false,
    speedPerTick: perTick(BASE_SPEED_PER_SECOND * 0.7),
    damagePerTick: perTick(BASE_DAMAGE_PER_SECOND * 1.33),
    range: MELEE_RANGE,
  },
  ranger: {
    maxHp: 70,
    cost: 40,
    ranged: true,
    speedPerTick: perTick(BASE_SPEED_PER_SECOND),
    damagePerTick: perTick(BASE_DAMAGE_PER_SECOND * 2),
    range: 95,
  },
};

/** Экономика Стороны. */
export const ECONOMY = {
  /** С чего начинается матч. */
  startingEther: 100,
  /** Пассивный доход в секунду. */
  incomePerSecond: 5,
} as const;

export const CITADEL_STATS = {
  maxHp: 1000,
  /**
   * Цитадель отвечает ударом (концепт, раздел 5). Без этого против неё
   * выигрывает наибольший урон за Эфир, а живучесть Танка не значит ничего:
   * армия из одних Стрелков оказывалась и дешевле, и быстрее любой смеси.
   *
   * 17 в секунду, а не 15 из концепта. При 15 девять Разведчиков брали
   * Цитадель быстрее смешанной армии той же цены; при 17 гибнут все,
   * а берёт связка Танков со Стрелками за спиной. Окно узкое — при 20 не
   * берёт никто, — поэтому число временное: подбирать его Автопрогоном.
   */
  damagePerTick: perTick(17),
  /**
   * Дальность ответного удара, вдоль Дороги от Цитадели. Стены достают
   * не только осаждающих, но и тех, кто ещё подходит: подход к Цитадели
   * стоит здоровья, а не только осада.
   */
  range: 110,
  /**
   * Какая доля урона Юнита доходит до Цитадели. Меньше единицы намеренно:
   * иначе всё решает одна волна, добежавшая мимо Стычек, и удерживать
   * Дорогу оказывается бессмысленно.
   */
  damageShare: 0.5,
} as const;

/**
 * Сколько Юнитов с каждой Стороны бьётся в Стычке одновременно.
 * Концепт говорит о восьми; взято три, чтобы очередь была видна на глаз
 * и проверяема. Число уточнится на плейтестах.
 */
const SKIRMISH_LIMIT = 3;

export const SKIRMISH = {
  limit: SKIRMISH_LIMIT,
  /**
   * Насколько плотно Юниты встают друг за другом.
   *
   * Связано с лимитом жёстко: последний из троих обязан дотянуться
   * до врага, иначе лимит недостижим и в Стычке всегда дерётся меньше
   * заявленного. Отсюда spacing × (limit − 1) ≤ MELEE_RANGE.
   */
  spacing: Math.floor(MELEE_RANGE / (SKIRMISH_LIMIT - 1)),
} as const;
