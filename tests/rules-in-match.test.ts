import { describe, it, expect } from 'vitest';
import { DEFAULT_BEHAVIOUR, parseBehaviour, runMatch } from '@sim/index';
import type { Behaviour, MatchResult, Rule, ScheduledRelease, SideId, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Правила меняют исход матча — это единственное, ради чего они существуют.
 * Каждое Условие и каждое Действие обязано наблюдаемо влиять на то, что
 * происходит на Дороге.
 */

const deploy = (tick: number, side: SideId, unit: UnitKind = 'scout'): ScheduledRelease => ({
  tick,
  side,
  kind: 'deploy',
  roadId: 'short',
  unit,
});

/** Одинаковое Поведение для всех типов Юнитов одной Стороны. */
const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
const FIGHT: Rule = { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } };
const FLEE_BELOW = (percent: number): Rule => ({
  when: { kind: 'hp-below', percent },
  do: { kind: 'retreat' },
});

function duel(
  ours: Behaviour,
  actions: readonly ScheduledRelease[],
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
      releases: actions,
      maxTicks,
    }),
  );
}

const unitOf = (result: MatchResult, side: SideId) =>
  result.finalState.units.find((unit) => unit.side === side);

describe('Действие «атаковать ближайшего»', () => {
  it('бьёт врага, стоящего в радиусе', () => {
    const result = duel(everyone([FIGHT, ADVANCE]), [deploy(1, 'A'), deploy(1, 'B')], 95);

    expect(unitOf(result, 'B')?.hp).toBeLessThan(unitOf(result, 'B')?.maxHp ?? 0);
  });
});

describe('Действие «идти вперёд»', () => {
  it('не бьёт: Юнит, умеющий только идти, не наносит врагу урона', () => {
    // Сторона B дерётся как обычно, Сторона A только идёт. Встретившись,
    // A стоит и молча получает удары.
    const result = duel(everyone([ADVANCE]), [deploy(1, 'A'), deploy(1, 'B')], 95);

    expect(unitOf(result, 'B')?.hp).toBe(unitOf(result, 'B')?.maxHp);
    expect(unitOf(result, 'A')?.hp).toBeLessThan(unitOf(result, 'A')?.maxHp ?? 0);
  });

  it('не проходит сквозь врага', () => {
    const result = duel(everyone([ADVANCE]), [deploy(1, 'A'), deploy(1, 'B')], 95);
    const ours = unitOf(result, 'A');
    const theirs = unitOf(result, 'B');

    // Сторона A идёт от начала Дороги, поэтому её доля пути меньше.
    expect(ours?.progress ?? 1).toBeLessThan(theirs?.progress ?? 0);
  });
});

describe('Действие «отступить»', () => {
  it('уводит Юнита назад, к своей Цитадели', () => {
    // Всё время отступать: от своей Цитадели Юнит так и не отходит.
    const alwaysFlee = everyone([{ when: { kind: 'always' }, do: { kind: 'retreat' } }]);
    const result = duel(alwaysFlee, [deploy(1, 'A')], 40);

    expect(unitOf(result, 'A')?.progress).toBe(0);
  });

  it('спасает: с отступлением при ранении Юнит выживает, без него — гибнет', () => {
    const cautious = everyone([FLEE_BELOW(40), FIGHT, ADVANCE]);
    const reckless = everyone([FIGHT, ADVANCE]);
    const actions = [deploy(1, 'A'), deploy(1, 'B')];

    // Равный поединок: без отступления гибнут оба.
    const withoutRetreat = duel(reckless, actions, 400);
    const withRetreat = duel(cautious, actions, 400);

    expect(unitOf(withoutRetreat, 'A')).toBeUndefined();
    expect(unitOf(withRetreat, 'A')).toBeDefined();
  });
});

describe('Условия', () => {
  it('«враг в радиусе» ложно, пока враг далеко: Юнит просто идёт', () => {
    // Правило драться стоит первым, но врага нет — срабатывает следующее.
    const result = duel(everyone([FIGHT, ADVANCE]), [deploy(1, 'A')], 30);

    expect(unitOf(result, 'A')?.state).toBe('moving');
    expect(unitOf(result, 'A')?.progress).toBeGreaterThan(0);
  });

  it('«здоровье ниже» срабатывает только после ранения', () => {
    const cautious = everyone([FLEE_BELOW(40), FIGHT, ADVANCE]);

    // До Стычки Юнит цел и идёт вперёд, несмотря на правило отступать.
    const early = duel(cautious, [deploy(1, 'A'), deploy(1, 'B')], 30);
    expect(unitOf(early, 'A')?.state).toBe('moving');

    // После ранения — отступает.
    const hurt = duel(cautious, [deploy(1, 'A'), deploy(1, 'B')], 135);
    expect(unitOf(hurt, 'A')?.state).toBe('retreating');
  });
});

