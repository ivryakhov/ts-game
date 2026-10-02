/**
 * Точка входа браузерной сборки: холст, Подготовка, матч, цикл кадров
 * и управление временем.
 *
 * Игра открывается Подготовкой; матч создаётся заново на каждый старт.
 * Симуляция идёт фиксированным Тиком, экран обновляется чаще и сглаживает
 * положение Юнитов между Тиками. Пауза и ускорение меняют только число
 * Тиков за кадр, поэтому на исход матча не влияют (ADR-0001).
 */
import { createMatch, DEFAULT_BEHAVIOUR, sideFromFile, TICKS_PER_SECOND } from '@sim/index';
import type {
  Behaviour,
  LiveMatch,
  MatchSetup,
  Seed,
  SideId,
  SideSetup,
  UnitId,
  UnitKind,
  WorldSnapshot,
} from '@sim/index';
import { bindTimeControls } from './app/controls.js';
import { createPacer, STARTING_SPEED } from './app/pacer.js';
import { bindPointer } from './app/pointer.js';
import { parsePresets, type Preset } from './app/presets.js';
import { freshSeed } from './app/seed.js';

import { bindUnitChoice } from './app/unit-choice.js';
import opponentFile from './behaviours/opponent.json';
import playerFile from './behaviours/player.json';
import presetsFile from './behaviours/presets.json';
import { arena } from './maps/arena.js';
import { createCanvasRenderer } from './render/canvas-renderer.js';
import { rememberSeed, seedFromAddress } from './ui/address.js';
import { createHud } from './ui/hud.js';
import { createInspector } from './ui/inspector.js';
import { bindOutcomeActions } from './ui/outcome.js';
import { createPrep } from './ui/prep.js';
import { readSaved, writeSaved } from './ui/saved.js';

/**
 * Предел матча — двадцать минут. Матч кончается разрушением Цитадели;
 * предел нужен только затем, чтобы равный матч не шёл вечно.
 */
const MATCH_LIMIT_TICKS = 20 * 60 * TICKS_PER_SECOND;

/** За кого играет человек. Выбор Стороны появится вместе с меню матча. */
const PLAYER_SIDE: SideId = 'A';
const OPPONENT_SIDE: SideId = 'B';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Не найден холст #stage');

const renderer = createCanvasRenderer(canvas, arena, PLAYER_SIDE);
const hud = createHud(PLAYER_SIDE);
/** Заготовки негодными быть не должны, но если файл испорчен — без них, а не без игры. */
let presets: readonly Preset[] = [];
let presetsProblem: string | null = null;
try {
  presets = parsePresets(presetsFile);
} catch (error) {
  presetsProblem = `Файл presets.json отвергнут — ${error instanceof Error ? error.message : String(error)}.`;
}

const prep = createPrep({
  onStart(next, behaviour) {
    playerBehaviour = behaviour;
    startMatch(next);
  },
  onEdit: writeSaved,
  presets,
});
if (presetsProblem) prep.warn(presetsProblem);
const outcome = bindOutcomeActions({
  replay: () => startMatch(seed),
  edit: () => openPrep(),
  newSeed: () => startMatch(freshSeed(seed)),
});

/**
 * Сторона из файла в src/behaviours. Файлы правит человек, поэтому
 * опечатка в них — обычное дело: вместо молча стоящих Юнитов он видит,
 * где именно ошибся и чем это обернулось. Сторона тогда выходит
 * с Поведением по умолчанию и без Волн.
 */
function loadSide(id: SideId, raw: unknown, file: string, fallback: string): SideSetup {
  try {
    return sideFromFile(id, raw, arena);
  } catch (error) {
    const problem = error instanceof Error ? error.message : String(error);
    const message = `Файл ${file} отвергнут — ${problem}. ${fallback}`;
    hud.warn(message);
    prep.warn(message);
    return { id };
  }
}

// Противник — такая же Сторона из такого же файла, только со списком Волн:
// Юнитов он выпускает сам, отдельного кода для него нет (ADR-0003).
const playerSide = loadSide(
  PLAYER_SIDE,
  playerFile,
  'player.json',
  'Юниты игрока действуют по Поведению по умолчанию.',
);
const opponentSide = loadSide(
  OPPONENT_SIDE,
  opponentFile,
  'opponent.json',
  'Противник не выпускает Юнитов, пока файл не исправлен.',
);

/**
 * Поведение игрока — то, с которым начат последний матч: с Подготовки,
 * а до первого старта — из файла. «Переиграть» берёт его же.
 */
const fileBehaviour: Behaviour = playerSide.behaviour ?? DEFAULT_BEHAVIOUR;
const saved = readSaved();
let playerBehaviour: Behaviour = saved.kind === 'ok' ? saved.behaviour : fileBehaviour;
if (saved.kind === 'rejected') {
  prep.warn(`Сохранённые Правила отвергнуты — ${saved.problem}. Взяты Правила из player.json.`, {
    label: 'Скачать отвергнутый набор',
    name: 'rejected-behaviour.json',
    text: saved.text,
  });
}
prep.setPlayer(playerBehaviour, fileBehaviour);

/**
 * Матч получает копии Сторон: что бы ни случилось с Поведением на
 * Подготовке после старта, идущий матч оно не задевает.
 */
const setupFor = (seed: Seed): MatchSetup => ({
  seed,
  map: arena,
  sides: [structuredClone({ ...playerSide, behaviour: playerBehaviour }), structuredClone(opponentSide)],
  releases: [],
  maxTicks: MATCH_LIMIT_TICKS,
});

