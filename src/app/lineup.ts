import type { SideId, SideSetup } from '@sim/index';
import { pickOpponent, type Opponent } from './opponents.js';

/**
 * Кто играет за какую Сторону. За чужую — всегда Противник. За свою —
 * человек со своими Правилами или, в Показательном матче, тоже
 * Противник: тогда Юнитов выпускают Волны обеих Сторон, а человек
 * только смотрит.
 *
 * Файл Противника один на обе Стороны (ADR-0003): за свою Сторону он
 * выходит с тем же Поведением и Волнами, меняется только id Стороны.
 */
export interface Lineup {
  /** Противник за свою Сторону; null — играет человек. */
  readonly ally: Opponent | null;
  readonly opponent: Opponent | null;
  /** Играют ли обе Стороны сами — Показательный ли матч. */
  readonly showcase: boolean;
  /** Обе Стороны для матча: своя первой. `player` — Сторона человека, если играет он. */
  sides(player: SideSetup): readonly [SideSetup, SideSetup];
}

/**
 * Состав по именам из адреса или Подготовки. Неизвестное имя Противника
 * даёт Противника по умолчанию, как и раньше; неизвестное имя за свою
 * Сторону — человека: молча подменять его чужим характером нельзя.
 */
export function lineupOf(
  opponents: readonly Opponent[],
  names: { readonly ally: string | null; readonly opponent: string | null },
  own: SideId,
  foe: SideId,
): Lineup {
  const ally = opponents.find((entry) => entry.id === names.ally) ?? null;
  const opponent = pickOpponent(opponents, names.opponent);
  return {
    ally,
    opponent,
    showcase: ally !== null,
    sides(player) {
      const mine: SideSetup = ally ? { ...ally.side, id: own } : { ...player, id: own };
      const theirs: SideSetup = opponent ? { ...opponent.side, id: foe } : { id: foe };
      return [mine, theirs];
    },
  };
}

/** Имена из состава — для адреса, Подготовки и журнала Повтора. */
export const namesOf = (lineup: Lineup): { ally: string | null; opponent: string | null } => ({
  ally: lineup.ally?.id ?? null,
  opponent: lineup.opponent?.id ?? null,
});
