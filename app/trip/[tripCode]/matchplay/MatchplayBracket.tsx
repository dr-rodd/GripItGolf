/**
 * Bracket display — placeholder.
 *
 * Phase 3 replaces this with the real draw view. For now it lists the draw
 * round by round so an organiser can confirm the bracket came out right.
 * Deliberately a server component: no interactivity, so none of it ships as
 * client JavaScript.
 */

type Match = {
  id: string
  round_number: number
  round_name: string
  slot: number
  player_a_id: string | null
  player_b_id: string | null
  player_a_is_bye: boolean
  player_b_is_bye: boolean
  seed_a: number | null
  seed_b: number | null
  winner_player_id: string | null
}

type Player = { id: string; name: string }

export default function MatchplayBracket({
  matches, players,
}: {
  matches: Match[]
  players: Player[]
}) {
  const nameOf = new Map(players.map(p => [p.id, p.name]))
  const rounds = [...new Set(matches.map(m => m.round_number))].sort((a, b) => a - b)

  const played = matches.filter(
    m => m.winner_player_id && !m.player_a_is_bye && !m.player_b_is_bye
  ).length
  const byes = matches.filter(m => m.player_a_is_bye || m.player_b_is_bye).length

  /** One side of a match: a player, a bye, or nobody yet. */
  function Side({
    playerId, isBye, seed, isWinner,
  }: {
    playerId: string | null
    isBye: boolean
    seed: number | null
    isWinner: boolean
  }) {
    if (isBye) {
      return (
        <div className="flex items-center gap-2 py-1.5">
          <span className="w-6 text-white/20 text-xs tabular-nums flex-shrink-0">—</span>
          <span className="text-white/25 text-sm italic">Bye</span>
        </div>
      )
    }
    if (!playerId) {
      return (
        <div className="flex items-center gap-2 py-1.5">
          <span className="w-6 text-white/20 text-xs tabular-nums flex-shrink-0">—</span>
          <span className="text-white/25 text-sm">To be decided</span>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className="w-6 text-white/30 text-xs tabular-nums flex-shrink-0">
          {seed ?? ''}
        </span>
        <span className={`text-sm truncate ${isWinner ? 'text-[#C9A84C] font-semibold' : 'text-white/80'}`}>
          {nameOf.get(playerId) ?? 'Unknown player'}
        </span>
        {isWinner && (
          <span className="text-[#C9A84C] text-xs flex-shrink-0" aria-label="Winner">✓</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Summary */}
      <div className="border border-[#1e3d28] rounded-sm px-4 py-3">
        <p className="text-white/60 text-sm">
          {matches.length} match{matches.length === 1 ? '' : 'es'} · {rounds.length} round
          {rounds.length === 1 ? '' : 's'}
        </p>
        <p className="text-white/30 text-xs mt-1">
          {byes > 0 && `${byes} bye${byes === 1 ? '' : 's'} · `}
          {played > 0 ? `${played} result${played === 1 ? '' : 's'} in` : 'No results yet'}
        </p>
      </div>

      {rounds.map(roundNumber => {
        const inRound = matches
          .filter(m => m.round_number === roundNumber)
          .sort((a, b) => a.slot - b.slot)

        return (
          <section key={roundNumber}>
            <p className="text-white/35 text-xs tracking-[0.2em] uppercase mb-2 px-1">
              {inRound[0]?.round_name ?? `Round ${roundNumber}`}
            </p>
            <div className="border border-[#1e3d28] rounded-sm divide-y divide-[#1e3d28]">
              {inRound.map(m => (
                <div key={m.id} className="px-4 py-2">
                  <Side
                    playerId={m.player_a_id}
                    isBye={m.player_a_is_bye}
                    seed={m.seed_a}
                    isWinner={!!m.winner_player_id && m.winner_player_id === m.player_a_id}
                  />
                  <Side
                    playerId={m.player_b_id}
                    isBye={m.player_b_is_bye}
                    seed={m.seed_b}
                    isWinner={!!m.winner_player_id && m.winner_player_id === m.player_b_id}
                  />
                </div>
              ))}
            </div>
          </section>
        )
      })}

      <p className="text-white/20 text-xs text-center leading-relaxed px-4">
        Recording results comes next. For now this confirms the draw.
      </p>
    </div>
  )
}
