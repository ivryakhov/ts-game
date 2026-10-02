import { conditionsOf, isFallback, type Action, type Condition, type Rule, type UnitKind } from '@sim/index';

/**
 * Правила человеческим языком — для панели выделенного Юнита. Слова
 * взяты из глоссария (CONTEXT.md): игрок читает то же, что пишет в файле,
 * только без скобок.
 *
 * Разбор по виду исчерпывающий: новый вид Условия или Действия не даст
 * собрать проект, пока здесь не появится его описание.
 */

export const UNIT_TITLES: Readonly<Record<UnitKind, string>> = {
  scout: 'Разведчик',
  tank: 'Танк',
  ranger: 'Стрелок',
};

/** Кого бить — в винительном падеже, как в «бить Танка». */
const UNIT_ACCUSATIVE: Readonly<Record<UnitKind, string>> = {
  scout: 'Разведчика',
  tank: 'Танка',
  ranger: 'Стрелка',
};

export function describeCondition(condition: Condition): string {
  switch (condition.kind) {
    case 'always':
      return 'иначе';
    case 'hp-below':
      return `здоровье ниже ${condition.percent}%`;
    case 'enemy-in-range':
      return 'враг в радиусе';
    case 'at-home':
      return 'у своей Цитадели';
    case 'allies-nearby':
      return `своих рядом ${condition.compare === 'fewer' ? 'меньше' : 'больше'} ${condition.count}`;
    case 'enemies-in-skirmish':
      return `врагов в Стычке больше ${condition.above}`;
    case 'enemy-ahead':
      return 'враг впереди';
    case 'enemy-citadel-in-range':
      return 'чужая Цитадель в радиусе';
    case 'enemy-at-home':
      return 'враг у своей Цитадели';
    case 'obelisk-in-range':
      return 'чужой Обелиск в радиусе';
  }
}

export function describeAction(action: Action): string {
  switch (action.kind) {
    case 'advance':
      return 'идти вперёд';
    case 'retreat':
      return 'отступать';
    case 'hold':
      return 'стоять';
    case 'attack-nearest':
      return 'бить ближайшего';
    case 'attack-weakest':
      return 'бить слабейшего';
    case 'attack-most-dangerous':
      return 'бить самого опасного';
    case 'attack-kind':
      return `бить ${UNIT_ACCUSATIVE[action.unit]}`;
    case 'siege-obelisk':
      return 'бить Обелиск';
  }
}

export function describeRule(rule: Rule): string {
  const action = describeAction(rule.do);
  if (isFallback(rule)) return `иначе — ${action}`;
  const when = conditionsOf(rule).map(describeCondition).join(' и ');
  return `если ${when} — ${action}`;
}
