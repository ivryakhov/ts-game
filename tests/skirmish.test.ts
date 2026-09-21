import { describe, it, expect } from 'vitest';
import { runMatch } from '@sim/index';
import type { MatchEvent, MatchResult, ScheduledRelease, SideId, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

const deploy = (
  tick: number,
  side: SideId,
  roadId = 'short',
  unit: UnitKind = 'scout',
): ScheduledRelease => ({ tick, side, kind: 'deploy', roadId, unit });

const run = (actions: readonly ScheduledRelease[], maxTicks = 3000): MatchResult =>
  runMatch(matchSetup({ map: arena, releases: actions, maxTicks }));

const deaths = (events: readonly MatchEvent[]) => events.filter((e) => e.kind === 'unit-died');
const arrivals = (events: readonly MatchEvent[]) => events.filter((e) => e.kind === 'unit-arrived');

describe('встреча на Дороге', () => {
  it('сводит Юнитов разных Сторон в Стычку', () => {
    const result = run([deploy(1, 'A'), deploy(1, 'B')], 70);

    expect(result.finalState.units).toHaveLength(2);
    expect(result.finalState.units.every((unit) => unit.state === 'fighting')).toBe(true);
  });

  it('останавливает участников: в Стычке они не продвигаются', () => {
    const during = run([deploy(1, 'A'), deploy(1, 'B')], 70).finalState.units;
    const later = run([deploy(1, 'A'), deploy(1, 'B')], 90).finalState.units;

    expect(during).toHaveLength(2);
    expect(later[0]?.progress).toBe(during[0]?.progress);
  });

  it('вредит обеим Сторонам: HP убывает у всех участников', () => {
    const units = run([deploy(1, 'A'), deploy(1, 'B')], 70).finalState.units;

    expect(units).toHaveLength(2);
    expect(units.every((unit) => unit.hp < unit.maxHp)).toBe(true);
  });

  it('не трогает Юнитов на разных Дорогах', () => {
    const units = run([deploy(1, 'A', 'short'), deploy(1, 'B', 'north')], 70).finalState.units;

    expect(units).toHaveLength(2);
    expect(units.every((unit) => unit.state !== 'fighting')).toBe(true);
  });
});

describe('исход Стычки', () => {
  it('троих против одного выигрывают трое', () => {
    // До чужих стен победители ещё не дошли: смотрим исход самой Стычки.
    const result = run([deploy(1, 'A'), deploy(2, 'A'), deploy(3, 'A'), deploy(1, 'B')], 95);
    const died = deaths(result.events);

    expect(died).toHaveLength(1);
    expect(died[0] && 'side' in died[0] ? died[0].side : null).toBe('B');
  });

  it('всегда завершается: Дорога пустеет, никто не остаётся стоять навсегда', () => {
    // Проверять «никто не в состоянии fighting» недостаточно: Юнит,
    // навсегда зависший в очереди, такую проверку прошёл бы.
    const actions = [
      ...Array.from({ length: 5 }, (_, index) => deploy(1 + index, 'A')),
      ...Array.from({ length: 5 }, (_, index) => deploy(1 + index, 'B')),
    ];
    const result = run(actions, 5000);

    const deployed = result.events.filter((e) => e.kind === 'unit-deployed').length;
    const resolved = deaths(result.events).length + arrivals(result.events).length;

    expect(deployed).toBe(10);
    expect(resolved).toBe(deployed);
    // Никто не остался на Дороге: выжившие дошли и осаждают Цитадель.
    expect(result.finalState.units.every((unit) => unit.state === 'sieging')).toBe(true);
  });

  it('отпускает победителей дальше по Дороге, до чужой Цитадели', () => {
    const result = run([deploy(1, 'A'), deploy(2, 'A'), deploy(3, 'A'), deploy(1, 'B')], 140);

    expect(arrivals(result.events)).toHaveLength(3);
    expect(result.finalState.units.every((unit) => unit.state === 'sieging')).toBe(true);
    expect(result.finalState.units).toHaveLength(3);
  });

  it('равная Стычка одного против одного кого-то да убивает', () => {
    const result = run([deploy(1, 'A'), deploy(1, 'B')]);

    expect(deaths(result.events).length).toBeGreaterThanOrEqual(1);
  });
});

describe('лимит Стычки', () => {
  it('одновременно дерётся не больше положенного с каждой Стороны', () => {
    const lineUp = (side: SideId): ScheduledRelease[] =>
      Array.from({ length: 6 }, (_, index) => deploy(1 + index, side));
    const result = run([...lineUp('A'), ...lineUp('B')], 70);

    const fightingOf = (side: SideId) =>
      result.finalState.units.filter((unit) => unit.side === side && unit.state === 'fighting');

    expect(fightingOf('A').length).toBeLessThanOrEqual(3);
    expect(fightingOf('B').length).toBeLessThanOrEqual(3);
  });

  it('остальные ждут очереди, а не идут сквозь Стычку', () => {
    const lineUp = (side: SideId): ScheduledRelease[] =>
      Array.from({ length: 6 }, (_, index) => deploy(1 + index, side));
    const units = run([...lineUp('A'), ...lineUp('B')], 70).finalState.units;

    expect(units.some((unit) => unit.state === 'waiting')).toBe(true);
  });

  it('место выбывшего занимает следующий, и Стычка идёт до конца', () => {
    const lineUp = (side: SideId): ScheduledRelease[] =>
      Array.from({ length: 5 }, (_, index) => deploy(1 + index, side));
    const result = run([...lineUp('A'), ...lineUp('B')], 8000);

    expect(result.finalState.units.every((unit) => unit.state !== 'fighting')).toBe(true);
    expect(deaths(result.events).length).toBeGreaterThan(1);
  });
});

describe('кто именно дерётся', () => {
  const massAttack = (count: number) => [
    ...Array.from({ length: count }, (_, index) => deploy(1 + index, 'A')),
    deploy(1, 'B'),
  ];

  const firstDeath = (count: number) => {
    const died = deaths(run(massAttack(count)).events)[0];
    return died && 'tick' in died ? died.tick : null;
  };

  it('сверх лимита не бьют: шестеро убивают одного не быстрее троих', () => {
    // Снятие лимита ускорило бы убийство вдвое — и до этого теста
    // ни одна проверка этого не замечала.
    expect(firstDeath(6)).toBe(firstDeath(3));
  });

  it('вдвоём убивают быстрее, чем в одиночку — лимит не зажат слишком туго', () => {
    expect(firstDeath(2) ?? 0).toBeLessThan(firstDeath(1) ?? 0);
  });

  it('в Стычку вступают передовые, а не отставшие', () => {
    // Тик 60: встреча уже произошла (около 49-го), но Сторона B ещё жива.
    const units = run(massAttack(5), 60).finalState.units.filter((unit) => unit.side === 'A');
    const fighting = units.filter((unit) => unit.state === 'fighting');
    const waiting = units.filter((unit) => unit.state === 'waiting');

    expect(fighting).not.toHaveLength(0);
    expect(waiting).not.toHaveLength(0);
    // Сторона A идёт от начала Дороги, поэтому передовой — с большей долей.
    const rearmostFighter = Math.min(...fighting.map((unit) => unit.progress));
    const foremostWaiter = Math.max(...waiting.map((unit) => unit.progress));
    expect(rearmostFighter).toBeGreaterThan(foremostWaiter);
  });

  it('дерутся только дотянувшиеся: отставший на полкарты не бьёт издали', () => {
    // Первый выходит сразу, второй — сильно позже: в лимит он попадает
    // вторым номером колонны, а в дальность удара — нет.
    const units = run([deploy(1, 'A'), deploy(55, 'A'), deploy(1, 'B')], 70).finalState.units;
    const ourSide = units.filter((unit) => unit.side === 'A');
    const laggard = ourSide.reduce(
      (rearmost, unit) => (unit.progress < (rearmost?.progress ?? 1) ? unit : rearmost),
      ourSide[0],
    );

    expect(ourSide).toHaveLength(2);
    expect(laggard?.progress).toBeLessThan(0.2);
    expect(laggard?.state).toBe('moving');
  });
});

describe('очередь по старшинству', () => {
  it('дерутся вышедшие раньше, ждут вышедшие позже', () => {
    // Выпущенные одним Тиком не стоят в одной точке: Колонна разводит их
    // по глубине, и ближний удар достаёт только передних.
    const four = Array.from({ length: 4 }, () => deploy(1, 'A'));
    const units = run([...four, deploy(1, 'B')], 60).finalState.units;
    const ourSide = units.filter((unit) => unit.side === 'A');
    const fighting = ourSide.filter((unit) => unit.state === 'fighting');
    const waiting = ourSide.filter((unit) => unit.state === 'waiting');

    expect(ourSide).toHaveLength(4);
    expect(fighting).not.toHaveLength(0);
    expect(waiting).not.toHaveLength(0);
    // Номера раздаются по порядку выхода, поэтому ждать должны старшие.
    expect(Math.max(...fighting.map((unit) => unit.id))).toBeLessThan(
      Math.min(...waiting.map((unit) => unit.id)),
    );
  });
});

describe('дистанция Стычки', () => {
  it('противники встают на расстоянии удара, а не сходятся вплотную', () => {
    const units = run([deploy(1, 'A'), deploy(1, 'B')], 70).finalState.units;
    const [first, second] = units;

    expect(units).toHaveLength(2);
    const gap = Math.abs((first?.progress ?? 0) - (second?.progress ?? 0)) * 905;
    expect(gap).toBeGreaterThan(10);
    expect(gap).toBeLessThan(40);
  });
});

describe('воспроизводимость Стычки', () => {
  it('два прогона одной Стычки совпадают полностью', () => {
    const actions = [deploy(1, 'A'), deploy(4, 'A'), deploy(1, 'B'), deploy(6, 'B')];

    expect(run(actions)).toEqual(run(actions));
  });
});
