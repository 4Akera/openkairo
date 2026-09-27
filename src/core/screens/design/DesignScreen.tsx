// /design (design-system.md §7, build plan 1.4): the living style guide. Every token with its live value and contrast, the type
// and space scales, every kit component and state, the charts, and the rules, in the app's theme or light and dark side by side.
// Anyone signed in may open it (the shell asks for no department here): it reads nothing, and all it shows is fixtures.ts.
// Record blocks is the chart's own blocks on a made-up record (build plan 3.4).
import { Navigate, Route, Routes } from 'react-router-dom'
import { BookCheck, ChartLine, Component, Palette, Rows3, Ruler } from 'lucide-react'
import { NavItem, PageHead, Segmented, ThemeToggle, useFold } from '../../ui'
import { Tokens } from './Tokens'
import { TypeSpace } from './Type'
import { Components } from './Components'
import { Blocks } from './Blocks'
import { Charts } from './Charts'
import { Rules } from './Rules'

const PAGES = [['tokens', 'Tokens', Palette, Tokens], ['type', 'Type & space', Ruler, TypeSpace], ['components', 'Components', Component, Components],
  ['blocks', 'Record blocks', Rows3, Blocks], ['charts', 'Charts', ChartLine, Charts], ['rules', 'Rules', BookCheck, Rules]] as const

export function DesignScreen() {
  const [side, setSide] = useFold('design.side', false)   // a remembered on/off, like a fold: one theme, or both side by side
  // it paints its own canvas: the shell around it moves to the tokens with the sweep (build plan 2.1)
  return <div className="min-h-[calc(100dvh-3.5rem)] bg-canvas text-fg"><div className="mx-auto grid max-w-chart gap-6 p-4 md:grid-cols-[12rem_minmax(0,1fr)]">
    <nav aria-label="Design system" className="-mx-4 flex gap-1 overflow-x-auto px-4 md:sticky md:top-4 md:mx-0 md:grid md:content-start md:gap-0.5 md:self-start md:overflow-visible md:px-0">
      <p className="hidden px-3 pb-2 text-11 font-semibold uppercase tracking-[0.08em] text-faint md:block">Design system</p>
      {PAGES.map(([k, l, I]) => <NavItem key={k} to={`/design/${k}`} icon={I} className="shrink-0">{l}</NavItem>)}
    </nav>
    <div className="min-w-0">
      <PageHead title="Design system" hint="The tokens, type and kit every screen and pack is built from, drawn live. Nothing here is a real patient." className="mb-2" />
      <div className="mb-4 flex flex-wrap items-center gap-2"><ThemeToggle />
        <Segmented aria-label="Show" value={side ? 'side' : 'one'} onChange={(v) => setSide(v === 'side')} options={[['one', 'One theme'], ['side', 'Side by side']]} /></div>
      <Routes>
        {PAGES.map(([k, , , Page]) => <Route key={k} path={k} element={<Page side={side} />} />)}
        <Route path="*" element={<Navigate to="/design/tokens" replace />} />
      </Routes>
    </div>
  </div></div>
}
