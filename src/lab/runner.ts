import type { Bout } from '../evolve/exam.js';
import type { BoutRequest, WorkerReply } from './protocol.js';

/**
 * Очередь матчей Экзамена в одном Worker'е. Матчи уходят по одному
 * с небольшим запасом, чтобы Worker не простаивал между ними, — так
 * пауза останавливает очередь, не дожидаясь конца Поколения. Ответы
 * приходят с номером задания, поэтому порядок прихода на итог не влияет.
 */
export interface Runner {
  /** Сыграть матчи; `onBout` — после каждого, с номером задания. */
  run(
    requests: readonly BoutRequest[],
    onBout: (job: number, bout: Bout) => void,
    onFailure: (job: number, problem: string) => void,
  ): Promise<void>;
  /** Не отдавать Worker'у новых матчей; начатые доиграются. */
  pause(): void;
  resume(): void;
  /** Бросить недоигранное: Worker останавливается, новый создаётся при следующем запуске. */
  stop(): void;
}

/** Сколько матчей Worker держит сразу: один играет, следующий ждёт. */
const IN_FLIGHT = 2;

export function createRunner(): Runner {
  let worker: Worker | null = null;
  let paused = false;
  /** Отдать Worker'у ещё матчей, если можно. Своя у каждого запуска. */
  let feed: (() => void) | null = null;
  let finish: (() => void) | null = null;

  const spawn = (): Worker => new Worker(new URL('./exam-worker.ts', import.meta.url), { type: 'module' });

  return {
    run(requests, onBout, onFailure) {
      const active = worker ?? spawn();
      worker = active;
      return new Promise((resolve) => {
        let next = 0;
        let left = requests.length;
        let busy = 0;
        finish = resolve;
        feed = () => {
          while (!paused && busy < IN_FLIGHT && next < requests.length) {
            active.postMessage(requests[next]);
            next += 1;
            busy += 1;
          }
        };
        active.onmessage = (event: MessageEvent<WorkerReply>) => {
          const reply = event.data;
          busy -= 1;
          left -= 1;
          if (reply.kind === 'bout') onBout(reply.job, reply.bout);
          else onFailure(reply.job, reply.problem);
          if (left === 0) resolve();
          else feed?.();
        };
        active.onerror = (event) => {
          onFailure(-1, event.message || 'Worker Экзамена упал');
          resolve();
        };
        if (left === 0) resolve();
        else feed();
      });
    },

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
      feed?.();
    },

    stop() {
      worker?.terminate();
      worker = null;
      paused = false;
      feed = null;
      finish?.();
      finish = null;
    },
  };
}
