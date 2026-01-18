/**
 * Neon Arcana - Класс ResourcePoint (Ресурсная точка)
 * Ресурсные точки на карте с нейтральными защитниками
 */

import {
  RESOURCE_POINT_CONFIG,
  NEUTRAL_COLOR,
  PLAYER_COLORS,
} from "@shared/constants";
import {
  EntityId,
  PlayerId,
  ResourcePointId,
  ResourcePointType,
  ResourcePointState,
  NeutralGuardian,
  generateId,
} from "@shared/types";
import { Vector2 } from "@shared/Vector2";
import { Entity, HealthComponent } from "./Entity";

/**
 * Конфигурация для типа ресурсной точки
 */
interface ResourcePointTypeConfig {
  name: string;
  incomePerSec?: number;
  oneTimeBonus?: number;
  guardianCount: number;
  guardianHp: number;
  guardianDps: number;
  respawnTime: number;
  maxGuards: number;
  guardRegenPerSec: number;
}

/**
 * Класс ресурсной точки
 */
export class ResourcePoint extends Entity {
  /** Тип ресурсной точки */
  public readonly pointType: ResourcePointType;

  /** Конфигурация */
  public readonly config: ResourcePointTypeConfig;

  /** ID владельца (null = нейтральная/не захвачена) */
  public ownerId: PlayerId | null = null;

  /** Индекс игрока-владельца (для цвета) */
  public ownerIndex: number = -1;

  /** Нейтральные защитники */
  public guardians: NeutralGuardianEntity[] = [];

  /** ID юнитов игрока, охраняющих точку */
  public guardUnitIds: EntityId[] = [];

  /** Время следующего респавна нейтралов */
  public nextRespawnTime: number = 0;

  /** Количество респавнов (для escalation - +10% HP каждый раз) */
  public respawnCount: number = 0;

  /** Был ли выдан одноразовый бонус (для NEUTRAL_CAMP) */
  public bonusCollected: boolean = false;

  /** Размер точки для рендеринга */
  public readonly size: number = 40;

  constructor(
    id: ResourcePointId,
    type: ResourcePointType,
    x: number,
    y: number,
  ) {
    super(id, x, y);

    this.pointType = type;
    this.tag = "resource_point";

    // Получаем конфигурацию
    switch (type) {
      case ResourcePointType.CRYSTAL_MINE:
        this.config = RESOURCE_POINT_CONFIG.CRYSTAL_MINE;
        this.size = 50;
        break;
      case ResourcePointType.SMALL_CRYSTAL:
        this.config = RESOURCE_POINT_CONFIG.SMALL_CRYSTAL;
        this.size = 35;
        break;
      case ResourcePointType.NEUTRAL_CAMP:
        this.config = RESOURCE_POINT_CONFIG.NEUTRAL_CAMP;
        this.size = 40;
        break;
      default:
        this.config = RESOURCE_POINT_CONFIG.SMALL_CRYSTAL;
    }

    // Создаём нейтральных защитников
    this.spawnGuardians();
  }

  /**
   * Создать из состояния (для синхронизации)
   */
  static fromState(state: ResourcePointState): ResourcePoint {
    const point = new ResourcePoint(
      state.id,
      state.type,
      state.position.x,
      state.position.y,
    );

    point.ownerId = state.ownerId;
    point.nextRespawnTime = state.nextRespawnTime;
    point.respawnCount = state.respawnCount;
    point.guardUnitIds = [...state.guardUnitIds];

    // Восстанавливаем защитников
    point.guardians = state.guardians.map((g) =>
      NeutralGuardianEntity.fromState(g),
    );

    return point;
  }

  /**
   * Создать нейтральных защитников
   */
  private spawnGuardians(): void {
    this.guardians = [];

    const count = this.config.guardianCount;
    const hpMultiplier = 1 + this.respawnCount * 0.1; // +10% за каждый респавн

    for (let i = 0; i < count; i++) {
      // Размещаем защитников вокруг точки
      const angle = (Math.PI * 2 * i) / count;
      const radius = this.size * 0.8;
      const x = this.position.x + Math.cos(angle) * radius;
      const y = this.position.y + Math.sin(angle) * radius;

      const guardian = new NeutralGuardianEntity(
        generateId(),
        Math.round(this.config.guardianHp * hpMultiplier),
        this.config.guardianDps,
        x,
        y,
      );

      this.guardians.push(guardian);
    }
  }

