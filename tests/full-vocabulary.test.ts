import { describe, it, expect } from 'vitest';
import { DEFAULT_BEHAVIOUR, runMatch } from '@sim/index';
import type { Action, Behaviour, Condition, MatchResult, Release, Rule, SideId, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Полный словарь тикета 10: каждое новое Условие и Действие обязано
 * наблюдаемо менять исход, иначе в нём нет смысла.
 */

const release = (tick: number, side: SideId, unit: UnitKind = 'scout'): Release => ({
  tick,
  side,
  kind: 'deploy',
  roadId: 'short',
  unit,
});
const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });
const rule = (when: Condition, act: Action): Rule => ({ when, do: act });

const ADVANCE: Rule = rule({ kind: 'always' }, { kind: 'advance' });
const FIGHT = (act: Action = { kind: 'attack-nearest' }): Rule => rule({ kind: 'enemy-in-range' }, act);
const HOLD: Action = { kind: 'hold' };

function play(ours: Behaviour, releases: readonly Release[], maxTicks: number): MatchResult {
  return runMatch(
    matchSetup({
      map: arena,
      sides: [
        { id: 'A', behaviour: ours },
        { id: 'B', behaviour: DEFAULT_BEHAVIOUR },
      ],
      releases,
      maxTicks,
    }),
  );
}

const sideUnits = (result: MatchResult, side: SideId) =>
  result.finalState.units.filter((unit) => unit.side === side);
const first = (result: MatchResult, side: SideId) => sideUnits(result, side)[0];

describe('Условие «союзников рядом»', () => {
  it('«меньше N»: одиночка ждёт, пара — идёт', () => {
    const waitForCompany = everyone([rule({ kind: 'allies-nearby', compare: 'fewer', count: 1 }, HOLD), ADVANCE]);

    expect(first(play(waitForCompany, [release(1, 'A')], 20), 'A')?.progress).toBe(0);
    const pair = play(waitForCompany, [release(1, 'A'), release(1, 'A')], 20);
    expect(sideUnits(pair, 'A').every((unit) => unit.progress > 0)).toBe(true);
  });

  it('союзник далеко позади — не «рядом»', () => {
    // Второй выходит позже и отстаёт на сотни единиц. Правило «стой, если
    // рядом кто-то есть» его не видит — оба идут.
    const avoidCrowds = everyone([rule({ kind: 'allies-nearby', compare: 'more', count: 0 }, HOLD), ADVANCE]);
    const result = play(avoidCrowds, [release(1, 'A'), release(30, 'A')], 40);

    expect(sideUnits(result, 'A').every((unit) => unit.state === 'moving')).toBe(true);
  });

  it('«больше N»: одиночка идёт, пара — встаёт', () => {
    const avoidCrowds = everyone([rule({ kind: 'allies-nearby', compare: 'more', count: 0 }, HOLD), ADVANCE]);

    expect(first(play(avoidCrowds, [release(1, 'A')], 20), 'A')?.progress).toBeGreaterThan(0);
    const pair = play(avoidCrowds, [release(1, 'A'), release(1, 'A')], 20);
    expect(sideUnits(pair, 'A').every((unit) => unit.state === 'holding')).toBe(true);
  });
});

describe('Условие «врагов в Стычке больше N»', () => {
  const outnumbered = everyone([
    rule({ kind: 'enemies-in-skirmish', above: 1 }, { kind: 'retreat' }),
    FIGHT(),
    ADVANCE,
  ]);

  it('против одного — дерётся', () => {
    const result = play(outnumbered, [release(1, 'A'), release(1, 'B')], 95);
    expect(first(result, 'A')?.state).toBe('fighting');
  });

  it('против троих — отступает', () => {
    const three = [release(1, 'B'), release(2, 'B'), release(3, 'B')];
    const result = play(outnumbered, [release(1, 'A'), ...three], 90);
    expect(first(result, 'A')?.state).toBe('retreating');
  });
});

describe('Условие «враг впереди»', () => {
  const cautious = everyone([rule({ kind: 'enemy-ahead' }, HOLD), ADVANCE]);

  it('видит врага на любом расстоянии, даже не дотягиваясь', () => {
    // Враг только что вышел на другом конце Дороги — далеко за радиусом.
    const result = play(cautious, [release(1, 'A'), release(1, 'B')], 20);
    expect(first(result, 'A')?.state).toBe('holding');
    expect(first(result, 'A')?.progress).toBe(0);
  });

  it('без врага на Дороге ложно', () => {
    const result = play(cautious, [release(1, 'A')], 20);
    expect(first(result, 'A')?.progress).toBeGreaterThan(0);
  });
});

