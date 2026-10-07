// The pictures for the owner (dev only: /pictures.html, never in the build): the pack screens drawn with the real kit and made-up
// patients, so a screen is agreed from a picture before anything is built. Nothing here reads or writes.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initTheme } from '@core/ui'
import '@core/styles.css'
import { Pictures } from './Pictures'

initTheme()
createRoot(document.getElementById('root')!).render(<StrictMode><Pictures /></StrictMode>)
