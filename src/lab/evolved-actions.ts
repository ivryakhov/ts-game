import { totalOf, type Bout } from '../evolve/exam.js';
import { prune } from '../evolve/prune.js';
import { offerDownload } from '../ui/behaviour-files.js';
import { evolvedText, findEvolved, saveEvolved } from '../ui/evolved.js';
import type { Entry } from './view.js';

/**
 * Кнопки под Претендентом: сохранить его Выведенным Противником, затем
 * смотреть его Показательный матч в игре и скачать файлом (спека 0004).
 * Сохранён ли он, решает содержимое: Претендент, вычищенный по своему
 * Экзамену, сравнивается с полкой Выведенных. Элита того же объекта
 * в другом Поколении вычищается по другому Экзамену — и это другой
 * Противник, а тот же — узнаётся и после перезагрузки.
 */

export interface Origin {
  /** Поколение Претендента и Сид прогона — для описания Выведенного. */
  readonly generation: number;
  readonly seed: number;
}

function button(text: string, onClick: () => void, main = false): HTMLButtonElement {
  const made = document.createElement('button');
  made.type = 'button';
  made.className = main ? 'button button--main' : 'button';
  made.textContent = text;
  made.addEventListener('click', onClick);
  return made;
}

/** Описание Выведенного: откуда он и сколько выигрывает. */
export function evolvedDescription(origin: Origin, bouts: readonly (Bout | null)[]): string {
  const played = bouts.filter((bout): bout is Bout => bout !== null);
  return `Поколение ${origin.generation} из Сида ${origin.seed}: выигрывает ${totalOf(played).wins} из ${bouts.length}`;
}

/**
 * Кнопки для Претендента. `opponents` — с кем смотреть матч; `onChange` —
 * перерисовать страницу после сохранения.
 */
export function evolvedActions(
  entry: Entry,
  origin: Origin,
  opponents: readonly { id: string; name: string }[],
  warn: (message: string) => void,
  onChange: () => void,
): HTMLElement {
  const box = document.createElement('div');
  box.className = 'lab__actions';
  const pruned = prune(entry.candidate, entry.bouts);
  const done = findEvolved(pruned);
  if (!done) {
    const save = button(
      'Сохранить как Противника',
      () => {
        save.disabled = true;
        void saveEvolved(pruned, evolvedDescription(origin, entry.bouts)).then((result) => {
          if ('problem' in result) {
            warn(`Противник не сохранён: ${result.problem}.`);
            save.disabled = false;
            return;
          }
          onChange();
        });
      },
      true,
    );
    box.append(save);
    return box;
  }

  const note = document.createElement('span');
  note.className = 'lab__saved';
  note.textContent = `Сохранён как «${done.name}» — он есть на Подготовке.`;
  const against = document.createElement('select');
  against.className = 'lab__input lab__select';
  against.setAttribute('aria-label', 'Противник для Показательного матча');
  for (const opponent of opponents) {
    const option = document.createElement('option');
    option.value = opponent.id;
    option.textContent = opponent.name;
    against.append(option);
  }
  const watch = button('Смотреть матч против', () => {
    const address = new URLSearchParams({ ally: done.id, opponent: against.value });
    window.open(`./index.html?${address.toString()}`, '_blank');
  });
  const download = button('Скачать', () => {
    const file = evolvedText(done.id);
    if (file) offerDownload(`${done.id}.json`, file);
  });
  box.append(note, watch, against, download);
  return box;
}
