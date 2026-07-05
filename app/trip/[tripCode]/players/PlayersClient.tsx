'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
    router.push(`/trip/${tripCode}/course/1`)
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
    const { error } = await supabase.from('players').insert({
      trip_id: tripId,
      name,
      handicap,
      gender: addGender,
      claimed: true,
    })
    if (error) {
      setError('Could not add player — try again')
      setAdding(false)
      return
    }
    router.push(`/trip/${tripCode}/course/1`)
  }

  return (
    <div className="flex flex-col gap-10">
      {unclaimedPlayers.length > 0 && (
        <section>
          <p className="text-white/30 text-xs tracking-[0.2em] uppercase mb-4">Join as existing player</p>
          <div className="flex flex-col gap-3">
            {unclaimedPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => handleClaim(p)}
                disabled={claimingId !== null}
                className="flex items-center justify-between px-5 py-4 border border-white/10 rounded-xl hover:border-[#C9A84C]/40 transition-colors text-left disabled:opacity-50"
              >
                <div>
                  <p className="text-white text-sm font-medium">{p.name}</p>
                  {p.handicap != null && (
                    <p className="text-white/40 text-xs mt-0.5">HCP {p.handicap}</p>
                  )}
                </div>
                <span className="text-[#C9A84C] text-lg">
                  {claimingId === p.id ? '…' : '→'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="text-white/30 text-xs tracking-[0.2em] uppercase mb-4">Add yourself</p>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Your name"
            required
            className="w-full py-4 px-5 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/60 transition-colors"
          />
          <input
            type="number"
            value={addHandicap}
            onChange={(e) => setAddHandicap(e.target.value)}
            placeholder="Handicap (e.g. 14.2)"
            step="0.1"
            min="0"
            max="54"
            required
            className="w-full py-4 px-5 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#C9A84C]/60 transition-colors"
          />
          <div className="flex gap-3">
            {(['M', 'F'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setAddGender(g)}
                className={`flex-1 py-4 rounded-xl text-sm font-bold tracking-[0.15em] uppercase transition-colors ${
                  addGender === g
                    ? 'bg-[#C9A84C] text-[#0a1a0e]'
                    : 'bg-white/5 border border-white/15 text-white/50 hover:border-[#C9A84C]/40'
                }`}
              >
                {g === 'M' ? 'Male' : 'Female'}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-[#C9A84C] text-sm text-center leading-snug">{error}</p>
          )}

          <button
            type="submit"
            disabled={adding || !addName.trim() || !addHandicap}
            className="w-full py-5 bg-[#C9A84C] text-[#0a1a0e] text-sm font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-[#d4b35a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {adding ? 'Adding…' : 'Join Trip'}
          </button>
        </form>
      </section>
    </div>
  )
}
