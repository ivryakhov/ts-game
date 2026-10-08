import { describe, it, expect } from 'vitest';
import { createRng } from '@sim/index';
import { applyMutation, childrenOf, geneOf, GENES, mutationBetween, type Birth } from '../src/evolve/birth.js';
import { randomCandidate, type Candidate } from '../src/evolve/candidate.js';
import { breed, firstBorn, type Born } from '../src/evolve/generation.js';
import { loadOpponents } from '../src/app/opponents.js';
import { arena } from '../src/maps/arena.js';

/**
 * Рождение Претендента (тикет 32): от кого он, какой Ген от кого
 * и какие мутации — так, чтобы из записи можно было собрать его заново.
 */

const ROADS = arena.roads.map((road) => road.id);
const ready = loadOpponents(arena, 'B').opponents.map((opponent) => ({
  behaviour: opponent.side.behaviour!,
  waves: opponent.side.waves!,
}));

/** Поколение с Оценками по месту — чтобы отбор был, но без матчей. */
const scoredOf = (generation: readonly Born[]) =>
  generation.map(({ candidate }, index) => ({ candidate, score: (index * 37) % 23 }));

/** Собрать ребёнка по записи: Гены от родителей, затем мутации по порядку. */
function rebuild(birth: Extract<Birth, { kind: 'child' }>, parents: readonly Candidate[]): Candidate {
  const parent = (gene: (typeof GENES)[number]) => parents[birth.parents[birth.genes[gene]] ?? -1] as Candidate;
  let child: Candidate = {
    behaviour: { scout: parent('scout').behaviour.scout, tank: parent('tank').behaviour.tank, ranger: parent('ranger').behaviour.ranger },
    waves: parent('waves').waves,
  };
  for (const mutation of birth.mutations) child = applyMutation(child, mutation);
  return child;
}

describe('Рождение в Поколении', () => {
  const rng = createRng(31);
  const first = firstBorn(rng, 16, ROADS);
  const second = breed(rng, scoredOf(first), ROADS);
  const previous = first.map((born) => born.candidate);

  it('ребёнок собирается заново из записи: Гены от записанных родителей и мутации по порядку', () => {
    const children = second.filter((born) => born.birth.kind === 'child');
    expect(children.length).toBeGreaterThan(10);
    for (const { candidate, birth } of children) {
      if (birth.kind !== 'child') continue;
      expect(birth.mutations.length).toBeGreaterThanOrEqual(1);
      expect(birth.mutations.length).toBeLessThanOrEqual(3);
      expect(rebuild(birth, previous)).toEqual(candidate);
    }
  });

  it('есть и мутанты одного родителя, и дети двух', () => {
    const counts = second.flatMap((born) => (born.birth.kind === 'child' ? [born.birth.parents.length] : []));
    expect(new Set(counts)).toEqual(new Set([1, 2]));
  });

  it('элита — копия родителя прошлого Поколения', () => {
    const elite = second.filter((born) => born.birth.kind === 'elite');
    expect(elite).toHaveLength(2);
    for (const { candidate, birth } of elite) {
      if (birth.kind === 'elite') expect(candidate).toBe(previous[birth.parent]);
    }
  });

  it('тот же Сид даёт те же Рождения', () => {
    const again = createRng(31);
    const firstAgain = firstBorn(again, 16, ROADS);
    expect(breed(again, scoredOf(firstAgain), ROADS)).toEqual(second);
  });

  it('детей у Претендента — сколько Рождений на него ссылается', () => {
    const counts = childrenOf(
      second.map((born) => born.birth),
      first.length,
    );
    const expected = previous.map((_, index) =>
      second.filter(({ birth }) =>
        birth.kind === 'elite' ? birth.parent === index : birth.kind === 'child' && birth.parents.includes(index),
      ).length,
    );
    expect(counts).toEqual(expected);
    // Всего ссылок не меньше размера Поколения: каждый новый — от кого-то.
    expect(counts.reduce((sum, count) => sum + count, 0)).toBeGreaterThanOrEqual(second.length);
  });
});

describe('Рождение первого Поколения', () => {
  it('с нуля — случайные', () => {
    expect(firstBorn(createRng(2), 4, ROADS).map((born) => born.birth)).toEqual(Array(4).fill({ kind: 'random' }));
  });

  it('от готовых — сами готовые, затем их мутанты, собираемые из записи', () => {
    const born = firstBorn(createRng(5), ready.length + 6, ROADS, ready);
    expect(born.slice(0, ready.length).map((entry) => entry.birth)).toEqual(ready.map((_, index) => ({ kind: 'ready', ready: index })));
    for (const { candidate, birth } of born.slice(ready.length)) {
      expect(birth.kind === 'child' && birth.fromReady).toBe(true);
      if (birth.kind === 'child') expect(rebuild(birth, ready)).toEqual(candidate);
    }
  });

  it('готовые не считаются детьми прошлого Поколения', () => {
    const born = firstBorn(createRng(5), ready.length + 6, ROADS, ready);
    expect(childrenOf(born.map((entry) => entry.birth), 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('запись одной мутации', () => {
  const base = randomCandidate(createRng(8), ROADS);
  const rules = base.behaviour.ranger;
  const withRanger = (next: Candidate['behaviour']['ranger']): Candidate => ({ ...base, behaviour: { ...base.behaviour, ranger: next } });
  const extra = randomCandidate(createRng(9), ROADS).behaviour.scout[0]!;

  it.each([
    ['вставлено', withRanger([extra, ...rules]), 'inserted'],
    ['удалено', withRanger(rules.slice(1)), 'removed'],
    ['изменено', withRanger([extra, ...rules.slice(1)]), 'changed'],
    ['без изменений', withRanger([...rules]), 'same'],
  ] as const)('%s', (_title, after, change) => {
    const mutation = mutationBetween(base, after);

    expect(mutation.change).toBe(change);
    expect(mutation.gene).toBe('ranger');
    expect(applyMutation(base, mutation)).toEqual(after);
  });

  it('переставлено', () => {
    const waves = base.waves.length >= 2 ? base.waves : [...base.waves, { road: 'north', units: ['tank' as const] }];
    const from = { ...base, waves };
    const after = { ...from, waves: [waves[1]!, waves[0]!, ...waves.slice(2)] };
    const mutation = mutationBetween(from, after);

    expect(mutation).toMatchObject({ gene: 'waves', change: 'swapped', at: 0, other: 1 });
    expect(applyMutation(from, mutation)).toEqual(after);
  });

  it('Гены перечислены все четыре', () => {
    expect(GENES).toEqual(['scout', 'tank', 'ranger', 'waves']);
    expect(geneOf(base, 'waves')).toBe(base.waves);
  });
});
