/**
 * Neon Arcana - Тесты для ResourcePoint и NeutralGuardianEntity
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ResourcePoint, NeutralGuardianEntity } from "./ResourcePoint";
import {
  ResourcePointType,
  ResourcePointState,
  NeutralGuardian,
} from "@shared/types";
import { RESOURCE_POINT_CONFIG } from "@shared/constants";
import { Vector2 } from "@shared/Vector2";

describe("ResourcePoint", () => {
  describe("constructor", () => {
    it("should create a CRYSTAL_MINE resource point", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );

      expect(point.id).toBe("rp1");
      expect(point.pointType).toBe(ResourcePointType.CRYSTAL_MINE);
      expect(point.position.x).toBe(500);
      expect(point.position.y).toBe(300);
      expect(point.ownerId).toBeNull();
      expect(point.ownerIndex).toBe(-1);
      expect(point.tag).toBe("resource_point");
      expect(point.size).toBe(50);
    });

    it("should create a SMALL_CRYSTAL resource point", () => {
      const point = new ResourcePoint(
        "rp2",
        ResourcePointType.SMALL_CRYSTAL,
        200,
        400
      );

      expect(point.pointType).toBe(ResourcePointType.SMALL_CRYSTAL);
      expect(point.size).toBe(35);
    });

    it("should create a NEUTRAL_CAMP resource point", () => {
      const point = new ResourcePoint(
        "rp3",
        ResourcePointType.NEUTRAL_CAMP,
        600,
        500
      );

      expect(point.pointType).toBe(ResourcePointType.NEUTRAL_CAMP);
      expect(point.size).toBe(40);
      expect(point.bonusCollected).toBe(false);
    });

    it("should spawn correct number of guardians for CRYSTAL_MINE", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );

      expect(point.guardians.length).toBe(
        RESOURCE_POINT_CONFIG.CRYSTAL_MINE.guardianCount
      );
    });

    it("should spawn correct number of guardians for SMALL_CRYSTAL", () => {
      const point = new ResourcePoint(
        "rp2",
        ResourcePointType.SMALL_CRYSTAL,
        200,
        400
      );

      expect(point.guardians.length).toBe(
        RESOURCE_POINT_CONFIG.SMALL_CRYSTAL.guardianCount
      );
    });

    it("should spawn correct number of guardians for NEUTRAL_CAMP", () => {
      const point = new ResourcePoint(
        "rp3",
        ResourcePointType.NEUTRAL_CAMP,
        600,
        500
      );

      expect(point.guardians.length).toBe(
        RESOURCE_POINT_CONFIG.NEUTRAL_CAMP.guardianCount
      );
    });

    it("should position guardians around the point", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );

      for (const guardian of point.guardians) {
        const distance = guardian.distanceTo(point.position);
        // Guardians should be within patrol radius from center
        expect(distance).toBeLessThan(point.size * 2);
      }
    });

    it("should set guardian stats from config", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );
      const config = RESOURCE_POINT_CONFIG.CRYSTAL_MINE;

      for (const guardian of point.guardians) {
        expect(guardian.health.max).toBe(config.guardianHp);
        expect(guardian.dps).toBe(config.guardianDps);
      }
    });
  });

  describe("capture", () => {
    let point: ResourcePoint;

    beforeEach(() => {
      point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );
    });

    it("should not capture if guardians are present", () => {
      const result = point.capture("player1", 0);

      expect(result).toBe(false);
      expect(point.ownerId).toBeNull();
    });

    it("should capture when no guardians", () => {
      // Remove all guardians
      point.guardians = [];

      const result = point.capture("player1", 0);

      expect(result).toBe(true);
      expect(point.ownerId).toBe("player1");
      expect(point.ownerIndex).toBe(0);
    });

    it("should not capture if already owned by same player", () => {
      point.guardians = [];
      point.capture("player1", 0);

      const result = point.capture("player1", 0);

      expect(result).toBe(false);
    });

    it("should allow capture by different player", () => {
      point.guardians = [];
      point.capture("player1", 0);

      const result = point.capture("player2", 1);

      expect(result).toBe(true);
      expect(point.ownerId).toBe("player2");
      expect(point.ownerIndex).toBe(1);
    });

    it("should clear guard units on capture", () => {
      point.guardians = [];
      point.guardUnitIds = ["unit1", "unit2"];
      point.capture("player1", 0);

      expect(point.guardUnitIds.length).toBe(0);
    });
  });

  describe("capture NEUTRAL_CAMP", () => {
    let camp: ResourcePoint;

    beforeEach(() => {
      camp = new ResourcePoint(
        "rp1",
        ResourcePointType.NEUTRAL_CAMP,
        500,
        300
      );
      camp.guardians = [];
    });

    it("should collect bonus on first capture", () => {
      const result = camp.capture("player1", 0);

      expect(result).toBe(true);
      expect(camp.bonusCollected).toBe(true);
    });

    it("should not capture again after bonus collected", () => {
      camp.capture("player1", 0);

      const result = camp.capture("player2", 1);

      expect(result).toBe(false);
    });

    it("should not set owner for neutral camp", () => {
      camp.capture("player1", 0);

      // Neutral camps don't have persistent ownership
      expect(camp.ownerId).toBeNull();
    });

    it("should return one-time bonus correctly", () => {
      expect(camp.getOneTimeBonus()).toBe(
        RESOURCE_POINT_CONFIG.NEUTRAL_CAMP.oneTimeBonus
      );

      camp.bonusCollected = true;
      expect(camp.getOneTimeBonus()).toBe(0);
    });
  });

  describe("loseControl", () => {
    let point: ResourcePoint;

    beforeEach(() => {
      point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );
      point.guardians = [];
      point.capture("player1", 0);
    });

    it("should reset owner", () => {
      point.loseControl();

      expect(point.ownerId).toBeNull();
      expect(point.ownerIndex).toBe(-1);
    });

    it("should clear guard units", () => {
      point.guardUnitIds = ["unit1", "unit2"];
      point.loseControl();

      expect(point.guardUnitIds.length).toBe(0);
    });

    it("should schedule respawn", () => {
      const now = Date.now();
      point.loseControl();

      expect(point.nextRespawnTime).toBeGreaterThan(now);
      expect(point.nextRespawnTime).toBeLessThanOrEqual(
        now + RESOURCE_POINT_CONFIG.CRYSTAL_MINE.respawnTime * 1000 + 100
      );
    });
  });

  describe("guard management", () => {
    let point: ResourcePoint;

    beforeEach(() => {
      point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );
      point.guardians = [];
      point.capture("player1", 0);
    });

    it("should add guard unit", () => {
      const result = point.addGuard("unit1");

      expect(result).toBe(true);
      expect(point.guardUnitIds).toContain("unit1");
    });

    it("should not add duplicate guard", () => {
      point.addGuard("unit1");
      const result = point.addGuard("unit1");

      expect(result).toBe(false);
      expect(point.guardUnitIds.length).toBe(1);
    });

    it("should respect max guards limit", () => {
      const maxGuards = RESOURCE_POINT_CONFIG.CRYSTAL_MINE.maxGuards;

      for (let i = 0; i < maxGuards; i++) {
        point.addGuard(`unit${i}`);
      }

      const result = point.addGuard("extra_unit");

      expect(result).toBe(false);
      expect(point.guardUnitIds.length).toBe(maxGuards);
    });

    it("should remove guard unit", () => {
      point.addGuard("unit1");
      point.addGuard("unit2");
      point.removeGuard("unit1");

      expect(point.guardUnitIds).not.toContain("unit1");
      expect(point.guardUnitIds).toContain("unit2");
    });

    it("should handle removing non-existent guard", () => {
      point.addGuard("unit1");
      point.removeGuard("unit_nonexistent");

      expect(point.guardUnitIds.length).toBe(1);
    });
  });

  describe("income", () => {
    it("should return 0 income when not owned", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );

      expect(point.getIncomePerSec()).toBe(0);
    });

    it("should return correct income for CRYSTAL_MINE", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );
      point.guardians = [];
      point.capture("player1", 0);

      expect(point.getIncomePerSec()).toBe(
        RESOURCE_POINT_CONFIG.CRYSTAL_MINE.incomePerSec
      );
    });

    it("should return correct income for SMALL_CRYSTAL", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.SMALL_CRYSTAL,
        500,
        300
      );
      point.guardians = [];
      point.capture("player1", 0);

      expect(point.getIncomePerSec()).toBe(
        RESOURCE_POINT_CONFIG.SMALL_CRYSTAL.incomePerSec
      );
    });

    it("should return 0 income for NEUTRAL_CAMP", () => {
      const camp = new ResourcePoint(
        "rp1",
        ResourcePointType.NEUTRAL_CAMP,
        500,
        300
      );

      expect(camp.getIncomePerSec()).toBe(0);
    });
  });

  describe("update", () => {
    let point: ResourcePoint;

    beforeEach(() => {
      point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );
    });

    it("should update guardians", () => {
      const guardian = point.guardians[0]!;
      const updateSpy = vi.spyOn(guardian, "update");

      point.update(0.1);

      expect(updateSpy).toHaveBeenCalledWith(0.1);
    });

    it("should remove dead guardians", () => {
      const initialCount = point.guardians.length;
      point.guardians[0]!.health.current = 0;

      point.update(0.1);

      expect(point.guardians.length).toBe(initialCount - 1);
    });

    it("should respawn guardians when timer expires", () => {
      // Clear guardians and set respawn time in the past
      point.guardians = [];
      point.nextRespawnTime = Date.now() - 1000;

      point.update(0.1);

      expect(point.guardians.length).toBe(
        RESOURCE_POINT_CONFIG.CRYSTAL_MINE.guardianCount
      );
      expect(point.respawnCount).toBe(1);
      expect(point.nextRespawnTime).toBe(0);
    });

    it("should not respawn if point is owned", () => {
      point.guardians = [];
      point.ownerId = "player1";
      point.nextRespawnTime = Date.now() - 1000;

      point.update(0.1);

      expect(point.guardians.length).toBe(0);
    });

    it("should not respawn if timer not expired", () => {
      point.guardians = [];
      point.nextRespawnTime = Date.now() + 10000;

      point.update(0.1);

      expect(point.guardians.length).toBe(0);
    });

    it("should increase guardian HP with each respawn (escalation)", () => {
      const baseHp = RESOURCE_POINT_CONFIG.CRYSTAL_MINE.guardianHp;

      // First respawn
      point.guardians = [];
      point.nextRespawnTime = Date.now() - 1000;
      point.update(0.1);

      // HP should be 10% higher
      const expectedHp = Math.round(baseHp * 1.1);
      expect(point.guardians[0]!.health.max).toBe(expectedHp);

      // Second respawn
      point.guardians = [];
      point.nextRespawnTime = Date.now() - 1000;
      point.update(0.1);

      // HP should be 20% higher
      const expectedHp2 = Math.round(baseHp * 1.2);
      expect(point.guardians[0]!.health.max).toBe(expectedHp2);
    });
  });

  describe("utility methods", () => {
    it("should correctly report canBeCaptured", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );

      expect(point.canBeCaptured()).toBe(false);

      point.guardians = [];
      expect(point.canBeCaptured()).toBe(true);
    });

    it("should correctly report hasDefenders with guardians", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );

      expect(point.hasDefenders()).toBe(true);
    });

    it("should correctly report hasDefenders with player guards", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );
      point.guardians = [];
      point.guardUnitIds = ["unit1"];

      expect(point.hasDefenders()).toBe(true);
    });

    it("should correctly report hasDefenders when empty", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );
      point.guardians = [];
      point.guardUnitIds = [];

      expect(point.hasDefenders()).toBe(false);
    });
  });

  describe("serialization", () => {
    it("should serialize to state correctly", () => {
      const point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );
      point.guardians = [];
      point.capture("player1", 0);
      point.addGuard("unit1");
      point.respawnCount = 2;
      point.nextRespawnTime = 12345;

      const state = point.toState();

      expect(state.id).toBe("rp1");
      expect(state.type).toBe(ResourcePointType.CRYSTAL_MINE);
      expect(state.position).toEqual({ x: 500, y: 300 });
      expect(state.ownerId).toBe("player1");
      expect(state.guardUnitIds).toEqual(["unit1"]);
      expect(state.respawnCount).toBe(2);
      expect(state.nextRespawnTime).toBe(12345);
    });

    it("should create from state correctly", () => {
      const state: ResourcePointState = {
        id: "rp1",
        type: ResourcePointType.SMALL_CRYSTAL,
        position: { x: 200, y: 400 },
        ownerId: "player2",
        guardians: [
          {
            id: "g1",
            hp: 40,
            maxHp: 50,
            dps: 8,
            position: { x: 210, y: 410 },
            targetId: null,
          },
        ],
        guardUnitIds: ["unit1", "unit2"],
        nextRespawnTime: 54321,
        respawnCount: 1,
      };

      const point = ResourcePoint.fromState(state);

      expect(point.id).toBe("rp1");
      expect(point.pointType).toBe(ResourcePointType.SMALL_CRYSTAL);
      expect(point.position.x).toBe(200);
      expect(point.position.y).toBe(400);
      expect(point.ownerId).toBe("player2");
      expect(point.guardians.length).toBe(1);
      expect(point.guardians[0]!.health.current).toBe(40);
      expect(point.guardUnitIds).toEqual(["unit1", "unit2"]);
      expect(point.nextRespawnTime).toBe(54321);
      expect(point.respawnCount).toBe(1);
    });
  });

  describe("render", () => {
    let point: ResourcePoint;
    let mockCtx: CanvasRenderingContext2D;

    beforeEach(() => {
      point = new ResourcePoint(
        "rp1",
        ResourcePointType.CRYSTAL_MINE,
        500,
        300
      );

      mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        fillText: vi.fn(),
        setLineDash: vi.fn(),
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        shadowColor: "",
        shadowBlur: 0,
        font: "",
        textAlign: "left",
        textBaseline: "top",
      } as unknown as CanvasRenderingContext2D;
    });

    it("should call render without errors for CRYSTAL_MINE", () => {
      expect(() => point.render(mockCtx)).not.toThrow();
      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it("should call render without errors for SMALL_CRYSTAL", () => {
      const smallCrystal = new ResourcePoint(
        "rp2",
        ResourcePointType.SMALL_CRYSTAL,
        200,
        400
      );

      expect(() => smallCrystal.render(mockCtx)).not.toThrow();
    });

    it("should call render without errors for NEUTRAL_CAMP", () => {
      const camp = new ResourcePoint(
        "rp3",
        ResourcePointType.NEUTRAL_CAMP,
        600,
        500
      );

      expect(() => camp.render(mockCtx)).not.toThrow();
    });

    it("should render guardians", () => {
      const guardian = point.guardians[0]!;
      const renderSpy = vi.spyOn(guardian, "render");

      point.render(mockCtx);

      expect(renderSpy).toHaveBeenCalledWith(mockCtx);
    });
  });
});

describe("NeutralGuardianEntity", () => {
  describe("constructor", () => {
    it("should create guardian with correct stats", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);

      expect(guardian.id).toBe("g1");
      expect(guardian.health.max).toBe(100);
      expect(guardian.health.current).toBe(100);
      expect(guardian.dps).toBe(15);
      expect(guardian.position.x).toBe(500);
      expect(guardian.position.y).toBe(300);
      expect(guardian.targetId).toBeNull();
    });
  });

  describe("takeDamage", () => {
    it("should reduce health", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);

      guardian.takeDamage(30);

      expect(guardian.health.current).toBe(70);
      expect(guardian.isAlive).toBe(true);
    });

    it("should return true when killed", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);

      const result = guardian.takeDamage(100);

      expect(result).toBe(true);
      expect(guardian.isAlive).toBe(false);
    });

    it("should not go below 0 HP", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);

      guardian.takeDamage(150);

      expect(guardian.health.current).toBe(0);
    });
  });

  describe("attack", () => {
    it("should return DPS on attack", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);

      const damage = guardian.attack();

      expect(damage).toBe(15);
    });

    it("should respect attack cooldown", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);

      guardian.attack();
      const secondAttack = guardian.attack();

      expect(secondAttack).toBe(0);
    });

    it("should allow attack after cooldown", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);

      guardian.attack();
      guardian.update(1.0); // Wait 1 second
      const secondAttack = guardian.attack();

      expect(secondAttack).toBe(15);
    });

    it("should report canAttack correctly", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);

      expect(guardian.canAttack()).toBe(true);

      guardian.attack();
      expect(guardian.canAttack()).toBe(false);

      guardian.update(1.0);
      expect(guardian.canAttack()).toBe(true);
    });
  });

  describe("update", () => {
    it("should reduce attack cooldown", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);

      guardian.attack();
      expect(guardian.canAttack()).toBe(false);

      guardian.update(0.5);
      expect(guardian.canAttack()).toBe(false);

      guardian.update(0.5);
      expect(guardian.canAttack()).toBe(true);
    });
  });

  describe("distanceTo", () => {
    it("should calculate correct distance", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 0, 0);
      const target = new Vector2(3, 4);

      const distance = guardian.distanceTo(target);

      expect(distance).toBe(5);
    });
  });

  describe("serialization", () => {
    it("should serialize to state correctly", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);
      guardian.health.current = 75;
      guardian.targetId = "unit1";

      const state = guardian.toState();

      expect(state.id).toBe("g1");
      expect(state.hp).toBe(75);
      expect(state.maxHp).toBe(100);
      expect(state.dps).toBe(15);
      expect(state.position).toEqual({ x: 500, y: 300 });
      expect(state.targetId).toBe("unit1");
    });

    it("should create from state correctly", () => {
      const state: NeutralGuardian = {
        id: "g1",
        hp: 60,
        maxHp: 80,
        dps: 12,
        position: { x: 200, y: 400 },
        targetId: "unit2",
      };

      const guardian = NeutralGuardianEntity.fromState(state);

      expect(guardian.id).toBe("g1");
      expect(guardian.health.current).toBe(60);
      expect(guardian.health.max).toBe(80);
      expect(guardian.dps).toBe(12);
      expect(guardian.position.x).toBe(200);
      expect(guardian.position.y).toBe(400);
      expect(guardian.targetId).toBe("unit2");
    });
  });

  describe("render", () => {
    it("should render without errors", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);

      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
      } as unknown as CanvasRenderingContext2D;

      expect(() => guardian.render(mockCtx)).not.toThrow();
      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
    });
  });

  describe("isAlive", () => {
    it("should return true when HP > 0", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);

      expect(guardian.isAlive).toBe(true);
    });

    it("should return false when HP = 0", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 15, 500, 300);
      guardian.health.current = 0;

      expect(guardian.isAlive).toBe(false);
    });
  });
});
