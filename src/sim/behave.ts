import type { Action, Behaviour, Condition } from './rules.js';
import { inReach } from './skirmish.js';
import type { Unit } from './unit.js';

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
}

export function holds(condition: Condition, unit: Unit, around: Surroundings): boolean {
  switch (condition.kind) {
    case 'always':
      return true;
    case 'hp-below':
      return (unit.hp / unit.maxHp) * 100 < condition.percent;
    case 'enemy-in-range':
      return around.enemyInReach;
  }
}

/**
 * Действие первого Правила, чьё Условие истинно. Разбор Поведения требует,
 * чтобы последнее Правило было «always», поэтому что-то сработает всегда —
 * скрытого запасного действия нет.
 */
export function choose(behaviour: Behaviour, unit: Unit, around: Surroundings): Action['kind'] {
  for (const rule of behaviour[unit.kind]) {
    if (holds(rule.when, unit, around)) return rule.do.kind;
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
  return new Map(units.map((unit) => [unit.id, { enemyInReach: reachable.has(unit.id) }]));
}
