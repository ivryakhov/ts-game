import { approachOf } from './skirmish.js';
import { besiegedBy, reachOfStructure, type Structure } from './structure.js';
import { BODY_RADIUS } from './balance.js';
import { isAttack } from './rules.js';
import { separate } from './crowd.js';
import { planStep, type Step } from './steering.js';
import type { MatchEvent, Point, UnitId, UnitState } from './types.js';
import { compareDistance, distanceTo, statsOf, type Unit } from './unit.js';
import type { World } from './world.js';

/**
 * Движение Юнитов по полю. Дорога — это маршрут, которого Юнит держится,
 * а не рельсы: идущий к врагу сходит с неё, а потом возвращается.
 * Здесь решается, куда Юнит идёт; как он при этом обходит других —
 * в steering.ts.
 *
 * Зависит от мира только типом, а не кодом: иначе модули замыкались бы
 * в цикл, и первое же значение, вычисляемое при загрузке, падало бы.
 */

/** Насколько далеко вперёд по Дороге Юнит выбирает точку, к которой идёт. */
const LOOKAHEAD = 40;

/**
 * В каком окне вокруг прежнего положения ищется проекция на Дорогу.
 * Шире самого далёкого отхода за врагом, но не настолько, чтобы Юнит
 * вдруг оказался на другом конце петляющей Дороги.
 */
const PROJECTION_WINDOW = 200;

/**
 * С какого расстояния до чужой Цитадели Юнит перестаёт держаться Дороги
 * и идёт прямо к стенам — туда, где есть место.
 */
const STORM_DISTANCE = 150;

/** Сколько мест у стен перебирается в поисках свободного. */
const WALL_SLOTS = 72;

/**
 * Насколько дальше своей дальности может оказаться осаждающий, которого
 * оттеснили свои, и всё ещё считаться стоящим у стен. Без этого запаса
 * от каждого толчка в толпе он «уходил» бы от стен и «приходил» снова.
 */
const SIEGE_SLACK = 6;

/**
 * Шаг сетки, к которой привязываются точки Юнитов после каждого Тика.
 *
 * Сторона B считает свои точки от другого конца Дороги, и в последних
 * знаках её числа расходятся с зеркальными числами Стороны A. Толпа
 * у стен и в Стычке раздувает такой шум до заметного за пару тысяч
 * Тиков, и матч с одинаковыми Правилами на обеих Сторонах переставал
 * бы быть зеркальным. Привязка к сетке гасит шум мельче её шага, пока
 * он не вырос. Шаг — степень двойки, поэтому точки на сетке и их
 * зеркала представимы в числах с плавающей точкой без потерь.
 */
const GRID = 1024;

/**
 * Привязка к сетке с округлением половин к чётному: обычное округление
 * тянет половины всегда вверх, а у зеркальной точки это «вниз», и
 * зеркало расходилось бы на шаг сетки.
 */
function snap(value: number): number {
  const scaled = value * GRID;
  const floor = Math.floor(scaled);
  const rest = scaled - floor;
  const rounded = rest > 0.5 || (rest === 0.5 && floor % 2 !== 0) ? floor + 1 : floor;
  return rounded / GRID;
}

function lengthOf(world: World, roadId: string): number {
  const road = world.roads.get(roadId);
  if (!road) throw new Error(`Дороги ${roadId} нет на карте`);
  return road.metrics.length;
}

/** Точка на Дороге Юнита в заданном расстоянии от его Цитадели. */
function roadPoint(world: World, unit: Unit, travelled: number): Point {
  const road = world.roads.get(unit.roadId);
  if (!road) throw new Error(`Дороги ${unit.roadId} нет на карте`);
  const clamped = Math.min(road.metrics.length, Math.max(0, travelled));
  return road.metrics.pointAtDistance(unit.forward ? clamped : road.metrics.length - clamped);
}

