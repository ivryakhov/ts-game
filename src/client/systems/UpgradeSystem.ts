/**
 * Neon Arcana - UpgradeSystem
 * Система улучшений юнитов и башен
 */

import {
  UnitType,
  UNIT_CONFIG,
  MAX_UPGRADE_LEVEL,
  HP_UPGRADE_BONUS,
  DPS_UPGRADE_BONUS,
  SPEED_UPGRADE_BONUS,
  BASE_UPGRADE_COST,
  UPGRADE_COST_INCREMENT,
  TOWER_CONFIG,
} from "@shared/constants";
import {
  PlayerState,
  UnitUpgrades,
  createInitialUpgrades,
} from "@shared/types";

/**
 * Тип улучшения
 */
export type UpgradeType = "hp" | "dps" | "speed";

/**
 * Информация об улучшении
 */
export interface UpgradeInfo {
  /** Текущий уровень */
  level: number;
  /** Максимальный уровень */
  maxLevel: number;
  /** Стоимость следующего улучшения */
  cost: number;
  /** Можно ли улучшить */
  canUpgrade: boolean;
  /** Текущий бонус (%) */
  currentBonus: number;
  /** Бонус следующего уровня (%) */
  nextBonus: number;
}

/**
 * Информация о разблокировке юнита
 */
export interface UnlockInfo {
  /** Разблокирован ли юнит */
  unlocked: boolean;
  /** Стоимость разблокировки */
  cost: number;
  /** Время исследования (сек) */
  researchTime: number;
  /** Можно ли разблокировать */
  canUnlock: boolean;
}

/**
 * Информация об улучшении башни
 */
export interface TowerUpgradeInfo {
  /** Текущий уровень */
  level: number;
  /** Максимальный уровень */
  maxLevel: number;
  /** Стоимость улучшения */
  cost: number;
  /** Время улучшения (сек) */
  upgradeTime: number;
  /** Можно ли улучшить */
  canUpgrade: boolean;
  /** Текущее HP */
  currentHp: number;
  /** HP после улучшения */
  nextHp: number;
  /** Текущий DPS */
  currentDps: number;
  /** DPS после улучшения */
  nextDps: number;
}

/**
 * Система улучшений
 */
export class UpgradeSystem {
  /**
   * Получить информацию об улучшении юнита
   */
  static getUpgradeInfo(
    player: PlayerState,
    unitType: UnitType,
    upgradeType: UpgradeType,
  ): UpgradeInfo {
    const upgrades = player.unitUpgrades[unitType];
    const level = upgrades[upgradeType];
    const cost = this.getUpgradeCost(unitType, upgradeType, level);

    const bonusPerLevel = this.getBonusPerLevel(upgradeType);
    const currentBonus = level * bonusPerLevel;
    const nextBonus = (level + 1) * bonusPerLevel;

    return {
      level,
      maxLevel: MAX_UPGRADE_LEVEL,
      cost,
      canUpgrade: level < MAX_UPGRADE_LEVEL && player.ether >= cost,
      currentBonus,
      nextBonus,
    };
  }

  /**
   * Получить стоимость улучшения
   */
  static getUpgradeCost(
    _unitType: UnitType,
    _upgradeType: UpgradeType,
    currentLevel: number,
  ): number {
    if (currentLevel >= MAX_UPGRADE_LEVEL) {
      return Infinity;
    }
    return BASE_UPGRADE_COST + UPGRADE_COST_INCREMENT * currentLevel;
  }

  /**
   * Получить бонус за уровень в процентах
   */
  static getBonusPerLevel(upgradeType: UpgradeType): number {
    switch (upgradeType) {
      case "hp":
        return HP_UPGRADE_BONUS;
      case "dps":
        return DPS_UPGRADE_BONUS;
      case "speed":
        return SPEED_UPGRADE_BONUS;
      default:
        return 0;
    }
  }

  /**
   * Применить улучшение юнита
   * @returns true если улучшение успешно
   */
  static applyUpgrade(
    player: PlayerState,
    unitType: UnitType,
    upgradeType: UpgradeType,
  ): boolean {
    const info = this.getUpgradeInfo(player, unitType, upgradeType);

    if (!info.canUpgrade) {
      return false;
    }

    // Снимаем ресурсы
    player.ether -= info.cost;

    // Увеличиваем уровень
    player.unitUpgrades[unitType][upgradeType] += 1;

    return true;
  }

  /**
   * Получить множитель характеристики с учётом улучшений
   */
  static getStatMultiplier(
    player: PlayerState,
    unitType: UnitType,
    upgradeType: UpgradeType,
  ): number {
    const level = player.unitUpgrades[unitType][upgradeType];
    const bonusPerLevel = this.getBonusPerLevel(upgradeType);
    return 1 + (level * bonusPerLevel) / 100;
  }

