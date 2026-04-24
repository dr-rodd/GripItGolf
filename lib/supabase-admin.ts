import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Only used in the password-protected
// settings page for admin operations (reset scores, reset teams).
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
