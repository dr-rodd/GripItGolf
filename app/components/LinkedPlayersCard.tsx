'use client'

import { useEffect, useState } from 'react'
import { readPlayerLinks } from '@/lib/entryClient'
import { useUnlocked } from './useUnlocked'
import { ListGroup, ListRow, buttonClass } from './ui'

/**
 * The organiser's view of the players a Green Dot member has linked
 * themselves to (D134, stage (b2)), with Unlink for a wrong one — which name
 * is linked, never who the member is. Asked only once this phone is the
 * organiser (the lock open, or an event nobody locked), and drawn only while
 * somebody is linked: never an empty heading.
 */
export default function LinkedPlayersCard({ tripCode, pinSet, isTrip }: {
  tripCode: string
  /** Whether the event has an organiser PIN — never its hash. */
  pinSet: boolean
  isTrip: boolean
}) {
  const [unlocked] = useUnlocked(tripCode)
  const organiser = !pinSet || unlocked
  const [linked, setLinked] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!organiser) { setLinked([]); return }
    let live = true
    readPlayerLinks(tripCode).then(r => { if (live && r) setLinked(r) })
    return () => { live = false }
  }, [organiser, tripCode])

  async function unlink(id: string) {
    setBusy(id); setError('')
    const r = await readPlayerLinks(tripCode, id)
    setBusy(null)
    if (r) setLinked(r)
    else setError('Could not unlink — try again.')
  }

  if (!organiser || linked.length === 0) return null

  return (
    <section className={isTrip ? 'mt-8 mb-4' : 'mt-8 mb-10'}>
      <h2 className="t-h2 text-ink">Green Dot members</h2>
      <p className="text-ink/65 text-sm mt-1">
        These players are linked to a Green Dot member’s account, so the {isTrip ? 'trip' : 'event'} shows in their own list.
        Unlink one that isn’t them — their scores stay exactly as they are.
      </p>
      <ListGroup className="mt-4">
        {linked.map(p => (
          <ListRow
            key={p.id}
            label={p.name}
            hint="Linked to a Green Dot member"
            trailing={
              <button type="button" onClick={() => void unlink(p.id)} disabled={busy !== null}
                className={buttonClass('quiet', false, true)}>
                {busy === p.id ? 'Unlinking…' : 'Unlink'}
              </button>
            }
          />
        ))}
      </ListGroup>
      {error && <p className="t-cap text-rust-deep mt-2" role="alert">{error}</p>}
    </section>
  )
}
