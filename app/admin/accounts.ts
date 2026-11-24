import type { createAdminClient } from '@/lib/supabase-admin'
import { normaliseEmail, normaliseUsername } from '@/lib/account'

// Finding a Green Dot account from /admin, by username or email. Its own
// file — never a 'use server' one, where every export is a request anybody
// can make — so the clubs and test-club actions share it behind their own
// requireAdmin().

type Db = ReturnType<typeof createAdminClient>

/** The Green Dot account a username or an email names — a confirmed one, never a phone's anonymous sign-in. */
export async function findAccount(db: Db, typed: string): Promise<{ id: string; email: string; username: string | null } | null> {
  const t = typed.trim()
  if (!t) return null
  let id: string | null = null
  if (t.includes('@')) {
    const email = normaliseEmail(t)
    // The account list is small: read it in pages until the address turns up.
    for (let page = 1; page <= 50 && !id; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw error
      id = data.users.find(u => !u.is_anonymous && (u.email ?? '').toLowerCase() === email)?.id ?? null
      if (data.users.length < 200) break
    }
  } else {
    const { data, error } = await db.from('account_usernames').select('user_id').eq('username', normaliseUsername(t)).maybeSingle()
    if (error) throw error
    id = (data as { user_id?: string } | null)?.user_id ?? null
  }
  if (!id) return null
  const [{ data: user }, { data: name }] = await Promise.all([
    db.auth.admin.getUserById(id),
    db.from('account_usernames').select('username').eq('user_id', id).maybeSingle(),
  ])
  const email = user.user?.email
  if (!user.user || user.user.is_anonymous || !email) return null
  return { id, email, username: (name as { username?: string } | null)?.username ?? null }
}

