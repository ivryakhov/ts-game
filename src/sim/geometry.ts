import type { Point, RoadSpec } from './types.js';

/**
 * Геометрия Дорог. Дорога — одна кубическая кривая Безье: четыре
 * контрольные точки, из которых первая и последняя лежат на Цитаделях.
 *
 * Здесь нет ни времени, ни случайности — только чистые функции, поэтому
 * и симуляция, и рендер читают одну и ту же форму Дороги и не могут
 * разойтись в том, где именно проходит маршрут.
 */

const CUBIC_POINTS = 4;
/** Шагов выборки при измерении длины. Больше — точнее и медленнее. */
const LENGTH_SAMPLES = 256;

/** Во сколько отрезков разбивается Дорога при построении ломаной. */
const POLYLINE_SEGMENTS = 64;

function controlPoints(road: RoadSpec): readonly [Point, Point, Point, Point] {
  const [p0, p1, p2, p3] = road.points;
  if (road.points.length !== CUBIC_POINTS || !p0 || !p1 || !p2 || !p3) {
    throw new Error(`Дорога ${road.id}: ожидались ${CUBIC_POINTS} контрольные точки`);
  }
  return [p0, p1, p2, p3];
}

/** Точка на Дороге при параметре t из отрезка [0, 1]. */
export function pointAt(road: RoadSpec, t: number): Point {
  const [p0, p1, p2, p3] = controlPoints(road);
  const clamped = Math.min(1, Math.max(0, t));
  const u = 1 - clamped;

  const a = u * u * u;
  const b = 3 * u * u * clamped;
  const c = 3 * u * clamped * clamped;
  const d = clamped * clamped * clamped;

  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Длина Дороги, приближённая ломаной. Точного выражения у длины дуги
 * кубической Безье нет, а выборки достаточно: длины нужны для сравнения
 * маршрутов между собой, а не для абсолютной точности.
 */
export function roadLength(road: RoadSpec): number {
  let length = 0;
  let previous = pointAt(road, 0);

  for (let step = 1; step <= LENGTH_SAMPLES; step += 1) {
    const current = pointAt(road, step / LENGTH_SAMPLES);
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
    previous = current;
  }

  return length;
}

/**
 * Дорога в виде ломаной. Рендер рисует именно её и потому не обязан знать,
 * какой кривой Дорога задана: заменить Безье на что угодно можно здесь,
 * не трогая отрисовку.
 */
export function roadPolyline(road: RoadSpec, segments = POLYLINE_SEGMENTS): readonly Point[] {
  const points: Point[] = [];
  for (let step = 0; step <= segments; step += 1) points.push(pointAt(road, step / segments));
  return points;
}
