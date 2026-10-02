import { describe, it, expect } from 'vitest';
import { CITADEL_STATS, KILLER_KINDS, runMatch, UNIT_KINDS, UNIT_STATS } from '@sim/index';
import type {
  Behaviour,
  KillerKind,
  MatchResult,
  Release,
  Rule,
  SideId,
  SideReview,
  UnitId,
  UnitKind,
} from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { describeReview, describeRuleUse } from '../src/ui/review-text.js';
import { describeRule } from '../src/ui/rule-text.js';
import { army, arenaWithoutObelisks, matchSetup, STORMING_PARTY } from './match-setup.js';

/**
 * Разбор матча (задача #39): сколько исполнялось каждое Правило, чей урон
 * куда пришёлся, кто кого убил и на каком Правиле Юниты гибли.
 */

const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
const FIGHT: Rule = { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } };
const FLEE: Rule = { when: { kind: 'hp-below', percent: 30 }, do: { kind: 'retreat' } };
const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

const review = (result: MatchResult, side: SideId): SideReview => {
  const found = result.stats.sides.find((entry) => entry.side === side);
  if (!found) throw new Error(`Нет разбора Стороны ${side}`);
  return found;
};

/** Матч, где есть и Стычки, и осада, и Обелиски. */
const brawl = (behaviour: Behaviour): MatchResult => {
  const raid = (side: SideId): Release[] => [
    ...army(['tank', 'ranger', 'scout'], side, 'north'),
    { tick: 150, side, kind: 'deploy', roadId: 'south', unit: 'tank' },
    { tick: 200, side, kind: 'deploy', roadId: 'short', unit: 'scout' },
    { tick: 260, side, kind: 'deploy', roadId: 'short', unit: 'ranger' },
  ];
  return runMatch(
    matchSetup({
      map: arena,
      sides: [
        { id: 'A', behaviour },
        { id: 'B', behaviour },
      ],
      releases: [...raid('A'), ...raid('B')],
      maxTicks: 1500,
    }),
  );
};

describe('разбор по Правилам', () => {
  it('Юнит, весь матч исполнявший одно Правило, засчитан только ему', () => {
    const result = runMatch(
      matchSetup({
        map: arenaWithoutObelisks,
        sides: [{ id: 'A', behaviour: everyone([FLEE, FIGHT, ADVANCE]) }, { id: 'B' }],
        releases: [{ tick: 1, side: 'A', kind: 'deploy', roadId: 'short', unit: 'scout' }],
        maxTicks: 60,
      }),
    );
    const { kinds } = review(result, 'A');

    // Выпущен на Тике 1 и решал на каждом Тике с 1 по 60.
    expect(kinds.scout.ruleTicks).toEqual([0, 0, 60]);
    expect(kinds.tank.ruleTicks).toEqual([0, 0, 0]);
    expect(kinds.scout.deployed).toBe(1);
    expect(kinds.scout.etherSpent).toBe(UNIT_STATS.scout.cost);
  });

  it('несработавшее Правило остаётся в разборе с нулём', () => {
    const { kinds } = review(brawl(everyone([FIGHT, FLEE, ADVANCE])), 'A');
    for (const kind of UNIT_KINDS) expect(kinds[kind].ruleTicks).toHaveLength(3);
    expect(kinds.scout.ruleTicks[2]).toBeGreaterThan(0);
  });
});

describe('разбор урона', () => {
  it('урон по Цитадели равен её снятому здоровью', () => {
    const result = runMatch(
      matchSetup({
        map: arenaWithoutObelisks,
        sides: [{ id: 'A', behaviour: everyone([FIGHT, ADVANCE]) }, { id: 'B' }],
        releases: army(STORMING_PARTY),
        maxTicks: 3000,
      }),
    );
    const { kinds } = review(result, 'A');
    const dealt = UNIT_KINDS.reduce((sum, kind) => sum + kinds[kind].damage.citadel, 0);
    const left = result.finalState.citadels.find((citadel) => citadel.side === 'B')?.hp ?? 0;

    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeCloseTo(CITADEL_STATS.maxHp - left, 6);
    expect(kinds.tank.damagePerEther).toBeCloseTo(
      (kinds.tank.damage.units + kinds.tank.damage.citadel + kinds.tank.damage.obelisks) /
        (2 * UNIT_STATS.tank.cost),
      9,
    );
  });
});

