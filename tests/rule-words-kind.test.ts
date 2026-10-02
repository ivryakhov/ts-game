import { describe, it, expect } from 'vitest';
import { DEFAULT_BEHAVIOUR, parseRules, runMatch } from '@sim/index';
import type { Action, Behaviour, Condition, MatchResult, Release, Rule, SideId, UnitKind } from '@sim/index';
import { checkRules, draftRules, freshCondition } from '../src/app/draft.js';
import { arena } from '../src/maps/arena.js';
import { describeCondition, describeRule } from '../src/ui/rule-text.js';
import { matchSetup } from './match-setup.js';

/**
 * Новые слова Правил (задача #42, слова 1 и 2): «вижу врага типа X»
 * и «своих типа X рядом меньше/больше N». Каждое обязано наблюдаемо
 * менять исход.
 */

const release = (tick: number, side: SideId, unit: UnitKind = 'scout', roadId = 'short'): Release => ({
  tick,
  side,
  kind: 'deploy',
  roadId,
  unit,
});
const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });
const rule = (when: Condition | readonly Condition[], act: Action): Rule => ({ when, do: act }) as Rule;

const ADVANCE: Rule = rule({ kind: 'always' }, { kind: 'advance' });
const FIGHT: Rule = rule({ kind: 'enemy-in-range' }, { kind: 'attack-nearest' });
const HOLD: Action = { kind: 'hold' };
const RETREAT: Action = { kind: 'retreat' };

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

const unitsOf = (result: MatchResult, side: SideId, kind?: UnitKind) =>
  result.finalState.units.filter((unit) => unit.side === side && (kind === undefined || unit.kind === kind));

describe('разбор новых слов', () => {
  it('«вижу врага типа X» требует известный тип, и место ошибки названо', () => {
    const ok = [rule({ kind: 'enemy-kind-in-range', unit: 'tank' }, RETREAT), ADVANCE];
    expect(parseRules(ok, 'ranger')[0]?.when).toEqual({ kind: 'enemy-kind-in-range', unit: 'tank' });
    expect(() => parseRules([{ when: { kind: 'enemy-kind-in-range' }, do: RETREAT }, ADVANCE], 'ranger')).toThrow(
      /ranger\[0\]\.when\.unit: неизвестный тип «undefined»/,
    );
  });

  it('«своих рядом» без типа — как прежде, с типом — только этот тип', () => {
    const any = parseRules([rule({ kind: 'allies-nearby', compare: 'fewer', count: 1 }, HOLD), ADVANCE], 'r');
    expect(any[0]?.when).toEqual({ kind: 'allies-nearby', compare: 'fewer', count: 1 });
    expect(() =>
      parseRules([{ when: { kind: 'allies-nearby', compare: 'fewer', count: 1, unit: 'tnak' }, do: HOLD }, ADVANCE], 'r'),
    ).toThrow(/r\[0\]\.when\.unit: неизвестный тип «tnak»/);
  });

  it('оба слова работают внутри «И»', () => {
    const joint = rule(
      [
        { kind: 'at-home' },
        { kind: 'allies-nearby', compare: 'fewer', count: 1, unit: 'tank' },
        { kind: 'enemy-kind-in-range', unit: 'scout' },
      ],
      HOLD,
    );
    expect(parseRules([joint, ADVANCE], 'ranger')[0]?.when).toHaveLength(3);
  });

  it('редактор начинает «вижу врага типа» с готового типа, и черновик проходит разбор', () => {
    const fresh = freshCondition('enemy-kind-in-range');
    expect(fresh).toEqual({ kind: 'enemy-kind-in-range', unit: 'scout' });
    expect(checkRules([{ when: [fresh], do: HOLD }, ...draftRules([ADVANCE])])).toBeNull();
  });

  it('человеческим текстом', () => {
    expect(describeCondition({ kind: 'enemy-kind-in-range', unit: 'tank' })).toBe('вижу Танка');
    expect(describeCondition({ kind: 'allies-nearby', compare: 'fewer', count: 1, unit: 'tank' })).toBe(
      'своих Танков рядом меньше 1',
    );
    expect(describeCondition({ kind: 'allies-nearby', compare: 'more', count: 2 })).toBe('своих рядом больше 2');
    expect(describeRule(rule({ kind: 'enemy-kind-in-range', unit: 'ranger' }, RETREAT))).toBe(
      'если вижу Стрелка — отступать',
    );
  });
});

