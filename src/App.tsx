import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuthStore } from './stores/authStore'
import { useSettingsStore } from './stores/settingsStore'
import { useThemeStore } from './stores/themeStore'
import { isQueueDept } from './lib/queues'

import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import ProfileModal from './components/profile/ProfileModal'
import ZoomHintBanner from './components/ZoomHintBanner'

// Each page loads as its own chunk so the login screen doesn't ship the whole app
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const PatientPage   = lazy(() => import('./pages/PatientPage'))
const EncounterPage = lazy(() => import('./pages/EncounterPage'))
const SettingsPage  = lazy(() => import('./pages/SettingsPage'))
const BillingPage    = lazy(() => import('./pages/BillingPage'))
const FrontDeskPage  = lazy(() => import('./pages/FrontDeskPage'))
const DepartmentPage = lazy(() => import('./pages/DepartmentPage'))
const WardsPage      = lazy(() => import('./pages/WardsPage'))

function PageFallback() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  )
}

function DeptAwareIndex() {
  const { myDepartments, permissions } = useAuthStore()
  // Pure patient queues have no page of their own — only order-fulfilling
  // departments do, so dept-only users land in the first of those.
  const workDepts = myDepartments.filter(d => !isQueueDept(d))
  const isDeptOnly = workDepts.length > 0 && permissions.length === 0
  // The app opens on the day: Today (Front Desk) is home; dept-only users
  // land in their own workspace; the registry lives at /patients.
  return isDeptOnly
    ? <Navigate to={`/dept/${workDepts[0].slug}`} replace />
    : <FrontDeskPage />
}

function ProtectedRoute() {
  const { user, loading, profile } = useAuthStore()
  // Force profile setup on first login; derived so it closes once a name is saved
  const profileRequired = profile !== null && !profile.full_name?.trim()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />

  return (
    <>
      <Outlet />
      <ZoomHintBanner />
      <ProfileModal open={profileRequired} onOpenChange={() => {}} required />
    </>
  )
}

export default function App() {
  const { setUser, setSession, setLoading, fetchProfile } = useAuthStore()
  const { fetchSettings } = useSettingsStore()
  const initTheme = useThemeStore(s => s.init)

  useEffect(() => {
    initTheme()
  }, [initTheme])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) {
        fetchProfile()
        fetchSettings()
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile()
        fetchSettings()
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser, setSession, setLoading, fetchProfile, fetchSettings])

  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<DeptAwareIndex />} />
              <Route path="frontdesk" element={<Navigate to="/" replace />} />
              <Route path="dept/:slug" element={<DepartmentPage />} />
              <Route path="wards" element={<WardsPage />} />
              <Route path="patients" element={<DashboardPage />} />
              <Route path="patients/:patientId" element={<PatientPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="billing" element={<BillingPage />} />
            </Route>
            <Route
              path="patients/:patientId/encounters/:encounterId"
              element={<EncounterPage />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
