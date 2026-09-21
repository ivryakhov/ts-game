import { SKIRMISH } from './balance.js';
import type { UnitId, UnitState } from './types.js';
import { statsOf, type Unit } from './unit.js';

/**
 * Стычка — столкновение Юнитов разных Сторон на одной Дороге.
 *
 * Ничего не хранится между Тиками: расстановка разбирается заново каждый
 * Тик, и из неё выводится, кто дерётся, кто ждёт очереди, а кто идёт.
 * Так не может возникнуть Юнита, который помнит, что дерётся, когда
 * драться уже не с кем, — именно такой застрявший Юнит похоронил
 * январскую попытку.
 *
 * Функция ничего не меняет: она возвращает решение, а применяет его мир.
 * Разбор Стычки должен быть проверяем сам по себе, без прогона матча.
 */

/** Сколько урона получил Юнит за Тик и кто ударил последним. */
export interface Incoming {
  damage: number;
  lastAttacker: UnitId;
}

/** Что делать с Юнитами на Дороге в этот Тик. */
export interface SkirmishPlan {
  readonly states: ReadonlyMap<UnitId, UnitState>;
  readonly damage: ReadonlyMap<UnitId, Incoming>;
}

/** Положение Юнита вдоль Дороги, считая от её начала. */
export function positionOn(unit: Unit, roadLength: number): number {
  return unit.forward ? unit.travelled : roadLength - unit.travelled;
}

/**
 * Юниты одной Стороны на одной Дороге, выстроенные от переднего края
 * назад. При равном положении вперёд ставится тот, кто вышел раньше:
 * его номер меньше, а номера раздаются по порядку появления.
 */
interface Column {
  readonly ordered: readonly Unit[];
  readonly frontier: number;
}

export function planSkirmish(units: readonly Unit[], roadLength: number): SkirmishPlan {
  const states = new Map<UnitId, UnitState>(units.map((unit) => [unit.id, 'moving']));
  const damage = new Map<UnitId, Incoming>();

  const forward = columnOf(units, roadLength, true);
  const backward = columnOf(units, roadLength, false);
  if (!forward || !backward) return { states, damage };

  const gap = backward.frontier - forward.frontier;
  const reach = Math.max(...units.map((unit) => statsOf(unit).range));
  if (gap > reach) return { states, damage };

  const frontOf = (column: Column): readonly Unit[] => column.ordered.slice(0, SKIRMISH.limit);

  strike(reaching(forward, gap, roadLength), frontOf(backward), states, damage);
  strike(reaching(backward, gap, roadLength), frontOf(forward), states, damage);

  queueUp(forward.ordered, roadLength, states);
  queueUp(backward.ordered, roadLength, states);

  return { states, damage };
}

/**
 * Кто из Колонны достаёт врага.
 *
 * Ближние ввязываются в свалку, если и до врага, и до переднего края
 * своей Колонны им не дальше собственной дальности удара; больше лимита
 * их всё равно не войдёт. Стычка — это куча мала, а не шеренга, поэтому
 * второй ряд протискивается вперёд.
 *
 * Стрелку протискиваться незачем — он бьёт поверх своих, и ему нужно,
 * чтобы дальности хватило и на разрыв между Колоннами, и на глубину,
 * с которой он стреляет. Места в Стычке он не занимает и в лимит
 * не входит: в этом весь его смысл.
 */
function reaching(column: Column, gap: number, roadLength: number): readonly Unit[] {
  const melee: Unit[] = [];
  const ranged: Unit[] = [];

  for (const unit of column.ordered) {
    const behind = Math.abs(positionOn(unit, roadLength) - column.frontier);
    const range = statsOf(unit).range;

    if (!statsOf(unit).ranged) {
      if (gap <= range && behind <= range && melee.length < SKIRMISH.limit) melee.push(unit);
      continue;
    }

    if (gap + behind <= range) ranged.push(unit);
  }

  return [...melee, ...ranged];
}

/**
 * Осаждающие входят в Колонну наравне со всеми: Юнит, добравшийся до
 * чужой Цитадели, остаётся на Дороге, его можно атаковать, и он сам
 * перекрывает путь защитникам. Без этого осада была бы необратимой,
 * а оборонять свою Цитадель — нечем.
 */
function columnOf(units: readonly Unit[], roadLength: number, forward: boolean): Column | null {
  const own = units.filter((unit) => unit.forward === forward);
  if (own.length === 0) return null;

  const ordered = [...own].sort((left, right) => {
    const gap = positionOn(right, roadLength) - positionOn(left, roadLength);
    if (gap !== 0) return forward ? gap : -gap;
    return left.id - right.id;
  });

  const leader = ordered[0];
  if (!leader) return null;

  return { ordered, frontier: positionOn(leader, roadLength) };
}

/** Каждый боец бьёт своего противника; лишние распределяются по кругу. */
function strike(
  attackers: readonly Unit[],
  defenders: readonly Unit[],
  states: Map<UnitId, UnitState>,
  damage: Map<UnitId, Incoming>,
): void {
  if (defenders.length === 0) return;

  attackers.forEach((attacker, index) => {
    states.set(attacker.id, 'fighting');
    const target = defenders[index % defenders.length];
    if (!target) return;

    const blow = statsOf(attacker).damagePerTick;
    const incoming = damage.get(target.id);
    if (incoming) {
      incoming.damage += blow;
      incoming.lastAttacker = attacker.id;
      return;
    }
    damage.set(target.id, { damage: blow, lastAttacker: attacker.id });
  });
}

/**
 * Те, кто не попал в Стычку, упираются в спины своих и ждут очереди,
 * а не проходят насквозь. Участников Стычки это не касается: пометить
 * дерущегося ожидающим значит показать игроку не то, что происходит.
 */
function queueUp(
  ordered: readonly Unit[],
  roadLength: number,
  states: Map<UnitId, UnitState>,
): void {
  for (let index = 1; index < ordered.length; index += 1) {
    const unit = ordered[index];
    const ahead = ordered[index - 1];
    if (!unit || !ahead) continue;
    if (states.get(unit.id) === 'fighting') continue;
    if (states.get(ahead.id) === 'moving') continue;

    const gap = Math.abs(positionOn(unit, roadLength) - positionOn(ahead, roadLength));
    if (gap <= SKIRMISH.spacing) states.set(unit.id, 'waiting');
  }
}
