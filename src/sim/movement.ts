import { SKIRMISH } from './balance.js';
import type { MatchEvent } from './types.js';
import { moveUnit, withdrawUnit, type Unit } from './unit.js';
import type { World } from './world.js';

/**
 * Движение Юнитов по Дорогам: вперёд, назад и в Колонне. Вынесено из мира,
 * потому что меняется по своим причинам — Стычка и осада к нему не
 * относятся.
 *
 * Зависит от мира только типом, а не кодом: иначе модули замыкались бы
 * в цикл, и первое же значение, вычисляемое при загрузке, падало бы.
 */

function lengthOf(world: World, roadId: string): number {
  const road = world.roads.get(roadId);
  if (!road) throw new Error(`Дороги ${roadId} нет на карте`);
  return road.metrics.length;
}

export function moveUnits(world: World, events: MatchEvent[]): void {
  const surviving: Unit[] = [];

  for (const unit of world.units) {
    // Отступающий уходит назад, к своей Цитадели, — и от чужих стен тоже.
    if (unit.intent.kind === 'retreat') {
      withdrawUnit(unit);
      unit.arrived = false;
      unit.arrivedAt = null;
      unit.state = 'retreating';
      surviving.push(unit);
      continue;
    }

    // Стоять по Правилу — не то же, что ждать очереди в Стычке: Юнит
    // держит место сам, и идущие следом собираются за его спиной. Даже
    // если враг до него дотянулся, он стоит по своей воле, а не в очереди.
    if (unit.intent.kind === 'hold') {
      unit.state = 'holding';
      surviving.push(unit);
      continue;
    }

    if (unit.state !== 'moving') {
      surviving.push(unit);
      continue;
    }


    // Дошедший не исчезает и никуда больше не идёт: он принимается
    // за чужую Цитадель и стоит у неё, пока его не убьют.
    if (unit.arrived) {
      unit.state = 'sieging';
      surviving.push(unit);
      continue;
    }

    if (moveUnit(unit, lengthOf(world, unit.roadId))) {
      unit.arrived = true;
      unit.arrivedAt = world.tick;
      unit.state = 'sieging';
      events.push({
        kind: 'unit-arrived',
        tick: world.tick,
        unitId: unit.id,
        side: unit.side,
        roadId: unit.roadId,
      });
    }

    surviving.push(unit);
  }

  world.units = surviving;
  keepFormation(world);
}

/**
 * Юнит не обгоняет своих по Дороге: догнав вышедшего раньше, он держится
 * за его спиной.
 *
 * Порядок задаёт старшинство — кто раньше вышел, тот и впереди, — а не
 * пройденный путь. Упорядочивать по пути значит узаконить обгон: быстрый
 * Стрелок, успев за Тик пройти больше Танка, становился «передним»,
 * и зажимали уже Танка. Тогда стрелять из-за спин, ради чего Стрелок
 * и заведён, было бы негде, а к стенам первым приходил бы он.
 */
function keepFormation(world: World): void {
  const columns = new Map<string, Unit[]>();

  for (const unit of world.units) {
    // Осаждающие стоят у стен, отступающие уходят сквозь своих: Колонну
    // держат только те, кто идёт вперёд.
    if (unit.arrived || unit.intent.kind === 'retreat') continue;
    const key = `${unit.roadId}:${unit.side}`;
    const column = columns.get(key);
    if (column) column.push(unit);
    else columns.set(key, [unit]);
  }

  for (const column of columns.values()) {
    column.sort((left, right) => left.id - right.id);

    for (let index = 1; index < column.length; index += 1) {
      const unit = column[index];
      const ahead = column[index - 1];
      if (!unit || !ahead) continue;
      // Ниже нуля не опускаем: иначе Юнит, зажатый Колонной у самой
      // Цитадели, уезжает за начало Дороги.
      unit.travelled = Math.max(0, Math.min(unit.travelled, ahead.travelled - SKIRMISH.spacing));
    }
  }
}
