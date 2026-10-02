/**
 * Типы ядра симуляции. Словарь — CONTEXT.md.
 *
 * Здесь не должно появиться ничего, что знает о браузере, холсте или рендере:
 * ядро обязано запускаться в Node без окружения DOM (ADR-0001).
 */

import type { UnitKind } from './balance.js';
import type { Behaviour } from './rules.js';
import type { Wave } from './waves.js';

export type { UnitKind };

/** Число, полностью определяющее случайность матча. */
export type Seed = number;

/** Участник матча: игрок или бот. */
export type SideId = 'A' | 'B';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Цитадель — главное строение Стороны; её разрушение означает поражение. */
export interface CitadelSpec {
  readonly side: SideId;
  readonly at: Point;
}

/** Дорога — фиксированный маршрут между двумя Цитаделями. */
export interface RoadSpec {
  readonly id: string;
  readonly from: SideId;
  readonly to: SideId;
  /** Цепочка кубических кривых Безье: 3n+1 контрольная точка, включая концы. */
  readonly points: readonly Point[];
}

/**
 * Обелиск — строение у обочины обходной Дороги (ADR-0006). Стоит ничьим,
 * пока его не возьмут ударом.
 */
export interface ObeliskSpec {
  readonly id: string;
  readonly at: Point;
}

export interface MapSize {
  readonly width: number;
  readonly height: number;
}

export interface GameMap {
  /** Собственные координаты поля; рендер вписывает их в окно. */
  readonly size: MapSize;
  readonly citadels: readonly CitadelSpec[];
  readonly roads: readonly RoadSpec[];
  readonly obelisks: readonly ObeliskSpec[];
}

/** Настройка одной Стороны. */
export interface SideSetup {
  readonly id: SideId;
  /** Правила для каждого типа Юнита. Без них — Поведение по умолчанию. */
  readonly behaviour?: Behaviour;
  /**
   * Волны, которые Сторона выпускает сама. Без них Юнитов выпускает
   * только человек — или никто.
   */
  readonly waves?: readonly Wave[];
}

/**
 * Выпустить Юнита на Дорогу. Списание Эфира появится в тикете 07;
 * пока действие бесплатно и служит расписанием появления Юнитов.
 */
export interface Release {
  readonly tick: number;
  readonly side: SideId;
  readonly kind: 'deploy';
  readonly roadId: string;
  readonly unit: UnitKind;
}

/**
 * Выпуск, ещё не привязанный к Тику. Номер назначает сам матч —
 * ближайший не сыгранный, — поэтому воспроизводимость сохраняется
 * и на паузе, и при ускорении.
 */
export type UnscheduledRelease = Omit<Release, 'tick'>;

/**
 * Выпуск, привязанный к номеру Тика, а не к реальному времени:
 * иначе при ускорении воспроизведения действие «уезжает» и матч перестаёт
 * быть воспроизводимым. Словарь закрыт и растёт вместе со спекой.
 */
export type ScheduledRelease = Release;

export interface MatchSetup {
  readonly seed: Seed;
  readonly map: GameMap;
  readonly sides: readonly SideSetup[];
  readonly releases: readonly ScheduledRelease[];
  readonly maxTicks: number;
}

export type MatchEvent =
  | { readonly kind: 'match-started'; readonly tick: number; readonly seed: Seed }
  | { readonly kind: 'match-ended'; readonly tick: number; readonly reason: EndReason }
  | {
      readonly kind: 'unit-deployed';
      readonly tick: number;
      readonly unitId: UnitId;
      readonly side: SideId;
      readonly roadId: string;
      readonly unit: UnitKind;
    }
  | {
      readonly kind: 'unit-arrived';
      readonly tick: number;
      readonly unitId: UnitId;
      readonly side: SideId;
      readonly roadId: string;
    }
  | {
      readonly kind: 'deploy-refused';
      readonly tick: number;
      readonly side: SideId;
      readonly roadId: string;
      readonly unit: UnitKind;
      readonly reason: RefusalReason;
    }
  | {
      readonly kind: 'citadel-destroyed';
      readonly tick: number;
      readonly side: SideId;
    }
  | {
      /** Сбитый Обелиск встал за новым владельцем или снова ничьим. */
      readonly kind: 'obelisk-taken';
      readonly tick: number;
      readonly obeliskId: string;
      /** null — при равном уроне Обелиск встал ничьим. */
      readonly owner: SideId | null;
    }
  | {
      readonly kind: 'unit-died';
      readonly tick: number;
      readonly unitId: UnitId;
      readonly side: SideId;
      readonly roadId: string;
      readonly killer: Killer;
    };

