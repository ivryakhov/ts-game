import {
  conditionsOf,
  FileError,
  parseRules,
  UNIT_KINDS,
  type Action,
  type Behaviour,
  type Condition,
  type Rule,
  type UnitKind,
} from '@sim/index';

/**
 * Черновик Поведения — то, что игрок правит на Подготовке. Это ещё не
 * Поведение: число в нём может быть негодным, пока игрок его набирает.
 * В матч черновик уходит только через тот же разбор, что и файл Стороны,
 * поэтому всё, что здесь допущено, разбор всё равно отсеет.
 *
 * Правки — чистые функции: список Правил на входе, новый список на выходе.
 * Структурных ошибок они не допускают: последнее Правило всегда «иначе»,
 * Условий в строке от одного до трёх.
 */

/** Условие черновика: числа ещё не проверены и могут быть чем угодно. */
export type DraftCondition = { readonly kind: Condition['kind'] } & Readonly<Record<string, unknown>>;

export interface DraftRule {
  /** Одно Условие или «И». У последнего Правила — ровно `always`. */
  readonly when: readonly DraftCondition[];
  readonly do: Action;
}

export type DraftRules = readonly DraftRule[];
export type Draft = Readonly<Record<UnitKind, DraftRules>>;

/** Сколько Условий в строке: «+ и» пропадает на трёх (ADR-0005). */
export const MAX_CONDITIONS = 3;

/** Ошибка разбора, привязанная к месту в списке Правил. */
export interface DraftError {
  readonly rule: number;
  /** Номер Условия в строке; у ошибки Действия — null. */
  readonly condition: number | null;
  readonly what: string;
}

export function draftFromBehaviour(behaviour: Behaviour): Draft {
  const draft: Partial<Record<UnitKind, DraftRules>> = {};
  for (const kind of UNIT_KINDS) draft[kind] = draftRules(behaviour[kind]);
  return draft as Draft;
}

export function draftRules(rules: readonly Rule[]): DraftRules {
  return rules.map((rule) => ({ when: conditionsOf(rule).map((condition) => ({ ...condition })), do: rule.do }));
}

/** Список Правил в том виде, в каком его пишут в файл: одно Условие — без массива. */
export function rawRules(rules: DraftRules): unknown[] {
  return rules.map((rule) => ({ when: rule.when.length === 1 ? rule.when[0] : rule.when, do: rule.do }));
}

export function rawBehaviour(draft: Draft): Record<UnitKind, unknown[]> {
  const raw: Partial<Record<UnitKind, unknown[]>> = {};
  for (const kind of UNIT_KINDS) raw[kind] = rawRules(draft[kind]);
  return raw as Record<UnitKind, unknown[]>;
}

/** Место ошибки разбора — `scout[1].when[0].count` — как номер строки и Условия. */
const PLACE = /^[^[]+\[(\d+)\]\.(when|do)(?:\[(\d+)\])?/;

/** Первая ошибка разбора в списке Правил одного типа или null, если их нет. */
export function checkRules(rules: DraftRules): DraftError | null {
  try {
    parseRules(rawRules(rules), 'черновик');
    return null;
  } catch (error) {
    if (!(error instanceof FileError)) throw error;
    const place = PLACE.exec(error.where);
    return {
      rule: Number(place?.[1] ?? 0),
      condition: place?.[2] === 'when' ? Number(place[3] ?? 0) : null,
      what: error.what,
    };
  }
}

/** Условие, только что выбранное в списке, — с числом по умолчанию. */
export function freshCondition(kind: Condition['kind'], compare: 'fewer' | 'more' = 'fewer'): DraftCondition {
  switch (kind) {
    case 'hp-below':
      return { kind, percent: 30 };
    case 'allies-nearby':
      return { kind, compare, count: 2 };
    case 'enemies-in-skirmish':
      return { kind, above: 2 };
    case 'enemy-closer-than':
      return { kind, distance: 60 };
    case 'enemy-kind-in-range':
      return { kind, unit: UNIT_KINDS[0] ?? 'scout' };
    default:
      return { kind };
  }
}

/** Действие, только что выбранное в списке. «Бить тип» начинает с первого типа. */
export function freshAction(kind: Action['kind']): Action {
  return kind === 'attack-kind' ? { kind, unit: UNIT_KINDS[0] ?? 'scout' } : ({ kind } as Action);
}

const replaceAt = <T>(list: readonly T[], index: number, item: T): T[] =>
  list.map((existing, at) => (at === index ? item : existing));

/** Последнее Правило — «иначе»: его не двигают и не удаляют. */
const isLast = (rules: DraftRules, index: number): boolean => index >= rules.length - 1;

/** Новое Правило встаёт над «иначе». */
export function addRule(rules: DraftRules): DraftRules {
  const fresh: DraftRule = { when: [freshCondition('enemy-in-range')], do: freshAction('attack-nearest') };
  return [...rules.slice(0, -1), fresh, ...rules.slice(-1)];
}

export function removeRule(rules: DraftRules, index: number): DraftRules {
  return isLast(rules, index) ? rules : rules.filter((_, at) => at !== index);
}

/** Сдвиг на одну строку вверх (-1) или вниз (+1), не задевая «иначе». */
export function moveRule(rules: DraftRules, index: number, step: -1 | 1): DraftRules {
  const target = index + step;
  if (isLast(rules, index) || target < 0 || isLast(rules, target)) return rules;
  const moved = [...rules];
  [moved[index], moved[target]] = [moved[target] as DraftRule, moved[index] as DraftRule];
  return moved;
}

export function canMove(rules: DraftRules, index: number, step: -1 | 1): boolean {
  return moveRule(rules, index, step) !== rules;
}

/**
 * «И» возможно, пока Условий меньше трёх и среди них нет «всегда»: оно
 * в «И» не входит (ADR-0005), а безусловное Правило выше «иначе» файл
 * Стороны допускает и редактор показывает как есть.
 */
export function canAddCondition(rule: DraftRule): boolean {
  return rule.when.length < MAX_CONDITIONS && !rule.when.some((condition) => condition.kind === 'always');
}

/** «+ и»: ещё одно Условие — первое из тех, что в строке ещё нет. */
export function addCondition(rules: DraftRules, index: number, kinds: readonly Condition['kind'][]): DraftRules {
  const rule = rules[index];
  if (!rule || isLast(rules, index) || !canAddCondition(rule)) return rules;
  const used = new Set(rule.when.map((condition) => condition.kind));
  const kind = kinds.find((candidate) => !used.has(candidate)) ?? kinds[0] ?? 'enemy-in-range';
  return replaceAt(rules, index, { ...rule, when: [...rule.when, freshCondition(kind)] });
}

export function removeCondition(rules: DraftRules, index: number, condition: number): DraftRules {
  const rule = rules[index];
  if (!rule || rule.when.length <= 1) return rules;
  return replaceAt(rules, index, { ...rule, when: rule.when.filter((_, at) => at !== condition) });
}

export function setCondition(rules: DraftRules, index: number, at: number, condition: DraftCondition): DraftRules {
  const rule = rules[index];
  if (!rule || isLast(rules, index)) return rules;
  return replaceAt(rules, index, { ...rule, when: replaceAt(rule.when, at, condition) });
}

export function setAction(rules: DraftRules, index: number, action: Action): DraftRules {
  const rule = rules[index];
  return rule ? replaceAt(rules, index, { ...rule, do: action }) : rules;
}
