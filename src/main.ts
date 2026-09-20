/**
 * Точка входа браузерной сборки: холст, матч, цикл кадров и управление
 * временем.
 *
 * Симуляция идёт фиксированным Тиком, экран обновляется чаще и сглаживает
 * положение Юнитов между Тиками. Пауза и ускорение меняют только число
 * Тиков за кадр, поэтому на исход матча не влияют (ADR-0001).
 * Покупка Юнитов появится в тикете 07; пока они выходят по расписанию.
 */
import { createMatch, TICKS_PER_SECOND } from '@sim/index';
import type { MatchSetup, ScheduledAction, WorldSnapshot } from '@sim/index';
import { bindTimeControls } from './app/controls.js';
import { createPacer } from './app/pacer.js';
import { arena } from './maps/arena.js';
import { createCanvasRenderer } from './render/canvas-renderer.js';
import { createHud } from './ui/hud.js';

/** Сколько Тиков между появлением Юнитов у одной Стороны. */
const DEPLOY_PERIOD = 45;
const DEMO_WAVES = 40;

/** Сид берётся из адреса: ?seed=123 — так матч можно переиграть заново. */
function seedFromLocation(): number {
  const asked = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isInteger(asked) && asked >= 0 ? asked : 1;
}

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

const seed = seedFromLocation();
const setup: MatchSetup = {
  seed,
  map: arena,
  sides: [{ id: 'A' }, { id: 'B' }],
  playerActions: demoSchedule(),
  maxTicks: DEMO_WAVES * DEPLOY_PERIOD + 400,
};

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Не найден холст #stage');

const renderer = createCanvasRenderer(canvas, arena);
const hud = createHud();
const pacer = createPacer(TICKS_PER_SECOND);
const match = createMatch(setup);

let previous: WorldSnapshot = match.snapshot();
let current: WorldSnapshot = match.snapshot();
let lastFrameMs = performance.now();

function fit(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}

function frame(nowMs: number): void {
  const due = pacer.advance(nowMs - lastFrameMs);
  lastFrameMs = nowMs;

  for (let tick = 0; tick < due && !match.finished; tick += 1) {
    previous = current;
    match.step();
    current = match.snapshot();
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
  renderer.draw({ previous, current, alpha, matchMs });
  hud.update({ tick: current.tick, speed: pacer.speed, paused: pacer.paused, seed });
  window.requestAnimationFrame(frame);
}

fit();
bindTimeControls(pacer);
window.addEventListener('resize', fit);
window.requestAnimationFrame(frame);
