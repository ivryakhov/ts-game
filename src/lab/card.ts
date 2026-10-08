import type { Bout } from '../evolve/exam.js';
import { birthSummary, genesText, mutationText, shortName } from './birth-text.js';
import { factsOf, lineage, parentsOf, type Facts, type Level, type Ref } from './lineage.js';
import type { Snapshot } from './snapshots.js';
import { examTable, rulesOf, score, scoreOfEntry, type Entry } from './view.js';

/**
 * Карточка Претендента (спека 0005) — `<dialog>` поверх Лаборатории:
 * матчи Экзамена, Рождение словами, Родословная со ссылками на предков,
 * Волны и Правила, кнопки Выведенного Противника. Ссылка на предка
 * открывает его карточку на месте этой; «← назад» возвращает.
 */

export interface CardSource {
  readonly generations: () => readonly Snapshot[];
  /** Полная копия лучшего Поколения из истории — она не выцветает. */
  readonly champion: (generation: number) => Entry | null;
  readonly examiners: () => readonly { readonly id: string; readonly name: string }[];
  readonly readyNames: () => readonly string[];
  /** Есть ли Родословная — после перезагрузки её нет. */
  readonly hasLineage: () => boolean;
  /**
   * Кнопки Выведенного Противника для полного, сдавшего Экзамен Претендента.
   * `warn` — сказать об ошибке сохранения внутри карточки: страница за
   * модальным окном не видна и недоступна.
   */
  readonly actions: (entry: Entry, generation: number, onChange: () => void, warn: (message: string) => void) => HTMLElement;
}

export interface Card {
  open(ref: Ref): void;
  /** Перерисовать открытую карточку, если её Претендент изменился (идёт его Экзамен). */
  refresh(): void;
}

/** Глубже скольких Поколений Родословная сворачивается. */
const SHOWN_LEVELS = 10;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

function button(text: string, onClick: () => void, className = 'button lab__back'): HTMLButtonElement {
  const made = make('button', className, text);
  made.type = 'button';
  made.addEventListener('click', onClick);
  return made;
}

const played = (entry: Entry): Bout[] => entry.bouts.filter((bout): bout is Bout => bout !== null);

