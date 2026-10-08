import { isRecord, opponentFromFile, type GameMap, type SideId } from '@sim/index';
import type { Opponent } from '../app/opponents.js';
import { candidateFile, type Candidate } from '../evolve/candidate.js';

/**
 * Выведенные Противники — Претенденты, сохранённые из Лаборатории
 * (спека 0004). Лежат в хранилище браузера, а не в src/behaviours, но
 * в остальном — Противники как любые другие: тот же формат файла, тот же
 * разбор, тот же выбор на Подготовке за любую Сторону (ADR-0003).
 */

export const EVOLVED_KEY = 'neon-arcana:evolved';
/** Имя в адресе: ?opponent=evolved-k3f9a1c2. */
export const EVOLVED_PREFIX = 'evolved-';

export const isEvolved = (id: string): boolean => id.startsWith(EVOLVED_PREFIX);

/** Выведенный в хранилище: имя в адресе, номер в имени и файл Противника. */
interface Stored {
  readonly id: string;
  readonly number: number;
  readonly file: Record<string, unknown>;
}

/**
 * Полка Выведенных как она есть. Испорченные записи не выбрасываются:
 * они остаются в `raw` и переживают следующее сохранение, а читатель
 * получает о них причину. Нечитаемая целиком полка — не пустая: на неё
 * не пишут, пока человек не разберётся (иначе она молча затёрлась бы).
 */
type Shelf =
  | { readonly kind: 'ok'; readonly raw: readonly unknown[]; readonly entries: readonly Stored[]; readonly problems: readonly string[] }
  | { readonly kind: 'broken'; readonly problem: string };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Номер из имени «Выведенный №k» — для записей, сохранённых до поля `number`. */
function numberOf(entry: Record<string, unknown>): number | null {
  if (typeof entry['number'] === 'number' && Number.isInteger(entry['number'])) return entry['number'];
  const name = isRecord(entry['file']) ? entry['file']['name'] : undefined;
  const found = typeof name === 'string' ? /№(\d+)/.exec(name) : null;
  return found ? Number(found[1]) : null;
}

function shelf(): Shelf {
  let text: string | null;
  try {
    text = storage()?.getItem(EVOLVED_KEY) ?? null;
  } catch (error) {
    return { kind: 'broken', problem: `хранилище недоступно (${error instanceof Error ? error.message : String(error)})` };
  }
  if (text === null) return { kind: 'ok', raw: [], entries: [], problems: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { kind: 'broken', problem: `это не JSON (${error instanceof Error ? error.message : String(error)})` };
  }
  if (!Array.isArray(raw)) return { kind: 'broken', problem: 'ожидался список Выведенных' };
  const entries: Stored[] = [];
  const problems: string[] = [];
  raw.forEach((entry, index) => {
    const id = isRecord(entry) && typeof entry['id'] === 'string' ? entry['id'] : null;
    const number = isRecord(entry) ? numberOf(entry) : null;
    if (id && isEvolved(id) && number !== null && isRecord(entry) && isRecord(entry['file'])) {
      entries.push({ id, number, file: entry['file'] });
    } else {
      problems.push(`Запись ${index + 1} в хранилище Выведенных испорчена${id ? ` («${id}»)` : ''} — она оставлена как есть, но в игру не попадёт.`);
    }
  });
  return { kind: 'ok', raw, entries, problems };
}

/**
 * Выведенные Противники для этой Стороны. Испорченный не лишает
 * остальных: он попадает в проблемы с причиной, как файл Противника.
 * `taken` — имена в адресе Противников из файлов: Выведенный с таким же
 * не показывается, чтобы адрес вёл однозначно.
 */
