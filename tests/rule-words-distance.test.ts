import { describe, it, expect } from 'vitest';
import { DEFAULT_BEHAVIOUR, parseRules, runMatch, UNIT_STATS } from '@sim/index';
import type { Action, Behaviour, Condition, MatchResult, Release, Rule, SideId, UnitKind } from '@sim/index';
import { checkRules, draftRules, freshCondition } from '../src/app/draft.js';
import { arena } from '../src/maps/arena.js';
import { describeCondition, describeRule } from '../src/ui/rule-text.js';
import { arenaWithoutObelisks, matchSetup } from './match-setup.js';

/**
 * Слово Правил «враг ближе N» (задача #42, слово 3). С ним отход Стрелка
 * складывается из двух Правил: «враг ближе N → отступать» выше «враг
 * в радиусе → бить».
 */

const release = (tick: number, side: SideId, unit: UnitKind, roadId = 'short'): Release => ({
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
const RETREAT: Action = { kind: 'retreat' };
const KITE: Rule = rule({ kind: 'enemy-closer-than', distance: 60 }, RETREAT);

describe('разбор «враг ближе N»', () => {
  it('расстояние — число от 0 до Обзора, место ошибки названо', () => {
    const ok = parseRules([KITE, ADVANCE], 'ranger');
    expect(ok[0]?.when).toEqual({ kind: 'enemy-closer-than', distance: 60 });

    const bad = (distance: unknown) => () =>
      parseRules([{ when: { kind: 'enemy-closer-than', distance }, do: RETREAT }, ADVANCE], 'ranger');
    expect(bad(-1)).toThrow(/ranger\[0\]\.when\.distance: ожидалось расстояние от 0 до 150/);
    expect(bad(UNIT_STATS.ranger.sight + 1)).toThrow(/ranger\[0\]\.when\.distance/);
    expect(bad('60')).toThrow(/ranger\[0\]\.when\.distance/);
    expect(bad(undefined)).toThrow(/ranger\[0\]\.when\.distance/);
  });

  it('работает внутри «И»', () => {
    const joint = rule([{ kind: 'hp-below', percent: 80 }, { kind: 'enemy-closer-than', distance: 40 }], RETREAT);
    expect(parseRules([joint, ADVANCE], 'ranger')[0]?.when).toHaveLength(2);
  });

  it('редактор начинает с порога 60, и черновик проходит разбор', () => {
    const fresh = freshCondition('enemy-closer-than');
    expect(fresh).toEqual({ kind: 'enemy-closer-than', distance: 60 });
    expect(checkRules([{ when: [fresh], do: RETREAT }, ...draftRules([ADVANCE])])).toBeNull();
  });

  it('человеческим текстом', () => {
    expect(describeCondition({ kind: 'enemy-closer-than', distance: 60 })).toBe('враг ближе 60');
    expect(describeRule(KITE)).toBe('если враг ближе 60 — отступать');
  });
});

describe('отход Стрелка от Танка', () => {
  /** Стрелок A против одиночного Танка B на короткой Дороге, без Обелисков. */
  const duel = (ranger: readonly Rule[]): MatchResult =>
    runMatch(
      matchSetup({
        map: arenaWithoutObelisks,
        sides: [
          { id: 'A', behaviour: { ...DEFAULT_BEHAVIOUR, ranger } },
          { id: 'B', behaviour: DEFAULT_BEHAVIOUR },
        ],
        releases: [release(1, 'A', 'ranger'), release(1, 'B', 'tank')],
        maxTicks: 600,
      }),
    );
  const rangerHp = (result: MatchResult): number =>
    result.finalState.units.find((unit) => unit.side === 'A' && unit.kind === 'ranger')?.hp ?? 0;

  it('с порогом Стрелок теряет заметно меньше здоровья, чем без него', () => {
    const kiting = duel([KITE, FIGHT, ADVANCE]);
    const standing = duel([FIGHT, ADVANCE]);
    const rangerDamage = (result: MatchResult): number =>
      result.stats.sides.find((side) => side.side === 'A')?.kinds.ranger.damage.units ?? 0;

    expect(rangerHp(kiting) - rangerHp(standing)).toBeGreaterThan(UNIT_STATS.ranger.maxHp / 4);
    // Не просто бегство: пока Танк дальше порога, Стрелок по нему стреляет.
    expect(rangerDamage(kiting)).toBeGreaterThan(0);
  });
});

describe('зеркальность с «враг ближе N»', () => {
  it('одинаковые Правила на обеих Сторонах дают зеркальный матч', () => {
    const same: Behaviour = { ...everyone([FIGHT, ADVANCE]), ranger: [KITE, FIGHT, ADVANCE] };
    const raid = (side: SideId): Release[] => [
      release(1, side, 'tank'),
      release(2, side, 'ranger'),
      release(120, side, 'ranger', 'north'),
      release(200, side, 'scout', 'south'),
      release(260, side, 'ranger'),
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
      survivors: result.finalState.units
        .filter((unit) => unit.side === id)
        .map((unit) => `${unit.kind}:${unit.hp.toFixed(6)}:${unit.state}`)
        .sort(),
    });

    expect(result.events.some((event) => event.kind === 'unit-died')).toBe(true);
    expect(bySide('A')).toEqual(bySide('B'));
  });
});
