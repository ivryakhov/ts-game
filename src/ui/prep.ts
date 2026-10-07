import { DEFAULT_BEHAVIOUR, parseBehaviour, UNIT_KINDS, type Behaviour, type Seed, type UnitKind } from '@sim/index';
import { checkRules, draftFromBehaviour, draftRules, rawBehaviour, type Draft, type DraftError } from '../app/draft.js';
import type { Opponent } from '../app/opponents.js';
import type { Preset } from '../app/presets.js';
import { parseSeed } from '../app/seed.js';
import { bindBehaviourFiles, offerDownload } from './behaviour-files.js';
import { presetPicker } from './preset-picker.js';
import { createRuleEditor } from './rule-editor.js';
import { opponentView } from './opponent-view.js';
import { UNIT_TITLES } from './rule-text.js';
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
  /**
   * Открыть Подготовку с этим Сидом. Черновик игрока остаётся прежним.
   * `canRepeat` — есть ли прошлый матч, который можно повторить.
   */
  show(seed: Seed, lineup: { ally: string | null; opponent: string | null }, canRepeat: boolean): void;
  /** Заменить черновик игрока целиком. `file` — Поведение из player.json, Заготовка «Из файла». */
  setPlayer(player: Behaviour, file: Behaviour): void;
  hide(): void;
  /**
   * Показать ошибку, которую игрок должен исправить сам. Ошибки копятся.
   * `keep` — текст, который игрок может скачать: отвергнутое не теряется молча.
   */
  warn(message: string, keep?: { label: string; name: string; text: string }): void;
}

/** Вкладка «За меня» есть только в Показательном матче — Правила того, кто играет за игрока. */
type Tab = UnitKind | 'ally' | 'opponent';

const TABS: readonly Tab[] = [...UNIT_KINDS, 'ally', 'opponent'];
const TAB_TITLES: Readonly<Record<Tab, string>> = { ...UNIT_TITLES, ally: 'За меня', opponent: 'Противник' };

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

function statsCard(kind: UnitKind): HTMLDListElement {
  const card = block('dl', 'prep__card');
  for (const line of describeStats(kind)) {
    card.append(block('dt', 'prep__stat-label', line.label), block('dd', 'prep__stat-value', line.value));
  }
  return card;
}

export interface PrepOptions {
  /**
   * Матч начинается с Сидом и Поведением игрока — уже разобранным.
   * В Показательном матче Правила игрока не нужны, и с ошибкой в них
   * приходит null.
   */
  onStart(seed: Seed, player: Behaviour | null): void;
  /** Повтор прошлого матча — его Сид и Выпуски, но Правила с этого экрана. */
  onRepeat(player: Behaviour): void;
  /** Игрок поправил Правила, и черновик без ошибок. */
  onEdit(player: Behaviour): void;
  /** Игрок выбрал другого противника. */
  onOpponent(id: string): void;
  /** Игрок выбрал, кто играет за него: Противник — Показательный матч, null — он сам. */
  onAlly(id: string | null): void;
  readonly presets: readonly Preset[];
  readonly opponents: readonly Opponent[];
}

const optionsOf = (opponents: readonly Opponent[]): HTMLOptionElement[] =>
  opponents.map((entry) => {
    const option = block('option', '', entry.name);
    option.value = entry.id;
    option.title = entry.description;
    return option;
  });

