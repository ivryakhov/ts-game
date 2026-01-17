/**
 * Neon Arcana - Canvas Renderer
 * Отвечает за отрисовку всех игровых объектов на Canvas
 */

import { GAME_WIDTH, GAME_HEIGHT, FOG_COLOR } from "@shared/constants";
import { Entity } from "../entities/Entity";
import { Tower } from "../entities/Tower";
import { Unit } from "../entities/Unit";
import { Road } from "../entities/Road";

/**
 * Настройки рендерера
 */
export interface RendererConfig {
  /** Показывать FPS */
  showFps: boolean;

  /** Показывать сетку (для отладки) */
  showGrid: boolean;

  /** Размер ячейки сетки */
  gridSize: number;

  /** Включить туман войны */
  fogOfWar: boolean;

  /** Показывать отладочную информацию */
  debugMode: boolean;
}

/**
 * Настройки по умолчанию
 */
const DEFAULT_CONFIG: RendererConfig = {
  showFps: true,
  showGrid: false,
  gridSize: 50,
  fogOfWar: false, // Отключим для прототипа
  debugMode: false,
};

/**
 * Класс рендерера Canvas
 */
export class CanvasRenderer {
  /** Canvas элемент */
  private canvas: HTMLCanvasElement;

  /** Контекст рисования */
  private ctx: CanvasRenderingContext2D;

  /** Настройки */
  private config: RendererConfig;

  /** Ширина canvas */
  private width: number = GAME_WIDTH;

  /** Высота canvas */
  private height: number = GAME_HEIGHT;

  /** Смещение камеры */
  private cameraOffset = { x: 0, y: 0 };

  /** Масштаб камеры */
  private cameraZoom: number = 1;

  constructor(canvas: HTMLCanvasElement, config: Partial<RendererConfig> = {}) {
    this.canvas = canvas;
    this.config = { ...DEFAULT_CONFIG, ...config };

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Cannot get 2D context from canvas");
    }
    this.ctx = context;

