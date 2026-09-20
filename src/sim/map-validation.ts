import type { GameMap, RoadSpec } from './types.js';

/**
 * Проверка целостности карты. Выполняется при запуске матча, поэтому
 * битая карта не доживает до симуляции и обнаруживается тестом через
 * сейм, а не отдельной проверкой данных в обход него.
 */

/** Минимум — один кубический сегмент. Дальше каждый добавляет три точки. */
const MIN_POINTS = 4;
const POINTS_PER_SEGMENT = 3;
/** На сколько условных единиц конец Дороги может отстоять от Цитадели. */
const ENDPOINT_TOLERANCE = 1;

export function validateMap(map: GameMap): void {
  const sides = map.citadels.map((citadel) => citadel.side);

  if (new Set(sides).size !== map.citadels.length) {
    throw new Error('Карта: у одной Стороны больше одной Цитадели');
  }

  for (const road of map.roads) validateRoad(road, map);
}

function validateRoad(road: RoadSpec, map: GameMap): void {
  const extra = road.points.length - 1;
  if (road.points.length < MIN_POINTS || extra % POINTS_PER_SEGMENT !== 0) {
    throw new Error(
      `Дорога ${road.id}: контрольных точек должно быть 3n+1, а их ${road.points.length}`,
    );
  }

  if (road.from === road.to) {
    throw new Error(`Дорога ${road.id}: ведёт из Цитадели в неё же`);
  }

  for (const [side, point] of [
    [road.from, road.points[0]],
    [road.to, road.points[road.points.length - 1]],
  ] as const) {
    const citadel = map.citadels.find((candidate) => candidate.side === side);
    if (!citadel) throw new Error(`Дорога ${road.id}: нет Цитадели Стороны ${side}`);
    if (!point) throw new Error(`Дорога ${road.id}: отсутствует концевая точка`);

    const gap = Math.hypot(point.x - citadel.at.x, point.y - citadel.at.y);
    if (gap > ENDPOINT_TOLERANCE) {
      throw new Error(`Дорога ${road.id}: конец не сходится с Цитаделью Стороны ${side}`);
    }
  }
}
