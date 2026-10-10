// The action plan as it prints (spec/openCare.md §5.8; the picture #chest-spiro, "the plan a note in Arabic the pack prints"): for the
// patient to take home, in Arabic, right to left — the clinic's header, the patient's name and record number, the plan's date, the
// three zones (every day, worse, emergency), each boxed and marked so it reads in black and white, and the inhalers on the list by name.
// Built 2026-10-10 on the core's print facility (§3.13). *Chosen by Claude at the owner's request:* the core's A5 sheet; the zones'
// Arabic titles (كل يوم، لو التعب زاد، طوارئ) and a heavier frame the worse the zone; the inhalers' names as the list writes them. Pure:
// npm run test:print renders it.
import type { PrintoutProps } from '@core/print/registry'
import { Num, PrintHeader, ReprintMark, Words } from '@core/print/parts'
import { arabicDigits } from '@core/screens/chart/model/arabic'

export const PLAN_KEY = 'lungs.plan'
export interface PlanSheet { name: string; record: number; at: string; zones: { zone: string; text: string }[]; inhalers: string[]; thing: string }
const ZONE_AR: Record<string, { title: string; frame: string }> = {
  'every day': { title: 'كل يوم', frame: '0.3mm solid var(--fg)' },
  worse: { title: 'لو التعب زاد', frame: '0.6mm dashed var(--fg)' },
  emergency: { title: 'طوارئ', frame: '1mm solid var(--fg)' },
}
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const arDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return `${arabicDigits(d)} ${MONTHS[m - 1]} ${arabicDigits(y)}` }

export function PlanSheetView({ data: s, header, reprint }: PrintoutProps<PlanSheet>) {
  return <article dir="rtl" lang="ar" className="text-fg" style={{ fontSize: '11pt', lineHeight: 1.5, display: 'grid', gap: '4mm' }}>
    <PrintHeader header={header} />
    <div style={{ textAlign: 'center' }}><p style={{ margin: 0, fontSize: '14pt', fontWeight: 600 }}>خطة التعامل مع الصدر</p>
      <p style={{ margin: 0, fontSize: '9pt' }}>{arDate(s.at)}</p><ReprintMark at={reprint} style={{ marginTop: '1mm', display: 'inline-block' }} /></div>
    <p style={{ margin: 0 }}>الاسم: <b><Words>{s.name}</Words></b> · ملف <Num>{s.record}</Num></p>
    {s.zones.map((z) => { const ar = ZONE_AR[z.zone] ?? { title: z.zone, frame: '0.3mm solid var(--fg)' }
      return <section key={z.zone} style={{ border: ar.frame, borderRadius: '2mm', padding: '2.5mm 3mm', breakInside: 'avoid' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '12pt' }}>{ar.title}</p><p style={{ margin: 0 }}>{z.text}</p></section> })}
    {s.inhalers.length > 0 && <div><p style={{ margin: 0, fontWeight: 600 }}>بخاخاتك:</p>
      <ul style={{ margin: 0, paddingInlineStart: '5mm' }}>{s.inhalers.map((x) => <li key={x}><Words>{x}</Words></li>)}</ul></div>}
  </article>
}
