import { describe, it, expect } from 'vitest';
import { createRng } from '@sim/index';
import { randomCandidate } from '../src/evolve/candidate.js';
import type { Bout } from '../src/evolve/exam.js';
import { nextGeneration } from '../src/evolve/generation.js';
import { createEvolution, type Settings } from '../src/lab/evolution.js';
import type { BoutRequest, WorkerReply } from '../src/lab/protocol.js';
import { createRunner, type WorkerLike } from '../src/lab/runner.js';
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

/** Worker, который отвечает на задание в следующей задаче; `answer` решает, что ответить. */
function fakeWorker(answer: (request: BoutRequest) => WorkerReply): WorkerLike {
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(request) {
      setTimeout(() => worker.onmessage?.({ data: answer(request) } as MessageEvent<WorkerReply>), 0);
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
