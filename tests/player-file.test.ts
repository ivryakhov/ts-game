import { describe, it, expect } from 'vitest';
import { behaviourText, parsePlayerText } from '../src/app/player-file.js';
import playerFile from '../src/behaviours/player.json';

/**
 * Файл игрока — то, что выгружает «Скачать», принимает «Загрузить»
 * и что лежит в сохранении браузера: файл Стороны без Волн.
 */
describe('файл игрока', () => {
  const text = JSON.stringify(playerFile);

  it('выгрузка и загрузка того же файла дают то же Поведение', () => {
    const behaviour = parsePlayerText(text);
    expect(JSON.parse(behaviourText(behaviour))).toEqual(playerFile);
    expect(parsePlayerText(behaviourText(behaviour))).toEqual(behaviour);
  });

  it('Волны в файле игрока отвергаются', () => {
    expect(() => parsePlayerText(JSON.stringify({ ...playerFile, waves: [] }))).toThrow(/Файл игрока, waves/);
  });

  it('не JSON отвергается словами, а не падением', () => {
    expect(() => parsePlayerText('{ scout: ')).toThrow(/Файл игрока, корень: это не JSON/);
  });

  it('устаревшее сохранение с «recovering» отвергается с подсказкой и местом', () => {
    const old = {
      ...playerFile,
      scout: [{ when: { kind: 'recovering' }, do: { kind: 'retreat' } }, { when: { kind: 'always' }, do: { kind: 'advance' } }],
    };
    expect(() => parsePlayerText(JSON.stringify(old))).toThrow(/scout\[0\]\.when: Условия recovering больше нет/);
  });
});
