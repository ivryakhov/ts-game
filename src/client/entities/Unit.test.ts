/**
 * Neon Arcana - Unit Tests
 * Тесты для класса Unit (Юнит)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Unit } from "./Unit";
import { UnitType, UNIT_CONFIG, PLAYER_COLORS, BASE_MOVEMENT_SPEED, COUNTER_BONUSES } from "@shared/constants";
import { UnitBehaviorState } from "@shared/types";

describe("Unit", () => {
  let scout: Unit;
  let tank: Unit;
  let ranger: Unit;
  let support: Unit;

  beforeEach(() => {
    scout = new Unit("scout-1", UnitType.SCOUT, "player-1", 0, 100, 200);
    tank = new Unit("tank-1", UnitType.TANK, "player-1", 0, 100, 200);
    ranger = new Unit("ranger-1", UnitType.RANGER, "player-1", 0, 100, 200);
    support = new Unit("support-1", UnitType.SUPPORT, "player-1", 0, 100, 200);
  });

  describe("constructor", () => {
    it("should create unit with correct id", () => {
      expect(scout.id).toBe("scout-1");
    });

    it("should create unit with correct type", () => {
      expect(scout.unitType).toBe(UnitType.SCOUT);
      expect(tank.unitType).toBe(UnitType.TANK);
      expect(ranger.unitType).toBe(UnitType.RANGER);
      expect(support.unitType).toBe(UnitType.SUPPORT);
    });

    it("should create unit with correct owner", () => {
      expect(scout.ownerId).toBe("player-1");
    });

    it("should create unit with correct position", () => {
      expect(scout.position.x).toBe(100);
      expect(scout.position.y).toBe(200);
    });

    it("should create unit with correct color based on player index", () => {
      expect(scout.color).toBe(PLAYER_COLORS[0]);
    });

    it("should set tag to 'unit'", () => {
      expect(scout.tag).toBe("unit");
    });

    it("should start in SPAWNING state", () => {
      expect(scout.state).toBe(UnitBehaviorState.SPAWNING);
    });

    it("should have spawn time set", () => {
      expect(scout.spawnTime).toBeGreaterThan(0);
    });
  });

  describe("scout stats", () => {
    it("should have correct HP", () => {
      expect(scout.health.max).toBe(UNIT_CONFIG[UnitType.SCOUT].hp);
      expect(scout.health.current).toBe(UNIT_CONFIG[UnitType.SCOUT].hp);
    });

    it("should have correct DPS", () => {
      expect(scout.combat.dps).toBe(UNIT_CONFIG[UnitType.SCOUT].dps);
    });

    it("should have correct speed", () => {
      const expectedSpeed = (BASE_MOVEMENT_SPEED * UNIT_CONFIG[UnitType.SCOUT].speed) / 100;
      expect(scout.movement.speed).toBe(expectedSpeed);
    });

    it("should have correct attack range", () => {
      expect(scout.combat.attackRange).toBe(UNIT_CONFIG[UnitType.SCOUT].range);
    });

    it("should have correct vision range", () => {
      expect(scout.visionRange).toBe(UNIT_CONFIG[UnitType.SCOUT].visionRange);
    });
  });

  describe("tank stats", () => {
    it("should have higher HP than scout", () => {
      expect(tank.health.max).toBeGreaterThan(scout.health.max);
    });

    it("should have slower speed than scout", () => {
      expect(tank.movement.speed).toBeLessThan(scout.movement.speed);
    });

    it("should have correct HP", () => {
      expect(tank.health.max).toBe(UNIT_CONFIG[UnitType.TANK].hp);
    });
  });

  describe("ranger stats", () => {
    it("should have longer attack range", () => {
      expect(ranger.combat.attackRange).toBeGreaterThan(scout.combat.attackRange);
    });

    it("should have higher DPS than tank", () => {
      expect(ranger.combat.dps).toBeGreaterThan(tank.combat.dps);
    });
  });

  describe("support stats", () => {
    it("should have healPerSec property", () => {
      expect(support.healPerSec).toBe(UNIT_CONFIG[UnitType.SUPPORT].healPerSec);
    });

    it("should have healRange property", () => {
      expect(support.healRange).toBe(UNIT_CONFIG[UnitType.SUPPORT].healRange);
    });

    it("should have lower DPS than combat units", () => {
      expect(support.combat.dps).toBeLessThan(ranger.combat.dps);
    });
  });

  describe("fromState", () => {
    it("should create unit from state", () => {
      const state = {
        id: "state-unit",
        type: UnitType.TANK,
        ownerId: "player-2",
        position: { x: 300, y: 400 },
        hp: 150,
        maxHp: 200,
        dps: 25,
        speed: 56,
        attackRange: 35,
        targetRoadId: "road-1",
        targetTowerId: "tower-1",
        currentWaypointIndex: 2,
        state: UnitBehaviorState.MOVING,
        targetId: null,
        healTargetId: null,
        guardingPointId: null,
        isRecalling: false,
        recallEndTime: 0,
      };

      const restoredUnit = Unit.fromState(state, 1);

      expect(restoredUnit.id).toBe("state-unit");
      expect(restoredUnit.unitType).toBe(UnitType.TANK);
      expect(restoredUnit.ownerId).toBe("player-2");
      expect(restoredUnit.position.x).toBe(300);
      expect(restoredUnit.position.y).toBe(400);
      expect(restoredUnit.health.current).toBe(150);
      expect(restoredUnit.health.max).toBe(200);
      expect(restoredUnit.combat.dps).toBe(25);
      expect(restoredUnit.movement.speed).toBe(56);
      expect(restoredUnit.state).toBe(UnitBehaviorState.MOVING);
      expect(restoredUnit.targetRoadId).toBe("road-1");
      expect(restoredUnit.targetTowerId).toBe("tower-1");
      expect(restoredUnit.currentWaypointIndex).toBe(2);
      expect(restoredUnit.color).toBe(PLAYER_COLORS[1]);
    });

    it("should restore guarding state", () => {
      const state = {
        id: "guard-unit",
        type: UnitType.SCOUT,
        ownerId: "player-1",
        position: { x: 100, y: 100 },
        hp: 50,
        maxHp: 50,
        dps: 15,
        speed: 120,
        attackRange: 30,
        targetRoadId: "",
        targetTowerId: "",
        currentWaypointIndex: 0,
        state: UnitBehaviorState.GUARDING,
        targetId: null,
        healTargetId: null,
        guardingPointId: "point-1",
        isRecalling: true,
        recallEndTime: Date.now() + 2000,
      };

      const restoredUnit = Unit.fromState(state, 0);

      expect(restoredUnit.state).toBe(UnitBehaviorState.GUARDING);
      expect(restoredUnit.guardingPointId).toBe("point-1");
      expect(restoredUnit.isRecalling).toBe(true);
    });
  });

  describe("takeDamage", () => {
    it("should reduce unit health", () => {
      scout.takeDamage(20);

      expect(scout.health.current).toBe(UNIT_CONFIG[UnitType.SCOUT].hp - 20);
    });

    it("should return false when unit survives", () => {
      const died = scout.takeDamage(20);

      expect(died).toBe(false);
    });

    it("should return true when unit dies", () => {
      const died = scout.takeDamage(UNIT_CONFIG[UnitType.SCOUT].hp);

      expect(died).toBe(true);
    });

    it("should set state to DEAD when killed", () => {
      scout.takeDamage(UNIT_CONFIG[UnitType.SCOUT].hp);

      expect(scout.state).toBe(UnitBehaviorState.DEAD);
    });

    it("should mark unit as inactive when killed", () => {
      scout.takeDamage(UNIT_CONFIG[UnitType.SCOUT].hp);

      expect(scout.isActive).toBe(false);
    });
  });

  describe("heal", () => {
    it("should increase unit health", () => {
      scout.takeDamage(30);
      scout.heal(15);

      expect(scout.health.current).toBe(UNIT_CONFIG[UnitType.SCOUT].hp - 15);
    });

    it("should not exceed max health", () => {
      scout.heal(100);

      expect(scout.health.current).toBe(scout.health.max);
    });
  });

  describe("isAlive", () => {
    it("should return true when health > 0", () => {
      expect(scout.isAlive).toBe(true);
    });

    it("should return false when health = 0", () => {
      scout.takeDamage(UNIT_CONFIG[UnitType.SCOUT].hp);

      expect(scout.isAlive).toBe(false);
    });
  });

  describe("startFighting", () => {
    it("should set state to FIGHTING", () => {
      scout.state = UnitBehaviorState.MOVING;
      scout.startFighting("enemy-1");

      expect(scout.state).toBe(UnitBehaviorState.FIGHTING);
    });

    it("should set target id", () => {
      scout.startFighting("enemy-1");

      expect(scout.targetId).toBe("enemy-1");
    });

    it("should stop movement", () => {
      scout.movement.isMoving = true;
      scout.startFighting("enemy-1");

      expect(scout.movement.isMoving).toBe(false);
    });
  });

  describe("stopFighting", () => {
    it("should set state to MOVING when not guarding", () => {
      scout.state = UnitBehaviorState.FIGHTING;
      scout.targetId = "enemy-1";
      scout.stopFighting();

      expect(scout.state).toBe(UnitBehaviorState.MOVING);
    });

    it("should set state to GUARDING when has guardingPointId", () => {
      scout.state = UnitBehaviorState.FIGHTING;
      scout.guardingPointId = "point-1";
      scout.stopFighting();

      expect(scout.state).toBe(UnitBehaviorState.GUARDING);
    });

    it("should clear target id", () => {
      scout.targetId = "enemy-1";
      scout.stopFighting();

      expect(scout.targetId).toBeNull();
    });
  });

  describe("startGuarding", () => {
    it("should set state to GUARDING", () => {
      scout.startGuarding("point-1");

      expect(scout.state).toBe(UnitBehaviorState.GUARDING);
    });

    it("should set guardingPointId", () => {
      scout.startGuarding("point-1");

      expect(scout.guardingPointId).toBe("point-1");
    });

    it("should stop movement", () => {
      scout.movement.isMoving = true;
      scout.startGuarding("point-1");

      expect(scout.movement.isMoving).toBe(false);
    });
  });

  describe("recallFromGuarding", () => {
    it("should set isRecalling to true", () => {
      scout.recallFromGuarding();

      expect(scout.isRecalling).toBe(true);
    });

    it("should set recallEndTime", () => {
      const before = Date.now();
      scout.recallFromGuarding(3000);
      const after = Date.now();

      expect(scout.recallEndTime).toBeGreaterThanOrEqual(before + 3000);
      expect(scout.recallEndTime).toBeLessThanOrEqual(after + 3000);
    });

    it("should use default duration", () => {
      const before = Date.now();
      scout.recallFromGuarding();
      const after = Date.now();

      expect(scout.recallEndTime).toBeGreaterThanOrEqual(before + 3000);
      expect(scout.recallEndTime).toBeLessThanOrEqual(after + 3000);
    });
  });

  describe("getDamageMultiplierAgainst", () => {
    it("should return 1 for neutral matchup", () => {
      const multiplier = scout.getDamageMultiplierAgainst(UnitType.SUPPORT);

      expect(multiplier).toBe(1);
    });

    it("should return bonus for scout vs ranger", () => {
      const multiplier = scout.getDamageMultiplierAgainst(UnitType.RANGER);
      const expected = COUNTER_BONUSES[UnitType.SCOUT][UnitType.RANGER];

      expect(multiplier).toBe(expected);
    });

    it("should return bonus for tank vs scout", () => {
      const multiplier = tank.getDamageMultiplierAgainst(UnitType.SCOUT);
      const expected = COUNTER_BONUSES[UnitType.TANK][UnitType.SCOUT];

      expect(multiplier).toBe(expected);
    });

    it("should return bonus for ranger vs tank", () => {
      const multiplier = ranger.getDamageMultiplierAgainst(UnitType.TANK);
      const expected = COUNTER_BONUSES[UnitType.RANGER][UnitType.TANK];

      expect(multiplier).toBe(expected);
    });
  });

  describe("attackTarget", () => {
    it("should return 0 when target is null", () => {
      const damage = scout.attackTarget(null);

      expect(damage).toBe(0);
    });

    it("should return 0 when on cooldown", () => {
      const enemy = new Unit("enemy", UnitType.TANK, "player-2", 1, 0, 0);
      scout.combat.attack(); // Start cooldown

      const damage = scout.attackTarget(enemy);

      expect(damage).toBe(0);
    });

    it("should return damage when can attack", () => {
      const enemy = new Unit("enemy", UnitType.TANK, "player-2", 1, 0, 0);
      const damage = scout.attackTarget(enemy);

      expect(damage).toBeGreaterThan(0);
    });

    it("should apply counter bonus", () => {
      const enemy = new Unit("enemy", UnitType.RANGER, "player-2", 1, 0, 0);
      const damage = scout.attackTarget(enemy);

      const baseDamage = UNIT_CONFIG[UnitType.SCOUT].dps;
      const multiplier = COUNTER_BONUSES[UnitType.SCOUT][UnitType.RANGER]!;
      const expectedDamage = baseDamage * multiplier;

      expect(damage).toBe(expectedDamage);
    });
  });

  describe("canAttackTarget", () => {
    it("should return true when target is in range", () => {
      const enemy = new Unit("enemy", UnitType.TANK, "player-2", 1, 110, 200);
      // Distance is 10, scout range is 30

      expect(scout.canAttackTarget(enemy)).toBe(true);
    });

    it("should return false when target is out of range", () => {
      const enemy = new Unit("enemy", UnitType.TANK, "player-2", 1, 200, 200);
      // Distance is 100, scout range is 30

      expect(scout.canAttackTarget(enemy)).toBe(false);
    });
  });

  describe("update", () => {
    it("should transition from SPAWNING to MOVING after spawn time", () => {
      // Set spawn time to past
      scout.spawnTime = Date.now() - 2000;
      scout.update(0.1);

      expect(scout.state).toBe(UnitBehaviorState.MOVING);
    });

    it("should stay in SPAWNING state during spawn time", () => {
      scout.spawnTime = Date.now();
      scout.update(0.1);

      expect(scout.state).toBe(UnitBehaviorState.SPAWNING);
    });

    it("should update combat cooldown", () => {
      scout.state = UnitBehaviorState.MOVING;
      scout.combat.attack(); // Start cooldown
      expect(scout.combat.canAttack()).toBe(false);

      scout.update(1); // Wait full cooldown

      expect(scout.combat.canAttack()).toBe(true);
    });

    it("should move towards waypoint when MOVING", () => {
      scout.state = UnitBehaviorState.MOVING;
      scout.waypoints = [
        { position: { x: 100, y: 200 }, index: 0 },
        { position: { x: 200, y: 200 }, index: 1 },
      ];
      scout.currentWaypointIndex = 1;

      const initialX = scout.position.x;
      scout.update(0.5);

      expect(scout.position.x).toBeGreaterThan(initialX);
    });

    it("should complete recall when time elapsed", () => {
      scout.state = UnitBehaviorState.GUARDING;
      scout.guardingPointId = "point-1";
      scout.isRecalling = true;
      scout.recallEndTime = Date.now() - 100; // Already elapsed

      scout.update(0.1);

      expect(scout.isRecalling).toBe(false);
      expect(scout.guardingPointId).toBeNull();
      expect(scout.state).toBe(UnitBehaviorState.MOVING);
    });
  });

  describe("toState", () => {
    it("should serialize unit state", () => {
      scout.targetId = "target-1";
      scout.targetRoadId = "road-1";
      scout.targetTowerId = "tower-1";
      scout.currentWaypointIndex = 3;

      const state = scout.toState();

      expect(state.id).toBe("scout-1");
      expect(state.type).toBe(UnitType.SCOUT);
      expect(state.ownerId).toBe("player-1");
      expect(state.position).toEqual({ x: 100, y: 200 });
      expect(state.hp).toBe(UNIT_CONFIG[UnitType.SCOUT].hp);
      expect(state.maxHp).toBe(UNIT_CONFIG[UnitType.SCOUT].hp);
      expect(state.dps).toBe(UNIT_CONFIG[UnitType.SCOUT].dps);
      expect(state.state).toBe(UnitBehaviorState.SPAWNING);
      expect(state.targetId).toBe("target-1");
      expect(state.targetRoadId).toBe("road-1");
      expect(state.targetTowerId).toBe("tower-1");
      expect(state.currentWaypointIndex).toBe(3);
    });

    it("should serialize guarding state", () => {
      scout.state = UnitBehaviorState.GUARDING;
      scout.guardingPointId = "point-1";
      scout.isRecalling = true;
      scout.recallEndTime = 12345;

      const state = scout.toState();

      expect(state.state).toBe(UnitBehaviorState.GUARDING);
      expect(state.guardingPointId).toBe("point-1");
      expect(state.isRecalling).toBe(true);
      expect(state.recallEndTime).toBe(12345);
    });

    it("should serialize damaged unit", () => {
      scout.takeDamage(20);

      const state = scout.toState();

      expect(state.hp).toBe(UNIT_CONFIG[UnitType.SCOUT].hp - 20);
      expect(state.maxHp).toBe(UNIT_CONFIG[UnitType.SCOUT].hp);
    });
  });

  describe("render", () => {
    it("should not throw when rendering any unit type", () => {
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
        globalAlpha: 1,
      } as unknown as CanvasRenderingContext2D;

      expect(() => scout.render(mockCtx)).not.toThrow();
      expect(() => tank.render(mockCtx)).not.toThrow();
      expect(() => ranger.render(mockCtx)).not.toThrow();
      expect(() => support.render(mockCtx)).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle fallback color for invalid player index", () => {
      const unit = new Unit("u", UnitType.SCOUT, "p", 999, 0, 0);

      expect(unit.color).toBe(PLAYER_COLORS[0]);
    });

    it("should not move when no waypoints", () => {
      scout.state = UnitBehaviorState.MOVING;
      scout.waypoints = [];
      const initialX = scout.position.x;

      scout.update(0.5);

      expect(scout.position.x).toBe(initialX);
    });

    it("should handle waypoint index out of bounds", () => {
      scout.state = UnitBehaviorState.MOVING;
      scout.waypoints = [{ position: { x: 100, y: 200 }, index: 0 }];
      scout.currentWaypointIndex = 5; // Out of bounds
      const initialX = scout.position.x;

      scout.update(0.5);

      expect(scout.position.x).toBe(initialX);
    });
  });
});
