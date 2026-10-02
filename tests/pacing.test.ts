import { describe, it, expect } from 'vitest';
import { createMatch, TICKS_PER_SECOND } from '@sim/index';
import type { MatchResult, MatchSetup } from '@sim/index';
import { createPacer, SPEEDS, STARTING_SPEED, type Speed } from '../src/app/pacer.js';
import { matchSetup, arenaWithoutObelisks } from './match-setup.js';

/**
 * Скорость воспроизведения и пауза — свойства показа, а не симуляции.
 * Проверяем главное: как бы кадры ни ложились на Тики, матч приходит
 * к одному и тому же исходу.
 */

/**
 * Матч, который заведомо не кончится сам: Стороны шлют навстречу друг
 * другу равных Разведчиков, те взаимно истребляются в Стычках и до чужих
 * Цитаделей не доходят. Предел Тиков тоже недостижим.
 *
 * И то и другое существенно: если любой прогон упирается в конец матча,
 * сравнение исходов превращается в сравнение двух одинаковых заглушек,
 * и тест перестаёт замечать, что ускорение вообще не работает.
 */
const setup = (): MatchSetup =>
  matchSetup({
    map: arenaWithoutObelisks,
    seed: 4242,
    maxTicks: 100_000,
    releases: ['short', 'north', 'south'].flatMap((roadId, index) => [
      {
        tick: 1 + index * 17,
        side: 'A' as const,
        kind: 'deploy' as const,
        roadId,
        unit: 'scout' as const,
      },
      {
        tick: 1 + index * 17,
        side: 'B' as const,
        kind: 'deploy' as const,
        roadId,
        unit: 'scout' as const,
      },
    ]),
  });

/** Прогоняет матч кадрами заданной длительности при заданной скорости. */
function play(frameMs: number, speed: Speed, modelSeconds: number): MatchResult {
  const match = createMatch(setup());
  const pacer = createPacer(TICKS_PER_SECOND, speed);

  const frames = Math.ceil((modelSeconds * 1000) / frameMs);
  for (let frame = 0; frame < frames; frame += 1) {
    for (let tick = pacer.advance(frameMs); tick > 0; tick -= 1) match.step();
  }

  const result = match.result();
  // Если прогон упёрся в конец матча или в нём вообще ничего не произошло,
  // сравнивать нечего: исходы сойдутся в одну заглушку и тест станет пустым.
  if (match.finished) throw new Error('матч кончился сам — темп проверить нечем');
  if (!result.events.some((event) => event.kind === 'unit-deployed')) {
    throw new Error('в прогоне не появилось ни одного Юнита — сравнивать нечего');
  }
  return result;
}

describe('темп воспроизведения', () => {
  it('не влияет на исход: медленные и быстрые кадры дают один матч', () => {
    expect(play(16, 1, 20)).toEqual(play(4, 1, 20));
  });

  it.each([2, 4, 8] as const)(
    'ускорение в ×%i проживает те же Тики, что обычная скорость за вдесятеро дольше',
    (speed) => {
      expect(play(16, speed, 20)).toEqual(play(16, 1, 20 * speed));
    },
  );

  it('ускорение действительно ускоряет: за те же кадры проходит больше Тиков', () => {
    const slow = play(16, 1, 20).ticks;
    const fast = play(16, 8, 20).ticks;

    expect(fast).toBeGreaterThan(slow * 7);
  });

  it('каждая следующая скорость быстрее предыдущей', () => {
    const ticks = ([1, 2, 4, 8] as const).map((speed) => play(16, speed, 10).ticks);

    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index] ?? 0).toBeGreaterThan(ticks[index - 1] ?? 0);
    }
  });

  it('рваные кадры не сбивают симуляцию', () => {
    const frameLengths = [7, 3, 91, 1, 40, 12, 33, 5, 120, 2];
    const match = createMatch(setup());
    const pacer = createPacer(TICKS_PER_SECOND);
    for (const frameMs of frameLengths) {
      for (let tick = pacer.advance(frameMs); tick > 0; tick -= 1) match.step();
    }

    const steady = createMatch(setup());
    const elapsedMs = frameLengths.reduce((sum, frameMs) => sum + frameMs, 0);
    const expected = Math.floor((elapsedMs * TICKS_PER_SECOND) / 1000);
    for (let tick = 0; tick < expected; tick += 1) steady.step();

    expect(match.result().ticks).toBe(expected);
    expect(match.result()).toEqual(steady.result());
  });
});

describe('начальный темп в игре', () => {
  it('медленнее обычного: за секунду проходит половина Тиков', () => {
    const pacer = createPacer(TICKS_PER_SECOND, STARTING_SPEED);

    expect(pacer.speed).toBe(0.5);
    expect(pacer.advance(1000)).toBe(TICKS_PER_SECOND / 2);
  });

  it('с него можно ускориться до ×8 и вернуться к нему, но не ниже', () => {
    const pacer = createPacer(TICKS_PER_SECOND, STARTING_SPEED);
    for (let step = 0; step < SPEEDS.length; step += 1) pacer.faster();
    expect(pacer.speed).toBe(8);

    for (let step = 0; step < SPEEDS.length + 1; step += 1) pacer.slower();
    expect(pacer.speed).toBe(STARTING_SPEED);
  });

  it('не влияет на исход: замедленный матч проживает те же Тики, что обычный за вдвое меньшее время', () => {
    expect(play(16, 0.5, 20)).toEqual(play(16, 1, 10));
  });
});

describe('пауза', () => {
  it('останавливает время: Тики не идут', () => {
    const pacer = createPacer(TICKS_PER_SECOND);
    pacer.paused = true;

    expect(pacer.advance(1000)).toBe(0);
  });

  it('не копит время впрок: после снятия матч идёт дальше, а не прыгает вперёд', () => {
    const pacer = createPacer(TICKS_PER_SECOND);
    pacer.paused = true;
    pacer.advance(5000);
    pacer.paused = false;

    expect(pacer.advance(1000)).toBe(TICKS_PER_SECOND);
  });
});

describe('доля кадра между Тиками', () => {
  it('лежит между нулём и единицей', () => {
    const pacer = createPacer(TICKS_PER_SECOND);
    pacer.advance(17);

    expect(pacer.alpha).toBeGreaterThanOrEqual(0);
    expect(pacer.alpha).toBeLessThan(1);
  });

  it('не пытается догнать свёрнутую вкладку одним кадром', () => {
    const pacer = createPacer(TICKS_PER_SECOND);

    // Минута простоя — это 1200 Тиков; выполнять их в одном кадре значит
    // повесить браузер, поэтому долг сбрасывается, а не копится.
    expect(pacer.advance(60_000)).toBeLessThanOrEqual(60);
    expect(pacer.advance(16)).toBeLessThanOrEqual(1);
  });
});
