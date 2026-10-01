import { describe, it, expect } from 'vitest';
import { DEFAULT_BEHAVIOUR, runMatch } from '@sim/index';
import type { Behaviour, MatchResult, Release, Rule, SideId, UnitKind } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Своя Цитадель лечит Юнитов рядом с собой. Снова выйти на Дорогу
 * недолеченным или дождаться полного здоровья — решает Правило игрока,
 * а не скрытая механика (ADR-0002).
 */

const deploy = (tick: number, side: SideId, unit: UnitKind = 'scout'): Release => ({
  tick,
  side,
  kind: 'deploy',
  roadId: 'short',
  unit,
});

const everyone = (rules: readonly Rule[]): Behaviour => ({ scout: rules, tank: rules, ranger: rules });

const ADVANCE: Rule = { when: { kind: 'always' }, do: { kind: 'advance' } };
const FIGHT: Rule = { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } };
const FLEE_BELOW = (percent: number): Rule => ({ when: { kind: 'hp-below', percent }, do: { kind: 'retreat' } });
const HEAL_UNTIL = (until: number): Rule => ({
  when: [{ kind: 'at-home' }, { kind: 'hp-below', percent: until }],
  do: { kind: 'retreat' },
});

function duel(ours: Behaviour, releases: readonly Release[], maxTicks: number): MatchResult {
  return runMatch(
    matchSetup({
      map: arena,
      sides: [
        { id: 'A', behaviour: ours },
        { id: 'B', behaviour: DEFAULT_BEHAVIOUR },
      ],
      releases,
      maxTicks,
    }),
  );
}

const ours = (result: MatchResult) => result.finalState.units.find((unit) => unit.side === 'A');

describe('лечение у своей Цитадели', () => {
  it('раненый Юнит, вернувшись домой, восстанавливает здоровье', () => {
    const cautious = everyone([FLEE_BELOW(60), HEAL_UNTIL(100), FIGHT, ADVANCE]);
    const releases = [deploy(1, 'A'), deploy(1, 'B')];

    const home = ours(duel(cautious, releases, 200));
    const later = ours(duel(cautious, releases, 240));

    expect(home?.progress).toBe(0);
    expect(later?.hp ?? 0).toBeGreaterThan(home?.hp ?? Number.POSITIVE_INFINITY);
  });

  it('не поднимает здоровье выше максимума ни на одном Тике лечения', () => {
    // Смотреть надо на каждый Тик, пока Юнит дома: вылечившись, он уходит,
    // и позже перешагнувшее максимум здоровье уже не поймать.
    const cautious = everyone([FLEE_BELOW(60), HEAL_UNTIL(100), FIGHT, ADVANCE]);
    const releases = [deploy(1, 'A'), deploy(1, 'B')];

    for (let tick = 170; tick <= 330; tick += 1) {
      const unit = ours(duel(cautious, releases, tick));
      if (!unit) continue;
      expect(unit.hp, `Тик ${tick}`).toBeLessThanOrEqual(unit.maxHp);
    }
  });

  it('не лечит вдали от своей Цитадели', () => {
    // Юнит ранен в Стычке и дерётся дальше посреди Дороги — здоровье
    // только убывает.
    const reckless = everyone([FIGHT, ADVANCE]);
    const releases = [deploy(1, 'A'), deploy(1, 'B')];
    const early = ours(duel(reckless, releases, 95));
    const later = ours(duel(reckless, releases, 115));

    expect(later?.hp ?? 0).toBeLessThan(early?.hp ?? 0);
  });

  it('не лечит у чужой Цитадели', () => {
    // Осаждающий у чужих стен только теряет здоровье.
    const result = duel(everyone([FIGHT, ADVANCE]), [deploy(1, 'A')], 165);
    const besieger = ours(result);

    expect(besieger?.state).toBe('sieging');
    expect(besieger?.hp ?? 0).toBeLessThan(besieger?.maxHp ?? 0);
  });
});

