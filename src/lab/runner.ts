import type { Bout } from '../evolve/exam.js';
import type { BoutRequest, WorkerReply } from './protocol.js';

/**
 * Очередь матчей Экзамена в пуле Worker'ов. Матчи уходят по одному
 * с небольшим запасом, чтобы Worker не простаивал между ними, — так
 * пауза останавливает очередь, не дожидаясь конца Поколения. Ответы
 * приходят с номером задания, поэтому порядок прихода на итог не влияет.
 */
export interface Runner {
  /** Сколько Worker'ов играют матчи разом. */
  readonly threads: number;
  /** Сыграть матчи; `onBout` — после каждого, с номером задания. */
  run(
    requests: readonly BoutRequest[],
    onBout: (job: number, bout: Bout) => void,
    onFailure: (job: number, problem: string) => void,
  ): Promise<void>;
  /**
   * Не отдавать Worker'у новых матчей; начатые доиграются. Пауза
   * переживает конец очереди: следующая очередь тоже стоит, пока не
   * позвали `resume`, — так пауза между Поколениями не теряется.
   */
  pause(): void;
  resume(): void;
  /** Бросить недоигранное: Worker останавливается, новый создаётся при следующем запуске. */
  stop(): void;
}

/** Сколько матчей каждый Worker держит сразу: один играет, следующий ждёт. */
const IN_FLIGHT = 2;

/** То, чем очередь пользуется от Worker'а. В тестах его подменяет исполнитель в том же процессе. */
export interface WorkerLike {
  postMessage(request: BoutRequest): void;
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

const examWorker = (): WorkerLike => new Worker(new URL('./exam-worker.ts', import.meta.url), { type: 'module' });

/**
 * Сколько потоков отдать Экзамену: все ядра, кроме одного — странице.
 * Браузер, который числа ядер не сообщает, получает один поток.
 */
export function threadCount(cores: number | undefined): number {
  return Math.max(1, (cores ?? 1) - 1);
}

/**
 * Пул Worker'ов: матч уходит тому, у кого меньше всего начатых. Ответ
 * ставится на место по номеру задания, поэтому число потоков и порядок
 * ответов на итог не влияют (спека 0004, «Потоки»).
 */
export function createRunner(spawn: () => WorkerLike = examWorker, threads = 1): Runner {
  let workers: WorkerLike[] = [];
  let paused = false;
  /** Отдать Worker'ам ещё матчей, если можно. Своя у каждого запуска. */
  let feed: (() => void) | null = null;
  let finish: (() => void) | null = null;

  return {
    get threads() {
      return threads;
    },

    run(requests, onBout, onFailure) {
      if (workers.length === 0) workers = Array.from({ length: Math.max(1, threads) }, () => spawn());
      const active = workers;
      return new Promise((resolve) => {
        let next = 0;
        let left = requests.length;
        const busy = active.map(() => 0);
        finish = resolve;
        /** Свободнейший Worker, у которого есть место; −1 — все заняты. */
        const freest = (): number =>
          busy.reduce((best, load, index) => (load < IN_FLIGHT && (best < 0 || load < (busy[best] ?? 0)) ? index : best), -1);
        feed = () => {
          for (let index = freest(); !paused && index >= 0 && next < requests.length; index = freest()) {
            active[index]?.postMessage(requests[next] as BoutRequest);
            next += 1;
            busy[index] = (busy[index] ?? 0) + 1;
          }
        };
        active.forEach((worker, index) => {
          worker.onmessage = (event: MessageEvent<WorkerReply>) => {
            const reply = event.data;
            busy[index] = (busy[index] ?? 1) - 1;
            left -= 1;
            if (reply.kind === 'bout') onBout(reply.job, reply.bout);
            else onFailure(reply.job, reply.problem);
            if (left === 0) resolve();
            else feed?.();
          };
          worker.onerror = (event) => {
            onFailure(-1, event.message || 'Worker Экзамена упал');
            resolve();
          };
        });
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
      for (const worker of workers) worker.terminate();
      workers = [];
      paused = false;
      feed = null;
      finish?.();
      finish = null;
    },
  };
}