/** Подготовка или матч. На Подготовке время стоит и ввод матча молчит. */
let phase: 'prep' | 'match' = 'prep';
let seed: Seed = seedFromAddress();
let setup: MatchSetup = setupFor(seed);
let match: LiveMatch = createMatch(setup);

const pacer = createPacer(TICKS_PER_SECOND, STARTING_SPEED);
/** Какой тип Юнита уйдёт по следующему клику. Переключается клавишами 1-3. */
let chosenKind: UnitKind = 'scout';

/** Юнит, чьё Поведение игрок разбирает. */
let selectedUnit: UnitId | null = null;

/** Поведение Стороны — то самое, что передано в матч, а не вторая копия. */
const behaviourOf = (side: SideId): Behaviour =>
  setup.sides.find((entry) => entry.id === side)?.behaviour ?? DEFAULT_BEHAVIOUR;
const inspector = createInspector(behaviourOf);
const inMatch = (): boolean => phase === 'match' && !match.finished;

const pointer = bindPointer(canvas, renderer, {
  onRelease(roadId) {
    if (inMatch()) match.deploy({ side: PLAYER_SIDE, kind: 'deploy', roadId, unit: chosenKind });
  },
  onSelect(unit) {
    if (phase === 'match') selectedUnit = unit;
  },
  selected: () => selectedUnit,
});

let previous: WorldSnapshot = match.snapshot();
let current: WorldSnapshot = match.snapshot();
let lastFrameMs = performance.now();

/** Новый матч с теми же Сторонами. Сид попадает в адрес — матч можно повторить. */
function startMatch(next: Seed): void {
  seed = next;
  rememberSeed(seed);
  setup = setupFor(seed);
  match = createMatch(setup);
  previous = match.snapshot();
  current = previous;
  selectedUnit = null;
  pacer.restart();
  phase = 'match';
  document.body.dataset['phase'] = phase;
  prep.hide();
}

function openPrep(): void {
  phase = 'prep';
  document.body.dataset['phase'] = phase;
  selectedUnit = null;
  prep.show(seed, behaviourOf(OPPONENT_SIDE));
}

function fit(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}

function frame(nowMs: number): void {
  const delta = nowMs - lastFrameMs;
  lastFrameMs = nowMs;
  const due = phase === 'match' ? pacer.advance(delta) : 0;

  // Смерти копятся за все Тики кадра: на восьмикратной скорости их
  // в одном кадре несколько, и ни одна не должна пропасть.
  const deaths = new Set<UnitId>();
  const citadelHits = new Set<SideId>();
  const obelisksTaken = new Set<string>();
  for (let tick = 0; tick < due && !match.finished; tick += 1) {
    previous = current;
    const lastEvents = match.step();
    for (const event of lastEvents) {
      if (event.kind === 'unit-died') deaths.add(event.unitId);
      if (event.kind === 'obelisk-taken') obelisksTaken.add(event.obeliskId);
    }
    for (const event of lastEvents) {
      if (event.kind === 'deploy-refused' && event.side === PLAYER_SIDE) hud.refuse();
    }

    const next = match.snapshot();
    for (const citadel of current.citadels) {
      const after = next.citadels.find((candidate) => candidate.side === citadel.side);
      if (after && after.hp < citadel.hp) citadelHits.add(citadel.side);
    }
    current = next;
  }

  // Когда матч кончился, стоит на паузе или ещё не начат, сглаживать
  // нечего: иначе доля кадра продолжает бегать от нуля к единице, и
  // картинка вечно дёргается между двумя разными снимками.
  const still = phase === 'prep' || match.finished || pacer.paused;
  if (still) previous = current;
  const alpha = still ? 0 : pacer.alpha;

  // Анимации живут по времени матча, а не по часам: иначе свечение
  // на Дорогах продолжало бы бежать на паузе и не ускорялось бы вместе
  // с симуляцией.
  const matchMs = ((current.tick + alpha) * 1000) / TICKS_PER_SECOND;
  renderer.draw({
    previous,
    current,
    deaths,
    citadelHits,
    obelisksTaken,
    alpha,
    matchMs,
    realMs: nowMs,
    highlightedRoad: inMatch() ? pointer.hovered : null,
    selectedUnit,
  });

  // Выделенный погиб или дошёл до конца — выделение снимается само.
  const selected = current.units.find((unit) => unit.id === selectedUnit) ?? null;
  if (!selected) selectedUnit = null;
  inspector.show(selected, current);
  const purse = current.ether.find((entry) => entry.side === PLAYER_SIDE);
  const foe = current.ether.find((entry) => entry.side !== PLAYER_SIDE);
  hud.update({
    tick: current.tick,
    speed: pacer.speed,
    paused: pacer.paused,
    seed,
    ether: purse?.amount ?? 0,
    incomePerSecond: purse?.incomePerSecond ?? 0,
    foeIncomePerSecond: foe?.incomePerSecond ?? 0,
    chosenKind,
  });
  const ended = phase === 'match' && match.finished;
  hud.announce(ended ? { winner: match.winner, tick: current.tick } : null);
  outcome.show(ended);
  window.requestAnimationFrame(frame);
}

fit();
bindTimeControls(pacer, inMatch);
bindUnitChoice((kind) => {
  chosenKind = kind;
}, inMatch);
window.addEventListener('resize', fit);
openPrep();
window.requestAnimationFrame(frame);