export function createPrep({ onStart, onRepeat, onEdit, onOpponent, onAlly, presets, opponents }: PrepOptions): Prep {
  const panel = element('prep');
  const tabs = element('prep-tabs');
  const body = element('prep-body');
  const warning = element('prep-warning');
  const seedInput = element<HTMLInputElement>('prep-seed');
  const seedError = element('prep-seed-error');
  const start = element<HTMLButtonElement>('prep-start');
  const repeat = element<HTMLButtonElement>('prep-repeat');
  const picker = element<HTMLSelectElement>('prep-opponent');
  picker.append(...optionsOf(opponents));
  picker.disabled = opponents.length === 0;
  const allyPicker = element<HTMLSelectElement>('prep-ally');
  const me = block('option', '', 'я');
  me.value = '';
  allyPicker.append(me, ...optionsOf(opponents));
  let canRepeat = false;

  let active: Tab = UNIT_KINDS[0] ?? 'opponent';
  let opponent: Opponent | null = null;
  let ally: Opponent | null = null;
  let shown = false;
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
      button.classList.toggle('prep__tab--error', tab !== 'opponent' && tab !== 'ally' && errors.has(tab));
    }
    if (active !== 'opponent' && active !== 'ally') editor?.showError(errors.get(active) ?? null);
    checkSeed();
  };

  /** Поведение с экрана — то, что прошло разбор файла, или null при ошибке. */
  const current = (): Behaviour | null => (draft && errors.size === 0 ? parseBehaviour(rawBehaviour(draft)) : null);

  /** После правки игрока: проверить и, если ошибок нет, сохранить. */
  const edited = (redraw: boolean): void => {
    if (redraw) render();
    else check();
    const behaviour = current();
    if (behaviour) onEdit(behaviour);
  };

  const playerView = (kind: UnitKind, rules: Draft): HTMLElement[] => {
    editor = createRuleEditor(rules[kind], (next) => {
      draft = draft && { ...draft, [kind]: next };
      edited(false);
    });
    const picker = presetPicker(presets, file?.[kind] ?? [], `Правила типа «${UNIT_TITLES[kind]}»`, (chosen) => {
      draft = draft && { ...draft, [kind]: draftRules(chosen) };
      edited(true);
    });
    return [statsCard(kind), picker, editor.element];
  };

  const render = (): void => {
    if (!shown || !draft) return;
    if (active === 'ally' && !ally) active = UNIT_KINDS[0] ?? 'opponent';
    for (const { tab, button } of buttons) {
      button.classList.toggle('prep__tab--active', tab === active);
      if (tab === 'ally') button.hidden = !ally;
    }
    editor = null;
    body.replaceChildren(
      ...(active === 'opponent'
        ? opponentView(opponent, DEFAULT_BEHAVIOUR)
        : active === 'ally'
          ? opponentView(ally, DEFAULT_BEHAVIOUR)
          : playerView(active, draft)),
    );
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

  /**
   * Негодный Сид или ошибка в Правилах не дают начать матч — и сказано
   * почему. Показательному матчу Правила игрока не нужны.
   */
  function checkSeed(): Seed | null {
    const seed = parseSeed(seedInput.value);
    seedError.hidden = seed !== null;
    start.disabled = seed === null || (errors.size > 0 && !ally);
    repeat.disabled = !canRepeat || errors.size > 0;
    repeat.hidden = !canRepeat;
    return seed;
  }

  /** Последний рубеж — тот же разбор, что у файла Стороны. */
  const begin = (): void => {
    const seed = checkSeed();
    const behaviour = current();
    if (seed !== null && (behaviour || ally)) onStart(seed, behaviour);
  };

  bindBehaviourFiles({
    current,
    load(behaviour): void {
      draft = draftFromBehaviour(behaviour);
      edited(true);
    },
  });

  picker.addEventListener('change', () => {
    opponent = opponents.find((entry) => entry.id === picker.value) ?? null;
    if (opponent) onOpponent(opponent.id);
    render();
  });

  allyPicker.addEventListener('change', () => {
    ally = opponents.find((entry) => entry.id === allyPicker.value) ?? null;
    if (ally) active = 'ally';
    onAlly(ally?.id ?? null);
    render();
  });

  seedInput.addEventListener('input', checkSeed);
  seedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') begin();
  });
  start.addEventListener('click', begin);
  repeat.addEventListener('click', () => {
    const behaviour = current();
    if (canRepeat && behaviour) onRepeat(behaviour);
  });

  return {
    show(seed, lineup, repeatable): void {
      shown = true;
      opponent = opponents.find((entry) => entry.id === lineup.opponent) ?? null;
      if (opponent) picker.value = opponent.id;
      ally = opponents.find((entry) => entry.id === lineup.ally) ?? null;
      allyPicker.value = ally?.id ?? '';
      canRepeat = repeatable;
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

    warn(message, keep): void {
      const line = block('div', 'prep__warning-line', message);
      if (keep) {
        const button = block('button', 'button prep__warning-action', keep.label);
        button.type = 'button';
        button.addEventListener('click', () => offerDownload(keep.name, keep.text));
        line.append(' ', button);
      }
      warning.append(line);
      warning.hidden = false;
    },
  };
}
