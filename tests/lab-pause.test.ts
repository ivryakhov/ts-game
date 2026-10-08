import { describe, it, expect } from 'vitest';
import { createEvolution } from '../src/lab/evolution.js';
import type { BoutRequest, WorkerReply } from '../src/lab/protocol.js';
import { bout, finishes, settings, setup } from './lab-fakes.js';

/**
 * Пауза после каждого Поколения (тикет 33): прогон встаёт, когда
 * Поколение сдало Экзамен и следующее уже собрано.
 */

describe('пауза после каждого Поколения', () => {
  /** Дождаться, пока прогон встанет или кончится. */
  const settled = async (evolution: ReturnType<typeof createEvolution>): Promise<void> => {
    for (let tries = 0; tries < 200 && evolution.state.phase === 'running'; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  };
  const scoredBy = (request: BoutRequest): WorkerReply => ({ kind: 'bout', job: request.job, bout: bout(request, -request.job) });

  it('встаёт после отбора: Поколение сдано, дети сосчитаны, следующее собрано и не сдано', async () => {
    const { evolution } = setup(scoredBy);
    evolution.pauseAfterGeneration = true;
    void evolution.start(settings({ size: 5, generations: 3 }));
    await settled(evolution);

    expect(evolution.state.phase).toBe('paused');
    expect(evolution.state.generation).toBe(1);
    expect(evolution.state.history).toHaveLength(1);
    expect(evolution.state.generations[0]?.children).not.toBeNull();
    const assembled = evolution.state.assembled ?? [];
    expect(assembled).toHaveLength(5);
    expect(assembled.every((entry) => entry.generation === 2 && entry.birth !== undefined)).toBe(true);
    expect(assembled.every((entry) => entry.bouts.every((played) => played === null))).toBe(true);
    evolution.stop();
  });

  it('«Продолжить» сдаёт собранное Поколение и встаёт после следующего отбора', async () => {
    const { evolution } = setup(scoredBy);
    evolution.pauseAfterGeneration = true;
    void evolution.start(settings({ size: 5, generations: 3 }));
    await settled(evolution);
    const assembled = evolution.state.assembled;

    evolution.resume();
    await settled(evolution);

    expect(evolution.state.phase).toBe('paused');
    expect(evolution.state.generation).toBe(2);
    expect(evolution.state.generations[1]?.entries).toBe(assembled);
    expect(evolution.state.history).toHaveLength(2);
    evolution.stop();
  });

  it('снятая на ходу галочка больше не останавливает, а последнее Поколение не встаёт', async () => {
    const { evolution } = setup(scoredBy);
    evolution.pauseAfterGeneration = true;
    const run = evolution.start(settings({ size: 5, generations: 4 }));
    await settled(evolution);

    evolution.pauseAfterGeneration = false;
    evolution.resume();

    expect(await finishes(run)).toBe(true);
    expect(evolution.state.phase).toBe('done');
    expect(evolution.state.history).toHaveLength(4);
    expect(evolution.state.assembled).toBeNull();
  });

  it('с галочкой прогон из одного Поколения просто кончается', async () => {
    const { evolution } = setup(scoredBy);
    evolution.pauseAfterGeneration = true;

    expect(await finishes(evolution.start(settings({ size: 5, generations: 1 })))).toBe(true);
    expect(evolution.state.phase).toBe('done');
  });

  it('«Стоп» на паузе после отбора останавливает прогон', async () => {
    const { evolution } = setup(scoredBy);
    evolution.pauseAfterGeneration = true;
    const run = evolution.start(settings({ size: 5, generations: 3 }));
    await settled(evolution);

    evolution.stop();

    expect(await finishes(run)).toBe(true);
    expect(evolution.state.phase).toBe('stopped');
    expect(evolution.state.history).toHaveLength(1);
  });

  it('с паузами и без — те же Поколения', async () => {
    const plain = setup(scoredBy).evolution;
    expect(await finishes(plain.start(settings({ size: 5, generations: 3, seed: 9 })))).toBe(true);

    const paused = setup(scoredBy).evolution;
    paused.pauseAfterGeneration = true;
    const run = paused.start(settings({ size: 5, generations: 3, seed: 9 }));
    for (let step = 0; step < 2; step += 1) {
      await settled(paused);
      paused.resume();
    }
    expect(await finishes(run)).toBe(true);

    expect(paused.state.history).toEqual(plain.state.history);
    expect(paused.state.entries.map((entry) => entry.candidate)).toEqual(plain.state.entries.map((entry) => entry.candidate));
  });
});
