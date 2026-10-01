import { BODY_RADIUS, CITADEL_RADIUS, OBELISK_RADIUS } from './balance.js';
import { roadPolyline } from './geometry.js';
import type { GameMap, MatchSetup, ObeliskSpec, Point, RoadSpec, ScheduledRelease } from './types.js';

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

  if (new Set(map.obelisks.map((obelisk) => obelisk.id)).size !== map.obelisks.length) {
    throw new Error('Карта: у двух Обелисков один идентификатор');
  }
  for (const obelisk of map.obelisks) validateObelisk(obelisk, map);
}

/**
 * Обелиск стоит у обочины: идущий по Дороге проходит мимо, не задевая
 * его тела, — Дорогу он не перекрывает (ADR-0006). И не налезает
 * на Цитадель.
 */
function validateObelisk(obelisk: ObeliskSpec, map: GameMap): void {
  for (const road of map.roads) {
    if (distanceToPolyline(obelisk.at, roadPolyline(road)) < OBELISK_RADIUS + BODY_RADIUS) {
      throw new Error(`Обелиск ${obelisk.id}: задевает идущих по Дороге ${road.id}`);
    }
  }
  for (const citadel of map.citadels) {
    const gap = Math.hypot(obelisk.at.x - citadel.at.x, obelisk.at.y - citadel.at.y);
    if (gap < OBELISK_RADIUS + CITADEL_RADIUS) {
      throw new Error(`Обелиск ${obelisk.id}: налезает на Цитадель Стороны ${citadel.side}`);
    }
  }
}

function distanceToPolyline(point: Point, line: readonly Point[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) {
    const from = line[index - 1];
    const to = line[index];
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const span = dx * dx + dy * dy;
    const t = span === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / span));
    nearest = Math.min(nearest, Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t)));
  }
  return nearest;
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
    throw new Error(`Выпуск на Тике ${action.tick}: вне отрезка матча`);
  }

  const road = map.roads.find((candidate) => candidate.id === action.roadId);
  if (!road) throw new Error(`Выпуск на Тике ${action.tick}: Дороги ${action.roadId} нет на карте`);

  if (action.side !== road.from && action.side !== road.to) {
    throw new Error(
      `Выпуск на Тике ${action.tick}: Дорога ${action.roadId} не ведёт от Цитадели ${action.side}`,
    );
  }
}
