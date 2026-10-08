import type { Snapshot } from './evolution.js';
import type { Ref } from './lineage.js';
import { fadedBoard, leaderboard, type Entry } from './view.js';

/**
 * Таблица Поколения над подробностями (спеки 0004–0005): идущее
 * Поколение, выбранное на кривой прошлое — целиком, с детьми каждого,
 * а на паузе после отбора — переключатель «сдано» / «собрано».
 */

/** Что показывать на паузе после отбора: сданное Поколение или собранное следующее. */
export type Pane = 'examined' | 'assembled';

export interface BoardInput {
  readonly generations: readonly Snapshot[];
  /** Идущее Поколение — номер и Претенденты. */
  readonly generation: number;
  readonly entries: readonly Entry[];
  /** Собранное следующее, пока прогон стоит после отбора. */
  readonly assembled: readonly Entry[] | null;
  readonly examining: boolean;
  /** Выбранное прошлое Поколение; null — идущее. */
  readonly viewing: number | null;
  readonly selected: number | null;
  readonly pane: Pane;
  readonly examined: number;
  readonly readyNames: readonly string[];
  readonly on: {
    /** Открыть карточку Претендента: Поколение и номер. */
    select(ref: Ref): void;
    back(): void;
    pane(pane: Pane): void;
  };
}

export interface Board {
  readonly elements: HTMLElement[];
  /** Претенденты в таблице — из них выбирают подробности. */
  readonly entries: readonly Entry[];
  /** Прошлое Поколение в таблице; null — идущее или собранное. */
  readonly snapshot: Snapshot | null;
}

function button(text: string, onClick: () => void, active = false): HTMLButtonElement {
  const made = document.createElement('button');
  made.type = 'button';
  made.className = active ? 'button lab__back lab__pane--active' : 'button lab__back';
  made.textContent = text;
  made.addEventListener('click', onClick);
  return made;
}

export function boardOf(input: BoardInput): Board {
  const { generations, generation, entries, assembled, viewing, pane, on } = input;
  const past = viewing === null ? null : (generations.find((entry) => entry.number === viewing) ?? null);
  const current = generations.find((entry) => entry.number === generation) ?? null;
  const showAssembled = past === null && assembled !== null && pane === 'assembled';
  const shown = showAssembled ? assembled : (past?.entries ?? entries);
  const children = showAssembled ? null : ((past ?? current)?.children ?? null);

  const title = document.createElement('p');
  title.className = 'lab__board-title';
  if (past) {
    title.append(`Поколение ${past.number}${past.children ? ' · сдано, детей сосчитано' : ''}`);
    if (past.number !== generation) title.append(' ', button(`← к Поколению ${generation}`, on.back));
  } else if (assembled) {
    // Пауза после отбора: сданное с детьми и собранное с Рождениями.
    title.append(
      button(`Поколение ${generation} · сдано`, () => on.pane('examined'), !showAssembled),
      ' ',
      button(`Поколение ${generation + 1} · собрано`, () => on.pane('assembled'), showAssembled),
      showAssembled ? ' Экзамена ещё не было: видно, кто от кого.' : ' Видно, сколько детей досталось каждому.',
    );
  } else if (entries.length > 0) {
    title.append(`Поколение ${generation}${input.examining ? ' · Экзамен' : ''}`);
  }

  // Выцветшее Поколение — без Правил: своя таблица, без выбора.
  const of = past?.number ?? (showAssembled ? generation + 1 : generation);
  const select = (number: number): void => on.select({ generation: of, number });
  if (past?.faded) {
    return { elements: [title, ...fadedBoard(past.faded, input.examined, past.children, input.readyNames, select)], entries: [], snapshot: past };
  }
  const table = leaderboard(shown, input.examined, input.selected, select, children, input.readyNames, showAssembled ? 'birth' : 'rank');
  return { elements: shown.length === 0 ? [] : [title, table], entries: shown, snapshot: past };
}
