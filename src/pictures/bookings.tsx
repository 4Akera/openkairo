// Bookings (owner, 2026-10-08): one diary for the clinic. A session is by times or by numbers, chosen per session; a booked patient
// goes into the queue (or a bench's To do) at their time or number and walk-ins fill the gaps (a core change the owner said yes to);
// the desk and the doctor or nurse at the end of a visit book; a booking is the pack's own row, never a record entry (the chart says
// only "Next visit"); a session, or a named doctor where one is available; overbook and places kept for walk-ins are a number per
// session, 0 by default; new or re-visit is a note on the booking; day one reminds by a calls list the desk phones. A bench (radiology)
// books its rooms the same way, and a bench booking always names an order: the doctor's, or the walk-in's made when it is booked.
// The walk-in card always offers Now.
import type { ReactNode } from 'react'
import { CalendarPlus, Phone, Plus, Send, StickyNote } from 'lucide-react'
import { Button, Card, Chip, Fieldset, FormRow, Input, Kbd, ListRow, ListSection, ScreenFrame, Switch, Tag, Textarea, cn, type ScreenView } from '@core/ui'
import { App, Arabic, Label } from './kit'
import { WalkInSteps } from './bench'

const noop = () => undefined
const deskTabs = ['Reception', 'Booked today']

/** a free place to pick: a time or a number, with what it is */
function Place({ at, sub, on, taken }: { at: string; sub?: string; on?: boolean; taken?: boolean }) {
  return <button type="button" disabled={taken} className={cn('grid min-w-20 place-content-center rounded-lg px-3 py-2 text-center ring-1',
    on ? 'bg-accent-soft ring-2 ring-accent' : taken ? 'bg-sunken text-faint ring-line line-through' : 'bg-surface ring-line hover:ring-line-strong')}>
    <span className="text-14 font-semibold tnum text-fg">{at}</span>{sub && <span className="text-11 text-muted">{sub}</span>}</button>
}
/** one session to book into: its day, clinic, doctor and room, how it books, and its free places */
function Session({ day, what, how, left, children, open }: { day: string; what: string; how: string; left: string; children?: ReactNode; open?: boolean }) {
  return <div className={cn('grid gap-2 rounded-lg p-3', open ? 'bg-surface ring-1 ring-accent-line' : 'bg-surface ring-1 ring-line')}>
    <p className="flex flex-wrap items-baseline gap-x-2 text-13"><b className="font-semibold text-fg">{day}</b><span className="text-fg">{what}</span>
      <span className="text-muted">{how}</span><span className="ms-auto text-12 text-faint">{left}</span></p>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
}
/** the note a booking may carry (new or re-visit, or anything the desk must know); billing does not read it */
const Note = ({ value }: { value: string }) =>
  <div className="flex flex-wrap items-center gap-2"><StickyNote className="size-4 text-faint" /><Input readOnly value={value} className="w-full sm:w-80" />
    <Chip>new</Chip><Chip on>re-visit</Chip><span className="text-12 text-faint">a note, optional</span></div>

