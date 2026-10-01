import { OBELISK_RADIUS, OBELISK_STATS } from './balance.js';
import { wallOrder, type InReach } from './citadel.js';
import type { Structure } from './structure.js';
import type { MatchEvent, ObeliskSnapshot, ObeliskSpec, Point, SideId, UnitId } from './types.js';
import { compareDistance, distanceTo, type Unit } from './unit.js';

/**
 * Обелиск — строение у обочины обходной Дороги (ADR-0006). Он отбивается
 * сам, как стены Цитадели, но слабее: ничей бьёт идущих мимо Юнитов любой
 * Стороны, захваченный — только врагов владельца.
 */
export interface Obelisk extends Structure {
  readonly kind: 'obelisk';
  readonly id: string;
  owner: SideId | null;
  readonly at: Point;
  readonly maxHp: number;
  /** Кого Обелиск бьёт в этот Тик — всех, если удар делится. Нужно показу. */
  targets: UnitId[];
}

export function createObelisks(specs: readonly ObeliskSpec[]): Obelisk[] {
  return specs.map((spec) => ({
    kind: 'obelisk',
    id: spec.id,
    owner: null,
    at: spec.at,
    radius: OBELISK_RADIUS,
    hp: OBELISK_STATS.maxHp,
    maxHp: OBELISK_STATS.maxHp,
    targets: [],
  }));
}

/**
 * Удар Обелисков. Каждый бьёт ближайшего к своему центру Юнита в дальности,
 * из равноудалённых одной Стороны — в том же порядке, что стены Цитадели.
 * Если ближайшие на равном расстоянии принадлежат разным Сторонам, удар
 * делится между ними поровну: номер Юнита не решает ничью между Сторонами,
 * и одинаковые Правила дают зеркальный матч (ADR-0004).
 *
 * Возвращает погибших от ударов Обелисков.
 */
export function obelisksFire(
  obelisks: readonly Obelisk[],
  units: readonly Unit[],
  tick: number,
  events: MatchEvent[],
): Set<UnitId> {
  const fallen = new Set<UnitId>();

  for (const obelisk of obelisks) {
    obelisk.targets = [];
    if (obelisk.hp <= 0) continue;

    const targets = targetsOf(obelisk, units.filter((unit) => !fallen.has(unit.id)));
    if (targets.length === 0) continue;
    obelisk.targets = targets.map((unit) => unit.id);

    const blow = OBELISK_STATS.damagePerTick / targets.length;
    for (const unit of targets) {
      unit.hp -= blow;
      if (unit.hp > 0) continue;

      fallen.add(unit.id);
      events.push({
        kind: 'unit-died',
        tick,
        unitId: unit.id,
        side: unit.side,
        roadId: unit.roadId,
        killer: { kind: 'obelisk', obeliskId: obelisk.id },
      });
    }
  }

  return fallen;
}

/** Кого Обелиск бьёт: по одному Юниту от каждой Стороны среди ближайших. */
function targetsOf(obelisk: Obelisk, units: readonly Unit[]): Unit[] {
  const inReach: InReach[] = units.flatMap((unit) => {
    if (unit.side === obelisk.owner) return [];
    const distance = distanceTo(unit, obelisk.at);
    return distance <= OBELISK_STATS.range ? [{ unit, distance }] : [];
  });
  const ordered = inReach.sort(wallOrder);
  const nearest = ordered[0];
  if (!nearest) return [];

  const picked = new Map<SideId, Unit>();
  for (const { unit, distance } of ordered) {
    if (compareDistance(distance, nearest.distance) !== 0) break;
    if (!picked.has(unit.side)) picked.set(unit.side, unit);
  }
  return [...picked.values()];
}

export function obeliskSnapshots(obelisks: readonly Obelisk[]): readonly ObeliskSnapshot[] {
  return obelisks.map((obelisk) => ({
    id: obelisk.id,
    owner: obelisk.owner,
    hp: obelisk.hp,
    maxHp: obelisk.maxHp,
    targets: [...obelisk.targets],
  }));
}
