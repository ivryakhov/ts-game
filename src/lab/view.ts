import type { SideSetup } from '@sim/index';
import { ruleCount, type Candidate } from '../evolve/candidate.js';
import { totalOf, type Bout } from '../evolve/exam.js';
import { formatMatchTime } from '../ui/hud.js';
import { opponentView } from '../ui/opponent-view.js';

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
  /** Сторона после разбора; null — разбор отверг Претендента. */
  readonly side: SideSetup | null;
  /** Почему отвергнут — ошибка эволюции, а не Претендента. */
  readonly problem: string | null;
  /** Матчи Экзамена по порядку Противников; null — ещё не сыгран. */
  readonly bouts: (Bout | null)[];
}

export const nameOf = (entry: Entry): string => `Претендент №${entry.number}`;

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

/** Таблица Претендентов по Оценке. Клик по строке выбирает Претендента. */
export function leaderboard(
  entries: readonly Entry[],
  examined: number,
  selected: number | null,
  onSelect: (number: number) => void,
): HTMLTableElement {
  const shown = table(['место', 'Претендент', 'откуда', 'Оценка', 'побед', 'ничьих', 'сыграно', 'Правил'], []);
  ranked(entries).forEach((entry, place) => {
    const bouts = played(entry);
    const cells = entry.side
      ? [
          String(place + 1),
          nameOf(entry),
          ORIGINS[entry.origin],
          score(scoreOfEntry(entry)),
          String(bouts.filter((bout) => bout.outcome === 'win').length),
          String(bouts.filter((bout) => bout.outcome === 'draw').length),
          `${bouts.length} из ${examined}`,
          String(ruleCount(entry.candidate)),
        ]
      : [String(place + 1), nameOf(entry), ORIGINS[entry.origin], '—', '—', '—', 'отвергнут', String(ruleCount(entry.candidate))];
    const line = make('tr', entry.number === selected ? 'lab__row lab__row--selected' : 'lab__row');
    line.append(...cells.map((text) => make('td', '', text)));
    line.addEventListener('click', () => onSelect(entry.number));
    shown.append(line);
  });
  return shown;
}

/** Претендент подробно: матч против каждого Противника, затем Волны и Правила словами. */
export function details(
  entry: Entry,
  opponents: readonly { id: string; name: string }[],
  heading: string = nameOf(entry),
): HTMLElement[] {
  const title = make('h2', 'lab__subtitle', heading);
  if (!entry.side) return [title, make('p', 'lab__problem', `Разбор отверг Претендента — ${entry.problem ?? 'причина неизвестна'}.`)];
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
  const rules = opponentView(
    { id: `candidate-${entry.number}`, name: 'Волны и Правила', description: 'Так этот Претендент играет.', side: entry.side },
    entry.side.behaviour ?? entry.candidate.behaviour,
    null,
  );
  return [
    title,
    table(['Противник', 'исход', 'время', 'Цитадели: своя / чужая', 'Обелисков взято', 'Оценка'], rows),
    ...rules,
  ];
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