/** Кто нанёс последний удар: Юнит в Стычке, Цитадель со стен или Обелиск. */
export type Killer =
  | { readonly kind: 'unit'; readonly unitId: UnitId }
  | { readonly kind: 'citadel'; readonly side: SideId }
  | { readonly kind: 'obelisk'; readonly obeliskId: string };

export type EndReason = 'tick-limit' | 'citadel-destroyed';

/** Почему Выпуск не состоялся. */
export type RefusalReason = 'not-enough-ether';

export type UnitId = number;

/**
 * Чем Юнит занят прямо сейчас. Выводится заново каждый Тик из его Действия
 * и расстановки на поле, а не хранится: так не бывает Юнита, который
 * помнит, что дерётся, когда драться уже не с кем.
 */
export type UnitState =
  | 'moving'
  | 'fighting'
  | 'waiting'
  | 'holding'
  | 'sieging'
  | 'retreating';

/**
 * Юнит глазами рендера. Рисуется по точке на поле: Юнит может сойти
 * с Дороги, чтобы бить врага. Доля пройденной Дороги — это проекция
 * точки на неё, мерка продвижения.
 */
export interface UnitSnapshot {
  readonly id: UnitId;
  readonly side: SideId;
  readonly kind: UnitKind;
  readonly roadId: string;
  /** Доля пройденного пути от 0 до 1, считая от начала Дороги. */
  readonly progress: number;
  /** Где Юнит стоит на поле. */
  readonly x: number;
  readonly y: number;
  readonly state: UnitState;
  /**
   * Лечит ли его своя Цитадель в этот Тик. Отдельно от состояния: Юнит
   * может и драться у своих ворот, и лечиться одновременно.
   */
  readonly healing: boolean;
  /** Номер Правила его Поведения, исполняемого в этот Тик, считая с нуля. */
  readonly rule: number;
  /** Кого он бьёт в этот Тик; null — никого. */
  readonly target: UnitId | null;
  /**
   * К кому он идёт, никого не доставая: врага, которого выбрало его
   * Действие среди видимых. null — ни к кому.
   */
  readonly chasing: UnitId | null;
  readonly hp: number;
  readonly maxHp: number;
}

/** Запас Эфира Стороны глазами рендера. */
export interface EtherSnapshot {
  readonly side: SideId;
  readonly amount: number;
  /** Полный доход в секунду: базовый и прибавка за свои Обелиски. */
  readonly incomePerSecond: number;
}

/** Цитадель глазами рендера. */
export interface CitadelSnapshot {
  readonly side: SideId;
  readonly hp: number;
  readonly maxHp: number;
  /** Кого Цитадель бьёт прямо сейчас; null — никого нет в радиусе. */
  readonly target: UnitId | null;
}

/** Обелиск глазами рендера. Где он стоит — в карте. */
export interface ObeliskSnapshot {
  readonly id: string;
  /** null — ничей. */
  readonly owner: SideId | null;
  readonly hp: number;
  readonly maxHp: number;
  /**
   * Кого Обелиск бьёт прямо сейчас; пусто — никого нет в радиусе. Двое
   * и больше — когда удар делится между Сторонами поровну.
   */
  readonly targets: readonly UnitId[];
}

export interface WorldSnapshot {
  readonly tick: number;
  readonly sides: readonly SideId[];
  readonly units: readonly UnitSnapshot[];
  readonly citadels: readonly CitadelSnapshot[];
  readonly obelisks: readonly ObeliskSnapshot[];
  readonly ether: readonly EtherSnapshot[];
}

export interface MatchStats {
  /** Сколько раз симуляция обращалась к случайности. */
  readonly rngDraws: number;
}

export interface MatchResult {
  /** null означает ничью. */
  readonly winner: SideId | null;
  readonly ticks: number;
  readonly endReason: EndReason;
  readonly events: readonly MatchEvent[];
  readonly finalState: WorldSnapshot;
  readonly stats: MatchStats;
}
