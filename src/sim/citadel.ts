import { CITADEL_RADIUS, CITADEL_STATS } from './balance.js';
import type { Structure } from './structure.js';
import type { CitadelSnapshot, MatchEvent, Point, SideId, UnitId } from './types.js';
import { compareDistance, type Unit } from './unit.js';

/**
 * Цитадель — главное строение Стороны. Её разрушение означает поражение,
 * и это единственный способ выиграть матч.
 */
export interface Citadel extends Structure {
  readonly kind: 'citadel';
  readonly side: SideId;
  /** Владелец Цитадели не меняется: это её Сторона. */
  readonly owner: SideId;
  readonly maxHp: number;
  /** Кого Цитадель бьёт в этот Тик. Нужно показу: правило должно быть видно. */
  target: UnitId | null;
}

export function createCitadels(
  sides: readonly SideId[],
  placeOf: (side: SideId) => Point | null,
): Map<SideId, Citadel> {
  return new Map(
    sides.map((side): [SideId, Citadel] => [
      side,
      {
        kind: 'citadel',
        side,
        owner: side,
        at: placeOf(side),
        radius: CITADEL_RADIUS,
        hp: CITADEL_STATS.maxHp,
        maxHp: CITADEL_STATS.maxHp,
        target: null,
      },
    ]),
  );
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
