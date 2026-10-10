// The theatre pack's printouts (spec/openCare.md §5.8, Q41–Q42; the pictures #theatre-list, Print the list, and #surg-clinic, Print the
// form), built 2026-10-10 on the core's print facility (§3.13):
// - the operating list (theatre.list): the day, each room with its session and its cases in their order — the time, the patient, the
//   operation and its side, the surgeon and the anaesthetist, ASA, where it stands — the emergencies not yet in a room first;
// - the consent form (theatre.consent): in Arabic for the patient to sign — the operation, the side written out, the surgeon, the
//   anaesthetic wanted, the risks told (the Theatre's list for the operation, as its settings word them), the declaration, and lines to
//   sign for the patient (or the guardian), the doctor and a witness. The signed paper is scanned into Documents as before.
// *Chosen by Claude at the owner's request:* both on the core's A5 sheet (the core has no A4: asked); the declaration's Arabic words;
// the risks printed as the Theatre's settings write them (English), under an Arabic heading. Pure: npm run test:print renders them.
import type { PrintoutProps } from '@core/print/registry'
import { Num, PrintHeader, ReprintMark, Words } from '@core/print/parts'
import { dateTime } from '@core/ui/time'

export const LIST_KEY = 'theatre.list'
export const CONSENT_KEY = 'theatre.consent'

export interface ListCase { time: string; patient: string; age_sex: string; operation: string; side: string | null; surgeon: string; anaesthetist: string; asa: string; stands: string }
export interface OpListSheet { theatre: string; day: string; at: string; rooms: { name: string; sub: string; cases: ListCase[] }[] }
export const listThing = (s: Pick<OpListSheet, 'theatre' | 'day' | 'rooms'>) => [s.theatre, s.day, s.rooms.map((r) => r.name).join('+')].join(' · ')