/** 1 · the desk books: the patient's card (not here today), Book folds out under it */
export function BookDesk() {
  return <App dept="Front desk" user="Mona Said" tabs={deskTabs} tab="Reception">
    <ScreenFrame search={<Input value="0100 455" readOnly className="w-full sm:w-80" />} action={<Button size="sm" variant="outline"><Plus />New patient</Button>}>
      <Card className="grid gap-3 p-4 ring-1 ring-accent-line">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-12 text-faint">10052</span><span className="text-18 font-semibold text-fg">Samira Fawzy</span><span className="text-13 text-muted">58 F · 0100 455 1290</span>
          <span className="text-12 text-faint">last here 14 Sep · Diabetes clinic</span>
          <span className="ms-auto flex gap-2"><Button size="sm" variant="outline"><Send />Send now<Kbd className="ms-1">↵</Kbd></Button>
            <Button size="sm"><CalendarPlus />Book<Kbd className="ms-1">B</Kbd></Button></span>
        </div>
        <div className="grid gap-3 rounded-lg border border-line bg-sunken p-3">
          <div className="flex flex-wrap items-center gap-2"><Label>Book · where</Label>
            <Chip on>Diabetes clinic</Chip><Chip>General Practice</Chip><Chip>Cardiology</Chip><Chip>Radiology</Chip><Chip>more…</Chip></div>
          <div className="flex flex-wrap items-center gap-2"><Label>With</Label>
            <Chip on>Dr. Salma Adel</Chip><Chip>Dr. Khaled Mostafa</Chip><Chip>anyone in the session</Chip>
            <span className="text-12 text-faint">last seen by Dr. Salma, so she is first</span></div>
          <Session day="Sun 11 Oct" what="Diabetes clinic · Dr. Salma Adel · Room 2" how="by number, 9:00–13:00" left="11 of 20 left" open>
            <Place at="No. 10" sub="next free" on /><span className="self-center text-12 text-faint">a number session gives the next number; seen in number order</span>
          </Session>
          <Session day="Tue 13 Oct" what="Diabetes clinic · Dr. Salma Adel · Room 2" how="by time, every 15 min, 17:00–20:00" left="4 left">
            <Place at="17:45" /><Place at="18:15" /><Place at="18:30" taken /><Place at="19:00" /><Place at="19:45" />
          </Session>
          <button type="button" className="justify-self-start text-13 text-accent">Later sessions…</button>
          <Note value="re-visit, brings her HbA1c" />
          <div className="flex flex-wrap items-center gap-2"><Button>Book · Sun 11 Oct · No. 10<Kbd className="ms-1">↵</Kbd></Button>
            <span className="text-12 text-faint">Her other bookings: Cardiology · Wed 21 Oct · 10:30</span></div>
        </div>
      </Card>
      <p className="text-12 text-faint">Book sits beside Send on the desk's patient card. A booking is the pack's own row, never written in the record.</p>
    </ScreenFrame>
  </App>
}

/** the chart around the composer, as the ordering pictures draw it */
function Consult({ children }: { children: ReactNode }) {
  return <App dept="Diabetes clinic" user="Dr. Salma Adel">
    <div className="flex h-14 items-center gap-3 border-b border-line bg-surface px-6 text-14">
      <span className="text-18 font-semibold text-fg">Samira Fawzy</span><span className="text-muted">58 y · F · #10052</span>
      <span className="text-accent">in consult · 9 min</span></div>
    <div className="mx-auto grid w-full max-w-3xl gap-3 px-4 py-4"><Card className="grid gap-2 p-3">{children}</Card></div>
  </App>
}

/** 2 · the doctor books the follow-up as the visit ends: /book 3m, the card under the line, Done saves it with the visit */
export function BookConsult() {
  return <Consult>
    <div className="flex h-12 items-center rounded-lg border border-line-strong bg-sunken px-4 font-mono text-16 text-fg">/book 3m<span className="ms-0.5 h-5 w-px animate-pulse bg-fg" /></div>
    <div className="grid gap-2 rounded-lg border border-line bg-sunken p-3">
      <p className="flex flex-wrap items-center gap-2 text-13"><CalendarPlus className="size-4 text-accent" /><b className="font-semibold text-fg">Next visit in 3 months</b>
        <span className="text-muted">Diabetes clinic · with you, Dr. Salma</span><span className="ms-auto text-12 text-faint">nearest free to Sun 10 Jan</span></p>
      <div className="flex flex-wrap gap-2"><Place at="Sun 10 Jan" sub="No. 6" on /><Place at="Tue 12 Jan" sub="17:30" /><Place at="Sun 17 Jan" sub="No. 2" /><Place at="Tue 19 Jan" sub="18:00" /></div>
      <div className="flex flex-wrap items-center gap-1.5"><Chip>a week earlier</Chip><Chip>a week later</Chip><Chip>any doctor</Chip><Chip>another clinic…</Chip></div>
      <Note value="re-visit" />
      <p className="flex flex-wrap items-center gap-1.5 px-1 text-12 text-muted"><Kbd>tab</Kbd>takes Sun 10 Jan · <Kbd>←</Kbd><Kbd>→</Kbd>other places · Done saves it with the visit</p>
    </div>
    <div className="grid overflow-hidden rounded-lg border border-line">
      <p className="flex items-center gap-2 bg-surface px-3 py-2 text-13"><Tag tone="accent">Not signed yet</Tag><span className="text-muted">3 drafts · Done writes them</span></p>
      <div className="grid gap-1.5 border-t border-dashed border-accent-line bg-accent-soft/40 px-3 py-3 text-14">
        <p className="text-fg">Metformin 1 g · twice a day · 90 days</p><p className="text-fg">HbA1c · Laboratory</p>
        <p className="flex items-center gap-2 text-fg"><CalendarPlus className="size-4 text-accent" />Next visit · Sun 10 Jan · No. 6 · Diabetes clinic · Dr. Salma Adel
          <span className="text-12 text-faint">the booking, not a record entry</span></p>
      </div>
    </div>
  </Consult>
}

