import type { Bout } from '../evolve/exam.js';
import type { BoutRequest, WorkerReply } from './protocol.js';

/**
 * Очередь матчей Экзамена в одном Worker'е. Матчи уходят все сразу,
 * Worker играет их по порядку; ответы приходят с номером задания, так
 * что порядок прихода на итог не влияет.
 */
export interface Runner {
  /** Сыграть матчи; `onBout` — после каждого, с номером задания. */
  run(
    requests: readonly BoutRequest[],
    onBout: (job: number, bout: Bout) => void,
    onFailure: (job: number, problem: string) => void,
  ): Promise<void>;
  /** Бросить недоигранное: Worker останавливается, новый создаётся при следующем запуске. */
  stop(): void;
}

export function createRunner(): Runner {
  let worker: Worker | null = null;
  let abort: (() => void) | null = null;

  const spawn = (): Worker => new Worker(new URL('./exam-worker.ts', import.meta.url), { type: 'module' });

  return {
    run(requests, onBout, onFailure) {
      const active = worker ?? spawn();
      worker = active;
      return new Promise((resolve) => {
        let left = requests.length;
        if (left === 0) resolve();
        abort = resolve;
        active.onmessage = (event: MessageEvent<WorkerReply>) => {
          const reply = event.data;
          if (reply.kind === 'bout') onBout(reply.job, reply.bout);
          else onFailure(reply.job, reply.problem);
          left -= 1;
          if (left === 0) resolve();
        };
        active.onerror = (event) => {
          onFailure(-1, event.message || 'Worker Экзамена упал');
          resolve();
        };
        for (const request of requests) active.postMessage(request);
      });
    },

    stop() {
      worker?.terminate();
      worker = null;
      abort?.();
      abort = null;
    },
  };
}
