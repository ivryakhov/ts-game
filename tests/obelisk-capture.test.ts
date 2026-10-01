import { describe, it, expect } from 'vitest';
import { BODY_RADIUS, createMatch, measureRoad, OBELISK_STATS, runMatch } from '@sim/index';
import type {
  Behaviour,
  MatchEvent,
  Release,
  Rule,
  SideId,
  UnitKind,
  UnitSnapshot,
  WorldSnapshot,
} from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { arenaWithoutObelisks, matchSetup } from './match-setup.js';

/**
 * Захват Обелиска (спека 0003, тикет 22): Юниты берут Обелиск своими
 * Правилами — «чужой Обелиск в радиусе → бить Обелиск», — и он переходит
 * к Стороне, нанёсшей в Тик падения больше урона (ADR-0006).
 */

const NORTH = arena.obelisks.find((obelisk) => obelisk.id === 'north')?.at ?? { x: 0, y: 0 };
const northRoad = measureRoad(arena.roads.find((road) => road.id === 'north') ?? arena.roads[0]!);

const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
const FIGHT: Rule = { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } };
const TAKE: Rule = { when: { kind: 'obelisk-in-range' }, do: { kind: 'siege-obelisk' } };
const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

const deploy = (tick: number, side: SideId, roadId: string, unit: UnitKind): Release => ({
  tick,
  side,
  kind: 'deploy',
  roadId,
  unit,
});

const away = (unit: UnitSnapshot, point: { x: number; y: number }) =>
  Math.hypot(unit.x - point.x, unit.y - point.y);

const offNorthRoad = (unit: UnitSnapshot): number => {
  const nearest = northRoad.pointAtDistance(northRoad.project(unit, unit.progress * northRoad.length, 300));
  return Math.hypot(nearest.x - unit.x, nearest.y - unit.y);
};

interface Tick {
  readonly snapshot: WorldSnapshot;
  readonly events: readonly MatchEvent[];
}

function trace(
  behaviours: Readonly<Record<SideId, Behaviour>>,
  releases: readonly Release[],
  maxTicks: number,
  map = arena,
): Tick[] {
  const match = createMatch(
    matchSetup({
      map,
      sides: [
        { id: 'A', behaviour: behaviours['A'] },
        { id: 'B', behaviour: behaviours['B'] },
      ],
      releases,
      maxTicks,
    }),
  );
  const ticks: Tick[] = [];
  while (!match.finished) ticks.push({ events: match.step(), snapshot: match.snapshot() });
  return ticks;
}

const taken = (ticks: readonly Tick[]) =>
  ticks.flatMap((tick, index) =>
    tick.events.flatMap((event) => (event.kind === 'obelisk-taken' ? [{ index, event }] : [])),
  );

const northOf = (tick: Tick) => tick.snapshot.obelisks.find((obelisk) => obelisk.id === 'north');

const TWO_TANKS = [deploy(1, 'A', 'north', 'tank'), deploy(2, 'A', 'north', 'tank')];
const TAKER = everyone([TAKE, ADVANCE]);

