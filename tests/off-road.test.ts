import { describe, it, expect } from 'vitest';
import { BODY_RADIUS, createMatch, measureRoad, runMatch, UNIT_STATS } from '@sim/index';
import type {
  Behaviour,
  LiveMatch,
  MatchResult,
  Rule,
  ScheduledRelease,
  SideId,
  UnitKind,
  UnitSnapshot,
} from '@sim/index';
import { matchSetup, arenaWithoutObelisks } from './match-setup.js';

/**
 * Дорога — маршрут, а не рельсы (ADR-0004): Юнит сходит с неё, чтобы бить
 * врага, и возвращается; у него есть тело, и ближний бьёт только вплотную.
 */

const deploy = (
  tick: number,
  side: SideId,
  roadId = 'short',
  unit: UnitKind = 'scout',
): ScheduledRelease => ({ tick, side, kind: 'deploy', roadId, unit });

const run = (actions: readonly ScheduledRelease[], maxTicks = 3000): MatchResult =>
  runMatch(matchSetup({ map: arenaWithoutObelisks, releases: actions, maxTicks }));

const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

/** Большая свалка: обе Стороны выпускают смешанные Колонны по двум Дорогам. */
function brawl(): LiveMatch {
  const kinds: readonly UnitKind[] = ['tank', 'scout', 'ranger', 'scout', 'tank', 'ranger', 'scout'];
  const column = (side: SideId, roadId: string, from: number) =>
    kinds.map((unit, index) => deploy(from + index, side, roadId, unit));
  return createMatch(
    matchSetup({
      map: arenaWithoutObelisks,
      releases: [
        ...column('A', 'short', 1),
        ...column('B', 'short', 1),
        ...column('A', 'north', 200),
        ...column('B', 'north', 200),
      ],
      maxTicks: 2500,
    }),
  );
}

const between = (left: UnitSnapshot, right: UnitSnapshot): number =>
  Math.hypot(left.x - right.x, left.y - right.y);

describe('ближний удар — только вплотную', () => {
  it('бьющий всегда достаёт свою цель: ближний — касаясь её, Стрелок — со своей дальности', () => {
    const match = brawl();
    let hits = 0;

    while (!match.finished) {
      match.step();
      const units = match.snapshot().units;
      for (const unit of units) {
        if (unit.state !== 'fighting' || unit.target === null) continue;
        const target = units.find((other) => other.id === unit.target);
        if (!target) continue;
        hits += 1;
        expect(between(unit, target), `Юнит ${unit.id} → ${target.id}`).toBeLessThanOrEqual(
          UNIT_STATS[unit.kind].range + 1e-6,
        );
      }
    }

    expect(hits).toBeGreaterThan(0);
  });

  it('тела не проходят друг сквозь друга — ни свои, ни чужие', () => {
    // В давке тела могут на миг чуть налезть друг на друга, пока их
    // расталкивает, но не больше трети радиуса.
    const match = brawl();

    while (!match.finished) {
      match.step();
      const units = match.snapshot().units;
      for (let first = 0; first < units.length; first += 1) {
        for (let second = first + 1; second < units.length; second += 1) {
          const left = units[first];
          const right = units[second];
          if (!left || !right) continue;
          expect(between(left, right)).toBeGreaterThan(BODY_RADIUS * 2 - BODY_RADIUS / 3);
        }
      }
    }
  });

  it('вокруг одного врага бьётся столько ближних, сколько встанет к нему вплотную', () => {
    // Танк противника, заметив врага, встаёт; на него идут восемь
    // Разведчиков. Вплотную к телу такого же размера встаёт не больше
    // шести — остальные достать его не могут: сквозь своих не бьют.
    const standFast: Behaviour = everyone([
      { when: { kind: 'enemy-in-range' }, do: { kind: 'hold' } },
      { when: { kind: 'always' }, do: { kind: 'advance' } },
    ]);
    const eight = Array.from({ length: 8 }, (_, index) => deploy(1 + index, 'A'));
    const match = createMatch(
      matchSetup({
        map: arenaWithoutObelisks,
        sides: [{ id: 'A' }, { id: 'B', behaviour: standFast }],
        releases: [...eight, deploy(1, 'B', 'short', 'tank')],
        maxTicks: 400,
      }),
    );

    let most = 0;
    let crowded = false;
    while (!match.finished) {
      match.step();
      const ours = match.snapshot().units.filter((unit) => unit.side === 'A');
      const fighting = ours.filter((unit) => unit.state === 'fighting').length;
      most = Math.max(most, fighting);
      if (fighting > 0 && fighting < ours.length) crowded = true;
    }

    expect(most).toBeGreaterThanOrEqual(3);
    expect(most).toBeLessThanOrEqual(6);
    expect(crowded).toBe(true);
  });

  it('в Стычку вступают передовые, а не отставшие', () => {
    // Смотрим на Тик первого касания: позже отставшие обходят своих
    // и обступают врага, и «передний» теряет смысл.
    const massAttack = [...Array.from({ length: 5 }, (_, index) => deploy(1 + index, 'A')), deploy(1, 'B')];
    const match = createMatch(matchSetup({ map: arenaWithoutObelisks, releases: massAttack, maxTicks: 200 }));
    let units: readonly UnitSnapshot[] = [];
    while (!match.finished && !units.some((unit) => unit.state === 'fighting')) {
      match.step();
      units = match.snapshot().units.filter((unit) => unit.side === 'A');
    }
    const fighting = units.filter((unit) => unit.state === 'fighting');
    const idle = units.filter((unit) => unit.state !== 'fighting');

    expect(fighting).not.toHaveLength(0);
    expect(idle).not.toHaveLength(0);
    // Сторона A идёт от начала Дороги, поэтому передовой — с большей долей.
    const rearmostFighter = Math.min(...fighting.map((unit) => unit.progress));
    const foremostIdle = Math.max(...idle.map((unit) => unit.progress));
    expect(rearmostFighter).toBeGreaterThan(foremostIdle);
  });

});

describe('Юнит сходит с Дороги, чтобы бить, и возвращается на неё', () => {
  // Танк A осаждает Цитадель B с запада, придя по короткой Дороге.
  // Защитник B выходит по южной Дороге, которая уходит от стен на юг.
  const releases = [deploy(1, 'A', 'short', 'tank'), deploy(300, 'B', 'south', 'tank')];
  const south = measureRoad(arenaWithoutObelisks.roads.find((road) => road.id === 'south') ?? arenaWithoutObelisks.roads[0]!);
  const offRoad = (unit: UnitSnapshot | undefined): number => {
    if (!unit) return Number.NaN;
    const nearest = south.pointAtDistance(south.project(unit, unit.progress * south.length, 300));
    return Math.hypot(nearest.x - unit.x, nearest.y - unit.y);
  };
  const defender = (maxTicks: number) =>
    run(releases, maxTicks).finalState.units.find((unit) => unit.side === 'B');

  it('замечает врага у стен и уходит со своей Дороги, чтобы бить его', () => {
    const unit = defender(340);

    expect(unit?.roadId).toBe('south');
    expect(unit?.state).toBe('fighting');
    expect(offRoad(unit)).toBeGreaterThan(BODY_RADIUS * 2);
  });

  it('отбившись, возвращается на свою Дорогу и идёт по ней дальше', () => {
    const unit = defender(600);

    expect(unit?.state).toBe('moving');
    expect(offRoad(unit)).toBeLessThan(1);
    expect(unit?.progress ?? 1).toBeLessThan(0.7);
  });
});
