// The renal list's line under the base's /rx card (spec/openCare.md §5.8, Q33; core change C1): as the medicine is typed, the clinic's
// renal list says what it says at the latest eGFR — "eGFR 28 (3 Oct): metformin — the clinic's renal list says stop under 30" — a notice in
// warn, never a stop; nothing waits for it and nothing is stored. Pure: handed the card's fields, what the chart shows and the settings.
import type { Organization, ValueRow } from '@core/db/types'
import { latestEgfr, renalSays, renalWords, rulesOf } from './renal'

type Params = { drug?: { name?: string; code?: string | null } | null }
export interface RxLineCtx { record?: { values?: Pick<ValueRow, 'code' | 'value' | 'at'>[] } | null; org?: Pick<Organization, 'settings' | 'settingKeys' | 'datatypes'> & Partial<Pick<Organization, 'organization'>> }
const day = (at: string) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
/** the line's rows and its short form after the draft's line; null when the list says nothing of this medicine at this eGFR */
export function renalLine(params: Params, ctx: RxLineCtx) {
  const name = params.drug?.name?.trim(); if (!name) return null
  const egfr = latestEgfr(ctx.record?.values ?? []); if (!egfr) return null
  const atc = params.drug?.code?.startsWith('atc:') ? params.drug.code.slice(4) : null
  const r = renalSays({ name, atc }, egfr.value, rulesOf(ctx.org)); if (!r) return null
  return { rows: [[{ text: renalWords(r, egfr, day(egfr.at)), tone: 'warn' as const }]], short: [{ text: `renal: ${r.says} under ${r.under}`, tone: 'warn' as const }] }
}