describe('захват Обелиска', () => {
  it('Юнит сходит с Дороги и берёт Обелиск, тот встаёт с половиной здоровья, а Юнит идёт дальше по Дороге', () => {
    const ticks = trace({ A: TAKER, B: everyone([ADVANCE]) }, TWO_TANKS, 900);
    const [capture] = taken(ticks);

    expect(capture?.event).toMatchObject({ obeliskId: 'north', owner: 'A' });
    const at = ticks[capture!.index]!;
    expect(northOf(at)).toMatchObject({ owner: 'A', hp: OBELISK_STATS.maxHp / 2 });

    // Перед захватом осаждали у стены Обелиска, сойдя с Дороги.
    const before = ticks[capture!.index - 1]!.snapshot.units;
    expect(before.some((unit) => unit.state === 'sieging' && offNorthRoad(unit) > BODY_RADIUS * 2)).toBe(true);

    // Взяв, вернулись на Дорогу и пошли вперёд.
    const later = ticks[capture!.index + 100]!.snapshot.units;
    expect(later.length).toBeGreaterThan(0);
    for (const unit of later) {
      expect(unit.state).toBe('moving');
      expect(offNorthRoad(unit)).toBeLessThan(BODY_RADIUS);
      const then = before.find((earlier) => earlier.id === unit.id);
      expect(unit.progress).toBeGreaterThan(then?.progress ?? 1);
    }
  });

  it('одного Танка Обелиск убивает раньше, чем тот его возьмёт', () => {
    const ticks = trace({ A: TAKER, B: everyone([ADVANCE]) }, [deploy(1, 'A', 'north', 'tank')], 900);
    const died = ticks.flatMap((tick) => tick.events).find((event) => event.kind === 'unit-died');

    expect(taken(ticks)).toEqual([]);
    expect(died).toMatchObject({ killer: { kind: 'obelisk', obeliskId: 'north' } });
  });

  it('захваченный не бьёт Юнитов владельца, бьёт его врагов и сам не лечится', () => {
    // Танки A берут Обелиск и уходят к чужим стенам, где гибнут. Позже
    // по северной Дороге идут навстречу Разведчик A и Разведчик B.
    const scouts = [deploy(1400, 'A', 'north', 'scout'), deploy(1400, 'B', 'north', 'scout')];
    const ticks = trace({ A: TAKER, B: everyone([ADVANCE]) }, [...TWO_TANKS, ...scouts], 2200);
    const [capture] = taken(ticks);
    const after = ticks.slice(capture!.index);
    const sideOf = (tick: Tick, id: number) => tick.snapshot.units.find((unit) => unit.id === id)?.side;

    const struck = after.flatMap((tick) => (northOf(tick)?.targets ?? []).map((id) => sideOf(tick, id)));
    expect(struck).toContain('B');
    expect(struck).not.toContain('A');
    // Разведчик A прошёл мимо своего Обелиска к врагу.
    expect(after.some((tick) => tick.snapshot.units.some((unit) => unit.side === 'A' && unit.kind === 'scout'))).toBe(true);

    const health = after.map((tick) => northOf(tick)?.hp ?? 0);
    expect(health.every((hp, index) => index === 0 || hp <= (health[index - 1] ?? 0))).toBe(true);
    expect(taken(ticks)).toHaveLength(1);
  });
});

describe('обе Стороны сбивают ничейный Обелиск в одном Тике', () => {
  const sieging = (tick: Tick | undefined, side: SideId) =>
    (tick?.snapshot.units ?? []).some(
      (unit) => unit.side === side && unit.state === 'sieging' && away(unit, NORTH) < 100,
    );

  it('при равном уроне он встаёт ничьим', () => {
    const party = (side: SideId) => [deploy(1, side, 'north', 'tank'), deploy(2, side, 'north', 'tank')];
    const ticks = trace({ A: TAKER, B: TAKER }, [...party('A'), ...party('B')], 900);
    const [first] = taken(ticks);

    expect(first?.event.owner).toBeNull();
    expect(northOf(ticks[first!.index]!)).toMatchObject({ owner: null, hp: OBELISK_STATS.maxHp / 2 });
    expect(sieging(ticks[first!.index - 1], 'A') && sieging(ticks[first!.index - 1], 'B')).toBe(true);
  });

  it('при неравном его берёт нанёсшая больше', () => {
    const releases = [
      deploy(200, 'A', 'north', 'tank'),
      deploy(201, 'A', 'north', 'tank'),
      deploy(202, 'A', 'north', 'ranger'),
      deploy(200, 'B', 'north', 'tank'),
      deploy(201, 'B', 'north', 'tank'),
    ];
    const ticks = trace({ A: TAKER, B: TAKER }, releases, 1200);
    const [first] = taken(ticks);

    expect(first?.event.owner).toBe('A');
    expect(sieging(ticks[first!.index - 1], 'A') && sieging(ticks[first!.index - 1], 'B')).toBe(true);
  });
});

