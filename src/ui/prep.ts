import { UNIT_KINDS, type Behaviour, type Rule, type Seed, type UnitKind } from '@sim/index';
import { parseSeed } from '../app/seed.js';
import { describeRule, UNIT_TITLES } from './rule-text.js';
import { describeStats } from './stats-text.js';

/**
 * Подготовка — время до матча. Игрок видит Поведение своих типов Юнитов
 * рядом с их характеристиками, Поведение противника и Сид, и начинает
 * матч. Это единственное место, где Поведение меняется (ADR-0002); правка
 * Правил придёт в тикете 17, пока они только показаны.
 *
 * Разметка лежит в index.html, здесь — заполнение и кнопки.
 */
export interface Prep {
  /** Открыть Подготовку с этим Сидом и этими Поведениями. */
  show(seed: Seed, player: Behaviour, opponent: Behaviour): void;
  hide(): void;
  /** Показать ошибку, которую игрок должен исправить сам. Ошибки копятся. */
  warn(message: string): void;
}

type Tab = UnitKind | 'opponent';

const TABS: readonly Tab[] = [...UNIT_KINDS, 'opponent'];
const TAB_TITLES: Readonly<Record<Tab, string>> = { ...UNIT_TITLES, opponent: 'Противник' };

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`В разметке нет элемента #${id}`);
  return found as T;
}

function block<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

/** Правила теми же словами, что в панели выделенного Юнита, — по порядку. */
function ruleList(rules: readonly Rule[]): HTMLOListElement {
  const list = block('ol', 'prep__rules');
  list.append(...rules.map((rule) => block('li', 'prep__rule', describeRule(rule))));
  return list;
}

function statsCard(kind: UnitKind): HTMLDListElement {
  const card = block('dl', 'prep__card');
  for (const line of describeStats(kind)) {
    card.append(block('dt', 'prep__stat-label', line.label), block('dd', 'prep__stat-value', line.value));
  }
  return card;
}

function playerView(kind: UnitKind, behaviour: Behaviour): HTMLElement[] {
  return [
    statsCard(kind),
    ruleList(behaviour[kind]),
    block('p', 'prep__note', 'Правила пока правятся в файле src/behaviours/player.json.'),
  ];
}

function opponentView(behaviour: Behaviour): HTMLElement[] {
  return [
    block('p', 'prep__note', 'Правила противника — только чтение. В матче их видно и в панели выделенного Юнита.'),
    ...UNIT_KINDS.flatMap((kind) => [block('h3', 'prep__kind', UNIT_TITLES[kind]), ruleList(behaviour[kind])]),
  ];
}

export function createPrep(onStart: (seed: Seed) => void): Prep {
  const panel = element('prep');
  const tabs = element('prep-tabs');
  const body = element('prep-body');
  const warning = element('prep-warning');
  const seedInput = element<HTMLInputElement>('prep-seed');
  const seedError = element('prep-seed-error');
  const start = element<HTMLButtonElement>('prep-start');

  let active: Tab = UNIT_KINDS[0] ?? 'opponent';
  let shown: { player: Behaviour; opponent: Behaviour } | null = null;

  const render = (): void => {
    if (!shown) return;
    for (const { tab, button } of buttons) button.classList.toggle('prep__tab--active', tab === active);
    body.replaceChildren(...(active === 'opponent' ? opponentView(shown.opponent) : playerView(active, shown.player)));
  };

  const buttons = TABS.map((tab) => {
    const button = block('button', 'button prep__tab', TAB_TITLES[tab]);
    button.type = 'button';
    button.addEventListener('click', () => {
      active = tab;
      render();
    });
    tabs.append(button);
    return { tab, button };
  });

  /** Негодный Сид не даёт начать матч — и сказано почему. */
  const checkSeed = (): Seed | null => {
    const seed = parseSeed(seedInput.value);
    seedError.hidden = seed !== null;
    start.disabled = seed === null;
    return seed;
  };

  const begin = (): void => {
    const seed = checkSeed();
    if (seed !== null) onStart(seed);
  };

  seedInput.addEventListener('input', checkSeed);
  seedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') begin();
  });
  start.addEventListener('click', begin);

  return {
    show(seed, player, opponent): void {
      shown = { player, opponent };
      seedInput.value = String(seed);
      checkSeed();
      panel.hidden = false;
      render();
      start.focus();
    },

    hide(): void {
      panel.hidden = true;
    },

    warn(message): void {
      warning.append(block('div', 'prep__warning-line', message));
      warning.hidden = false;
    },
  };
}
