/**
 * Neon Arcana - Tests for NeutralCombatSystem
 * Тесты для системы боя юнитов с нейтральными защитниками
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NeutralCombatSystem } from "./NeutralCombatSystem";
import { Unit } from "../entities/Unit";
import {
  ResourcePoint,
  NeutralGuardianEntity,
} from "../entities/ResourcePoint";
import { UnitType } from "@shared/constants";
import { UnitBehaviorState, ResourcePointType } from "@shared/types";

describe("NeutralCombatSystem", () => {
  let unit: Unit;
  let resourcePoint: ResourcePoint;

  beforeEach(() => {
    // Create a test unit with enough HP to survive guardian attacks
    unit = new Unit("unit-1", UnitType.SCOUT, "player-1", 0, 100, 100, {
      hp: 0,
      dps: 0,
      speed: 0,
    });
    // Give unit plenty of HP to survive tests
    unit.health.max = 1000;
    unit.health.current = 1000;
    unit.state = UnitBehaviorState.MOVING;

    // Create a test resource point with guardians
    resourcePoint = new ResourcePoint(
      "rp-1",
      ResourcePointType.CRYSTAL_MINE,
      500,
      300,
    );
  });

  describe("findClosestAliveGuardian", () => {
    it("should return null when no guardians exist", () => {
      resourcePoint.guardians = [];

      const result = NeutralCombatSystem.findClosestAliveGuardian(
        unit,
        resourcePoint,
      );

      expect(result).toBeNull();
    });

    it("should return null when all guardians are dead", () => {
      for (const guardian of resourcePoint.guardians) {
        guardian.health.current = 0;
      }

      const result = NeutralCombatSystem.findClosestAliveGuardian(
        unit,
        resourcePoint,
      );

      expect(result).toBeNull();
    });

    it("should return the closest alive guardian", () => {
      // Position unit at specific location
      unit.position.x = 480;
      unit.position.y = 290;

      // Create guardians at different distances
      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 100, 10, 600, 300), // Far
        new NeutralGuardianEntity("g2", 100, 10, 490, 295), // Close
        new NeutralGuardianEntity("g3", 100, 10, 550, 350), // Medium
      ];

      const result = NeutralCombatSystem.findClosestAliveGuardian(
        unit,
        resourcePoint,
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe("g2");
    });

    it("should skip dead guardians when finding closest", () => {
      unit.position.x = 480;
      unit.position.y = 290;

      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 100, 10, 600, 300), // Far but alive
        new NeutralGuardianEntity("g2", 100, 10, 490, 295), // Closest but dead
        new NeutralGuardianEntity("g3", 100, 10, 520, 310), // Medium, alive
      ];

      // Kill the closest guardian
      const guardian1 = resourcePoint.guardians[1];
      if (guardian1) guardian1.health.current = 0;

      const result = NeutralCombatSystem.findClosestAliveGuardian(
        unit,
        resourcePoint,
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe("g3");
    });
  });

  describe("getAliveGuardians", () => {
    it("should return empty array when no guardians", () => {
      resourcePoint.guardians = [];

      const result = NeutralCombatSystem.getAliveGuardians(resourcePoint);

      expect(result).toEqual([]);
    });

    it("should return only alive guardians", () => {
      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 100, 10, 500, 300),
        new NeutralGuardianEntity("g2", 100, 10, 510, 300),
        new NeutralGuardianEntity("g3", 100, 10, 520, 300),
      ];

      // Kill second guardian
      const guardian1 = resourcePoint.guardians[1];
      if (guardian1) guardian1.health.current = 0;

      const result = NeutralCombatSystem.getAliveGuardians(resourcePoint);

      expect(result.length).toBe(2);
      expect(result.map((g) => g.id)).toEqual(["g1", "g3"]);
    });

    it("should return all guardians when all are alive", () => {
      const initialCount = resourcePoint.guardians.length;

      const result = NeutralCombatSystem.getAliveGuardians(resourcePoint);

      expect(result.length).toBe(initialCount);
    });
  });

  describe("shouldRetarget", () => {
    it("should return true when unit has no target", () => {
      unit.targetId = null;

      const result = NeutralCombatSystem.shouldRetarget(unit, resourcePoint);

      expect(result).toBe(true);
    });

    it("should return true when target guardian is dead", () => {
      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 100, 10, 500, 300),
      ];
      const guardian0 = resourcePoint.guardians[0];
      if (guardian0) guardian0.health.current = 0;
      unit.targetId = "g1";

      const result = NeutralCombatSystem.shouldRetarget(unit, resourcePoint);

      expect(result).toBe(true);
    });

    it("should return true when target guardian does not exist", () => {
      unit.targetId = "non-existent-guardian";

      const result = NeutralCombatSystem.shouldRetarget(unit, resourcePoint);

      expect(result).toBe(true);
    });

    it("should return false when target guardian is alive", () => {
      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 100, 10, 500, 300),
      ];
      unit.targetId = "g1";

      const result = NeutralCombatSystem.shouldRetarget(unit, resourcePoint);

      expect(result).toBe(false);
    });
  });

  describe("retargetUnit", () => {
    it("should find and set new target when guardians available", () => {
      unit.position.x = 500;
      unit.position.y = 300;
      unit.state = UnitBehaviorState.FIGHTING;
      unit.targetId = null;

      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 100, 10, 510, 300),
      ];

      const result = NeutralCombatSystem.retargetUnit(unit, resourcePoint);

      expect(result).toBe(true);
      expect(unit.targetId).toBe("g1");
      expect(unit.state).toBe(UnitBehaviorState.FIGHTING);
    });

    it("should transition to MOVING when no guardians left", () => {
      unit.state = UnitBehaviorState.FIGHTING;
      unit.targetId = "dead-guardian";
      resourcePoint.guardians = [];

      const result = NeutralCombatSystem.retargetUnit(unit, resourcePoint);

      expect(result).toBe(false);
      expect(unit.targetId).toBeNull();
      expect(unit.state).toBe(UnitBehaviorState.MOVING);
    });

    it("should switch to next guardian after killing one", () => {
      unit.position.x = 500;
      unit.position.y = 300;
      unit.state = UnitBehaviorState.FIGHTING;

      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 100, 10, 510, 300),
        new NeutralGuardianEntity("g2", 100, 10, 520, 300),
      ];

      // Kill first guardian
      const guardian0 = resourcePoint.guardians[0];
      if (guardian0) guardian0.health.current = 0;
      unit.targetId = "g1";

      const result = NeutralCombatSystem.retargetUnit(unit, resourcePoint);

      expect(result).toBe(true);
      expect(unit.targetId).toBe("g2");
      expect(unit.state).toBe(UnitBehaviorState.FIGHTING);
    });
  });

  describe("isUnitInAggroRange", () => {
    it("should return true when unit is close to point", () => {
      unit.position.x = resourcePoint.position.x + 30;
      unit.position.y = resourcePoint.position.y;

      const result = NeutralCombatSystem.isUnitInAggroRange(
        unit,
        resourcePoint,
        false,
      );

      expect(result).toBe(true);
    });

    it("should return false when unit is far from point", () => {
      unit.position.x = resourcePoint.position.x + 500;
      unit.position.y = resourcePoint.position.y;

      const result = NeutralCombatSystem.isUnitInAggroRange(
        unit,
        resourcePoint,
        false,
      );

      expect(result).toBe(false);
    });

    it("should use extended range when specified", () => {
      // Position unit at edge of extended range
      unit.position.x = resourcePoint.position.x + resourcePoint.size + 100;
      unit.position.y = resourcePoint.position.y;

      const normalRange = NeutralCombatSystem.isUnitInAggroRange(
        unit,
        resourcePoint,
        false,
      );
      const extendedRange = NeutralCombatSystem.isUnitInAggroRange(
        unit,
        resourcePoint,
        true,
      );

      expect(normalRange).toBe(false);
      expect(extendedRange).toBe(true);
    });
  });

  describe("canUnitAttackGuardian", () => {
    it("should return true when unit is in attack range", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 10, 500, 300);
      unit.position.x = 500;
      unit.position.y = 300;

      const result = NeutralCombatSystem.canUnitAttackGuardian(unit, guardian);

      expect(result).toBe(true);
    });

    it("should return false when unit is out of attack range", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 10, 500, 300);
      unit.position.x = 100;
      unit.position.y = 100;

      const result = NeutralCombatSystem.canUnitAttackGuardian(unit, guardian);

      expect(result).toBe(false);
    });

    it("should consider guardian size in range calculation", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 10, 500, 300);
      // Position just outside attack range but within guardian size
      const attackRange = unit.combat.attackRange;
      unit.position.x = 500 + attackRange + guardian.size - 1;
      unit.position.y = 300;

      const result = NeutralCombatSystem.canUnitAttackGuardian(unit, guardian);

      expect(result).toBe(true);
    });
  });

  describe("canGuardianAttackUnit", () => {
    it("should return true when unit is in guardian aggro radius", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 10, 500, 300);
      unit.position.x = 500;
      unit.position.y = 300;

      const result = NeutralCombatSystem.canGuardianAttackUnit(guardian, unit);

      expect(result).toBe(true);
    });

    it("should return false when unit is outside guardian aggro radius", () => {
      const guardian = new NeutralGuardianEntity("g1", 100, 10, 500, 300);
      unit.position.x = 500 + guardian.aggroRadius + 100;
      unit.position.y = 300;

      const result = NeutralCombatSystem.canGuardianAttackUnit(guardian, unit);

      expect(result).toBe(false);
    });
  });

  describe("prepareUnitForCapture", () => {
    it("should stop fighting and move unit to point center", () => {
      unit.state = UnitBehaviorState.FIGHTING;
      unit.targetId = "some-target";
      unit.position.x = 100;
      unit.position.y = 100;

      NeutralCombatSystem.prepareUnitForCapture(unit, resourcePoint);

      expect(unit.state).toBe(UnitBehaviorState.MOVING);
      expect(unit.targetId).toBeNull();
      expect(unit.position.x).toBe(resourcePoint.position.x);
      expect(unit.position.y).toBe(resourcePoint.position.y);
      expect(unit.guardingPointId).toBe(resourcePoint.id);
    });
  });

  describe("canUnitCapturePoint", () => {
    it("should return true when unit is targeting this point", () => {
      unit.guardingPointId = resourcePoint.id;

      const result = NeutralCombatSystem.canUnitCapturePoint(
        unit,
        resourcePoint,
      );

      expect(result).toBe(true);
    });

    it("should return true when unit has no other target", () => {
      unit.guardingPointId = null;

      const result = NeutralCombatSystem.canUnitCapturePoint(
        unit,
        resourcePoint,
      );

      expect(result).toBe(true);
    });

    it("should return false when unit is targeting different point", () => {
      unit.guardingPointId = "other-point-id";

      const result = NeutralCombatSystem.canUnitCapturePoint(
        unit,
        resourcePoint,
      );

      expect(result).toBe(false);
    });
  });

  describe("isPointFull", () => {
    it("should return false when point has no guards", () => {
      resourcePoint.guardUnitIds = [];

      const result = NeutralCombatSystem.isPointFull(resourcePoint);

      expect(result).toBe(false);
    });

    it("should return false when point has space for more guards", () => {
      resourcePoint.guardUnitIds = ["unit1", "unit2"];

      const result = NeutralCombatSystem.isPointFull(resourcePoint);

      expect(result).toBe(false);
    });

    it("should return true when point is at max guards", () => {
      // Fill up to max guards (should be 4 for CRYSTAL_MINE)
      resourcePoint.guardUnitIds = ["unit1", "unit2", "unit3", "unit4"];

      const result = NeutralCombatSystem.isPointFull(resourcePoint);

      expect(result).toBe(true);
    });
  });

  describe("canUnitGuardPoint", () => {
    beforeEach(() => {
      // Clear guardians so point can be captured
      resourcePoint.guardians = [];
      // Capture point by player
      resourcePoint.capture("player-1", 0);
    });

    it("should return true when point belongs to unit owner and has space", () => {
      unit.ownerId = "player-1";
      unit.state = UnitBehaviorState.MOVING;
      resourcePoint.guardUnitIds = [];

      const result = NeutralCombatSystem.canUnitGuardPoint(unit, resourcePoint);

      expect(result).toBe(true);
    });

    it("should return false when point belongs to different player", () => {
      unit.ownerId = "player-2";
      unit.state = UnitBehaviorState.MOVING;

      const result = NeutralCombatSystem.canUnitGuardPoint(unit, resourcePoint);

      expect(result).toBe(false);
    });

    it("should return false when point is full", () => {
      unit.ownerId = "player-1";
      unit.state = UnitBehaviorState.MOVING;
      resourcePoint.guardUnitIds = ["u1", "u2", "u3", "u4"];

      const result = NeutralCombatSystem.canUnitGuardPoint(unit, resourcePoint);

      expect(result).toBe(false);
    });

    it("should return true when unit is specifically going to this point", () => {
      unit.ownerId = "player-1";
      unit.state = UnitBehaviorState.FIGHTING; // Not MOVING
      unit.guardingPointId = resourcePoint.id;
      resourcePoint.guardUnitIds = [];

      const result = NeutralCombatSystem.canUnitGuardPoint(unit, resourcePoint);

      expect(result).toBe(true);
    });

    it("should return false for NEUTRAL_CAMP (maxGuards = 0)", () => {
      const camp = new ResourcePoint(
        "camp-1",
        ResourcePointType.NEUTRAL_CAMP,
        600,
        400,
      );
      camp.guardians = [];
      camp.bonusCollected = false;

      unit.ownerId = "player-1";
      unit.state = UnitBehaviorState.MOVING;

      const result = NeutralCombatSystem.canUnitGuardPoint(unit, camp);

      expect(result).toBe(false);
    });
  });

  describe("processUnitCombat", () => {
    it("should retarget unit when current target is dead", () => {
      unit.position.x = 500;
      unit.position.y = 300;
      unit.state = UnitBehaviorState.FIGHTING;

      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 100, 10, 510, 300),
        new NeutralGuardianEntity("g2", 100, 10, 520, 300),
      ];

      // Kill first guardian and set it as target
      const guardian0 = resourcePoint.guardians[0];
      if (guardian0) guardian0.health.current = 0;
      unit.targetId = "g1";

      const aliveGuardians =
        NeutralCombatSystem.getAliveGuardians(resourcePoint);
      const result = NeutralCombatSystem.processUnitCombat(
        unit,
        resourcePoint,
        aliveGuardians,
      );

      expect(result.retargeted).toBe(true);
      expect(unit.targetId).toBe("g2");
    });

    it("should transition to MOVING when all guardians dead", () => {
      unit.position.x = 500;
      unit.position.y = 300;
      unit.state = UnitBehaviorState.FIGHTING;
      unit.targetId = "g1";

      // All guardians dead
      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 100, 10, 510, 300),
      ];
      const guardian0 = resourcePoint.guardians[0];
      if (guardian0) guardian0.health.current = 0;

      const aliveGuardians =
        NeutralCombatSystem.getAliveGuardians(resourcePoint);
      NeutralCombatSystem.processUnitCombat(
        unit,
        resourcePoint,
        aliveGuardians,
      );

      expect(unit.state).toBe(UnitBehaviorState.MOVING);
      expect(unit.targetId).toBeNull();
    });

    it("should start fighting when unit in range of guardian", () => {
      unit.position.x = 510;
      unit.position.y = 300;
      unit.state = UnitBehaviorState.MOVING;
      unit.targetId = null;
      // Ensure unit has enough HP
      unit.health.max = 1000;
      unit.health.current = 1000;

      // Create guardian with 0 DPS so it doesn't kill the unit
      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 100, 0, 510, 300),
      ];

      const aliveGuardians =
        NeutralCombatSystem.getAliveGuardians(resourcePoint);
      NeutralCombatSystem.processUnitCombat(
        unit,
        resourcePoint,
        aliveGuardians,
      );

      expect(unit.state).toBe(UnitBehaviorState.FIGHTING);
      expect(unit.targetId).toBe("g1");
    });
  });

  describe("sequential guardian attack flow", () => {
    it("should allow unit to kill all guardians sequentially", () => {
      unit.position.x = 500;
      unit.position.y = 300;
      unit.state = UnitBehaviorState.MOVING;
      // Ensure unit has enough HP to survive all guardians
      unit.health.max = 1000;
      unit.health.current = 1000;

      // Create 3 guardians with low HP and 0 DPS for testing
      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 10, 0, 505, 300),
        new NeutralGuardianEntity("g2", 10, 0, 510, 300),
        new NeutralGuardianEntity("g3", 10, 0, 515, 300),
      ];

      // Simulate combat loop - first guardian
      let aliveGuardians = NeutralCombatSystem.getAliveGuardians(resourcePoint);
      expect(aliveGuardians.length).toBe(3);

      // Unit starts fighting first guardian
      NeutralCombatSystem.processUnitCombat(
        unit,
        resourcePoint,
        aliveGuardians,
      );
      expect(unit.state).toBe(UnitBehaviorState.FIGHTING);
      expect(unit.targetId).toBe("g1");

      // Kill first guardian
      const guardian0 = resourcePoint.guardians[0];
      if (guardian0) guardian0.health.current = 0;

      // Process combat - should retarget to second guardian
      aliveGuardians = NeutralCombatSystem.getAliveGuardians(resourcePoint);
      expect(aliveGuardians.length).toBe(2);

      const result1 = NeutralCombatSystem.processUnitCombat(
        unit,
        resourcePoint,
        aliveGuardians,
      );
      expect(result1.retargeted).toBe(true);
      expect(unit.targetId).toBe("g2");
      expect(unit.state).toBe(UnitBehaviorState.FIGHTING);

      // Kill second guardian
      const guardian1 = resourcePoint.guardians[1];
      if (guardian1) guardian1.health.current = 0;

      // Process combat - should retarget to third guardian
      aliveGuardians = NeutralCombatSystem.getAliveGuardians(resourcePoint);
      expect(aliveGuardians.length).toBe(1);

      const result2 = NeutralCombatSystem.processUnitCombat(
        unit,
        resourcePoint,
        aliveGuardians,
      );
      expect(result2.retargeted).toBe(true);
      expect(unit.targetId).toBe("g3");
      expect(unit.state).toBe(UnitBehaviorState.FIGHTING);

      // Kill third guardian
      const guardian2 = resourcePoint.guardians[2];
      if (guardian2) guardian2.health.current = 0;

      // Process combat - should transition to MOVING (ready for capture)
      aliveGuardians = NeutralCombatSystem.getAliveGuardians(resourcePoint);
      expect(aliveGuardians.length).toBe(0);

      NeutralCombatSystem.processUnitCombat(
        unit,
        resourcePoint,
        aliveGuardians,
      );
      // When all guardians dead and processed, unit should be ready
      // (actual transition happens in retargetUnit when no guardians found)
      // We need to trigger retarget manually since processUnitCombat only checks
      // when unit is in FIGHTING state with a target
      if (NeutralCombatSystem.shouldRetarget(unit, resourcePoint)) {
        NeutralCombatSystem.retargetUnit(unit, resourcePoint);
      }

      expect(unit.state).toBe(UnitBehaviorState.MOVING);
      expect(unit.targetId).toBeNull();
    });
  });

  describe("point capacity limit", () => {
    beforeEach(() => {
      resourcePoint.guardians = [];
      resourcePoint.capture("player-1", 0);
    });

    it("should allow up to maxGuards units on a point", () => {
      const maxGuards = resourcePoint.config.maxGuards;

      // Add units up to max
      for (let i = 0; i < maxGuards; i++) {
        expect(NeutralCombatSystem.isPointFull(resourcePoint)).toBe(false);
        resourcePoint.addGuard(`unit-${i}`);
      }

      expect(NeutralCombatSystem.isPointFull(resourcePoint)).toBe(true);
      expect(resourcePoint.guardUnitIds.length).toBe(maxGuards);
    });

    it("should report canUnitGuardPoint false when point is full", () => {
      const maxGuards = resourcePoint.config.maxGuards;

      // Fill the point
      for (let i = 0; i < maxGuards; i++) {
        resourcePoint.addGuard(`unit-${i}`);
      }

      unit.ownerId = "player-1";
      unit.state = UnitBehaviorState.MOVING;

      const result = NeutralCombatSystem.canUnitGuardPoint(unit, resourcePoint);

      expect(result).toBe(false);
    });
  });
});
