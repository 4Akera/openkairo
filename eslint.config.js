// Spec 05: core may not import packs; a pack may not import another pack; the db client only from core/db.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/core/db/types.generated.ts', 'src/core/db/shapes.generated.ts', 'src/core/screens/visit/catalog/data.ts'] },   // generated
  { files: ['**/*.{ts,tsx}'], extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: { ...reactHooks.configs.recommended.rules, 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }], 'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }] } },
  { files: ['src/core/**/*.{ts,tsx}'], rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['@packs/*', '**/packs/**'], message: 'core never imports a pack (spec 05).' }] }] } },
  { files: ['src/packs/*/**/*.{ts,tsx}'], rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['@packs/*'], message: 'a pack never imports another pack (spec 06).' }] }] } },
  { files: ['src/**/*.{ts,tsx}'], ignores: ['src/core/db/**'], rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/db/client', '@core/db/client'], message: 'Only core/db may hold the client; use the hooks (spec 05).' }] }] } },
)