const todayViews: ScreenView<string>[] = [{ id: 'today', label: 'Today', count: 42 }, { id: 'calls', label: "Tomorrow's calls", count: 18, needs: 'warn' }, { id: 'missed', label: 'Missed', count: 3 }]
type Booked = [string, string, string, string, string, ReactNode, string?]
const booked: Booked[] = [
  ['10:15', '10071', 'Nadia Hassan', '45 F', 'General Practice · Dr. Karim Fouad', <Tag tone="warn">late 20 min</Tag>],
  ['No. 8', '10109', 'Ihab Kamal', '57 M', 'Diabetes clinic · Dr. Salma Adel', <Tag>due · No. 5 is in</Tag>, 'Here'],
  ['10:30', '10140', 'Nevine Hosny', '44 F', 'Radiology · Ultrasound abdomen', <Tag>due 10:30 · fasting</Tag>, 'Here'],
  ['10:45', '10094', 'Laila Sherif', '29 F', 'General Practice · Dr. Karim Fouad', <Tag>due 10:45</Tag>, 'Here'],
  ['No. 5', '10033', 'Fathy Abdelaziz', '66 M', 'Diabetes clinic · Dr. Salma Adel', <Tag tone="ok">here · waiting</Tag>],
  ['9:30', '10012', 'Hoda Ramzy', '40 F', 'General Practice · Dr. Karim Fouad', <Tag tone="ok">seen</Tag>],
  ['9:00', '10087', 'Ashraf Nabil', '52 M', 'Cardiology · Dr. Hany Saleh', <Tag tone="danger">missed</Tag>],
]
/** 3 · Booked today at the desk: everyone expected across the clinics and benches it checks in for; Here is the base's check-in */
export function BookToday() {
  return <App dept="Front desk" user="Mona Said" tabs={deskTabs} tab="Booked today">
    <ScreenFrame views={todayViews} view="today" onView={noop} search={<Input placeholder="Name, number or phone" className="w-full sm:w-64" readOnly />}
      action={<Button size="sm" variant="outline"><CalendarPlus />Book<Kbd className="ms-1">B</Kbd></Button>}>
      <Card className="overflow-hidden"><ul>
        <ListSection title="Now and next" count={4} />
        {booked.slice(0, 4).map(([at, n, name, age, where, word, act], i) => <ListRow key={n} number={n} name={name} age={age} selected={i === 1} enter={i === 1}
          status={<><span className="w-12 shrink-0 font-semibold tnum text-fg">{at}</span><span className="truncate text-muted">{where}</span></>}
          marks={[]} who={word} extra={act && <Button size="sm" variant={i === 1 ? 'primary' : 'outline'}>{act}</Button>} />)}
        <ListSection title="Earlier today" count={3} />
        {booked.slice(4).map(([at, n, name, age, where, word]) => <ListRow key={n} number={n} name={name} age={age} muted
          status={<><span className="w-12 shrink-0 tnum">{at}</span><span className="truncate">{where}</span></>} who={word} />)}
      </ul></Card>
      <p className="text-12 text-faint">Here is the ordinary check-in: the patient joins the clinic's queue at their time or number, or Radiology's To do with
        the order the booking names. Missed is worked out once the session ends, nothing writes it.</p>
    </ScreenFrame>
  </App>
}

