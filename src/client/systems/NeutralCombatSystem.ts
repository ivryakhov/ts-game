/**
 * Neon Arcana - NeutralCombatSystem
 * Система боя юнитов с нейтральными защитниками ресурсных точек
 */

import { Unit } from "../entities/Unit";
import {
  ResourcePoint,
  NeutralGuardianEntity,
} from "../entities/ResourcePoint";
import { UnitBehaviorState } from "@shared/types";

/**
 * Результат обработки боя с нейтралами
 */
export interface NeutralCombatResult {
  /** Юниты, которые убили свою цель и переключились на новую */
  unitsRetargeted: string[];
  /** Юниты, которые убили всех защитников и готовы захватить точку */
  unitsReadyToCapture: string[];
  /** Урон, нанесённый защитникам (для статистики) */
  damageDealtToGuardians: number;
  /** Урон, нанесённый юнитам защитниками */
  damageDealtToUnits: number;
}

/**
 * Система боя с нейтральными защитниками
 */
export class NeutralCombatSystem {
  /**
   * Найти ближайшего живого защитника для юнита
   */
  static findClosestAliveGuardian(
    unit: Unit,
    point: ResourcePoint,
  ): NeutralGuardianEntity | null {
    let closestGuardian: NeutralGuardianEntity | null = null;
    let closestDistance = Infinity;

    for (const guardian of point.guardians) {
      if (!guardian.isAlive) continue;

      const distanceToGuardian = unit.position.distanceTo(guardian.position);

      if (distanceToGuardian < closestDistance) {
        closestDistance = distanceToGuardian;
        closestGuardian = guardian;
      }
    }

    return closestGuardian;
  }

  /**
   * Получить всех живых защитников точки
   */
  static getAliveGuardians(point: ResourcePoint): NeutralGuardianEntity[] {
    return point.guardians.filter((g) => g.isAlive);
  }

  /**
   * Проверить, должен ли юнит переключить цель
   * Возвращает true, если текущая цель мертва или отсутствует
   */
  static shouldRetarget(unit: Unit, point: ResourcePoint): boolean {
    if (!unit.targetId) return true;

    const currentTarget = point.guardians.find((g) => g.id === unit.targetId);
    return !currentTarget || !currentTarget.isAlive;
  }

  /**
   * Переключить юнита на следующего защитника
   * Возвращает true, если найден новый защитник
   */
  static retargetUnit(unit: Unit, point: ResourcePoint): boolean {
    const nextGuardian = this.findClosestAliveGuardian(unit, point);

    if (nextGuardian) {
      unit.targetId = nextGuardian.id;
      // Остаёмся в состоянии FIGHTING
      return true;
    } else {
      // Все защитники мертвы - переходим к захвату
      unit.targetId = null;
      unit.state = UnitBehaviorState.MOVING;
      return false;
    }
  }

  /**
   * Проверить, находится ли юнит в зоне агрессии точки
   */
  static isUnitInAggroRange(
    unit: Unit,
    point: ResourcePoint,
    extendedRange: boolean = false,
  ): boolean {
    const distanceToPoint = unit.position.distanceTo(point.position);
    const aggroRange = extendedRange ? point.size + 150 : point.size + 60;
    return distanceToPoint <= aggroRange;
  }

  /**
   * Проверить, может ли юнит атаковать защитника
   */
  static canUnitAttackGuardian(
    unit: Unit,
    guardian: NeutralGuardianEntity,
  ): boolean {
    const distance = unit.position.distanceTo(guardian.position);
    const attackRange = unit.combat.attackRange;
    const guardianSize = guardian.size;
    const threshold = attackRange + guardianSize + 10;
    const canAttack = distance <= threshold;
    console.log(
      `  - canUnitAttackGuardian: distance=${distance.toFixed(2)}, attackRange=${attackRange}, guardianSize=${guardianSize}, threshold=${threshold}, canAttack=${canAttack}`,
    );
    // Временно увеличиваем размер guardian на 10 пикселей для теста
    return canAttack; // Проверяем радиус атаки с допуском
  }

