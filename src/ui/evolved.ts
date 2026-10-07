import { isRecord, opponentFromFile, type GameMap, type SideId } from '@sim/index';
import { candidateFile, type Candidate } from '../evolve/candidate.js';
import type { Opponent } from '../app/opponents.js';

/**
 * Выведенные Противники — Претенденты, сохранённые из Лаборатории
 * (спека 0004). Лежат в хранилище браузера, а не в src/behaviours, но
 * в остальном — Противники как любые другие: тот же формат файла, тот же
 * разбор, тот же выбор на Подготовке за любую Сторону (ADR-0003).
 */

export const EVOLVED_KEY = 'neon-arcana:evolved';
/** Имя в адресе: ?opponent=evolved-3. */
export const EVOLVED_PREFIX = 'evolved-';

/** Выведенный в хранилище: имя в адресе и файл Противника. */
interface Stored {
  readonly id: string;
  readonly file: Record<string, unknown>;
}

export const isEvolved = (id: string): boolean => id.startsWith(EVOLVED_PREFIX);

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function stored(): Stored[] {
  try {
    const raw: unknown = JSON.parse(storage()?.getItem(EVOLVED_KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((entry): entry is Stored => isRecord(entry) && typeof entry['id'] === 'string' && isRecord(entry['file']))
      : [];
  } catch {
    return [];
  }
}

/**
 * Выведенные Противники для этой Стороны. Испорченный не лишает
 * остальных: он попадает в проблемы с причиной, как файл Противника.
 */
export function readEvolved(map: GameMap, side: SideId): { opponents: Opponent[]; problems: string[] } {
  const opponents: Opponent[] = [];
  const problems: string[] = [];
  for (const { id, file } of stored()) {
    try {
      const opponent = opponentFromFile(side, file, map);
      opponents.push({ id, name: opponent.name, description: opponent.description, side: opponent.side });
    } catch (error) {
      problems.push(`Выведенный Противник «${id}» отвергнут — ${error instanceof Error ? error.message : String(error)}.`);
    }
  }
  return { opponents, problems };
}

/** Файл Выведенного для скачивания — в формате src/behaviours/opponents/*.json. */
export function evolvedText(id: string): string | null {
  const found = stored().find((entry) => entry.id === id);
  return found ? `${JSON.stringify(found.file, null, 2)}\n` : null;
}

/**
 * Сохранить Претендента Выведенным Противником «Выведенный №k», k — следующий
 * свободный номер. Возвращает имя в адресе и имя Противника; null — хранилища
 * нет или оно переполнено.
 */
export function saveEvolved(candidate: Candidate, description: string): { id: string; name: string } | null {
  const all = stored();
  const taken = all.map((entry) => Number(entry.id.slice(EVOLVED_PREFIX.length))).filter(Number.isInteger);
  const number = Math.max(0, ...taken) + 1;
  const id = `${EVOLVED_PREFIX}${number}`;
  const name = `Выведенный №${number}`;
  try {
    const place = storage();
    if (!place) return null;
    place.setItem(EVOLVED_KEY, JSON.stringify([...all, { id, file: candidateFile(candidate, name, description) }]));
    return { id, name };
  } catch {
    return null;
  }
}
