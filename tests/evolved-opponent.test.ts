import { afterEach, describe, it, expect } from 'vitest';
import { createRng, opponentFromFile } from '@sim/index';
import { EVOLVED_KEY, evolvedText, isEvolved, readEvolved, saveEvolved } from '../src/ui/evolved.js';
import { loadOpponents } from '../src/app/opponents.js';
import { randomCandidate, type Candidate } from '../src/evolve/candidate.js';
import { candidateSide, examBout, type Bout } from '../src/evolve/exam.js';
import { prune } from '../src/evolve/prune.js';
import { evolvedDescription } from '../src/lab/evolved-actions.js';
import { arena } from '../src/maps/arena.js';

/**
 * Выведенный Противник (тикет 31): лучший Претендент без неисполнявшихся
 * Правил, сохранённый в браузере и видимый игре как любой Противник.
 */

const ROADS = arena.roads.map((road) => road.id);
const roster = loadOpponents(arena, 'B');
const examiners = roster.opponents.map((entry) => ({ id: entry.id, side: entry.side }));
const examOf = (candidate: Candidate): Bout[] =>
  examiners.map((examiner) => examBout(candidateSide(candidate, arena), examiner, 0, arena));

describe('вычистка', () => {
  // Сид 4: у случайного Претендента есть и сработавшие, и ни разу не сработавшие Правила.
  const candidate = randomCandidate(createRng(4), ROADS);
  const bouts = examOf(candidate);
  const pruned = prune(candidate, bouts);

  it('убирает Правило, не исполнявшееся ни одного Юнито-Тика за весь Экзамен, и оставляет последнее', () => {
    let removed = 0;
    for (const kind of ['scout', 'tank', 'ranger'] as const) {
      const rules = candidate.behaviour[kind];
      const used = (index: number) => bouts.some((bout) => (bout.ruleTicks[kind][index] ?? 0) > 0);
      const kept = rules.filter((_, index) => index === rules.length - 1 || used(index));
      expect(pruned.behaviour[kind]).toEqual(kept);
      expect(pruned.behaviour[kind].at(-1)).toEqual(rules.at(-1));
      removed += rules.length - kept.length;
    }
    expect(removed).toBeGreaterThan(0);
  });

  it('игры не меняет: тот же Экзамен даёт те же исходы, время и Цитадели', () => {
    const strip = ({ ruleTicks: _ticks, ...rest }: Bout) => rest;
    expect(examOf(pruned).map(strip)).toEqual(bouts.map(strip));
  });

  it('Волны не трогает, а вычищенный проходит разбор файла Противника', () => {
    expect(pruned.waves).toBe(candidate.waves);
    expect(() => candidateSide(pruned, arena)).not.toThrow();
  });
});

describe('Выведенные Противники в браузере', () => {
  const scope = globalThis as unknown as { window?: unknown };
  const items = new Map<string, string>();
  afterEach(() => {
    delete scope.window;
    items.clear();
  });
  const browser = () => {
    scope.window = {
      localStorage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
      },
    };
  };
  const turtle = roster.opponents.find((entry) => entry.id === 'turtle')!;
  const candidate: Candidate = { behaviour: turtle.side.behaviour!, waves: turtle.side.waves! };

  it('номера идут по порядку: «Выведенный №1», «№2», в адресе evolved-1, evolved-2', () => {
    browser();

    expect(saveEvolved(candidate, 'первый')).toEqual({ id: 'evolved-1', name: 'Выведенный №1' });
    expect(saveEvolved(candidate, 'второй')).toEqual({ id: 'evolved-2', name: 'Выведенный №2' });
    expect(isEvolved('evolved-2')).toBe(true);
    expect(isEvolved('turtle')).toBe(false);
  });

  it('игра читает их Противниками за любую Сторону — с теми же Правилами и Волнами', () => {
    browser();
    saveEvolved(candidate, 'Поколение 3 из Сида 1: выигрывает 7 из 7');

    const { opponents, problems } = readEvolved(arena, 'A');
    expect(problems).toEqual([]);
    expect(opponents).toHaveLength(1);
    expect(opponents[0]).toMatchObject({ id: 'evolved-1', name: 'Выведенный №1', description: 'Поколение 3 из Сида 1: выигрывает 7 из 7' });
    expect(opponents[0]?.side.id).toBe('A');
    expect(opponents[0]?.side.behaviour).toEqual(turtle.side.behaviour);
    expect(opponents[0]?.side.waves).toEqual(turtle.side.waves);
  });

  it('скачанный файл — в формате src/behaviours/opponents и проходит его разбор', () => {
    browser();
    saveEvolved(candidate, 'файлом');

    const text = evolvedText('evolved-1');
    expect(text).not.toBeNull();
    const file = opponentFromFile('B', JSON.parse(text ?? '{}'), arena);
    expect(file.name).toBe('Выведенный №1');
    expect(file.side.behaviour).toEqual(turtle.side.behaviour);
  });

  it('испорченный не лишает остальных: он — в проблемах с причиной', () => {
    browser();
    saveEvolved(candidate, 'целый');
    const stored = JSON.parse(items.get(EVOLVED_KEY) ?? '[]') as unknown[];
    items.set(EVOLVED_KEY, JSON.stringify([...stored, { id: 'evolved-9', file: { name: 'Сломанный', description: 'x', scout: [] } }]));

    const { opponents, problems } = readEvolved(arena, 'B');
    expect(opponents.map((entry) => entry.id)).toEqual(['evolved-1']);
    expect(problems.join('\n')).toContain('evolved-9');
  });

  it('без хранилища — ни Выведенных, ни ошибки', () => {
    expect(saveEvolved(candidate, 'некуда')).toBeNull();
    expect(readEvolved(arena, 'B')).toEqual({ opponents: [], problems: [] });
  });
});

describe('описание Выведенного', () => {
  it('Поколение, Сид и сколько побед из скольких матчей', () => {
    const win = { outcome: 'win' } as Bout;
    const loss = { outcome: 'loss' } as Bout;

    expect(evolvedDescription({ generation: 12, seed: 7 }, [win, loss, win])).toBe('Поколение 12 из Сида 7: выигрывает 2 из 3');
  });
});
