import { describe, it, expect } from 'vitest';
import { DEFAULT_BEHAVIOUR, runMatch, TICKS_PER_SECOND } from '@sim/index';
import type { Action, Behaviour, Condition, MatchResult, Release, Rule, SideId, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * «И» в Правиле (ADR-0005): до трёх Условий, Правило срабатывает, только
 * когда истинны все. И Условие «у своей Цитадели», с которым «И» копит
 * армию дома.
 */

const release = (tick: number, side: SideId, unit: UnitKind = 'scout'): Release => ({
  tick,
  side,
  kind: 'deploy',
  roadId: 'short',
  unit,
});
const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

const HOME: Condition = { kind: 'at-home' };
const HOLD: Action = { kind: 'hold' };
const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
const FIGHT: Rule = { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } };

function play(ours: Behaviour, releases: readonly Release[], maxTicks: number, theirs = DEFAULT_BEHAVIOUR) {
  return runMatch(
    matchSetup({
      map: arena,
      sides: [
        { id: 'A', behaviour: ours },
        { id: 'B', behaviour: theirs },
      ],
      releases,
      maxTicks,
    }),
  );
}

const sideUnits = (result: MatchResult, side: SideId) =>
  result.finalState.units.filter((unit) => unit.side === side);
const first = (result: MatchResult, side: SideId) => sideUnits(result, side)[0];

describe('Правило с двумя Условиями', () => {
  // «Стоять, если я у своей Цитадели и впереди враг».
  const wary = everyone([{ when: [HOME, { kind: 'enemy-ahead' }], do: HOLD }, ADVANCE]);

  it('не срабатывает, когда истинно только «у своей Цитадели»', () => {
    const result = play(wary, [release(1, 'A')], 20);
    expect(first(result, 'A')?.progress).toBeGreaterThan(0);
    expect(first(result, 'A')?.rule).toBe(1);
  });

  it('не срабатывает, когда истинно только «враг впереди»', () => {
    // Наш ушёл от ворот, и лишь потом на Дороге появился враг.
    const result = play(wary, [release(1, 'A'), release(30, 'B')], 32);
    expect(first(result, 'A')?.state).toBe('moving');
    expect(first(result, 'A')?.rule).toBe(1);
  });

  it('срабатывает, когда истинны оба', () => {
    const result = play(wary, [release(1, 'A'), release(1, 'B')], 20);
    expect(first(result, 'A')?.state).toBe('holding');
    expect(first(result, 'A')?.progress).toBe(0);
    expect(first(result, 'A')?.rule).toBe(0);
  });
});

describe('Условие «у своей Цитадели»', () => {
  it('только что выпущенный Юнит уже у своей Цитадели', () => {
    const stayHome = everyone([{ when: HOME, do: HOLD }, ADVANCE]);
    const result = play(stayHome, [release(1, 'A')], 2);
    expect(first(result, 'A')?.rule).toBe(0);
  });

  it('ушедший от ворот — уже не у своей Цитадели', () => {
    const leave = everyone([{ when: [HOME, { kind: 'hp-below', percent: 1 }], do: HOLD }, ADVANCE]);
    const result = play(leave, [release(1, 'A')], 60);
    expect(first(result, 'A')?.progress).toBeGreaterThan(0.1);
  });
});

describe('сбор дома: «у своей Цитадели и своих рядом меньше 2 → стоять»', () => {
  const gather = everyone([
    { when: [HOME, { kind: 'allies-nearby', compare: 'fewer', count: 2 }], do: HOLD },
    FIGHT,
    ADVANCE,
  ]);
  const straggling = [release(1, 'A'), release(40, 'A'), release(80, 'A')];

  it('выпущенный один остаётся дома', () => {
    const result = play(gather, [release(1, 'A')], 10 * TICKS_PER_SECOND);
    expect(first(result, 'A')?.progress).toBe(0);
    expect(first(result, 'A')?.state).toBe('holding');
  });

  it('двое ждут третьего у ворот', () => {
    const result = play(gather, straggling.slice(0, 2), 79);
    expect(sideUnits(result, 'A')).toHaveLength(2);
    expect(sideUnits(result, 'A').every((unit) => unit.progress * 900 < 30)).toBe(true);
  });

  it('втроём выходят вместе', () => {
    const result = play(gather, straggling, 110);
    const at = sideUnits(result, 'A').map((unit) => unit.progress * 900);

    expect(Math.min(...at)).toBeGreaterThan(30);
    expect(Math.max(...at) - Math.min(...at)).toBeLessThan(100);
  });
});

describe('зеркальность', () => {
  it('матч с одинаковыми Правилами, включая «И», остаётся зеркальным', () => {
    const rules = everyone([
      { when: [HOME, { kind: 'hp-below', percent: 100 }], do: { kind: 'retreat' } },
      { when: [HOME, { kind: 'allies-nearby', compare: 'fewer', count: 2 }], do: HOLD },
      { when: [{ kind: 'hp-below', percent: 50 }, { kind: 'enemies-in-skirmish', above: 1 }], do: { kind: 'retreat' } },
      FIGHT,
      ADVANCE,
    ]);
    const both = (tick: number, unit: UnitKind) => [release(tick, 'A', unit), release(tick, 'B', unit)];
    const releases = [...both(1, 'tank'), ...both(2, 'ranger'), ...both(3, 'scout'), ...both(200, 'ranger')];
    const result = play(rules, releases, 90 * TICKS_PER_SECOND, rules);

    const bySide = (id: SideId) => ({
      citadel: result.finalState.citadels.find((citadel) => citadel.side === id)?.hp,
      alive: sideUnits(result, id).map((unit) => [unit.kind, unit.hp, unit.state, unit.rule]),
      died: result.events.filter((event) => event.kind === 'unit-died' && event.side === id).length,
    });

    expect(bySide('A')).toEqual(bySide('B'));
  });
});
