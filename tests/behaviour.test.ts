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
        { when: [{ kind: 'at-home' }, { kind: 'hp-below', percent: 100 }], do: { kind: 'retreat' } },
        ALWAYS_ADVANCE,
      ],
    };

    expect(withBehaviour(everything)).not.toThrow();
  });

  it('«враг у своей Цитадели» — без параметров', () => {
    const home = { when: { kind: 'enemy-at-home' }, do: { kind: 'retreat' } };
    expect(withBehaviour({ ...valid, tank: [home, ALWAYS_ADVANCE] })).not.toThrow();

    const extra = { when: { kind: 'enemy-at-home', range: 200 }, do: { kind: 'retreat' } };
    expect(withBehaviour({ ...valid, tank: [extra, ALWAYS_ADVANCE] })).toThrow(/tank\[0\]\.when/);
  });
});

describe('матч принимает полный словарь', () => {
  it('все Условия тикета 10', () => {
    const conditions = [
      { kind: 'allies-nearby', compare: 'fewer', count: 2 },
      { kind: 'allies-nearby', compare: 'more', count: 3 },
      { kind: 'enemies-in-skirmish', above: 2 },
      { kind: 'enemy-ahead' },
      { kind: 'enemy-citadel-in-range' },
    ];
    const rules = [
      ...conditions.map((when) => ({ when, do: { kind: 'advance' } })),
      ALWAYS_ADVANCE,
    ];
    expect(withBehaviour({ ...valid, scout: rules })).not.toThrow();
  });

  it('все Действия тикета 10', () => {
    const actions = [
      { kind: 'attack-weakest' },
      { kind: 'attack-most-dangerous' },
      { kind: 'attack-kind', unit: 'tank' },
      { kind: 'hold' },
    ];
    const rules = [
      ...actions.map((act) => ({ when: { kind: 'enemy-in-range' }, do: act })),
      ALWAYS_ADVANCE,
    ];
    expect(withBehaviour({ ...valid, tank: rules })).not.toThrow();
  });
});

describe('«И» в Правиле: от двух до трёх Условий (ADR-0005)', () => {
  const FIGHTING = { kind: 'enemy-in-range' };
  const WOUNDED = { kind: 'hp-below', percent: 50 };
  const OUTNUMBERED = { kind: 'enemies-in-skirmish', above: 2 };
  const RETREAT = { kind: 'retreat' };
  const withWhen = (when: unknown) => ({ ...valid, scout: [{ when, do: RETREAT }, ALWAYS_ADVANCE] });

  it('принимает два и три Условия', () => {
    expect(withBehaviour(withWhen([WOUNDED, OUTNUMBERED]))).not.toThrow();
    expect(withBehaviour(withWhen([FIGHTING, WOUNDED, OUTNUMBERED]))).not.toThrow();
  });

  it('отвергает массив из одного Условия — одно пишется без массива', () => {
    expect(withBehaviour(withWhen([WOUNDED]))).toThrow(/scout\[0\]\.when:.*без массива/);
  });

  it('отвергает четыре Условия — их не прочесть одной строкой', () => {
    expect(withBehaviour(withWhen([FIGHTING, WOUNDED, OUTNUMBERED, FIGHTING]))).toThrow(/scout\[0\]\.when:/);
  });

  it('отвергает «always» внутри «И»', () => {
    expect(withBehaviour(withWhen([WOUNDED, { kind: 'always' }]))).toThrow(/scout\[0\]\.when\[1\].*always/);
  });

  it('называет номер ошибочного Условия', () => {
    const broken = [WOUNDED, { kind: 'allies-nearby', compare: 'fewer', count: -1 }];
    expect(withBehaviour(withWhen(broken))).toThrow(/scout\[0\]\.when\[1\]\.count/);
  });

  it('последнее Правило — ровно «always», а не «И»', () => {
    const open = { ...valid, tank: [{ when: [WOUNDED, OUTNUMBERED], do: RETREAT }] };
    expect(withBehaviour(open)).toThrow(/tank\[0\]\.when.*always/);
  });
});

describe('матч отвергает негодное Поведение и говорит где', () => {
  it('сравнение союзников — только «fewer» или «more»', () => {
    const broken = {
      ...valid,
      scout: [{ when: { kind: 'allies-nearby', compare: 'about', count: 2 }, do: { kind: 'hold' } }, ALWAYS_ADVANCE],
    };
    expect(withBehaviour(broken)).toThrow(/scout\[0\]\.when\.compare/);
  });

  it('число союзников — целое неотрицательное', () => {
    const broken = {
      ...valid,
      scout: [{ when: { kind: 'allies-nearby', compare: 'fewer', count: 1.5 }, do: { kind: 'hold' } }, ALWAYS_ADVANCE],
    };
    expect(withBehaviour(broken)).toThrow(/scout\[0\]\.when\.count/);
  });

  it('порог врагов в Стычке — целое неотрицательное', () => {
    const broken = {
      ...valid,
      tank: [{ when: { kind: 'enemies-in-skirmish', above: -1 }, do: { kind: 'retreat' } }, ALWAYS_ADVANCE],
    };
    expect(withBehaviour(broken)).toThrow(/tank\[0\]\.when\.above/);
  });

  it('атаковать можно только существующий тип Юнита', () => {
    const broken = {
      ...valid,
      ranger: [{ when: { kind: 'always' }, do: { kind: 'attack-kind', unit: 'wizard' } }, ALWAYS_ADVANCE],
    };
    expect(withBehaviour(broken)).toThrow(/ranger\[0\]\.do\.unit.*wizard/);
  });

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

  it('«долечиваюсь» больше нет — и сказано, как его переписать (ADR-0005)', () => {
    const old = {
      ...valid,
      ranger: [{ when: { kind: 'recovering', until: 100 }, do: { kind: 'retreat' } }, ALWAYS_ADVANCE],
    };
    expect(withBehaviour(old)).toThrow(/ranger\[0\]\.when.*recovering.*at-home.*hp-below/);
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
