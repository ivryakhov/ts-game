import type { SideSetup } from '@sim/index';
import type { Bout } from '../evolve/exam.js';

/**
 * Разговор страницы Лаборатории с Worker'ом Экзамена. Сообщения — чистые
 * данные: Сторона Претендента уже прошла разбор на странице, Worker
 * только играет матч.
 */

/** Сыграть один матч Экзамена. `job` возвращается в ответе как есть. */
export interface BoutRequest {
  readonly job: number;
  readonly side: SideSetup;
  readonly opponent: string;
  readonly generation: number;
}

export type WorkerReply =
  | { readonly kind: 'bout'; readonly job: number; readonly bout: Bout }
  | { readonly kind: 'failed'; readonly job: number; readonly problem: string };
