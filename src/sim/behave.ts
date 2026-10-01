import { conditionsOf, type Action, type Behaviour, type Condition } from './rules.js';
import { CITADEL_RADIUS, NEARBY_RANGE } from './balance.js';
import { enemiesInSight } from './skirmish.js';
import { reachOfStructure } from './structure.js';
import { obeliskInSight, type Obelisk } from './obelisk.js';
import { distanceTo, healthPercent, isAtHome, positionOn, type Unit } from './unit.js';
import type { SideId } from './types.js';

/**
 * Исполнение Правил: каждый Тик каждый Юнит перебирает Правила своего типа
 * сверху вниз и берёт Действие первого, чьи Условия истинны все
 * (ADR-0002, ADR-0005).
 *
 * Решение только выбирается здесь; что из него выйдет — Стычка, движение
 * или осада — определяет мир. Правило задаёт намерение Юнита, а не отменяет
 * физику: захотеть драться можно, но дерётся тот, кто дотянулся.
 */

/** Всё, что Условия вправе знать о Юните и его окружении. */
export interface Surroundings {
  /** Видит ли Юнит врага — того, к кому готов сойти с Дороги. */
  readonly enemyInReach: boolean;
  /** Стоит ли Юнит у своей Цитадели — там, где она его лечит. */
  readonly atHome: boolean;
  /** Сколько своих рядом, не считая его самого. */
  readonly alliesNearby: number;
  /** Сколько врагов он видит, не считая отступающих. */
  readonly enemiesInSkirmish: number;
  /** Есть ли враг впереди по Дороге — на любом расстоянии. */
  readonly enemyAhead: boolean;
  /** Достаёт ли он чужую Цитадель со своего места. */
  readonly enemyCitadelInRange: boolean;
  /** Стоит ли враг под стенами своей Цитадели — на любом расстоянии от Юнита. */
  readonly enemyAtHome: boolean;
  /** Видит ли он ничей или вражеский Обелиск. */
  readonly obeliskInRange: boolean;
}

export function holds(condition: Condition, unit: Unit, around: Surroundings): boolean {
  switch (condition.kind) {
    case 'always':
      return true;
    case 'hp-below':
      return healthPercent(unit) < condition.percent;
    case 'enemy-in-range':
      return around.enemyInReach;
    case 'at-home':
      return around.atHome;
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
    case 'enemy-at-home':
      return around.enemyAtHome;
    case 'obelisk-in-range':
      return around.obeliskInRange;
  }
}

/**
 * Первое Правило, чьи Условия истинны все: его Действие и номер. Разбор
 * Поведения требует, чтобы последнее Правило было «always», поэтому что-то
 * сработает всегда — скрытого запасного действия нет.
 *
 * Номер нужен игроку: по нему видно, какое именно Правило движет Юнитом.
 */
export function choose(
  behaviour: Behaviour,
  unit: Unit,
  around: Surroundings,
): { action: Action; rule: number } {
  const rules = behaviour[unit.kind];
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (rule && conditionsOf(rule).every((condition) => holds(condition, unit, around))) return { action: rule.do, rule: index };
  }
  throw new Error(`Поведение ${unit.kind}: не сработало ни одно Правило — разбор пропустил дыру`);
}

/**
 * Окружение каждого Юнита. Считается той же меркой, что и Стычка, —
 * иначе Правило и физика разошлись бы: Юнит, который «видит врага»,
 * обязан и пойти к нему, если Правило велит атаковать.
 */
export function surroundingsOf(
  units: readonly Unit[],
  obelisks: readonly Obelisk[],
  roadLength: (roadId: string) => number,
  /** Есть ли враг под стенами Цитадели Стороны — той же меркой, что у стен. */
  besieged: (side: SideId) => boolean,
): Map<number, Surroundings> {
  return new Map(
    units.map((unit) => {
      const seen = enemiesInSight(unit, units);
      const allies = units.filter(
        (other) =>
          other.side === unit.side &&
          other.id !== unit.id &&
          distanceTo(unit, other) <= NEARBY_RANGE,
      ).length;

      // «Впереди» — по направлению движения Юнита вдоль его Дороги.
      const length = roadLength(unit.roadId);
      const here = positionOn(unit, length);
      const ahead = units.some(
        (other) =>
          other.side !== unit.side &&
          other.roadId === unit.roadId &&
          (unit.forward ? positionOn(other, length) > here : positionOn(other, length) < here),
      );

      return [
        unit.id,
        {
          enemyInReach: seen.length > 0,
          atHome: isAtHome(unit),
          alliesNearby: allies,
          // Отступающие из Стычки вышли — их не считают, хоть они и видны.
          enemiesInSkirmish: seen.filter((enemy) => enemy.intent.kind !== 'retreat').length,
          enemyAhead: ahead,
          enemyCitadelInRange:
            distanceTo(unit, unit.foe) <= reachOfStructure(unit, { radius: CITADEL_RADIUS }),
          // Враг, которого уже бьют стены: мерка — где он стоит сейчас,
          // а не память об уроне. Отошёл за стены — Условие снова ложно.
          enemyAtHome: besieged(unit.side),
          obeliskInRange: obeliskInSight(obelisks, unit) !== null,
        },
      ];
    }),
  );
}
