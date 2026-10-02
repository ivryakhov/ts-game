import { UNIT_KINDS, UNIT_STATS, type UnitKind } from './balance.js';
import type { Behaviour } from './rules.js';
import type { MatchEvent, SideId, UnitId } from './types.js';

/**
 * Разбор матча: почему он кончился так, а не иначе. Сколько каждое
 * Правило исполнялось, какой тип Юнитов окупился, кто кого убивал
 * и на каком Правиле Юниты гибли.
 *
 * Считается в ядре, а не в интерфейсе: те же числа нужны Автопрогону.
 * Разбор только читает мир и на матч не влияет — журнал событий с ним
 * и без него один и тот же (ADR-0001).
 */

/** Куда пришёлся урон Юнитов одного типа. Считается только снятое здоровье. */
export interface DamageDealt {
  readonly units: number;
  readonly citadel: number;
  readonly obelisks: number;
}

/** Разбор по одному типу Юнитов одной Стороны. */
export interface KindReview {
  readonly deployed: number;
  readonly died: number;
  /** Эфир, ушедший на выпущенных; отказанные Выпуски не стоят ничего. */
  readonly etherSpent: number;
  readonly damage: DamageDealt;
  /** Весь урон на единицу потраченного Эфира; 0 — если не тратили. */
  readonly damagePerEther: number;
  /**
   * Сколько Юнито-Тиков исполнялось каждое Правило, по номеру с нуля.
   * Длина — число Правил типа, поэтому ни разу не сработавшее даёт ноль.
   */
  readonly ruleTicks: readonly number[];
  /** Сколько Юнитов погибло, исполняя каждое Правило, — по номеру. */
  readonly deathsByRule: readonly number[];
}

/** Кто убил Юнита: тип убившего Юнита, стены Цитадели или Обелиск. */
export type KillerKind = UnitKind | 'citadel' | 'obelisk';

export const KILLER_KINDS: readonly KillerKind[] = [...UNIT_KINDS, 'citadel', 'obelisk'];

/** Разбор одной Стороны. */
export interface SideReview {
  readonly side: SideId;
  readonly kinds: Readonly<Record<UnitKind, KindReview>>;
  /** Потери: тип погибшего — кто его убил — сколько раз. */
  readonly losses: Readonly<Record<UnitKind, Readonly<Record<KillerKind, number>>>>;
}

type Tally = { units: number; citadel: number; obelisks: number };

/** Изменяемые счётчики, которые мир ведёт по ходу матча. */
export interface Ledger {
  readonly damage: Map<SideId, Record<UnitKind, Tally>>;
  readonly ruleTicks: Map<SideId, Record<UnitKind, number[]>>;
}

const byKind = <T>(make: (kind: UnitKind) => T): Record<UnitKind, T> =>
  Object.fromEntries(UNIT_KINDS.map((kind) => [kind, make(kind)])) as Record<UnitKind, T>;

export function createLedger(behaviours: ReadonlyMap<SideId, Behaviour>): Ledger {
  const sides = [...behaviours.keys()];
  return {
    damage: new Map(sides.map((side) => [side, byKind(() => ({ units: 0, citadel: 0, obelisks: 0 }))])),
    ruleTicks: new Map(
      sides.map((side) => {
        const behaviour = behaviours.get(side);
        return [side, byKind((kind) => (behaviour?.[kind] ?? []).map(() => 0))];
      }),
    ),
  };
}

/** Кто бьёт — то, что о нём нужно разбору. */
interface Dealer {
  readonly side: SideId;
  readonly kind: UnitKind;
}

/**
 * Записать урон. Берётся только снятое здоровье: добивающий удар сверх
 * остатка не считается, иначе урон по Цитадели разошёлся бы с её HP.
 */
export function noteDamage(
  ledger: Ledger,
  dealer: Dealer,
  into: keyof DamageDealt,
  blow: number,
  hpBefore: number,
): void {
  const tally = ledger.damage.get(dealer.side)?.[dealer.kind];
  if (tally) tally[into] += Math.min(blow, Math.max(0, hpBefore));
}

/**
 * Записать удары Стычки. Урон ложится разом, поэтому остаток здоровья
 * цели убывает от удара к удару в порядке ходов: кто добил сверх
 * остатка, тому лишнее не засчитано.
 */
export function noteBlows(
  ledger: Ledger,
  blows: readonly { readonly attacker: Dealer; readonly target: UnitId; readonly amount: number }[],
  hpOf: (id: UnitId) => number,
): void {
  const left = new Map<UnitId, number>();
  for (const blow of blows) {
    const before = left.get(blow.target) ?? hpOf(blow.target);
    noteDamage(ledger, blow.attacker, 'units', blow.amount, before);
    left.set(blow.target, before - blow.amount);
  }
}

/** Юнит исполнял это Правило один Тик. */
export function noteRule(ledger: Ledger, unit: Dealer & { readonly rule: number }): void {
  const ticks = ledger.ruleTicks.get(unit.side)?.[unit.kind];
  if (ticks && unit.rule < ticks.length) ticks[unit.rule] = (ticks[unit.rule] ?? 0) + 1;
}

/**
 * Свести счётчики и журнал событий в разбор. Выпущенные, погибшие
 * и убийцы берутся из журнала: так разбор не может с ним разойтись.
 */
export function reviewMatch(
  sides: readonly SideId[],
  ledger: Ledger,
  events: readonly MatchEvent[],
): readonly SideReview[] {
  const kindOf = new Map<UnitId, UnitKind>();
  for (const event of events) if (event.kind === 'unit-deployed') kindOf.set(event.unitId, event.unit);

  return sides.map((side) => {
    const ruleTicks = ledger.ruleTicks.get(side) ?? byKind(() => []);
    const damage = ledger.damage.get(side);
    const deathsByRule = byKind((kind) => ruleTicks[kind].map(() => 0));
    const losses = byKind(() => Object.fromEntries(KILLER_KINDS.map((k) => [k, 0])) as Record<KillerKind, number>);
    const deployed = byKind(() => 0);
    const died = byKind(() => 0);

    for (const event of events) {
      if (event.kind === 'unit-deployed' && event.side === side) deployed[event.unit] += 1;
      if (event.kind !== 'unit-died' || event.side !== side) continue;
      died[event.unit] += 1;
      const rules = deathsByRule[event.unit];
      rules[event.rule] = (rules[event.rule] ?? 0) + 1;
      const killer = event.killer;
      const by = killer.kind === 'unit' ? kindOf.get(killer.unitId) : killer.kind;
      if (by) losses[event.unit][by] += 1;
    }

    const kinds = byKind((kind): KindReview => {
      const dealt = { ...(damage?.[kind] ?? { units: 0, citadel: 0, obelisks: 0 }) };
      const etherSpent = deployed[kind] * UNIT_STATS[kind].cost;
      const total = dealt.units + dealt.citadel + dealt.obelisks;
      return {
        deployed: deployed[kind],
        died: died[kind],
        etherSpent,
        damage: dealt,
        damagePerEther: etherSpent > 0 ? total / etherSpent : 0,
        ruleTicks: [...ruleTicks[kind]],
        deathsByRule: deathsByRule[kind],
      };
    });

    return { side, kinds, losses };
  });
}
