import type { Point, UnitSnapshot, WorldSnapshot } from '@sim/index';
import { SIDE_COLORS, UNIT_VISUAL, withAlpha } from './visual-contract.js';

/**
 * Отрисовка Юнитов. Вынесена из рендера карты, потому что меняется
 * по другим причинам: карта статична, а Юниты появляются, движутся
 * и умирают.
 */

/**
 * Взгляд на предыдущий снимок: где Юнит был и сколько у него было
 * здоровья. Строится раз в кадр, чтобы не искать каждого Юнита
 * перебором по всему прошлому состоянию.
 */
export interface Hindsight {
  /**
   * Доля пройденной Дороги, сглаженная между двумя Тиками. Юнит, которого
   * в прошлом снимке не было, встаёт на своё место без сглаживания —
   * иначе он выехал бы из начала Дороги рывком.
   */
  progressOf(unit: UnitSnapshot, alpha: number): number;
  /**
   * Сила вспышки от полученного урона. Вспышка загорается в начале Тика
   * и гаснет к следующему, поэтому Стычка читается как пульсация,
   * а не как ровное свечение.
   */
  flashOf(unit: UnitSnapshot, alpha: number): number;
}

export function hindsight(previous: WorldSnapshot): Hindsight {
  const before = new Map(previous.units.map((unit) => [unit.id, unit]));

  return {
    progressOf(unit, alpha) {
      const from = before.get(unit.id);
      if (!from) return unit.progress;
      return from.progress + (unit.progress - from.progress) * alpha;
    },

    flashOf(unit, alpha) {
      const from = before.get(unit.id);
      if (!from || from.hp <= unit.hp) return 0;
      return 1 - alpha;
    },
  };
}

export function drawUnit(
  context: CanvasRenderingContext2D,
  unit: UnitSnapshot,
  center: Point,
  scale: number,
  options: { flash?: number; fade?: number } = {},
): void {
  context.save();
  const color = SIDE_COLORS[unit.side];
  const fade = options.fade ?? 1;
  const waiting = unit.state === 'waiting';
  const shrink = (waiting ? UNIT_VISUAL.waitingScale : 1) * fade;
  context.globalAlpha = (waiting ? UNIT_VISUAL.waitingAlpha : 1) * fade;
  const radius = UNIT_VISUAL.radius * scale * shrink;
  const glowRadius = UNIT_VISUAL.glowRadius * scale * shrink;

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

  const flash = options.flash ?? 0;
  if (flash > 0) {
    context.beginPath();
    context.arc(center.x, center.y, radius * (1 + flash * 0.7), 0, Math.PI * 2);
    context.fillStyle = `rgba(255, 255, 255, ${0.55 * flash})`;
    context.fill();
  }

  if (fade >= 1) drawHealthBar(context, unit, center, scale);
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
