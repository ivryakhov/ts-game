/**
 * Neon Arcana - Client Entry Point
 * Точка входа клиентского приложения
 */

import { Game } from './game/Game';

/**
 * Инициализация игры
 */
function init(): void {
  console.log('🎮 Neon Arcana - Initializing...');

  // Получаем canvas элемент
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  if (!canvas) {
    console.error('Canvas element not found!');
    return;
  }

  // Создаём игру
  const game = new Game(canvas, {
    playerCount: 2,
    localPlayerId: 'player1',
    debugMode: true,
  });

  // Запускаем игру
  game.start();

  // Сохраняем ссылку на игру в window для отладки
  (window as unknown as { game: Game }).game = game;

  console.log('✅ Neon Arcana - Game started!');
  console.log('📝 Controls:');
  console.log('   1-4: Select unit type');
  console.log('   Click on road: Spawn unit');
  console.log('   G: Toggle grid');
  console.log('   D: Toggle debug mode');
}

// Запускаем после загрузки DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
