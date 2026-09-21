import { describe, it, expect } from 'vitest';
import { runMatch } from '@sim/index';
import type { ScheduledRelease } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Негодное расписание обязано отвергаться при создании матча, а не ронять
 * его посреди Тика: в браузере бросок из середины симуляции навсегда
 * останавливает цикл кадров, и экран замирает без объяснений.
 */
const withActions = (actions: readonly ScheduledRelease[]) => () =>
  runMatch(matchSetup({ map: arena, releases: actions, maxTicks: 100 }));

describe('матч отвергает негодное расписание на входе', () => {
  it('когда Дороги нет на карте', () => {
    expect(withActions([{ tick: 1, side: 'A', kind: 'deploy', roadId: 'tunnel', unit: 'scout' }])).toThrow(
      /Дороги tunnel нет на карте/,
    );
  });

  it('когда действие назначено за пределами матча', () => {
    expect(withActions([{ tick: 500, side: 'A', kind: 'deploy', roadId: 'short', unit: 'scout' }])).toThrow(
      /вне отрезка матча/,
    );
  });

  it('когда действие назначено на нулевой Тик, которого не бывает', () => {
    expect(withActions([{ tick: 0, side: 'A', kind: 'deploy', roadId: 'short', unit: 'scout' }])).toThrow(
      /вне отрезка матча/,
    );
  });

  it('и падает до первого Тика, а не в середине матча', () => {
    expect(withActions([{ tick: 1, side: 'A', kind: 'deploy', roadId: 'tunnel', unit: 'scout' }])).toThrow(
      /Выпуск на Тике 1/,
    );
  });
});
