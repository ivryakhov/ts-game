import { UNIT_KINDS, UNIT_STATS, type UnitKind } from './balance.js';
import type { Purse } from './ether.js';
import { filePart, isRecord } from './parse.js';
import type { GameMap, SideId, UnscheduledRelease } from './types.js';

/**
 * Волны — экономика Стороны, записанная в её файле рядом с Правилами
 * (ADR-0003). Сторона копит Эфир на очередную Волну целиком, выпускает
 * её, как только хватает, и идёт по списку по кругу.
 *
 * Здесь нет решения, которого не видно в файле. Волны не смотрят на поле
 * и не знают Эфира соперника: Сторона сверяется только со своим кошельком.
 * Поэтому у противника нет ни скрытого знания, ни скрытых денег.
 */

export interface Wave {
  /** По какой Дороге выходит Волна. */
  readonly road: string;
  /** Кто выходит, в порядке выхода: первый встаёт в голову Колонны. */
  readonly units: readonly UnitKind[];
}

/** Список Волн Стороны и то, докуда она по нему дошла. */
export interface WaveCycle {
  readonly side: SideId;
  readonly waves: readonly Wave[];
  /** Номер Волны, на которую Сторона копит сейчас. */
  next: number;
}

/** Порог накопления: пока Эфира меньше, Волна ждёт. */
function priceOf(wave: Wave): number {
  return wave.units.reduce((sum, kind) => sum + UNIT_STATS[kind].cost, 0);
}

/**
 * Выпуски Волн, на которые Сторонам хватает Эфира сейчас. Волна
 * выходит целиком и сразу: проверка цены и оплата происходят в одном Тике,
 * и вклиниться между ними нечему, поэтому Волну не разорвать пополам.
 * Колонной Юниты выстраиваются сами, выходя из ворот в заданном порядке.
 *
 * Вызывается после Выпусков по клику этого Тика: кошелёк уже знает о них,
 * и Волна на то, что потрачено, не рассчитывает.
 *
 * Эфир здесь не списывается: каждый Выпуск оплачивается тем же путём,
 * что и Выпуск по клику.
 */
export function callWaves(
  cycles: readonly WaveCycle[],
  purses: ReadonlyMap<SideId, Purse>,
): UnscheduledRelease[] {
  const releases: UnscheduledRelease[] = [];

  for (const cycle of cycles) {
    const wave = cycle.waves[cycle.next];
    const purse = purses.get(cycle.side);
    if (!wave || !purse || purse.amount < priceOf(wave)) continue;

    for (const unit of wave.units) {
      releases.push({ side: cycle.side, kind: 'deploy', roadId: wave.road, unit });
    }
    cycle.next = (cycle.next + 1) % cycle.waves.length;
  }

  return releases;
}

const { fail, onlyKeys } = filePart('Волны');

function parseWave(raw: unknown, where: string, map: GameMap): Wave {
  if (!isRecord(raw)) throw fail(where, 'ожидалась Волна-объект с «road» и «units»');
  onlyKeys(raw, ['road', 'units'], where);

  const road = raw['road'];
  const roads = map.roads.map((candidate) => candidate.id);
  if (typeof road !== 'string') {
    throw fail(`${where}.road`, `ожидалось название Дороги строкой; есть: ${roads.join(', ')}`);
  }
  if (!roads.includes(road)) {
    throw fail(`${where}.road`, `Дороги «${road}» нет на карте; есть: ${roads.join(', ')}`);
  }

  const units = raw['units'];
  if (!Array.isArray(units) || units.length === 0) {
    throw fail(`${where}.units`, 'ожидался непустой список типов Юнитов');
  }

  return {
    road,
    units: units.map((unit: unknown, index) => {
      if (typeof unit !== 'string' || !(UNIT_KINDS as readonly string[]).includes(unit)) {
        throw fail(
          `${where}.units[${index}]`,
          `неизвестный тип «${String(unit)}»; есть: ${UNIT_KINDS.join(', ')}`,
        );
      }
      return unit as UnitKind;
    }),
  };
}

/**
 * Разбирает список Волн из того, что прочитано из JSON. Дороги сверяются
 * с картой сразу: опечатка в названии Дороги иначе всплыла бы только
 * тогда, когда до этой Волны дойдёт очередь, — посреди матча.
 */
export function parseWaves(raw: unknown, map: GameMap): readonly Wave[] {
  if (!Array.isArray(raw)) throw fail('waves', 'ожидался список Волн');
  if (raw.length === 0) throw fail('waves', 'список Волн пуст — Стороне нечего выпускать');
  return raw.map((wave: unknown, index) => parseWave(wave, `waves[${index}]`, map));
}
