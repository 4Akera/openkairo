// /design · Components (design-system.md §4, §7): every kit export, variant × size × state. Hover and focus are drawn with the
// classes the pointer and the keyboard turn on, so every state shows at once; everything else is live and can be tried.
// The controls are here; words, notices and tables in Content, frames and menus in Layout, the patient and editing in Rows, the bed
// board and the row marks in Board.
import { useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { Button, Chip, Field, IconButton, Input, NumberInput, SearchInput, Segmented, Select, Switch, Textarea, ThemeToggle } from '../../ui'
import { Columns, Group, Sample } from './Frame'
import { Content } from './Content'
import { Layout } from './Layout'
import { Rows } from './Rows'
import { Board } from './Board'
import { FREQUENCIES, REASONS } from './fixtures'

type Variant = 'primary' | 'soft' | 'outline' | 'ghost' | 'danger' | 'danger-ghost'
const VARIANTS: [Variant, string][] = [['primary', 'Sign'], ['soft', 'Add note'], ['outline', 'Cancel'], ['ghost', 'More'], ['danger', 'Delete'], ['danger-ghost', 'Remove']]
// what the pointer turns on (each recipe's hover: classes) and the one focus look (focus-ring's outline)
const HOVER: Record<Variant, string> = { primary: 'bg-accent-hover', soft: 'ring-1 ring-inset ring-accent-line', outline: 'bg-hover', ghost: 'bg-hover text-fg', danger: 'bg-danger/90', 'danger-ghost': 'bg-danger-soft text-danger' }
const FOCUS = 'outline-2 outline-offset-2 outline-focus'
const STATES: [string, (v: Variant) => { className?: string; disabled?: boolean; loading?: boolean }][] = [
  ['Rest', () => ({})], ['Hover', (v) => ({ className: HOVER[v] })], ['Focus', () => ({ className: FOCUS })], ['Disabled', () => ({ disabled: true })], ['Loading', () => ({ loading: true })]]
const noop = () => {}

export function Components({ side }: { side: boolean }) {
  return <Columns side={side}><div className="grid gap-6"><Actions /><Fields /><Choices /><Content /><Layout /><Rows /><Board /></div></Columns>
}

function Actions() {
  return <Group title="Actions" hint="one primary per region; outline or ghost otherwise; danger for what cannot be undone">
    <Sample title="Button" note="variant × state">
      <div className="w-full overflow-x-auto"><table className="text-12">
        <thead><tr><th />{STATES.map(([s]) => <th key={s} className="px-2 pb-2 text-start font-medium text-faint">{s}</th>)}</tr></thead>
        <tbody>{VARIANTS.map(([v, l]) => <tr key={v}><td className="py-1 pe-3 font-mono text-11 text-faint">{v}</td>
          {STATES.map(([s, p]) => <td key={s} className="px-2 py-1"><Button variant={v} {...p(v)}>{l}</Button></td>)}</tr>)}</tbody>
      </table></div>
    </Sample>
    <Sample title="Sizes" note="xs 24 · sm 28 · md 36; an icon takes the button's size">
      {(['xs', 'sm', 'md'] as const).map((s) => <Button key={s} size={s}><Plus />Add {s}</Button>)}
      {(['xs', 'sm', 'md'] as const).map((s) => <Button key={s} size={s} variant="outline"><Check />Done {s}</Button>)}
    </Sample>
    <Sample title="IconButton" note="sm · md · danger · hover · focus · disabled; always with a title">
      <IconButton title="Close" aria-label="Close"><X /></IconButton><IconButton size="md" title="Close" aria-label="Close"><X /></IconButton>
      <IconButton tone="danger" title="Remove" aria-label="Remove"><Trash2 /></IconButton><IconButton title="Hover" aria-label="Hover" className="bg-hover text-fg"><X /></IconButton>
      <IconButton title="Focus" aria-label="Focus" className={FOCUS}><X /></IconButton><IconButton disabled title="Disabled" aria-label="Disabled"><X /></IconButton>
    </Sample>
  </Group>
}

function Fields() {
  const [drug, setDrug] = useState('Paracetamol'); const [dose, setDose] = useState<number | null>(2.5); const [q, setQ] = useState(''); const [big, setBig] = useState('')
  const [note, setNote] = useState('S: Cough for three days, no fever.\nO: Chest clear.\nPlan: fluids, review in a week.')
  return <Group title="Fields" hint="a label over every control; the sunken fill turns to the surface with the accent edge on focus">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Input" hint="a value and a placeholder"><Input placeholder="Drug name" value={drug} onChange={(e) => setDrug(e.target.value)} /></Field>
      <Field label="Focus" hint="drawn: the accent edge and its ring"><Input readOnly value="Focused" className="border-accent bg-surface ring-3 ring-accent/20" /></Field>
      <Field label="Dense"><Input dense placeholder="A dense field" /></Field>
      <Field label="Changed" changed hint="the dot: not saved yet"><Input defaultValue="Edited" /></Field>
      <Field label="Warn" hint="a flagged value on the bench"><Input tone="warn" defaultValue="7.9" className="tnum" /></Field>
      <Field label="Danger" hint="a critical value on the bench"><Input tone="danger" defaultValue="6.8" className="tnum" /></Field>
      <Field label="Invalid" error="Write a number, like 2.5"><Input aria-invalid defaultValue="2..5" /></Field>
      <Field label="Disabled"><Input disabled value="Read only" readOnly /></Field>
      <Field label="Select"><Select defaultValue="bid">{FREQUENCIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Select, dense"><Select dense defaultValue="od">{FREQUENCIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="NumberInput" hint={`keeps "2." while typing; sends ${dose ?? 'nothing'}`}><NumberInput label="Dose" value={dose} onValue={setDose} /></Field>
      <Field label="SearchInput" hint="Enter picks, never submits"><SearchInput value={q} onChange={setQ} placeholder="Filter services" /></Field>
    </div>
    <Field label="SearchInput, large"><SearchInput size="lg" value={big} onChange={setBig} placeholder="Search or add a patient…" /></Field>
    <Field label="Textarea" hint="autoGrow: it follows the text"><Textarea autoGrow value={note} onChange={(e) => setNote(e.target.value)} /></Field>
  </Group>
}

function Choices() {
  const [freq, setFreq] = useState('bid'); const [why, setWhy] = useState<string[]>(['Side effect']); const [filter, setFilter] = useState('all')
  const [sex, setSex] = useState<'female' | 'male' | 'other'>('female'); const [size, setSize] = useState<'sm' | 'md'>('sm'); const [on, setOn] = useState(true)
  const flip = (w: string) => setWhy(why.includes(w) ? why.filter((x) => x !== w) : [...why, w])
  return <Group title="Choosing" hint="colour marks the choice; the chip, the thumb and the knob also change shape or place">
    <Sample title="Chip, solid" note="one of several; the dot marks the usual one">
      {FREQUENCIES.map(([k, l]) => <Chip key={k} on={freq === k} dot={k === 'tid'} onClick={() => setFreq(k)}>{l}</Chip>)}
      <Chip onClick={noop} className="text-fg ring-line-strong">Hover</Chip><Chip onClick={noop} className={FOCUS}>Focus</Chip><Chip disabled onClick={noop}>Disabled</Chip>
    </Sample>
    <Sample title="Chip, check" note="several at once">{REASONS.map((w) => <Chip key={w} variant="check" on={why.includes(w)} onClick={() => flip(w)}>{w}</Chip>)}</Sample>
    <Sample title="Chip, pill" note="a filter">{['all', 'urgent', 'mine'].map((k) => <Chip key={k} shape="pill" on={filter === k} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : k === 'urgent' ? 'Urgent' : 'Mine'}</Chip>)}</Sample>
    <Sample title="Segmented" note="one of a few: a quiet thumb; ←/→ move">
      <Segmented aria-label="Sex" value={sex} onChange={setSex} options={[['female', 'Female'], ['male', 'Male'], ['other', 'Other']]} />
      <Segmented aria-label="Size" size="sm" value={size} onChange={setSize} options={[['sm', 'Small'], ['md', 'Medium']]} />
    </Sample>
    <Sample title="Switch" note="on · off · disabled"><Switch label="Pharmacy pack" checked={on} onChange={setOn} /><Switch label="Off" checked={false} onChange={noop} /><Switch label="Disabled" checked disabled onChange={noop} /></Sample>
    <Sample title="ThemeToggle" note="segmented · icon: this browser's real choice (the menu one is under Menu)"><ThemeToggle /><ThemeToggle variant="icon" /></Sample>
  </Group>
}
