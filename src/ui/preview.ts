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

/** Почему Матч Экзамена недоступен — вместо молчаливого обычного матча за человека. */
const unavailable = (reason: string): { problem: string } => ({
  problem: `Матч Экзамена недоступен: ${reason}. Откройте «Смотреть» в карточке Претендента в Лаборатории ещё раз.`,
});

/**
 * Претендент из места предпросмотра Противником этой Стороны. Зовётся,
 * только когда адрес его просит, поэтому и отсутствие места — причина,
 * а не тишина.
 */
export function readPreview(map: GameMap, side: SideId): { opponent: Opponent } | { problem: string } {
  let text: string | null;
  try {
    const place = storage();
    if (!place) return unavailable('хранилища браузера нет');
    text = place.getItem(PREVIEW_KEY);
  } catch (error) {
    return unavailable(`хранилище браузера недоступно (${error instanceof Error ? error.message : String(error)})`);
  }
  if (text === null) return unavailable('Претендента для просмотра в этом браузере нет — хранилище очищено или ссылка открыта в другом браузере');
  try {
    const file = opponentFromFile(side, JSON.parse(text), map);
    return { opponent: { id: PREVIEW_ID, name: file.name, description: file.description, side: file.side } };
  } catch (error) {
    return { problem: `Претендент для Матча Экзамена не прочитан — ${error instanceof Error ? error.message : String(error)}.` };
  }
}
