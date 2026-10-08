import { describe, it, expect } from 'vitest';
import { createRng } from '@sim/index';
import type { Mutation } from '../src/evolve/birth.js';
import { randomCandidate } from '../src/evolve/candidate.js';
import { createEvolution } from '../src/lab/evolution.js';
import { genesText, mutationText } from '../src/lab/birth-text.js';
import { factsOf, lineage, memberOf, parentsOf } from '../src/lab/lineage.js';
import type { BoutRequest, WorkerReply } from '../src/lab/protocol.js';
import { createRunner } from '../src/lab/runner.js';
import { arena } from '../src/maps/arena.js';
import { bout, fakeWorker, finishes, settings } from './lab-fakes.js';

/**
 * Родословная и Рождение словами (тикет 34): предки по Поколениям
 * и то, что карточка пишет о мутациях.
 */

const scoredBy = (request: BoutRequest): WorkerReply => ({ kind: 'bout', job: request.job, bout: bout(request, -request.job) });

/** Оценка по самому Претенденту — чтобы лучшим бывала и не элита. */
const scoredByContent = (request: BoutRequest): WorkerReply => {
  const text = JSON.stringify(request.side);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
  return { kind: 'bout', job: request.job, bout: bout(request, hash % 1000) };
};

async function evolve(budget: number, generations = 8, scorer = scoredBy) {
  const evolution = createEvolution(createRunner(() => fakeWorker(scorer)), arena, () => {}, () => {}, budget);
  expect(await finishes(evolution.start(settings({ size: 6, generations })))).toBe(true);
  return evolution.state;
}

const run = async (budget: number, generations = 8) => (await evolve(budget, generations)).generations;

