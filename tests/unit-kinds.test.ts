import { describe, it, expect } from 'vitest';
import { ECONOMY, MELEE_RANGE, runMatch, TICKS_PER_SECOND, UNIT_STATS } from '@sim/index';
import type { MatchEvent, MatchResult, ScheduledAction, SideId, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

const deploy = (
  tick: number,
  side: SideId,
  unit: UnitKind,
  roadId = 'short',
): ScheduledAction => ({ tick, side, kind: 'deploy', roadId, unit });

const run = (actions: readonly ScheduledAction[], maxTicks = 20_000): MatchResult =>
  runMatch(matchSetup({ map: arena, playerActions: actions, maxTicks }));

const arrivalOf = (events: readonly MatchEvent[]) => {
  const arrived = events.find((event) => event.kind === 'unit-arrived');
  return arrived && 'tick' in arrived ? arrived.tick : null;
};

describe('Разведчик, Танк и Стрелок различаются', () => {
  it('Разведчик доходит заметно быстрее Танка', () => {
    const scout = arrivalOf(run([deploy(1, 'A', 'scout')]).events) ?? 0;
    const tank = arrivalOf(run([deploy(1, 'A', 'tank')]).events) ?? 0;

    expect(scout).toBeGreaterThan(0);
    expect(tank).toBeGreaterThan(scout * 1.5);
  });

  it('Танк выдерживает заметно больше урона, чем Разведчик', () => {
    const survives = (kind: UnitKind, until: number) =>
      run([deploy(1, 'A', kind), deploy(1, 'B', 'scout')], until).finalState.units.some(
        (unit) => unit.side === 'A',
      );

    // К этому Тику Разведчика уже нет, а Танк ещё держится.
    expect(survives('scout', 200)).toBe(false);
    expect(survives('tank', 200)).toBe(true);
  });

  it('каждый тип стоит своего Эфира', () => {
    const spent = (kind: UnitKind) => {
      const result = run([deploy(1, 'A', kind)], 1);
      const idle = run([], 1).finalState.ether[0]?.amount ?? 0;
      return idle - (result.finalState.ether[0]?.amount ?? 0);
    };

    expect(spent('scout')).toBe(20);
    expect(spent('ranger')).toBe(40);
    expect(spent('tank')).toBe(50);
  });
});

describe('Стрелок бьёт из-за спин', () => {
  it('наносит урон, сам не вступая в ближнюю Стычку', () => {
    // Танк принимает Стычку на себя, Стрелок упирается ему в спину и бьёт
    // поверх: он быстрее Танка, поэтому догоняет, но обогнать не может.
    const result = run([deploy(1, 'A', 'tank'), deploy(1, 'B', 'tank'), deploy(2, 'A', 'ranger')], 130);

    const ranger = result.finalState.units.find((unit) => unit.kind === 'ranger');
    const enemy = result.finalState.units.find((unit) => unit.side === 'B');

    expect(ranger?.state).toBe('fighting');
    expect(ranger?.hp).toBe(ranger?.maxHp);
    expect(enemy?.hp).toBeLessThan(enemy?.maxHp ?? 0);
  });

  it('добавляет удар, не входя в ближнюю свалку', () => {
    const tank = [deploy(1, 'A', 'tank'), deploy(1, 'B', 'tank')];
    const fightersOf = (result: MatchResult) =>
      result.finalState.units.filter((unit) => unit.side === 'A' && unit.state === 'fighting');

    const alone = run(tank, 130);
    const withRanger = run([...tank, deploy(2, 'A', 'ranger')], 130);

    expect(fightersOf(alone)).toHaveLength(1);
    expect(fightersOf(withRanger)).toHaveLength(2);
  });
});

describe('Стрелок и ближняя свалка', () => {
  it('стоит дальше ближнего удара — иначе он не «из-за спин»', () => {
    // Если Стрелок попадает в зону ближнего удара, он и сам получает
    // сдачи, и занимает место в лимите: тогда всё его отличие исчезает.
    const result = run([deploy(1, 'A', 'tank'), deploy(1, 'B', 'tank'), deploy(2, 'A', 'ranger')], 130);
    const ranger = result.finalState.units.find((unit) => unit.kind === 'ranger');
    const enemy = result.finalState.units.find((unit) => unit.side === 'B');

    const between = Math.abs((ranger?.progress ?? 0) - (enemy?.progress ?? 0)) * 905;
    expect(ranger?.state).toBe('fighting');
    expect(between).toBeGreaterThan(MELEE_RANGE);
    expect(between).toBeLessThanOrEqual(95);
  });

  it('лимит ближней Стычки достижим: троих в свалку пускает', () => {
    // Колонна разводит Юнитов по глубине, и если шаг велик, третий номер
    // физически не дотянется — лимит окажется мёртвой буквой.
    const wave = Array.from({ length: 4 }, (_, index) => deploy(1 + index, 'A', 'scout'));
    const result = run([...wave, deploy(1, 'B', 'tank')], 80);
    const fighting = result.finalState.units.filter(
      (unit) => unit.side === 'A' && unit.state === 'fighting',
    );

    expect(fighting).toHaveLength(3);
  });
});

describe('против отвечающей Цитадели одним типом не обойтись', () => {
  /** Копим на всю армию и выпускаем волной, Танки первыми. */
  const wave = (kinds: readonly UnitKind[]): ScheduledAction[] => {
    const cost = kinds.reduce((sum, kind) => sum + UNIT_STATS[kind].cost, 0);
    const perTick = ECONOMY.incomePerSecond / TICKS_PER_SECOND;
    const start = Math.max(1, Math.ceil((cost - ECONOMY.startingEther) / perTick) + 1);
    return kinds.map((kind, index) => deploy(start + index, 'A', kind));
  };
  const lostOf = (result: MatchResult) =>
    result.events.filter((event) => event.kind === 'unit-died').length;

  it('одни Стрелки Цитадель не берут: стены выбивают их по одному', () => {
    const result = run(wave(['ranger', 'ranger', 'ranger', 'ranger']), 60_000);

    expect(result.endReason).not.toBe('citadel-destroyed');
  });

  it('одни Танки Цитадель не берут: живучи, но урона мало', () => {
    const result = run(wave(['tank', 'tank', 'tank']), 60_000);

    expect(result.endReason).not.toBe('citadel-destroyed');
  });

  it('Танки впереди, Стрелки за спиной — берут, почти без потерь', () => {
    const result = run(wave(['tank', 'tank', 'ranger', 'ranger']), 60_000);

    expect(result.endReason).toBe('citadel-destroyed');
    expect(lostOf(result)).toBeLessThanOrEqual(1);
  });

  it('каждая волна действительно оплачена — иначе проверки выше пусты', () => {
    for (const kinds of [
      ['ranger', 'ranger', 'ranger', 'ranger'],
      ['tank', 'tank', 'tank'],
      ['tank', 'tank', 'ranger', 'ranger'],
    ] as const) {
      const result = run(wave(kinds), 60_000);
      expect(result.events.filter((event) => event.kind === 'deploy-refused')).toEqual([]);
    }
  });

  it('Разведчики берут, но ценой почти всей армии', () => {
    const result = run(wave(Array.from({ length: 9 }, () => 'scout' as const)), 60_000);

    expect(result.endReason).toBe('citadel-destroyed');
    expect(lostOf(result)).toBeGreaterThan(9 / 2);
  });
});
