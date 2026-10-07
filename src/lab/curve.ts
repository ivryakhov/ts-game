/**
 * Кривая Оценки по Поколениям: лучшая и средняя, SVG без библиотек.
 * Ось X — все Поколения прогона, поэтому кривая растёт слева направо.
 * Наведение показывает перекрестие и числа обеих линий, клик (или
 * стрелки с клавиатуры) выбирает Поколение — страница показывает его
 * лучшего. Таблица истории ниже — та же кривая числами.
 *
 * Цвета линий — классы lab__line--best и lab__line--mean в lab.html;
 * подписи — цветом текста, а линии узнаются по коротким штрихам.
 */

export interface Point {
  readonly number: number;
  readonly best: number;
  readonly mean: number;
  readonly wins: number;
}

export interface Curve {
  readonly element: HTMLElement;
  /** Перерисовать, если что-то изменилось. `total` — сколько Поколений в прогоне. */
  update(points: readonly Point[], total: number, examined: number, selected: number | null): void;
}

const SVG = 'http://www.w3.org/2000/svg';
const WIDTH = 720;
const HEIGHT = 240;
const PAD = { left: 60, right: 130, top: 12, bottom: 28 } as const;
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
/** Подписи концов линий ближе этого по вертикали расходятся с выносками. */
const LABEL_GAP = 16;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const made = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) made.setAttribute(name, String(value));
  return made;
}

function html<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

const formatScore = (value: number): string => (Number.isFinite(value) ? Math.round(value).toLocaleString('ru-RU') : '—');

/**
 * Круглые деления оси: шаг 1, 2 или 5 на порядок, 3–6 делений. Крайние
 * деления охватывают данные целиком — точка не вылезет за рамку, — и их
 * всегда хотя бы два разных. Оценки — целые очки, дробной бывает только
 * средняя, поэтому шаг не меньше единицы: узкий дробный диапазон
 * расширяется до ближайших целых, а не схлопывается в одно деление.
 */
export function niceTicks(low: number, high: number): number[] {
  const span = high - low || Math.abs(high) || 1;
  const rough = span / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const nice = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? 10 * power;
  const step = Math.max(1, nice);
  const first = Math.floor(low / step) * step;
  const last = Math.max(Math.ceil(high / step) * step, first + step);
  const ticks: number[] = [];
  for (let index = 0; first + index * step <= last; index += 1) ticks.push(first + index * step);
  return ticks;
}

/** Ключ линии: короткий штрих её цвета. */
function lineKey(series: 'best' | 'mean'): SVGSVGElement {
  const key = svg('svg', { width: 14, height: 8, class: 'lab__key', 'aria-hidden': 'true' });
  key.append(svg('line', { x1: 1, y1: 4, x2: 13, y2: 4, class: `lab__line lab__line--${series}` }));
  return key;
}

