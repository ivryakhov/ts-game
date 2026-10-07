import { afterEach, describe, it, expect } from 'vitest';
import { createRng } from '@sim/index';
import { randomCandidate } from '../src/evolve/candidate.js';
import { candidateSide, type Bout } from '../src/evolve/exam.js';
import type { GenerationRecord } from '../src/lab/evolution.js';
import { createRunMemory, readRun, RUN_KEY, writeRun, type SavedRun } from '../src/lab/saved-run.js';
import { arena } from '../src/maps/arena.js';

/**
 * Память прогона Лаборатории (тикет 30): прогон переживает перезагрузку,
 * а без хранилища страница работает без памяти.
 */

const ROADS = arena.roads.map((road) => road.id);
const scope = globalThis as unknown as { window?: unknown };

/** Хранилище браузера в памяти; `full` — переполнено. */
function fakeStorage(full = false): Map<string, string> {
  const items = new Map<string, string>();
  scope.window = {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (full) throw new Error('QuotaExceededError');
        items.set(key, value);
      },
    },
  };
  return items;
}

afterEach(() => {
  delete scope.window;
});

const bout: Bout = {
  opponent: 'turtle',
  outcome: 'win',
  ticks: 3000,
  ownHp: 0.5,
  foeHp: 0,
  score: 1600,
  obelisks: 2,
  ruleTicks: { scout: [1, 2], tank: [3], ranger: [4, 5, 6] },
};

function run(): SavedRun {
  const candidate = randomCandidate(createRng(3), ROADS);
  const champion = { number: 7, origin: 'child' as const, candidate, side: candidateSide(candidate, arena), problem: null, bouts: [bout, null] };
  const records: GenerationRecord[] = [
    // Поколение, где разбор отверг всех: бесконечность и NaN, которых JSON не знает.
    { number: 1, best: Number.NEGATIVE_INFINITY, mean: Number.NaN, wins: 0, obelisks: 0, champion: null },
    { number: 2, best: 1600, mean: -200, wins: 1, obelisks: 2, champion },
  ];
  return {
    settings: { size: 8, generations: 30, seed: 5, origin: 'ready', examiners: [
        { id: 'turtle', name: 'Черепаха' },
        { id: 'flank', name: 'Фланг' },
      ],
    },
    history: records,
    seconds: [[2, 3.5]],
  };
}

describe('память прогона', () => {
  it('прогон переживает перезагрузку: настройки, Оценки, лучший Поколения с его матчами', () => {
    fakeStorage();
    const original = run();

    expect(writeRun(original)).toBe(true);
    const read = readRun(arena);

    expect(read).toHaveProperty('run');
    if (!read || !('run' in read)) return;
    expect(read.run.settings).toEqual(original.settings);
    expect(read.run.seconds).toEqual([[2, 3.5]]);
    expect(read.run.history[1]?.champion?.candidate).toEqual(original.history[1]?.champion?.candidate);
    expect(read.run.history[1]?.champion?.bouts).toEqual([bout, null]);
    expect(read.run.history[1]?.champion?.side?.behaviour).toEqual(original.history[1]?.champion?.side?.behaviour);
  });

  it('бесконечность и NaN возвращаются такими же, а не нулём', () => {
    fakeStorage();
    writeRun(run());
    const read = readRun(arena);
    const first = read && 'run' in read ? read.run.history[0] : undefined;

    expect(first?.best).toBe(Number.NEGATIVE_INFINITY);
    expect(first?.mean).toBeNaN();
  });

  it('без хранилища и при переполнении страница работает без памяти', () => {
    expect(writeRun(run())).toBe(false);
    expect(readRun(arena)).toBeNull();

    fakeStorage(true);
    expect(writeRun(run())).toBe(false);
  });

  it('испорченное сохранение возвращается причиной, а не молча', () => {
    const items = fakeStorage();
    items.set(RUN_KEY, '{"version":1,"settings":{},"history":[{"champion":{"candidate":{"behaviour":{}}}}]}');

    const read = readRun(arena);
    expect(read && 'problem' in read).toBe(true);
  });
});

describe('испорченное сохранение — причина, а не падение страницы позже', () => {
  /** Сохранение, испорченное в одном месте; остальное — как у настоящего. */
  function brokenBy(change: (stored: Record<string, unknown>) => void): unknown {
    const items = fakeStorage();
    writeRun(run());
    const stored = JSON.parse(items.get(RUN_KEY) ?? '{}') as Record<string, unknown>;
    change(stored);
    items.set(RUN_KEY, JSON.stringify(stored));
    return readRun(arena);
  }
  const history = (stored: Record<string, unknown>) => stored['history'] as Record<string, unknown>[];
  const champion = (stored: Record<string, unknown>) => history(stored)[1]?.['champion'] as Record<string, unknown>;

  it.each([
    ['пустые настройки', (stored: Record<string, unknown>) => (stored['settings'] = {})],
    ['Противники Экзамена — не список', (stored: Record<string, unknown>) => ((stored['settings'] as Record<string, unknown>)['examiners'] = 'turtle')],
    ['время — не число', (stored: Record<string, unknown>) => (stored['seconds'] = [[1, 'bad']])],
    ['время — не пара', (stored: Record<string, unknown>) => (stored['seconds'] = [[1]])],
    ['Оценка Поколения — строка', (stored: Record<string, unknown>) => ((history(stored)[1] as Record<string, unknown>)['best'] = '1600')],
    ['побед — дробное', (stored: Record<string, unknown>) => ((history(stored)[1] as Record<string, unknown>)['wins'] = 0.5)],
    ['исход матча неизвестен', (stored: Record<string, unknown>) => (((champion(stored)['bouts'] as Record<string, unknown>[])[0] as Record<string, unknown>)['outcome'] = 'maybe')],
    ['матчей меньше, чем Противников', (stored: Record<string, unknown>) => (champion(stored)['bouts'] = [])],
    ['Правила не проходят разбор', (stored: Record<string, unknown>) => (champion(stored)['candidate'] = { behaviour: {}, waves: [] })],
  ])('%s', (_title, change) => {
    const read = brokenBy(change);

    expect(read && typeof read === 'object' && 'problem' in read).toBe(true);
  });

  it('целое сохранение после той же правки туда и обратно читается', () => {
    const read = brokenBy(() => {});

    expect(read && typeof read === 'object' && 'run' in read).toBe(true);
  });
});

describe('память идущего прогона', () => {
  const settings = run().settings;

  it('новый прогон записан сразу при «Старте», ещё до конца первого Поколения', () => {
    const written: SavedRun[] = [];
    const memory = createRunMemory(() => {}, (saved) => written.push(saved) > 0);

    memory.begin(settings);
    memory.record([], []);

    expect(written).toEqual([{ settings, history: [], seconds: [] }]);
  });

  it('дальше дописывается после каждого Поколения — по одному разу', () => {
    const written: SavedRun[] = [];
    const memory = createRunMemory(() => {}, (saved) => written.push(saved) > 0);
    const records = run().history;

    memory.begin(settings);
    memory.record(records.slice(0, 1), []);
    memory.record(records.slice(0, 1), []);
    memory.record(records, [[2, 3.5]]);

    expect(written.map((saved) => saved.history.length)).toEqual([0, 1, 2]);
    expect(written[2]?.seconds).toEqual([[2, 3.5]]);
  });

  it('не влезло — предупреждает один раз', () => {
    const warnings: string[] = [];
    const memory = createRunMemory((message) => warnings.push(message), () => false);

    memory.begin(settings);
    memory.record(run().history, []);

    expect(warnings).toHaveLength(1);
  });
});
