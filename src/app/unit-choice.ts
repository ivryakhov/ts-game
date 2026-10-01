import { UNIT_KINDS, type UnitKind } from '@sim/index';

/**
 * Выбор типа Юнита цифрами 1-3. Работает только в матче: на Подготовке
 * цифрами набирают Сид.
 *
 * Эти клавиши держались свободными с тикета 04 именно под это: управление
 * временем ушло на минус и равно, чтобы руки не пришлось переучивать.
 */
export function bindUnitChoice(onChoose: (kind: UnitKind) => void, active: () => boolean): void {
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.repeat || !active()) return;

    const slot = Number(event.key);
    if (!Number.isInteger(slot) || slot < 1 || slot > UNIT_KINDS.length) return;

    const kind = UNIT_KINDS[slot - 1];
    if (kind) onChoose(kind);
  });
}
