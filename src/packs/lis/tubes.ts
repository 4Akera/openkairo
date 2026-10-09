// The laboratory's tubes and its typed orders (spec/openCare.md §5.3), as pure decisions: which tube a test is drawn into (its cap
// colour and its word, by the test, else by its section), the tubes a patient needs (tests grouped by tube), whether a test asks for
// fasting, and the tests a typed line names ("/order cbc, lipid profile, hba1c, fbs") — by code, name or a word labs use. The six
// tests asked for most come first on a walk-in. Pure (npm run test:lis).

export type Cap = 'purple' | 'yellow' | 'grey' | 'blue' | 'red' | 'cup'
export interface Tube { cap: Cap; word: string }
const TUBES: Record<Cap, Tube> = { purple: { cap: 'purple', word: 'Purple · EDTA' }, yellow: { cap: 'yellow', word: 'Yellow · gel' }, grey: { cap: 'grey', word: 'Grey · fluoride' },
  blue: { cap: 'blue', word: 'Blue · citrate' }, red: { cap: 'red', word: 'Red · plain' }, cup: { cap: 'cup', word: 'Cup · urine or stool' } }
const BY_CODE: Record<string, Cap> = { cbc: 'purple', esr: 'purple', hba1c: 'purple', bloodgroup: 'purple', fbs: 'grey', rbs: 'grey', pt: 'blue', aptt: 'blue', urine: 'cup', stool: 'cup' }
const BY_SECTION: Record<string, Cap> = { Haematology: 'purple', Coagulation: 'blue', 'Urine & stool': 'cup' }
type Test = { code: string; name: string; section_name?: string | null }

// the sections whose tests are a specimen (a lab may hold others, an imaging section: no tube)
const SPECIMEN = new Set(['Haematology', 'Coagulation', 'Chemistry', 'Hormones', 'Serology', 'Urine & stool'])
/** does the test take a specimen (a tube or a cup): a known test, or one of a specimen section */
export const takesSpecimen = (t: Pick<Test, 'code' | 'section_name'>) => t.code in BY_CODE || SPECIMEN.has(t.section_name ?? '')
/** the tube a test is drawn into: by the test, else by its section, else a yellow gel tube (chemistry, hormones, serology) */
export const tubeOf = (t: Pick<Test, 'code' | 'section_name'>): Tube => TUBES[BY_CODE[t.code] ?? BY_SECTION[t.section_name ?? ''] ?? 'yellow']
/** the tubes a patient needs: each with the tests drawn into it, in a fixed order (purple, yellow, grey, blue, red, cup) */
export function tubesFor<T extends Pick<Test, 'code' | 'section_name'>>(tests: T[]): { tube: Tube; tests: T[] }[] {
  const order: Cap[] = ['purple', 'yellow', 'grey', 'blue', 'red', 'cup']
  return order.map((cap) => ({ tube: TUBES[cap], tests: tests.filter((t) => tubeOf(t).cap === cap) })).filter((g) => g.tests.length > 0)
}
/** a test that needs the patient fasting (asked at collection) */
export const needsFasting = (code: string) => code === 'fbs' || code === 'lipids'

/** the six asked for most on a walk-in, first */
export const MOST_ASKED = ['cbc', 'lipids', 'hba1c', 'fbs', 'kft', 'urine']
// words labs and patients use for a test, beside its code and name
const WORDS: Record<string, string[]> = { lipids: ['lipid', 'lipid profile', 'lipid panel', 'cholesterol'], kft: ['kidney', 'kidney function', 'renal'], lft: ['liver', 'liver function'],
  fbs: ['fasting sugar', 'fasting glucose', 'sugar fasting'], rbs: ['random sugar', 'sugar', 'glucose'], hba1c: ['a1c', 'glycated'], urine: ['urine', 'urine analysis', 'ua'],
  stool: ['stool', 'stool analysis'], lytes: ['electrolytes', 'na k'], tsh: ['thyroid'], bhcg: ['pregnancy', 'hcg'], pt: ['inr', 'pt inr'], bloodgroup: ['blood group', 'abo'],
  hcv: ['hepatitis c', 'hcv'], hbsag: ['hepatitis b', 'hbv'], vitd: ['vitamin d', 'vit d'], troponin: ['trop', 'troponin'] }
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** the tests a typed line names, in its order, each once: "/order cbc, lipid profile, hba1c" → CBC, Lipid profile, HbA1c; a word it
 *  cannot place is left out (and handed back, to say so) */
export function testsIn<T extends Test>(line: string, tests: T[]): { found: T[]; unknown: string[] } {
  const parts = line.replace(/^\s*\/\s*order\b/i, '').split(/[,;+]|\band\b/i).map(norm).filter(Boolean)
  const found: T[] = []; const unknown: string[] = []
  for (const p of parts) {
    const t = tests.find((x) => x.code === p.replace(/ /g, '')) ?? tests.find((x) => norm(x.name) === p) ?? tests.find((x) => (WORDS[x.code] ?? []).includes(p))
      ?? tests.find((x) => norm(x.name).startsWith(p) && p.length >= 3)
    if (t) { if (!found.includes(t)) found.push(t) } else unknown.push(p)
  }
  return { found, unknown }
}
