import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase-admin"
import {
  cardsToClose, deadScoreKeys, activityKey,
  type LiveCard, type CardLock, type ScoreActivity,
} from "@/lib/staleLive"

// Nightly tidy of scorecards nobody came back to. Runs at 03:00 — see the
// cron in vercel.json, which is daily, not hourly as this said for a long
// time. Protected by CRON_SECRET; callers must pass:
//   Authorization: Bearer <CRON_SECRET>
//
// Two steps, and `lib/staleLive.ts` decides both:
//
//   1. Close an active card that is finished with. Empty and never used
//      after two hours, or part-played and untouched for twelve. Closing
//      writes nothing away — it takes the card off the leaderboard, stops
//      the round reading as in play, and releases its players so the round
//      can be scored properly on a new card.
//   2. Delete live rows that no card can reach any more, once they are two
//      days old. Unreachable is exact: no active card to resume and no
//      finalised one to unfinalise. The day-and-a-half gap after step 1 is
//      the window in which a card closed in error can still be rescued.
//
// A finalised card is never touched by either step. It keeps its locks on
// purpose, so its rows stay reachable and unfinalising still works.
//
// `?dryRun=1` reports exactly what both steps would do and writes nothing.

/** GET /api/cleanup — called by Vercel cron, see vercel.json */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }

  const auth = req.headers.get("authorization") ?? ""
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1"

  // `createAdminClient` throws when SUPABASE_SERVICE_ROLE_KEY is missing, and
  // an uncaught throw here is a 500 with an empty body — which for a job
  // nobody watches is indistinguishable from a night with nothing to tidy.
  // This job could have been dead since it was written and looked identical
  // to a job that ran perfectly.
  let supabaseAdmin: ReturnType<typeof createAdminClient>
  try {
    supabaseAdmin = createAdminClient()
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    console.error("cleanup could not start:", why)
    return NextResponse.json(
      { error: `Cleanup could not start: ${why}` }, { status: 500 },
    )
  }

  const now = new Date()

  // Every card, not just the active ones: step 2 has to know about the
  // finalised ones too, because those are what keep their rows reachable.
  //
  // The whole table each time, across every trip. That is what these three
  // are at this scale — a few thousand rows between them — and a job that
  // reads the lot once a night is simpler than one that pages. If it ever
  // stops being true, the filter to add is on round, not on time: a row's
  // age is not what decides whether it is reachable.
  const [cardsRes, locksRes, activityRes] = await Promise.all([
    supabaseAdmin.from("live_rounds").select("id, round_id, status, activated_at"),
    supabaseAdmin.from("live_player_locks").select("live_round_id, player_id"),
    supabaseAdmin.from("live_scores").select("player_id, round_id, submitted_at"),
  ])

  // A partial read would close cards that are being played on, and delete
  // rows that a card it could not see still reaches. Refuse instead.
  const failure = [cardsRes, locksRes, activityRes].find(r => r.error)
  if (failure?.error) {
    console.error("cleanup read failed:", failure.error)
    return NextResponse.json(
      { error: "Could not read the live tables — nothing was changed." },
      { status: 500 },
    )
  }

  const cards: LiveCard[] = (cardsRes.data ?? []).map(c => ({
    id: c.id as string,
    roundId: c.round_id as string,
    status: c.status as string,
    activatedAt: c.activated_at as string,
  }))
  const locks: CardLock[] = (locksRes.data ?? []).map(l => ({
    liveRoundId: l.live_round_id as string,
    playerId: l.player_id as string,
  }))
  const activity: ScoreActivity[] = (activityRes.data ?? []).map(a => ({
    playerId: a.player_id as string,
    roundId: a.round_id as string,
    submittedAt: a.submitted_at as string,
  }))

  // ── 1. Cards nobody came back to ──
  const closing = cardsToClose(cards, locks, activity, now)
  const closedEmpty = closing.filter(c => c.reason === "empty").length
  const closedAbandoned = closing.filter(c => c.reason === "abandoned").length

  if (!dryRun && closing.length > 0) {
    const { error } = await supabaseAdmin
      .from("live_rounds")
      .update({ status: "closed", closed_at: now.toISOString() })
      .in("id", closing.map(c => c.id))
    if (error) {
      console.error("cleanup close failed:", error)
      return NextResponse.json(
        { error: "Could not close the abandoned scorecards." },
        { status: 500 },
      )
    }
  }

  // ── 2. Rows no card can reach ──
  const dead = deadScoreKeys(
    activity, cards, locks, now, new Set(closing.map(c => c.id)),
  )

  let deletedPlayerRounds = 0
  if (!dryRun) {
    // One delete per player and round. Both halves of the key are needed —
    // a delete by round would take another group's card on the same round
    // with it, which is the mistake `lib/scorecardVoid.ts` exists to warn
    // about. Sequential rather than in parallel: this is a nightly job with
    // nothing waiting on it, and a burst of deletes is not worth the risk.
    for (const { playerId, roundId } of dead) {
      const { error } = await supabaseAdmin
        .from("live_scores")
        .delete()
        .eq("player_id", playerId)
        .eq("round_id", roundId)
      if (error) {
        console.error("cleanup delete failed:", error, { playerId, roundId })
        continue
      }
      deletedPlayerRounds++
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    closedEmpty,
    closedAbandoned,
    // On a dry run nothing is deleted, so report what would have been.
    deletedPlayerRounds: dryRun ? dead.length : deletedPlayerRounds,
    // Enough to check the decision by hand before letting it run for real.
    ...(dryRun ? {
      wouldClose: closing,
      wouldDelete: dead.map(d => activityKey(d.playerId, d.roundId)),
    } : {}),
  })
}
