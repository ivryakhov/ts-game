import { describe, it, expect } from 'vitest';
import { ECONOMY, runMatch, sideFromFile, TICKS_PER_SECOND, UNIT_STATS } from '@sim/index';
import type {
  Behaviour,
  MatchEvent,
  MatchResult,
  Rule,
  ScheduledRelease,
  SideId,
  SideSetup,
  UnitKind,
  Wave,
} from '@sim/index';
import opponentFile from '../src/behaviours/opponent.json';
import playerFile from '../src/behaviours/player.json';
import { arena } from '../src/maps/arena.js';
import { army, matchSetup } from './match-setup.js';

/**
 * Противник — не отдельный код, а Сторона с файлом: Правила плюс список
 * Волн (ADR-0003). Волны делают Сторону самостоятельной: она сама копит
 * Эфир и сама выпускает Юнитов, не видя ничего, кроме своего кошелька.
 */

const INCOME_PER_TICK = ECONOMY.incomePerSecond / TICKS_PER_SECOND;
/** Двадцать минут — предел матча в игре. */
const GAME_LIMIT = 20 * 60 * TICKS_PER_SECOND;

type Deployed = Extract<MatchEvent, { kind: 'unit-deployed' }>;

const deployedBy = (result: MatchResult, side: SideId): Deployed[] =>
  result.events.filter(
    (event): event is Deployed => event.kind === 'unit-deployed' && event.side === side,
  );

const priceOf = (units: readonly UnitKind[]): number =>
  units.reduce((sum, kind) => sum + UNIT_STATS[kind].cost, 0);

/** Через сколько Тиков накопится столько Эфира, если сейчас есть from. */
const ticksToSave = (amount: number, from: number): number =>
  Math.max(1, Math.ceil((amount - from) / INCOME_PER_TICK));

/** Матч, где Сторона B выпускает Юнитов сама, а A — только по расписанию. */
function opponentPlays(
  waves: readonly Wave[],
  maxTicks: number,
  releases: readonly ScheduledRelease[] = [],
): MatchResult {
  return runMatch(
    matchSetup({ map: arena, sides: [{ id: 'A' }, { id: 'B', waves }], releases, maxTicks }),
  );
}

describe('Сторона с Волнами выпускает Юнитов сама', () => {
  it('копит на Волну целиком и выпускает её, как только хватает', () => {
    const storm: Wave = { road: 'short', units: ['tank', 'tank', 'ranger', 'ranger'] };
    const affordable = ticksToSave(priceOf(storm.units), ECONOMY.startingEther);

    const deployed = deployedBy(opponentPlays([storm], affordable + 10), 'B');

    // Ни Тиком раньше — значит, Эфира ей никто не подкинул; ни Тиком
    // позже — значит, она не ждёт ничего, кроме денег. Выходят все разом,
    // в заданном порядке.
    expect(deployed.map((event) => [event.tick, event.roadId, event.unit])).toEqual([
      [affordable, 'short', 'tank'],
      [affordable, 'short', 'tank'],
      [affordable, 'short', 'ranger'],
      [affordable, 'short', 'ranger'],
    ]);
  });

  it('идёт по списку Волн по кругу', () => {
    const waves: Wave[] = [
      { road: 'north', units: ['scout'] },
      { road: 'south', units: ['tank'] },
    ];

    const deployed = deployedBy(opponentPlays(waves, 400), 'B');

    expect(deployed.slice(0, 4).map((event) => [event.roadId, event.unit])).toEqual([
      ['north', 'scout'],
      ['south', 'tank'],
      ['north', 'scout'],
      ['south', 'tank'],
    ]);
  });

  it('Волну не разорвать: Выпуск по клику за ту же Сторону идёт первым', () => {
    // Сторона B выпускает двух Разведчиков по клику, и на Волну из Танка
    // со Стрелком ей уже не хватает. Волна не выходит по частям: ни один
    // её Юнит не получает отказа — она копит заново и выходит целиком.
    const pair: Wave = { road: 'short', units: ['tank', 'ranger'] };
    const clicks: ScheduledRelease[] = [1, 2].map((tick) => ({
      tick,
      side: 'B',
      kind: 'deploy',
      roadId: 'north',
      unit: 'scout',
    }));
    const left = ECONOMY.startingEther + 2 * INCOME_PER_TICK - priceOf(['scout', 'scout']);
    const waveTick = 2 + ticksToSave(priceOf(pair.units), left);

    const result = opponentPlays([pair], waveTick, clicks);

    expect(deployedBy(result, 'B').map((event) => [event.tick, event.unit])).toEqual([
      [1, 'scout'],
      [2, 'scout'],
      [waveTick, 'tank'],
      [waveTick, 'ranger'],
    ]);
    expect(result.events.some((event) => event.kind === 'deploy-refused')).toBe(false);
  });
});