describe('слова Правил', () => {
  const HOLD_AT_OBELISK: Rule = { when: { kind: 'obelisk-in-range' }, do: { kind: 'hold' } };

  it('«чужой Обелиск в радиусе» истинно, пока Обелиск в Обзоре, и ложно дальше Обзора', () => {
    const ticks = trace({ A: everyone([HOLD_AT_OBELISK, ADVANCE]), B: everyone([ADVANCE]) }, [deploy(1, 'A', 'north', 'scout')], 300);
    const held = ticks.map((tick) => tick.snapshot.units[0]).filter((unit) => unit?.state === 'holding');
    const firstHeld = ticks.findIndex((tick) => tick.snapshot.units[0]?.state === 'holding');

    expect(held.length).toBeGreaterThan(0);
    expect(held.every((unit) => away(unit!, NORTH) <= 130)).toBe(true);
    expect(ticks.slice(0, firstHeld).every((tick) => away(tick.snapshot.units[0]!, NORTH) > 130 - 6)).toBe(true);
  });

  it('«чужой Обелиск в радиусе» ложно для своего Обелиска', () => {
    // Разведчик A с «Обелиск в радиусе → стоять» идёт мимо уже взятого.
    const behaviour: Behaviour = { ...TAKER, scout: [HOLD_AT_OBELISK, ADVANCE] };
    const ticks = trace({ A: behaviour, B: everyone([ADVANCE]) }, [...TWO_TANKS, deploy(700, 'A', 'north', 'scout')], 900);
    const scout = (tick: Tick) => tick.snapshot.units.find((unit) => unit.kind === 'scout');

    expect(taken(ticks)[0]!.index).toBeLessThan(699);
    expect(ticks.some((tick) => scout(tick) && away(scout(tick)!, NORTH) < 130)).toBe(true);
    expect(ticks.some((tick) => scout(tick)?.state === 'holding')).toBe(false);
  });

  it('«бить Обелиск» без видимого Обелиска — то же, что «идти вперёд»', () => {
    const SIEGE_ALWAYS: Rule = { when: { kind: 'always' }, do: { kind: 'siege-obelisk' } };
    const releases = [deploy(1, 'A', 'short', 'tank'), deploy(1, 'B', 'short', 'scout')];
    const places = (behaviour: Behaviour) =>
      trace({ A: behaviour, B: everyone([ADVANCE]) }, releases, 600).map((tick) =>
        tick.snapshot.units.map((unit) => `${unit.id}:${unit.x}:${unit.y}:${unit.state}:${unit.hp}`).join('|'),
      );

    expect(places(everyone([SIEGE_ALWAYS]))).toEqual(places(everyone([ADVANCE])));
  });

  it('с «враг в радиусе → бить ближайшего · иначе → идти вперёд» Юнит проходит мимо ничейного Обелиска, не останавливаясь', () => {
    const arrival = (map: typeof arena) =>
      runMatch(
        matchSetup({
          map,
          sides: [{ id: 'A', behaviour: everyone([FIGHT, ADVANCE]) }, { id: 'B' }],
          releases: [deploy(1, 'A', 'north', 'tank')],
          maxTicks: 600,
        }),
      );
    const withObelisks = arrival(arena);
    const tickOf = (result: ReturnType<typeof runMatch>) =>
      result.events.find((event) => event.kind === 'unit-arrived')?.tick;

    expect(tickOf(withObelisks)).toBeDefined();
    expect(tickOf(withObelisks)).toBe(tickOf(arrival(arenaWithoutObelisks)));
    expect(withObelisks.events.some((event) => event.kind === 'obelisk-taken')).toBe(false);
  });
});

describe('зеркальность с «бить Обелиск»', () => {
  it('матч с одинаковыми Правилами, включая «бить Обелиск», остаётся зеркальным', () => {
    const same = everyone([FIGHT, TAKE, ADVANCE]);
    // Крест-накрест: северная Дорога для A — то же, что южная для B, карта
    // переходит в себя поворотом на пол-оборота. По одной Дороге армии
    // сошлись бы под Обелиском и бились бы друг с другом.
    const raid = (side: SideId, road: string): Release[] => [
      deploy(150, side, road, 'tank'),
      deploy(151, side, road, 'tank'),
      deploy(152, side, road, 'ranger'),
      deploy(400, side, 'short', 'scout'),
    ];
    const ticks = trace({ A: same, B: same }, [...raid('A', 'north'), ...raid('B', 'south')], 2000);
    const final = ticks.at(-1)!.snapshot;
    const events = ticks.flatMap((tick) => tick.events);
    const bySide = (id: SideId) => ({
      citadel: final.citadels.find((citadel) => citadel.side === id)?.hp,
      died: events.filter((event) => event.kind === 'unit-died' && event.side === id).length,
      survivors: final.units
        .filter((unit) => unit.side === id)
        .map((unit) => `${unit.kind}:${unit.hp.toFixed(6)}:${unit.state}`)
        .sort(),
    });

    expect(final.obelisks.map((obelisk) => [obelisk.id, obelisk.owner, obelisk.hp])).toEqual([
      ['north', 'A', final.obelisks[1]?.hp],
      ['south', 'B', final.obelisks[0]?.hp],
    ]);
    expect(bySide('A')).toEqual(bySide('B'));
  });
});
