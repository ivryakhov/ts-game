import { UNIT_KINDS } from './balance.js';
import { filePart, isRecord } from './parse.js';
import { parseBehaviour } from './rule-parse.js';
import type { GameMap, SideId, SideSetup } from './types.js';
import { parseWaves } from './waves.js';

/**
 * Файл Стороны — то, что пишет человек: Правила для каждого типа Юнита
 * и, по желанию, список Волн. Правила записываются одинаково у игрока
 * и у противника. Волны делают Сторону самостоятельной: она сама копит
 * Эфир и выпускает Юнитов (ADR-0003).
 */

/**
 * Проверяет Сторону так же, как карту и расписание, — на входе матча.
 * Заданное в коде проходит ту же проверку, что и прочитанное из файла.
 */
export function validateSide(side: SideSetup, map: GameMap): void {
  if (side.behaviour) parseBehaviour(side.behaviour);
  if (side.waves) parseWaves(side.waves, map);
}

const { fail, onlyKeys } = filePart('Файл Стороны');

/**
 * Собирает Сторону из файла. Любая неточность отвергается здесь же, при
 * чтении: игра читает файлы до матча и показывает ошибку игроку, а до
 * создания матча с негодной Стороной дело не доходит.
 */
export function sideFromFile(id: SideId, raw: unknown, map: GameMap): SideSetup {
  if (!isRecord(raw)) throw fail('корень', 'ожидался объект');
  // Опечатка в «waves» иначе дошла бы до Правил и назвалась бы неизвестным
  // типом Юнита — а про Волны не сказала бы ни слова.
  onlyKeys(raw, [...UNIT_KINDS, 'waves'], 'корень');

  const { waves, ...rules } = raw;
  const behaviour = parseBehaviour(rules);
  return waves === undefined
    ? { id, behaviour }
    : { id, behaviour, waves: parseWaves(waves, map) };
}
