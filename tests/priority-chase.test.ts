import { describe, it, expect } from 'vitest';
import { createMatch, runMatch, TICKS_PER_SECOND } from '@sim/index';
import type { Action, Behaviour, MatchResult, Release, Rule, SideId, UnitKind, WorldSnapshot } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Сближение по приоритету (задача #37): атакующий, который никого
 * не достаёт, идёт к врагу, выбранному его Действием среди видимых,
 * а не к ближайшему. Ближний с «бить тип», пока видит врага этого типа,
 * идёт к нему и не вязнет в других.
 */

const release = (tick: number, side: SideId, unit: UnitKind): Release => ({
  tick,
  side,
  kind: 'deploy',
  roadId: 'short',
  unit,
});
const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
const FIGHT = (act: Action): Rule => ({ when: { kind: 'enemy-in-range' }, do: act });
const MARCH = everyone([ADVANCE]);

function play(ours: Behaviour, releases: readonly Release[], maxTicks: number, theirs: Behaviour = MARCH): MatchResult {
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

function trace(ours: Behaviour, releases: readonly Release[], maxTicks: number): WorldSnapshot[] {
  const match = createMatch(
    matchSetup({
      map: arena,
      sides: [
        { id: 'A', behaviour: ours },
        { id: 'B', behaviour: MARCH },
      ],
      releases,
      maxTicks,
    }),
  );
  const ticks: WorldSnapshot[] = [];
  while (!match.finished) {
    match.step();
    ticks.push(match.snapshot());
  }
  return ticks;
}

/** Сколько здоровья потерял враг заданного типа на Стороне B; погибший — всё. */
const hurt = (result: MatchResult, kind: UnitKind): number => {
  const died = result.events.some((event) => event.kind === 'unit-died' && event.side === 'B');
  const unit = result.finalState.units.find((enemy) => enemy.side === 'B' && enemy.kind === kind);
  if (!unit) return died ? Infinity : 0;
  return unit.maxHp - unit.hp;
};

const ATTACK_RANGER: Action = { kind: 'attack-kind', unit: 'ranger' };

describe('ближний идёт к цели своего Действия', () => {
  /**
   * Навстречу Разведчику идут Танк и за ним Стрелок; они не отвечают.
   * Разведчик ни до кого не достаёт, пока не подойдёт, — и к кому он
   * подходит, решает его Действие.
   */
  const column = [release(1, 'A', 'scout'), release(1, 'B', 'tank'), release(4, 'B', 'ranger')];
  const scoutWith = (act: Action) => play({ ...MARCH, scout: [FIGHT(act), ADVANCE] }, column, 180);

  it('Разведчик с «атаковать Стрелка» обходит Танка и бьёт Стрелка за его спиной', () => {
    const result = scoutWith(ATTACK_RANGER);

    expect(hurt(result, 'ranger')).toBeGreaterThan(0);
    expect(hurt(result, 'tank')).toBe(0);
  });

  it('с «атаковать ближайшего» тот же Разведчик бьёт Танка', () => {
    const result = scoutWith({ kind: 'attack-nearest' });

    expect(hurt(result, 'tank')).toBeGreaterThan(0);
    expect(hurt(result, 'ranger')).toBe(0);
  });

  it('ближний с «атаковать слабейшего» идёт к слабейшему из видимых, а не к ближайшему', () => {
    // Впереди Колонны B Танк, за ним Разведчик: у него меньше здоровья.
    const releases = [release(1, 'A', 'tank'), release(1, 'B', 'tank'), release(4, 'B', 'scout')];
    const ticks = trace({ ...MARCH, tank: [FIGHT({ kind: 'attack-weakest' }), ADVANCE] }, releases, 180);

    // Стычка решает по расстановке прошлого Тика: видимость меряем по ней.
    const goals = ticks.slice(1).flatMap((tick, index) => {
      const before = ticks[index]!;
      const at = (side: SideId, kind: UnitKind) =>
        before.units.find((unit) => unit.side === side && unit.kind === kind);
      const ours = at('A', 'tank');
      const theirs = [at('B', 'tank'), at('B', 'scout')];
      const bothSeen = ours && theirs.every((unit) => unit && Math.hypot(unit.x - ours.x, unit.y - ours.y) <= 130);
      const now = tick.units.find((unit) => unit.id === ours?.id);
      const goal = tick.units.find((unit) => unit.id === now?.chasing);
      return bothSeen && goal ? [goal.kind] : [];
    });

    expect(goals.length).toBeGreaterThan(0);
    expect(new Set(goals)).toEqual(new Set(['scout']));
  });
});

describe('Стрелок не уходит с места ради дальней цели', () => {
  it('с «атаковать Разведчика», достав Танка, бьёт Танка, хотя Разведчика уже видно', () => {
    const releases = [release(1, 'A', 'ranger'), release(1, 'B', 'tank'), release(20, 'B', 'scout')];
    const ticks = trace({ ...MARCH, ranger: [FIGHT({ kind: 'attack-kind', unit: 'scout' }), ADVANCE] }, releases, 200);

    // Тики, когда Танк в досягаемости, а Разведчик виден, но не достать.
    // Стычка решает по расстановке прошлого Тика: расстояния меряем по ней.
    const torn = ticks.slice(1).flatMap((tick, index) => {
      const before = ticks[index]!;
      const at = (kind: UnitKind, side: SideId) =>
        before.units.find((unit) => unit.side === side && unit.kind === kind);
      const shooter = at('ranger', 'A');
      const tank = at('tank', 'B');
      const scout = at('scout', 'B');
      const now = tick.units.find((unit) => unit.id === shooter?.id);
      if (!shooter || !tank || !scout || !now) return [];
      const to = (unit: { x: number; y: number }) => Math.hypot(unit.x - shooter.x, unit.y - shooter.y);
      return to(tank) <= 95 && to(scout) > 95 && to(scout) <= 150 ? [{ shooter: now, tank }] : [];
    });

    expect(torn.length).toBeGreaterThan(0);
    for (const { shooter, tank } of torn) {
      expect(shooter.target).toBe(tank.id);
      expect(shooter.chasing).toBeNull();
    }
  });
});

describe('зеркальность с «атаковать тип»', () => {
  it('матч с одинаковыми Правилами, включая «атаковать тип», остаётся зеркальным', () => {
    const rules: Behaviour = {
      scout: [FIGHT(ATTACK_RANGER), ADVANCE],
      tank: [FIGHT({ kind: 'attack-most-dangerous' }), ADVANCE],
      ranger: [FIGHT({ kind: 'attack-kind', unit: 'scout' }), ADVANCE],
    };
    const both = (tick: number, unit: UnitKind) => [release(tick, 'A', unit), release(tick, 'B', unit)];
    const releases = [...both(1, 'tank'), ...both(2, 'ranger'), ...both(3, 'scout'), ...both(40, 'scout')];
    const result = play(rules, releases, 90 * TICKS_PER_SECOND, rules);

    const bySide = (id: SideId) => ({
      citadel: result.finalState.citadels.find((citadel) => citadel.side === id)?.hp,
      alive: result.finalState.units
        .filter((unit) => unit.side === id)
        .map((unit) => [unit.kind, unit.hp, unit.state, unit.rule]),
      died: result.events.filter((event) => event.kind === 'unit-died' && event.side === id).length,
    });

    expect(result.events.some((event) => event.kind === 'unit-died')).toBe(true);
    expect(bySide('A')).toEqual(bySide('B'));
  });
});
