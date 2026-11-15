import { Resend } from 'resend'
import { countSince, emailCountLine, irishMidnight } from '@/lib/emailCount'

/**
 * Today's emails, counted from Resend (D160): every send through the one key
 * — Supabase's sign-in codes over SMTP included. Asked only when /admin is
 * opened, in its own Suspense so the page never waits on it, and quiet about
 * why it cannot count (no key, or a key allowed only to send).
 */
export default async function EmailCount() {
  const key = process.env.RESEND_API_KEY
  if (!key) return <p className="t-cap text-ink/65">Email isn’t set up, so nothing is being sent.</p>
  try {
    const resend = new Resend(key)
    const since = irishMidnight(new Date())
    let today = 0
    let after: string | undefined
    for (let page = 0; page < 5; page++) {
      const r = await resend.emails.list(after ? { limit: 100, after } : { limit: 100 })
      if (r.error || !r.data) throw r.error ?? new Error('no list')
      const rows = r.data.data
      const c = countSince(rows.map(e => e.created_at), since)
      today += c.today
      if (c.reachedPast || !r.data.has_more || rows.length === 0) break
      after = rows[rows.length - 1].id
    }
    return <p className="t-cap text-ink/80">{emailCountLine(today)}</p>
  } catch {
    return <p className="t-cap text-ink/65">Could not count today’s emails — the Resend key may be allowed to send only.</p>
  }
}
