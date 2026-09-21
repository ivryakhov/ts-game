import type { GameMap, MatchSetup, RoadSpec, ScheduledRelease } from './types.js';

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

/**
 * Проверка действий игрока до начала матча.
 *
 * Раньше негодное действие роняло матч посреди Тика — в браузере это
 * навсегда останавливало цикл кадров, и экран замирал без объяснений.
 * Ошибка в расписании должна обнаруживаться на входе, а не на сотом Тике.
 */
export function validateReleases(setup: MatchSetup): void {
  for (const action of setup.releases) validateRelease(action, setup.map, setup.maxTicks);
}

/**
 * Проверка одного действия. Нужна и тем, что заданы заранее, и тем, что
 * игрок совершает по ходу матча: негодное действие обязано отвергаться
 * на входе, а не ронять симуляцию посреди Тика.
 */
export function validateRelease(action: ScheduledRelease, map: GameMap, maxTicks: number): void {
  if (action.tick < 1 || action.tick > maxTicks) {
    throw new Error(`Действие на Тике ${action.tick}: вне отрезка матча`);
  }

  const road = map.roads.find((candidate) => candidate.id === action.roadId);
  if (!road) throw new Error(`Действие на Тике ${action.tick}: Дороги ${action.roadId} нет на карте`);

  if (action.side !== road.from && action.side !== road.to) {
    throw new Error(
      `Действие на Тике ${action.tick}: Дорога ${action.roadId} не ведёт от Цитадели ${action.side}`,
    );
  }
}
