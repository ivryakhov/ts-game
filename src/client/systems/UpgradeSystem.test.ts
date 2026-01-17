/**
 * Neon Arcana - Тесты для UpgradeSystem
 */

import { describe, it, expect, beforeEach } from "vitest";
import { UpgradeSystem } from "./UpgradeSystem";
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
  createInitialUnitUpgrades,
  createInitialUpgrades,
} from "@shared/types";

describe("UpgradeSystem", () => {
  let player: PlayerState;

  beforeEach(() => {
    player = {
      id: "player1",
      name: "Test Player",
      color: "#00ffff",
      ether: 1000,
      incomePerSec: 5,
      isAlive: true,
      towerId: "tower1",
      unlockedUnits: [UnitType.SCOUT, UnitType.TANK],
      unitUpgrades: createInitialUnitUpgrades(),
      lastAggressionTime: 0,
    };
  });

  describe("getUpgradeInfo", () => {
    it("should return correct info for level 0 upgrade", () => {
      const info = UpgradeSystem.getUpgradeInfo(player, UnitType.SCOUT, "hp");

      expect(info.level).toBe(0);
      expect(info.maxLevel).toBe(MAX_UPGRADE_LEVEL);
      expect(info.cost).toBe(BASE_UPGRADE_COST);
      expect(info.canUpgrade).toBe(true);
      expect(info.currentBonus).toBe(0);
      expect(info.nextBonus).toBe(HP_UPGRADE_BONUS);
    });

    it("should return correct info for level 1 upgrade", () => {
      player.unitUpgrades[UnitType.SCOUT].hp = 1;
      const info = UpgradeSystem.getUpgradeInfo(player, UnitType.SCOUT, "hp");

      expect(info.level).toBe(1);
      expect(info.cost).toBe(BASE_UPGRADE_COST + UPGRADE_COST_INCREMENT);
      expect(info.currentBonus).toBe(HP_UPGRADE_BONUS);
      expect(info.nextBonus).toBe(HP_UPGRADE_BONUS * 2);
    });

    it("should return canUpgrade false when at max level", () => {
      player.unitUpgrades[UnitType.SCOUT].hp = MAX_UPGRADE_LEVEL;
      const info = UpgradeSystem.getUpgradeInfo(player, UnitType.SCOUT, "hp");

      expect(info.canUpgrade).toBe(false);
    });

    it("should return canUpgrade false when not enough ether", () => {
      player.ether = 10; // Not enough
      const info = UpgradeSystem.getUpgradeInfo(player, UnitType.SCOUT, "hp");

      expect(info.canUpgrade).toBe(false);
    });

    it("should work for DPS upgrade type", () => {
      const info = UpgradeSystem.getUpgradeInfo(player, UnitType.TANK, "dps");

      expect(info.level).toBe(0);
      expect(info.nextBonus).toBe(DPS_UPGRADE_BONUS);
    });

    it("should work for speed upgrade type", () => {
      const info = UpgradeSystem.getUpgradeInfo(
        player,
        UnitType.RANGER,
        "speed",
      );

      expect(info.level).toBe(0);
      expect(info.nextBonus).toBe(SPEED_UPGRADE_BONUS);
    });
  });

  describe("getUpgradeCost", () => {
    it("should return base cost for level 0", () => {
      const cost = UpgradeSystem.getUpgradeCost(UnitType.SCOUT, "hp", 0);
      expect(cost).toBe(BASE_UPGRADE_COST);
    });

    it("should increase cost with each level", () => {
      const cost0 = UpgradeSystem.getUpgradeCost(UnitType.SCOUT, "hp", 0);
      const cost1 = UpgradeSystem.getUpgradeCost(UnitType.SCOUT, "hp", 1);
      const cost2 = UpgradeSystem.getUpgradeCost(UnitType.SCOUT, "hp", 2);

      expect(cost1).toBe(cost0 + UPGRADE_COST_INCREMENT);
      expect(cost2).toBe(cost0 + UPGRADE_COST_INCREMENT * 2);
    });

    it("should return Infinity for max level", () => {
      const cost = UpgradeSystem.getUpgradeCost(
        UnitType.SCOUT,
        "hp",
        MAX_UPGRADE_LEVEL,
      );
      expect(cost).toBe(Infinity);
    });
  });

  describe("getBonusPerLevel", () => {
    it("should return HP bonus for hp type", () => {
      expect(UpgradeSystem.getBonusPerLevel("hp")).toBe(HP_UPGRADE_BONUS);
    });

    it("should return DPS bonus for dps type", () => {
      expect(UpgradeSystem.getBonusPerLevel("dps")).toBe(DPS_UPGRADE_BONUS);
    });

    it("should return speed bonus for speed type", () => {
      expect(UpgradeSystem.getBonusPerLevel("speed")).toBe(SPEED_UPGRADE_BONUS);
    });
  });

  describe("applyUpgrade", () => {
    it("should successfully apply upgrade when conditions met", () => {
      const initialEther = player.ether;
      const cost = BASE_UPGRADE_COST;

      const result = UpgradeSystem.applyUpgrade(player, UnitType.SCOUT, "hp");

      expect(result).toBe(true);
      expect(player.unitUpgrades[UnitType.SCOUT].hp).toBe(1);
      expect(player.ether).toBe(initialEther - cost);
    });

    it("should fail when not enough ether", () => {
      player.ether = 10;

      const result = UpgradeSystem.applyUpgrade(player, UnitType.SCOUT, "hp");

      expect(result).toBe(false);
      expect(player.unitUpgrades[UnitType.SCOUT].hp).toBe(0);
    });

    it("should fail when at max level", () => {
      player.unitUpgrades[UnitType.SCOUT].hp = MAX_UPGRADE_LEVEL;

      const result = UpgradeSystem.applyUpgrade(player, UnitType.SCOUT, "hp");

      expect(result).toBe(false);
    });

    it("should apply multiple upgrades correctly", () => {
      UpgradeSystem.applyUpgrade(player, UnitType.SCOUT, "hp");
      UpgradeSystem.applyUpgrade(player, UnitType.SCOUT, "hp");

      expect(player.unitUpgrades[UnitType.SCOUT].hp).toBe(2);
    });

    it("should apply upgrades to different stats independently", () => {
      UpgradeSystem.applyUpgrade(player, UnitType.SCOUT, "hp");
      UpgradeSystem.applyUpgrade(player, UnitType.SCOUT, "dps");
      UpgradeSystem.applyUpgrade(player, UnitType.SCOUT, "speed");

      expect(player.unitUpgrades[UnitType.SCOUT].hp).toBe(1);
      expect(player.unitUpgrades[UnitType.SCOUT].dps).toBe(1);
      expect(player.unitUpgrades[UnitType.SCOUT].speed).toBe(1);
    });
  });

  describe("getStatMultiplier", () => {
    it("should return 1 for level 0", () => {
      const multiplier = UpgradeSystem.getStatMultiplier(
        player,
        UnitType.SCOUT,
        "hp",
      );
      expect(multiplier).toBe(1);
    });

    it("should return correct multiplier for level 1", () => {
      player.unitUpgrades[UnitType.SCOUT].hp = 1;
      const multiplier = UpgradeSystem.getStatMultiplier(
        player,
        UnitType.SCOUT,
        "hp",
      );
      expect(multiplier).toBe(1 + HP_UPGRADE_BONUS / 100);
    });

    it("should return correct multiplier for level 2", () => {
      player.unitUpgrades[UnitType.SCOUT].dps = 2;
      const multiplier = UpgradeSystem.getStatMultiplier(
        player,
        UnitType.SCOUT,
        "dps",
      );
      expect(multiplier).toBe(1 + (2 * DPS_UPGRADE_BONUS) / 100);
    });

    it("should return correct multiplier for max level", () => {
      player.unitUpgrades[UnitType.SCOUT].speed = MAX_UPGRADE_LEVEL;
      const multiplier = UpgradeSystem.getStatMultiplier(
        player,
        UnitType.SCOUT,
        "speed",
      );
      expect(multiplier).toBe(
        1 + (MAX_UPGRADE_LEVEL * SPEED_UPGRADE_BONUS) / 100,
      );
    });
  });

  describe("getUpgradedStats", () => {
    it("should return base stats for level 0", () => {
      const stats = UpgradeSystem.getUpgradedStats(player, UnitType.SCOUT);
      const baseConfig = UNIT_CONFIG[UnitType.SCOUT];

      expect(stats.hp).toBe(baseConfig.hp);
      expect(stats.dps).toBe(baseConfig.dps);
      expect(stats.speed).toBe(baseConfig.speed);
    });

    it("should return upgraded HP", () => {
      player.unitUpgrades[UnitType.SCOUT].hp = 1;
      const stats = UpgradeSystem.getUpgradedStats(player, UnitType.SCOUT);
      const baseConfig = UNIT_CONFIG[UnitType.SCOUT];

      const expectedHp = Math.round(
        baseConfig.hp * (1 + HP_UPGRADE_BONUS / 100),
      );
      expect(stats.hp).toBe(expectedHp);
    });

    it("should return upgraded DPS", () => {
      player.unitUpgrades[UnitType.TANK].dps = 2;
      const stats = UpgradeSystem.getUpgradedStats(player, UnitType.TANK);
      const baseConfig = UNIT_CONFIG[UnitType.TANK];

      const expectedDps = Math.round(
        baseConfig.dps * (1 + (2 * DPS_UPGRADE_BONUS) / 100),
      );
      expect(stats.dps).toBe(expectedDps);
    });

    it("should return all upgraded stats", () => {
      player.unitUpgrades[UnitType.SCOUT].hp = 1;
      player.unitUpgrades[UnitType.SCOUT].dps = 2;
      player.unitUpgrades[UnitType.SCOUT].speed = 3;

      const stats = UpgradeSystem.getUpgradedStats(player, UnitType.SCOUT);
      const baseConfig = UNIT_CONFIG[UnitType.SCOUT];

      expect(stats.hp).toBe(
        Math.round(baseConfig.hp * (1 + HP_UPGRADE_BONUS / 100)),
      );
      expect(stats.dps).toBe(
        Math.round(baseConfig.dps * (1 + (2 * DPS_UPGRADE_BONUS) / 100)),
      );
      expect(stats.speed).toBe(
        Math.round(baseConfig.speed * (1 + (3 * SPEED_UPGRADE_BONUS) / 100)),
      );
    });
  });

  describe("getUnlockInfo", () => {
    it("should return unlocked true for already unlocked units", () => {
      const info = UpgradeSystem.getUnlockInfo(player, UnitType.SCOUT);

      expect(info.unlocked).toBe(true);
      expect(info.canUnlock).toBe(false);
    });

    it("should return unlocked false for locked units", () => {
      const info = UpgradeSystem.getUnlockInfo(player, UnitType.RANGER);

      expect(info.unlocked).toBe(false);
      expect(info.cost).toBe(UNIT_CONFIG[UnitType.RANGER].unlockCost);
    });

    it("should return canUnlock true when enough ether", () => {
      player.ether = 1000;
      const info = UpgradeSystem.getUnlockInfo(player, UnitType.RANGER);

      expect(info.canUnlock).toBe(true);
    });

    it("should return canUnlock false when not enough ether", () => {
      player.ether = 10;
      const info = UpgradeSystem.getUnlockInfo(player, UnitType.RANGER);

      expect(info.canUnlock).toBe(false);
    });
  });

  describe("unlockUnit", () => {
    it("should successfully unlock a locked unit", () => {
      const initialEther = player.ether;
      const cost = UNIT_CONFIG[UnitType.RANGER].unlockCost;

      const result = UpgradeSystem.unlockUnit(player, UnitType.RANGER);

      expect(result).toBe(true);
      expect(player.unlockedUnits).toContain(UnitType.RANGER);
      expect(player.ether).toBe(initialEther - cost);
    });

    it("should fail to unlock already unlocked unit", () => {
      const initialEther = player.ether;

      const result = UpgradeSystem.unlockUnit(player, UnitType.SCOUT);

      expect(result).toBe(false);
      expect(player.ether).toBe(initialEther);
    });

    it("should fail when not enough ether", () => {
      player.ether = 10;

      const result = UpgradeSystem.unlockUnit(player, UnitType.RANGER);

      expect(result).toBe(false);
      expect(player.unlockedUnits).not.toContain(UnitType.RANGER);
    });
  });

  describe("getTowerUpgradeInfo", () => {
    it("should return correct info for level 1 tower", () => {
      const info = UpgradeSystem.getTowerUpgradeInfo(player, 1);

      expect(info.level).toBe(1);
      expect(info.maxLevel).toBe(TOWER_CONFIG.UPGRADES.length);
      expect(info.currentHp).toBe(TOWER_CONFIG.UPGRADES[0].hp);
      expect(info.nextHp).toBe(TOWER_CONFIG.UPGRADES[1].hp);
      expect(info.cost).toBe(TOWER_CONFIG.UPGRADES[1].cost);
    });

    it("should return canUpgrade true when enough ether", () => {
      player.ether = 1000;
      const info = UpgradeSystem.getTowerUpgradeInfo(player, 1);

      expect(info.canUpgrade).toBe(true);
    });

    it("should return canUpgrade false at max level", () => {
      const maxLevel = TOWER_CONFIG.UPGRADES.length;
      const info = UpgradeSystem.getTowerUpgradeInfo(player, maxLevel);

      expect(info.canUpgrade).toBe(false);
    });

    it("should return canUpgrade false when not enough ether", () => {
      player.ether = 10;
      const info = UpgradeSystem.getTowerUpgradeInfo(player, 1);

      expect(info.canUpgrade).toBe(false);
    });
  });

  describe("getAllUpgradeInfo", () => {
    it("should return info for all upgrade types", () => {
      const allInfo = UpgradeSystem.getAllUpgradeInfo(player, UnitType.SCOUT);

      expect(allInfo.hp).toBeDefined();
      expect(allInfo.dps).toBeDefined();
      expect(allInfo.speed).toBeDefined();
    });

    it("should return correct info for each type", () => {
      player.unitUpgrades[UnitType.SCOUT].hp = 1;
      player.unitUpgrades[UnitType.SCOUT].dps = 2;

      const allInfo = UpgradeSystem.getAllUpgradeInfo(player, UnitType.SCOUT);

      expect(allInfo.hp.level).toBe(1);
      expect(allInfo.dps.level).toBe(2);
      expect(allInfo.speed.level).toBe(0);
    });
  });

  describe("getTotalUpgradeCost", () => {
    it("should return 0 for no upgrades", () => {
      const upgrades = createInitialUpgrades();
      const cost = UpgradeSystem.getTotalUpgradeCost(upgrades);

      expect(cost).toBe(0);
    });

    it("should calculate cost for single upgrade", () => {
      const upgrades = { hp: 1, dps: 0, speed: 0 };
      const cost = UpgradeSystem.getTotalUpgradeCost(upgrades);

      expect(cost).toBe(BASE_UPGRADE_COST);
    });

    it("should calculate cost for multiple upgrades", () => {
      const upgrades = { hp: 2, dps: 1, speed: 0 };
      const cost = UpgradeSystem.getTotalUpgradeCost(upgrades);

      // hp: level 0 cost + level 1 cost
      // dps: level 0 cost
      const expectedCost =
        BASE_UPGRADE_COST +
        (BASE_UPGRADE_COST + UPGRADE_COST_INCREMENT) +
        BASE_UPGRADE_COST;

      expect(cost).toBe(expectedCost);
    });
  });

  describe("resetUpgrades", () => {
    it("should reset all upgrades to 0", () => {
      player.unitUpgrades[UnitType.SCOUT] = { hp: 2, dps: 1, speed: 3 };

      UpgradeSystem.resetUpgrades(player, UnitType.SCOUT);

      expect(player.unitUpgrades[UnitType.SCOUT].hp).toBe(0);
      expect(player.unitUpgrades[UnitType.SCOUT].dps).toBe(0);
      expect(player.unitUpgrades[UnitType.SCOUT].speed).toBe(0);
    });

    it("should only reset specified unit type", () => {
      player.unitUpgrades[UnitType.SCOUT] = { hp: 2, dps: 1, speed: 3 };
      player.unitUpgrades[UnitType.TANK] = { hp: 1, dps: 2, speed: 0 };

      UpgradeSystem.resetUpgrades(player, UnitType.SCOUT);

      expect(player.unitUpgrades[UnitType.TANK].hp).toBe(1);
      expect(player.unitUpgrades[UnitType.TANK].dps).toBe(2);
    });
  });

  describe("hasAvailableUpgrades", () => {
    it("should return true when upgrades available", () => {
      const result = UpgradeSystem.hasAvailableUpgrades(player, UnitType.SCOUT);
      expect(result).toBe(true);
    });

    it("should return false when all upgrades maxed", () => {
      player.unitUpgrades[UnitType.SCOUT] = {
        hp: MAX_UPGRADE_LEVEL,
        dps: MAX_UPGRADE_LEVEL,
        speed: MAX_UPGRADE_LEVEL,
      };

      const result = UpgradeSystem.hasAvailableUpgrades(player, UnitType.SCOUT);
      expect(result).toBe(false);
    });

    it("should return false when not enough ether for any upgrade", () => {
      player.ether = 10;

      const result = UpgradeSystem.hasAvailableUpgrades(player, UnitType.SCOUT);
      expect(result).toBe(false);
    });

    it("should return true if at least one upgrade is available", () => {
      player.unitUpgrades[UnitType.SCOUT] = {
        hp: MAX_UPGRADE_LEVEL,
        dps: MAX_UPGRADE_LEVEL,
        speed: 0,
      };

      const result = UpgradeSystem.hasAvailableUpgrades(player, UnitType.SCOUT);
      expect(result).toBe(true);
    });
  });

  describe("getUpgradeName", () => {
    it("should return correct Russian name for hp", () => {
      expect(UpgradeSystem.getUpgradeName("hp")).toBe("Здоровье");
    });

    it("should return correct Russian name for dps", () => {
      expect(UpgradeSystem.getUpgradeName("dps")).toBe("Урон");
    });

    it("should return correct Russian name for speed", () => {
      expect(UpgradeSystem.getUpgradeName("speed")).toBe("Скорость");
    });
  });

  describe("getUpgradeIcon", () => {
    it("should return heart emoji for hp", () => {
      expect(UpgradeSystem.getUpgradeIcon("hp")).toBe("❤️");
    });

    it("should return sword emoji for dps", () => {
      expect(UpgradeSystem.getUpgradeIcon("dps")).toBe("⚔️");
    });

    it("should return wind emoji for speed", () => {
      expect(UpgradeSystem.getUpgradeIcon("speed")).toBe("💨");
    });
  });
});
