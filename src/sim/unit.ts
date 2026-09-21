import { UNIT_STATS } from './balance.js';
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
  /** Дошёл ли Юнит до конца своей Дороги. Обратно не меняется. */
  arrived: boolean;
  hp: number;
  readonly maxHp: number;
}

export function createUnit(id: UnitId, side: SideId, roadId: string, forward: boolean): Unit {
  return {
    id,
    side,
    roadId,
    forward,
    travelled: 0,
    state: 'moving',
    arrived: false,
    hp: UNIT_STATS.maxHp,
    maxHp: UNIT_STATS.maxHp,
  };
}

/** Двигает Юнита на один Тик. Возвращает true, если он дошёл до конца Дороги. */
export function moveUnit(unit: Unit, road: RoadMetrics): boolean {
  unit.travelled = Math.min(road.length, unit.travelled + UNIT_STATS.speedPerTick);
  return unit.travelled >= road.length;
}

export function unitSnapshot(unit: Unit, road: RoadMetrics): UnitSnapshot {
  const covered = road.length === 0 ? 1 : Math.min(1, unit.travelled / road.length);

  return {
    id: unit.id,
    side: unit.side,
    roadId: unit.roadId,
    // Доля отсчитывается от начала Дороги, а не от своей Цитадели,
    // чтобы рендеру не приходилось знать о направлениях.
    progress: unit.forward ? covered : 1 - covered,
    state: unit.state,
    hp: unit.hp,
    maxHp: unit.maxHp,
  };
}