describe('Условие «долечиваюсь»', () => {
  it('держит Юнита дома, пока он не вылечится полностью', () => {
    // Разведчики сходятся к 80-му Тику, наш отступает к 110-му и лечится
    // дома примерно с 170-го по 210-й.
    const cautious = everyone([FLEE_BELOW(60), HEAL_UNTIL(100), FIGHT, ADVANCE]);
    const unit = ours(duel(cautious, [deploy(1, 'A'), deploy(1, 'B')], 190));

    // Ещё не вылечился — стоит у Цитадели, на Дорогу не выходит.
    expect(unit?.hp ?? 0).toBeLessThan(unit?.maxHp ?? 0);
    expect(unit?.progress).toBe(0);
    // И показан как лечащийся, а не как сбежавший насовсем.
    expect(unit?.healing).toBe(true);
  });

  it('отпускает Юнита снова на Дорогу, когда он вылечился', () => {
    const cautious = everyone([FLEE_BELOW(60), HEAL_UNTIL(100), FIGHT, ADVANCE]);
    const unit = ours(duel(cautious, [deploy(1, 'A'), deploy(1, 'B')], 400));

    expect(unit?.progress ?? 0).toBeGreaterThan(0);
  });

  it('без него Юнит уходит недолеченным — едва перевалив порог отступления', () => {
    // Порог отступления 60%: без «долечиваюсь» Юнит разворачивается,
    // как только здоровье превысит 60%, и уходит далеко не полным.
    const hasty = everyone([FLEE_BELOW(60), FIGHT, ADVANCE]);
    const patient = everyone([FLEE_BELOW(60), HEAL_UNTIL(100), FIGHT, ADVANCE]);
    const releases = [deploy(1, 'A'), deploy(1, 'B')];

    const leftHasty = ours(duel(hasty, releases, 190));
    const leftPatient = ours(duel(patient, releases, 190));

    expect(leftHasty?.progress ?? 0).toBeGreaterThan(0);
    expect(leftPatient?.progress).toBe(0);
  });

  it('вдали от дома ложно: Юнит, выпущенный целым, сразу идёт вперёд', () => {
    const cautious = everyone([HEAL_UNTIL(100), ADVANCE]);
    const unit = ours(duel(cautious, [deploy(1, 'A')], 30));

    expect(unit?.progress ?? 0).toBeGreaterThan(0.1);
  });
});

describe('Поведение игрока из коробки', () => {
  it('защитник у своих ворот отвечает врагу, а не встаёт лечиться', () => {
    // «Долечиваюсь» стоит ниже «враг в радиусе»: пока враг рядом, Юнит
    // дерётся, а лечится, только когда драться не с кем.
    const player = everyone([
      FLEE_BELOW(30),
      { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } },
      HEAL_UNTIL(100),
      ADVANCE,
    ]);
    // Танк противника доходит до наших стен, Стрелок противника бьёт
    // из-за его спины; навстречу выходит наш Стрелок. Ближнему его не
    // достать — он стоит у самого центра Цитадели, — а Стрелку достать.
    const releases = [
      deploy(1, 'B', 'tank'),
      deploy(2, 'B', 'ranger'),
      deploy(300, 'A', 'ranger'),
    ];
    const result = duel(player, releases, 320);
    const defender = ours(result);

    expect(defender?.state).toBe('fighting');
    // И при этом лечится: драться у своих ворот и лечиться можно разом.
    expect(defender?.healing).toBe(true);
  });
});

describe('долечившийся возвращается в Колонну', () => {
  it('встаёт за теми, кто ушёл вперёд, пока он лечился, а не отбрасывает их назад', () => {
    // Разведчик отступил и лечится у Цитадели; тем временем выходит Танк.
    // Вылечившись, Разведчик — вышедший раньше всех — снова идёт вперёд.
    const cautious = everyone([FLEE_BELOW(60), HEAL_UNTIL(100), FIGHT, ADVANCE]);
    const releases = [deploy(1, 'A'), deploy(1, 'B'), deploy(185, 'A', 'tank')];
    const units = (maxTicks: number) => duel(cautious, releases, maxTicks).finalState.units;
    const tankAt = (maxTicks: number) => units(maxTicks).find((unit) => unit.kind === 'tank');

    const healing = units(190).find((unit) => unit.kind === 'scout');
    const later = units(300);
    const scout = later.find((unit) => unit.kind === 'scout');

    // Разведчик ещё дома, пока Танк выходит, а к Тику 300 оба идут.
    expect(healing?.progress).toBe(0);
    expect(scout?.state).toBe('moving');
    // Танк не отброшен назад: он продолжает путь и остаётся впереди.
    expect(tankAt(300)?.progress ?? 0).toBeGreaterThan(tankAt(240)?.progress ?? 1);
    expect(scout?.progress ?? 1).toBeLessThan(tankAt(300)?.progress ?? 0);
  });
});
