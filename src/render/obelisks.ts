import type { ObeliskSnapshot, Point, SideId } from '@sim/index';
import { OBELISK, SIDE_COLORS, withAlpha } from './visual-contract.js';

/**
 * Отрисовка Обелисков. Как и Цитадель, вынесена из общего рендера:
 * её вид меняется по своим причинам.
 */

/** Цвет Обелиска: белый, пока ничей, затем цвет владельца. */
export function obeliskColor(owner: SideId | null): string {
  return owner === null ? OBELISK.neutralColor : SIDE_COLORS[owner];
}

/** Полоска здоровья под ромбом: сколько ещё бить до захвата. */
function drawHealthBar(context: CanvasRenderingContext2D, center: Point, color: string, share: number, scale: number): void {
  const width = OBELISK.healthWidth * scale;
  const height = OBELISK.healthHeight * scale;
  const left = center.x - width / 2;
  const top = center.y + (OBELISK.radius + OBELISK.healthGap) * scale;

  context.fillStyle = 'rgba(255, 255, 255, 0.08)';
  context.fillRect(left, top, width, height);
  if (share <= 0) return;
  context.fillStyle = color;
  context.fillRect(left, top, width * Math.min(1, share), height);
}

export function drawObelisk(
  context: CanvasRenderingContext2D,
  center: Point,
  scale: number,
  state: ObeliskSnapshot | undefined,
): void {
  context.save();
  const color = obeliskColor(state?.owner ?? null);

  const glowRadius = OBELISK.glowRadius * scale;
  const glow = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, glowRadius);
  glow.addColorStop(0, withAlpha(color, 0.4));
  glow.addColorStop(1, withAlpha(color, 0));
  context.fillStyle = glow;
  context.fillRect(center.x - glowRadius, center.y - glowRadius, glowRadius * 2, glowRadius * 2);

  const radius = OBELISK.radius * scale;
  context.beginPath();
  context.moveTo(center.x, center.y - radius);
  context.lineTo(center.x + radius, center.y);
  context.lineTo(center.x, center.y + radius);
  context.lineTo(center.x - radius, center.y);
  context.closePath();
  context.fillStyle = withAlpha(color, 0.18);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = OBELISK.ringWidth * scale;
  context.stroke();

  const coreRadius = OBELISK.coreRadius * scale;
  const core = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, coreRadius);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(1, withAlpha(color, 0));
  context.fillStyle = core;
  context.beginPath();
  context.arc(center.x, center.y, coreRadius, 0, Math.PI * 2);
  context.fill();

  if (state) drawHealthBar(context, center, color, state.maxHp === 0 ? 0 : state.hp / state.maxHp, scale);
  context.restore();
}

/**
 * Вспышки перехода: Обелиск пал — от него расходится кольцо в цвете
 * нового владельца. Падения приходят с кадром, собранные за все его Тики:
 * по двум последним снимкам переход на первом из нескольких Тиков кадра
 * не виден.
 */
export function createObeliskFlashes() {
  const since = new Map<string, number>();
  let lastMs = 0;

  return {
    note(taken: ReadonlySet<string>, matchMs: number): void {
      // Время матча пошло назад — начался новый матч, старые вспышки не его.
      if (matchMs < lastMs) since.clear();
      lastMs = matchMs;
      for (const id of taken) since.set(id, matchMs);
    },

    draw(context: CanvasRenderingContext2D, id: string, center: Point, owner: SideId | null, matchMs: number, scale: number): void {
      const start = since.get(id);
      if (start === undefined) return;
      const age = (matchMs - start) / OBELISK.flashMs;
      if (age < 0 || age > 1) return;

      context.save();
      context.strokeStyle = withAlpha(obeliskColor(owner), 1 - age);
      context.lineWidth = OBELISK.ringWidth * 2 * scale;
      context.beginPath();
      context.arc(center.x, center.y, (OBELISK.radius + OBELISK.flashRadius * age) * scale, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    },
  };
}