const calls: [string, string, string, string, string, string?][] = [
  ['10052', 'Samira Fawzy', '0100 455 1290', 'Diabetes clinic · No. 4', '', 'confirmed'],
  ['10145', 'Sherine Amer', '0122 310 0457', 'Radiology · CT abdomen +C · 10:30', 'tell: fasting 6 h, bring creatinine'],
  ['10094', 'Laila Sherif', '0155 870 2213', 'General Practice · 10:45', ''],
  ['10061', 'Tarek Hosny', '0111 204 9981', 'Cardiology · 11:00', '', 'no answer'],
]
/** 4 · Tomorrow's calls: the desk phones each booking and marks what they said; SMS and WhatsApp come later */
export function BookCalls() {
  return <App dept="Front desk" user="Mona Said" tabs={deskTabs} tab="Booked today">
    <ScreenFrame views={todayViews} view="calls" onView={noop} search={<Input placeholder="Name, number or phone" className="w-full sm:w-64" readOnly />}>
      <Card className="overflow-hidden"><ul>
        <ListSection title="Next open day · Sat 10 Oct · to call (Friday closed)" count={18} />
        {calls.map(([n, name, phone, what, tell, said], i) => <li key={n} className={cn('grid gap-2 border-t border-line px-4 py-2.5 text-13 first:border-t-0', i === 1 && 'rail bg-hover')}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-12 text-faint">{n}</span><span className="w-36 truncate font-medium text-fg">{name}</span>
            <span className="flex items-center gap-1 font-mono tnum text-fg"><Phone className="size-3.5 text-faint" />{phone}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{what}</span>
            {said ? <Tag tone={said === 'confirmed' ? 'ok' : 'warn'}>{said}</Tag>
              : <span className="flex flex-wrap gap-1.5"><Chip>confirmed</Chip><Chip>will cancel</Chip><Chip>no answer</Chip><Chip>wrong number</Chip></span>}
          </div>
          {tell && i === 1 && <p className="ps-[3.25rem] text-12 text-muted">Tell the patient: <Arabic className="text-13">صائم ٦ ساعات، وأحضر تحليل الكرياتينين</Arabic></p>}
        </li>)}
      </ul></Card>
      <p className="text-12 text-faint">Each call is a row of the pack's own, who and when. Will cancel cancels the booking (with its reason) and frees the place;
        no answer is tried again later. Reminders by SMS or WhatsApp come later, with a sending service outside openCare.</p>
    </ScreenFrame>
  </App>
}

const queueViews: ScreenView<string>[] = [{ id: 'queue', label: 'Queue', count: 6 }, { id: 'review', label: 'To review', count: 1, needs: 'warn' }]
/** 5 · the clinic's queue: booked patients at their number, walk-ins in the gaps (the core change the owner approved) */
export function BookQueue() {
  const rows: [string, string, string, string, ReactNode, number][] = [
    ['10033', 'Fathy Abdelaziz', '66 M', 'No. 5', <Tag tone="info">booked</Tag>, 25],
    ['10052', 'Samira Fawzy', '58 F', 'No. 6', <Tag tone="info">booked</Tag>, 4],
    ['10118', 'Adel Morsy', '49 M', 'walk-in', <Tag>walk-in</Tag>, 41],
    ['10040', 'Wafaa Ibrahim', '71 F', 'No. 7', <Tag tone="info">booked · came early</Tag>, 50],
    ['10120', 'Rasha Galal', '35 F', 'walk-in', <Tag>walk-in</Tag>, 12],
  ]
  return <App dept="Diabetes clinic" user="Dr. Salma Adel" tabs={['Queue', 'Diary']} tab="Queue">
    <ScreenFrame views={queueViews} view="queue" onView={noop} search={<Input placeholder="Record number or name" className="w-full sm:w-64" readOnly />}
      action={<Button size="sm">Call next<Kbd className="ms-1">↵</Kbd></Button>}>
      <Card className="overflow-hidden"><ul>
        <ListSection title="In consult" count={1} />
        <ListRow number="10021" name="Magdy Saad" age="63 M" status={<><span className="w-14 tnum text-muted">No. 4</span>In consult · 6 min</>} who="Dr. Salma Adel" />
        <ListSection title="Waiting · in the order they go in" count={5} />
        {rows.map(([n, name, age, at, word, min], i) => <ListRow key={n} number={n} name={name} age={age} next={i === 0}
          status={<><span className="w-14 shrink-0 font-semibold tnum text-fg">{at}</span>{word}</>} who={i === 0 ? 'next' : undefined} minutes={min} />)}
      </ul></Card>
      <p className="text-12 text-faint">A booked patient goes in at their number or time; a walk-in takes the next gap (Adel came 41 min ago, between No. 6 and No. 7).
        One who came early waits for their place; a booked patient who is late goes in at the next gap. An urgent patient still goes first, as today.</p>
    </ScreenFrame>
  </App>
}

