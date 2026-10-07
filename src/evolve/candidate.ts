import {
  UNIT_KINDS,
  type Action,
  type Behaviour,
  type JointCondition,
  type Rng,
  type Rule,
  type UnitKind,
  type Wave,
} from '@sim/index';

/**
 * Претендент — кандидат эволюции: Правила трёх типов Юнитов и Волны,
 * то есть Противник без имени (ADR-0008). Рождается только из словаря
 * Правил, поэтому файл Противника из него всегда проходит разбор;
 * разбор остаётся страховкой, а не фильтром.
 *
 * Вся случайность — из генератора по Сиду эволюции (ADR-0001): тот же
 * Сид даёт тех же Претендентов.
 */
export interface Candidate {
  readonly behaviour: Behaviour;
  readonly waves: readonly Wave[];
}

/** Пределы Претендента — таблица спеки 0004. */
export const LIMITS = {
  /** Правил на тип, считая последнее «всегда». */
  rules: { min: 2, max: 8 },
  /** Условий в одном Правиле (ADR-0005). */
  conditions: { min: 1, max: 3 },
  waves: { min: 1, max: 5 },
  waveUnits: { min: 1, max: 6 },
  /** Порог здоровья — сеткой с этим шагом, от шага до 100. */
  percentStep: 5,
  /** Наибольший счёт своих и врагов: у Цитадели помещается восемь тел (ADR-0005). */
  count: 8,
} as const;

/** Первое Поколение скромнее пределов: длинные списки пусть вырастит эволюция. */
const FIRST = { rules: 4, waves: 3, waveUnits: 4 } as const;

/** Условия, которые могут стоять в «И», — без чисел и с ними. */
export const JOINT_KINDS = [
  'hp-below',
  'enemy-in-range',
  'enemy-kind-in-range',
  'at-home',
  'allies-nearby',
  'enemies-in-skirmish',
  'enemy-ahead',
  'enemy-citadel-in-range',
  'enemy-at-home',
  'obelisk-in-range',
] as const satisfies readonly JointCondition['kind'][];

const ACTIONS = [
  'advance',
  'retreat',
  'hold',
  'attack-nearest',
  'attack-weakest',
  'attack-most-dangerous',
  'attack-kind',
  'siege-obelisk',
] as const satisfies readonly Action['kind'][];

/** Целое в отрезке [min, max]. */
export const between = (rng: Rng, min: number, max: number): number => min + rng.nextInt(max - min + 1);

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.nextInt(items.length)];
  if (item === undefined) throw new Error('Выбор из пустого списка');
  return item;
}

export const unitKind = (rng: Rng): UnitKind => pick(rng, UNIT_KINDS);

/** Порог здоровья на сетке: 5, 10, … 100. */
export const randomPercent = (rng: Rng): number => between(rng, 1, 100 / LIMITS.percentStep) * LIMITS.percentStep;

export function randomCondition(rng: Rng, kind: JointCondition['kind'] = pick(rng, JOINT_KINDS)): JointCondition {
  switch (kind) {
    case 'hp-below':
      return { kind, percent: randomPercent(rng) };
    case 'enemy-kind-in-range':
      return { kind, unit: unitKind(rng) };
    case 'allies-nearby': {
      const base = { kind, compare: rng.nextInt(2) === 0 ? 'fewer' : 'more', count: between(rng, 0, LIMITS.count) } as const;
      return rng.nextInt(2) === 0 ? base : { ...base, unit: unitKind(rng) };
    }
    case 'enemies-in-skirmish':
      return { kind, above: between(rng, 0, LIMITS.count) };
    default:
      return { kind };
  }
}

export function randomAction(rng: Rng): Action {
  const kind = pick(rng, ACTIONS);
  return kind === 'attack-kind' ? { kind, unit: unitKind(rng) } : { kind };
}

/**
 * Условия Правила: одно — чаще всего, «И» из двух или трёх — реже.
 * В «И» Условия разных видов: два «здоровье ниже» подряд ничего не
 * добавляют к одному.
 */
export function randomWhen(rng: Rng, size = pick(rng, [1, 1, 1, 2, 2, 3])): Rule['when'] {
  const kinds = [...JOINT_KINDS];
  const chosen: JointCondition[] = [];
  for (let i = 0; i < size; i += 1) {
    const kind = kinds.splice(rng.nextInt(kinds.length), 1)[0];
    if (kind) chosen.push(randomCondition(rng, kind));
  }
  const [only] = chosen;
  return chosen.length === 1 && only ? only : chosen;
}

export const randomRule = (rng: Rng): Rule => ({ when: randomWhen(rng), do: randomAction(rng) });

/** Последнее Правило типа: срабатывает всегда (ADR-0005). */
export const fallback = (action: Action): Rule => ({ when: { kind: 'always' }, do: action });

function randomRules(rng: Rng): Rule[] {
  const count = between(rng, LIMITS.rules.min, FIRST.rules);
  const rules = Array.from({ length: count - 1 }, () => randomRule(rng));
  return [...rules, fallback(randomAction(rng))];
}

export function randomWave(rng: Rng, roads: readonly string[], most: number = LIMITS.waveUnits.max): Wave {
  const size = between(rng, LIMITS.waveUnits.min, most);
  return { road: pick(rng, roads), units: Array.from({ length: size }, () => unitKind(rng)) };
}

/** Случайный Претендент первого Поколения. `roads` — Дороги карты. */
export function randomCandidate(rng: Rng, roads: readonly string[]): Candidate {
  const behaviour: Record<UnitKind, Rule[]> = { scout: [], tank: [], ranger: [] };
  for (const kind of UNIT_KINDS) behaviour[kind] = randomRules(rng);
  const waves = Array.from({ length: between(rng, LIMITS.waves.min, FIRST.waves) }, () =>
    randomWave(rng, roads, FIRST.waveUnits),
  );
  return { behaviour, waves };
}

/** Претендент файлом Противника — тем, что читает `opponentFromFile`. */
export function candidateFile(candidate: Candidate, name: string, description: string): Record<string, unknown> {
  return { name, description, ...candidate.behaviour, waves: candidate.waves };
}

/** Сколько всего Правил у Претендента — короче значит читаемее. */
export const ruleCount = (candidate: Candidate): number =>
  UNIT_KINDS.reduce((sum, kind) => sum + candidate.behaviour[kind].length, 0);
