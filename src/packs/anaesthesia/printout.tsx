// The patient's sheet before the operation as it prints (spec/openCare.md §5.8, Q43; the picture #anaes-preop, "Printed for him"): in
// Arabic, right to left — the clinic's header, the patient's name and record number, the operation, what to take, leave out and stop
// before it (the pre-op's lines as the anaesthetist left them), fasting, the plan's anaesthetic and the anaesthetist. Built 2026-10-10
// on the core's print facility (§3.13). *Chosen by Claude at the owner's request:* the core's A5 sheet; one instruction a line; the
// anaesthetic planned said in Arabic. Pure: npm run test:print renders it.
import type { PrintoutProps } from '@core/print/registry'
import { Num, PrintHeader, ReprintMark, Words } from '@core/print/parts'
import { arabicDigits } from '@core/screens/chart/model/arabic'
import type { Plan, StopLine } from './model'

export const SHEET_KEY = 'anaesthesia.sheet'
export interface PreopSheet { name: string; record: number; operation: string | null; lines: string[]; plan: Plan | null; anaesthetist: string | null; at: string; thing: string }
const PLAN_AR: Record<Plan, string> = { general_lma: 'تخدير كلي', general_tube: 'تخدير كلي', spinal: 'تخدير نصفي (في الظهر)', local_sedation: 'تخدير موضعي مع مهدئ' }
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const arDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return `${arabicDigits(d)} ${MONTHS[m - 1]} ${arabicDigits(y)}` }
/** the pre-op's lines as the card holds them (each the anaesthetist may have changed), as the Arabic sheet reads them */
export const stopOf = (stop: { medicine: string; what: string; rule?: string; days?: number }[]): StopLine[] =>
  stop.map((s) => ({ medicine: s.medicine, what: s.what, rule: s.rule ?? '', ...(s.days != null ? { days: s.days } : {}), warn: false }))
/** the same sheet printed again: the record number and a short mark of its words (the read log keeps at most 200 characters) */
export const sheetThing = (record: number, words: string) => { let h = 5381; for (const ch of words) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0
  return `#${record} · ${h.toString(16).padStart(8, '0')}` }
/** the Arabic sheet's sentences, one a line */
export const sentences = (text: string) => text.split(/(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean)

export function PreopSheetView({ data: s, header, reprint }: PrintoutProps<PreopSheet>) {
  return <article dir="rtl" lang="ar" className="text-fg" style={{ fontSize: '11.5pt', lineHeight: 1.6, display: 'grid', gap: '4mm' }}>
    <PrintHeader header={header} />
    <div style={{ textAlign: 'center' }}><p style={{ margin: 0, fontSize: '14pt', fontWeight: 600 }}>تعليمات قبل العملية</p>
      <p style={{ margin: 0, fontSize: '9pt' }}>{arDate(s.at)}</p><ReprintMark at={reprint} style={{ marginTop: '1mm', display: 'inline-block' }} /></div>
    <div><p style={{ margin: 0 }}>الاسم: <b><Words>{s.name}</Words></b> · ملف <Num>{s.record}</Num></p>
      {s.operation && <p style={{ margin: 0 }}>العملية: <Words>{s.operation}</Words></p>}
      {s.plan && <p style={{ margin: 0 }}>التخدير: {PLAN_AR[s.plan]}</p>}</div>
    <ol style={{ margin: 0, paddingInlineStart: '6mm', display: 'grid', gap: '1.5mm' }}>{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
    {s.anaesthetist && <p style={{ margin: 0, marginTop: '4mm', fontSize: '9.5pt' }}>طبيب التخدير: <Words>{s.anaesthetist}</Words></p>}
  </article>
}
