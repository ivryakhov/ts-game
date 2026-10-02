import type { SkirmishPlan } from './skirmish.js';
import type { MatchEvent, UnitId } from './types.js';
import type { Unit } from './unit.js';

/**
 * Применение решения Стычки: урон, смерти, новые состояния.
 *
 * Урон за Тик у каждого свой, но всегда больше нуля, поэтому здоровье
 * участников Стычки вдали от своих Цитаделей строго убывает — и она не
 * может длиться вечно. Лечение действует только у своих стен.
 */
export function applyPlan(
  units: readonly Unit[],
  plan: SkirmishPlan,
  tick: number,
  events: MatchEvent[],
): Set<UnitId> {
  const fallen = new Set<UnitId>();

  for (const unit of units) {
    unit.state = plan.states.get(unit.id) ?? 'moving';
    unit.target = plan.targets.get(unit.id) ?? null;
    unit.chasing = plan.chase.get(unit.id) ?? null;

    const incoming = plan.damage.get(unit.id);
    if (!incoming) continue;

    unit.hp -= incoming.damage;
    if (unit.hp > 0) continue;

    fallen.add(unit.id);
    events.push({
      kind: 'unit-died',
      tick,
      unitId: unit.id,
      side: unit.side,
      roadId: unit.roadId,
      killer: { kind: 'unit', unitId: incoming.lastAttacker },
    });
  }

  return fallen;
}
