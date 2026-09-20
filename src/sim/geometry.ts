import type { Point, RoadSpec } from './types.js';

/**
 * Геометрия Дорог. Дорога — цепочка кубических кривых Безье: каждый
 * следующий сегмент начинается там, где кончился предыдущий, поэтому
 * контрольных точек всегда 3n+1. Одного сегмента хватает на прямой
 * маршрут, трёх — на обход с двумя поворотами.
 *
 * Здесь нет ни времени, ни случайности — только чистые функции, поэтому
 * и симуляция, и рендер читают одну и ту же форму Дороги и не могут
 * разойтись в том, где именно проходит маршрут.
 */

/** Во сколько отрезков разбивается один сегмент при построении ломаной. */
const SEGMENT_STEPS = 24;

type Cubic = readonly [Point, Point, Point, Point];

/** Сколько сегментов в Дороге. */
function segmentCount(road: RoadSpec): number {
  return (road.points.length - 1) / 3;
}

function segmentAt(road: RoadSpec, index: number): Cubic {
  const [p0, p1, p2, p3] = road.points.slice(index * 3, index * 3 + 4);
  if (!p0 || !p1 || !p2 || !p3) {
    throw new Error(`Дорога ${road.id}: повреждён сегмент ${index}`);
  }
  return [p0, p1, p2, p3];
}

function cubicAt(segment: Cubic, t: number): Point {
  const [p0, p1, p2, p3] = segment;
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;

  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Точка на Дороге при параметре t из отрезка [0, 1].
 *
 * Параметр распределён по сегментам поровну, а не по длине: на изломах
 * шаг по t даёт чуть разное перемещение. Для отрисовки это незаметно;
 * равномерное по длине движение понадобится Юнитам и будет сделано
 * в тикете 03.
 */
export function pointAt(road: RoadSpec, t: number): Point {
  const count = segmentCount(road);
  const clamped = Math.min(1, Math.max(0, t));

  if (clamped === 1) return cubicAt(segmentAt(road, count - 1), 1);

  const scaled = clamped * count;
  const index = Math.floor(scaled);
  return cubicAt(segmentAt(road, index), scaled - index);
}

/**
 * Дорога в виде ломаной. Рендер рисует именно её и потому не обязан знать,
 * какими кривыми Дорога задана: заменить Безье на что угодно можно здесь,
 * не трогая отрисовку.
 */
export function roadPolyline(road: RoadSpec): readonly Point[] {
  const steps = segmentCount(road) * SEGMENT_STEPS;
  const points: Point[] = [];
  for (let step = 0; step <= steps; step += 1) points.push(pointAt(road, step / steps));
  return points;
}

/**
 * Промеры Дороги: её длина и способ найти точку по пройденному расстоянию.
 *
 * Нужны потому, что параметр кривой Безье распределён неравномерно по
 * длине — шаг по нему на изломе даёт меньшее перемещение, чем на прямом
 * участке. Юнит, идущий по параметру, дёргался бы на поворотах; идущий
 * по расстоянию — движется ровно.
 */
export interface RoadMetrics {
  readonly length: number;
  /** Точка на Дороге в заданном расстоянии от её начала. */
  pointAtDistance(distance: number): Point;
}

export function measureRoad(road: RoadSpec): RoadMetrics {
  const shape = roadPolyline(road);
  const cumulative: number[] = [0];

  for (let index = 1; index < shape.length; index += 1) {
    const previous = shape[index - 1];
    const current = shape[index];
    if (!previous || !current) continue;
    cumulative.push(
      (cumulative[index - 1] ?? 0) + Math.hypot(current.x - previous.x, current.y - previous.y),
    );
  }

  const length = cumulative[cumulative.length - 1] ?? 0;

  return {
    length,
    pointAtDistance(distance: number): Point {
      const target = Math.min(length, Math.max(0, distance));

      let low = 0;
      let high = cumulative.length - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if ((cumulative[middle] ?? 0) <= target) low = middle;
        else high = middle;
      }

      const from = shape[low];
      const to = shape[high];
      const spanStart = cumulative[low] ?? 0;
      const span = (cumulative[high] ?? 0) - spanStart;
      if (!from || !to) throw new Error(`Дорога ${road.id}: ломаная повреждена`);
      if (span === 0) return from;

      const ratio = (target - spanStart) / span;
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    },
  };
}
