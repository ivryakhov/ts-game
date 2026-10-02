import type { Action, Behaviour, SideId, UnitSnapshot, WorldSnapshot } from '@sim/index';
import { describeAction, describeRule, UNIT_TITLES } from './rule-text.js';

/**
 * Панель выделенного Юнита: его Поведение целиком, в порядке приоритета,
 * с подсвеченным Правилом, которое он исполняет прямо сейчас, и тем,
 * кого он бьёт или к кому идёт.
 *
 * Без неё система Правил неиграбельна: игрок пишет Правила вслепую
 * и не может понять, почему Юнит поступил так, а не иначе (ADR-0002).
 */
export interface Inspector {
  /** Показать выделенного Юнита или скрыть панель, если выделения нет. */
  show(unit: UnitSnapshot | null, world: WorldSnapshot): void;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`В разметке нет элемента #${id}`);
  return found;
}

/**
 * Кого бьёт Юнит или, не доставая никого, к кому идёт. «Бить тип», когда
 * такого типа рядом нет, берёт ближайшего — и это сказано прямо, чтобы
 * игрок не гадал, почему Стрелок, которому велено бить Танков, бьёт
 * Разведчика.
 */
function describeAim(action: Action, aim: UnitSnapshot, striking: boolean): string {
  const whom = `${UNIT_TITLES[aim.kind]} (${Math.ceil(aim.hp)}/${aim.maxHp})`;
  if (action.kind === 'attack-kind' && aim.kind !== action.unit) {
    const fallback = striking ? 'бьёт ближайшего' : 'идёт к ближайшему';
    return `${describeAction(action)} — таких рядом нет, ${fallback}: ${whom}`;
  }
  return striking ? `${describeAction(action)}: ${whom}` : `${describeAction(action)} — идёт к: ${whom}`;
}

export function createInspector(behaviourOf: (side: SideId) => Behaviour): Inspector {
  const panel = element('inspector');
  const title = element('inspector-title');
  const rules = element('inspector-rules');
  const target = element('inspector-target');
  /** Какого Юнита и какое Правило показывали в прошлый раз — не перерисовывать зря. */
  let shown = '';

  return {
    show(unit, world): void {
      panel.hidden = unit === null;
      if (!unit) {
        shown = '';
        return;
      }

      const behaviour = behaviourOf(unit.side)[unit.kind];
      const striking = unit.target !== null;
      const aimId = unit.target ?? unit.chasing;
      const aim = aimId === null ? undefined : world.units.find((other) => other.id === aimId);
      // В ключ входит всё, что попадает в текст, — иначе надпись застывает,
      // когда меняется, скажем, только здоровье цели.
      const key = `${unit.id}:${unit.rule}:${Math.ceil(unit.hp)}:${striking}:${aim?.id ?? '-'}:${Math.ceil(aim?.hp ?? 0)}`;
      if (key === shown) return;
      shown = key;

      title.textContent = `${UNIT_TITLES[unit.kind]} Стороны ${unit.side} · ${Math.ceil(unit.hp)}/${unit.maxHp}`;

      rules.replaceChildren(
        ...behaviour.map((rule, index) => {
          const item = document.createElement('li');
          item.className = 'inspector__rule';
          item.classList.toggle('inspector__rule--active', index === unit.rule);
          item.textContent = `${index + 1}. ${describeRule(rule)}`;
          return item;
        }),
      );

      const active = behaviour[unit.rule];
      // Номер Правила пришёл из того же Поведения, что показано: если его
      // нет, панель разошлась с матчем, и молча это прятать нельзя.
      if (!active) {
        throw new Error(`Панель: у ${unit.kind} нет Правила №${unit.rule + 1} — Поведение разошлось с матчем`);
      }
      target.textContent = aim ? describeAim(active.do, aim, striking) : 'цели нет';
    },
  };
}
