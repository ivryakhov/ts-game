import { measureRoad, type RoadMetrics } from './geometry.js';
import type {
  MatchEvent,
  MatchSetup,
  Point,
  ScheduledRelease,
  SideId,
  UnitId,
  UnscheduledRelease,
  WorldSnapshot,
} from './types.js';
import type { Rng } from './rng.js';
import {
  citadelSnapshots,
  createCitadels,
  defend,
  type Citadel,
  type InReach,
} from './citadel.js';
import { choose, surroundingsOf } from './behave.js';
import { applyPlan } from './combat.js';
import { CITADEL_STATS } from './balance.js';
import { collectIncome, createPurses, etherSnapshots, payForUnit, type Purse } from './ether.js';
import { planSkirmish } from './skirmish.js';
import { DEFAULT_BEHAVIOUR, type Behaviour } from './rules.js';
import { moveUnits } from './movement.js';
import { batter, besiegedBy } from './structure.js';
import { createObelisks, obeliskSnapshots, obelisksFire, type Obelisk } from './obelisk.js';
import { callWaves, type WaveCycle } from './waves.js';
import { createUnit, distanceTo, isAtHome, unitSnapshot, type Unit } from './unit.js';

/**
 * Изменяемое состояние мира. Живёт только внутри одного матча и наружу
 * отдаётся исключительно снимком: рендер читает снимок и не может тронуть
 * состояние (ADR-0001).
 */
export interface World {
  tick: number;
  /** Порядок Сторон фиксирован порядком в настройке матча и дальше не меняется. */
  readonly sides: readonly SideId[];
  /** Юниты в порядке появления: он выводится из расписания, а не из того,
   *  как коллекция устроена внутри, поэтому обход воспроизводим. */
  units: Unit[];
  readonly roads: ReadonlyMap<string, RoadRuntime>;
  readonly citadels: ReadonlyMap<SideId, Citadel>;
  readonly obelisks: readonly Obelisk[];
  /** Поведение каждой Стороны: по нему её Юниты решают, что делать. */
  readonly behaviours: ReadonlyMap<SideId, Behaviour>;
  readonly purses: ReadonlyMap<SideId, Purse>;
  /** Стороны, выпускающие Юнитов сами, по своему списку Волн. */
  readonly waveCycles: readonly WaveCycle[];
  /** Сторона, чья Цитадель пала. Пока никто не пал — null. */
  defeated: SideId | null;
  /** Выпуски, разложенные по Тикам, на которые они назначены. */
  readonly schedule: Map<number, ScheduledRelease[]>;
  nextUnitId: number;
}

/** Дорога, готовая к работе: промеры плюс то, чьи Цитадели она соединяет. */
export interface RoadRuntime {
  readonly from: SideId;
  readonly to: SideId;
  readonly metrics: RoadMetrics;
}

/** Ставит Выпуск в очередь на указанный Тик. */
export function schedule(world: World, action: ScheduledRelease): void {
  const atTick = world.schedule.get(action.tick) ?? [];
  atTick.push(action);
  world.schedule.set(action.tick, atTick);
}

export function createWorld(setup: MatchSetup): World {
  const sides = setup.sides.map((side) => side.id);
  const placeOf = (side: SideId): Point | null =>
    setup.map.citadels.find((citadel) => citadel.side === side)?.at ?? null;

  const world: World = {
    tick: 0,
    sides,
    units: [],
    citadels: createCitadels(sides, placeOf),
    obelisks: createObelisks(setup.map.obelisks),
    behaviours: new Map(
      setup.sides.map((side) => [side.id, side.behaviour ?? DEFAULT_BEHAVIOUR]),
    ),
    purses: createPurses(sides),
    waveCycles: setup.sides.flatMap((side) =>
      side.waves ? [{ side: side.id, waves: side.waves, next: 0 }] : [],
    ),
    defeated: null,
    roads: new Map(
      setup.map.roads.map((road) => [
        road.id,
        { from: road.from, to: road.to, metrics: measureRoad(road) },
      ]),
    ),
    schedule: new Map(),
    nextUnitId: 1,
  };

  for (const action of setup.releases) schedule(world, action);
  return world;
}

