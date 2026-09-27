import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, Outlet } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth, useLoginId } from '../auth'
import { useDrafts } from '../hooks/drafts'
import { useOrganization } from '../hooks/organization'
import { chooseUser, myUsers, Refusal, _db as db } from '../db/rpc'
import { Button, Centered, Spinner, errorText } from '../ui'
import { Shell } from './Shell'
import { Login } from './Login'
import { DepartmentScreen } from '../screens/Department'
import { ChartScreen } from '../screens/chart/ChartScreen'
import { RequestScreen } from '../screens/Request'
import { SettingsScreen } from '../screens/Settings'
import { BenchCorrect, BenchPatient } from '../screens/bench/BenchPatient'

// the style guide is loaded when it is opened: no one needs it for a day's work
const DesignScreen = lazy(() => import('../screens/design/DesignScreen').then((m) => ({ default: m.DesignScreen })))

function RequireAuth() {
  const status = useAuth((s) => s.status)
  const org = useOrganization()
  if (status === 'loading') return <Centered><Spinner /></Centered>
  if (status === 'signed_out') return <Navigate to="/login" replace />
  if (org.isLoading) return <Centered><Spinner label="Opening your clinic" /></Centered>
  if (org.error instanceof Refusal && org.error.code === 'choose_user') return <ChooseUser />
  if (org.error) return <Centered><div className="text-center text-14"><p className="text-danger">{errorText(org.error)}</p><Button className="mt-3" variant="outline" onClick={() => void db.auth.signOut()}>Sign out</Button></div></Centered>
  return <Outlet />
}

/** a login that works in several organizations: which one is this session (spec §3.1) */
function ChooseUser() {
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['my_users'], queryFn: myUsers })
  const pick = useMutation({ mutationFn: chooseUser, onSuccess: () => qc.invalidateQueries() })
  return <Centered><div className="w-full max-w-sm rounded-lg border border-line bg-surface p-5">
    <p className="mb-3 text-14 font-medium">Where are you working today?</p>
    {users.isLoading ? <Spinner /> : <ul className="divide-y divide-line rounded-md border border-line">{(users.data ?? []).map((u) =>
      <li key={u.id}><button onClick={() => pick.mutate(u.id)} disabled={pick.isPending} className="flex w-full justify-between px-3 py-2.5 text-left text-14 hover:bg-hover">
        <span>{u.organization}</span><span className="text-11 text-faint">{u.name}</span></button></li>)}</ul>}
    {pick.error && <p className="mt-2 text-14 text-danger">{errorText(pick.error)}</p>}</div></Centered>
}

/** a different person signs in: nothing of the last one stays in this tab — cached reads (which may hold a private visit they opened), unsigned drafts */
function ForgetOnUserChange() {
  const qc = useQueryClient(); const login = useLoginId()
  useEffect(() => { qc.clear(); useDrafts.setState({ byPatient: {} }) }, [login, qc])
  return null
}

export function App() {
  const init = useAuth((s) => s.init)
  useEffect(() => init(), [init])
  return (<>
    <ForgetOnUserChange />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<DepartmentScreen />} />
          {/* the patient screen: a clinic visit, a ward stay, the record with no encounter (the chart, spec §4.6) */}
          <Route path="visit/:visitId" element={<ChartScreen />} />
          <Route path="patient/:patientId" element={<ChartScreen />} />
          <Route path="request/:requestId" element={<RequestScreen />} />
          <Route path="bench/correct/:requestId" element={<BenchCorrect />} />
          <Route path="bench/:patientId" element={<BenchPatient />} />
          <Route path="settings/*" element={<SettingsScreen />} />
          <Route path="design/*" element={<Suspense fallback={<Centered><Spinner /></Centered>}><DesignScreen /></Suspense>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>)
}