type Slot = { at: string; who?: string; word?: 'booked' | 'here' | 'seen' | 'missed' | 'walk-in' | 'cancelled' | 'free' | 'closed' }
const tone = { booked: 'info', here: 'accent', seen: 'ok', missed: 'danger', 'walk-in': 'neutral', cancelled: 'neutral', free: 'neutral', closed: 'neutral' } as const
function Column({ head, how, slots }: { head: string; how: string; slots: Slot[] }) {
  return <Card className="grid content-start overflow-hidden">
    <div className="border-b border-line bg-surface px-3 py-2"><p className="text-14 font-semibold text-fg">{head}</p><p className="text-12 text-muted">{how}</p></div>
    <ul>{slots.map((s, i) => <li key={i} className={cn('flex items-center gap-2 border-t border-line px-3 py-1.5 text-13 first:border-t-0', s.word === 'free' && 'text-faint', i === 4 && head.startsWith('Dr. Salma') && 'rail bg-hover')}>
      <span className="w-12 shrink-0 font-mono text-12 tnum text-muted">{s.at}</span>
      <span className={cn('min-w-0 flex-1 truncate', s.word === 'cancelled' && 'line-through text-faint', s.word === 'free' ? 'text-faint' : 'text-fg')}>{s.who ?? (s.word === 'free' ? 'free' : '')}</span>
      {s.word && s.word !== 'free' && <Tag tone={tone[s.word]}>{s.word}</Tag>}</li>)}</ul>
  </Card>
}
/** 6 · the clinic's Diary: a column per session today; each place free, booked, here, seen, missed, walk-in or cancelled */
export function BookDiary() {
  const salma: Slot[] = [
    { at: 'No. 1', who: 'Mona Ragab', word: 'seen' }, { at: 'No. 2', who: 'Sayed Hamed', word: 'missed' }, { at: 'No. 3', who: 'Ola Fekry', word: 'seen' },
    { at: 'No. 4', who: 'Magdy Saad', word: 'here' }, { at: 'No. 5', who: 'Fathy Abdelaziz', word: 'here' }, { at: 'No. 6', who: 'Samira Fawzy', word: 'here' },
    { at: 'No. 7', who: 'Wafaa Ibrahim', word: 'here' }, { at: 'No. 8', who: 'Ihab Kamal', word: 'booked' }, { at: 'No. 9', who: 'Nermeen Aly', word: 'cancelled' },
    { at: 'No. 10', word: 'free' }, { at: '—', who: 'Adel Morsy', word: 'walk-in' }, { at: '—', who: 'Rasha Galal', word: 'walk-in' },
  ]
  const khaled: Slot[] = [
    { at: '17:00', who: 'Hesham Badr', word: 'booked' }, { at: '17:15', word: 'free' }, { at: '17:30', who: 'Rania Samir', word: 'booked' },
    { at: '17:45', who: 'Sherif Lotfy', word: 'booked' }, { at: '18:00', word: 'free' }, { at: '18:15', who: 'Dalia Fouad', word: 'booked' },
    { at: '18:30', word: 'free' }, { at: '18:45', who: 'Yasser Amin', word: 'booked' },
  ]
  return <App dept="Diabetes clinic" user="Hanan Omar · nurse" tabs={['Queue', 'Diary']} tab="Diary">
    <ScreenFrame filters={<span className="flex gap-1.5"><Chip on>Day</Chip><Chip>Week</Chip><span className="mx-1 h-6 w-px bg-line" /><Chip on>Everyone</Chip><Chip>Dr. Salma</Chip><Chip>Dr. Khaled</Chip></span>}
      date={<span className="flex items-center gap-2 text-14"><Button size="sm" variant="ghost">←</Button><b className="font-semibold text-fg">Thu 8 Oct · today</b><Button size="sm" variant="ghost">→</Button></span>}
      action={<Button size="sm"><CalendarPlus />Book<Kbd className="ms-1">B</Kbd></Button>}>
      <div className="grid gap-3 md:grid-cols-2">
        <Column head="Dr. Salma Adel · Room 2" how="morning · by number · 9:00–13:00 · 10 of 10 taken + 2 walk-ins" slots={salma} />
        <Column head="Dr. Khaled Mostafa · Room 3" how="evening · by time · every 15 min · 17:00–19:00 · 3 free" slots={khaled} />
      </div>
      <Card className="grid gap-2 p-3 ring-1 ring-accent-line">
        <p className="flex flex-wrap items-center gap-2 text-13"><b className="font-semibold text-fg">No. 5 · Fathy Abdelaziz</b><span className="text-muted">66 M · 0109 772 3410 · booked by Dr. Salma on 9 Jul · note: re-visit</span></p>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline">Move…</Button><Button size="sm" variant="outline">Cancel…</Button><Button size="sm" variant="ghost">Open chart</Button></div>
        <p className="text-12 text-faint">The place's card folds out under the diary, never over it. Move and Cancel ask for a reason (patient asked · doctor away · clinic closed · entered by mistake).</p>
      </Card>
    </ScreenFrame>
  </App>
}

