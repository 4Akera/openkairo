import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function missing(field: string) {
  return jsonResponse({ error: `${field} is required` }, 400)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify the caller's JWT and check permission — uses anon key + caller JWT so RLS applies
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: perms } = await callerClient.rpc('get_my_permissions')
    if (!Array.isArray(perms) || !perms.includes('admin.manage_users')) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    const { action, ...params } = await req.json()

    // Admin client — service role key stays server-side only, never shipped to browser
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    if (action === 'create_user') {
      const { email, password, full_name } = params
      if (!email?.trim())     return missing('email')
      if (!password?.trim())  return missing('password')
      if (!full_name?.trim()) return missing('full_name')
      const { data, error } = await adminClient.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name.trim() },
      })
      if (error) return jsonResponse({ error: error.message }, 400)
      return jsonResponse({ data: { id: data.user.id } })
    }

    if (action === 'delete_user') {
      const { user_id } = params
      if (!user_id) return missing('user_id')
      const { error } = await adminClient.auth.admin.deleteUser(user_id)
      if (error) return jsonResponse({ error: error.message }, 400)
      return jsonResponse({ data: {} })
    }

    if (action === 'reset_password') {
      const { user_id, password } = params
      if (!user_id)          return missing('user_id')
      if (!password?.trim()) return missing('password')
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password })
      if (error) return jsonResponse({ error: error.message }, 400)
      return jsonResponse({ data: {} })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (_err) {
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
