// Gynaecology's facts as the section and the words read them (spec/openCare.md §5.7, the picture #ob-gyn): the method standing now (the
// latest base observation by the pack's contraception code) and the last cervical screening (by its code). Pure.
import type { ServerEntry } from '@core/db/types'

type Coded = { code?: { codings?: { system?: string; code?: string }[] }; value?: { text?: string; concept?: { text?: string } }; note?: string }
const byCode = (facts: ServerEntry[] | undefined, code: string) => {
  const crossed = new Set((facts ?? []).filter((e) => e.type === 'crossed_out').map((e) => e.refers_to))
  return (facts ?? []).filter((e) => !e.hidden && !crossed.has(e.id) && (e.data as Coded | undefined)?.code?.codings?.some((c) => c.system === 'obgyn.codes' && c.code === code))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0] ?? null
}
const textOf = (e: ServerEntry) => { const d = e.data as Coded; return d.value?.concept?.text ?? d.value?.text ?? '' }
/** the method now: its words, its note (the device, the lot), since when */
export function methodNow(facts: ServerEntry[] | undefined): { method: string; note: string | null; at: string; entry: ServerEntry } | null {
  const e = byCode(facts, 'contraception'); return e ? { method: textOf(e), note: (e.data as Coded).note ?? null, at: e.occurred_at, entry: e } : null
}
/** the last cervical screening: what it found, when */
export function screeningNow(facts: ServerEntry[] | undefined): { text: string; at: string; entry: ServerEntry } | null {
  const e = byCode(facts, 'cervical_screening'); return e ? { text: textOf(e), at: e.occurred_at, entry: e } : null
}