const xrViews: ScreenView<string>[] = [{ id: 'todo', label: 'To do', count: 5 }, { id: 'book', label: 'To book', count: 2, needs: 'warn' }, { id: 'report', label: 'To report', count: 3 }, { id: 'done', label: 'Done today', count: 11 }]
/** 7 · a bench books its rooms: Radiology's To book, the doctor's CT order on a row, Book folds out under it */
export function BookBench() {
  return <App dept="Radiology" user="Tamer Wahba · radiographer" tabs={['Worklist', 'Diary']} tab="Worklist">
    <ScreenFrame views={xrViews} view="book" onView={noop} search={<Input placeholder="Scan or type: record number or name" className="w-full sm:w-64" readOnly />}
      action={<Button size="sm" variant="outline"><Plus />Walk-in<Kbd className="ms-1">N</Kbd></Button>}>
      <Card className="overflow-hidden"><ul>
        <ListRow number="10101" name="Mahmoud Ezzat" age="61 M" selected enter
          status={<><span className="truncate">CT abdomen & pelvis +C</span><span className="truncate text-muted">· ? appendicitis</span></>} who="General Practice · Dr. Karim Fouad"
          extra={<Button size="sm"><CalendarPlus />Book</Button>} minutes={35}
          below={<div className="mx-4 mb-3 grid gap-2 rounded-lg border border-line bg-sunken p-3">
            <Session day="Today" what="CT room" how="by time, every 30 min" left="full" open><span className="text-12 text-faint">no free time today · Now is still on the row (To do)</span></Session>
            <Session day="Sun 11 Oct" what="CT room" how="by time, every 30 min, 9:00–13:00" left="3 left"><Place at="10:00" /><Place at="11:30" /><Place at="12:30" /></Session>
            <Session day="Tue 13 Oct" what="CT room" how="by time, every 30 min, 9:00–13:00" left="5 left" open><Place at="9:30" /><Place at="10:30" on /><Place at="11:00" /><Place at="12:00" /><Place at="12:30" /></Session>
            <p className="grid gap-0.5 text-13"><span className="text-muted">Tell the patient (from this service's line in Bookings):</span>
              <span className="text-fg">Fasting 6 hours · bring your creatinine result</span><Arabic>صائم ٦ ساعات، وأحضر تحليل الكرياتينين</Arabic></p>
            <div className="flex flex-wrap items-center gap-2"><Button>Book · Tue 13 Oct · 10:30<Kbd className="ms-1">↵</Kbd></Button>
              <span className="text-12 text-faint">The order stays the doctor's; the booking names it. The doctor's order line reads "booked Tue 10:30".</span></div>
          </div>} />
        <ListRow number="10077" name="Inas Raafat" age="38 F" status={<span className="truncate">MRI lumbar spine · ? disc prolapse</span>} who="Orthopaedics · Dr. Wael Nour"
          extra={<Button size="sm" variant="outline"><CalendarPlus />Book</Button>} minutes={130} />
        <ListSection title="Booked · coming" count={2} />
        <ListRow number="10066" name="Karima Selim" age="55 F" status={<><span className="truncate">CT chest</span></>} who="Chest clinic" marks={[{ key: 'b', word: 'booked · Sun 11 Oct 10:00' }]} muted />
        <ListRow number="10049" name="Ayman Zaki" age="47 M" status={<><span className="truncate">Ultrasound abdomen</span></>} who="Dr. Hossam Eid · outside" marks={[{ key: 'b', word: 'missed · Wed 7 Oct', tone: 'danger' }]}
          extra={<span className="flex gap-1.5"><Button size="sm" variant="outline">Book again</Button><Button size="sm" variant="ghost">Cancel order</Button></span>} />
      </ul></Card>
    </ScreenFrame>
  </App>
}

/** 8 · a walk-in at Radiology: who, what for, then when (only where the department uses Bookings); Now is always offered */
export function BookWalkIn() {
  return <App dept="Radiology" user="Tamer Wahba · radiographer" tabs={['Worklist', 'Diary']} tab="Worklist">
    <ScreenFrame views={xrViews} view="todo" onView={noop} search={<Input placeholder="Scan or type: record number or name" className="w-full sm:w-64" readOnly />}
      action={<Button size="sm" variant="outline"><Plus />Walk-in<Kbd className="ms-1">N</Kbd></Button>}>
      <WalkInSteps query="Yasmin" people={[['10130', 'Yasmin Adel', '42 F', '0128 660 1475', 'never here'], ['10011', 'Yasmin Adel Fahmy', '23 F', '0100 120 3344', 'last here 2 Aug']]}
        picked={['Yasmin Adel', '42 F']} asked="Dr. Hossam Eid · outside" start="Book · Sun 11 Oct · No. 4"
        what={<div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([['X-ray', 'chest, limbs', false], ['Ultrasound', 'abdomen, pelvis', true], ['CT', 'with or without contrast', false], ['MRI', '', false]] as const).map(([x, t, on]) =>
            <button key={x} type="button" className={on ? 'grid h-16 place-content-center rounded-lg bg-accent-soft text-center ring-2 ring-accent' : 'grid h-16 place-content-center rounded-lg bg-surface text-center ring-1 ring-line'}>
              <span className="text-15 font-semibold text-fg">{x}</span>{t && <span className="text-11 text-muted">{t}</span>}</button>)}</div>
          <div className="flex flex-wrap gap-1.5"><Chip on>Ultrasound abdomen</Chip><Chip>Ultrasound pelvis</Chip><Chip>Ultrasound thyroid</Chip></div>
          <div className="grid gap-2 border-t border-line pt-3"><Label>Then · when</Label>
            <div className="flex flex-wrap gap-2"><Place at="Now" sub="3 ahead" /><span className="self-center text-12 text-faint">or</span>
              <Place at="Sun · No. 4" sub="from 9:00" on /><Place at="Sun · No. 5" sub="from 9:00" /><Place at="Mon · No. 1" sub="from 9:00" /><button type="button" className="text-13 text-accent">more…</button></div>
            <p className="text-13 text-fg">Tell the patient: fasting 6 hours, a full bladder <Arabic className="ms-2 text-13">صائم ٦ ساعات، والمثانة ممتلئة</Arabic></p>
            <p className="text-12 text-faint">Now is always offered; the radiographer decides (she had breakfast, so Sunday). Picked, the walk-in's order is made now and the booking names it.</p>
          </div>
        </div>} />
    </ScreenFrame>
  </App>
}

