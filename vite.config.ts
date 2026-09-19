import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        chooser: resolve(import.meta.dirname, 'chooser.html'),
      },
    },
  },
});
