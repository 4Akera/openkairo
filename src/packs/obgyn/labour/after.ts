// The tile after birth (spec/openCare.md §5.6, the owner's C1; the words chosen by Claude in the build, awaiting the owner), from the
// board's read (obgyn.board): the mother's stay with a birth — "born 06:40 · normal" today, else "CS day 1" after a caesarean or "day 2
// after birth", each baby ("girl 3.1 kg"), and PPH in red when the blood loss is over (only a notice); a baby's stay (Apgar scores in
// it) — "3.1 kg · Apgar 8 · 9 · vitamin K given · hepatitis B due", a dose not given in amber (vitamin K due; hepatitis B late after 24
// hours of the stay). The doses are found by their drug words, as the birth card writes them. Pure: npm run test:birth.
import type { PresenceRow } from '@core/db/types'
import type { TileCtx, TileWord, TileWords } from '@core/screens/ward/tiles'
import { hm, ymd } from '@core/ui/time'
import type { LabourStay } from './board'

const DAY = 86_400_000
const MODE: Record<string, string> = { normal: 'normal', vacuum: 'vacuum', forceps: 'forceps', breech: 'vaginal breech', caesarean: 'caesarean' }
const SEX: Record<string, string> = { female: 'girl', male: 'boy' }
/** a weight in kilograms to one decimal: 3100 g "3.1 kg", 3350 g "3.4 kg" */
const kgWords = (kg: number) => `${(Math.round(kg * 10) / 10).toFixed(1)} kg`
/** the clinic days from one time to another (the clinic's dates, not 24 hours) */
const clinicDays = (from: string, to: number) => Math.round((Date.parse(ymd(new Date(to).toISOString())) - Date.parse(ymd(from))) / DAY)

/** the PPH word (WHO: 500 mL or more after a vaginal birth, 1000 after a caesarean), or nothing */
export function pphWord(birth: { mode?: string; blood_loss?: number }): TileWord | null {
  const ml = birth.blood_loss; if (typeof ml !== 'number') return null
  return ml >= (birth.mode === 'caesarean' ? 1000 : 500) ? { text: `PPH ${ml} mL`, tone: 'danger' } : null
}

/** the mother's tile after birth; null without a birth in the stay */
export function afterWords(_row: PresenceRow, s: LabourStay, _ctx: Pick<TileCtx, 'org'>, now: number): TileWords | null {
  const b = s.birth; if (!b) return null
  const words: (string | TileWord)[] = []
  const days = clinicDays(b.at, now)
  if (days <= 0) words.push(`born ${hm(b.at)}`, MODE[b.mode] ?? b.mode)
  else words.push(b.mode === 'caesarean' ? `CS day ${days}` : `day ${days} after birth`)
  for (const x of b.babies ?? []) words.push(typeof x.grams === 'number' ? `${SEX[x.sex] ?? 'baby'} ${kgWords(x.grams / 1000)}` : SEX[x.sex] ?? 'baby')
  const pph = pphWord(b); if (pph) words.push(pph)
  return { words }
}

/** a baby's tile: its weight, Apgar at 1 and 5 minutes, vitamin K and hepatitis B given or due; null for a stay that is not a baby's */
export function babyWords(row: PresenceRow, s: LabourStay, now: number): TileWords | null {
  const b = s.baby; if (!b) return null
  const words: (string | TileWord)[] = []
  if (typeof b.kg === 'number') words.push(kgWords(b.kg))
  const apgar = ['1 min', '5 min'].flatMap((n) => b.apgar.filter((a) => a.note === n && typeof a.total === 'number').slice(-1).map((a) => a.total))
  if (apgar.length) words.push(`Apgar ${apgar.join(' · ')}`)
  const has = (re: RegExp) => (b.given ?? []).some((g) => typeof g.drug === 'string' && re.test(g.drug))
  words.push(has(/vitamin k/i) ? 'vitamin K given' : { text: 'vitamin K due', tone: 'warn' })
  if (has(/hepatitis b/i)) words.push('hepatitis B given')
  else words.push(now - Date.parse(row.checked_in_at) < DAY ? 'hepatitis B due' : { text: 'hepatitis B late', tone: 'warn' })
  return { words }
}
