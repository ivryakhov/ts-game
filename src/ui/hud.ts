import { TICKS_PER_SECOND, UNIT_KINDS, UNIT_STATS } from '@sim/index';
import type { SideId, UnitKind } from '@sim/index';
import { UNIT_TITLES } from './rule-text.js';
import type { Speed } from '../app/pacer.js';
import type { Outcome } from '../app/replay.js';

/**
 * Надпись поверх поля: время матча, темп и Сид.
 *
 * Разметка лежит в index.html, здесь — только обновление текста: HUD
 * ничего не решает и ни на что не влияет, он лишь показывает состояние.
 */
export interface Hud {
  update(state: {
    tick: number;
    speed: Speed;
    paused: boolean;
    seed: number;
    ether: number;
    incomePerSecond: number;
    /** Доход противника в секунду — чтобы видеть, кто выигрывает экономику. */
    foeIncomePerSecond: number;
    chosenKind: UnitKind;
    /** Идёт повтор: Выпуски идут сами, клики по Дороге не действуют. */
    replaying: boolean;
    /** Показательный матч: за обе Стороны играют Противники; текст надписи или null — не он. */
    showcase: string | null;
  }): void;
  /** Показать, что Эфира не хватило: отказ должен быть заметен. */
  refuse(): void;
  /** Показать ошибку, которую игрок должен исправить сам. Ошибки копятся, а не заменяют друг друга. */
  warn(message: string): void;
  /**
   * Объявить исход глазами игрока. Победитель null означает, что время
   * вышло вничью. У повтора рядом стоит исход оригинала. В Показательном
   * матче победа не своя и не чужая — объявляется, чья она, по имени.
   */
  announce(
    outcome: { now: Outcome; original: Outcome | null; names: { own: string; foe: string } | null } | null,
  ): void;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`В разметке нет элемента #${id}`);
  return found;
}

/** Время матча из номера Тика: реальные часы тут ни при чём (ADR-0001). */
export function formatMatchTime(tick: number): string {
  const totalSeconds = Math.floor(tick / TICKS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Исход одной строкой: кто взял верх, когда и сколько осталось от Цитаделей. */
export function describeOutcome(outcome: Outcome, playerSide: SideId): string {
  const verdict = outcome.winner === null ? 'ничья' : outcome.winner === playerSide ? 'победа' : 'поражение';
  const hp = (mine: boolean) =>
    Math.ceil(outcome.citadels.find((citadel) => (citadel.side === playerSide) === mine)?.hp ?? 0);
  return `${verdict}, ${formatMatchTime(outcome.tick)}, Цитадели: ваша ${hp(true)}, врага ${hp(false)}`;
}

export function createHud(playerSide: SideId): Hud {
  const clock = element('hud-clock');
  const speed = element('hud-speed');
  const seed = element('hud-seed');
  const outcome = element('hud-outcome');
  const outcomeText = element('hud-outcome-text');
  const ether = element('hud-ether');
  const foeIncome = element('hud-foe-income');
  const kinds = element('hud-kinds');
  const warning = element('hud-warning');
  const replay = element('hud-replay');
  const showcase = element('hud-showcase');

  const slots = UNIT_KINDS.map((kind, index) => {
    const slot = document.createElement('span');
    slot.className = 'hud__kind';
    slot.textContent = `${index + 1} ${UNIT_TITLES[kind]} ${UNIT_STATS[kind].cost}`;
    kinds.append(slot);
    return { kind, slot };
  });

  return {
    update(state): void {
      clock.textContent = formatMatchTime(state.tick);
      speed.textContent = state.paused ? `×${state.speed} пауза` : `×${state.speed}`;
      speed.classList.toggle('hud__paused', state.paused);
      seed.textContent = String(state.seed);
      ether.textContent = `${Math.floor(state.ether)} (+${state.incomePerSecond.toFixed(1)}/с)`;
      foeIncome.textContent = `+${state.foeIncomePerSecond.toFixed(1)}/с`;
      replay.hidden = !state.replaying;
      showcase.hidden = state.showcase === null;
      if (state.showcase !== null && showcase.textContent !== state.showcase) showcase.textContent = state.showcase;

      for (const { kind, slot } of slots) {
        slot.classList.toggle('hud__kind--chosen', kind === state.chosenKind);
        slot.classList.toggle('hud__kind--broke', state.ether < UNIT_STATS[kind].cost);
      }
    },

    warn(message: string): void {
      const line = document.createElement('div');
      line.textContent = message;
      warning.append(line);
      warning.hidden = false;
    },

    refuse(): void {
      ether.classList.remove('hud__refused');
      // Перезапуск анимации: без чтения свойства браузер не заметит,
      // что класс вернули, и второй отказ подряд пройдёт незаметно.
      void ether.offsetWidth;
      ether.classList.add('hud__refused');
    },

    announce(result): void {
      outcome.classList.toggle('hud__outcome--shown', result !== null);
      if (!result) return;

      const { now, original, names } = result;
      const mine = now.winner === playerSide;
      const headline =
        now.winner === null
          ? 'Время вышло'
          : names
            ? `Победа: ${mine ? names.own : names.foe}`
            : mine
              ? 'Победа'
              : 'Поражение';
      const line = (text: string) => {
        const small = document.createElement('small');
        small.textContent = text;
        return small;
      };
      if (!original) {
        const who = now.winner === null ? 'ничья' : `победила Сторона ${now.winner}`;
        outcomeText.replaceChildren(headline, line(`${who}, матч длился ${formatMatchTime(now.tick)}`));
        return;
      }
      outcomeText.replaceChildren(
        headline,
        line(`повтор: ${describeOutcome(now, playerSide)}`),
        line(`оригинал: ${describeOutcome(original, playerSide)}`),
      );
    },
  };
}
