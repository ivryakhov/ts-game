/**
 * Neon Arcana - Класс Unit (Юнит)
 * Боевые юниты игроков
 */

import { Vector2 } from "@shared/Vector2";
import {
  UnitType,
  UNIT_CONFIG,
  BASE_MOVEMENT_SPEED,
  UNIT_SIZE,
  PLAYER_COLORS,
  UI,
  COUNTER_BONUSES,
} from "@shared/constants";
import {
  EntityId,
  PlayerId,
  RoadId,
  ResourcePointId,
  UnitState,
  UnitBehaviorState,
  Waypoint,
} from "@shared/types";
import {
  Entity,
  HealthComponent,
  CombatComponent,
  MovementComponent,
} from "./Entity";

// Vector2 is used for creating movement targets
void Vector2;

/**
 * Класс юнита
 */
export class Unit extends Entity {
  /** Тип юнита */
  public unitType: UnitType;

  /** ID владельца */
  public ownerId: PlayerId;

  /** Цвет игрока */
  public color: string;

  /** Компонент здоровья */
  public health: HealthComponent;

  /** Компонент боя */
  public combat: CombatComponent;

  /** Компонент движения */
  public movement: MovementComponent;

  /** Размер юнита */
  public size: number = UNIT_SIZE;

  /** Текущее состояние поведения */
  public state: UnitBehaviorState = UnitBehaviorState.SPAWNING;

  /** ID целевой дороги */
  public targetRoadId: RoadId = "";

  /** ID целевой башни */
  public targetTowerId: EntityId = "";

  /** Текущий индекс путевой точки */
  public currentWaypointIndex: number = 0;

  /** Путевые точки для движения */
  public waypoints: Waypoint[] = [];

  /** ID текущей цели (враг) */
  public targetId: EntityId | null = null;

  /** ID цели лечения (для поддержки) */
  public healTargetId: EntityId | null = null;

  /** ID охраняемой ресурсной точки */
  public guardingPointId: ResourcePointId | null = null;

  /** Отзыв охраны в процессе */
  public isRecalling: boolean = false;

  /** Время окончания отзыва */
  public recallEndTime: number = 0;

  /** Время появления (для анимации спавна) */
  public spawnTime: number = 0;

  /** Индекс игрока (для цвета) */
  private playerIndex: number;

  /** Радиус видимости */
  public visionRange: number;

  /** Лечение в секунду (для поддержки) */
  public healPerSec: number = 0;

  /** Радиус лечения (для поддержки) */
  public healRange: number = 0;

  /**
   * Улучшенные характеристики (опционально)
   */
  public upgradedStats?: { hp: number; dps: number; speed: number };

  constructor(
    id: EntityId,
    unitType: UnitType,
    ownerId: PlayerId,
    playerIndex: number,
    x: number,
    y: number,
    upgradedStats?: { hp: number; dps: number; speed: number },
  ) {
    super(id, x, y);

    this.unitType = unitType;
    this.ownerId = ownerId;
    this.playerIndex = playerIndex;
    void this.playerIndex; // Used for future extensions
    this.color = PLAYER_COLORS[playerIndex] ?? PLAYER_COLORS[0]!;
    this.tag = "unit";
    this.upgradedStats = upgradedStats;

    // Получаем конфигурацию юнита
    const config = UNIT_CONFIG[unitType];

    // Используем улучшенные характеристики, если они переданы
    const hp = upgradedStats?.hp ?? config.hp;
    const dps = upgradedStats?.dps ?? config.dps;
    const speedPercent = upgradedStats?.speed ?? config.speed;

    // Инициализация компонентов
    this.health = new HealthComponent(hp);
    this.combat = new CombatComponent(dps, config.range);

    // Скорость: базовая * процент от конфига (или улучшенный процент)
    const speed = (BASE_MOVEMENT_SPEED * speedPercent) / 100;
    this.movement = new MovementComponent(speed);

    this.visionRange = config.visionRange;

    // Специфичные параметры для поддержки
    if (unitType === UnitType.SUPPORT && "healPerSec" in config) {
      this.healPerSec = config.healPerSec;
      this.healRange = config.healRange;
    }

    this.spawnTime = Date.now();
  }

  /**
   * Создать из состояния (для синхронизации)
   */
  static fromState(state: UnitState, playerIndex: number): Unit {
    const unit = new Unit(
      state.id,
      state.type,
      state.ownerId,
      playerIndex,
      state.position.x,
      state.position.y,
    );

    unit.health.current = state.hp;
    unit.health.max = state.maxHp;
    unit.combat.dps = state.dps;
    unit.combat.attackRange = state.attackRange;
    unit.movement.speed = state.speed;
    unit.state = state.state;
    unit.targetRoadId = state.targetRoadId;
    unit.targetTowerId = state.targetTowerId;
    unit.currentWaypointIndex = state.currentWaypointIndex;
    unit.targetId = state.targetId;
    unit.healTargetId = state.healTargetId;
    unit.guardingPointId = state.guardingPointId;
    unit.isRecalling = state.isRecalling;
    unit.recallEndTime = state.recallEndTime;

    return unit;
  }

