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
  /** Кольцо здоровья вокруг Цитадели. */
  healthRadius: 58,
  healthWidth: 7,
  /** Насколько тускнеет разрушенная Цитадель. */
  ruinAlpha: 0.25,
} as const;

/**
 * Обелиск — ромб: белый, пока ничей, затем в цвете владельца. Полуширина
 * ромба совпадает с радиусом тела в симуляции.
 */
export const OBELISK = {
  radius: 20,
  neutralColor: '#f8fafc',
  glowRadius: 70,
  coreRadius: 7,
  ringWidth: 2.5,
  /** Полоска здоровья под ромбом. */
  healthWidth: 44,
  healthHeight: 5,
  healthGap: 12,
} as const;

/** Вспышка экрана, когда бьют Цитадель игрока. */
export const ALARM = {
  maxAlpha: 0.16,
  /** Миллисекунд матча, за которые вспышка гаснет. */
  fadeMs: 320,
} as const;

export const ROAD = {
  /** Широкий полупрозрачный след — он и создаёт ощущение свечения. */
  glowWidth: 26,
  coreWidth: 4,
  dashWidth: 6,
  /** Пунктир стоит на месте: бегущий мельтешит и отвлекает от Стычек. */
  dash: [16, 30],
  /** Во сколько раз шире светится Дорога под курсором. */
  highlightScale: 1.8,
  /** Толщина луча, которым Цитадель бьёт со стен. */
  wallFireWidth: 3,
  /** Толщина круга, которым отмечен огонь со стен (в трети этой величины). */
  reachMarkRadius: 5,
} as const;

export const UNIT_VISUAL = {
  /** Совпадает с радиусом тела в симуляции: Юниты стоят тело к телу. */
  radius: 12,
  glowRadius: 34,
  /** Ожидающий очереди Юнит меньше и тусклее бьющегося. */
  waitingScale: 0.78,
  waitingAlpha: 0.5,
  /** Полоса здоровья над Юнитом. */
  barWidth: 30,
  barHeight: 5,
  barOffset: 26,
  /** Сколько миллисекунд матча Юнит схлопывается после смерти. */
  fadeMs: 260,
  /** Кольцо вокруг Юнита, которого лечит своя Цитадель. */
  recoveryColor: '#4ade80',
  recoveryRing: 1.7,
  /** Выделенный игроком Юнит и линия к его цели. */
  selectionColor: '#fde047',
  selectionRing: 2.2,
  /** Насколько близко к Юниту должен быть курсор, чтобы его выделить. */
  pickRadius: 18,
} as const;

/**
 * Насколько близко к Дороге должен быть курсор, чтобы её выбрать.
 * В единицах карты, как и ширина самой Дороги.
 */
export const PICK_RADIUS = 34;

export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
