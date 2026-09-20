import { describe, it, expect } from 'vitest';
import { runMatch } from '@sim/index';
import { matchSetup } from './match-setup.js';

describe('матч без Юнитов', () => {
  it('доходит до лимита Тиков и завершается ничьей', () => {
    const result = runMatch(matchSetup({ maxTicks: 100 }));

    expect(result.winner).toBeNull();
    expect(result.ticks).toBe(100);
  });

  it('называет причиной окончания исчерпание лимита Тиков', () => {
    const result = runMatch(matchSetup({ maxTicks: 40 }));

    expect(result.endReason).toBe('tick-limit');
  });

  it('записывает в журнал начало матча с его Сидом и конец с номером последнего Тика', () => {
    const result = runMatch(matchSetup({ seed: 777, maxTicks: 40 }));

    expect(result.events).toEqual([
      { kind: 'match-started', tick: 0, seed: 777 },
      { kind: 'match-ended', tick: 40, reason: 'tick-limit' },
    ]);
  });

  it('не идёт дальше лимита Тиков даже при лимите в ноль', () => {
    const result = runMatch(matchSetup({ maxTicks: 0 }));

    expect(result.ticks).toBe(0);
    expect(result.finalState.tick).toBe(0);
  });
});
