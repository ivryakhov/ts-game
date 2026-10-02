import { BODY_RADIUS, CITADEL_RADIUS } from './balance.js';
import type { UnitId, UnitState } from './types.js';
import { isAttack } from './rules.js';
import { compareDistance, distanceTo, statsOf, type Unit } from './unit.js';

/**
 * Стычка — столкновение враждебных Юнитов на поле. Юнит, которому Правило
 * велит атаковать, бьёт врага, до которого дотянулся, а если не дотянулся
 * ни до кого, но видит врагов, — идёт, сходя с Дороги, к тому из них,
 * кого выбрало его Действие: слабейшему, самому опасному, заданного типа
 * или ближайшему.
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

/** Один удар Стычки: кто, кого и с какой силой. Нужен разбору матча. */
export interface Blow {
  readonly attacker: Unit;
  readonly target: UnitId;
  readonly amount: number;
}

/** Что делать с Юнитами в этот Тик. */
export interface SkirmishPlan {
  readonly states: ReadonlyMap<UnitId, UnitState>;
  readonly damage: ReadonlyMap<UnitId, Incoming>;
  /** Кого бьёт каждый атакующий — для показа игроку. */
  readonly targets: ReadonlyMap<UnitId, UnitId>;
  /**
   * К кому идёт атакующий, не дотянувшийся ни до кого: он сходит с Дороги
   * и сближается с врагом, которого его Действие выбрало среди видимых.
   */
  readonly chase: ReadonlyMap<UnitId, UnitId>;
  /** Все удары Тика в порядке ходов атакующих. */
  readonly blows: readonly Blow[];
}

/**
 * С какого расстояния между центрами Юнит бьёт другого Юнита. Ближнему
 * нужно встать вплотную — тело к телу с небольшим зазором.
 */
export function reachOf(unit: Unit): number {
  return statsOf(unit).range;
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
  const blows: Blow[] = [];

  for (const attacker of units) {
    // Драться хочет не каждый: Правило могло велеть идти, стоять или бежать.
    if (!isAttack(attacker.intent)) continue;

    const seen = focusOf(attacker, enemiesInSight(attacker, units));
    const reachable = seen.filter((enemy) => distanceTo(attacker, enemy) <= reachOf(attacker));
    const target = pickTarget(attacker, reachable);

    if (!target) {
      // Никого не достать, но кого-то видно — идём к тому, кого выбрало Действие.
      const goal = pickTarget(attacker, seen);
      if (goal) chase.set(attacker.id, goal.id);
      continue;
    }

    states.set(attacker.id, 'fighting');
    targets.set(attacker.id, target.id);

    const blow = statsOf(attacker).damagePerTick;
    blows.push({ attacker, target: target.id, amount: blow });
    const incoming = damage.get(target.id);
    if (incoming) {
      incoming.damage += blow;
      incoming.lastAttacker = attacker.id;
      continue;
    }
    damage.set(target.id, { damage: blow, lastAttacker: attacker.id });
  }

  return { states, damage, targets, chase, blows };
}

/**
 * Ближний, которому велено бить заданный тип, пока видит такого врага,
 * других не замечает: иначе Разведчик, задев плечом Танка на пути
 * к Стрелкам, так и остался бы бить Танка. Не видно таких — бьёт кого
 * достанет. Стрелок не сужает выбор: пока он кого-то достаёт, он бьёт
 * с места и не уходит к дальней цели.
 */
function focusOf(attacker: Unit, seen: Unit[]): Unit[] {
  const intent = attacker.intent;
  if (intent.kind !== 'attack-kind' || statsOf(attacker).ranged) return seen;
  const ofKind = seen.filter((enemy) => enemy.kind === intent.unit);
  return ofKind.length > 0 ? ofKind : seen;
}

/**
 * Цель по Действию атакующего среди кандидатов: тех, до кого он
 * дотянулся, — для удара, или всех видимых — для сближения.
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
