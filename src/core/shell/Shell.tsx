import { PAGE_ACTION } from '../screens/settings/save'
import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, LogOut, Settings as Cog } from 'lucide-react'
import { signOut, useAuth } from '../auth'
import { useDepartment } from '../hooks/organization'
import { Button, Centered, Spinner } from '../ui'
import { Search } from './Search'

export function Shell() {
  const { org, isLoading, error, departments, dept, can, setDepartment } = useDepartment()
  const navigate = useNavigate()
  const inSettings = useLocation().pathname.startsWith('/settings')
  const email = useAuth((s) => s.session?.user.email)
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => { if (!dept && departments.length === 1) setDepartment(departments[0].id) }, [dept, departments, setDepartment])
  // reception's screen is the search, so the header has none there and ⌘K focuses that box instead
  const onReception = dept?.type === 'reception' && !inSettings
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); if (onReception) window.dispatchEvent(new Event('opencare:search')); else setSearchOpen(true) } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onReception])
  if (isLoading) return <Centered><Spinner /></Centered>
  if (error || !org) return <Centered><p className="text-sm text-red-700">{String(error ?? 'no organization')}</p></Centered>
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-4">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-neutral-900"><span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-800 text-[13px] font-bold text-white">{org.organization.name[0]}</span>{org.organization.name}</span>
        <Menu.Root><Menu.Trigger asChild><Button variant="outline" size="sm">{dept ? dept.name : 'Choose department'}<ChevronDown className="h-3.5 w-3.5 text-neutral-500" /></Button></Menu.Trigger>
          <Menu.Portal><Menu.Content align="start" sideOffset={6} className="z-50 min-w-56 rounded-md border border-neutral-200 bg-white p-1 shadow-lg">
            {departments.map((d) => <Menu.Item key={d.id} onSelect={() => { setDepartment(d.id); navigate('/') }} className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-neutral-100"><span className={d.id === dept?.id ? 'font-medium' : ''}>{d.name}</span><span className="text-[11px] text-neutral-400">{d.type}</span></Menu.Item>)}
          </Menu.Content></Menu.Portal></Menu.Root>
        {!onReception && <button onClick={() => setSearchOpen(true)} className="ml-2 hidden h-9 w-80 items-center rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-left text-sm text-neutral-400 transition-colors hover:border-neutral-300 hover:bg-white sm:flex">Search or add a patient… <kbd className="ml-auto rounded bg-white px-1 text-[10px] text-neutral-500">⌘K</kbd></button>}
        <div className="flex-1" />
        <span className="text-xs text-neutral-500">{email}</span>
        {Object.values(PAGE_ACTION).some((x) => can(x)) && <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} aria-label="Settings"><Cog className="h-4 w-4" /></Button>}
        <Button variant="ghost" size="sm" onClick={() => { setDepartment(null); void signOut() }} aria-label="Sign out"><LogOut className="h-4 w-4" /></Button>
      </header>
      <main className="flex-1">
        {dept || inSettings || departments.length === 0 ? <Outlet /> : <Centered><div className="w-full max-w-sm"><h2 className="mb-3 text-sm font-medium">Where are you working today?</h2>
          <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">{departments.map((d) => <li key={d.id}><button onClick={() => setDepartment(d.id)} className="flex w-full justify-between px-3 py-2.5 text-left text-sm hover:bg-neutral-50"><span>{d.name}</span><span className="text-[11px] text-neutral-400">{d.type}</span></button></li>)}</ul></div></Centered>}
      </main>
      {searchOpen && <Search onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
