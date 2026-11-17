import { defineConfig } from 'vite';

// Two pages: the game, and the 一覧 (catalog.html) of what is in it.
export default defineConfig({
  // The dev server must not watch or scan the big folders that are not the game: ios/ holds a full copy of the built game
  // (ios/App/App/public, made by `npm run ios:sync`, with its own index.html that the dependency scan would also crawl), dist/
  // is the build, and tools/*/raw and out are the generated pictures and sounds (hundreds of MB).
  server: {
    watch: { ignored: ['**/ios/**', '**/dist/**', '**/tools/art/raw/**', '**/tools/art/out/**', '**/tools/audio/raw/**', '**/tools/audio/out/**', '**/tools/art/refs/**'] },
  },
  optimizeDeps: { entries: ['index.html', 'catalog.html'] },
  build: {
    rolldownOptions: {
      input: { main: 'index.html', catalog: 'catalog.html' },
    },
  },
});
