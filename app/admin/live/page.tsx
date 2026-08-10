import { createAdminClient } from '@/lib/supabase-admin'
import {
  summariseCards, orderCards, type CardSummary,
} from '@/lib/adminLive'
import type { CardLock, LiveCard, ScoreActivity } from '@/lib/staleLive'
import { Badge } from '@/app/components/ui'
import { requireAdmin } from '../adminGate'
import AdminLogin from '../AdminLogin'
import AdminShell from '../AdminShell'
import CardActions from './CardActions'

export const dynamic = 'force-dynamic'

/**
 * Every scoring session that might need a hand, and the two levers.
 *
 * The nightly job closes hung cards at 03:00; this page is for the phone call
 * at four in the afternoon — a group's card is stuck, their players are locked,
 * the leaderboard is showing seven phantom holes. The staleness verdicts here
 * are lib/staleLive's own, so a card flagged "would close tonight" is exactly
 * a card the job would close.
 *
 * Closed cards drop off the page two days after closing — the same window in
 * which their scores are still in the table to be rescued.
 */
export const metadata = {
  title: 'Admin — Green Dot Golf',
  robots: { index: false, follow: false, nocache: true },
}

/** How long a closed card stays listed, matching staleLive's rescue window. */
const SHOW_CLOSED_FOR_HOURS = 48

