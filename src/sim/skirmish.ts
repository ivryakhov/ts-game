import { SKIRMISH } from './balance.js';
import type { UnitId, UnitState } from './types.js';
import type { Unit } from './unit.js';

/**
 * Стычка — столкновение Юнитов разных Сторон на одной Дороге.
 *
 * Ничего не хранится между Тиками: расстановка разбирается заново каждый
 * Тик, и из неё выводится, кто дерётся, кто ждёт очереди, а кто идёт.
 * Так не может возникнуть Юнита, который помнит, что дерётся, когда
 * драться уже не с кем, — именно такой застрявший Юнит похоронил
 * январскую попытку.
 *
 * Функция ничего не меняет: она возвращает решение, а применяет его мир.
 * Разбор Стычки должен быть проверяем сам по себе, без прогона матча.
 */

/** Сколько ударов получил Юнит за Тик и кто ударил последним. */
export interface Incoming {
  hits: number;
  lastAttacker: UnitId;
}

/** Что делать с Юнитами на Дороге в этот Тик. */
export interface SkirmishPlan {
  readonly states: ReadonlyMap<UnitId, UnitState>;
  readonly damage: ReadonlyMap<UnitId, Incoming>;
}

/** Положение Юнита вдоль Дороги, считая от её начала. */
export function positionOn(unit: Unit, roadLength: number): number {
  return unit.forward ? unit.travelled : roadLength - unit.travelled;
}

/**
 * Юниты одной Стороны на одной Дороге, выстроенные от переднего края
 * назад. При равном положении вперёд ставится тот, кто вышел раньше:
 * его номер меньше, а номера раздаются по порядку появления.
 */
interface Column {
  readonly ordered: readonly Unit[];
  readonly frontier: number;
}

export function planSkirmish(units: readonly Unit[], roadLength: number): SkirmishPlan {
  const states = new Map<UnitId, UnitState>(units.map((unit) => [unit.id, 'moving']));
  const damage = new Map<UnitId, Incoming>();

  const forward = columnOf(units, roadLength, true);
  const backward = columnOf(units, roadLength, false);
  if (!forward || !backward) return { states, damage };

  if (forward.frontier + SKIRMISH.engageRange < backward.frontier) return { states, damage };

  const attackers = engaged(forward, roadLength);
  const defenders = engaged(backward, roadLength);

  strike(attackers, defenders, states, damage);
  strike(defenders, attackers, states, damage);

  queueUp(forward.ordered, roadLength, states);
  queueUp(backward.ordered, roadLength, states);

  return { states, damage };
}

function columnOf(units: readonly Unit[], roadLength: number, forward: boolean): Column | null {
  const own = units.filter((unit) => unit.forward === forward);
  if (own.length === 0) return null;

  const ordered = [...own].sort((left, right) => {
    const gap = positionOn(right, roadLength) - positionOn(left, roadLength);
    if (gap !== 0) return forward ? gap : -gap;
    return left.id - right.id;
  });

  const leader = ordered[0];
  if (!leader) return null;

  return { ordered, frontier: positionOn(leader, roadLength) };
}

/**
 * Бьются только те, кто дотянулся: первые по счёту с переднего края
 * и не дальше дальности атаки от него. Без проверки расстояния третий
 * в колонне бил бы врага, стоя от него за сотню единиц карты, — скрытая
 * математика, которую игрок не может ни увидеть, ни предусмотреть
 * (ADR-0002).
 */
function engaged(column: Column, roadLength: number): readonly Unit[] {
  return column.ordered
    .slice(0, SKIRMISH.limit)
    .filter(
      (unit) => Math.abs(positionOn(unit, roadLength) - column.frontier) <= SKIRMISH.engageRange,
    );
}

/** Каждый боец бьёт своего противника; лишние распределяются по кругу. */
function strike(
  attackers: readonly Unit[],
  defenders: readonly Unit[],
  states: Map<UnitId, UnitState>,
  damage: Map<UnitId, Incoming>,
): void {
  if (defenders.length === 0) return;

  attackers.forEach((attacker, index) => {
    states.set(attacker.id, 'fighting');
    const target = defenders[index % defenders.length];
    if (!target) return;

    const incoming = damage.get(target.id);
    if (incoming) {
      incoming.hits += 1;
      incoming.lastAttacker = attacker.id;
      return;
    }
    damage.set(target.id, { hits: 1, lastAttacker: attacker.id });
  });
}

/**
 * Те, кто не попал в Стычку, упираются в спины своих и ждут очереди,
 * а не проходят насквозь. Участников Стычки это не касается: пометить
 * дерущегося ожидающим значит показать игроку не то, что происходит.
 */
function queueUp(
  ordered: readonly Unit[],
  roadLength: number,
  states: Map<UnitId, UnitState>,
): void {
  for (let index = 1; index < ordered.length; index += 1) {
    const unit = ordered[index];
    const ahead = ordered[index - 1];
    if (!unit || !ahead) continue;
    if (states.get(unit.id) === 'fighting') continue;
    if (states.get(ahead.id) === 'moving') continue;

    const gap = Math.abs(positionOn(unit, roadLength) - positionOn(ahead, roadLength));
    if (gap <= SKIRMISH.spacing) states.set(unit.id, 'waiting');
  }
}