describe('противник не получает скрытых преимуществ', () => {
  it('тратит ровно заработанное: ни бесплатного Эфира, ни отказов', () => {
    const waves: Wave[] = [
      { road: 'short', units: ['tank', 'ranger', 'ranger'] },
      { road: 'north', units: ['scout', 'scout', 'scout'] },
    ];

    const result = opponentPlays(waves, 1500);
    const spent = priceOf(deployedBy(result, 'B').map((event) => event.unit));
    const left = result.finalState.ether.find((purse) => purse.side === 'B')?.amount ?? 0;

    expect(spent).toBeGreaterThan(0);
    expect(left).toBeCloseTo(ECONOMY.startingEther + result.ticks * INCOME_PER_TICK - spent, 6);
    expect(result.events.some((event) => event.kind === 'deploy-refused')).toBe(false);
  });

  it('не подглядывает: его Выпуски не зависят от того, что делает игрок', () => {
    const waves: Wave[] = [
      { road: 'short', units: ['tank', 'ranger'] },
      { road: 'south', units: ['scout', 'scout'] },
    ];
    const shown = (result: MatchResult) =>
      deployedBy(result, 'B').map((event) => [event.tick, event.roadId, event.unit]);

    const alone = opponentPlays(waves, 600);
    const opposed = opponentPlays(waves, 600, army(['tank', 'ranger', 'ranger'], 'A', 'south'));

    expect(deployedBy(opposed, 'A').length).toBeGreaterThan(0);
    expect(shown(opposed)).toEqual(shown(alone));
  });

  it('одинаковые файлы на обеих Сторонах дают зеркальный матч: форы нет ни у кого', () => {
    const side = (id: SideId): SideSetup => sideFromFile(id, opponentFile, arena);
    const result = runMatch(
      matchSetup({ map: arena, sides: [side('A'), side('B')], maxTicks: 3 * 60 * TICKS_PER_SECOND }),
    );
    const bySide = (id: SideId) => ({
      citadel: result.finalState.citadels.find((citadel) => citadel.side === id)?.hp,
      ether: result.finalState.ether.find((purse) => purse.side === id)?.amount,
      deployed: deployedBy(result, id).length,
      died: result.events.filter((event) => event.kind === 'unit-died' && event.side === id).length,
    });

    expect(bySide('A').deployed).toBeGreaterThan(0);
    expect(bySide('A').died).toBeGreaterThan(0);
    expect(bySide('A')).toEqual(bySide('B'));
  });
});

describe('матч двух наборов Правил без участия человека', () => {
  const FIGHT: Rule = { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } };
  const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
  const FLEE: Rule = { when: { kind: 'hp-below', percent: 50 }, do: { kind: 'retreat' } };
  const HEAL: Rule = { when: { kind: 'recovering', until: 100 }, do: { kind: 'retreat' } };
  const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

  const sets = {
    /** Копит на штурм и идёт напролом. */
    storm: {
      behaviour: everyone([FIGHT, ADVANCE]),
      waves: [{ road: 'short', units: ['tank', 'tank', 'ranger', 'ranger'] }] as const,
    },
    /** Шлёт Разведчиков по одному и бережёт раненых. */
    trickle: {
      behaviour: everyone([FLEE, FIGHT, HEAL, ADVANCE]),
      waves: [{ road: 'short', units: ['scout'] }] as const,
    },
  };

  const duel = (a: keyof typeof sets, b: keyof typeof sets) =>
    runMatch(
      matchSetup({
        map: arena,
        sides: [{ id: 'A', ...sets[a] }, { id: 'B', ...sets[b] }],
        maxTicks: GAME_LIMIT,
      }),
    );

  it('завершается разрушением Цитадели, а не пределом Тиков', () => {
    const result = duel('storm', 'trickle');

    expect(result.endReason).toBe('citadel-destroyed');
    expect(result.ticks).toBeLessThan(GAME_LIMIT);
  });

  it('побеждает сильнейший набор, на какой бы Стороне он ни играл', () => {
    // Штурм напролом сминает Разведчиков, выходящих по одному: одиночка,
    // заметив Танков со Стрелками, бросается на них и гибнет, не успев
    // отойти, — Стрелки бьют его ещё на подходе.
    expect(duel('storm', 'trickle').winner).toBe('A');
    expect(duel('trickle', 'storm').winner).toBe('B');
  });
});

describe('противник из игры', () => {
  it('файлы читаются, и противник берёт Цитадель игрока, который ничего не выпускает', () => {
    // Намеренно про содержимое: это проверка того, что лежит в игре.
    // Противник, не способный взять даже пустую Цитадель, — не соперник.
    const result = runMatch(
      matchSetup({
        map: arena,
        sides: [sideFromFile('A', playerFile, arena), sideFromFile('B', opponentFile, arena)],
        maxTicks: GAME_LIMIT,
      }),
    );

    expect(result.winner).toBe('B');
    expect(result.endReason).toBe('citadel-destroyed');
  });
});