describe('Условие «вижу врага типа X»', () => {
  // Стрелок, который бежит от Танка, но бьёт Разведчика.
  const wary = everyone([rule({ kind: 'enemy-kind-in-range', unit: 'tank' }, RETREAT), FIGHT, ADVANCE]);

  it('увидев Танка, Стрелок отходит, а не стреляет', () => {
    const result = play(wary, [release(1, 'A', 'ranger'), release(1, 'B', 'tank')], 200);
    const ranger = unitsOf(result, 'A', 'ranger')[0];
    const tank = unitsOf(result, 'B', 'tank')[0];

    expect(ranger?.state).toBe('retreating');
    expect(tank?.hp).toBe(tank?.maxHp);
  });

  it('против Разведчика то же Правило ложно — Стрелок стреляет', () => {
    const result = play(wary, [release(1, 'A', 'ranger'), release(1, 'B', 'scout')], 200);
    const scout = result.events.some((event) => event.kind === 'unit-died' && event.side === 'B');
    expect(scout).toBe(true);
  });

  it('меняет исход: без него Стрелок бьёт Танка', () => {
    const result = play(everyone([FIGHT, ADVANCE]), [release(1, 'A', 'ranger'), release(1, 'B', 'tank')], 200);
    const tank = unitsOf(result, 'B', 'tank')[0];
    expect(tank?.hp).toBeLessThan(tank?.maxHp ?? 0);
  });
});

describe('Условие «своих типа X рядом»', () => {
  // Стрелок не выходит из дома без Танка.
  const escorted = everyone([
    rule([{ kind: 'at-home' }, { kind: 'allies-nearby', compare: 'fewer', count: 1, unit: 'tank' }], HOLD),
    ADVANCE,
  ]);

  it('Стрелок без Танка стоит у своей Цитадели', () => {
    const result = play(escorted, [release(1, 'A', 'ranger'), release(1, 'A', 'scout')], 40);
    const ranger = unitsOf(result, 'A', 'ranger')[0];
    // Разведчик рядом не в счёт. Оба стоят в воротах и лишь чуть
    // расталкивают друг друга.
    expect(ranger?.state).toBe('holding');
    expect(ranger?.progress).toBeLessThan(0.05);
  });

  it('с Танком рядом — идёт', () => {
    const result = play(escorted, [release(1, 'A', 'tank'), release(1, 'A', 'ranger')], 40);
    expect(unitsOf(result, 'A', 'ranger')[0]?.progress).toBeGreaterThan(0.05);
  });

  it('без типа счёт по всем своим: Разведчик рядом тоже годится', () => {
    const anyone = everyone([
      rule([{ kind: 'at-home' }, { kind: 'allies-nearby', compare: 'fewer', count: 1 }], HOLD),
      ADVANCE,
    ]);
    const result = play(anyone, [release(1, 'A', 'ranger'), release(1, 'A', 'scout')], 40);
    expect(unitsOf(result, 'A', 'ranger')[0]?.progress).toBeGreaterThan(0.05);
  });
});

describe('зеркальность с новыми словами', () => {
  it('одинаковые Правила с обоими словами на обеих Сторонах дают зеркальный матч', () => {
    const same: Behaviour = {
      scout: [rule({ kind: 'enemy-kind-in-range', unit: 'ranger' }, { kind: 'attack-kind', unit: 'ranger' }), FIGHT, ADVANCE],
      tank: [FIGHT, ADVANCE],
      ranger: [
        rule({ kind: 'enemy-kind-in-range', unit: 'scout' }, RETREAT),
        rule([{ kind: 'at-home' }, { kind: 'allies-nearby', compare: 'fewer', count: 1, unit: 'tank' }], HOLD),
        FIGHT,
        ADVANCE,
      ],
    };
    const raid = (side: SideId): Release[] => [
      release(1, side, 'tank'),
      release(2, side, 'ranger'),
      release(120, side, 'scout', 'north'),
      release(200, side, 'ranger', 'south'),
      release(260, side, 'scout'),
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
      survivors: unitsOf(result, id)
        .map((unit) => `${unit.kind}:${unit.hp.toFixed(6)}:${unit.state}`)
        .sort(),
    });

    expect(result.events.some((event) => event.kind === 'unit-died')).toBe(true);
    expect(bySide('A')).toEqual(bySide('B'));
  });
});
