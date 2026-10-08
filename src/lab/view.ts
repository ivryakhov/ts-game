import type { SideSetup } from '@sim/index';
import { ruleCount, type Candidate } from '../evolve/candidate.js';
import { totalOf, type Bout } from '../evolve/exam.js';
import type { Birth } from '../evolve/birth.js';
import { formatMatchTime } from '../ui/hud.js';
import { opponentView } from '../ui/opponent-view.js';
import { birthSummary, shortName } from './birth-text.js';

/**
 * Что Лаборатория показывает о Поколении: таблицу Претендентов по Оценке
 * и подробности выбранного — его матчи Экзамена и Правила словами.
 * Только показ: решения принимает lab.ts.
 */

/** Откуда Претендент в Поколении. */
export type Origin = 'random' | 'ready' | 'elite' | 'child';

const ORIGINS: Readonly<Record<Origin, string>> = {
  random: 'случайный',
  ready: 'готовый',
  elite: 'элита',
  child: 'ребёнок',
};

/** Претендент Поколения и то, как идёт его Экзамен. */
export interface Entry {
  /** Номер в Поколении с единицы — им Претендент и зовётся. */
  readonly number: number;
  readonly candidate: Candidate;
  readonly origin: Origin;
  /** Поколение Претендента, с единицы; нет — Претендент из сохранения старого формата. */
  readonly generation?: number;
  /** Рождение — от кого он и что в нём мутировало (спека 0005); нет у восстановленных из браузера. */
  readonly birth?: Birth;
  /** Сторона после разбора; null — разбор отверг Претендента. */
  readonly side: SideSetup | null;
  /** Почему отвергнут — ошибка эволюции, а не Претендента. */
  readonly problem: string | null;
  /** Матчи Экзамена по порядку Противников; null — ещё не сыгран. */
  readonly bouts: (Bout | null)[];
}

export const nameOf = (entry: Entry): string =>
  entry.generation === undefined ? `Претендент №${entry.number}` : `Претендент ${shortName(entry.generation, entry.number - 1)}`;

const played = (entry: Entry): Bout[] => entry.bouts.filter((bout): bout is Bout => bout !== null);

/** Оценка по сыгранным матчам; отвергнутый — ниже всех. */
export const scoreOfEntry = (entry: Entry): number =>
  entry.side ? totalOf(played(entry)).score : Number.NEGATIVE_INFINITY;

/** Выше Оценка — выше место; при равной — меньше Правил (спека 0004). */
export function ranked(entries: readonly Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) => scoreOfEntry(b) - scoreOfEntry(a) || ruleCount(a.candidate) - ruleCount(b.candidate) || a.number - b.number,
  );
}

export const score = (value: number): string => (Number.isFinite(value) ? Math.round(value).toLocaleString('ru-RU') : '—');
const percent = (share: number): string => `${Math.round(share * 100)}%`;
const OUTCOMES: Readonly<Record<Bout['outcome'], string>> = { win: 'победа', loss: 'поражение', draw: 'ничья' };

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

function table(head: readonly string[], rows: readonly (readonly string[])[]): HTMLTableElement {
  const shown = make('table', 'lab__table');
  const top = make('tr', '');
  top.append(...head.map((text) => make('th', '', text)));
  shown.append(top);
  for (const row of rows) {
    const line = make('tr', '');
    line.append(...row.map((text) => make('td', '', text)));
    shown.append(line);
  }
  return shown;
}

/** Строка Поколения: сколько выигрывает лучший и какая у него Оценка. */
export function summary(entries: readonly Entry[], examined: number, generation: number, generations: number): string {
  const [best] = ranked(entries);
  if (!best) return '';
  const finite = entries.map(scoreOfEntry).filter(Number.isFinite);
  const mean = finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) / finite.length : Number.NaN;
  const wins = totalOf(played(best)).wins;
  return `Поколение ${generation} из ${generations} · лучший выигрывает ${wins} из ${examined} · Оценка ${score(scoreOfEntry(best))} · средняя ${score(mean)}`;
}

