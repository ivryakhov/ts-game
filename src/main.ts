/**
 * Точка входа браузерной сборки: холст, матч, цикл кадров и управление
 * временем.
 *
 * Симуляция идёт фиксированным Тиком, экран обновляется чаще и сглаживает
 * положение Юнитов между Тиками. Пауза и ускорение меняют только число
 * Тиков за кадр, поэтому на исход матча не влияют (ADR-0001).
 */
import { createMatch, DEFAULT_BEHAVIOUR, sideFromFile, TICKS_PER_SECOND } from '@sim/index';
import type {
  Behaviour,
  MatchSetup,
  SideId,
  SideSetup,
  UnitId,
  UnitKind,
  WorldSnapshot,
} from '@sim/index';
import { bindTimeControls } from './app/controls.js';
import { createPacer } from './app/pacer.js';
import { bindPointer } from './app/pointer.js';
import { bindUnitChoice } from './app/unit-choice.js';
import opponentFile from './behaviours/opponent.json';
import playerFile from './behaviours/player.json';
import { arena } from './maps/arena.js';
import { createCanvasRenderer } from './render/canvas-renderer.js';
import { createHud } from './ui/hud.js';
import { createInspector } from './ui/inspector.js';

/**
 * Предел матча — двадцать минут. Матч кончается разрушением Цитадели;
 * предел нужен только затем, чтобы равный матч не шёл вечно.
 */
const MATCH_LIMIT_TICKS = 20 * 60 * TICKS_PER_SECOND;

/** Сид берётся из адреса: ?seed=123 — так матч можно переиграть заново. */
function seedFromLocation(): number {
  const asked = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isInteger(asked) && asked >= 0 ? asked : 1;
}

/** За кого играет человек. Выбор Стороны появится вместе с меню матча. */
const PLAYER_SIDE: SideId = 'A';
const OPPONENT_SIDE: SideId = 'B';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Не найден холст #stage');

const renderer = createCanvasRenderer(canvas, arena, PLAYER_SIDE);
const hud = createHud(PLAYER_SIDE);

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
    hud.warn(`Файл ${file} отвергнут — ${problem}. ${fallback}`);
    return { id };
  }
}

const seed = seedFromLocation();
// Противник — такая же Сторона из такого же файла, только со списком Волн:
// Юнитов он выпускает сам, отдельного кода для него нет (ADR-0003).
const setup: MatchSetup = {
  seed,
  map: arena,
  sides: [
    loadSide(PLAYER_SIDE, playerFile, 'player.json', 'Юниты игрока действуют по Поведению по умолчанию.'),
    loadSide(
      OPPONENT_SIDE,
      opponentFile,
      'opponent.json',
      'Противник не выпускает Юнитов, пока файл не исправлен.',
    ),
  ],
  releases: [],
  maxTicks: MATCH_LIMIT_TICKS,
};

const pacer = createPacer(TICKS_PER_SECOND);
const match = createMatch(setup);
/** Какой тип Юнита уйдёт по следующему клику. Переключается клавишами 1-3. */
let chosenKind: UnitKind = 'scout';

/** Юнит, чьё Поведение игрок разбирает. */
let selectedUnit: UnitId | null = null;

/** Поведение Стороны — то самое, что передано в матч, а не вторая копия. */
const behaviourOf = (side: SideId): Behaviour =>
  setup.sides.find((entry) => entry.id === side)?.behaviour ?? DEFAULT_BEHAVIOUR;
const inspector = createInspector(behaviourOf);

const pointer = bindPointer(canvas, renderer, {
  onRelease(roadId) {
    match.deploy({ side: PLAYER_SIDE, kind: 'deploy', roadId, unit: chosenKind });
  },
  onSelect(unit) {
    selectedUnit = unit;
  },
  selected: () => selectedUnit,
});

let previous: WorldSnapshot = match.snapshot();
let current: WorldSnapshot = match.snapshot();
let lastFrameMs = performance.now();

function fit(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}

function frame(nowMs: number): void {
  const due = pacer.advance(nowMs - lastFrameMs);
  lastFrameMs = nowMs;

  // Смерти копятся за все Тики кадра: на восьмикратной скорости их
  // в одном кадре несколько, и ни одна не должна пропасть.
  const deaths = new Set<UnitId>();
  const citadelHits = new Set<SideId>();
  for (let tick = 0; tick < due && !match.finished; tick += 1) {
    previous = current;
    const lastEvents = match.step();
    for (const event of lastEvents) {
      if (event.kind === 'unit-died') deaths.add(event.unitId);
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

  // Когда матч кончился или стоит на паузе, сглаживать нечего: иначе доля
  // кадра продолжает бегать от нуля к единице, и картинка вечно дёргается
  // между двумя разными снимками.
  const still = match.finished || pacer.paused;
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
    alpha,
    matchMs,
    realMs: nowMs,
    highlightedRoad: pointer.hovered,
    selectedUnit,
  });

  // Выделенный погиб или дошёл до конца — выделение снимается само.
  const selected = current.units.find((unit) => unit.id === selectedUnit) ?? null;
  if (!selected) selectedUnit = null;
  inspector.show(selected, current);
  const purse = current.ether.find((entry) => entry.side === PLAYER_SIDE);
  hud.update({
    tick: current.tick,
    speed: pacer.speed,
    paused: pacer.paused,
    seed,
    ether: purse?.amount ?? 0,
    incomePerSecond: purse?.incomePerSecond ?? 0,
    chosenKind,
  });
  hud.announce(match.finished ? { winner: match.winner, tick: current.tick } : null);
  window.requestAnimationFrame(frame);
}

fit();
bindTimeControls(pacer);
bindUnitChoice((kind) => {
  chosenKind = kind;
});
window.addEventListener('resize', fit);
window.requestAnimationFrame(frame);
