import type { Point, UnitKind, UnitSnapshot, WorldSnapshot } from '@sim/index';
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
   * Точка Юнита на поле, сглаженная между двумя Тиками. Юнит, которого
   * в прошлом снимке не было, встаёт на своё место без сглаживания —
   * иначе он выехал бы из ворот рывком.
   */
  placeOf(unit: UnitSnapshot, alpha: number): Point;
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
    placeOf(unit, alpha) {
      const from = before.get(unit.id);
      if (!from) return { x: unit.x, y: unit.y };
      return { x: from.x + (unit.x - from.x) * alpha, y: from.y + (unit.y - from.y) * alpha };
    },

    flashOf(unit, alpha) {
      const from = before.get(unit.id);
      if (!from || from.hp <= unit.hp) return 0;
      return 1 - alpha;
    },
  };
}

/**
 * Своя фигура у каждого типа: Разведчик — круг, Танк — квадрат,
 * Стрелок — треугольник. Форма важнее цвета: цветом уже размечены
 * Стороны, и различать типы им было бы нечем.
 */
function traceShape(
  context: CanvasRenderingContext2D,
  kind: UnitKind,
  center: Point,
  radius: number,
): void {
  context.beginPath();

  if (kind === 'scout') {
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    return;
  }

  if (kind === 'tank') {
    const side = radius * 1.7;
    context.rect(center.x - side / 2, center.y - side / 2, side, side);
    return;
  }

  const reach = radius * 1.25;
  for (let corner = 0; corner < 3; corner += 1) {
    const angle = (corner / 3) * Math.PI * 2 - Math.PI / 2;
    const x = center.x + Math.cos(angle) * reach;
    const y = center.y + Math.sin(angle) * reach;
    if (corner === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
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
  // Ждущий очереди и отступающий оба вне Стычки — оба тусклее бьющихся.
  const waiting =
    unit.state === 'waiting' || unit.state === 'retreating' || unit.state === 'holding';
  const shrink = (waiting ? UNIT_VISUAL.waitingScale : 1) * fade;
  context.globalAlpha = (waiting ? UNIT_VISUAL.waitingAlpha : 1) * fade;
  const radius = UNIT_VISUAL.radius * scale * shrink;
  const glowRadius = UNIT_VISUAL.glowRadius * scale * shrink;

  const glow = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, glowRadius);
  glow.addColorStop(0, withAlpha(color, 0.45));
  glow.addColorStop(1, withAlpha(color, 0));
  context.fillStyle = glow;
  context.fillRect(center.x - glowRadius, center.y - glowRadius, glowRadius * 2, glowRadius * 2);

  traceShape(context, unit.kind, center, radius);
  context.fillStyle = withAlpha(color, 0.9);
  context.fill();
  context.strokeStyle = '#ffffff';
  context.lineWidth = Math.max(1, 1.5 * scale);
  context.stroke();

  // Лечащегося видно сразу, чем бы он ни был занят: иначе Юнит у своей
  // Цитадели неотличим от струсившего, а защитник у ворот — от обречённого.
  if (unit.healing) {
    context.beginPath();
    context.arc(center.x, center.y, radius * UNIT_VISUAL.recoveryRing, 0, Math.PI * 2);
    context.strokeStyle = UNIT_VISUAL.recoveryColor;
    context.lineWidth = Math.max(1, 2 * scale);
    context.stroke();
  }

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
