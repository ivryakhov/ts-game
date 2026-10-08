import { createRng, type GameMap } from '@sim/index';
import type { Candidate } from '../evolve/candidate.js';
import { candidateSide, totalOf, type Bout } from '../evolve/exam.js';
import { childrenOf, type Birth } from '../evolve/birth.js';
import { breed, firstBorn, type Born } from '../evolve/generation.js';
import type { BoutRequest } from './protocol.js';
import type { Runner } from './runner.js';
import { ranked, scoreOfEntry, type Entry, type Origin } from './view.js';

/**
 * Прогон эволюции на странице: Поколение держит Экзамен в Worker'е,
 * из Оценок рождается следующее. Ядро (src/evolve) решает, кто дети;
 * здесь — очередь, пауза, остановка и то, что видно между Поколениями.
 *
 * Случайность эволюции — только генератор по Сиду, Экзамен её не тратит,
 * а ответы Worker'а встают на место по номеру задания. Поэтому тот же
 * Сид и те же настройки дают те же Поколения.
 */

export interface Settings {
  readonly size: number;
  readonly generations: number;
  readonly seed: number;
  /** Противники Экзамена, в порядке таблиц. */
  readonly examiners: readonly { readonly id: string; readonly name: string }[];
  /** С кого начать; пусто — со случайных Претендентов. */
  readonly ready: readonly Candidate[];
  /** Имена готовых — для Рождения словами. */
  readonly readyNames?: readonly string[];
}

/**
 * Поколение прогона, каким его видно в памяти страницы: Претенденты
 * с Рождениями и, когда следующее уже собрано, сколько детей у каждого.
 */
export interface Snapshot {
  /** С единицы. */
  readonly number: number;
  readonly entries: readonly Entry[];
  children: readonly number[] | null;
}

/** Итог Поколения — строка истории. */
export interface GenerationRecord {
  /** С единицы. */
  readonly number: number;
  readonly best: number;
  readonly mean: number;
  /** У скольких Противников выигрывает лучший. */
  readonly wins: number;
  /** Сколько раз лучший взял Обелиск за весь Экзамен. */
  readonly obelisks: number;
  /** Лучший Претендент Поколения — его матчи и Правила, как в конце Экзамена. */
  readonly champion: Entry | null;
}

export interface Evolution {
  start(settings: Settings): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  /**
   * Пауза после каждого Поколения (спека 0005): прогон встаёт, когда
   * Поколение сдало Экзамен и следующее уже собрано. Меняется на ходу.
   */
  pauseAfterGeneration: boolean;
  readonly state: {
    readonly phase: 'idle' | 'running' | 'paused' | 'stopped' | 'done';
    readonly settings: Settings | null;
    /** Номер идущего Поколения, с единицы. */
    readonly generation: number;
    readonly entries: readonly Entry[];
    /** Сыгранных матчей текущего Поколения. */
    readonly done: number;
    readonly history: readonly GenerationRecord[];
    /** Все Поколения прогона по порядку — для детей и Родословной. */
    readonly generations: readonly Snapshot[];
    /**
     * Собранное, но ещё не сданное следующее Поколение — пока прогон
     * стоит после отбора. null — не стоит.
     */
    readonly assembled: readonly Entry[] | null;
  };
}

const ORIGIN_OF: Readonly<Record<Birth['kind'], Origin>> = { random: 'random', ready: 'ready', elite: 'elite', child: 'child' };

function entriesOf(
  born: readonly Born[],
  generation: number,
  map: GameMap,
  examined: number,
  warn: (message: string) => void,
): Entry[] {
  return born.map(({ candidate, birth }, index) => {
    const base = {
      number: index + 1,
      generation,
      birth,
      candidate,
      origin: ORIGIN_OF[birth.kind],
      bouts: Array.from({ length: examined }, () => null),
    };
    try {
      return { ...base, side: candidateSide(candidate, map), problem: null };
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error);
      warn(`Ошибка эволюции: Претендент №${index + 1} отвергнут разбором — ${problem}`);
      return { ...base, side: null, problem };
    }
  });
}

function recordOf(number: number, entries: readonly Entry[]): GenerationRecord {
  const [best] = ranked(entries);
  const finite = entries.map(scoreOfEntry).filter(Number.isFinite);
  const bouts = (best?.bouts ?? []).filter((bout): bout is Bout => bout !== null);
  return {
    number,
    best: best ? scoreOfEntry(best) : Number.NEGATIVE_INFINITY,
    mean: finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) / finite.length : Number.NaN,
    wins: totalOf(bouts).wins,
    obelisks: bouts.reduce((sum, bout) => sum + bout.obelisks, 0),
    // Копия: Претендент Поколения не меняется, но список его матчей — изменяемый.
    champion: best ? { ...best, bouts: [...best.bouts] } : null,
  };
}

