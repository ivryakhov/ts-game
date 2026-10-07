import { conditionsOf, UNIT_KINDS, type JointCondition, type Rng, type Rule, type UnitKind, type Wave } from '@sim/index';
import {
  between,
  fallback,
  JOINT_KINDS,
  LIMITS,
  pick,
  randomAction,
  randomCondition,
  randomRule,
  randomWave,
  unitKind,
  type Candidate,
} from './candidate.js';

/**
 * Мутации Претендента — список спеки 0004. Каждая держит пределы
 * Претендента, поэтому мутант всегда проходит разбор файла Противника.
 * Мутация, которой не к чему приложиться (убрать Условие из Правила
 * с одним Условием), возвращает null, и выбирается другая.
 */

type Rules = readonly Rule[];
type Mutation = (rng: Rng, candidate: Candidate, roads: readonly string[]) => Candidate | null;

/** Номер случайного Правила, кроме последнего «всегда»; null — таких нет. */
const ruleIndex = (rng: Rng, rules: Rules): number | null => (rules.length > 1 ? rng.nextInt(rules.length - 1) : null);

const withRules = (candidate: Candidate, kind: UnitKind, rules: Rules): Candidate => ({
  ...candidate,
  behaviour: { ...candidate.behaviour, [kind]: rules },
});

const replaced = <T>(items: readonly T[], index: number, item: T): T[] => items.map((old, at) => (at === index ? item : old));

/** Условия списком — обратно в Правило: одно пишется без массива (ADR-0005). */
function ruleOf(conditions: readonly JointCondition[], action: Rule['do']): Rule {
  const [only] = conditions;
  return { when: conditions.length === 1 && only ? only : conditions, do: action };
}

/** Мутация одного Правила случайного типа: `change` получает Условия и Действие. */
function onRule(
  change: (rng: Rng, conditions: readonly JointCondition[], rule: Rule) => Rule | null,
): Mutation {
  return (rng, candidate) => {
    const kind = unitKind(rng);
    const rules = candidate.behaviour[kind];
    const index = ruleIndex(rng, rules);
    const rule = index === null ? undefined : rules[index];
    if (index === null || !rule) return null;
    const next = change(rng, conditionsOf(rule) as readonly JointCondition[], rule);
    return next ? withRules(candidate, kind, replaced(rules, index, next)) : null;
  };
}

/** Вид Условия, которого ещё нет в Правиле: два одинаковых в «И» ничего не добавляют. */
const freshKind = (rng: Rng, conditions: readonly JointCondition[]): JointCondition['kind'] =>
  pick(rng, JOINT_KINDS.filter((kind) => !conditions.some((condition) => condition.kind === kind)));

/** Сдвиг числа на шаг сетки, в пределах. */
function nudged(rng: Rng, condition: JointCondition): JointCondition | null {
  const step = rng.nextInt(2) === 0 ? -1 : 1;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  switch (condition.kind) {
    case 'hp-below':
      return { ...condition, percent: clamp(condition.percent + step * LIMITS.percentStep, LIMITS.percentStep, 100) };
    case 'allies-nearby':
      return { ...condition, count: clamp(condition.count + step, 0, LIMITS.count) };
    case 'enemies-in-skirmish':
      return { ...condition, above: clamp(condition.above + step, 0, LIMITS.count) };
    default:
      return null;
  }
}

const RULE_MUTATIONS: readonly Mutation[] = [
  // Заменить Условие на другое.
  onRule((rng, conditions, rule) => {
    const index = rng.nextInt(conditions.length);
    const others = conditions.filter((_, at) => at !== index);
    return ruleOf(replaced(conditions, index, randomCondition(rng, freshKind(rng, others))), rule.do);
  }),
  // Добавить Условие в «И».
  onRule((rng, conditions, rule) =>
    conditions.length < LIMITS.conditions.max
      ? ruleOf([...conditions, randomCondition(rng, freshKind(rng, conditions))], rule.do)
      : null,
  ),
  // Убрать Условие из «И».
  onRule((rng, conditions, rule) => {
    if (conditions.length <= LIMITS.conditions.min) return null;
    const index = rng.nextInt(conditions.length);
    return ruleOf(
      conditions.filter((_, at) => at !== index),
      rule.do,
    );
  }),
  // Сдвинуть число на шаг сетки.
  onRule((rng, conditions, rule) => {
    const numeric = conditions.map((condition, at) => ({ at, next: nudged(rng, condition) })).filter((entry) => entry.next);
    if (numeric.length === 0) return null;
    const { at, next } = pick(rng, numeric);
    return next ? ruleOf(replaced(conditions, at, next), rule.do) : null;
  }),
  // Сменить Действие.
  onRule((rng, _conditions, rule) => ({ ...rule, do: randomAction(rng) })),
  // Сменить Действие последнего Правила.
  (rng, candidate) => {
    const kind = unitKind(rng);
    const rules = candidate.behaviour[kind];
    return withRules(candidate, kind, replaced(rules, rules.length - 1, fallback(randomAction(rng))));
  },
  // Вставить Правило.
  (rng, candidate) => {
    const kind = unitKind(rng);
    const rules = candidate.behaviour[kind];
    if (rules.length >= LIMITS.rules.max) return null;
    const at = rng.nextInt(rules.length);
    return withRules(candidate, kind, [...rules.slice(0, at), randomRule(rng), ...rules.slice(at)]);
  },
  // Удалить Правило.
  (rng, candidate) => {
    const kind = unitKind(rng);
    const rules = candidate.behaviour[kind];
    const index = ruleIndex(rng, rules);
    if (index === null || rules.length <= LIMITS.rules.min) return null;
    return withRules(
      candidate,
      kind,
      rules.filter((_, at) => at !== index),
    );
  },
  // Поменять два Правила местами: срабатывает первое истинное, порядок — смысл.
  (rng, candidate) => {
    const kind = unitKind(rng);
    const rules = candidate.behaviour[kind];
    const movable = rules.length - 1;
    if (movable < 2) return null;
    const a = rng.nextInt(movable);
    const b = (a + 1 + rng.nextInt(movable - 1)) % movable;
    const next = [...rules];
    [next[a], next[b]] = [rules[b] as Rule, rules[a] as Rule];
    return withRules(candidate, kind, next);
  },
];

