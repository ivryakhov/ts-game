import { CITADEL_STATS, UNIT_STATS, type UnitKind, type UnitStats } from './balance.js';
import type { Action } from './rules.js';
import type { RoadMetrics } from './geometry.js';
import type { Point, SideId, UnitId, UnitSnapshot, UnitState } from './types.js';

/**
 * Юнит в симуляции. Положение — точка на поле: Юнит идёт вдоль своей
 * Дороги, но может сойти с неё, чтобы бить врага, и вернуться. Пройденное
 * расстояние выводится из точки проекцией на Дорогу — им меряется, как
 * далеко Юнит продвинулся к чужой Цитадели.
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
  /** Где Юнит стоит на поле. Меняется только движением и расталкиванием. */
  x: number;
  y: number;
  /**
   * Пройденное расстояние от своей Цитадели — проекция точки на Дорогу.
   * Пересчитывается после каждого движения.
   */
  travelled: number;
  /** Где стоит своя Цитадель: к ней отступают и у неё лечатся. */
  readonly home: Point;
  /** Где стоит чужая Цитадель, к которой ведёт Дорога. */
  readonly foe: Point;
  /** Выводится заново каждый Тик из расстановки на Дороге. */
  state: UnitState;
  /**
   * Что Юнит решил делать в этот Тик по своим Правилам. Решение
   * принимается заново каждый Тик, до Стычки и движения.
   */
  intent: Action;
  /** Номер Правила, давшего это Действие, — для показа игроку. */
  rule: number;
  /** Кого он бьёт в этот Тик; выставляется Стычкой. */
  target: UnitId | null;
  /**
   * Достаёт ли Юнит чужую Цитадель и бьёт ли её. Сбрасывается, как только
   * он от неё отошёл.
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
  /**
   * Шёл ли он вперёд в прошлом Тике. Своего, который идёт, не обгоняют —
   * держатся за его спиной; а упёршегося и стоящего обходят.
   */
  marching: boolean;
}

/** Расстояние по прямой между центрами. */
export function distanceTo(unit: Unit, point: Point): number {
  return Math.hypot(point.x - unit.x, point.y - unit.y);
}

/**
 * Разница расстояний для сортировки: почти равные считаются равными.
 * Сторона B считает свои точки от другого конца Дороги, и в последних
 * знаках её числа расходятся с зеркальными числами Стороны A. Решай
 * такой шум, кто ближе, — матч с одинаковыми Правилами на обеих
 * Сторонах переставал бы быть зеркальным.
 */
export function compareDistance(left: number, right: number): number {
  return Math.abs(left - right) < 1e-6 ? 0 : left - right;
}

/** Стоит ли Юнит у своей Цитадели — там, где она его лечит. */
export function isAtHome(unit: Unit): boolean {
  return distanceTo(unit, unit.home) <= CITADEL_STATS.healRadius;
}

/** Положение Юнита вдоль Дороги, считая от её начала. */
export function positionOn(unit: Unit, roadLength: number): number {
  return unit.forward ? unit.travelled : roadLength - unit.travelled;
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
  home: Point,
  foe: Point,
): Unit {
  const stats = UNIT_STATS[kind];
  return {
    id,
    side,
    kind,
    roadId,
    forward,
    x: home.x,
    y: home.y,
    travelled: 0,
    home,
    foe,
    state: 'moving',
    intent: { kind: 'advance' },
    rule: 0,
    target: null,
    arrived: false,
    arrivedAt: null,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    healing: false,
    marching: false,
  };
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
    x: unit.x,
    y: unit.y,
    state: unit.state,
    healing: unit.healing,
    rule: unit.rule,
    target: unit.target,
    hp: unit.hp,
    maxHp: unit.maxHp,
  };
}
