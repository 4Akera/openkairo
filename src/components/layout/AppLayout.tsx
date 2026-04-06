import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { TooltipProvider } from '../ui'
import GlobalSearch from '../GlobalSearch'

export default function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar onSearchOpen={() => setSearchOpen(true)} />
        {/* On mobile the sidebar is replaced by a fixed bottom nav; reserve space for it + home indicator */}
        <main className="flex-1 overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          <Outlet />
        </main>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </TooltipProvider>
  )
}
