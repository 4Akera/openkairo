// /design · Tokens (design-system.md §2.1–2.2): every colour token with its utilities, what it is for, the value this browser
// computed for it, and the text that sits on it with its live contrast. The summary on top reads both themes, whichever shows.
import { Badge, Callout, Card, Heading, cn } from '../../ui'
import { Columns } from './Frame'
import { HAIRLINES, ON, PAIRS, check, hex, readTokens, type Checked, type Values } from './contrast'
import { useLive } from './live'

// [token, css variable, the swatch's fill, its utilities, what it is for]; selection has no utility (only ::selection)
type Tok = [string, string, string, string, string]
const GROUPS: [string, Tok[]][] = [
  ['Surfaces', [['canvas', '--canvas', 'bg-canvas', 'bg-canvas', 'the page'], ['surface', '--surface', 'bg-surface', 'bg-surface', 'cards, panels, the banner'],
    ['raised', '--raised', 'bg-raised', 'bg-raised', 'menus, the ⌘K palette; dark tells it apart by a lighter step'], ['sunken', '--sunken', 'bg-sunken', 'bg-sunken', 'inputs, wells, table heads, neutral tags'],
    ['hover', '--hover', 'bg-hover', 'bg-hover', 'the row or quiet button under the pointer (a tint)'], ['overlay', '--overlay', 'bg-overlay', 'bg-overlay', 'the scrim behind ⌘K, the one overlay'],
    ['band', '--band', 'bg-band', 'bg-band fill-band', "a chart's reference range"], ['selection', '--selection', '', '::selection', 'selected text'],
    ['paper', '--paper', 'bg-paper', 'bg-paper', 'always white: QR codes, print, a switch knob']]],
  ['Lines and focus', [['line', '--line', 'bg-line', 'border-line divide-line ring-line', 'hairlines: card edges, dividers, a bare border'],
    ['line-strong', '--line-strong', 'bg-line-strong', 'border-line-strong ring-line-strong', 'input edges, hover edges, a switch off'],
    ['focus', '--focus', 'bg-focus', 'focus-ring outline-focus', 'the one focus ring: 2 px, 2 px out']]],
  ['Text', [['fg', '--fg', 'bg-fg', 'text-fg', 'text'], ['muted', '--fg-muted', 'bg-muted', 'text-muted', 'labels, hints, status words'],
    ['faint', '--fg-faint', 'bg-faint', 'text-faint', 'times, record numbers, units, placeholders, empty states']]],
  ['Accent', [['accent', '--accent', 'bg-accent', 'bg- text- ring- border- fill-accent', 'the primary action, links, the current chip, the rail'],
    ['accent-hover', '--accent-hover', 'bg-accent-hover', 'bg-accent-hover', 'the primary action under the pointer'], ['accent-fg', '--accent-fg', 'bg-accent-fg', 'text-accent-fg', 'text on an accent fill'],
    ['accent-soft', '--accent-soft', 'bg-accent-soft', 'bg-accent-soft', 'selected row, current nav item, drafts'], ['accent-line', '--accent-line', 'bg-accent-line', 'border- ring-accent-line', 'the edge of an accent-soft area']]],
  ['Danger', [['danger', '--danger', 'bg-danger', 'text- bg-danger', 'critical values, allergies, errors, destructive actions'], ['danger-fg', '--danger-fg', 'bg-danger-fg', 'text-danger-fg', 'on a danger fill'],
    ['danger-soft', '--danger-soft', 'bg-danger-soft', 'bg-danger-soft', 'a critical row, an error notice'], ['danger-line', '--danger-line', 'bg-danger-line', 'border- ring-danger-line', 'its edge']]],
  ['Warn', [['warn', '--warn', 'bg-warn', 'text- bg-warn', 'abnormal values, warnings to confirm, unsaved, to review'], ['warn-fg', '--warn-fg', 'bg-warn-fg', 'text-warn-fg', 'on a warn fill'],
    ['warn-soft', '--warn-soft', 'bg-warn-soft', 'bg-warn-soft', 'a warning notice, a flagged input'], ['warn-line', '--warn-line', 'bg-warn-line', 'border- ring-warn-line', 'its edge']]],
  ['Ok', [['ok', '--ok', 'bg-ok', 'text- bg-ok', 'normal, saved, reviewed, none known'], ['ok-fg', '--ok-fg', 'bg-ok-fg', 'text-ok-fg', 'on an ok fill'],
    ['ok-soft', '--ok-soft', 'bg-ok-soft', 'bg-ok-soft', 'a done notice'], ['ok-line', '--ok-line', 'bg-ok-line', 'border- ring-ok-line', 'its edge']]],
  ['Info', [['info', '--info', 'bg-info', 'text- bg-info', 'in progress, orders out, neutral notices'], ['info-fg', '--info-fg', 'bg-info-fg', 'text-info-fg', 'on an info fill'],
    ['info-soft', '--info-soft', 'bg-info-soft', 'bg-info-soft', 'a notice'], ['info-line', '--info-line', 'bg-info-line', 'border- ring-info-line', 'its edge']]],
]
const ALL = GROUPS.flatMap(([, t]) => t)
const TEXT: Record<string, string> = { fg: 'text-fg', muted: 'text-muted', faint: 'text-faint', accent: 'text-accent', 'accent-fg': 'text-accent-fg', danger: 'text-danger', 'danger-fg': 'text-danger-fg',
  warn: 'text-warn', 'warn-fg': 'text-warn-fg', ok: 'text-ok', 'ok-fg': 'text-ok-fg', info: 'text-info', 'info-fg': 'text-info-fg', focus: 'text-focus' }