export function createCard(dialog: HTMLDialogElement, source: CardSource): Card {
  const stack: Ref[] = [];
  let key = '';
  let opened = false;
  let version = 0;

  /** Ссылка на Претендента — открыть его карточку поверх этой. */
  const link = (ref: Ref, text = shortName(ref.generation, ref.number - 1)): HTMLButtonElement =>
    button(text, () => {
      stack.push(ref);
      draw();
    }, 'lab__link-button');

  const resolve = (ref: Ref): Facts => factsOf(source.generations(), source.champion(ref.generation), ref);

  function birthSection(birth: Facts['birth'], ref: Ref): HTMLElement[] {
    const head = make('h3', 'prep__kind', 'Рождение');
    if (!birth) return [head, make('p', 'lab__note', 'Рождение не сохраняется между перезагрузками страницы.')];
    const out: HTMLElement[] = [head, make('p', '', birthSummary(birth, ref.generation, source.readyNames()))];
    const parents = parentsOf(birth);
    if (parents.length > 0) {
      const line = make('p', '', birth.kind === 'elite' ? 'Копия: ' : 'Родители: ');
      parents.forEach((parent, index) => line.append(index > 0 ? ' × ' : '', link({ generation: ref.generation - 1, number: parent + 1 })));
      out.push(line);
    }
    if (birth.kind === 'child') {
      out.push(make('p', 'lab__note', genesText(birth, ref.generation, source.readyNames())));
      const list = make('ol', 'prep__rules');
      list.append(...birth.mutations.map((mutation) => make('li', 'prep__rule', mutationText(mutation))));
      out.push(make('p', '', 'Мутации — поверх Генов родителей, по порядку:'), list);
    }
    return out;
  }

  function lineageSection(ref: Ref): HTMLElement[] {
    const head = make('h3', 'prep__kind', 'Родословная');
    if (!source.hasLineage()) return [head, make('p', 'lab__note', 'Родословная не сохраняется между перезагрузками страницы.')];
    const levels = lineage(source.generations(), ref);
    if (levels.length === 0) return [head, make('p', 'lab__note', 'Предков в прогоне нет: это первое Поколение.')];
    const rows = (shown: readonly Level[]): HTMLElement[] =>
      shown.map((level) => {
        const line = make('p', 'lab__lineage', `Поколение ${level.generation}: `);
        level.members.forEach((member, index) => {
          if (index > 0) line.append(', ');
          line.append(link(member.ref), ` ${score(member.score)}${member.entry ? '' : ' (выцвел)'}`);
        });
        return line;
      });
    const out = [head, ...rows(levels.slice(0, SHOWN_LEVELS))];
    if (levels.length > SHOWN_LEVELS) {
      const more = button(`ещё ${levels.length - SHOWN_LEVELS} Поколений`, () => more.replaceWith(...rows(levels.slice(SHOWN_LEVELS))));
      out.push(more);
    }
    return out;
  }

  function actionsSection(entry: Entry | null, ref: Ref): HTMLElement[] {
    const examined = source.examiners().length;
    if (!entry) return [make('p', 'lab__note', 'Правила этого Претендента уже не хранятся: ни сохранить его, ни посмотреть его матчи нельзя.')];
    if (!entry.side || played(entry).length !== examined) {
      return [make('p', 'lab__note', 'Сохранить можно после Экзамена: вычистка Правил опирается на все его матчи.')];
    }
    const problem = make('p', 'lab__problem');
    problem.setAttribute('role', 'alert');
    problem.hidden = true;
    const actions = source.actions(
      entry,
      ref.generation,
      () => {
        version += 1;
        draw();
      },
      (message) => {
        problem.textContent = message;
        problem.hidden = false;
      },
    );
    return [actions, problem];
  }

  function draw(): void {
    const ref = stack[stack.length - 1];
    if (!ref) return;
    const facts = resolve(ref);
    const { member, entry } = facts;
    key = `${ref.generation}:${ref.number}:${entry ? played(entry).length : -1}:${version}:${stack.length}`;
    const nav = make('div', 'lab__card-nav');
    if (stack.length > 1) nav.append(button('← назад', () => {
      stack.pop();
      draw();
    }));
    nav.append(button('Закрыть', () => dialog.close(), 'button lab__back lab__card-close'));
    const examined = source.examiners().length;
    const { wins } = facts;
    const unexamined = facts.played === 0;
    const summary = make(
      'p',
      'lab__summary',
      unexamined
        ? 'Экзамена ещё не было: Поколение собрано, но не сдано.'
        : [
            member || entry ? `Оценка ${score(entry ? scoreOfEntry(entry) : (member?.score ?? Number.NaN))}` : null,
            wins === null ? null : `выигрывает ${wins} из ${examined}`,
          ]
            .filter(Boolean)
            .join(' · '),
    );
    dialog.replaceChildren(
      nav,
      make('h2', 'lab__subtitle', `Претендент ${shortName(ref.generation, ref.number - 1)}`),
      summary,
      ...(entry ? [examTable(entry, source.examiners())] : []),
      ...birthSection(facts.birth, ref),
      ...lineageSection(ref),
      ...(entry ? rulesOf(entry) : []),
      ...actionsSection(entry, ref),
    );
  }

  // Клик мимо карточки — по самому <dialog> за пределами содержимого.
  dialog.addEventListener('click', (event) => {
    const box = dialog.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (event.target === dialog && !inside) dialog.close();
  });
  dialog.addEventListener('close', () => {
    opened = false;
    stack.length = 0;
  });

  return {
    open(ref) {
      stack.length = 0;
      stack.push(ref);
      draw();
      if (!opened) dialog.showModal();
      opened = true;
    },

    refresh() {
      const ref = stack[stack.length - 1];
      if (!opened || !ref) return;
      const { entry } = resolve(ref);
      if (`${ref.generation}:${ref.number}:${entry ? played(entry).length : -1}:${version}:${stack.length}` !== key) draw();
    },
  };
}