/**
 * Один шаг симуляции. Порядок строго такой и не зависит ни от чего
 * внешнего — в этом весь смысл фиксированного Тика (ADR-0001):
 *
 * 1. начисляется доход, вступают в силу Выпуски этого Тика, а Стороны
 *    с Волнами выпускают очередную, если на неё хватает;
 * 2. по расстановке определяется, кто дерётся, а кто идёт к врагу,
 *    одновременно наносится урон и убираются погибшие;
 * 3. двигаются все, кто не дерётся и не стоит, — по очереди, по номеру,
 *    обходя друг друга; встретившие чужие стены встают осаждать;
 * 4. осаждающие бьют чужие Цитадели;
 * 5. Цитадели отвечают ударом со стен, Обелиски бьют идущих мимо;
 * 6. своя Цитадель лечит раненых рядом с собой.
 */
export function advance(world: World, _rng: Rng, events: MatchEvent[]): void {
  world.tick += 1;

  collectIncome(world.purses);
  for (const action of world.schedule.get(world.tick) ?? []) applyRelease(world, action, events);
  for (const action of callWaves(world.waveCycles, world.purses)) {
    applyRelease(world, action, events);
  }

  decide(world);
  const chase = fight(world, events);
  moveUnits(world, chase, events);
  siege(world, events);
  holdTheWalls(world, events);
  mend(world);
}

/**
 * Своя Цитадель лечит Юнитов рядом с собой — зеркально тому, как её стены
 * бьют чужих. Лечит всех, кто рядом и ранен, чем бы они ни были заняты:
 * защитник, дерущийся у ворот, тоже лечится, и игрок это видит.
 *
 * Идёт последним, после Стычки и ударов со стен, поэтому погибшего в этом
 * Тике уже нет среди лечимых, а лечение не отменяет смерть задним числом.
 */
function mend(world: World): void {
  for (const unit of world.units) {
    unit.healing = isAtHome(unit) && unit.hp < unit.maxHp;
    if (unit.healing) unit.hp = Math.min(unit.maxHp, unit.hp + CITADEL_STATS.healPerTick);
  }
}

/** Каждый Юнит выбирает Действие по Правилам своей Стороны. */
function decide(world: World): void {
  const besieged = new Set(world.sides.filter((side) => underTheWalls(world, side).length > 0));
  const around = surroundingsOf(
    world.units,
    (roadId) => roadOf(world, roadId).metrics.length,
    (side) => besieged.has(side),
  );

  for (const unit of world.units) {
    const behaviour = world.behaviours.get(unit.side) ?? DEFAULT_BEHAVIOUR;
    const surroundings = around.get(unit.id);
    if (!surroundings) continue;
    const decision = choose(behaviour, unit, surroundings);
    unit.intent = decision.action;
    unit.rule = decision.rule;
  }
}

/**
 * Враги, которых достают стены Цитадели Стороны, — от её центра, а не от
 * конца Дороги: тот может отстоять от центра. Этой же меркой Юниты знают,
 * что враг у их Цитадели, — иначе Условие и стены разошлись бы на краю.
 */
function underTheWalls(world: World, side: SideId): readonly InReach[] {
  const at = world.citadels.get(side)?.at;
  if (!at) return [];
  return world.units.flatMap((unit) => {
    if (unit.side === side) return [];
    const distance = distanceTo(unit, at);
    return distance <= CITADEL_STATS.range ? [{ unit, distance }] : [];
  });
}

/**
 * Цитадели отвечают ударом. Расстояние меряется по прямой от центра
 * Цитадели: стены бьют любого врага рядом, по какой бы Дороге он ни пришёл
 * и как бы далеко от неё ни сошёл. Следом бьют Обелиски — по выжившим.
 */
