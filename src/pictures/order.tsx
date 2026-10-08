// Ordering from the chart with a pack's own word (owner, 2026-10-07; spec §5.1 rule 1, added): /lab is the laboratory pack's, offered
// wherever the Laboratory works for this department, and searches only its tests. As today, the card under the line suggests while
// typing; a word that fits two tests is never guessed; a preset's name brings its tests, each removable; stat and "? the question"
// are the only extras typed. Radiology's /xr /us /ct (a later pack) would be the same, each its section.
import type { ReactNode } from 'react'
import { Send, TriangleAlert, X } from 'lucide-react'
import { Button, Card, Chip, Kbd, Tag, cn } from '@core/ui'
import { App, Label, Tube, type TubeColour } from './kit'

const noop = () => undefined

/** the chart around the composer: the patient's line, then the right column as the chart draws it */
export function Chart({ dept = 'General Practice', who = ['Youssef Nabil', '34 y · M · #30'], safety = <span className="text-warn">Allergies not asked</span>, children }: {
  dept?: string; who?: [string, string]; safety?: ReactNode; children: ReactNode }) {
  return <App dept={dept} user="Dr. Ali Hassan">
    <div className="flex h-14 items-center gap-3 border-b border-line bg-surface px-6 text-14">
      <span className="text-18 font-semibold text-fg">{who[0]}</span><span className="text-muted">{who[1]}</span>
      <span className="text-accent">in consult · 6 min</span><span className="text-faint">|</span>{safety}
    </div>
    <div className="mx-auto grid w-full max-w-3xl gap-3 px-4 py-4"><Card className="grid gap-2 p-3">{children}</Card></div>
  </App>
}
/** the line, as typed */
export const Line = ({ children }: { children: ReactNode }) =>
  <div className="flex h-12 items-center rounded-lg border border-line-strong bg-sunken px-4 font-mono text-16 text-fg">{children}<span className="ms-0.5 h-5 w-px animate-pulse bg-fg" />
    <span className="ms-auto flex items-center gap-2 font-sans text-12 text-faint">?<Kbd>/</Kbd></span></div>
/** the card under the line (never over the record) */
export const Under = ({ children, tone }: { children: ReactNode; tone?: 'warn' | 'danger' }) =>
  <div className={cn('grid gap-2 rounded-lg border bg-sunken p-2', tone === 'warn' ? 'border-warn-line' : tone === 'danger' ? 'border-danger-line' : 'border-line')}>{children}</div>
export const Keys = ({ children }: { children: ReactNode }) => <p className="flex flex-wrap items-center gap-1.5 px-1 text-12 text-muted">{children}</p>
/** one suggestion: the test, its code, its section and tube */
export function Pick({ name, code, section, tube, also, first }: { name: string; code: string; section: string; tube?: TubeColour | 'cup'; also?: string; first?: boolean }) {
  return <div className={cn('flex items-center gap-3 rounded-md px-3 py-2', first ? 'bg-surface ring-1 ring-accent-line' : '')}>
    <span className="grid min-w-0 flex-1"><span className="text-14 text-fg">{name}</span>
      <span className="truncate text-12 text-muted"><span className="font-mono">{code}</span> · {section}{also ? ` · ${also}` : ''}</span></span>
    {tube === 'cup' ? <span className="text-12 text-faint">cup</span> : tube ? <Tube c={tube} /> : null}
    {first && <Kbd>tab</Kbd>}
  </div>
}
/** the drafts, as the chart draws them before Sign */
export function Drafts({ n, to = 'Laboratory', children }: { n: number; to?: string; children: ReactNode }) {
  return <div className="grid gap-0 overflow-hidden rounded-lg border border-line">
    <p className="flex items-center gap-2 bg-surface px-3 py-2 text-13"><Tag tone="accent">Not signed yet</Tag><span className="text-muted">{n} {n === 1 ? 'draft' : 'drafts'} · Sign writes {n === 1 ? 'it' : 'them'}</span></p>
    <div className="grid gap-2 border-t border-dashed border-accent-line bg-accent-soft/40 px-3 py-3">
      <p className="flex items-center gap-2 text-13 text-muted"><Send className="size-4" />Orders · {to}</p>{children}</div>
  </div>
}
export const Test = ({ name, extra, x }: { name: string; extra?: ReactNode; x?: boolean }) =>
  <div className="flex items-center gap-2 text-14"><span className="text-fg">{name}</span>{extra}
    {x && <button type="button" aria-label={`Remove ${name}`} className="ms-auto rounded-sm p-0.5 text-faint hover:text-danger"><X className="size-3.5" /></button>}</div>

