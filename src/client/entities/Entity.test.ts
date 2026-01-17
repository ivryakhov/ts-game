/**
 * Neon Arcana - Entity Tests
 * Тесты для базового класса Entity и компонентов
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Vector2 } from "@shared/Vector2";
import {
  Entity,
  HealthComponent,
  CombatComponent,
  MovementComponent,
} from "./Entity";

// Конкретная реализация Entity для тестирования
class TestEntity extends Entity {
  public updateCalled = false;
  public renderCalled = false;

  update(_dt: number): void {
    this.updateCalled = true;
  }

  render(_ctx: CanvasRenderingContext2D): void {
    this.renderCalled = true;
  }
}

describe("Entity", () => {
  describe("constructor", () => {
    it("should create entity with default position (0, 0)", () => {
      const entity = new TestEntity();

      expect(entity.position.x).toBe(0);
      expect(entity.position.y).toBe(0);
    });

    it("should create entity with specified position", () => {
      const entity = new TestEntity(undefined, 100, 200);

      expect(entity.position.x).toBe(100);
      expect(entity.position.y).toBe(200);
    });

    it("should create entity with specified id", () => {
      const entity = new TestEntity("custom-id");

      expect(entity.id).toBe("custom-id");
    });

    it("should generate unique id if not provided", () => {
      const entity1 = new TestEntity();
      const entity2 = new TestEntity();

      expect(entity1.id).toBeDefined();
      expect(entity2.id).toBeDefined();
      expect(entity1.id).not.toBe(entity2.id);
    });

    it("should be active by default", () => {
      const entity = new TestEntity();

      expect(entity.isActive).toBe(true);
    });

    it("should have empty tag by default", () => {
      const entity = new TestEntity();

      expect(entity.tag).toBe("");
    });
  });

  describe("destroy", () => {
    it("should mark entity as inactive", () => {
      const entity = new TestEntity();
      entity.destroy();

      expect(entity.isActive).toBe(false);
    });
  });

  describe("distanceTo", () => {
    it("should calculate distance to another entity", () => {
      const entity1 = new TestEntity(undefined, 0, 0);
      const entity2 = new TestEntity(undefined, 3, 4);

      expect(entity1.distanceTo(entity2)).toBe(5);
    });

    it("should return 0 for same position", () => {
      const entity1 = new TestEntity(undefined, 5, 5);
      const entity2 = new TestEntity(undefined, 5, 5);

      expect(entity1.distanceTo(entity2)).toBe(0);
    });
  });

  describe("distanceToSquared", () => {
    it("should calculate squared distance", () => {
      const entity1 = new TestEntity(undefined, 0, 0);
      const entity2 = new TestEntity(undefined, 3, 4);

      expect(entity1.distanceToSquared(entity2)).toBe(25);
    });
  });

  describe("directionTo", () => {
    it("should return normalized direction vector", () => {
      const entity1 = new TestEntity(undefined, 0, 0);
      const entity2 = new TestEntity(undefined, 10, 0);

      const direction = entity1.directionTo(entity2);

      expect(direction.x).toBeCloseTo(1, 5);
      expect(direction.y).toBeCloseTo(0, 5);
      expect(direction.length()).toBeCloseTo(1, 5);
    });

    it("should return correct direction for diagonal", () => {
      const entity1 = new TestEntity(undefined, 0, 0);
      const entity2 = new TestEntity(undefined, 3, 4);

      const direction = entity1.directionTo(entity2);

      expect(direction.x).toBeCloseTo(0.6, 5);
      expect(direction.y).toBeCloseTo(0.8, 5);
    });
  });

  describe("isInRange", () => {
    it("should return true when entity is in range", () => {
      const entity1 = new TestEntity(undefined, 0, 0);
      const entity2 = new TestEntity(undefined, 3, 4); // distance = 5

      expect(entity1.isInRange(entity2, 5)).toBe(true);
      expect(entity1.isInRange(entity2, 6)).toBe(true);
    });

    it("should return false when entity is out of range", () => {
      const entity1 = new TestEntity(undefined, 0, 0);
      const entity2 = new TestEntity(undefined, 3, 4); // distance = 5

      expect(entity1.isInRange(entity2, 4)).toBe(false);
    });

    it("should return true when entity is at exact range", () => {
      const entity1 = new TestEntity(undefined, 0, 0);
      const entity2 = new TestEntity(undefined, 3, 4); // distance = 5

      expect(entity1.isInRange(entity2, 5)).toBe(true);
    });
  });

  describe("serialize", () => {
    it("should return serialized object", () => {
      const entity = new TestEntity("test-id", 10, 20);
      entity.tag = "test-tag";

      const serialized = entity.serialize();

      expect(serialized).toEqual({
        id: "test-id",
        position: { x: 10, y: 20 },
        isActive: true,
        tag: "test-tag",
      });
    });
  });
});

describe("HealthComponent", () => {
  let health: HealthComponent;

  beforeEach(() => {
    health = new HealthComponent(100);
  });

  describe("constructor", () => {
    it("should initialize with max health", () => {
      expect(health.current).toBe(100);
      expect(health.max).toBe(100);
    });
  });

  describe("takeDamage", () => {
    it("should reduce current health", () => {
      health.takeDamage(30);

      expect(health.current).toBe(70);
    });

    it("should return false when still alive", () => {
      const died = health.takeDamage(30);

      expect(died).toBe(false);
    });

    it("should return true when health reaches zero", () => {
      const died = health.takeDamage(100);

      expect(died).toBe(true);
      expect(health.current).toBe(0);
    });

    it("should return true when overkill damage", () => {
      const died = health.takeDamage(150);

      expect(died).toBe(true);
      expect(health.current).toBe(0);
    });

    it("should not go below zero", () => {
      health.takeDamage(200);

      expect(health.current).toBe(0);
    });
  });

  describe("heal", () => {
    it("should increase current health", () => {
      health.takeDamage(50);
      health.heal(20);

      expect(health.current).toBe(70);
    });

    it("should not exceed max health", () => {
      health.heal(50);

      expect(health.current).toBe(100);
    });

    it("should heal to max from any amount", () => {
      health.takeDamage(80);
      health.heal(100);

      expect(health.current).toBe(100);
    });
  });

  describe("percentage", () => {
    it("should return 1 at full health", () => {
      expect(health.percentage).toBe(1);
    });

    it("should return 0.5 at half health", () => {
      health.takeDamage(50);

      expect(health.percentage).toBe(0.5);
    });

    it("should return 0 when dead", () => {
      health.takeDamage(100);

      expect(health.percentage).toBe(0);
    });

    it("should handle zero max health", () => {
      const zeroHealth = new HealthComponent(0);

      expect(zeroHealth.percentage).toBe(0);
    });
  });

  describe("isAlive", () => {
    it("should return true when health > 0", () => {
      expect(health.isAlive).toBe(true);

      health.takeDamage(99);
      expect(health.isAlive).toBe(true);
    });

    it("should return false when health = 0", () => {
      health.takeDamage(100);

      expect(health.isAlive).toBe(false);
    });
  });

  describe("setMax", () => {
    it("should update max health", () => {
      health.setMax(200);

      expect(health.max).toBe(200);
    });

    it("should preserve health percentage by default", () => {
      health.takeDamage(50); // 50% health
      health.setMax(200);

      expect(health.current).toBe(100); // 50% of 200
    });

    it("should heal to full when healToFull is true", () => {
      health.takeDamage(50);
      health.setMax(200, true);

      expect(health.current).toBe(200);
    });
  });
});

describe("CombatComponent", () => {
  let combat: CombatComponent;

  beforeEach(() => {
    combat = new CombatComponent(50, 100); // 50 DPS, 100 range
  });

  describe("constructor", () => {
    it("should initialize with correct values", () => {
      expect(combat.dps).toBe(50);
      expect(combat.attackRange).toBe(100);
      expect(combat.attackCooldown).toBe(1);
    });
  });

  describe("canAttack", () => {
    it("should return true initially", () => {
      expect(combat.canAttack()).toBe(true);
    });

    it("should return false after attack", () => {
      combat.attack();

      expect(combat.canAttack()).toBe(false);
    });

    it("should return true after cooldown", () => {
      combat.attack();
      combat.update(1); // Wait full cooldown

      expect(combat.canAttack()).toBe(true);
    });

    it("should still be on cooldown before full time", () => {
      combat.attack();
      combat.update(0.5); // Half cooldown

      expect(combat.canAttack()).toBe(false);
    });
  });

  describe("attack", () => {
    it("should return damage when can attack", () => {
      const damage = combat.attack();

      expect(damage).toBe(50); // DPS * cooldown
    });

    it("should return 0 when on cooldown", () => {
      combat.attack(); // First attack
      const damage = combat.attack(); // Second attack immediately

      expect(damage).toBe(0);
    });

    it("should reset cooldown", () => {
      combat.attack();

      expect(combat.canAttack()).toBe(false);
    });
  });

  describe("update", () => {
    it("should reduce cooldown over time", () => {
      combat.attack();
      combat.update(0.5);

      // Still on cooldown
      expect(combat.canAttack()).toBe(false);

      combat.update(0.5);

      // Cooldown finished
      expect(combat.canAttack()).toBe(true);
    });
  });

  describe("isTargetInRange", () => {
    it("should return true when target is in range", () => {
      const attacker = new TestEntity(undefined, 0, 0);
      const target = new TestEntity(undefined, 50, 0);

      expect(combat.isTargetInRange(attacker, target)).toBe(true);
    });

    it("should return false when target is out of range", () => {
      const attacker = new TestEntity(undefined, 0, 0);
      const target = new TestEntity(undefined, 150, 0);

      expect(combat.isTargetInRange(attacker, target)).toBe(false);
    });

    it("should return true at exact range", () => {
      const attacker = new TestEntity(undefined, 0, 0);
      const target = new TestEntity(undefined, 100, 0);

      expect(combat.isTargetInRange(attacker, target)).toBe(true);
    });
  });
});

describe("MovementComponent", () => {
  let movement: MovementComponent;
  let entity: TestEntity;

  beforeEach(() => {
    movement = new MovementComponent(100); // 100 pixels/sec
    entity = new TestEntity(undefined, 0, 0);
  });

  describe("constructor", () => {
    it("should initialize with correct speed", () => {
      expect(movement.speed).toBe(100);
    });

    it("should not be moving initially", () => {
      expect(movement.isMoving).toBe(false);
    });

    it("should have zero velocity initially", () => {
      expect(movement.velocity.x).toBe(0);
      expect(movement.velocity.y).toBe(0);
    });
  });

  describe("moveTowards", () => {
    it("should move entity towards target", () => {
      const target = new Vector2(100, 0);
      movement.moveTowards(entity, target, 0.5); // Move for 0.5 seconds

      expect(entity.position.x).toBeCloseTo(50, 5); // 100 speed * 0.5 sec
      expect(entity.position.y).toBe(0);
    });

    it("should return false when not reached target", () => {
      const target = new Vector2(100, 0);
      const reached = movement.moveTowards(entity, target, 0.5);

      expect(reached).toBe(false);
    });

    it("should return true when reached target", () => {
      const target = new Vector2(50, 0);
      const reached = movement.moveTowards(entity, target, 1); // Should reach in 0.5 sec

      expect(reached).toBe(true);
    });

    it("should snap to target when close enough", () => {
      const target = new Vector2(0.5, 0); // Very close
      movement.moveTowards(entity, target, 0.01);

      expect(entity.position.x).toBe(0.5);
    });

    it("should set isMoving to true when moving", () => {
      const target = new Vector2(100, 0);
      movement.moveTowards(entity, target, 0.5);

      expect(movement.isMoving).toBe(true);
    });

    it("should set isMoving to false when reached", () => {
      const target = new Vector2(50, 0);
      movement.moveTowards(entity, target, 1);

      expect(movement.isMoving).toBe(false);
    });

    it("should move diagonally correctly", () => {
      const target = new Vector2(30, 40); // 3-4-5 triangle, distance = 50
      movement.moveTowards(entity, target, 0.5); // Move 50 pixels

      expect(entity.position.x).toBeCloseTo(30, 5);
      expect(entity.position.y).toBeCloseTo(40, 5);
    });
  });

  describe("stop", () => {
    it("should set velocity to zero", () => {
      const target = new Vector2(100, 0);
      movement.moveTowards(entity, target, 0.5);
      movement.stop();

      expect(movement.velocity.x).toBe(0);
      expect(movement.velocity.y).toBe(0);
    });

    it("should set isMoving to false", () => {
      const target = new Vector2(100, 0);
      movement.moveTowards(entity, target, 0.5);
      movement.stop();

      expect(movement.isMoving).toBe(false);
    });
  });
});
