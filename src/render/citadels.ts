import type { CitadelSnapshot, Point, SideId } from '@sim/index';
import { CITADEL, SIDE_COLORS, withAlpha } from './visual-contract.js';

/**
 * Отрисовка Цитаделей. Вынесена из общего рендера, потому что меняется
 * по своим причинам: Дороги и Юниты к её виду отношения не имеют.
 */

/** Во сколько граней рисуется Цитадель. */
const FACETS = 6;

/** Кольцо здоровья: сколько Цитадели осталось, видно с одного взгляда. */
function drawHealthRing(
  context: CanvasRenderingContext2D,
  center: Point,
  color: string,
  share: number,
  scale: number,
): void {
  const radius = CITADEL.healthRadius * scale;
  context.lineWidth = CITADEL.healthWidth * scale;
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

export function drawCitadel(
  context: CanvasRenderingContext2D,
  side: SideId,
  center: Point,
  scale: number,
  health: CitadelSnapshot | undefined,
): void {
  context.save();
  const color = SIDE_COLORS[side];
  const glowRadius = CITADEL.glowRadius * scale;
  // Разрушенная Цитадель гаснет: победа должна читаться с экрана,
  // а не только из надписи.
  if (health && health.hp <= 0) context.globalAlpha = CITADEL.ruinAlpha;

  const glow = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, glowRadius);
  glow.addColorStop(0, withAlpha(color, 0.5));
  glow.addColorStop(1, withAlpha(color, 0));
  context.fillStyle = glow;
  context.fillRect(center.x - glowRadius, center.y - glowRadius, glowRadius * 2, glowRadius * 2);

  const radius = CITADEL.radius * scale;
  context.beginPath();
  for (let facet = 0; facet < FACETS; facet += 1) {
    const angle = (facet / FACETS) * Math.PI * 2 - Math.PI / 2;
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle) * radius;
    if (facet === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fillStyle = withAlpha(color, 0.18);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = CITADEL.ringWidth * scale;
  context.stroke();

  const coreRadius = CITADEL.coreRadius * scale;
  const core = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, coreRadius);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.4, color);
  core.addColorStop(1, withAlpha(color, 0));
  context.fillStyle = core;
  context.beginPath();
  context.arc(center.x, center.y, coreRadius, 0, Math.PI * 2);
  context.fill();

  if (health) drawHealthRing(context, center, color, health.maxHp === 0 ? 0 : health.hp / health.maxHp, scale);
  context.restore();
}