  /**
   * Получить улучшенные характеристики юнита
   */
  static getUpgradedStats(
    player: PlayerState,
    unitType: UnitType,
  ): { hp: number; dps: number; speed: number } {
    const baseConfig = UNIT_CONFIG[unitType];

    const hpMultiplier = this.getStatMultiplier(player, unitType, "hp");
    const dpsMultiplier = this.getStatMultiplier(player, unitType, "dps");
    const speedMultiplier = this.getStatMultiplier(player, unitType, "speed");

    return {
      hp: Math.round(baseConfig.hp * hpMultiplier),
      dps: Math.round(baseConfig.dps * dpsMultiplier),
      speed: Math.round(baseConfig.speed * speedMultiplier),
    };
  }

  /**
   * Получить информацию о разблокировке юнита
   */
  static getUnlockInfo(player: PlayerState, unitType: UnitType): UnlockInfo {
    const config = UNIT_CONFIG[unitType];
    const unlocked = player.unlockedUnits.includes(unitType);

    return {
      unlocked,
      cost: config.unlockCost,
      researchTime: "unlockTime" in config ? config.unlockTime : 0,
      canUnlock: !unlocked && player.ether >= config.unlockCost,
    };
  }

  /**
   * Разблокировать юнита
   * @returns true если разблокировка успешна
   */
  static unlockUnit(player: PlayerState, unitType: UnitType): boolean {
    const info = this.getUnlockInfo(player, unitType);

    if (!info.canUnlock) {
      return false;
    }

    // Снимаем ресурсы
    player.ether -= info.cost;

    // Добавляем юнита в разблокированные
    player.unlockedUnits.push(unitType);

    return true;
  }

  /**
   * Получить информацию об улучшении башни
   */
  static getTowerUpgradeInfo(
    player: PlayerState,
    currentLevel: number,
  ): TowerUpgradeInfo {
    const upgrades = TOWER_CONFIG.UPGRADES;
    const maxLevel = upgrades.length;

    const currentConfig = upgrades[currentLevel - 1];
    const nextConfig = currentLevel < maxLevel ? upgrades[currentLevel] : null;

    const cost = nextConfig?.cost ?? Infinity;
    const upgradeTime = nextConfig?.upgradeTime ?? 0;

    return {
      level: currentLevel,
      maxLevel,
      cost,
      upgradeTime,
      canUpgrade:
        currentLevel < maxLevel && player.ether >= cost && nextConfig !== null,
      currentHp: currentConfig?.hp ?? 0,
      nextHp: nextConfig?.hp ?? currentConfig?.hp ?? 0,
      currentDps: currentConfig?.dps ?? 0,
      nextDps: nextConfig?.dps ?? currentConfig?.dps ?? 0,
    };
  }

  /**
   * Получить все улучшения юнита
   */
  static getAllUpgradeInfo(
    player: PlayerState,
    unitType: UnitType,
  ): Record<UpgradeType, UpgradeInfo> {
    return {
      hp: this.getUpgradeInfo(player, unitType, "hp"),
      dps: this.getUpgradeInfo(player, unitType, "dps"),
      speed: this.getUpgradeInfo(player, unitType, "speed"),
    };
  }

  /**
   * Получить общую стоимость всех улучшений юнита
   */
  static getTotalUpgradeCost(upgrades: UnitUpgrades): number {
    let total = 0;

    for (let i = 0; i < upgrades.hp; i++) {
      total += BASE_UPGRADE_COST + UPGRADE_COST_INCREMENT * i;
    }
    for (let i = 0; i < upgrades.dps; i++) {
      total += BASE_UPGRADE_COST + UPGRADE_COST_INCREMENT * i;
    }
    for (let i = 0; i < upgrades.speed; i++) {
      total += BASE_UPGRADE_COST + UPGRADE_COST_INCREMENT * i;
    }

    return total;
  }

  /**
   * Сбросить улучшения юнита
   */
  static resetUpgrades(player: PlayerState, unitType: UnitType): void {
    player.unitUpgrades[unitType] = createInitialUpgrades();
  }

  /**
   * Проверить, есть ли доступные улучшения
   */
  static hasAvailableUpgrades(
    player: PlayerState,
    unitType: UnitType,
  ): boolean {
    const info = this.getAllUpgradeInfo(player, unitType);
    return info.hp.canUpgrade || info.dps.canUpgrade || info.speed.canUpgrade;
  }

  /**
   * Получить название улучшения на русском
   */
  static getUpgradeName(upgradeType: UpgradeType): string {
    switch (upgradeType) {
      case "hp":
        return "Здоровье";
      case "dps":
        return "Урон";
      case "speed":
        return "Скорость";
      default:
        return upgradeType;
    }
  }

  /**
   * Получить иконку улучшения
   */
  static getUpgradeIcon(upgradeType: UpgradeType): string {
    switch (upgradeType) {
      case "hp":
        return "❤️";
      case "dps":
        return "⚔️";
      case "speed":
        return "💨";
      default:
        return "?";
    }
  }
}
