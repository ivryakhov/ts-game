/**
 * Neon Arcana - Базовый класс Entity
 * Все игровые объекты наследуются от этого класса
 */

import { Vector2 } from '@shared/Vector2';
import { EntityId, generateId } from '@shared/types';

/**
 * Базовый класс для всех игровых сущностей
 */
export abstract class Entity {
  /** Уникальный идентификатор */
  public readonly id: EntityId;

  /** Позиция в мире */
  public position: Vector2;

  /** Активна ли сущность (false = будет удалена) */
  public isActive: boolean = true;

  /** Тег для группировки сущностей */
  public tag: string = '';

  constructor(id?: EntityId, x: number = 0, y: number = 0) {
    this.id = id ?? generateId();
    this.position = new Vector2(x, y);
  }

  /**
   * Обновление состояния сущности
   * @param dt Время с последнего обновления в секундах
   */
  abstract update(dt: number): void;

  /**
   * Отрисовка сущности
   * @param ctx Контекст Canvas для рисования
   */
  abstract render(ctx: CanvasRenderingContext2D): void;

  /**
   * Уничтожить сущность (пометить для удаления)
   */
  destroy(): void {
    this.isActive = false;
  }

  /**
   * Получить расстояние до другой сущности
   */
  distanceTo(other: Entity): number {
    return this.position.distanceTo(other.position);
  }

  /**
   * Получить квадрат расстояния до другой сущности (быстрее)
   */
  distanceToSquared(other: Entity): number {
    return this.position.distanceToSquared(other.position);
  }

  /**
   * Получить направление к другой сущности
   */
  directionTo(other: Entity): Vector2 {
    return Vector2.subtract(other.position, this.position).normalize();
  }

  /**
   * Проверка, находится ли другая сущность в радиусе
   */
  isInRange(other: Entity, range: number): boolean {
    return this.distanceToSquared(other) <= range * range;
  }

  /**
   * Сериализация для сетевой передачи
   */
  serialize(): object {
    return {
      id: this.id,
      position: this.position.toObject(),
      isActive: this.isActive,
      tag: this.tag,
    };
  }
}

/**
 * Компонент здоровья для сущностей
 */
export class HealthComponent {
  public current: number;
  public max: number;

  constructor(maxHp: number) {
    this.max = maxHp;
    this.current = maxHp;
  }

  /**
   * Получить урон
   * @returns true если сущность погибла
   */
  takeDamage(amount: number): boolean {
    this.current = Math.max(0, this.current - amount);
    return this.current <= 0;
  }

  /**
   * Вылечить
   */
  heal(amount: number): void {
    this.current = Math.min(this.max, this.current + amount);
  }

  /**
   * Процент здоровья (0-1)
   */
  get percentage(): number {
    return this.max > 0 ? this.current / this.max : 0;
  }

  /**
   * Жива ли сущность
   */
  get isAlive(): boolean {
    return this.current > 0;
  }

  /**
   * Установить максимальное здоровье (и текущее, если нужно)
   */
  setMax(newMax: number, healToFull: boolean = false): void {
    const ratio = this.percentage;
    this.max = newMax;
    if (healToFull) {
      this.current = newMax;
    } else {
      // Сохранить процент здоровья
      this.current = Math.round(newMax * ratio);
    }
  }
}

/**
 * Компонент боя для сущностей
 */
export class CombatComponent {
  /** Урон в секунду */
  public dps: number;

  /** Дальность атаки */
  public attackRange: number;

  /** Время между атаками */
  public attackCooldown: number;

  /** Время до следующей атаки */
  private cooldownTimer: number = 0;

  constructor(dps: number, attackRange: number) {
    this.dps = dps;
    this.attackRange = attackRange;
    // Атакуем каждую секунду, нанося dps урона
    this.attackCooldown = 1;
  }

  /**
   * Обновить кулдаун
   */
  update(dt: number): void {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= dt;
    }
  }

  /**
   * Можно ли атаковать
   */
  canAttack(): boolean {
    return this.cooldownTimer <= 0;
  }

  /**
   * Выполнить атаку (сбросить кулдаун)
   * @returns Урон, который нужно нанести
   */
  attack(): number {
    if (!this.canAttack()) return 0;
    this.cooldownTimer = this.attackCooldown;
    return this.dps * this.attackCooldown;
  }

  /**
   * Проверить, находится ли цель в радиусе атаки
   */
  isTargetInRange(attacker: Entity, target: Entity): boolean {
    return attacker.isInRange(target, this.attackRange);
  }
}

/**
 * Компонент движения для сущностей
 */
export class MovementComponent {
  /** Скорость движения (пиксели в секунду) */
  public speed: number;

  /** Текущее направление движения */
  public velocity: Vector2;

  /** Движется ли сущность */
  public isMoving: boolean = false;

  constructor(speed: number) {
    this.speed = speed;
    this.velocity = Vector2.zero();
  }

  /**
   * Двигаться к цели
   * @returns true если достигли цели
   */
  moveTowards(entity: Entity, target: Vector2, dt: number): boolean {
    const direction = Vector2.subtract(target, entity.position);
    const distance = direction.length();

    if (distance < 1) {
      entity.position.copy(target);
      this.velocity.set(0, 0);
      this.isMoving = false;
      return true;
    }

    const moveDistance = this.speed * dt;

    if (moveDistance >= distance) {
      entity.position.copy(target);
      this.velocity.set(0, 0);
      this.isMoving = false;
      return true;
    }

    direction.normalize().multiply(moveDistance);
    entity.position.add(direction);
    this.velocity = direction.clone().divide(dt);
    this.isMoving = true;
    return false;
  }

  /**
   * Остановить движение
   */
  stop(): void {
    this.velocity.set(0, 0);
    this.isMoving = false;
  }
}
