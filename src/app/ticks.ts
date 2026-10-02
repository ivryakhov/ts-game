import type { LiveMatch, SideId, UnitId, WorldSnapshot } from '@sim/index';

/**
 * Что случилось за Тики одного кадра. На восьмикратной скорости Тиков
 * в кадре несколько, и ни одна смерть, ни один удар по стенам, ни одно
 * падение Обелиска не должны пропасть между ними.
 */
export interface FrameTicks {
  readonly previous: WorldSnapshot;
  readonly current: WorldSnapshot;
  readonly deaths: ReadonlySet<UnitId>;
  readonly citadelHits: ReadonlySet<SideId>;
  readonly obelisksTaken: ReadonlySet<string>;
  /** Игроку не хватило Эфира на Выпуск. */
  readonly refused: boolean;
}

/** Сыграть `due` Тиков матча, начиная со снимка `start`. */
export function playTicks(
  match: LiveMatch,
  due: number,
  start: { previous: WorldSnapshot; current: WorldSnapshot },
  playerSide: SideId,
): FrameTicks {
  let { previous, current } = start;
  const deaths = new Set<UnitId>();
  const citadelHits = new Set<SideId>();
  const obelisksTaken = new Set<string>();
  let refused = false;

  for (let tick = 0; tick < due && !match.finished; tick += 1) {
    previous = current;
    for (const event of match.step()) {
      if (event.kind === 'unit-died') deaths.add(event.unitId);
      if (event.kind === 'obelisk-taken') obelisksTaken.add(event.obeliskId);
      if (event.kind === 'deploy-refused' && event.side === playerSide) refused = true;
    }

    const next = match.snapshot();
    for (const citadel of current.citadels) {
      const after = next.citadels.find((candidate) => candidate.side === citadel.side);
      if (after && after.hp < citadel.hp) citadelHits.add(citadel.side);
    }
    current = next;
  }

  return { previous, current, deaths, citadelHits, obelisksTaken, refused };
}
