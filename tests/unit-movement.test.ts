import { describe, it, expect } from 'vitest';
import { runMatch } from '@sim/index';
import type { MatchEvent, ScheduledRelease } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

const deploy = (tick: number, roadId: string, side: 'A' | 'B' = 'A'): ScheduledRelease => ({
  tick,
  side,
  kind: 'deploy',
  roadId,
  unit: 'scout',
});

function run(actions: readonly ScheduledRelease[], maxTicks = 1000) {
  return runMatch(matchSetup({ map: arena, releases: actions, maxTicks }));
}

const arrivals = (events: readonly MatchEvent[]) =>
  events.filter((event) => event.kind === 'unit-arrived');

describe('Юнит идёт по Дороге', () => {
  it('выходит из своей Цитадели и доходит до чужой', () => {
    const result = run([deploy(1, 'short')]);

    expect(result.events.some((event) => event.kind === 'unit-deployed')).toBe(true);
    expect(arrivals(result.events)).toHaveLength(1);
  });

  it('дойдя до конца Дороги, принимается за чужую Цитадель', () => {
    // Смотрим сразу после прибытия (101-й Тик): у стен Юнит долго не живёт.
    const result = run([deploy(1, 'short')], 110);

    expect(result.finalState.units).toHaveLength(1);
    expect(result.finalState.units[0]?.state).toBe('sieging');
  });

  it('сообщает о прибытии один раз, а не каждый Тик осады', () => {
    const result = run([deploy(1, 'short')], 150);

    expect(arrivals(result.events)).toHaveLength(1);
  });

  it('виден в мире, пока идёт', () => {
    const result = run([deploy(1, 'short')], 40);

    expect(result.finalState.units).toHaveLength(1);
    const unit = result.finalState.units[0];
    expect(unit?.side).toBe('A');
    expect(unit?.roadId).toBe('short');
    expect(unit?.progress).toBeGreaterThan(0);
    expect(unit?.progress).toBeLessThan(1);
    expect(unit?.hp).toBe(unit?.maxHp);
  });

  it('доходит за заранее известное число Тиков', () => {
    // Якорь, а не пропорция: короткая Дорога длиной 905 условных единиц
    // Разведчик при скорости 9 единиц за Тик проходит за 101 Тик,
    // обходную длиной 1304 — за 145. Числа завязаны на характеристики
    // из balance.ts; если они изменятся, тест обязан упасть и заставить
    // пересмотреть темп.
    expect(arrivals(run([deploy(1, 'short')]).events)[0]?.tick).toBe(101);
    expect(arrivals(run([deploy(1, 'north')]).events)[0]?.tick).toBe(145);
  });

  it('проходит обходную Дорогу заметно дольше короткой', () => {
    const short = arrivals(run([deploy(1, 'short')]).events)[0];
    const north = arrivals(run([deploy(1, 'north')]).events)[0];

    expect(short?.tick).toBeDefined();
    expect(north?.tick).toBeDefined();
    expect(north?.tick ?? 0).toBeGreaterThan((short?.tick ?? 0) * 1.3);
  });

  it('проходит обе обходные Дороги за одно и то же время — карта симметрична', () => {
    const north = arrivals(run([deploy(1, 'north')]).events)[0];
    const south = arrivals(run([deploy(1, 'south')]).events)[0];

    expect(north?.tick).toBe(south?.tick);
  });

  it('идёт с постоянной скоростью: половина Дороги — половина времени', () => {
    const total = arrivals(run([deploy(1, 'north')]).events)[0]?.tick ?? 0;
    const midway = run([deploy(1, 'north')], Math.round(total / 2));

    expect(midway.finalState.units[0]?.progress).toBeCloseTo(0.5, 1);
  });

  it('Сторона B выходит из своей Цитадели и движется к чужой', () => {
    // progress отсчитывается от начала Дороги, то есть от Цитадели A,
    // поэтому Юнит Стороны B стартует у единицы и идёт к нулю.
    const early = run([deploy(1, 'short', 'B')], 15).finalState.units[0];
    const later = run([deploy(1, 'short', 'B')], 80).finalState.units[0];

    expect(early?.side).toBe('B');
    expect(early?.progress).toBeGreaterThan(0.8);
    expect(later?.progress ?? 1).toBeLessThan(early?.progress ?? 0);
  });

  it('Юниты разных Сторон на одной Дороге идут навстречу друг другу', () => {
    const result = run([deploy(1, 'short', 'A'), deploy(1, 'short', 'B')], 40);
    const [first, second] = result.finalState.units;

    const fromA = first?.side === 'A' ? first : second;
    const fromB = first?.side === 'B' ? first : second;
    expect(fromA?.progress ?? 1).toBeLessThan(0.5);
    expect(fromB?.progress ?? 0).toBeGreaterThan(0.5);
  });

  it('Сторона B доходит до конца за то же число Тиков, что и Сторона A', () => {
    const fromA = arrivals(run([deploy(1, 'north', 'A')]).events)[0]?.tick;
    const fromB = arrivals(run([deploy(1, 'north', 'B')]).events)[0]?.tick;

    expect(fromB).toBe(fromA);
  });

  it('не перелетает конец Дороги: последний шаг укорачивается', () => {
    const result = run([deploy(1, 'short')], 100);
    const unit = result.finalState.units[0];

    expect(unit?.progress).toBeLessThanOrEqual(1);
    expect(unit?.progress).toBeGreaterThan(0.99);
  });

  it('два прогона с одним Сидом идут одинаково', () => {
    const actions = [deploy(1, 'short'), deploy(5, 'north'), deploy(9, 'south')];

    expect(run(actions)).toEqual(run(actions));
  });
});
