import { describe, it, expect } from 'vitest';
import { createMatch, ECONOMY, runMatch, TICKS_PER_SECOND } from '@sim/index';
import type { MatchResult, ScheduledRelease, SideId, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

const deploy = (
  tick: number,
  side: SideId = 'A',
  roadId = 'short',
  unit: UnitKind = 'scout',
): ScheduledRelease => ({ tick, side, kind: 'deploy', roadId, unit });

const run = (actions: readonly ScheduledRelease[], maxTicks = 400): MatchResult =>
  runMatch(matchSetup({ map: arena, releases: actions, maxTicks }));

const etherOf = (result: MatchResult, side: SideId = 'A') =>
  result.finalState.ether.find((purse) => purse.side === side)?.amount ?? 0;

const deployed = (result: MatchResult) =>
  result.events.filter((event) => event.kind === 'unit-deployed').length;

const refused = (result: MatchResult) =>
  result.events.filter((event) => event.kind === 'deploy-refused');

describe('Эфир', () => {
  it('начисляется сам по себе', () => {
    const start = run([], 1).finalState.ether[0]?.amount ?? 0;
    const later = etherOf(run([], 1 + TICKS_PER_SECOND * 10));

    expect(later).toBeGreaterThan(start);
  });

  it('копится ровно по объявленному доходу в секунду', () => {
    const seconds = 8;
    const start = run([], 0).finalState.ether[0]?.amount ?? 0;
    const grown = etherOf(run([], TICKS_PER_SECOND * seconds)) - start;
    const income = run([], 0).finalState.ether[0]?.incomePerSecond ?? 0;

    expect(income).toBeGreaterThan(0);
    expect(grown).toBeCloseTo(income * seconds, 5);
  });

  it('у Сторон свой запас: трата одной не касается другой', () => {
    const result = run([deploy(5, 'A')], 10);

    expect(etherOf(result, 'A')).toBeLessThan(etherOf(result, 'B'));
  });
});

describe('покупка Юнита', () => {
  it('списывает цену', () => {
    const idle = etherOf(run([], 10));
    const spent = etherOf(run([deploy(5)], 10));

    expect(idle - spent).toBeGreaterThan(0);
  });

  it('при нехватке Эфира не создаёт Юнита и не списывает Эфир', () => {
    // Разом заказываем заведомо больше, чем можно оплатить стартовым запасом.
    const greedy = Array.from({ length: 40 }, (_, index) => deploy(1 + index));
    const result = run(greedy, 60);

    expect(deployed(result)).toBeLessThan(40);
    expect(etherOf(result)).toBeGreaterThanOrEqual(0);
  });

  it('при отказе не трогает кошелёк: с него уходит только за купленных', () => {
    // Мутация «отказ обнуляет кошелёк» проходила все проверки: ни одна
    // не сравнивала запас до и после неудачной покупки.
    const greedy = Array.from({ length: 10 }, () => deploy(1));
    const idle = etherOf(run([], 1));
    const result = run(greedy, 1);

    expect(refused(result).length).toBeGreaterThan(0);
    expect(etherOf(result)).toBeCloseTo(idle - deployed(result) * 20, 5);
  });

  it('объясняет отказ, а не молчит', () => {
    const greedy = Array.from({ length: 40 }, (_, index) => deploy(1 + index));
    const result = run(greedy, 60);

    expect(refused(result).length).toBeGreaterThan(0);
    const first = refused(result)[0];
    expect(first && 'reason' in first ? first.reason : null).toBe('not-enough-ether');
  });

  it('накопив, снова позволяет купить', () => {
    const early = run(Array.from({ length: 40 }, (_, index) => deploy(1 + index)), 60);
    const late = run(Array.from({ length: 40 }, (_, index) => deploy(1 + index * 30)), 1300);

    expect(deployed(late)).toBeGreaterThan(deployed(early));
  });
});

describe('порядок внутри Тика', () => {
  it('доход приходит раньше трат: купить можно на Эфир этого же Тика', () => {
    // Стартового запаса хватает ровно на пять Юнитов. Шестого можно
    // оплатить только если доход Тика уже зачислен к моменту покупки.
    const exactlyAffordable = 5 * 20;
    const start = run([], 0).finalState.ether[0]?.amount ?? 0;
    expect(start).toBe(exactlyAffordable);

    const sixth = Math.ceil(20 / (ECONOMY.incomePerSecond / TICKS_PER_SECOND));
    const result = run(
      [...Array.from({ length: 5 }, (_, index) => deploy(1 + index)), deploy(sixth)],
      sixth + 1,
    );

    expect(deployed(result)).toBe(6);
  });

  it('стартовый запас именно такой, каким объявлен', () => {
    expect(run([], 0).finalState.ether[0]?.amount).toBe(100);
  });
});

describe('выпуск Юнита по ходу матча', () => {
  it('исполняется на следующем Тике, а не в тот же миг', () => {
    const match = createMatch(matchSetup({ map: arena, maxTicks: 50 }));
    match.step();
    match.deploy({ side: 'A', kind: 'deploy', roadId: 'short', unit: 'scout' });

    expect(match.snapshot().units).toHaveLength(0);
    match.step();
    expect(match.snapshot().units).toHaveLength(1);
  });

  it('выбор, сделанный на паузе, срабатывает при первом же Тике', () => {
    const match = createMatch(matchSetup({ map: arena, maxTicks: 50 }));
    match.deploy({ side: 'A', kind: 'deploy', roadId: 'short', unit: 'scout' });
    match.deploy({ side: 'A', kind: 'deploy', roadId: 'north', unit: 'scout' });

    match.step();

    expect(match.snapshot().units).toHaveLength(2);
  });

  it('отвергает несуществующую Дорогу сразу, а не посреди Тика', () => {
    const match = createMatch(matchSetup({ map: arena, maxTicks: 50 }));

    expect(() => match.deploy({ side: 'A', kind: 'deploy', roadId: 'tunnel', unit: 'scout' })).toThrow(
      /Дороги tunnel нет на карте/,
    );
  });

  it('попадает в журнал с номером Тика — матч остаётся воспроизводимым', () => {
    const match = createMatch(matchSetup({ map: arena, maxTicks: 50 }));
    match.step();
    match.deploy({ side: 'A', kind: 'deploy', roadId: 'short', unit: 'scout' });
    const events = match.step();

    const order = events.find((event) => event.kind === 'unit-deployed');
    expect(order && 'tick' in order ? order.tick : null).toBe(2);
  });
});