/** 9 · a department's Bookings card in Settings: its sessions, leave and closed days, and what to tell the patient per service */
export function BookSettings() {
  const sessions: [string, string, string, string, string, string, string, string][] = [
    ['Morning', 'Sun · Tue · Thu', '9:00–13:00', 'Dr. Salma Adel', 'Room 2', 'by number · 20 places', '2', '2'],
    ['Evening', 'Sun · Tue', '17:00–20:00', 'Dr. Khaled Mostafa', 'Room 3', 'by time · every 15 min', '0', '0'],
    ['Saturday', 'Sat', '10:00–13:00', 'anyone', 'Room 2', 'by number · 15 places', '0', '3'],
  ]
  return <App dept="Settings" user="Dr. Nabil Farouk · admin">
    <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-4">
      <p className="text-18 font-semibold text-fg">Settings · Departments · Diabetes clinic · Bookings</p>
      <Fieldset title="Sessions">
        <div className="overflow-x-auto"><table className="w-full text-13"><thead><tr className="text-start text-12 text-faint">
          {['Name', 'Days', 'Hours', 'Doctor', 'Room', 'How', 'Overbook', 'Kept for walk-ins'].map((h) => <th key={h} className="px-2 py-1 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>{sessions.map((r) => <tr key={r[0]} className="border-t border-line">{r.map((c, i) => <td key={i} className={cn('px-2 py-1.5', i === 0 ? 'font-medium text-fg' : 'text-fg', (i === 6 || i === 7) && 'tnum')}>{c}</td>)}</tr>)}</tbody></table></div>
        <button type="button" className="justify-self-start text-13 text-accent">+ Add a session</button>
        <p className="text-12 text-faint">How: by time (every N minutes) or by number (N places), chosen per session. Doctor: one, or anyone in the session.
          Overbook and Kept for walk-ins are numbers per session, 0 by default. Ramadan hours are their own sessions with dates.</p>
      </Fieldset>
      <Fieldset title="Leave and closed days">
        <FormRow label="Dr. Salma Adel" hint="her sessions off; bookings already made show on the Diary as to move">18–22 Oct · conference</FormRow>
        <FormRow label="The whole clinic" hint="the clinic's sessions off">Thu 5 Nov · staff training</FormRow>
        <button type="button" className="justify-self-start text-13 text-accent">+ Add leave or a closed day</button>
      </Fieldset>
      <Fieldset title="Booking">
        <FormRow label="Book ahead" hint="how far ahead the desk and the doctors may book">90 days</FormRow>
        <FormRow label="Who may book here" hint="this clinic, and the desks that check in for it">This clinic · Front desk</FormRow>
        <FormRow label="Same doctor first" hint="a follow-up offers the doctor who saw the patient first"><Switch checked onChange={noop} label="Same doctor first" /></FormRow>
      </Fieldset>
      <Fieldset title="Tell the patient when booked · per service">
        <FormRow label="Follow-up visit" hint="said on the booking card and the calls list"><Textarea readOnly minRows={1} value="Bring your sugar readings and your medicines. · أحضر قراءات السكر وعلب الأدوية" /></FormRow>
        <p className="text-12 text-faint">Radiology's card holds the same for each exam ("CT abdomen +C: fasting 6 hours, bring your creatinine result").</p>
      </Fieldset>
    </div>
  </App>
}
