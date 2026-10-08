import { afterEach, describe, it, expect } from 'vitest';
import { createRng, runMatch, type MatchResult } from '@sim/index';
import { examFromAddress, examLabel, matchSetupOf } from '../src/app/exam-match.js';
import { lineupOf } from '../src/app/lineup.js';
import { loadOpponents } from '../src/app/opponents.js';
import { randomCandidate, type Candidate } from '../src/evolve/candidate.js';
import { candidateSide, examBout } from '../src/evolve/exam.js';
import { breed, firstBorn } from '../src/evolve/generation.js';
import { arena } from '../src/maps/arena.js';
import { PREVIEW_ID, readPreview, writePreview } from '../src/ui/preview.js';

/**
 * Матч Экзамена в игре (тикет 35): игра собирает из адреса и места
 * предпросмотра ровно тот матч, что сыграл Экзамен.
 */

const ROADS = arena.roads.map((road) => road.id);
const files = loadOpponents(arena, 'B');
const scope = globalThis as unknown as { window?: unknown };
const items = new Map<string, string>();
afterEach(() => {
  delete scope.window;
  items.clear();
});
scope.window = undefined;

function browser(): void {
  scope.window = {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    },
  };
}

/** Матч, который соберёт игра по адресу `?ally=lab-preview&opponent=…&shift=…&limit=exam`. */
function gameMatch(candidate: Candidate, opponent: string, shift: number): MatchResult {
  browser();
  expect(writePreview(candidate, 'Претендент 3·12', 'Матч Экзамена')).toBe(true);
  const preview = readPreview(arena, 'B');
  if (!preview || !('opponent' in preview)) throw new Error('место предпросмотра не прочитано');
  const address = new URLSearchParams({ ally: PREVIEW_ID, opponent, shift: String(shift), limit: 'exam' });
  const lineup = lineupOf([...files.opponents, preview.opponent], { ally: address.get('ally'), opponent: address.get('opponent') }, 'A', 'B');
  const sides = lineup.sides({ id: 'A' });
  // Сид и предел игры — обычные: Матч Экзамена обязан их заменить.
  const setup = matchSetupOf({ seed: 777, map: arena, sides, releases: [], maxTicks: 24_000 }, examFromAddress(address));
  return runMatch(setup);
}

const same = (game: MatchResult, exam: ReturnType<typeof examBout>) => {
  const hp = (side: 'A' | 'B') => {
    const citadel = game.finalState.citadels.find((entry) => entry.side === side)!;
    return Math.max(0, citadel.hp) / citadel.maxHp;
  };
  const outcome = game.winner === 'A' ? 'win' : game.winner === 'B' ? 'loss' : 'draw';
  expect({ outcome, ticks: game.ticks, ownHp: hp('A'), foeHp: hp('B') }).toEqual({
    outcome: exam.outcome,
    ticks: exam.ticks,
    ownHp: exam.ownHp,
    foeHp: exam.foeHp,
  });
};

describe('Матч Экзамена в игре', () => {
  const turtle = files.opponents.find((entry) => entry.id === 'turtle')!;
  const flank = files.opponents.find((entry) => entry.id === 'flank')!;
  // Претендент второго Поколения — ребёнок, как в настоящем прогоне.
  const rng = createRng(12);
  const first = firstBorn(rng, 8, ROADS);
  const second = breed(rng, first.map(({ candidate }, index) => ({ candidate, score: index })), ROADS);
  const child = second.find((born) => born.birth.kind === 'child')!.candidate;

  it('первое Поколение (сдвиг 0) — тот же исход, Тики и Цитадели, что Экзамен', () => {
    const candidate = randomCandidate(createRng(3), ROADS);
    same(gameMatch(candidate, 'turtle', 0), examBout(candidateSide(candidate, arena), { id: 'turtle', side: turtle.side }, 0, arena));
  });

  it.each([1, 2, 4])('Поколение со сдвигом %d — тот же матч, что Экзамен', (shift) => {
    for (const [opponent, side] of [['turtle', turtle.side], ['flank', flank.side]] as const) {
      same(gameMatch(child, opponent, shift), examBout(candidateSide(child, arena), { id: opponent, side }, shift, arena));
    }
  });

  it('надпись: Поколение — сдвиг + 1, Волна начала — сдвиг по модулю числа Волн', () => {
    expect(examLabel({ shift: 4 }, 3)).toMatch(/^Матч Экзамена · Поколение 5 · сдвиг Волн 1/);
    expect(examLabel({ shift: 0 }, 3)).toMatch(/Поколение 1 · сдвиг Волн 0/);
  });

  it('адрес без limit=exam или с негодным сдвигом — обычный матч', () => {
    expect(examFromAddress(new URLSearchParams('shift=2'))).toBeNull();
    expect(examFromAddress(new URLSearchParams('limit=exam&shift=-1'))).toBeNull();
    expect(examFromAddress(new URLSearchParams('limit=exam&shift=3'))).toEqual({ shift: 3 });
  });

  it('место предпросмотра одно: «Смотреть» перезаписывает его', () => {
    browser();
    writePreview(child, 'Претендент 2·3', 'первый');
    writePreview(turtle.side as unknown as Candidate, 'Претендент 2·4', 'второй');
    const preview = readPreview(arena, 'B');
    expect(preview && 'opponent' in preview ? preview.opponent.name : null).toBe('Претендент 2·4');
  });
});
