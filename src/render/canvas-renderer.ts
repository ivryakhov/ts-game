import type { GameMap, Point, RoadSpec, SideId } from '@sim/index';
import { roadPolyline } from '@sim/index';
import {
  BACKGROUND,
  PICK_RADIUS,
  ROAD,
  SIDE_COLORS,
  UNIT_VISUAL,
  withAlpha,
} from './visual-contract.js';
import type { Frame, Renderer } from './renderer.js';
import { drawCitadel } from './citadels.js';
import { drawObelisk } from './obelisks.js';
import { createOverlays } from './overlays.js';
import { createFading } from './fading.js';
import { drawUnit, hindsight } from './units.js';

interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Отрисовка карты на Canvas 2D. Поле живёт в собственных координатах,
 * а вид вписывает его в окно целиком, сохраняя пропорции: при любом
 * размере окна видна вся карта, просто крупнее или мельче.
 */
export function createCanvasRenderer(
  canvas: HTMLCanvasElement,
  map: GameMap,
  playerSide: SideId,
): Renderer {
  const maybeContext = canvas.getContext('2d');
  if (!maybeContext) throw new Error('Браузер не дал контекст 2d');
  const context: CanvasRenderingContext2D = maybeContext;

  const view: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };
  const shapes = new Map<string, readonly Point[]>();
  const fading = createFading();
  /** Где нарисован каждый Юнит в последнем кадре — чтобы найти его по клику. */
  let lastPlaces: ReadonlyMap<number, Point> = new Map();
  let cssWidth = 0;
  let cssHeight = 0;

  const toScreen = (point: Point): Point => ({
    x: view.offsetX + point.x * view.scale,
    y: view.offsetY + point.y * view.scale,
  });
  const scaled = (length: number): number => length * view.scale;
  const toMap = (x: number, y: number): Point => ({
    x: (x - view.offsetX) / view.scale,
    y: (y - view.offsetY) / view.scale,
  });

  const overlays = createOverlays({
    context,
    map,
    playerSide,
    toScreen,
    scaled,
  });

  /** Форма Дороги приходит из ядра ломаной: здесь не знают про Безье. */
  const shapeOf = (road: RoadSpec): readonly Point[] => {
    const cached = shapes.get(road.id);
    if (cached) return cached;
    const shape = roadPolyline(road);
    shapes.set(road.id, shape);
    return shape;
  };

  function tracePath(road: RoadSpec): void {
    const shape = shapeOf(road);
    context.beginPath();
    shape.forEach((point, index) => {
      const screen = toScreen(point);
      if (index === 0) context.moveTo(screen.x, screen.y);
      else context.lineTo(screen.x, screen.y);
    });
  }

  function roadGradient(road: RoadSpec): CanvasGradient {
    const shape = shapeOf(road);
    const start = toScreen(shape[0] ?? { x: 0, y: 0 });
    const end = toScreen(shape[shape.length - 1] ?? { x: 0, y: 0 });
    const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, SIDE_COLORS[road.from]);
    gradient.addColorStop(1, SIDE_COLORS[road.to]);
    return gradient;
  }

  function faintGradient(road: RoadSpec): CanvasGradient {
    const shape = shapeOf(road);
    const start = toScreen(shape[0] ?? { x: 0, y: 0 });
    const end = toScreen(shape[shape.length - 1] ?? { x: 0, y: 0 });
    const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, withAlpha(SIDE_COLORS[road.from], 0.16));
    gradient.addColorStop(1, withAlpha(SIDE_COLORS[road.to], 0.16));
    return gradient;
  }

  /**
   * Расстояние от точки до ломаной Дороги — в единицах карты, а не экрана.
   * Ширина Дороги задана в тех же единицах, поэтому зона клика остаётся
   * соразмерной нарисованному при любом размере окна.
   */
  function distanceToRoad(road: RoadSpec, at: Point): number {
    const shape = shapeOf(road);
    let closest = Number.POSITIVE_INFINITY;

    for (let index = 1; index < shape.length; index += 1) {
      const a = shape[index - 1];
      const b = shape[index];
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t =
        lengthSquared === 0
          ? 0
          : Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / lengthSquared));
      closest = Math.min(closest, Math.hypot(at.x - (a.x + dx * t), at.y - (a.y + dy * t)));
    }

    return closest;
  }

  function drawRoad(road: RoadSpec, matchMs: number, highlighted: boolean): void {
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    tracePath(road);
    context.strokeStyle = faintGradient(road);
    context.lineWidth = scaled(ROAD.glowWidth) * (highlighted ? ROAD.highlightScale : 1);
    context.stroke();

    tracePath(road);
    context.strokeStyle = roadGradient(road);
    context.globalAlpha = 0.45;
    context.lineWidth = scaled(ROAD.coreWidth);
    context.stroke();
    context.globalAlpha = 1;

    tracePath(road);
    context.strokeStyle = roadGradient(road);
    context.lineWidth = scaled(ROAD.dashWidth);
    context.setLineDash(ROAD.dash.map(scaled));
    context.lineDashOffset = -scaled((matchMs / 1000) * ROAD.dashSpeed);
    context.stroke();

    context.restore();
  }

  return {
    resize(width: number, height: number): void {
      const ratio = window.devicePixelRatio || 1;
      cssWidth = width;
      cssHeight = height;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      view.scale = Math.min(width / map.size.width, height / map.size.height);
      view.offsetX = (width - map.size.width * view.scale) / 2;
      view.offsetY = (height - map.size.height * view.scale) / 2;
    },

    unitAt(x: number, y: number): number | null {
      let nearest: { id: number; distance: number } | null = null;
      const reach = Math.max(scaled(UNIT_VISUAL.pickRadius), 10);

      for (const [id, place] of lastPlaces) {
        const distance = Math.hypot(place.x - x, place.y - y);
        if (distance > reach) continue;
        if (!nearest || distance < nearest.distance) nearest = { id, distance };
      }

      return nearest?.id ?? null;
    },

    roadAt(x: number, y: number): string | null {
      const at = toMap(x, y);
      let nearest: { id: string; distance: number } | null = null;

      for (const road of map.roads) {
        const distance = distanceToRoad(road, at);
        if (distance > PICK_RADIUS) continue;
        if (!nearest || distance < nearest.distance) nearest = { id: road.id, distance };
      }

      return nearest?.id ?? null;
    },

    draw(frame: Frame): void {
      context.fillStyle = BACKGROUND;
      context.fillRect(0, 0, cssWidth, cssHeight);

      for (const road of map.roads) {
        drawRoad(road, frame.matchMs, road.id === frame.highlightedRoad);
      }
      overlays.wallReach();
      for (const citadel of map.citadels) {
        drawCitadel(
          context,
          citadel.side,
          toScreen(citadel.at),
          view.scale,
          frame.current.citadels.find((health) => health.side === citadel.side),
        );
      }
      for (const obelisk of map.obelisks) {
        const state = frame.current.obelisks.find((candidate) => candidate.id === obelisk.id);
        drawObelisk(context, toScreen(obelisk.at), view.scale, state);
      }

      const seen = hindsight(frame.previous);
      fading.remember(frame.previous.units, frame.deaths, frame.matchMs);

      for (const dead of fading.visible(frame.matchMs)) {
        drawUnit(context, dead.unit, toScreen(dead.place), view.scale, { fade: dead.fade });
      }

      const places = new Map<number, Point>();
      for (const unit of frame.current.units) {
        const place = toScreen(seen.placeOf(unit, frame.alpha));
        places.set(unit.id, place);
        drawUnit(context, unit, place, view.scale, { flash: seen.flashOf(unit, frame.alpha) });
      }
      lastPlaces = places;

      overlays.wallFire(frame, places);
      overlays.selection(frame, places);

      overlays.alarm(frame, cssWidth, cssHeight);
    },
  };
}