describe('разбор смертей', () => {
  it('погибших столько же, сколько событий гибели, и убийцы сходятся', () => {
    const result = brawl(everyone([FIGHT, FLEE, ADVANCE]));
    const kindOf = new Map<UnitId, UnitKind>();
    for (const event of result.events) if (event.kind === 'unit-deployed') kindOf.set(event.unitId, event.unit);

    for (const side of ['A', 'B'] as const) {
      const { kinds, losses } = review(result, side);
      const deaths = result.events.flatMap((event) =>
        event.kind === 'unit-died' && event.side === side ? [event] : [],
      );
      expect(deaths.length).toBeGreaterThan(0);
      expect(UNIT_KINDS.reduce((sum, kind) => sum + kinds[kind].died, 0)).toBe(deaths.length);

      for (const kind of UNIT_KINDS) {
        const ofKind = deaths.filter((event) => event.unit === kind);
        expect(ofKind.every((event) => kindOf.get(event.unitId) === kind)).toBe(true);
        expect(kinds[kind].deathsByRule.reduce((sum, count) => sum + count, 0)).toBe(ofKind.length);
        for (const killer of KILLER_KINDS) {
          const by = (event: (typeof deaths)[number]): KillerKind | undefined =>
            event.killer.kind === 'unit' ? kindOf.get(event.killer.unitId) : event.killer.kind;
          expect(losses[kind][killer]).toBe(ofKind.filter((event) => by(event) === killer).length);
        }
      }
    }
  });

  it('гибель называет тип, Правило и место', () => {
    const result = brawl(everyone([FIGHT, FLEE, ADVANCE]));
    const death = result.events.find((event) => event.kind === 'unit-died');
    if (death?.kind !== 'unit-died') throw new Error('Никто не погиб');
    expect(UNIT_KINDS).toContain(death.unit);
    expect(death.rule).toBeGreaterThanOrEqual(0);
    expect(death.rule).toBeLessThan(3);
    expect(Number.isFinite(death.at.x) && Number.isFinite(death.at.y)).toBe(true);
  });
});

describe('зеркальность разбора', () => {
  it('одинаковые Правила на обеих Сторонах дают зеркальный разбор', () => {
    const result = brawl(everyone([FIGHT, FLEE, ADVANCE]));
    const { side: _a, ...ours } = review(result, 'A');
    const { side: _b, ...theirs } = review(result, 'B');

    expect(ours.kinds.tank.deployed).toBeGreaterThan(0);
    expect(ours).toEqual(theirs);
  });
});

describe('разбор на итоге матча', () => {
  it('Правила подписаны текстом редактора, несработавшие отмечены', () => {
    const behaviour = everyone([FIGHT, FLEE, ADVANCE]);
    const text = describeReview(review(brawl(behaviour), 'A'), behaviour);
    const tank = text.rules.find((kind) => kind.title === 'Танк');

    expect(tank?.rules.map((rule) => rule.text)).toEqual(behaviour.tank.map(describeRule));
    expect(text.kinds.map((row) => row.title).sort()).toEqual(['Разведчик', 'Стрелок', 'Танк']);
    expect(describeRuleUse(0, 0)).toBe('ни разу не сработало');
    expect(describeRuleUse(30, 2)).toBe('1.5 Юнито-с, погибло на нём: 2');
    for (const kind of text.rules) {
      for (const rule of kind.rules) expect(rule.idle).toBe(rule.use === 'ни разу не сработало');
    }
  });
});