  /**
   * Обновление ресурсной точки
   */
  update(dt: number): void {
    // Обновляем защитников
    for (const guardian of this.guardians) {
      guardian.update(dt);
    }

    // Убираем мёртвых защитников
    this.guardians = this.guardians.filter((g) => g.isAlive);

    // Регенерация HP охранников игрока
    if (this.ownerId && this.config.guardRegenPerSec > 0) {
      // Регенерация будет применяться к юнитам в Game.ts
    }

    // Проверка респавна нейтралов
    if (
      this.guardians.length === 0 &&
      this.ownerId === null &&
      this.nextRespawnTime > 0
    ) {
      const now = Date.now();
      if (now >= this.nextRespawnTime) {
        this.respawnCount++;
        this.spawnGuardians();
        this.nextRespawnTime = 0;
      }
    }
  }

  /**
   * Отрисовка ресурсной точки
   */
  render(ctx: CanvasRenderingContext2D): void {
    const x = this.position.x;
    const y = this.position.y;

    ctx.save();

    // Определяем цвет
    const color = this.getColor();

    // Рисуем в зависимости от типа
    switch (this.pointType) {
      case ResourcePointType.CRYSTAL_MINE:
        this.drawCrystalMine(ctx, x, y, color);
        break;
      case ResourcePointType.SMALL_CRYSTAL:
        this.drawSmallCrystal(ctx, x, y, color);
        break;
      case ResourcePointType.NEUTRAL_CAMP:
        this.drawNeutralCamp(ctx, x, y, color);
        break;
    }

    // Рисуем защитников
    for (const guardian of this.guardians) {
      guardian.render(ctx);
    }

    // Индикатор дохода
    this.drawIncomeIndicator(ctx, x, y);

    ctx.restore();
  }

  /**
   * Получить цвет в зависимости от владельца
   */
  private getColor(): string {
    if (this.ownerId === null) {
      return NEUTRAL_COLOR;
    }
    return PLAYER_COLORS[this.ownerIndex] ?? NEUTRAL_COLOR;
  }

  /**
   * Нарисовать кристаллическую шахту (большая)
   */
  private drawCrystalMine(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
  ): void {
    const size = this.size;

    // Свечение
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;

    // Основание (круг)
    ctx.fillStyle = this.darkenColor(color, 0.3);
    ctx.beginPath();
    ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Кристаллы
    this.drawCrystal(ctx, x, y - size * 0.3, size * 0.4, color);
    this.drawCrystal(ctx, x - size * 0.25, y + size * 0.15, size * 0.3, color);
    this.drawCrystal(ctx, x + size * 0.25, y + size * 0.1, size * 0.35, color);

    // Обводка зоны захвата
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Нарисовать малый кристалл
   */
  private drawSmallCrystal(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
  ): void {
    const size = this.size;

    // Свечение
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;

    // Основание
    ctx.fillStyle = this.darkenColor(color, 0.3);
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Кристалл
    this.drawCrystal(ctx, x, y, size * 0.5, color);

    // Обводка
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(x, y, size * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Нарисовать нейтральный лагерь
   */
  private drawNeutralCamp(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
  ): void {
    const size = this.size;

    // Свечение
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    // Палатка/шатёр (треугольник)
    ctx.fillStyle = this.darkenColor(color, 0.5);
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.4);
    ctx.lineTo(x - size * 0.4, y + size * 0.3);
    ctx.lineTo(x + size * 0.4, y + size * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    // Вход
    ctx.fillStyle = this.darkenColor(color, 0.2);
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.3);
    ctx.lineTo(x - size * 0.15, y + size * 0.3);
    ctx.lineTo(x, y);
    ctx.lineTo(x + size * 0.15, y + size * 0.3);
    ctx.closePath();
    ctx.fill();

    // Флаг
    ctx.fillStyle = color;
    ctx.fillRect(x + size * 0.2, y - size * 0.5, 2, size * 0.4);
    ctx.beginPath();
    ctx.moveTo(x + size * 0.22, y - size * 0.5);
    ctx.lineTo(x + size * 0.22, y - size * 0.3);
    ctx.lineTo(x + size * 0.4, y - size * 0.4);
    ctx.closePath();
    ctx.fill();

    // Значок награды (если не собран)
    if (!this.bonusCollected && this.config.oneTimeBonus) {
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`+${this.config.oneTimeBonus}`, x, y - size * 0.6);
    }
  }

  /**
   * Нарисовать кристалл
   */
  private drawCrystal(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    height: number,
    color: string,
  ): void {
    const width = height * 0.4;

    // Тело кристалла
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - height / 2); // Верх
    ctx.lineTo(x + width / 2, y); // Правый угол
    ctx.lineTo(x, y + height / 2); // Низ
    ctx.lineTo(x - width / 2, y); // Левый угол
    ctx.closePath();
    ctx.fill();

    // Блик
    ctx.fillStyle = this.lightenColor(color, 0.5);
    ctx.beginPath();
    ctx.moveTo(x, y - height / 2);
    ctx.lineTo(x - width / 4, y - height / 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + width / 4, y - height / 4);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Нарисовать индикатор дохода
   */
  private drawIncomeIndicator(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    const income = this.config.incomePerSec;

    if (income && this.ownerId) {
      ctx.fillStyle = "#00ff00";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`+${income}/s`, x, y + this.size + 10);
    }
  }

