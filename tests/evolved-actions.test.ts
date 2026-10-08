import { describe, expect, it, vi } from 'vitest';
import { loadOpponents, pickOpponent, readOpponents } from '../src/app/opponents.js';
import { candidateFile, type Candidate } from '../src/evolve/candidate.js';
import { evolvedActions } from '../src/lab/evolved-actions.js';
import type { Entry } from '../src/lab/view.js';
import { arena } from '../src/maps/arena.js';
import { EVOLVED_KEY, findEvolved, readEvolved } from '../src/ui/evolved.js';

/**
 * Кнопки Выведенного в Лаборатории (замечание №2 к PR #65): старое
 * сохранение, чей адрес занят файлом Противника, скрыто на Подготовке.
 * Лаборатория не должна считать его сохранённым и открывать по его
 * адресу чужую стратегию — Претендент сохраняется заново, под свободным
 * адресом, а прежняя запись остаётся как была.
 */

/** Ровно то от DOM-элемента, чем пользуются кнопки: дети, текст и клик. */
class Element {
  children: Element[] = [];
  textContent = '';
  value = '';
  click?: () => void;

  append(...children: Element[]): void {
    this.children.push(...children);
  }

  setAttribute(): void {}

  addEventListener(_event: string, callback: () => void): void {
    this.click = callback;
  }
}

describe('Выведенный с адресом, занятым файлом', () => {
  it('старый адрес, занятый файлом, предлагает сохранить заново, и матч использует нового Выведенного', async () => {
    const builtin = loadOpponents(arena, 'B');
    const turtle = builtin.opponents.find((opponent) => opponent.id === 'turtle')!;
    const rush = builtin.opponents.find((opponent) => opponent.id === 'rush-easy')!;
    const candidate: Candidate = { behaviour: turtle.side.behaviour!, waves: turtle.side.waves! };
    const different: Candidate = { behaviour: rush.side.behaviour!, waves: rush.side.waves! };
    const id = 'evolved-1';
    const file = candidateFile(candidate, 'Выведенный №1', 'local');
    let text = JSON.stringify([{ id, file }]);
    const open = vi.fn();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => (key === EVOLVED_KEY ? text : null),
        setItem: (_key: string, value: string) => {
          text = value;
        },
      },
      open,
    });
    // Даже случайно выпавший адрес файла не должен быть занят новым сохранением.
    let draws = 0;
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(draws++ === 0 ? 0 : 1) });
    vi.stubGlobal('document', { createElement: () => new Element() });

    try {
      const taken = [id, 'evolved-00000000'];
      const installed = JSON.stringify(candidateFile(different, 'Installed', 'different'));
      const files = readOpponents(JSON.stringify(taken), Object.fromEntries(taken.map((key) => [key, installed])), arena, 'B');
      const locals = readEvolved(arena, 'B', taken);

      expect(locals.opponents).toHaveLength(0);
      expect(locals.problems[0]).toContain(id);
      expect(findEvolved(candidate, taken)).toBeNull();

      const ruleTicks = Object.fromEntries(Object.entries(candidate.behaviour).map(([kind, rules]) => [kind, rules.map(() => 1)]));
      const entry = { candidate, bouts: [{ ruleTicks, outcome: 'win' }] } as unknown as Entry;
      const changed = vi.fn();
      const render = () =>
        evolvedActions(entry, { generation: 1, seed: 1 }, files.opponents, vi.fn(), changed, taken) as unknown as Element;
      const box = render();

      expect(box.children.map((child) => child.textContent)).toEqual(['Сохранить как Противника']);
      box.children[0]!.click!();
      await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());

      const saved = findEvolved(candidate, taken)!;
      expect(saved.id).toBe('evolved-01010101');
      expect(JSON.parse(text)[0]).toEqual({ id, file });

      const watch = render().children.find((child) => child.textContent === 'Смотреть матч против')!;
      watch.click!();
      expect(open.mock.calls[0]![0]).toContain(`ally=${saved.id}`);

      const selected = pickOpponent([...files.opponents, ...readEvolved(arena, 'B', taken).opponents], saved.id)!;
      expect(selected.side.behaviour).toEqual(candidate.behaviour);
      expect(selected.side.behaviour).not.toEqual(different.behaviour);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
