// ObGyn's cards under the line (spec/openCare.md §5.8, the pictures #anc-visit, #ob-scan, #ob-gyn, #ob-postnatal). Each edits the
// draft the line made: the antenatal check (the weeks from the EDD, the fundus against them, the lie, moves, urine and oedema; at
// booking G and P, the blood group and the risks; what the clinic's schedule says is due, as chips taken into the check), the clinic's
// scan (the fetal weight worked out and its centile, the liquor, placenta and presentation; a small baby a notice), the method (and an
// IUD or implant put in, the base's procedure), the visit after the birth (bleeding, the wound; a birth elsewhere written here). Shown,
// never a stop: nothing waits for a chip.
import { useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { read } from '@core/db/rpc'
import type { ServerEntry } from '@core/db/types'
import type { CardEditorProps } from '@core/screens/visit/commands'
import type { Ctx } from '@core/screens/visit/parse'
import { useDepartment } from '@core/hooks/organization'
import { useFacts } from '@core/hooks/chart'
import { pregnancyOf } from '@core/screens/chart/model/facts'
import { Chip, Input, NumberInput, Tag, cn } from '@core/ui'
import { ANC, ancData, isDevice, methodData, pnData, scanData, scanIn, scanOut, type AncO, type Birth, type PnO } from './lines'
import { bookingOf, centileWord, dueNow, dueWord, fundusFits, gestOf, gestText, gpOf, nextVisit, type Booking } from './pregnancy'
import { noticesOf, scheduleOf, visitsOf } from './settings'

type Q = Record<string, unknown>
const Row = ({ label, children }: { label: string; children: ReactNode }) =>
  <div className="flex flex-wrap items-center gap-1.5 px-1 text-13"><span className="w-28 shrink-0 text-12 text-faint">{label}</span>{children}</div>
const Box = ({ title, tone, children }: { title: string; tone?: 'warn'; children: ReactNode }) =>
  <div className={cn('grid gap-1.5 rounded-lg border bg-surface p-2.5', tone === 'warn' ? 'border-warn-line' : 'border-line')}>
    <p className="text-11 font-medium uppercase tracking-[0.06em] text-faint">{title}</p>{children}</div>
function Choose<T extends string>({ of, on, set }: { of: readonly T[]; on: T | undefined; set: (v: T | undefined) => void }) {
  return <>{of.map((c) => <Chip key={c} data-chip on={on === c} onClick={() => set(on === c ? undefined : c)}>{c}</Chip>)}</>
}
const Notice = ({ title, children }: { title: string; children: ReactNode }) =>
  <div className="flex gap-2.5 rounded-lg bg-warn-soft px-3 py-2 text-14 text-warn ring-1 ring-inset ring-warn-line"><TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
    <div className="grid gap-1"><p className="font-medium">{title}</p><div className="text-13 text-fg">{children}</div></div></div>
const small = 'h-7 text-13'

/** the standing pregnancy and its weeks today, from the record's facts (the chart's own read) */
function usePregnancy(ctx: Ctx) {
  const { org } = useDepartment(); const pt = ctx.record?.patient
  const facts = useFacts(pt?.id ?? null); const now = ctx.now ?? new Date()
  const p = pregnancyOf(facts.data, org?.types, now.toISOString().slice(0, 10))
  const g = p?.pregnant ? gestOf({ lmp: p.lmp, weeks: p.data.weeks, at: p.at }, now) : null
  return { p, g, facts: facts.data }
}
/** this patient's antenatal checks (the booking and what was taken before), read once for the card */
function useChecks(ctx: Ctx) {
  const pt = ctx.record?.patient
  return useQuery({ queryKey: ['record', pt?.id, 'obgyn', 'anc', ctx.departmentId], enabled: !!pt, staleTime: 30_000,
    queryFn: async () => (await read<{ entries: ServerEntry[] }>({ shape: 'record', department_id: ctx.departmentId, patient_id: pt!.id, types: [ANC], limit: 100 })).entries })
}

// ── /anc ──
export function AncCard({ q, set, ctx }: CardEditorProps) {
  const { org } = useDepartment(); const x = ctx as Ctx
  const o = ((q as { obgyn?: AncO }).obgyn ?? {}) as AncO
  const { g } = usePregnancy(x); const checks = useChecks(x)
  const put = (patch: Partial<AncO>) => set(ancData(Object.fromEntries(Object.entries({ ...o, ...patch }).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) as AncO) as unknown as Q)
  useEffect(() => { if (g && o.weeks === undefined) put({ weeks: g.weeks, days: g.days }) }, [g?.weeks, g?.days]) // eslint-disable-line react-hooks/exhaustive-deps
  const booked = bookingOf(checks.data); const booking = booked ?? (o.booking as Booking | undefined) ?? null
  const v = visitsOf(org); const fit = fundusFits(o.sfh, o.weeks !== undefined ? { weeks: o.weeks, days: o.days ?? 0 } : g, v.band, v.from)
  const taken = [...(checks.data ?? []).flatMap((e) => ((e.data as { obgyn?: AncO } | undefined)?.obgyn?.taken ?? []))]
  const due = dueNow(scheduleOf(org), o.weeks ?? g?.weeks ?? null, { age: x.record?.patient.age ?? null, booking }, taken)
  const next = o.weeks !== undefined ? nextVisit(o.weeks, v.every) : null
  useEffect(() => { if (next && o.next_weeks === undefined) put({ next_weeks: next }) }, [next]) // eslint-disable-line react-hooks/exhaustive-deps
  const take = (w: string) => { const t = o.taken ?? []; put({ taken: t.includes(w) ? t.filter((y) => y !== w) : [...t, w] }) }
  const putBooking = (patch: Partial<Booking>) => put({ booking: Object.fromEntries(Object.entries({ ...(o.booking ?? {}), ...patch }).filter(([, y]) => y !== undefined && y !== '')) })
  return <div className="grid gap-2">
    <p className="flex flex-wrap items-center gap-2 px-1 text-13"><b className="text-14 font-semibold text-fg">Antenatal visit{o.weeks !== undefined ? ` · ${o.weeks}+${o.days ?? 0} w` : ''}</b>
      <span className="text-muted">{o.weeks !== undefined ? 'the weeks from the EDD, never typed' : 'no pregnancy with an LMP recorded: /preg lmp … first'}</span></p>
    <Row label="Fundus"><NumberInput label="Fundus" value={o.sfh ?? null} onValue={(n) => put({ sfh: n ?? undefined })} className={cn(small, 'w-16')} /><span className="text-muted">cm</span>
      {fit && <span className={cn('text-13', fit.fits ? 'text-ok' : 'font-medium text-warn')}>{fit.words}</span>}</Row>
    <Row label="Baby's heart"><NumberInput label="Baby's heart" integer value={o.fhr ?? null} onValue={(n) => put({ fhr: n ?? undefined })} className={cn(small, 'w-16')} /><span className="text-muted">/min</span></Row>
    <Row label="Lie"><Choose of={['cephalic', 'breech', 'transverse', 'not sure'] as const} on={o.lie as never} set={(lie) => put({ lie })} />
      <span className="ms-3 text-12 text-faint">Moves</span><Choose of={['felt', 'less'] as const} on={o.moves as never} set={(moves) => put({ moves })} /></Row>
    <Row label="Urine protein"><Choose of={['nil', 'trace', '+', '++', '+++'] as const} on={o.protein as never} set={(protein) => put({ protein })} />
      <span className="ms-3 text-12 text-faint">Oedema</span><Choose of={['none', 'feet', 'face, hands'] as const} on={o.oedema as never} set={(oedema) => put({ oedema })} /></Row>
    {!booked && <Box title="Booking · the first visit of this pregnancy">
      <Row label="Before"><span className="text-muted">G</span><NumberInput label="Gravida" integer value={(o.booking?.gravida as number) ?? null} onValue={(n) => putBooking({ gravida: n ?? undefined })} className={cn(small, 'w-12')} />
        <span className="text-muted">P</span><NumberInput label="Para" integer value={(o.booking?.para as number) ?? null} onValue={(n) => putBooking({ para: n ?? undefined })} className={cn(small, 'w-12')} />
        <span className="text-muted">+</span><NumberInput label="Miscarriages" integer value={(o.booking?.miscarriages as number) ?? null} onValue={(n) => putBooking({ miscarriages: n ?? undefined })} className={cn(small, 'w-12')} />
        <Input aria-label="Before, in words" value={(o.booking?.before as string) ?? ''} onChange={(e) => putBooking({ before: e.target.value })} placeholder="caesarean 2023 (breech)…" className={cn(small, 'w-56')} /></Row>
      <Row label="Blood group"><Choose of={['A', 'B', 'AB', 'O'] as const} on={o.booking?.blood_group as never} set={(blood_group) => putBooking({ blood_group })} />
        <Choose of={['positive', 'negative'] as const} on={o.booking?.rh as never} set={(rh) => putBooking({ rh })} /></Row>
      <Row label="Risks">{([['previous_caesarean', 'previous caesarean'], ['preeclampsia_risk', 'pre-eclampsia risk'], ['diabetes', 'diabetes']] as const).map(([k, l]) => { const rs = (o.booking?.risks as string[] | undefined) ?? []
        return <Chip key={k} data-chip variant="check" on={rs.includes(k)} onClick={() => putBooking({ risks: rs.includes(k) ? rs.filter((r) => r !== k) : [...rs, k] })}>{l}</Chip> })}</Row>
    </Box>}
    {booked && <p className="px-1 text-12 text-muted">{[gpOf(booked), booked.blood_group && `${booked.blood_group} Rh ${booked.rh ?? '?'}`, booked.before].filter(Boolean).join(' · ')}</p>}
    {due.length > 0 && <Box title={`Due at ${o.weeks ?? g?.weeks} weeks · the clinic's schedule`}>
      {due.map((r) => <p key={r.what} className="flex flex-wrap items-center gap-2 text-13">{r.whom !== 'everyone' && <Tag tone="warn">{r.whom.replace(/_/g, ' ')}</Tag>}
        <span className="text-fg">{r.what}</span><span className="text-muted">at {r.from}{r.to !== r.from ? `–${r.to}` : ''} w</span>
        <Chip data-chip className="ms-auto" on={(o.taken ?? []).includes(dueWord(r))} onClick={() => take(dueWord(r))}>Take</Chip></p>)}
      <p className="text-12 text-faint">Each is a chip to take or leave; nothing waits for it. A chip taken is kept on the check; the order or dose itself is its own line (/order, /rx).</p>
    </Box>}
    {next && <p className="px-1 text-12 text-muted">Next visit at {next} w by the clinic&apos;s intervals.</p>}
  </div>
}

// ── /obus: the clinic's scan, a base result ──
export function ScanCard({ q, set, ctx }: CardEditorProps) {
  if ((q as { service?: { name?: string } }).service?.name !== 'Scan in the clinic') return null
  return <Scan q={q} set={set} ctx={ctx} />
}
function Scan({ q, set, ctx }: CardEditorProps) {
  const { org } = useDepartment(); const s = scanIn(q as Q); const { g } = usePregnancy(ctx as Ctx)
  const put = (patch: Partial<ReturnType<typeof scanIn>>) => set(scanData({ ...s, ...patch }) as Q)
  useEffect(() => { if (g && !s.weeks) put({ weeks: g }) }, [g?.weeks, g?.days]) // eslint-disable-line react-hooks/exhaustive-deps
  const out = scanOut(s); const n = noticesOf(org)
  const small_ = out.centile !== null && out.centile < n.efw_low; const big = out.centile !== null && out.centile > n.efw_high
  const lowPool = s.dvp !== undefined && s.dvp < n.dvp_low; const highPool = s.dvp !== undefined && s.dvp > n.dvp_high
  return <div className="grid gap-2">
    <p className="flex flex-wrap items-center gap-2 px-1 text-13"><b className="text-14 font-semibold text-fg">Scan in the clinic{s.weeks ? ` · ${gestText(s.weeks)}` : ''}</b>
      <span className="text-muted">the doctor&apos;s own scan, no order · the weeks from the EDD</span></p>
    <table className="mx-1 w-auto text-13"><thead><tr className="text-11 uppercase tracking-[0.04em] text-faint"><th className="pe-4 text-start font-medium">Measure</th><th className="pe-4 text-start font-medium">mm</th><th className="text-start font-medium">Fits</th></tr></thead>
      <tbody>{(['bpd', 'hc', 'ac', 'fl'] as const).map((k) => { const f = out.fits[k]; const off = f && s.weeks && Math.abs((f.weeks * 7 + f.days) - (s.weeks.weeks * 7 + s.weeks.days)) > 14
        return <tr key={k} className="border-t border-line"><td className="py-0.5 pe-4 uppercase">{k}</td><td className={cn('pe-4 tnum', off && 'text-warn')}>{s[k] ?? '—'}</td><td className={cn('tnum', off && 'text-warn')}>{f ? gestText(f) : '—'}</td></tr> })}</tbody></table>
    {out.grams && <p className="flex flex-wrap items-baseline gap-2 px-1"><b className={cn('text-18 font-semibold tnum', small_ || big ? 'text-warn' : 'text-fg')}>EFW {out.grams.toLocaleString('en-GB')} g</b>
      {out.centile !== null && <span className={cn(small_ || big ? 'text-warn' : 'text-muted')}>{centileWord(out.centile)} centile</span>}
      <span className="text-12 text-faint">Hadlock&apos;s formula from the four; the centile for the weeks (Hadlock 1991). Worked out, never typed.</span></p>}
    <Row label="Liquor"><span className="text-muted">deepest pool</span><NumberInput label="Deepest pool" value={s.dvp ?? null} onValue={(v) => put({ dvp: v ?? undefined })} className={cn(small, 'w-16')} /><span className="text-muted">cm</span>
      {lowPool && <Tag tone="warn">reduced · under {n.dvp_low} cm</Tag>}{highPool && <Tag tone="warn">increased · over {n.dvp_high} cm</Tag>}</Row>
    <Row label="Placenta"><Choose of={['anterior', 'posterior', 'fundal', 'low-lying'] as const} on={s.placenta as never} set={(placenta) => put({ placenta })} /></Row>
    <Row label="Presentation"><Choose of={['cephalic', 'breech', 'transverse'] as const} on={s.presentation as never} set={(presentation) => put({ presentation })} />
      <span className="ms-3 text-12 text-faint">Heart</span><NumberInput label="Fetal heart" integer value={s.fhr ?? null} onValue={(v) => put({ fhr: v ?? undefined })} className={cn(small, 'w-16')} /><span className="text-muted">/min</span></Row>
    {(small_ || lowPool) && <Notice title={small_ ? 'Small for the weeks' : 'The liquor reduced'}>
      {small_ && `EFW on the ${centileWord(out.centile!)} centile${s.ac && out.fits.ac ? `, the AC fits ${gestText(out.fits.ac)}` : ''}`}{small_ && lowPool ? ', ' : ''}{lowPool && `the deepest pool ${s.dvp} cm`}. A notice only: the doctor decides (the cord&apos;s Doppler, the next scan, when and where she gives birth).</Notice>}
  </div>
}

// ── /fp: the method, and a device put in ──
export function MethodCard({ q, set }: CardEditorProps) {
  const d = q as { code?: { codings?: { code: string }[] }; value?: { text?: string }; note?: string }
  if (!d.code?.codings?.some((c) => c.code === 'contraception')) return null
  const m = d.value?.text ?? ''
  return <div className="grid gap-1.5">
    <Row label="Method"><Choose of={['Pills', 'Mini-pill', 'Injection', 'Implant', 'Copper IUD', 'Hormonal IUD', 'Condoms', 'Tubes tied', 'None'] as const} on={m as never} set={(v) => v && set(methodData(v, d.note))} /></Row>
    {isDevice(m) && <Row label="Device, lot"><Input aria-label="Device and lot" value={d.note ?? ''} onChange={(e) => set(methodData(m, e.target.value || undefined))} placeholder="Mirena · levonorgestrel 52 mg · lot TU02FHM" className={cn(small, 'w-80')} /></Row>}
    <p className="px-1 text-12 text-faint">Facts shown, never a stop: the doctor decides. When it is due again comes from the clinic&apos;s intervals.</p>
  </div>
}
export function InsertCard({ q, set }: CardEditorProps) {
  const d = q as { concept?: { text?: string }; outcome?: string; note?: string; status?: string }
  if (!/(IUD|Implant) inserted/.test(d.concept?.text ?? '')) return null
  const note = d.note ?? ''; const field = (k: string) => note.match(new RegExp(`${k} (\\d+(?:\\.\\d+)?) cm`))?.[1] ?? ''
  const withField = (k: string, v: string) => { const rest = note.split(' · ').filter((x) => x && !x.startsWith(`${k} `)); return [...rest, ...(v ? [`${k} ${v} cm`] : [])].join(' · ') }
  return <div className="grid gap-1.5">
    <Row label="How it went"><Choose of={['no problems', 'pain', 'fainted', 'hard to pass'] as const} on={d.outcome as never} set={(outcome) => set({ ...d, outcome: outcome ?? 'no problems' })} /></Row>
    {/IUD/.test(d.concept?.text ?? '') && <Row label="Sounds"><Input aria-label="Sounds" value={field('sounds')} onChange={(e) => set({ ...d, note: withField('sounds', e.target.value) })} className={cn(small, 'w-14')} /><span className="text-muted">cm</span>
      <span className="ms-3 text-12 text-faint">threads cut at</span><Input aria-label="Threads" value={field('threads')} onChange={(e) => set({ ...d, note: withField('threads', e.target.value) })} className={cn(small, 'w-14')} /><span className="text-muted">cm</span></Row>}
    <Row label="The old one"><Input aria-label="The old device" value={note.split(' · ').find((x) => /removed|out/.test(x)) ?? ''} onChange={(e) => set({ ...d, note: [...note.split(' · ').filter((x) => x && !/removed|out/.test(x)), ...(e.target.value ? [e.target.value] : [])].join(' · ') })}
      placeholder="copper IUD removed, intact" className={cn(small, 'w-64')} /></Row>
  </div>
}

// ── /pn: the visit after the birth ──
export function PnCard({ q, set, ctx }: CardEditorProps) {
  const o = ((q as { obgyn?: PnO }).obgyn ?? {}) as PnO
  const { p } = usePregnancy(ctx as Ctx); const now = (ctx as Ctx).now ?? new Date()
  const put = (patch: Partial<PnO>) => set(pnData(Object.fromEntries(Object.entries({ ...o, ...patch }).filter(([, v]) => v !== undefined)) as PnO) as unknown as Q)
  const b = o.birth
  const putBirth = (patch: Partial<Birth>) => { const nb = { where: 'elsewhere' as const, how: 'normal' as const, on: now.toISOString().slice(0, 10), ...b, ...patch }
    const days = Math.max(0, Math.round((now.getTime() - new Date(`${nb.on}T12:00:00`).getTime()) / 86_400_000)); put({ birth: nb, days }) }
  const standing = !!p?.pregnant
  return <div className="grid gap-2">
    <p className="flex flex-wrap items-center gap-2 px-1 text-13"><b className="text-14 font-semibold text-fg">The visit after the birth{o.days !== undefined ? ` · ${Math.floor(o.days / 7)} w` : ''}</b>
      {o.days !== undefined && <span className="text-muted">day {o.days} since the birth</span>}</p>
    {standing && <Box title="The birth · not in her record: write it here" tone="warn">
      <Row label="Born"><Input aria-label="Born on" type="date" value={b?.on ?? ''} onChange={(e) => putBirth({ on: e.target.value })} className={cn(small, 'w-40')} />
        <NumberInput label="Weeks" integer value={b?.weeks ?? null} onValue={(n) => putBirth({ weeks: n ?? undefined })} className={cn(small, 'w-12')} /><span className="text-muted">w</span></Row>
      <Row label="Where"><Choose of={['here', 'elsewhere'] as const} on={b?.where} set={(where) => putBirth({ where: where ?? 'elsewhere' })} />
        <Input aria-label="Where it was" value={b?.place ?? ''} onChange={(e) => putBirth({ place: e.target.value || undefined })} placeholder="Heliopolis, private" className={cn(small, 'w-48')} /></Row>
      <Row label="How"><Choose of={['normal', 'vacuum', 'forceps', 'caesarean'] as const} on={b?.how} set={(how) => putBirth({ how: how ?? 'normal' })} />
        <Input aria-label="Why" value={b?.why ?? ''} onChange={(e) => putBirth({ why: e.target.value || undefined })} placeholder="labour stopped at 6 cm" className={cn(small, 'w-48')} /></Row>
      <Row label="Baby"><Choose of={['boy', 'girl'] as const} on={b?.baby} set={(baby) => putBirth({ baby })} />
        <NumberInput label="Grams" integer value={b?.grams ?? null} onValue={(n) => putBirth({ grams: n ?? undefined })} className={cn(small, 'w-20')} /><span className="text-muted">g</span></Row>
      <p className="px-1 text-12 text-muted">Ends her pregnancy once (the base&apos;s pregnancy, ended: the birth), so her next pregnancy&apos;s Before counts it.</p>
    </Box>}
    <Row label="Bleeding"><Choose of={['none', 'light', 'heavy'] as const} on={o.bleeding} set={(bleeding) => put({ bleeding })} /></Row>
    <Row label="Wound"><Choose of={['healed', 'red', 'oozing', 'opened'] as const} on={o.wound} set={(wound) => put({ wound })} /><span className="text-12 text-faint">a caesarean&apos;s, or the perineum</span></Row>
    <p className="px-1 text-12 text-faint">Mood: /epds (the score the server adds up) · the method: /fp · feeding: breast on this line writes the base&apos;s breastfeeding.</p>
  </div>
}
