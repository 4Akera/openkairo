// The labour ward's words and codes (spec/openCare.md §5.6): the labour examination's type and its choices (the position of the head,
// the liquor as the WHO's partograph writes it, I C M B A, moulding, caput), and the baby's heart as the base's observation with
// LOINC 55283-6 (the owner's B1), off under 110 or over 160 a minute. The words say what obgyn.liquor_words and
// obgyn.position_words say on the server (migration 37), word for word. Pure.
import type { EntryData } from '@core/db/shapes.generated'
import type { ServerEntry } from '@core/db/types'

export const EXAM = 'obgyn.labour_exam'
/** the birth (L2c): the pack's own type, its entry the mother's, in her stay */
export const BIRTH = 'obgyn.birth'
export type ExamData = EntryData['obgyn.labour_exam']
export type Position = NonNullable<ExamData['position']>
export type Liquor = NonNullable<ExamData['liquor']>
export type Moulding = NonNullable<ExamData['moulding']>
export type Caput = NonNullable<ExamData['caput']>

/** the baby's heart: the base's observation with this LOINC code, its value a minute's beats */
export const FHR_CODE = { system: 'loinc', code: '55283-6', display: 'Fetal heart rate' } as const
export const FHR_LOW = 110
export const FHR_HIGH = 160
export const fhrConcept = () => ({ text: 'Fetal heart rate', codings: [{ ...FHR_CODE }] })
/** an observation of the baby's heart (its code holds LOINC 55283-6) */
export function isFhr(e: Pick<ServerEntry, 'type' | 'data'>): boolean {
  if (e.type !== 'observation') return false
  const codings = (e.data?.code as { codings?: unknown } | undefined)?.codings
  return Array.isArray(codings) && codings.some((c) => !!c && typeof c === 'object' && (c as { system?: unknown }).system === FHR_CODE.system && (c as { code?: unknown }).code === FHR_CODE.code)
}

export const POSITIONS: [Position, string][] = [['oa', 'OA'], ['loa', 'LOA'], ['roa', 'ROA'], ['lot', 'LOT'], ['rot', 'ROT'], ['op', 'OP'], ['lop', 'LOP'], ['rop', 'ROP'], ['breech', 'Breech']]
/** the liquor: its key, its chip, its letter on the partograph */
export const LIQUOR: [Liquor, string, string][] = [['intact', 'Intact', 'I'], ['clear', 'Clear', 'C'], ['meconium', 'Meconium', 'M'], ['blood', 'Blood', 'B'], ['absent', 'Absent', 'A']]
export const MOULDING: Moulding[] = ['0', '+', '++', '+++']
export const CAPUT: [Caput, string][] = [['none', 'None'], ['+', '+'], ['++', '++']]

const LIQUOR_WORDS: Record<Liquor, string> = { intact: 'membranes intact', clear: 'liquor clear', meconium: 'liquor meconium-stained', blood: 'liquor blood-stained', absent: 'liquor absent' }
/** obgyn.liquor_words */
export const liquorWords = (l: Liquor) => LIQUOR_WORDS[l]
/** obgyn.position_words */
export const positionWords = (p: Position) => p === 'breech' ? 'breech' : p.toUpperCase()
