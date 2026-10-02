import { BODY_RADIUS, CITADEL_STATS, MELEE_GAP } from './balance.js';
import type { Citadel } from './citadel.js';
import { changeHands, obeliskInSight, type Obelisk } from './obelisk.js';
import type { MatchEvent, Point, SideId } from './types.js';
import { noteDamage } from './review.js';
import { statsOf, type Unit } from './unit.js';
import type { World } from './world.js';

/**
 * Строение — то, что стоит на поле и что можно осаждать: у него есть
 * центр, тело, сквозь которое не пройти, здоровье и владелец. Осада
 * знает только строение, а не то, какое именно: Цитадель и Обелиск
 * осаждаются одинаково (ADR-0006).
 *
 * Зависит от мира только типом, а не кодом: иначе модули замыкались
 * бы в цикл.
 */
export interface Structure {
  readonly kind: 'citadel' | 'obelisk';
  /** Чьё строение. null — ничьё: такое строение враг каждой Стороне. */
  readonly owner: SideId | null;
  /**
   * Где стоит центр. Бывает null только у Цитадели на пустой тестовой
   * карте без Дорог — там и подойти к ней некому.
   */
  readonly at: Point | null;
  /** Радиус тела: ближе центр Юнита к центру строения не подходит. */
  readonly radius: number;
  hp: number;
}

/** Строение мира — одно из двух. */
export type Building = Citadel | Obelisk;

/** Все строения мира в постоянном порядке: от него зависит порядок событий. */
export function structuresOf(world: World): readonly Building[] {
  return [...world.citadels.values(), ...world.obelisks];
}

/**
 * Стоит ли строение стеной против Юнита этой Стороны: внутрь не зайти.
 * Своя Цитадель препятствием не считается — из неё Юниты выходят и в неё
 * же отступают лечиться. Сквозь Обелиск не проходит никто, даже владелец.
 */
export function isWallAgainst(structure: Structure, side: SideId): structure is Structure & { at: Point } {
  const foreign = structure.kind === 'obelisk' || structure.owner !== side;
  return foreign && structure.hp > 0 && structure.at !== null;
}

/**
 * С какого расстояния до центра строения Юнит его бьёт. Ближний —
 * встав у самой стены; Стрелок — со своей дальности, как и по Юнитам.
 */
export function reachOfStructure(unit: Unit, structure: Pick<Structure, 'radius'>): number {
  return statsOf(unit).ranged ? statsOf(unit).range : structure.radius + BODY_RADIUS + MELEE_GAP;
}

/**
 * Какое строение осаждает Юнит. С Действием «бить Обелиск» — ближайший
 * видимый чужой Обелиск. Иначе, и когда такого не видно, — чужую Цитадель
 * в конце своей Дороги, а не любую чужую: при трёх Сторонах один Юнит
 * доставал бы всех врагов разом.
 */
export function besiegedBy(world: World, unit: Unit): Building | null {
  if (unit.intent.kind === 'siege-obelisk') {
    const obelisk = obeliskInSight(world.obelisks, unit);
    if (obelisk) return obelisk;
  }
  const road = world.roads.get(unit.roadId);
  const foeSide = unit.forward ? road?.to : road?.from;
  return (foeSide && world.citadels.get(foeSide)) || null;
}

/**
 * Осада: дошедшие до чужого строения бьют его. Павшая Цитадель —
 * поражение её Стороны; павший Обелиск переходит из рук в руки.
 *
 * Осаждающие бьют слабее, чем в Стычке: до строения доходит лишь доля
 * урона. Иначе прорвавшаяся Волна решала бы матч, а удерживать Дорогу
 * не имело бы смысла.
 */
export function siege(world: World, events: MatchEvent[]): void {
  const fallen: Building[] = [];
  /** Урон по Обелискам за этот Тик, по Сторонам: его берёт нанёсший больше. */
  const dealt = new Map<Obelisk, Map<SideId, number>>();

  for (const unit of world.units) {
    if (unit.state !== 'sieging') continue;
    const target = besiegedBy(world, unit);
    if (!target || target.owner === unit.side) continue;
    // Павшая Цитадель ударов больше не принимает. Обелиск принимает их
    // до конца Тика: урон ложится разом, и важен весь урон Тика.
    if (target.kind === 'citadel' && target.hp <= 0) continue;

    const blow = statsOf(unit).damagePerTick * CITADEL_STATS.damageShare;
    noteDamage(world.ledger, unit, target.kind === 'citadel' ? 'citadel' : 'obelisks', blow, target.hp);
    target.hp -= blow;
    if (target.kind === 'obelisk') {
      const bySide = dealt.get(target) ?? new Map<SideId, number>();
      bySide.set(unit.side, (bySide.get(unit.side) ?? 0) + blow);
      dealt.set(target, bySide);
    }
    if (target.hp <= 0 && !fallen.includes(target)) fallen.push(target);
  }

  for (const structure of fallen) {
    if (structure.kind === 'obelisk') {
      changeHands(structure, dealt.get(structure) ?? new Map(), world.tick, events);
      continue;
    }
    structure.hp = 0;
    events.push({ kind: 'citadel-destroyed', tick: world.tick, side: structure.owner });
    world.defeated = structure.owner;
  }
}
