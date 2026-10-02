import { TICKS_PER_SECOND, UNIT_KINDS, KILLER_KINDS } from '@sim/index';
import type { Behaviour, KillerKind, SideReview } from '@sim/index';
import { describeRule, UNIT_TITLES } from './rule-text.js';

/**
 * Разбор матча человеческим языком — для итога матча. Правила подписаны
 * тем же текстом, что в редакторе, чтобы игрок сразу узнал, какое править.
 */

export interface ReviewRow {
  readonly title: string;
  readonly cells: readonly string[];
}

export interface RuleUse {
  readonly text: string;
  readonly use: string;
  /** Ни разу не сработало — его стоит переписать или убрать. */
  readonly idle: boolean;
}

export interface KindRules {
  readonly title: string;
  readonly rules: readonly RuleUse[];
}

export interface ReviewText {
  readonly kinds: readonly ReviewRow[];
  readonly rules: readonly KindRules[];
  readonly losses: readonly ReviewRow[];
}

export const KIND_COLUMNS = ['выпущено', 'погибло', 'по Юнитам', 'по Цитадели', 'по Обелискам', 'урон за Эфир'];

const KILLER_TITLES: Readonly<Record<KillerKind, string>> = {
  ...UNIT_TITLES,
  citadel: 'стены',
  obelisk: 'Обелиск',
};

export const LOSS_COLUMNS = KILLER_KINDS.map((kind) => KILLER_TITLES[kind]);

const whole = (value: number): string => String(Math.round(value));
const shortly = (value: number): string => String(Math.round(value * 10) / 10);

/** Сколько исполнялось Правило и сколько на нём погибло. */
export function describeRuleUse(ticks: number, deaths: number): string {
  if (ticks === 0) return 'ни разу не сработало';
  const time = `${shortly(ticks / TICKS_PER_SECOND)} Юнито-с`;
  return deaths > 0 ? `${time}, погибло на нём: ${deaths}` : time;
}

export function describeReview(review: SideReview, behaviour: Behaviour): ReviewText {
  const played = UNIT_KINDS.filter((kind) => review.kinds[kind].deployed > 0);

  return {
    kinds: played.map((kind) => {
      const entry = review.kinds[kind];
      return {
        title: UNIT_TITLES[kind],
        cells: [
          String(entry.deployed),
          String(entry.died),
          whole(entry.damage.units),
          whole(entry.damage.citadel),
          whole(entry.damage.obelisks),
          shortly(entry.damagePerEther),
        ],
      };
    }),
    rules: played.map((kind) => ({
      title: UNIT_TITLES[kind],
      rules: behaviour[kind].map((rule, index) => {
        const ticks = review.kinds[kind].ruleTicks[index] ?? 0;
        return {
          text: describeRule(rule),
          use: describeRuleUse(ticks, review.kinds[kind].deathsByRule[index] ?? 0),
          idle: ticks === 0,
        };
      }),
    })),
    losses: played
      .filter((kind) => review.kinds[kind].died > 0)
      .map((kind) => ({
        title: UNIT_TITLES[kind],
        cells: KILLER_KINDS.map((killer) => String(review.losses[kind][killer])),
      })),
  };
}
