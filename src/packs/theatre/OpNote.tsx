// Under /op's card (spec/openCare.md §5.8, Q41; the picture #surg-clinic): the operation with its usual time, the side big, the chips
// that rewrite the line (side, priority, surgeon, the anaesthetic wanted, day case or admitted), what the record says before an
// operation (blood thinners, SGLT2 inhibitors, metformin, BMI: shown for the pre-op clinic to weigh, never a stop) and the risks to tell
// (the Theatre's list for this operation). The signed consent form is a scan in the patient's Documents; printing the form waits for printing.
import { compose } from '@core/hooks/composer'
import { useDepartment } from '@core/hooks/organization'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { Chip, Tag } from '@core/ui'
import { operationsOf } from './model'
import { knowOperations, opLine, opWords, type OpSaid } from './line'

const Say = ({ k, children }: { k: string; children: React.ReactNode }) => <span className="flex flex-wrap items-center gap-1.5 text-13"><span className="w-36 shrink-0 text-12 text-faint">{k}</span>{children}</span>
/** blood thinners and the medicines a pre-op weighs, by ATC: antiplatelets, warfarin, the DOACs, heparins, SGLT2 inhibitors, metformin */
const WATCH: [RegExp, string][] = [[/^(atc:)?B01AC/, 'antiplatelet'], [/^(atc:)?B01AA/, 'warfarin'], [/^(atc:)?B01AF|^(atc:)?B01AE/, 'anticoagulant'], [/^(atc:)?B01AB/, 'heparin'],
  [/^(atc:)?A10BK|^(atc:)?A10BD(15|16|19|20|21|24|25|27)/, 'SGLT2 inhibitor'], [/^(atc:)?A10BA02/, 'metformin']]
export function recordFlags(r: Ctx['record']): { word: string; tone: 'warn' | 'neutral' }[] {
  const out: { word: string; tone: 'warn' | 'neutral' }[] = []
  for (const m of (r?.medications ?? []).filter((x) => x.status === 'active')) {
    const hit = WATCH.find(([re]) => re.test(m.drug_code ?? '')); if (hit) out.push({ word: `${m.drug_name}${m.dose_number ? ` ${m.dose_number}` : ''}`, tone: 'warn' })
  }
  const bmi = (r?.values ?? []).filter((v) => v.key === 'bmi').sort((a, b) => b.at.localeCompare(a.at))[0]
  const w = (r?.values ?? []).filter((v) => v.key === 'weight').sort((a, b) => b.at.localeCompare(a.at))[0]
  const h = (r?.values ?? []).filter((v) => v.key === 'height').sort((a, b) => b.at.localeCompare(a.at))[0]
  const b = bmi ? Number(bmi.value) : w && h ? Math.round(Number(w.value) / (Number(h.value) / 100) ** 2) : null
  if (b) out.push({ word: `BMI ${b}`, tone: b >= 35 ? 'warn' : 'neutral' })
  return out
}

