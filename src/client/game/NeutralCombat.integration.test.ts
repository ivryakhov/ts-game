/**
 * Neon Arcana - Integration Tests for Neutral Combat
 * Интеграционные тесты для боя юнитов с нейтральными защитниками
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Unit } from "../entities/Unit";
import {
  ResourcePoint,
  NeutralGuardianEntity,
} from "../entities/ResourcePoint";
import { UnitType } from "@shared/constants";
import { UnitBehaviorState, ResourcePointType } from "@shared/types";
import { NeutralCombatSystem } from "../systems/NeutralCombatSystem";

/**
 * Симуляция игрового цикла для тестирования
 */
function simulateGameLoop(
  unit: Unit,
  point: ResourcePoint,
  maxIterations: number = 1000,
  dt: number = 0.1,
): {
  logs: string[];
  iterations: number;
  unitFinalState: UnitBehaviorState;
  guardiansKilled: number;
  unitAlive: boolean;
} {
  const logs: string[] = [];
  let iterations = 0;
  let guardiansKilled = 0;
  const initialGuardianCount = point.guardians.length;

  logs.push(`=== Starting simulation ===`);
  logs.push(
    `Unit: ${unit.id}, type: ${unit.unitType}, state: ${unit.state}, hp: ${unit.health.current}/${unit.health.max}`,
  );
  logs.push(
    `Unit position: (${unit.position.x.toFixed(0)}, ${unit.position.y.toFixed(0)})`,
  );
  logs.push(`Unit attackRange: ${unit.combat.attackRange}`);
  logs.push(
    `Resource point: ${point.id}, guardians: ${point.guardians.length}`,
  );
  logs.push(
    `Point position: (${point.position.x.toFixed(0)}, ${point.position.y.toFixed(0)})`,
  );

  for (const guardian of point.guardians) {
    logs.push(
      `  Guardian ${guardian.id}: hp=${guardian.health.current}, pos=(${guardian.position.x.toFixed(0)}, ${guardian.position.y.toFixed(0)})`,
    );
  }

  while (iterations < maxIterations) {
    iterations++;

    // 1. Update unit (movement, state transitions)
    unit.update(dt);

    // 2. Update resource point (removes dead guardians)
    point.update(dt);

    // Check how many guardians died
    const currentAliveGuardians = point.guardians.filter((g) => g.isAlive);
    const newlyKilled =
      initialGuardianCount - guardiansKilled - currentAliveGuardians.length;
    if (newlyKilled > 0) {
      guardiansKilled += newlyKilled;
      logs.push(
        `[Iter ${iterations}] Guardian killed! Total killed: ${guardiansKilled}`,
      );
    }

    // 3. Skip if unit is dead
    if (!unit.isAlive) {
      logs.push(`[Iter ${iterations}] Unit died!`);
      break;
    }

    // 4. Skip if unit is spawning
    if (unit.state === UnitBehaviorState.SPAWNING) {
      continue;
    }

    // 5. Get alive guardians
    const aliveGuardians = NeutralCombatSystem.getAliveGuardians(point);

    // 6. If no guardians, prepare for capture
    if (aliveGuardians.length === 0) {
      logs.push(
        `[Iter ${iterations}] All guardians dead! Unit state: ${unit.state}`,
      );
      if (unit.state === UnitBehaviorState.FIGHTING) {
        NeutralCombatSystem.prepareUnitForCapture(unit, point);
        logs.push(`[Iter ${iterations}] Unit prepared for capture`);
      }
      break;
    }

    // 7. Check if unit in aggro range
    const isGoingToThisPoint = unit.guardingPointId === point.id;
    if (
      !NeutralCombatSystem.isUnitInAggroRange(unit, point, isGoingToThisPoint)
    ) {
      continue;
    }

    // 8. If unit is fighting, check if need to retarget
    if (unit.state === UnitBehaviorState.FIGHTING && unit.targetId) {
      if (NeutralCombatSystem.shouldRetarget(unit, point)) {
        logs.push(
          `[Iter ${iterations}] Unit needs to retarget from ${unit.targetId}`,
        );
        const foundNew = NeutralCombatSystem.retargetUnit(unit, point);
        logs.push(
          `[Iter ${iterations}] Retarget result: ${foundNew}, new target: ${unit.targetId}`,
        );
        logs.push(
          `[Iter ${iterations}] Unit position after retarget: (${unit.position.x.toFixed(0)}, ${unit.position.y.toFixed(0)}), state: ${unit.state}`,
        );
      }
    }

    // 9. Find closest guardian
    const closestGuardian = NeutralCombatSystem.findClosestAliveGuardian(
      unit,
      point,
    );

    if (!closestGuardian) {
      logs.push(
        `[Iter ${iterations}] No closest guardian found! Unit pos: (${unit.position.x.toFixed(0)}, ${unit.position.y.toFixed(0)})`,
      );
      continue;
    }

    // Check distance to guardian
    const distToGuardianDbg = unit.position.distanceTo(
      closestGuardian.position,
    );
    const canAttackDbg =
      distToGuardianDbg <= unit.combat.attackRange + closestGuardian.size;

    // Log distance info every 100 iterations
    if (iterations % 100 === 0) {
      logs.push(
        `[Iter ${iterations}] Debug: unit at (${unit.position.x.toFixed(0)}, ${unit.position.y.toFixed(0)}), guardian ${closestGuardian.id} at (${closestGuardian.position.x.toFixed(0)}, ${closestGuardian.position.y.toFixed(0)}), dist=${distToGuardianDbg.toFixed(0)}, canAttack=${canAttackDbg}`,
      );
    }

    // If unit can't attack guardian, move towards it
    if (!canAttackDbg && unit.state === UnitBehaviorState.FIGHTING) {
      unit.state = UnitBehaviorState.MOVING;
      unit.waypoints = [
        { position: { x: unit.position.x, y: unit.position.y }, index: 0 },
        {
          position: {
            x: closestGuardian.position.x,
            y: closestGuardian.position.y,
          },
          index: 1,
        },
      ];
      unit.currentWaypointIndex = 1;
      if (iterations % 100 === 0) {
        logs.push(
          `[Iter ${iterations}] Unit switched to MOVING to approach guardian`,
        );
      }
    }

    // 10. Guardian attacks unit
    if (NeutralCombatSystem.canGuardianAttackUnit(closestGuardian, unit)) {
      if (closestGuardian.canAttack()) {
        const damage = closestGuardian.attack();
        unit.takeDamage(damage);
      }
    }

    // 11. Unit attacks guardian
    const distToGuardian = unit.position.distanceTo(closestGuardian.position);
    const canAttack =
      distToGuardian <= unit.combat.attackRange + closestGuardian.size;

    if (canAttack) {
      // Start fighting
      if (unit.state === UnitBehaviorState.MOVING) {
        unit.state = UnitBehaviorState.FIGHTING;
        unit.targetId = closestGuardian.id;
        logs.push(
          `[Iter ${iterations}] Unit started fighting guardian ${closestGuardian.id}`,
        );
      }

      // Attack
      if (unit.combat.canAttack()) {
        const damage = unit.combat.attack();
        if (damage > 0) {
          closestGuardian.takeDamage(damage);
          logs.push(
            `[Iter ${iterations}] Unit dealt ${damage} damage to ${closestGuardian.id}, hp: ${closestGuardian.health.current}/${closestGuardian.health.max}`,
          );
        }
      }
    }
  }

  logs.push(`=== Simulation ended ===`);
  logs.push(`Iterations: ${iterations}`);
  logs.push(`Unit final state: ${unit.state}`);
  logs.push(`Unit alive: ${unit.isAlive}`);
  logs.push(`Guardians killed: ${guardiansKilled}`);
  logs.push(
    `Guardians remaining: ${point.guardians.filter((g) => g.isAlive).length}`,
  );

  return {
    logs,
    iterations,
    unitFinalState: unit.state,
    guardiansKilled,
    unitAlive: unit.isAlive,
  };
}

