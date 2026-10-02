import { UNIT_KINDS, type UnitKind } from './balance.js';
import { filePart, isRecord } from './parse.js';

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
  /** Вижу врага, которого могу достать, — к нему и сойду с Дороги. */
  | { readonly kind: 'enemy-in-range' }
  /** Стою у своей Цитадели — там, где она лечит и куда встаёт выпущенный. */
  | { readonly kind: 'at-home' }
  /** Своих рядом, не считая меня, меньше или больше count. */
  | { readonly kind: 'allies-nearby'; readonly compare: 'fewer' | 'more'; readonly count: number }
  /** Врагов, которых я вижу, не считая отступающих, больше above. */
  | { readonly kind: 'enemies-in-skirmish'; readonly above: number }
  /** Впереди по моей Дороге есть враг — на любом расстоянии, даже если не вижу. */
  | { readonly kind: 'enemy-ahead' }
  /** Достаю чужую Цитадель со своего места. */
  | { readonly kind: 'enemy-citadel-in-range' }
  /** Враг подошёл к моей Цитадели на удар её стен — где бы я сам ни стоял. */
  | { readonly kind: 'enemy-at-home' }
  /** Вижу ничей или вражеский Обелиск (ADR-0006). */
  | { readonly kind: 'obelisk-in-range' };

/** Что Юнит делает в этот Тик. */
export type Action =
  | { readonly kind: 'advance' }
  | { readonly kind: 'retreat' }
  /** Стоять на месте: не идти и не бить. */
  | { readonly kind: 'hold' }
  | { readonly kind: 'attack-nearest' }
  /** Бить врага с наименьшим здоровьем — добивать. */
  | { readonly kind: 'attack-weakest' }
  /** Бить врага с наибольшим уроном. */
  | { readonly kind: 'attack-most-dangerous' }
  /** Бить врага заданного типа, а если такого нет — ближайшего. */
  | { readonly kind: 'attack-kind'; readonly unit: UnitKind }
  /**
   * Бить ближайший видимый чужой Обелиск, а не видя ни одного — идти
   * вперёд. Не из семейства «атаковать»: Обелиск не враг (ADR-0006).
   */
  | { readonly kind: 'siege-obelisk' };

/** Действия, при которых Юнит бьёт, — все, кроме идти, отступать и стоять. */
export type AttackAction = Extract<
  Action,
  { kind: 'attack-nearest' | 'attack-weakest' | 'attack-most-dangerous' | 'attack-kind' }
>;

export function isAttack(action: Action): action is AttackAction {
  return action.kind.startsWith('attack-');
}

/** Условие, которое может стоять в «И», — любое, кроме «всегда». */
export type JointCondition = Exclude<Condition, { kind: 'always' }>;

/** Сколько Условий может стоять в одном «И» (ADR-0005). */
export const MIN_JOINT_CONDITIONS = 2;
export const MAX_JOINT_CONDITIONS = 3;

export interface Rule {
  /**
   * Одно Условие или «И» из двух-трёх: Правило срабатывает, только когда
   * истинны все (ADR-0005). Одно Условие пишется без массива.
   */
  readonly when: Condition | readonly JointCondition[];
  readonly do: Action;
}

/** Условия Правила списком — одно или все из «И». */
export function conditionsOf(rule: Rule): readonly Condition[] {
  return Array.isArray(rule.when) ? rule.when : [rule.when as Condition];
}

/** Правило «иначе» — с единственным Условием «всегда». */
export function isFallback(rule: Rule): boolean {
  return !Array.isArray(rule.when) && (rule.when as Condition).kind === 'always';
}

/** Упорядоченный список Правил на каждый тип Юнита. */
export type Behaviour = Readonly<Record<UnitKind, readonly Rule[]>>;

/** Все виды Условий и Действий — для разбора и для выпадающих списков редактора. */
export const CONDITION_KINDS = [
  'always',
  'hp-below',
  'enemy-in-range',
  'at-home',
  'allies-nearby',
  'enemies-in-skirmish',
  'enemy-ahead',
  'enemy-citadel-in-range',
  'enemy-at-home',
  'obelisk-in-range',
] as const;
export const ACTION_KINDS = [
  'advance',
  'retreat',
  'hold',
  'attack-nearest',
  'attack-weakest',
  'attack-most-dangerous',
  'attack-kind',
  'siege-obelisk',
] as const;

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
    case 'allies-nearby': {
      onlyKeys(raw, ['kind', 'compare', 'count'], where);
      const compare = raw['compare'];
      if (compare !== 'fewer' && compare !== 'more') {
        throw fail(`${where}.compare`, `ожидалось «fewer» или «more», а не ${String(compare)}`);
      }
      return { kind, compare, count: parseCount(raw['count'], `${where}.count`) };
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
    case 'attack-kind': {
      onlyKeys(raw, ['kind', 'unit'], where);
      const unit = raw['unit'];
      if (typeof unit !== 'string' || !(UNIT_KINDS as readonly string[]).includes(unit)) {
        throw fail(
          `${where}.unit`,
          `неизвестный тип «${String(unit)}»; есть: ${UNIT_KINDS.join(', ')}`,
        );
      }
      return { kind, unit: unit as UnitKind };
    }
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
