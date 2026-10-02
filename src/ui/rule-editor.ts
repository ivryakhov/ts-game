import { ACTION_KINDS, CONDITION_KINDS, UNIT_KINDS, type Condition, type UnitKind } from '@sim/index';
import {
  addCondition,
  addRule,
  canAddCondition,
  canMove,
  freshAction,
  freshCondition,
  moveRule,
  removeCondition,
  removeRule,
  setAction,
  setCondition,
  type DraftCondition,
  type DraftError,
  type DraftRules,
} from '../app/draft.js';
import { describeAction, UNIT_GENITIVE_PLURAL, UNIT_TITLES } from './rule-text.js';

/**
 * Редактор Правил одного типа: строки «если [Условие ▾][N] и … —
 * [Действие ▾]». Строка собирается из выпадающих списков, так что
 * синтаксической ошибки не сделать; неверным может быть только число,
 * и о нём говорит разбор — его текст встаёт прямо у поля.
 *
 * Правка списков и кнопок перерисовывает редактор; правка числа — нет,
 * чтобы поле не теряло фокус посреди набора.
 */
export interface RuleEditor {
  readonly element: HTMLElement;
  showError(error: DraftError | null): void;
}

type ConditionKind = Condition['kind'];
type Selectable = Exclude<ConditionKind, 'always'>;

/** Пункт списка Условий. У «своих рядом» их два: меньше и больше. */
interface ConditionOption {
  readonly value: string;
  readonly label: string;
  readonly make: () => DraftCondition;
}

const CONDITION_LABELS: Readonly<Record<Selectable, readonly (readonly [string, string])[]>> = {
  'hp-below': [['hp-below', 'здоровье ниже']],
  'enemy-in-range': [['enemy-in-range', 'враг в радиусе']],
  'enemy-kind-in-range': [['enemy-kind-in-range', 'вижу врага типа']],
  'at-home': [['at-home', 'у своей Цитадели']],
  'allies-nearby': [
    ['allies-nearby:fewer', 'своих рядом меньше'],
    ['allies-nearby:more', 'своих рядом больше'],
  ],
  'enemies-in-skirmish': [['enemies-in-skirmish', 'врагов в Стычке больше']],
  'enemy-ahead': [['enemy-ahead', 'враг впереди']],
  'enemy-citadel-in-range': [['enemy-citadel-in-range', 'чужая Цитадель в радиусе']],
  'enemy-at-home': [['enemy-at-home', 'враг у своей Цитадели']],
  'obelisk-in-range': [['obelisk-in-range', 'чужой Обелиск в радиусе']],
};

const SELECTABLE = CONDITION_KINDS.filter((kind): kind is Selectable => kind !== 'always');

const CONDITION_OPTIONS: readonly ConditionOption[] = SELECTABLE.flatMap((kind) =>
  CONDITION_LABELS[kind].map(([value, label]) => ({
    value,
    label,
    make: () => freshCondition(kind, value.endsWith(':more') ? 'more' : 'fewer'),
  })),
);

/**
 * «Всегда» не выбирается в списке: безусловное Правило — это «иначе».
 * Но файл Стороны допускает его и выше последней строки, и такое Правило,
 * загруженное из файла, показывается как есть, а не пустым полем.
 */
const ALWAYS_OPTION: ConditionOption = { value: 'always', label: 'всегда', make: () => ({ kind: 'always' }) };

const optionValue = (condition: DraftCondition): string =>
  condition.kind === 'allies-nearby' ? `allies-nearby:${String(condition['compare'])}` : condition.kind;

/** Какое поле Условия — число и чем оно подписано после поля. */
const NUMBER_FIELD: Partial<Record<ConditionKind, readonly [string, string]>> = {
  'hp-below': ['percent', '%'],
  'allies-nearby': ['count', ''],
  'enemies-in-skirmish': ['above', ''],
};

/**
 * Выбор типа у Условия: у «вижу врага типа» он обязателен, у «своих рядом»
 * — нет, и пустой пункт значит своих любого типа.
 */
const UNIT_FIELD: Partial<Record<ConditionKind, readonly (readonly [string, string])[]>> = {
  'enemy-kind-in-range': UNIT_KINDS.map((kind) => [kind, UNIT_TITLES[kind]] as const),
  'allies-nearby': [['', 'любых'], ...UNIT_KINDS.map((kind) => [kind, UNIT_GENITIVE_PLURAL[kind]] as const)],
};

/** Условие с выбранным типом; пустой выбор убирает тип совсем. */
function withUnit(condition: DraftCondition, unit: string): DraftCondition {
  const { unit: _unit, ...rest } = condition;
  return unit === '' ? (rest as DraftCondition) : { ...rest, unit };
}

const actionLabel = (kind: (typeof ACTION_KINDS)[number]): string =>
  kind === 'attack-kind' ? 'бить тип' : describeAction(freshAction(kind));

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

function select(options: readonly (readonly [string, string])[], value: string, pick: (value: string) => void): HTMLSelectElement {
  const box = make('select', 'editor__select');
  for (const [optionValue, label] of options) {
    const option = make('option', '', label);
    option.value = optionValue;
    box.append(option);
  }
  box.value = value;
  box.addEventListener('change', () => pick(box.value));
  return box;
}

function button(text: string, title: string, act: () => void, enabled = true): HTMLButtonElement {
  const made = make('button', 'button editor__button', text);
  made.type = 'button';
  made.title = title;
  made.disabled = !enabled;
  made.addEventListener('click', act);
  return made;
}