/** 1 · the / list: the pack's word under the pack's own name, here because the Laboratory works for General Practice */
export function OrderList() {
  const rows: [string, string, string, string?][] = [['Prescription', '/rx', '/rx metformin 500 bd 30d for dm'], ['Order', '/order', '/order anything: a test, a scan, a department with a question']]
  return <Chart><Line>/</Line><Under>
    <Label className="px-2 pt-1">Record</Label>
    <p className="px-3 text-13 text-faint">Vitals /v · Diagnosis /dx · Allergy /al · Long note /note</p>
    <Label className="px-2 pt-1">Orders and medicines</Label>
    {rows.map(([t, w, e]) => <div key={w} className="grid grid-cols-[10rem_5rem_1fr] items-center px-3 py-1.5 text-14"><span className="text-fg">{t}</span><span className="font-mono text-muted">{w}</span><span className="text-muted">{e}</span></div>)}
    <Label className="px-2 pt-1">Laboratory</Label>
    <div className="grid grid-cols-[10rem_5rem_1fr_auto] items-center rounded-md bg-surface px-3 py-1.5 text-14 ring-1 ring-accent-line"><span className="text-fg">Lab tests</span><span className="font-mono text-muted">/lab</span>
      <span className="text-muted">/lab cbc, lipid, hba1c · /lab dm review</span><Kbd>tab</Kbd></div>
    <Keys><Kbd>↑↓</Kbd> move <Kbd>↵</Kbd> choose <Kbd>tab</Kbd> takes the first <Kbd>esc</Kbd> close</Keys>
  </Under>
    <p className="text-12 text-faint">The word is the pack's, not a setting: a clinic that does not use the laboratory pack has only /order.</p>
  </Chart>
}

/** 2 · typing: only the lab's tests, each with its code, section and tube; a panel that holds the word shows too */
export function OrderTyping() {
  return <Chart><Line>/lab hba1c, cr</Line><Under>
    <Pick first name="Creatinine" code="creat" section="Chemistry" tube="yellow" also="with eGFR worked out" />
    <Pick name="CRP" code="crp" section="Chemistry" tube="yellow" />
    <Pick name="Kidney function" code="kft" section="Chemistry" tube="yellow" also="urea, creatinine, eGFR" />
    <Keys><Kbd>tab</Kbd> takes the first · <Kbd>↓</Kbd> chooses · <Kbd>↵</Kbd> adds as typed: HbA1c → Laboratory · “cr” fits three, so it asks</Keys>
  </Under>
    <p className="text-12 text-faint">Only the Laboratory's tests: “cr” cannot land on a CT or a cardiology referral. The codes shown are how doctors learn the short forms.</p>
  </Chart>
}

/** 3 · ↵ with a word that fits more than one: never guessed — the draft asks, and Sign waits for it */
export function OrderAsk() {
  return <Chart><Line>{''}</Line>
    <Drafts n={2}>
      <Test name="HbA1c" extra={<span className="text-12 text-muted">to Laboratory</span>} x />
      <div className="grid gap-2 rounded-md border border-warn-line bg-surface px-3 py-2">
        <p className="flex items-center gap-2 text-14"><TriangleAlert className="size-4 text-warn" /><span className="text-fg">“cr” fits three: which?</span></p>
        <div className="flex flex-wrap gap-1.5"><Chip onClick={noop}>Creatinine</Chip><Chip onClick={noop}>CRP</Chip><Chip onClick={noop}>Kidney function</Chip></div>
      </div>
    </Drafts>
    <div className="flex items-center gap-2"><span className="text-12 text-warn">Choose one before signing.</span><Button size="sm" className="ms-auto" disabled>Sign</Button></div>
  </Chart>
}

/** 4 · a preset by its name (the clinic's own), its tests each removable; the lab adds what the patient must know; stat and ? the question */
export function OrderSet() {
  return <Chart><Line>/lab troponin stat ? chest pain since morning</Line>
    <Drafts n={6}>
      <p className="text-12 text-faint">From /lab dm review · the clinic's preset</p>
      <Test name="HbA1c" x /><Test name="Fasting glucose" x /><Test name="Lipid profile" x /><Test name="Kidney function" x /><Test name="Urine analysis" x />
      <Test name="Troponin I" extra={<><Tag tone="danger">stat</Tag><span className="text-12 text-muted">? chest pain since morning</span></>} x />
      <p className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2 text-12 text-muted">4 tubes ·
        <Tube c="purple" /> purple <Tube c="yellow" /> yellow <Tube c="grey" /> grey · cup ·
        <span className="font-medium text-warn">fasting 8 hours for glucose and lipids: tell the patient</span></p>
    </Drafts>
    <p className="text-12 text-faint">Typed on the line: only the tests, a preset's name, “stat” and “? the question”. Everything else is in the card.</p>
  </Chart>
}

/** 5 · typed where the Laboratory does not take orders from: it says where /lab orders from */
export function OrderWhere() {
  return <Chart dept="Physiotherapy"><Line>/lab cbc</Line>
    <Under tone="warn"><p className="flex items-center gap-2 px-2 py-1 text-14 text-fg"><TriangleAlert className="size-4 text-warn" />/lab orders from the Laboratory, which does not take orders from Physiotherapy.</p>
      <p className="px-2 pb-1 text-12 text-muted">/order shows what this department can order.</p></Under>
  </Chart>
}

/** 6 · later, a radiology pack: the same, each word its section */
export function OrderScan() {
  return <Chart><Line>/us abd</Line><Under>
    <Pick first name="US abdomen" code="usabd" section="Ultrasound" also="fasting 6 hours" />
    <Pick name="US abdomen and pelvis" code="usap" section="Ultrasound" also="full bladder" />
    <Keys><Kbd>tab</Kbd> takes the first · only Radiology's ultrasound: “abd” cannot land on a CT abdomen</Keys>
  </Under>
    <Drafts n={1} to="Radiology"><Test name="X-ray chest PA" extra={<span className="text-12 text-muted">? pneumonia · from /xr chest ? pneumonia</span>} x /></Drafts>
    <p className="text-12 text-faint">Later, with a radiology pack: /xr, /us, /ct, /mri, each its section of Radiology. “left” and “right” the only other word.</p>
  </Chart>
}
