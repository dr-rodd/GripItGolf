'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { rememberPlayer } from '@/lib/playerCookie'

type Player = {
  id: string
  name: string
  handicap: number | null
  gender: string
}

export default function PlayersClient({
  tripCode,
  tripId,
  unclaimedPlayers,
}: {
  tripCode: string
  tripId: string
  unclaimedPlayers: Player[]
}) {
  const router = useRouter()
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addHandicap, setAddHandicap] = useState('')
  const [addGender, setAddGender] = useState<'M' | 'F'>('M')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  async function handleClaim(player: Player) {
    setClaimingId(player.id)
    const { error } = await supabase
      .from('players')
      .update({ claimed: true })
      .eq('id', player.id)
    if (error) {
      setClaimingId(null)
      setError('Could not claim player — try again')
      return
    }
    // Remember them on this device, so the trip greets them by name next
    // time. Only after the write succeeded — a failed claim should leave no
    // trace. If cookies are blocked this does nothing and the trip is
    // unaffected; they simply arrive as a stranger each visit.
    rememberPlayer(tripCode, player.id)
    router.push(`/trip/${tripCode}`)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setAdding(true)
    const name = addName.trim()
    const handicap = parseFloat(addHandicap)
    if (!name || isNaN(handicap)) {
      setError('Please enter a valid name and handicap')
      setAdding(false)
      return
    }
    // The id comes back from the insert — that is the id the cookie stores,
    // so there is no second identifier to keep in step with anything.
    const { data, error } = await supabase
      .from('players')
      .insert({
        trip_id: tripId,
        name,
        handicap,
        gender: addGender,
        claimed: true,
      })
      .select('id')
      .single()
    if (error || !data) {
      setError('Could not add player — try again')
      setAdding(false)
      return
    }
    rememberPlayer(tripCode, data.id)
    router.push(`/trip/${tripCode}`)
  }

  return (
    <div className="flex flex-col gap-10">
      {unclaimedPlayers.length > 0 && (
        <section>
          <p className="text-ink/40 text-xs tracking-[0.2em] uppercase mb-4">Join as existing player</p>
          <div className="flex flex-col gap-3">
            {unclaimedPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => handleClaim(p)}
                disabled={claimingId !== null}
                className="flex items-center justify-between px-5 py-4 border border-bark/12 rounded-xl hover:border-accent/40 transition-colors text-left disabled:opacity-50"
              >
                <div>
                  <p className="text-ink text-sm font-medium">{p.name}</p>
                  {p.handicap != null && (
                    <p className="text-ink/40 text-xs mt-0.5">HCP {p.handicap}</p>
                  )}
                </div>
                <span className="text-accent text-lg">
                  {claimingId === p.id ? '…' : '→'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="text-ink/40 text-xs tracking-[0.2em] uppercase mb-4">Add yourself</p>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Your name"
            required
            className="w-full py-4 px-5 bg-surface border border-bark/12 rounded-xl text-ink text-sm placeholder:text-ink/25 focus:outline-none focus:border-accent/60 transition-colors"
          />
          <input
            type="number"
            inputMode="decimal"
            value={addHandicap}
            onChange={(e) => setAddHandicap(e.target.value)}
            placeholder="Handicap (e.g. 14.2)"
            step="0.1"
            min="0"
            max="54"
            required
            className="w-full py-4 px-5 bg-surface border border-bark/12 rounded-xl text-ink text-sm placeholder:text-ink/25 focus:outline-none focus:border-accent/60 transition-colors"
          />
          <div className="flex gap-3">
            {(['M', 'F'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setAddGender(g)}
                className={`flex-1 py-4 rounded-xl text-sm font-bold tracking-[0.15em] uppercase transition-colors ${
                  addGender === g
                    ? 'bg-accent text-ink'
                    : 'bg-surface border border-bark/12 text-ink/40 hover:border-accent/40'
                }`}
              >
                {g === 'M' ? 'Male' : 'Female'}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-accent text-sm text-center leading-snug">{error}</p>
          )}

          <button
            type="submit"
            disabled={adding || !addName.trim() || !addHandicap}
            className="w-full py-5 bg-accent text-ink text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-accent-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {adding ? 'Adding…' : 'Join Trip'}
          </button>
        </form>
      </section>
    </div>
  )
}
