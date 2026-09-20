import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Инварианты кодовой базы. Это не тесты поведения — это свойства, которые
 * январская попытка нарушила и на которых умерла: недетерминизм и файлы,
 * в которых невозможно разобраться.
 *
 * Слово «Страж» здесь намеренно не используется: в CONTEXT.md оно занято
 * под Юнита, охраняющего Ресурсную точку.
 */

const MAX_LINES = 300;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('ядро симуляции детерминировано по построению', () => {
  const forbidden = [
    { pattern: /Math\.random/, name: 'Math.random' },
    { pattern: /Date\.now/, name: 'Date.now' },
    { pattern: /performance\.now/, name: 'performance.now' },
    { pattern: /new Date\(/, name: 'new Date()' },
  ];

  it.each(forbidden)('не обращается к $name', ({ pattern, name }) => {
    const offenders = filesUnder('src/sim').filter((file) =>
      pattern.test(readFileSync(file, 'utf-8').replace(/^\s*\*.*$/gm, '')),
    );

    expect(offenders, `${name} в ядре симуляции ломает воспроизводимость`).toEqual([]);
  });

  it('не импортирует ничего из рендера и не трогает браузер', () => {
    const offenders = filesUnder('src/sim').filter((file) => {
      const source = readFileSync(file, 'utf-8');
      return /from '\.\.\/render/.test(source) || /\b(document|window|canvas)\b\./.test(source);
    });

    expect(offenders).toEqual([]);
  });
});

describe('рендер не может изменить мир', () => {
  it('не импортирует изменяемое состояние — только снимок и чистую геометрию', () => {
    const offenders = filesUnder('src/render').filter((file) =>
      /from '.*sim\/world/.test(readFileSync(file, 'utf-8')),
    );

    expect(offenders).toEqual([]);
  });
});

describe('размер модулей', () => {
  it(`ни один файл не длиннее ${MAX_LINES} строк`, () => {
    const oversized = [...filesUnder('src'), ...filesUnder('tests')]
      .map((file) => ({ file, lines: readFileSync(file, 'utf-8').split('\n').length }))
      .filter((entry) => entry.lines > MAX_LINES);

    expect(oversized).toEqual([]);
  });
});