  /**
   * Попытаться захватить точку
   * @returns true если захват успешен
   */
  capture(playerId: PlayerId, playerIndex: number): boolean {
    // Нельзя захватить, если есть нейтральные защитники
    if (this.guardians.length > 0) {
      return false;
    }

    // Нельзя захватить, если уже владеешь
    if (this.ownerId === playerId) {
      return false;
    }

    // Нельзя захватить нейтральный лагерь (только бонус)
    if (this.pointType === ResourcePointType.NEUTRAL_CAMP) {
      if (!this.bonusCollected) {
        this.bonusCollected = true;
        // Бонус будет выдан в Game.ts
        return true;
      }
      return false;
    }

    // Захват!
    this.ownerId = playerId;
    this.ownerIndex = playerIndex;
    this.guardUnitIds = [];

    return true;
  }

  /**
   * Потерять контроль над точкой
   */
  loseControl(): void {
    this.ownerId = null;
    this.ownerIndex = -1;
    this.guardUnitIds = [];

    // Запланировать респавн нейтралов
    this.nextRespawnTime = Date.now() + this.config.respawnTime * 1000;
  }

  /**
   * Добавить юнита в охрану
   */
  addGuard(unitId: EntityId): boolean {
    if (this.guardUnitIds.length >= this.config.maxGuards) {
      return false;
    }

    if (this.guardUnitIds.includes(unitId)) {
      return false;
    }

    this.guardUnitIds.push(unitId);
    return true;
  }

  /**
   * Убрать юнита из охраны
   */
  removeGuard(unitId: EntityId): void {
    const index = this.guardUnitIds.indexOf(unitId);
    if (index !== -1) {
      this.guardUnitIds.splice(index, 1);
    }
  }

  /**
   * Получить текущий доход в секунду
   */
  getIncomePerSec(): number {
    if (this.ownerId === null) {
      return 0;
    }
    return this.config.incomePerSec ?? 0;
  }

  /**
   * Получить одноразовый бонус (для NEUTRAL_CAMP)
   */
  getOneTimeBonus(): number {
    if (this.bonusCollected) {
      return 0;
    }
    return this.config.oneTimeBonus ?? 0;
  }

  /**
   * Проверить, можно ли захватить точку
   */
  canBeCaptured(): boolean {
    return this.guardians.length === 0;
  }

  /**
   * Проверить, есть ли защитники
   */
  hasDefenders(): boolean {
    return this.guardians.length > 0 || this.guardUnitIds.length > 0;
  }

