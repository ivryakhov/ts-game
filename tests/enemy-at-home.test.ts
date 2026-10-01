import { describe, it, expect } from 'vitest';
import { CITADEL_STATS, DEFAULT_BEHAVIOUR, createMatch } from '@sim/index';
import type { Behaviour, MatchResult, Release, Rule, SideId, UnitSnapshot } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { army, matchSetup } from './match-setup.js';

/**
 * «Враг у своей Цитадели» (спека 0002, тикет 15): знание глобальное, как
 * «враг впереди», — Юнит знает, что дом осаждают, где бы ни стоял. Мерка —
 * дальность удара стен по геометрии текущего Тика, без памяти об уроне.
 */

const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
const GO_HOME: Rule = { when: { kind: 'enemy-at-home' }, do: { kind: 'retreat' } };
const DEFEND: Rule = {
  when: [{ kind: 'enemy-at-home' }, { kind: 'enemy-in-range' }],
  do: { kind: 'attack-nearest' },
};

/** Цитадель A — в (150, 420). */
const HOME_A = { x: 150, y: 420 };
const fromHomeA = (unit: UnitSnapshot) => Math.hypot(unit.x - HOME_A.x, unit.y - HOME_A.y);

/** Матч по Тикам: что было с нашим Юнитом и с врагом после каждого. */
function trace(ours: Behaviour, releases: readonly Release[], maxTicks: number) {
  const match = createMatch(
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
  const ticks: { ours: UnitSnapshot | undefined; enemy: UnitSnapshot | undefined }[] = [];
  while (!match.finished) {
    match.step();
    const { units } = match.snapshot();
    ticks.push({
      ours: units.find((unit) => unit.side === 'A'),
      enemy: units.find((unit) => unit.side === 'B'),
    });
  }
  return ticks;
}

describe('Условие «враг у своей Цитадели»', () => {
  it('разворачивает Юнита с дальней Дороги, когда враг подходит к стенам, — и не раньше', () => {
    // Наш идёт обходной Дорогой, враг — короткой: встретиться им негде,
    // и о враге наш узнаёт только по Условию.
    const ticks = trace(
      everyone([GO_HOME, ADVANCE]),
      [
        { tick: 1, side: 'A', kind: 'deploy', roadId: 'north', unit: 'scout' },
        { tick: 40, side: 'B', kind: 'deploy', roadId: 'short', unit: 'scout' },
      ],
      200,
    );

    // Решение Тика принимается по расстановке, сложившейся к его началу.
    const decisions = ticks.slice(1).map((now, index) => {
      const enemy = ticks[index]?.enemy;
      return {
        enemyAtWalls: enemy !== undefined && fromHomeA(enemy) <= CITADEL_STATS.range,
        retreating: now.ours?.state === 'retreating',
      };
    });

    expect(decisions.some((tick) => tick.enemyAtWalls)).toBe(true);
    expect(decisions.some((tick) => !tick.enemyAtWalls)).toBe(true);
    for (const tick of decisions) expect(tick.retreating).toBe(tick.enemyAtWalls);
    // Развернулся далеко от дома: Условие не зависит от того, где он стоит.
    const turned = ticks.find((tick) => tick.ours?.state === 'retreating')?.ours;
    expect(turned && fromHomeA(turned)).toBeGreaterThan(500);
  });

  // Танк осаждает Цитадель A; наш Разведчик вышел позже и ушёл далеко
  // по обходной Дороге.
  const siege: readonly Release[] = [
    { tick: 1, side: 'B', kind: 'deploy', roadId: 'short', unit: 'tank' },
    { tick: 200, side: 'A', kind: 'deploy', roadId: 'north', unit: 'scout' },
  ];

  it('защитник «враг у своей Цитадели и враг в радиусе → бить ближайшего» вступает в Стычку с осаждающим', () => {
    const ticks = trace(everyone([DEFEND, GO_HOME, ADVANCE]), siege, 600);

    const fight = ticks.find((tick) => tick.ours?.state === 'fighting');
    expect(fight?.ours?.target).toBe(fight?.enemy?.id);
    expect(fight?.enemy && fromHomeA(fight.enemy)).toBeLessThanOrEqual(CITADEL_STATS.range);
  });

  it('без Правила защиты вернувшийся домой не бьёт осаждающего', () => {
    const ticks = trace(everyone([GO_HOME, ADVANCE]), siege, 600);

    expect(ticks.some((tick) => tick.ours?.state === 'retreating')).toBe(true);
    expect(ticks.some((tick) => tick.ours?.state === 'fighting')).toBe(false);
  });

  it('матч с одинаковыми Правилами на обеих Сторонах остаётся зеркальным', () => {
    const same = everyone([
      DEFEND,
      GO_HOME,
      { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } },
      ADVANCE,
    ]);
    // Набег обходной Дорогой: по одной Дороге армии встретились бы на
    // середине и до чужих стен не дошли. Северная Дорога для A — то же,
    // что южная для B: карта переходит в себя поворотом на пол-оборота.
    const raid = (side: SideId, road: string, other: string): Release[] => [
      ...army(['tank', 'ranger'], side, road),
      { tick: 250, side, kind: 'deploy', roadId: other, unit: 'scout' },
      { tick: 260, side, kind: 'deploy', roadId: 'short', unit: 'scout' },
    ];
    const match = createMatch(
      matchSetup({
        map: arena,
        sides: [
          { id: 'A', behaviour: same },
          { id: 'B', behaviour: same },
        ],
        releases: [...raid('A', 'north', 'south'), ...raid('B', 'south', 'north')],
        maxTicks: 1500,
      }),
    );
    let calledHome = 0;
    while (!match.finished) {
      match.step();
      calledHome += match.snapshot().units.filter((unit) => unit.rule === 1).length;
    }
    const result: MatchResult = match.result();
    const bySide = (id: SideId) => ({
      citadel: result.finalState.citadels.find((citadel) => citadel.side === id)?.hp,
      died: result.events.filter((event) => event.kind === 'unit-died' && event.side === id).length,
      states: result.finalState.units
        .filter((unit) => unit.side === id)
        .map((unit) => unit.state)
        .sort(),
    });

    // Новое слово в этом матче решает, а не стоит без дела.
    expect(calledHome).toBeGreaterThan(0);
    expect(result.winner).toBeNull();
    expect(bySide('A').died).toBeGreaterThan(0);
    expect(bySide('A')).toEqual(bySide('B'));
  });
});
