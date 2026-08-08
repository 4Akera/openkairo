/**
 * ResultToasts — closes the ordering loop in realtime.
 *
 * When a department completes an order that the current user placed, a
 * toast appears ("Laboratory result ready — Jane Smith"); clicking it jumps
 * to the encounter where the result block landed. Mounted once in the app
 * shell; renders nothing until an event arrives.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { fullName } from '../lib/utils'
import type { Patient } from '../types'
import { useSettingsStore } from '../stores/settingsStore'
import { BellRing, X } from 'lucide-react'

type Toast = {
  id: string
  title: string
  body: string
  patientId: string
  encounterId: string | null
}

const DISMISS_MS = 12000

export default function ResultToasts() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [toasts, setToasts] = useState<Toast[]>([])
  const userIdRef = useRef<string | null>(null)
  useEffect(() => { userIdRef.current = user?.id ?? null }, [user?.id])

  useEffect(() => {
    const channel = supabase
      .channel('result-toasts')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'block_actions' },
        async (payload) => {
          const next = payload.new as Record<string, unknown>
          const prev = payload.old as Record<string, unknown>
          if (next.status !== 'completed' || prev.status === 'completed') return
          if (!userIdRef.current || next.triggered_by !== userIdRef.current) return

          const btId = (next.action_payload as { block_type_id?: string } | null)?.block_type_id ?? null
          const [{ data: pt }, { data: dept }, btRes] = await Promise.all([
            supabase.from('patients').select('*').eq('id', next.patient_id as string).maybeSingle(),
            supabase.from('departments').select('name').eq('slug', next.action_type as string).maybeSingle(),
            btId
              ? supabase.from('department_block_types').select('built_in_type').eq('id', btId).maybeSingle()
              : Promise.resolve({ data: null }),
          ])
          const isConsult = (btRes.data as { built_in_type?: string | null } | null)?.built_in_type === 'consultation'
          const patientName = pt ? fullName(pt as Patient, useSettingsStore.getState().nameFormat) : 'a patient'
          const toast: Toast = {
            id: next.id as string,
            title: `${dept?.name ?? (next.action_type as string)} ${isConsult ? 'consult answered' : 'result ready'}`,
            body: patientName,
            patientId: next.patient_id as string,
            encounterId: (next.encounter_id as string | null) ?? null,
          }
          setToasts(t => [...t.filter(x => x.id !== toast.id), toast])
          setTimeout(() => setToasts(t => t.filter(x => x.id !== toast.id)), DISMISS_MS)
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [navigate])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-xs">
      {toasts.map(t => (
        <div
          key={t.id}
          className="flex items-start gap-2.5 rounded-xl border border-emerald-500/40 bg-card shadow-lg px-3.5 py-3 animate-in slide-in-from-bottom-2"
        >
          <BellRing className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <button
            className="flex-1 min-w-0 text-left"
            onClick={() => {
              setToasts(x => x.filter(y => y.id !== t.id))
              navigate(t.encounterId
                ? `/patients/${t.patientId}/encounters/${t.encounterId}`
                : `/patients/${t.patientId}`)
            }}
          >
            <p className="text-xs font-semibold leading-tight">{t.title}</p>
            <p className="text-xs text-muted-foreground truncate">{t.body} · tap to open</p>
          </button>
          <button
            onClick={() => setToasts(x => x.filter(y => y.id !== t.id))}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
