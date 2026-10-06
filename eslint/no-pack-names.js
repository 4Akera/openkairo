// eslint/no-pack-names.js — the core names no pack (spec/openCare.md §5.2): a pack's key (each folder under src/packs) never appears in a
// core file, in code, a string or a comment, as a word or a type's prefix (pharmacy, pharmacy.dispense). What a pack answers, its send
// chip and its words on a medicine come from the registries every pack uses. Generated files (from the database) are not linted.
import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'packs')
/** the packs this checkout carries: each folder under src/packs */
export const packKeys = (root = PACKS) => readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory()).sort()
/** where a text names a pack: each word that is a pack's key, in any case (Pharmacy, pharmacy.dispense) */
export function packNamesIn(text, keys = packKeys()) {
  if (!keys.length) return []
  const re = new RegExp(`(?<![A-Za-z0-9_])(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z0-9_])`, 'gi')
  return [...text.matchAll(re)].map((m) => ({ key: m[1].toLowerCase(), index: m.index ?? 0 }))
}

export default {
  meta: { type: 'problem', docs: { description: 'the core names no pack: what a pack adds comes through the registries' },
    messages: { named: 'A core file names the pack "{{key}}": register what it answers, its words and its parts from the pack instead (spec §5.2).' } },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode()
    const keys = packKeys()
    return {
      Program() {
        for (const hit of packNamesIn(source.text, keys)) {
          const start = source.getLocFromIndex(hit.index)
          context.report({ loc: { start, end: source.getLocFromIndex(hit.index + hit.key.length) }, messageId: 'named', data: { key: hit.key } })
        }
      },
    }
  },
}
