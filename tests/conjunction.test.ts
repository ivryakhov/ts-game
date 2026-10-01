import { describe, it, expect } from 'vitest';
import { DEFAULT_BEHAVIOUR, runMatch } from '@sim/index';
import type { Action, Behaviour, MatchResult, Release, Rule, SideId, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * «И» в Правиле (ADR-0005): до трёх Условий, и Правило срабатывает, только
 * когда истинны все. Одним Условием не записать ни «ждать своих у Цитадели»,
 * ни «отступать из проигранной Стычки».
 */

const release = (tick: number, side: SideId, unit: UnitKind = 'scout'): Release => ({
  tick,
  side,
  kind: 'deploy',
  roadId: 'short',
  unit,
});
const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
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

const ours = (result: MatchResult) => result.finalState.units.filter((unit) => unit.side === 'A');

describe('Правило с несколькими Условиями', () => {
  // «Один и враг на Дороге — стою»: два Условия, которые легко сделать
  // истинными по отдельности.
  const lonelyAndThreatened = everyone([
    {
      when: [
        { kind: 'allies-nearby', compare: 'fewer', count: 1 },
        { kind: 'enemy-ahead' },
      ],
      do: HOLD,
    },
    ADVANCE,
  ]);

  it('срабатывает, когда истинны оба', () => {
    const result = play(lonelyAndThreatened, [release(1, 'A'), release(1, 'B')], 20);

    expect(ours(result).map((unit) => unit.state)).toEqual(['holding']);
  });

  it('не срабатывает, когда истинно только первое: врага на Дороге нет', () => {
    const result = play(lonelyAndThreatened, [release(1, 'A')], 20);

    expect(ours(result)[0]?.progress ?? 0).toBeGreaterThan(0);
  });

  it('не срабатывает, когда истинно только второе: Юнит не один', () => {
    const result = play(lonelyAndThreatened, [release(1, 'A'), release(1, 'A'), release(1, 'B')], 20);

    expect(ours(result).every((unit) => unit.progress > 0)).toBe(true);
  });
});

describe('Условие «у своей Цитадели»', () => {
  // «У своей Цитадели и враг на Дороге — стою»: дома Юнит ждёт, а вышедший
  // уже не дома и не останавливается.
  const waitAtHomeWhileThreatened = everyone([
    { when: [{ kind: 'at-home' }, { kind: 'enemy-ahead' }], do: HOLD },
    ADVANCE,
  ]);

  it('истинно для только что выпущенного: он у своей Цитадели', () => {
    const result = play(waitAtHomeWhileThreatened, [release(1, 'A'), release(1, 'B')], 40);

    expect(ours(result)[0]?.state).toBe('holding');
    expect(ours(result)[0]?.progress).toBe(0);
  });

  it('ложно для ушедшего от Цитадели: враг появился, а Юнит идёт дальше', () => {
    // Враг выходит, когда наш уже далеко от ворот.
    const result = play(waitAtHomeWhileThreatened, [release(1, 'A'), release(30, 'B')], 40);

    expect(ours(result)[0]?.state).toBe('moving');
  });
});

describe('выход на Дорогу не поодиночке', () => {
  // «У своей Цитадели и своих рядом меньше двух — стою»: копит армию при
  // Выпуске и не отпускает на Дорогу одиночек.
  const leaveInThrees = everyone([
    {
      when: [{ kind: 'at-home' }, { kind: 'allies-nearby', compare: 'fewer', count: 2 }],
      do: HOLD,
    },
    { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } },
    ADVANCE,
  ]);

  it('выпущенный один остаётся у своей Цитадели', () => {
    const result = play(leaveInThrees, [release(1, 'A')], 120);

    expect(ours(result)[0]?.progress).toBe(0);
  });

  it('двое ждут третьего, а с ним выходят все вместе', () => {
    const threeApart = [release(1, 'A'), release(20, 'A'), release(40, 'A')];

    // Двое у ворот стоят плечом к плечу: толпа раздвигает их, но не выпускает.
    const waiting = play(leaveInThrees, threeApart.slice(0, 2), 60);
    expect(ours(waiting).map((unit) => unit.state)).toEqual(['holding', 'holding']);

    const leaving = play(leaveInThrees, threeApart, 90);
    const at = ours(leaving).map((unit) => unit.progress * 900);
    expect(Math.min(...at)).toBeGreaterThan(0);
    // Вместе, а не по одному: без Правила их разделяло бы по двадцать Тиков пути.
    expect(Math.max(...at) - Math.min(...at)).toBeLessThan(100);
  });
});
