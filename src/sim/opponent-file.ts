import { filePart, isRecord } from './parse.js';
import { sideFromFile } from './side-file.js';
import type { GameMap, SideId, SideSetup } from './types.js';

/**
 * Файл противника — файл Стороны с именем и описанием: то, что игрок
 * видит на Подготовке, выбирая, с кем играть. Характер и уровень
 * сложности — только Правила и Волны (ADR-0003): ни бонусного Эфира,
 * ни скрытого знания у противника нет.
 */
export interface OpponentFile {
  readonly name: string;
  /** Одна строка: чем этот противник отличается от других. */
  readonly description: string;
  readonly side: SideSetup;
}

const { fail } = filePart('Файл противника');

function line(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim() === '') throw fail(key, 'ожидалась непустая строка');
  if (value.includes('\n')) throw fail(key, 'ожидалась одна строка, без переносов');
  return value;
}

/** Ошибки Правил и Волн называют место так же, как в файле Стороны. */
export function opponentFromFile(id: SideId, raw: unknown, map: GameMap): OpponentFile {
  if (!isRecord(raw)) throw fail('корень', 'ожидался объект');
  const { name: _name, description: _description, ...side } = raw;
  return { name: line(raw, 'name'), description: line(raw, 'description'), side: sideFromFile(id, side, map) };
}