type LiveRoundRow = {
  id: string
  round_id: string
  course_id: string | null
  status: string
  activated_at: string
  closed_at: string | null
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function agoLabel(iso: string, now: Date): string {
  const hours = (now.getTime() - Date.parse(iso)) / 3_600_000
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`
  if (hours < 48) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default async function AdminLivePage() {
  if (!(await requireAdmin())) return <AdminLogin />

  const db = createAdminClient()
  const now = new Date()

  const [cardsRes, locksRes, activityRes] = await Promise.all([
    db.from('live_rounds').select('id, round_id, course_id, status, activated_at, closed_at'),
    db.from('live_player_locks').select('live_round_id, player_id'),
    db.from('live_scores').select('player_id, round_id, submitted_at'),
  ])

  const readError = [cardsRes, locksRes, activityRes].find(r => r.error)?.error
  if (readError) console.error('AdminLivePage read failed:', readError)

  const allRows = (cardsRes.data ?? []) as LiveRoundRow[]
  const rows = allRows.filter(r =>
    r.status !== 'closed'
    || (r.closed_at !== null
        && (now.getTime() - Date.parse(r.closed_at)) / 3_600_000 <= SHOW_CLOSED_FOR_HOURS),
  )

  const cards: LiveCard[] = rows.map(r => ({
    id: r.id, roundId: r.round_id, status: r.status, activatedAt: r.activated_at,
  }))
  const locks: CardLock[] = ((locksRes.data ?? []) as { live_round_id: string; player_id: string }[])
    .map(l => ({ liveRoundId: l.live_round_id, playerId: l.player_id }))
  const activity: ScoreActivity[] = ((activityRes.data ?? []) as { player_id: string; round_id: string; submitted_at: string }[])
    .map(a => ({ playerId: a.player_id, roundId: a.round_id, submittedAt: a.submitted_at }))

  const summaries = orderCards(summariseCards(cards, locks, activity, now))

  // ── Names for everything on screen ──
  const roundIds = [...new Set(summaries.map(s => s.roundId))]
  const courseIds = [...new Set(rows.map(r => r.course_id).filter((id): id is string => id !== null))]
  const playerIds = [...new Set(summaries.flatMap(s => s.playerIds))]

  const [roundsRes, coursesRes, playersRes] = await Promise.all([
    roundIds.length > 0
      ? db.from('rounds').select('id, round_number, trip_id').in('id', roundIds)
      : Promise.resolve({ data: [], error: null }),
    courseIds.length > 0
      ? db.from('courses').select('id, name').in('id', courseIds)
      : Promise.resolve({ data: [], error: null }),
    playerIds.length > 0
      ? db.from('players').select('id, name').in('id', playerIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const rounds = new Map(
    ((roundsRes.data ?? []) as { id: string; round_number: number; trip_id: string }[])
      .map(r => [r.id, r]),
  )
  const courseName = new Map(
    ((coursesRes.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]),
  )
  const playerName = new Map(
    ((playersRes.data ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]),
  )
  const courseByCard = new Map(rows.map(r => [r.id, r.course_id]))

  const tripIds = [...new Set([...rounds.values()].map(r => r.trip_id))]
  const { data: tripRows } = tripIds.length > 0
    ? await db.from('trips').select('id, name, trip_code').in('id', tripIds)
    : { data: [] }
  const trips = new Map(
    ((tripRows ?? []) as { id: string; name: string; trip_code: string | null }[])
      .map(t => [t.id, t]),
  )

  const activeCount = summaries.filter(s => s.status === 'active').length
  const staleCount = summaries.filter(s => s.wouldClose !== null).length

  return (
    <AdminShell
      active="live"
      subtitle={`${activeCount} open · ${staleCount} stale`}
    >
      {readError && (
        <p className="text-rust-deep text-sm mb-4">
          Could not load the live cards — refresh to try again.
        </p>
      )}

      {summaries.length === 0 ? (
        <div className="border border-bark/12 rounded-xl py-16 text-center">
          <p className="text-ink/65 text-sm">No scorecards open. All quiet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {summaries.map(s => {
            const round = rounds.get(s.roundId)
            const trip = round ? trips.get(round.trip_id) : undefined
            const course = courseByCard.get(s.id)
            const names = s.playerIds
              .map(id => playerName.get(id) ?? 'Unknown')
              .sort((a, b) => a.localeCompare(b))
            return (
              <div key={s.id} className="bg-surface border border-bark/12 rounded-2xl px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-display)] text-base leading-tight">
                      {trip?.name ?? 'Unknown trip'}
                      {round && <span className="text-ink/65"> · Round {round.round_number}</span>}
                    </p>
                    <p className="text-ink/65 text-[13px] mt-0.5">
                      {course ? (courseName.get(course) ?? 'Unknown course') : 'No course'}
                      {trip?.trip_code && (
                        <> · <span className="text-accent tabular-nums">{trip.trip_code}</span></>
                      )}
                    </p>
                  </div>
                  <StatusBadge summary={s} />
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[13px]">
                  <Cell label="Opened" value={formatWhen(s.activatedAt)} />
                  <Cell
                    label="Last hole"
                    value={s.lastActivity
                      ? `${formatWhen(s.lastActivity)} (${agoLabel(s.lastActivity, now)})`
                      : 'None entered'}
                  />
                  <Cell label="Holes" value={String(s.holesEntered)} />
                  <Cell
                    label="Players"
                    value={names.length > 0 ? names.join(', ') : 'Nobody locked on'}
                  />
                </div>

                {s.status !== 'closed' && (
                  <div className="mt-3.5">
                    <CardActions
                      liveRoundId={s.id}
                      roundId={s.roundId}
                      status={s.status}
                      playerCount={s.playerIds.length}
                      holesEntered={s.holesEntered}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </AdminShell>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-ink/65">{label}</p>
      <p className="text-ink/80 break-words">{value}</p>
    </div>
  )
}

function StatusBadge({ summary }: { summary: CardSummary }) {
  if (summary.wouldClose !== null) {
    return (
      <Badge tone="loss" className="flex-shrink-0">
        {summary.wouldClose === 'empty' ? 'Stale — empty' : 'Stale — abandoned'}
      </Badge>
    )
  }
  if (summary.status === 'active') {
    return <Badge tone="win" live className="flex-shrink-0">In play</Badge>
  }
  if (summary.status === 'finalised') {
    return <Badge tone="neutral" className="flex-shrink-0">Signed</Badge>
  }
  return <Badge tone="neutral" className="flex-shrink-0">Closed</Badge>
}
