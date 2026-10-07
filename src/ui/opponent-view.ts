import { UNIT_KINDS, UNIT_STATS, type Behaviour, type Wave } from '@sim/index';
import type { Opponent } from '../app/opponents.js';
import { describeRule, UNIT_TITLES } from './rule-text.js';

/**
 * Вкладка «Противник» на Подготовке: кто он, по каким Правилам действуют
 * его Юниты и какими Волнами он их выпускает. Скрытого у противника
 * ничего нет (ADR-0003) — всё, что решает его игру, видно здесь.
 */

const ROAD_TITLES: Readonly<Record<string, string>> = {
  short: 'короткая Дорога',
  north: 'северная Дорога',
  south: 'южная Дорога',
};

/** Волна словами: «короткая Дорога: Танк, Стрелок, Стрелок — 130 Эфира». */
export function describeWave(wave: Wave): string {
  const road = ROAD_TITLES[wave.road] ?? `Дорога «${wave.road}»`;
  const price = wave.units.reduce((sum, kind) => sum + UNIT_STATS[kind].cost, 0);
  return `${road}: ${wave.units.map((kind) => UNIT_TITLES[kind]).join(', ')} — ${price} Эфира`;
}

function block<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

function list(lines: readonly string[]): HTMLOListElement {
  const shown = block('ol', 'prep__rules');
  shown.append(...lines.map((text) => block('li', 'prep__rule', text)));
  return shown;
}

const READ_ONLY = 'Правила противника — только чтение. В матче их видно и в панели выделенного Юнита.';

/** `note` — подсказка под Волнами; null — без неё. */
export function opponentView(opponent: Opponent | null, fallback: Behaviour, note: string | null = READ_ONLY): HTMLElement[] {
  const behaviour = opponent?.side.behaviour ?? fallback;
  const waves = opponent?.side.waves ?? [];
  return [
    block('h3', 'prep__kind', opponent?.name ?? 'Противник'),
    block('p', 'prep__note', opponent?.description ?? 'Файлы противников отвергнуты — он не выпускает Юнитов.'),
    block('h3', 'prep__kind', 'Волны'),
    block('p', 'prep__note', 'Копит Эфир на очередную Волну целиком, выпускает её и идёт по списку по кругу. На поле Волны не смотрят.'),
    waves.length > 0 ? list(waves.map(describeWave)) : block('p', 'prep__note', 'Волн нет.'),
    ...(note === null ? [] : [block('p', 'prep__note', note)]),
    ...UNIT_KINDS.flatMap((kind) => [block('h3', 'prep__kind', UNIT_TITLES[kind]), list(behaviour[kind].map(describeRule))]),
  ];
}
