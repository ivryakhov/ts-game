import { describe, it, expect } from 'vitest';
import { createObeliskFlashes } from '../src/render/obelisks.js';

/** Холст, который только считает нарисованные кольца. */
function countingContext() {
  let rings = 0;
  const context = new Proxy(
    {},
    {
      get: (_target, key) => (key === 'stroke' ? () => (rings += 1) : () => undefined),
      set: () => true,
    },
  ) as CanvasRenderingContext2D;
  return { context, rings: () => rings };
}

const AT = { x: 0, y: 0 };

describe('вспышка павшего Обелиска', () => {
  it('кольцо появляется, даже если Обелиск пал на первом из нескольких Тиков кадра', () => {
    const flashes = createObeliskFlashes();
    const { context, rings } = countingContext();

    flashes.note(new Set(['north']), 1000);
    flashes.draw(context, 'north', AT, 'A', 1100, 1);

    expect(rings()).toBe(1);
  });

  it('новый матч не повторяет вспышки старого, когда его время доходит до них', () => {
    const flashes = createObeliskFlashes();
    const { context, rings } = countingContext();

    flashes.note(new Set(['north']), 1000);
    flashes.note(new Set(), 0);
    flashes.note(new Set(), 1000);
    flashes.draw(context, 'north', AT, null, 1100, 1);

    expect(rings()).toBe(0);
  });
});
