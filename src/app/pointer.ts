import type { Renderer } from '../render/renderer.js';

/**
 * Мышь над полем: подсветка Дороги под курсором и отправка Юнита по клику.
 *
 * Где именно проходит Дорога, знает рендер — он же её и рисует. Иначе ввод
 * и отрисовка разошлись бы, и игрок кликал бы не туда, куда целился.
 */
export interface Pointer {
  /** Дорога под курсором, если он достаточно близко. */
  readonly hovered: string | null;
}

export function bindPointer(
  canvas: HTMLCanvasElement,
  renderer: Renderer,
  onDeploy: (roadId: string) => void,
): Pointer {
  let hovered: string | null = null;

  const locate = (event: MouseEvent): string | null => {
    const bounds = canvas.getBoundingClientRect();
    return renderer.roadAt(event.clientX - bounds.left, event.clientY - bounds.top);
  };

  canvas.addEventListener('mousemove', (event) => {
    hovered = locate(event);
    canvas.style.cursor = hovered ? 'pointer' : 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    hovered = null;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('click', (event) => {
    const roadId = locate(event);
    if (roadId) onDeploy(roadId);
  });

  return {
    get hovered(): string | null {
      return hovered;
    },
  };
}
