import { describe, it, expect } from 'vitest';
import { DEFAULT_BEHAVIOUR, runMatch } from '@sim/index';
import type { Behaviour, MatchResult, Release, Rule, SideId, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Чтобы игрок мог отладить своё Поведение, снимок мира сообщает про
 * каждого Юнита, какое Правило он исполняет прямо сейчас и кого выбрал
 * целью. Без этого система Правил неиграбельна (ADR-0002).
 */

const release = (tick: number, side: SideId, unit: UnitKind = 'scout'): Release => ({
  tick,
  side,
  kind: 'deploy',
  roadId: 'short',
  unit,
});
const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

const FLEE: Rule = { when: { kind: 'hp-below', percent: 40 }, do: { kind: 'retreat' } };
const FIGHT: Rule = { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } };
const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };

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

const ours = (result: MatchResult) => result.finalState.units.find((unit) => unit.side === 'A');
const theirs = (result: MatchResult) => result.finalState.units.find((unit) => unit.side === 'B');

describe('какое Правило исполняет Юнит', () => {
  const cautious = everyone([FLEE, FIGHT, ADVANCE]);

  it('в пути — последнее, «иначе идти»', () => {
    const unit = ours(play(cautious, [release(1, 'A')], 20));
    expect(unit?.rule).toBe(2);
  });

  it('встретив врага — «бить», второе по счёту', () => {
    const unit = ours(play(cautious, [release(1, 'A'), release(1, 'B')], 70));
    expect(unit?.rule).toBe(1);
  });

  it('раненый — «отступать», первое', () => {
    const unit = ours(play(cautious, [release(1, 'A'), release(1, 'B')], 110));
    expect(unit?.state).toBe('retreating');
    expect(unit?.rule).toBe(0);
  });
});

describe('кого Юнит выбрал целью', () => {
  it('бьющий называет свою цель', () => {
    const result = play(everyone([FIGHT, ADVANCE]), [release(1, 'A'), release(1, 'B')], 70);

    expect(ours(result)?.target).toBe(theirs(result)?.id);
  });

  it('идущий целей не имеет', () => {
    const result = play(everyone([FIGHT, ADVANCE]), [release(1, 'A')], 20);

    expect(ours(result)?.target).toBeNull();
  });

  it('отступивший перестаёт целиться', () => {
    const result = play(everyone([FLEE, FIGHT, ADVANCE]), [release(1, 'A'), release(1, 'B')], 110);

    expect(ours(result)?.target).toBeNull();
  });
});

describe('цель в снимке всегда существует', () => {
  it('на Тике гибели цели снимок не ссылается на погибшего', () => {
    // Трое бьют одного; на Тике его гибели ни один снимок не должен
    // указывать на Юнита, которого в мире уже нет.
    const releases = [release(1, 'A'), release(2, 'A'), release(3, 'A'), release(1, 'B')];
    const deathTick = (
      play(everyone([FIGHT, ADVANCE]), releases, 400).events.find(
        (event) => event.kind === 'unit-died',
      ) as { tick: number }
    ).tick;
    const atDeath = play(everyone([FIGHT, ADVANCE]), releases, deathTick);
    const alive = new Set(atDeath.finalState.units.map((unit) => unit.id));

    for (const unit of atDeath.finalState.units) {
      if (unit.target !== null) expect(alive.has(unit.target)).toBe(true);
    }
  });
});
