// Her INR table as it prints (spec/openCare.md §5.8, Q37–Q38; the picture #haem-inr, "Her table, in Arabic", Print): in Arabic, right to
// left — the clinic's header, her name and record number, the week day by day from Saturday (each day's tablets in words), the medicine
// with its tablet and the time to take it, the next INR, and the clinic's two lines of advice; today's INR and her target in the corner.
// Built 2026-10-10 on the core's print facility (§3.13). *Chosen by Claude at the owner's request:* the core's A5 sheet; the medicine's
// Arabic name is said only for warfarin (any other as the plan writes it); the week's total in mg under the days. Pure: npm run
// test:print renders it.
import type { PrintoutProps } from '@core/print/registry'
import { Arabic, Num, PrintHeader, ReprintMark, Words } from '@core/print/parts'
import { arabicDigits } from '@core/screens/chart/model/arabic'
import { DAYS_AR, tabletsAr, total, type Target } from './inr'

export const TABLE_KEY = 'haemato.table'
export interface InrTable { name: string; record: number; medicine: string; tablet_mg: number; days: number[]; next_inr: string | null; inr: number | null; target: Target | null; thing: string }
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
/** 2026-10-15 → الخميس ١٥ أكتوبر */
export const arDay = (day: string) => { const [y, m, d] = day.slice(0, 10).split('-').map(Number); return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${arabicDigits(d)} ${MONTHS[m - 1]}` }
/** the same table printed again: her record, the week and the next INR ("#10297 · 32.5 mg a week · 5,5,5,5,5,2.5,5 · next 2026-10-15") */
export const tableThing = (record: number, days: number[], next: string | null | undefined) =>
  `#${record} · ${total(days)} mg a week · ${days.join(',')}${next ? ` · next ${next}` : ''}`
/** the medicine in Arabic: warfarin as the clinics say it, any other as written */
export const medicineAr = (m: string) => /warfarin|marevan/i.test(m) || !m ? 'وارفارين (ماريفان)' : m

const cell = { border: '0.3mm solid var(--fg)', padding: '1.5mm 1mm', textAlign: 'center' } as const
export function InrTableSheet({ data: t, header, reprint }: PrintoutProps<InrTable>) {
  return <article dir="rtl" lang="ar" className="text-fg" style={{ fontSize: '11pt', lineHeight: 1.5, display: 'grid', gap: '4mm' }}>
    <PrintHeader header={header} />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '4mm' }}>
      <div><p style={{ margin: 0, fontSize: '14pt', fontWeight: 600 }}>جدول جرعات السيولة</p>
        <p style={{ margin: 0 }}>الاسم: <b><Words>{t.name}</Words></b> · ملف <Num>{t.record}</Num></p></div>
      <div style={{ textAlign: 'start', fontSize: '9pt' }}>{t.inr != null && <p style={{ margin: 0 }}>نسبة السيولة اليوم <Num>{t.inr}</Num></p>}
        {t.target && <p style={{ margin: 0 }}>المطلوب <Num>{t.target.low.toFixed(1)}–{t.target.high.toFixed(1)}</Num></p>}
        <ReprintMark at={reprint} style={{ marginTop: '1mm' }} /></div>
    </div>
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <thead><tr>{DAYS_AR.map((d) => <th key={d} style={{ ...cell, fontSize: '9.5pt', fontWeight: 600 }}>{d}</th>)}</tr></thead>
      <tbody><tr>{t.days.map((mg, i) => <td key={i} style={{ ...cell, fontSize: '10.5pt' }}>{tabletsAr(mg, t.tablet_mg)}</td>)}</tr></tbody></table>
    <p style={{ margin: 0, fontSize: '9pt' }}>مجموع الأسبوع <Num>{total(t.days)}</Num> مجم</p>
    <Arabic>{medicineAr(t.medicine)} {arabicDigits(t.tablet_mg)} مجم · مرة واحدة يومياً الساعة ٦ مساءً{t.next_inr ? ` · تحليل السيولة القادم: ${arDay(t.next_inr)}` : ''}</Arabic>
    <Arabic>لا تغيّري الجرعة ولا تبدئي دواءً جديداً قبل سؤال العيادة · كُلي الملوخية والخضار الورقية بكمية ثابتة كل أسبوع</Arabic>
  </article>
}
