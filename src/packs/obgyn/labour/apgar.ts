// Apgar (Apgar 1953) as the birth card asks it (spec/openCare.md §5.6): the five signs in the declared table's order and words
// (obgyn.apgar, migration 37), each 0, 1 or 2; the server adds them up (the read shape 'score'), the card never does. Pure.
export const APGAR = 'obgyn.apgar'
export type ApgarSign = 'colour' | 'heart' | 'grimace' | 'activity' | 'breathing'
export type ApgarInputs = Partial<Record<ApgarSign, '0' | '1' | '2'>>

/** the five signs, each with its words for 0, 1 and 2, as obgyn.apgar declares them */
export const APGAR_SIGNS: { key: ApgarSign; label: string; words: [string, string, string] }[] = [
  { key: 'colour', label: 'Colour', words: ['Blue or pale all over', 'Blue hands and feet', 'Pink all over'] },
  { key: 'heart', label: 'Heart rate', words: ['None', 'Under 100', '100 or more'] },
  { key: 'grimace', label: 'Grimace', words: ['No response', 'Grimace', 'Cries or pulls away'] },
  { key: 'activity', label: 'Activity', words: ['Limp', 'Some flexion', 'Active movement'] },
  { key: 'breathing', label: 'Breathing', words: ['None', 'Slow or irregular', 'Good, crying'] },
]

/** all five signs chosen */
export const apgarComplete = (i: ApgarInputs) => APGAR_SIGNS.every((s) => i[s.key] !== undefined)
/** at least one sign chosen */
export const apgarStarted = (i: ApgarInputs) => APGAR_SIGNS.some((s) => i[s.key] !== undefined)
