import { BODY_RADIUS, CITADEL_STATS, MELEE_GAP } from './balance.js';
import type { Point, SideId } from './types.js';
import { statsOf, type Unit } from './unit.js';
import type { World } from './world.js';

/**
 * Строение — то, что стоит на поле и что можно осаждать: у него есть
 * центр, тело, сквозь которое не пройти, здоровье и владелец. Осада
 * знает только строение, а не то, какое именно: Цитадель и Обелиск
 * осаждаются одинаково (ADR-0006).
 *
 * Зависит от мира только типом, а не кодом: иначе модули замыкались
 * бы в цикл.
 */
export interface Structure {
  readonly kind: 'citadel' | 'obelisk';
  /** Чьё строение. null — ничьё: такое строение враг каждой Стороне. */
  readonly owner: SideId | null;
  /**
   * Где стоит центр. Бывает null только у Цитадели на пустой тестовой
   * карте без Дорог — там и подойти к ней некому.
   */
  readonly at: Point | null;
  /** Радиус тела: ближе центр Юнита к центру строения не подходит. */
  readonly radius: number;
  hp: number;
}

/** Все строения мира в постоянном порядке: от него зависит порядок событий. */
export function structuresOf(world: World): readonly Structure[] {
  return [...world.citadels.values(), ...world.obelisks];
}

/**
 * Стоит ли строение стеной против Юнита этой Стороны: внутрь не зайти.
 * Своё строение препятствием не считается — из Цитадели Юниты выходят
 * и в неё же отступают лечиться.
 */
export function isWallAgainst(structure: Structure, side: SideId): structure is Structure & { at: Point } {
  return structure.owner !== side && structure.hp > 0 && structure.at !== null;
}

/**
 * С какого расстояния до центра строения Юнит его бьёт. Ближний —
 * встав у самой стены; Стрелок — со своей дальности, как и по Юнитам.
 */
export function reachOfStructure(unit: Unit, structure: Pick<Structure, 'radius'>): number {
  return statsOf(unit).ranged ? statsOf(unit).range : structure.radius + BODY_RADIUS + MELEE_GAP;
}

/**
 * Какое строение осаждает Юнит: чужую Цитадель в конце своей Дороги,
 * а не любую чужую — иначе при трёх Сторонах один Юнит доставал бы
 * всех врагов разом.
 */
export function besiegedBy(world: World, unit: Unit): Structure | null {
  const road = world.roads.get(unit.roadId);
  const foeSide = unit.forward ? road?.to : road?.from;
  return (foeSide && world.citadels.get(foeSide)) || null;
}

/**
 * Урон, нанесённый осаждающими. Каждый бьёт своё строение, пока оно
 * стоит и пока оно не его Стороны.
 *
 * Осаждающие бьют слабее, чем в Стычке: до строения доходит лишь доля
 * урона. Иначе прорвавшаяся Волна решала бы матч, а удерживать Дорогу
 * не имело бы смысла.
 *
 * Возвращает строения, павшие в этом Тике, в порядке падения.
 */
export function batter(besiegers: readonly { unit: Unit; target: Structure }[]): Structure[] {
  const fallen: Structure[] = [];

  for (const { unit, target } of besiegers) {
    if (target.hp <= 0 || target.owner === unit.side) continue;

    target.hp -= statsOf(unit).damagePerTick * CITADEL_STATS.damageShare;
    if (target.hp > 0) continue;

    target.hp = 0;
    fallen.push(target);
  }

  return fallen;
}
