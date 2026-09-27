import { PAGE_ACTION } from '../screens/settings/save'
import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Palette, Settings as Cog } from 'lucide-react'
import { signOut, useAuth } from '../auth'
import { useDepartment } from '../hooks/organization'
import { Avatar, Button, Centered, Kbd, Menu, MenuItem, MenuLabel, MenuSeparator, Spinner, ThemeToggle, cn } from '../ui'
import { Search } from './Search'

const WORK: Record<string, string> = { desk: 'front desk', visits: 'clinic', stays: 'ward', bench: 'bench', outside: 'outside' }
export function Shell() {
  const { org, isLoading, error, departments, dept, can, setDepartment } = useDepartment()
  const navigate = useNavigate()
  // Settings and the design system (/design) need no department: they are about the clinic and the app, not a day's work
  const { pathname } = useLocation(); const free = pathname.startsWith('/settings') || pathname.startsWith('/design')
  const email = useAuth((s) => s.session?.user.email)
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => { if (!dept && departments.length === 1) setDepartment(departments[0].id) }, [dept, departments, setDepartment])
  // reception's screen is the search, so the header has none there and ⌘K focuses that box instead
  const onReception = dept?.work === 'desk' && !free
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); if (onReception) window.dispatchEvent(new Event('opencare:search')); else setSearchOpen(true) } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onReception])
  if (isLoading) return <Centered><Spinner /></Centered>
  if (error || !org) return <Centered><p className="text-14 text-danger">{String(error ?? 'no organization')}</p></Centered>
  const { me } = org
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-fg"><span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-13 font-bold text-accent-fg">{org.organization.name[0]}</span>{org.organization.name}</span>
        <Menu trigger={<Button variant="outline" size="sm">{dept ? dept.name : 'Choose department'}<ChevronDown className="h-3.5 w-3.5 text-faint" /></Button>}>
          {departments.map((d) => <MenuItem key={d.id} onSelect={() => { setDepartment(d.id); navigate('/') }}>
            <span className="flex items-baseline justify-between gap-3"><span className={cn(d.id === dept?.id && 'font-medium')}>{d.name}</span><span className="text-11 text-faint">{WORK[d.work]}</span></span></MenuItem>)}
        </Menu>
        {!onReception && <button onClick={() => setSearchOpen(true)} className="ms-2 hidden h-9 w-80 items-center rounded-lg border border-line bg-sunken px-3 text-start text-14 text-faint transition-colors hover:border-line-strong hover:bg-surface focus-ring sm:flex">Search or add a patient… <Kbd className="ms-auto">⌘K</Kbd></button>}
        <div className="flex-1" />
        {Object.values(PAGE_ACTION).some((x) => can(x)) && <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} aria-label="Settings" title="Settings"><Cog className="h-4 w-4" /></Button>}
        {/* the user menu (design-system.md §4.4): who is signed in, the theme for this browser, the style guide, sign out */}
        <Menu align="end" trigger={<Button variant="ghost" size="sm" className="gap-2 ps-1" aria-label={`${me.name}: theme, design system, sign out`}>
          <Avatar name={me.name} size="sm" /><span className="hidden max-w-40 truncate md:inline">{me.name}</span><ChevronDown className="h-3.5 w-3.5 text-faint" /></Button>}>
          <div className="px-2 pb-1.5 pt-1"><p className="truncate font-medium">{me.name}</p>{email && <p className="truncate text-12 text-faint">{email}</p>}</div>
          <MenuSeparator /><MenuLabel>Theme</MenuLabel><ThemeToggle variant="menu" /><MenuSeparator />
          <MenuItem icon={Palette} hint="the tokens, the kit and its samples" onSelect={() => navigate('/design')}>Design system</MenuItem>
          <MenuSeparator /><MenuItem icon={LogOut} tone="danger" onSelect={() => { setDepartment(null); void signOut() }}>Sign out</MenuItem>
        </Menu>
      </header>
      <main className="flex-1">
        {dept || free || departments.length === 0 ? <Outlet /> : <Centered><div className="w-full max-w-sm"><h2 className="mb-3 text-14 font-medium">Where are you working today?</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-xs">{departments.map((d) => <li key={d.id}><button onClick={() => setDepartment(d.id)} className="flex w-full justify-between px-3 py-2.5 text-start text-14 hover:bg-hover focus-ring"><span>{d.name}</span><span className="text-11 text-faint">{WORK[d.work]}</span></button></li>)}</ul></div></Centered>}
      </main>
      {searchOpen && <Search onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
