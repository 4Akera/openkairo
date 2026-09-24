import { useEffect } from 'react'
import { Navigate, Route, Routes, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth, useLoginId } from '../auth'
import { useDrafts } from '../hooks/drafts'
import { useChoice, discoverOrganization } from '../hooks/organization'
import { Centered, Spinner } from '../ui'
import { Shell } from './Shell'
import { Login } from './Login'
import { DepartmentScreen } from '../screens/Department'
import { VisitScreen } from '../screens/visit/VisitScreen'
import { RequestScreen } from '../screens/Request'
import { SettingsScreen } from '../screens/Settings'
import { BenchCorrect, BenchPatient } from '../screens/bench/BenchPatient'

function RequireAuth() {
  const status = useAuth((s) => s.status)
  const { organizationId, setOrganization } = useChoice()
  useEffect(() => { if (status === 'signed_in' && !organizationId) discoverOrganization().then((id) => id && setOrganization(id)) }, [status, organizationId, setOrganization])
  if (status === 'loading') return <Centered><Spinner /></Centered>
  if (status === 'signed_out') return <Navigate to="/login" replace />
  if (!organizationId) return <Centered><Spinner label="Finding your organization" /></Centered>
  return <Outlet />
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
          <Route path="visit/:visitId" element={<VisitScreen />} />
          <Route path="patient/:patientId" element={<VisitScreen />} />
          <Route path="request/:requestId" element={<RequestScreen />} />
          <Route path="bench/correct/:requestId" element={<BenchCorrect />} />
          <Route path="bench/:patientId" element={<BenchPatient />} />
          <Route path="settings/*" element={<SettingsScreen />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>)
}
