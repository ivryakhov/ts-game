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
import { readEvolved } from '../ui/evolved.js';
import { ELITE } from '../evolve/generation.js';
import { boardOf, type Pane } from './board.js';
import { createCurve } from './curve.js';
import { selectionAfterAdvance } from './selection.js';
import { createEvolution, type GenerationRecord, type Settings } from './evolution.js';
import { evolvedActions } from './evolved-actions.js';
import { createRunner, threadCount } from './runner.js';
import { createRunMemory, readRun, type RunSettings } from './saved-run.js';
import { historyTable, summary } from './view.js';
import { createCard } from './card.js';
import type { Ref } from './lineage.js';

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`В разметке нет элемента #${id}`);
  return found as T;
}

const roster = loadOpponents(arena, 'B');
/** Меньше — и всё Поколение займёт элита: детям места не останется. */
const SIZE = { min: ELITE + 1, max: 128, start: 32 } as const;
const GENERATIONS = { min: 1, max: 1000, start: 30 } as const;

const pickers = element('lab-opponents');
const sizeInput = element<HTMLInputElement>('lab-size');
const pauseEach = element<HTMLInputElement>('lab-pause-each');
const generationsInput = element<HTMLInputElement>('lab-generations');
const seedInput = element<HTMLInputElement>('lab-seed');
const origin = element<HTMLSelectElement>('lab-origin');
const start = element<HTMLButtonElement>('lab-start');
const pause = element<HTMLButtonElement>('lab-pause');
const stop = element<HTMLButtonElement>('lab-stop');
const status = element('lab-status');
const line = element('lab-summary');
const history = element('lab-history');
const curveSlot = element('lab-curve');
const board = element('lab-board');
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
// Испорченные Выведенные — та же причина, что на Подготовке в игре.
for (const problem of readEvolved(arena, 'B', roster.opponents.map((opponent) => opponent.id)).problems) warn(problem);

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
/** На паузе после отбора: сданное Поколение или собранное следующее. */
let pane: Pane = 'examined';
/** Поколение, чьего лучшего показывает страница; null — идущее Поколение. */
let viewing: number | null = null;
/**
 * Прошлый прогон из хранилища — до первого «Старта». Его кривая, история
 * и лучшие Поколений видны, хотя Претендентов последнего Поколения нет.
 */
let restored: { settings: RunSettings; history: readonly GenerationRecord[] } | null = null;
const curve = createCurve((generation) => openBest(generation));
curveSlot.append(curve.element);
const runner = createRunner(undefined, threadCount(navigator.hardwareConcurrency));
const evolution = createEvolution(runner, arena, render, warn);
/** Секунды Экзамена каждого доигранного Поколения, без пауз. */
const durations = new Map<number, number>();

const memory = createRunMemory(warn);
/** Поколения прогона в истории — живого или восстановленного из браузера. */
const historyRecords = (): readonly GenerationRecord[] => restored?.history ?? evolution.state.history;
const card = createCard(element<HTMLDialogElement>('lab-card'), {
  // Собранное, но не сданное Поколение — тоже Поколение прогона: у его
  // Претендентов есть Рождение и Родословная, только Экзамена ещё нет.
  generations: () => {
    const { generations, assembled, generation } = evolution.state;
    return assembled ? [...generations, { number: generation + 1, entries: assembled, faded: null, children: null }] : generations;
  },
  champion: (generation) => historyRecords().find((record) => record.number === generation)?.champion ?? null,
  examiners: () => restored?.settings.examiners ?? evolution.state.settings?.examiners ?? [],
  readyNames: () => evolution.state.settings?.readyNames ?? [],
  hasLineage: () => !restored,
  actions: (entry, generation, onChange) =>
    evolvedActions(
      entry,
      { generation, seed: restored?.settings.seed ?? evolution.state.settings?.seed ?? 0 },
      watchable(),
      warn,
      onChange,
      roster.opponents.map((opponent) => opponent.id),
    ),
});

/** Поколение на кривой или в истории: таблица — оно целиком, карточка — его лучший. */
function openBest(generation: number): void {
  viewing = generation;
  selected = null;
  render();
  const best = historyRecords().find((record) => record.number === generation)?.champion;
  if (best) card.open({ generation, number: best.number } satisfies Ref);
}
/** С кем смотреть Показательный матч: готовые Противники и уже Выведенные. */
const watchable = () => [...roster.opponents, ...readEvolved(arena, 'B', roster.opponents.map((opponent) => opponent.id)).opponents];

const PHASES = { idle: '', running: '', paused: ' · пауза', stopped: ' · остановлен', done: ' · готово' } as const;

