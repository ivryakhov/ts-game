/**
 * Точка входа браузерной сборки: заводит холст, рендер и цикл кадров.
 *
 * Симуляции здесь пока нет — карта статична, движется только свечение
 * на Дорогах. Юниты поедут в тикете 03, управление временем появится
 * в тикете 04.
 */
import { arena } from './maps/arena.js';
import { createCanvasRenderer } from './render/canvas-renderer.js';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Не найден холст #stage');

const renderer = createCanvasRenderer(canvas, arena);

function fit(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}

function frame(elapsedMs: number): void {
  renderer.draw({ elapsedMs });
  window.requestAnimationFrame(frame);
}

fit();
window.addEventListener('resize', fit);
window.requestAnimationFrame(frame);
