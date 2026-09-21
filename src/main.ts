/**
 * Точка входа браузерной сборки: холст, матч, цикл кадров и управление
 * временем.
 *
 * Симуляция идёт фиксированным Тиком, экран обновляется чаще и сглаживает
 * положение Юнитов между Тиками. Пауза и ускорение меняют только число
 * Тиков за кадр, поэтому на исход матча не влияют (ADR-0001).
 */
import { createMatch, DEFAULT_BEHAVIOUR, parseBehaviour, TICKS_PER_SECOND, UNIT_KINDS } from '@sim/index';
import type {
  Behaviour,
  MatchSetup,
  ScheduledRelease,
  SideId,
  UnitId,
  UnitKind,
  WorldSnapshot,
} from '@sim/index';
import { bindTimeControls } from './app/controls.js';
import { createPacer } from './app/pacer.js';
import { bindPointer } from './app/pointer.js';
import { bindUnitChoice } from './app/unit-choice.js';
import playerRules from './behaviours/player.json';
import { arena } from './maps/arena.js';
import { createCanvasRenderer } from './render/canvas-renderer.js';
import { createHud } from './ui/hud.js';

/** Сколько Тиков между волнами. */
const DEPLOY_PERIOD = 90;
/** Сколько Юнитов в волне и через сколько Тиков они выходят друг за другом. */
const WAVE_SIZE = 5;
const WAVE_GAP = 4;
const DEMO_WAVES = 20;

/** Сид берётся из адреса: ?seed=123 — так матч можно переиграть заново. */
function seedFromLocation(): number {
  const asked = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isInteger(asked) && asked >= 0 ? asked : 1;
}

/**
 * Расписание противника. Сторона игрока никакого расписания не имеет —
 * её Юнитов заказывает человек кликом по Дороге.
 *
 * Это заглушка: настоящий противник появится в тикете 12, когда его
 * поведением станет набор Правил (ADR-0003). Пока он шлёт волны по
 * очереди на каждую Дорогу, насколько хватает Эфира.
 */
function opponentSchedule(): ScheduledRelease[] {
  const roads = arena.roads.map((road) => road.id);
  const actions: ScheduledRelease[] = [];

  for (let wave = 0; wave < DEMO_WAVES; wave += 1) {
    const roadId = roads[wave % roads.length] ?? 'short';
    const start = 10 + wave * DEPLOY_PERIOD;

    for (let index = 0; index < WAVE_SIZE; index += 1) {
      actions.push({
        tick: start + index * WAVE_GAP,
        side: 'B',
        kind: 'deploy',
        roadId,
        unit: UNIT_KINDS[(wave + index) % UNIT_KINDS.length] ?? 'scout',
      });
    }
  }

  return actions;
}

/** За кого играет человек. Выбор Стороны появится вместе с меню матча. */
const PLAYER_SIDE: SideId = 'A';

/**
 * Поведение игрока из файла src/behaviours/player.json. Файл правит
 * человек, поэтому опечатка в нём — обычное дело: вместо молча стоящих
 * Юнитов игрок видит, где именно ошибся, а матч идёт с Поведением
 * по умолчанию.
 */
function loadPlayerBehaviour(): { behaviour: Behaviour; problem: string | null } {
  try {
    return { behaviour: parseBehaviour(playerRules), problem: null };
  } catch (error) {
    return {
      behaviour: DEFAULT_BEHAVIOUR,
      problem: error instanceof Error ? error.message : String(error),
    };
  }
}

const seed = seedFromLocation();
const player = loadPlayerBehaviour();
const setup: MatchSetup = {
  seed,
  map: arena,
  sides: [{ id: 'A', behaviour: player.behaviour }, { id: 'B' }],
  releases: opponentSchedule(),
  // Запас нужен, чтобы матч успел дойти до разрушения Цитадели,
  // а не упёрся в предел Тиков.
  maxTicks: DEMO_WAVES * DEPLOY_PERIOD + 6000,
};

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Не найден холст #stage');

const renderer = createCanvasRenderer(canvas, arena, PLAYER_SIDE);
const hud = createHud();
if (player.problem) hud.warn(`Файл Поведения отвергнут — ${player.problem}`);
const pacer = createPacer(TICKS_PER_SECOND);
const match = createMatch(setup);
/** Какой тип Юнита уйдёт по следующему клику. Переключается клавишами 1-3. */
let chosenKind: UnitKind = 'scout';

const pointer = bindPointer(canvas, renderer, (roadId) => {
  match.deploy({ side: PLAYER_SIDE, kind: 'deploy', roadId, unit: chosenKind });
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
  });
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
