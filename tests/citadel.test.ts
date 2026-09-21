import { describe, it, expect } from 'vitest';
import { runMatch } from '@sim/index';
import type { MatchResult, ScheduledAction, SideId } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

const deploy = (tick: number, side: SideId, roadId = 'short'): ScheduledAction => ({
  tick,
  side,
  kind: 'deploy',
  roadId,
});

const run = (actions: readonly ScheduledAction[], maxTicks = 20_000): MatchResult =>
  runMatch(matchSetup({ map: arena, playerActions: actions, maxTicks }));

/**
 * Осада по средствам: первых пятерых покрывает стартовый запас Эфира,
 * дальше приходится ждать, пока накопится на следующего.
 */
const AFFORDABLE_GAP = 80;
const siege = (count: number, side: SideId = 'A'): ScheduledAction[] =>
  Array.from({ length: count }, (_, index) =>
    deploy(1 + (index < 5 ? index * 3 : 15 + (index - 4) * AFFORDABLE_GAP), side),
  );

const citadelOf = (result: MatchResult, side: SideId) =>
  result.finalState.citadels.find((citadel) => citadel.side === side);

describe('Юниты у чужой Цитадели', () => {
  it('дойдя, принимаются за Цитадель, а не исчезают', () => {
    const result = run(siege(1), 400);

    expect(result.finalState.units).toHaveLength(1);
    expect(result.finalState.units[0]?.state).toBe('sieging');
  });

  it('снимают с Цитадели здоровье', () => {
    const result = run(siege(1), 400);

    const target = citadelOf(result, 'B');
    expect(target?.hp).toBeLessThan(target?.maxHp ?? 0);
  });

  it('не трогают свою Цитадель', () => {
    const result = run(siege(1), 400);

    const own = citadelOf(result, 'A');
    expect(own?.hp).toBe(own?.maxHp);
  });

  it('бьют Цитадель ровно вдвое слабее, чем Юнитов', () => {
    // Оба прогона мерят урон одного Юнита за одно и то же число Тиков:
    // в первом он осаждает Цитадель, во втором дерётся в Стычке. Сравнение
    // с живым уроном, а не с записанной в тест цифрой, — иначе правка
    // баланса тихо разъедется с проверкой.
    const ticksOfHitting = 50;

    const arrival = (
      run(siege(1)).events.find((event) => event.kind === 'unit-arrived') as { tick: number }
    ).tick;
    const besieged = run(siege(1), arrival + ticksOfHitting);
    const target = citadelOf(besieged, 'B');
    const toCitadel = (target?.maxHp ?? 0) - (target?.hp ?? 0);

    // Оба замера берутся уже после того, как Стычка завязалась (около 75-го
    // Тика), иначе в интервал попадает время подхода и сравнивать нечего.
    const clash = (until: number) =>
      run([deploy(1, 'A'), deploy(1, 'B')], until).finalState.units[0]?.hp ?? 0;
    const toUnit = clash(80) - clash(80 + ticksOfHitting);

    expect(toCitadel).toBeGreaterThan(0);
    expect(toUnit).toBeGreaterThan(0);
    expect(toCitadel / toUnit).toBeCloseTo(0.5, 1);
  });

  it('вдесятером справляются быстрее, чем в одиночку', () => {
    const one = run(siege(1));
    const ten = run(siege(10));

    expect(one.endReason).toBe('citadel-destroyed');
    expect(ten.endReason).toBe('citadel-destroyed');
    expect(ten.ticks).toBeLessThan(one.ticks / 2);
  });
});

describe('оборона своей Цитадели', () => {
  it('защитники достают осаждающих: осада обратима', () => {
    // Шестеро осаждают Цитадель B, затем B высылает защитников
    // по той же Дороге. Если осаждающие неуязвимы, оборонять
    // Цитадель нечем и матч вырождается в гонку без Стычек.
    const attackers = siege(6, 'A');
    const defenders = Array.from({ length: 5 }, (_, index) => deploy(200 + index * 3, 'B'));
    const result = run([...attackers, ...defenders], 1500);

    const lost = result.events.filter(
      (event) => event.kind === 'unit-died' && 'side' in event && event.side === 'A',
    );
    expect(lost.length).toBeGreaterThan(0);
  });

  it('осаждающие перекрывают Дорогу, а не пропускают сквозь себя', () => {
    const attackers = siege(6, 'A');
    const defenders = Array.from({ length: 4 }, (_, index) => deploy(200 + index * 3, 'B'));
    const result = run([...attackers, ...defenders], 260);

    // Защитники встретили осаждающих и встали в Стычку, а не прошли мимо
    // к чужой Цитадели.
    const besiegingDefenders = result.finalState.units.filter(
      (unit) => unit.side === 'B' && unit.state === 'sieging',
    );
    expect(besiegingDefenders).toHaveLength(0);
    expect(result.finalState.units.some((unit) => unit.state === 'fighting')).toBe(true);
  });
});

describe('исход матча', () => {
  it('разрушение Цитадели завершает матч победой другой Стороны', () => {
    const result = run(siege(12));

    expect(result.endReason).toBe('citadel-destroyed');
    expect(result.winner).toBe('A');
  });

  it('матч кончается раньше лимита Тиков', () => {
    const result = run(siege(12));

    expect(result.ticks).toBeLessThan(20_000);
  });

  it('сообщает, когда именно рухнула Цитадель', () => {
    const result = run(siege(12));
    const fall = result.events.find((event) => event.kind === 'citadel-destroyed');

    expect(fall && 'side' in fall ? fall.side : null).toBe('B');
    expect(fall && 'tick' in fall ? fall.tick : 0).toBe(result.ticks);
  });

  it('без осады доигрывает до лимита и остаётся без победителя', () => {
    const result = run([], 300);

    expect(result.endReason).toBe('tick-limit');
    expect(result.winner).toBeNull();
  });

  it('два прогона осады совпадают полностью', () => {
    expect(run(siege(12))).toEqual(run(siege(12)));
  });
});
