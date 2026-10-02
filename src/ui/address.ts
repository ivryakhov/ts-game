import type { Seed } from '@sim/index';
import { parseSeed } from '../app/seed.js';

/**
 * Сид в адресе страницы: ?seed=123. Открыв ту же ссылку, игрок переиграет
 * тот же матч — поэтому Сид каждого начатого матча попадает в адрес.
 */

export function seedFromAddress(): Seed {
  return parseSeed(new URLSearchParams(window.location.search).get('seed')) ?? 1;
}

/** Записать Сид в адрес, не перезагружая страницу и не плодя историю. */
export function rememberSeed(seed: Seed): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', url);
}

/** Противник в адресе: ?opponent=rush-easy. Без него — противник по умолчанию. */
export function opponentFromAddress(): string | null {
  return new URLSearchParams(window.location.search).get('opponent');
}

export function rememberOpponent(id: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('opponent', id);
  window.history.replaceState(null, '', url);
}
