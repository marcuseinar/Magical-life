import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig
      }
    }
  },

  // --- The dependency rule (docs/architecture.md), enforced mechanically. ---
  {
    files: ['src/**'],
    plugins: { boundaries },
    settings: {
      // Without a resolver the aliases are opaque and the rule silently passes everything.
      'import/resolver': { typescript: { project: './.svelte-kit/tsconfig.json' } },
      'boundaries/include': ['src/**/*.{ts,js,svelte}'],
      // Tests legitimately reach across layers to assemble a subject under test.
      'boundaries/ignore': ['**/*.test.ts', '**/*.svelte.test.ts'],
      'boundaries/elements': [
        { type: 'domain', pattern: 'src/domain/**' },
        { type: 'application', pattern: 'src/application/**' },
        { type: 'adapters', pattern: 'src/adapters/**' },
        { type: 'ui', pattern: 'src/ui/**' },
        // Composition root: the only place allowed to wire adapters into the UI.
        { type: 'app', pattern: 'src/{lib,routes}/**' }
      ]
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: [{ element: { type: 'domain' } }],
              allow: [{ to: { element: { type: 'domain' } } }]
            },
            {
              from: [{ element: { type: 'application' } }],
              allow: [
                { to: { element: { type: 'domain' } } },
                { to: { element: { type: 'application' } } }
              ]
            },
            {
              from: [{ element: { type: 'adapters' } }],
              allow: [
                { to: { element: { type: 'domain' } } },
                { to: { element: { type: 'application' } } },
                { to: { element: { type: 'adapters' } } }
              ]
            },
            {
              // Note the absence of 'adapters': the UI must not reach the outside world.
              from: [{ element: { type: 'ui' } }],
              allow: [
                { to: { element: { type: 'domain' } } },
                { to: { element: { type: 'application' } } },
                { to: { element: { type: 'ui' } } }
              ]
            },
            {
              from: [{ element: { type: 'app' } }],
              allow: [
                { to: { element: { type: 'domain' } } },
                { to: { element: { type: 'application' } } },
                { to: { element: { type: 'adapters' } } },
                { to: { element: { type: 'ui' } } },
                { to: { element: { type: 'app' } } }
              ]
            }
          ]
        }
      ],
      // domain/ is pure: no platform globals, no ambient time, identity or entropy.
      'no-restricted-globals': 'off'
    }
  },
  {
    files: ['src/domain/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'domain/ is pure — pass time in as an argument.'
        },
        {
          object: 'Math',
          property: 'random',
          message: 'domain/ is pure — pass entropy in as an argument.'
        },
        {
          object: 'crypto',
          property: 'randomUUID',
          message: 'domain/ is pure — pass identity in as an argument.'
        }
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'domain/ is pure.' },
        { name: 'document', message: 'domain/ is pure.' },
        { name: 'fetch', message: 'domain/ is pure.' },
        { name: 'localStorage', message: 'domain/ is pure.' },
        { name: 'indexedDB', message: 'domain/ is pure.' }
      ]
    }
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    ignores: [
      '.svelte-kit/',
      'build/',
      'coverage/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      // Explicitly outside every gate — see spikes/webrtc-handshake/README.md.
      // A spike is throwaway by definition; it should not be able to fail CI.
      'spikes/'
    ]
  }
);
