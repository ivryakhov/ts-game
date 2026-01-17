/**
 * Neon Arcana - Класс Road (Дорога)
 * Дороги соединяют башни и определяют пути движения юнитов
 */

import { EntityId, RoadId, RoadState, Waypoint, Position } from "@shared/types";

/**
 * Класс дороги
 */
export class Road {
  /** Уникальный идентификатор дороги */
  public readonly id: RoadId;

  /** ID башни, от которой идёт дорога */
  public fromTowerId: EntityId;

  /** ID башни, к которой идёт дорога */
  public toTowerId: EntityId;

  /** Путевые точки дороги */
  public waypoints: Waypoint[];

  /** Общая длина дороги в пикселях */
  public length: number;

  /** Цвет дороги (для рендеринга) */
  public color: string = "#2a2a4a";

  /** Ширина дороги (для рендеринга) */
  public width: number = 30;

  /** Активна ли дорога (видима) */
  public isActive: boolean = true;

  /** Подсвечена ли дорога (hover/selection) */
  public isHighlighted: boolean = false;

  constructor(
    id: RoadId,
    fromTowerId: EntityId,
    toTowerId: EntityId,
    waypoints: Waypoint[],
  ) {
    this.id = id;
    this.fromTowerId = fromTowerId;
    this.toTowerId = toTowerId;
    this.waypoints = waypoints;
    this.length = this.calculateLength();
  }

  /**
   * Создать из состояния (для синхронизации)
   */
  static fromState(state: RoadState): Road {
    const road = new Road(
      state.id,
      state.fromTowerId,
      state.toTowerId,
      state.waypoints,
    );
    road.length = state.length;
    return road;
  }

  /**
   * Создать дорогу из двух позиций (прямая линия)
   */
  static createStraight(
    id: RoadId,
    fromTowerId: EntityId,
    toTowerId: EntityId,
    fromPosition: Position,
    toPosition: Position,
  ): Road {
    const waypoints: Waypoint[] = [
      { position: fromPosition, index: 0 },
      { position: toPosition, index: 1 },
    ];

    return new Road(id, fromTowerId, toTowerId, waypoints);
  }

  /**
   * Создать изогнутую дорогу с промежуточными точками
   */
  static createCurved(
    id: RoadId,
    fromTowerId: EntityId,
    toTowerId: EntityId,
    fromPosition: Position,
    toPosition: Position,
    controlPoints: Position[],
  ): Road {
    const waypoints: Waypoint[] = [{ position: fromPosition, index: 0 }];

    // Добавляем контрольные точки
    controlPoints.forEach((point, i) => {
      waypoints.push({ position: point, index: i + 1 });
    });

    waypoints.push({
      position: toPosition,
      index: waypoints.length,
    });

    return new Road(id, fromTowerId, toTowerId, waypoints);
  }

  /**
   * Вычислить общую длину дороги
   */
  private calculateLength(): number {
    let totalLength = 0;

    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const current = this.waypoints[i];
      const next = this.waypoints[i + 1];

      if (current && next) {
        const dx = next.position.x - current.position.x;
        const dy = next.position.y - current.position.y;
        totalLength += Math.sqrt(dx * dx + dy * dy);
      }
    }

