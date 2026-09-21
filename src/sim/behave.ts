import type { Action, Behaviour, Condition } from './rules.js';
import { NEARBY_RANGE } from './balance.js';
import { inReach, positionOn } from './skirmish.js';
import { healthPercent, isAtHome, statsOf, type Unit } from './unit.js';

/**
 * Исполнение Правил: каждый Тик каждый Юнит перебирает Правила своего типа
 * сверху вниз и берёт Действие первого, чьё Условие истинно (ADR-0002).
 *
 * Решение только выбирается здесь; что из него выйдет — Стычка, движение
 * или осада — определяет мир. Правило задаёт намерение Юнита, а не отменяет
 * физику: захотеть драться можно, но дерётся тот, кто дотянулся.
 */

/** Всё, что Условия вправе знать о Юните и его окружении. */
export interface Surroundings {
  /** Дотягивается ли Юнит до врага — сам или в свалке своей Колонны. */
  readonly enemyInReach: boolean;
  /** Стоит ли Юнит у своей Цитадели — там, где она его лечит. */
  readonly atHome: boolean;
  /** Сколько своих рядом, не считая его самого. */
  readonly alliesNearby: number;
  /** Сколько врагов дотягивается до его Колонны. */
  readonly enemiesInSkirmish: number;
  /** Есть ли враг впереди по Дороге — на любом расстоянии. */
  readonly enemyAhead: boolean;
  /** Не дальше ли чужая Цитадель его дальности удара. */
  readonly enemyCitadelInRange: boolean;
}

export function holds(condition: Condition, unit: Unit, around: Surroundings): boolean {
  switch (condition.kind) {
    case 'always':
      return true;
    case 'hp-below':
      return healthPercent(unit) < condition.percent;
    case 'enemy-in-range':
      return around.enemyInReach;
    case 'recovering':
      return around.atHome && healthPercent(unit) < condition.until;
    case 'allies-nearby':
      return condition.compare === 'fewer'
        ? around.alliesNearby < condition.count
        : around.alliesNearby > condition.count;
    case 'enemies-in-skirmish':
      return around.enemiesInSkirmish > condition.above;
    case 'enemy-ahead':
      return around.enemyAhead;
    case 'enemy-citadel-in-range':
      return around.enemyCitadelInRange;
  }
}

/**
 * Действие первого Правила, чьё Условие истинно. Разбор Поведения требует,
 * чтобы последнее Правило было «always», поэтому что-то сработает всегда —
 * скрытого запасного действия нет.
 */
export function choose(behaviour: Behaviour, unit: Unit, around: Surroundings): Action {
  for (const rule of behaviour[unit.kind]) {
    if (holds(rule.when, unit, around)) return rule.do;
  }
  throw new Error(`Поведение ${unit.kind}: не сработало ни одно Правило — разбор пропустил дыру`);
}

/**
 * Окружение каждого Юнита одной Дороги. Считается разом для всей Дороги
 * той же меркой, что и Стычка, — иначе Правило и физика разошлись бы.
 */
export function surroundingsOn(
  units: readonly Unit[],
  roadLength: number,
): Map<number, Surroundings> {
  const reachable = inReach(units, roadLength);
  // Отступающие из Стычки вышли — их не считают, хоть враг и дотягивается.
  const reachingOf = (side: Unit['side']): number =>
    units.filter(
      (unit) => unit.side === side && reachable.has(unit.id) && unit.intent.kind !== 'retreat',
    ).length;

  return new Map(
    units.map((unit) => {
      const here = positionOn(unit, roadLength);
      const allies = units.filter(
        (other) =>
          other.side === unit.side &&
          other.id !== unit.id &&
          Math.abs(positionOn(other, roadLength) - here) <= NEARBY_RANGE,
      ).length;
      // «Впереди» — по направлению движения Юнита вдоль Дороги.
      const ahead = units.some(
        (other) =>
          other.side !== unit.side &&
          (unit.forward
            ? positionOn(other, roadLength) > here
            : positionOn(other, roadLength) < here),
      );
      const enemySide = units.find((other) => other.side !== unit.side)?.side;

      return [
        unit.id,
        {
          enemyInReach: reachable.has(unit.id),
          atHome: isAtHome(unit),
          alliesNearby: allies,
          enemiesInSkirmish: enemySide ? reachingOf(enemySide) : 0,
          enemyAhead: ahead,
          enemyCitadelInRange: roadLength - unit.travelled <= statsOf(unit).range,
        },
      ];
    }),
  );
}

