// Spec 05: core may not import packs; a pack may not import another pack; the db client only from core/db.
// Design system (design-system.md §6): screens and packs use the tokens and the kit only (opencare/tokens-only). The core names no pack
// (opencare/no-pack-names, spec §5.2).
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tokensOnly from './eslint/tokens-only.js'
import noPackNames, { packKeys } from './eslint/no-pack-names.js'

// The import guards. In flat config the last entry that matches a file replaces the rule's options, so each file group has one
// merged no-restricted-imports (three overlapping entries used to leave only the db-client one in force).
const PACKS = { group: ['@packs', '@packs/*', '**/packs', '**/packs/**'], message: 'core never imports a pack (spec 05).' }
const CLIENT = { group: ['**/db/client', '@core/db/client'], message: 'Only core/db may hold the client; use the hooks (spec 05).' }
const OTHER_PACK = { group: ['@packs', '@packs/*'], message: 'a pack never imports another pack (spec 06).' }
const guard = (...patterns) => ({ 'no-restricted-imports': ['error', { patterns }] })
// a pack reaches core through @core only, so a relative path that climbs out of its own folder is another pack (or core by the
// back door): at depth d under src/packs/<pack>/ that is d or more "../"
const climbOut = (d) => ({ regex: `^(\\.\\./){${d - 1}}\\.\\.(/|$)`, message: 'a pack imports core through @core and never another pack (spec 06).' })

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/core/db/types.generated.ts', 'src/core/db/shapes.generated.ts', 'src/core/screens/visit/catalog/data.ts'] },   // generated
  { files: ['**/*.{ts,tsx}'], extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: { ...reactHooks.configs.recommended.rules, 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }], 'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }] } },
  { files: ['src/**/*.{ts,tsx}'], rules: guard(CLIENT) },                    // src/packs/index.ts, and anything new outside core and a pack
  { files: ['src/core/**/*.{ts,tsx}'], rules: guard(PACKS, CLIENT) },
  { files: ['src/core/db/**/*.{ts,tsx}'], rules: guard(PACKS) },
  { files: ['src/core/main.tsx'], rules: guard(CLIENT) },                     // the one place core loads the packs: import '../packs'
  ...[1, 2, 3, 4].map((d) => ({ files: [`src/packs/*/${'*/'.repeat(d - 1)}*.{ts,tsx}`], rules: guard(OTHER_PACK, CLIENT, climbOut(d)) })),
  // tokens only, core and packs alike: an error since the sweep and the chart are done (build plan step 4); the kit owns the recipes
  { files: ['src/**/*.{ts,tsx}'], plugins: { opencare: { rules: { 'tokens-only': tokensOnly, 'no-pack-names': noPackNames } } }, rules: { 'opencare/tokens-only': 'error' } },
  { files: ['src/core/ui/**'], rules: { 'opencare/tokens-only': 'off' } },
  // the core names no pack (spec §5.2): pharmacy goes behind the registries every pack uses; generated files hold the database's words
  { files: ['src/core/**/*.{ts,tsx}'], ignores: ['src/core/**/*.generated.ts'], rules: { 'opencare/no-pack-names': 'error' } },
  // and a pack names no other pack (spec §5, §5.4): each pack's folder, every pack's key but its own
  ...packKeys().map((own) => ({ files: [`src/packs/${own}/**/*.{ts,tsx}`], rules: { 'opencare/no-pack-names': ['error', { own }] } })),
)