  /**
   * Проверить, может ли защитник атаковать юнита
   */
  static canGuardianAttackUnit(
    guardian: NeutralGuardianEntity,
    unit: Unit,
  ): boolean {
    const distance = guardian.position.distanceTo(unit.position);
    return distance <= guardian.aggroRadius;
  }

  /**
   * Подготовить юнита к захвату точки (после убийства всех защитников)
   */
  static prepareUnitForCapture(unit: Unit, point: ResourcePoint): void {
    unit.stopFighting();
    // Переместить юнита к центру точки для захвата
    unit.position.x = point.position.x;
    unit.position.y = point.position.y;
    // Установить цель на эту точку для последующего захвата
    unit.guardingPointId = point.id;
  }

  /**
   * Проверить, может ли юнит захватить эту точку
   * (юнит целился на эту точку или не имел другой цели)
   */
  static canUnitCapturePoint(unit: Unit, point: ResourcePoint): boolean {
    const isTargetingThisPoint = unit.guardingPointId === point.id;
    const hasNoOtherTarget = !unit.guardingPointId;
    return isTargetingThisPoint || hasNoOtherTarget;
  }

  /**
   * Проверить, заполнена ли точка охранниками
   */
  static isPointFull(point: ResourcePoint): boolean {
    return point.guardUnitIds.length >= point.config.maxGuards;
  }

  /**
   * Проверить, может ли юнит стать охранником точки
   */
  static canUnitGuardPoint(unit: Unit, point: ResourcePoint): boolean {
    // Точка должна принадлежать владельцу юнита
    if (point.ownerId !== unit.ownerId) return false;
    // На точке должно быть место для охранников
    if (point.config.maxGuards <= 0) return false;
    // Точка не должна быть заполнена
    if (this.isPointFull(point)) return false;
    // Юнит должен быть в состоянии MOVING или целиться на эту точку
    const isGoingToThisPoint = unit.guardingPointId === point.id;
    return unit.state === UnitBehaviorState.MOVING || isGoingToThisPoint;
  }

  /**
   * Обработать бой юнита с защитниками точки
   * Возвращает результат обработки
   */
  static processUnitCombat(
    unit: Unit,
    point: ResourcePoint,
    aliveGuardians: NeutralGuardianEntity[],
  ): { damageToGuardians: number; damageToUnit: number; retargeted: boolean } {
    let damageToGuardians = 0;
    let damageToUnit = 0;
    let retargeted = false;

    // Если юнит в бою, проверяем жива ли его цель
    if (unit.state === UnitBehaviorState.FIGHTING && unit.targetId) {
      if (this.shouldRetarget(unit, point)) {
        unit.targetId = null;
        const foundNewTarget = this.retargetUnit(unit, point);
        if (foundNewTarget) {
          retargeted = true;
        }
      }
    }

    // Защитники атакуют юнита
    for (const guardian of aliveGuardians) {
      if (this.canGuardianAttackUnit(guardian, unit)) {
        guardian.targetId = unit.id;

        if (guardian.canAttack()) {
          const damage = guardian.attack();
          unit.takeDamage(damage);
          damageToUnit += damage;
        }
      }
    }

    // Найти ближайшего защитника для атаки
    const closestGuardian = this.findClosestAliveGuardian(unit, point);

    if (closestGuardian && this.canUnitAttackGuardian(unit, closestGuardian)) {
      // Начать бой или продолжить
      if (unit.state === UnitBehaviorState.MOVING) {
        unit.state = UnitBehaviorState.FIGHTING;
        unit.targetId = closestGuardian.id;
      }

      // Обновить цель если текущая цель мертва или отсутствует
      if (!unit.targetId) {
        unit.targetId = closestGuardian.id;
      } else {
        const currentTarget = point.guardians.find(
          (g) => g.id === unit.targetId,
        );
        if (!currentTarget || !currentTarget.isAlive) {
          unit.targetId = closestGuardian.id;
        }
      }

      if (unit.combat.canAttack()) {
        const damage = unit.combat.attack();
        if (damage > 0) {
          closestGuardian.takeDamage(damage);
          damageToGuardians += damage;
        }
      }
    }

    return { damageToGuardians, damageToUnit, retargeted };
  }
}
