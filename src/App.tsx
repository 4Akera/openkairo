import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuthStore } from './stores/authStore'

import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PatientPage from './pages/PatientPage'
import EncounterPage from './pages/EncounterPage'
import SettingsPage from './pages/SettingsPage'
import ProfileModal from './components/profile/ProfileModal'

function ProtectedRoute() {
  const { user, loading, profile } = useAuthStore()
  const [profileRequired, setProfileRequired] = useState(false)

  // Once profile loads, check if name is missing
  useEffect(() => {
    if (profile !== null && !profile.full_name?.trim()) {
      setProfileRequired(true)
    }
  }, [profile])

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />

  return (
    <>
      <Outlet />
      {/* Force profile setup on first login */}
      <ProfileModal
        open={profileRequired}
        onOpenChange={(open) => { if (!open && profile?.full_name?.trim()) setProfileRequired(false) }}
        required
      />
    </>
  )
}

export default function App() {
  const { setUser, setSession, setLoading, fetchProfile } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) fetchProfile()
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile()
    })

    return () => subscription.unsubscribe()
  }, [setUser, setSession, setLoading, fetchProfile])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="patients/:patientId" element={<PatientPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route
            path="patients/:patientId/encounters/:encounterId"
            element={<EncounterPage />}
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