/** Откуда Претендент: Рождение словами, а без Рождения — элита или ребёнок. */
const originText = (entry: Entry, readyNames: readonly string[]): string =>
  entry.birth && entry.generation !== undefined ? birthSummary(entry.birth, entry.generation, readyNames) : ORIGINS[entry.origin];

/**
 * Таблица Претендентов по Оценке. Клик по строке выбирает Претендента.
 * `children` — сколько детей у каждого по месту в Поколении, когда
 * следующее Поколение уже собрано; до того колонка пуста.
 */
export function leaderboard(
  entries: readonly Entry[],
  examined: number,
  selected: number | null,
  onSelect: (number: number) => void,
  children: readonly number[] | null = null,
  readyNames: readonly string[] = [],
  /** `rank` — по Оценке; `birth` — как собраны: элита, затем дети (Экзамена ещё не было). */
  order: 'rank' | 'birth' = 'rank',
): HTMLTableElement {
  const shown = table(['место', 'Претендент', 'откуда', 'Оценка', 'побед', 'ничьих', 'сыграно', 'Правил', 'детей'], []);
  (order === 'rank' ? ranked(entries) : [...entries]).forEach((entry, place) => {
    const bouts = played(entry);
    const unplayed = bouts.length === 0;
    const kids = children ? String(children[entry.number - 1] ?? 0) : '';
    const cells = entry.side
      ? [
          String(place + 1),
          nameOf(entry),
          originText(entry, readyNames),
          unplayed ? '—' : score(scoreOfEntry(entry)),
          unplayed ? '—' : String(bouts.filter((bout) => bout.outcome === 'win').length),
          unplayed ? '—' : String(bouts.filter((bout) => bout.outcome === 'draw').length),
          `${bouts.length} из ${examined}`,
          String(ruleCount(entry.candidate)),
          kids,
        ]
      : [String(place + 1), nameOf(entry), originText(entry, readyNames), '—', '—', '—', 'отвергнут', String(ruleCount(entry.candidate)), kids];
    const line = make('tr', entry.number === selected ? 'lab__row lab__row--selected' : 'lab__row');
    line.append(...cells.map((text) => make('td', '', text)));
    line.addEventListener('click', () => onSelect(entry.number));
    shown.append(line);
  });
  return shown;
}

/**
 * Матчи Экзамена Претендента: исход, время, Цитадели, Обелиски, Оценка.
 * `onWatch` — у сыгранного матча кнопка «Смотреть»: Матч Экзамена в игре.
 */
export function examTable(
  entry: Entry,
  opponents: readonly { id: string; name: string }[],
  onWatch: ((opponent: string) => void) | null = null,
): HTMLTableElement {
  const rows = opponents.map((opponent, index) => {
    const bout = entry.bouts[index];
    if (!bout) return [opponent.name, 'ещё не сыгран', '', '', '', ''];
    return [
      opponent.name,
      OUTCOMES[bout.outcome],
      formatMatchTime(bout.ticks),
      `${percent(bout.ownHp)} / ${percent(bout.foeHp)}`,
      String(bout.obelisks),
      score(bout.score),
    ];
  });
  const shown = table(['Противник', 'исход', 'время', 'Цитадели: своя / чужая', 'Обелисков взято', 'Оценка', ''], rows);
  if (onWatch) {
    shown.querySelectorAll('tr').forEach((line, index) => {
      const opponent = opponents[index - 1];
      if (!opponent || !entry.bouts[index - 1]) return;
      const cell = make('td', '');
      const watch = make('button', 'button lab__back', 'Смотреть');
      watch.type = 'button';
      watch.title = `Матч Экзамена против «${opponent.name}» в игре — с тем же сдвигом Волн и пределом`;
      watch.addEventListener('click', () => onWatch(opponent.id));
      cell.append(watch);
      line.append(cell);
    });
  }
  return shown;
}

