// /design · Components, the words and notices: headings, badges and tags in every tone, keys, avatars, callouts, empty and
// loading states, label and value pairs, a result's analytes and an order's steps (fixtures: Demo Patient).
import { FlaskConical, Inbox, Plus, TriangleAlert } from 'lucide-react'
import { AnalyteTable, Avatar, Badge, Button, Callout, Card, Count, Empty, Heading, IconButton, KV, Kbd, Skeleton, Spinner, Steps, Tag, type Tone } from '../../ui'
import { Group, Sample } from './Frame'
import { PANEL, STEPS, STEPS_FAILED } from './fixtures'

const TONES: Tone[] = ['neutral', 'accent', 'danger', 'warn', 'ok', 'info']
const TONE_WORD: Record<Tone, string> = { neutral: 'Final', accent: 'This visit', danger: 'Critical', warn: 'Preliminary', ok: 'Reviewed', info: 'Corrected' }
const CALLOUT: Record<Tone, [string, string]> = {
  neutral: ['A note', 'Nothing is wrong; this is for your information.'], accent: ['Drafts', '3 entries are not signed yet.'],
  danger: ['Could not sign', 'The server refused: this visit was closed by Dr. Demo at 12:10.'], warn: ['Check before signing', 'Penicillin allergy recorded; amoxicillin is a penicillin.'],
  ok: ['Sent', 'The request went to the Laboratory.'], info: ['Preliminary', 'This result may still change.'],
}

export function Content() {
  return <>
    <Group title="Words on a row" hint="a Badge is a status (with a ring); a Tag is a word on a row (none); colour always comes with the word">
      <Sample title="Heading" note="muted · accent · danger, with a count and actions">
        <div className="grid w-full gap-2 sm:grid-cols-3">
          <Heading count={4}>Problems</Heading><Heading tone="accent" count="1 new">This visit</Heading>
          <Heading tone="danger" right={<IconButton title="Add an allergy" aria-label="Add an allergy"><Plus /></IconButton>}>Allergies</Heading>
        </div>
      </Sample>
      <Sample title="Badge" note="every tone, and with an icon">{TONES.map((t) => <Badge key={t} tone={t}>{TONE_WORD[t]}</Badge>)}<Badge tone="danger" icon={TriangleAlert}>Penicillin</Badge></Sample>
      <Sample title="Tag" note="every tone, and with an icon">{TONES.map((t) => <Tag key={t} tone={t}>{t}</Tag>)}<Tag tone="info" icon={FlaskConical}>Sample taken</Tag></Sample>
      <Sample title="Count · Kbd" note="a key takes the colour around it, so it reads on any fill">
        <Count>12</Count><span className="text-13 text-muted">Press <Kbd>/</Kbd> to write, <Kbd>⌘</Kbd><Kbd>↵</Kbd> to sign</span>
        <Button size="sm">Sign all <Kbd>⌘↵</Kbd></Button><Button size="sm" variant="outline">Close <Kbd>esc</Kbd></Button>
      </Sample>
      <Sample title="Avatar" note="sm · md · lg · muted; titles are skipped (Dr. Demo Doctor → DD)">
        <Avatar size="sm" name="Dr. Demo Doctor" /><Avatar name="Sample Nurse" /><Avatar size="lg" name="Test Receptionist" /><Avatar muted name="Former User" />
      </Sample>
    </Group>
    <Group title="Notices" hint="in the flow of the page, never over it; danger and warn are read out as alerts">
      {TONES.map((t) => <Callout key={t} tone={t} title={CALLOUT[t][0]} actions={t === 'warn' ? <><Button size="xs" variant="outline">Sign anyway</Button><Button size="xs" variant="ghost">Change it</Button></> : undefined}>
        <p>{CALLOUT[t][1]}</p></Callout>)}
      <Callout tone="neutral" icon={false}>A callout with no icon, for a quiet line of help.</Callout>
    </Group>
    <Group title="Empty and loading">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><Empty icon={Inbox} action={<Button size="sm" variant="outline">Add a service</Button>}>No services yet.</Empty></Card>
        <Card className="p-3"><Heading>Allergies</Heading><Empty size="sm">Not asked yet.</Empty><Heading className="mt-2">Medicines</Heading><Empty size="sm">None recorded.</Empty></Card>
        <Card aria-busy className="grid gap-3 p-4"><Skeleton className="h-4 w-1/3" /><Skeleton lines={3} /></Card>
        <Card className="grid place-items-center p-4"><Spinner label="Opening the record" /></Card>
      </div>
    </Group>
    <Group title="Details, values and progress" hint="a flag is never colour alone: a glyph (↓ ↑ ‼), bold, and the word for a screen reader; a critical row is tinted">
      <Sample title="KV"><KV items={[['Author', 'Dr. Demo Doctor'], ['Signed', 'today 09:14'], ['Department', 'General Practice'], ['Versions', '2 (corrected at 09:30)']]} /></Sample>
      <Sample title="AnalyteTable" note="with Before; LL and HH keep their direction"><div className="w-full overflow-x-auto"><AnalyteTable rows={PANEL} showPrevious /></div></Sample>
      <Sample title="AnalyteTable, dense"><div className="w-full overflow-x-auto"><AnalyteTable dense rows={PANEL.slice(0, 3)} /></div></Sample>
      <Sample title="Steps" note="done · now · to come · failed"><Steps steps={STEPS} /><Steps steps={STEPS_FAILED} /><Steps dense steps={STEPS} /></Sample>
    </Group>
  </>
}
