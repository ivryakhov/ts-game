import type { UnitKind } from './balance.js';

/**
 * Поведение и Правила — язык, на котором игрок программирует Юнитов
 * (ADR-0002). Здесь только словарь; разбор — в rule-parse.ts, исполнение —
 * в behave.ts.
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
  /** Вижу врага этого типа — той же меркой, что «враг в радиусе». */
  | { readonly kind: 'enemy-kind-in-range'; readonly unit: UnitKind }
  /** Стою у своей Цитадели — там, где она лечит и куда встаёт выпущенный. */
  | { readonly kind: 'at-home' }
  /**
   * Своих рядом, не считая меня, меньше или больше count. С `unit` —
   * считаются только свои этого типа: «Танков рядом меньше 1».
   */
  | {
      readonly kind: 'allies-nearby';
      readonly compare: 'fewer' | 'more';
      readonly count: number;
      readonly unit?: UnitKind;
    }
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
  'enemy-kind-in-range',
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
