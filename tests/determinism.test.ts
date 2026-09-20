import { describe, it, expect } from 'vitest';
import { runMatch } from '@sim/index';
import { matchSetup } from './match-setup.js';

const match = (seed: number) => matchSetup({ seed, maxTicks: 250 });

describe('воспроизводимость матча', () => {
  it('два прогона с одним Сидом дают идентичный результат', () => {
    expect(runMatch(match(2024))).toEqual(runMatch(match(2024)));
  });

  it('журналы двух прогонов с одним Сидом совпадают событие в событие', () => {
    const first = runMatch(match(11));
    const second = runMatch(match(11));

    expect(first.events).toEqual(second.events);
    expect(first.finalState).toEqual(second.finalState);
  });

  it('Сид попадает в журнал, чтобы к матчу можно было вернуться', () => {
    const result = runMatch(match(31337));
    const started = result.events.find((event) => event.kind === 'match-started');

    expect(started).toEqual({ kind: 'match-started', tick: 0, seed: 31337 });
  });

  it('сохраняет порядок Сторон таким, каким его задали', () => {
    const result = runMatch(match(5));

    expect(result.finalState.sides).toEqual(['A', 'B']);
  });
});
