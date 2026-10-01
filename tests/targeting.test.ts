import { describe, it, expect } from 'vitest';
import { DEFAULT_BEHAVIOUR, runMatch } from '@sim/index';
import type { Action, Behaviour, Condition, MatchResult, Release, Rule, SideId, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Выбор цели: кого бьёт Юнит по своему Действию и кого он вообще может
 * достать. Цель выбирается только среди досягаемых, а дальность меряется
 * честно — от того места, откуда Юнит бьёт (ADR-0002).
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

function play(
  ours: Behaviour,
  releases: readonly Release[],
  maxTicks: number,
  theirs: Behaviour = DEFAULT_BEHAVIOUR,
): MatchResult {
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

describe('Действия выбора цели', () => {
  /**
   * Навстречу Стрелку выходят Танк и следом, в затылок за ним, Разведчик.
   * Они не отвечают — только идут, поэтому Разведчик не обгоняет Танка.
   * Дальность меряется честно, от самого Стрелка: сначала он достаёт только
   * Танка, а по мере сближения — и Разведчика за его спиной. Кого он бьёт,
   * когда достаёт обоих, видно по здоровью.
   */
  const target = (act: Action) => {
    const shooter = everyone([FIGHT(act), ADVANCE]);
    const result = play(
      shooter,
      [release(1, 'A', 'ranger'), release(1, 'B', 'tank'), release(2, 'B', 'scout')],
      138,
      everyone([ADVANCE]),
    );
    const enemies = sideUnits(result, 'B');
    const hurt = (kind: UnitKind) => {
      const unit = enemies.find((enemy) => enemy.kind === kind);
      return unit ? unit.maxHp - unit.hp : 0;
    };
    return { tank: hurt('tank'), scout: hurt('scout') };
  };

  it('«ближайшего» бьёт переднего — Танка', () => {
    const hurt = target({ kind: 'attack-nearest' });
    expect(hurt.tank).toBeGreaterThan(0);
    expect(hurt.scout).toBe(0);
  });

  it('«слабейшего» бьёт того, у кого меньше здоровья, — Разведчика', () => {
    // Пока Разведчик вне досягаемости, достаётся Танку; достав обоих,
    // Стрелок переключается на слабейшего.
    const hurt = target({ kind: 'attack-weakest' });
    expect(hurt.scout).toBeGreaterThan(0);
    expect(hurt.scout).toBeGreaterThan(hurt.tank);
  });

  it('«самого опасного» бьёт того, кто сильнее бьёт, — Танка', () => {
    // Урон Танка 20 в секунду, Разведчика 15.
    const hurt = target({ kind: 'attack-most-dangerous' });
    expect(hurt.tank).toBeGreaterThan(0);
    expect(hurt.scout).toBe(0);
  });

  it('«заданный тип» бьёт именно его, хотя он не ближе', () => {
    const hurt = target({ kind: 'attack-kind', unit: 'scout' });
    expect(hurt.scout).toBeGreaterThan(0);
    expect(hurt.scout).toBeGreaterThan(hurt.tank);
  });

  it('«заданный тип», которого нет, — бьёт ближайшего', () => {
    const hurt = target({ kind: 'attack-kind', unit: 'ranger' });
    expect(hurt.tank).toBeGreaterThan(0);
  });
});

describe('цель выбирается только среди досягаемых', () => {
  it('ближний «бьёт слабейшего» из передних рядов, а не из хвоста Колонны', () => {
    // Навстречу ближнему идёт Танк, а далеко за ним — Разведчик: он слабее,
    // но стоит глубоко во вражеской Колонне, куда ближнему не дотянуться.
    const striker = everyone([FIGHT({ kind: 'attack-weakest' }), ADVANCE]);
    const result = play(
      striker,
      [release(1, 'A', 'scout'), release(1, 'B', 'tank'), release(83, 'B', 'scout')],
      113,
    );
    const enemies = sideUnits(result, 'B');
    const tank = enemies.find((unit) => unit.kind === 'tank');
    const scout = enemies.find((unit) => unit.kind === 'scout');

    expect(tank?.hp).toBeLessThan(tank?.maxHp ?? 0);
    expect(scout?.hp).toBe(scout?.maxHp);
  });
});

describe('Стрелок бьёт только на своей дальности', () => {
  it('уже стреляя, не выбирает слабейшего дальше 95 единиц от себя', () => {
    // Стрелок бьёт подходящего Танка. Разведчик вышел позже и отстал —
    // он слабее, но дальше дальности Стрелка, и выбрать его нельзя.
    const striker = everyone([FIGHT({ kind: 'attack-weakest' }), ADVANCE]);
    const result = play(
      striker,
      [release(1, 'A', 'ranger'), release(1, 'B', 'tank'), release(83, 'B', 'scout')],
      128,
    );
    const ranger = first(result, 'A');
    const scout = sideUnits(result, 'B').find((unit) => unit.kind === 'scout');
    const tank = sideUnits(result, 'B').find((unit) => unit.kind === 'tank');
    const toScout = Math.hypot((scout?.x ?? 0) - (ranger?.x ?? 0), (scout?.y ?? 0) - (ranger?.y ?? 0));

    expect(ranger?.state).toBe('fighting');
    expect(toScout).toBeGreaterThan(95);
    expect(tank?.hp).toBeLessThan(tank?.maxHp ?? 0);
    expect(scout?.hp).toBe(scout?.maxHp);
  });

});

describe('Стрелок молчит вне дальности', () => {
  it('не достаёт врага дальше 95 единиц от себя', () => {
    // Стрелок стоит; враг-Разведчик идёт к нему. Пока расстояние больше
    // дальности Стрелка, урона нет.
    const sniper = everyone([FIGHT(), rule({ kind: 'always' }, HOLD)]);
    const early = play(sniper, [release(1, 'A', 'ranger'), release(1, 'B', 'scout')], 80);
    const theirs = first(early, 'B');
    const ours = first(early, 'A');
    const gap = Math.hypot((theirs?.x ?? 0) - (ours?.x ?? 0), (theirs?.y ?? 0) - (ours?.y ?? 0));

    expect(gap).toBeGreaterThan(95);
    expect(theirs?.hp).toBe(theirs?.maxHp);
  });
});

