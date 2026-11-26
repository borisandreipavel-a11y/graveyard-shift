// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Purity guardrails scoped to the engine source (not config files)
  {
    files: ['packages/engine/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['packages/engine/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Ban real-clock and randomness globals
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message:
            'The engine must not read the real clock. Advance time only through the incident clock.',
        },
      ],
      // Math.random is a property access, not a global identifier,
      // so no-restricted-globals won't catch it. Use no-restricted-syntax.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.name='Math'][property.name='random']",
          message:
            'The engine must be deterministic. Math.random() is banned.',
        },
      ],
      // Ban I/O imports
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'fs',
              message:
                'The engine does no I/O. Reading files belongs to the runner.',
            },
            {
              name: 'node:fs',
              message:
                'The engine does no I/O. Reading files belongs to the runner.',
            },
          ],
          patterns: [
            {
              group: ['node:*'],
              message:
                'The engine is pure and platform-free. No node:* imports.',
            },
          ],
        },
      ],
    },
  },
);
