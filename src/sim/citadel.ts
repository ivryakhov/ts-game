import { CITADEL_STATS } from './balance.js';
import type { CitadelSnapshot, MatchEvent, Point, SideId, UnitId } from './types.js';
import { compareDistance, statsOf, type Unit } from './unit.js';

/**
 * Цитадель — главное строение Стороны. Её разрушение означает поражение,
 * и это единственный способ выиграть матч.
 */
export interface Citadel {
  readonly side: SideId;
  /**
   * Где она стоит. Враг не заходит внутрь, а встаёт вокруг. Бывает null
   * только на пустой тестовой карте без Дорог — там и подойти к ней некому.
   */
  readonly at: Point | null;
  hp: number;
  readonly maxHp: number;
  /** Кого Цитадель бьёт в этот Тик. Нужно показу: правило должно быть видно. */
  target: UnitId | null;
}

export function createCitadels(
  sides: readonly SideId[],
  placeOf: (side: SideId) => Point | null,
): Map<SideId, Citadel> {
  return new Map(
    sides.map((side) => [
      side,
      { side, at: placeOf(side), hp: CITADEL_STATS.maxHp, maxHp: CITADEL_STATS.maxHp, target: null },
    ]),
  );
}

/**
 * Урон, нанесённый осаждающими Юнитами. Каждый бьёт ту Цитадель,
 * к которой ведёт его Дорога, а не любую чужую: иначе при трёх
 * Сторонах один Юнит доставал бы всех врагов разом.
 *
 * Возвращает Стороны, чьи Цитадели пали в этом Тике.
 *
 * Осаждающие бьют слабее, чем в Стычке: до Цитадели доходит лишь доля
 * урона. Иначе прорвавшаяся Волна решала бы матч, а удерживать Дорогу
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

/** Юнит, до которого Цитадель может дотянуться, и расстояние до него. */
export interface InReach {
  readonly unit: Unit;
  /** По прямой от центра Цитадели. */
  readonly distance: number;
}

/**
 * Ответный удар Цитадели. Каждая бьёт одного вражеского Юнита в своём
 * радиусе — ближайшего к себе, а из стоящих вплотную того, кто встал
 * у стен первым.
 *
 * Правило намеренно простое и видимое (ADR-0002). Игрок может на него
 * опереться — пустить Танка вперёд, чтобы он принял удары на себя.
 *
 * Отбирать своих и уже погибших здесь не нужно: в радиус попадают
 * только враги, а каждая Цитадель бьёт одного.
 *
 * Возвращает погибших от ударов со стен.
 */
export function defend(
  citadels: ReadonlyMap<SideId, Citadel>,
  reachOf: (side: SideId) => readonly InReach[],
  tick: number,
  events: MatchEvent[],
): Set<UnitId> {
  const fallen = new Set<UnitId>();

  for (const citadel of citadels.values()) {
    citadel.target = null;
    if (citadel.hp <= 0) continue;

    const target = [...reachOf(citadel.side)].sort(
      (left, right) =>
        compareDistance(left.distance, right.distance) ||
        (left.unit.arrivedAt ?? Number.POSITIVE_INFINITY) -
          (right.unit.arrivedAt ?? Number.POSITIVE_INFINITY) ||
        left.unit.id - right.unit.id,
    )[0];
    if (!target) continue;

    citadel.target = target.unit.id;

    target.unit.hp -= CITADEL_STATS.damagePerTick;
    if (target.unit.hp > 0) continue;

    fallen.add(target.unit.id);
    events.push({
      kind: 'unit-died',
      tick,
      unitId: target.unit.id,
      side: target.unit.side,
      roadId: target.unit.roadId,
      killer: { kind: 'citadel', side: citadel.side },
    });
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
    target: citadel.target,
  }));
}
