import { conditionsOf, isFallback, UNIT_KINDS, type Condition } from '@sim/index';
import { LIMITS, type Candidate } from '../src/evolve/candidate.js';

function numbersWithinLimits(condition: Condition): boolean {
  switch (condition.kind) {
    case 'hp-below':
      return condition.percent % LIMITS.percentStep === 0 && condition.percent >= 5 && condition.percent <= 100;
    case 'allies-nearby':
      return condition.count >= 0 && condition.count <= LIMITS.count;
    case 'enemies-in-skirmish':
      return condition.above >= 0 && condition.above <= LIMITS.count;
    default:
      return true;
  }
}

/** Держит ли Претендент пределы спеки 0004: Правил, Условий, чисел, Волн. */
export function withinLimits(candidate: Candidate): boolean {
  const rulesOk = UNIT_KINDS.every((kind) => {
    const rules = candidate.behaviour[kind];
    const last = rules[rules.length - 1];
    return (
      rules.length >= LIMITS.rules.min &&
      rules.length <= LIMITS.rules.max &&
      last !== undefined &&
      isFallback(last) &&
      rules.every((rule) => {
        const conditions = conditionsOf(rule);
        return conditions.length <= LIMITS.conditions.max && conditions.every(numbersWithinLimits);
      })
    );
  });
  const wavesOk =
    candidate.waves.length >= LIMITS.waves.min &&
    candidate.waves.length <= LIMITS.waves.max &&
    candidate.waves.every((wave) => wave.units.length >= LIMITS.waveUnits.min && wave.units.length <= LIMITS.waveUnits.max);
  return rulesOk && wavesOk;
}
