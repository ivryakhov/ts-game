import { UNIT_KINDS, type UnitKind } from './balance.js';
import { filePart, isRecord } from './parse.js';
import {
  ACTION_KINDS,
  CONDITION_KINDS,
  isFallback,
  MAX_JOINT_CONDITIONS,
  MIN_JOINT_CONDITIONS,
  type Action,
  type Behaviour,
  type Condition,
  type Rule,
} from './rules.js';

/**
 * Разбор Правил из того, что прочитано из JSON: файл Стороны, Заготовки
 * и черновик редактора проходят через одни и те же функции. Любая
 * неточность отвергается с местом ошибки.
 */

const { fail, onlyKeys } = filePart('Поведение');

function parsePercent(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw fail(where, `ожидалось число от 0 до 100, а не ${String(value)}`);
  }
  return value;
}

function parseCount(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw fail(where, `ожидалось целое неотрицательное число, а не ${String(value)}`);
  }
  return value;
}

function parseUnit(value: unknown, where: string): UnitKind {
  if (typeof value !== 'string' || !(UNIT_KINDS as readonly string[]).includes(value)) {
    throw fail(where, `неизвестный тип «${String(value)}»; есть: ${UNIT_KINDS.join(', ')}`);
  }
  return value as UnitKind;
}

function parseCondition(raw: unknown, where: string): Condition {
  if (!isRecord(raw)) throw fail(where, 'ожидалось Условие-объект');
  const kind = raw['kind'];

  switch (kind) {
    case 'always':
    case 'enemy-in-range':
    case 'enemy-ahead':
    case 'enemy-citadel-in-range':
    case 'at-home':
    case 'enemy-at-home':
    case 'obelisk-in-range':
      onlyKeys(raw, ['kind'], where);
      return { kind };
    case 'enemy-kind-in-range':
      onlyKeys(raw, ['kind', 'unit'], where);
      return { kind, unit: parseUnit(raw['unit'], `${where}.unit`) };
    case 'allies-nearby': {
      onlyKeys(raw, ['kind', 'compare', 'count', 'unit'], where);
      const compare = raw['compare'];
      if (compare !== 'fewer' && compare !== 'more') {
        throw fail(`${where}.compare`, `ожидалось «fewer» или «more», а не ${String(compare)}`);
      }
      const count = parseCount(raw['count'], `${where}.count`);
      return raw['unit'] === undefined
        ? { kind, compare, count }
        : { kind, compare, count, unit: parseUnit(raw['unit'], `${where}.unit`) };
    }
    case 'enemies-in-skirmish':
      onlyKeys(raw, ['kind', 'above'], where);
      return { kind, above: parseCount(raw['above'], `${where}.above`) };
    case 'hp-below':
      onlyKeys(raw, ['kind', 'percent'], where);
      return { kind, percent: parsePercent(raw['percent'], `${where}.percent`) };
    case 'recovering':
      throw fail(
        where,
        'Условия recovering больше нет — пишите ' +
          '[{"kind":"at-home"},{"kind":"hp-below","percent":N}] (ADR-0005)',
      );
    default:
      throw fail(
        where,
        `неизвестное Условие «${String(kind)}»; есть: ${CONDITION_KINDS.join(', ')}`,
      );
  }
}

/** Одно Условие-объект или массив из двух-трёх Условий без «всегда». */
function parseWhen(raw: unknown, where: string): Rule['when'] {
  if (!Array.isArray(raw)) return parseCondition(raw, where);

  if (raw.length < MIN_JOINT_CONDITIONS || raw.length > MAX_JOINT_CONDITIONS) {
    throw fail(
      where,
      `в «И» от ${MIN_JOINT_CONDITIONS} до ${MAX_JOINT_CONDITIONS} Условий, а не ${raw.length}` +
        (raw.length === 1 ? ' — одно Условие пишется без массива' : ''),
    );
  }

  return raw.map((item: unknown, index) => {
    const at = `${where}[${index}]`;
    const condition = parseCondition(item, at);
    if (condition.kind === 'always') {
      throw fail(at, '«always» не входит в «И» — оно стоит только одно');
    }
    return condition;
  });
}

function parseAction(raw: unknown, where: string): Action {
  if (!isRecord(raw)) throw fail(where, 'ожидалось Действие-объект');
  const kind = raw['kind'];

  switch (kind) {
    case 'advance':
    case 'retreat':
    case 'hold':
    case 'attack-nearest':
    case 'attack-weakest':
    case 'attack-most-dangerous':
    case 'siege-obelisk':
      onlyKeys(raw, ['kind'], where);
      return { kind };
    case 'attack-kind':
      onlyKeys(raw, ['kind', 'unit'], where);
      return { kind, unit: parseUnit(raw['unit'], `${where}.unit`) };
    default:
      throw fail(
        where,
        `неизвестное Действие «${String(kind)}»; есть: ${ACTION_KINDS.join(', ')}`,
      );
  }
}

/**
 * Разбирает список Правил одного типа. `where` — имя списка в месте ошибки:
 * тип Юнита в файле Стороны, название Заготовки в файле Заготовок.
 */
export function parseRules(rules: unknown, where: string): readonly Rule[] {
  if (!Array.isArray(rules)) throw fail(where, 'нет списка Правил для этого типа');
  if (rules.length === 0) {
    throw fail(where, 'список Правил пуст — Юнит не знал бы, что делать');
  }

  const parsedRules = rules.map((rule: unknown, index) => {
    const at = `${where}[${index}]`;
    if (!isRecord(rule)) throw fail(at, 'ожидалось Правило-объект');
    onlyKeys(rule, ['when', 'do'], at);
    return {
      when: parseWhen(rule['when'], `${at}.when`),
      do: parseAction(rule['do'], `${at}.do`),
    };
  });

  // Последнее Правило обязано срабатывать всегда. Иначе Юнит, у которого
  // не сработало ни одно, делал бы что-то, чего нет в файле, — скрытое
  // правило, которого игрок не видит (ADR-0002).
  const last = parsedRules[parsedRules.length - 1];
  if (last === undefined || !isFallback(last)) {
    throw fail(
      `${where}[${parsedRules.length - 1}].when`,
      'последнее Правило должно быть «always»: иначе неясно, что делать, когда не сработало ни одно',
    );
  }
  return parsedRules;
}

/**
 * Разбирает Поведение из того, что прочитано из JSON. Любая неточность
 * отвергается с указанием места: `tank[0].when` — первое Правило Танка,
 * его Условие.
 */
export function parseBehaviour(raw: unknown): Behaviour {
  if (!isRecord(raw)) throw fail('корень', 'ожидался объект с Правилами по типам');

  for (const key of Object.keys(raw)) {
    if (!(UNIT_KINDS as readonly string[]).includes(key)) {
      throw fail(key, `неизвестный тип Юнита; есть: ${UNIT_KINDS.join(', ')}`);
    }
  }

  const parsed: Partial<Record<UnitKind, readonly Rule[]>> = {};
  for (const kind of UNIT_KINDS) parsed[kind] = parseRules(raw[kind], kind);
  return parsed as Behaviour;
}
