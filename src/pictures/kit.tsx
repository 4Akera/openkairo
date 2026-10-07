// What every picture shares: the app's top bar (as the shell draws it), a specimen tube's cap, Arabic directions, a small label.
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Avatar, Button, Kbd, ScreenTabs, cn } from '@core/ui'

/** the app around a department screen: the shell's bar, then the department's tabs */
export function App({ dept, user, tabs, tab, children }: { dept: string; user: string; tabs?: string[]; tab?: string; children: ReactNode }) {
  return <div className="min-h-screen bg-canvas">
    <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4">
      <span className="flex items-center gap-2 font-semibold tracking-tight text-fg"><span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-13 font-bold text-accent-fg">D</span>Demo Clinic</span>
      <Button variant="outline" size="sm">{dept}<ChevronDown className="h-3.5 w-3.5 text-faint" /></Button>
      <span className="ms-2 hidden h-9 w-80 items-center rounded-lg border border-line bg-sunken px-3 text-14 text-faint md:flex">Search or add a patient…<Kbd className="ms-auto">⌘K</Kbd></span>
      <div className="flex-1" />
      <span className="flex items-center gap-2 text-14 text-fg"><Avatar name={user} size="sm" /><span className="hidden md:inline">{user}</span><ChevronDown className="h-3.5 w-3.5 text-faint" /></span>
    </header>
    {tabs && <ScreenTabs label={`${dept}: screens`} first={tabs.map((t) => ({ key: t, label: t }))} rest={[]} value={tab ?? tabs[0]} open={false} onChange={() => undefined} />}
    {children}
  </div>
}

export type TubeColour = 'purple' | 'yellow' | 'grey' | 'blue' | 'red'
/** a tube's cap: its colour (the lab's own code) and its word, never the colour alone */
export const Tube = ({ c, className }: { c: TubeColour; className?: string }) =>
  <span aria-hidden className={cn('inline-block h-3.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-line-strong', className)} style={{ background: `var(--tube-${c})` }} />

/** directions in Arabic, as the patient hears them */
export const Arabic = ({ children, className }: { children: ReactNode; className?: string }) =>
  <span dir="rtl" lang="ar" className={cn('text-14 text-fg', className)}>{children}</span>

/** a small heading inside a card */
export const Label = ({ children, className }: { children: ReactNode; className?: string }) =>
  <p className={cn('text-11 font-semibold uppercase tracking-[0.06em] text-faint', className)}>{children}</p>
