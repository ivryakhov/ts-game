import type {
  CitadelSnapshot,
  CitadelSpec,
  GameMap,
  Point,
  RoadMetrics,
  RoadSpec,
  SideId,
  UnitSnapshot,
} from '@sim/index';
import { measureRoad, roadPolyline } from '@sim/index';
import { ALARM, BACKGROUND, CITADEL, ROAD, SIDE_COLORS, withAlpha } from './visual-contract.js';
import type { Frame, Renderer } from './renderer.js';
import { createFading } from './fading.js';
import { drawUnit, hindsight } from './units.js';

/** Во сколько граней рисуется Цитадель. */
const CITADEL_FACETS = 6;

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
  const metrics = new Map<string, RoadMetrics>(
    map.roads.map((road) => [road.id, measureRoad(road)]),
  );
  const fading = createFading();
  /** Когда по часам в последний раз досталось Цитадели игрока. */
  let alarmedAtMs = Number.NEGATIVE_INFINITY;
  let cssWidth = 0;
  let cssHeight = 0;

  const toScreen = (point: Point): Point => ({
    x: view.offsetX + point.x * view.scale,
    y: view.offsetY + point.y * view.scale,
  });
  const scaled = (length: number): number => length * view.scale;

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

  function drawRoad(road: RoadSpec, matchMs: number): void {
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    tracePath(road);
    context.strokeStyle = faintGradient(road);
    context.lineWidth = scaled(ROAD.glowWidth);
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

  function placeOf(unit: UnitSnapshot, progress: number): Point | null {
    const road = metrics.get(unit.roadId);
    if (!road) return null;
    return toScreen(road.pointAtDistance(progress * road.length));
  }

  /** Кольцо здоровья: сколько Цитадели осталось, видно с одного взгляда. */
  function drawCitadelHealth(center: Point, color: string, share: number): void {
    const radius = scaled(CITADEL.healthRadius);
    context.lineWidth = scaled(CITADEL.healthWidth);
    context.lineCap = 'butt';

    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    context.stroke();

    if (share <= 0) return;
    context.beginPath();
    context.arc(center.x, center.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share);
    context.strokeStyle = color;
    context.stroke();
  }

  function drawCitadel(citadel: CitadelSpec, health: CitadelSnapshot | undefined): void {
    context.save();
    const center = toScreen(citadel.at);
    const color = SIDE_COLORS[citadel.side];
    const glowRadius = scaled(CITADEL.glowRadius);
    // Разрушенная Цитадель гаснет: победа должна читаться с экрана,
    // а не только из надписи.
    if (health && health.hp <= 0) context.globalAlpha = CITADEL.ruinAlpha;

    const glow = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, glowRadius);
    glow.addColorStop(0, withAlpha(color, 0.5));
    glow.addColorStop(1, withAlpha(color, 0));
    context.fillStyle = glow;
    context.fillRect(center.x - glowRadius, center.y - glowRadius, glowRadius * 2, glowRadius * 2);

    const radius = scaled(CITADEL.radius);
    context.beginPath();
    for (let facet = 0; facet < CITADEL_FACETS; facet += 1) {
      const angle = (facet / CITADEL_FACETS) * Math.PI * 2 - Math.PI / 2;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      if (facet === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = withAlpha(color, 0.18);
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = scaled(CITADEL.ringWidth);
    context.stroke();

    const coreRadius = scaled(CITADEL.coreRadius);
    const core = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, coreRadius);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.4, color);
    core.addColorStop(1, withAlpha(color, 0));
    context.fillStyle = core;
    context.beginPath();
    context.arc(center.x, center.y, coreRadius, 0, Math.PI * 2);
    context.fill();

    if (health) drawCitadelHealth(center, color, health.maxHp === 0 ? 0 : health.hp / health.maxHp);
    context.restore();
  }

  /**
   * Слой тревоги поверх поля, когда бьют Цитадель игрока: заметить угрозу
   * можно, даже глядя в другой угол карты.
   */
  function drawAlarm(frame: Frame): void {
    if (frame.citadelHits.has(playerSide)) alarmedAtMs = frame.realMs;

    const age = frame.realMs - alarmedAtMs;
    if (age < 0 || age > ALARM.fadeMs) return;

    context.fillStyle = withAlpha(SIDE_COLORS[playerSide], ALARM.maxAlpha * (1 - age / ALARM.fadeMs));
    context.fillRect(0, 0, cssWidth, cssHeight);
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

    draw(frame: Frame): void {
      context.fillStyle = BACKGROUND;
      context.fillRect(0, 0, cssWidth, cssHeight);

      for (const road of map.roads) drawRoad(road, frame.matchMs);
      for (const citadel of map.citadels) {
        drawCitadel(
          citadel,
          frame.current.citadels.find((health) => health.side === citadel.side),
        );
      }

      const seen = hindsight(frame.previous);
      fading.remember(frame.previous.units, frame.deaths, frame.matchMs);

      for (const dead of fading.visible(frame.matchMs)) {
        const place = placeOf(dead.unit, dead.progress);
        if (place) drawUnit(context, dead.unit, place, view.scale, { fade: dead.fade });
      }

      for (const unit of frame.current.units) {
        const place = placeOf(unit, seen.progressOf(unit, frame.alpha));
        if (!place) continue;
        drawUnit(context, unit, place, view.scale, { flash: seen.flashOf(unit, frame.alpha) });
      }

      drawAlarm(frame);
    },
  };
}