  /**
   * Обновление юнита
   */
  update(dt: number): void {
    // Обновляем компонент боя
    this.combat.update(dt);

    switch (this.state) {
      case UnitBehaviorState.SPAWNING:
        this.updateSpawning(dt);
        break;

      case UnitBehaviorState.MOVING:
        this.updateMoving(dt);
        break;

      case UnitBehaviorState.FIGHTING:
        this.updateFighting(dt);
        break;

      case UnitBehaviorState.GUARDING:
        this.updateGuarding(dt);
        break;

      case UnitBehaviorState.DEAD:
        // Ничего не делаем
        break;
    }
  }

  /**
   * Обновление состояния спавна
   */
  private updateSpawning(_dt: number): void {
    const spawnDuration = 1000; // 1 секунда
    if (Date.now() - this.spawnTime >= spawnDuration) {
      this.state = UnitBehaviorState.MOVING;
    }
  }

  /**
   * Обновление движения
   */
  private updateMoving(dt: number): void {
    if (this.waypoints.length === 0) return;

    const currentWaypoint = this.waypoints[this.currentWaypointIndex];
    if (!currentWaypoint) return;

    const target = new Vector2(
      currentWaypoint.position.x,
      currentWaypoint.position.y,
    );
    const reached = this.movement.moveTowards(this, target, dt);

    if (reached) {
      this.currentWaypointIndex++;

      // Достигли конца пути
      if (this.currentWaypointIndex >= this.waypoints.length) {
        this.currentWaypointIndex = this.waypoints.length - 1;

        // Если юнит шёл к ресурсной точке (не к башне), остановиться
        if (this.guardingPointId && !this.targetTowerId) {
          // Юнит достиг ресурсной точки - ждём захвата в Game.ts
          this.movement.stop();
        }
      }
    }
  }

  /**
   * Обновление боя
   */
  private updateFighting(_dt: number): void {
    // Логика боя будет обрабатываться в Game классе
    // Здесь только остановка движения
    this.movement.stop();
  }

  /**
   * Обновление охраны
   */
  private updateGuarding(_dt: number): void {
    // Проверяем, закончился ли отзыв
    if (this.isRecalling && Date.now() >= this.recallEndTime) {
      this.isRecalling = false;
      this.guardingPointId = null;
      this.state = UnitBehaviorState.MOVING;
    }
  }

  /**
   * Отрисовка юнита
   */
  render(ctx: CanvasRenderingContext2D): void {
    const x = this.position.x;
    const y = this.position.y;

    ctx.save();

    // Эффект спавна
    if (this.state === UnitBehaviorState.SPAWNING) {
      const progress = Math.min(1, (Date.now() - this.spawnTime) / 1000);
      ctx.globalAlpha = progress;
    }

    // Свечение
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;

    // Рисуем юнита в зависимости от типа
    switch (this.unitType) {
      case UnitType.SCOUT:
        this.drawScout(ctx, x, y);
        break;
      case UnitType.TANK:
        this.drawTank(ctx, x, y);
        break;
      case UnitType.RANGER:
        this.drawRanger(ctx, x, y);
        break;
      case UnitType.SUPPORT:
        this.drawSupport(ctx, x, y);
        break;
    }

    // Health bar
    if (this.health.percentage < 1) {
      this.drawHealthBar(ctx, x, y - this.size / 2 - UI.HEALTH_BAR_OFFSET);
    }

    // Индикатор состояния
    this.drawStateIndicator(ctx, x, y);

    ctx.restore();
  }