/** Волны и Правила Претендента словами — тем же кодом, что вкладка «Противник» на Подготовке. */
export function rulesOf(entry: Entry): HTMLElement[] {
  if (!entry.side) return [make('p', 'lab__problem', `Разбор отверг Претендента — ${entry.problem ?? 'причина неизвестна'}.`)];
  return opponentView(
    { id: `candidate-${entry.number}`, name: 'Волны и Правила', description: 'Так этот Претендент играет.', side: entry.side },
    entry.side.behaviour ?? entry.candidate.behaviour,
    null,
  );
}

/** История прогона: лучший и средний по Поколениям — растёт ли Оценка. */
export function historyTable(
  history: readonly { number: number; best: number; mean: number; wins: number; obelisks: number }[],
  examined: number,
  /** Сколько секунд Экзамена заняло Поколение, без пауз; undefined — не измерено. */
  seconds: (generation: number) => number | undefined,
  /** Выбранное Поколение и выбор другого — клик по строке, как по точке кривой. */
  selected: number | null,
  onPick: (generation: number) => void,
): HTMLTableElement {
  const shown = table(['Поколение', 'лучшая Оценка', 'средняя', 'лучший выигрывает', 'Обелисков у лучшего', 'время'], []);
  for (const entry of history) {
    const spent = seconds(entry.number);
    const cells = [
      String(entry.number),
      score(entry.best),
      score(entry.mean),
      `${entry.wins} из ${examined}`,
      String(entry.obelisks),
      spent === undefined ? '' : `${spent.toFixed(1)} с`,
    ];
    const line = make('tr', entry.number === selected ? 'lab__row lab__row--selected' : 'lab__row');
    line.append(...cells.map((text) => make('td', '', text)));
    line.addEventListener('click', () => onPick(entry.number));
    shown.append(line);
  }
  return shown;
}

/** Выцветший Претендент — то, что от него осталось (спека 0005, «Память»). */
export interface FadedRow {
  readonly number: number;
  readonly generation: number;
  readonly birth: Parameters<typeof birthSummary>[0];
  readonly score: number;
  readonly wins: number;
  readonly draws: number;
  readonly played: number;
  readonly rules: number;
}

/**
 * Таблица выцветшего Поколения: те же колонки, но без выбора — Правил,
 * чтобы показать подробности, уже нет. Над ней сказано почему.
 */
export function fadedBoard(
  faded: readonly FadedRow[],
  examined: number,
  children: readonly number[] | null,
  readyNames: readonly string[] = [],
  onSelect: (number: number) => void = () => {},
): HTMLElement[] {
  const note = make('p', 'lab__note', 'Поколение выцвело: Правила его Претендентов уже не хранятся, остались Рождение, Оценка и дети.');
  const sorted = [...faded].sort((a, b) => b.score - a.score || a.rules - b.rules || a.number - b.number);
  const rows = sorted.map((entry, place) => [
      String(place + 1),
      `Претендент ${shortName(entry.generation, entry.number - 1)}`,
      birthSummary(entry.birth, entry.generation, readyNames),
      score(entry.score),
      String(entry.wins),
      String(entry.draws),
      `${entry.played} из ${examined}`,
      String(entry.rules),
      children ? String(children[entry.number - 1] ?? 0) : '',
    ]);
  const shown = table(['место', 'Претендент', 'откуда', 'Оценка', 'побед', 'ничьих', 'сыграно', 'Правил', 'детей'], rows);
  // Строка выцветшего тоже открывает карточку: там его Рождение и Родословная.
  shown.querySelectorAll('tr').forEach((line, index) => {
    const entry = sorted[index - 1];
    if (!entry) return;
    line.className = 'lab__row';
    line.addEventListener('click', () => onSelect(entry.number));
  });
  return [note, shown];
}
