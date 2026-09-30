import { BODY_RADIUS, CITADEL_RADIUS, MELEE_GAP } from './balance.js';
import type { UnitId, UnitState } from './types.js';
import { isAttack } from './rules.js';
import { compareDistance, distanceTo, statsOf, type Unit } from './unit.js';

/**
 * Стычка — столкновение враждебных Юнитов на поле. Юнит, которому Правило
 * велит атаковать, бьёт врага, до которого дотянулся, а если не дотянулся
 * ни до кого, но видит врага, — идёт к нему, сходя с Дороги.
 *
 * Ближний бьёт только вплотную: тела не налезают друг на друга, поэтому
 * дотянуться сквозь чужую или свою спину нельзя — надо подойти. Сколько
 * ближних бьётся с одним врагом, решает место вокруг него, а не число
 * в таблице. Стрелок бьёт издали, поверх голов.
 *
 * Ничего не хранится между Тиками: расстановка разбирается заново каждый
 * Тик, и из неё выводится, кто дерётся, а кто идёт к цели. Так не может
 * возникнуть Юнита, который помнит, что дерётся, когда драться уже не
 * с кем, — именно такой застрявший Юнит похоронил январскую попытку.
 *
 * Функция ничего не меняет: она возвращает решение, а применяет его мир.
 */

/** Сколько урона получил Юнит за Тик и кто ударил последним. */
export interface Incoming {
  damage: number;
  lastAttacker: UnitId;
}

/** Что делать с Юнитами в этот Тик. */
export interface SkirmishPlan {
  readonly states: ReadonlyMap<UnitId, UnitState>;
  readonly damage: ReadonlyMap<UnitId, Incoming>;
  /** Кого бьёт каждый атакующий — для показа игроку. */
  readonly targets: ReadonlyMap<UnitId, UnitId>;
  /**
   * К кому идёт атакующий, не дотянувшийся ни до кого: он сходит с Дороги
   * и сближается с ближайшим замеченным врагом.
   */
  readonly chase: ReadonlyMap<UnitId, UnitId>;
}

/**
 * С какого расстояния между центрами Юнит бьёт другого Юнита. Ближнему
 * нужно встать вплотную — тело к телу с небольшим зазором.
 */
export function reachOf(unit: Unit): number {
  return statsOf(unit).range;
}

/**
 * С какого расстояния до центра чужой Цитадели Юнит её бьёт. Ближний —
 * встав у самой стены; Стрелок — со своей дальности, как и по Юнитам.
 */
export function citadelReachOf(unit: Unit): number {
  return statsOf(unit).ranged ? statsOf(unit).range : CITADEL_RADIUS + BODY_RADIUS + MELEE_GAP;
}

/**
 * На каком расстоянии от цели останавливается идущий к ней. Ближний —
 * вплотную, тело к телу: отходящая цель за тот же Тик отступит на шаг,
 * и остановись он раньше, так и не дотянулся бы. Стрелок — чуть ближе
 * своей дальности.
 */
export function approachOf(unit: Unit): number {
  return statsOf(unit).ranged ? statsOf(unit).range - 2 : BODY_RADIUS * 2;
}

/**
 * Укрыт ли враг стенами от этого атакующего. Юнит, стоящий у самого
 * центра своей Цитадели, — там, где она лечит, — ближнему не достать:
 * к нему не подойти вплотную сквозь стены. Стрелок бьёт поверх стен.
 * Такого врага ближний не считает целью, иначе кружил бы вокруг стен,
 * вместо того чтобы их бить.
 */
function isSheltered(attacker: Unit, enemy: Unit): boolean {
  if (statsOf(attacker).ranged) return false;
  return distanceTo(enemy, enemy.home) + reachOf(attacker) < CITADEL_RADIUS + BODY_RADIUS;
}

/** Враги, которых Юнит видит и может достать, — от ближнего к дальнему. */
export function enemiesInSight(unit: Unit, units: readonly Unit[]): Unit[] {
  const sight = statsOf(unit).sight;
  return units
    .filter(
      (other) =>
        other.side !== unit.side &&
        distanceTo(unit, other) <= sight &&
        !isSheltered(unit, other),
    )
    .sort(
      (left, right) =>
        compareDistance(distanceTo(unit, left), distanceTo(unit, right)) || left.id - right.id,
    );
}

export function planSkirmish(units: readonly Unit[]): SkirmishPlan {
  const states = new Map<UnitId, UnitState>(units.map((unit) => [unit.id, 'moving']));
  const damage = new Map<UnitId, Incoming>();
  const targets = new Map<UnitId, UnitId>();
  const chase = new Map<UnitId, UnitId>();

  for (const attacker of units) {
    // Драться хочет не каждый: Правило могло велеть идти, стоять или бежать.
    if (!isAttack(attacker.intent)) continue;

    const seen = enemiesInSight(attacker, units);
    const reachable = seen.filter((enemy) => distanceTo(attacker, enemy) <= reachOf(attacker));
    const target = pickTarget(attacker, reachable);

    if (!target) {
      // Никого не достать, но кого-то видно — идём к ближайшему.
      const nearest = seen[0];
      if (nearest) chase.set(attacker.id, nearest.id);
      continue;
    }

    states.set(attacker.id, 'fighting');
    targets.set(attacker.id, target.id);

    const blow = statsOf(attacker).damagePerTick;
    const incoming = damage.get(target.id);
    if (incoming) {
      incoming.damage += blow;
      incoming.lastAttacker = attacker.id;
      continue;
    }
    damage.set(target.id, { damage: blow, lastAttacker: attacker.id });
  }

  return { states, damage, targets, chase };
}

/**
 * Цель по Действию атакующего — только среди тех, до кого он дотянулся.
 * При равенстве главного признака — ближайший, при равном расстоянии —
 * вышедший раньше: выбор всегда однозначен.
 */
function pickTarget(attacker: Unit, candidates: readonly Unit[]): Unit | undefined {
  const distance = (unit: Unit) => distanceTo(attacker, unit);
  const nearestFirst = (left: Unit, right: Unit) =>
    compareDistance(distance(left), distance(right)) || left.id - right.id;

  const intent = attacker.intent;
  switch (intent.kind) {
    case 'attack-weakest':
      return [...candidates].sort((left, right) => left.hp - right.hp || nearestFirst(left, right))[0];
    case 'attack-most-dangerous':
      return [...candidates].sort(
        (left, right) =>
          statsOf(right).damagePerTick - statsOf(left).damagePerTick || nearestFirst(left, right),
      )[0];
    case 'attack-kind': {
      const ofKind = candidates.filter((unit) => unit.kind === intent.unit);
      return [...(ofKind.length > 0 ? ofKind : candidates)].sort(nearestFirst)[0];
    }
    default:
      return [...candidates].sort(nearestFirst)[0];
  }
}
