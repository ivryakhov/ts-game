import { UNIT_KINDS, type UnitKind } from './balance.js';

/**
 * Поведение и Правила — язык, на котором игрок программирует Юнитов
 * (ADR-0002). Здесь только словарь и его разбор; исполнение — в behave.ts.
 *
 * Словарь закрыт: всё, что игрок может написать, перечислено в типах
 * ниже, и ничего сверх этого файл содержать не может.
 */

/** Проверяемое утверждение о Юните и его окружении. */
export type Condition =
  | { readonly kind: 'always' }
  | { readonly kind: 'hp-below'; readonly percent: number }
  | { readonly kind: 'enemy-in-range' }
  /** Стою у своей Цитадели и здоровье ещё ниже until процентов. */
  | { readonly kind: 'recovering'; readonly until: number };

/** Что Юнит делает в этот Тик. */
export type Action =
  | { readonly kind: 'advance' }
  | { readonly kind: 'attack-nearest' }
  | { readonly kind: 'retreat' };

export interface Rule {
  readonly when: Condition;
  readonly do: Action;
}

/** Упорядоченный список Правил на каждый тип Юнита. */
export type Behaviour = Readonly<Record<UnitKind, readonly Rule[]>>;

const CONDITIONS = ['always', 'hp-below', 'enemy-in-range', 'recovering'] as const;
const ACTIONS = ['advance', 'attack-nearest', 'retreat'] as const;

/**
 * Поведение, повторяющее то, как Юниты вели себя до появления Правил:
 * видишь врага — бей, иначе иди вперёд. Отступать не умеют.
 */
const FIGHT_THEN_ADVANCE: readonly Rule[] = [
  { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } },
  { when: { kind: 'always' }, do: { kind: 'advance' } },
];

export const DEFAULT_BEHAVIOUR: Behaviour = {
  scout: FIGHT_THEN_ADVANCE,
  tank: FIGHT_THEN_ADVANCE,
  ranger: FIGHT_THEN_ADVANCE,
};

class BehaviourError extends Error {
  constructor(where: string, what: string) {
    super(`Поведение, ${where}: ${what}`);
    this.name = 'BehaviourError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Лишний ключ — почти всегда опечатка: «percnt» вместо «percent». Молча его
 * пропустить значит оставить игрока гадать, почему Правило не работает.
 */
function onlyKeys(raw: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      throw new BehaviourError(where, `лишний ключ «${key}»; допустимы: ${allowed.join(', ')}`);
    }
  }
}

function parsePercent(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new BehaviourError(where, `ожидалось число от 0 до 100, а не ${String(value)}`);
  }
  return value;
}

function parseCondition(raw: unknown, where: string): Condition {
  if (!isRecord(raw)) throw new BehaviourError(where, 'ожидалось Условие-объект');
  const kind = raw['kind'];

  switch (kind) {
    case 'always':
    case 'enemy-in-range':
      onlyKeys(raw, ['kind'], where);
      return { kind };
    case 'hp-below':
      onlyKeys(raw, ['kind', 'percent'], where);
      return { kind, percent: parsePercent(raw['percent'], `${where}.percent`) };
    case 'recovering':
      onlyKeys(raw, ['kind', 'until'], where);
      return { kind, until: parsePercent(raw['until'], `${where}.until`) };
    default:
      throw new BehaviourError(
        where,
        `неизвестное Условие «${String(kind)}»; есть: ${CONDITIONS.join(', ')}`,
      );
  }
}

function parseAction(raw: unknown, where: string): Action {
  if (!isRecord(raw)) throw new BehaviourError(where, 'ожидалось Действие-объект');
  const kind = raw['kind'];

  switch (kind) {
    case 'advance':
    case 'attack-nearest':
    case 'retreat':
      onlyKeys(raw, ['kind'], where);
      return { kind };
    default:
      throw new BehaviourError(
        where,
        `неизвестное Действие «${String(kind)}»; есть: ${ACTIONS.join(', ')}`,
      );
  }
}

/**
 * Разбирает Поведение из того, что прочитано из JSON. Любая неточность
 * отвергается с указанием места: `tank[0].when` — первое Правило Танка,
 * его Условие.
 */
export function parseBehaviour(raw: unknown): Behaviour {
  if (!isRecord(raw)) throw new BehaviourError('корень', 'ожидался объект с Правилами по типам');

  for (const key of Object.keys(raw)) {
    if (!(UNIT_KINDS as readonly string[]).includes(key)) {
      throw new BehaviourError(key, `неизвестный тип Юнита; есть: ${UNIT_KINDS.join(', ')}`);
    }
  }

  const parsed: Partial<Record<UnitKind, readonly Rule[]>> = {};

  for (const kind of UNIT_KINDS) {
    const rules = raw[kind];
    if (!Array.isArray(rules)) throw new BehaviourError(kind, 'нет списка Правил для этого типа');
    if (rules.length === 0) {
      throw new BehaviourError(kind, 'список Правил пуст — Юнит не знал бы, что делать');
    }

    const parsedRules = rules.map((rule: unknown, index) => {
      const where = `${kind}[${index}]`;
      if (!isRecord(rule)) throw new BehaviourError(where, 'ожидалось Правило-объект');
      onlyKeys(rule, ['when', 'do'], where);
      return {
        when: parseCondition(rule['when'], `${where}.when`),
        do: parseAction(rule['do'], `${where}.do`),
      };
    });

    // Последнее Правило обязано срабатывать всегда. Иначе Юнит, у которого
    // не сработало ни одно, делал бы что-то, чего нет в файле, — скрытое
    // правило, которого игрок не видит (ADR-0002).
    const last = parsedRules[parsedRules.length - 1];
    if (last?.when.kind !== 'always') {
      throw new BehaviourError(
        `${kind}[${parsedRules.length - 1}].when`,
        'последнее Правило должно быть «always»: иначе неясно, что делать, когда не сработало ни одно',
      );
    }

    parsed[kind] = parsedRules;
  }

  return parsed as Behaviour;
}
