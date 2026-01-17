/**
 * Neon Arcana - Vector2 Tests
 * Тесты для класса 2D вектора
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Vector2 } from "./Vector2";

describe("Vector2", () => {
  describe("constructor", () => {
    it("should create a vector with default values (0, 0)", () => {
      const v = new Vector2();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
    });

    it("should create a vector with specified values", () => {
      const v = new Vector2(3, 4);
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
    });
  });

  describe("clone", () => {
    it("should create an independent copy", () => {
      const v1 = new Vector2(5, 10);
      const v2 = v1.clone();

      expect(v2.x).toBe(5);
      expect(v2.y).toBe(10);

      // Modifying clone should not affect original
      v2.x = 100;
      expect(v1.x).toBe(5);
    });
  });

  describe("set", () => {
    it("should set x and y values", () => {
      const v = new Vector2();
      v.set(7, 8);

      expect(v.x).toBe(7);
      expect(v.y).toBe(8);
    });

    it("should return this for chaining", () => {
      const v = new Vector2();
      const result = v.set(1, 2);
      expect(result).toBe(v);
    });
  });

  describe("copy", () => {
    it("should copy values from another vector", () => {
      const v1 = new Vector2(3, 4);
      const v2 = new Vector2();
      v2.copy(v1);

      expect(v2.x).toBe(3);
      expect(v2.y).toBe(4);
    });
  });

  describe("add", () => {
    it("should add two vectors", () => {
      const v1 = new Vector2(1, 2);
      const v2 = new Vector2(3, 4);
      v1.add(v2);

      expect(v1.x).toBe(4);
      expect(v1.y).toBe(6);
    });

    it("should handle negative values", () => {
      const v1 = new Vector2(5, 5);
      const v2 = new Vector2(-3, -2);
      v1.add(v2);

      expect(v1.x).toBe(2);
      expect(v1.y).toBe(3);
    });
  });

  describe("subtract", () => {
    it("should subtract two vectors", () => {
      const v1 = new Vector2(5, 7);
      const v2 = new Vector2(2, 3);
      v1.subtract(v2);

      expect(v1.x).toBe(3);
      expect(v1.y).toBe(4);
    });
  });

  describe("multiply", () => {
    it("should multiply by a scalar", () => {
      const v = new Vector2(3, 4);
      v.multiply(2);

      expect(v.x).toBe(6);
      expect(v.y).toBe(8);
    });

    it("should handle zero scalar", () => {
      const v = new Vector2(3, 4);
      v.multiply(0);

      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
    });

    it("should handle negative scalar", () => {
      const v = new Vector2(3, 4);
      v.multiply(-1);

      expect(v.x).toBe(-3);
      expect(v.y).toBe(-4);
    });
  });

  describe("divide", () => {
    it("should divide by a scalar", () => {
      const v = new Vector2(6, 8);
      v.divide(2);

      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
    });

    it("should not divide by zero", () => {
      const v = new Vector2(6, 8);
      v.divide(0);

      // Should remain unchanged
      expect(v.x).toBe(6);
      expect(v.y).toBe(8);
    });
  });

  describe("length", () => {
    it("should calculate length correctly", () => {
      const v = new Vector2(3, 4);
      expect(v.length()).toBe(5); // 3-4-5 triangle
    });

    it("should return 0 for zero vector", () => {
      const v = new Vector2(0, 0);
      expect(v.length()).toBe(0);
    });

    it("should handle unit vectors", () => {
      const v = new Vector2(1, 0);
      expect(v.length()).toBe(1);
    });
  });

  describe("lengthSquared", () => {
    it("should calculate squared length", () => {
      const v = new Vector2(3, 4);
      expect(v.lengthSquared()).toBe(25);
    });
  });

  describe("normalize", () => {
    it("should normalize a vector to unit length", () => {
      const v = new Vector2(3, 4);
      v.normalize();

      expect(v.length()).toBeCloseTo(1, 5);
      expect(v.x).toBeCloseTo(0.6, 5);
      expect(v.y).toBeCloseTo(0.8, 5);
    });

    it("should not modify zero vector", () => {
      const v = new Vector2(0, 0);
      v.normalize();

      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
    });
  });

  describe("normalized", () => {
    it("should return a new normalized vector", () => {
      const v1 = new Vector2(3, 4);
      const v2 = v1.normalized();

      // Original should be unchanged
      expect(v1.x).toBe(3);
      expect(v1.y).toBe(4);

      // New vector should be normalized
      expect(v2.length()).toBeCloseTo(1, 5);
    });
  });

  describe("distanceTo", () => {
    it("should calculate distance between two vectors", () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(3, 4);

      expect(v1.distanceTo(v2)).toBe(5);
    });

    it("should return 0 for same position", () => {
      const v1 = new Vector2(5, 5);
      const v2 = new Vector2(5, 5);

      expect(v1.distanceTo(v2)).toBe(0);
    });
  });

  describe("distanceToSquared", () => {
    it("should calculate squared distance", () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(3, 4);

      expect(v1.distanceToSquared(v2)).toBe(25);
    });
  });

  describe("dot", () => {
    it("should calculate dot product", () => {
      const v1 = new Vector2(2, 3);
      const v2 = new Vector2(4, 5);

      // 2*4 + 3*5 = 8 + 15 = 23
      expect(v1.dot(v2)).toBe(23);
    });

    it("should return 0 for perpendicular vectors", () => {
      const v1 = new Vector2(1, 0);
      const v2 = new Vector2(0, 1);

      expect(v1.dot(v2)).toBe(0);
    });
  });

  describe("cross", () => {
    it("should calculate cross product (z-component)", () => {
      const v1 = new Vector2(2, 3);
      const v2 = new Vector2(4, 5);

      // 2*5 - 3*4 = 10 - 12 = -2
      expect(v1.cross(v2)).toBe(-2);
    });
  });

  describe("angle", () => {
    it("should return angle in radians", () => {
      const v = new Vector2(1, 0);
      expect(v.angle()).toBe(0);

      const v2 = new Vector2(0, 1);
      expect(v2.angle()).toBeCloseTo(Math.PI / 2, 5);

      const v3 = new Vector2(-1, 0);
      expect(v3.angle()).toBeCloseTo(Math.PI, 5);
    });
  });

  describe("angleTo", () => {
    it("should return angle to another vector", () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(1, 0);

      expect(v1.angleTo(v2)).toBe(0);

      const v3 = new Vector2(0, 1);
      expect(v1.angleTo(v3)).toBeCloseTo(Math.PI / 2, 5);
    });
  });

  describe("rotate", () => {
    it("should rotate vector by 90 degrees", () => {
      const v = new Vector2(1, 0);
      v.rotate(Math.PI / 2);

      expect(v.x).toBeCloseTo(0, 5);
      expect(v.y).toBeCloseTo(1, 5);
    });

    it("should rotate vector by 180 degrees", () => {
      const v = new Vector2(1, 0);
      v.rotate(Math.PI);

      expect(v.x).toBeCloseTo(-1, 5);
      expect(v.y).toBeCloseTo(0, 5);
    });
  });

  describe("lerp", () => {
    it("should interpolate between vectors", () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(10, 10);

      v1.lerp(v2, 0.5);
      expect(v1.x).toBe(5);
      expect(v1.y).toBe(5);
    });

    it("should return start at t=0", () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(10, 10);

      v1.lerp(v2, 0);
      expect(v1.x).toBe(0);
      expect(v1.y).toBe(0);
    });

    it("should return end at t=1", () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(10, 10);

      v1.lerp(v2, 1);
      expect(v1.x).toBe(10);
      expect(v1.y).toBe(10);
    });
  });

  describe("equals", () => {
    it("should return true for equal vectors", () => {
      const v1 = new Vector2(5, 5);
      const v2 = new Vector2(5, 5);

      expect(v1.equals(v2)).toBe(true);
    });

    it("should return false for different vectors", () => {
      const v1 = new Vector2(5, 5);
      const v2 = new Vector2(5, 6);

      expect(v1.equals(v2)).toBe(false);
    });

    it("should use epsilon for floating point comparison", () => {
      const v1 = new Vector2(1, 1);
      const v2 = new Vector2(1.00001, 1.00001);

      expect(v1.equals(v2, 0.0001)).toBe(true);
      expect(v1.equals(v2, 0.000001)).toBe(false);
    });
  });

  describe("isZero", () => {
    it("should return true for zero vector", () => {
      const v = new Vector2(0, 0);
      expect(v.isZero()).toBe(true);
    });

    it("should return false for non-zero vector", () => {
      const v = new Vector2(1, 0);
      expect(v.isZero()).toBe(false);
    });

    it("should use epsilon", () => {
      const v = new Vector2(0.00001, 0.00001);
      expect(v.isZero(0.0001)).toBe(true);
      expect(v.isZero(0.000001)).toBe(false);
    });
  });

  describe("clampLength", () => {
    it("should clamp vector to max length", () => {
      const v = new Vector2(6, 8); // length = 10
      v.clampLength(5);

      expect(v.length()).toBeCloseTo(5, 5);
    });

    it("should not modify vector if already shorter", () => {
      const v = new Vector2(3, 4); // length = 5
      v.clampLength(10);

      expect(v.length()).toBe(5);
    });
  });

  describe("perpendicular", () => {
    it("should return perpendicular vector", () => {
      const v = new Vector2(1, 0);
      const perp = v.perpendicular();

      expect(perp.x).toBeCloseTo(0, 5);
      expect(perp.y).toBe(1);
      expect(v.dot(perp)).toBe(0); // Should be perpendicular
    });
  });

  describe("toObject", () => {
    it("should convert to plain object", () => {
      const v = new Vector2(3, 4);
      const obj = v.toObject();

      expect(obj).toEqual({ x: 3, y: 4 });
    });
  });

  describe("toString", () => {
    it("should return string representation", () => {
      const v = new Vector2(3.14159, 2.71828);
      const str = v.toString();

      expect(str).toContain("3.14");
      expect(str).toContain("2.72");
    });
  });

  // Static methods
  describe("static fromObject", () => {
    it("should create vector from object", () => {
      const v = Vector2.fromObject({ x: 5, y: 10 });

      expect(v.x).toBe(5);
      expect(v.y).toBe(10);
    });
  });

  describe("static fromAngle", () => {
    it("should create vector from angle", () => {
      const v = Vector2.fromAngle(0, 5);

      expect(v.x).toBeCloseTo(5, 5);
      expect(v.y).toBeCloseTo(0, 5);
    });

    it("should create unit vector by default", () => {
      const v = Vector2.fromAngle(Math.PI / 2);

      expect(v.x).toBeCloseTo(0, 5);
      expect(v.y).toBeCloseTo(1, 5);
    });
  });

  describe("static add", () => {
    it("should add vectors without mutating", () => {
      const v1 = new Vector2(1, 2);
      const v2 = new Vector2(3, 4);
      const result = Vector2.add(v1, v2);

      expect(result.x).toBe(4);
      expect(result.y).toBe(6);

      // Original vectors unchanged
      expect(v1.x).toBe(1);
      expect(v2.x).toBe(3);
    });
  });

  describe("static subtract", () => {
    it("should subtract vectors without mutating", () => {
      const v1 = new Vector2(5, 7);
      const v2 = new Vector2(2, 3);
      const result = Vector2.subtract(v1, v2);

      expect(result.x).toBe(3);
      expect(result.y).toBe(4);
    });
  });

  describe("static multiply", () => {
    it("should multiply vector without mutating", () => {
      const v = new Vector2(3, 4);
      const result = Vector2.multiply(v, 2);

      expect(result.x).toBe(6);
      expect(result.y).toBe(8);
      expect(v.x).toBe(3); // Original unchanged
    });
  });

  describe("static lerp", () => {
    it("should interpolate between vectors", () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(10, 10);
      const result = Vector2.lerp(v1, v2, 0.5);

      expect(result.x).toBe(5);
      expect(result.y).toBe(5);
    });
  });

  describe("static distance", () => {
    it("should calculate distance", () => {
      const v1 = new Vector2(0, 0);
      const v2 = new Vector2(3, 4);

      expect(Vector2.distance(v1, v2)).toBe(5);
    });
  });

  describe("static factory methods", () => {
    it("zero should return (0, 0)", () => {
      const v = Vector2.zero();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
    });

    it("up should return (0, -1)", () => {
      const v = Vector2.up();
      expect(v.x).toBe(0);
      expect(v.y).toBe(-1);
    });

    it("down should return (0, 1)", () => {
      const v = Vector2.down();
      expect(v.x).toBe(0);
      expect(v.y).toBe(1);
    });

    it("left should return (-1, 0)", () => {
      const v = Vector2.left();
      expect(v.x).toBe(-1);
      expect(v.y).toBe(0);
    });

    it("right should return (1, 0)", () => {
      const v = Vector2.right();
      expect(v.x).toBe(1);
      expect(v.y).toBe(0);
    });

    it("one should return (1, 1)", () => {
      const v = Vector2.one();
      expect(v.x).toBe(1);
      expect(v.y).toBe(1);
    });
  });

  describe("static random", () => {
    it("should return unit vector", () => {
      const v = Vector2.random();
      expect(v.length()).toBeCloseTo(1, 5);
    });
  });

  describe("static randomInRect", () => {
    it("should return vector within bounds", () => {
      for (let i = 0; i < 100; i++) {
        const v = Vector2.randomInRect(10, 20);
        expect(v.x).toBeGreaterThanOrEqual(0);
        expect(v.x).toBeLessThanOrEqual(10);
        expect(v.y).toBeGreaterThanOrEqual(0);
        expect(v.y).toBeLessThanOrEqual(20);
      }
    });
  });
});
