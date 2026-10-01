import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Относительные пути к ассетам: сборка открывается и с GitHub Pages (/ts-game/), и локально.
  base: './',
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('./src/sim', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
