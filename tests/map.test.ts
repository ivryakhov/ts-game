import { describe, it, expect } from 'vitest';
import { runMatch } from '@sim/index';
import type { GameMap } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Карта проверяется через запуск матча: битая карта не доживает до
 * симуляции. Длины и симметрия Дорог станут наблюдаемы в тикете 03,
 * когда по ним поедут Юниты, — и проверяться будут там же, игровой
 * ситуацией, а не измерением данных в обход сейма.
 */

const broken = (patch: (map: GameMap) => GameMap) => () =>
  runMatch(matchSetup({ map: patch(arena), maxTicks: 1 }));

describe('карта арены', () => {
  it('принимается матчем как есть', () => {
    expect(() => runMatch(matchSetup({ map: arena, maxTicks: 10 }))).not.toThrow();
  });

  it('матч на ней доходит до конца и сообщает Стороны', () => {
    const result = runMatch(matchSetup({ map: arena, maxTicks: 30 }));

    expect(result.ticks).toBe(30);
    expect(result.finalState.sides).toEqual(['A', 'B']);
  });
});

describe('матч отвергает битую карту', () => {
  it('когда контрольных точек Дороги не 3n+1', () => {
    expect(
      broken((map) => ({
        ...map,
        roads: map.roads.map((road, index) =>
          index === 0 ? { ...road, points: road.points.slice(0, 3) } : road,
        ),
      })),
    ).toThrow(/3n\+1/);
  });

  it('когда цепочка Дороги оборвана на середине сегмента', () => {
    expect(
      broken((map) => ({
        ...map,
        roads: map.roads.map((road) =>
          road.id === 'north' ? { ...road, points: road.points.slice(0, 9) } : road,
        ),
      })),
    ).toThrow(/3n\+1/);
  });

  it('когда конец Дороги не сходится с Цитаделью', () => {
    expect(
      broken((map) => ({
        ...map,
        citadels: map.citadels.map((citadel) =>
          citadel.side === 'B' ? { ...citadel, at: { x: 0, y: 0 } } : citadel,
        ),
      })),
    ).toThrow(/не сходится с Цитаделью/);
  });

  it('когда Дорога ведёт из Цитадели в неё же', () => {
    expect(
      broken((map) => ({
        ...map,
        roads: map.roads.map((road, index) => (index === 0 ? { ...road, to: road.from } : road)),
      })),
    ).toThrow(/из Цитадели в неё же/);
  });

  it('когда у одной Стороны две Цитадели', () => {
    expect(
      broken((map) => {
        const first = map.citadels[0];
        if (!first) throw new Error('пустая карта');
        return { ...map, citadels: [...map.citadels, first] };
      }),
    ).toThrow(/больше одной Цитадели/);
  });
});
