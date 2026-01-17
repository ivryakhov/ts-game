/**
 * Neon Arcana - Road Tests
 * Тесты для класса Road (Дорога)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Road } from "./Road";
import { Waypoint, Position } from "@shared/types";

describe("Road", () => {
  let road: Road;
  const waypoints: Waypoint[] = [
    { position: { x: 0, y: 0 }, index: 0 },
    { position: { x: 100, y: 0 }, index: 1 },
    { position: { x: 200, y: 0 }, index: 2 },
  ];

  beforeEach(() => {
    road = new Road("road-1", "tower-1", "tower-2", waypoints);
  });

  describe("constructor", () => {
    it("should create road with correct id", () => {
      expect(road.id).toBe("road-1");
    });

    it("should create road with correct fromTowerId", () => {
      expect(road.fromTowerId).toBe("tower-1");
    });

    it("should create road with correct toTowerId", () => {
      expect(road.toTowerId).toBe("tower-2");
    });

    it("should create road with correct waypoints", () => {
      expect(road.waypoints).toHaveLength(3);
      expect(road.waypoints[0]?.position).toEqual({ x: 0, y: 0 });
      expect(road.waypoints[2]?.position).toEqual({ x: 200, y: 0 });
    });

    it("should calculate length correctly", () => {
      // 0 to 100 = 100, 100 to 200 = 100, total = 200
      expect(road.length).toBe(200);
    });

    it("should be active by default", () => {
      expect(road.isActive).toBe(true);
    });

    it("should not be highlighted by default", () => {
      expect(road.isHighlighted).toBe(false);
    });

    it("should have default color", () => {
      expect(road.color).toBe("#2a2a4a");
    });

    it("should have default width", () => {
      expect(road.width).toBe(30);
    });
  });

  describe("fromState", () => {
    it("should create road from state", () => {
      const state = {
        id: "state-road",
        fromTowerId: "tower-a",
        toTowerId: "tower-b",
        waypoints: [
          { position: { x: 10, y: 20 }, index: 0 },
          { position: { x: 50, y: 60 }, index: 1 },
        ],
        length: 56.57,
      };

      const restoredRoad = Road.fromState(state);

      expect(restoredRoad.id).toBe("state-road");
      expect(restoredRoad.fromTowerId).toBe("tower-a");
      expect(restoredRoad.toTowerId).toBe("tower-b");
      expect(restoredRoad.waypoints).toHaveLength(2);
      expect(restoredRoad.length).toBe(56.57);
    });
  });

  describe("createStraight", () => {
    it("should create straight road with two waypoints", () => {
      const straightRoad = Road.createStraight(
        "straight-1",
        "t1",
        "t2",
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      );

      expect(straightRoad.waypoints).toHaveLength(2);
      expect(straightRoad.waypoints[0]?.position).toEqual({ x: 0, y: 0 });
      expect(straightRoad.waypoints[1]?.position).toEqual({ x: 100, y: 0 });
    });

    it("should calculate correct length for straight road", () => {
      const straightRoad = Road.createStraight(
        "straight-1",
        "t1",
        "t2",
        { x: 0, y: 0 },
        { x: 30, y: 40 }, // 3-4-5 triangle scaled by 10
      );

      expect(straightRoad.length).toBe(50);
    });
  });

  describe("createCurved", () => {
    it("should create curved road with control points", () => {
      const curvedRoad = Road.createCurved(
        "curved-1",
        "t1",
        "t2",
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [{ x: 50, y: 50 }],
      );

      expect(curvedRoad.waypoints).toHaveLength(3);
      expect(curvedRoad.waypoints[0]?.position).toEqual({ x: 0, y: 0 });
      expect(curvedRoad.waypoints[1]?.position).toEqual({ x: 50, y: 50 });
      expect(curvedRoad.waypoints[2]?.position).toEqual({ x: 100, y: 0 });
    });

    it("should handle multiple control points", () => {
      const curvedRoad = Road.createCurved(
        "curved-1",
        "t1",
        "t2",
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        [
          { x: 100, y: 50 },
          { x: 200, y: -50 },
        ],
      );

      expect(curvedRoad.waypoints).toHaveLength(4);
    });

    it("should set correct waypoint indices", () => {
      const curvedRoad = Road.createCurved(
        "curved-1",
        "t1",
        "t2",
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [{ x: 50, y: 50 }],
      );

      expect(curvedRoad.waypoints[0]?.index).toBe(0);
      expect(curvedRoad.waypoints[1]?.index).toBe(1);
      expect(curvedRoad.waypoints[2]?.index).toBe(2);
    });
  });

  describe("getReversedWaypoints", () => {
    it("should return waypoints in reverse order", () => {
      const reversed = road.getReversedWaypoints();

      expect(reversed).toHaveLength(3);
      expect(reversed[0]?.position).toEqual({ x: 200, y: 0 });
      expect(reversed[1]?.position).toEqual({ x: 100, y: 0 });
      expect(reversed[2]?.position).toEqual({ x: 0, y: 0 });
    });

    it("should re-index waypoints", () => {
      const reversed = road.getReversedWaypoints();

      expect(reversed[0]?.index).toBe(0);
      expect(reversed[1]?.index).toBe(1);
      expect(reversed[2]?.index).toBe(2);
    });

    it("should not modify original waypoints", () => {
      road.getReversedWaypoints();

      expect(road.waypoints[0]?.position).toEqual({ x: 0, y: 0 });
    });
  });

  describe("getWaypointsFrom", () => {
    it("should return original waypoints when starting from fromTower", () => {
      const wps = road.getWaypointsFrom("tower-1");

      expect(wps[0]?.position).toEqual({ x: 0, y: 0 });
      expect(wps[2]?.position).toEqual({ x: 200, y: 0 });
    });

    it("should return reversed waypoints when starting from toTower", () => {
      const wps = road.getWaypointsFrom("tower-2");

      expect(wps[0]?.position).toEqual({ x: 200, y: 0 });
      expect(wps[2]?.position).toEqual({ x: 0, y: 0 });
    });

    it("should return empty array for unconnected tower", () => {
      const wps = road.getWaypointsFrom("tower-999");

      expect(wps).toHaveLength(0);
    });
  });

  describe("getTargetTowerFrom", () => {
    it("should return toTower when starting from fromTower", () => {
      const target = road.getTargetTowerFrom("tower-1");

      expect(target).toBe("tower-2");
    });

    it("should return fromTower when starting from toTower", () => {
      const target = road.getTargetTowerFrom("tower-2");

      expect(target).toBe("tower-1");
    });

    it("should return null for unconnected tower", () => {
      const target = road.getTargetTowerFrom("tower-999");

      expect(target).toBeNull();
    });
  });

  describe("connectsTowers", () => {
    it("should return true for connected towers (forward)", () => {
      expect(road.connectsTowers("tower-1", "tower-2")).toBe(true);
    });

    it("should return true for connected towers (reverse)", () => {
      expect(road.connectsTowers("tower-2", "tower-1")).toBe(true);
    });

    it("should return false for unconnected towers", () => {
      expect(road.connectsTowers("tower-1", "tower-3")).toBe(false);
      expect(road.connectsTowers("tower-3", "tower-4")).toBe(false);
    });
  });

  describe("getPositionAtProgress", () => {
    it("should return start position at progress 0", () => {
      const pos = road.getPositionAtProgress(0);

      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
    });

    it("should return end position at progress 1", () => {
      const pos = road.getPositionAtProgress(1);

      expect(pos.x).toBe(200);
      expect(pos.y).toBe(0);
    });

    it("should return middle position at progress 0.5", () => {
      const pos = road.getPositionAtProgress(0.5);

      expect(pos.x).toBe(100);
      expect(pos.y).toBe(0);
    });

    it("should return correct position at progress 0.25", () => {
      const pos = road.getPositionAtProgress(0.25);

      expect(pos.x).toBe(50);
      expect(pos.y).toBe(0);
    });

    it("should clamp progress below 0", () => {
      const pos = road.getPositionAtProgress(-0.5);

      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
    });

    it("should clamp progress above 1", () => {
      const pos = road.getPositionAtProgress(1.5);

      expect(pos.x).toBe(200);
      expect(pos.y).toBe(0);
    });

    it("should handle curved road", () => {
      const curvedRoad = Road.createCurved(
        "curved",
        "t1",
        "t2",
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        [{ x: 50, y: 50 }],
      );

      const startPos = curvedRoad.getPositionAtProgress(0);
      const endPos = curvedRoad.getPositionAtProgress(1);

      expect(startPos).toEqual({ x: 0, y: 0 });
      expect(endPos).toEqual({ x: 100, y: 0 });
    });
  });

  describe("getNearestPointOnRoad", () => {
    it("should return start point when closest to start", () => {
      const result = road.getNearestPointOnRoad({ x: -10, y: 0 });

      expect(result.position.x).toBe(0);
      expect(result.position.y).toBe(0);
      expect(result.segmentIndex).toBe(0);
    });

    it("should return end point when closest to end", () => {
      const result = road.getNearestPointOnRoad({ x: 210, y: 0 });

      expect(result.position.x).toBe(200);
      expect(result.position.y).toBe(0);
    });

    it("should return point on road when above road", () => {
      const result = road.getNearestPointOnRoad({ x: 50, y: 100 });

      expect(result.position.x).toBe(50);
      expect(result.position.y).toBe(0);
    });

    it("should calculate correct distance", () => {
      const result = road.getNearestPointOnRoad({ x: 50, y: 30 });

      expect(result.distance).toBe(30);
    });

    it("should return correct segment index", () => {
      // Point near middle of first segment
      const result1 = road.getNearestPointOnRoad({ x: 50, y: 10 });
      expect(result1.segmentIndex).toBe(0);

      // Point near middle of second segment
      const result2 = road.getNearestPointOnRoad({ x: 150, y: 10 });
      expect(result2.segmentIndex).toBe(1);
    });
  });

  describe("isPointNearRoad", () => {
    it("should return true for point on road", () => {
      expect(road.isPointNearRoad({ x: 50, y: 0 })).toBe(true);
    });

    it("should return true for point within threshold", () => {
      // Default threshold is 20, road width is 30, so 35 pixels should be within
      expect(road.isPointNearRoad({ x: 50, y: 30 })).toBe(true);
    });

    it("should return false for point far from road", () => {
      expect(road.isPointNearRoad({ x: 50, y: 100 })).toBe(false);
    });

    it("should respect custom threshold", () => {
      expect(road.isPointNearRoad({ x: 50, y: 50 }, 40)).toBe(true);
      expect(road.isPointNearRoad({ x: 50, y: 50 }, 10)).toBe(false);
    });
  });

  describe("highlight", () => {
    it("should set isHighlighted to true", () => {
      road.highlight();

      expect(road.isHighlighted).toBe(true);
    });
  });

  describe("unhighlight", () => {
    it("should set isHighlighted to false", () => {
      road.highlight();
      road.unhighlight();

      expect(road.isHighlighted).toBe(false);
    });
  });

  describe("toState", () => {
    it("should serialize road state", () => {
      const state = road.toState();

      expect(state.id).toBe("road-1");
      expect(state.fromTowerId).toBe("tower-1");
      expect(state.toTowerId).toBe("tower-2");
      expect(state.waypoints).toHaveLength(3);
      expect(state.length).toBe(200);
    });

    it("should include all waypoints", () => {
      const state = road.toState();

      expect(state.waypoints[0]).toEqual({ position: { x: 0, y: 0 }, index: 0 });
      expect(state.waypoints[1]).toEqual({
        position: { x: 100, y: 0 },
        index: 1,
      });
      expect(state.waypoints[2]).toEqual({
        position: { x: 200, y: 0 },
        index: 2,
      });
    });
  });

  describe("render", () => {
    it("should not throw when rendering", () => {
      const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        translate: () => {},
        rotate: () => {},
        closePath: () => {},
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 0,
        lineCap: "butt" as CanvasLineCap,
        lineJoin: "miter" as CanvasLineJoin,
      } as unknown as CanvasRenderingContext2D;

      expect(() => road.render(mockCtx)).not.toThrow();
    });

    it("should not throw when rendering highlighted road", () => {
      const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        translate: () => {},
        rotate: () => {},
        closePath: () => {},
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 0,
        lineCap: "butt" as CanvasLineCap,
        lineJoin: "miter" as CanvasLineJoin,
      } as unknown as CanvasRenderingContext2D;

      road.highlight();
      expect(() => road.render(mockCtx)).not.toThrow();
    });

    it("should not render road with less than 2 waypoints", () => {
      const emptyRoad = new Road("empty", "t1", "t2", [
        { position: { x: 0, y: 0 }, index: 0 },
      ]);

      const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
      } as unknown as CanvasRenderingContext2D;

      // Should not throw, just return early
      expect(() => emptyRoad.render(mockCtx)).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle empty waypoints array", () => {
      const emptyRoad = new Road("empty", "t1", "t2", []);

      expect(emptyRoad.length).toBe(0);
      expect(emptyRoad.waypoints).toHaveLength(0);
    });

    it("should handle single waypoint", () => {
      const singleWpRoad = new Road("single", "t1", "t2", [
        { position: { x: 50, y: 50 }, index: 0 },
      ]);

      expect(singleWpRoad.length).toBe(0);
      expect(singleWpRoad.getPositionAtProgress(0.5).x).toBe(50);
    });

    it("should handle diagonal road", () => {
      const diagonalRoad = Road.createStraight(
        "diagonal",
        "t1",
        "t2",
        { x: 0, y: 0 },
        { x: 30, y: 40 },
      );

      expect(diagonalRoad.length).toBe(50); // 3-4-5 triangle
    });

    it("should handle vertical road", () => {
      const verticalRoad = Road.createStraight(
        "vertical",
        "t1",
        "t2",
        { x: 100, y: 0 },
        { x: 100, y: 200 },
      );

      expect(verticalRoad.length).toBe(200);

      const midPos = verticalRoad.getPositionAtProgress(0.5);
      expect(midPos.x).toBe(100);
      expect(midPos.y).toBe(100);
    });

    it("should handle zero-length segments", () => {
      const roadWithZeroSegment = new Road("zero", "t1", "t2", [
        { position: { x: 0, y: 0 }, index: 0 },
        { position: { x: 0, y: 0 }, index: 1 }, // Same position
        { position: { x: 100, y: 0 }, index: 2 },
      ]);

      expect(roadWithZeroSegment.length).toBe(100);

      const nearest = roadWithZeroSegment.getNearestPointOnRoad({ x: 0, y: 10 });
      expect(nearest.distance).toBe(10);
    });
  });
});