function holdTheWalls(world: World, events: MatchEvent[]): void {
  const fallen = defend(world.citadels, (side) => underTheWalls(world, side), world.tick, events);
  if (fallen.size > 0) world.units = world.units.filter((unit) => !fallen.has(unit.id));
  const shot = obelisksFire(world.obelisks, world.units, world.tick, events);
  if (shot.size > 0) world.units = world.units.filter((unit) => !shot.has(unit.id));
}

/** Дошедшие до чужого строения бьют его, пока оно стоит. Павшая Цитадель — поражение. */
function siege(world: World, events: MatchEvent[]): void {
  const besiegers = world.units
    .filter((unit) => unit.state === 'sieging')
    .flatMap((unit) => {
      const target = besiegedBy(world, unit);
      return target ? [{ unit, target }] : [];
    });
  if (besiegers.length === 0) return;

  for (const fallen of batter(besiegers)) {
    if (fallen.kind !== 'citadel' || fallen.owner === null) continue;
    events.push({ kind: 'citadel-destroyed', tick: world.tick, side: fallen.owner });
    world.defeated = fallen.owner;
  }
}

/**
 * Стычки по всему полю разом: Юниты разных Дорог, сошедшиеся рядом,
 * бьются друг с другом так же, как и на одной Дороге.
 *
 * Возвращает, кто к кому идёт, не дотянувшись ни до кого, — это
 * пригодится движению.
 */
function fight(world: World, events: MatchEvent[]): ReadonlyMap<UnitId, UnitId> {
  const plan = planSkirmish(world.units);
  const fallen = applyPlan(world.units, plan, world.tick, events);
  if (fallen.size > 0) world.units = world.units.filter((unit) => !fallen.has(unit.id));
  return plan.chase;
}

/** Расписание и карта проверены при создании матча, поэтому Дорога обязана найтись. */
export function roadOf(world: World, roadId: string): RoadRuntime {
  const road = world.roads.get(roadId);
  if (!road) throw new Error(`Дороги ${roadId} нет на карте`);
  return road;
}

function applyRelease(world: World, action: UnscheduledRelease, events: MatchEvent[]): void {
  const road = roadOf(world, action.roadId);

  if (!payForUnit(world.purses.get(action.side), action.unit)) {
    events.push({
      kind: 'deploy-refused',
      tick: world.tick,
      side: action.side,
      roadId: action.roadId,
      unit: action.unit,
      reason: 'not-enough-ether',
    });
    return;
  }

  const forward = action.side === road.from;
  const start = road.metrics.pointAtDistance(0);
  const end = road.metrics.pointAtDistance(road.metrics.length);
  const unit = createUnit(
    world.nextUnitId,
    action.side,
    action.unit,
    action.roadId,
    forward,
    forward ? start : end,
    forward ? end : start,
  );
  world.nextUnitId += 1;
  world.units.push(unit);

  events.push({
    kind: 'unit-deployed',
    tick: world.tick,
    unitId: unit.id,
    side: unit.side,
    roadId: unit.roadId,
    unit: unit.kind,
  });
}

export function snapshot(world: World): WorldSnapshot {
  const alive = new Set(world.units.map((unit) => unit.id));
  return {
    tick: world.tick,
    sides: [...world.sides],
    // Цель, погибшая в этом же Тике — от удара в Стычке или со стен, —
    // из снимка убирается: ссылаться на Юнита, которого уже нет, незачем.
    units: world.units.map((unit) => {
      const shown = unitSnapshot(unit, roadOf(world, unit.roadId).metrics);
      return shown.target !== null && !alive.has(shown.target) ? { ...shown, target: null } : shown;
    }),
    citadels: citadelSnapshots(world.citadels),
    obelisks: obeliskSnapshots(world.obelisks),
    ether: etherSnapshots(world.purses),
  };
}
