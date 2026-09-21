import { CITADEL_STATS } from './balance.js';
import type { CitadelSnapshot, MatchEvent, SideId } from './types.js';
import { statsOf, type Unit } from './unit.js';

/**
 * Цитадель — главное строение Стороны. Её разрушение означает поражение,
 * и это единственный способ выиграть матч.
 */
export interface Citadel {
  readonly side: SideId;
  hp: number;
  readonly maxHp: number;
}

export function createCitadels(sides: readonly SideId[]): Map<SideId, Citadel> {
  return new Map(
    sides.map((side) => [side, { side, hp: CITADEL_STATS.maxHp, maxHp: CITADEL_STATS.maxHp }]),
  );
}

/**
 * Урон, нанесённый осаждающими Юнитами. Каждый бьёт ту Цитадель,
 * к которой пришёл по своей Дороге, а не любую чужую: иначе при трёх
 * Сторонах один Юнит доставал бы всех врагов разом.
 *
 * Возвращает Стороны, чьи Цитадели пали в этом Тике.
 *
 * Осаждающие бьют слабее, чем в Стычке: до Цитадели доходит лишь доля
 * урона. Иначе прорвавшаяся волна решала бы матч, а удерживать Дорогу
 * не имело бы смысла.
 */
export function bombard(
  besiegers: readonly { unit: Unit; target: SideId }[],
  citadels: ReadonlyMap<SideId, Citadel>,
  tick: number,
  events: MatchEvent[],
): Set<SideId> {
  const fallen = new Set<SideId>();

  for (const { unit, target } of besiegers) {
    const citadel = citadels.get(target);
    if (!citadel || citadel.hp <= 0 || citadel.side === unit.side) continue;

    citadel.hp -= statsOf(unit).damagePerTick * CITADEL_STATS.damageShare;
    if (citadel.hp > 0) continue;

    citadel.hp = 0;
    fallen.add(citadel.side);
    events.push({ kind: 'citadel-destroyed', tick, side: citadel.side });
  }

  return fallen;
}

export function citadelSnapshots(
  citadels: ReadonlyMap<SideId, Citadel>,
): readonly CitadelSnapshot[] {
  return [...citadels.values()].map((citadel) => ({
    side: citadel.side,
    hp: citadel.hp,
    maxHp: citadel.maxHp,
  }));
}
