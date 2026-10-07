import { DEFAULT_BEHAVIOUR, sideFromFile, type Behaviour, type GameMap, type SideId, type SideSetup } from '@sim/index';
import type { Saved } from '../ui/saved.js';
import { problemOf } from './player-file.js';

/** Что игрок может скачать из предупреждения: отвергнутое не теряется молча. */
export interface Keep {
  readonly label: string;
  readonly name: string;
  readonly text: string;
}

/** Сторона игрока при запуске игры. */
export interface PlayerSide {
  /** Сторона из player.json — без Волн. */
  readonly side: SideSetup;
  /** Поведение из player.json — Заготовка «Из файла». */
  readonly file: Behaviour;
  /**
   * С чем начать: сохранённое в браузере, а нет его или оно отвергнуто —
   * из файла. Дальше это Поведение последнего начатого матча.
   */
  readonly behaviour: Behaviour;
}

/**
 * Файлы правит человек, поэтому опечатка в них — обычное дело: вместо
 * молча стоящих Юнитов он видит, где именно ошибся и чем это обернулось.
 * Сторона тогда выходит с Поведением по умолчанию.
 */
export function playerSide(
  id: SideId,
  raw: unknown,
  map: GameMap,
  saved: Saved,
  warn: (message: string, keep?: Keep) => void,
): PlayerSide {
  let side: SideSetup = { id };
  try {
    side = sideFromFile(id, raw, map);
  } catch (error) {
    warn(`Файл player.json отвергнут — ${problemOf(error)}. Юниты игрока действуют по Поведению по умолчанию.`);
  }
  const file = side.behaviour ?? DEFAULT_BEHAVIOUR;
  if (saved.kind === 'rejected') {
    warn(`Сохранённые Правила отвергнуты — ${saved.problem}. Взяты Правила из player.json.`, {
      label: 'Скачать отвергнутый набор',
      name: 'rejected-behaviour.json',
      text: saved.text,
    });
  }
  return { side, file, behaviour: saved.kind === 'ok' ? saved.behaviour : file };
}
