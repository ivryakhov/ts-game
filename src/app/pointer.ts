import type { UnitId } from '@sim/index';
import type { Renderer } from '../render/renderer.js';

/**
 * Мышь над полем: подсветка Дороги под курсором, выпуск Юнита по клику
 * на Дорогу и выделение Юнита по клику на него.
 *
 * Где именно что нарисовано, знает рендер — он же это и рисует. Иначе
 * ввод и отрисовка разошлись бы, и игрок кликал бы не туда, куда целился.
 */
export interface Pointer {
  /** Дорога под курсором, если он достаточно близко. */
  readonly hovered: string | null;
}

export interface PointerHandlers {
  /** Выпустить Юнита по Дороге. */
  onRelease(roadId: string): void;
  /** Выделить Юнита; null — снять выделение. */
  onSelect(unit: UnitId | null): void;
  /** Кто выделен сейчас — чтобы повторный клик снимал выделение. */
  selected(): UnitId | null;
}

export function bindPointer(
  canvas: HTMLCanvasElement,
  renderer: Renderer,
  handlers: PointerHandlers,
): Pointer {
  let hovered: string | null = null;

  const local = (event: MouseEvent): { x: number; y: number } => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  canvas.addEventListener('mousemove', (event) => {
    const { x, y } = local(event);
    const overUnit = renderer.unitAt(x, y) !== null;
    hovered = overUnit ? null : renderer.roadAt(x, y);
    canvas.style.cursor = overUnit || hovered ? 'pointer' : 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    hovered = null;
    canvas.style.cursor = 'default';
  });

  // Юнит важнее Дороги: он стоит на ней, и клик по нему — это вопрос
  // «что он делает», а не просьба выпустить ещё одного.
  canvas.addEventListener('click', (event) => {
    const { x, y } = local(event);
    const unit = renderer.unitAt(x, y);

    if (unit !== null) {
      handlers.onSelect(unit === handlers.selected() ? null : unit);
      return;
    }

    const roadId = renderer.roadAt(x, y);
    if (roadId) handlers.onRelease(roadId);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') handlers.onSelect(null);
  });

  return {
    get hovered(): string | null {
      return hovered;
    },
  };
}
