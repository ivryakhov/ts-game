import type { ScheduledRelease, Seed, SideId, WorldSnapshot } from '@sim/index';

/**
 * Повтор матча: тот же Сид и те же Выпуски игрока, но Правила — какие
 * есть сейчас. Так сравнивается действие Правил, а не два разных матча:
 * Танк в повторе выходит ровно на том же Тике, что и в оригинале.
 *
 * Выпуски адресуются Тиком (ADR-0001), поэтому повтор — это просто
 * расписание в `MatchSetup.releases`.
 */

/** Исход матча — то, что сравнивают оригинал и повтор. */
export interface Outcome {
  /** null — время вышло вничью. */
  readonly winner: SideId | null;
  readonly tick: number;
  readonly citadels: readonly { readonly side: SideId; readonly hp: number }[];
}

/** Матч, сыгранный вживую: Сид, противник, попытки Выпусков игрока и исход. */
export interface PlayedMatch {
  readonly seed: Seed;
  /**
   * С кем играли. Повтор идёт против него же, даже если на Подготовке
   * выбран другой: иначе смена исхода выглядела бы делом Правил.
   */
  readonly opponent: string | null;
  /**
   * Попытки, а не только состоявшиеся Выпуски: в повторе с другими
   * Правилами Эфира может не хватить там, где в оригинале хватило, —
   * это законный исход, и он должен быть виден.
   */
  readonly releases: readonly ScheduledRelease[];
  readonly outcome: Outcome | null;
}

export function outcomeOf(winner: SideId | null, world: WorldSnapshot): Outcome {
  return {
    winner,
    tick: world.tick,
    citadels: world.citadels.map((citadel) => ({ side: citadel.side, hp: citadel.hp })),
  };
}

/**
 * Журнал Выпусков. Живой матч пишет в него, повтор только читает:
 * повтор повтора идёт по тому же матчу и сравнивается с тем же оригиналом.
 */
export interface ReleaseLog {
  /** Начался живой матч — его Выпуски пишутся заново. */
  beginLive(seed: Seed, opponent: string | null): void;
  /** Начался повтор последнего живого матча. null — повторять нечего. */
  beginReplay(): PlayedMatch | null;
  /** Игрок выпустил Юнита. В повторе не пишется: там клики выключены. */
  record(release: ScheduledRelease): void;
  /** Матч кончился. Исход запоминается только у живого матча. */
  finish(outcome: Outcome): void;
  /** Идёт ли сейчас повтор. */
  readonly replaying: boolean;
  /** Последний доигранный живой матч — его и повторяют. */
  readonly last: PlayedMatch | null;
}

export function createReleaseLog(): ReleaseLog {
  let last: PlayedMatch | null = null;
  let live: { seed: Seed; opponent: string | null; releases: ScheduledRelease[] } | null = null;
  let replaying = false;

  return {
    beginLive(seed, opponent): void {
      live = { seed, opponent, releases: [] };
      replaying = false;
    },

    beginReplay(): PlayedMatch | null {
      if (!last) return null;
      live = null;
      replaying = true;
      return last;
    },

    record(release): void {
      live?.releases.push(release);
    },

    finish(outcome): void {
      if (!live) return;
      last = { seed: live.seed, opponent: live.opponent, releases: live.releases, outcome };
      live = null;
    },

    get replaying(): boolean {
      return replaying;
    },

    get last(): PlayedMatch | null {
      return last;
    },
  };
}
