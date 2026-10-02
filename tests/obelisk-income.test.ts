import { describe, it, expect } from 'vitest';
import { createMatch, ECONOMY, OBELISK_STATS, TICKS_PER_SECOND } from '@sim/index';
import type { Behaviour, MatchEvent, Release, Rule, SideId, UnitKind, WorldSnapshot } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Доход с Обелисков (спека 0003, тикет 23): своя Сторона получает
 * сверх базового дохода по +1.5 Эфира в секунду за каждый свой Обелиск.
 */

const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
const TAKE: Rule = { when: { kind: 'obelisk-in-range' }, do: { kind: 'siege-obelisk' } };
const TAKER: Behaviour = { scout: [TAKE, ADVANCE], tank: [TAKE, ADVANCE], ranger: [TAKE, ADVANCE] };

const deploy = (tick: number, side: SideId, unit: UnitKind = 'tank'): Release => ({
  tick,
  side,
  kind: 'deploy',
  roadId: 'north',
  unit,
});

interface Tick {
  readonly snapshot: WorldSnapshot;
  readonly events: readonly MatchEvent[];
}

function trace(releases: readonly Release[], maxTicks: number): Tick[] {
  const match = createMatch(
    matchSetup({
      map: arena,
      sides: [
        { id: 'A', behaviour: TAKER },
        { id: 'B', behaviour: TAKER },
      ],
      releases,
      maxTicks,
    }),
  );
  const ticks: Tick[] = [];
  while (!match.finished) ticks.push({ events: match.step(), snapshot: match.snapshot() });
  return ticks;
}

const captures = (ticks: readonly Tick[]) =>
  ticks.flatMap((tick, index) =>
    tick.events.flatMap((event) => (event.kind === 'obelisk-taken' ? [{ index, owner: event.owner }] : [])),
  );

const purse = (tick: Tick | undefined, side: SideId) => tick?.snapshot.ether.find((entry) => entry.side === side);

const MINUTE = 60 * TICKS_PER_SECOND;
const BASE = ECONOMY.incomePerSecond;
const WITH_OBELISK = ECONOMY.incomePerSecond + OBELISK_STATS.incomePerSecond;

describe('доход с Обелисков', () => {
  it('Сторона с Обелиском за минуту получает на 90 Эфира больше Стороны без него', () => {
    const ticks = trace([deploy(1, 'A'), deploy(2, 'A')], 1800);
    const [capture] = captures(ticks);
    expect(capture?.owner).toBe('A');

    const from = ticks[capture!.index]!;
    const to = ticks[capture!.index + MINUTE];
    expect(to).toBeDefined();
    const gained = (side: SideId) => (purse(to, side)?.amount ?? 0) - (purse(from, side)?.amount ?? 0);

    expect(gained('A') - gained('B')).toBeCloseTo(90, 6);
    expect(purse(to, 'A')?.incomePerSecond).toBe(WITH_OBELISK);
    expect(purse(to, 'B')?.incomePerSecond).toBe(BASE);
  });

  it('доход уходит вместе с Обелиском: после захвата противником прибавка у прежнего владельца пропадает', () => {
    const later = [700, 701, 702].map((tick) => deploy(tick, 'B'));
    const ticks = trace([deploy(1, 'A'), deploy(2, 'A'), ...later], 2400);
    const owners = captures(ticks);

    expect(owners.map((capture) => capture.owner)).toEqual(['A', 'B']);
    const [, lost] = owners;
    const before = ticks[lost!.index - 1];
    const after = ticks[lost!.index];

    expect(purse(before, 'A')?.incomePerSecond).toBe(WITH_OBELISK);
    expect(purse(after, 'A')?.incomePerSecond).toBe(BASE);
    expect(purse(after, 'B')?.incomePerSecond).toBe(WITH_OBELISK);
  });
});
