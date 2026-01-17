/**
 * Neon Arcana - Game Loop
 * Управление игровым циклом с фиксированным timestep для логики
 * и переменным framerate для рендеринга
 */

import { TICK_DURATION_MS, TICK_DURATION_SEC } from "@shared/constants";

/**
 * Callback-функции игрового цикла
 */
export interface GameLoopCallbacks {
  /** Обновление игровой логики (фиксированный timestep) */
  update: (dt: number) => void;

  /** Рендеринг (переменный framerate, с интерполяцией) */
  render: (alpha: number) => void;
}

/**
 * Статистика производительности
 */
export interface PerformanceStats {
  /** Текущий FPS */
  fps: number;

  /** Время последнего кадра в мс */
  frameTime: number;

  /** Количество тиков в секунду */
  ticksPerSecond: number;

  /** Количество пропущенных кадров */
  droppedFrames: number;
}

/**
 * Класс игрового цикла
 *
 * Использует паттерн "Fix Your Timestep" для стабильной симуляции:
 * - Логика обновляется с фиксированной частотой (TICK_RATE раз в секунду)
 * - Рендеринг происходит как можно чаще (requestAnimationFrame)
 * - Интерполяция сглаживает отображение между тиками
 */
export class GameLoop {
  /** Callback'и игры */
  private callbacks: GameLoopCallbacks;

  /** Работает ли цикл */
  private isRunning: boolean = false;

  /** ID запроса анимации */
  private animationFrameId: number | null = null;

  /** Время последнего кадра */
  private lastTime: number = 0;

  /** Накопленное время для обновления логики */
  private accumulator: number = 0;

  /** Текущий тик */
  private currentTick: number = 0;

  /** Максимальное накопленное время (защита от spiral of death) */
  private readonly maxAccumulator: number = TICK_DURATION_MS * 5;

  // === Статистика ===
  private frameCount: number = 0;
  private fpsUpdateTime: number = 0;
  private tickCount: number = 0;
  private currentFps: number = 0;
  private currentTicksPerSecond: number = 0;
  private lastFrameTime: number = 0;
  private droppedFrames: number = 0;

  /** Интервал обновления статистики (мс) */
  private readonly statsUpdateInterval: number = 1000;

  constructor(callbacks: GameLoopCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Запустить игровой цикл
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.fpsUpdateTime = this.lastTime;
    this.accumulator = 0;
    this.frameCount = 0;
    this.tickCount = 0;
    this.droppedFrames = 0;

    this.loop(this.lastTime);
  }

  /**
   * Остановить игровой цикл
   */
  stop(): void {
    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Поставить на паузу
   */
  pause(): void {
    this.isRunning = false;
  }

  /**
   * Продолжить после паузы
   */
  resume(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;

    this.loop(this.lastTime);
  }

  /**
   * Главный цикл
   */
  private loop = (currentTime: number): void => {
    if (!this.isRunning) return;

    // Вычисляем дельту времени
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    this.lastFrameTime = deltaTime;

    // Защита от слишком больших deltaTime (например, после сворачивания вкладки)
    const clampedDelta = Math.min(deltaTime, this.maxAccumulator);
    this.accumulator += clampedDelta;

    // Если deltaTime было обрезано, считаем это пропущенными кадрами
    if (deltaTime > this.maxAccumulator) {
      this.droppedFrames++;
    }

    // Фиксированный update для игровой логики
    let ticksThisFrame = 0;
    const maxTicksPerFrame = 5; // Защита от слишком большого количества тиков за кадр

    while (
      this.accumulator >= TICK_DURATION_MS &&
      ticksThisFrame < maxTicksPerFrame
    ) {
      this.callbacks.update(TICK_DURATION_SEC);
      this.accumulator -= TICK_DURATION_MS;
      this.currentTick++;
      this.tickCount++;
      ticksThisFrame++;
    }

    // Если не успели обработать все накопленное время, сбрасываем
    if (
      ticksThisFrame >= maxTicksPerFrame &&
      this.accumulator >= TICK_DURATION_MS
    ) {
      this.accumulator = this.accumulator % TICK_DURATION_MS;
      this.droppedFrames++;
    }

    // Вычисляем alpha для интерполяции (0-1)
    // alpha показывает, насколько мы продвинулись к следующему тику
    const alpha = this.accumulator / TICK_DURATION_MS;

    // Рендеринг с интерполяцией
    this.callbacks.render(alpha);

    // Обновляем счётчик кадров
    this.frameCount++;

    // Обновляем статистику каждую секунду
    if (currentTime - this.fpsUpdateTime >= this.statsUpdateInterval) {
      const elapsed = (currentTime - this.fpsUpdateTime) / 1000;
      this.currentFps = Math.round(this.frameCount / elapsed);
      this.currentTicksPerSecond = Math.round(this.tickCount / elapsed);

      this.frameCount = 0;
      this.tickCount = 0;
      this.fpsUpdateTime = currentTime;
    }

    // Запрашиваем следующий кадр
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  /**
   * Получить текущий тик
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * Получить статистику производительности
   */
  getStats(): PerformanceStats {
    return {
      fps: this.currentFps,
      frameTime: this.lastFrameTime,
      ticksPerSecond: this.currentTicksPerSecond,
      droppedFrames: this.droppedFrames,
    };
  }

  /**
   * Проверить, работает ли цикл
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Сбросить статистику
   */
  resetStats(): void {
    this.frameCount = 0;
    this.tickCount = 0;
    this.droppedFrames = 0;
    this.currentFps = 0;
    this.currentTicksPerSecond = 0;
    this.fpsUpdateTime = performance.now();
  }

  /**
   * Выполнить один тик вручную (для отладки)
   */
  manualTick(): void {
    this.callbacks.update(TICK_DURATION_SEC);
    this.currentTick++;
  }

  /**
   * Выполнить рендер вручную (для отладки)
   */
  manualRender(alpha: number = 0): void {
    this.callbacks.render(alpha);
  }
}
