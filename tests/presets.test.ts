import { describe, it, expect } from 'vitest';
import { parseBehaviour, runMatch, UNIT_KINDS } from '@sim/index';
import { FROM_FILE, parsePresets } from '../src/app/presets.js';
import presetsFile from '../src/behaviours/presets.json';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/** Заготовки — данные, и проходят тот же разбор, что Правила одного типа. */
describe('Заготовки', () => {
  const presets = parsePresets(presetsFile);

  it('в файле ровно «Напролом», «Осторожный» и «Защитник»', () => {
    expect(presets.map((preset) => preset.name)).toEqual(['Напролом', 'Осторожный', 'Защитник']);
  });

  it.each(presets.map((preset) => [preset.name, preset.rules] as const))(
    '«%s» годится как Правила любого типа',
    (_name, rules) => {
      const raw = Object.fromEntries(UNIT_KINDS.map((kind) => [kind, rules]));
      const behaviour = parseBehaviour(raw);
      expect(() =>
        runMatch(matchSetup({ map: arena, sides: [{ id: 'A', behaviour }, { id: 'B', behaviour }], maxTicks: 1 })),
      ).not.toThrow();
    },
  );

  it('ошибка называет Заготовку и место', () => {
    expect(() => parsePresets({ Рывок: [{ when: { kind: 'hp-below', percent: 120 }, do: { kind: 'retreat' } }] })).toThrow(
      /Поведение, Рывок\[0\]\.when\.percent/,
    );
  });

  it('«Из файла» в файле не пишется', () => {
    expect(() => parsePresets({ [FROM_FILE]: [] })).toThrow(/Заготовки, Из файла/);
  });
});