/** Текст поля как значение черновика: пустое остаётся пустым, иначе — число. */
const fieldValue = (text: string): unknown => (text.trim() === '' ? '' : Number(text));

export function createRuleEditor(
  initial: DraftRules,
  /** Зовётся после каждой правки, в том числе после каждой цифры. */
  change: (next: DraftRules) => void,
): RuleEditor {
  let rules = initial;
  const errors = new Map<string, HTMLElement>();
  const element = make('div', 'editor');

  /** `redraw` — менялись списки или строки, а не только число. */
  const commit = (next: DraftRules, redraw = true): void => {
    rules = next;
    if (redraw) draw();
    change(next);
  };

  const errorSlot = (key: string): HTMLElement => {
    const slot = make('span', 'editor__error');
    slot.hidden = true;
    errors.set(key, slot);
    return slot;
  };

  const conditionGroup = (index: number, at: number, condition: DraftCondition, count: number): HTMLElement => {
    const group = make('span', 'editor__condition');
    const choices = condition.kind === 'always' ? [...CONDITION_OPTIONS, ALWAYS_OPTION] : CONDITION_OPTIONS;
    const options = choices.map((option) => [option.value, option.label] as const);
    group.append(
      select(options, optionValue(condition), (value) => {
        const option = choices.find((candidate) => candidate.value === value);
        if (option) commit(setCondition(rules, index, at, option.make()));
      }),
    );

    const field = NUMBER_FIELD[condition.kind];
    if (field) {
      const [key, suffix] = field;
      const input = make('input', 'editor__number');
      input.type = 'number';
      input.min = '0';
      input.value = String(condition[key] ?? '');
      input.addEventListener('input', () => {
        const current = rules[index]?.when[at];
        if (current) commit(setCondition(rules, index, at, { ...current, [key]: fieldValue(input.value) }), false);
      });
      group.append(input);
      if (suffix) group.append(suffix);
    }

    const units = UNIT_FIELD[condition.kind];
    if (units) {
      group.append(
        select(units, String(condition['unit'] ?? ''), (unit) => {
          // Число могли поправить после отрисовки — берём Условие из черновика.
          const current = rules[index]?.when[at];
          if (current) commit(setCondition(rules, index, at, withUnit(current, unit)));
        }),
      );
    }

    if (count > 1) group.append(button('✕', 'убрать Условие', () => commit(removeCondition(rules, index, at))));
    group.append(errorSlot(`${index}:${at}`));
    return group;
  };

  const actionGroup = (index: number): HTMLElement => {
    const rule = rules[index];
    const group = make('span', 'editor__action');
    if (!rule) return group;
    const action = rule.do;
    group.append(
      select(
        ACTION_KINDS.map((kind) => [kind, actionLabel(kind)] as const),
        action.kind,
        (kind) => commit(setAction(rules, index, freshAction(kind as (typeof ACTION_KINDS)[number]))),
      ),
    );
    if (action.kind === 'attack-kind') {
      group.append(
        select(
          UNIT_KINDS.map((kind) => [kind, UNIT_TITLES[kind]] as const),
          action.unit,
          (unit) => commit(setAction(rules, index, { kind: 'attack-kind', unit: unit as UnitKind })),
        ),
      );
    }
    group.append(errorSlot(`${index}:do`));
    return group;
  };

  const row = (index: number): HTMLElement => {
    const rule = rules[index];
    const line = make('li', 'editor__rule');
    if (!rule) return line;
    const last = index === rules.length - 1;

    if (last) {
      line.append(make('span', 'editor__word', 'иначе —'), actionGroup(index));
      return line;
    }

    line.append(make('span', 'editor__word', 'если'));
    rule.when.forEach((condition, at) => {
      if (at > 0) line.append(make('span', 'editor__word', 'и'));
      line.append(conditionGroup(index, at, condition, rule.when.length));
    });
    if (canAddCondition(rule)) {
      line.append(button('+ и', 'добавить Условие', () => commit(addCondition(rules, index, SELECTABLE))));
    }
    line.append(
      make('span', 'editor__word', '—'),
      actionGroup(index),
      make('span', 'editor__controls'),
    );
    line.lastElementChild?.append(
      button('↑', 'выше', () => commit(moveRule(rules, index, -1)), canMove(rules, index, -1)),
      button('↓', 'ниже', () => commit(moveRule(rules, index, 1)), canMove(rules, index, 1)),
      button('✕', 'удалить Правило', () => commit(removeRule(rules, index))),
    );
    return line;
  };

  function draw(): void {
    errors.clear();
    const list = make('ol', 'editor__rules');
    list.append(...rules.map((_, index) => row(index)));
    element.replaceChildren(list, button('+ Правило', 'добавить Правило над «иначе»', () => commit(addRule(rules))));
  }

  draw();

  return {
    element,
    showError(error): void {
      for (const slot of errors.values()) slot.hidden = true;
      if (!error) return;
      const key = `${error.rule}:${error.condition ?? 'do'}`;
      const slot = errors.get(key) ?? errors.get(`${error.rule}:0`);
      if (!slot) return;
      const field = slot.parentElement?.querySelector('input');
      slot.textContent = field && field.value.trim() === '' ? 'введите число' : error.what;
      slot.hidden = false;
    },
  };
}
