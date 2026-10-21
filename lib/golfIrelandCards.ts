import { createAdminClient } from './supabase-admin'
import { readAllRows } from './allRows'
import {
  cardsOnRounds, readsGolfIreland, type HeldCard, type RoundCard, type RoundVenue,
} from './golfIreland'
import type { LeagueSetup } from './leagueSetup'

/**
 * A league's Golf Ireland cards, placed on their rounds, for a board to
 * read — the one reader. Server only: `golf_ireland_cards` is closed to
 * the browser (migration 056), so this reads on the service role, and the
 * pages hand the result on (the leaderboard as a prop, the hub and a
 * round's summary through `fetchTripContext`).
 *
 * A card belongs to a round when it was played on the round's date at its
 * venue (`roundForCard`), matched on `courses.golf_ireland_id` — worked
 * out here on every read, so a round given its venue later picks up its
 * cards with nothing stored.
 *
 * **Asks nothing unless the league reads Golf Ireland**, so every other
 * trip and event pays nothing for it. Empty on any failure: a board that
 * cannot read the cards shows the live ones, exactly as before the cards
 * existed.
 */
export async function readRoundCards(
  tripId: string,
  setup: LeagueSetup | null | undefined,
  rounds: readonly { id: string; scheduled_date?: string | null; course_id?: string | null }[],
): Promise<RoundCard[]> {
  if (!setup?.golfIreland || !readsGolfIreland(setup.scoreSource) || rounds.length === 0) return []
  const courseIds = [...new Set(rounds.map(r => r.course_id).filter((c): c is string => !!c))]
  if (courseIds.length === 0) return []
  try {
    const admin = createAdminClient()
    const [cardsRes, coursesRes] = await Promise.all([
      // A winter league grows a card a player a week — read whole, past
      // the 1,000-row cap. UNIQUE (player_id, card_id) is the order.
      readAllRows<CardRow>(
        () => admin.from('golf_ireland_cards').select(CARD_COLS, { count: 'exact' })
          .eq('trip_id', tripId)
          .order('player_id').order('card_id'),
        r => `${r.player_id}|${r.card_id}`,
      ),
      admin.from('courses').select('id, golf_ireland_id').in('id', courseIds),
    ])
    if (cardsRes.error) throw cardsRes.error
    if (coursesRes.error) throw coursesRes.error
    const venueOf = new Map((coursesRes.data ?? []).map(c =>
      [c.id as string, (c.golf_ireland_id as string | null) ?? null]))
    const venues: RoundVenue[] = rounds.map(r => ({
      roundId: r.id,
      date: r.scheduled_date ?? null,
      venueId: r.course_id ? venueOf.get(r.course_id) ?? null : null,
    }))
    return cardsOnRounds(cardsRes.data.map(heldCard), venues)
  } catch (e) {
    console.error('readRoundCards failed:', e)
    return []
  }
}

const CARD_COLS =
  'player_id, card_id, played_on, course_id, holes_played, stableford_points, gross_total, course_handicap'

type CardRow = {
  player_id: string
  card_id: string
  played_on: string
  course_id: string | null
  holes_played: number
  stableford_points: number | null
  gross_total: number | null
  course_handicap: number | null
}

const heldCard = (r: CardRow): HeldCard => ({
  playerId: r.player_id,
  cardId: r.card_id,
  playedOn: String(r.played_on).slice(0, 10),
  courseId: r.course_id,
  holesPlayed: r.holes_played === 9 ? 9 : 18,
  stablefordPoints: r.stableford_points,
  grossTotal: r.gross_total,
  courseHandicap: r.course_handicap,
})
