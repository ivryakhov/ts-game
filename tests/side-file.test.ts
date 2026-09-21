import { describe, it, expect } from 'vitest';
import { runMatch, sideFromFile } from '@sim/index';
import type { Wave } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Файл Стороны пишет человек: Правила по типам Юнитов и, по желанию,
 * список Волн. Опечатка в нём не должна превращаться в противника,
 * который молча стоит, — ошибка называет место.
 *
 * Отвергать обязано уже чтение файла, а не вход матча: игра читает файлы
 * заранее и показывает ошибку игроку. Пропусти чтение опечатку — матч
 * упал бы при создании, и экран остался бы пустым без объяснений.
 */

const ALWAYS_ADVANCE = { when: { kind: 'always' }, do: { kind: 'advance' } };
const rules = { scout: [ALWAYS_ADVANCE], tank: [ALWAYS_ADVANCE], ranger: [ALWAYS_ADVANCE] };

/** Прочитать файл так же, как его читает игра. */
const read = (raw: unknown) => () => sideFromFile('A', raw, arena);

/** Матч, собранный из файла. */
const fromFile = (raw: unknown) => () =>
  runMatch(matchSetup({ map: arena, sides: [sideFromFile('A', raw, arena), { id: 'B' }], maxTicks: 1 }));

const withWaves = (waves: unknown) => read({ ...rules, waves });

describe('файл Стороны', () => {
  it('без Волн — это файл игрока: одни Правила', () => {
    expect(fromFile(rules)).not.toThrow();
  });

  it('с Волнами — файл самостоятельной Стороны: она выпускает их сама', () => {
    const result = fromFile({ ...rules, waves: [{ road: 'north', units: ['scout', 'tank'] }] })();
    const deployed = result.events.flatMap((event) =>
      event.kind === 'unit-deployed' ? [[event.side, event.roadId, event.unit]] : [],
    );

    expect(deployed).toEqual([
      ['A', 'north', 'scout'],
      ['A', 'north', 'tank'],
    ]);
  });

  it('отвергает опечатку в названии раздела, а не принимает её за тип Юнита', () => {
    expect(read({ ...rules, wave: [] })).toThrow(/Файл Стороны, корень: лишний ключ «wave»/);
  });

  it('отвергает не-объект', () => {
    expect(read([rules])).toThrow(/Файл Стороны, корень: ожидался объект/);
  });

  it('проверяет Правила так же, как у игрока', () => {
    expect(read({ ...rules, tank: [] })).toThrow(/Поведение, tank: список Правил пуст/);
  });
});

describe('файл Стороны отвергает негодные Волны и говорит где', () => {
  it('Волны — список', () => {
    expect(withWaves({ road: 'short', units: ['tank'] })).toThrow(/Волны, waves: ожидался список Волн/);
  });

  it('пустой список Волн', () => {
    expect(withWaves([])).toThrow(/Волны, waves: список Волн пуст/);
  });

  it('Волна — объект', () => {
    expect(withWaves(['short'])).toThrow(/Волны, waves\[0\]: ожидалась Волна-объект/);
  });

  it('лишний ключ в Волне', () => {
    expect(withWaves([{ rood: 'short', road: 'short', units: ['tank'] }])).toThrow(
      /Волны, waves\[0\]: лишний ключ «rood»/,
    );
  });

  it('Дорога, которой нет на карте', () => {
    expect(
      withWaves([
        { road: 'short', units: ['tank'] },
        { road: 'tunnel', units: ['tank'] },
      ]),
    ).toThrow(/Волны, waves\[1\]\.road: Дороги «tunnel» нет на карте; есть: short, north, south/);
  });

  it('Дорога не строкой', () => {
    expect(withWaves([{ road: 1, units: ['tank'] }])).toThrow(
      /waves\[0\]\.road: ожидалось название Дороги строкой; есть: short, north, south/,
    );
  });

  it('пустая Волна', () => {
    expect(withWaves([{ road: 'short', units: [] }])).toThrow(
      /Волны, waves\[0\]\.units: ожидался непустой список типов Юнитов/,
    );
  });

  it('состав не списком', () => {
    expect(withWaves([{ road: 'short', units: 'tank' }])).toThrow(/waves\[0\]\.units: ожидался непустой/);
  });

  it('неизвестный тип Юнита', () => {
    expect(withWaves([{ road: 'short', units: ['tank', 'tnak'] }])).toThrow(
      /Волны, waves\[0\]\.units\[1\]: неизвестный тип «tnak»; есть: scout, tank, ranger/,
    );
  });

  it('Волны, заданные в коде, проходят ту же проверку, что и из файла', () => {
    const typo = [{ road: 'tunnel', units: ['tank'] }] as unknown as Wave[];

    expect(() =>
      runMatch(matchSetup({ map: arena, sides: [{ id: 'A', waves: typo }, { id: 'B' }], maxTicks: 1 })),
    ).toThrow(/waves\[0\]\.road: Дороги «tunnel» нет на карте/);
  });
});