function render(): void {
  const { phase, settings, generation, entries, done } = evolution.state;
  const now = performance.now();
  if (generation !== clock.generation) {
    const spent = clock.spentMs + (clock.phase === 'running' ? now - clock.sinceMs : 0);
    if (clock.generation > 0) durations.set(clock.generation, spent / 1000);
    Object.assign(clock, { spentMs: 0, sinceMs: now, generation });
    selected = selectionAfterAdvance(viewing, selected);
  } else if (clock.phase === 'running' && phase !== 'running') clock.spentMs += now - clock.sinceMs;
  else if (clock.phase !== 'running' && phase === 'running') clock.sinceMs = now;
  clock.phase = phase;
  if (phase === 'done') durations.set(generation, clock.spentMs / 1000);
  memory.record(evolution.state.history, [...durations]);
  const records = restored?.history ?? evolution.state.history;
  const examiners = restored?.settings.examiners ?? settings?.examiners ?? [];
  const examined = examiners.length;
  const total = restored?.settings.generations ?? settings?.generations ?? 0;
  status.textContent = restored
    ? `Прошлый прогон из браузера: ${records.length} Поколений из ${total}, Сид ${restored.settings.seed}, размер ${restored.settings.size}`
    : phase === 'idle'
      ? status.textContent
      : evolution.state.assembled
        ? `Поколение ${generation} сдано и отобрано · пауза: «Продолжить» начнёт Экзамен Поколения ${generation + 1}`
        : `Поколение ${generation}: Экзамен ${done} из ${entries.length * examined} матчей · ${elapsedSeconds()} с · потоков: ${runner.threads}${PHASES[phase]}`;
  line.textContent = settings && !restored ? summary(entries, examined, generation, total) : '';
  curve.update(records, total, examined, viewing);
  const pick = (number: number): void => openBest(number);
  const scrolled = history.scrollTop + history.clientHeight >= history.scrollHeight - 4;
  history.replaceChildren(
    ...(records.length > 0 ? [historyTable(records, examined, (number) => durations.get(number), viewing, pick)] : []),
  );
  // Новое Поколение видно, если читатель не листает историю выше.
  if (scrolled || viewing === null) history.scrollTop = history.scrollHeight;
  if (!evolution.state.assembled) pane = 'examined';
  const shownBoard = boardOf({
    generations: evolution.state.generations,
    generation,
    entries,
    assembled: evolution.state.assembled,
    examining: phase === 'running' || phase === 'paused',
    viewing,
    selected,
    pane: evolution.state.assembled ? pane : 'examined',
    examined,
    readyNames: settings?.readyNames ?? [],
    on: {
      select(ref) {
        selected = ref.number;
        card.open(ref);
        render();
      },
      back() {
        viewing = null;
        selected = null;
        render();
      },
      pane(next) {
        pane = next;
        selected = null;
        render();
      },
    },
  });
  board.replaceChildren(...shownBoard.elements);
  card.refresh();
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
  const readyNames = origin.value === 'ready' ? roster.opponents.flatMap(({ name, side }) => (side.behaviour && side.waves ? [name] : [])) : [];
  return { size, generations, seed, examiners, ready, readyNames };
}

start.addEventListener('click', () => {
  const chosenSettings = settings();
  if (!chosenSettings) return;
  clock.generation = 0;
  durations.clear();
  restored = null;
  viewing = null;
  const remembered: RunSettings = {
    size: chosenSettings.size,
    generations: chosenSettings.generations,
    seed: chosenSettings.seed,
    origin: origin.value === 'ready' ? 'ready' : 'scratch',
    examiners: chosenSettings.examiners,
  };
  memory.begin(remembered);
  void evolution.start(chosenSettings);
});
pause.addEventListener('click', () => (evolution.state.phase === 'paused' ? evolution.resume() : evolution.pause()));
stop.addEventListener('click', () => evolution.stop());
// Галочку можно менять на ходу: снятая больше не останавливает.
pauseEach.addEventListener('change', () => {
  evolution.pauseAfterGeneration = pauseEach.checked;
});

/** Прошлый прогон: поля — его настройки, кривая и история — его. */
const previous = readRun(arena);
if (previous && 'problem' in previous) warn(`Прошлый прогон из браузера не прочитан — ${previous.problem}.`);
if (previous && 'run' in previous) {
  const { settings: last, history: records, seconds } = previous.run;
  restored = { settings: last, history: records };
  for (const [number, spent] of seconds) durations.set(number, spent);
  sizeInput.value = String(last.size);
  generationsInput.value = String(last.generations);
  seedInput.value = String(last.seed);
  origin.value = last.origin;
  for (const { opponent, box } of boxes) box.checked = last.examiners.some((entry) => entry.id === opponent.id);
  viewing = records[records.length - 1]?.number ?? null;
}
render();
