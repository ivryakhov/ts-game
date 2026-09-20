/**
 * Типы ядра симуляции. Словарь — CONTEXT.md.
 *
 * Здесь не должно появиться ничего, что знает о браузере, холсте или рендере:
 * ядро обязано запускаться в Node без окружения DOM (ADR-0001).
 */

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
 * Ресурсная точка. В спеке 0001 не реализуется, но поле присутствует
 * в формате карты, чтобы спека 0003 не потребовала его менять.
 */
export interface ResourcePointSpec {
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
  readonly resourcePoints: readonly ResourcePointSpec[];
}

/** Настройка одной Стороны. Поведение и экономика появятся в тикетах 09 и 12. */
export interface SideSetup {
  readonly id: SideId;
}

/**
 * Выпустить Юнита на Дорогу. Списание Эфира появится в тикете 07;
 * пока действие бесплатно и служит расписанием появления Юнитов.
 */
export interface DeployAction {
  readonly tick: number;
  readonly side: SideId;
  readonly kind: 'deploy';
  readonly roadId: string;
}

/**
 * Действие игрока, привязанное к номеру Тика, а не к реальному времени:
 * иначе при ускорении воспроизведения действие «уезжает» и матч перестаёт
 * быть воспроизводимым. Словарь закрыт и растёт вместе со спекой.
 */
export type ScheduledAction = DeployAction;

export interface MatchSetup {
  readonly seed: Seed;
  readonly map: GameMap;
  readonly sides: readonly SideSetup[];
  readonly playerActions: readonly ScheduledAction[];
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
    }
  | {
      readonly kind: 'unit-arrived';
      readonly tick: number;
      readonly unitId: UnitId;
      readonly side: SideId;
      readonly roadId: string;
    }
  | {
      readonly kind: 'unit-died';
      readonly tick: number;
      readonly unitId: UnitId;
      readonly side: SideId;
      readonly roadId: string;
      readonly killedBy: UnitId;
    };

/** Разрушение Цитадели как причина окончания появится в тикете 06. */
export type EndReason = 'tick-limit';

export type UnitId = number;

/**
 * Чем Юнит занят прямо сейчас. Состояние выводится заново каждый Тик
 * из расстановки на Дороге, а не хранится: так не бывает Юнита, который
 * помнит, что дерётся, когда драться уже не с кем.
 */
export type UnitState = 'moving' | 'fighting' | 'waiting';

/**
 * Юнит глазами рендера. Положение задано долей пройденной Дороги,
 * а не точкой: так рендер может сгладить движение между Тиками,
 * не сходя с маршрута.
 */
export interface UnitSnapshot {
  readonly id: UnitId;
  readonly side: SideId;
  readonly roadId: string;
  /** Доля пройденного пути от 0 до 1. */
  readonly progress: number;
  readonly state: UnitState;
  readonly hp: number;
  readonly maxHp: number;
}

export interface WorldSnapshot {
  readonly tick: number;
  readonly sides: readonly SideId[];
  readonly units: readonly UnitSnapshot[];
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