export function OpNote({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const { org } = useDepartment()
  const p = items.find((x) => x.function === 'order' && x.params.service_id)
  const svc = p ? ctx.services.find((s) => s.id === p.params.service_id) : undefined
  const theatre = svc?.department_id ?? null
  const ops = theatre ? operationsOf(org, theatre) : []
  knowOperations(ops)   // the next parse of the line carries the usual time and the risks
  if (!p || !svc) return null
  const op = ops.find((o) => o.code === svc.code)
  const said: OpSaid = { ...opWords(''), priority: (p.params.priority as OpSaid['priority']) ?? 'routine', question: (p.params.question_text as string) ?? null,
    ...(() => { const w = ((p.params.as as { words?: Record<string, string> } | undefined)?.words ?? {}); return { side: (w.side && w.side !== 'none' ? w.side : null) as OpSaid['side'], stay: (w.stay ?? null) as OpSaid['stay'],
      technique: (w.technique ?? null) as OpSaid['technique'], surgeon: w.surgeon ?? null } })() }
  const go = (c: Partial<OpSaid>) => compose({ text: opLine(svc.code, said, c) })
  const surgeons = (org?.users ?? []).filter((u) => !u.retired_at && u.roles.some((r) => /surg/i.test(r.role_key))).map((u) => u.name)
  const me = org?.me.name
  const flags = recordFlags(ctx.record)
  const asksSide = !!op?.side
  return <span className="grid gap-2 text-13">
    <span className="flex flex-wrap items-center gap-3"><span className="grid min-w-0 flex-1 gap-0.5"><b className="text-14 font-semibold text-fg">{svc.name}</b>
      <span className="text-12 text-muted">from the Theatre's operations{op?.usual_min ? ` · usual time ${op.usual_min} min` : ''}{asksSide ? ' · it has a side, so the side is asked' : ''}</span></span>
      {asksSide && <span className={`grid w-32 place-items-center rounded-lg bg-surface px-2 py-2 text-center ring-2 ${said.side ? 'ring-accent' : 'ring-warn'}`}>
        <span className={`text-22 font-bold uppercase tracking-wide ${said.side ? 'text-accent' : 'text-warn'}`}>{said.side ?? 'Side?'}</span></span>}</span>
    {asksSide && <Say k="Side">{(['left', 'right', 'both'] as const).map((s) => <Chip key={s} on={said.side === s} onClick={() => go({ side: s })}>{s[0].toUpperCase() + s.slice(1)}</Chip>)}
      {!said.side && <span className="font-medium text-warn">which side? type left, right or both</span>}</Say>}
    <Say k="Priority">{([['routine', 'Elective'], ['urgent', 'Urgent'], ['stat', 'Emergency']] as const).map(([k, l]) => <Chip key={k} on={said.priority === k} onClick={() => go({ priority: k })}>{l}</Chip>)}
      <span className="text-12 text-faint">elective: on the list by weeks waiting</span></Say>
    <Say k="Surgeon">{[...new Set([...(me ? [me] : []), ...surgeons])].slice(0, 3).map((n) => <Chip key={n} on={said.surgeon === n} onClick={() => go({ surgeon: said.surgeon === n ? null : n })}>{n}</Chip>)}
      <Chip on={!said.surgeon} onClick={() => go({ surgeon: null })}>whoever has the list</Chip></Say>
    <Say k="Anaesthetic wanted">{([['general', 'General'], ['spinal', 'Spinal'], ['local', 'Local'], ['anaesthetist', 'The anaesthetist decides']] as const).map(([k, l]) =>
      <Chip key={k} on={said.technique === k} onClick={() => go({ technique: k })}>{l}</Chip>)}</Say>
    <Say k="Stay">{([['day', 'Day case'], ['admitted', 'Admitted']] as const).map(([k, l]) => <Chip key={k} on={said.stay === k} onClick={() => go({ stay: k })}>{l}</Chip>)}
      {said.stay === 'day' && <span className="text-12 text-faint">home the same evening if well</span>}</Say>
    <span className="grid gap-1.5 rounded-lg border border-line bg-surface p-2.5"><span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Before the operation</span>
      <Say k="From the record">{flags.length ? flags.map((f) => <Tag key={f.word} tone={f.tone === 'warn' ? 'warn' : 'neutral'}>{f.word}</Tag>) : <span className="text-muted">no blood thinner, no SGLT2 inhibitor</span>}
        <span className="text-12 text-faint">for the pre-op clinic to weigh; shown, never a stop</span></Say>
      <Say k="Tests"><span className="text-muted">the clinic's preset: <span className="font-mono">#preop</span> on the next line</span></Say></span>
    {(op?.risks?.length ?? 0) > 0 && <span className="grid gap-1.5 rounded-lg border border-line bg-surface p-2.5">
      <span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Consent · the risks told (this operation's list)</span>
      <span className="flex flex-wrap gap-1.5">{op!.risks!.map((r) => <Chip key={r} on variant="check" onClick={() => undefined}>{r}</Chip>)}</span>
      <span className="flex flex-wrap items-center gap-2"><span dir="rtl" lang="ar" className="text-13 text-fg">إقرار بالموافقة على العملية: {svc.name}</span><Tag tone="warn" className="ms-auto">signed paper not scanned yet</Tag></span>
      <span className="text-12 text-faint">The patient signs the form; it is scanned into their Documents, and from then the theatre list says “consent”. The anaesthetic's risks are the pre-op clinic's.</span></span>}
  </span>
}
