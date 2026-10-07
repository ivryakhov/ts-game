import type { GameMap } from '@sim/index';
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

/**
 * Прочитать прогон. Лучший Поколения проходит тот же разбор, что
 * Претендент в Экзамене: испорченное сохранение не попадёт на страницу
 * молча, а вернётся причиной.
 */
export function readRun(map: GameMap): { run: SavedRun } | { problem: string } | null {
  let text: string | null = null;
  try {
    text = storage()?.getItem(RUN_KEY) ?? null;
  } catch {
    return null;
  }
  if (text === null) return null;
  try {
    const stored = JSON.parse(text) as StoredRun;
    if (stored.version !== 1 || !Array.isArray(stored.history) || !stored.settings) {
      return { problem: 'сохранение другого формата' };
    }
    const history = stored.history.map((record): GenerationRecord => {
      const champion = record.champion;
      const entry: Entry | null = champion && {
        number: champion.number,
        origin: champion.origin,
        candidate: champion.candidate,
        side: candidateSide(champion.candidate, map),
        problem: null,
        bouts: [...champion.bouts],
      };
      // JSON не хранит бесконечность и NaN: Поколение, где всех отверг разбор, вернётся числом.
      const number = (value: unknown, missing: number): number => (typeof value === 'number' ? value : missing);
      return {
        ...record,
        best: number(record.best, Number.NEGATIVE_INFINITY),
        mean: number(record.mean, Number.NaN),
        champion: entry,
      };
    });
    return { run: { settings: stored.settings, history, seconds: stored.seconds ?? [] } };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) };
  }
}