describe('Условия и Действия не срабатывают сами по себе', () => {
  it('«враг в радиусе» ложно без врага: Правило отступать при враге не мешает идти', () => {
    // Если бы Условие было истинно всегда, Юнит отступал бы с первого Тика
    // и так и стоял у своей Цитадели.
    const fleeOnSight = everyone([{ when: { kind: 'enemy-in-range' }, do: { kind: 'retreat' } }, ADVANCE]);
    const result = duel(fleeOnSight, [deploy(1, 'A')], 30);

    expect(unitOf(result, 'A')?.progress).toBeGreaterThan(0.1);
  });

  it('отступление действительно уводит назад, а не оставляет на месте', () => {
    // Юнит идёт, пока цел, потом разворачивается. Через время после
    // разворота он должен оказаться ближе к своей Цитадели, чем был.
    const turnBack = everyone([FLEE_BELOW(90), FIGHT, ADVANCE]);
    const actions = [deploy(1, 'A'), deploy(1, 'B')];
    // Стычка с 74-го Тика; 10% здоровья уходит примерно к 81-му.
    const atTurn = unitOf(duel(turnBack, actions, 83), 'A');
    const later = unitOf(duel(turnBack, actions, 110), 'A');

    expect(atTurn?.state).toBe('retreating');
    expect(later?.progress ?? 1).toBeLessThan(atTurn?.progress ?? 0);
  });

  it('отступающего можно добить в спину — отход не даёт неуязвимости', () => {
    // Всегда отступать, едва завидев врага: медленный Танк уходит, но
    // быстрый Разведчик его догоняет и бьёт. Урон по нему обязан проходить.
    const coward = everyone([{ when: { kind: 'enemy-in-range' }, do: { kind: 'retreat' } }, ADVANCE]);
    const result = duel(coward, [deploy(1, 'A', 'tank'), deploy(1, 'B')], 150);

    expect(unitOf(result, 'A')?.hp).toBeLessThan(unitOf(result, 'A')?.maxHp ?? 0);
  });
});

describe('порядок Правил', () => {
  it('проверяются все Правила по очереди, а не только первое', () => {
    // Первое не сработает (Юнит цел), второе сработает — и оно
    // не «идти вперёд», поэтому его эффект виден.
    const second = everyone([FLEE_BELOW(1), { when: { kind: 'always' }, do: { kind: 'retreat' } }, ADVANCE]);
    const result = duel(second, [deploy(1, 'A')], 30);

    expect(unitOf(result, 'A')?.state).toBe('retreating');
    expect(unitOf(result, 'A')?.progress).toBe(0);
  });

  it('Правило выше вытесняет нижнее, когда оба Условия истинны', () => {
    // «Всегда идти» стоит первым и всегда истинно — до «драться» дело
    // не доходит никогда, хотя враг в радиусе.
    const advanceFirst = everyone([ADVANCE, FIGHT, ADVANCE]);
    const result = duel(advanceFirst, [deploy(1, 'A'), deploy(1, 'B')], 95);

    expect(unitOf(result, 'B')?.hp).toBe(unitOf(result, 'B')?.maxHp);
  });

  it('те же Правила в другом порядке дают другой исход', () => {
    const actions = [deploy(1, 'A'), deploy(1, 'B')];
    const advanceFirst = duel(everyone([ADVANCE, FIGHT, ADVANCE]), actions, 95);
    const fightFirst = duel(everyone([FIGHT, ADVANCE]), actions, 95);

    expect(unitOf(advanceFirst, 'B')?.hp).not.toBe(unitOf(fightFirst, 'B')?.hp);
  });
});

describe('Поведение из файла', () => {
  it('разобранное из JSON работает так же, как заданное в коде', () => {
    const fromFile = parseBehaviour(
      JSON.parse(
        JSON.stringify({
          scout: [
            { when: { kind: 'hp-below', percent: 40 }, do: { kind: 'retreat' } },
            { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } },
            { when: { kind: 'always' }, do: { kind: 'advance' } },
          ],
          tank: [{ when: { kind: 'always' }, do: { kind: 'advance' } }],
          ranger: [{ when: { kind: 'always' }, do: { kind: 'advance' } }],
        }),
      ),
    );
    const actions = [deploy(1, 'A'), deploy(1, 'B')];
    const inCode = everyone([FLEE_BELOW(40), FIGHT, ADVANCE]);

    expect(duel(fromFile, actions, 400)).toEqual(duel(inCode, actions, 400));
  });

  it('без заданного Поведения Юниты ведут себя как прежде', () => {
    const actions = [deploy(1, 'A'), deploy(1, 'B')];
    const implicit = runMatch(matchSetup({ map: arena, releases: actions, maxTicks: 400 }));

    expect(implicit).toEqual(duel(DEFAULT_BEHAVIOUR, actions, 400));
  });
});