    this.resize();
    this.setupCanvas();
  }

  /**
   * Настроить canvas
   */
  private setupCanvas(): void {
    // Сглаживание
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  }

  /**
   * Изменить размер canvas
   */
  resize(): void {
    // Получаем размер контейнера
    const container = this.canvas.parentElement;
    if (container) {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      // Вычисляем масштаб, сохраняя пропорции
      const scaleX = containerWidth / GAME_WIDTH;
      const scaleY = containerHeight / GAME_HEIGHT;
      const scale = Math.min(scaleX, scaleY);

      this.width = GAME_WIDTH * scale;
      this.height = GAME_HEIGHT * scale;
    }

    // Устанавливаем размер canvas
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Масштабируем контекст для соответствия игровым координатам
    this.ctx.setTransform(
      this.width / GAME_WIDTH,
      0,
      0,
      this.height / GAME_HEIGHT,
      0,
      0,
    );

    this.setupCanvas();
  }

  /**
   * Очистить canvas
   */
  clear(): void {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();

    // Заливаем фоном
    this.ctx.fillStyle = "#0a0a12";
    this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  /**
   * Начать кадр рендеринга
   */
  beginFrame(): void {
    this.clear();

    // Применяем трансформацию камеры
    this.ctx.save();
    this.ctx.translate(-this.cameraOffset.x, -this.cameraOffset.y);
    this.ctx.scale(this.cameraZoom, this.cameraZoom);
  }

  /**
   * Завершить кадр рендеринга
   */
  endFrame(): void {
    this.ctx.restore();
  }

  /**
   * Отрисовать фон с сеткой (для отладки)
   */
  renderBackground(): void {
    if (!this.config.showGrid) return;

    const gridSize = this.config.gridSize;

    this.ctx.strokeStyle = "rgba(50, 50, 80, 0.3)";
    this.ctx.lineWidth = 1;

    // Вертикальные линии
    for (let x = 0; x <= GAME_WIDTH; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, GAME_HEIGHT);
      this.ctx.stroke();
    }

    // Горизонтальные линии
    for (let y = 0; y <= GAME_HEIGHT; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(GAME_WIDTH, y);
      this.ctx.stroke();
    }
  }

  /**
   * Отрисовать границы игрового поля
   */
  renderBorder(): void {
    this.ctx.strokeStyle = "#2a2a4a";
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(2, 2, GAME_WIDTH - 4, GAME_HEIGHT - 4);

    // Неоновое свечение границы
    this.ctx.shadowColor = "#00ffff";
    this.ctx.shadowBlur = 10;
    this.ctx.strokeStyle = "rgba(0, 255, 255, 0.3)";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(2, 2, GAME_WIDTH - 4, GAME_HEIGHT - 4);
    this.ctx.shadowBlur = 0;
  }

  /**
   * Отрисовать все дороги
   */
  renderRoads(roads: Road[]): void {
    for (const road of roads) {
      road.render(this.ctx);
    }
  }

  /**
   * Отрисовать все башни
   */
  renderTowers(towers: Tower[]): void {
    for (const tower of towers) {
      if (tower.isActive) {
        tower.render(this.ctx);
      }
    }
  }

  /**
   * Отрисовать все юниты
   */
  renderUnits(units: Unit[]): void {
    // Сортируем юнитов по Y для правильного наложения
    const sortedUnits = [...units].sort((a, b) => a.position.y - b.position.y);

    for (const unit of sortedUnits) {
      if (unit.isActive) {
        unit.render(this.ctx);
      }
    }
  }

  /**
   * Отрисовать сущность
   */
  renderEntity(entity: Entity): void {
    if (entity.isActive) {
      entity.render(this.ctx);
    }
  }

  /**
   * Отрисовать туман войны
   */
  renderFogOfWar(
    visibleAreas: Array<{ x: number; y: number; radius: number }>,
  ): void {
    if (!this.config.fogOfWar) return;

    // Создаём слой тумана
    this.ctx.save();
    this.ctx.fillStyle = FOG_COLOR;
    this.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Вырезаем видимые области
    this.ctx.globalCompositeOperation = "destination-out";

    for (const area of visibleAreas) {
      // Градиентный круг для плавного перехода
      const gradient = this.ctx.createRadialGradient(
        area.x,
        area.y,
        0,
        area.x,
        area.y,
        area.radius,
      );
      gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
      gradient.addColorStop(0.7, "rgba(0, 0, 0, 1)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(area.x, area.y, area.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  /**
   * Отрисовать статистику FPS
   */
  renderFps(fps: number, ticksPerSecond: number): void {
    if (!this.config.showFps) return;

    this.ctx.save();

    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.fillRect(5, 5, 120, 45);

    this.ctx.font = "12px monospace";
    this.ctx.fillStyle = "#00ff00";
    this.ctx.fillText(`FPS: ${fps}`, 10, 20);
    this.ctx.fillStyle = "#00ffff";
    this.ctx.fillText(`TPS: ${ticksPerSecond}`, 10, 35);

    this.ctx.restore();
  }

  /**
   * Отрисовать отладочную информацию
   */
  renderDebugInfo(info: Record<string, string | number>): void {
    if (!this.config.debugMode) return;

    this.ctx.save();

    const entries = Object.entries(info);
    const boxHeight = entries.length * 15 + 10;

    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(GAME_WIDTH - 155, 5, 150, boxHeight);

    this.ctx.font = "11px monospace";
    this.ctx.fillStyle = "#ffffff";

    entries.forEach(([key, value], index) => {
      this.ctx.fillText(`${key}: ${value}`, GAME_WIDTH - 150, 18 + index * 15);
    });

    this.ctx.restore();
  }

  /**
   * Отрисовать текст в центре экрана
   */
  renderCenterText(
    text: string,
    options: {
      fontSize?: number;
      color?: string;
      shadowColor?: string;
      offsetY?: number;
    } = {},
  ): void {
    const {
      fontSize = 48,
      color = "#00ffff",
      shadowColor = "#00ffff",
      offsetY = 0,
    } = options;

    this.ctx.save();

    this.ctx.font = `bold ${fontSize}px Arial`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    // Тень/свечение
    this.ctx.shadowColor = shadowColor;
    this.ctx.shadowBlur = 20;

    this.ctx.fillStyle = color;
    this.ctx.fillText(text, GAME_WIDTH / 2, GAME_HEIGHT / 2 + offsetY);

    this.ctx.restore();
  }

  /**
   * Отрисовать прямоугольник
   */
  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    filled: boolean = true,
  ): void {
    if (filled) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(x, y, width, height);
    } else {
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(x, y, width, height);
    }
  }

  /**
   * Отрисовать круг
   */
  drawCircle(
    x: number,
    y: number,
    radius: number,
    color: string,
    filled: boolean = true,
  ): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);

    if (filled) {
      this.ctx.fillStyle = color;
      this.ctx.fill();
    } else {
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }
  }

  /**
   * Отрисовать линию
   */
  drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    lineWidth: number = 1,
  ): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  /**
   * Отрисовать текст
   */
  drawText(
    text: string,
    x: number,
    y: number,
    options: {
      color?: string;
      fontSize?: number;
      fontFamily?: string;
      align?: CanvasTextAlign;
      baseline?: CanvasTextBaseline;
    } = {},
  ): void {
    const {
      color = "#ffffff",
      fontSize = 14,
      fontFamily = "Arial",
      align = "left",
      baseline = "top",
    } = options;

    this.ctx.font = `${fontSize}px ${fontFamily}`;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;
    this.ctx.fillText(text, x, y);
  }

  /**
   * Установить смещение камеры
   */
  setCameraOffset(x: number, y: number): void {
    this.cameraOffset.x = x;
    this.cameraOffset.y = y;
  }

  /**
   * Установить масштаб камеры
   */
  setCameraZoom(zoom: number): void {
    this.cameraZoom = Math.max(0.5, Math.min(2, zoom));
  }

  /**
   * Преобразовать экранные координаты в игровые
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;

    return {
      x: (screenX - rect.left) * scaleX + this.cameraOffset.x,
      y: (screenY - rect.top) * scaleY + this.cameraOffset.y,
    };
  }

  /**
   * Преобразовать игровые координаты в экранные
   */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / GAME_WIDTH;
    const scaleY = rect.height / GAME_HEIGHT;

    return {
      x: (worldX - this.cameraOffset.x) * scaleX + rect.left,
      y: (worldY - this.cameraOffset.y) * scaleY + rect.top,
    };
  }

  /**
   * Получить контекст рисования (для кастомной отрисовки)
   */
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /**
   * Получить canvas элемент
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Обновить настройки рендерера
   */
  updateConfig(config: Partial<RendererConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Получить текущие настройки
   */
  getConfig(): RendererConfig {
    return { ...this.config };
  }
}
