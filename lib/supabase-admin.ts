import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Only used in the password-protected
// settings page for admin operations (reset scores, reset teams).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})
