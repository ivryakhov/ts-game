import { DEFAULT_BEHAVIOUR } from '@sim/index';
import type { SideId, SideReview, SideSetup } from '@sim/index';
import { describeReview, KIND_COLUMNS, LOSS_COLUMNS, type ReviewRow } from './review-text.js';

/**
 * Разбор матча на его итоге: по типам Юнитов, по Правилам и по потерям,
 * с переключателем «я / противник». Проиграв, игрок видит, какое Правило
 * подвело, и правит его, а не наугад.
 */
export interface MatchReview {
  fill(reviews: readonly SideReview[], sides: readonly SideSetup[]): void;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`В разметке нет элемента #${id}`);
  return found;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  made.textContent = text;
  return made;
}

function table(caption: string, columns: readonly string[], rows: readonly ReviewRow[]): HTMLElement {
  const box = make('div', 'review__scroll');
  const grid = make('table', 'review__table');
  grid.append(make('caption', 'review__caption', caption));
  const head = grid.createTHead().insertRow();
  for (const title of ['', ...columns]) head.append(make('th', 'review__head', title));
  const body = grid.createTBody();
  for (const row of rows) {
    const line = body.insertRow();
    line.append(make('th', 'review__kind', row.title));
    for (const cell of row.cells) line.append(make('td', 'review__cell', cell));
  }
  box.append(grid);
  return box;
}

export function createMatchReview(playerSide: SideId): MatchReview {
  const body = element('review-body');
  const mine = element('review-mine');
  const theirs = element('review-theirs');
  let shown: { reviews: readonly SideReview[]; sides: readonly SideSetup[] } | null = null;
  let ours = true;

  const render = (): void => {
    body.replaceChildren();
    mine.classList.toggle('review__tab--active', ours);
    theirs.classList.toggle('review__tab--active', !ours);
    if (!shown) return;
    const review = shown.reviews.find((entry) => (entry.side === playerSide) === ours);
    const setup = shown.sides.find((entry) => (entry.id === playerSide) === ours);
    if (!review) return;
    const text = describeReview(review, setup?.behaviour ?? DEFAULT_BEHAVIOUR);

    if (text.kinds.length === 0) {
      body.append(make('p', 'review__note', 'Ни одного Юнита не выпущено.'));
      return;
    }
    body.append(table('Урон по типам', KIND_COLUMNS, text.kinds));
    for (const kind of text.rules) {
      body.append(make('div', 'review__caption', `Правила: ${kind.title}`));
      const list = make('ol', 'review__rules');
      for (const rule of kind.rules) {
        const item = make('li', rule.idle ? 'review__rule review__rule--idle' : 'review__rule', rule.text);
        item.append(make('span', 'review__use', ` — ${rule.use}`));
        list.append(item);
      }
      body.append(list);
    }
    if (text.losses.length > 0) body.append(table('Потери: кто убил', LOSS_COLUMNS, text.losses));
  };

  const pick = (side: boolean) => (): void => {
    ours = side;
    render();
  };
  mine.addEventListener('click', pick(true));
  theirs.addEventListener('click', pick(false));

  return {
    fill(reviews, sides): void {
      shown = { reviews, sides };
      ours = true;
      render();
    },
  };
}
