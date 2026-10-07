/**
 * Точка входа Лаборатории: настройки эволюции, «Старт», «Пауза», «Стоп»,
 * таблица Претендентов идущего Поколения и история по Поколениям.
 *
 * Матчи идут в Worker'е, страница не замирает. Сам прогон — evolution.ts,
 * показ — view.ts; здесь только поля и кнопки.
 */
import type { Candidate } from '../evolve/candidate.js';
import { loadOpponents } from '../app/opponents.js';
import { parseSeed } from '../app/seed.js';
import { arena } from '../maps/arena.js';
import { createEvolution, type Settings } from './evolution.js';
import { createRunner } from './runner.js';
import { details, historyTable, leaderboard, ranked, summary } from './view.js';

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`В разметке нет элемента #${id}`);
  return found as T;
}

const roster = loadOpponents(arena, 'B');
const SIZE = { min: 2, max: 128, start: 32 } as const;
const GENERATIONS = { min: 1, max: 1000, start: 30 } as const;

const pickers = element('lab-opponents');
const sizeInput = element<HTMLInputElement>('lab-size');
const generationsInput = element<HTMLInputElement>('lab-generations');
const seedInput = element<HTMLInputElement>('lab-seed');
const origin = element<HTMLSelectElement>('lab-origin');
const start = element<HTMLButtonElement>('lab-start');
const pause = element<HTMLButtonElement>('lab-pause');
const stop = element<HTMLButtonElement>('lab-stop');
const status = element('lab-status');
const line = element('lab-summary');
const history = element('lab-history');
const board = element('lab-board');
const chosen = element('lab-details');
const problems = element('lab-problems');

const boxes = roster.opponents.map((opponent) => {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = true;
  const label = document.createElement('label');
  label.className = 'lab__opponent';
  label.title = opponent.description;
  label.append(box, ` ${opponent.name}`);
  pickers.append(label);
  return { opponent, box };
});
sizeInput.value = String(SIZE.start);
generationsInput.value = String(GENERATIONS.start);
seedInput.value = '1';

function warn(message: string): void {
  const shown = document.createElement('div');
  shown.textContent = message;
  problems.append(shown);
  problems.hidden = false;
}
for (const problem of roster.problems) warn(problem);

/**
 * Время Поколения без пауз: часы идут, только пока идёт Экзамен. Их
 * переводит render по смене Поколения и состояния прогона.
 */
const clock: { spentMs: number; sinceMs: number; generation: number; phase: string } = {
  spentMs: 0,
  sinceMs: 0,
  generation: 0,
  phase: 'idle',
};
const elapsedSeconds = (): number =>
  Math.round((clock.spentMs + (evolution.state.phase === 'running' ? performance.now() - clock.sinceMs : 0)) / 1000);

let selected: number | null = null;
const evolution = createEvolution(createRunner(), arena, render, warn);

const PHASES = { idle: '', running: '', paused: ' · пауза', stopped: ' · остановлен', done: ' · готово' } as const;

function render(): void {
  const { phase, settings, generation, entries, done } = evolution.state;
  const now = performance.now();
  if (generation !== clock.generation) {
    Object.assign(clock, { spentMs: 0, sinceMs: now, generation });
    selected = null;
  } else if (clock.phase === 'running' && phase !== 'running') clock.spentMs += now - clock.sinceMs;
  else if (clock.phase !== 'running' && phase === 'running') clock.sinceMs = now;
  clock.phase = phase;
  const examined = settings?.examiners.length ?? 0;
  status.textContent =
    phase === 'idle'
      ? status.textContent
      : `Поколение ${generation}: Экзамен ${done} из ${entries.length * examined} матчей · ${elapsedSeconds()} с${PHASES[phase]}`;
  line.textContent = settings ? summary(entries, examined, generation, settings.generations) : '';
  history.replaceChildren(...(evolution.state.history.length > 0 ? [historyTable(evolution.state.history, examined)] : []));
  history.scrollTop = history.scrollHeight;
  board.replaceChildren(
    ...(entries.length === 0
      ? []
      : [
          leaderboard(entries, examined, selected, (number) => {
            selected = number;
            render();
          }),
        ]),
  );
  const shown = entries.find((entry) => entry.number === (selected ?? ranked(entries)[0]?.number));
  chosen.replaceChildren(...(shown && settings ? details(shown, settings.examiners) : []));
  const live = phase === 'running' || phase === 'paused';
  start.disabled = live;
  pause.disabled = !live;
  pause.textContent = phase === 'paused' ? 'Продолжить' : 'Пауза';
  stop.disabled = !live;
}

/** Целое в пределах или null. */
function within(input: HTMLInputElement, limits: { min: number; max: number }): number | null {
  const value = Number(input.value);
  return Number.isInteger(value) && value >= limits.min && value <= limits.max ? value : null;
}

/** Настройки из полей; негодные — null, и сказано почему. */
function settings(): Settings | null {
  const size = within(sizeInput, SIZE);
  const generations = within(generationsInput, GENERATIONS);
  const seed = parseSeed(seedInput.value);
  const examiners = boxes.filter((entry) => entry.box.checked).map(({ opponent }) => ({ id: opponent.id, name: opponent.name }));
  const problem =
    size === null
      ? `Размер Поколения — целое от ${SIZE.min} до ${SIZE.max}`
      : generations === null
        ? `Поколений — целое от ${GENERATIONS.min} до ${GENERATIONS.max}`
        : seed === null
          ? 'Сид — целое неотрицательное число'
          : examiners.length === 0
            ? 'Выберите хотя бы одного Противника для Экзамена'
            : null;
  status.textContent = problem ?? '';
  if (problem || size === null || generations === null || seed === null) return null;
  const ready: Candidate[] =
    origin.value === 'ready'
      ? roster.opponents.flatMap(({ side }) => (side.behaviour && side.waves ? [{ behaviour: side.behaviour, waves: side.waves }] : []))
      : [];
  return { size, generations, seed, examiners, ready };
}

start.addEventListener('click', () => {
  const chosenSettings = settings();
  if (!chosenSettings) return;
  clock.generation = 0;
  void evolution.start(chosenSettings);
});
pause.addEventListener('click', () => (evolution.state.phase === 'paused' ? evolution.resume() : evolution.pause()));
stop.addEventListener('click', () => evolution.stop());
render();
