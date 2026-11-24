'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FIELD, FIELD_LABEL, buttonClass, cardClass } from '@/app/components/ui'
import { MAX_KEEP, OUTSIDE_TABLES, wipeConfirmed, type Counts, type WipePreview } from '@/lib/testClub'
import { previewWipeAction, saveKeepList, seedAction, wipeAction } from './actions'

/**
 * One test club on /admin/test-club (D311, D314): the keep-list — Ross and
 * his friends, by username, never wiped — and the wipe, which counts what it
 * will take, asks for the club's name, and shows the rows outside the club
 * before and after so it can be seen that nothing else changed — then
 * reseeds (s1): the characters, their accounts and places on the list, the
 * memberships, labels and the coming week's tee times. Each half stops at
 * about 45 seconds and is pressed on by the page until done.
 */
export default function TestClubPanel({ club, keep }: { club: { id: string; name: string; slug: string }; keep: string[] }) {
  const router = useRouter()
  const [keepText, setKeepText] = useState(keep.join('\n'))
  const [keepMsg, setKeepMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [preview, setPreview] = useState<WipePreview | null>(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ done: boolean; deleted: { events: number; listRows: number; accounts: number }; before: Counts; after: Counts; changed: string[] } | null>(null)
  const [pending, start] = useTransition()
  const [seedLines, setSeedLines] = useState<string[] | null>(null)
  const [stage, setStage] = useState<string | null>(null)

  /** The reseed, pressed on until it says it is done. */
  const reseed = async (): Promise<boolean> => {
    const all: string[] = []
    for (let i = 0; i < 12; i++) {
      setStage('Reseeding…')
      const r = await seedAction(club.id)
      if (!r.ok) { setError(r.error); setSeedLines(all); return false }
      all.push(...r.lines)
      setSeedLines([...all])
      if (r.done) return true
    }
    setError('The reseed is taking a long time — press Reseed to carry on.')
    return false
  }

  const save = () => start(async () => {
    setKeepMsg(null)
    const r = await saveKeepList(club.id, keepText)
    setKeepMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: 'Keep-list saved.' })
    if (!r.error) router.refresh()
  })
  const count = () => start(async () => {
    setError(null); setResult(null); setTyped('')
    const r = await previewWipeAction(club.id)
    if (r.error || !r.preview) { setError(r.error ?? 'Could not count — try again.'); return }
    setPreview(r.preview)
  })
  const wipe = () => start(async () => {
    setError(null); setSeedLines(null)
    // The wipe, pressed on until done; then the reseed.
    for (let i = 0; i < 12; i++) {
      setStage('Wiping…')
      const r = await wipeAction(club.id, typed)
      if (!r.ok) { setError(r.error); setStage(null); return }
      setResult(r)
      if (r.done) break
    }
    setPreview(null); setTyped('')
    await reseed()
    setStage(null)
    router.refresh()
  })
  const reseedOnly = () => start(async () => {
    setError(null); setResult(null)
    await reseed()
    setStage(null)
    router.refresh()
  })

  return (
    <section className={`${cardClass()} p-4`}>
      <h2 className="t-card text-ink">{club.name}</h2>
      <p className="t-cap text-ink/65 mt-0.5">greendot.live/club/{club.slug} · a test club</p>

      {/* The keep-list */}
      <div className="mt-5">
        <label htmlFor={`keep-${club.id}`} className={FIELD_LABEL}>Keep-list — usernames, one a line</label>
        <p className="t-cap text-ink/65 mb-2">
          These accounts and their own place on the club’s list are never wiped, never played and never signed for. Up to {MAX_KEEP}.
        </p>
        <textarea
          id={`keep-${club.id}`} className={`${FIELD} min-h-28`} rows={4}
          value={keepText} onChange={e => { setKeepText(e.target.value); setKeepMsg(null) }}
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
        />
        {keepMsg && <p role={keepMsg.ok ? 'status' : 'alert'} className={`t-cap mt-2 ${keepMsg.ok ? 'text-accent-deep' : 'text-rust-deep'}`}>{keepMsg.text}</p>}
        <button type="button" onClick={save} disabled={pending} className={`${buttonClass('primary', false)} mt-3`}>
          Save the keep-list
        </button>
      </div>

      {/* The wipe */}
      <div className="mt-6 pt-5 border-t border-line">
        <h3 className="t-label text-ink">Wipe and reseed</h3>
        <p className="t-cap text-ink/65 mt-1">
          Takes out every event, booking, label, preset, award and list row of the club, and its fictional accounts. Keeps the club itself — its name, address, crest, art and home course — the club’s owners and the keep-list. Then seeds the characters afresh: their accounts (each signs in with TEST_CLUB_PASSWORD), memberships, labels, handicaps and the coming week’s tee times.
        </p>
        {!preview && (
          <div className="flex flex-wrap gap-3 mt-3">
            <button type="button" onClick={count} disabled={pending} className={buttonClass('secondary', false)}>
              {pending && !stage ? 'Counting…' : 'Count what it would take'}
            </button>
            <button type="button" onClick={reseedOnly} disabled={pending} className={buttonClass('quiet', false)}>
              Reseed without wiping
            </button>
          </div>
        )}
        {stage && <p role="status" className="t-cap text-ink/65 mt-3">{stage}</p>}

        {preview && (
          <div className="mt-4">
            <ul className="t-cap text-ink space-y-1">
              <li>{preview.events} events and competitions, with everything on them</li>
              <li>{preview.listRows} rows of the list ({preview.keptRows} kept for the keep-list)</li>
              <li>{preview.fictionalAccounts} fictional accounts</li>
              {Object.entries(preview.clubRows).filter(([, n]) => (n ?? 0) > 0).map(([t, n]) => (
                <li key={t}>{n} {t.replace(/_/g, ' ')}</li>
              ))}
            </ul>
            {preview.keep.length === 0
              ? <p className="t-cap text-rust-deep mt-3">The keep-list is empty: every real account’s place on the list goes too.</p>
              : <p className="t-cap text-ink/65 mt-3">Kept: {preview.keep.map(k => `${k.username ?? 'an account'}${k.onList ? '' : ' (not on the list)'}`).join(', ')}</p>}
            <label htmlFor={`confirm-${club.id}`} className={`${FIELD_LABEL} mt-4`}>Type {club.name} to confirm</label>
            <input id={`confirm-${club.id}`} className={FIELD} value={typed} onChange={e => { setTyped(e.target.value); setError(null) }} autoComplete="off" />
            <div className="flex flex-wrap gap-3 mt-3">
              <button type="button" onClick={wipe} disabled={pending || !wipeConfirmed(typed, club.name)} className={buttonClass('danger', false)}>
                {pending ? 'Working…' : 'Wipe and reseed'}
              </button>
              <button type="button" onClick={() => { setPreview(null); setTyped(''); setError(null) }} disabled={pending} className={buttonClass('quiet', false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}

        {result && (
          <div className="mt-4" role="status">
            <p className="t-cap text-ink">
              {result.done ? 'Wiped.' : 'Wiped partway — press Wipe and reseed again to carry on.'}{' '}
              {result.deleted.events} events, {result.deleted.listRows} list rows and {result.deleted.accounts} fictional accounts deleted.
            </p>
            <table className="mt-3 t-cap w-full max-w-md">
              <thead>
                <tr className="text-ink/65 text-left"><th className="font-normal py-1">Outside the club</th><th className="font-normal">Before</th><th className="font-normal">After</th></tr>
              </thead>
              <tbody>
                {OUTSIDE_TABLES.filter(t => result.before[t] !== undefined).map(t => (
                  <tr key={t} className={result.changed.includes(t) ? 'text-rust-deep' : 'text-ink'}>
                    <td className="py-0.5">{t.replace(/_/g, ' ')}</td><td>{result.before[t]}</td><td>{result.after[t]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={`t-cap mt-2 ${result.changed.length ? 'text-rust-deep' : 'text-accent-deep'}`}>
              {result.changed.length
                ? `Changed outside the club: ${result.changed.join(', ')}. The site is live, so a real round scoring meanwhile moves a count — look before assuming the wipe did it.`
                : 'Nothing outside the club changed.'}
            </p>
          </div>
        )}
        {seedLines && seedLines.length > 0 && (
          <ul className="mt-4 t-cap text-ink space-y-1" role="status">
            {seedLines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
      </div>
    </section>
  )
}
