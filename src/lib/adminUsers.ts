/**
 * adminUsers — privileged admin operations.
 *
 * Auth mutations (create/delete/reset) → Supabase Edge Function `admin-users`.
 *   The service role key lives only in that server-side function as a Supabase
 *   project secret; it is never shipped to the browser.
 *
 * Role / template mutations → SECURITY DEFINER RPCs in Postgres.
 *   Each RPC verifies the caller holds the required permission before acting.
 *
 * Block definition mutations → regular anon client.
 *   RLS on block_definitions already gates on admin.manage_blocks.
 */
import { supabase } from './supabase'
import type { Role, Permission, BlockDefinition, EncounterTemplate } from '../types'

type Result<T = void> = { data?: T; error?: string }

// ── Helpers ──────────────────────────────────────────────────────────────

async function invokeAdminAuth<T>(
  action: string,
  params: Record<string, unknown>,
): Promise<Result<T>> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action, ...params },
  })
  if (error) return { error: error.message }
  if (data?.error) return { error: data.error as string }
  return { data: data?.data as T }
}

// ── Auth users ──────────────────────────────────────────────────────────

export async function createUser(
  email: string,
  password: string,
  full_name: string,
): Promise<Result<{ id: string }>> {
  return invokeAdminAuth('create_user', { email, password, full_name })
}

export async function deleteUser(user_id: string): Promise<Result> {
  return invokeAdminAuth('delete_user', { user_id })
}

export async function resetPassword(user_id: string, password: string): Promise<Result> {
  return invokeAdminAuth('reset_password', { user_id, password })
}

// ── Role management ─────────────────────────────────────────────────────

export async function createRole(payload: {
  name: string
  slug: string
  description: string
  permissions: Permission[]
}): Promise<Result<Role>> {
  const { data, error } = await supabase.rpc('admin_create_role', {
    p_name: payload.name,
    p_slug: payload.slug,
    p_description: payload.description,
    p_permissions: payload.permissions,
  })
  if (error) return { error: error.message }
  return { data: data as Role }
}

export async function updateRole(
  id: string,
  payload: { name: string; description: string; permissions: Permission[] },
): Promise<Result<Role>> {
  const { data, error } = await supabase.rpc('admin_update_role', {
    p_id: id,
    p_name: payload.name,
    p_description: payload.description,
    p_permissions: payload.permissions,
  })
  if (error) return { error: error.message }
  return { data: data as Role }
}

export async function deleteRole(id: string): Promise<Result> {
  const { error } = await supabase.rpc('admin_delete_role', { p_id: id })
  if (error) return { error: error.message }
  return {}
}

// ── User ↔ Role assignment ──────────────────────────────────────────────

export async function assignRole(
  user_id: string,
  role_id: string,
): Promise<Result> {
  const { error } = await supabase.rpc('admin_assign_role', {
    p_user_id: user_id,
    p_role_id: role_id,
  })
  if (error) return { error: error.message }
  return {}
}

export async function removeRole(user_id: string, role_id: string): Promise<Result> {
  const { error } = await supabase.rpc('admin_remove_role', {
    p_user_id: user_id,
    p_role_id: role_id,
  })
  if (error) return { error: error.message }
  return {}
}

export async function updateProfile(user_id: string, full_name: string): Promise<Result> {
  const { error } = await supabase.rpc('admin_update_profile', {
    p_user_id: user_id,
    p_full_name: full_name,
  })
  if (error) return { error: error.message }
  return {}
}

// ── Standard Block Definitions ───────────────────────────────────────────
// RLS on block_definitions already gates mutations on admin.manage_blocks,
// so the regular anon client works here — no service role needed.

export async function createStandardBlock(
  payload: Omit<BlockDefinition, 'id' | 'created_at'>,
): Promise<Result<BlockDefinition>> {
  const { data, error } = await supabase
    .from('block_definitions')
    .insert({ ...payload, is_universal: true })
    .select()
    .single()
  if (error) return { error: error.message }
  return { data: data as BlockDefinition }
}

export async function updateStandardBlock(
  id: string,
  payload: Partial<BlockDefinition>,
): Promise<Result<BlockDefinition>> {
  const { data, error } = await supabase
    .from('block_definitions')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { data: data as BlockDefinition }
}

export async function deleteStandardBlock(id: string): Promise<Result> {
  const { error } = await supabase.from('block_definitions').delete().eq('id', id)
  if (error) return { error: error.message }
  return {}
}

// ── Encounter Templates ──────────────────────────────────────────────────
// Universal templates can't be mutated via RLS; admin RPCs handle them.

export async function createTemplate(
  payload: Omit<EncounterTemplate, 'id' | 'created_at' | 'updated_at'>,
): Promise<Result<EncounterTemplate>> {
  const { data, error } = await supabase.rpc('admin_create_template', {
    p_name:                     payload.name,
    p_description:              payload.description ?? null,
    p_is_universal:             payload.is_universal,
    p_visible_to_roles:         payload.visible_to_roles,
    p_blocks:                   payload.blocks,
    p_default_visibility:       payload.default_visibility,
    p_default_visible_to_roles: payload.default_visible_to_roles,
  })
  if (error) return { error: error.message }
  return { data: data as EncounterTemplate }
}

export async function updateTemplate(
  id: string,
  payload: Required<Omit<EncounterTemplate, 'id' | 'created_at' | 'updated_at' | 'created_by'>>,
): Promise<Result<EncounterTemplate>> {
  const { data, error } = await supabase.rpc('admin_update_template', {
    p_id:                       id,
    p_name:                     payload.name,
    p_description:              payload.description ?? null,
    p_is_universal:             payload.is_universal,
    p_visible_to_roles:         payload.visible_to_roles,
    p_blocks:                   payload.blocks,
    p_default_visibility:       payload.default_visibility,
    p_default_visible_to_roles: payload.default_visible_to_roles,
  })
  if (error) return { error: error.message }
  return { data: data as EncounterTemplate }
}

export async function deleteTemplate(id: string): Promise<Result> {
  const { error } = await supabase.rpc('admin_delete_template', { p_id: id })
  if (error) return { error: error.message }
  return {}
}
