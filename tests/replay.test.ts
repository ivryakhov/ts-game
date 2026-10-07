import { describe, it, expect } from 'vitest';
import { createMatch, runMatch, TICKS_PER_SECOND } from '@sim/index';
import type { Behaviour, MatchEvent, MatchSetup, Rule, ScheduledRelease, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { createReleaseLog, outcomeOf, type Outcome } from '../src/app/replay.js';
import { describeOutcome } from '../src/ui/hud.js';
import { matchSetup } from './match-setup.js';

/**
 * Повтор матча (задача #38): Выпуски, поданные в живой матч, записываются
 * с Тиками и подаются в новый матч расписанием. Тот же Сид и те же Выпуски
 * с теми же Правилами дают тот же матч, с другими Правилами — другой.
 */

const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
const FIGHT: Rule = { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } };
const RETREAT: Rule = { when: { kind: 'enemy-in-range' }, do: { kind: 'retreat' } };
const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });
const LIMIT = 3 * 60 * TICKS_PER_SECOND;

const setup = (player: Behaviour, releases: readonly ScheduledRelease[] = []): MatchSetup =>
  matchSetup({
    seed: 7,
    map: arena,
    sides: [
      { id: 'A', behaviour: player },
      { id: 'B', behaviour: everyone([FIGHT, ADVANCE]) },
    ],
    // Противник выходит расписанием: так в матче есть с кем драться.
    releases: [
      ...(['tank', 'ranger', 'scout'] as const).map((unit, index) => ({
        tick: 200 + index,
        side: 'B' as const,
        kind: 'deploy' as const,
        roadId: 'short',
        unit,
      })),
      ...releases,
    ].sort((left, right) => left.tick - right.tick),
    maxTicks: LIMIT,
  });

/** Живой матч: игрок кликает на заданных Тиках, Выпуски пишутся в журнал. */
function playLive(player: Behaviour, clicks: readonly { tick: number; road: string; unit: UnitKind }[]) {
  const match = createMatch(setup(player));
  const log: ScheduledRelease[] = [];
  const events: MatchEvent[] = [];
  while (!match.finished) {
    for (const click of clicks.filter((candidate) => candidate.tick === match.snapshot().tick)) {
      const release = match.deploy({ side: 'A', kind: 'deploy', roadId: click.road, unit: click.unit });
      if (release) log.push(release);
    }
    events.push(...match.step());
  }
  return { log, result: match.result(), events };
}

const CLICKS = [
  { tick: 0, road: 'short', unit: 'tank' as const },
  { tick: 40, road: 'short', unit: 'ranger' as const },
  { tick: 41, road: 'north', unit: 'scout' as const },
  { tick: 260, road: 'short', unit: 'tank' as const },
];

describe('Выпуски живого матча, поданные расписанием', () => {
  it('дают тот же журнал событий, что и живой матч', () => {
    const player = everyone([FIGHT, ADVANCE]);
    const live = playLive(player, CLICKS);
    const replay = runMatch(setup(player, live.log));

    expect(live.log.map((release) => release.tick)).toEqual([1, 41, 42, 261]);
    expect(replay.events).toEqual(live.result.events);
    expect(replay.ticks).toBe(live.result.ticks);
  });

  it('с другими Правилами дают другой исход при тех же моментах выхода', () => {
    const live = playLive(everyone([FIGHT, ADVANCE]), CLICKS);
    const timid = runMatch(setup(everyone([RETREAT, ADVANCE]), live.log));
    const deployed = (events: readonly MatchEvent[]) =>
      events.filter((event) => event.kind === 'unit-deployed' && event.side === 'A').map((event) => event.tick);

    expect(deployed(timid.events)).toEqual(deployed(live.result.events));
    expect(timid.events).not.toEqual(live.result.events);
  });

  it('Выпуск, на который не хватило Эфира, записан и в повторе отвергается так же', () => {
    // Стартовых 100 Эфира хватает на два Танка, третий отвергается.
    const broke = [0, 0, 0].map((tick) => ({ tick, road: 'short', unit: 'tank' as const }));
    const live = playLive(everyone([ADVANCE]), broke);
    const refused = (events: readonly MatchEvent[]) =>
      events.filter((event) => event.kind === 'deploy-refused' && event.side === 'A').length;

    expect(live.log).toHaveLength(3);
    expect(refused(live.result.events)).toBe(1);
    expect(refused(runMatch(setup(everyone([ADVANCE]), live.log)).events)).toBe(1);
  });
});

describe('журнал Выпусков', () => {
  const release = (tick: number): ScheduledRelease => ({ tick, side: 'A', kind: 'deploy', roadId: 'short', unit: 'scout' });
  const outcome = (tick: number): Outcome => ({ winner: 'A', tick, citadels: [] });

  it('повторяет последний доигранный живой матч с его Сидом и Выпусками', () => {
    const log = createReleaseLog();
    expect(log.beginReplay()).toBeNull();

    log.beginLive(5, { ally: null, opponent: 'turtle' });
    log.record(release(3));
    log.record(release(9));
    log.finish(outcome(100));

    expect(log.beginReplay()).toEqual({ seed: 5, opponent: 'turtle', ally: null, releases: [release(3), release(9)], outcome: outcome(100) });
    expect(log.replaying).toBe(true);
  });

  it('повтор ничего не пишет: и повтор повтора сравнивается с тем же оригиналом', () => {
    const log = createReleaseLog();
    log.beginLive(5, { ally: null, opponent: 'turtle' });
    log.record(release(3));
    log.finish(outcome(100));

    log.beginReplay();
    log.record(release(50));
    log.finish(outcome(200));

    expect(log.beginReplay()).toEqual({ seed: 5, opponent: 'turtle', ally: null, releases: [release(3)], outcome: outcome(100) });
  });

  it('новый живой матч после повтора снова пишет и становится оригиналом', () => {
    const log = createReleaseLog();
    log.beginLive(5, { ally: null, opponent: 'turtle' });
    log.finish(outcome(100));
    log.beginReplay();

    log.beginLive(6, { ally: null, opponent: null });
    expect(log.replaying).toBe(false);
    log.record(release(7));
    log.finish(outcome(300));

    expect(log.last).toEqual({ seed: 6, opponent: null, ally: null, releases: [release(7)], outcome: outcome(300) });
  });
});

describe('исход одной строкой', () => {
  it('говорит, кто взял верх, когда и сколько осталось от Цитаделей', () => {
    const match = createMatch(setup(everyone([FIGHT, ADVANCE])));
    for (let tick = 0; tick < 3 * TICKS_PER_SECOND; tick += 1) match.step();
    const now = outcomeOf(null, match.snapshot());

    expect(describeOutcome(now, 'A')).toBe('ничья, 00:03, Цитадели: ваша 1000, врага 1000');
    expect(describeOutcome({ winner: 'B', tick: 1260, citadels: [{ side: 'A', hp: 0 }, { side: 'B', hp: 412.4 }] }, 'A')).toBe(
      'поражение, 01:03, Цитадели: ваша 0, врага 413',
    );
  });
});
