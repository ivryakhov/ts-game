import { BODY_RADIUS } from './balance.js';
import { wallsAgainst } from './crowd.js';
import type { Point } from './types.js';
import { compareDistance, distanceTo, statsOf, type Unit } from './unit.js';
import type { World } from './world.js';

/**
 * Как Юнит делает шаг, не проходя сквозь других: препятствия и обход.
 * Куда идти, решает movement.ts; расталкивание налезших — crowd.ts.
 *
 * Тела Юнитов не налезают друг на друга, и враг не заходит внутрь
 * чужой Цитадели. Шаги считаются по одной и той же расстановке для
 * всех, а делаются разом: кто ходит первым, не решает ничего, и матч
 * с одинаковыми Правилами на обеих Сторонах выходит зеркальным.
 */

/**
 * Куда пробовать шагнуть, упёршись в препятствие: отклонения от прямого
 * направления, в радианах, от малых к большим. Последнее — вбок,
 * вдоль препятствия: так Юнит огибает того, кто стоит прямо перед ним.
 */
const DETOURS = [0.45, 0.9, 1.35, Math.PI / 2];

/** Меньше этого шаг не считается движением: Юнит упёрся и ждёт. */
const STUCK = 0.05;

/** Круг, в который Юниту нельзя заходить. */
interface Obstacle {
  readonly x: number;
  readonly y: number;
  /** Сколько должно быть между центрами. */
  readonly clearance: number;
  /** Юнит, если препятствие — Юнит, а не стена. */
  readonly unit?: Unit;
  /**
   * Свой, который стоит, — дерётся, осаждает, держит место или упёрся.
   * Обойти его лучше, но если обойти некуда, сквозь него можно
   * протиснуться, раздвинув плечом. Враги и стены так не раздвигаются.
   */
  readonly soft: boolean;
}

/** Как Юнит вправе обходить тех, кто встал на пути. */
export interface Manner {
  /** Обгонять своих, идущих впереди туда же. */
  readonly overtake: boolean;
  /**
   * Обходить врага, вставшего поперёк. Идущий вперёд этого не делает:
   * враг перекрывает ему путь, и он встаёт.
   */
  readonly bypassEnemies: boolean;
}

/** Шаг, который Юнит сделает в этот Тик; null — упёрся и стоит. */
export type Step = Point | null;

function obstaclesFor(world: World, unit: Unit, near: number): Obstacle[] {
  const found: Obstacle[] = [];

  for (const other of world.units) {
    if (other === unit) continue;
    if (Math.abs(other.x - unit.x) > near || Math.abs(other.y - unit.y) > near) continue;
    found.push({
      x: other.x,
      y: other.y,
      clearance: BODY_RADIUS * 2,
      unit: other,
      soft: other.side === unit.side && !other.marching,
    });
  }

  return [...found, ...wallsAgainst(world, unit).map((wall) => ({ ...wall, soft: false }))];
}

/**
 * Можно ли встать в точку. Налезать на препятствие нельзя, но и
 * выбираться из уже случившегося наложения — у ворот, где Юниты
 * выходят из одной точки, — не запрещено: запрещено лишь сближаться
 * и шагать сквозь того, в ком стоишь.
 */
function isFree(
  unit: Unit,
  x: number,
  y: number,
  obstacles: readonly Obstacle[],
  squeeze: boolean,
): boolean {
  for (const obstacle of obstacles) {
    if (squeeze && obstacle.soft) continue;
    const after = Math.hypot(obstacle.x - x, obstacle.y - y);
    if (after >= obstacle.clearance - 1e-6) continue;
    const before = Math.hypot(obstacle.x - unit.x, obstacle.y - unit.y);
    if (after < before - 1e-6) return false;
    const toward = (x - unit.x) * (obstacle.x - unit.x) + (y - unit.y) * (obstacle.y - unit.y);
    if (toward > 1e-9) return false;
  }
  return true;
}

