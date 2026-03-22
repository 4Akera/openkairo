/**
 * adminUsers — all mutations that require the Supabase service role key.
 *
 * The service role key bypasses RLS completely, which is intentional:
 *  - roles/user_roles have SELECT-only RLS for normal users
 *  - only this module can write to those tables
 *
 * IMPORTANT: VITE_SUPABASE_SERVICE_ROLE_KEY must be set in .env.local
 * Find it in: Supabase Dashboard → Project Settings → API → service_role (secret)
 */
import { createClient } from '@supabase/supabase-js'
import type { Role, Permission } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string

function getClient() {
  if (!serviceRoleKey) {
    throw new Error(
      'VITE_SUPABASE_SERVICE_ROLE_KEY is not set in .env.local\n' +
      'Supabase Dashboard → Project Settings → API → service_role (secret key)',
    )
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type Result<T = void> = { data?: T; error?: string }

// ── Auth users ──────────────────────────────────────────────────────────

export async function createUser(
  email: string,
  password: string,
  full_name: string,
): Promise<Result<{ id: string }>> {
  const { data, error } = await getClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  })
  if (error) return { error: error.message }
  return { data: { id: data.user.id } }
}

export async function deleteUser(user_id: string): Promise<Result> {
  const { error } = await getClient().auth.admin.deleteUser(user_id)
  if (error) return { error: error.message }
  return {}
}

export async function resetPassword(user_id: string, password: string): Promise<Result> {
  const { error } = await getClient().auth.admin.updateUserById(user_id, { password })
  if (error) return { error: error.message }
  return {}
}

// ── Role management ─────────────────────────────────────────────────────

export async function createRole(payload: {
  name: string
  slug: string
  description: string
  permissions: Permission[]
}): Promise<Result<Role>> {
  const { data, error } = await getClient()
    .from('roles')
    .insert({ ...payload, is_system: false })
    .select()
    .single()
  if (error) return { error: error.message }
  return { data: data as Role }
}

export async function updateRole(
  id: string,
  payload: { name: string; description: string; permissions: Permission[] },
): Promise<Result<Role>> {
  const { data, error } = await getClient()
    .from('roles')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { data: data as Role }
}

export async function deleteRole(id: string): Promise<Result> {
  const { error } = await getClient().from('roles').delete().eq('id', id)
  if (error) return { error: error.message }
  return {}
}

// ── User ↔ Role assignment ──────────────────────────────────────────────

export async function assignRole(
  user_id: string,
  role_id: string,
  assigned_by: string,
): Promise<Result> {
  const { error } = await getClient()
    .from('user_roles')
    .insert({ user_id, role_id, assigned_by })
  if (error) return { error: error.message }
  return {}
}

export async function removeRole(user_id: string, role_id: string): Promise<Result> {
  const { error } = await getClient()
    .from('user_roles')
    .delete()
    .eq('user_id', user_id)
    .eq('role_id', role_id)
  if (error) return { error: error.message }
  return {}
}

// ── Standard Block Definitions ───────────────────────────────────────────

export async function createStandardBlock(
  payload: Omit<import('../types').BlockDefinition, 'id' | 'created_at'>,
): Promise<Result<import('../types').BlockDefinition>> {
  const { data, error } = await getClient()
    .from('block_definitions')
    .insert({ ...payload, is_universal: true })
    .select()
    .single()
  if (error) return { error: error.message }
  return { data: data as import('../types').BlockDefinition }
}

export async function updateStandardBlock(
  id: string,
  payload: Partial<import('../types').BlockDefinition>,
): Promise<Result<import('../types').BlockDefinition>> {
  const { data, error } = await getClient()
    .from('block_definitions')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { data: data as import('../types').BlockDefinition }
}

export async function deleteStandardBlock(id: string): Promise<Result> {
  const { error } = await getClient().from('block_definitions').delete().eq('id', id)
  if (error) return { error: error.message }
  return {}
}

// ── Encounter Templates ──────────────────────────────────────────────────

export async function createTemplate(
  payload: Omit<import('../types').EncounterTemplate, 'id' | 'created_at' | 'updated_at'>,
): Promise<Result<import('../types').EncounterTemplate>> {
  const { data, error } = await getClient()
    .from('encounter_templates')
    .insert(payload)
    .select()
    .single()
  if (error) return { error: error.message }
  return { data: data as import('../types').EncounterTemplate }
}

export async function updateTemplate(
  id: string,
  payload: Partial<Omit<import('../types').EncounterTemplate, 'id' | 'created_at' | 'updated_at' | 'created_by'>>,
): Promise<Result<import('../types').EncounterTemplate>> {
  const { data, error } = await getClient()
    .from('encounter_templates')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { data: data as import('../types').EncounterTemplate }
}

export async function deleteTemplate(id: string): Promise<Result> {
  const { error } = await getClient().from('encounter_templates').delete().eq('id', id)
  if (error) return { error: error.message }
  return {}
}
