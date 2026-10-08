import { describe, it, expect } from 'vitest';
import { createRng } from '@sim/index';
import { randomCandidate } from '../src/evolve/candidate.js';
import type { Bout } from '../src/evolve/exam.js';
import { nextGeneration } from '../src/evolve/generation.js';
import { createEvolution, type Settings } from '../src/lab/evolution.js';
import type { BoutRequest, WorkerReply } from '../src/lab/protocol.js';
import { createRunner, threadCount, type WorkerLike } from '../src/lab/runner.js';
import { arena } from '../src/maps/arena.js';

/**
 * Прогон эволюции на странице (замечания к PR #61): пауза, переживающая
 * конец прогона, и несыгранный матч Экзамена. Worker подменён
 * исполнителем в том же процессе: матч не играется, Оценка задана.
 */

const ROADS = arena.roads.map((road) => road.id);

const bout = (request: BoutRequest, score: number): Bout => ({
  opponent: request.opponent,
  outcome: 'loss',
  ticks: 100,
  ownHp: 1,
  foeHp: 1,
  score,
  obelisks: 0,
  ruleTicks: { scout: [], tank: [], ranger: [] },
});

/**
 * Worker, который отвечает на задание в следующей задаче; `answer` решает,
 * что ответить, `delay` — через сколько миллисекунд.
 */
function fakeWorker(answer: (request: BoutRequest) => WorkerReply, delay: () => number = () => 0): WorkerLike {
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(request) {
      setTimeout(() => worker.onmessage?.({ data: answer(request) } as MessageEvent<WorkerReply>), delay());
    },
    terminate() {
      worker.onmessage = null;
    },
  };
  return worker;
}

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  size: 2,
  generations: 1,
  seed: 1,
  examiners: [{ id: 'balanced', name: 'Сбалансированный' }],
  ready: [],
  ...overrides,
});

function setup(answer: (request: BoutRequest) => WorkerReply) {
  const warnings: string[] = [];
  const evolution = createEvolution(createRunner(() => fakeWorker(answer)), arena, () => {}, (message) => warnings.push(message));
  return { evolution, warnings };
}

/** Прогон, который не кончился за секунду, считается зависшим. */
const finishes = (run: Promise<void>): Promise<boolean> =>
  Promise.race([run.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000))]);

describe('прогон эволюции', () => {
  it('пауза, нажатая на последних матчах прогона, не останавливает следующий «Старт»', async () => {
    const { evolution } = setup((request) => ({ kind: 'bout', job: request.job, bout: bout(request, -10) }));

    const first = evolution.start(settings());
    evolution.pause(); // оба матча уже отданы Worker'у и доиграются
    expect(await finishes(first)).toBe(true);
    expect(evolution.state.phase).toBe('done');

    expect(await finishes(evolution.start(settings({ generations: 2 })))).toBe(true);
    expect(evolution.state.phase).toBe('done');
    expect(evolution.state.history).toHaveLength(2);
  });

  it('несыгранный матч останавливает прогон до отбора: упавший Претендент не обходит проигравших', async () => {
    const { evolution, warnings } = setup((request) =>
      request.job === 0
        ? { kind: 'failed', job: request.job, problem: 'проверка' }
        : { kind: 'bout', job: request.job, bout: bout(request, -10 * request.job) },
    );

    await finishes(evolution.start(settings({ size: 3, generations: 3 })));

    expect(evolution.state.phase).toBe('stopped');
    expect(evolution.state.generation).toBe(1);
    expect(evolution.state.history).toEqual([]);
    expect(warnings.join('\n')).toContain('Неполный Экзамен в отбор не идёт');
  });

  it('после остановки из-за ошибки новый «Старт» работает', async () => {
    let failing = true;
    const { evolution } = setup((request) =>
      failing
        ? { kind: 'failed', job: request.job, problem: 'проверка' }
        : { kind: 'bout', job: request.job, bout: bout(request, -10) },
    );

    await finishes(evolution.start(settings()));
    failing = false;

    expect(await finishes(evolution.start(settings()))).toBe(true);
    expect(evolution.state.phase).toBe('done');
  });
});

describe('размер Поколения', () => {
  it('Поколение из двух не занято элитой целиком: второй — мутировавший ребёнок', () => {
    const rng = createRng(1);
    const candidates = [randomCandidate(rng, ROADS), randomCandidate(rng, ROADS)];
    const draws = rng.draws;
    const next = nextGeneration(rng, candidates.map((candidate, index) => ({ candidate, score: index })), ROADS);

    expect(next).toHaveLength(2);
    expect(next[0]).toBe(candidates[1]);
    expect(candidates).not.toContain(next[1]);
    expect(rng.draws).toBeGreaterThan(draws);
  });
});

