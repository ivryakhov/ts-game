import { examBout } from '../evolve/exam.js';
import { loadOpponents } from '../app/opponents.js';
import { arena } from '../maps/arena.js';
import type { BoutRequest, WorkerReply } from './protocol.js';

/**
 * Worker Экзамена: играет матчи без рендера, чтобы страница не замирала.
 * Противников читает сам, из тех же файлов, что и игра.
 */
const roster = loadOpponents(arena, 'B');
/** Сборка типов — DOM, а не webworker: нужное от Worker'а описано здесь. */
const scope = self as unknown as {
  postMessage(message: WorkerReply): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<BoutRequest>) => void): void;
};

scope.addEventListener('message', (event: MessageEvent<BoutRequest>) => {
  const { job, side, opponent, generation } = event.data;
  const reply = (message: WorkerReply): void => scope.postMessage(message);
  const examiner = roster.opponents.find((entry) => entry.id === opponent);
  if (!examiner) {
    reply({ kind: 'failed', job, problem: `нет Противника «${opponent}»` });
    return;
  }
  try {
    reply({ kind: 'bout', job, bout: examBout(side, examiner, generation, arena) });
  } catch (error) {
    reply({ kind: 'failed', job, problem: error instanceof Error ? error.message : String(error) });
  }
});
