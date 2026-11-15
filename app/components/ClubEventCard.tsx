'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CLUB_ACCESS, CLUB_ACCESS_WORDS, type ClubAccess } from '@/lib/clubs'
import { MAX_PASSCODE, passcodeError } from '@/lib/passcode'
import { eventClub, type EventClubView } from '@/lib/entryClient'
import { useUnlocked } from './useUnlocked'
import { FIELD, FIELD_LABEL, buttonClass, optionClass } from './ui'

/**
 * An event's club (stage (c), D138–D140), for its organiser: put it under a
 * verified club this Green Dot member runs, choose who edits it, or take it
 * out. Drawn only for the organiser, and only when there is a club to speak
 * of — the event's, or one this account runs — so a phone with no account
 * never sees it. Asked after the page has painted, never on the way in.
 */
export default function ClubEventCard({ tripCode, pinSet, isTrip }: {
  tripCode: string
  pinSet: boolean
  isTrip: boolean
}) {
  const router = useRouter()
  const [unlocked] = useUnlocked(tripCode)
  const organiser = !pinSet || unlocked
  const [view, setView] = useState<EventClubView | null>(null)
  const [pick, setPick] = useState('')
  const [access, setAccess] = useState<ClubAccess>('admins')
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const word = isTrip ? 'trip' : 'event'

  useEffect(() => {
    if (!organiser) { setView(null); return }
    let live = true
    eventClub(tripCode).then(r => {
      if (!live || !r || 'error' in r) return
      setView(r)
      setPick(r.clubs[0]?.id ?? '')
      if (r.access) setAccess(r.access)
    })
    return () => { live = false }
  }, [organiser, tripCode])

  async function change(c: Parameters<typeof eventClub>[1], done: string) {
    setBusy(true); setError(''); setSaved('')
    const r = await eventClub(tripCode, c)
    setBusy(false)
    if (!r) { setError('Could not reach Green Dot — try again.'); return }
    if ('error' in r) { setError(r.error); return }
    setView(r)
    if (r.access) setAccess(r.access)
    setPin(''); setAgain('')
    setSaved(done)
    router.refresh()
  }

  if (!view || (!view.club && view.clubs.length === 0)) return null

  if (!view.club) {
    const chosen = view.clubs.find(c => c.id === pick) ?? view.clubs[0]
    return (
      <section className={isTrip ? 'mt-8 mb-4' : 'mb-10'}>
        <h2 className="t-h2 text-ink">Run by a club</h2>
        <p className="text-ink/65 text-sm mt-1 leading-snug">
          Put this {word} under your club: its owners and admins run it on any phone they’re signed in on, and it shows in its
          people’s lists of events. Nobody else can change it unless you lend them a PIN.
        </p>
        {view.clubs.length > 1 && (
          <div className="mt-4">
            <label htmlFor={`club-pick-${tripCode}`} className={FIELD_LABEL}>Club</label>
            <select id={`club-pick-${tripCode}`} value={pick} onChange={e => setPick(e.target.value)} className={FIELD}>
              {view.clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {error && <p className="t-cap text-rust-deep mt-2" role="alert">{error}</p>}
        <button type="button" disabled={busy || !chosen}
          onClick={() => void change({ clubId: chosen.id, access: 'admins' }, `${chosen.name} runs it now.`)}
          className={`${buttonClass('secondary', false)} mt-4`}>
          {busy ? 'Saving…' : `Put it under ${chosen?.name ?? 'the club'}`}
        </button>
      </section>
    )
  }

  const pinIssue = access === 'pin' ? (passcodeError(pin) ?? (pin !== again ? 'The two PINs don’t match.' : null)) : null
  const club = view.club.name
  return (
    <section className={isTrip ? 'mt-8 mb-4' : 'mb-10'}>
      <h2 className="t-h2 text-ink">Run by {club}</h2>
      {view.runsClub ? (
        <>
          <p className="text-ink/65 text-sm mt-1 leading-snug">Who can change this {word}?</p>
          <div className="mt-4 space-y-2" role="radiogroup" aria-label="Who can edit">
            {CLUB_ACCESS.map(a => (
              <button key={a} type="button" role="radio" aria-checked={access === a} disabled={busy}
                onClick={() => { setAccess(a); setError(''); setSaved('') }}
                className={`${optionClass(access === a, 'row')} w-full text-left`}>
                <span className="block t-card text-ink">{CLUB_ACCESS_WORDS[a].label}</span>
                <span className="block t-cap text-ink/65 mt-0.5">{CLUB_ACCESS_WORDS[a].line}</span>
              </button>
            ))}
          </div>
          {access === 'pin' && (
            <div className="space-y-3 mt-4">
              {(['new', 'again'] as const).map(k => (
                <label key={k} className="block" htmlFor={`club-pin-${tripCode}-${k}`}>
                  <span className="t-label text-ink block mb-1">{k === 'new' ? 'PIN to lend' : 'Type it again'}</span>
                  <input id={`club-pin-${tripCode}-${k}`} type="password" inputMode="numeric" autoComplete="new-password"
                    value={k === 'new' ? pin : again}
                    onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, MAX_PASSCODE); if (k === 'new') setPin(v); else setAgain(v) }}
                    className={`${FIELD} field-code`} />
                </label>
              ))}
              <p className="t-cap text-ink/65">4 to 8 digits, for this {word} alone. Choosing one ends any PIN lent before.</p>
            </div>
          )}
          {error && <p className="t-cap text-rust-deep mt-2" role="alert">{error}</p>}
          {saved && <p className="t-cap text-accent-deep mt-2" role="status">{saved}</p>}
          <button type="button"
            disabled={busy || (access === view.access && access !== 'pin') || (access === 'pin' && (!pin || !!pinIssue))}
            onClick={() => void change({ access, ...(access === 'pin' ? { pin } : {}) }, 'Saved.')}
            className={`${buttonClass('secondary', false)} mt-4`}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      ) : (
        <p className="text-ink/65 text-sm mt-1 leading-snug">
          {club}’s owners and admins run it and choose who else can change it.
        </p>
      )}
      {view.mayTakeOut && (
        <button type="button" disabled={busy}
          onClick={() => void change({ clubId: null }, `Taken out of ${club}. Set a new PIN if the old one isn’t yours.`)}
          className={`${buttonClass('quiet', false)} mt-2 block`}>
          Take it out of {club}
        </button>
      )}
    </section>
  )
}
