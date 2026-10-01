import { describe, it, expect } from 'vitest';
import { BODY_RADIUS, createMatch, OBELISK_RADIUS, OBELISK_STATS, runMatch } from '@sim/index';
import type { Behaviour, GameMap, Point, Release, Rule, SideId, UnitKind, UnitSnapshot } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { army, matchSetup } from './match-setup.js';

/**
 * Обелиск на поле (спека 0003, тикет 21): ничей Обелиск у обочины
 * обходной Дороги бьёт идущих мимо Юнитов любой Стороны.
 */

const NORTH = arena.obelisks.find((obelisk) => obelisk.id === 'north')?.at ?? { x: 0, y: 0 };
const CITADEL_B = arena.citadels.find((citadel) => citadel.side === 'B')?.at ?? { x: 0, y: 0 };

const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
const FIGHT: Rule = { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } };
const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

const deploy = (side: SideId, roadId: string, unit: UnitKind = 'scout'): Release => ({
  tick: 1,
  side,
  kind: 'deploy',
  roadId,
  unit,
});

const away = (unit: UnitSnapshot, point: Point) => Math.hypot(unit.x - point.x, unit.y - point.y);

/** Покадровая запись матча: каждый Тик — снимок мира. */
function trace(releases: readonly Release[], maxTicks: number, behaviour = everyone([ADVANCE])) {
  const match = createMatch(
    matchSetup({
      map: arena,
      sides: [
        { id: 'A', behaviour },
        { id: 'B', behaviour },
      ],
      releases,
      maxTicks,
    }),
  );
  const ticks = [];
  while (!match.finished) {
    match.step();
    ticks.push(match.snapshot());
  }
  return ticks;
}

describe('ничейный Обелиск', () => {
  it.each(['A', 'B'] as const)('бьёт идущего мимо Юнита Стороны %s, а до дальности не трогает', (side) => {
    const ticks = trace([deploy(side, 'north')], 400);
    const passing = ticks.map((tick) => ({
      unit: tick.units[0],
      obelisk: tick.obelisks.find((obelisk) => obelisk.id === 'north'),
    }));

    const firstStruck = passing.findIndex(({ unit, obelisk }) => unit && obelisk?.target === unit.id);
    const before = passing.slice(0, firstStruck);
    const struck = passing.filter(({ unit, obelisk }) => unit && obelisk?.target === unit.id);
    const after = passing.find(
      ({ unit }) =>
        unit &&
        away(unit, NORTH) > OBELISK_STATS.range &&
        Math.abs(unit.x - NORTH.x) > OBELISK_STATS.range &&
        (side === 'A' ? unit.x > NORTH.x : unit.x < NORTH.x),
    )?.unit;

    expect(firstStruck).toBeGreaterThan(0);
    expect(before.every(({ unit }) => unit && away(unit, NORTH) > OBELISK_STATS.range)).toBe(true);
    expect(before.every(({ unit }) => unit?.hp === unit?.maxHp)).toBe(true);
    expect(struck.length).toBeGreaterThan(0);
    expect(struck.every(({ unit }) => away(unit!, NORTH) <= OBELISK_STATS.range)).toBe(true);
    // Около 12 здоровья за проход мимо (спека 0003, «Числа»).
    expect(after).toBeDefined();
    expect(after!.maxHp - after!.hp).toBeGreaterThan(8);
    expect(after!.maxHp - after!.hp).toBeLessThan(16);
  });

  it('Юнит на короткой Дороге, вне его дальности, здоровья не теряет', () => {
    const ticks = trace([deploy('A', 'short')], 120);
    const unit = ticks.at(-1)?.units[0];

    expect(away(unit!, CITADEL_B)).toBeGreaterThan(110);
    expect(unit?.hp).toBe(unit?.maxHp);
    expect(ticks.every((tick) => tick.obelisks.every((obelisk) => obelisk.target === null))).toBe(true);
  });

  it('Юнитам разных Сторон на равном расстоянии достаётся по половине удара', () => {
    // Встречные Разведчики на северной Дороге сходятся под Обелиском
    // и останавливаются друг перед другом: оба одинаково от него далеко.
    const ticks = trace([deploy('A', 'north'), deploy('B', 'north')], 400);
    const halves = ticks.flatMap((tick, index) => {
      const previous = ticks[index - 1];
      const [left, right] = tick.units;
      if (!previous || !left || !right) return [];
      if (Math.abs(away(left, NORTH) - away(right, NORTH)) > 1e-6) return [];
      if (away(left, NORTH) > OBELISK_STATS.range) return [];
      const lost = (unit: UnitSnapshot) =>
        (previous.units.find((before) => before.id === unit.id)?.hp ?? 0) - unit.hp;
      return [[lost(left), lost(right)]];
    });

    expect(halves.length).toBeGreaterThan(0);
    for (const [left, right] of halves) {
      expect(left).toBeCloseTo(OBELISK_STATS.damagePerTick / 2, 9);
      expect(right).toBeCloseTo(OBELISK_STATS.damagePerTick / 2, 9);
    }
  });

  it('сквозь его тело не проходит ни один Юнит', () => {
    // Свалка на северной Дороге прямо под Обелиском.
    const kinds: readonly UnitKind[] = ['tank', 'scout', 'ranger', 'scout', 'tank'];
    const column = (side: SideId) =>
      kinds.map((unit, index): Release => ({ tick: 1 + index * 10, side, kind: 'deploy', roadId: 'north', unit }));
    const ticks = trace([...column('A'), ...column('B')], 900, everyone([FIGHT, ADVANCE]));

    const closest = Math.min(...ticks.flatMap((tick) => tick.units.map((unit) => away(unit, NORTH))));
    // Координаты привязаны к сетке 1/1024 — отсюда допуск.
    expect(closest).toBeGreaterThan(OBELISK_RADIUS + BODY_RADIUS - 0.01);
  });
});

