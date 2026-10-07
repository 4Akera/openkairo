import { createElement, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useDepartment } from '../hooks/organization'
import { Centered, Empty, Card, FRAME, NotForRole, ScreenTabs, Spinner } from '../ui'
import { drawable, screenFor, shownHere } from './registry'
import { screensOf, tabRow, tabSearch } from './line'
import './base'

/** The department's home (spec/openCare.md §5.1 rules 5 and 6): its Screens line as the one row of tabs — only the tabs this user's
 *  role here opens, at most five then More · n — and the selected screen under it, in the kit's frame. It opens on the line's
 *  opens; the selected tab is kept in the link (?tab=) and is the screen's title. */
export function DepartmentScreen() {
  const { dept, org, can } = useDepartment()
  const [params] = useSearchParams(); const navigate = useNavigate(); const { pathname, search } = useLocation()
  // More is opened for one department: the next one starts folded (no effect resets it)
  const [more, setMore] = useState<string | null>(null)
  if (!dept || !org) return <Centered><Spinner /></Centered>
  const row = tabRow(dept, org.screens, can, (k) => drawable(k) && shownHere(k, dept, org), params.get('tab'), more === dept.id)
  const Screen = row.current ? screenFor(row.current) : undefined
  // nothing to show: screens this role does not open here, or none on the line
  if (!row.first.length) return <div className={`${FRAME} py-6`}>{screensOf(dept, org.screens, drawable).length ? <NotForRole>{dept.name}'s screens are not for your role.</NotForRole>
    : <Card><Empty>{dept.name} has no screen yet — choose its screens in Settings → Departments.</Empty></Card>}</div>
  return <>
    <ScreenTabs label={`${dept.name}: screens`} first={row.first} rest={row.rest} value={row.current} open={row.open}
      onMore={row.pinned ? undefined : () => setMore(row.open ? null : dept.id)}
      onChange={(key) => navigate({ pathname, search: tabSearch(search, key, dept.opens) }, { replace: true })} />
    {/* the registered screen for the selected tab (the registry's, so drawn by createElement, never defined here) */}
    {Screen && createElement(Screen, { key: `${dept.id}|${row.current}`, dept })}
  </>
}
