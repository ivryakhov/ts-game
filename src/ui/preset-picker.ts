import type { Rule } from '@sim/index';
import { FROM_FILE, type Preset } from '../app/presets.js';

/**
 * Выбор Заготовки на вкладке своего типа. Применение заменяет Правила
 * типа целиком, без слияния, — поэтому только после подтверждения:
 * собранное руками иначе пропало бы от одного клика.
 */
export function presetPicker(
  presets: readonly Preset[],
  /** Список этого типа из player.json — Заготовка «Из файла». */
  fromFile: readonly Rule[],
  /** Чьи Правила заменятся — для вопроса: «Правила Танка». */
  whose: string,
  apply: (rules: readonly Rule[]) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'prep__presets';

  const choices = [...presets, { name: FROM_FILE, rules: fromFile }];
  const box = document.createElement('select');
  box.className = 'editor__select';
  for (const preset of choices) {
    const option = document.createElement('option');
    option.value = preset.name;
    option.textContent = preset.name;
    box.append(option);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button editor__button';
  button.textContent = 'Применить';
  button.addEventListener('click', () => {
    const preset = choices.find((choice) => choice.name === box.value);
    if (!preset) return;
    if (window.confirm(`Заменить ${whose} Заготовкой «${preset.name}»? Нынешние Правила этого типа пропадут.`)) {
      apply(preset.rules);
    }
  });

  const label = document.createElement('span');
  label.className = 'editor__word';
  label.textContent = 'Заготовка';
  row.append(label, box, button);
  return row;
}
