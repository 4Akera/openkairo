import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { TooltipProvider } from '../ui'

export default function AppLayout() {
  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
