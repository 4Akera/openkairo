import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from './shell/App'
import { initTheme } from './ui/theme'
import './styles.css'
import '../packs'
initTheme()   // index.html set the theme before first paint; from here it follows the OS (on System) and other tabs
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } })
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={qc}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></StrictMode>)
