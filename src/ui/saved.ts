import type { Behaviour } from '@sim/index';
import { behaviourText, parsePlayerText, problemOf } from '../app/player-file.js';

/**
 * Поведение игрока в хранилище браузера — переживает перезапуск игры.
 * Пишется в формате player.json без Волн.
 */

export const STORAGE_KEY = 'neon-arcana:behaviour';

export type Saved =
  | { readonly kind: 'none' }
  | { readonly kind: 'ok'; readonly behaviour: Behaviour }
  /** Сохранение есть, но разбор его не принял: текст отдаётся игроку как есть. */
  | { readonly kind: 'rejected'; readonly text: string; readonly problem: string };

/**
 * Хранилище браузера, если оно есть. В приватном режиме или при запрете
 * сайта само обращение к нему бросает — тогда игра живёт без сохранения.
 */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSaved(): Saved {
  let text: string | null = null;
  try {
    text = storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return { kind: 'none' };
  }
  if (text === null) return { kind: 'none' };
  try {
    return { kind: 'ok', behaviour: parsePlayerText(text) };
  } catch (error) {
    return { kind: 'rejected', text, problem: problemOf(error) };
  }
}

/** Записать Поведение. Не вышло — не беда: игра работает как без сохранения. */
export function writeSaved(behaviour: Behaviour): void {
  try {
    storage()?.setItem(STORAGE_KEY, behaviourText(behaviour));
  } catch {
    // Хранилище переполнено или запрещено — сохранения просто нет.
  }
}