  /**
   * Нарисовать разведчика (треугольник)
   */
  private drawScout(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const size = this.size;

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(x, y - size / 2);
    ctx.lineTo(x + size / 2, y + size / 2);
    ctx.lineTo(x - size / 2, y + size / 2);
    ctx.closePath();
    ctx.fill();

    // Обводка
    ctx.strokeStyle = this.lightenColor(this.color, 0.3);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /**
   * Нарисовать танка (квадрат со скошенными углами)
   */
  private drawTank(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const size = this.size * 1.2; // Танк чуть больше
    const half = size / 2;
    const corner = size / 4;

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(x - half + corner, y - half);
    ctx.lineTo(x + half - corner, y - half);
    ctx.lineTo(x + half, y - half + corner);
    ctx.lineTo(x + half, y + half - corner);
    ctx.lineTo(x + half - corner, y + half);
    ctx.lineTo(x - half + corner, y + half);
    ctx.lineTo(x - half, y + half - corner);
    ctx.lineTo(x - half, y - half + corner);
    ctx.closePath();
    ctx.fill();

    // Внутренний квадрат
    ctx.fillStyle = this.darkenColor(this.color, 0.6);
    const innerSize = size * 0.4;
    ctx.fillRect(x - innerSize / 2, y - innerSize / 2, innerSize, innerSize);

    // Обводка
    ctx.strokeStyle = this.lightenColor(this.color, 0.3);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /**
   * Нарисовать стрелка (ромб)
   */
  private drawRanger(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    const size = this.size;
    const half = size / 2;

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(x, y - half);
    ctx.lineTo(x + half, y);
    ctx.lineTo(x, y + half);
    ctx.lineTo(x - half, y);
    ctx.closePath();
    ctx.fill();

    // Обводка
    ctx.strokeStyle = this.lightenColor(this.color, 0.3);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Точка в центре (прицел)
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Нарисовать поддержку (круг с крестом)
   */
  private drawSupport(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    const radius = this.size / 2;

    // Круг
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Обводка
    ctx.strokeStyle = this.lightenColor(this.color, 0.3);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Крест (символ лечения)
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 0.5);
    ctx.lineTo(x, y + radius * 0.5);
    ctx.moveTo(x - radius * 0.5, y);
    ctx.lineTo(x + radius * 0.5, y);
    ctx.stroke();
  }

  /**
   * Нарисовать health bar
   */
  private drawHealthBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    const barWidth = this.size * 1.5;
    const barHeight = 4;
    const barX = x - barWidth / 2;
    const barY = y;

    // Фон
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Здоровье
    const healthWidth = barWidth * this.health.percentage;
    ctx.fillStyle = this.getHealthColor();
    ctx.fillRect(barX, barY, healthWidth, barHeight);
  }

  /**
   * Нарисовать индикатор состояния
   */
  private drawStateIndicator(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    // Индикатор боя
    if (this.state === UnitBehaviorState.FIGHTING) {
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, this.size / 2 + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Индикатор охраны
    if (this.state === UnitBehaviorState.GUARDING) {
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, this.size / 2 + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Индикатор отзыва
    if (this.isRecalling) {
      const progress = 1 - (this.recallEndTime - Date.now()) / 3000;
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        x,
        y,
        this.size / 2 + 8,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * progress,
      );
      ctx.stroke();
    }
  }

  /**
   * Получить цвет здоровья
   */
  private getHealthColor(): string {
    const percentage = this.health.percentage;
    if (percentage > 0.6) return "#00ff00";
    if (percentage > 0.3) return "#ffff00";
    return "#ff0000";
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
   * Начать бой
   */
  startFighting(targetId: EntityId): void {
    this.state = UnitBehaviorState.FIGHTING;
    this.targetId = targetId;
    this.movement.stop();
  }

  /**
   * Закончить бой
   */
  stopFighting(): void {
    if (this.guardingPointId) {
      this.state = UnitBehaviorState.GUARDING;
    } else {
      this.state = UnitBehaviorState.MOVING;
    }
    this.targetId = null;
  }

  /**
   * Начать охрану
   */
  startGuarding(pointId: ResourcePointId): void {
    this.state = UnitBehaviorState.GUARDING;
    this.guardingPointId = pointId;
    this.movement.stop();
  }

  /**
   * Отозвать из охраны
   */
  recallFromGuarding(recallDuration: number = 3000): void {
    this.isRecalling = true;
    this.recallEndTime = Date.now() + recallDuration;
  }

  /**
   * Получить урон
   */
  takeDamage(amount: number): boolean {
    const died = this.health.takeDamage(amount);
    if (died) {
      this.state = UnitBehaviorState.DEAD;
      this.isActive = false;
    }
    return died;
  }

  /**
   * Вылечить
   */
  heal(amount: number): void {
    this.health.heal(amount);
  }

  /**
   * Получить бонус урона против типа юнита
   */
  getDamageMultiplierAgainst(targetType: UnitType): number {
    const bonuses = COUNTER_BONUSES[this.unitType];
    return bonuses[targetType] ?? 1;
  }

  /**
   * Атаковать цель
   * @returns Урон, который был нанесён
   */
  attackTarget(target: Unit | null): number {
    if (!target || !this.combat.canAttack()) return 0;

    const baseDamage = this.combat.attack();
    if (baseDamage === 0) return 0;

    const multiplier = this.getDamageMultiplierAgainst(target.unitType);
    return baseDamage * multiplier;
  }

  /**
   * Проверка жизни
   */
  get isAlive(): boolean {
    return this.health.isAlive;
  }

  /**
   * Проверка, может ли атаковать цель (в радиусе)
   */
  canAttackTarget(target: Entity): boolean {
    return this.isInRange(target, this.combat.attackRange);
  }

  /**
   * Сериализация состояния
   */
  toState(): UnitState {
    return {
      id: this.id,
      type: this.unitType,
      ownerId: this.ownerId,
      position: this.position.toObject(),
      hp: this.health.current,
      maxHp: this.health.max,
      dps: this.combat.dps,
      speed: this.movement.speed,
      attackRange: this.combat.attackRange,
      targetRoadId: this.targetRoadId,
      targetTowerId: this.targetTowerId,
      currentWaypointIndex: this.currentWaypointIndex,
      state: this.state,
      targetId: this.targetId,
      healTargetId: this.healTargetId,
      guardingPointId: this.guardingPointId,
      isRecalling: this.isRecalling,
      recallEndTime: this.recallEndTime,
    };
  }
}
