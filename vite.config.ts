import { defineConfig } from 'vite';

// Two pages: the game, and the 一覧 (catalog.html) of what is in it.
export default defineConfig({
  build: {
    rolldownOptions: {
      input: { main: 'index.html', catalog: 'catalog.html' },
    },
  },
});
