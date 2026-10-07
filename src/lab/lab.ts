/**
 * Точка входа Лаборатории: выбор Противников Экзамена, размера Поколения
 * и Сида, запуск и остановка Экзамена, таблица Претендентов.
 *
 * Эволюции пока нет (тикет 27): Поколение одно и случайное — видно,
 * как играют Претенденты, рождённые из словаря Правил без отбора.
 * Матчи идут в Worker'е, страница не замирает.
 */
import { createRng } from '@sim/index';
import { randomCandidate } from '../evolve/candidate.js';
import { candidateSide } from '../evolve/exam.js';
import { loadOpponents } from '../app/opponents.js';
import { parseSeed } from '../app/seed.js';
import { arena } from '../maps/arena.js';
import type { BoutRequest } from './protocol.js';
import { createRunner } from './runner.js';
import { details, leaderboard, ranked, summary, type Entry } from './view.js';

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`В разметке нет элемента #${id}`);
  return found as T;
}

const roster = loadOpponents(arena, 'B');
const ROADS = arena.roads.map((road) => road.id);
/** Номер Поколения задаёт сдвиг Волн Противников; первое — без сдвига. */
const GENERATION = 0;
const SIZE = { min: 2, max: 128, start: 32 } as const;

const pickers = element('lab-opponents');
const sizeInput = element<HTMLInputElement>('lab-size');
const seedInput = element<HTMLInputElement>('lab-seed');
const start = element<HTMLButtonElement>('lab-start');
const stop = element<HTMLButtonElement>('lab-stop');
const status = element('lab-status');
const line = element('lab-summary');
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
seedInput.value = '1';

function warn(message: string): void {
  const shown = document.createElement('div');
  shown.textContent = message;
  problems.append(shown);
  problems.hidden = false;
}
for (const problem of roster.problems) warn(problem);

const runner = createRunner();
let entries: Entry[] = [];
let examiners = roster.opponents;
let selected: number | null = null;
let running = false;
/** Экзамен остановлен кнопкой, а не доигран. */
let stopped = false;
/**
 * Номер запуска. Остановленный Экзамен дожидается своего конца уже
 * после того, как начат следующий, — и не должен трогать его состояние.
 */
let launch = 0;
let startedMs = 0;
/** Сколько длился Экзамен — замирает, когда он кончился. */
let elapsedMs = 0;
let done = 0;

function render(): void {
  const total = entries.length * examiners.length;
  if (running) elapsedMs = performance.now() - startedMs;
  const seconds = (elapsedMs / 1000).toFixed(0);
  const state = running ? '' : stopped ? ' · остановлен' : ' · готово';
  status.textContent = entries.length === 0 ? '' : `Экзамен: ${done} из ${total} матчей · ${seconds} с${state}`;
  line.textContent = summary(entries, examiners.length, GENERATION + 1);
  board.replaceChildren(
    ...(entries.length === 0 ? [] : [leaderboard(entries, examiners.length, selected, (number) => {
      selected = number;
      render();
    })]),
  );
  const shown = entries.find((entry) => entry.number === (selected ?? ranked(entries)[0]?.number));
  chosen.replaceChildren(...(shown ? details(shown, examiners) : []));
  start.disabled = running;
  stop.disabled = !running;
}

/** Размер Поколения и Сид из полей; негодные — null, и сказано почему. */
function settings(): { size: number; seed: number } | null {
  const size = Number(sizeInput.value);
  const seed = parseSeed(seedInput.value);
  const sizeOk = Number.isInteger(size) && size >= SIZE.min && size <= SIZE.max;
  status.textContent = !sizeOk
    ? `Размер Поколения — целое от ${SIZE.min} до ${SIZE.max}`
    : seed === null
      ? 'Сид — целое неотрицательное число'
      : '';
  return sizeOk && seed !== null ? { size, seed } : null;
}

async function examine(): Promise<void> {
  const chosenSettings = settings();
  examiners = boxes.filter((entry) => entry.box.checked).map((entry) => entry.opponent);
  if (!chosenSettings) return;
  if (examiners.length === 0) {
    status.textContent = 'Выберите хотя бы одного Противника для Экзамена';
    return;
  }
  const rng = createRng(chosenSettings.seed);
  entries = Array.from({ length: chosenSettings.size }, (_, index) => {
    const candidate = randomCandidate(rng, ROADS);
    const number = index + 1;
    try {
      return { number, candidate, side: candidateSide(candidate, arena), problem: null, bouts: examiners.map(() => null) };
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error);
      warn(`Ошибка эволюции: Претендент №${number} отвергнут разбором — ${problem}`);
      return { number, candidate, side: null, problem, bouts: examiners.map(() => null) };
    }
  });
  const mine = (launch += 1);
  selected = null;
  done = 0;
  running = true;
  stopped = false;
  startedMs = performance.now();
  render();

  // Задание — Претендент × Противник: номер задания однозначно возвращает
  // ответ на его место, в каком бы порядке ни пришли ответы.
  const requests: BoutRequest[] = entries.flatMap((entry, candidate) =>
    entry.side
      ? examiners.map((opponent, index) => ({
          job: candidate * examiners.length + index,
          side: entry.side!,
          opponent: opponent.id,
          generation: GENERATION,
        }))
      : [],
  );
  const placeOf = (job: number) => ({ entry: entries[Math.floor(job / examiners.length)], index: job % examiners.length });
  await runner.run(
    requests,
    (job, bout) => {
      const { entry, index } = placeOf(job);
      if (entry) entry.bouts[index] = bout;
      done += 1;
      render();
    },
    (job, problem) => {
      warn(job < 0 ? `Экзамен прерван — ${problem}` : `Матч Экзамена не сыгран — ${problem}`);
      done += 1;
    },
  );
  if (mine !== launch) return;
  running = false;
  render();
}

start.addEventListener('click', () => void examine());
stop.addEventListener('click', () => {
  runner.stop();
  running = false;
  stopped = true;
  render();
});
render();