    return totalLength;
  }

  /**
   * Получить путевые точки в обратном порядке (для движения от toTower к fromTower)
   */
  getReversedWaypoints(): Waypoint[] {
    return [...this.waypoints].reverse().map((wp, index) => ({
      position: wp.position,
      index,
    }));
  }

  /**
   * Получить путевые точки для движения от указанной башни
   */
  getWaypointsFrom(towerId: EntityId): Waypoint[] {
    if (towerId === this.fromTowerId) {
      return this.waypoints;
    } else if (towerId === this.toTowerId) {
      return this.getReversedWaypoints();
    }

    // Если башня не связана с этой дорогой, возвращаем пустой массив
    return [];
  }

  /**
   * Получить целевую башню при движении от указанной
   */
  getTargetTowerFrom(towerId: EntityId): EntityId | null {
    if (towerId === this.fromTowerId) {
      return this.toTowerId;
    } else if (towerId === this.toTowerId) {
      return this.fromTowerId;
    }
    return null;
  }

  /**
   * Проверить, соединяет ли дорога указанные башни
   */
  connectsTowers(towerId1: EntityId, towerId2: EntityId): boolean {
    return (
      (this.fromTowerId === towerId1 && this.toTowerId === towerId2) ||
      (this.fromTowerId === towerId2 && this.toTowerId === towerId1)
    );
  }

  /**
   * Получить позицию на дороге по прогрессу (0-1)
   */
  getPositionAtProgress(progress: number): Position {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const targetDistance = this.length * clampedProgress;

    let accumulatedDistance = 0;

    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const current = this.waypoints[i];
      const next = this.waypoints[i + 1];

      if (!current || !next) continue;

      const segmentLength = this.getSegmentLength(i);

      if (accumulatedDistance + segmentLength >= targetDistance) {
        // Позиция находится на этом сегменте
        const segmentProgress =
          (targetDistance - accumulatedDistance) / segmentLength;

        return {
          x:
            current.position.x +
            (next.position.x - current.position.x) * segmentProgress,
          y:
            current.position.y +
            (next.position.y - current.position.y) * segmentProgress,
        };
      }

      accumulatedDistance += segmentLength;
    }

    // Если дошли до конца, возвращаем последнюю точку
    const lastWaypoint = this.waypoints[this.waypoints.length - 1];
    return lastWaypoint ? lastWaypoint.position : { x: 0, y: 0 };
  }

  /**
   * Получить длину сегмента между путевыми точками
   */
  private getSegmentLength(segmentIndex: number): number {
    const current = this.waypoints[segmentIndex];
    const next = this.waypoints[segmentIndex + 1];

    if (!current || !next) return 0;

    const dx = next.position.x - current.position.x;
    const dy = next.position.y - current.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Найти ближайшую точку на дороге к заданной позиции
   */
  getNearestPointOnRoad(position: Position): {
    position: Position;
    distance: number;
    segmentIndex: number;
  } {
    let nearestPoint: Position = this.waypoints[0]?.position ?? { x: 0, y: 0 };
    let minDistance = Infinity;
    let nearestSegmentIndex = 0;

    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const current = this.waypoints[i];
      const next = this.waypoints[i + 1];

      if (!current || !next) continue;

      const point = this.nearestPointOnSegment(
        position,
        current.position,
        next.position,
      );

      const dx = position.x - point.x;
      const dy = position.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
        nearestSegmentIndex = i;
      }
    }

    return {
      position: nearestPoint,
      distance: minDistance,
      segmentIndex: nearestSegmentIndex,
    };
  }

  /**
   * Найти ближайшую точку на сегменте
   */
  private nearestPointOnSegment(
    point: Position,
    segmentStart: Position,
    segmentEnd: Position,
  ): Position {
    const dx = segmentEnd.x - segmentStart.x;
    const dy = segmentEnd.y - segmentStart.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return segmentStart;
    }

    let t =
      ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) /
      lengthSquared;
    t = Math.max(0, Math.min(1, t));

    return {
      x: segmentStart.x + t * dx,
      y: segmentStart.y + t * dy,
    };
  }

  /**
   * Проверить, находится ли точка рядом с дорогой
   */
  isPointNearRoad(position: Position, threshold: number = 20): boolean {
    const nearest = this.getNearestPointOnRoad(position);
    return nearest.distance <= threshold + this.width / 2;
  }

  /**
   * Отрисовка дороги
   */
  render(ctx: CanvasRenderingContext2D): void {
    if (this.waypoints.length < 2) return;

    ctx.save();

    // Основная линия дороги
    ctx.strokeStyle = this.isHighlighted
      ? this.lightenColor(this.color, 0.5)
      : this.color;
    ctx.lineWidth = this.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();

    const firstWaypoint = this.waypoints[0];
    if (firstWaypoint) {
      ctx.moveTo(firstWaypoint.position.x, firstWaypoint.position.y);
    }

    for (let i = 1; i < this.waypoints.length; i++) {
      const waypoint = this.waypoints[i];
      if (waypoint) {
        ctx.lineTo(waypoint.position.x, waypoint.position.y);
      }
    }

    ctx.stroke();

    // Внутренняя линия (полоса движения)
    ctx.strokeStyle = this.isHighlighted ? "#4a4a6a" : "#1a1a3a";
    ctx.lineWidth = this.width * 0.6;

    ctx.beginPath();

    if (firstWaypoint) {
      ctx.moveTo(firstWaypoint.position.x, firstWaypoint.position.y);
    }

    for (let i = 1; i < this.waypoints.length; i++) {
      const waypoint = this.waypoints[i];
      if (waypoint) {
        ctx.lineTo(waypoint.position.x, waypoint.position.y);
      }
    }

    ctx.stroke();

    // Направляющие точки (если подсвечена)
    if (this.isHighlighted) {
      this.renderDirectionIndicators(ctx);
    }

    ctx.restore();
  }

  /**
   * Рисовать индикаторы направления
   */
  private renderDirectionIndicators(ctx: CanvasRenderingContext2D): void {
    const arrowCount = Math.floor(this.length / 80);

    for (let i = 1; i <= arrowCount; i++) {
      const progress = i / (arrowCount + 1);
      const pos = this.getPositionAtProgress(progress);

      // Получаем направление в этой точке
      const nextPos = this.getPositionAtProgress(progress + 0.01);
      const angle = Math.atan2(nextPos.y - pos.y, nextPos.x - pos.x);

      // Рисуем стрелку
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(angle);

      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * Осветлить цвет
   */
  private lightenColor(color: string, factor: number): string {
    const hex = color.replace("#", "");
    const r = Math.min(
      255,
      Math.floor(parseInt(hex.substring(0, 2), 16) * (1 + factor)),
    );
    const g = Math.min(
      255,
      Math.floor(parseInt(hex.substring(2, 4), 16) * (1 + factor)),
    );
    const b = Math.min(
      255,
      Math.floor(parseInt(hex.substring(4, 6), 16) * (1 + factor)),
    );
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Подсветить дорогу
   */
  highlight(): void {
    this.isHighlighted = true;
  }

  /**
   * Убрать подсветку
   */
  unhighlight(): void {
    this.isHighlighted = false;
  }

  /**
   * Сериализация состояния
   */
  toState(): RoadState {
    return {
      id: this.id,
      fromTowerId: this.fromTowerId,
      toTowerId: this.toTowerId,
      waypoints: this.waypoints,
      length: this.length,
    };
  }
}