export function readEvolved(
  map: GameMap,
  side: SideId,
  taken: readonly string[] = [],
): { opponents: Opponent[]; problems: string[] } {
  const found = shelf();
  if (found.kind === 'broken') return { opponents: [], problems: [`Выведенные Противники не прочитаны — ${found.problem}.`] };
  const opponents: Opponent[] = [];
  const problems = [...found.problems];
  for (const { id, file } of found.entries) {
    if (taken.includes(id)) {
      problems.push(`Выведенный «${id}» совпадает по имени с файлом Противника — показан файл.`);
      continue;
    }
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
  const found = shelf();
  const entry = found.kind === 'ok' ? found.entries.find((stored) => stored.id === id) : undefined;
  return entry ? `${JSON.stringify(entry.file, null, 2)}\n` : null;
}

/** Правила и Волны файла — то, по чему два Выведенных одинаковы, без имени и описания. */
const playOf = (file: Record<string, unknown>): string =>
  JSON.stringify([file['scout'], file['tank'], file['ranger'], file['waves']]);

/**
 * Уже сохранённый Выведенный с теми же Правилами и Волнами, или null.
 * Сравнивается содержимое, а не объект в памяти: элита переходит
 * из Поколения в Поколение тем же объектом, а вычистка по другому
 * Экзамену даёт другие Правила — это уже другой Противник.
 * Адреса из `taken` заняты файлами: такая запись скрыта на Подготовке,
 * поэтому её нужно сохранить заново под свободным адресом.
 */
export function findEvolved(candidate: Candidate, taken: readonly string[] = []): { id: string; name: string } | null {
  const found = shelf();
  if (found.kind !== 'ok') return null;
  const play = playOf(candidateFile(candidate, '', ''));
  const entry = found.entries.find((stored) => !taken.includes(stored.id) && playOf(stored.file) === play);
  return entry ? { id: entry.id, name: typeof entry.file['name'] === 'string' ? entry.file['name'] : entry.id } : null;
}

/**
 * Имя в адресе — случайное, а не по номеру: скачанный файл, положенный
 * в игру насовсем, и сохранение в другом браузере иначе получили бы
 * одно и то же имя и выдавали бы себя друг за друга.
 */
function freshId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return EVOLVED_PREFIX + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Блокировка на все вкладки браузера; где её нет — одна вкладка и так одна. */
type Locks = { request<T>(name: string, run: () => T | Promise<T>): Promise<T> };
const browserLocks = (): Locks | undefined =>
  (globalThis as { navigator?: { locks?: Locks } }).navigator?.locks;

export type SaveResult = { readonly id: string; readonly name: string } | { readonly problem: string };

/**
 * Сохранить Претендента Выведенным Противником «Выведенный №k», k —
 * следующий свободный номер. Чтение полки, выбор номера и запись идут
 * под одной блокировкой на все вкладки: две Лаборатории, сохраняющие
 * разом, не затрут друг друга. Испорченные записи полки сохраняются
 * как были; нечитаемая целиком полка не перезаписывается.
 * `taken` — адреса Противников из файлов, которые нельзя занимать.
 */
export async function saveEvolved(
  candidate: Candidate,
  description: string,
  taken: readonly string[] = [],
  locks = browserLocks(),
): Promise<SaveResult> {
  const save = (): SaveResult => {
    const place = storage();
    if (!place) return { problem: 'хранилища браузера нет' };
    const found = shelf();
    if (found.kind === 'broken') return { problem: `хранилище Выведенных испорчено — ${found.problem}; оно не перезаписано` };
    const number = Math.max(0, ...found.entries.map((entry) => entry.number)) + 1;
    const occupied = new Set([...taken, ...found.entries.map((entry) => entry.id)]);
    let id = freshId();
    while (occupied.has(id)) id = freshId();
    const name = `Выведенный №${number}`;
    try {
      place.setItem(EVOLVED_KEY, JSON.stringify([...found.raw, { id, number, file: candidateFile(candidate, name, description) }]));
    } catch (error) {
      return { problem: `хранилище не приняло запись (${error instanceof Error ? error.message : String(error)})` };
    }
    return { id, name };
  };
  return locks ? locks.request(EVOLVED_KEY, save) : save();
}
