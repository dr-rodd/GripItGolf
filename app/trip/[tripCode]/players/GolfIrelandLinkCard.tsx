'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LinkHeading } from '@/app/components/LinkMark'
import GolfIrelandTour from '@/app/components/GolfIrelandTour'
import { FIELD, buttonClass, cardClass } from '@/app/components/ui'

/**
 * Linking your Golf Ireland membership, on a league that reads its cards —
 * shown to the player this phone has claimed.
 *
 * Not linked: what linking means, the consent tick, then a search of the
 * league's clubs' membership by surname or membership number. A match
 * shows only a name, a hidden number and the club; "This is me" asks to
 * link, and the organiser then confirms it is them before any card is read
 * (docs/golf-ireland.md). Requested or linked: the state in a sentence and
 * Unlink, which deletes their imported cards at once.
 *
 * The link stands where Golf Ireland's logo will go (app/components/
 * LinkMark.tsx) — no Golf Ireland branding until they permit it.
 */

export type LinkStatus =
  | { state: 'none' }
  | { state: 'requested' | 'linked' | 'blocked'; memberName: string; clubName: string; text: string }

type Match = { name: string; masked: string; club: string; pick: string }

const SMALL_BUTTON = 'px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40'

export default function GolfIrelandLinkCard({ tripCode, status, rulesLine, clubNames, connected, playerName }: {
  tripCode: string
  status: LinkStatus
  /** Which rounds count, in the facts style — lib/golfIreland.ts `describeRules`. */
  rulesLine: string
  /** The league's clubs that have given access, by name. */
  clubNames: string[]
  /** Are Green Dot's Golf Ireland keys set? Until then every search says so. */
  connected: boolean
  /** The claimed player's name, for the walkthrough's miniatures. */
  playerName?: string
}) {
  const [tour, setTour] = useState(false)
  const router = useRouter()
  const [consent, setConsent] = useState(false)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function post(path: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/golf-ireland/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripCode, ...body }),
    })
    return { res, body: await res.json().catch(() => ({})) }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !query.trim()) return
    setBusy('search')
    setMessage(null)
    setMatches(null)
    try {
      const { res, body } = await post('search', { query })
      if (!res.ok || !body.ok) {
        setMessage({ ok: false, text: body.message ?? 'Could not search — try again.' })
        return
      }
      setMatches(body.matches ?? [])
      if (body.message) setMessage({ ok: false, text: body.message })
    } catch {
      setMessage({ ok: false, text: 'Could not reach the site — check your connection and try again.' })
    } finally {
      setBusy(null)
    }
  }

  async function link(m: Match) {
    if (busy) return
    if (!consent) {
      setMessage({ ok: false, text: 'Tick the box to agree before linking.' })
      return
    }
    setBusy(m.pick)
    setMessage(null)
    try {
      const { res, body } = await post('link', { pick: m.pick, consent: true })
      setMessage({ ok: res.ok && !!body.ok, text: body.message ?? 'Could not link — try again.' })
      if (res.ok && body.ok) { setMatches(null); router.refresh() }
    } catch {
      setMessage({ ok: false, text: 'Could not reach the site — check your connection and try again.' })
    } finally {
      setBusy(null)
    }
  }

  /** "Fetch my scores": this player's rounds read in now, not overnight. */
  async function fetchMine() {
    if (busy) return
    setBusy('fetch')
    setMessage(null)
    try {
      const { res, body } = await post('fetch', { scope: 'mine' })
      setMessage({ ok: res.ok && !!body.ok, text: body.message ?? 'Could not read your rounds — try again.' })
      if (res.ok && body.ok) router.refresh()
    } catch {
      setMessage({ ok: false, text: 'Could not reach the site — check your connection and try again.' })
    } finally {
      setBusy(null)
    }
  }

  async function unlink() {
    if (busy) return
    if (!window.confirm(
      'Unlink Golf Ireland? Every Golf Ireland round read into this league for you is deleted, and your standing re-tells without them.',
    )) return
    setBusy('unlink')
    setMessage(null)
    try {
      const { res, body } = await post('unlink', {})
      setMessage({ ok: res.ok && !!body.ok, text: body.message ?? 'Could not unlink — try again.' })
      if (res.ok && body.ok) router.refresh()
    } catch {
      setMessage({ ok: false, text: 'Could not reach the site — check your connection and try again.' })
    } finally {
      setBusy(null)
    }
  }

  const note = message && (
    <p className={`text-[13px] mt-3 leading-snug ${message.ok ? 'text-accent-deep' : 'text-rust-deep'}`}>
      {message.text}
    </p>
  )

  if (status.state !== 'none') {
    return (
      <section className={`p-4 ${cardClass()}`}>
        <LinkHeading>Golf Ireland</LinkHeading>
        <p className="text-ink text-sm font-medium mt-3">
          {status.memberName}{status.clubName && <span className="text-ink/65 font-normal"> · {status.clubName}</span>}
        </p>
        <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">{status.text}</p>
        <p className="t-cap text-ink/65 mt-2">Rounds that count: {rulesLine}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {status.state === 'linked' && (
            <button
              type="button"
              onClick={fetchMine}
              disabled={!!busy}
              className={`${SMALL_BUTTON} border-accent-deep text-accent-deep hover:bg-accent-tint`}
            >
              {busy === 'fetch' ? 'Fetching…' : 'Fetch my scores'}
            </button>
          )}
          <button
            type="button"
            onClick={unlink}
            disabled={!!busy}
            className={`${SMALL_BUTTON} border-rust/40 text-rust-deep hover:bg-rust/[0.06]`}
          >
            {busy === 'unlink' ? 'Unlinking…' : 'Unlink'}
          </button>
        </div>
        {note}
      </section>
    )
  }

  return (
    <section className={`p-4 ${cardClass()}`}>
      <LinkHeading>Link your Golf Ireland membership</LinkHeading>
      <p className="text-ink/65 text-[13px] mt-3 leading-snug">
        This league reads the rounds you hand in to Golf Ireland, so you don&apos;t
        score them twice. Find yourself in your club&apos;s membership, and the
        organiser confirms it&apos;s you.
      </p>
      <p className="t-cap text-ink/65 mt-2">Rounds that count: {rulesLine}</p>
      <button
        type="button"
        onClick={() => setTour(true)}
        className="block t-cap text-accent-deep hover:text-accent transition-colors mt-2"
      >
        See how linking works →
      </button>
      <GolfIrelandTour open={tour} onClose={() => setTour(false)} name={playerName} club={clubNames[0]} />
      {!connected && (
        <p className="text-ink/80 text-[13px] mt-3 leading-snug">
          Golf Ireland isn&apos;t connected yet. Access has been asked for, and
          linking opens once it is granted.
        </p>
      )}

      <label className="flex items-start gap-3 mt-4 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={e => setConsent(e.target.checked)}
          className="mt-1 w-4 h-4 accent-accent flex-shrink-0"
        />
        <span className="text-ink/80 text-[13px] leading-snug">
          I agree that Green Dot reads my Golf Ireland rounds that meet this
          league&apos;s rules, and shows their totals on its leaderboard.
          Unlinking deletes them at once.{' '}
          <Link href="/privacy" className="text-accent-deep underline underline-offset-2">Privacy</Link>
        </span>
      </label>

      <form onSubmit={search} className="flex gap-2 mt-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Surname or membership number"
          aria-label="Surname or membership number"
          className={`${FIELD} flex-1 min-w-0`}
        />
        <button
          type="submit"
          disabled={!!busy || !query.trim()}
          className={buttonClass('secondary', false)}
        >
          {busy === 'search' ? '…' : 'Search'}
        </button>
      </form>
      {clubNames.length > 0 && (
        <p className="t-cap text-ink/65 mt-2">Searching {clubNames.join(', ')}</p>
      )}

      {matches && matches.length === 0 && !message && (
        <p className="text-ink/65 text-[13px] mt-3 leading-snug">
          Nobody by that name. Check the spelling, or try your membership number.
        </p>
      )}
      {matches && matches.length > 0 && (
        <div className="flex flex-col gap-2 mt-3">
          {matches.map(m => (
            <div key={m.pick} className="flex items-center justify-between gap-3 px-4 py-3 rounded-tile border border-line">
              <div className="min-w-0">
                <p className="text-ink text-sm font-medium truncate">{m.name}</p>
                <p className="t-cap text-ink/65 tabular-nums">{m.masked}{m.club && ` · ${m.club}`}</p>
              </div>
              <button
                type="button"
                onClick={() => link(m)}
                disabled={!!busy}
                className={`${SMALL_BUTTON} border-line-strong text-ink/80 hover:border-bark/40 flex-shrink-0`}
              >
                {busy === m.pick ? '…' : 'This is me'}
              </button>
            </div>
          ))}
        </div>
      )}
      {note}
    </section>
  )
}
