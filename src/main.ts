/**
 * Точка входа браузерной сборки: заводит холст, матч и цикл кадров.
 *
 * Симуляция идёт фиксированным Тиком, экран обновляется чаще и сглаживает
 * положение Юнитов между Тиками. Управление временем появится в тикете 04,
 * покупка Юнитов — в тикете 07; пока Юниты выходят по расписанию.
 */
import { createMatch, TICKS_PER_SECOND } from '@sim/index';
import type { MatchSetup, ScheduledAction, WorldSnapshot } from '@sim/index';
import { arena } from './maps/arena.js';
import { createCanvasRenderer } from './render/canvas-renderer.js';

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Сколько Тиков между появлением Юнитов у одной Стороны. */
const DEPLOY_PERIOD = 45;
const DEMO_WAVES = 40;

/** Демонстрационное расписание: обе Стороны по очереди шлют Юнитов по всем Дорогам. */
function demoSchedule(): ScheduledAction[] {
  const roads = arena.roads.map((road) => road.id);
  const actions: ScheduledAction[] = [];

  for (let wave = 0; wave < DEMO_WAVES; wave += 1) {
    const roadId = roads[wave % roads.length] ?? 'short';
    const tick = 10 + wave * DEPLOY_PERIOD;
    actions.push({ tick, side: 'A', kind: 'deploy', roadId });
    actions.push({ tick: tick + 20, side: 'B', kind: 'deploy', roadId });
  }

  return actions;
}

const setup: MatchSetup = {
  seed: 1,
  map: arena,
  sides: [{ id: 'A' }, { id: 'B' }],
  playerActions: demoSchedule(),
  maxTicks: DEMO_WAVES * DEPLOY_PERIOD + 400,
};

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Не найден холст #stage');

const renderer = createCanvasRenderer(canvas, arena);
const match = createMatch(setup);

let previous: WorldSnapshot = match.snapshot();
let current: WorldSnapshot = match.snapshot();
let accumulated = 0;
let lastFrameMs = performance.now();

function fit(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}

function frame(nowMs: number): void {
  accumulated += Math.min(nowMs - lastFrameMs, TICK_MS * 5);
  lastFrameMs = nowMs;

  while (accumulated >= TICK_MS) {
    previous = current;
    match.step();
    current = match.snapshot();
    accumulated -= TICK_MS;
  }

  renderer.draw({ previous, current, alpha: accumulated / TICK_MS, elapsedMs: nowMs });
  window.requestAnimationFrame(frame);
}

fit();
window.addEventListener('resize', fit);
window.requestAnimationFrame(frame);