const withWaves = (candidate: Candidate, waves: readonly Wave[]): Candidate => ({ ...candidate, waves });

/** Мутация одной случайной Волны. */
function onWave(change: (rng: Rng, wave: Wave, roads: readonly string[]) => Wave | null): Mutation {
  return (rng, candidate, roads) => {
    const index = rng.nextInt(candidate.waves.length);
    const wave = candidate.waves[index];
    const next = wave ? change(rng, wave, roads) : null;
    return next ? withWaves(candidate, replaced(candidate.waves, index, next)) : null;
  };
}

const WAVE_MUTATIONS: readonly Mutation[] = [
  // Сменить Дорогу.
  onWave((rng, wave, roads) => {
    const others = roads.filter((road) => road !== wave.road);
    return others.length > 0 ? { ...wave, road: pick(rng, others) } : null;
  }),
  // Добавить Юнита.
  onWave((rng, wave) => {
    if (wave.units.length >= LIMITS.waveUnits.max) return null;
    const at = rng.nextInt(wave.units.length + 1);
    return { ...wave, units: [...wave.units.slice(0, at), unitKind(rng), ...wave.units.slice(at)] };
  }),
  // Убрать Юнита.
  onWave((rng, wave) => {
    if (wave.units.length <= LIMITS.waveUnits.min) return null;
    const index = rng.nextInt(wave.units.length);
    return { ...wave, units: wave.units.filter((_, at) => at !== index) };
  }),
  // Заменить Юнита.
  onWave((rng, wave) => ({ ...wave, units: replaced(wave.units, rng.nextInt(wave.units.length), unitKind(rng)) })),
  // Вставить Волну.
  (rng, candidate, roads) => {
    if (candidate.waves.length >= LIMITS.waves.max) return null;
    const at = rng.nextInt(candidate.waves.length + 1);
    return withWaves(candidate, [...candidate.waves.slice(0, at), randomWave(rng, roads), ...candidate.waves.slice(at)]);
  },
  // Удалить Волну.
  (rng, candidate) => {
    if (candidate.waves.length <= LIMITS.waves.min) return null;
    const index = rng.nextInt(candidate.waves.length);
    return withWaves(
      candidate,
      candidate.waves.filter((_, at) => at !== index),
    );
  },
  // Переставить две Волны.
  (rng, candidate) => {
    const count = candidate.waves.length;
    if (count < 2) return null;
    const a = rng.nextInt(count);
    const b = (a + 1 + rng.nextInt(count - 1)) % count;
    const next = [...candidate.waves];
    [next[a], next[b]] = [candidate.waves[b] as Wave, candidate.waves[a] as Wave];
    return withWaves(candidate, next);
  },
];

/** Вид мутации выбирается поровну из всех; у Правил видов больше, чем у Волн, — их и больше в Претенденте. */
const MUTATIONS: readonly Mutation[] = [...RULE_MUTATIONS, ...WAVE_MUTATIONS];

/** Одна случайная мутация. Неприложимые пропускаются; смена последнего Действия приложима всегда. */
export function mutate(rng: Rng, candidate: Candidate, roads: readonly string[]): Candidate {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const next = pick(rng, MUTATIONS)(rng, candidate, roads);
    if (next) return next;
  }
  const kind = pick(rng, UNIT_KINDS);
  const rules = candidate.behaviour[kind];
  return withRules(candidate, kind, replaced(rules, rules.length - 1, fallback(randomAction(rng))));
}

/** Сколько мутаций получает ребёнок: от одной до трёх (спека 0004). */
export function mutateSome(rng: Rng, candidate: Candidate, roads: readonly string[]): Candidate {
  let next = candidate;
  for (let times = between(rng, 1, 3); times > 0; times -= 1) next = mutate(rng, next, roads);
  return next;
}
