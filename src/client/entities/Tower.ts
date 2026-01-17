/**
 * Neon Arcana - Класс Tower (Башня)
 * Башни игроков - главные и вспомогательные
 */

import {
  TOWER_CONFIG,
  SUPPORT_TOWER_CONFIG,
  PLAYER_COLORS,
  UI,
} from "@shared/constants";
import { EntityId, PlayerId, TowerType, TowerState } from "@shared/types";
import { Entity, HealthComponent, CombatComponent } from "./Entity";

/**
 * Класс башни
 */
export class Tower extends Entity {
  /** Тип башни */
  public type: TowerType;

  /** ID владельца */
  public ownerId: PlayerId;

  /** Цвет игрока */
  public color: string;

  /** Компонент здоровья */
  public health: HealthComponent;

  /** Компонент боя */
  public combat: CombatComponent;

  /** Уровень башни (для главной) */
  public level: number = 1;

  /** Размер башни */
  public size: number;

  /** В процессе улучшения */
  public isUpgrading: boolean = false;

  /** Время окончания улучшения */
  public upgradeEndTime: number = 0;

  /** ID текущей цели */
  public targetId: EntityId | null = null;

  constructor(
    id: EntityId,
    type: TowerType,
    ownerId: PlayerId,
    playerIndex: number,
    x: number,
    y: number,
  ) {
    super(id, x, y);

    this.type = type;
    this.ownerId = ownerId;
    this.color = PLAYER_COLORS[playerIndex] ?? PLAYER_COLORS[0]!;
    this.tag = "tower";

    // Настройка в зависимости от типа
    if (type === TowerType.MAIN) {
      const config = TOWER_CONFIG;
      this.health = new HealthComponent(config.BASE_HP);
      this.combat = new CombatComponent(config.BASE_DPS, config.ATTACK_RANGE);
      this.size = config.SIZE;
    } else {
      // Вспомогательные башни
      const configs = SUPPORT_TOWER_CONFIG.TYPES;
      let config;

      switch (type) {
        case TowerType.DEFENSIVE:
          config = configs.DEFENSIVE;
          break;
        case TowerType.BUFF:
          config = configs.BUFF;
          break;
        case TowerType.ECONOMIC:
          config = configs.ECONOMIC;
          break;
        default:
          config = configs.DEFENSIVE;
      }

      this.health = new HealthComponent(config.hp);
      this.combat = new CombatComponent(
        config.dps,
        "attackRange" in config ? config.attackRange : 0,
      );
      this.size = 40; // Вспомогательные башни меньше
    }
  }

  /**
   * Создать из состояния (для синхронизации)
   */
  static fromState(state: TowerState, playerIndex: number): Tower {
    const tower = new Tower(
      state.id,
      state.type,
      state.ownerId,
      playerIndex,
      state.position.x,
      state.position.y,
    );

    tower.health.current = state.hp;
    tower.health.max = state.maxHp;
    tower.combat.dps = state.dps;
    tower.combat.attackRange = state.attackRange;
    tower.level = state.level;
    tower.isUpgrading = state.isUpgrading;
    tower.upgradeEndTime = state.upgradeEndTime;
    tower.targetId = state.targetId;

    return tower;
  }

  /**
   * Обновление башни
   */
  update(dt: number): void {
    // Обновляем боевой компонент
    this.combat.update(dt);

    // Если башня в процессе улучшения, не атакуем
    if (this.isUpgrading) {
      return;
    }

    // Логика атаки будет добавлена при интеграции с Game
  }

