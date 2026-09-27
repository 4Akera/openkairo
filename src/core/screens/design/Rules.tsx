// /design · Rules (design-system.md §1, §2.1, §6): what the lint rule says, with one wrong and one right each; the naming of the
// tokens; colour never alone; and where things live. The wrong examples are put together from pieces, so the rule, the codemod
// and the token grep this page describes never find them in its source.
import type { ReactNode } from 'react'
import { Badge, Tag, flagMark, flagWord, interpMark, interpWord, trendMark } from '../../ui'
import { Columns, Group } from './Frame'

const wrong = (...p: string[]) => p.join('-')
const RULES: [string, string, ReactNode, ReactNode][] = [
  ['A raw palette class', 'use a token or a kit component', wrong('bg', 'neutral', '50'), 'bg-sunken · text-muted · text-danger · bg-accent-soft'],
  ['A literal colour', 'colours come from the tokens', `style={{ color: '#${'b00'}' }}`, 'className="text-danger" · fill="var(--accent)"'],
  ['An off-scale size, radius, shadow or layer', 'seven sizes, four radii, three shadows, five layers', `${wrong('text', 'sm')} · rounded · ${wrong('shadow', 'lg')} · ${wrong('z', '50')}`, 'text-14 · rounded-sm · shadow-md · z-popover'],
  ['A dark: class', 'the tokens already switch with the theme; a screen that needs one shows the kit is missing a token', `dark${':'}bg-surface`, 'bg-surface (it is already dark in dark)'],
]
const NAMES: [string, string][] = [['danger', "the state's text and fill colour"], ['danger-fg', 'text and icons on a danger fill (-fg always means "on a fill of that colour")'],
  ['danger-soft', 'the tinted background'], ['danger-line', "that background's edge"]]
const Code = ({ children }: { children: ReactNode }) => <code className="rounded-sm bg-sunken px-1 py-px font-mono text-12 text-fg ring-1 ring-inset ring-line">{children}</code>

export function Rules({ side }: { side: boolean }) { return <Columns side={side}><Body /></Columns> }

function Body() {
  return <div className="grid gap-6">
    <Group title="Tokens only" hint="opencare/tokens-only checks every string in src outside the kit: a warning while the screens move to tokens, then an error">
      <ul className="grid gap-4">{RULES.map(([what, why, bad, good]) => <li key={what} className="grid gap-1.5 text-13">
        <p><span className="font-medium text-fg">{what}</span><span className="text-muted">: {why}.</span></p>
        <p className="flex flex-wrap items-center gap-2"><Tag tone="danger">Wrong</Tag><Code>{bad}</Code></p>
        <p className="flex flex-wrap items-center gap-2"><Tag tone="ok">Right</Tag><Code>{good}</Code></p>
      </li>)}</ul>
      <p className="text-13 text-muted">A pack that needs a colour the tokens lack does not invent one: it asks core for a token (a line in styles.css and on this page), because a pack's own colour would have no dark value, no contrast check and no place here.</p>
    </Group>
    <Group title="Naming">
      <ul className="grid gap-1.5 text-13">{NAMES.map(([n, d]) => <li key={n} className="flex flex-wrap items-baseline gap-2"><Code>{n}</Code><span className="text-muted">{d}</span></li>)}</ul>
      <p className="text-13 text-muted">The same four for accent, warn, ok and info. Text has three levels: <span className="text-fg">fg</span>, <span className="text-muted">muted</span>, <span className="text-faint">faint</span>.</p>
    </Group>
    <Group title="Colour never alone" hint="amber and red look alike to many readers, so a state always has a glyph or a word as well">
      <ul className="grid gap-1.5 text-13">
        {(['low', 'high', 'abnormal', 'critical'] as const).map((f) => <li key={f} className="flex items-center gap-2"><span className="w-6 text-center font-semibold text-fg">{flagMark(f)}</span><span className="text-muted">{flagWord(f)}: a flag</span></li>)}
        {(['LL', 'HH'] as const).map((i) => <li key={i} className="flex items-center gap-2"><span className="w-6 text-center font-semibold text-fg">{interpMark(i)}</span><span className="text-muted">{interpWord(i)}: the result's own interpretation keeps its direction</span></li>)}
        {([[7.2, 6.8], [6.8, 7.2], [7.2, 7.2]] as const).map(([a, b]) => <li key={`${a}${b}`} className="flex items-center gap-2"><span className="w-6 text-center font-semibold text-fg">{trendMark(a, b)}</span><span className="text-muted">{a} after {b}: a trend, never a flag arrow (a normal value rising is not "High")</span></li>)}
      </ul>
      <p className="flex flex-wrap items-center gap-2 text-13 text-muted">A critical value is bold, in its tone, with ‼ and the word: <Badge tone="danger">Critical</Badge> Vitals carry no flag yet, so they are shown unflagged.</p>
    </Group>
    <Group title="Where things live">
      <ul className="grid list-disc gap-1.5 ps-5 text-13 text-muted">
        <li>The kit is <Code>@core/ui</Code>, for core screens and packs alike; a pack never copies a recipe or imports another pack.</li>
        <li>Entry aids are cards under the line, in the page's flow: no dropdowns or dialogs over the record. Menus are for the header; ⌘K search is the one overlay.</li>
        <li>Logical sides only (<Code>ms-</Code> <Code>ps-</Code> <Code>start-</Code> <Code>border-s</Code>), so a right-to-left page needs no second style; direction icons flip.</li>
        <li>The theme is this browser's choice, not the user's: it survives sign-out, and each demo port keeps its own.</li>
      </ul>
    </Group>
  </div>
}
