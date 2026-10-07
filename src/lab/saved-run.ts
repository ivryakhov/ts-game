import { isRecord, type GameMap } from '@sim/index';
import type { Candidate } from '../evolve/candidate.js';
import { candidateSide, type Bout } from '../evolve/exam.js';
import type { GenerationRecord } from './evolution.js';
import type { Entry, Origin } from './view.js';

/**
 * Последний прогон Лаборатории в хранилище браузера: настройки, история
 * Оценок и лучший каждого Поколения. Переживает перезагрузку страницы
 * (спека 0004, «Хранение»). Нет хранилища или оно переполнено — страница
 * работает без памяти, как игра без сохранения Правил (saved.ts).
 */

export const RUN_KEY = 'neon-arcana:lab';

/** Настройки полей страницы — то, что нужно, чтобы повторить прогон. */
export interface RunSettings {
  readonly size: number;
  readonly generations: number;
  readonly seed: number;
  readonly origin: 'scratch' | 'ready';
  readonly examiners: readonly { readonly id: string; readonly name: string }[];
}

export interface SavedRun {
  readonly settings: RunSettings;
  readonly history: readonly GenerationRecord[];
  /** Секунды Экзамена по Поколениям: [номер, секунды]. */
  readonly seconds: readonly (readonly [number, number])[];
}

/** Лучший Поколения в хранилище: без Стороны — она восстанавливается разбором. */
interface StoredChampion {
  readonly number: number;
  readonly origin: Origin;
  readonly candidate: Candidate;
  readonly bouts: readonly (Bout | null)[];
}

