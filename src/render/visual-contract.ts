/**
 * Визуальный контракт этапа 1 (docs/v1-plan.md): цвета и размеры всего,
 * что рисуется на экране.
 *
 * Всё рисуется примитивами и градиентами — ни одного спрайта. Постобработки
 * нет: свечение делается радиальным градиентом, а не bloom-фильтром.
 * Здесь собраны все цвета и размеры, чтобы позже их можно было менять
 * в одном месте, не разыскивая по коду.
 */
import type { SideId } from '@sim/index';

export const BACKGROUND = '#0a0a14';

export const SIDE_COLORS: Readonly<Record<SideId, string>> = {
  A: '#22d3ee',
  B: '#e879f9',
};

export const CITADEL = {
  radius: 44,
  coreRadius: 15,
  glowRadius: 150,
  ringWidth: 3.5,
} as const;

export const ROAD = {
  /** Широкий полупрозрачный след — он и создаёт ощущение свечения. */
  glowWidth: 26,
  coreWidth: 4,
  dashWidth: 6,
  dash: [16, 30],
  /** Условных единиц в секунду — скорость бега пунктира. */
  dashSpeed: 55,
} as const;

export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