describe('Родословная', () => {
  it('предки по Поколениям: каждый уровень — ровно родители предыдущего, без повторов, до первого Поколения', async () => {
    const generations = await run(10_000);
    const ref = { generation: 8, number: 4 };
    const levels = lineage(generations, ref);

    expect(levels.map((level) => level.generation)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    let below = [memberOf(generations, ref)!];
    for (const level of levels) {
      const expected = [...new Set(below.flatMap((member) => parentsOf(member.birth)))].sort((a, b) => a - b).map((index) => index + 1);
      expect(level.members.map((member) => member.ref.number)).toEqual(expected);
      below = [...level.members];
    }
  });

  it('у выцветших предков нет Правил, но есть Рождение и Оценка', async () => {
    const generations = await run(12);
    const levels = lineage(generations, { generation: 8, number: 4 });
    const old = levels.filter((level) => level.generation <= 5).flatMap((level) => level.members);

    expect(old.length).toBeGreaterThan(0);
    for (const member of old) {
      expect(member.entry).toBeNull();
      expect(Number.isFinite(member.score)).toBe(true);
    }
    expect(levels.find((level) => level.generation === 7)?.members.every((member) => member.entry !== null)).toBe(true);
  });

  it('у первого Поколения предков нет', async () => {
    const generations = await run(10_000, 2);
    expect(lineage(generations, { generation: 1, number: 2 })).toEqual([]);
    expect(memberOf(generations, { generation: 9, number: 1 })).toBeNull();
  });
});

describe('мутации словами', () => {
  const candidate = randomCandidate(createRng(4), arena.roads.map((road) => road.id));
  const rule = candidate.behaviour.ranger[0]!;
  const other = candidate.behaviour.scout[0]!;
  const wave = candidate.waves[0]!;

  it.each([
    [{ gene: 'ranger', change: 'changed', at: 2, before: rule, after: other }, /^Стрелок, Правило 3: «если .*» → «если .*»$/],
    [{ gene: 'tank', change: 'inserted', at: 0, after: rule }, /^Танк: вставлено Правило 1 — «/],
    [{ gene: 'scout', change: 'removed', at: 4, before: rule }, /^Разведчик: удалено Правило 5 — «/],
    [{ gene: 'ranger', change: 'swapped', at: 0, other: 3 }, /^Стрелок: Правило 1 и правило 4 поменялись местами$/],
    [{ gene: 'waves', change: 'changed', at: 1, before: wave, after: wave }, /^Волны, Волна 2: «.*Дорога.*» → «/],
    [{ gene: 'scout', change: 'same' }, /^Разведчик: мутация ничего не изменила/],
  ] as [Mutation, RegExp][])('%o', (mutation, text) => {
    expect(mutationText(mutation)).toMatch(text);
  });

  it('у выцветшего — только что и где', () => {
    expect(mutationText({ gene: 'ranger', change: 'changed', at: 2 })).toBe('Стрелок: изменено Правило 3');
    expect(mutationText({ gene: 'waves', change: 'removed', at: 0 })).toBe('Волны: удалена Волна 1');
    expect(mutationText({ gene: 'waves', change: 'inserted', at: 2 })).toBe('Волны: вставлена Волна 3');
  });
});

describe('Гены словами', () => {
  const child = (parents: number[], genes: Record<'scout' | 'tank' | 'ranger' | 'waves', number>, fromReady?: true) =>
    ({ kind: 'child', parents, genes, mutations: [], ...(fromReady ? { fromReady } : {}) }) as const;

  it('какой Ген от какого родителя', () => {
    expect(genesText(child([4, 8], { scout: 0, tank: 1, ranger: 1, waves: 0 }), 3)).toBe(
      'Правила Разведчика, Волны — от 2·5; Правила Танка, Правила Стрелка — от 2·9',
    );
  });

  it('у мутанта одного родителя и у скрещённого с собой — все Гены от одного', () => {
    expect(genesText(child([4], { scout: 0, tank: 0, ranger: 0, waves: 0 }), 3)).toBe('Все Гены — от 2·5');
    expect(genesText(child([4, 4], { scout: 0, tank: 1, ranger: 0, waves: 1 }), 3)).toBe('Все Гены — от 2·5');
    expect(genesText(child([1], { scout: 0, tank: 0, ranger: 0, waves: 0 }, true), 1, ['Раш', 'Черепаха'])).toBe('Все Гены — от «Черепаха»');
  });
});

describe('что карточка знает о Претенденте', () => {
  it('у выцветшего — победы и сыгранные матчи из сохранённого, без полного Претендента', async () => {
    const { generations, history } = await evolve(12);
    const old = generations.find((snapshot) => snapshot.number === 3)!;
    const champion = history[2]!.champion!;
    const other = old.faded!.find((entry) => entry.number !== champion.number)!;

    const facts = factsOf(generations, champion, { generation: 3, number: other.number });
    expect(facts.entry).toBeNull();
    expect(facts.wins).toBe(other.wins);
    expect(facts.played).toBe(other.played);
  });

  it('у лучшего выцветшего Поколения — полный Претендент и полное Рождение из истории', async () => {
    const { generations, history } = await evolve(12, 20, scoredByContent);
    // Выцветшее Поколение, где лучший — ребёнок: у него есть мутации «было и стало».
    const faded = new Set(generations.filter((snapshot) => snapshot.faded).map((snapshot) => snapshot.number));
    const record = history.find((entry) => faded.has(entry.number) && entry.champion?.birth?.kind === 'child');
    expect(record).toBeDefined();
    const champion = record!.champion!;
    const member = memberOf(generations, { generation: record!.number, number: champion.number })!;

    const facts = factsOf(generations, champion, { generation: record!.number, number: champion.number });
    expect(facts.entry).toBe(champion);
    expect(facts.birth).toBe(champion.birth);
    expect(facts.birth).not.toBe(member.birth);
    expect(JSON.stringify(facts.birth)).toEqual(expect.stringMatching(/"before"|"after"|"same"|"swapped"/));
    expect(JSON.stringify(member.birth)).not.toMatch(/"before"|"after"/);
  });
});
