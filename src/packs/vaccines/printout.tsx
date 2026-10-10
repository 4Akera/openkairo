// The child's vaccination card as it prints (spec/openCare.md §5.8, Q26 b; the picture #vax-room, "The child's card · printout"): in
// Arabic, right to left — the clinic's header and the room, the child's name, birth date and record number, each visit's doses by the
// schedule's age with their date (a dose copied from the MOHP card marked *), then what is due now or the next visit worked out. Built
// 2026-10-10 on the core's print facility (§3.13). *Chosen by Claude at the owner's request:* the paper is the core's A5 sheet (the
// picture says A6, which the core does not have: asked); the doses are grouped by the day given, each row named by the schedule's age
// of its national doses (else the child's age that day); the vaccines' Arabic names are this pack's own words. Pure: npm run test:print
// renders it.
import type { PrintoutProps } from '@core/print/registry'
import { Num, PrintHeader, ReprintMark, Words } from '@core/print/parts'
import { arabicDigits } from '@core/screens/chart/model/arabic'
import { ageWords, statusOf, summaryOf, type Dose, type RowState, type Schedule } from './schedule'

export const CARD_KEY = 'vaccines.card'
/** the vaccines' names on the card, in Arabic (as the MOHP card says them) */
const AR: Record<string, string> = { hepb: 'الكبدي ب', opv: 'شلل الأطفال', bcg: 'الدرن', penta: 'الخماسي', ipv: 'السولك', vita: 'فيتامين أ', mmr: 'الحصبة والحصبة الألمانية والنكاف',
  dtp: 'الثلاثي البكتيري', pcv: 'المكورات الرئوية', rota: 'الروتا', var: 'الجديري المائي', hepa: 'الكبدي أ', flu: 'الإنفلونزا', tt: 'التيتانوس', mening: 'الالتهاب السحائي' }
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const parts = (day: string) => day.slice(0, 10).split('-').map(Number)
/** 2026-06-08 → ٨ يونيو ٢٠٢٦ */
export const arDate = (day: string) => { const [y, m, d] = parts(day); return `${arabicDigits(d)} ${MONTHS[m - 1]} ${arabicDigits(y)}` }
/** 2026-12-08 → الثلاثاء ٨ ديسمبر */
export const arDay = (day: string) => { const [y, m, d] = parts(day); return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${arabicDigits(d)} ${MONTHS[m - 1]}` }
/** the schedule's age in Arabic: Birth → الولادة, 2 mo → شهران, 4 mo → ٤ شهور, 12 mo → ١٢ شهرًا, 2 y → ٢ سنة */
export function arAge(age: string): string {
  if (/birth/i.test(age)) return 'الولادة'
  const mo = age.match(/^(\d+) mo$/); if (mo) { const n = +mo[1]; return n === 1 ? 'شهر' : n === 2 ? 'شهران' : n <= 10 ? `${arabicDigits(n)} شهور` : `${arabicDigits(n)} شهرًا` }
  const wk = age.match(/^(\d+) wk$/); if (wk) return `${arabicDigits(+wk[1])} أسابيع`
  const y = age.match(/^(\d+) y$/); if (y) return +y[1] === 1 ? 'سنة' : +y[1] === 2 ? 'سنتان' : `${arabicDigits(+y[1])} سنوات`
  return /pregnan/i.test(age) ? 'أثناء الحمل' : age
}
/** a dose's name in Arabic: the series and its number as the schedule names it (OPV 0 → شلل الأطفال صفرية; a booster says so); a
 *  row named with no number (the optional rows) takes its dose's number where its series has several doses */
export function arName(s: Pick<RowState['row'], 'vaccine' | 'name'> & { dose?: number }, several = false): string {
  const base = AR[s.vaccine] ?? s.name.replace(/\s*\d+$/, ''); const n = s.name.match(/ (\d+)$/)?.[1] ?? (several && s.dose != null ? String(s.dose) : undefined)
  if (n === '0') return s.vaccine === 'opv' ? `${base} صفرية` : base
  if (n) return `${base} ${arabicDigits(n)}`
  return /booster/i.test(s.name) ? `${base} (جرعة منشطة)` : base
}

export interface CardRow { age: string; vaccines: string; date: string; card: boolean }
export interface VaxCard { name: string; birth: string | null; record: number; place: string; rows: CardRow[]; now: string | null; next: { age: string; on: string; names: string } | null; thing: string }
/** the card as the record stands: the doses given, one row a day given (here or from the card), then what is due now or next */
export function vaxCardOf(schedule: Schedule, doses: Dose[], child: { name: string; birth: string | null; record: number }, place: string, today: string, pregnant = false): VaxCard {
  const states = statusOf(schedule.rows, doses, child.birth, today, pregnant)
  const name = (r: RowState['row']) => arName(r, schedule.rows.filter((x) => x.vaccine === r.vaccine).length > 1)
  const given = states.filter((s) => s.state === 'given' && s.given)
  const days = [...new Set(given.map((s) => s.given!.given_at.slice(0, 10)))].sort()
  const rows = days.map((day): CardRow => {
    const those = given.filter((s) => s.given!.given_at.slice(0, 10) === day)
    const national = those.find((s) => s.row.national)
    return { age: arAge(national ? national.row.age : child.birth ? ageWords(child.birth, day) : ''), vaccines: those.map((s) => name(s.row)).join('، '),
      date: `${arabicDigits(+day.slice(8, 10))}/${arabicDigits(+day.slice(5, 7))}${day.slice(0, 4) !== today.slice(0, 4) ? `/${arabicDigits(+day.slice(2, 4))}` : ''}`,
      card: those.some((s) => s.given!.source === 'card') }
  })
  const s = summaryOf(states); const pending = [...s.overdue, ...s.due]
  const nextRows = s.next ? states.filter((x) => x.row.national && x.row.age === s.next!.row.age && x.state === 'later') : []
  return { name: child.name, birth: child.birth, record: child.record, place, rows,
    now: pending.length ? pending.map((x) => name(x.row)).join('، ') : null,
    next: !pending.length && s.next ? { age: arAge(s.next.row.age), on: arDay(s.next.dueOn), names: nextRows.map((x) => name(x.row)).join('، ') } : null,
    thing: `#${child.record} · ${given.length} ${given.length === 1 ? 'dose' : 'doses'}` }
}

