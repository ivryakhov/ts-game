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
  /** Четыре контрольные точки кубической кривой Безье, включая концы. */
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
 * Действие игрока, привязанное к номеру Тика, а не к реальному времени:
 * иначе при ускорении воспроизведения действие «уезжает» и матч перестаёт
 * быть воспроизводимым.
 */
export interface ScheduledAction {
  readonly tick: number;
  readonly side: SideId;
  /**
   * Открытая строка — временно. Словарь действий игрока закрыт спекой
   * и станет union-типом в тикете 07, когда появится покупка Юнитов.
   */
  readonly kind: string;
}

export interface MatchSetup {
  readonly seed: Seed;
  readonly map: GameMap;
  readonly sides: readonly SideSetup[];
  readonly playerActions: readonly ScheduledAction[];
  readonly maxTicks: number;
}

export type MatchEvent =
  | { readonly kind: 'match-started'; readonly tick: number; readonly seed: Seed }
  | { readonly kind: 'match-ended'; readonly tick: number; readonly reason: EndReason };

/** Разрушение Цитадели как причина окончания появится в тикете 06. */
export type EndReason = 'tick-limit';

export interface WorldSnapshot {
  readonly tick: number;
  readonly sides: readonly SideId[];
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