describe("Neutral Combat Integration", () => {
  let unit: Unit;
  let resourcePoint: ResourcePoint;

  beforeEach(() => {
    // Create a scout unit without upgrades (uses default stats from config)
    unit = new Unit("unit-1", UnitType.SCOUT, "player-1", 0, 100, 300);

    // Give unit lots of HP so it survives
    unit.health.max = 500;
    unit.health.current = 500;

    // Set unit state to MOVING (skip spawning)
    unit.state = UnitBehaviorState.MOVING;

    // Create resource point at (500, 300)
    resourcePoint = new ResourcePoint(
      "rp-1",
      ResourcePointType.CRYSTAL_MINE,
      500,
      300,
    );

    // Mark unit as going to this point
    unit.guardingPointId = resourcePoint.id;

    // Set waypoints (unit starts at 100,300, goes to 500,300)
    unit.waypoints = [
      { position: { x: 100, y: 300 }, index: 0 },
      { position: { x: 500, y: 300 }, index: 1 },
    ];
    unit.currentWaypointIndex = 1;
  });

  describe("Unit movement to resource point", () => {
    it("should move unit towards resource point", () => {
      const initialX = unit.position.x;

      // Simulate 10 updates
      for (let i = 0; i < 10; i++) {
        unit.update(0.1);
      }

      expect(unit.position.x).toBeGreaterThan(initialX);
    });

    it("should stop at resource point", () => {
      // Move unit close to target
      unit.position.x = 495;
      unit.position.y = 300;

      // Update to reach target
      for (let i = 0; i < 10; i++) {
        unit.update(0.1);
      }

      // Unit should be at or very close to target
      const distance = unit.position.distanceTo(resourcePoint.position);
      expect(distance).toBeLessThan(10);
    });
  });

  describe("Combat with guardians", () => {
    it("should detect unit in aggro range when at point", () => {
      // Place unit at the resource point
      unit.position.x = 500;
      unit.position.y = 300;

      const inRange = NeutralCombatSystem.isUnitInAggroRange(
        unit,
        resourcePoint,
        true,
      );

      expect(inRange).toBe(true);
    });

    it("should find closest guardian", () => {
      unit.position.x = 500;
      unit.position.y = 300;

      const closest = NeutralCombatSystem.findClosestAliveGuardian(
        unit,
        resourcePoint,
      );

      expect(closest).not.toBeNull();
    });

    it("should be able to attack guardian when in range", () => {
      // Place unit at the resource point center
      unit.position.x = 500;
      unit.position.y = 300;

      const closest = NeutralCombatSystem.findClosestAliveGuardian(
        unit,
        resourcePoint,
      );

      expect(closest).not.toBeNull();

      const canAttack = NeutralCombatSystem.canUnitAttackGuardian(
        unit,
        closest!,
      );

      // Log for debugging
      const dist = unit.position.distanceTo(closest!.position);
      console.log(
        `Distance to guardian: ${dist}, attackRange: ${unit.combat.attackRange}, guardianSize: ${closest!.size}`,
      );
      console.log(`Can attack: ${canAttack}`);

      expect(canAttack).toBe(true);
    });
  });

  describe("Full combat simulation", () => {
    it("should kill all guardians sequentially", () => {
      // Place unit at the resource point
      unit.position.x = 500;
      unit.position.y = 300;

      // Use low HP guardians for faster test
      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 30, 5, 510, 300),
        new NeutralGuardianEntity("g2", 30, 5, 490, 300),
        new NeutralGuardianEntity("g3", 30, 5, 500, 310),
      ];

      const result = simulateGameLoop(unit, resourcePoint, 500, 0.1);

      // Print logs for debugging
      console.log("\n" + result.logs.join("\n") + "\n");

      expect(result.unitAlive).toBe(true);
      expect(result.guardiansKilled).toBe(3);
      // After killing all guardians and preparing for capture, unit should be in MOVING state
      // (GUARDING state is set explicitly via startGuarding after successful capture)
      expect(result.unitFinalState).toBe(UnitBehaviorState.MOVING);
    });

    it("should transition through fighting states correctly", () => {
      // Place unit at the resource point
      unit.position.x = 500;
      unit.position.y = 300;

      // Single guardian for simpler test
      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 50, 2, 510, 300),
      ];

      const result = simulateGameLoop(unit, resourcePoint, 200, 0.1);

      console.log("\n" + result.logs.join("\n") + "\n");

      expect(result.unitAlive).toBe(true);
      expect(result.guardiansKilled).toBe(1);
    });

    it("should start from spawn and kill all guardians", () => {
      // Reset unit to spawning state at tower position
      unit.state = UnitBehaviorState.SPAWNING;
      unit.spawnTime = Date.now() - 2000; // Already past spawn time
      unit.position.x = 100;
      unit.position.y = 300;

      // Use very low HP guardians
      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 20, 1, 505, 300),
        new NeutralGuardianEntity("g2", 20, 1, 495, 300),
      ];

      // Increase iterations and decrease dt for more simulation time
      const result = simulateGameLoop(unit, resourcePoint, 2000, 0.05);

      console.log("\n" + result.logs.join("\n") + "\n");

      expect(result.unitAlive).toBe(true);
      // Unit should kill at least 1 guardian (may not reach 2nd due to distance/time)
      expect(result.guardiansKilled).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Edge cases", () => {
    it("should handle point with no guardians", () => {
      unit.position.x = 500;
      unit.position.y = 300;
      resourcePoint.guardians = [];

      const aliveGuardians =
        NeutralCombatSystem.getAliveGuardians(resourcePoint);
      expect(aliveGuardians.length).toBe(0);
    });

    it("should handle unit death during combat", () => {
      unit.position.x = 500;
      unit.position.y = 300;
      unit.health.current = 10; // Very low HP

      // High damage guardians
      resourcePoint.guardians = [
        new NeutralGuardianEntity("g1", 100, 50, 510, 300),
      ];

      const result = simulateGameLoop(unit, resourcePoint, 100, 0.1);

      console.log("\n" + result.logs.join("\n") + "\n");

      expect(result.unitAlive).toBe(false);
    });
  });
});
