import { parseBehaviour, UNIT_KINDS, type Behaviour, type Rule, type Seed, type UnitKind } from '@sim/index';
import { checkRules, draftFromBehaviour, draftRules, rawBehaviour, type Draft, type DraftError } from '../app/draft.js';
import type { Preset } from '../app/presets.js';
import { parseSeed } from '../app/seed.js';
import { presetPicker } from './preset-picker.js';
import { createRuleEditor } from './rule-editor.js';
import { describeRule, UNIT_TITLES } from './rule-text.js';
import { describeStats } from './stats-text.js';

/**
 * Подготовка — время до матча. Игрок видит Поведение своих типов Юнитов
 * рядом с их характеристиками, Поведение противника и Сид, и начинает
 * матч. Это единственное место, где Поведение меняется (ADR-0002): Правила
 * своих типов правятся здесь, в черновике, а в матч уходит только то,
 * что прошло разбор файла Стороны.
 *
 * Разметка лежит в index.html, здесь — заполнение и кнопки.
 */
export interface Prep {
  /** Открыть Подготовку с этим Сидом. Черновик игрока остаётся прежним. */
  show(seed: Seed, opponent: Behaviour): void;
  /** Заменить черновик игрока целиком. `file` — Поведение из player.json, Заготовка «Из файла». */
  setPlayer(player: Behaviour, file: Behaviour): void;
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

function opponentView(behaviour: Behaviour): HTMLElement[] {
  return [
    block('p', 'prep__note', 'Правила противника — только чтение. В матче их видно и в панели выделенного Юнита.'),
    ...UNIT_KINDS.flatMap((kind) => [block('h3', 'prep__kind', UNIT_TITLES[kind]), ruleList(behaviour[kind])]),
  ];
}

/** Матч начинается с Сидом и Поведением игрока — уже разобранным. */
export function createPrep(onStart: (seed: Seed, player: Behaviour) => void, presets: readonly Preset[]): Prep {
  const panel = element('prep');
  const tabs = element('prep-tabs');
  const body = element('prep-body');
  const warning = element('prep-warning');
  const seedInput = element<HTMLInputElement>('prep-seed');
  const seedError = element('prep-seed-error');
  const start = element<HTMLButtonElement>('prep-start');

  let active: Tab = UNIT_KINDS[0] ?? 'opponent';
  let opponent: Behaviour | null = null;
  let draft: Draft | null = null;
  let file: Behaviour | null = null;
  const errors = new Map<UnitKind, DraftError>();
  /** Редактор открытой вкладки — ему показывают ошибку его типа. */
  let editor: ReturnType<typeof createRuleEditor> | null = null;

  /** Разбор черновика: ошибки по типам, отметка на вкладках и кнопка старта. */
  const check = (): void => {
    errors.clear();
    for (const kind of UNIT_KINDS) {
      const error = draft ? checkRules(draft[kind]) : null;
      if (error) errors.set(kind, error);
    }
    for (const { tab, button } of buttons) {
      button.classList.toggle('prep__tab--error', tab !== 'opponent' && errors.has(tab));
    }
    if (active !== 'opponent') editor?.showError(errors.get(active) ?? null);
    checkSeed();
  };

  const playerView = (kind: UnitKind, rules: Draft): HTMLElement[] => {
    editor = createRuleEditor(rules[kind], (next) => {
      draft = draft && { ...draft, [kind]: next };
      check();
    });
    const picker = presetPicker(presets, file?.[kind] ?? [], `Правила типа «${UNIT_TITLES[kind]}»`, (chosen) => {
      draft = draft && { ...draft, [kind]: draftRules(chosen) };
      render();
    });
    return [statsCard(kind), picker, editor.element];
  };

  const render = (): void => {
    if (!opponent || !draft) return;
    for (const { tab, button } of buttons) button.classList.toggle('prep__tab--active', tab === active);
    editor = null;
    body.replaceChildren(...(active === 'opponent' ? opponentView(opponent) : playerView(active, draft)));
    check();
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

  /** Негодный Сид или ошибка в Правилах не дают начать матч — и сказано почему. */
  function checkSeed(): Seed | null {
    const seed = parseSeed(seedInput.value);
    seedError.hidden = seed !== null;
    start.disabled = seed === null || errors.size > 0;
    return seed;
  }

  /** Последний рубеж — тот же разбор, что у файла Стороны. */
  const begin = (): void => {
    const seed = checkSeed();
    if (seed === null || !draft || errors.size > 0) return;
    onStart(seed, parseBehaviour(rawBehaviour(draft)));
  };

  seedInput.addEventListener('input', checkSeed);
  seedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') begin();
  });
  start.addEventListener('click', begin);

  return {
    show(seed, shownOpponent): void {
      opponent = shownOpponent;
      seedInput.value = String(seed);
      panel.hidden = false;
      render();
      if (!start.disabled) start.focus();
    },

    setPlayer(player, fromFile): void {
      file = fromFile;
      draft = draftFromBehaviour(player);
      render();
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