  /**
   * Отрисовка башни
   */
  render(ctx: CanvasRenderingContext2D): void {
    const x = this.position.x;
    const y = this.position.y;
    const size = this.size;
    const halfSize = size / 2;

    ctx.save();

    // Свечение (glow effect)
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.isUpgrading ? 5 : 15;

    // Основание башни (шестиугольник)
    this.drawHexagon(ctx, x, y, halfSize, this.color);

    // Внутренний слой
    const innerSize = halfSize * 0.7;
    ctx.shadowBlur = 0;
    this.drawHexagon(ctx, x, y, innerSize, this.darkenColor(this.color, 0.5));

    // Ядро башни
    const coreSize = halfSize * 0.3;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(x, y, coreSize, 0, Math.PI * 2);
    ctx.fill();

    // Индикатор улучшения
    if (this.isUpgrading) {
      this.drawUpgradeIndicator(ctx, x, y, halfSize);
    }

    // Health bar
    this.drawHealthBar(ctx, x, y - halfSize - UI.HEALTH_BAR_OFFSET);

    // Уровень башни (для главной)
    if (this.type === TowerType.MAIN && this.level > 1) {
      this.drawLevel(ctx, x, y);
    }

    // Радиус атаки (для отладки, можно закомментировать)
    // this.drawAttackRange(ctx, x, y);

    ctx.restore();
  }

  /**
   * Нарисовать шестиугольник
   */
  private drawHexagon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
  ): void {
    ctx.fillStyle = color;
    ctx.beginPath();

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.closePath();
    ctx.fill();

    // Обводка
    ctx.strokeStyle = this.lightenColor(color, 0.3);
    ctx.lineWidth = 2;
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
    const barWidth = this.size;
    const barHeight = UI.HEALTH_BAR_HEIGHT;
    const barX = x - barWidth / 2;
    const barY = y;

    // Фон
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Здоровье
    const healthWidth = barWidth * this.health.percentage;
    const healthColor = this.getHealthColor();
    ctx.fillStyle = healthColor;
    ctx.fillRect(barX, barY, healthWidth, barHeight);

    // Обводка
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
  }

  /**
   * Получить цвет здоровья в зависимости от процента
   */
  private getHealthColor(): string {
    const percentage = this.health.percentage;

    if (percentage > 0.6) {
      return "#00ff00"; // Зелёный
    } else if (percentage > 0.3) {
      return "#ffff00"; // Жёлтый
    } else {
      return "#ff0000"; // Красный
    }
  }

  /**
   * Нарисовать индикатор улучшения
   */
  private drawUpgradeIndicator(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
  ): void {
    // Вращающееся кольцо
    const time = Date.now() / 1000;
    const rotation = time * 2;

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.lineDashOffset = -time * 50;

    ctx.beginPath();
    ctx.arc(x, y, radius + 5, rotation, rotation + Math.PI * 1.5);
    ctx.stroke();

    ctx.setLineDash([]);
  }

  /**
   * Нарисовать уровень башни
   */
  private drawLevel(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`Lv${this.level}`, x, y + this.size / 2 + 15);
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
   * Улучшить башню
   */
  upgrade(): boolean {
    if (this.type !== TowerType.MAIN) return false;
    if (this.level >= TOWER_CONFIG.UPGRADES.length) return false;
    if (this.isUpgrading) return false;

    const nextLevel = TOWER_CONFIG.UPGRADES[this.level];
    if (!nextLevel) return false;

    this.isUpgrading = true;
    this.upgradeEndTime = Date.now() + nextLevel.upgradeTime * 1000;

    return true;
  }

  /**
   * Завершить улучшение
   */
  completeUpgrade(): void {
    if (!this.isUpgrading) return;

    const newLevelConfig = TOWER_CONFIG.UPGRADES[this.level];
    if (!newLevelConfig) return;

    this.level += 1;
    this.health.setMax(newLevelConfig.hp, false);
    this.combat.dps = newLevelConfig.dps;
    this.isUpgrading = false;
    this.upgradeEndTime = 0;
  }

  /**
   * Получить урон
   */
  takeDamage(amount: number): boolean {
    return this.health.takeDamage(amount);
  }

  /**
   * Проверка жизни
   */
  get isAlive(): boolean {
    return this.health.isAlive;
  }

  /**
   * Сериализация состояния
   */
  toState(): TowerState {
    return {
      id: this.id,
      type: this.type,
      ownerId: this.ownerId,
      position: this.position.toObject(),
      hp: this.health.current,
      maxHp: this.health.max,
      dps: this.combat.dps,
      level: this.level,
      attackRange: this.combat.attackRange,
      isUpgrading: this.isUpgrading,
      upgradeEndTime: this.upgradeEndTime,
      targetId: this.targetId,
    };
  }
}