describe('Условие «чужая Цитадель в радиусе»', () => {
  it('срабатывает на дальности удара Юнита — Стрелок замечает стены за 95 единиц', () => {
    const standoff = everyone([rule({ kind: 'enemy-citadel-in-range' }, HOLD), ADVANCE]);
    const result = play(standoff, [release(1, 'A', 'ranger')], 240);
    const ranger = first(result, 'A');

    expect(ranger?.state).toBe('holding');
    // 905 — длина короткой Дороги, 95 — дальность Стрелка.
    expect((1 - (ranger?.progress ?? 0)) * 905).toBeCloseTo(95, -1);
  });

  it('без него Стрелок доходит до самых стен', () => {
    const result = play(everyone([ADVANCE]), [release(1, 'A', 'ranger')], 240);
    expect(first(result, 'A')?.state).toBe('sieging');
  });
});

describe('Действие «стоять»', () => {
  it('держит Юнита на месте', () => {
    const result = play(everyone([rule({ kind: 'always' }, HOLD)]), [release(1, 'A')], 40);
    expect(first(result, 'A')?.progress).toBe(0);
    expect(first(result, 'A')?.state).toBe('holding');
  });

  it('не бьёт, даже когда враг дотянулся, — и показан стоящим, а не ждущим', () => {
    // Встретив врага посреди Дороги, вдали от любых стен, Юнит встаёт
    // и не отвечает. Враг его бьёт.
    const passive = everyone([rule({ kind: 'enemy-in-range' }, HOLD), ADVANCE]);
    const result = play(passive, [release(1, 'A'), release(1, 'B')], 95);
    const ours = first(result, 'A');
    const theirs = first(result, 'B');

    expect(ours?.hp).toBeLessThan(ours?.maxHp ?? 0);
    expect(theirs?.hp).toBe(theirs?.maxHp);
    expect(ours?.state).toBe('holding');
  });
});

describe('сбор Колонны перед атакой', () => {
  it('по букве тикета: «ждать, пока рядом меньше трёх» — собираются четверо и атакуют', () => {
    const gather = everyone([
      rule({ kind: 'allies-nearby', compare: 'fewer', count: 3 }, HOLD),
      FIGHT(),
      ADVANCE,
    ]);
    const four = [release(1, 'A'), release(20, 'A'), release(40, 'A'), release(60, 'A')];
    const result = play(gather, [...four, release(1, 'B', 'tank')], 200);
    const at = sideUnits(result, 'A').map((unit) => unit.progress * 905);

    // Собрались вместе, а не растянулись по Дороге...
    expect(Math.max(...at) - Math.min(...at)).toBeLessThan(60);
    // ...и дошли до Стычки: Танк противника ранен.
    expect(first(result, 'B')?.hp).toBeLessThan(first(result, 'B')?.maxHp ?? 0);
  });

  it('«ждать, пока рядом меньше двух своих» — трое идут вместе, а не по одному', () => {
    const gather = everyone([
      rule({ kind: 'allies-nearby', compare: 'fewer', count: 2 }, HOLD),
      FIGHT(),
      ADVANCE,
    ]);
    const straggling = [release(1, 'A'), release(40, 'A'), release(80, 'A')];
    const spread = (result: MatchResult) => {
      const at = sideUnits(result, 'A').map((unit) => unit.progress * 905);
      return Math.max(...at) - Math.min(...at);
    };

    // До прихода третьего двое ждут у своей Цитадели.
    const waiting = play(gather, straggling.slice(0, 2), 79);
    expect(sideUnits(waiting, 'A').every((unit) => unit.progress === 0)).toBe(true);

    // Собравшись, идут вместе; без Правила растянулись бы на сорок Тиков пути.
    const together = play(gather, straggling, 110);
    const apart = play(everyone([FIGHT(), ADVANCE]), straggling, 110);
    expect(spread(together)).toBeLessThan(60);
    expect(spread(apart)).toBeGreaterThan(300);
  });
});
