import { opponentFromFile, type GameMap, type SideId } from '@sim/index';
import type { Opponent } from '../app/opponents.js';
import { candidateFile, type Candidate } from '../evolve/candidate.js';

/**
 * Место предпросмотра (спека 0005): Претендент, которого Лаборатория
 * отдаёт игре смотреть Матч Экзамена, без сохранения в Выведенные.
 * Одно на браузер: каждое «Смотреть» перезаписывает его.
 */

export const PREVIEW_KEY = 'neon-arcana:lab-preview';
/** Имя в адресе: ?ally=lab-preview. */
export const PREVIEW_ID = 'lab-preview';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Положить Претендента в место предпросмотра. false — хранилища нет или оно не приняло. */
export function writePreview(candidate: Candidate, name: string, description: string): boolean {
  try {
    const place = storage();
    if (!place) return false;
    place.setItem(PREVIEW_KEY, JSON.stringify(candidateFile(candidate, name, description)));
    return true;
  } catch {
    return false;
  }
}

/** Претендент из места предпросмотра Противником этой Стороны; null — места нет, иначе причина. */
export function readPreview(map: GameMap, side: SideId): { opponent: Opponent } | { problem: string } | null {
  let text: string | null;
  try {
    text = storage()?.getItem(PREVIEW_KEY) ?? null;
  } catch {
    return null;
  }
  if (text === null) return null;
  try {
    const file = opponentFromFile(side, JSON.parse(text), map);
    return { opponent: { id: PREVIEW_ID, name: file.name, description: file.description, side: file.side } };
  } catch (error) {
    return { problem: `Претендент для Матча Экзамена не прочитан — ${error instanceof Error ? error.message : String(error)}.` };
  }
}