/**
 * Идти вперёд — значит держаться Дороги: Юнит целится в её точку чуть
 * впереди своей проекции. Сошедший с Дороги так и возвращается на неё —
 * по косой, не теряя хода.
 */
function advanceGoal(world: World, unit: Unit): Point {
  const nearWalls =
    unit.travelled + LOOKAHEAD >= lengthOf(world, unit.roadId) ||
    distanceTo(unit, unit.foe) <= STORM_DISTANCE;
  const target = besiegedBy(world, unit);
  if (nearWalls && target) return wallSlot(world, unit, target);
  if (nearWalls) return unit.foe;
  return roadPoint(world, unit, unit.travelled + LOOKAHEAD);
}

/**
 * Ближайшее свободное место у стен осаждаемого строения — на том
 * расстоянии от его центра, с которого Юнит его достаёт. Идти прямо
 * в центр значило бы упираться в спины тех, кто уже осаждает,
 * и выталкивать их под стены; а так подошедшие позже обступают строение
 * по кругу. Свободного места нет — Юнит идёт к центру и ждёт, пока
 * место освободится.
 */
function wallSlot(world: World, unit: Unit, target: Structure): Point {
  const centre = target.at ?? unit.foe;
  const radius = reachOfStructure(unit, target) - 1;
  const crowd = world.units.filter(
    (other) => other !== unit && Math.abs(distanceTo(other, centre) - radius) < BODY_RADIUS * 2,
  );

  let best: { point: Point; distance: number } | null = null;
  for (let slot = 0; slot < WALL_SLOTS; slot += 1) {
    const angle = (slot / WALL_SLOTS) * Math.PI * 2;
    const point = {
      x: centre.x + Math.cos(angle) * radius,
      y: centre.y + Math.sin(angle) * radius,
    };
    const taken = crowd.some(
      (other) => Math.hypot(other.x - point.x, other.y - point.y) < BODY_RADIUS * 2 - 1,
    );
    if (taken) continue;
    const distance = distanceTo(unit, point);
    // Из равноудалённых мест — северное: так решают обе Стороны одинаково.
    const order = best ? compareDistance(distance, best.distance) || point.y - best.point.y : -1;
    if (!best || order < 0) best = { point, distance };
  }

  return best?.point ?? centre;
}

/** Отступать — значит идти по своей Дороге назад, к своей Цитадели. */
function retreatGoal(world: World, unit: Unit): Point {
  if (unit.travelled <= LOOKAHEAD) return unit.home;
  return roadPoint(world, unit, unit.travelled - LOOKAHEAD);
}

/** Достаёт ли Юнит осаждаемое строение, пока оно стоит. */
function reachesFoe(world: World, unit: Unit): boolean {
  const target = besiegedBy(world, unit);
  if (!target?.at || target.hp <= 0) return false;
  const slack = unit.arrived ? SIEGE_SLACK : 0;
  return distanceTo(unit, target.at) <= reachOfStructure(unit, target) + slack;
}

/** Что Юнит делает в этот Тик и какой шаг для этого нужен. */
interface Plan {
  readonly unit: Unit;
  readonly step: Step;
  /** Состояние, если шаг удался, и если Юнит упёрся. */
  readonly moved: UnitState;
  readonly stuck: UnitState;
  /** Идёт ли он к чужим стенам — тогда может дойти до них в этом же Тике. */
  readonly storming: boolean;
}

