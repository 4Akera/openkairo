// The consent form as the surgery pack prints it (spec/openCare.md §5.8; the picture #surg-clinic, Print the form): from the Surgery
// section, for an operation planned and not yet done — to print the form again (lost, or signed on the ward the evening before). In
// Arabic for the patient to sign: the operation, the side written out, the surgeon, the anaesthetic wanted, the risks told (as the order
// carries them, read by their shape), the declaration, and lines to sign for the patient (or the guardian), the doctor and a witness.
// Built 2026-10-10 on the core's print facility (§3.13). *Chosen by Claude at the owner's request:* the core's A5 sheet (no A4 in the
// core: asked); the same words as the form under /op's card, drawn here by this pack's own component (no pack names another). Pure: npm
// run test:print renders it.
import type { PrintoutProps } from '@core/print/registry'
import { Num, PrintHeader, ReprintMark, Words } from '@core/print/parts'
import type { ServerEntry } from '@core/db/types'
import { dateTime } from '@core/ui/time'

export const CONSENT_KEY = 'surgical.consent'
export interface Consent { name: string; record: number; age_sex: string; operation: string; side: string | null; surgeon: string | null; technique: string | null; risks: string[]; at: string; thing: string }
/** the order's own words, read by their shape (an object carrying the risks told or the side), never by the pack that wrote them */
export function wordsOf(entries: ServerEntry[], op: string): { side: string | null; surgeon: string | null; technique: string | null; risks: string[] } {
  const e = entries.filter((x) => x.item === op && !x.hidden).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
  const w = Object.values(e?.data ?? {}).find((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && (Array.isArray((v as { risks?: unknown }).risks) || typeof (v as { side?: unknown }).side === 'string'))
  const str = (v: unknown) => typeof v === 'string' && v ? v : null
  return { side: str(w?.side) === 'none' ? null : str(w?.side), surgeon: str(w?.surgeon), technique: str(w?.technique), risks: Array.isArray(w?.risks) ? (w!.risks as unknown[]).filter((r): r is string => typeof r === 'string') : [] }
}

const SIDE_AR: Record<string, string> = { left: 'الجانب الأيسر', right: 'الجانب الأيمن', both: 'الجانبين' }
const ANAES_AR: Record<string, string> = { general: 'تخدير كلي', spinal: 'تخدير نصفي', local: 'تخدير موضعي', anaesthetist: 'يحدده طبيب التخدير' }
const line = { borderBottom: '0.3mm solid var(--fg)', minHeight: '8mm' } as const
export function ConsentPaper({ data: c, header, reprint }: PrintoutProps<Consent>) {
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
