import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/fuzz/**/*.test.ts'],
          // Component tests share the .test.ts suffix but need a DOM.
          exclude: ['**/*.svelte.test.ts'],
          environment: 'node'
        }
      },
      {
        extends: true,
        test: {
          name: 'component',
          include: ['src/**/*.svelte.test.ts'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup/component.ts']
        },
        resolve: {
          // Mount the browser build of Svelte, not the server one.
          conditions: ['browser']
        }
      }
    ],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/application/**'],
      thresholds: {
        'src/domain/**': { branches: 100, functions: 100, lines: 100, statements: 100 }
      }
    }
  }
});
