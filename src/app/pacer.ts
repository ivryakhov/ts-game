/**
 * Темп воспроизведения: сколько Тиков симуляции выполнить за очередной
 * кадр экрана.
 *
 * Длительность Тика неизменна — это условие воспроизводимости (ADR-0001).
 * Пауза и ускорение меняют только то, сколько Тиков приходится на кадр,
 * поэтому просмотр на восьмикратной скорости даёт ровно тот же матч,
 * что и на обычной.
 */

/** Допустимые скорости воспроизведения. */
export const SPEEDS = [0.5, 1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * С какой скорости начинается матч в игре. Вдвое медленнее Тика: игрок
 * успевает рассмотреть Стычку и ответить, а ускориться может сам.
 */
export const STARTING_SPEED: Speed = 0.5;

/**
 * Предел Тиков за кадр. Нужен на случай, когда вкладка была свёрнута
 * и время накопилось: без предела браузер намертво зависнет, доганяя
 * пропущенные минуты за один кадр.
 */
const MAX_TICKS_PER_FRAME = 60;

export interface Pacer {
  readonly speed: Speed;
  paused: boolean;
  /** Учесть прошедший кадр и сказать, сколько Тиков выполнить. */
  advance(deltaMs: number): number;
  /** Следующая скорость вверх или вниз по списку; на краях ничего не меняется. */
  faster(): void;
  slower(): void;
  /**
   * Новый матч: начальная скорость, без паузы и без накопленного времени.
   * Тот же объект, а не новый — на него уже подписаны клавиши.
   */
  restart(): void;
  /** Доля пути от последнего Тика к следующему — для сглаживания. */
  readonly alpha: number;
}

export function createPacer(ticksPerSecond: number, start: Speed = 1): Pacer {
  const tickMs = 1000 / ticksPerSecond;
  let accumulated = 0;
  const startIndex = SPEEDS.indexOf(start);
  let speedIndex = startIndex;

  const shift = (step: number): void => {
    speedIndex = Math.min(SPEEDS.length - 1, Math.max(0, speedIndex + step));
  };

  return {
    paused: false,

    get speed(): Speed {
      return SPEEDS[speedIndex] ?? 1;
    },

    faster: () => shift(1),
    slower: () => shift(-1),

    restart(): void {
      speedIndex = startIndex;
      accumulated = 0;
      this.paused = false;
    },

    advance(deltaMs: number): number {
      if (this.paused) return 0;

      accumulated += Math.max(0, deltaMs) * this.speed;

      const due = Math.floor(accumulated / tickMs);
      const ticks = Math.min(due, MAX_TICKS_PER_FRAME);
      // Весь накопленный долг списывается, даже несделанная его часть:
      // Тики сверх предела не выполняются и не переносятся на следующий
      // кадр — догонять свёрнутую вкладку незачем.
      accumulated -= due * tickMs;

      return ticks;
    },

    get alpha(): number {
      return accumulated / tickMs;
    },
  };
}
