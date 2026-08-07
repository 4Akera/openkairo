/**
 * Department icon + colour rendering, shared by the sidebar, the department
 * page header, and Settings. Icon slugs match DEPT_ICON_OPTIONS in
 * Settings → Departments; unknown slugs fall back to Building2.
 */
import {
  Building2, TestTube, Camera, Pill, HeartPulse, Brain,
  Stethoscope, Activity, Users, FlaskConical,
} from 'lucide-react'

const DEPT_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'building-2':    Building2,
  'test-tube':     TestTube,
  'camera':        Camera,
  'pill':          Pill,
  'heart-pulse':   HeartPulse,
  'brain':         Brain,
  'stethoscope':   Stethoscope,
  'activity':      Activity,
  'users':         Users,
  'flask-conical': FlaskConical,
}

export function deptIconComponent(slug: string): React.ComponentType<{ className?: string }> {
  return DEPT_ICON_MAP[slug] ?? Building2
}

/** Tailwind classes for a department's tinted icon chip (bg + text). */
export function deptColorClasses(color: string): string {
  const map: Record<string, string> = {
    slate:   'bg-slate-500/15 text-slate-500',
    blue:    'bg-blue-500/15 text-blue-500',
    indigo:  'bg-indigo-500/15 text-indigo-500',
    violet:  'bg-violet-500/15 text-violet-500',
    purple:  'bg-purple-500/15 text-purple-500',
    pink:    'bg-pink-500/15 text-pink-500',
    rose:    'bg-rose-500/15 text-rose-500',
    red:     'bg-red-500/15 text-red-500',
    orange:  'bg-orange-500/15 text-orange-500',
    amber:   'bg-amber-500/15 text-amber-600',
    yellow:  'bg-yellow-500/15 text-yellow-600',
    lime:    'bg-lime-500/15 text-lime-600',
    green:   'bg-green-500/15 text-green-600',
    emerald: 'bg-emerald-500/15 text-emerald-600',
    teal:    'bg-teal-500/15 text-teal-600',
    cyan:    'bg-cyan-500/15 text-cyan-600',
  }
  return map[color] ?? map.slate
}
