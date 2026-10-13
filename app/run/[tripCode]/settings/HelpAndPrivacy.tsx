'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SITE } from '@/config/site'
import { forgetPlayer } from '@/lib/playerCookie'

/**
 * Settings' Help & privacy card: where to write, the privacy notice and the
 * terms — and, for a phone that has joined, "Leave this challenge and
 * delete my data".
 *
 * Strava's API Policy asks for an easily found support contact (§2.4) and
 * that a runner can have all their data deleted and be told in writing when
 * it is (§2.5). The button posts to `/api/run/me/delete`, which deletes the
 * runner this phone joined as; its answer is the confirmation shown here.
 * Then the cookie goes and the page re-reads (lib/currentPlayer.ts: the
 * cookie changed, so refresh before anything else), and this card — same
 * place in the tree — keeps the confirmation on screen.
 */

const LINK = 'text-accent-deep underline underline-offset-2 hover:text-accent transition-colors'

export default function HelpAndPrivacy({ code, joinedAs }: {
  code: string
  /** The name this phone joined as, or null when it has not joined. */
  joinedAs: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function leave() {
    if (busy || !joinedAs) return
    if (!window.confirm(
      `Leave this challenge and delete your data, ${joinedAs}? Your name, your place on your team, your runs and any Strava connection are permanently deleted. This cannot be undone.`,
    )) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/run/me/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripCode: code }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setMessage({ ok: false, text: body.message ?? 'Could not delete your data — try again.' })
        return
      }
      forgetPlayer(code)
      setMessage({ ok: true, text: body.message })
      router.refresh()
    } catch {
      setMessage({ ok: false, text: 'Could not reach the site — check your connection and try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface border border-bark/12 rounded-2xl p-4">
      <p className="text-ink/80 text-[13px] leading-snug">
        Questions, or anything about your data: write to{' '}
        <a href={`mailto:${SITE.supportEmail}`} className={LINK}>{SITE.supportEmail}</a>.
      </p>
      <p className="text-[13px] mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/privacy" className={LINK}>Privacy notice</Link>
        <Link href="/terms" className={LINK}>Terms</Link>
      </p>

      {joinedAs && (
        <div className="mt-4 pt-4 border-t border-bark/12">
          <button
            type="button"
            onClick={leave}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-rust/40 text-rust-deep hover:bg-rust/[0.06] transition-colors disabled:opacity-40"
          >
            {busy ? 'Deleting…' : 'Leave and delete my data'}
          </button>
          <p className="text-ink/65 text-[13px] mt-2 leading-snug">
            Permanently deletes your name, your place on your team, every run you have
            logged and any Strava connection, from this challenge. A final team total
            already frozen stays — it is the team&apos;s, not yours.
          </p>
        </div>
      )}

      {message && (
        <p
          role="status"
          className={`text-[13px] mt-3 leading-snug ${message.ok ? 'text-accent-deep' : 'text-rust-deep'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