  /**
   * Затемнить цвет
   */
  private darkenColor(color: string, factor: number): string {
    const hex = color.replace("#", "");
    const r = Math.floor(parseInt(hex.substring(0, 2), 16) * factor);
    const g = Math.floor(parseInt(hex.substring(2, 4), 16) * factor);
    const b = Math.floor(parseInt(hex.substring(4, 6), 16) * factor);
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Осветлить цвет
   */
  private lightenColor(color: string, factor: number): string {
    const hex = color.replace("#", "");
    const r = Math.min(
      255,
      Math.floor(parseInt(hex.substring(0, 2), 16) * (1 + factor)),
    );
    const g = Math.min(
      255,
      Math.floor(parseInt(hex.substring(2, 4), 16) * (1 + factor)),
    );
    const b = Math.min(
      255,
      Math.floor(parseInt(hex.substring(4, 6), 16) * (1 + factor)),
    );
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Сериализация состояния
   */
  toState(): ResourcePointState {
    return {
      id: this.id,
      type: this.pointType,
      position: this.position.toObject(),
      ownerId: this.ownerId,
      guardians: this.guardians.map((g) => g.toState()),
      guardUnitIds: [...this.guardUnitIds],
      nextRespawnTime: this.nextRespawnTime,
      respawnCount: this.respawnCount,
    };
  }
}

/**
 * Класс нейтрального защитника
 */
export class NeutralGuardianEntity {
  /** Уникальный ID */
  public readonly id: EntityId;

  /** Позиция */
  public position: Vector2;

  /** Компонент здоровья */
  public health: HealthComponent;

  /** Урон в секунду */
  public dps: number;

  /** Цель атаки */
  public targetId: EntityId | null = null;

  /** Время до следующей атаки */
  private attackCooldown: number = 0;

  /** Радиус патрулирования */
  public patrolRadius: number = 60;

  /** Радиус агрессии */
  public aggroRadius: number = 100;

  /** Размер для рендеринга */
  public size: number = 25;

  constructor(id: EntityId, maxHp: number, dps: number, x: number, y: number) {
    this.id = id;
    this.position = new Vector2(x, y);
    this.health = new HealthComponent(maxHp);
    this.dps = dps;
  }

  /**
   * Создать из состояния
   */
  static fromState(state: NeutralGuardian): NeutralGuardianEntity {
    const guardian = new NeutralGuardianEntity(
      state.id,
      state.maxHp,
      state.dps,
      state.position.x,
      state.position.y,
    );
    guardian.health.current = state.hp;
    guardian.targetId = state.targetId;
    return guardian;
  }

  /**
   * Обновление защитника
   */
  update(dt: number): void {
    // Кулдаун атаки
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }
  }

  /**
   * Отрисовка защитника
   */
  render(ctx: CanvasRenderingContext2D): void {
    const x = this.position.x;
    const y = this.position.y;
    const size = this.size;

    ctx.save();

    // Тело (ромб)
    ctx.fillStyle = NEUTRAL_COLOR;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.7, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.7, y);
    ctx.closePath();
    ctx.fill();

    // Глаза
    ctx.fillStyle = "#ff0000";
    ctx.beginPath();
    ctx.arc(x - 3, y - 3, 2, 0, Math.PI * 2);
    ctx.arc(x + 3, y - 3, 2, 0, Math.PI * 2);
    ctx.fill();

    // Health bar
    this.drawHealthBar(ctx, x, y - size - 8);

    ctx.restore();
  }

  /**
   * Нарисовать health bar
   */
  private drawHealthBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    const barWidth = this.size * 2;
    const barHeight = 4;
    const barX = x - barWidth / 2;
    const barY = y;

    // Фон
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Здоровье
    const healthWidth = barWidth * this.health.percentage;
    ctx.fillStyle = "#ff6600";
    ctx.fillRect(barX, barY, healthWidth, barHeight);

    // Обводка
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
  }

  /**
   * Получить урон
   */
  takeDamage(amount: number): boolean {
    return this.health.takeDamage(amount);
  }

  /**
   * Атаковать цель
   */
  attack(): number {
    if (this.attackCooldown > 0) return 0;
    this.attackCooldown = 1; // 1 секунда между атаками
    return this.dps;
  }

  /**
   * Можно ли атаковать
   */
  canAttack(): boolean {
    return this.attackCooldown <= 0;
  }

  /**
   * Жив ли защитник
   */
  get isAlive(): boolean {
    return this.health.isAlive;
  }

  /**
   * Расстояние до позиции
   */
  distanceTo(pos: Vector2): number {
    return this.position.distanceTo(pos);
  }

  /**
   * Сериализация состояния
   */
  toState(): NeutralGuardian {
    return {
      id: this.id,
      hp: this.health.current,
      maxHp: this.health.max,
      dps: this.dps,
      position: this.position.toObject(),
      targetId: this.targetId,
    };
  }
}
