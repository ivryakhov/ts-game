import { filePart, isRecord, parseBehaviour, type Behaviour } from '@sim/index';

/**
 * Файл игрока — Поведение в формате player.json: так его выгружают,
 * загружают и хранят в браузере. Номера версии у формата нет: что не
 * проходит разбор, то отвергается с причиной, а не чинится молча.
 */

/** Имя выгружаемого файла — то же, что у файла игрока в src/behaviours. */
export const PLAYER_FILE_NAME = 'player.json';

const { fail } = filePart('Файл игрока');

/**
 * Поведение игрока из текста файла или сохранения. Это файл Стороны без
 * Волн: игрок выпускает Юнитов сам, и Волны в его файле отвергаются.
 */
export function parsePlayerText(text: string): Behaviour {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw fail('корень', `это не JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (isRecord(raw) && 'waves' in raw) {
    throw fail('waves', 'в файле игрока Волн нет — своих Юнитов игрок выпускает сам');
  }
  return parseBehaviour(raw);
}

/** Текст файла в формате player.json. */
export function behaviourText(behaviour: Behaviour): string {
  return `${JSON.stringify(behaviour, null, 2)}\n`;
}

/** Причина отказа словами: место и что не так. */
export function problemOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