describe('Обелиски на карте', () => {
  const reading = (map: GameMap) => () => runMatch(matchSetup({ map, maxTicks: 1 }));
  const moved = (at: Point): GameMap => ({
    ...arena,
    obelisks: arena.obelisks.map((obelisk) => (obelisk.id === 'north' ? { ...obelisk, at } : obelisk)),
  });

  it('стоят зеркально: на вертикальной оси, северный — отражение южного', () => {
    const [north, south] = arena.obelisks;

    expect(arena.obelisks).toHaveLength(2);
    expect(north?.at.x).toBe(arena.size.width / 2);
    expect(south?.at.x).toBe(arena.size.width / 2);
    expect((north?.at.y ?? 0) + (south?.at.y ?? 0)).toBe(arena.size.height);
    expect(reading(arena)).not.toThrow();
  });

  it('Обелиск, задевающий идущих по Дороге, отвергается', () => {
    expect(reading(moved({ x: NORTH.x, y: 100 }))).toThrow(/Обелиск north: задевает идущих по Дороге north/);
  });

  it('Обелиск, налезающий на Цитадель, отвергается', () => {
    // Без Дорог: иначе у Цитадели Обелиск раньше задел бы идущих по ним.
    const roadless = { ...moved({ x: CITADEL_B.x - 50, y: CITADEL_B.y }), roads: [] };
    expect(reading(roadless)).toThrow(
      /Обелиск north: налезает на Цитадель Стороны B/,
    );
  });

  it('два Обелиска с одним идентификатором отвергаются', () => {
    const twins: GameMap = { ...arena, obelisks: arena.obelisks.map((obelisk) => ({ ...obelisk, id: 'twin' })) };
    expect(reading(twins)).toThrow(/один идентификатор/);
  });
});

describe('зеркальность с Обелисками', () => {
  it('матч с одинаковыми Правилами на арене с Обелисками остаётся зеркальным', () => {
    const same = everyone([FIGHT, ADVANCE]);
    const raid = (side: SideId): Release[] => [
      ...army(['tank', 'ranger', 'scout'], side, 'north'),
      { tick: 150, side, kind: 'deploy', roadId: 'south', unit: 'tank' },
      { tick: 200, side, kind: 'deploy', roadId: 'short', unit: 'scout' },
    ];
    const result = runMatch(
      matchSetup({
        map: arena,
        sides: [
          { id: 'A', behaviour: same },
          { id: 'B', behaviour: same },
        ],
        releases: [...raid('A'), ...raid('B')],
        maxTicks: 1500,
      }),
    );
    const bySide = (id: SideId) => ({
      citadel: result.finalState.citadels.find((citadel) => citadel.side === id)?.hp,
      died: result.events.filter((event) => event.kind === 'unit-died' && event.side === id).length,
      byObelisk: result.events.filter(
        (event) => event.kind === 'unit-died' && event.side === id && event.killer.kind === 'obelisk',
      ).length,
      survivors: result.finalState.units
        .filter((unit) => unit.side === id)
        .map((unit) => `${unit.kind}:${unit.hp.toFixed(6)}:${unit.state}`)
        .sort(),
    });

    expect(result.events.some((event) => event.kind === 'unit-died')).toBe(true);
    expect(result.finalState.obelisks.some((obelisk) => obelisk.target !== null || obelisk.hp > 0)).toBe(true);
    expect(bySide('A')).toEqual(bySide('B'));
  });
});
