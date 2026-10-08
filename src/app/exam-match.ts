import type { MatchSetup, SideSetup } from '@sim/index';
import { EXAM_SEED, EXAM_TICKS, rotateWaves } from '../evolve/exam.js';

/**
 * Матч Экзамена в игре (спека 0005): ровно тот матч, что сыграла
 * эволюция, — Сид Экзамена, его предел в пять минут и Волны Противника
 * со сдвигом, который получил Экзамен Поколения: N − 1 для Поколения N.
 */
export interface ExamMatch {
  /** Сдвиг Волн Противника — номер Поколения с нуля. */
  readonly shift: number;
}

export const EXAM_MATCH = { seed: EXAM_SEED, maxTicks: EXAM_TICKS } as const;

/** Матч Экзамена из адреса: `?limit=exam&shift=k`; иначе — обычный матч. */
export function examFromAddress(params: URLSearchParams): ExamMatch | null {
  if (params.get('limit') !== 'exam') return null;
  const shift = Number(params.get('shift') ?? '0');
  return Number.isInteger(shift) && shift >= 0 ? { shift } : null;
}

/** Стороны Матча Экзамена: Волны чужой Стороны сдвинуты, как на Экзамене. */
export function examSides(sides: readonly [SideSetup, SideSetup], exam: ExamMatch): [SideSetup, SideSetup] {
  const [mine, theirs] = sides;
  return [mine, { ...theirs, waves: rotateWaves(theirs.waves ?? [], exam.shift) }];
}

/**
 * Надпись Матча Экзамена: Поколение и с какой Волны начинает Противник —
 * сдвиг по модулю числа его Волн.
 */
export function examLabel(exam: ExamMatch, foeWaves: number): string {
  const start = foeWaves > 0 ? exam.shift % foeWaves : 0;
  return `Матч Экзамена · Поколение ${exam.shift + 1} · сдвиг Волн ${start} · предел 5 минут, клики по Дороге выключены`;
}

/**
 * Настройка матча игры: обычного или, если задан Матч Экзамена, — с Сидом
 * и пределом Экзамена и сдвинутыми Волнами Противника. Тест проверяет,
 * что такой матч совпадает с матчем Экзамена.
 */
export function matchSetupOf(base: MatchSetup & { sides: readonly [SideSetup, SideSetup] }, exam: ExamMatch | null): MatchSetup {
  if (!exam) return base;
  return { ...base, seed: EXAM_MATCH.seed, maxTicks: EXAM_MATCH.maxTicks, sides: examSides(base.sides, exam) };
}

/** Сид матча: у Матча Экзамена — Экзамена, что бы ни стояло на Подготовке. */
export const seedOf = (exam: ExamMatch | null, seed: number): number => (exam ? EXAM_MATCH.seed : seed);

/** Надпись Показательного матча — обычного или Матча Экзамена. */
export function showcaseLabel(exam: ExamMatch | null, foeWaves: number): string {
  return exam ? examLabel(exam, foeWaves) : 'Показательный матч · Юнитов выпускают Волны обеих Сторон, клики по Дороге выключены';
}