export function createCurve(onPick: (generation: number) => void): Curve {
  const element = html('figure', 'lab__curve');
  const legend = html('div', 'lab__legend');
  for (const [series, title] of [
    ['best', 'лучшая Оценка'],
    ['mean', 'средняя Оценка'],
  ] as const) {
    const item = html('span', 'lab__legend-item');
    item.append(lineKey(series), ` ${title}`);
    legend.append(item);
  }
  const frame = html('div', 'lab__curve-frame');
  frame.tabIndex = 0;
  // Для программы чтения с экрана кривая — ползунок по Поколениям: стрелки
  // меняют значение, и оно объявляется вместе с Оценками выбранного.
  frame.setAttribute('role', 'slider');
  frame.setAttribute('aria-label', 'Кривая Оценки по Поколениям');
  const tooltip = html('div', 'lab__tooltip');
  tooltip.hidden = true;
  element.append(legend, frame);

  let shown: { points: readonly Point[]; total: number; examined: number; selected: number | null } | null = null;
  let key = '';
  let hovered: number | null = null;
  let scale: { x(generation: number): number; generationAt(x: number): number } | null = null;

  /** Подсказка и перекрестие у Поколения — или убрать. */
  function hover(generation: number | null): void {
    hovered = generation;
    const crosshair = frame.querySelector('.lab__crosshair');
    const point = shown?.points.find((entry) => entry.number === generation);
    if (!point || !scale || !crosshair || !shown) {
      tooltip.hidden = true;
      crosshair?.setAttribute('visibility', 'hidden');
      return;
    }
    const x = scale.x(point.number);
    crosshair.setAttribute('x1', String(x));
    crosshair.setAttribute('x2', String(x));
    crosshair.setAttribute('visibility', 'visible');
    const row = (series: 'best' | 'mean', value: number, title: string): HTMLElement => {
      const line = html('div', 'lab__tooltip-row');
      line.append(lineKey(series), html('strong', '', formatScore(value)), html('span', 'lab__tooltip-label', title));
      return line;
    };
    tooltip.replaceChildren(
      html('div', 'lab__tooltip-title', `Поколение ${point.number}`),
      row('best', point.best, 'лучшая'),
      row('mean', point.mean, 'средняя'),
      html('div', 'lab__tooltip-label', `лучший выигрывает ${point.wins} из ${shown.examined}`),
      html('div', 'lab__tooltip-hint', 'клик — показать лучшего'),
    );
    tooltip.hidden = false;
    // Подсказка у перекрестия — справа, а не влезает — слева, и всегда
    // в рамке: SVG сжимается вместе с экраном, подсказка — нет, поэтому
    // меряется её настоящая ширина, а не доля от ширины графика.
    const room = frame.clientWidth;
    const width = tooltip.offsetWidth;
    const at = (x / WIDTH) * room;
    const right = at + 12;
    const left = right + width <= room ? right : at - 12 - width;
    tooltip.style.left = `${Math.max(0, Math.min(left, room - width))}px`;
  }

  /** Состояние ползунка: выбранное Поколение, а без выбора — последнее, и их Оценки. */
  function announce(): void {
    if (!shown) return;
    const { points, total, examined, selected } = shown;
    const point = points.find((entry) => entry.number === selected) ?? points[points.length - 1];
    frame.setAttribute('aria-valuemin', '1');
    frame.setAttribute('aria-valuemax', String(Math.max(1, points[points.length - 1]?.number ?? 1)));
    if (!point) {
      frame.removeAttribute('aria-valuenow');
      frame.setAttribute('aria-valuetext', 'Поколений ещё нет');
      return;
    }
    const which = selected === point.number ? 'выбрано' : 'последнее';
    frame.setAttribute('aria-valuenow', String(point.number));
    frame.setAttribute(
      'aria-valuetext',
      `Поколение ${point.number} из ${total}, ${which}: лучшая ${formatScore(point.best)}, средняя ${formatScore(point.mean)}, ` +
        `лучший выигрывает ${point.wins} из ${examined}`,
    );
  }

  function draw(): void {
    if (!shown) return;
    const { points, total, selected } = shown;
    const last = Math.max(2, total);
    const values = points.flatMap((point) => [point.best, point.mean]).filter(Number.isFinite);
    const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
    const low = ticks[0] ?? 0;
    const high = ticks[ticks.length - 1] ?? 1;
    const x = (generation: number): number => PAD.left + ((generation - 1) / (last - 1)) * PLOT_W;
    const y = (value: number): number => PAD.top + (1 - (value - low) / (high - low || 1)) * PLOT_H;
    scale = {
      x,
      generationAt: (px) => Math.min(last, Math.max(1, Math.round(((px - PAD.left) / PLOT_W) * (last - 1) + 1))),
    };

    const chart = svg('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'lab__curve-svg' });
    for (const tick of ticks) {
      chart.append(
        svg('line', { x1: PAD.left, x2: PAD.left + PLOT_W, y1: y(tick), y2: y(tick), class: tick === 0 ? 'lab__zero' : 'lab__grid' }),
        Object.assign(svg('text', { x: PAD.left - 8, y: y(tick) + 4, class: 'lab__axis', 'text-anchor': 'end' }), {
          textContent: formatScore(tick),
        }),
      );
    }
    for (const generation of niceTicks(1, last).filter((tick) => tick >= 1 && tick <= last)) {
      chart.append(
        Object.assign(svg('text', { x: x(generation), y: HEIGHT - 8, class: 'lab__axis', 'text-anchor': 'middle' }), {
          textContent: String(generation),
        }),
      );
    }

    const path = (series: 'best' | 'mean'): string =>
      points
        .filter((point) => Number.isFinite(point[series]))
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.number).toFixed(1)},${y(point[series]).toFixed(1)}`)
        .join(' ');
    chart.append(
      svg('path', { d: path('mean'), class: 'lab__line lab__line--mean', fill: 'none' }),
      svg('path', { d: path('best'), class: 'lab__line lab__line--best', fill: 'none' }),
    );
    // Точки — на лучшей: её Поколение и выбирают.
    for (const point of points) {
      if (!Number.isFinite(point.best)) continue;
      const chosen = point.number === selected;
      chart.append(svg('circle', { cx: x(point.number), cy: y(point.best), r: chosen ? 6 : 4, class: chosen ? 'lab__dot lab__dot--chosen' : 'lab__dot' }));
    }

    // Подписи концов: значение — цветом текста, линию узнают по штриху.
    const end = points[points.length - 1];
    if (end) {
      const labels = (['best', 'mean'] as const)
        .filter((series) => Number.isFinite(end[series]))
        .map((series) => ({ series, at: y(end[series]), text: `${formatScore(end[series])} ${series === 'best' ? 'лучшая' : 'средняя'}` }));
      const [upper, lower] = [...labels].sort((a, b) => a.at - b.at);
      const placed = new Map(labels.map((label) => [label.series, label.at]));
      if (upper && lower && lower.at - upper.at < LABEL_GAP) {
        const middle = (upper.at + lower.at) / 2;
        placed.set(upper.series, middle - LABEL_GAP / 2);
        placed.set(lower.series, middle + LABEL_GAP / 2);
      }
      const from = x(end.number);
      for (const label of labels) {
        const at = placed.get(label.series) ?? label.at;
        chart.append(
          svg('line', { x1: from + 6, y1: label.at, x2: from + 14, y2: at, class: 'lab__leader' }),
          svg('line', { x1: from + 16, y1: at, x2: from + 26, y2: at, class: `lab__line lab__line--${label.series}` }),
          Object.assign(svg('text', { x: from + 30, y: at + 4, class: 'lab__end-label' }), { textContent: label.text }),
        );
      }
    }

    const crosshair = svg('line', { y1: PAD.top, y2: PAD.top + PLOT_H, class: 'lab__crosshair', visibility: 'hidden' });
    const hit = svg('rect', { x: PAD.left - 12, y: 0, width: PLOT_W + 24, height: HEIGHT, class: 'lab__hit' });
    const generationAt = (event: PointerEvent): number => {
      const box = chart.getBoundingClientRect();
      return scale?.generationAt(((event.clientX - box.left) / box.width) * WIDTH) ?? 1;
    };
    hit.addEventListener('pointermove', (event) => hover(generationAt(event)));
    hit.addEventListener('pointerleave', () => hover(null));
    hit.addEventListener('click', (event) => {
      const generation = generationAt(event);
      if (points.some((point) => point.number === generation)) onPick(generation);
    });
    chart.append(crosshair, hit);
    frame.replaceChildren(chart, tooltip);
    announce();
    hover(hovered);
  }

  frame.addEventListener('keydown', (event) => {
    if (!shown || shown.points.length === 0 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const numbers = shown.points.map((point) => point.number);
    const current = shown.selected ?? numbers[numbers.length - 1] ?? 1;
    const step = event.key === 'ArrowLeft' ? -1 : 1;
    const next = Math.min(numbers[numbers.length - 1] ?? 1, Math.max(numbers[0] ?? 1, current + step));
    onPick(next);
    hover(next);
  });
  frame.addEventListener('blur', () => hover(null));

  return {
    element,
    update(points, total, examined, selected) {
      const next = `${points.length}:${total}:${examined}:${selected}:${points[points.length - 1]?.best}`;
      if (next === key) return;
      key = next;
      shown = { points, total, examined, selected };
      element.hidden = points.length === 0;
      draw();
    },
  };
}
