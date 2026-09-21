import { MELEE_RANGE, SKIRMISH } from './balance.js';
import type { UnitId, UnitState } from './types.js';
import { isAttack } from './rules.js';
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
  /** Кого бьёт каждый атакующий — для показа игроку. */
  readonly targets: ReadonlyMap<UnitId, UnitId>;
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
  const targets = new Map<UnitId, UnitId>();
  const plan = { states, damage, targets };

  const forward = columnOf(units, roadLength, true);
  const backward = columnOf(units, roadLength, false);
  if (!forward || !backward) return plan;

  const gap = backward.frontier - forward.frontier;
  const reach = Math.max(...units.map((unit) => statsOf(unit).range));
  if (gap > reach) return plan;

  strike(reaching(forward, gap, roadLength), forward.frontier, backward, roadLength, plan);
  strike(reaching(backward, gap, roadLength), backward.frontier, forward, roadLength, plan);

  // Сошлись вплотную — сквозь врага не пройти, даже тому, кто драться
  // не собирается. Он встаёт и ждёт, а не проходит насквозь.
  if (gap <= MELEE_RANGE) {
    for (const column of [forward, backward]) {
      const leader = column.ordered[0];
      if (leader && leader.intent.kind !== 'retreat' && states.get(leader.id) === 'moving') {
        states.set(leader.id, 'waiting');
      }
    }
  }

  queueUp(forward.ordered, roadLength, states);
  queueUp(backward.ordered, roadLength, states);

  return plan;
}

/**
 * Дотягивается ли Юнит до врага — сам или в свалке своей Колонны.
 *
 * Это и есть смысл Условия «враг в радиусе атаки». Оно обязано совпадать
 * с тем, что Стычка считает «дотянулся»: иначе второй ряд свалки, стоящий
 * чуть позади переднего края, видел бы врага вне радиуса, его Правило
 * велело бы идти, и лимит Стычки оставался бы мёртвой буквой.
 */
function reaches(unit: Unit, column: Column, gap: number, roadLength: number): boolean {
  const behind = Math.abs(positionOn(unit, roadLength) - column.frontier);
  const range = statsOf(unit).range;
  return statsOf(unit).ranged ? gap + behind <= range : gap <= range && behind <= range;
}

/** Все Юниты Дороги, до которых враг в досягаемости, — для Условий Правил. */
export function inReach(units: readonly Unit[], roadLength: number): Set<UnitId> {
  const result = new Set<UnitId>();
  const forward = columnOf(units, roadLength, true);
  const backward = columnOf(units, roadLength, false);
  if (!forward || !backward) return result;

  const gap = backward.frontier - forward.frontier;
  for (const column of [forward, backward]) {
    for (const unit of column.ordered) {
      if (reaches(unit, column, gap, roadLength)) result.add(unit.id);
    }
  }
  return result;
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
    // Драться хочет не каждый: Правило могло велеть идти, стоять или бежать.
    if (!isAttack(unit.intent)) continue;
    if (!reaches(unit, column, gap, roadLength)) continue;

    if (!statsOf(unit).ranged) {
      if (melee.length < SKIRMISH.limit) melee.push(unit);
      continue;
    }
    ranged.push(unit);
  }

  return [...melee, ...ranged];
}

/**
 * Осаждающие входят в Колонну наравне со всеми: Юнит, добравшийся до
 * чужой Цитадели, остаётся на Дороге, его можно атаковать, и он сам
 * перекрывает путь защитникам. Без этого осада была бы необратимой,
 * а оборонять свою Цитадель — нечем.
 */
/**
 * Отступающий входит в Колонну наравне со всеми: он остаётся на Дороге,
 * и враг, дотянувшись, бьёт его в спину. Не бить и не держаться за своими —
 * это его выбор; неуязвимости он не даёт. Скрытая неуязвимость была бы
 * правилом, которого игрок не видит (ADR-0002).
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

/**
 * Кого атакующий вообще может достать — по его дальности удара, честно
 * отмеренной от того места, откуда он бьёт.
 *
 * Ближний бьёт из свалки: он протискивается к переднему краю своей Колонны,
 * поэтому расстояние меряется оттуда. Стрелок бьёт со своего места, поверх
 * своих, — от него самого. Мерить от вражеского фронта нельзя: так Стрелок
 * с дальностью 95 доставал бы врага в полутора сотнях единиц, и игрок
 * не понял бы почему (ADR-0002).
 */
function withinReach(
  attacker: Unit,
  ownFrontier: number,
  enemies: Column,
  roadLength: number,
): readonly Unit[] {
  const { range, ranged } = statsOf(attacker);
  const from = ranged ? positionOn(attacker, roadLength) : ownFrontier;
  return enemies.ordered.filter(
    (enemy) => Math.abs(positionOn(enemy, roadLength) - from) <= range,
  );
}

/**
 * Цель по Действию атакующего. При равенстве главного признака — ближайший,
 * при равном расстоянии — вышедший раньше: выбор всегда однозначен.
 */
function pickTarget(attacker: Unit, candidates: readonly Unit[], roadLength: number): Unit | undefined {
  const here = positionOn(attacker, roadLength);
  const distance = (unit: Unit) => Math.abs(positionOn(unit, roadLength) - here);
  const nearestFirst = (left: Unit, right: Unit) => distance(left) - distance(right) || left.id - right.id;

  const intent = attacker.intent;
  switch (intent.kind) {
    case 'attack-weakest':
      return [...candidates].sort((left, right) => left.hp - right.hp || nearestFirst(left, right))[0];
    case 'attack-most-dangerous':
      return [...candidates].sort(
        (left, right) =>
          statsOf(right).damagePerTick - statsOf(left).damagePerTick || nearestFirst(left, right),
      )[0];
    case 'attack-kind': {
      const ofKind = candidates.filter((unit) => unit.kind === intent.unit);
      return [...(ofKind.length > 0 ? ofKind : candidates)].sort(nearestFirst)[0];
    }
    default:
      return [...candidates].sort(nearestFirst)[0];
  }
}

/** Каждый боец бьёт цель, выбранную его Действием. */
function strike(
  attackers: readonly Unit[],
  ownFrontier: number,
  enemies: Column,
  roadLength: number,
  plan: {
    states: Map<UnitId, UnitState>;
    damage: Map<UnitId, Incoming>;
    targets: Map<UnitId, UnitId>;
  },
): void {
  const { states, damage, targets } = plan;
  for (const attacker of attackers) {
    const candidates = withinReach(attacker, ownFrontier, enemies, roadLength);
    const target = pickTarget(attacker, candidates, roadLength);
    // Некого достать — нечего и бить: Юнит не встаёт в Стычку впустую.
    if (!target) continue;
    states.set(attacker.id, 'fighting');
    targets.set(attacker.id, target.id);

    const blow = statsOf(attacker).damagePerTick;
    const incoming = damage.get(target.id);
    if (incoming) {
      incoming.damage += blow;
      incoming.lastAttacker = attacker.id;
      continue;
    }
    damage.set(target.id, { damage: blow, lastAttacker: attacker.id });
  }
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

    if (unit.intent.kind === 'retreat') continue;

    const gap = Math.abs(positionOn(unit, roadLength) - positionOn(ahead, roadLength));
    if (gap <= SKIRMISH.spacing) states.set(unit.id, 'waiting');
  }
}
