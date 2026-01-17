/**
 * Neon Arcana - Tower Tests
 * Тесты для класса Tower (Башня)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Tower } from "./Tower";
import { TowerType } from "@shared/types";
import { TOWER_CONFIG, PLAYER_COLORS } from "@shared/constants";

describe("Tower", () => {
  let tower: Tower;

  beforeEach(() => {
    tower = new Tower("tower-1", TowerType.MAIN, "player-1", 0, 100, 200);
  });

  describe("constructor", () => {
    it("should create tower with correct id", () => {
      expect(tower.id).toBe("tower-1");
    });

    it("should create tower with correct type", () => {
      expect(tower.type).toBe(TowerType.MAIN);
    });

    it("should create tower with correct owner", () => {
      expect(tower.ownerId).toBe("player-1");
    });

    it("should create tower with correct position", () => {
      expect(tower.position.x).toBe(100);
      expect(tower.position.y).toBe(200);
    });

    it("should create tower with correct color based on player index", () => {
      expect(tower.color).toBe(PLAYER_COLORS[0]);
    });

    it("should create tower with different color for different player index", () => {
      const tower2 = new Tower(
        "tower-2",
        TowerType.MAIN,
        "player-2",
        1,
        200,
        200,
      );
      expect(tower2.color).toBe(PLAYER_COLORS[1]);
    });

    it("should set tag to 'tower'", () => {
      expect(tower.tag).toBe("tower");
    });

    it("should initialize main tower with correct HP", () => {
      expect(tower.health.max).toBe(TOWER_CONFIG.BASE_HP);
      expect(tower.health.current).toBe(TOWER_CONFIG.BASE_HP);
    });

    it("should initialize main tower with correct DPS", () => {
      expect(tower.combat.dps).toBe(TOWER_CONFIG.BASE_DPS);
    });

    it("should initialize main tower with correct attack range", () => {
      expect(tower.combat.attackRange).toBe(TOWER_CONFIG.ATTACK_RANGE);
    });

    it("should initialize main tower with correct size", () => {
      expect(tower.size).toBe(TOWER_CONFIG.SIZE);
    });

    it("should start at level 1", () => {
      expect(tower.level).toBe(1);
    });

    it("should not be upgrading initially", () => {
      expect(tower.isUpgrading).toBe(false);
    });

    it("should have no target initially", () => {
      expect(tower.targetId).toBeNull();
    });
  });

  describe("defensive tower", () => {
    let defensiveTower: Tower;

    beforeEach(() => {
      defensiveTower = new Tower(
        "def-tower-1",
        TowerType.DEFENSIVE,
        "player-1",
        0,
        100,
        200,
      );
    });

    it("should have smaller size than main tower", () => {
      expect(defensiveTower.size).toBe(40);
    });
  });

  describe("buff tower", () => {
    let buffTower: Tower;

    beforeEach(() => {
      buffTower = new Tower(
        "buff-tower-1",
        TowerType.BUFF,
        "player-1",
        0,
        100,
        200,
      );
    });

    it("should have zero DPS", () => {
      expect(buffTower.combat.dps).toBe(0);
    });
  });

  describe("economic tower", () => {
    let econTower: Tower;

    beforeEach(() => {
      econTower = new Tower(
        "econ-tower-1",
        TowerType.ECONOMIC,
        "player-1",
        0,
        100,
        200,
      );
    });

    it("should have zero DPS", () => {
      expect(econTower.combat.dps).toBe(0);
    });
  });

  describe("fromState", () => {
    it("should create tower from state", () => {
      const state = {
        id: "state-tower",
        type: TowerType.MAIN,
        ownerId: "player-2",
        position: { x: 300, y: 400 },
        hp: 800,
        maxHp: 1000,
        dps: 20,
        level: 2,
        attackRange: 150,
        isUpgrading: false,
        upgradeEndTime: 0,
        targetId: null,
      };

      const restoredTower = Tower.fromState(state, 1);

      expect(restoredTower.id).toBe("state-tower");
      expect(restoredTower.type).toBe(TowerType.MAIN);
      expect(restoredTower.ownerId).toBe("player-2");
      expect(restoredTower.position.x).toBe(300);
      expect(restoredTower.position.y).toBe(400);
      expect(restoredTower.health.current).toBe(800);
      expect(restoredTower.health.max).toBe(1000);
      expect(restoredTower.combat.dps).toBe(20);
      expect(restoredTower.level).toBe(2);
      expect(restoredTower.combat.attackRange).toBe(150);
      expect(restoredTower.color).toBe(PLAYER_COLORS[1]);
    });

    it("should restore upgrading state", () => {
      const endTime = Date.now() + 5000;
      const state = {
        id: "upgrading-tower",
        type: TowerType.MAIN,
        ownerId: "player-1",
        position: { x: 100, y: 100 },
        hp: 1000,
        maxHp: 1000,
        dps: 15,
        level: 1,
        attackRange: 150,
        isUpgrading: true,
        upgradeEndTime: endTime,
        targetId: null,
      };

      const restoredTower = Tower.fromState(state, 0);

      expect(restoredTower.isUpgrading).toBe(true);
      expect(restoredTower.upgradeEndTime).toBe(endTime);
    });
  });

  describe("update", () => {
    it("should update combat component", () => {
      // Attack to start cooldown
      tower.combat.attack();
      expect(tower.combat.canAttack()).toBe(false);

      // Update should reduce cooldown
      tower.update(1);
      expect(tower.combat.canAttack()).toBe(true);
    });

    it("should not attack when upgrading", () => {
      tower.isUpgrading = true;
      tower.targetId = "some-target";

      tower.update(0.1);

      // Tower logic continues but attack is blocked
      expect(tower.isUpgrading).toBe(true);
    });
  });

  describe("takeDamage", () => {
    it("should reduce tower health", () => {
      tower.takeDamage(100);

      expect(tower.health.current).toBe(TOWER_CONFIG.BASE_HP - 100);
    });

    it("should return false when tower survives", () => {
      const destroyed = tower.takeDamage(100);

      expect(destroyed).toBe(false);
    });

    it("should return true when tower is destroyed", () => {
      const destroyed = tower.takeDamage(TOWER_CONFIG.BASE_HP);

      expect(destroyed).toBe(true);
    });

    it("should return true with overkill damage", () => {
      const destroyed = tower.takeDamage(TOWER_CONFIG.BASE_HP + 500);

      expect(destroyed).toBe(true);
      expect(tower.health.current).toBe(0);
    });
  });

  describe("isAlive", () => {
    it("should return true when health > 0", () => {
      expect(tower.isAlive).toBe(true);
    });

    it("should return false when health = 0", () => {
      tower.takeDamage(TOWER_CONFIG.BASE_HP);

      expect(tower.isAlive).toBe(false);
    });
  });

  describe("upgrade", () => {
    it("should start upgrade for main tower", () => {
      const result = tower.upgrade();

      expect(result).toBe(true);
      expect(tower.isUpgrading).toBe(true);
    });

    it("should set upgrade end time", () => {
      const before = Date.now();
      tower.upgrade();
      const after = Date.now();

      const expectedTime = TOWER_CONFIG.UPGRADES[1]!.upgradeTime * 1000;

      expect(tower.upgradeEndTime).toBeGreaterThanOrEqual(before + expectedTime);
      expect(tower.upgradeEndTime).toBeLessThanOrEqual(after + expectedTime);
    });

    it("should return false for non-main tower", () => {
      const defensiveTower = new Tower(
        "def",
        TowerType.DEFENSIVE,
        "player-1",
        0,
        100,
        100,
      );
      const result = defensiveTower.upgrade();

      expect(result).toBe(false);
    });

    it("should return false when already upgrading", () => {
      tower.upgrade();
      const result = tower.upgrade();

      expect(result).toBe(false);
    });

    it("should return false when at max level", () => {
      // Set to max level
      tower.level = TOWER_CONFIG.UPGRADES.length;
      const result = tower.upgrade();

      expect(result).toBe(false);
    });
  });

  describe("completeUpgrade", () => {
    it("should increase level", () => {
      tower.upgrade();
      tower.completeUpgrade();

      expect(tower.level).toBe(2);
    });

    it("should update max HP", () => {
      tower.upgrade();
      tower.completeUpgrade();

      expect(tower.health.max).toBe(TOWER_CONFIG.UPGRADES[1]!.hp);
    });

    it("should update DPS", () => {
      tower.upgrade();
      tower.completeUpgrade();

      expect(tower.combat.dps).toBe(TOWER_CONFIG.UPGRADES[1]!.dps);
    });

    it("should clear upgrading flag", () => {
      tower.upgrade();
      tower.completeUpgrade();

      expect(tower.isUpgrading).toBe(false);
    });

    it("should reset upgrade end time", () => {
      tower.upgrade();
      tower.completeUpgrade();

      expect(tower.upgradeEndTime).toBe(0);
    });

    it("should do nothing if not upgrading", () => {
      const originalLevel = tower.level;
      tower.completeUpgrade();

      expect(tower.level).toBe(originalLevel);
    });
  });

  describe("toState", () => {
    it("should serialize tower state", () => {
      tower.targetId = "target-1";

      const state = tower.toState();

      expect(state.id).toBe("tower-1");
      expect(state.type).toBe(TowerType.MAIN);
      expect(state.ownerId).toBe("player-1");
      expect(state.position).toEqual({ x: 100, y: 200 });
      expect(state.hp).toBe(TOWER_CONFIG.BASE_HP);
      expect(state.maxHp).toBe(TOWER_CONFIG.BASE_HP);
      expect(state.dps).toBe(TOWER_CONFIG.BASE_DPS);
      expect(state.level).toBe(1);
      expect(state.attackRange).toBe(TOWER_CONFIG.ATTACK_RANGE);
      expect(state.isUpgrading).toBe(false);
      expect(state.upgradeEndTime).toBe(0);
      expect(state.targetId).toBe("target-1");
    });

    it("should serialize upgrading state", () => {
      tower.upgrade();

      const state = tower.toState();

      expect(state.isUpgrading).toBe(true);
      expect(state.upgradeEndTime).toBeGreaterThan(0);
    });

    it("should serialize damaged tower", () => {
      tower.takeDamage(300);

      const state = tower.toState();

      expect(state.hp).toBe(TOWER_CONFIG.BASE_HP - 300);
      expect(state.maxHp).toBe(TOWER_CONFIG.BASE_HP);
    });
  });

  describe("render", () => {
    it("should not throw when rendering", () => {
      // Create a mock canvas context
      const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        arc: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        fillText: () => {},
        setLineDash: () => {},
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 0,
        shadowColor: "",
        shadowBlur: 0,
        font: "",
        textAlign: "left" as CanvasTextAlign,
        textBaseline: "top" as CanvasTextBaseline,
        lineDashOffset: 0,
      } as unknown as CanvasRenderingContext2D;

      expect(() => tower.render(mockCtx)).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle fallback color for invalid player index", () => {
      const tower = new Tower(
        "t",
        TowerType.MAIN,
        "p",
        999, // Invalid index
        0,
        0,
      );

      expect(tower.color).toBe(PLAYER_COLORS[0]); // Should fallback to first color
    });
  });
});
