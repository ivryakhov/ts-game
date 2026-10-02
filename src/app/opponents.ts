import { opponentFromFile, type GameMap, type SideId, type SideSetup } from '@sim/index';

/**
 * Набор противников — файлы в src/behaviours/opponents (ADR-0003):
 * новый противник — новый файл и строка в index.json, задающем порядок
 * в выборе на Подготовке. Код противника не знает.
 */
export interface Opponent {
  /** Имя файла без .json — оно же в адресе: ?opponent=rush-easy. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly side: SideSetup;
}

/** Противник по умолчанию — тот, что был единственным до набора. */
export const DEFAULT_OPPONENT = 'balanced';

export interface OpponentRoster {
  readonly opponents: readonly Opponent[];
  /** Отвергнутые файлы — каждый с причиной; остальные противники доступны. */
  readonly problems: readonly string[];
}

/**
 * Читает противников в порядке индекса. Испорченный файл — даже с
 * синтаксической ошибкой JSON — не лишает игру остальных: он попадает
 * в список проблем с местом ошибки.
 *
 * `indexText` и `files` — текст файлов; `files` — по имени без расширения.
 */
export function readOpponents(
  indexText: string,
  files: Readonly<Record<string, string>>,
  map: GameMap,
  side: SideId,
): OpponentRoster {
  const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));
  let index: unknown;
  try {
    index = JSON.parse(indexText);
  } catch (error) {
    return { opponents: [], problems: [`Файл opponents/index.json отвергнут — ${reason(error)}.`] };
  }
  if (!Array.isArray(index) || !index.every((id) => typeof id === 'string')) {
    return { opponents: [], problems: ['Файл opponents/index.json отвергнут — ожидался список имён файлов.'] };
  }
  const opponents: Opponent[] = [];
  const problems: string[] = [];
  for (const id of index as string[]) {
    if (!(id in files)) {
      problems.push(`В opponents/index.json есть «${id}», но файла opponents/${id}.json нет.`);
      continue;
    }
    try {
      const file = opponentFromFile(side, JSON.parse(files[id] ?? ''), map);
      opponents.push({ id, name: file.name, description: file.description, side: file.side });
    } catch (error) {
      problems.push(`Файл opponents/${id}.json отвергнут — ${reason(error)}.`);
    }
  }
  for (const id of Object.keys(files)) {
    if (!(index as string[]).includes(id)) problems.push(`Файл opponents/${id}.json не указан в opponents/index.json.`);
  }
  return { opponents, problems };
}

/**
 * Противники, лежащие в игре: файлы собирает сборщик — текстом, а не
 * модулями JSON, иначе одна лишняя запятая роняет сборку целиком.
 */
export function loadOpponents(map: GameMap, side: SideId): OpponentRoster {
  const modules = import.meta.glob<string>('../behaviours/opponents/*.json', {
    eager: true,
    query: '?raw',
    import: 'default',
  });
  const { index = '', ...files } = Object.fromEntries(
    Object.entries(modules).map(([path, text]) => [path.replace(/^.*\//, '').replace(/\.json$/, ''), text]),
  );
  return readOpponents(index, files, map, side);
}

/** Противник по имени из адреса; неизвестное имя — противник по умолчанию. */
export function pickOpponent(opponents: readonly Opponent[], id: string | null): Opponent | null {
  return (
    opponents.find((opponent) => opponent.id === id) ??
    opponents.find((opponent) => opponent.id === DEFAULT_OPPONENT) ??
    opponents[0] ??
    null
  );
}
