import type { Point, UnitSnapshot, WorldSnapshot } from '@sim/index';
import { SIDE_COLORS, UNIT_VISUAL, withAlpha } from './visual-contract.js';

/**
 * Отрисовка Юнитов. Вынесена из рендера карты, потому что меняется
 * по другим причинам: карта статична, а Юниты появляются, движутся
 * и умирают.
 */

/**
 * Сглаживание положения Юнитов между двумя Тиками. Юнит, которого
 * в прошлом снимке не было, рисуется на своём месте без сглаживания —
 * иначе он выехал бы из начала Дороги рывком.
 */
export function smoother(previous: WorldSnapshot): (unit: UnitSnapshot, alpha: number) => number {
  const before = new Map(previous.units.map((unit) => [unit.id, unit.progress]));

  return (unit, alpha) => {
    const from = before.get(unit.id);
    if (from === undefined) return unit.progress;
    return from + (unit.progress - from) * alpha;
  };
}

export function drawUnit(
  context: CanvasRenderingContext2D,
  unit: UnitSnapshot,
  center: Point,
  scale: number,
): void {
  context.save();
  const color = SIDE_COLORS[unit.side];
  const radius = UNIT_VISUAL.radius * scale;
  const glowRadius = UNIT_VISUAL.glowRadius * scale;

  const glow = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, glowRadius);
  glow.addColorStop(0, withAlpha(color, 0.45));
  glow.addColorStop(1, withAlpha(color, 0));
  context.fillStyle = glow;
  context.fillRect(center.x - glowRadius, center.y - glowRadius, glowRadius * 2, glowRadius * 2);

  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.fillStyle = withAlpha(color, 0.9);
  context.fill();
  context.strokeStyle = '#ffffff';
  context.lineWidth = Math.max(1, 1.5 * scale);
  context.stroke();

  drawHealthBar(context, unit, center, scale);
  context.restore();
}

function drawHealthBar(
  context: CanvasRenderingContext2D,
  unit: UnitSnapshot,
  center: Point,
  scale: number,
): void {
  const width = UNIT_VISUAL.barWidth * scale;
  const height = UNIT_VISUAL.barHeight * scale;
  const left = center.x - width / 2;
  const top = center.y - UNIT_VISUAL.barOffset * scale;
  const share = unit.maxHp === 0 ? 0 : Math.max(0, Math.min(1, unit.hp / unit.maxHp));

  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fillRect(left, top, width, height);
  context.fillStyle = SIDE_COLORS[unit.side];
  context.fillRect(left, top, width * share, height);
  context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  context.lineWidth = Math.max(1, scale);
  context.strokeRect(left, top, width, height);
}
