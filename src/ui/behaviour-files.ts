import type { Behaviour } from '@sim/index';
import { behaviourText, parsePlayerText, PLAYER_FILE_NAME, problemOf } from '../app/player-file.js';

/**
 * «Скачать» и «Загрузить» на Подготовке: Поведение игрока файлом
 * в формате player.json — чтобы делиться им и гонять в Автопрогоне.
 */

/** Отдать текст браузеру как скачиваемый файл. */
export function offerDownload(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`В разметке нет элемента #${id}`);
  return found as T;
}

export interface BehaviourFilesHandlers {
  /** Поведение с экрана, если в черновике нет ошибок, иначе null. */
  current(): Behaviour | null;
  /** Заменить все три типа загруженным Поведением. */
  load(behaviour: Behaviour): void;
}

export function bindBehaviourFiles(handlers: BehaviourFilesHandlers): void {
  const download = element('prep-download');
  const upload = element('prep-upload');
  const input = element<HTMLInputElement>('prep-upload-input');
  const status = element('prep-file-status');

  const say = (message: string | null): void => {
    status.textContent = message ?? '';
    status.hidden = message === null;
  };

  download.addEventListener('click', () => {
    const behaviour = handlers.current();
    if (!behaviour) {
      say('Сначала исправьте ошибку в Правилах — скачать можно только то, что пойдёт в матч.');
      return;
    }
    say(null);
    offerDownload(PLAYER_FILE_NAME, behaviourText(behaviour));
  });

  upload.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void file.text().then((text) => {
      let behaviour: Behaviour;
      try {
        behaviour = parsePlayerText(text);
      } catch (error) {
        say(`Файл ${file.name} не загружен, Правила не тронуты — ${problemOf(error)}`);
        return;
      }
      if (!window.confirm(`Заменить Правила всех трёх типов Правилами из ${file.name}?`)) return;
      say(null);
      handlers.load(behaviour);
    });
  });
}
