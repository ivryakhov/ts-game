/**
 * Общее для разбора файла Стороны. И Правила, и Волны пишет человек,
 * поэтому ошибка в любой части обязана называть место: `tank[0].when`,
 * `waves[2].road`.
 */

export class FileError extends Error {
  constructor(part: string, where: string, what: string) {
    super(`${part}, ${where}: ${what}`);
    this.name = 'FileError';
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Разбор одной части файла: все её ошибки начинаются с её названия. */
export interface FilePart {
  fail(where: string, what: string): FileError;
  /**
   * Лишний ключ — почти всегда опечатка: «percnt» вместо «percent». Молча
   * его пропустить значит оставить игрока гадать, почему файл не работает.
   */
  onlyKeys(raw: Record<string, unknown>, allowed: readonly string[], where: string): void;
}

export function filePart(part: string): FilePart {
  const fail = (where: string, what: string): FileError => new FileError(part, where, what);
  return {
    fail,
    onlyKeys(raw, allowed, where): void {
      for (const key of Object.keys(raw)) {
        if (!allowed.includes(key)) {
          throw fail(where, `лишний ключ «${key}»; допустимы: ${allowed.join(', ')}`);
        }
      }
    },
  };
}
