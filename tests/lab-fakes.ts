import type { Bout } from '../src/evolve/exam.js';
import { createEvolution, type Settings } from '../src/lab/evolution.js';
import type { BoutRequest, WorkerReply } from '../src/lab/protocol.js';
import { createRunner, type WorkerLike } from '../src/lab/runner.js';
import { arena } from '../src/maps/arena.js';

/**
 * Заготовки для тестов прогона Лаборатории: Worker подменён исполнителем
 * в том же процессе — матч не играется, Оценка задана.
 */

export const bout = (request: BoutRequest, score: number): Bout => ({
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
export function fakeWorker(answer: (request: BoutRequest) => WorkerReply, delay: () => number = () => 0): WorkerLike {
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

export const settings = (overrides: Partial<Settings> = {}): Settings => ({
  size: 2,
  generations: 1,
  seed: 1,
  examiners: [{ id: 'balanced', name: 'Сбалансированный' }],
  ready: [],
  ...overrides,
});

export function setup(answer: (request: BoutRequest) => WorkerReply) {
  const warnings: string[] = [];
  const evolution = createEvolution(createRunner(() => fakeWorker(answer)), arena, () => {}, (message) => warnings.push(message));
  return { evolution, warnings };
}

/** Прогон, который не кончился за секунду, считается зависшим. */
export const finishes = (run: Promise<void>): Promise<boolean> =>
  Promise.race([run.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000))]);