const SELECTION = { backgroundColor: 'var(--selection)' }
/** a token's fill: its utility, or the variable for the one with none */
const Fill = ({ t: [key, , fill], className }: { t: Tok; className?: string }) => <span data-token={key} className={cn(fill, className)} style={fill ? undefined : SELECTION} />
const EMPTY: Values = {}

export function Tokens({ side }: { side: boolean }) {
  const light = useLive(readTokens, EMPTY), dark = useLive(readTokens, EMPTY)
  const fails = [...check(light.value).map((c) => ({ ...c, t: 'light' })), ...check(dark.value).map((c) => ({ ...c, t: 'dark' }))].filter((c) => c.r != null && c.r < c.min)
  const read = Object.keys(light.value).length > 0 && Object.keys(dark.value).length > 0
  return <div className="grid gap-4">
    {/* both themes, read whatever shows: the probes are drawn but never seen */}
    {(['light', 'dark'] as const).map((t) => { const l = t === 'light' ? light : dark
      return <div key={`${t}.${l.key}`} ref={l.ref} data-theme={t} hidden>{ALL.map((x) => <Fill key={x[0]} t={x} />)}</div> })}
    {!read ? <p className="text-14 text-faint">Reading the tokens…</p>
      : <Callout tone={fails.length ? 'danger' : 'ok'} title={fails.length ? `${fails.length} of ${PAIRS.length * 2} pairs fail AA` : `All ${PAIRS.length} pairs pass AA · light · dark`}>
        {fails.length > 0 && <p className="text-13">{fails.map((f) => `${f.fg} on ${f.bg} (${f.t} ${f.r!.toFixed(2)}, needs ${f.min})`).join(' · ')}</p>}
        <p className="text-13 text-muted">Computed now, from the colours this browser resolved for every token in both themes (WCAG 2.x: text 4.5:1, the focus ring 3:1). Hairlines are below 3:1 by design; with more contrast asked for, input edges reach it.</p>
      </Callout>}
    <Columns side={side}><Swatches /></Columns>
  </div>
}

function Swatches() {
  const { ref, value, key } = useLive(readTokens, EMPTY)
  return <div key={key} ref={ref} className="grid gap-5">
    {GROUPS.map(([title, toks]) => <section key={title} className="grid gap-2 @container"><Heading>{title}</Heading>
      <div className="grid gap-2 @2xl:grid-cols-2 @5xl:grid-cols-3">{toks.map((t) => <Swatch key={t[0]} t={t} v={value} />)}</div></section>)}
    <section className="grid gap-2"><Heading>Hairlines</Heading>
      <Card className="grid gap-1 p-3 text-12 text-muted">{check(value, HAIRLINES).map((c) => <p key={c.fg + c.bg} className="flex flex-wrap gap-x-2"><span className="font-medium text-fg">{c.fg}</span>on {c.bg}
        <span className="tnum">{c.r?.toFixed(2) ?? '…'}</span><span className="text-faint">below {c.min}:1 by design: a control is told by its label, fill and focus ring</span></p>)}</Card></section>
  </div>
}

function Swatch({ t, v }: { t: Tok; v: Values }) {
  const [key, variable, , utils, use] = t; const c = v[key]; const on = ON[key]
  return <Card className="flex min-w-0 flex-col overflow-hidden">
    <div className="flex items-start gap-3 p-3">
      <Fill t={t} className="size-9 shrink-0 rounded-lg ring-1 ring-inset ring-line" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2"><span className="text-13 font-medium text-fg">{key}</span><span className="font-mono text-11 text-faint">{variable}</span></p>
        <p className="font-mono text-11 text-muted">{utils}</p><p className="text-12 text-faint">{use}</p>
      </div>
      <span className="shrink-0 font-mono text-11 text-muted tnum">{c ? hex(c) : '…'}</span>
    </div>
    {on && <ul className={cn('mt-auto flex flex-wrap gap-x-4 gap-y-1 px-3 py-2', t[2])} style={t[2] ? undefined : SELECTION}>{check(v, on.map(([fg, min]) => ({ fg, bg: key, min }))).map((p) => <Pair key={p.fg} p={p} />)}</ul>}
  </Card>
}

/** the text in its own colour on the background, with the ratio: it reads, or it says it fails */
function Pair({ p }: { p: Checked }) {
  const pass = p.r != null && p.r >= p.min
  return <li className={cn('inline-flex items-center gap-1.5 text-12', TEXT[p.fg])}>
    {p.fg === 'focus' ? <span aria-hidden className="size-3 rounded-sm outline-2 outline-offset-1 outline-focus" /> : <span className="font-semibold">Aa</span>}
    <span>{p.fg}</span><span className="tnum">{p.r?.toFixed(2) ?? '…'}</span>
    {pass ? <span className="text-11">{p.min === 3 ? '3:1' : 'AA'}</span> : <Badge tone="danger">Fails {p.min}:1</Badge>}
  </li>
}
