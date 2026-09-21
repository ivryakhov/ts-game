import { CITADEL_STATS, UNIT_STATS, type UnitKind, type UnitStats } from './balance.js';
import type { Action } from './rules.js';
import type { RoadMetrics } from './geometry.js';
import type { SideId, UnitId, UnitSnapshot, UnitState } from './types.js';

/**
 * Юнит в симуляции. Положение хранится как пройденное расстояние,
 * а не как точка: так скорость остаётся постоянной на изломах Дороги,
 * а точку всегда можно получить из промеров маршрута.
 */
export interface Unit {
  readonly id: UnitId;
  readonly side: SideId;
  readonly kind: UnitKind;
  readonly roadId: string;
  /**
   * Идёт ли Юнит по Дороге от её начала к концу. Дорога описана один раз
   * и в одну сторону, а выходить по ней могут обе Стороны — каждая от
   * своей Цитадели, то есть навстречу друг другу.
   */
  readonly forward: boolean;
  /** Пройденное расстояние от своей Цитадели. */
  travelled: number;
  /** Выводится заново каждый Тик из расстановки на Дороге. */
  state: UnitState;
  /**
   * Что Юнит решил делать в этот Тик по своим Правилам. Решение
   * принимается заново каждый Тик, до Стычки и движения.
   */
  intent: Action['kind'];
  /**
   * Стоит ли Юнит у чужой Цитадели. Сбрасывается, если он отступил от стен.
   */
  arrived: boolean;
  /**
   * Тик, на котором Юнит встал у чужой Цитадели. Стены бьют пришедшего
   * первым — а это не всегда вышедший первым: обходная Дорога длиннее.
   */
  arrivedAt: number | null;
  hp: number;
  readonly maxHp: number;
  /** Лечила ли его своя Цитадель в этот Тик. */
  healing: boolean;
}

/**
 * Стоит ли Юнит у своей Цитадели — там, где она его лечит. Пройденное
 * расстояние отсчитывается от своей Цитадели, поэтому достаточно
 * посмотреть, далеко ли он от неё ушёл.
 */
export function isAtHome(unit: Unit): boolean {
  return unit.travelled <= CITADEL_STATS.healRadius;
}

/** Доля оставшегося здоровья в процентах — мерка Условий Правил. */
export function healthPercent(unit: Unit): number {
  return (unit.hp / unit.maxHp) * 100;
}

export function statsOf(unit: Unit): UnitStats {
  return UNIT_STATS[unit.kind];
}

export function createUnit(
  id: UnitId,
  side: SideId,
  kind: UnitKind,
  roadId: string,
  forward: boolean,
): Unit {
  const stats = UNIT_STATS[kind];
  return {
    id,
    side,
    kind,
    roadId,
    forward,
    travelled: 0,
    state: 'moving',
    intent: 'advance',
    arrived: false,
    arrivedAt: null,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    healing: false,
  };
}

/** Двигает Юнита на один Тик вперёд. Возвращает true, если он дошёл до конца Дороги. */
export function moveUnit(unit: Unit, roadLength: number): boolean {
  unit.travelled = Math.min(roadLength, unit.travelled + statsOf(unit).speedPerTick);
  return unit.travelled >= roadLength;
}

/** Отводит Юнита на один Тик назад, к своей Цитадели, но не дальше неё. */
export function withdrawUnit(unit: Unit): void {
  unit.travelled = Math.max(0, unit.travelled - statsOf(unit).speedPerTick);
}

export function unitSnapshot(unit: Unit, road: RoadMetrics): UnitSnapshot {
  const covered = road.length === 0 ? 1 : Math.min(1, unit.travelled / road.length);

  return {
    id: unit.id,
    side: unit.side,
    kind: unit.kind,
    roadId: unit.roadId,
    // Доля отсчитывается от начала Дороги, а не от своей Цитадели,
    // чтобы рендеру не приходилось знать о направлениях.
    progress: unit.forward ? covered : 1 - covered,
    state: unit.state,
    healing: unit.healing,
    hp: unit.hp,
    maxHp: unit.maxHp,
  };
}
