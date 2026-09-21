import { describe, it, expect } from 'vitest';
import { runMatch } from '@sim/index';
import type { MatchEvent, MatchResult, ScheduledAction, SideId, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

const deploy = (
  tick: number,
  side: SideId,
  unit: UnitKind = 'scout',
  roadId = 'short',
): ScheduledAction => ({ tick, side, kind: 'deploy', roadId, unit });

const run = (actions: readonly ScheduledAction[], maxTicks = 20_000): MatchResult =>
  runMatch(matchSetup({ map: arena, playerActions: actions, maxTicks }));

const killedByCitadel = (events: readonly MatchEvent[]) =>
  events.filter((event) => event.kind === 'unit-died' && 'killer' in event && event.killer.kind === 'citadel');

describe('Цитадель отвечает ударом', () => {
  it('бьёт того, кто её осаждает', () => {
    // Разведчик доходит за 101 Тик; ещё через двадцать он уже ранен.
    const besieger = run([deploy(1, 'A')], 121).finalState.units[0];

    expect(besieger?.state).toBe('sieging');
    expect(besieger?.hp).toBeLessThan(besieger?.maxHp ?? 0);
  });

  it('одинокого Разведчика у стен убивает', () => {
    const result = run([deploy(1, 'A')], 400);

    expect(killedByCitadel(result.events)).toHaveLength(1);
    expect(result.finalState.units).toEqual([]);
  });

  it('свою Сторону не трогает', () => {
    // Первые Тики Юнит проходит вплотную к своей Цитадели, в её радиусе.
    const result = run([deploy(1, 'A')], 5);
    const own = result.finalState.units[0];

    expect(own?.hp).toBe(own?.maxHp);
  });

  it('достаёт только в своём радиусе', () => {
    // На середине короткой Дороги до любой Цитадели далеко.
    const result = run([deploy(1, 'A')], 50);

    expect(result.finalState.units[0]?.hp).toBe(result.finalState.units[0]?.maxHp);
  });

  it('из стоящих вплотную бьёт пришедшего первым, а не вышедшего первым', () => {
    // Стрелок выходит первым, но по длинной обходной Дороге и встаёт у стен
    // около 218-го Тика. Танк выходит вторым по короткой и встаёт около
    // 217-го. Пришёл первым Танк — его стены и бьют, хотя номер у него больше.
    const actions = [deploy(1, 'A', 'ranger', 'north'), deploy(2, 'A', 'tank', 'short')];
    const result = run(actions, 225);
    const walls = result.finalState.citadels.find((citadel) => citadel.side === 'B');
    const tank = result.finalState.units.find((unit) => unit.kind === 'tank');
    const ranger = result.finalState.units.find((unit) => unit.kind === 'ranger');

    expect(tank?.state).toBe('sieging');
    expect(ranger?.state).toBe('sieging');
    expect(walls?.target).toBe(tank?.id);
  });

  it('первым бьёт того, кто подошёл раньше, — он и щит', () => {
    // Танк выходит первым и первым встаёт у стен; Разведчик за ним
    // остаётся целым, пока Танк жив.
    const result = run([deploy(1, 'A', 'tank'), deploy(80, 'A', 'scout')], 260);
    const tank = result.finalState.units.find((unit) => unit.kind === 'tank');
    const scout = result.finalState.units.find((unit) => unit.kind === 'scout');

    expect(tank?.hp).toBeLessThan(tank?.maxHp ?? 0);
    expect(scout?.hp).toBe(scout?.maxHp);
  });

  it('сообщает, кого бьёт: правило должно быть видно игроку', () => {
    const result = run([deploy(1, 'A')], 110);
    const walls = result.finalState.citadels.find((citadel) => citadel.side === 'B');
    const besieger = result.finalState.units[0];

    expect(walls?.target).toBe(besieger?.id);
  });

  it('когда бить некого, цели нет — и прежняя цель сбрасывается', () => {
    // Одинокого Разведчика стены добивают; после этого целиться не в кого.
    const killed = run([deploy(1, 'A')], 400);
    const walls = killed.finalState.citadels.find((citadel) => citadel.side === 'B');

    expect(killed.finalState.units).toEqual([]);
    expect(walls?.target).toBeNull();
  });

  it('два прогона обороны совпадают полностью', () => {
    const actions = [deploy(1, 'A', 'tank'), deploy(2, 'A', 'ranger'), deploy(40, 'A', 'scout')];

    expect(run(actions)).toEqual(run(actions));
  });
});
