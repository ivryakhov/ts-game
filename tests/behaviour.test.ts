import { describe, it, expect } from 'vitest';
import { runMatch } from '@sim/index';
import type { Behaviour } from '@sim/index';
import { arena } from '../src/maps/arena.js';
import { matchSetup } from './match-setup.js';

/**
 * Поведение пишет игрок, и опечатка в нём не должна превращаться
 * в Юнитов, стоящих столбом. Матч отвергает негодное Поведение на входе
 * — как карту и расписание — и говорит, где именно ошибка.
 *
 * Поведение здесь намеренно передаётся «как прочитано из файла», мимо
 * проверки типов: именно такой ввод и приходит от человека.
 */
const withBehaviour = (raw: unknown) => () =>
  runMatch(
    matchSetup({
      map: arena,
      sides: [{ id: 'A', behaviour: raw as Behaviour }, { id: 'B' }],
      maxTicks: 1,
    }),
  );

const ALWAYS_ADVANCE = { when: { kind: 'always' }, do: { kind: 'advance' } };
const valid = { scout: [ALWAYS_ADVANCE], tank: [ALWAYS_ADVANCE], ranger: [ALWAYS_ADVANCE] };

describe('матч принимает корректное Поведение', () => {
  it('минимальное', () => {
    expect(withBehaviour(valid)).not.toThrow();
  });

  it('со всеми Условиями и Действиями словаря', () => {
    const everything = {
      ...valid,
      scout: [
        { when: { kind: 'hp-below', percent: 30 }, do: { kind: 'retreat' } },
        { when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } },
        { when: { kind: 'recovering', until: 100 }, do: { kind: 'retreat' } },
        ALWAYS_ADVANCE,
      ],
    };

    expect(withBehaviour(everything)).not.toThrow();
  });
});

describe('матч отвергает негодное Поведение и говорит где', () => {
  it('неизвестное Условие', () => {
    const broken = { ...valid, tank: [{ when: { kind: 'sometimes' }, do: { kind: 'advance' } }] };
    expect(withBehaviour(broken)).toThrow(/tank\[0\]\.when.*sometimes/);
  });

  it('неизвестное Действие', () => {
    const broken = {
      ...valid,
      ranger: [{ when: { kind: 'hp-below', percent: 10 }, do: { kind: 'dance' } }, ALWAYS_ADVANCE],
    };
    expect(withBehaviour(broken)).toThrow(/ranger\[0\]\.do.*dance/);
  });

  it('долю здоровья вне отрезка от 0 до 100', () => {
    const broken = {
      ...valid,
      scout: [{ when: { kind: 'hp-below', percent: 140 }, do: { kind: 'retreat' } }, ALWAYS_ADVANCE],
    };
    expect(withBehaviour(broken)).toThrow(/scout\[0\]\.when\.percent/);
  });

  it('порог «долечиваюсь» вне отрезка от 0 до 100', () => {
    const broken = {
      ...valid,
      ranger: [{ when: { kind: 'recovering', until: 150 }, do: { kind: 'retreat' } }, ALWAYS_ADVANCE],
    };
    expect(withBehaviour(broken)).toThrow(/ranger\[0\]\.when\.until/);
  });

  it('«долечиваюсь» без порога — иначе Правило молча не работало бы', () => {
    const broken = {
      ...valid,
      scout: [{ when: { kind: 'recovering' }, do: { kind: 'retreat' } }, ALWAYS_ADVANCE],
    };
    expect(withBehaviour(broken)).toThrow(/scout\[0\]\.when\.until/);
  });

  it('лишний ключ — почти всегда опечатка', () => {
    const typo = {
      ...valid,
      scout: [{ when: { kind: 'hp-below', percnt: 30 }, do: { kind: 'retreat' } }, ALWAYS_ADVANCE],
    };
    expect(withBehaviour(typo)).toThrow(/scout\[0\]\.when.*percnt/);
  });

  it('лишний ключ в самом Правиле', () => {
    const typo = { ...valid, tank: [{ ...ALWAYS_ADVANCE, priority: 1 }] };
    expect(withBehaviour(typo)).toThrow(/tank\[0\].*priority/);
  });

  it('последнее Правило не «always» — неясно, что делать, когда не сработало ни одно', () => {
    const open = {
      ...valid,
      scout: [{ when: { kind: 'enemy-in-range' }, do: { kind: 'attack-nearest' } }],
    };
    expect(withBehaviour(open)).toThrow(/scout\[0\]\.when.*always/);
  });

  it('неизвестный тип Юнита', () => {
    expect(withBehaviour({ ...valid, wizard: [ALWAYS_ADVANCE] })).toThrow(/wizard/);
  });

  it('Поведение без одного из типов', () => {
    const { tank: _tank, ...missing } = valid;
    expect(withBehaviour(missing)).toThrow(/tank/);
  });

  it('пустой список Правил', () => {
    expect(withBehaviour({ ...valid, scout: [] })).toThrow(/scout.*пуст/);
  });
});
