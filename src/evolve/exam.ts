import {
  opponentFromFile,
  runMatch,
  UNIT_KINDS,
  type GameMap,
  type MatchResult,
  type SideSetup,
  type UnitKind,
  type Wave,
} from '@sim/index';
import { candidateFile, type Candidate } from './candidate.js';

/**
 * Экзамен — матчи Претендента без рендера против выбранных Противников,
 * по одному на каждого (спека 0004). Претендент играет за Сторону A:
 * Стороны зеркальны (ADR-0004), за B исход был бы тем же.
 */

/**
 * Предел матча Экзамена — пять минут. Без него пара «стоящих» Сторон
 * копит сотни Юнитов, и один матч тянется минутами (исследование 0001, A4).
 */
export const EXAM_TICKS = 6_000;

/** Сид матча. На исход он сейчас не влияет (задача #41), но матчу нужен. */
const EXAM_SEED = 1;

/** Противник Экзамена — то, что нужно для матча, без имени и описания. */
export interface Examiner {
  readonly id: string;
  readonly side: SideSetup;
}

/** Один матч Экзамена глазами Претендента. */
export interface Bout {
  readonly opponent: string;
  readonly outcome: 'win' | 'loss' | 'draw';
  readonly ticks: number;
  /** Здоровье Цитаделей в конце, долей от наибольшего: 1 — целая, 0 — снесена. */
  readonly ownHp: number;
  readonly foeHp: number;
  readonly score: number;
  /**
   * Сколько раз Претендент взял Обелиск. В Оценку не входит: Обелиск
   * ценен только Эфиром, и выгоден ли он, должна показать эволюция.
   */
  readonly obelisks: number;
  /** Сколько Юнито-Тиков исполнялось каждое Правило Претендента, по типам. */
  readonly ruleTicks: Readonly<Record<UnitKind, readonly number[]>>;
}

/**
 * Оценка одного матча: урон по чужой Цитадели минус урон по своей,
 * в тысячных их здоровья, и за победу +1000 и до +200 за скорость.
 * Ничья по пределу бонуса победы не даёт. Проигравший, но поцарапавший
 * Цитадель, выше того, кто не дошёл: эволюции с первого Поколения есть
 * за что цепляться.
 */
export function scoreOf(bout: Pick<Bout, 'outcome' | 'ticks' | 'ownHp' | 'foeHp'>): number {
  const damage = 1000 * (1 - bout.foeHp) - 1000 * (1 - bout.ownHp);
  const victory = bout.outcome === 'win' ? 1000 + 200 * (1 - bout.ticks / EXAM_TICKS) : 0;
  return Math.round(damage + victory);
}

/**
 * Волны со сдвигом по кругу: Противник начинает список с Волны `shift`.
 * Каждое Поколение — новый сдвиг, чтобы Претендент не выучил один
 * тайминг: Сид сейчас на исход не влияет, и пара даёт ровно один исход.
 */
export function rotateWaves(waves: readonly Wave[], shift: number): Wave[] {
  if (waves.length === 0) return [];
  const start = ((shift % waves.length) + waves.length) % waves.length;
  return [...waves.slice(start), ...waves.slice(0, start)];
}

/** Претендент Стороной A — через тот же разбор, что файл Противника. Бросает, если файл негоден. */
export function candidateSide(candidate: Candidate, map: GameMap): SideSetup {
  return opponentFromFile('A', candidateFile(candidate, 'Претендент', 'Претендент Лаборатории'), map).side;
}

function boutOf(opponent: string, result: MatchResult): Bout {
  const hp = (side: 'A' | 'B'): number => {
    const citadel = result.finalState.citadels.find((entry) => entry.side === side);
    return citadel ? Math.max(0, citadel.hp) / citadel.maxHp : 0;
  };
  const outcome = result.winner === 'A' ? 'win' : result.winner === 'B' ? 'loss' : 'draw';
  const review = result.stats.sides.find((entry) => entry.side === 'A');
  const ruleTicks = Object.fromEntries(UNIT_KINDS.map((kind) => [kind, review?.kinds[kind].ruleTicks ?? []])) as Record<
    UnitKind,
    readonly number[]
  >;
  const obelisks = result.events.filter((event) => event.kind === 'obelisk-taken' && event.owner === 'A').length;
  const bout = { opponent, outcome, ticks: result.ticks, ownHp: hp('A'), foeHp: hp('B') } as const;
  return { ...bout, score: scoreOf(bout), obelisks, ruleTicks };
}

/**
 * Один матч Экзамена. `generation` задаёт сдвиг Волн Противника.
 * Претендент, которого не принял разбор, сюда не попадает: его отсекает
 * `candidateSide` до Экзамена.
 */
export function examBout(side: SideSetup, examiner: Examiner, generation: number, map: GameMap): Bout {
  const foe: SideSetup = { ...examiner.side, id: 'B', waves: rotateWaves(examiner.side.waves ?? [], generation) };
  const result = runMatch({ seed: EXAM_SEED, map, sides: [{ ...side, id: 'A' }, foe], releases: [], maxTicks: EXAM_TICKS });
  return boutOf(examiner.id, result);
}

/** Итог Экзамена одного Претендента. */
export interface ExamResult {
  readonly bouts: readonly Bout[];
  /** Сумма Оценок матчей. */
  readonly score: number;
  readonly wins: number;
}

export function totalOf(bouts: readonly Bout[]): ExamResult {
  return {
    bouts,
    score: bouts.reduce((sum, bout) => sum + bout.score, 0),
    wins: bouts.filter((bout) => bout.outcome === 'win').length,
  };
}
