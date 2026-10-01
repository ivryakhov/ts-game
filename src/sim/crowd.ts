import { BODY_RADIUS } from './balance.js';
import { isWallAgainst, structuresOf } from './structure.js';
import type { Unit } from './unit.js';
import type { World } from './world.js';

/**
 * Толпа: чужие стены, в которые не зайти, и расталкивание тех, кто всё
 * же налез друг на друга. Шаги Юнитов — в steering.ts.
 *
 * Зависит от мира только типом, а не кодом: иначе модули замыкались бы
 * в цикл.
 */

/**
 * Сколько раз за Тик расталкиваются налезшие друг на друга. Один проход
 * разводит пару, но в толпе, расталкивая одних, задевает других.
 */
const SEPARATION_PASSES = 3;

/** Стена строения: круг, ближе которого центр Юнита не подходит. */
export interface Wall {
  readonly x: number;
  readonly y: number;
  readonly clearance: number;
}

/** Чужие строения, пока стоят: внутрь них не зайти. */
export function wallsAgainst(world: World, unit: Unit): Wall[] {
  return structuresOf(world)
    .filter((structure) => isWallAgainst(structure, unit.side))
    .map((structure) => ({
      x: structure.at.x,
      y: structure.at.y,
      clearance: structure.radius + BODY_RADIUS,
    }));
}

/**
 * Юниты, всё-таки оказавшиеся друг в друге, — вышедшие из ворот
 * одновременно, шагнувшие на одно место или протиснувшиеся сквозь
 * своих, — расходятся. Толчки считаются по одной расстановке для всех
 * и применяются разом, поэтому порядок Юнитов ничего не решает.
 * Вытолкнутый в чужую стену встаёт у неё снаружи: сквозь стены
 * не проталкивают.
 */
export function separate(world: World): void {
  for (let pass = 0; pass < SEPARATION_PASSES; pass += 1) pushApart(world);
}

function pushApart(world: World): void {
  const units = world.units;
  const pushes = units.map(() => ({ x: 0, y: 0 }));

  for (let first = 0; first < units.length; first += 1) {
    for (let second = first + 1; second < units.length; second += 1) {
      const left = units[first];
      const right = units[second];
      const leftPush = pushes[first];
      const rightPush = pushes[second];
      if (!left || !right || !leftPush || !rightPush) continue;

      let dx = right.x - left.x;
      let dy = right.y - left.y;
      let distance = Math.hypot(dx, dy);
      const overlap = BODY_RADIUS * 2 - distance;
      if (overlap <= 1e-6) continue;

      // Стоят в одной точке — вышли из ворот разом. Раньше вышедший
      // уходит вперёд, к чужой Цитадели, позже вышедший остаётся позади.
      if (distance < 1e-6) {
        const ahead = left.id < right.id ? left : right;
        const along = Math.atan2(ahead.foe.y - ahead.home.y, ahead.foe.x - ahead.home.x);
        const sign = ahead === left ? -1 : 1;
        dx = Math.cos(along) * sign;
        dy = Math.sin(along) * sign;
        distance = 1;
      }

      const push = overlap / 2 / distance;
      leftPush.x -= dx * push;
      leftPush.y -= dy * push;
      rightPush.x += dx * push;
      rightPush.y += dy * push;
    }
  }

  units.forEach((unit, index) => {
    const push = pushes[index];
    if (!push) return;
    unit.x += push.x;
    unit.y += push.y;

    for (const wall of wallsAgainst(world, unit)) {
      const dx = unit.x - wall.x;
      const dy = unit.y - wall.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= wall.clearance || distance < 1e-6) continue;
      unit.x = wall.x + (dx / distance) * wall.clearance;
      unit.y = wall.y + (dy / distance) * wall.clearance;
    }
  });
}
