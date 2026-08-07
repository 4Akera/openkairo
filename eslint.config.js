import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // The codebase uses a leading underscore for intentionally-unused bindings
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      // Data loading lives in fetch-on-mount effects with loading flags throughout
      // the app; this rule can't express that idiom without a data-fetching layer
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    // Block modules intentionally export the component together with its
    // empty-content factory and shared helpers; fast refresh is a non-goal here
    files: [
      'src/components/timeline/**/*.tsx',
      'src/components/settings/billing/*.tsx',
      'src/components/ui/**/*.tsx',
      'src/pages/BillingPage.tsx',
      'src/pages/settings/blockFieldEditors.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