describe('пул Worker\'ов', () => {
  /**
   * Оценка зависит от Претендента и Противника, а не от порядка ответов:
   * так её и считает настоящий Worker. Задержки случайны — ответы
   * приходят вразнобой.
   */
  const answer = (request: BoutRequest): WorkerReply => {
    const text = JSON.stringify(request.side) + request.opponent;
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
    return { kind: 'bout', job: request.job, bout: bout(request, hash % 1000) };
  };

  async function evolveWith(threads: number) {
    const runner = createRunner(() => fakeWorker(answer, () => Math.floor(Math.random() * 3)), threads);
    const evolution = createEvolution(runner, arena, () => {}, () => {});
    const run = evolution.start(
      settings({
        size: 6,
        generations: 4,
        seed: 17,
        examiners: [
          { id: 'balanced', name: 'Сбалансированный' },
          { id: 'turtle', name: 'Черепаха' },
        ],
      }),
    );
    expect(await finishes(run)).toBe(true);
    return { history: evolution.state.history, last: evolution.state.entries.map((entry) => entry.candidate) };
  }

  it('один и четыре потока дают те же Поколения', async () => {
    const one = await evolveWith(1);
    const four = await evolveWith(4);

    expect(four.history).toEqual(one.history);
    expect(four.last).toEqual(one.last);
  });

  it('Экзамену — все ядра, кроме одного, но не меньше одного', () => {
    expect(threadCount(10)).toBe(9);
    expect(threadCount(1)).toBe(1);
    expect(threadCount(undefined)).toBe(1);
  });
});

describe('пауза после каждого Поколения', () => {
  /** Дождаться, пока прогон встанет или кончится. */
  const settled = async (evolution: ReturnType<typeof createEvolution>): Promise<void> => {
    for (let tries = 0; tries < 200 && evolution.state.phase === 'running'; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  };
  const scoredBy = (request: BoutRequest): WorkerReply => ({ kind: 'bout', job: request.job, bout: bout(request, -request.job) });

  it('встаёт после отбора: Поколение сдано, дети сосчитаны, следующее собрано и не сдано', async () => {
    const { evolution } = setup(scoredBy);
    evolution.pauseAfterGeneration = true;
    void evolution.start(settings({ size: 5, generations: 3 }));
    await settled(evolution);

    expect(evolution.state.phase).toBe('paused');
    expect(evolution.state.generation).toBe(1);
    expect(evolution.state.history).toHaveLength(1);
    expect(evolution.state.generations[0]?.children).not.toBeNull();
    const assembled = evolution.state.assembled ?? [];
    expect(assembled).toHaveLength(5);
    expect(assembled.every((entry) => entry.generation === 2 && entry.birth !== undefined)).toBe(true);
    expect(assembled.every((entry) => entry.bouts.every((played) => played === null))).toBe(true);
    evolution.stop();
  });

  it('«Продолжить» сдаёт собранное Поколение и встаёт после следующего отбора', async () => {
    const { evolution } = setup(scoredBy);
    evolution.pauseAfterGeneration = true;
    void evolution.start(settings({ size: 5, generations: 3 }));
    await settled(evolution);
    const assembled = evolution.state.assembled;

    evolution.resume();
    await settled(evolution);

    expect(evolution.state.phase).toBe('paused');
    expect(evolution.state.generation).toBe(2);
    expect(evolution.state.generations[1]?.entries).toBe(assembled);
    expect(evolution.state.history).toHaveLength(2);
    evolution.stop();
  });

  it('снятая на ходу галочка больше не останавливает, а последнее Поколение не встаёт', async () => {
    const { evolution } = setup(scoredBy);
    evolution.pauseAfterGeneration = true;
    const run = evolution.start(settings({ size: 5, generations: 4 }));
    await settled(evolution);

    evolution.pauseAfterGeneration = false;
    evolution.resume();

    expect(await finishes(run)).toBe(true);
    expect(evolution.state.phase).toBe('done');
    expect(evolution.state.history).toHaveLength(4);
    expect(evolution.state.assembled).toBeNull();
  });

  it('с галочкой прогон из одного Поколения просто кончается', async () => {
    const { evolution } = setup(scoredBy);
    evolution.pauseAfterGeneration = true;

    expect(await finishes(evolution.start(settings({ size: 5, generations: 1 })))).toBe(true);
    expect(evolution.state.phase).toBe('done');
  });

  it('«Стоп» на паузе после отбора останавливает прогон', async () => {
    const { evolution } = setup(scoredBy);
    evolution.pauseAfterGeneration = true;
    const run = evolution.start(settings({ size: 5, generations: 3 }));
    await settled(evolution);

    evolution.stop();

    expect(await finishes(run)).toBe(true);
    expect(evolution.state.phase).toBe('stopped');
    expect(evolution.state.history).toHaveLength(1);
  });

  it('с паузами и без — те же Поколения', async () => {
    const plain = setup(scoredBy).evolution;
    expect(await finishes(plain.start(settings({ size: 5, generations: 3, seed: 9 })))).toBe(true);

    const paused = setup(scoredBy).evolution;
    paused.pauseAfterGeneration = true;
    const run = paused.start(settings({ size: 5, generations: 3, seed: 9 }));
    for (let step = 0; step < 2; step += 1) {
      await settled(paused);
      paused.resume();
    }
    expect(await finishes(run)).toBe(true);

    expect(paused.state.history).toEqual(plain.state.history);
    expect(paused.state.entries.map((entry) => entry.candidate)).toEqual(plain.state.entries.map((entry) => entry.candidate));
  });
});
