import { afterEach, describe, it, expect } from 'vitest';
import { createRng, opponentFromFile } from '@sim/index';
import { EVOLVED_KEY, evolvedText, findEvolved, isEvolved, readEvolved, saveEvolved } from '../src/ui/evolved.js';
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
  const rush = roster.opponents.find((entry) => entry.id === 'rush-easy')!;
  const other: Candidate = { behaviour: rush.side.behaviour!, waves: rush.side.waves! };
  const saved = async (what: Candidate, description = 'проверка') => {
    const result = await saveEvolved(what, description);
    if ('problem' in result) throw new Error(result.problem);
    return result;
  };

  it('имена по порядку «Выведенный №1», «№2», а адреса уникальны и с префиксом evolved-', async () => {
    browser();
    const first = await saved(candidate);
    const second = await saved(other);

    expect([first.name, second.name]).toEqual(['Выведенный №1', 'Выведенный №2']);
    expect(isEvolved(first.id) && isEvolved(second.id)).toBe(true);
    expect(first.id).not.toBe(second.id);
    expect(first.id).not.toBe('evolved-1');
  });

  it('игра читает их Противниками за любую Сторону — с теми же Правилами и Волнами', async () => {
    browser();
    const { id } = await saved(candidate, 'Поколение 3 из Сида 1: выигрывает 7 из 7');

    const { opponents, problems } = readEvolved(arena, 'A');
    expect(problems).toEqual([]);
    expect(opponents).toHaveLength(1);
    expect(opponents[0]).toMatchObject({ id, name: 'Выведенный №1', description: 'Поколение 3 из Сида 1: выигрывает 7 из 7' });
    expect(opponents[0]?.side.id).toBe('A');
    expect(opponents[0]?.side.behaviour).toEqual(turtle.side.behaviour);
    expect(opponents[0]?.side.waves).toEqual(turtle.side.waves);
  });

  it('скачанный файл — в формате src/behaviours/opponents и проходит его разбор', async () => {
    browser();
    const { id } = await saved(candidate, 'файлом');

    const file = opponentFromFile('B', JSON.parse(evolvedText(id) ?? '{}'), arena);
    expect(file.name).toBe('Выведенный №1');
    expect(file.side.behaviour).toEqual(turtle.side.behaviour);
  });

  it('совпавший по адресу с файлом Противника не показывается, а сказано почему', async () => {
    browser();
    const { id } = await saved(candidate);

    const { opponents, problems } = readEvolved(arena, 'B', [id]);
    expect(opponents).toEqual([]);
    expect(problems.join('\n')).toContain(id);
  });

  describe('уже сохранённый узнаётся по содержимому', () => {
    it('те же Правила и Волны — тот же Выведенный, и после перезагрузки', async () => {
      browser();
      const { id } = await saved(candidate);

      expect(findEvolved(structuredClone(candidate))?.id).toBe(id);
      expect(findEvolved(other)).toBeNull();
    });

    it('тот же Претендент, вычищенный по другому Экзамену, — другой Противник', async () => {
      browser();
      const used = (ticks: number) =>
        ({ ruleTicks: { scout: candidate.behaviour.scout.map(() => ticks), tank: [], ranger: [] } }) as unknown as Bout;
      // Элита переходит в следующее Поколение тем же объектом, но Экзамен у неё другой.
      await saved(prune(candidate, [used(1)]));

      expect(findEvolved(prune(candidate, [used(1)]))).not.toBeNull();
      expect(findEvolved(prune(candidate, [used(0)]))).toBeNull();
    });
  });

  describe('две вкладки разом', () => {
    it('сохранение идёт под блокировкой на все вкладки: прочитать, выбрать номер и записать — одним шагом', async () => {
      browser();
      const calls: { name: string; writtenBefore: boolean }[] = [];
      const locks = {
        request: async <T,>(name: string, run: () => T | Promise<T>) => {
          calls.push({ name, writtenBefore: items.has(EVOLVED_KEY) });
          return run();
        },
      };

      await saveEvolved(candidate, 'одна', [], locks);
      expect(calls).toEqual([{ name: EVOLVED_KEY, writtenBefore: false }]);
    });

    it('с настоящими блокировками оба сохранения на месте и с разными номерами', async () => {
      browser();
      const [first, second] = await Promise.all([saved(candidate, 'первая вкладка'), saved(other, 'вторая вкладка')]);

      expect(readEvolved(arena, 'B').opponents.map((entry) => entry.id).sort()).toEqual([first.id, second.id].sort());
      expect(new Set([first.name, second.name]).size).toBe(2);
    });
  });

  describe('испорченное не пропадает молча', () => {
    it('испорченная запись остаётся в хранилище после следующего сохранения, и о ней сказано', async () => {
      browser();
      items.set(EVOLVED_KEY, JSON.stringify([{ id: 'evolved-9', file: null }]));

      expect(readEvolved(arena, 'B').problems.join('\n')).toContain('evolved-9');
      await saved(candidate);
      const stored = JSON.parse(items.get(EVOLVED_KEY) ?? '[]') as { id: string }[];
      expect(stored.map((entry) => entry.id)).toContain('evolved-9');
      expect(stored).toHaveLength(2);
    });

    it.each([
      ['не JSON', '{оборвано'],
      ['не список', '{"evolved-1": {}}'],
    ])('нечитаемое хранилище (%s) — причина при чтении, и запись отказывается его затирать', async (_title, text) => {
      browser();
      items.set(EVOLVED_KEY, text);

      expect(readEvolved(arena, 'B').problems[0]).toContain('не прочитаны');
      const result = await saveEvolved(candidate, 'поверх');
      expect(result).toHaveProperty('problem');
      expect(items.get(EVOLVED_KEY)).toBe(text);
    });
  });

  it('без хранилища — ни Выведенных, ни ошибки чтения; сохранение говорит почему не вышло', async () => {
    expect(await saveEvolved(candidate, 'некуда')).toEqual({ problem: 'хранилища браузера нет' });
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
