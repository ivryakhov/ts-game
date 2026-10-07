import { describe, it, expect } from 'vitest';
import { DEFAULT_BEHAVIOUR, runMatch, TICKS_PER_SECOND } from '@sim/index';
import { lineupOf, namesOf } from '../src/app/lineup.js';
import { loadOpponents } from '../src/app/opponents.js';
import { createReleaseLog, outcomeOf } from '../src/app/replay.js';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Показательный матч (тикет 26): за свою Сторону играет Противник,
 * и Юнитов обеих Сторон выпускают их Волны — человек только смотрит.
 */

const roster = loadOpponents(arena, 'B');
const player = { id: 'A' as const, behaviour: DEFAULT_BEHAVIOUR };
const lineup = (ally: string | null, opponent: string | null) =>
  lineupOf(roster.opponents, { ally, opponent }, 'A', 'B');

describe('кто играет за Стороны', () => {
  it('без Противника за себя играет человек со своими Правилами и без Волн', () => {
    const chosen = lineup(null, 'turtle');
    const [mine, theirs] = chosen.sides(player);

    expect(chosen.showcase).toBe(false);
    expect(mine).toEqual(player);
    expect(theirs.id).toBe('B');
    expect(theirs.waves?.length).toBeGreaterThan(0);
  });

  it('Противник за свою Сторону выходит со своими Правилами и Волнами, но под своим id', () => {
    const chosen = lineup('turtle', 'flank');
    const [mine, theirs] = chosen.sides(player);
    const turtle = roster.opponents.find((entry) => entry.id === 'turtle');

    expect(chosen.showcase).toBe(true);
    expect(mine.id).toBe('A');
    expect(mine.behaviour).toEqual(turtle?.side.behaviour);
    expect(mine.waves).toEqual(turtle?.side.waves);
    expect(theirs.id).toBe('B');
    expect(namesOf(chosen)).toEqual({ ally: 'turtle', opponent: 'flank' });
  });

  it('неизвестное имя за свою Сторону — играет человек, а не подставной Противник', () => {
    const chosen = lineup('no-such', 'turtle');

    expect(chosen.showcase).toBe(false);
    expect(chosen.ally).toBeNull();
    expect(chosen.sides(player)[0]).toEqual(player);
  });

  it('один и тот же Противник может играть сам с собой', () => {
    const [mine, theirs] = lineup('turtle', 'turtle').sides(player);

    expect(mine.id).toBe('A');
    expect(theirs.id).toBe('B');
    expect(mine.behaviour).toEqual(theirs.behaviour);
  });
});

describe('Показательный матч', () => {
  it('обе Стороны выпускают Юнитов Волнами без единого клика, и матч кончается победой одной из них', () => {
    const sides = [...lineup('turtle', 'flank').sides(player)];
    const result = runMatch(matchSetup({ map: arena, sides, maxTicks: 20 * 60 * TICKS_PER_SECOND }));
    const deployedBy = new Set(
      result.events.flatMap((event) => (event.kind === 'unit-deployed' ? [event.side] : [])),
    );

    expect(deployedBy).toEqual(new Set(['A', 'B']));
    expect(result.endReason).toBe('citadel-destroyed');
    expect(result.winner).not.toBeNull();
  });

  it('Повтор Показательного матча помнит, кто играл за игрока', () => {
    const log = createReleaseLog();
    log.beginLive(3, { ally: 'turtle', opponent: 'flank' });
    log.finish(outcomeOf('A', runMatch(matchSetup()).finalState));

    expect(log.last).toMatchObject({ seed: 3, ally: 'turtle', opponent: 'flank', releases: [] });
  });
});