const th = { textAlign: 'start', fontWeight: 600, fontSize: '7pt', padding: '0.6mm 0.8mm', borderBottom: '0.3mm solid var(--fg)' } as const
const td = { padding: '0.8mm', borderBottom: '0.2mm solid var(--line)', verticalAlign: 'top' } as const
export function OpListSheetView({ data: s, header, reprint }: PrintoutProps<OpListSheet>) {
  return <article className="text-fg" style={{ fontSize: '7.5pt', lineHeight: 1.35, display: 'grid', gap: '3mm' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '4mm', borderBottom: '0.3mm solid var(--fg)', paddingBottom: '2mm' }}>
      <PrintHeader header={header} align="start" />
      <div style={{ textAlign: 'end', flexShrink: 0 }}><p style={{ margin: 0, fontSize: '11pt', fontWeight: 600 }}>Operating list · {s.day}</p>
        <p style={{ margin: 0 }}><Words>{s.theatre}</Words> · printed <Num>{dateTime(s.at)}</Num></p><ReprintMark at={reprint} style={{ marginTop: '1mm' }} /></div>
    </div>
    {s.rooms.map((r) => <section key={r.name} style={{ display: 'grid', gap: '1mm', breakInside: 'avoid' }}>
      <p style={{ margin: 0 }}><b style={{ fontSize: '9pt' }}>{r.name}</b>{r.sub && ` · ${r.sub}`}</p>
      {r.cases.length ? <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['Time', 'Patient', 'Operation', 'Surgeon · anaesthetist', 'ASA', 'Where it stands'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{r.cases.map((c, i) => <tr key={i}><td style={{ ...td, whiteSpace: 'nowrap' }}><Num>{c.time}</Num></td>
          <td style={td}><b><Words>{c.patient}</Words></b> {c.age_sex}</td>
          <td style={td}>{c.operation}{c.side && <b style={{ textTransform: 'uppercase' }}> · {c.side}</b>}</td>
          <td style={td}>{c.surgeon}{c.anaesthetist && <><br />{c.anaesthetist}</>}</td><td style={td}>{c.asa}</td><td style={td}>{c.stands}</td></tr>)}</tbody></table>
        : <p style={{ margin: 0 }}>No cases</p>}
    </section>)}
  </article>
}

export interface ConsentForm { name: string; record: number; age_sex: string; operation: string; side: string | null; surgeon: string | null; technique: string | null; risks: string[]; at: string; thing: string }
const SIDE_AR: Record<string, string> = { left: 'الجانب الأيسر', right: 'الجانب الأيمن', both: 'الجانبين' }
const ANAES_AR: Record<string, string> = { general: 'تخدير كلي', spinal: 'تخدير نصفي', local: 'تخدير موضعي', anaesthetist: 'يحدده طبيب التخدير' }
const line = { borderBottom: '0.3mm solid var(--fg)', minHeight: '8mm' } as const
export function ConsentSheet({ data: c, header, reprint }: PrintoutProps<ConsentForm>) {
  return <article dir="rtl" lang="ar" className="text-fg" style={{ fontSize: '10.5pt', lineHeight: 1.55, display: 'grid', gap: '3mm' }}>
    <PrintHeader header={header} />
    <div style={{ textAlign: 'center' }}><p style={{ margin: 0, fontSize: '14pt', fontWeight: 600 }}>إقرار بالموافقة على عملية جراحية</p>
      <p dir="ltr" style={{ margin: 0, fontSize: '8.5pt' }}>Consent to an operation</p><ReprintMark at={reprint} style={{ marginTop: '1mm', display: 'inline-block' }} /></div>
    <p style={{ margin: 0 }}>الاسم: <b><Words>{c.name}</Words></b> · {c.age_sex} · ملف <Num>{c.record}</Num></p>
    <div style={{ border: '0.3mm solid var(--fg)', padding: '2mm 3mm', display: 'grid', gap: '0.5mm' }}>
      <p style={{ margin: 0 }}>العملية: <b><Words>{c.operation}</Words></b></p>
      {c.side && SIDE_AR[c.side] && <p style={{ margin: 0, fontSize: '13pt', fontWeight: 700 }}>الجهة: {SIDE_AR[c.side]} <span dir="ltr" style={{ fontSize: '10pt' }}>({c.side.toUpperCase()})</span></p>}
      {c.surgeon && <p style={{ margin: 0 }}>الجرّاح: <Words>{c.surgeon}</Words></p>}
      {c.technique && ANAES_AR[c.technique] && <p style={{ margin: 0 }}>التخدير المطلوب: {ANAES_AR[c.technique]}</p>}
    </div>
    {c.risks.length > 0 && <div><p style={{ margin: 0, fontWeight: 600 }}>المخاطر التي شُرحت لي:</p>
      <ul dir="ltr" style={{ margin: 0, paddingInlineStart: '5mm', fontSize: '9.5pt' }}>{c.risks.map((r) => <li key={r}>{r}</li>)}</ul></div>}
    <p style={{ margin: 0 }}>أقر أنا الموقّع أدناه بأن الطبيب شرح لي العملية المذكورة أعلاه وسببها والبدائل المتاحة وما قد يحدث إن لم تُجرَ، والمخاطر المذكورة،
      وأُتيحت لي فرصة السؤال، وأوافق على إجرائها وعلى ما قد تحتاجه أثناءها لسلامتي. مخاطر التخدير يشرحها طبيب التخدير.</p>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3mm 6mm', marginTop: '2mm', fontSize: '9.5pt' }}>
      <div><p style={{ margin: 0 }}>توقيع المريض (أو ولي الأمر وصلته)</p><div style={line} /></div>
      <div><p style={{ margin: 0 }}>توقيع الطبيب</p><div style={line} /></div>
      <div><p style={{ margin: 0 }}>الشاهد</p><div style={line} /></div>
      <div><p style={{ margin: 0 }}>التاريخ والوقت</p><div style={line} /></div>
    </div>
    <p dir="ltr" style={{ margin: 0, fontSize: '8pt', textAlign: 'left' }}>Printed <Num>{dateTime(c.at)}</Num> · the signed form is scanned into the patient&apos;s Documents</p>
  </article>
}