interface StoredRun {
  readonly version: 1;
  readonly settings: RunSettings;
  readonly seconds?: readonly (readonly [number, number])[];
  readonly history: readonly (Omit<GenerationRecord, 'champion'> & { readonly champion: StoredChampion | null })[];
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Записать прогон. false — не вышло: хранилища нет или прогон в него не влез. */
export function writeRun(run: SavedRun): boolean {
  const stored: StoredRun = {
    version: 1,
    settings: run.settings,
    seconds: run.seconds,
    history: run.history.map((record) => ({
      ...record,
      champion: record.champion && {
        number: record.champion.number,
        origin: record.champion.origin,
        candidate: record.champion.candidate,
        bouts: record.champion.bouts,
      },
    })),
  };
  try {
    const place = storage();
    if (!place) return false;
    place.setItem(RUN_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

/** Сохранение испорчено: где и что не так. */
class Broken extends Error {}

const ORIGINS: readonly Origin[] = ['random', 'ready', 'elite', 'child'];
const OUTCOMES: readonly Bout['outcome'][] = ['win', 'loss', 'draw'];

function record(value: unknown, where: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Broken(`${where}: ожидался объект`);
  return value;
}

function finite(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Broken(`${where}: ожидалось число`);
  return value;
}

function whole(value: unknown, where: string, min: number): number {
  const number = finite(value, where);
  if (!Number.isInteger(number) || number < min) throw new Broken(`${where}: ожидалось целое не меньше ${min}`);
  return number;
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new Broken(`${where}: ожидалась строка`);
  return value;
}

function list(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Broken(`${where}: ожидался список`);
  return value;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], where: string): T {
  if (!options.includes(value as T)) throw new Broken(`${where}: ожидалось одно из ${options.join(', ')}`);
  return value as T;
}

function parseSettings(raw: unknown): RunSettings {
  const settings = record(raw, 'settings');
  return {
    size: whole(settings['size'], 'settings.size', 1),
    generations: whole(settings['generations'], 'settings.generations', 1),
    seed: whole(settings['seed'], 'settings.seed', 0),
    origin: oneOf(settings['origin'], ['scratch', 'ready'] as const, 'settings.origin'),
    examiners: list(settings['examiners'], 'settings.examiners').map((entry, index) => {
      const examiner = record(entry, `settings.examiners[${index}]`);
      return { id: text(examiner['id'], `settings.examiners[${index}].id`), name: text(examiner['name'], `settings.examiners[${index}].name`) };
    }),
  };
}

function parseBout(raw: unknown, where: string): Bout | null {
  if (raw === null) return null;
  const bout = record(raw, where);
  const ticks = record(bout['ruleTicks'], `${where}.ruleTicks`);
  const kind = (name: 'scout' | 'tank' | 'ranger'): readonly number[] =>
    list(ticks[name], `${where}.ruleTicks.${name}`).map((value, index) => finite(value, `${where}.ruleTicks.${name}[${index}]`));
  return {
    opponent: text(bout['opponent'], `${where}.opponent`),
    outcome: oneOf(bout['outcome'], OUTCOMES, `${where}.outcome`),
    ticks: finite(bout['ticks'], `${where}.ticks`),
    ownHp: finite(bout['ownHp'], `${where}.ownHp`),
    foeHp: finite(bout['foeHp'], `${where}.foeHp`),
    score: finite(bout['score'], `${where}.score`),
    obelisks: finite(bout['obelisks'], `${where}.obelisks`),
    ruleTicks: { scout: kind('scout'), tank: kind('tank'), ranger: kind('ranger') },
  };
}

/** Лучший Поколения — через тот же разбор, что Претендент в Экзамене. */
function parseChampion(raw: unknown, where: string, map: GameMap, examined: number): Entry | null {
  if (raw === null) return null;
  const champion = record(raw, where);
  const candidate = record(champion['candidate'], `${where}.candidate`) as unknown as Candidate;
  let side;
  try {
    side = candidateSide(candidate, map);
  } catch (error) {
    throw new Broken(`${where}.candidate: ${error instanceof Error ? error.message : String(error)}`);
  }
  const bouts = list(champion['bouts'], `${where}.bouts`).map((bout, index) => parseBout(bout, `${where}.bouts[${index}]`));
  if (bouts.length !== examined) throw new Broken(`${where}.bouts: матчей ${bouts.length}, а Противников Экзамена ${examined}`);
  return {
    number: whole(champion['number'], `${where}.number`, 1),
    origin: oneOf(champion['origin'], ORIGINS, `${where}.origin`),
    candidate: { behaviour: side.behaviour ?? candidate.behaviour, waves: side.waves ?? candidate.waves },
    side,
    problem: null,
    bouts,
  };
}

/** JSON не хранит бесконечность и NaN: Поколение, где разбор отверг всех, приходит с null. */
const scoreOrMissing = (value: unknown, where: string, missing: number): number =>
  value === null ? missing : finite(value, where);

function parseHistory(raw: unknown, map: GameMap, examined: number): GenerationRecord[] {
  return list(raw, 'history').map((entry, index) => {
    const where = `history[${index}]`;
    const generation = record(entry, where);
    return {
      number: whole(generation['number'], `${where}.number`, 1),
      best: scoreOrMissing(generation['best'], `${where}.best`, Number.NEGATIVE_INFINITY),
      mean: scoreOrMissing(generation['mean'], `${where}.mean`, Number.NaN),
      wins: whole(generation['wins'], `${where}.wins`, 0),
      obelisks: whole(generation['obelisks'], `${where}.obelisks`, 0),
      champion: parseChampion(generation['champion'], `${where}.champion`, map, examined),
    };
  });
}

function parseSeconds(raw: unknown): (readonly [number, number])[] {
  if (raw === undefined) return [];
  return list(raw, 'seconds').map((entry, index) => {
    const pair = list(entry, `seconds[${index}]`);
    if (pair.length !== 2) throw new Broken(`seconds[${index}]: ожидалась пара [Поколение, секунды]`);
    return [whole(pair[0], `seconds[${index}][0]`, 1), finite(pair[1], `seconds[${index}][1]`)] as const;
  });
}

/**
 * Прочитать прогон. Каждое поле проверяется здесь, до страницы: испорченное
 * сохранение не уронит её позже, а вернётся причиной — страница скажет
 * о нём и начнёт с чистого листа. Лучший Поколения проходит тот же разбор,
 * что Претендент в Экзамене.
 */
export function readRun(map: GameMap): { run: SavedRun } | { problem: string } | null {
  let stored: string | null = null;
  try {
    stored = storage()?.getItem(RUN_KEY) ?? null;
  } catch {
    return null;
  }
  if (stored === null) return null;
  try {
    const raw = record(JSON.parse(stored), 'сохранение');
    if (raw['version'] !== 1) return { problem: 'сохранение другого формата' };
    const settings = parseSettings(raw['settings']);
    const history = parseHistory(raw['history'], map, settings.examiners.length);
    return { run: { settings, history, seconds: parseSeconds(raw['seconds']) } };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Память идущего прогона. Новый прогон записывается сразу при «Старте» —
 * с пустой историей, — иначе остановленный до конца первого Поколения
 * прогон потерялся бы, а после перезагрузки вернулся бы предыдущий.
 * Дальше прогон дописывается после каждого Поколения.
 */
export interface RunMemory {
  begin(settings: RunSettings): void;
  record(history: readonly GenerationRecord[], seconds: readonly (readonly [number, number])[]): void;
}

/** `warn` — один раз, если записать не вышло: после перезагрузки прогона не будет. */
export function createRunMemory(warn: (message: string) => void, write: (run: SavedRun) => boolean = writeRun): RunMemory {
  let settings: RunSettings | null = null;
  let written = -1;
  let warned = false;
  const store = (run: SavedRun): void => {
    if (write(run) || warned) return;
    warned = true;
    warn('Прогон не сохранён: хранилища браузера нет или прогон в него не влез. После перезагрузки он пропадёт.');
  };
  return {
    begin(next) {
      settings = next;
      written = 0;
      store({ settings: next, history: [], seconds: [] });
    },
    record(history, seconds) {
      if (!settings || history.length === written) return;
      written = history.length;
      store({ settings, history, seconds });
    },
  };
}
