import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Server only, ever: the admin pages and
// actions under app/admin/**, and the API routes that write platform data.
// Returns a new client on each call so it is safe to call inside handlers.
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}
