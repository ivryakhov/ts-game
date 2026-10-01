import type { GameMap, Point, SideId } from '@sim/index';
import { CITADEL_STATS } from '@sim/index';
import type { Frame } from './renderer.js';
import { obeliskColor } from './obelisks.js';
import { ALARM, ROAD, SIDE_COLORS, UNIT_VISUAL, withAlpha } from './visual-contract.js';

/**
 * Слои поверх поля: огонь со стен и откуда он начинается, выделенный Юнит
 * с его целью, тревога при ударе по своей Цитадели. Вынесены из рендера,
 * потому что меняются по своим причинам — каждый слой объясняет игроку
 * одно правило, а не рисует мир.
 */
export interface OverlayContext {
  readonly context: CanvasRenderingContext2D;
  readonly map: GameMap;
  readonly playerSide: SideId;
  toScreen(point: Point): Point;
  scaled(length: number): number;
}

export interface Overlays {
  wallReach(): void;
  wallFire(frame: Frame, places: ReadonlyMap<number, Point>): void;
  selection(frame: Frame, places: ReadonlyMap<number, Point>): void;
  alarm(frame: Frame, cssWidth: number, cssHeight: number): void;
}

export function createOverlays(ctx: OverlayContext): Overlays {
  const { context, map, playerSide, toScreen, scaled } = ctx;
  /** Когда по часам в последний раз досталось Цитадели игрока. */
  let alarmedAtMs = Number.NEGATIVE_INFINITY;

  /**
   * Где начинается огонь со стен. Радиус меряется по прямой от центра
   * Цитадели — стены бьют любого врага рядом, сошёл он с Дороги или нет, —
   * поэтому это пунктирный круг вокруг неё.
   */
  function wallReach(): void {
    for (const citadel of map.citadels) {
      const center = toScreen(citadel.at);
      context.save();
      context.strokeStyle = withAlpha(SIDE_COLORS[citadel.side], 0.35);
      context.lineWidth = Math.max(1, scaled(ROAD.reachMarkRadius) / 3);
      context.setLineDash([scaled(4), scaled(7)]);
      context.beginPath();
      context.arc(center.x, center.y, scaled(CITADEL_STATS.range), 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  /**
   * Луч от Цитадели или Обелиска к тому, кого они бьют. Правило «стены
   * бьют ближайшего, а из стоящих вплотную — пришедшего первым» должно
   * читаться с экрана:
   * игрок на него опирается, выпуская Танка вперёд (ADR-0002).
   */
  function wallFire(frame: Frame, places: ReadonlyMap<number, Point>): void {
    for (const health of frame.current.citadels) {
      if (health.target === null || health.hp <= 0) continue;
      const spec = map.citadels.find((citadel) => citadel.side === health.side);
      if (spec) fireLine(frame, spec.at, places.get(health.target), SIDE_COLORS[health.side]);
    }
    // Обелиск бьёт так же, как стены, и его удар виден так же.
    for (const state of frame.current.obelisks) {
      if (state.hp <= 0) continue;
      const spec = map.obelisks.find((obelisk) => obelisk.id === state.id);
      if (!spec) continue;
      // Разделённый удар виден целиком: по линии к каждому, кого бьют.
      for (const target of state.targets) {
        fireLine(frame, spec.at, places.get(target), obeliskColor(state.owner));
      }
    }
  }

  function fireLine(frame: Frame, at: Point, target: Point | undefined, color: string): void {
    if (!target) return;
    const from = toScreen(at);
    context.save();
    context.strokeStyle = withAlpha(color, 0.75);
    context.lineWidth = scaled(ROAD.wallFireWidth);
    context.setLineDash([scaled(6), scaled(5)]);
    context.lineDashOffset = -scaled(frame.matchMs / 12);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(target.x, target.y);
    context.stroke();
    context.restore();
  }

  /**
   * Выделенный Юнит и линия к тому, кого он бьёт: игрок видит не только
   * Правило, но и его последствие на поле.
   */
  function selection(frame: Frame, places: ReadonlyMap<number, Point>): void {
    if (frame.selectedUnit === null) return;
    const unit = frame.current.units.find((candidate) => candidate.id === frame.selectedUnit);
    const place = places.get(frame.selectedUnit);
    if (!unit || !place) return;

    context.save();
    context.strokeStyle = UNIT_VISUAL.selectionColor;
    context.lineWidth = Math.max(1.5, scaled(2));
    context.beginPath();
    context.arc(place.x, place.y, scaled(UNIT_VISUAL.radius * UNIT_VISUAL.selectionRing), 0, Math.PI * 2);
    context.stroke();

    const target = unit.target === null ? undefined : places.get(unit.target);
    if (target) {
      context.setLineDash([scaled(4), scaled(4)]);
      context.beginPath();
      context.moveTo(place.x, place.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    }
    context.restore();
  }

  /**
   * Слой тревоги поверх поля, когда бьют Цитадель игрока: заметить угрозу
   * можно, даже глядя в другой угол карты.
   */
  function alarm(frame: Frame, cssWidth: number, cssHeight: number): void {
    if (frame.citadelHits.has(playerSide)) alarmedAtMs = frame.realMs;

    const age = frame.realMs - alarmedAtMs;
    if (age < 0 || age > ALARM.fadeMs) return;

    context.fillStyle = withAlpha(SIDE_COLORS[playerSide], ALARM.maxAlpha * (1 - age / ALARM.fadeMs));
    context.fillRect(0, 0, cssWidth, cssHeight);
  }

  return { wallReach, wallFire, selection, alarm };
}