const cell = { padding: '1mm 1.5mm', borderTop: '0.2mm solid var(--line)', verticalAlign: 'top' } as const
export function VaxCardSheet({ data: c, header, reprint }: PrintoutProps<VaxCard>) {
  return <article dir="rtl" lang="ar" className="text-fg" style={{ fontSize: '10.5pt', lineHeight: 1.45, display: 'grid', gap: '3mm' }}>
    <PrintHeader header={header} />
    <div style={{ textAlign: 'center' }}><p style={{ margin: 0, fontSize: '14pt', fontWeight: 600 }}>كارت التطعيمات</p>
      <p style={{ margin: 0, fontSize: '9pt' }}><Words>{c.place}</Words></p><ReprintMark at={reprint} style={{ marginTop: '1mm', display: 'inline-block' }} /></div>
    <p style={{ margin: 0 }}>الاسم: <b><Words>{c.name}</Words></b>{c.birth && <> · الميلاد {arDate(c.birth)}</>} · ملف <Num>{c.record}</Num></p>
    {c.rows.length ? <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}><tbody>{c.rows.map((r, i) => <tr key={i}>
      <td style={{ ...cell, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.age}</td><td style={cell}>{r.vaccines}</td><td style={{ ...cell, whiteSpace: 'nowrap' }}>{r.date}{r.card ? ' *' : ''}</td></tr>)}</tbody></table>
      : <p style={{ margin: 0 }}>لا توجد تطعيمات مسجلة بعد.</p>}
    {c.now && <p style={{ margin: 0, borderTop: '0.3mm solid var(--fg)', paddingTop: '1.5mm', fontWeight: 600 }}>مستحق الآن: {c.now}</p>}
    {c.next && <div style={{ borderTop: '0.3mm solid var(--fg)', paddingTop: '1.5mm' }}><p style={{ margin: 0, fontWeight: 600 }}>الموعد القادم: {c.next.age} · {c.next.on}</p>
      {c.next.names && <p style={{ margin: 0, fontSize: '9.5pt' }}>{c.next.names}</p>}</div>}
    {c.rows.some((r) => r.card) && <p style={{ margin: 0, fontSize: '8.5pt' }}>* من كارت وزارة الصحة</p>}
  </article>
}