/** Как далеко можно пройти в заданном направлении, не упёршись. */
function freeLength(
  unit: Unit,
  angle: number,
  length: number,
  obstacles: readonly Obstacle[],
  squeeze = false,
): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const fits = (step: number) =>
    isFree(unit, unit.x + dx * step, unit.y + dy * step, obstacles, squeeze);
  if (fits(length)) return length;

  let low = 0;
  let high = length;
  for (let step = 0; step < 8; step += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/**
 * Кто вплотную впереди — не дальше сорока пяти градусов от направления
 * шага и так близко, что шаг в него упирается.
 */
function aheadOf(unit: Unit, heading: number, obstacles: readonly Obstacle[]): Obstacle[] {
  const dx = Math.cos(heading);
  const dy = Math.sin(heading);
  return obstacles.filter((obstacle) => {
    const toX = obstacle.x - unit.x;
    const toY = obstacle.y - unit.y;
    const distance = Math.hypot(toX, toY);
    if (distance > obstacle.clearance + statsOf(unit).speedPerTick + 1e-6) return false;
    return toX * dx + toY * dy >= distance * Math.SQRT1_2;
  });
}

/**
 * Идёт ли свой туда же, куда и Юнит. Такого не обгоняют, а держатся
 * за его спиной: иначе быстрый Стрелок выбегал бы из-за спины Танка
 * под стены первым, и прикрывать его было бы некому.
 */
function isMarchingAlly(unit: Unit, obstacle: Obstacle): boolean {
  const other = obstacle.unit;
  // Какие Намерения считаются ходом в колонне, решает moveUnits, ставя marching.
  return other !== undefined && other.side === unit.side && other.marching;
}

/**
 * С какого бока обходить: от того, кто упёрся в грудь. Решает геометрия,
 * а не номер Юнита, — иначе одна Сторона обходила бы препятствия иначе,
 * чем другая в зеркальном положении. Стоит точно поперёк — обход
 * к северу: такое правило одинаково для обеих Сторон.
 */
function detourSide(unit: Unit, heading: number, blockers: readonly Obstacle[]): number {
  const nearest = [...blockers].sort((left, right) =>
    compareDistance(distanceTo(unit, left), distanceTo(unit, right)),
  )[0];
  const dx = Math.cos(heading);
  const dy = Math.sin(heading);
  const cross = nearest ? dx * (nearest.y - unit.y) - dy * (nearest.x - unit.x) : 0;
  if (Math.abs(cross) > 1e-6) return cross > 0 ? -1 : 1;
  // Поворот на +90° ведёт в сторону (-dy, dx); к северу — где y меньше.
  if (Math.abs(dx) > 1e-9) return dx > 0 ? -1 : 1;
  return 1;
}

/**
 * Шаг к цели, но не ближе stopAt. Порядок попыток: прямо, если путь
 * свободен; прямо вплотную, если впереди идёт свой, а обгонять нельзя,
 * или встал враг, а обходить его нельзя; в обход, от препятствия прочь;
 * прямо, протискиваясь сквозь стоящих своих; вбок вдоль препятствия.
 *
 * Ничего не меняет: возвращает смещение, которое мир применит разом
 * для всех.
 */
export function planStep(
  world: World,
  unit: Unit,
  goal: Point,
  stopAt: number,
  manner: Manner,
): Step {
  const distance = distanceTo(unit, goal);
  const length = Math.min(statsOf(unit).speedPerTick, distance - stopAt);
  if (length <= 0) return { x: 0, y: 0 };

  const obstacles = obstaclesFor(world, unit, statsOf(unit).speedPerTick + BODY_RADIUS * 2 + 1);
  const heading = Math.atan2(goal.y - unit.y, goal.x - unit.x);
  const straight = freeLength(unit, heading, length, obstacles);

  const go = (angle: number, step: number): Step =>
    step < STUCK ? null : { x: Math.cos(angle) * step, y: Math.sin(angle) * step };

  if (straight >= length) return go(heading, length);

  const blockers = aheadOf(unit, heading, obstacles);
  const held = blockers.some(
    (obstacle) =>
      (!manner.overtake && isMarchingAlly(unit, obstacle)) ||
      (!manner.bypassEnemies && obstacle.unit !== undefined && obstacle.unit.side !== unit.side),
  );
  if (held) return go(heading, straight);

  const first = detourSide(unit, heading, blockers);
  let best = { angle: heading, length: straight, progress: straight };
  let slide: { angle: number; length: number } | null = null;

  for (const offset of DETOURS.flatMap((turn) => [turn * first, -turn * first])) {
    const angle = heading + offset;
    const free = freeLength(unit, angle, length, obstacles);
    const progress = free * Math.cos(offset);
    if (progress > best.progress + 1e-9) best = { angle, length: free, progress };
    if (!slide && Math.abs(offset) === Math.PI / 2 && free >= STUCK) {
      slide = { angle, length: free };
    }
  }

  if (best.progress >= STUCK) return go(best.angle, best.length);
  const squeezed = go(heading, freeLength(unit, heading, length, obstacles, true));
  if (squeezed) return squeezed;
  return slide ? go(slide.angle, slide.length) : null;
}
