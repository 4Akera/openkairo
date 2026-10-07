// Another brand of the same medicine (spec/openCare.md §5.3): when what was prescribed is out of stock, the pharmacist gives another
// name with the same active ingredient, and the record keeps what was really given. The names come from the drug list the composer
// suggests from (WHO ATC, with the brands sold in Egypt as its synonyms); with stock kept, the counts come from the shelf. Pure.
import { DRUGS } from '@core/screens/visit/catalog/data'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim()
/** the name without its strength or form: "Metformin 500 mg" → "metformin", "Augmentin 1 g" → "augmentin" */
export const bareName = (s: string) => norm(s).replace(/\s+\d.*$/, '').trim()

/** the medicine a prescribed name is (its generic and ATC), and the other names it is sold under: brands first, then the generic */
export function sameMedicine(prescribed: string): { generic: string; atc: string; others: string[] } | null {
  const want = bareName(prescribed); if (!want) return null
  const d = DRUGS.find((x) => norm(x.name) === want || x.synonyms.some((y) => norm(y) === want))
  if (!d) return null
  const brands = d.synonyms.filter((y) => /^[A-Z]/.test(y) && norm(y) !== want)   // a brand is written with a capital; "metformin XR" is a form
  return { generic: d.name, atc: d.atc, others: [...brands, ...(norm(d.name) === want ? [] : [d.name])] }
}