function planFor(
  world: World,
  unit: Unit,
  byId: ReadonlyMap<UnitId, Unit>,
  quarry: Unit | undefined,
): Plan {
  const plan = (step: Step, moved: UnitState, stuck: UnitState = moved): Plan => ({
    unit,
    step,
    moved,
    stuck,
    storming: false,
  });

  // Отступающий уходит назад, к своей Цитадели, — и от чужих стен тоже.
  // Отходя, он обходит всех, кто мешает, своих и чужих.
  if (unit.intent.kind === 'retreat') {
    const manner = { overtake: true, bypassEnemies: true };
    return plan(planStep(world, unit, retreatGoal(world, unit), 0, manner), 'retreating');
  }

  // Стоять по Правилу — не то же, что ждать, упёршись: Юнит держит
  // место сам. Даже если враг до него дотянулся, он стоит по своей воле.
  if (unit.intent.kind === 'hold') return plan(null, 'holding');

  // Дерущийся Стрелок стоит, где стоял. Ближний держится вплотную
  // к цели: отходящую преследует, не переставая бить.
  if (unit.state === 'fighting') {
    const target = unit.target === null ? undefined : byId.get(unit.target);
    if (!target || statsOf(unit).ranged) return plan(null, 'fighting');
    const manner = { overtake: true, bypassEnemies: true };
    return plan(planStep(world, unit, target, approachOf(unit), manner), 'fighting');
  }

  // Атакующий, никого не достающий, сходит с Дороги к замеченному врагу.
  // Он обходит и своих, и чужих: так ближние обступают цель.
  if (isAttack(unit.intent) && quarry) {
    const manner = { overtake: true, bypassEnemies: true };
    return plan(planStep(world, unit, quarry, approachOf(unit), manner), 'moving', 'waiting');
  }

  // Дошедший до чужой Цитадели никуда больше не идёт: он принимается
  // за неё и стоит у стен, пока его не убьют или Правило не уведёт.
  if (reachesFoe(world, unit)) return plan(null, 'sieging');

  // Идущий вперёд держится Дороги, своих не обгоняет, а упёршись
  // во врага — встаёт: сквозь врага не пройти, и в обход его не пустят.
  const manner = { overtake: false, bypassEnemies: false };
  const step = planStep(world, unit, advanceGoal(world, unit), 0, manner);
  return { ...plan(step, 'moving', 'waiting'), storming: true };
}

export function moveUnits(
  world: World,
  chase: ReadonlyMap<UnitId, UnitId>,
  events: MatchEvent[],
): void {
  const byId = new Map(world.units.map((unit) => [unit.id, unit]));

  // Шаги считаются по одной расстановке для всех и делаются разом: кто
  // ходит первым, не решает ничего.
  const plans = world.units.map((unit) => {
    const quarry = chase.get(unit.id);
    return planFor(world, unit, byId, quarry === undefined ? undefined : byId.get(quarry));
  });

  for (const { unit, step, moved, stuck } of plans) {
    const walking = step !== null && (step.x !== 0 || step.y !== 0);
    if (step) {
      unit.x += step.x;
      unit.y += step.y;
    }
    unit.state = step ? moved : stuck;
    // Своего, который идёт, не обгоняют; стоящего — обходят.
    unit.marching = walking && (unit.intent.kind === 'advance' || isAttack(unit.intent));
  }

  separate(world);
  for (const unit of world.units) {
    unit.x = snap(unit.x);
    unit.y = snap(unit.y);
  }

  // Шагнувший к стенам мог дойти до них в этом же Тике.
  for (const { unit, storming } of plans) {
    if (storming && reachesFoe(world, unit)) unit.state = 'sieging';
  }

  for (const unit of world.units) {
    const road = world.roads.get(unit.roadId);
    if (!road) continue;
    const length = road.metrics.length;
    const along = road.metrics.project(
      unit,
      unit.forward ? unit.travelled : length - unit.travelled,
      PROJECTION_WINDOW,
    );
    unit.travelled = unit.forward ? along : length - along;

    const arrived = unit.state === 'sieging';
    if (arrived && !unit.arrived) {
      unit.arrivedAt = world.tick;
      events.push({
        kind: 'unit-arrived',
        tick: world.tick,
        unitId: unit.id,
        side: unit.side,
        roadId: unit.roadId,
      });
    }
    if (!arrived) unit.arrivedAt = null;
    unit.arrived = arrived;
  }
}