export function createEvolution(
  runner: Runner,
  map: GameMap,
  onChange: () => void,
  warn: (message: string) => void,
): Evolution {
  const roads = map.roads.map((road) => road.id);
  const state: {
    phase: Evolution['state']['phase'];
    settings: Settings | null;
    generation: number;
    entries: Entry[];
    done: number;
    history: GenerationRecord[];
    generations: Snapshot[];
    assembled: Entry[] | null;
  } = { phase: 'idle', settings: null, generation: 0, entries: [], done: 0, history: [], generations: [], assembled: null };
  let pauseAfterGeneration = false;
  /** Продолжить прогон, стоящий после отбора; null — он не стоит. */
  let proceed: (() => void) | null = null;
  /** Номер запуска: остановленный прогон, доигрывая, не трогает следующего. */
  let launch = 0;

  /** Остановить прогон: доигрывающие ответы его больше не трогают. */
  function halt(): void {
    state.phase = 'stopped';
    launch += 1;
    runner.stop();
    proceed?.();
    proceed = null;
    onChange();
  }

  /** Стоять после отбора, пока не позовут «Продолжить» или «Стоп». */
  function waitAfterSelection(): Promise<void> {
    state.phase = 'paused';
    onChange();
    return new Promise((resolve) => {
      proceed = resolve;
    });
  }

  /** Экзамен Поколения. false — прогон остановлен или сменился. */
  async function examine(mine: number, settings: Settings, generation: number): Promise<boolean> {
    const count = settings.examiners.length;
    const requests: BoutRequest[] = state.entries.flatMap((entry, candidate) =>
      entry.side
        ? settings.examiners.map((examiner, index) => ({
            job: candidate * count + index,
            side: entry.side!,
            opponent: examiner.id,
            generation,
          }))
        : [],
    );
    await runner.run(
      requests,
      (job, bout) => {
        if (mine !== launch) return;
        const entry = state.entries[Math.floor(job / count)];
        if (entry) entry.bouts[job % count] = bout;
        state.done += 1;
        onChange();
      },
      // Несыгранный матч — не ноль Оценки: неполный Экзамен поставил бы
      // упавшего Претендента выше честно проигравших. Матч детерминирован,
      // повтор упадёт так же, поэтому прогон останавливается до отбора.
      (job, problem) => {
        if (mine !== launch) return;
        const what = job < 0 ? 'Worker Экзамена упал' : 'матч Экзамена не сыгран';
        warn(`Прогон остановлен в Поколении ${state.generation}: ${what} — ${problem}. Неполный Экзамен в отбор не идёт.`);
        halt();
      },
    );
    return mine === launch;
  }

  return {
    async start(settings) {
      const mine = (launch += 1);
      // Пауза прошлого прогона могла пережить его конец: доиграв два
      // последних матча, он кончился, а очередь так и стоит.
      runner.resume();
      const rng = createRng(settings.seed);
      const born = firstBorn(rng, settings.size, roads, settings.ready);
      Object.assign(state, { phase: 'running', settings, history: [], generations: [], assembled: null });
      let next = entriesOf(born, 1, map, settings.examiners.length, warn);

      for (let generation = 0; generation < settings.generations; generation += 1) {
        state.generation = generation + 1;
        state.entries = next;
        const snapshot: Snapshot = { number: generation + 1, entries: state.entries, children: null };
        state.generations.push(snapshot);
        state.done = 0;
        onChange();
        if (!(await examine(mine, settings, generation))) return;
        state.history.push(recordOf(generation + 1, state.entries));
        // Последнее Поколение прогона не размножается: следующего не будет.
        if (generation + 1 === settings.generations) break;
        const scored = state.entries.map((entry) => ({ candidate: entry.candidate, score: scoreOfEntry(entry) }));
        const children = breed(rng, scored, roads);
        snapshot.children = childrenOf(
          children.map((entry) => entry.birth),
          scored.length,
        );
        next = entriesOf(children, generation + 2, map, settings.examiners.length, warn);
        if (pauseAfterGeneration) {
          state.assembled = next;
          await waitAfterSelection();
          state.assembled = null;
          if (mine !== launch) return;
        }
      }
      state.phase = 'done';
      onChange();
    },

    pause() {
      if (state.phase !== 'running') return;
      runner.pause();
      state.phase = 'paused';
      onChange();
    },

    resume() {
      if (state.phase !== 'paused') return;
      if (proceed) {
        // Стоял после отбора: дальше — Экзамен собранного Поколения.
        const go = proceed;
        proceed = null;
        state.phase = 'running';
        onChange();
        go();
        return;
      }
      runner.resume();
      state.phase = 'running';
      onChange();
    },

    stop() {
      if (state.phase === 'running' || state.phase === 'paused') halt();
    },

    get state() {
      return state;
    },

    get pauseAfterGeneration() {
      return pauseAfterGeneration;
    },

    set pauseAfterGeneration(on: boolean) {
      pauseAfterGeneration = on;
    },
  };
}
